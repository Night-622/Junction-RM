/* =====================================================================
   Junction online: accounts, cloud save files, leaderboard, live viewing.
   Loaded as a module after game.js. It talks to the game only through
   window.JunctionAPI, and if anything here fails the game keeps working
   offline exactly as before.

   Firestore layout
     users/{uid}                 name, nameLower, star, liveCode (accounts only)
     users/{uid}/saves/{mode-1..5} five save slots per game mode (chill, standard, frantic, zen, expert)   data (serialized city, as a string), score, week, diffKey, over, updatedAt
     usernames/{nameLower}       uid, perm, at — every player's name is reserved here, so no two players share one.
                                 Accounts keep theirs for good; a guest name frees up after 30 days unused.
     boards/{mode}/players/{uid} one leaderboard per mode (chill, standard, frantic: parcels, weeks, goalsSec;
                                 zen: playSec, earned). The old single leaderboard/{uid} is moved over on load.
     expert/{week}/players/{uid}  each player's best run on that ISO week's seeded Expert Survival city, with a
                                 compact copy of their layout so others can see who placed what
     messages/{id}               player-to-player messages: from, fromName, to, toName, text, at, read
     users/{uid}/friends/{fuid}  the players someone has added as friends: name, at
     live/{6-digit code}         uid, name, star, playing, state, meta, watchT — the live view channel
     feedback/{bugs|ideas|other}/entries/{id}   guest feedback: uid, name, message, details, replyTo, createdAt
     (signed-in accounts' feedback is emailed by a Google Apps Script on the support Gmail — see apps-script/)
   ===================================================================== */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js';
import { getAnalytics, isSupported } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-analytics.js';
import {
  getAuth, onAuthStateChanged, signInAnonymously, signOut,
  GoogleAuthProvider, EmailAuthProvider, linkWithPopup, linkWithCredential,
  signInWithPopup, signInWithCredential, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  reauthenticateWithCredential, reauthenticateWithPopup, updatePassword, sendPasswordResetEmail,
  sendEmailVerification, deleteUser
} from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, orderBy, limit,
  onSnapshot, runTransaction, serverTimestamp, deleteField, addDoc, where, Timestamp
} from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyC7yR9bS1tzbiv4DJrZt-SwB4UnODIgiho',
  authDomain: 'junction-rm.firebaseapp.com',
  projectId: 'junction-rm',
  storageBucket: 'junction-rm.firebasestorage.app',
  messagingSenderId: '432203148964',
  appId: '1:432203148964:web:8a0331eafa33873f02c031',
  measurementId: 'G-9V6END3R24'
};

const API = window.JunctionAPI;
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const NAME_RE = /^[A-Za-z0-9_-]{3,16}$/;
const SLOTS = ['1', '2', '3', '4', '5'];            // the old shared slots, moved into per-mode slots on sign-in
const SAVE_MODES = ['chill', 'standard', 'frantic', 'zen', 'expert'];
const slotIds = mode => SLOTS.map(n => mode + '-' + n);                 // five slots per game mode: "standard-1" ... "standard-5"
const CLOUD_SAVE_EVERY = 30e3;      // ms between routine cloud autosaves (local autosave still runs every 12s)
const LIVE_SEND_EVERY = 4e3;        // ms between live snapshots while someone is watching
const LIVE_HEARTBEAT = 60e3;        // ms between "I'm online" pings when nobody is watching
const WATCH_PING = 20e3;            // viewers re-announce themselves this often
const WATCH_FRESH = 45e3;           // a host keeps sending for this long after the last viewer ping
const MAX_STATE = 900e3;            // Firestore documents cap at 1 MiB

const app = initializeApp(firebaseConfig);
isSupported().then(ok => { if (ok) getAnalytics(app); }).catch(() => {});
const auth = getAuth(app);
const db = getFirestore(app);

const O = {
  ready: false, user: null, profile: null, pendingName: '',
  slot: null, lastSaveAt: 0, lastSaveStr: '',
  best: {}, lastBoardAt: 0,
  liveCode: null, liveUnsub: null, watchedUntil: 0, lastLiveAt: 0, lastLiveStr: '', lastBeatAt: 0,
  spec: null
};
const isPerm = () => !!(O.user && !O.user.isAnonymous);
const myName = () => (O.profile && O.profile.name) || 'Player';

/* ------------------------------------------------------------- helpers */
function randomCode() {
  const a = new Uint32Array(1); crypto.getRandomValues(a);
  return String(a[0] % 1e6).padStart(6, '0');
}
function ago(ts) {
  if (!ts || !ts.toMillis) return '';
  const s = Math.max(0, (Date.now() - ts.toMillis()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  return Math.floor(s / 86400) + ' d ago';
}
function mmss(sec) { sec = Math.round(sec); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }
function nameHTML(name, star, ach3) {
  if (ach3) return esc(name) + ' <span class="star star3" title="Unlocked every achievement">\u2605\u2605\u2605</span>';
  return esc(name) + (star ? ' <span class="star" title="Permanent account">\u2605</span>' : '');
}
const myAch3 = () => !!(API.achAll && API.achAll());
function friendlyAuthError(e) {
  const c = (e && e.code) || '';
  if (c.includes('email-already-in-use')) return 'That email already has an account. Use Sign in instead.';
  if (c.includes('invalid-email')) return 'That email address doesn\u2019t look right.';
  if (c.includes('weak-password')) return 'Pick a password of at least 6 characters.';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'Email or password is incorrect.';
  if (c.includes('popup-closed') || c.includes('cancelled-popup')) return 'Sign-in window was closed.';
  if (c.includes('popup-blocked')) return 'Your browser blocked the sign-in window. Allow pop-ups and try again.';
  if (c.includes('operation-not-allowed')) return 'That sign-in method isn\u2019t switched on for this game yet.';
  if (c.includes('network')) return 'You look offline. Check your connection.';
  if (c.includes('requires-recent-login')) return 'For safety, sign in again first (enter your password or reconnect Google).';
  if (c.includes('too-many-requests')) return 'Too many tries. Wait a minute and try again.';
  if (c.includes('provider-already-linked') || c.includes('credential-already-in-use')) return 'That sign-in is already linked to an account.';
  return (e && e.message) || 'Something went wrong.';
}
function openM(id) { API.openModal(id); }
function closeM(id) { API.closeModal(id); }

/* --------------------------------------------------------- auth + profile */
onAuthStateChanged(auth, async user => {
  if (!user) {
    try { await signInAnonymously(auth); }
    catch (e) { console.warn('Junction online unavailable:', e); API.toast('Online features are unavailable right now \u2014 playing offline.', 'warn'); }
    return;
  }
  if (O.user && O.user.uid !== user.uid) { O.slot = null; O.lastSaveStr = ''; O.best = emptyBest(); }
  O.user = user; O.nameLost = false; O.lifeLoaded = false;
  API.setLifeOwner(user.uid);
  try {
    await loadProfile();
    loadLife();
    if (O.pendingName && isPerm() && !(O.profile && O.profile.name)) await claimName(O.pendingName);
    await keepGuestName();
  } catch (e) { console.warn(e); }
  O.ready = true;
  lastAch3 = myAch3();
  if (isPerm()) API.awardAch('account');
  renderAccount();
  loadBest();
  await setupLive();
  if (needsName()) openUserModal();
});
const needsName = () => !O.profile || !O.profile.name || O.nameLost || (isPerm() && !O.profile.star);

async function loadProfile() {
  const snap = await getDoc(doc(db, 'users', O.user.uid));
  O.profile = snap.exists() ? snap.data() : null;
}

/* Every name is reserved in usernames/{nameLower}, so no two players can share one.
   Guests can change theirs (the old one is released); accounts keep theirs for good.
   A guest name nobody has used for 30 days can be taken by someone else. */
const GUEST_NAME_TTL = 30 * 864e5;
const nameRef = lower => doc(db, 'usernames', lower);
const permRes = d => d.perm !== false;             // older reservations (no perm field) all belong to accounts
function nameFreeFor(snap, uid) {
  if (!snap.exists()) return true;
  const d = snap.data();
  if (d.uid === uid) return true;
  return !permRes(d) && !!(d.at && d.at.toMillis) && Date.now() - d.at.toMillis() > GUEST_NAME_TTL;
}
const TAKEN = 'That username is taken. Pick another.';
const REFUSED = 'The online service wouldn\u2019t save that name (its security rules may need updating). You can still play \u2014 try again later.';
function takenError(e) {
  if (e && String(e.code || '').includes('permission-denied')) { const x = new Error(REFUSED); x.refused = true; return x; }
  return e;
}
async function saveGuestName(name) {
  const lower = name.toLowerCase(), uid = O.user.uid;
  const oldLower = O.profile && O.profile.nameLower;
  try {
    await runTransaction(db, async tx => {
      const n = await tx.get(nameRef(lower));
      const old = oldLower && oldLower !== lower ? await tx.get(nameRef(oldLower)) : null;
      if (!nameFreeFor(n, uid)) throw new Error(TAKEN);
      tx.set(nameRef(lower), {uid, perm: false, at: serverTimestamp()});
      if (old && old.exists() && old.data().uid === uid && !permRes(old.data())) tx.delete(old.ref);
      tx.set(doc(db, 'users', uid), {name, nameLower: lower, star: false, updatedAt: serverTimestamp()}, {merge: true});
    });
  } catch (e) { throw takenError(e); }
  O.profile = Object.assign({}, O.profile, {name, nameLower: lower, star: false});
  O.nameLost = false;
  syncBoardName();
}
/* On load: keep a guest's reservation fresh, pick one up for older guest profiles made before
   names were reserved, and flag the name as lost if someone else holds it now. */
async function keepGuestName() {
  if (isPerm() || !O.profile || !O.profile.name) return;
  const lower = O.profile.nameLower || O.profile.name.toLowerCase();
  try {
    const snap = await getDoc(nameRef(lower));
    if (snap.exists() && snap.data().uid === O.user.uid) {
      const at = snap.data().at;
      if (!at || !at.toMillis || Date.now() - at.toMillis() > 864e5)
        await setDoc(nameRef(lower), {uid: O.user.uid, perm: false, at: serverTimestamp()}).catch(() => {});
      return;
    }
    if (nameFreeFor(snap, O.user.uid)) { await saveGuestName(O.profile.name); return; }
    O.nameLost = true;
  } catch (e) { if (e && e.message === TAKEN) O.nameLost = true; else console.warn(e); }
}
async function claimName(name) {
  if (!NAME_RE.test(name || '')) throw new Error('Type the username you want to keep.');
  const lower = name.toLowerCase(), uid = O.user.uid;
  const oldLower = O.profile && O.profile.nameLower;
  await O.user.getIdToken(true);                  // make sure the token already says "permanent account"
  try {
    await runTransaction(db, async tx => {
      const u = await tx.get(nameRef(lower));
      const old = oldLower && oldLower !== lower ? await tx.get(nameRef(oldLower)) : null;
      if (!nameFreeFor(u, uid)) throw new Error(TAKEN);
      if (!(u.exists() && u.data().uid === uid && permRes(u.data()))) tx.set(nameRef(lower), {uid, perm: true, at: serverTimestamp()});
      if (old && old.exists() && old.data().uid === uid) tx.delete(old.ref);   // release the old name
      tx.set(doc(db, 'users', uid), {name, nameLower: lower, star: true, updatedAt: serverTimestamp()}, {merge: true});
    });
  } catch (e) { throw takenError(e); }
  O.profile = Object.assign({}, O.profile, {name, nameLower: lower, star: true});
  O.pendingName = '';
  O.nameLost = false;
  syncBoardName();
}
async function syncBoardName() {
  const uid = O.user.uid, name = myName(), star = isPerm(), ach3 = myAch3();
  pushProfile();
  await Promise.all(MODES.map(async m => {
    try { const r = boardRef(m, uid), s = await getDoc(r); if (s.exists()) await updateDoc(r, {name, star, ach3}); } catch (e) { /* no entry on this board */ }
  }));
  if (O.liveCode) updateDoc(doc(db, 'live', O.liveCode), {name, star, ach3}).catch(() => {});
}

/* ------------------------------------------------------------ user modal */
function openUserModal(signIn) {
  if (!signIn && O.profile && O.profile.name && !O.nameLost && !(isPerm() && !O.profile.star)) { openAcct(); return; }
  const perm = isPerm(), hasName = !!(O.profile && O.profile.name), claimed = perm && !!(O.profile && O.profile.star);
  $('user-title').textContent = claimed ? 'Your account' : perm ? 'Pick your permanent username' : hasName ? 'Account' : 'Pick a username';
  $('user-lead').innerHTML = claimed
    ? 'Signed in as ' + nameHTML(myName(), true, myAch3()) + (O.user.email ? ' (' + esc(O.user.email) + ')' : '') + '.'
    : perm ? 'Your account is ready \u2014 choose your username. It gets a \u2605 on the leaderboard, and you can change it later.'
    : 'This is the name other players see on the leaderboard and when they watch your city.';
  $('user-name').value = hasName ? myName() : '';
  $('user-name').disabled = claimed;
  $('user-guest').textContent = claimed ? 'Sign out' : perm ? 'Claim this name' : hasName ? 'Save name' : 'Play as a guest';
  $('user-cancel').hidden = !hasName || O.nameLost || (perm && !claimed);
  $('user-perm').hidden = perm;
  $('user-err').textContent = O.nameLost && !perm ? 'Someone else is using \u201c' + myName() + '\u201d now \u2014 pick a new name.' : '';
  openM('m-user');
  if (!claimed) setTimeout(() => $('user-name').focus(), 50);
}
function typedName() {
  const n = $('user-name').value.trim();
  if (!NAME_RE.test(n)) { $('user-err').textContent = 'Usernames are 3\u201316 characters: letters, numbers, _ or -.'; return null; }
  return n;
}
async function busy(btn, fn) {
  const all = document.querySelectorAll('#m-user button'); all.forEach(b => { b.disabled = true; });
  try { await fn(); } catch (e) { $('user-err').textContent = e.code ? friendlyAuthError(e) : e.message; }
  finally { all.forEach(b => { b.disabled = false; }); }
}
$('user-guest').addEventListener('click', () => busy(null, async () => {
  if (isPerm() && O.profile && O.profile.star) {    // "Sign out" for accounts: back to a fresh guest
    await dropLive();
    O.profile = null; O.slot = null; O.best = emptyBest();
    closeM('m-user'); await signOut(auth);          // onAuthStateChanged signs in a new guest and asks for a name
    return;
  }
  const n = typedName(); if (!n) return;
  if (isPerm()) {                                   // account without a name yet: reserve it
    await claimName(n); await setupLive(false);
    closeM('m-user'); renderAccount(); loadBest();
    API.toast('Welcome, ' + n + ' \u2605', 'good'); return;
  }
  try { await saveGuestName(n); }
  catch (e) {
    if (!e.refused) throw e;
    closeM('m-user'); API.toast(REFUSED, 'warn'); return;
  }
  closeM('m-user'); renderAccount();
  API.toast('Playing as ' + n, 'good');
}));
$('user-cancel').addEventListener('click', () => { closeM('m-user'); if (O.profile && O.profile.name && !O.nameLost) openAcct(); });
$('user-name').addEventListener('keydown', e => { if (e.key === 'Enter') $('user-guest').click(); });

/* Upgrading: a guest links Google or email to the same user id, so their saves come along.
   If that Google/email already has its own account, we switch to it instead. */
async function afterPermanent(name) {
  await O.user.reload(); O.user = auth.currentUser;
  await loadProfile();
  if (!(O.profile && O.profile.star)) {
    try { await claimName(name); }
    catch (e) { O.pendingName = ''; openUserModal(); $('user-err').textContent = name ? e.message : ''; return; }
  }
  await setupLive(true);
  closeM('m-user'); renderAccount(); loadBest();
  API.toast('Signed in as ' + myName() + ' \u2605', 'good');
}
$('user-google').addEventListener('click', () => busy(null, async () => {
  const name = $('user-name').value.trim();
  const provider = new GoogleAuthProvider();
  if (O.user && O.user.isAnonymous) {
    try {
      await linkWithPopup(O.user, provider);
    } catch (e) {
      if (!String(e.code).includes('credential-already-in-use')) throw e;
      const cred = GoogleAuthProvider.credentialFromError(e);
      await dropLive();
      O.pendingName = NAME_RE.test(name) ? name : '';
      await signInWithCredential(auth, cred);      // existing account: onAuthStateChanged takes over
      closeM('m-user'); return;
    }
  } else {
    await signInWithPopup(auth, provider);
  }
  await afterPermanent(NAME_RE.test(name) ? name : (O.profile && O.profile.name) || '');
}));
$('user-create').addEventListener('click', () => busy(null, async () => {
  const n = typedName(); if (!n) return;
  const email = $('user-email').value.trim(), pass = $('user-pass').value;
  if (!nameFreeFor(await getDoc(nameRef(n.toLowerCase())), O.user.uid)) throw new Error(TAKEN);
  if (O.user && O.user.isAnonymous) await linkWithCredential(O.user, EmailAuthProvider.credential(email, pass));
  else await createUserWithEmailAndPassword(auth, email, pass);
  await afterPermanent(n);
}));
$('user-signin').addEventListener('click', () => busy(null, async () => {
  const email = $('user-email').value.trim(), pass = $('user-pass').value;
  const name = $('user-name').value.trim();
  await dropLive();
  O.pendingName = NAME_RE.test(name) ? name : '';
  O.slot = null;
  await signInWithEmailAndPassword(auth, email, pass);   // a different user id: onAuthStateChanged reloads everything
  closeM('m-user');
}));

/* ------------------------------------------------------ account widgets */
function renderAccount() {
  startInbox(); startChallenges(); migrateLegacySaves();
  const sa = $('start-account');
  sa.hidden = false;
  sa.innerHTML = '<span>Playing as <b>' + nameHTML(myName(), isPerm(), myAch3()) + '</b>' + (isPerm() ? '' : ' <small>(guest)</small>') + '</span>' +
    '<button class="linkbtn" type="button" id="start-acct-btn">Account</button>';
  $('start-acct-btn').addEventListener('click', () => openUserModal());
  if (!$('m-acct').hidden) renderAcct();
  $('btn-saves').hidden = false;
  $('start-online').hidden = false;
  $('online-sec').hidden = false;
  $('acct-line').innerHTML = '<b>' + nameHTML(myName(), isPerm(), myAch3()) + '</b><small>' + (isPerm() ? (O.user.email || 'Permanent account') : 'Guest on this browser') + '</small>';
  $('btn-account').textContent = 'Account';
  renderLiveCode();
}
$('btn-account').addEventListener('click', () => { $('menu').hidden = true; openUserModal(); });
/* the Account button on the top bar */
window.__junctionAccount = () => {
  if (!O.ready || !O.user) { API.toast('Online features are still connecting — try again in a moment.', 'warn'); return; }
  openUserModal();
};

/* ============================================================ ACCOUNT SCREEN
   Profile (rename, shortcuts, upgrade or sign out), lifetime Stats, and Security for accounts
   (email, password, linked sign-ins, delete). */
let acctPane = 'profile', statsMode = 'all';
const providers = () => (O.user && O.user.providerData || []).map(p => p.providerId);
function openAcct(pane) {
  if (!O.ready || !O.user) return;
  $('menu').hidden = true;
  acctPane = pane || 'profile';
  renderAcct();
  openM('m-acct');
  acctPaneOpened();
}
function renderAcct() {
  const perm = isPerm(), name = myName(), pv = providers();
  $('acct-av').textContent = name.charAt(0).toUpperCase();
  $('acct-name').innerHTML = nameHTML(name, perm, myAch3());
  const since = O.user.metadata && O.user.metadata.creationTime ? new Date(O.user.metadata.creationTime).toLocaleDateString(undefined, {year: 'numeric', month: 'short', day: 'numeric'}) : '';
  $('acct-sub').textContent = perm
    ? (O.user.email || 'Permanent account') + ' \u00b7 ' + (pv.includes('google.com') ? 'Google' : 'Email') + (since ? ' \u00b7 joined ' + since : '')
    : 'Guest on this browser' + (since ? ' \u00b7 since ' + since : '');
  $('acct-tab-sec').hidden = !perm;
  if (!perm && acctPane === 'security') acctPane = 'profile';
  document.querySelectorAll('#acct-tabs button').forEach(b => b.setAttribute('aria-pressed', b.dataset.pane === acctPane ? 'true' : 'false'));
  document.querySelectorAll('#m-acct .acct-pane').forEach(p => { p.hidden = p.dataset.pane !== acctPane; });
  // profile
  $('acct-newname').value = name;
  $('acct-name-note').textContent = perm
    ? 'Your name stays yours until you change it. Changing it frees the old one for someone else.'
    : 'Guest names free up if you don\u2019t play for 30 days. Make an account to keep it for good.';
  $('acct-err').textContent = '';
  $('acct-guest-box').hidden = perm;
  $('acct-perm-box').hidden = !perm;
  // security
  const pw = pv.includes('password'), gg = pv.includes('google.com');
  $('sec-email').innerHTML = O.user.email ? esc(O.user.email) + (O.user.emailVerified ? ' <span class="okline">\u2713 verified</span>' : ' <small>(not verified)</small>') : 'No email on this account';
  $('sec-verify').hidden = !(pw && O.user.email && !O.user.emailVerified);
  $('sec-pass-box').hidden = !pw;
  $('sec-addpass-box').hidden = pw || !O.user.email;
  $('sec-providers').textContent = [gg ? 'Google' : '', pw ? 'Email and password' : ''].filter(Boolean).join(' \u00b7 ') || '\u2014';
  $('sec-link-google').hidden = gg;
  $('sec-del-pass').hidden = !pw;
  ['sec-err', 'sec-ok'].forEach(id => { $(id).textContent = ''; });
  ['sec-cur', 'sec-new', 'sec-addpass', 'sec-del-name', 'sec-del-pass'].forEach(id => { $(id).value = ''; });
  const lc = O.liveCode; $('acct-live-code').textContent = lc ? lc.slice(0, 3) + ' ' + lc.slice(3) : '—';
  // stats + achievements
  renderStats();
  renderAch();
}
function renderAch() {
  const list = API.achList(), got = API.ach(), done = list.filter(a => got[a.id]).length;
  $('ach-count').textContent = done + ' of ' + list.length;
  $('ach-bar').style.width = Math.round(done / list.length * 100) + '%';
  $('ach-note').innerHTML = done === list.length ? 'Every achievement unlocked \u2014 your name shows <span class="star star3">\u2605\u2605\u2605</span> everywhere.'
    : 'No rewards \u2014 just bragging rights. Unlock all ' + list.length + ' and your name gets <span class="star star3">\u2605\u2605\u2605</span> on the leaderboard and live view.';
  const groups = [...new Set(list.map(a => a.g))];
  $('ach-list').innerHTML = groups.map(g => '<div class="sg-h">' + esc(g) + '</div>' + list.filter(a => a.g === g).map(a => {
    const t = got[a.id];
    return '<div class="ach' + (t ? ' got' : '') + '"><i aria-hidden="true">' + (t ? '\u2605' : '\u25cb') + '</i><div><b>' + esc(a.name) + '</b><span>' + esc(a.hint) +
      (t ? ' \u00b7 ' + new Date(t).toLocaleDateString(undefined, {day: 'numeric', month: 'short', year: 'numeric'}) : '') + '</span></div></div>';
  }).join('')).join('');
}
$('acct-tabs').addEventListener('click', e => { const b = e.target.closest('button[data-pane]'); if (b) { acctPane = b.dataset.pane; renderAcct(); acctPaneOpened(); } });
function acctPaneOpened() {
  if (acctPane === 'saves') {
    $('acct-saves-lead').textContent = isPerm() ? 'Five cloud save slots, kept with your account on any device.' : 'Five cloud save slots for this browser. Make a permanent account to keep them everywhere.';
    renderSlots($('acct-slots'), SAVE_MODES.includes(API.startDiff) ? API.startDiff : 'standard', true);
  }
  if (acctPane === 'msgs') { Promise.all([loadSent(), loadFriends()]).then(renderMsgs); renderMsgs(); }
  if (acctPane === 'coll' && API.renderCollection) API.renderCollection($('acct-coll'));
  if (acctPane === 'watch') { $('acct-watch-err').textContent = ''; $('acct-watch-code').value = ''; setTimeout(() => $('acct-watch-code').focus(), 50); }
}
$('acct-close').addEventListener('click', () => closeM('m-acct'));
async function acctBusy(errId, fn) {
  const all = document.querySelectorAll('#m-acct button'); all.forEach(b => { b.disabled = true; });
  $(errId).textContent = ''; if (errId === 'sec-err') $('sec-ok').textContent = '';
  try { await fn(); } catch (e) { $(errId).textContent = e.code ? friendlyAuthError(e) : e.message; }
  finally { all.forEach(b => { b.disabled = false; }); }
}
$('acct-rename').addEventListener('click', () => acctBusy('acct-err', async () => {
  const n = $('acct-newname').value.trim();
  if (!NAME_RE.test(n)) throw new Error('Usernames are 3\u201316 characters: letters, numbers, _ or -.');
  if (n === myName()) throw new Error('That\u2019s already your name.');
  if (isPerm()) await claimName(n); else await saveGuestName(n);
  renderAccount(); renderAcct();
  API.toast('You\u2019re now ' + n + (isPerm() ? ' \u2605' : ''), 'good');
}));
$('acct-newname').addEventListener('keydown', e => { if (e.key === 'Enter') $('acct-rename').click(); });
$('acct-saves').addEventListener('click', () => { closeM('m-acct'); openSaves('load'); });
$('acct-board').addEventListener('click', () => { closeM('m-acct'); openBoard(null, currentMode()); });
$('acct-watch').addEventListener('click', () => { closeM('m-acct'); openWatch(); });
$('acct-feedback').addEventListener('click', () => { closeM('m-acct'); $('btn-feedback').click(); });
$('acct-upgrade').addEventListener('click', () => { closeM('m-acct'); openUserModal(true); });
$('acct-signout').addEventListener('click', () => acctBusy('acct-err', async () => {
  await pushLife(true);
  await dropLive();
  O.profile = null; O.slot = null; O.best = emptyBest();
  closeM('m-acct'); await signOut(auth);             // onAuthStateChanged signs in a new guest and asks for a name
}));

/* ---- security (accounts only) */
async function reauth(pass) {
  const pv = providers();
  if (pv.includes('password')) {
    if (!pass) throw new Error('Enter your password first.');
    await reauthenticateWithCredential(O.user, EmailAuthProvider.credential(O.user.email, pass));
  } else if (pv.includes('google.com')) {
    await reauthenticateWithPopup(O.user, new GoogleAuthProvider());
  }
}
const secOk = msg => { $('sec-ok').textContent = msg; };
$('sec-verify').addEventListener('click', () => acctBusy('sec-err', async () => {
  await sendEmailVerification(O.user); secOk('Verification email sent to ' + O.user.email + '.');
}));
$('sec-change').addEventListener('click', () => acctBusy('sec-err', async () => {
  const cur = $('sec-cur').value, nw = $('sec-new').value;
  if (nw.length < 6) throw new Error('Pick a new password of at least 6 characters.');
  await reauth(cur); await updatePassword(O.user, nw);
  $('sec-cur').value = ''; $('sec-new').value = ''; secOk('Password changed.');
}));
$('sec-reset').addEventListener('click', () => acctBusy('sec-err', async () => {
  await sendPasswordResetEmail(auth, O.user.email); secOk('Reset link sent to ' + O.user.email + '.');
}));
$('sec-addpass-btn').addEventListener('click', () => acctBusy('sec-err', async () => {
  const pw = $('sec-addpass').value;
  if (pw.length < 6) throw new Error('Pick a password of at least 6 characters.');
  try { await linkWithCredential(O.user, EmailAuthProvider.credential(O.user.email, pw)); }
  catch (e) { if (!String(e.code).includes('requires-recent-login')) throw e; await reauth(); await linkWithCredential(O.user, EmailAuthProvider.credential(O.user.email, pw)); }
  await O.user.reload(); O.user = auth.currentUser; renderAcct(); secOk('Password added \u2014 you can now sign in with your email too.');
}));
$('sec-link-google').addEventListener('click', () => acctBusy('sec-err', async () => {
  await linkWithPopup(O.user, new GoogleAuthProvider());
  await O.user.reload(); O.user = auth.currentUser; renderAcct(); secOk('Google linked.');
}));
$('sec-delete').addEventListener('click', () => acctBusy('sec-err', async () => {
  if ($('sec-del-name').value.trim().toLowerCase() !== myName().toLowerCase()) throw new Error('Type your username exactly to confirm.');
  await reauth($('sec-del-pass').value);
  const uid = O.user.uid, lower = O.profile && O.profile.nameLower;
  await dropLive(true);
  if (O.profile && O.profile.liveCode) await deleteDoc(doc(db, 'live', O.profile.liveCode)).catch(() => {});
  await Promise.all([
    ...SLOTS.concat(...SAVE_MODES.map(slotIds)).map(n => deleteDoc(doc(db, 'users', uid, 'saves', n)).catch(() => {})),
    ...MODES.map(m => deleteDoc(boardRef(m, uid)).catch(() => {})),
    deleteDoc(lifeRef(uid)).catch(() => {}),
    deleteDoc(doc(db, 'leaderboard', uid)).catch(() => {})
  ]);
  if (lower) await deleteDoc(nameRef(lower)).catch(() => {});
  await deleteDoc(doc(db, 'users', uid)).catch(() => {});
  try { localStorage.removeItem('junction-life-v1:' + uid); } catch (e) {}
  O.profile = null; O.slot = null; O.best = emptyBest();
  closeM('m-acct');
  await deleteUser(O.user);                           // onAuthStateChanged then starts a fresh guest
  API.toast('Your account has been deleted.');
}));

/* ---- lifetime stats: shown here, kept by game.js, mirrored to users/{uid}/stats/life */
const lifeRef = uid => doc(db, 'users', uid, 'stats', 'life');
async function loadLife() {
  try {
    const s = await getDoc(lifeRef(O.user.uid));
    if (s.exists() && s.data().modes) API.mergeLife(s.data().modes);
    if (s.exists() && s.data().ach) API.mergeAch(s.data().ach);
  } catch (e) { console.warn('Stats load failed', e); }
  O.lifeLoaded = true;
  pushLife(true);
}
let lifePushAt = 0;
async function pushLife(force) {
  if (!O.lifeLoaded || !O.user) return;
  if (!force && Date.now() - lifePushAt < 60e3) return;
  lifePushAt = Date.now();
  try { await setDoc(lifeRef(O.user.uid), {modes: API.life(), ach: API.ach(), updatedAt: serverTimestamp()}); } catch (e) { console.warn('Stats sync failed', e); }
}
API.events.on('life', () => pushLife(false));
let lastAch3 = null;
API.events.on('ach', () => {
  pushLife(true);
  const a3 = myAch3();
  if (O.ready && O.profile && lastAch3 !== null && a3 !== lastAch3) { syncBoardName(); renderAccount(); }
  lastAch3 = a3;
  if (!$('m-acct').hidden) renderAcct();
});
window.addEventListener('pagehide', () => { pushLife(true); });

const num = v => Math.round(v).toLocaleString();
const dec = v => (Math.round(v * 10) / 10).toLocaleString();
function hmLong(sec) { sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60); return h ? h + 'h ' + m + 'm' : m ? m + 'm' : (sec > 0 ? '<1m' : '0m'); }
function renderStats() {
  const L = API.life(), modes = API.modes();
  $('stats-modes').innerHTML = ['all'].concat(modes).map(m => '<button type="button" data-mode="' + m + '" aria-pressed="' + (m === statsMode) + '">' + (m === 'all' ? 'All modes' : esc(API.diffLabel(m))) + '</button>').join('');
  const pick = statsMode === 'all' ? modes : [statsMode];
  const T = {};
  for (const m of pick) for (const k in L[m]) T[k] = /^best/.test(k) ? Math.max(T[k] || 0, L[m][k]) : (T[k] || 0) + L[m][k];
  const c = T.cities || 0, per = v => c ? v / c : 0, zen = statsMode === 'zen';
  const sec = (title, rows) => '<div class="sg-h">' + title + '</div>' + rows.map(([a, b]) => '<div><b>' + b + '</b><span>' + a + '</span></div>').join('');
  $('stats-grid').innerHTML = !c && !T.playSec ? '<p class="mini">No cities played ' + (statsMode === 'all' ? 'yet' : 'on ' + esc(API.diffLabel(statsMode)) + ' yet') + ' \u2014 your stats fill in as you play.</p>' :
    sec('Cities', [['cities started', num(c)], zen ? ['cities with every goal', num(T.allGoals)] : ['cities finished', num(T.ended)], ['time played', hmLong(T.playSec)],
      ['average time per city', hmLong(per(T.playSec))], ['goals completed', num(T.goals)], ['average goals per city', dec(per(T.goals))]]) +
    sec('Parcels', [['all-time parcels', num(T.parcels)], ['average parcels per city', num(per(T.parcels))], ['most in one city', num(T.bestParcels)],
      ['parcels a minute (overall)', dec(T.playSec > 0 ? T.parcels / (T.playSec / 60) : 0)], ['trips made', num(T.trips)], ['average trips per city', num(per(T.trips))]]) +
    sec('Weeks', [['weeks reached (total)', num(T.weeks)], ['average week reached', dec(per(T.weeks))], ['furthest week', num(T.bestWeek)]]) +
    sec('Money', [['all-time earned', '$' + num(T.earned)], ['average earned per city', '$' + num(per(T.earned))], ['most earned in one city', '$' + num(T.bestEarned)],
      ['all-time spent', '$' + num(T.spent)], ['average spent per city', '$' + num(per(T.spent))], ['tow truck rescues', num(T.tows)]]) +
    sec('Trouble', [['breakdowns', num(T.breakdowns)], ['average breakdowns per city', dec(per(T.breakdowns))]].concat(zen ? [] : [['cities with every goal', num(T.allGoals)]]));
  // time spent on each mode
  if (statsMode === 'all') {
    const mx = Math.max(1, ...modes.map(m => L[m].playSec));
    $('stats-bars').innerHTML = '<div class="sg-h" style="font-size:12px;font-weight:800;color:var(--soft);text-transform:uppercase;letter-spacing:.06em">Time on each mode</div>' +
      modes.map(m => '<div class="mb"><span>' + esc(API.diffLabel(m)) + '</span><i style="width:' + Math.round(L[m].playSec / mx * 100) + '%"></i><b>' + hmLong(L[m].playSec) + '</b></div>').join('');
  } else $('stats-bars').innerHTML = '';
  $('stats-note').textContent = (isPerm() ? 'Kept with your account on every device.' : 'Kept on this browser \u2014 make an account to keep them everywhere.') + ' The tutorial doesn\u2019t count.';
}
$('stats-modes').addEventListener('click', e => { const b = e.target.closest('button[data-mode]'); if (b) { statsMode = b.dataset.mode; renderStats(); } });

/* ============================================================ SAVE FILES */
let savesMode = 'load';
const slotRef = n => doc(db, 'users', O.user.uid, 'saves', n);
/* the Save files window: five slots for one game mode, with tabs to switch mode */
async function openSaves(arg) {
  if (!O.ready) return;
  const mode = SAVE_MODES.includes(arg) ? arg : (SAVE_MODES.includes(API.startDiff) ? API.startDiff : 'standard');
  $('menu').hidden = true;
  $('saves-title').textContent = 'Save files';
  $('saves-lead').textContent = isPerm() ? 'Five cloud save slots for every game mode, kept with your account on any device.' : 'Five cloud save slots for every game mode, on this browser. Make a permanent account to keep them everywhere.';
  $('saves-diff').textContent = '';
  openM('m-saves');
  await renderSlots($('save-slots'), mode, true);
}
let slotsBox = null, slotsMode = 'standard', slotsTabs = false;
async function renderSlots(box, mode, tabs) {
  slotsBox = box; slotsMode = SAVE_MODES.includes(mode) ? mode : slotsMode; slotsTabs = !!tabs;
  if (isoBox === box) isoBox = null;                    // the box now shows save slots, not ISO
  const want = slotsMode;
  box.innerHTML = (slotsTabs ? slotTabsHTML() : '') + '<p class="mini">Loading\u2026</p>';
  bindSlotTabs(box);
  await cloudSave(true);
  const rows = await Promise.all(slotIds(want).map((id, i) => getDoc(slotRef(id)).then(x => [id, i + 1, x.exists() ? x.data() : null]).catch(() => [id, i + 1, null])));
  if (slotsBox !== box || slotsMode !== want) return;
  box.innerHTML = slotsTabs ? slotTabsHTML() : '';
  bindSlotTabs(box);
  for (const [id, n, d] of rows) {
    const el = document.createElement('div'); el.className = 'slot-card' + (O.slot === id ? ' current' : '');
    let desc, btns = '';
    if (d && d.data && !d.over) {
      desc = '<b>Week ' + d.week + '</b> \u00b7 ' + d.score + ' parcels<small>Saved ' + ago(d.updatedAt) + (O.slot === id ? ' \u00b7 playing now' : '') + '</small>';
      btns = '<button class="bigbtn" data-act="load" type="button">Continue</button><button class="act" data-act="new" type="button">New city here</button><button class="act danger" data-act="del" type="button">Delete</button>';
    } else if (d && d.over) {
      desc = '<b>Finished</b> \u00b7 week ' + d.week + ', ' + d.score + ' parcels<small>' + ago(d.updatedAt) + '</small>';
      btns = '<button class="bigbtn" data-act="new" type="button">New city here</button><button class="act danger" data-act="del" type="button">Clear</button>';
    } else {
      desc = '<b>Empty slot</b><small>' + esc(API.diffLabel(want)) + ' \u00b7 nothing saved yet</small>';
      btns = '<button class="bigbtn" data-act="new" type="button">New city here</button>';
    }
    el.innerHTML = '<div class="slotnum">' + n + '</div><div class="slotinfo">' + desc + '</div><div class="slotbtns">' + btns + '</div>';
    el.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', () => slotAction(id, n, btn.dataset.act, d, want)));
    box.append(el);
  }
}
function slotTabsHTML() { return '<div class="seg boardtabs slottabs">' + SAVE_MODES.map(m => '<button type="button" data-smode="' + m + '" aria-pressed="' + (m === slotsMode) + '">' + esc(API.diffLabel(m)) + '</button>').join('') + '</div>'; }
function bindSlotTabs(box) { box.querySelectorAll('[data-smode]').forEach(btn => btn.onclick = () => renderSlots(box, btn.dataset.smode, true)); }
async function slotAction(id, n, act, d, mode) {
  if (act !== 'del') { closeM('m-acct'); closeM('m-saves'); }
  if (act === 'load') {
    let city = null; try { city = JSON.parse(d.data); } catch (e) {}
    if (!city || !API.loadCity(city)) { API.toast('That save file couldn\u2019t be opened.', 'warn'); return; }
    O.slot = id; O.lastSaveAt = Date.now(); O.lastSaveStr = d.data;
    API.toast(API.diffLabel(mode) + ' slot ' + n + ' loaded \u2014 week ' + d.week, 'good');
  } else if (act === 'new') {
    if (d && d.data && !d.over && !confirm('Replace the city in ' + API.diffLabel(mode) + ' slot ' + n + ' (week ' + d.week + ', ' + d.score + ' parcels) with a new one?')) return;
    O.slot = id; O.lastSaveStr = '';
    API.startCity(mode);
    setTimeout(() => cloudSave(true), 400);
  } else if (act === 'del') {
    if (!confirm('Delete ' + API.diffLabel(mode) + ' slot ' + n + '? This can\u2019t be undone.')) return;
    await deleteDoc(slotRef(id)).catch(e => API.toast('Couldn\u2019t delete: ' + e.message, 'warn'));
    if (O.slot === id) O.slot = null;
    if (slotsBox) renderSlots(slotsBox, slotsMode, slotsTabs);
  }
}
/* one-off: the old shared slots 1-5 become slots of the mode each city was played on */
O.slotsMigrated = '';
async function migrateLegacySaves() {
  if (!O.user || O.slotsMigrated === O.user.uid) return;
  O.slotsMigrated = O.user.uid;
  for (const n of SLOTS) {
    try {
      const x = await getDoc(slotRef(n)); if (!x.exists()) continue;
      const d = x.data(), mode = SAVE_MODES.includes(d.diffKey) ? d.diffKey : 'standard', to = slotRef(mode + '-' + n);
      if (d.data && !d.over && !(await getDoc(to)).exists()) await setDoc(to, d);
      await deleteDoc(slotRef(n));
    } catch (e) { console.warn('Moving an old save slot failed', e); }
  }
}
async function cloudSave(urgent) {
  if (!O.ready || !O.slot) return;
  const st = API.state();
  if (!st.started || st.atMenu || st.over || st.tutorialMode || st.spectating) return;
  const now = Date.now();
  if (!urgent && now - O.lastSaveAt < CLOUD_SAVE_EVERY) return;
  const data = JSON.stringify(API.serialize());
  if (data === O.lastSaveStr) return;
  if (data.length > MAX_STATE) { console.warn('City too large for a cloud save'); return; }
  O.lastSaveAt = now; O.lastSaveStr = data;
  try {
    await setDoc(slotRef(O.slot), {data, score: st.score, week: st.week, diffKey: st.diffKey, over: false, updatedAt: serverTimestamp()});
  } catch (e) { console.warn('Cloud save failed', e); O.lastSaveStr = ''; }
}
$('btn-saves').addEventListener('click', () => openSaves('load'));
$('btn-saves2').addEventListener('click', () => openSaves('load'));
$('saves-back').addEventListener('click', () => closeM('m-saves'));

API.events.on('autosave', e => { cloudSave(e && e.urgent); maybeBoard(false); });
API.events.on('week', () => { cloudSave(true); maybeBoard(true); });
API.events.on('over', async e => {
  if (e.diffKey === 'iso') { isoOver(); return; }
  if (e.diffKey === 'expert') submitExpert(API.state());
  else if (e.diffKey !== 'zen') submitBest(e.diffKey, {parcels: e.score, weeks: e.week});
  if (O.ready && O.slot) {
    await setDoc(slotRef(O.slot), {data: deleteField(), score: e.score, week: e.week, diffKey: e.diffKey, over: true, updatedAt: serverTimestamp()}, {merge: true}).catch(() => {});
  }
  O.slot = null;
  pushLive(true);
});
API.events.on('allGoals', e => { if (e.diffKey !== 'zen') submitBest(e.diffKey, {goalsSec: Math.max(1, Math.round(e.clock))}); });
window.addEventListener('pagehide', () => { cloudSave(true); });

/* ============================================================ LEADERBOARDS
   One board per mode: boards/{chill|standard|frantic|zen}/players/{uid}, one document per player.
   Relaxed, Standard and Frantic rank most parcels, furthest week and fastest all-goals.
   Zen can't be lost, so it ranks longest played and most earned in a single city instead.
   The tutorial never counts. */
const MODES = ['chill', 'standard', 'frantic', 'zen'];
const metricsFor = m => m === 'zen' ? ['playSec', 'earned'] : ['parcels', 'weeks', 'goalsSec'];
const LOWER_IS_BETTER = {goalsSec: true};
function emptyBest() { return Object.fromEntries(MODES.map(m => [m, {}])); }
const boardRef = (mode, uid) => doc(db, 'boards', mode, 'players', uid);
function hm(sec) { sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60); return h ? h + 'h ' + String(m).padStart(2, '0') + 'm' : m + 'm'; }
const money = v => '$' + Math.round(v).toLocaleString();
O.best = emptyBest();

async function loadBest() {
  O.best = emptyBest();
  await Promise.all(MODES.map(async m => {
    try {
      const s = await getDoc(boardRef(m, O.user.uid));
      if (s.exists()) { const d = s.data(); metricsFor(m).forEach(k => { if (d[k] > 0) O.best[m][k] = d[k]; }); }
    } catch (e) { /* nothing yet */ }
  }));
  await migrateOldBoard();
}
/* One-off: move a player's bests from the old all-modes leaderboard onto the board for the mode each came from. */
async function migrateOldBoard() {
  if (!O.profile || !O.profile.name) return;
  try {
    const ref = doc(db, 'leaderboard', O.user.uid), s = await getDoc(ref);
    if (!s.exists()) return;
    const d = s.data();
    for (const [k, dk] of [['parcels', 'parcelsDiff'], ['weeks', 'weeksDiff'], ['goalsSec', 'goalsDiff']]) {
      if (d[k] > 0 && MODES.includes(d[dk]) && d[dk] !== 'zen') await submitBest(d[dk], {[k]: d[k]}, true);
    }
    await deleteDoc(ref);
  } catch (e) { console.warn('Moving old leaderboard entry failed', e); }
}
function maybeBoard(force) {
  const st = API.state();
  if (!st.started || st.atMenu || st.tutorialMode || st.spectating || st.over) return;
  if (!force && Date.now() - O.lastBoardAt < 60e3) return;
  O.lastBoardAt = Date.now();
  if (st.diffKey === 'expert') { submitExpert(st); return; }
  if (st.diffKey === 'zen') submitBest('zen', {playSec: Math.floor(st.clock || 0), earned: Math.floor(st.earned || 0)});
  else submitBest(st.diffKey, {parcels: st.score, weeks: st.week});
}
async function submitBest(mode, vals, quiet) {
  if (!O.ready || !O.profile || !O.profile.name || !MODES.includes(mode)) return;
  const best = O.best[mode], up = {};
  for (const k of metricsFor(mode)) {
    const v = Math.floor(vals[k] || 0); if (!(v > 0)) continue;
    if (LOWER_IS_BETTER[k] ? (!best[k] || v < best[k]) : v > (best[k] || 0)) up[k] = v;
  }
  if (!Object.keys(up).length) return;
  Object.assign(best, up);
  try {
    await setDoc(boardRef(mode, O.user.uid), Object.assign({name: myName(), star: isPerm(), ach3: myAch3(), updatedAt: serverTimestamp()}, up), {merge: true});
    if (up.goalsSec && !quiet) API.toast('New ' + API.diffLabel(mode) + ' best: every goal in ' + mmss(up.goalsSec), 'good');
  } catch (e) { console.warn('Leaderboard update failed', e); }
}

const BOARDS = {
  parcels:  {label: 'Most parcels',      dir: 'desc', fmt: v => v.toLocaleString() + ' parcels', note: 'Most parcels delivered in a single city.'},
  weeks:    {label: 'Longest survived',  dir: 'desc', fmt: v => 'Week ' + v,                     note: 'Furthest week reached in a single city.'},
  goalsSec: {label: 'Fastest all goals', dir: 'asc',  fmt: v => mmss(v),                         note: 'Quickest game time to finish every goal in one city.'},
  playSec:  {label: 'Longest played',    dir: 'desc', fmt: v => hm(v),                           note: 'Most game time played in a single city.'},
  earned:   {label: 'Highest earned',    dir: 'desc', fmt: v => money(v),                        note: 'Most money earned in a single city.'}
};
let boardMode = null, boardTab = 'parcels';
/* the mode being played right now, or the one picked on the start screen */
function currentMode() {
  const st = API.state();
  if (st.started && !st.tutorialMode && !st.spectating && !st.atMenu && MODES.includes(st.diffKey)) return st.diffKey;
  return MODES.includes(API.startDiff) ? API.startDiff : 'standard';
}
function renderBoardTabs() {
  $('board-modes').innerHTML = MODES.map(m => '<button type="button" data-mode="' + m + '" aria-pressed="' + (m === boardMode) + '">' + esc(API.diffLabel(m)) + '</button>').join('') +
    '<button type="button" data-mode="expert" aria-pressed="' + (boardMode === 'expert') + '">Expert</button>';
  if (boardMode === 'expert') {
    $('board-tabs').innerHTML = [0, 1, 2, 3].map(w => '<button type="button" data-week="' + w + '" aria-pressed="' + (w === expertAgo) + '">' + ['This week', 'Last week', '2 weeks ago', '3 weeks ago'][w] + '</button>').join('');
    return;
  }
  $('board-tabs').innerHTML = metricsFor(boardMode).map(k => '<button type="button" data-board="' + k + '" aria-pressed="' + (k === boardTab) + '">' + BOARDS[k].label + '</button>').join('');
}
async function openBoard(tab, mode) {
  boardMode = mode || boardMode || currentMode();
  if (boardMode === 'expert') { openExpert(expertAgo); return; }
  if (tab) boardTab = tab;
  if (!metricsFor(boardMode).includes(boardTab)) boardTab = metricsFor(boardMode)[0];
  $('menu').hidden = true;
  renderBoardTabs();
  const B = BOARDS[boardTab], mode0 = boardMode, tab0 = boardTab;
  $('board-note').textContent = API.diffLabel(boardMode) + ': ' + B.note + ' Tutorial runs don\u2019t count. \u2605 marks permanent accounts.';
  $('board-list').innerHTML = '<li class="mini">Loading\u2026</li>';
  $('board-me').textContent = '';
  if ($('m-board').hidden) openM('m-board');
  try {
    const snap = await getDocs(query(collection(db, 'boards', boardMode, 'players'), orderBy(boardTab, B.dir), limit(25)));
    if (mode0 !== boardMode || tab0 !== boardTab) return;          // they switched tabs while this was loading
    const rows = []; let meIn = false;
    snap.forEach(s => {
      const d = s.data(); if (!(d[boardTab] > 0)) return;
      const me = O.user && s.id === O.user.uid; if (me) meIn = true;
      rows.push('<li class="click' + (me ? ' me' : '') + '" data-player="' + esc(s.id) + '" data-name="' + esc(d.name || '') + '" tabindex="0"><span class="rank">' + (rows.length + 1) + '</span><span class="who">' + nameHTML(d.name || '?', d.star, d.ach3) +
        '</span><b class="num">' + B.fmt(d[boardTab]) + '</b></li>');
    });
    $('board-list').innerHTML = rows.join('') || '<li class="mini">No entries yet \u2014 be the first.</li>';
    const mine = (O.best[boardMode] || {})[boardTab];
    $('board-me').innerHTML = mine > 0 ? 'Your best: <b>' + B.fmt(mine) + '</b>' + (meIn ? '' : ' (outside the top 25)')
      : boardTab === 'goalsSec' ? 'Finish all ' + API.goalsTotal + ' goals in one ' + esc(API.diffLabel(boardMode)) + ' city to get on this board.' : '';
  } catch (e) {
    if (mode0 !== boardMode || tab0 !== boardTab) return;
    $('board-list').innerHTML = '<li class="mini">Couldn\u2019t load the leaderboard: ' + esc(e.message) + '</li>';
  }
}
$('board-modes').addEventListener('click', e => { const b = e.target.closest('button[data-mode]'); if (b) openBoard(null, b.dataset.mode); });
$('board-tabs').addEventListener('click', e => {
  const w = e.target.closest('button[data-week]'); if (w) { openExpert(+w.dataset.week); return; }
  const b = e.target.closest('button[data-board]'); if (b) openBoard(b.dataset.board);
});

/* ============================================================ EXPERT SURVIVAL
   A new seeded city every ISO week. Each player's best run on a week's seed is kept on that week's board,
   with a small copy of the city so anyone can open it and see who placed what, and message the player. */
let expertAgo = 0;
const expertRef = (wk, uid) => doc(db, 'expert', wk, 'players', uid);
O.expertBest = {};
function seedOfWeek(wk) { for (let k = 0; k < 120; k++) { const sd = API.expertSeed(k); if (sd.key === wk) return sd; } return API.expertSeed(0); }
async function submitExpert(st) {
  if (!O.ready || !O.profile || !O.profile.name || !st || !st.expWeek || st.tutorialMode || st.spectating) return;
  const wk = st.expWeek;
  if (!O.expertBest[wk]) O.expertBest[wk] = await getDoc(expertRef(wk, O.user.uid)).then(x => x.exists() ? x.data() : {}).catch(() => ({}));
  const best = O.expertBest[wk];
  if (!(st.score > (best.parcels || 0) || (st.score === (best.parcels || 0) && st.week > (best.weeks || 0)))) return;
  const sd = seedOfWeek(wk);
  const data = {name: myName(), star: isPerm(), ach3: myAch3(), parcels: Math.floor(st.score || 0), weeks: Math.floor(st.week || 0), earned: Math.floor(st.earned || 0),
    trips: Math.floor(st.trips || 0), tows: Math.floor(st.tows || 0), cars: Math.floor(st.cars || 0), roads: Math.floor(st.roads || 0), playSec: Math.floor(st.clock || 0),
    seedName: sd.name, seedCode: sd.code, weekLabel: sd.label, city: API.citySnap(), updatedAt: serverTimestamp()};
  if (data.city.length > 300000) data.city = '';
  try { await setDoc(expertRef(wk, O.user.uid), data); O.expertBest[wk] = data; }
  catch (e) { console.warn('Expert leaderboard update failed', e); }
}
let expertRows = {};
async function openExpert(ago) {
  expertAgo = ago || 0; boardMode = 'expert';
  $('menu').hidden = true;
  renderBoardTabs();
  const sd = API.expertSeed(expertAgo), wk = sd.key, want = wk;
  $('board-note').innerHTML = '<span class="boardweek"><b>Seed \u201c' + esc(sd.name) + '\u201d \u00b7 code ' + esc(sd.code) + '</b><small>Week of ' + esc(sd.label) +
    ' \u2014 everyone played the same seeded city. Most parcels first. Tap a player to see their city and stats.</small></span>';
  $('board-list').innerHTML = '<li class="mini">Loading\u2026</li>';
  $('board-me').textContent = '';
  if ($('m-board').hidden) openM('m-board');
  try {
    const snap = await getDocs(query(collection(db, 'expert', wk, 'players'), orderBy('parcels', 'desc'), limit(25)));
    if (boardMode !== 'expert' || API.expertSeed(expertAgo).key !== want) return;
    const rows = []; expertRows = {}; let meIn = false;
    snap.forEach(x => {
      const d = x.data(), me = O.user && x.id === O.user.uid; if (me) meIn = true;
      expertRows[x.id] = d;
      rows.push('<li class="click' + (me ? ' me' : '') + '" data-run="' + x.id + '" tabindex="0"><span class="rank">' + (rows.length + 1) + '</span><span class="who">' + nameHTML(d.name || '?', d.star, d.ach3) +
        ' <span class="dk">week ' + (d.weeks || 0) + '</span></span><b class="num">' + (d.parcels || 0).toLocaleString() + ' parcels</b></li>');
    });
    $('board-list').innerHTML = rows.join('') || '<li class="mini">No runs on this seed yet \u2014 be the first.</li>';
    const mine = O.expertBest[wk];
    $('board-me').innerHTML = mine && mine.parcels ? 'Your best on this seed: <b>' + mine.parcels.toLocaleString() + ' parcels</b>, week ' + mine.weeks + (meIn ? '' : ' (outside the top 25)')
      : expertAgo === 0 ? 'Play this week\u2019s seed from the start screen to get on this board.' : '';
  } catch (e) { $('board-list').innerHTML = '<li class="mini">Couldn\u2019t load the Expert leaderboard: ' + esc(e.message) + '</li>'; }
}
/* the top few of a week's seed, for the Weeklys page on the main menu */
async function expertTop(ago, n) {
  const wk = API.expertSeed(ago || 0).key;
  const snap = await getDocs(query(collection(db, 'expert', wk, 'players'), orderBy('parcels', 'desc'), limit(n || 3)));
  const out = [];
  snap.forEach(x => { const d = x.data(); expertRows[x.id] = d; out.push({uid: x.id, name: d.name || '?', parcels: d.parcels || 0, weeks: d.weeks || 0, city: d.city || ''}); });
  return out;
}
$('board-list').addEventListener('click', e => {
  const li = e.target.closest('[data-run]'); if (li && boardMode === 'expert') { openRun(API.expertSeed(expertAgo).key, li.dataset.run); return; }
  const p = e.target.closest('[data-player]'); if (p) openPlayer(p.dataset.player, p.dataset.name);
});
$('board-list').addEventListener('keydown', e => { if (e.key !== 'Enter') return; const p = e.target.closest('[data-player]'); if (p) openPlayer(p.dataset.player, p.dataset.name); });
$('board-list').addEventListener('keydown', e => { if (e.key === 'Enter') { const li = e.target.closest('[data-run]'); if (li && boardMode === 'expert') openRun(API.expertSeed(expertAgo).key, li.dataset.run); } });
let runOf = null;
function openRun(wk, uid) {
  const d = expertRows[uid]; if (!d) return;
  runOf = {uid, name: d.name};
  $('run-name').innerHTML = nameHTML(d.name || '?', d.star, d.ach3);
  $('run-seed').textContent = 'Seed \u201c' + (d.seedName || '') + '\u201d \u00b7 code ' + (d.seedCode || '') + ' \u00b7 week of ' + (d.weekLabel || wk);
  const cv = $('run-map'), ok = d.city && API.drawCitySnap(cv, d.city);
  if (!ok) { const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height); }
  const stat = (v, l) => '<div><b>' + v + '</b><span>' + l + '</span></div>';
  $('run-stats').innerHTML = stat((d.parcels || 0).toLocaleString(), 'parcels delivered') + stat('Week ' + (d.weeks || 0), 'reached') + stat(money(d.earned || 0), 'earned') +
    stat((d.trips || 0).toLocaleString(), 'trips') + stat(d.cars || 0, 'cars') + stat(d.roads || 0, 'road tiles') + stat(d.tows || 0, 'tow-truck rescues') + stat(hm(d.playSec || 0), 'played');
  $('run-note').textContent = ok ? 'Their city at their best moment on this seed: roads, motorways, lights (red dots), roundabouts (green dots), houses and stores.' : 'No map saved for this run.';
  $('run-msg').hidden = !O.user || uid === O.user.uid; $('run-chal').hidden = $('run-msg').hidden;
  loadFriends().then(renderRunFriend);
  $('run-msg').textContent = 'Message ' + (d.name || 'them');
  openM('m-run');
}
$('run-close').addEventListener('click', () => closeM('m-run'));
$('run-chal').addEventListener('click', () => { if (runOf) openChallenge(runOf.uid, runOf.name); });
$('run-friend').addEventListener('click', async () => { if (!runOf) return; const err = await addFriend(runOf.uid, runOf.name); API.toast(err || runOf.name + ' is now your friend \u2014 find them under Chats on the main menu.', err ? 'warn' : 'good'); renderRunFriend(); });
function renderRunFriend() { const b = $('run-friend'); if (!b || !runOf) return; const f = isFriend(runOf.uid); b.hidden = !O.user || runOf.uid === O.user.uid || f; }
$('run-msg').addEventListener('click', () => { if (!runOf) return; closeM('m-run'); closeM('m-board'); openThread(runOf.uid, runOf.name); });

/* ============================================================ MESSAGES
   messages/{id}: {from, fromName, to, toName, text, at, read}. Each player listens for messages sent to them;
   what they've sent is fetched when they open a conversation. Rules let only the two people involved read one. */
O.inbox = []; O.sent = []; O.msgUid = null; let msgWith = null, msgUnsub = null;
const msAt = m => (m.at && m.at.toMillis) ? m.at.toMillis() : (m.localAt || Date.now());
function startInbox() {
  if (!O.user || O.msgUid === O.user.uid) return;
  O.msgUid = O.user.uid; if (msgUnsub) msgUnsub();
  msgUnsub = onSnapshot(query(collection(db, 'messages'), where('to', '==', O.user.uid), limit(200)), snap => {
    O.inbox = snap.docs.map(x => Object.assign({id: x.id}, x.data()));
    updateMsgBadge();
    if (!$('m-acct').hidden && acctPane === 'msgs') renderMsgs();
    if (frBox && frSel) renderFriendChat();
  }, e => console.warn('Inbox unavailable', e));
}
async function loadSent() {
  try { const sn = await getDocs(query(collection(db, 'messages'), where('from', '==', O.user.uid), limit(200))); O.sent = sn.docs.map(x => Object.assign({id: x.id}, x.data())); }
  catch (e) { console.warn('Sent messages unavailable', e); }
}
function updateMsgBadge() {
  const n = O.inbox.filter(m => !m.read).length;
  for (const id of ['msg-badge', 'msg-tabbadge']) { const el = $(id); if (el) { el.textContent = n > 99 ? '99+' : String(n); el.hidden = !n; } }
}
function threadsList() {
  const by = {};
  for (const m of O.inbox) { const t = by[m.from] || (by[m.from] = {uid: m.from, name: m.fromName, last: null, unread: 0}); if (!m.read) t.unread++; if (!t.last || msAt(m) > msAt(t.last)) t.last = m; }
  for (const m of O.sent) { const t = by[m.to] || (by[m.to] = {uid: m.to, name: m.toName, last: null, unread: 0}); if (!t.last || msAt(m) > msAt(t.last)) t.last = m; }
  return Object.values(by).sort((a, b) => msAt(b.last) - msAt(a.last));
}
const ago2 = t => { const s2 = (Date.now() - t) / 1000; return s2 < 60 ? 'now' : s2 < 3600 ? Math.floor(s2 / 60) + 'm' : s2 < 86400 ? Math.floor(s2 / 3600) + 'h' : Math.floor(s2 / 86400) + 'd'; };
function renderMsgs() {
  const list = $('msg-list'), th = $('msg-thread');
  if (msgWith) { list.hidden = true; th.hidden = false; renderThread(); return; }
  list.hidden = false; th.hidden = true;
  const ts = threadsList();
  list.innerHTML = ts.length ? ts.map(t => '<button type="button" class="msgrow' + (t.unread ? ' unread' : '') + '" data-with="' + esc(t.uid) + '" data-name="' + esc(t.name || '') + '"><span class="av">' + esc((t.name || '?').charAt(0).toUpperCase()) +
    '</span><span><b>' + esc(t.name || 'Player') + (t.unread ? ' <span class="tabbadge">' + t.unread + '</span>' : '') + '</b><small>' + (t.last.from === O.user.uid ? 'You: ' : '') + esc(t.last.text || '') + '</small></span><time>' + ago2(msAt(t.last)) + '</time></button>').join('')
    : '<p class="mini">No messages yet. Open the Expert leaderboard, tap a player and message them.</p>';
}
function renderThread() {
  $('msg-with').textContent = msgWith.name || 'Player';
  const mc = $('msg-chal'); if (mc) mc.onclick = () => openChallenge(msgWith.uid, msgWith.name);
  const af = $('msg-addfriend'); if (af) { af.hidden = isFriend(msgWith.uid); af.onclick = async () => { const err = await addFriend(msgWith.uid, msgWith.name); API.toast(err || (msgWith.name || 'They') + ' is now your friend', err ? 'warn' : 'good'); renderThread(); }; }
  const ms = O.inbox.filter(m => m.from === msgWith.uid).concat(O.sent.filter(m => m.to === msgWith.uid)).sort((a, b) => msAt(a) - msAt(b));
  const body = $('msg-body');
  body.innerHTML = ms.length ? ms.map(m => '<div class="bubble' + (m.from === O.user.uid ? ' me' : '') + '">' + esc(m.text || '') + '<time>' + new Date(msAt(m)).toLocaleString(undefined, {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}) + '</time></div>').join('')
    : '<p class="mini">Say hello to ' + esc(msgWith.name || 'them') + '.</p>';
  body.scrollTop = body.scrollHeight;
  // mark what they sent as read
  for (const m of ms) if (m.to === O.user.uid && !m.read) { m.read = true; updateDoc(doc(db, 'messages', m.id), {read: true}).catch(() => {}); }
  updateMsgBadge();
}
async function openThread(uid, name) {
  if (!O.ready || !O.user) return;
  msgWith = {uid, name};
  openAcct('msgs');
}
$('msg-list').addEventListener('click', e => { const b = e.target.closest('[data-with]'); if (b) { msgWith = {uid: b.dataset.with, name: b.dataset.name}; renderMsgs(); } });
$('msg-back').addEventListener('click', () => { msgWith = null; renderMsgs(); });
let lastSend = 0;
/* send one message; resolves to '' on success or an error to show */
async function sendTo(uid, name, t) {
  t = (t || '').trim();
  if (!t) return 'Write something first.';
  if (!O.profile || !O.profile.name) return 'Pick a username first (Account \u2192 Profile).';
  if (t.length > 500) return 'Messages can be up to 500 characters.';
  if (Date.now() - lastSend < 1500) return 'Slow down a little.';
  lastSend = Date.now();
  const m = {from: O.user.uid, fromName: myName(), to: uid, toName: (name || 'Player').slice(0, 16), text: t, at: serverTimestamp(), read: false};
  try { const ref = await addDoc(collection(db, 'messages'), m); O.sent.push(Object.assign({id: ref.id, localAt: Date.now()}, m, {at: null})); return ''; }
  catch (e) { return 'Couldn\u2019t send that: ' + e.message; }
}
async function sendMsg() {
  if (!msgWith) return;
  $('msg-err').textContent = ''; $('msg-send').disabled = true;
  const err = await sendTo(msgWith.uid, msgWith.name, $('msg-text').value);
  $('msg-send').disabled = false;
  if (err) { $('msg-err').textContent = err; return; }
  $('msg-text').value = ''; renderThread();
}
$('msg-send').addEventListener('click', sendMsg);
$('msg-text').addEventListener('keydown', e => { if (e.key === 'Enter') sendMsg(); });
/* ============================================================ FRIENDS
   users/{uid}/friends/{fuid}: the players you've added. The Friends section of the main menu lists them with
   their records (best on every mode, and on this week's Expert seed) and a chat with each. */
O.friends = null; let frBox = null, frSel = null, frRecords = {};
const friendRef = (fuid) => doc(db, 'users', O.user.uid, 'friends', fuid);
const isFriend = fuid => !!(O.friends || []).find(f => f.uid === fuid);
async function loadFriends(force) {
  if (!O.ready || !O.user) return [];
  if (O.friends && !force) return O.friends;
  try { const sn = await getDocs(collection(db, 'users', O.user.uid, 'friends')); O.friends = sn.docs.map(x => Object.assign({uid: x.id}, x.data())).sort((a, b) => String(a.name).localeCompare(b.name)); }
  catch (e) { console.warn('Friends unavailable', e); O.friends = O.friends || []; }
  return O.friends;
}
async function addFriend(fuid, name) {
  if (!O.ready || !O.user) return 'Online features are still connecting.';
  if (!O.profile || !O.profile.name) return 'Pick a username first.';
  if (fuid === O.user.uid) return 'That\u2019s you.';
  try { await setDoc(friendRef(fuid), {name: String(name || 'Player').slice(0, 16), at: serverTimestamp()}); await loadFriends(true); return ''; }
  catch (e) { return 'Couldn\u2019t add that friend: ' + e.message; }
}
async function addFriendByName(name) {
  name = (name || '').trim();
  if (!/^[A-Za-z0-9_-]{3,16}$/.test(name)) return 'Usernames are 3\u201316 letters, numbers, _ or -.';
  try {
    const sn = await getDoc(doc(db, 'usernames', name.toLowerCase()));
    if (!sn.exists() || !sn.data().uid) return 'No player called \u201c' + name + '\u201d.';
    return await addFriend(sn.data().uid, name);
  } catch (e) { return 'Couldn\u2019t look that player up: ' + e.message; }
}
async function friendRecordsOf(fuid) {
  if (frRecords[fuid] && Date.now() - frRecords[fuid].at < 120e3) return frRecords[fuid];
  const r = {at: Date.now(), modes: {}, expert: null};
  await Promise.all(MODES.map(async m => { try { const x = await getDoc(boardRef(m, fuid)); if (x.exists()) r.modes[m] = x.data(); } catch (e) {} }));
  try { const x = await getDoc(expertRef(API.expertSeed(0).key, fuid)); if (x.exists()) r.expert = x.data(); } catch (e) {}
  return (frRecords[fuid] = r);
}
function recordsHTML(r) {
  const cell = (v, l) => '<div><b>' + v + '</b><span>' + l + '</span></div>';
  let h = '<div class="statgrid frstats">';
  for (const m of MODES) {
    const d = r.modes[m] || {};
    h += m === 'zen' ? cell(d.playSec ? hm(d.playSec) : '\u2014', esc(API.diffLabel(m)) + ' \u00b7 longest')
      : cell(d.parcels ? d.parcels.toLocaleString() : '\u2014', esc(API.diffLabel(m)) + ' \u00b7 parcels' + (d.weeks ? ', week ' + d.weeks : ''));
  }
  h += cell(r.expert ? r.expert.parcels.toLocaleString() : '\u2014', 'Expert this week' + (r.expert ? ' \u00b7 week ' + r.expert.weeks : ''));
  return h + '</div>';
}
/* the Friends section: add form, your friends with their best records, and a chat with whoever is picked */
async function renderFriends(box) {
  frBox = box || frBox; if (!frBox) return;
  if (!O.ready || !O.user) { frBox.innerHTML = '<p class="mini">Friends need the online service \u2014 it\u2019s still connecting, or unavailable right now.</p>'; return; }
  if (!O.profile || !O.profile.name) { frBox.innerHTML = '<p class="mini">Pick a username first, then you can add friends.</p><button class="bigbtn" type="button" id="fr-pick">Pick a username</button>'; $('fr-pick').onclick = () => openUserModal(); return; }
  frBox.innerHTML = '<p class="mini">Loading friends\u2026</p>';
  const list = await loadFriends();
  await loadSent();
  const unreadFrom = uid => O.inbox.filter(m => m.from === uid && !m.read).length;
  frBox.innerHTML = '<div class="frwrap"><div class="frcol">' +
    '<div class="fradd"><input id="fr-name" type="text" maxlength="16" placeholder="Add a friend by username" autocomplete="off" spellcheck="false"><button class="bigbtn" id="fr-add" type="button">Add</button></div>' +
    '<p class="formerr" id="fr-err" role="alert"></p>' +
    '<div class="frlist">' + (list.length ? list.map(f => '<button type="button" class="frrow' + (frSel && frSel.uid === f.uid ? ' active' : '') + '" data-fr="' + esc(f.uid) + '" data-name="' + esc(f.name) + '"><span class="av">' + esc(String(f.name).charAt(0).toUpperCase()) + '</span><b>' + esc(f.name) + '</b>' + (unreadFrom(f.uid) ? '<span class="tabbadge">' + unreadFrom(f.uid) + '</span>' : '') + '</button>').join('')
      : '<p class="mini">No friends yet. Add someone by their username, or from a player on the Expert leaderboard.</p>') + '</div></div>' +
    '<div class="frmain" id="fr-main">' + (frSel ? '' : '<p class="mini">Pick a friend to see their records and chat.</p>') + '</div></div>';
  const add = async () => { const err = await addFriendByName($('fr-name').value); if (err) { $('fr-err').textContent = err; return; } API.toast('Friend added', 'good'); renderFriends(); };
  $('fr-add').onclick = add; $('fr-name').onkeydown = e => { if (e.key === 'Enter') add(); };
  frBox.querySelectorAll('[data-fr]').forEach(b => b.onclick = () => { frSel = {uid: b.dataset.fr, name: b.dataset.name}; renderFriends(); });
  if (frSel) renderFriendMain();
}
async function renderFriendMain() {
  const main = $('fr-main'); if (!main || !frSel) return;
  main.innerHTML = '<div class="frhead"><b>' + esc(frSel.name) + '</b><span><button class="act small" type="button" id="fr-chal">Challenge</button> <button class="act small" type="button" id="fr-view">Profile</button> <button class="linkbtn" type="button" id="fr-remove">Remove friend</button></span></div>' +
    '<div id="fr-rec"><p class="mini">Loading records\u2026</p></div>' +
    '<h4 class="frh">Chat</h4><div class="mt-body" id="fr-chat"></div>' +
    '<div class="mt-reply"><input id="fr-text" type="text" maxlength="500" placeholder="Message ' + esc(frSel.name) + '\u2026" autocomplete="off"><button class="bigbtn" id="fr-send" type="button">Send</button></div><p class="formerr" id="fr-cerr" role="alert"></p>';
  $('fr-chal').onclick = () => openChallenge(frSel.uid, frSel.name);
  $('fr-view').onclick = () => openPlayer(frSel.uid, frSel.name);
  $('fr-remove').onclick = async () => { try { await deleteDoc(friendRef(frSel.uid)); } catch (e) {} frSel = null; await loadFriends(true); renderFriends(); };
  const send = async () => { $('fr-cerr').textContent = ''; const err = await sendTo(frSel.uid, frSel.name, $('fr-text').value); if (err) { $('fr-cerr').textContent = err; return; } $('fr-text').value = ''; renderFriendChat(); };
  $('fr-send').onclick = send; $('fr-text').onkeydown = e => { if (e.key === 'Enter') send(); };
  renderFriendChat();
  const sel = frSel, r = await friendRecordsOf(sel.uid);
  if (frSel === sel && $('fr-rec')) $('fr-rec').innerHTML = recordsHTML(r);
}
function renderFriendChat() {
  const body = $('fr-chat'); if (!body || !frSel) return;
  const ms = O.inbox.filter(m => m.from === frSel.uid).concat(O.sent.filter(m => m.to === frSel.uid)).sort((a, b) => msAt(a) - msAt(b));
  body.innerHTML = ms.length ? ms.map(m => '<div class="bubble' + (m.from === O.user.uid ? ' me' : '') + '">' + esc(m.text || '') + '<time>' + new Date(msAt(m)).toLocaleString(undefined, {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}) + '</time></div>').join('')
    : '<p class="mini">No messages yet \u2014 say hello.</p>';
  body.scrollTop = body.scrollHeight;
  for (const m of ms) if (m.to === O.user.uid && !m.read) { m.read = true; updateDoc(doc(db, 'messages', m.id), {read: true}).catch(() => {}); }
  updateMsgBadge();
}
window.__junctionMessages = () => {
  if (!O.ready || !O.user) { API.toast('Online features are still connecting \u2014 try again in a moment.', 'warn'); return; }
  if (!O.profile || !O.profile.name) { openUserModal(); return; }
  msgWith = null; openAcct('msgs');
};
$('btn-board').addEventListener('click', () => openBoard(null, currentMode()));
$('btn-board-s').addEventListener('click', () => openBoard(null, currentMode()));
$('board-close').addEventListener('click', () => closeM('m-board'));

/* ============================================================ LIVE VIEWING
   Every player owns live/{code}. Viewers stamp `watchT` on it; while that stamp is fresh the host
   writes a snapshot of their city every few seconds. With nobody watching the host only sends a
   small heartbeat once a minute, which keeps Firestore writes low. */
async function setupLive(forceNew) {
  await dropLive(forceNew);
  let code = null;
  if (isPerm()) code = forceNew ? null : (O.profile && O.profile.liveCode) || null;
  for (let tries = 0; tries < 6; tries++) {
    const c = code || randomCode();
    try {
      const ref = doc(db, 'live', c), s = await getDoc(ref);
      if (s.exists() && s.data().uid !== O.user.uid) { code = null; continue; }
      await setDoc(ref, {uid: O.user.uid, name: myName(), star: isPerm(), ach3: myAch3(), playing: false, state: null, meta: null, stateAt: null, updatedAt: serverTimestamp(), expireAt: new Date(Date.now() + 864e5)});
      code = c; break;
    } catch (e) { console.warn('live code', e); code = null; }
  }
  if (!code) { O.liveCode = null; renderLiveCode(); return; }
  O.liveCode = code;
  if (isPerm() && (!O.profile || O.profile.liveCode !== code)) {
    await setDoc(doc(db, 'users', O.user.uid), {liveCode: code}, {merge: true}).catch(() => {});
    O.profile = Object.assign({}, O.profile, {liveCode: code});
  }
  O.liveUnsub = onSnapshot(doc(db, 'live', code), s => {
    const d = s.data(); if (!d) return;
    const w = d.watchT && d.watchT.toMillis ? d.watchT.toMillis() : 0;
    const was = O.watchedUntil > Date.now();
    O.watchedUntil = w ? w + WATCH_FRESH : 0;
    if (!was && O.watchedUntil > Date.now()) { O.lastLiveStr = ''; pushLive(true); API.toast('Someone is watching your city live', 'tip'); }
  }, () => {});
  renderLiveCode(); pushProfile();
}
/* profiles/{uid}: the little that anyone can see about a player — their name and live code */
async function pushProfile() {
  if (!O.user || !O.profile || !O.profile.name) return;
  await setDoc(doc(db, 'profiles', O.user.uid), {name: myName(), star: isPerm(), ach3: myAch3(), live: O.liveCode || null, updatedAt: serverTimestamp()}).catch(e => console.warn('Profile not shared', e));
}
async function dropLive(remove) {
  if (O.liveUnsub) { O.liveUnsub(); O.liveUnsub = null; }
  const c = O.liveCode; O.liveCode = null;
  if (c && (remove || !isPerm() || !O.profile || O.profile.liveCode !== c)) await deleteDoc(doc(db, 'live', c)).catch(() => {});
  else if (c) await updateDoc(doc(db, 'live', c), {playing: false, state: null}).catch(() => {});
}
async function pushLive(force) {
  if (!O.liveCode || !O.ready) return;
  const st = API.state(), now = Date.now();
  const playing = st.started && !st.atMenu && !st.tutorialMode && !st.spectating && !st.over;
  if (playing !== O.livePlaying) { O.livePlaying = playing; force = true; }      // starting or stopping a city shows straight away
  const watched = O.watchedUntil > now;
  const ref = doc(db, 'live', O.liveCode);
  if (watched && playing) {
    if (!force && now - O.lastLiveAt < LIVE_SEND_EVERY) return;
    const state = JSON.stringify(API.serialize());
    const meta = {running: st.running, speed: st.speed, over: st.over};
    if (state.length > MAX_STATE) return;
    const same = state === O.lastLiveStr;
    if (same && !force && now - O.lastLiveAt < 15e3) return;
    O.lastLiveAt = now; O.lastLiveStr = state; O.lastBeatAt = now;
    await updateDoc(ref, Object.assign({playing: true, meta, stateAt: serverTimestamp(), updatedAt: serverTimestamp(), expireAt: new Date(now + 864e5)}, same ? {} : {state})).catch(() => {});
  } else if (force || now - O.lastBeatAt > LIVE_HEARTBEAT) {
    O.lastBeatAt = now;
    await updateDoc(ref, {playing: playing && !st.over, meta: {running: st.running, speed: st.speed, over: st.over}, updatedAt: serverTimestamp(), expireAt: new Date(now + 864e5)}).catch(() => {});
  }
}
setInterval(() => { pushLive(false); }, 1000);

function renderLiveCode() {
  const c = O.liveCode;
  $('live-code').textContent = c ? c.slice(0, 3) + ' ' + c.slice(3) : '\u2014';
  $('live-refresh').hidden = !isPerm();
  $('live-note').textContent = isPerm()
    ? 'Share this code so friends can watch you play. It stays the same every time until you make a new one.'
    : 'Share this code so friends can watch you play. Guests get a new code each time the game opens.';
}
$('live-copy').addEventListener('click', async () => {
  if (!O.liveCode) return;
  try { await navigator.clipboard.writeText(O.liveCode); API.toast('Live code copied', 'good'); } catch (e) { API.toast('Your code is ' + O.liveCode); }
});
$('live-refresh').addEventListener('click', async () => {
  if (!isPerm() || !confirm('Make a new live code? Anyone using your old one won\u2019t be able to watch any more.')) return;
  const old = O.liveCode;
  if (O.liveUnsub) { O.liveUnsub(); O.liveUnsub = null; }
  O.liveCode = null;
  if (old) await deleteDoc(doc(db, 'live', old)).catch(() => {});
  O.profile = Object.assign({}, O.profile, {liveCode: null});
  await setupLive(true);
  API.toast('New live code: ' + O.liveCode, 'good');
});

/* ---- watching someone else */
function openWatch() { $('menu').hidden = true; $('watch-err').textContent = ''; $('watch-code').value = ''; openM('m-watch'); setTimeout(() => $('watch-code').focus(), 50); }
$('btn-watch').addEventListener('click', openWatch);
$('btn-watch-s').addEventListener('click', openWatch);
$('watch-cancel').addEventListener('click', () => closeM('m-watch'));
$('watch-code').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });
$('watch-code').addEventListener('keydown', e => { if (e.key === 'Enter') $('watch-go').click(); });
async function tryWatch(code, errEl, btn) {
  if (!/^\d{6}$/.test(code)) { errEl.textContent = 'Live codes are 6 digits.'; return; }
  if (code === O.liveCode) { errEl.textContent = 'That\u2019s your own code.'; return; }
  btn.disabled = true;
  try {
    const s = await getDoc(doc(db, 'live', code));
    if (!s.exists()) { errEl.textContent = 'No player has that code right now.'; return; }
    const d = s.data();
    if (d.uid === O.user.uid) { errEl.textContent = 'That\u2019s your own code.'; return; }
    closeM('m-watch'); closeM('m-acct');
    startWatching(code, d);
  } catch (e) { errEl.textContent = 'Couldn\u2019t reach that player: ' + e.message; }
  finally { btn.disabled = false; }
}
$('watch-go').addEventListener('click', () => tryWatch($('watch-code').value, $('watch-err'), $('watch-go')));
$('acct-watch-go').addEventListener('click', () => tryWatch($('acct-watch-code').value, $('acct-watch-err'), $('acct-watch-go')));
$('acct-watch-code').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });
$('acct-watch-code').addEventListener('keydown', e => { if (e.key === 'Enter') $('acct-watch-go').click(); });

/* The shape of a city: anything that changes the roads or buildings. When it differs from the last
   snapshot we reload the whole city; otherwise we only patch the numbers so the traffic keeps moving. */
function layoutKey(d) {
  return JSON.stringify([d.span, d.water.length, d.road, d.links, d.sign, d.special, d.lights, d.oneway, d.parks, d.depots, d.motorways, d.juncLvl, d.keepLeft, d.perks, d.carsBought, d.diffKey,
    d.buildings.map(b => [b.k, b.sd, b.type, b.color, b.tier, b.lvl, b.trucks, b.vans, b.extra, b.ups])]);
}
function startWatching(code, first) {
  stopWatching(true);
  const st = API.state();
  if (st.started && !st.atMenu && !st.over && !st.spectating && !st.tutorialMode) {
    API.saveNow(); cloudSave(true);
    API.toast('Your city is saved' + (O.slot ? ' in slot ' + O.slot : '') + ' \u2014 open it again from Save files.', 'tip');
  }
  const S = O.spec = {code, name: first.name, star: first.star, ach3: first.ach3, key: '', unsub: null, ping: null, loaded: false, lastStateAt: 0};
  const bar = $('spec-bar'); bar.hidden = false;
  setSpecText('Connecting to ' + nameHTML(first.name, first.star, first.ach3) + '\u2026');
  const ping = () => updateDoc(doc(db, 'live', code), {watchT: serverTimestamp()}).catch(() => {});
  ping(); S.ping = setInterval(ping, WATCH_PING);
  S.unsub = onSnapshot(doc(db, 'live', code), snap => {
    if (O.spec !== S) return;
    if (!snap.exists()) { setSpecText(nameHTML(S.name, S.star, S.ach3) + ' has left.'); return; }
    const d = snap.data(); S.name = d.name; S.star = d.star; S.ach3 = d.ach3;
    const online = d.updatedAt && d.updatedAt.toMillis && Date.now() - d.updatedAt.toMillis() < 3 * LIVE_HEARTBEAT;
    if (!d.playing || !d.state) {
      setSpecText(nameHTML(d.name, d.star, d.ach3) + (d.meta && d.meta.over ? '\u2019s city just ended.' : online ? ' is on the menu \u2014 waiting for them to play\u2026' : ' isn\u2019t online right now.'));
      return;
    }
    let city = null; try { city = JSON.parse(d.state); } catch (e) { return; }
    const key = layoutKey(city);
    if (!S.loaded || key !== S.key) {
      if (!API.spectate.enter(city, d.meta, S.loaded)) { setSpecText('Couldn\u2019t show ' + nameHTML(d.name, d.star, d.ach3) + '\u2019s city.'); return; }
      S.loaded = true; S.key = key; API.awardAch('watcher');
    } else API.spectate.patch(city, d.meta);
    setSpecText('Watching <b>' + nameHTML(d.name, d.star, d.ach3) + '</b> live' + (d.meta && !d.meta.running ? ' \u00b7 paused' : '') + ' \u00b7 view only');
  }, e => setSpecText('Lost connection: ' + esc(e.message)));
}
function setSpecText(html) { $('spec-text').innerHTML = html; }
function stopWatching(silent) {
  const S = O.spec; if (!S) return;
  if (S.unsub) S.unsub(); if (S.ping) clearInterval(S.ping);
  O.spec = null; $('spec-bar').hidden = true;
  if (!silent) API.showStart();
}
$('spec-exit').addEventListener('click', () => stopWatching(false));

/* ============================================================== FEEDBACK */
/* ============================================================ PLAYERS
   Tap a player on a leaderboard (or a friend's Profile): their records, whether they're playing right now
   (watch them), and buttons to message, add or challenge them. */
async function openPlayer(uid, name) {
  if (!O.ready || !O.user) return;
  $('pl-name').innerHTML = esc(name || 'Player'); $('pl-av').textContent = String(name || '?').charAt(0).toUpperCase();
  $('pl-sub').textContent = uid === O.user.uid ? 'This is you.' : '';
  $('pl-live').innerHTML = '<p class="mini">Checking whether they\u2019re playing\u2026</p>';
  $('pl-rec').innerHTML = '<p class="mini">Loading\u2026</p>';
  const me = uid === O.user.uid;
  const btns = () => {
    $('pl-btns').innerHTML = me ? '' : '<button class="bigbtn" type="button" id="pl-chal">Challenge</button><button class="bigbtn ghost" type="button" id="pl-msg">Message</button>' +
      (isFriend(uid) ? '<span class="mini pl-fr">\u2713 Friends</span>' : '<button class="bigbtn ghost" type="button" id="pl-add">Add friend</button>');
    if (me) return;
    $('pl-chal').onclick = () => { closeM('m-player'); openChallenge(uid, name); };
    $('pl-msg').onclick = () => { closeM('m-player'); closeM('m-board'); openThread(uid, name); };
    const add = $('pl-add'); if (add) add.onclick = async () => { const err = await addFriend(uid, name); API.toast(err || name + ' is now your friend', err ? 'warn' : 'good'); btns(); };
  };
  btns();
  openM('m-player');
  loadFriends().then(btns);
  friendRecordsOf(uid).then(r => { if (!$('m-player').hidden) $('pl-rec').innerHTML = recordsHTML(r); });
  try {
    const p = await getDoc(doc(db, 'profiles', uid)), code = p.exists() ? p.data().live : null;
    const l = code ? await getDoc(doc(db, 'live', code)) : null, d = l && l.exists() ? l.data() : null;
    const fresh = d && d.updatedAt && d.updatedAt.toMillis && Date.now() - d.updatedAt.toMillis() < 3 * LIVE_HEARTBEAT;
    if (d && d.playing && fresh && !me) {
      $('pl-live').innerHTML = '<div class="pl-on"><i></i><span><b>Playing now</b><small>' + (d.meta && d.meta.running === false ? 'paused' : 'their city is running') + '</small></span><button class="bigbtn" type="button" id="pl-watch">Watch live</button></div>';
      $('pl-watch').onclick = () => { closeM('m-player'); closeM('m-board'); startWatching(code, d); };
    } else $('pl-live').innerHTML = '<p class="mini">' + (me ? 'Your own records.' : fresh ? 'Online, on the menu.' : 'Not playing right now.') + '</p>';
  } catch (e) { $('pl-live').innerHTML = '<p class="mini">Couldn\u2019t check whether they\u2019re playing.</p>'; }
}
$('pl-close').addEventListener('click', () => closeM('m-player'));

/* ============================================================ ISO 1v1
   challenges/{id}: {from, fromName, to, toName, kind 'live'|'daily', seed, status, createdAt, expiresAt,
   acceptedAt, ready {uid: true}, startAt, ctl {paused, speed, v}, prop {by, what}, res {uid: stats}, winner, reason, endedAt}
   challenges/{id}/live/{uid}: during a live match, each player's city (compact) and numbers every few seconds. */
const ISO_CATS = [
  ['sec', 'Time survived', v => mmss(v)], ['parcels', 'Parcels delivered', v => (v || 0).toLocaleString()], ['earned', 'Money earned', v => money(v || 0)],
  ['trips', 'Trips made', v => (v || 0).toLocaleString()], ['tows', 'Fewest tow trucks', v => v || 0, true]
];
const LIVE_PUSH = 3e3, LIVE_GONE = 60e3;
O.chals = {}; O.iso = null; let chalUnsubs = [], chalWith = null;
const chalRef = id => doc(db, 'challenges', id);
const meOf = d => d.from === O.user.uid ? 'from' : 'to', oppOf = d => d.from === O.user.uid ? {uid: d.to, name: d.toName} : {uid: d.from, name: d.fromName};
const tms = t => t && t.toMillis ? t.toMillis() : 0;
function startChallenges() {
  if (!O.user || O.chalUid === O.user.uid) return;
  O.chalUid = O.user.uid; chalUnsubs.forEach(u => u()); chalUnsubs = []; O.chals = {};
  for (const f of ['to', 'from']) chalUnsubs.push(onSnapshot(query(collection(db, 'challenges'), where(f, '==', O.user.uid), limit(60)), snap => {
    snap.docChanges().forEach(ch => {
      const d = Object.assign({id: ch.doc.id}, ch.doc.data()), old = O.chals[d.id];
      if (ch.type === 'removed') { delete O.chals[d.id]; return; }
      O.chals[d.id] = d; onChal(d, old);
    });
    API.setIsoPending(Object.values(O.chals).filter(d => d.to === O.user.uid && d.status === 'pending' && tms(d.expiresAt) > Date.now()).length);
    if (isoBox) renderIso();
  }, e => console.warn('Challenges unavailable', e)));
}
/* react to a challenge changing: new ones, answers, the live start, asks, and the result */
function onChal(d, old) {
  const me = O.user.uid, opp = oppOf(d), kind = d.kind === 'live' ? 'live' : 'daily';
  if (!old && d.to === me && d.status === 'pending' && tms(d.createdAt) > Date.now() - 6e5) API.toast(d.fromName + ' challenged you to a ' + kind + ' ISO match \u2014 open Play \u2192 ISO 1v1', 'good');
  if (old && old.status === 'pending' && d.status === 'accepted' && d.from === me) API.toast(d.toName + ' accepted your ' + kind + ' challenge' + (kind === 'live' ? ' \u2014 press Ready in Play \u2192 ISO 1v1' : ''), 'good');
  if (old && old.status === 'pending' && d.status === 'declined' && d.from === me) API.toast(d.toName + ' declined your challenge', 'warn');
  if (kind === 'live' && d.status === 'accepted') {
    const rd = d.ready || {};
    if (rd[d.from] && rd[d.to] && !d.startAt && d.from === me) runTransaction(db, async tx => {        // both ready: the challenger sets the start, a few seconds ahead
      const x = await tx.get(chalRef(d.id)); if (!x.exists() || x.data().startAt) return;
      tx.update(chalRef(d.id), {startAt: Timestamp.fromMillis(Date.now() + 5000), ctl: {paused: false, speed: 1, v: 0}});
    }).catch(e => console.warn(e));
    if (d.startAt && !(O.iso && O.iso.id === d.id) && !O.isoStarting && Date.now() - tms(d.startAt) < 20e3) {
      O.isoStarting = d.id; const wait = Math.max(0, tms(d.startAt) - Date.now());
      API.toast('Live match against ' + opp.name + ' starts in ' + Math.ceil(wait / 1000) + '\u2026', 'tip');
      setTimeout(() => { O.isoStarting = null; beginMatch(O.chals[d.id] || d); }, wait);
    }
  }
  if (O.iso && O.iso.id === d.id) {
    const p = d.prop && d.prop.what ? {what: d.prop.what, mine: d.prop.by === me} : null;
    API.isoProp(p);
    if (d.ctl && (!old || !old.ctl || old.ctl.v !== d.ctl.v) && d.ctl.v > 0) API.isoControl(d.ctl);
  }
  if (d.status === 'accepted' && kind === 'daily') {
    const res = d.res || {};
    if (res[d.from] && res[d.to]) finishMatch(d, null);
    else if (tms(d.expiresAt) && Date.now() > tms(d.expiresAt)) finishMatch(d, res[d.from] ? d.from : res[d.to] ? d.to : 'none', 'Time ran out before both runs were in.');
  }
  if (d.status === 'done' && old && old.status !== 'done') showMatchResult(d);
}
function beginMatch(d) {
  if (!O.ready) return;
  O.slot = null; O.lastSaveStr = '';
  const opp = oppOf(d);
  O.iso = {id: d.id, kind: d.kind, opp, oppAt: Date.now(), done: false};
  API.startIso({id: d.id, kind: d.kind, seed: d.seed, opp, endsAt: d.kind === 'daily' ? tms(d.expiresAt) : 0});
  if (d.kind !== 'live') return;
  pushMatch(true);
  O.iso.push = setInterval(() => pushMatch(false), LIVE_PUSH);
  O.iso.unsub = onSnapshot(doc(db, 'challenges', d.id, 'live', opp.uid), x => {
    if (!O.iso || O.iso.id !== d.id) return;
    const v = x.data(); if (!v) return;
    O.iso.oppAt = Date.now(); API.isoNote('');
    API.isoOpp({city: v.city, sec: v.sec, parcels: v.parcels, week: v.week, earned: v.earned, over: v.over});
    O.iso.lastOpp = {sec: v.sec, parcels: v.parcels, earned: v.earned, trips: v.trips, tows: v.tows};
    if (v.over && !O.iso.done) { const st = API.state(); if (!st.over) finishMatch(O.chals[d.id] || d, O.user.uid, opp.name + '\u2019s city ended first.'); }
  }, () => {});
  O.iso.watch = setInterval(() => {                     // an opponent who's gone quiet
    if (!O.iso || O.iso.done) return;
    const gone = Date.now() - O.iso.oppAt;
    if (gone > LIVE_GONE * 2) finishMatch(O.chals[d.id] || d, O.user.uid, opp.name + ' left the match.');
    else if (gone > LIVE_GONE) API.isoNote(opp.name + ' seems to have lost connection\u2026');
  }, 5000);
}
const myStats = () => { const st = API.state(); return {sec: Math.floor(st.clock || 0), parcels: st.score || 0, earned: Math.floor(st.earned || 0), trips: st.trips || 0, tows: st.tows || 0, week: st.week || 1}; };
async function pushMatch(force) {
  const M = O.iso; if (!M || M.kind !== 'live' || M.done) return;
  const st = API.state(); if (!st.started || st.spectating) return;
  const v = Object.assign(myStats(), {city: API.citySnap(), over: !!st.over, at: serverTimestamp()});
  if (v.city.length > 300000) v.city = '';
  await setDoc(doc(db, 'challenges', M.id, 'live', O.user.uid), v).catch(e => console.warn('Match update failed', e));
}
function stopMatch() {
  const M = O.iso; if (!M) return;
  if (M.push) clearInterval(M.push); if (M.watch) clearInterval(M.watch); if (M.unsub) M.unsub();
  M.done = true;
}
/* my city ended (game over, finished, or left) */
async function isoOver() {
  const M = O.iso; if (!M || M.done) return;
  const d = O.chals[M.id]; if (!d) return;
  if (M.kind === 'live') { await pushMatch(true); finishMatch(d, oppOf(d).uid, myName() + '\u2019s city ended first.'); return; }
  stopMatch();
  await updateDoc(chalRef(d.id), {['res.' + O.user.uid]: myStats()}).catch(e => API.toast('Couldn\u2019t submit your run: ' + e.message, 'warn'));
  API.toast('Run submitted. ' + (d.res && d.res[oppOf(d).uid] ? '' : 'Waiting for ' + oppOf(d).name + '\u2019s run.'), 'good');
}
/* settle a match (once, whoever gets there first): live by who lasted, daily by categories */
function scoreDaily(a, b) {
  const rows = ISO_CATS.map(([k, label, fmt, low]) => {
    const x = a[k] || 0, y = b[k] || 0, win = x === y ? '' : (low ? x < y : x > y) ? 'a' : 'b';
    return {k, label, fmt, x, y, win};
  });
  return {rows, pa: rows.filter(r => r.win === 'a').length, pb: rows.filter(r => r.win === 'b').length};
}
async function finishMatch(d, winner, reason) {
  if (O.finishing === d.id) return; O.finishing = d.id;
  if (O.iso && O.iso.id === d.id) stopMatch();
  try {
    await runTransaction(db, async tx => {
      const x = await tx.get(chalRef(d.id)); if (!x.exists()) return;
      const cur = x.data(); if (cur.status === 'done') return;
      let w = winner, why = reason || '';
      const res = cur.res || {};
      if (!w) { const sc = scoreDaily(res[cur.from] || {}, res[cur.to] || {}); w = sc.pa === sc.pb ? 'draw' : sc.pa > sc.pb ? cur.from : cur.to; why = 'Points ' + Math.max(sc.pa, sc.pb) + '\u2013' + Math.min(sc.pa, sc.pb) + '.'; }
      const up = {status: 'done', winner: w, reason: why, endedAt: serverTimestamp()};
      if (cur.kind === 'live' && !res[O.user.uid]) up['res.' + O.user.uid] = myStats();
      tx.update(chalRef(d.id), up);
    });
  } catch (e) { console.warn('Settling the match failed', e); }
  O.finishing = null;
}
function showMatchResult(d) {
  const me = O.user.uid, opp = oppOf(d), res = d.res || {}, a = res[me] || (O.iso && O.iso.id === d.id ? myStats() : {});
  const b = res[opp.uid] || (O.iso && O.iso.id === d.id && O.iso.lastOpp) || null;
  const sc = scoreDaily(a, b || {});
  const outcome = d.winner === 'draw' || d.winner === 'none' ? 'draw' : d.winner === me ? 'win' : 'lose';
  const mine = myName(), why = String(d.reason || '').replace(mine + '\u2019s city', 'Your city').replace(mine + ' left', 'You left');
  API.showIsoResult({kind: d.kind, oppName: opp.name, outcome, reason: why,
    rows: sc.rows.map(r => ({label: r.label, me: r.fmt(r.x), them: b ? r.fmt(r.y) : '\u2014', win: r.win === 'a' ? 'me' : r.win === 'b' ? 'them' : ''})),
    points: d.kind === 'daily' ? [sc.pa, sc.pb] : null});
  chalWith = opp;
  if (O.iso && O.iso.id === d.id && d.kind === 'live') { const st = API.state(); if (!st.over && d.winner === me) API.isoNote('You won! Keep building, or head back to the menu.'); }
}
API.events.on('isoRematch', () => { if (chalWith) openChallenge(chalWith.uid, chalWith.name); });
API.events.on('isoAsk', e => {
  const M = O.iso; if (!M) return;
  updateDoc(chalRef(M.id), {prop: {by: O.user.uid, what: e.what}}).catch(err => API.toast('Couldn\u2019t ask: ' + err.message, 'warn'));
  API.isoProp({what: e.what, mine: true});
});
API.events.on('isoReply', e => {
  const M = O.iso, d = M && O.chals[M.id]; if (!d || !d.prop) return;
  const what = d.prop.what, c = Object.assign({paused: false, speed: 1, v: 0}, d.ctl || {});
  if (!e.ok) { updateDoc(chalRef(d.id), {prop: null}).catch(() => {}); return; }
  if (what === 'pause') c.paused = true; else if (what === 'resume') c.paused = false;
  else if (/^speed:/.test(what)) { c.speed = +what.slice(6) || 1; c.paused = false; }
  c.v = (c.v || 0) + 1;
  updateDoc(chalRef(d.id), {prop: null, ctl: c}).catch(err => API.toast('Couldn\u2019t answer: ' + err.message, 'warn'));
});
/* sending and answering */
function openChallenge(uid, name) {
  if (!O.ready || !O.user) { API.toast('Online features are still connecting \u2014 try again in a moment.', 'warn'); return; }
  if (!O.profile || !O.profile.name) { openUserModal(); return; }
  if (uid === O.user.uid) return;
  chalWith = {uid, name}; $('ch-name').textContent = name || 'them'; $('ch-err').textContent = '';
  openM('m-chal');
}
document.querySelectorAll('#m-chal .chal-opt').forEach(b => b.addEventListener('click', async () => {
  if (!chalWith) return;
  const err = await sendChallenge(chalWith.uid, chalWith.name, b.dataset.kind);
  if (err) { $('ch-err').textContent = err; return; }
  closeM('m-chal'); API.toast('Challenge sent to ' + chalWith.name + (b.dataset.kind === 'live' ? ' \u2014 when they accept, press Ready' : ''), 'good');
}));
$('ch-cancel').addEventListener('click', () => closeM('m-chal'));
$('ir-close').addEventListener('click', () => closeM('m-iso-res'));
async function sendChallenge(uid, name, kind) {
  if (Object.values(O.chals).some(d => d.from === O.user.uid && d.to === uid && (d.status === 'pending' || d.status === 'accepted') && tms(d.expiresAt) > Date.now()))
    return 'You already have a challenge open with ' + name + '.';
  try {
    await addDoc(collection(db, 'challenges'), {from: O.user.uid, fromName: myName(), to: uid, toName: String(name || 'Player').slice(0, 16), kind: kind === 'live' ? 'live' : 'daily',
      seed: Math.floor(Math.random() * 2147483647), status: 'pending', createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 864e5)});
    return '';
  } catch (e) { return 'Couldn\u2019t send the challenge: ' + e.message; }
}
async function answerChal(d, act) {
  const ref = chalRef(d.id);
  try {
    if (act === 'accept') await updateDoc(ref, Object.assign({status: 'accepted', acceptedAt: serverTimestamp()},
      d.kind === 'live' ? {['ready.' + O.user.uid]: true, expiresAt: Timestamp.fromMillis(Date.now() + 15 * 60e3)} : {expiresAt: Timestamp.fromMillis(Date.now() + 864e5)}));
    else if (act === 'decline') await updateDoc(ref, {status: 'declined'});
    else if (act === 'cancel') await updateDoc(ref, {status: 'cancelled'});
    else if (act === 'ready') await updateDoc(ref, {['ready.' + O.user.uid]: true});
    else if (act === 'play') beginMatch(d);
    else if (act === 'result') showMatchResult(d);
    else if (act === 'remove') await deleteDoc(ref);
  } catch (e) { API.toast('Couldn\u2019t do that: ' + e.message, 'warn'); }
}
/* the ISO 1v1 page in Play: challenges waiting, going, and done, and who to challenge */
let isoBox = null;
async function renderIso(box) {
  isoBox = box || isoBox; if (!isoBox || !isoBox.isConnected) { isoBox = null; return; }
  if (slotsBox === isoBox) slotsBox = null;            // and not save slots, which may still be loading
  if (!O.profile || !O.profile.name) { isoBox.innerHTML = '<p class="mini">Pick a username first, then you can challenge players.</p>'; return; }
  const me = O.user.uid, now = Date.now();
  const list = Object.values(O.chals).sort((a, b) => tms(b.createdAt) - tms(a.createdAt));
  const line = d => {
    const opp = oppOf(d), mine = d.from === me, kind = d.kind === 'live' ? 'Live' : 'Daily', exp = tms(d.expiresAt), rd = d.ready || {};
    let st = '', acts = [];
    if (d.status === 'pending') {
      if (exp && now > exp) { st = 'Expired'; acts = [['remove', 'Clear']]; }
      else if (mine) { st = 'Waiting for ' + esc(opp.name) + ' to accept'; acts = [['cancel', 'Cancel']]; }
      else { st = esc(opp.name) + ' challenged you'; acts = [['accept', 'Accept'], ['decline', 'Decline']]; }
    } else if (d.status === 'accepted') {
      if (d.kind === 'live') {
        if (exp && now > exp && !d.startAt) { st = 'Expired'; acts = [['remove', 'Clear']]; }
        else if (d.startAt) st = 'Starting\u2026';
        else if (!rd[me]) { st = esc(opp.name) + ' is ready'; acts = [['ready', 'Ready']]; }
        else st = 'Waiting for ' + esc(opp.name) + ' to be ready';
      } else {
        const res = d.res || {}, left = exp - now;
        if (res[me]) st = 'Your run is in \u00b7 waiting for ' + esc(opp.name);
        else { st = (left > 0 ? fmtLeftMs(left) + ' left to play' : 'Time\u2019s up'); if (left > 0) acts = [['play', 'Play your run']]; }
      }
    } else if (d.status === 'done') {
      const w = d.winner === me ? 'Won' : d.winner === 'draw' || d.winner === 'none' ? 'Draw' : 'Lost';
      st = '<b class="iso-' + w.toLowerCase() + '">' + w + '</b>' + (d.reason ? ' \u00b7 ' + esc(d.reason) : ''); acts = [['result', 'Result'], ['remove', 'Clear']];
    } else { st = d.status === 'declined' ? 'Declined' : 'Cancelled'; acts = [['remove', 'Clear']]; }
    return '<div class="iso-row"><span class="av">' + esc(String(opp.name || '?').charAt(0).toUpperCase()) + '</span><span class="iso-who"><b>' + esc(opp.name) + '</b><em class="iso-kind k-' + d.kind + '">' + kind + '</em><small>' + st + '</small></span>' +
      '<span class="iso-acts">' + acts.map(([a, l]) => '<button type="button" class="' + (a === 'accept' || a === 'ready' || a === 'play' ? 'bigbtn' : 'act') + ' small" data-ch="' + esc(d.id) + '" data-act="' + a + '">' + l + '</button>').join('') + '</span></div>';
  };
  const friends = await loadFriends();
  if (!isoBox) return;
  isoBox.innerHTML = '<div class="iso-intro"><p><b>Live</b> \u2014 play side by side, right now. Same speed for both of you; pausing or speeding up needs you both to agree. The last city standing wins.</p>' +
      '<p><b>Daily</b> \u2014 each of you plays the same map within 24 hours, pausing and speeding up as you like. A point for each category you win: time survived, parcels, money, trips and fewest tow trucks.</p></div>' +
    '<h3>Your challenges</h3>' + (list.length ? list.map(line).join('') : '<p class="mini">None yet. Challenge a friend below, or tap a player on any leaderboard.</p>') +
    '<h3>Challenge someone</h3><div class="fradd"><input id="iso-name" type="text" maxlength="16" placeholder="Their username" autocomplete="off" spellcheck="false"><button class="bigbtn" id="iso-go" type="button">Challenge</button></div><p class="formerr" id="iso-err" role="alert"></p>' +
    (friends.length ? '<div class="iso-friends">' + friends.map(f => '<button type="button" class="act" data-chf="' + esc(f.uid) + '" data-name="' + esc(f.name) + '">' + esc(f.name) + '</button>').join('') + '</div>' : '');
  isoBox.querySelectorAll('[data-ch]').forEach(b => b.onclick = () => { const d = O.chals[b.dataset.ch]; if (d) answerChal(d, b.dataset.act); });
  isoBox.querySelectorAll('[data-chf]').forEach(b => b.onclick = () => openChallenge(b.dataset.chf, b.dataset.name));
  const go = async () => {
    const n = $('iso-name').value.trim(); $('iso-err').textContent = '';
    if (!NAME_RE.test(n)) { $('iso-err').textContent = 'Usernames are 3\u201316 letters, numbers, _ or -.'; return; }
    try {
      const u = await getDoc(nameRef(n.toLowerCase()));
      if (!u.exists()) { $('iso-err').textContent = 'No player called ' + n + '.'; return; }
      if (u.data().uid === O.user.uid) { $('iso-err').textContent = 'That\u2019s you.'; return; }
      openChallenge(u.data().uid, n);
    } catch (e) { $('iso-err').textContent = e.message; }
  };
  $('iso-go').onclick = go; $('iso-name').onkeydown = e => { if (e.key === 'Enter') go(); };
}
const fmtLeftMs = ms => { const m = Math.ceil(ms / 60000); return m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + 'm'; };
setInterval(() => { if (isoBox && isoBox.isConnected && Object.keys(O.chals).length) renderIso(); }, 30e3);

const FB_CATS = {Bug: 'bugs', Idea: 'ideas', Other: 'other'};
// Web app URL from Apps Script → Deploy → New deployment (see apps-script/Code.gs).
const FEEDBACK_MAIL_URL = 'https://script.google.com/macros/s/AKfycbx3beH9XQi7sGw5iYKYAeaWpJKJ80vqdtUqpTop6ngbQ4eRS9vH_XYHHAKi0HgJTo-M/exec';
async function emailFeedback(payload) {
  const idToken = await O.user.getIdToken();
  let r;
  try {
    // text/plain keeps this a "simple" request, so the browser doesn't need a CORS preflight
    const res = await fetch(FEEDBACK_MAIL_URL, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'},
      body: JSON.stringify(Object.assign({idToken}, payload))});
    r = await res.json();
  } catch (e) { throw Object.assign(new Error('network'), {userMessage: 'Couldn\u2019t reach support just now. Try again in a minute.'}); }
  if (!r || !r.ok) throw Object.assign(new Error('rejected'), {userMessage: (r && r.error) || 'Couldn\u2019t send that just now.'});
}
const hasEmailAccount = () => isPerm() && !!O.user.email;
function feedbackIdentity() { return {account: hasEmailAccount(), email: hasEmailAccount() ? O.user.email : ''}; }
async function sendFeedback({kind, message, details, replyTo}) {
  if (!O.user) throw Object.assign(new Error('offline'), {userMessage: 'You look offline. Check your connection.'});
  const category = FB_CATS[kind] || 'other';
  message = String(message || '').slice(0, 1500);
  details = String(details || '').slice(0, 1900);
  if (hasEmailAccount()) {
    await emailFeedback({category, message, details, name: myName()});
    return 'email';
  }
  const data = {uid: O.user.uid, message, createdAt: serverTimestamp()};
  if (details) data.details = details;
  if (replyTo) data.replyTo = String(replyTo).slice(0, 254);
  if (O.profile && O.profile.name) data.name = O.profile.name;
  await addDoc(collection(db, 'feedback', category, 'entries'), data);
  return 'firestore';
}

/* public surface used by game.js */
window.JunctionOnline = {
  get ready() { return O.ready && !!(O.profile && O.profile.name); },
  get feedbackReady() { return !!O.user; },
  openSaves, openBoard, openWatch, sendFeedback, feedbackIdentity,
  renderSlots(box, mode, tabs) { if (!O.ready) return false; renderSlots(box, mode, tabs); return true; },
  renderFriends(box) { renderFriends(box); },
  expertTop(ago, n) { return expertTop(ago, n); },
  openRun(ago, uid) { openRun(API.expertSeed(ago || 0).key, uid); },
  renderIso(box) { if (!O.ready) return false; renderIso(box); return true; },
  openPlayer(uid, name) { openPlayer(uid, name); }, openChallenge(uid, name) { openChallenge(uid, name); },
  openExpert(ago) { if (!O.ready) { API.toast('Online features are still connecting \u2014 try again in a moment.', 'warn'); return; } openExpert(ago); }
};
