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
  onSnapshot, runTransaction, serverTimestamp, deleteField, addDoc, where, Timestamp, increment, arrayUnion
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
/* Words we don't allow in names, chats or challenges. Letters can be swapped for look-alikes (4 for a, 3 for e, $ for s...)
   and padded with dots, dashes or underscores: the text is normalised before it's checked. Refused with a friendly note. */
const BAD_WORDS = ['fuck', 'fuk', 'shit', 'bitch', 'cunt', 'twat', 'wanker', 'dick', 'cock', 'pussy', 'asshole', 'arsehole', 'bastard', 'slut', 'whore', 'fag', 'faggot', 'nigger', 'nigga', 'retard', 'spastic', 'spaz', 'kike', 'chink', 'paki', 'tranny', 'rapist', 'rape', 'nazi', 'hitler', 'kys', 'pedo', 'paedo', 'porn', 'cum', 'jizz', 'anal', 'dildo', 'penis', 'vagina', 'boob', 'tits', 'motherfucker', 'bollocks', 'prick', 'douche', 'bugger', 'piss', 'wank', 'blowjob', 'handjob', 'nonce', 'molest'];
const LEET = {'4': 'a', '@': 'a', '3': 'e', '1': 'i', '!': 'i', '|': 'i', '0': 'o', '5': 's', '$': 's', '7': 't', '+': 't', '9': 'g', '6': 'g', '8': 'b', '2': 'z'};
const normText = t => String(t || '').toLowerCase().replace(/[4@31!|05$7+9682]/g, c => LEET[c] || c).replace(/[^a-z]/g, '');
const BAD_RE = new RegExp(BAD_WORDS.map(w => w.replace(/(.)/g, '$1+')).join('|'));                 // letters may repeat (fuuuck)
const SAFE_OK = ['assassin', 'bass', 'class', 'glass', 'grass', 'pass', 'mass', 'brass', 'cocktail', 'peacock', 'hancock', 'scunthorpe', 'dickens', 'analysis', 'analyst', 'canal', 'cumulus', 'document', 'circumstance', 'shitake', 'titan', 'title', 'cumbria'];
function textOk(t) {
  const n = normText(t); if (!n) return true;
  let m = n; for (const ok of SAFE_OK) m = m.split(ok).join('');
  return !BAD_RE.test(m);
}
const RUDE_NAME = 'That name has words we don\u2019t allow. Pick something friendlier.';
const RUDE_MSG = 'That message has words we don\u2019t allow. Keep it friendly.';
const SLOTS = ['1', '2', '3', '4', '5'];            // the old shared slots, moved into per-mode slots on sign-in
const SAVE_MODES = ['chill', 'standard', 'frantic', 'zen', 'haunted', 'expert'];
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
function nameHTML(name, star, ach3, look) {
  const t = look && look.title ? API.titleOf(look.title) : '';
  const tt = t ? ' <em class="ptitle">' + esc(t) + '</em>' : '';
  if (ach3) return esc(name) + ' <span class="star star3" title="Unlocked every achievement">\u2605\u2605\u2605</span>' + tt;
  return esc(name) + (star ? ' <span class="star" title="Permanent account">\u2605</span>' : '') + tt;
}
/* another player's look (banner, frame, title, pins), cached from profiles/{uid} */
O.looks = {};
async function lookOf(uid) {
  if (O.looks[uid] && Date.now() - O.looks[uid].at < 300e3) return O.looks[uid];
  try { const p = await getDoc(doc(db, 'profiles', uid)); const d = p.exists() ? p.data() : {}; O.looks[uid] = {banner: d.banner || '', frame: d.frame || '', title: d.title || '', pins: Array.isArray(d.pins) ? d.pins : [], flag: d.flag || '', at: Date.now()}; }
  catch (e) { O.looks[uid] = {banner: '', frame: '', title: '', pins: [], at: Date.now()}; }
  return O.looks[uid];
}
const avStyle = (uid, look) => 'background:' + avColour(uid) + (look && look.frame ? ';--fr:' + API.frameCSS(look.frame) : '');
const avClass = look => 'av' + (look && look.frame ? ' f-' + look.frame : '');
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
  if (!textOk(name)) throw new Error(RUDE_NAME);
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
  if (!textOk(name)) throw new Error(RUDE_NAME);
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
  startInbox(); startChallenges(); loadBlocked(); migrateLegacySaves();
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
  const perm = isPerm(), name = myName(), pv = providers(), look = API.prof();
  $('acct-av').textContent = name.charAt(0).toUpperCase();
  $('acct-av').className = 'acct-av' + (look.frame ? ' f-' + look.frame : ''); $('acct-av').style.cssText = look.frame ? '--fr:' + API.frameCSS(look.frame) : '';
  $('acct-banner').style.background = API.bannerCSS(look.banner);
  $('acct-name').innerHTML = nameHTML(name, perm, myAch3(), look);
  renderLookPicker();
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
  if (acctPane === 'profile') renderBlockedList();
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
  loadShopCloud();
}
/* B1: coins, owned items, the look you wear, your streak and quests follow your account */
const shopRef = uid => doc(db, 'users', uid, 'stats', 'shop');
let shopPushAt = 0, shopLoaded = false;
async function loadShopCloud() {
  if (!O.user) return;
  try { const s = await getDoc(shopRef(O.user.uid)); if (s.exists()) API.mergeShop(s.data()); } catch (e) { console.warn('Shop load failed', e); }
  shopLoaded = true; pushShop(true);
}
async function pushShop(force) {
  if (!shopLoaded || !O.user) return;
  if (!force && Date.now() - shopPushAt < 30e3) return;
  shopPushAt = Date.now();
  try { await setDoc(shopRef(O.user.uid), Object.assign(API.shopSnapshot(), {updatedAt: serverTimestamp()})); } catch (e) { console.warn('Shop sync failed', e); }
}
API.events.on('shop', () => pushShop(false));
API.events.on('prof', () => { pushShop(true); pushProfile(); if (!$('m-acct').hidden) renderAcct(); });
window.addEventListener('pagehide', () => { pushShop(true); });
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
    if (d && d.data && !d.over && !(await API.ask({title: 'Replace this city?', text: API.diffLabel(mode) + ' slot ' + n + ' holds a week ' + d.week + ' city with ' + d.score + ' parcels. A new one will take its place.', ok: 'Replace', danger: true}))) return;
    O.slot = id; O.lastSaveStr = '';
    API.startCity(mode);
    setTimeout(() => cloudSave(true), 400);
  } else if (act === 'del') {
    if (!(await API.ask({title: 'Delete this save?', text: API.diffLabel(mode) + ' slot ' + n + ' will be emptied. This can\u2019t be undone.', ok: 'Delete', danger: true}))) return;
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
const MODES = ['chill', 'standard', 'frantic', 'zen', 'haunted'];
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
    await setDoc(boardRef(mode, O.user.uid), Object.assign({name: myName(), star: isPerm(), ach3: myAch3(), title: API.prof().title || '', frame: API.prof().frame || '', updatedAt: serverTimestamp()}, up), {merge: true});
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
      rows.push('<li class="click' + (me ? ' me' : '') + '" data-player="' + esc(s.id) + '" data-name="' + esc(d.name || '') + '" tabindex="0"><span class="rank">' + (rows.length + 1) + '</span><span class="who">' + nameHTML(d.name || '?', d.star, d.ach3, d) +
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
  const data = {name: myName(), star: isPerm(), ach3: myAch3(), title: API.prof().title || '', frame: API.prof().frame || '', parcels: Math.floor(st.score || 0), weeks: Math.floor(st.week || 0), earned: Math.floor(st.earned || 0),
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
      rows.push('<li class="click' + (me ? ' me' : '') + '" data-run="' + x.id + '" tabindex="0"><span class="rank">' + (rows.length + 1) + '</span><span class="who">' + nameHTML(d.name || '?', d.star, d.ach3, d) +
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
$('run-share').addEventListener('click', () => {
  if (!runOf) return;
  const d = expertRows[runOf.uid] || {}, pic = $('run-map'), mine = O.user && runOf.uid === O.user.uid;
  const c = API.makeShareCard({pic: d.city ? pic : null, kicker: 'Expert Survival · seed ' + (d.seedName || ''), big: (d.parcels || 0).toLocaleString(), bigLabel: 'parcels delivered',
    title: (mine ? 'My run' : (d.name || 'A player') + '’s run') + ' · week ' + (d.weeks || 0),
    stats: [['Weeks', d.weeks || 0], ['Earned', money(d.earned || 0)], ['Trips', d.trips || 0], ['Cars', d.cars || 0], ['Roads', d.roads || 0], ['Played', hm(d.playSec || 0)]], line: 'Same seed, same map. Can you beat it?'});
  API.shareCanvas(c, 'junction-weekly-' + (d.seedCode || 'run'), (mine ? 'My' : (d.name || 'A player') + '’s') + ' Expert Survival run on Junction: ' + (d.parcels || 0) + ' parcels on seed ' + (d.seedName || '') + '.');
});
$('run-chal').addEventListener('click', () => { if (runOf) openChallenge(runOf.uid, runOf.name); });
$('run-friend').addEventListener('click', async () => { if (!runOf) return; const err = await addFriend(runOf.uid, runOf.name); API.toast(err || runOf.name + ' is now your friend \u2014 find them under Chats on the main menu.', err ? 'warn' : 'good'); renderRunFriend(); });
function renderRunFriend() { const b = $('run-friend'); if (!b || !runOf) return; const f = isFriend(runOf.uid); b.hidden = !O.user || runOf.uid === O.user.uid || f; }
$('run-msg').addEventListener('click', () => { if (!runOf) return; closeM('m-run'); closeM('m-board'); openThread(runOf.uid, runOf.name); });

/* ============================================================ MESSAGES
   messages/{id}: {from, fromName, to, toName, text, at, read}. Each player listens for messages sent to them;
   what they've sent is fetched when they open a conversation. Rules let only the two people involved read one. */
O.inbox = []; O.sent = []; O.msgUid = null; let msgWith = null, msgUnsub = null, sentUnsub = null;
const msAt = m => (m.at && m.at.toMillis) ? m.at.toMillis() : (m.localAt || Date.now());
function startInbox() {
  if (!O.user || O.msgUid === O.user.uid) return;
  O.msgUid = O.user.uid; if (msgUnsub) msgUnsub();
  msgUnsub = onSnapshot(query(collection(db, 'messages'), where('to', '==', O.user.uid), limit(200)), snap => {
    O.inbox = snap.docs.map(x => Object.assign({id: x.id}, x.data()));
    updateMsgBadge();
    if (!$('m-acct').hidden && acctPane === 'msgs') renderMsgs();
    if (chatBox) renderChats();
  }, e => console.warn('Inbox unavailable', e));
  if (sentUnsub) sentUnsub();
  sentUnsub = onSnapshot(query(collection(db, 'messages'), where('from', '==', O.user.uid), limit(200)), snap => {
    O.sent = snap.docs.map(x => Object.assign({id: x.id}, x.data(), x.metadata.hasPendingWrites && !x.data().at ? {localAt: Date.now()} : {}));
    if (chatBox) renderChats();
    if (!$('m-acct').hidden && acctPane === 'msgs') renderMsgs();
  }, e => console.warn('Sent messages unavailable', e));
}
async function loadSent() {
  try { const sn = await getDocs(query(collection(db, 'messages'), where('from', '==', O.user.uid), limit(200))); O.sent = sn.docs.map(x => Object.assign({id: x.id}, x.data())); }
  catch (e) { console.warn('Sent messages unavailable', e); }
}
function updateMsgBadge() {
  const n = O.inbox.filter(m => !m.read && !isHushed(m.from)).length, t = n > 99 ? '99+' : String(n);
  for (const id of ['msg-badge', 'msg-tabbadge']) { const el = $(id); if (el) { el.textContent = t; el.hidden = !n; } }
  document.querySelectorAll('.mm-chat-badge').forEach(el => { el.textContent = t; el.hidden = !n; });
}
function threadsList() {
  const by = {};
  for (const m of O.inbox) { if (isBlocked(m.from)) continue; const t = by[m.from] || (by[m.from] = {uid: m.from, name: m.fromName, last: null, unread: 0}); if (!m.read) t.unread++; if (!t.last || msAt(m) > msAt(t.last)) t.last = m; }
  for (const m of O.sent) { if (isBlocked(m.to)) continue; const t = by[m.to] || (by[m.to] = {uid: m.to, name: m.toName, last: null, unread: 0}); if (!t.last || msAt(m) > msAt(t.last)) t.last = m; }
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
  if (API.menuOpen) { openChat(uid, name); return; }
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
  if (!textOk(t)) return RUDE_MSG;
  if (isBlocked(uid)) return 'You’ve blocked ' + (name || 'them') + '. Unblock them in Account → Profile to message.';
  if (Date.now() - lastSend < 600) return 'Slow down a little.';
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
/* ============================================================ ERROR REPORTS
   Errors in players' games are saved to logs/{id} (rate limited on the server) so bugs show up before players report
   them. Only a message, where it happened and the game version; no city data. */
let errSeen = new Set();
function reportError(kind, msg, where) {
  try {
    const key = kind + '|' + String(msg).slice(0, 120); if (errSeen.has(key) || errSeen.size > 12) return; errSeen.add(key);
    if (!O.user) return;
    addDoc(collection(db, 'logs'), {kind: 'error', uid: O.user.uid, msg: String(msg).slice(0, 500), where: String(where || '').slice(0, 300), ver: API.version || '', ua: navigator.userAgent.slice(0, 160), at: serverTimestamp()}).catch(() => {});
  } catch (e) {}
}
window.addEventListener('error', e => reportError('error', e.message, (e.filename || '') + ':' + (e.lineno || 0)));
window.addEventListener('unhandledrejection', e => reportError('promise', e.reason && e.reason.message || String(e.reason), ''));

/* ============================================================ BLOCK, MUTE, REPORT
   users/{uid}/blocked/{bid}: {name, mute, at}. Blocked players' messages, challenges and friend adds are hidden;
   muted ones still show but never notify. Reports go to feedback/other with the player's id and their last messages. */
O.blocked = {};
const blockRef = bid => doc(db, 'users', O.user.uid, 'blocked', bid);
const isBlocked = uid => !!(O.blocked[uid] && !O.blocked[uid].mute);
const isMuted = uid => !!(O.blocked[uid] && O.blocked[uid].mute);
const isHushed = uid => !!O.blocked[uid];                                 // blocked or muted: no notifications
async function loadBlocked() {
  if (!O.ready || !O.user) return;
  try { const sn = await getDocs(collection(db, 'users', O.user.uid, 'blocked')); O.blocked = {}; sn.forEach(x => { O.blocked[x.id] = Object.assign({name: '?', mute: false}, x.data()); }); }
  catch (e) { console.warn('Blocked list unavailable', e); }
  updateMsgBadge();
}
async function setHush(uid, name, mode) {                                  // mode: 'block' | 'mute' | 'off'
  if (!O.ready || !O.user || uid === O.user.uid) return 'That\u2019s you.';
  try {
    if (mode === 'off') { await deleteDoc(blockRef(uid)); delete O.blocked[uid]; }
    else { await setDoc(blockRef(uid), {name: String(name || 'Player').slice(0, 16), mute: mode === 'mute', at: serverTimestamp()}); O.blocked[uid] = {name, mute: mode === 'mute'}; }
  } catch (e) { return 'Couldn\u2019t save that: ' + e.message; }
  if (mode === 'block') { try { await deleteDoc(friendRef(uid)); await loadFriends(true); } catch (e) {} }
  updateMsgBadge(); if (chatBox) renderChats(); if (frBox) renderFriends(); if (isoBox) renderIso();
  if (!$('m-acct').hidden && acctPane === 'profile') renderBlockedList();
  return '';
}
function renderLookPicker() {
  const box = $('acct-look'); if (!box) return;
  const look = API.prof(), o = API.profOptions(), pins = API.pinnable(), names = Object.fromEntries(API.achList().map(a => [a.id, a.name]));
  const sel = (label, key, items, none) => '<div class="look-row"><span>' + label + '</span><select data-look="' + key + '"><option value="">' + none + '</option>' + items.filter(it => it.id.split(':')[1]).map(it => '<option value="' + esc(it.id.split(':')[1]) + '"' + (look[key] === it.id.split(':')[1] ? ' selected' : '') + '>' + esc(it.name) + '</option>').join('') + '</select></div>';
  box.innerHTML = sel('Banner', 'banner', o.banners, 'No banner') + sel('Frame', 'frame', o.frames, 'No frame') + sel('Title', 'title', o.titles, 'No title') +
    '<div class="look-pins"><span>Pinned achievements <small>(' + look.pins.length + '/3)</small></span>' + (pins.length ? '<div class="pin-list">' + pins.map(a => '<label class="pin' + (look.pins.includes(a.id) ? ' on' : '') + '"><input type="checkbox" data-pin="' + esc(a.id) + '"' + (look.pins.includes(a.id) ? ' checked' : '') + '><span>\u2605 ' + esc(a.name) + '</span></label>').join('') + '</div>' : '<p class="mini">Unlock achievements to pin them here.</p>') + '</div>';
  box.querySelectorAll('[data-look]').forEach(s2 => s2.onchange = () => API.setProf({[s2.dataset.look]: s2.value}));
  box.querySelectorAll('[data-pin]').forEach(c => c.onchange = () => { let p = API.prof().pins.slice(); if (c.checked) { if (p.length >= 3) { c.checked = false; API.toast('Three pins at most \u2014 unpin one first', 'warn'); return; } p.push(c.dataset.pin); } else p = p.filter(x => x !== c.dataset.pin); API.setProf({pins: p}); });
}
function renderBlockedList() {
  const box = $('acct-blocked'); if (!box) return;
  const ids = Object.keys(O.blocked);
  box.innerHTML = ids.length ? ids.map(uid => { const b = O.blocked[uid]; return '<div class="blk-row"><span class="av" style="background:' + avColour(uid) + '">' + esc(String(b.name || '?').charAt(0).toUpperCase()) + '</span><span class="blk-t"><b>' + esc(b.name || 'Player') + '</b><small>' + (b.mute ? 'Muted \u00b7 no notifications' : 'Blocked \u00b7 hidden everywhere') + '</small></span><button class="act small" type="button" data-unhush="' + esc(uid) + '">' + (b.mute ? 'Unmute' : 'Unblock') + '</button></div>'; }).join('')
    : '<p class="mini">Nobody. Block or mute someone from their player card or a chat.</p>';
  box.querySelectorAll('[data-unhush]').forEach(b => b.onclick = async () => { const err = await setHush(b.dataset.unhush, '', 'off'); if (err) API.toast(err, 'warn'); renderBlockedList(); });
}
let reportOf = null, reportWhy = 'Harassment';
function openReport(uid, name) {
  if (!O.ready || !O.user || uid === O.user.uid) return;
  reportOf = {uid, name}; $('rp-name').textContent = name || 'player'; $('rp-text').value = ''; $('rp-err').textContent = ''; $('rp-block').checked = !isBlocked(uid);
  reportWhy = 'Harassment'; document.querySelectorAll('#rp-why button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.why === reportWhy)));
  openM('m-report');
}
document.querySelectorAll('#rp-why button').forEach(b => b.addEventListener('click', () => { reportWhy = b.dataset.why; document.querySelectorAll('#rp-why button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
$('rp-cancel').addEventListener('click', () => closeM('m-report'));
$('rp-send').addEventListener('click', async () => {
  if (!reportOf) return;
  const btn = $('rp-send'); btn.disabled = true; $('rp-err').textContent = '';
  try {
    const theirs = O.inbox.filter(m => m.from === reportOf.uid).sort((a, b) => msAt(b) - msAt(a)).slice(0, 5).map(m => new Date(msAt(m)).toISOString().slice(0, 16) + ' ' + (m.text || '')).join('\n');
    const data = {uid: O.user.uid, message: 'Report: ' + reportWhy + ' \u2014 ' + (reportOf.name || 'player'), details: ($('rp-text').value.trim() + (theirs ? '\n\nTheir last messages:\n' + theirs : '')).slice(0, 1900),
      about: reportOf.uid, aboutName: String(reportOf.name || '').slice(0, 16), createdAt: serverTimestamp()};
    if (O.profile && O.profile.name) data.name = O.profile.name;
    await addDoc(collection(db, 'feedback', 'other', 'entries'), data);
    if ($('rp-block').checked) await setHush(reportOf.uid, reportOf.name, 'block');
    closeM('m-report'); API.toast('Report sent. Thank you.', 'good');
  } catch (e) { $('rp-err').textContent = 'Couldn\u2019t send the report: ' + e.message; }
  btn.disabled = false;
});
/* the buttons a player card or chat shows for mute, block and report */
function hushButtonsHTML(uid) {
  return '<button class="act small" type="button" data-hush="' + (isMuted(uid) ? 'off' : 'mute') + '">' + (isMuted(uid) ? 'Unmute' : 'Mute') + '</button>' +
    '<button class="act small" type="button" data-hush="' + (isBlocked(uid) ? 'off' : 'block') + '">' + (isBlocked(uid) ? 'Unblock' : 'Block') + '</button>' +
    '<button class="act small" type="button" data-hush="report">Report</button>';
}
function bindHush(box, uid, name, after) {
  box.querySelectorAll('[data-hush]').forEach(b => b.onclick = async () => {
    const m = b.dataset.hush;
    if (m === 'report') { openReport(uid, name); return; }
    if (m === 'block' && !(await API.ask({title: 'Block ' + name + '?', text: 'Their messages, challenges and friend adds are hidden. You can unblock them in Account \u2192 Profile.', ok: 'Block', danger: true}))) return;
    const err = await setHush(uid, name, m); if (err) API.toast(err, 'warn'); else API.toast(m === 'off' ? name + ' is back' : m === 'mute' ? name + ' is muted' : name + ' is blocked', 'good');
    if (after) after();
  });
}

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
  if (fuid === O.user.uid) return 'That’s you.';
  if (isBlocked(fuid)) return 'You’ve blocked ' + (name || 'them') + '. Unblock them in Account → Profile first.';
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
  frBox = box || frBox; if (!frBox || !frBox.isConnected) { frBox = null; return; }
  if (!O.ready || !O.user) { frBox.innerHTML = '<p class="mini">Friends need the online service — it’s still connecting, or unavailable right now.</p>'; return; }
  if (!O.profile || !O.profile.name) { frBox.innerHTML = '<p class="mini">Pick a username first, then you can add friends.</p><button class="bigbtn" type="button" id="fr-pick">Pick a username</button>'; $('fr-pick').onclick = () => openUserModal(); return; }
  frBox.innerHTML = '<p class="mini">Loading friends…</p>';
  const list = (await loadFriends()).filter(f => !isBlocked(f.uid));
  if (!frBox) return;
  if (!frSel && list.length) frSel = {uid: list[0].uid, name: list[0].name};
  frBox.innerHTML = '<div class="frwrap"><div class="frcol">' +
    '<div class="fradd"><input id="fr-name" type="text" maxlength="16" placeholder="Add a friend by username" autocomplete="off" spellcheck="false"><button class="bigbtn" id="fr-add" type="button">Add</button></div>' +
    '<p class="formerr" id="fr-err" role="alert"></p>' +
    '<div class="frlist">' + (list.length ? list.map(f => { const h = h2hWith(f.uid);
      return '<button type="button" class="frrow' + (frSel && frSel.uid === f.uid ? ' active' : '') + '" data-fr="' + esc(f.uid) + '" data-name="' + esc(f.name) + '"><span class="av" style="background:' + avColour(f.uid) + '">' + esc(String(f.name).charAt(0).toUpperCase()) + '</span><span class="frrow-t"><b>' + esc(f.name) + '</b><small>' +
        (h.played ? 'ISO ' + h.w + '–' + h.l + (h.d ? '–' + h.d : '') : 'No matches yet') + (h.open ? ' · ' + h.open + ' open' : '') + '</small></span></button>'; }).join('')
      : '<p class="mini">No friends yet. Add someone by their username, or tap a player on any leaderboard.</p>') + '</div></div>' +
    '<div class="frmain" id="fr-main">' + (frSel ? '' : '<p class="mini">Pick a friend to see their records, how you do against them, and whether they’re playing.</p>') + '</div></div>';
  const add = async () => { const err = await addFriendByName($('fr-name').value); if (err) { $('fr-err').textContent = err; return; } API.toast('Friend added', 'good'); renderFriends(); };
  $('fr-add').onclick = add; $('fr-name').onkeydown = e => { if (e.key === 'Enter') add(); };
  frBox.querySelectorAll('[data-fr]').forEach(b => b.onclick = () => { frSel = {uid: b.dataset.fr, name: b.dataset.name}; renderFriends(); });
  if (frSel) renderFriendMain();
}
/* your ISO record against one player */
function h2hWith(uid) {
  const me = O.user.uid, out = {w: 0, l: 0, d: 0, played: 0, open: 0, last: []};
  for (const d of Object.values(O.chals || {})) {
    if (oppOf(d).uid !== uid) continue;
    if (d.status === 'done') { out.played++; if (d.winner === me) out.w++; else if (d.winner === uid) out.l++; else out.d++; out.last.push(d); }
    else if ((d.status === 'pending' || d.status === 'accepted') && tms(d.expiresAt) > Date.now()) out.open++;
  }
  out.last.sort((a, b) => tms(b.endedAt) - tms(a.endedAt));
  return out;
}
const AV_COLS = ['#e0483e', '#2f7de1', '#f0a81c', '#2fa66a', '#8a5bd6', '#16a2b8', '#d0268f', '#c1592c'];
const avColour = uid => { let h = 0; for (const c of String(uid)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AV_COLS[h % AV_COLS.length]; };
/* is a player playing right now? (their public card points at their live channel) */
async function liveOf(uid) {
  try {
    const p = await getDoc(doc(db, 'profiles', uid)), code = p.exists() ? p.data().live : null;
    const l = code ? await getDoc(doc(db, 'live', code)) : null, d = l && l.exists() ? l.data() : null;
    const fresh = !!(d && d.updatedAt && d.updatedAt.toMillis && Date.now() - d.updatedAt.toMillis() < 3 * LIVE_HEARTBEAT);
    return {code, d, fresh, playing: !!(d && d.playing && fresh)};
  } catch (e) { return {code: null, d: null, fresh: false, playing: false}; }
}
async function renderFriendMain() {
  const main = $('fr-main'); if (!main || !frSel) return;
  const sel = frSel, h = h2hWith(sel.uid);
  const lk = O.looks[sel.uid]; if (!lk) lookOf(sel.uid).then(() => { if (frSel === sel) renderFriendMain(); });
  main.innerHTML = '<div class="frhead" style="background:' + API.bannerCSS(lk && lk.banner) + '"><span class="' + avClass(lk) + ' big" style="' + avStyle(sel.uid, lk) + '">' + esc(String(sel.name).charAt(0).toUpperCase()) + '</span><div class="frhead-t"><b>' + nameHTML(sel.name, false, false, lk) + '</b><small id="fr-live">Checking…</small></div></div>' +
    '<div class="btnrow fr-acts"><button class="bigbtn" type="button" id="fr-chal">Challenge</button><button class="bigbtn ghost" type="button" id="fr-msg">Message</button><button class="bigbtn ghost" type="button" id="fr-coop">Co-op</button><button class="bigbtn ghost" type="button" id="fr-view">Profile</button><button class="linkbtn" type="button" id="fr-remove">Remove friend</button></div>' +
    '<h4 class="frh">ISO 1v1 against ' + esc(sel.name) + '</h4>' +
    '<div class="fr-h2h"><div><b class="num">' + h.w + '</b><span>won</span></div><div><b class="num">' + h.l + '</b><span>lost</span></div><div><b class="num">' + h.d + '</b><span>drawn</span></div><div><b class="num">' + h.open + '</b><span>open</span></div></div>' +
    (h.last.length ? '<div class="fr-last">' + h.last.slice(0, 5).map(d => { const w = d.winner === O.user.uid ? 'won' : d.winner === sel.uid ? 'lost' : 'draw';
      return '<span class="fr-res r-' + w + '"><b>' + (w === 'won' ? 'Won' : w === 'lost' ? 'Lost' : 'Draw') + '</b> ' + (d.kind === 'live' ? 'Live' : 'Daily') + '</span>'; }).join('') + '</div>' : '<p class="mini">You haven’t played each other yet. Challenge them to a live or daily match.</p>') +
    '<h4 class="frh">Their records</h4><div id="fr-rec"><p class="mini">Loading records…</p></div>';
  $('fr-chal').onclick = () => openChallenge(sel.uid, sel.name);
  $('fr-msg').onclick = () => openChat(sel.uid, sel.name);
  $('fr-view').onclick = () => openPlayer(sel.uid, sel.name);
  $('fr-coop').onclick = () => coopInvite(sel.uid, sel.name);
  $('fr-remove').onclick = async () => { if (!(await API.ask({title: 'Remove ' + sel.name + '?', text: 'They come off your friends list. Your chat stays.', ok: 'Remove', danger: true}))) return; try { await deleteDoc(friendRef(sel.uid)); } catch (e) {} frSel = null; await loadFriends(true); renderFriends(); };
  friendRecordsOf(sel.uid).then(r => { if (frSel === sel && $('fr-rec')) $('fr-rec').innerHTML = recordsHTML(r); });
  liveOf(sel.uid).then(L => {
    if (frSel !== sel || !$('fr-live')) return;
    const inMatch = Object.values(O.chals).some(d => d.status === 'accepted' && d.kind === 'live' && (d.from === sel.uid || d.to === sel.uid) && d.startAt);
    $('fr-live').innerHTML = L.playing ? '<i class="dot on"></i>Playing now · <button class="linkbtn inl" type="button" id="fr-watch">' + (inMatch ? 'Watch their match' : 'Watch live') + '</button>' : L.fresh ? '<i class="dot"></i>Online, on the menu' : 'Not playing right now';
    const w = $('fr-watch'); if (w) w.onclick = () => inMatch ? spectateMatch(sel.uid, sel.name) : startWatching(L.code, L.d);
  });
}

/* ============================================================ CHATS
   The main menu's Chats: every conversation down the side (like a messaging app), the open one beside it.
   Tap the name at the top of a chat to open that player's profile. */
let chatBox = null, chatSel = null, chatQ = '', chatNew = false;
function openChat(uid, name) {
  chatSel = {uid, name}; chatNew = false;
  closeM('m-player'); closeM('m-board'); closeM('m-run');
  if (API.showMenuPane) API.showMenuPane('chats'); else { msgWith = {uid, name}; openAcct('msgs'); }
}
const dayKey = t => new Date(t).toDateString();
function dayLabel(t) {
  const d = new Date(t), now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, Date.now() - t < 6 * 864e5 ? {weekday: 'long'} : {day: 'numeric', month: 'short', year: 'numeric'});
}
const hhmm = t => new Date(t).toLocaleTimeString(undefined, {hour: '2-digit', minute: '2-digit'});
const listTime = t => Date.now() - t < 864e5 && dayKey(t) === dayKey(Date.now()) ? hhmm(t) : dayLabel(t);
const ticks = m => '<i class="wa-tick' + (m.read ? ' read' : '') + '" title="' + (m.read ? 'Read' : 'Sent') + '">' + (m.at ? '✓✓' : '✓') + '</i>';
async function renderChats(box) {
  chatBox = box || chatBox; if (!chatBox || !chatBox.isConnected) { chatBox = null; return; }
  if (!O.ready || !O.user) { chatBox.innerHTML = '<p class="mini">Chats need the online service — it’s still connecting, or unavailable right now.</p>'; return; }
  if (!O.profile || !O.profile.name) { chatBox.innerHTML = '<p class="mini">Pick a username first, then you can chat.</p>'; return; }
  const keep = $('wa-text'), draft = keep ? keep.value : '', focused = keep && document.activeElement === keep, qFocus = document.activeElement && document.activeElement.id === 'wa-q';
  if (chatSel && isBlocked(chatSel.uid)) chatSel = null;               // a blocked player's chat closes
  const threads = threadsList(), q = chatQ.trim().toLowerCase();
  if (chatSel && !threads.some(t => t.uid === chatSel.uid)) threads.unshift({uid: chatSel.uid, name: chatSel.name, last: null, unread: 0});
  const shown = threads.filter(t => !q || String(t.name || '').toLowerCase().includes(q));
  const rows = shown.map(t => {
    const m = t.last, mine = m && m.from === O.user.uid;
    return '<button type="button" class="wa-row' + (chatSel && chatSel.uid === t.uid ? ' active' : '') + (t.unread ? ' unread' : '') + '" data-chat="' + esc(t.uid) + '" data-name="' + esc(t.name || '') + '">' +
      '<span class="av" style="background:' + avColour(t.uid) + '">' + esc(String(t.name || '?').charAt(0).toUpperCase()) + '</span>' +
      '<span class="wa-row-t"><span class="wa-row-1"><b>' + esc(t.name || 'Player') + '</b><time>' + (m ? listTime(msAt(m)) : '') + '</time></span>' +
      '<span class="wa-row-2"><small>' + (m ? (mine ? ticks(m) + ' ' : '') + esc(m.text || '') : 'New chat') + '</small>' + (t.unread ? '<em class="wa-unread">' + t.unread + '</em>' : '') + '</span></span></button>';
  }).join('');
  let main;
  if (chatNew) {
    const fr = await loadFriends(); if (!chatBox) return;
    main = '<header class="wa-head"><button type="button" class="wa-back" id="wa-newback" aria-label="Back">←</button><span class="wa-who-t"><b>New chat</b><small>Pick a friend, or type a username</small></span></header>' +
      '<div class="wa-newbody"><div class="fradd"><input id="wa-newname" type="text" maxlength="16" placeholder="Username" autocomplete="off" spellcheck="false"><button class="bigbtn" id="wa-newgo" type="button">Chat</button></div><p class="formerr" id="wa-newerr" role="alert"></p>' +
      (fr.length ? fr.map(f => '<button type="button" class="wa-row" data-newchat="' + esc(f.uid) + '" data-name="' + esc(f.name) + '"><span class="av" style="background:' + avColour(f.uid) + '">' + esc(String(f.name).charAt(0).toUpperCase()) + '</span><span class="wa-row-t"><b>' + esc(f.name) + '</b><small>Friend</small></span></button>').join('') : '<p class="mini">Add friends in the Friends section to see them here.</p>') + '</div>';
  } else if (chatSel) {
    const ms = O.inbox.filter(m => m.from === chatSel.uid).concat(O.sent.filter(m => m.to === chatSel.uid)).sort((a, b) => msAt(a) - msAt(b));
    let body = '', lastDay = '';
    for (const m of ms) {
      const t = msAt(m), k = dayKey(t), mine = m.from === O.user.uid;
      if (k !== lastDay) { body += '<div class="wa-day"><span>' + dayLabel(t) + '</span></div>'; lastDay = k; }
      body += '<div class="wa-msg' + (mine ? ' me' : '') + '"><span class="wa-txt">' + esc(m.text || '') + '</span><span class="wa-meta">' + hhmm(t) + (mine ? ' ' + ticks(m) : '') + '</span></div>';
    }
    main = '<header class="wa-head"><button type="button" class="wa-back" id="wa-back" aria-label="Back to chats">←</button>' +
      '<button type="button" class="wa-who" id="wa-who" title="See their profile"><span class="' + avClass(O.looks[chatSel.uid]) + '" style="' + avStyle(chatSel.uid, O.looks[chatSel.uid]) + '">' + esc(String(chatSel.name || '?').charAt(0).toUpperCase()) + '</span><span class="wa-who-t"><b>' + nameHTML(chatSel.name || 'Player', false, false, O.looks[chatSel.uid]) + '</b><small>Tap for their profile</small></span></button>' +
      '<button type="button" class="act small" id="wa-chal">Challenge</button><button type="button" class="wa-more" id="wa-more" aria-label="More" aria-expanded="false">⋯</button>' +
      '<div class="wa-menu" id="wa-menu" hidden><button type="button" data-wm="profile">Their profile</button>' + hushButtonsHTML(chatSel.uid).replace(/class="act small"/g, 'data-wm="hush"') + '</div></header>' +
      '<div class="wa-body" id="wa-body">' + (body || '<p class="wa-empty">Say hello to ' + esc(chatSel.name || 'them') + '.</p>') + '</div>' +
      '<div class="wa-input"><input id="wa-text" type="text" maxlength="500" placeholder="Message" autocomplete="off"><button type="button" class="wa-send" id="wa-send" aria-label="Send"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 20l18-8L3 4l2.5 8L3 20zm2.5-8h7"/></svg></button></div><p class="formerr" id="wa-err" role="alert"></p>';
    for (const m of ms) if (m.to === O.user.uid && !m.read) { m.read = true; updateDoc(doc(db, 'messages', m.id), {read: true}).catch(() => {}); }
    updateMsgBadge();
  } else main = '<div class="wa-none"><svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg><b>Your chats</b><span>Pick a conversation, or start a new one.</span></div>';
  chatBox.innerHTML = '<div class="wa' + (chatSel || chatNew ? ' has-sel' : '') + '"><aside class="wa-side"><div class="wa-top"><b>Chats</b><button type="button" class="act small" id="wa-new">New chat</button></div>' +
    '<input class="wa-search" id="wa-q" type="search" placeholder="Search chats" value="' + esc(chatQ) + '" autocomplete="off">' +
    '<div class="wa-list">' + (rows || '<p class="mini wa-nolist">' + (q ? 'No chats match.' : 'No chats yet. Start one with New chat, or message a player from their profile.') + '</p>') + '</div></aside>' +
    '<section class="wa-main">' + main + '</section></div>';
  const body = $('wa-body'); if (body) body.scrollTop = body.scrollHeight;
  const ti = $('wa-text'); if (ti) { ti.value = draft; if (focused) { ti.focus(); ti.setSelectionRange(draft.length, draft.length); } }
  const qi = $('wa-q'); if (qFocus) { qi.focus(); qi.setSelectionRange(chatQ.length, chatQ.length); }
  qi.oninput = () => { chatQ = qi.value; renderChats(); };
  $('wa-new').onclick = () => { chatNew = true; chatSel = null; renderChats(); };
  chatBox.querySelectorAll('[data-chat]').forEach(b => b.onclick = () => { chatSel = {uid: b.dataset.chat, name: b.dataset.name}; chatNew = false; renderChats(); });
  chatBox.querySelectorAll('[data-newchat]').forEach(b => b.onclick = () => { chatSel = {uid: b.dataset.newchat, name: b.dataset.name}; chatNew = false; renderChats(); });
  const nb = $('wa-newback'); if (nb) nb.onclick = () => { chatNew = false; renderChats(); };
  const ng = $('wa-newgo'); if (ng) {
    const go = async () => {
      const n = $('wa-newname').value.trim(); $('wa-newerr').textContent = '';
      if (!NAME_RE.test(n)) { $('wa-newerr').textContent = 'Usernames are 3–16 letters, numbers, _ or -.'; return; }
      try { const u = await getDoc(nameRef(n.toLowerCase())); if (!u.exists()) { $('wa-newerr').textContent = 'No player called ' + n + '.'; return; }
        if (u.data().uid === O.user.uid) { $('wa-newerr').textContent = 'That’s you.'; return; }
        chatSel = {uid: u.data().uid, name: n}; chatNew = false; renderChats(); } catch (e) { $('wa-newerr').textContent = e.message; }
    };
    ng.onclick = go; $('wa-newname').onkeydown = e => { if (e.key === 'Enter') go(); };
  }
  const bk = $('wa-back'); if (bk) bk.onclick = () => { chatSel = null; renderChats(); };
  if (chatSel && !O.looks[chatSel.uid]) lookOf(chatSel.uid).then(() => { if (chatBox && chatSel) renderChats(); });
  const who = $('wa-who'); if (who) who.onclick = () => openPlayer(chatSel.uid, chatSel.name);
  const ch = $('wa-chal'); if (ch) ch.onclick = () => openChallenge(chatSel.uid, chatSel.name);
  const more = $('wa-more'); if (more) {
    more.onclick = () => { const m = $('wa-menu'); m.hidden = !m.hidden; more.setAttribute('aria-expanded', String(!m.hidden)); };
    $('wa-menu').querySelector('[data-wm="profile"]').onclick = () => openPlayer(chatSel.uid, chatSel.name);
    bindHush($('wa-menu'), chatSel.uid, chatSel.name, () => renderChats());
  }
  const sb = $('wa-send'); if (sb) {
    const send = async () => { const el = $('wa-text'), t = el.value; $('wa-err').textContent = ''; if (!t.trim()) return; el.value = '';
      const err = await sendTo(chatSel.uid, chatSel.name, t); if (err) { $('wa-err').textContent = err; el.value = t; return; } renderChats(); $('wa-text').focus(); };
    sb.onclick = send; ti.onkeydown = e => { if (e.key === 'Enter') send(); };
  }
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
  const p = API.prof();
  await setDoc(doc(db, 'profiles', O.user.uid), {name: myName(), star: isPerm(), ach3: myAch3(), live: O.liveCode || null, banner: p.banner || '', frame: p.frame || '', title: p.title || '', pins: p.pins || [], updatedAt: serverTimestamp()}).catch(e => console.warn('Profile not shared', e));
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
  if (!isPerm() || !(await API.ask({title: 'Make a new live code?', text: 'Anyone using your old one won\u2019t be able to watch any more.', ok: 'New code'}))) return;
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
  if (O.specMatchUnsub) { O.specMatchUnsub(); O.specMatchUnsub = null; if (API.isoSpectate) API.isoSpectate(null); }
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
  $('pl-av').className = 'acct-av'; $('pl-av').style.cssText = 'background:' + avColour(uid); $('pl-banner').style.background = API.bannerCSS(''); $('pl-pins').hidden = true;
  lookOf(uid).then(l => {
    if ($('m-player').hidden) return;
    $('pl-name').innerHTML = nameHTML(name || 'Player', false, false, l); $('pl-banner').style.background = API.bannerCSS(l.banner);
    getDoc(doc(db, 'rankedPlayers', uid)).then(r => { if (r.exists() && !$('m-player').hidden) $('pl-name').insertAdjacentHTML('beforeend', ' ' + rankedBadge(r.data())); }).catch(() => {});
    if (l.flag) $('pl-sub').textContent = 'Some of this player’s scores are under review.';
    $('pl-av').className = 'acct-av' + (l.frame ? ' f-' + l.frame : ''); if (l.frame) $('pl-av').style.setProperty('--fr', API.frameCSS(l.frame));
    const names = Object.fromEntries(API.achList().map(a => [a.id, a]));
    $('pl-pins').hidden = !l.pins.length; $('pl-pins').innerHTML = l.pins.filter(id => names[id]).map(id => '<span class="achchip" title="' + esc(names[id].hint) + '"><i>★</i>' + esc(names[id].name) + '</span>').join('');
  });
  $('pl-sub').textContent = uid === O.user.uid ? 'This is you.' : '';
  $('pl-live').innerHTML = '<p class="mini">Checking whether they\u2019re playing\u2026</p>';
  $('pl-rec').innerHTML = '<p class="mini">Loading\u2026</p>';
  const me = uid === O.user.uid;
  const btns = () => {
    $('pl-btns').innerHTML = me ? '' : '<button class="bigbtn" type="button" id="pl-chal">Challenge</button><button class="bigbtn ghost" type="button" id="pl-msg">Message</button><button class="bigbtn ghost" type="button" id="pl-coop">Co-op</button>' +
      (isFriend(uid) ? '<span class="mini pl-fr">✓ Friends</span>' : '<button class="bigbtn ghost" type="button" id="pl-add">Add friend</button>') +
      '<span class="pl-hush">' + hushButtonsHTML(uid) + '</span>';
    if (me) return;
    bindHush($('pl-btns'), uid, name, btns);
    $('pl-chal').onclick = () => { closeM('m-player'); openChallenge(uid, name); };
    $('pl-msg').onclick = () => { closeM('m-player'); closeM('m-board'); openThread(uid, name); };
    $('pl-coop').onclick = () => coopInvite(uid, name);
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
    API.setIsoPending(Object.values(O.chals).filter(d => d.to === O.user.uid && d.status === 'pending' && tms(d.expiresAt) > Date.now() && !isBlocked(d.from)).length);
    if (isoBox) renderIso();
  }, e => console.warn('Challenges unavailable', e)));
}
/* react to a challenge changing: new ones, answers, the live start, asks, and the result */
function onChal(d, old) {
  const me = O.user.uid, opp = oppOf(d), kind = d.kind === 'live' ? 'live' : 'daily';
  if (d.ranked && !old && d.status === 'accepted') { O.queued = null; renderRankedQueue(); API.toast((d.tournament ? 'Tournament match' : 'Ranked match') + ' found: ' + opp.name + ' — ' + (kind === 'live' ? 'press Ready in Play → ISO 1v1' : 'play your run from Play → ISO 1v1'), 'good'); }
  if (d.ranked && d.rated && (!old || !old.rated) && d.delta && d.delta[me] !== undefined) { const dl = d.delta[me]; API.toast('Rating ' + (dl >= 0 ? '+' : '') + dl + (d.tournament ? ' · tournament' : ''), dl >= 0 ? 'good' : 'warn'); loadRanked(true); }
  if (isBlocked(opp.uid)) { if (d.to === me && d.status === 'pending') updateDoc(chalRef(d.id), {status: 'declined'}).catch(() => {}); return; }
  if (isMuted(opp.uid) && d.status === 'pending' && !old) return;
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
/* p65 ranked */
/* ============================================================ RANKED ISO, SEASONS, TOURNAMENTS
   rankedPlayers/{uid} {rating, division, games, wins, losses, draws, season, lastSeason} is written only by the
   Cloud Functions; the client queues in rankedQueue/{uid} and the function pairs players into a ranked challenge. */
const DIV_LABEL = {bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Platinum', diamond: 'Diamond'};
const DIV_MIN = {bronze: 0, silver: 1100, gold: 1250, platinum: 1400, diamond: 1550};
O.ranked = null; O.queued = null; let rankedAt = 0, queueUnsub = null;
async function loadRanked(force) {
  if (!O.user) return null;
  if (O.ranked && !force && Date.now() - rankedAt < 60e3) return O.ranked;
  try { const s = await getDoc(doc(db, 'rankedPlayers', O.user.uid)); O.ranked = s.exists() ? s.data() : {rating: 1000, division: 'bronze', games: 0, wins: 0, losses: 0, draws: 0}; }
  catch (e) { O.ranked = O.ranked || {rating: 1000, division: 'bronze', games: 0, wins: 0, losses: 0, draws: 0}; }
  rankedAt = Date.now();
  mergeGrants();
  return O.ranked;
}
/* designs the server granted (season rewards) are merged into what you own */
async function mergeGrants() {
  try { const g = await getDoc(doc(db, 'users', O.user.uid, 'stats', 'grants')); if (!g.exists()) return; const items = g.data().items || []; let n = 0; for (const id of items) if (API.grantItem && API.grantItem(id)) n++; if (n) API.toast('Season reward unlocked: ' + n + ' new design' + (n > 1 ? 's' : ''), 'good'); } catch (e) {}
}
const rankedBadge = r => { const d = (r && r.division) || 'bronze'; return '<span class="div-badge d-' + d + '" title="' + DIV_LABEL[d] + ' \u00b7 ' + Math.round((r && r.rating) || 1000) + '">' + DIV_LABEL[d] + '</span>'; };
function rankedHTML(rk) {
  const r = rk || {rating: 1000, division: 'bronze', games: 0, wins: 0, losses: 0, draws: 0};
  const next = Object.keys(DIV_MIN).find(k => DIV_MIN[k] > r.rating), toNext = next ? DIV_MIN[next] - r.rating : 0;
  const q = O.queued;
  return '<div class="rk-card d-' + (r.division || 'bronze') + '"><div class="rk-l"><small>Ranked ISO \u00b7 season ' + seasonLabel() + '</small><b>' + DIV_LABEL[r.division || 'bronze'] + ' <span class="num">' + Math.round(r.rating) + '</span></b>' +
    '<span>' + (r.games ? r.wins + 'W \u00b7 ' + r.losses + 'L \u00b7 ' + r.draws + 'D this season' : 'No ranked games yet') + (next ? ' \u00b7 ' + toNext + ' to ' + DIV_LABEL[next] : ' \u00b7 top division') + '</span></div>' +
    '<div class="rk-r">' + (q ? '<button class="bigbtn" type="button" id="rk-cancel">In queue (' + (q.kind === 'live' ? 'live' : 'daily') + ')\u2026 cancel</button>' : '<button class="bigbtn" type="button" id="rk-live">Quick match \u00b7 live</button><button class="act" type="button" id="rk-daily">Quick match \u00b7 daily</button>') +
    '<button class="act small" type="button" id="rk-board">Ranked board</button><button class="act small" type="button" id="rk-tour">Tournaments</button></div></div>';
}
const seasonLabel = () => new Date().toLocaleDateString('en-US', {month: 'long', year: 'numeric'});
function bindRanked(box) {
  const live = box.querySelector('#rk-live'), daily = box.querySelector('#rk-daily'), cancel = box.querySelector('#rk-cancel');
  if (live) live.onclick = () => joinQueue('live'); if (daily) daily.onclick = () => joinQueue('daily'); if (cancel) cancel.onclick = leaveQueue;
  const b = box.querySelector('#rk-board'); if (b) b.onclick = openRankedBoard;
  const t = box.querySelector('#rk-tour'); if (t) t.onclick = openTournaments;
}
function renderRankedQueue() { if (isoBox && isoBox.isConnected) renderIso(); }
async function joinQueue(kind) {
  if (!O.ready || !O.profile || !O.profile.name) { openUserModal(); return; }
  if (O.queued) return;
  const r = await loadRanked();
  try {
    await setDoc(doc(db, 'rankedQueue', O.user.uid), {name: myName(), rating: Math.round(r.rating || 1000), kind, at: serverTimestamp()});
    O.queued = {kind, at: Date.now()}; renderRankedQueue();
    API.toast('Looking for a ' + kind + ' opponent near ' + Math.round(r.rating || 1000) + '\u2026', 'tip');
    if (queueUnsub) queueUnsub();
    queueUnsub = onSnapshot(doc(db, 'rankedQueue', O.user.uid), s => { if (!s.exists() && O.queued) { O.queued = null; renderRankedQueue(); } });
    setTimeout(() => { if (O.queued && Date.now() - O.queued.at > 9.5 * 60e3) leaveQueue('No one near your rating turned up. Try again later, or challenge a friend.'); }, 9.6 * 60e3);
  } catch (e) { API.toast('Couldn\u2019t join the queue: ' + e.message, 'warn'); }
}
async function leaveQueue(why) {
  if (queueUnsub) { queueUnsub(); queueUnsub = null; }
  await deleteDoc(doc(db, 'rankedQueue', O.user.uid)).catch(() => {});
  if (O.queued) { O.queued = null; renderRankedQueue(); API.toast(why || 'Left the queue', why ? 'warn' : 'tip'); }
}
window.addEventListener('pagehide', () => { if (O.queued && O.user) { try { navigator.sendBeacon && deleteDoc(doc(db, 'rankedQueue', O.user.uid)); } catch (e) {} } });
/* the ranked board: top 25 by rating, your row highlighted */
async function openRankedBoard() {
  $('menu').hidden = true;
  $('board-modes').innerHTML = '<span class="mini">Ranked ISO \u00b7 season ' + seasonLabel() + '</span>'; $('board-tabs').innerHTML = '';
  $('board-note').textContent = 'Ratings start at 1000 and move with every ranked match. Divisions: Bronze, Silver 1100, Gold 1250, Platinum 1400, Diamond 1550. Seasons reset a third of the way to 1000 each month, and your division earns a design.';
  $('board-list').innerHTML = '<li class="mini">Loading\u2026</li>'; $('board-me').textContent = '';
  boardMode = 'ranked'; openM('m-board');
  try {
    const snap = await getDocs(query(collection(db, 'rankedPlayers'), orderBy('rating', 'desc'), limit(25)));
    const rows = []; let meIn = false;
    snap.forEach(x => { const d = x.data(), me = O.user && x.id === O.user.uid; if (me) meIn = true;
      rows.push('<li class="click' + (me ? ' me' : '') + '" data-player="' + esc(x.id) + '" data-name="' + esc(d.name || '') + '" tabindex="0"><span class="rank">' + (rows.length + 1) + '</span><span class="who">' + esc(d.name || '?') + ' ' + rankedBadge(d) + ' <span class="dk">' + (d.wins || 0) + 'W ' + (d.losses || 0) + 'L</span></span><b class="num">' + Math.round(d.rating) + '</b></li>'); });
    $('board-list').innerHTML = rows.join('') || '<li class="mini">No ranked games yet. Press Quick match to be the first.</li>';
    const r = await loadRanked(); $('board-me').innerHTML = 'You: <b>' + Math.round(r.rating || 1000) + '</b> \u00b7 ' + DIV_LABEL[r.division || 'bronze'] + (meIn ? '' : ' (outside the top 25)');
  } catch (e) { $('board-list').innerHTML = '<li class="mini">Couldn\u2019t load the ranked board: ' + esc(e.message) + '</li>'; }
}
/* tournaments: weekend brackets. tournaments/{id} {name, size, kind, startsAt, status, rounds, winner, host} */
async function openTournaments() {
  $('tour-list').innerHTML = '<p class="mini">Loading\u2026</p>'; openM('m-tour');
  try {
    const snap = await getDocs(query(collection(db, 'tournaments'), orderBy('startsAt', 'desc'), limit(12)));
    const me = O.user.uid, out = [];
    for (const x of snap.docs) {
      const t = x.data(), when = tms(t.startsAt) ? new Date(tms(t.startsAt)).toLocaleString(undefined, {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}) : '';
      let body = '';
      if (t.status === 'signup') {
        const su = await getDoc(doc(db, 'tournaments', x.id, 'signups', me));
        body = '<p class="mini">Starts ' + esc(when) + ' \u00b7 ' + (t.kind === 'live' ? 'live' : 'daily') + ' matches \u00b7 up to ' + t.size + ' players</p>' + (su.exists() ? '<button class="act small" type="button" data-tour-out="' + x.id + '">Leave</button>' : '<button class="bigbtn" type="button" data-tour-in="' + x.id + '">Sign up</button>');
      } else {
        const rounds = t.rounds || [];
        body = '<div class="bracket">' + rounds.map((r, i) => '<div class="br-round"><small>' + (rounds.length - i === 1 && t.status === 'done' ? 'Final' : 'Round ' + (i + 1)) + '</small>' + r.map(m => '<div class="br-m' + (m.winner ? ' done' : '') + '"><span' + (m.winner === m.a ? ' class="w"' : '') + '>' + esc(m.an) + '</span><span' + (m.winner === m.b ? ' class="w"' : '') + '>' + esc(m.bn) + '</span></div>').join('') + '</div>').join('') + '</div>' + (t.status === 'done' ? '<p class="mini">Winner: <b>' + esc((t.rounds.slice(-1)[0] || [])[0] && ((t.rounds.slice(-1)[0][0].winner === t.rounds.slice(-1)[0][0].a) ? t.rounds.slice(-1)[0][0].an : t.rounds.slice(-1)[0][0].bn) || '\u2014') + '</b></p>' : '<p class="mini">In progress \u00b7 your matches appear under ISO 1v1</p>');
      }
      out.push('<div class="tour"><h3>' + esc(t.name || 'Weekend cup') + ' <em class="iso-kind k-ranked">' + esc(t.status) + '</em></h3>' + body + '</div>');
    }
    $('tour-list').innerHTML = out.join('') || '<p class="mini">No tournaments yet. Weekend cups open for sign-ups on Fridays.</p>';
    if (isPerm()) $('tour-list').insertAdjacentHTML('beforeend', '<div class="tour new"><h3>Host a weekend cup</h3><p class="mini">An 8 or 16 player bracket. Sign-ups close and round 1 starts at the time you pick; the Cloud Functions run the bracket.</p><div class="fradd"><input id="tour-name" type="text" maxlength="32" placeholder="Cup name"><select id="tour-size"><option value="8">8 players</option><option value="16">16 players</option></select><select id="tour-kind"><option value="daily">Daily matches</option><option value="live">Live matches</option></select><input id="tour-when" type="datetime-local"><button class="bigbtn" id="tour-create" type="button">Create</button></div><p class="formerr" id="tour-err" role="alert"></p></div>');
    $('tour-list').querySelectorAll('[data-tour-in]').forEach(b => b.onclick = async () => { const r = await loadRanked(); await setDoc(doc(db, 'tournaments', b.dataset.tourIn, 'signups', me), {name: myName(), rating: Math.round(r.rating || 1000), at: serverTimestamp()}).then(() => { API.toast('Signed up', 'good'); openTournaments(); }).catch(e => API.toast(e.message, 'warn')); });
    $('tour-list').querySelectorAll('[data-tour-out]').forEach(b => b.onclick = async () => { await deleteDoc(doc(db, 'tournaments', b.dataset.tourOut, 'signups', me)).catch(() => {}); openTournaments(); });
    const cr = $('tour-create'); if (cr) cr.onclick = async () => {
      const name = $('tour-name').value.trim(), when = new Date($('tour-when').value).getTime();
      if (name.length < 3 || !textOk(name)) { $('tour-err').textContent = 'Give the cup a name (3+ letters, nothing rude).'; return; }
      if (!(when > Date.now() + 10 * 60e3)) { $('tour-err').textContent = 'Pick a start at least 10 minutes from now.'; return; }
      try { await addDoc(collection(db, 'tournaments'), {name, size: +$('tour-size').value, kind: $('tour-kind').value, host: me, hostName: myName(), status: 'signup', rounds: [], startsAt: Timestamp.fromMillis(when), createdAt: serverTimestamp()}); API.toast('Cup created. Share it: sign-ups are open.', 'good'); openTournaments(); }
      catch (e) { $('tour-err').textContent = e.message; }
    };
  } catch (e) { $('tour-list').innerHTML = '<p class="mini">Couldn\u2019t load tournaments: ' + esc(e.message) + '</p>'; }
}
$('tour-close').addEventListener('click', () => closeM('m-tour'));
/* spectating a friend's live match: their live/{code} snapshot carries the match id; we watch both cities side by side
   by watching the friend normally and drawing the opponent's city snapshot in the match panel */
async function spectateMatch(uid, name) {
  const L = await liveOf(uid);
  if (!L.playing) { API.toast(name + ' isn\u2019t playing right now', 'warn'); return; }
  startWatching(L.code, L.d);
  const open = Object.values(O.chals).find(d => d.status === 'accepted' && d.kind === 'live' && (d.from === uid || d.to === uid));
  if (open) {
    const opp = open.from === uid ? {uid: open.to, name: open.toName} : {uid: open.from, name: open.fromName};
    const un = onSnapshot(doc(db, 'challenges', open.id, 'live', opp.uid), x => { const v = x.data(); if (v && API.isoSpectate) API.isoSpectate({name: name, opp: opp.name, city: v.city, sec: v.sec, parcels: v.parcels, week: v.week, earned: v.earned, over: v.over}); }, () => {});
    O.specMatchUnsub = un;
  }
}
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
  if (isBlocked(uid)) return 'You’ve blocked ' + name + '. Unblock them in Account → Profile first.';
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
  const list = Object.values(O.chals).filter(d => !isBlocked(oppOf(d).uid)).sort((a, b) => tms(b.createdAt) - tms(a.createdAt));
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
    return '<div class="iso-row"><span class="av">' + esc(String(opp.name || '?').charAt(0).toUpperCase()) + '</span><span class="iso-who"><b>' + esc(opp.name) + '</b><em class="iso-kind k-' + d.kind + '">' + kind + '</em>' + (d.ranked ? '<em class="iso-kind k-ranked">' + (d.tournament ? 'Tournament' : 'Ranked') + '</em>' : '') + '<small>' + st + '</small></span>' +
      '<span class="iso-acts">' + acts.map(([a, l]) => '<button type="button" class="' + (a === 'accept' || a === 'ready' || a === 'play' ? 'bigbtn' : 'act') + ' small" data-ch="' + esc(d.id) + '" data-act="' + a + '">' + l + '</button>').join('') + '</span></div>';
  };
  const friends = await loadFriends();
  if (!isoBox) return;
  const rk = await loadRanked(); if (!isoBox) return;
  isoBox.innerHTML = rankedHTML(rk) + '<div class="iso-intro"><p><b>Live</b> \u2014 play side by side, right now. Same speed for both of you; pausing or speeding up needs you both to agree. The last city standing wins.</p>' +
      '<p><b>Daily</b> \u2014 each of you plays the same map within 24 hours, pausing and speeding up as you like. A point for each category you win: time survived, parcels, money, trips and fewest tow trucks.</p></div>' +
    '<h3>Your challenges</h3>' + (list.length ? list.map(line).join('') : '<p class="mini">None yet. Challenge a friend below, or tap a player on any leaderboard.</p>') +
    '<h3>Challenge someone</h3><div class="fradd"><input id="iso-name" type="text" maxlength="16" placeholder="Their username" autocomplete="off" spellcheck="false"><button class="bigbtn" id="iso-go" type="button">Challenge</button></div><p class="formerr" id="iso-err" role="alert"></p>' +
    (friends.length ? '<div class="iso-friends">' + friends.map(f => '<button type="button" class="act" data-chf="' + esc(f.uid) + '" data-name="' + esc(f.name) + '">' + esc(f.name) + '</button>').join('') + '</div>' : '');
  isoBox.querySelectorAll('[data-ch]').forEach(b => b.onclick = () => { const d = O.chals[b.dataset.ch]; if (d) answerChal(d, b.dataset.act); });
  bindRanked(isoBox);
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
  renderFriends(box) { renderFriends(box); }, renderChats(box) { renderChats(box); }, openChat(uid, name) { openChat(uid, name); },
  expertTop(ago, n) { return expertTop(ago, n); },
  openRun(ago, uid) { openRun(API.expertSeed(ago || 0).key, uid); },
  renderIso(box) { if (!O.ready) return false; renderIso(box); return true; }, openRankedBoard, openTournaments, joinQueue, spectateMatch,
  openPlayer(uid, name) { openPlayer(uid, name); }, textOk, openChallenge(uid, name) { openChallenge(uid, name); },
  openExpert(ago) { if (!O.ready) { API.toast('Online features are still connecting \u2014 try again in a moment.', 'warn'); return; } openExpert(ago); }
};


/* ============================================================ COMMUNITY MAPS
   maps/{code}             a published map: code, name, desc, data (the map as JSON), author, authorName, mode, goalText,
                           likes, plays, createdAt, updatedAt, thumb (a small PNG data URL)
   maps/{code}/likes/{uid} {at} while uid likes it; the liker keeps the map's counter with increment(+-1)
   maps/{code}/runs/{uid}  a player's best run on it: name, star, ach3, title, frame, parcels, weeks, earned, playSec, goal, city
   The game emits 'mapweek' and 'mapover' (never 'week', 'over' or 'autosave') while a map city is played, and tells us
   which map through API.mapId, so a map run is never cloud-saved or put on a mode's leaderboard. */
import { increment as fsIncrement } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js';
const MAP_CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
const mapRef = id => doc(db, 'maps', id), mapLikeRef = (id, uid) => doc(db, 'maps', id, 'likes', uid), mapRunRef = (id, uid) => doc(db, 'maps', id, 'runs', uid);
O.mapLikes = {}; O.mapBest = {}; O.mapRows = {};
function needOnline() { if (!O.ready || !O.user || !(O.profile && O.profile.name)) throw new Error('Online features are still connecting — try again in a moment.'); }
function mapCode() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', a = new Uint32Array(6); crypto.getRandomValues(a); let s = ''; for (let i = 0; i < 6; i++) s += A[a[i] % A.length]; return s; }
function mapRow(x) { const d = x.data(); return Object.assign({id: x.id}, d, {liked: !!O.mapLikes[x.id], mine: !!(O.user && d.author === O.user.uid)}); }
async function fillLikes(rows) {
  if (!O.user) return rows;
  await Promise.all(rows.map(async r => {
    if (O.mapLikes[r.id] === undefined) { try { O.mapLikes[r.id] = (await getDoc(mapLikeRef(r.id, O.user.uid))).exists(); } catch (e) { O.mapLikes[r.id] = false; } }
    r.liked = O.mapLikes[r.id];
  }));
  return rows;
}
/* the newest, most liked or most played maps (a single-field order, so no composite index) */
async function loadMaps(sort) {
  needOnline();
  const field = sort === 'plays' ? 'plays' : sort === 'new' ? 'createdAt' : 'likes';
  const snap = await getDocs(query(collection(db, 'maps'), orderBy(field, 'desc'), limit(24)));
  const rows = []; snap.forEach(x => { const r = mapRow(x); O.mapRows[r.id] = r; rows.push(r); });
  return fillLikes(rows);
}
async function myMaps() {
  needOnline();
  const snap = await getDocs(query(collection(db, 'maps'), where('author', '==', O.user.uid), limit(50)));
  const rows = []; snap.forEach(x => { const r = mapRow(x); O.mapRows[r.id] = r; rows.push(r); });
  const at = r => r.createdAt && r.createdAt.toMillis ? r.createdAt.toMillis() : 0;
  rows.sort((a, b) => at(b) - at(a));
  return fillLikes(rows);
}
async function getMap(id) {
  needOnline(); id = String(id || '').toUpperCase();
  if (!MAP_CODE_RE.test(id)) throw new Error('A map code is 6 letters or digits.');
  const x = await getDoc(mapRef(id)); if (!x.exists()) throw new Error('No map has the code ' + id + '.');
  const r = mapRow(x); O.mapRows[id] = r; await fillLikes([r]); return r;
}
/* publish a map under a fresh 6-letter code, or update one of yours */
async function publishMap(m) {
  needOnline();
  const name = String(m.name || '').trim(), desc = String(m.desc || '').trim();
  if (name.length < 3 || name.length > 32) throw new Error('Map names are 3–32 characters.');
  if (desc.length > 140) throw new Error('Descriptions are up to 140 characters.');
  if (!textOk(name) || !textOk(desc)) throw new Error('Please choose a friendlier name or description.');
  if (!API.validMap || !API.validMap(m.data)) throw new Error('That map isn’t valid.');
  const data = JSON.stringify(m.data); if (data.length > 40000) throw new Error('This map is too big to publish.');
  const thumb = typeof m.thumb === 'string' && m.thumb.length <= 8192 ? m.thumb : '';
  const base = {name, desc, data, mode: m.data.mode, goalText: String(m.goalText || '').slice(0, 80), authorName: myName(), thumb, updatedAt: serverTimestamp()};
  if (m.code) {
    const cur = await getDoc(mapRef(m.code));
    if (!cur.exists() || cur.data().author !== O.user.uid) throw new Error('That map isn’t yours to change.');
    await updateDoc(mapRef(m.code), base);
    delete O.mapRows[m.code];
    return {code: m.code, updated: true};
  }
  for (let t = 0; t < 8; t++) {
    const code = mapCode();
    try {
      await runTransaction(db, async tx => {
        const s = await tx.get(mapRef(code));
        if (s.exists()) throw Object.assign(new Error('taken'), {taken: true});
        tx.set(mapRef(code), Object.assign({code, author: O.user.uid, likes: 0, plays: 0, createdAt: serverTimestamp()}, base));
      });
      return {code};
    } catch (e) { if (!e.taken) throw e; }
  }
  throw new Error('Couldn’t find a free code — try again.');
}
async function likeMap(id) {
  needOnline();
  const liked = !!O.mapLikes[id];
  if (liked) { await deleteDoc(mapLikeRef(id, O.user.uid)); await updateDoc(mapRef(id), {likes: fsIncrement(-1)}); }
  else { await setDoc(mapLikeRef(id, O.user.uid), {at: serverTimestamp()}); await updateDoc(mapRef(id), {likes: fsIncrement(1)}); }
  O.mapLikes[id] = !liked;
  const r = O.mapRows[id]; if (r) { r.liked = !liked; r.likes = Math.max(0, (r.likes || 0) + (liked ? -1 : 1)); }
  return {liked: !liked, likes: r ? r.likes : 0};
}
/* start a city on a published map (and count the play) */
async function playMap(id) {
  needOnline();
  const r = O.mapRows[id] || await getMap(id);
  let d; try { d = JSON.parse(r.data); } catch (e) { throw new Error('That map can’t be opened.'); }
  if (!API.validMap(d)) throw new Error('That map can’t be opened.');
  updateDoc(mapRef(r.id), {plays: fsIncrement(1)}).then(() => { r.plays = (r.plays || 0) + 1; }).catch(() => {});
  return API.startMapCity(d, {id: r.id, code: r.id, name: r.name, author: r.author, authorName: r.authorName});
}
async function submitMapRun(st, id) {
  if (!O.ready || !O.profile || !O.profile.name || !id || !st || st.tutorialMode || st.spectating) return;
  if (!O.mapBest[id]) O.mapBest[id] = await getDoc(mapRunRef(id, O.user.uid)).then(x => x.exists() ? x.data() : {}).catch(() => ({}));
  const best = O.mapBest[id], goal = !!API.mapGoalDone;
  if (!(st.score > (best.parcels || 0) || (st.score === (best.parcels || 0) && st.week > (best.weeks || 0)) || (goal && !best.goal))) return;
  const data = {name: myName(), star: isPerm(), ach3: myAch3(), title: API.prof().title || '', frame: API.prof().frame || '', parcels: Math.floor(st.score || 0), weeks: Math.floor(st.week || 0),
    earned: Math.floor(st.earned || 0), playSec: Math.floor(st.clock || 0), goal, city: API.citySnap(), updatedAt: serverTimestamp()};
  if (data.city.length > 300000) data.city = '';
  try { await setDoc(mapRunRef(id, O.user.uid), data); O.mapBest[id] = data; }
  catch (e) { console.warn('Map leaderboard update failed', e); }
}
API.events.on('mapweek', () => { if (API.mapId) submitMapRun(API.state(), API.mapId); });
API.events.on('mapover', () => { if (API.mapId) submitMapRun(API.state(), API.mapId); });
let mbRows = {};
async function openMapBoard(id) {
  needOnline();
  const r = O.mapRows[id] || await getMap(id);
  $('mb-name').textContent = r.name || 'Map'; $('mb-sub').textContent = 'by ' + (r.authorName || '?') + ' · code ' + r.id + ' · ' + (r.goalText || '');
  $('mb-list').innerHTML = '<li class="mini">Loading…</li>'; $('mb-note').textContent = 'Most parcels first. Tap a player to see their city.';
  const cv = $('mb-map'), g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
  try { g.drawImage(API.mapCanvas(JSON.parse(r.data), cv.width), 0, 0); } catch (e) {}
  $('mb-play').onclick = () => { closeM('m-mapboard'); playMap(r.id).catch(e => API.toast(e.message, 'warn')); };
  openM('m-mapboard');
  try {
    const snap = await getDocs(query(collection(db, 'maps', r.id, 'runs'), orderBy('parcels', 'desc'), limit(25)));
    const rows = []; mbRows = {};
    snap.forEach(x => {
      const d = x.data(), me = O.user && x.id === O.user.uid; mbRows[x.id] = d;
      rows.push('<li class="click' + (me ? ' me' : '') + '" data-mbrun="' + x.id + '" tabindex="0"><span class="rank">' + (rows.length + 1) + '</span><span class="who">' + nameHTML(d.name || '?', d.star, d.ach3, d) +
        ' <span class="dk">week ' + (d.weeks || 0) + (d.goal ? ' · goal ✓' : '') + '</span></span><b class="num">' + (d.parcels || 0).toLocaleString() + ' parcels</b></li>');
    });
    $('mb-list').innerHTML = rows.join('') || '<li class="mini">No runs yet — be the first.</li>';
  } catch (e) { $('mb-list').innerHTML = '<li class="mini">Couldn’t load the leaderboard: ' + esc(e.message) + '</li>'; }
}
if ($('mb-list')) {
  $('mb-list').addEventListener('click', e => {
    const li = e.target.closest('[data-mbrun]'); if (!li) return;
    const d = mbRows[li.dataset.mbrun];
    if (d && d.city && API.drawCitySnap($('mb-map'), d.city)) $('mb-note').textContent = (d.name || 'Their') + '’s city at their best here: ' + (d.parcels || 0) + ' parcels, week ' + (d.weeks || 0) + '.';
    $('mb-list').querySelectorAll('li').forEach(x => x.classList.toggle('sel', x === li));
  });
  $('mb-close').addEventListener('click', () => closeM('m-mapboard'));
}
let mapReportOf = null, mapReportWhy = 'Inappropriate content';
function reportMap(id, name) {
  if (!O.ready || !O.user) { API.toast('Online features are still connecting — try again in a moment.', 'warn'); return; }
  mapReportOf = {id, name}; $('mr-name').textContent = name || id; $('mr-text').value = ''; $('mr-err').textContent = '';
  mapReportWhy = 'Inappropriate content'; document.querySelectorAll('#mr-why button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.why === mapReportWhy)));
  openM('m-mapreport');
}
if ($('mr-send')) {
  document.querySelectorAll('#mr-why button').forEach(b => b.addEventListener('click', () => { mapReportWhy = b.dataset.why; document.querySelectorAll('#mr-why button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
  $('mr-cancel').addEventListener('click', () => closeM('m-mapreport'));
  $('mr-send').addEventListener('click', async () => {
    if (!mapReportOf) return;
    const btn = $('mr-send'); btn.disabled = true; $('mr-err').textContent = '';
    try {
      const data = {uid: O.user.uid, message: 'Report: map ' + mapReportOf.id + ' — ' + mapReportWhy, details: $('mr-text').value.trim().slice(0, 1900),
        about: mapReportOf.id, aboutName: String(mapReportOf.name || '').slice(0, 16), createdAt: serverTimestamp()};
      if (O.profile && O.profile.name) data.name = O.profile.name;
      await addDoc(collection(db, 'feedback', 'other', 'entries'), data);
      closeM('m-mapreport'); API.toast('Report sent. Thank you.', 'good');
    } catch (e) { $('mr-err').textContent = 'Couldn’t send the report: ' + e.message; }
    btn.disabled = false;
  });
}
async function deleteMap(id) { needOnline(); await deleteDoc(mapRef(id)); delete O.mapRows[id]; }
Object.assign(window.JunctionOnline, {
  publishMap, loadMaps, myMaps, getMap, likeMap, submitMapRun, reportMap, deleteMap, myName,
  playMap(id) { return playMap(id); }, openMapBoard(id) { return openMapBoard(id); }
});

/* ============================================================ CO-OP
   coop/{id}: {host, hostName, members: {uid: {name, colour, at}}, invited: [uid], status 'open'|'playing'|'ended',
               seed, mode, createdAt, updatedAt, state (the host's serialized city, every few seconds), stateAt, meta, expireAt}
   coop/{id}/actions/{id}: {by, name, t, seq, act, k, k2, kind, payload, at} — a guest's tool action (or anyone's emote);
               the host marks it {done, ok, note} once applied, which is how the guest learns it was refused
   coop/{id}/cursors/{uid}: {x, y, name, colour, at} — where each player's pointer is, in world space
   The host plays a normal city (so it saves as usual) and pushes a snapshot every few seconds while others are in;
   guests show it through the spectate path and send their taps as actions. */
const COOP_PUSH = 3e3, COOP_BEAT = 15e3, COOP_CURSOR = 300, COOP_MEMBER_BEAT = 20e3, COOP_MEMBER_STALE = 90e3, COOP_HOST_QUIET = 40e3, COOP_LIVE = 3 * 60e3;
const COOP_MODES = ['chill', 'standard', 'frantic', 'zen'];
const COOP_NOTES = {chill: 'Slower parcels, more patience, extra road to start.', standard: 'The intended pace.', frantic: 'Parcels arrive fast and stores lose patience sooner.', zen: 'Nothing you build can lose the game.'};
const COOP_INV_KEEP = 2 * 864e5;
O.coop = null; O.coopInv = {}; O.coopMine = {};
let coopBox = null, coopPick = null, coopUnsubs = [], coopUid = null, coopSig = '';
const coopRef = id => doc(db, 'coop', id);
const coopMeta = () => { const st = API.state(), ci = API.coopCityInfo ? API.coopCityInfo() : {}; return {running: !!st.running, speed: st.speed, week: st.week | 0, score: st.score | 0, over: !!st.over, money: ci.money | 0}; };
const coopCompact = () => !!(window.matchMedia && window.matchMedia('(max-width:700px),(max-height:520px)').matches);
const coopColour = uid => { const C = O.coop, mem = (C && C.d && C.d.members) || {}; if (mem[uid] && mem[uid].colour) return mem[uid].colour; const used = Object.values(mem).map(m => m.colour); return AV_COLS.find(c => !used.includes(c)) || avColour(uid); };
const coopFreeColour = (members, uid) => { const used = Object.values(members || {}).map(m => m.colour); return AV_COLS.find(c => !used.includes(c)) || avColour(uid); };
/* invitations and my own sessions, kept up to date */
function startCoopListeners() {
  if (!O.user || coopUid === O.user.uid) return;
  coopUid = O.user.uid; coopUnsubs.forEach(u => u()); coopUnsubs = []; O.coopInv = {}; O.coopMine = {};
  const me = O.user.uid;
  coopUnsubs.push(onSnapshot(query(collection(db, 'coop'), where('invited', 'array-contains', me), limit(25)), snap => {
    snap.docChanges().forEach(ch => {
      const d = Object.assign({id: ch.doc.id}, ch.doc.data()), old = O.coopInv[d.id];
      if (ch.type === 'removed') { delete O.coopInv[d.id]; return; }
      O.coopInv[d.id] = d;
      if (!old && d.host !== me && d.status !== 'ended' && !isBlocked(d.host) && !isMuted(d.host) && !(d.members && d.members[me])
          && tms(d.updatedAt) > Date.now() - COOP_LIVE && !(O.coop && O.coop.id === d.id))
        API.toast(d.hostName + ' invited you to build a city together \u2014 open Co-op on the main menu', 'good');
    });
    coopBadge(); coopPaneRefresh();
  }, e => console.warn('Co-op invites unavailable', e)));
  coopUnsubs.push(onSnapshot(query(collection(db, 'coop'), where('host', '==', me), limit(12)), snap => {
    O.coopMine = {}; snap.forEach(x => { O.coopMine[x.id] = Object.assign({id: x.id}, x.data()); });
    // old finished sessions of mine are cleared away
    for (const d of Object.values(O.coopMine)) if (d.status === 'ended' && tms(d.updatedAt) && tms(d.updatedAt) < Date.now() - COOP_INV_KEEP) deleteDoc(coopRef(d.id)).catch(() => {});
    coopPaneRefresh();
  }, e => console.warn('Co-op sessions unavailable', e)));
}
setInterval(() => { if (O.ready && O.user) startCoopListeners(); }, 2000);
function coopOpenInvites() {
  const me = O.user ? O.user.uid : '', now = Date.now();
  return Object.values(O.coopInv).filter(d => d.host !== me && d.status !== 'ended' && tms(d.updatedAt) > now - COOP_LIVE && !isBlocked(d.host) && !isMuted(d.host) && !(O.coop && O.coop.id === d.id)).sort((a, b) => tms(b.updatedAt) - tms(a.updatedAt));
}
/* the pane only redraws when what it lists has changed (the host's snapshots would otherwise redraw it every few seconds) */
const coopPaneSig = () => JSON.stringify(Object.values(O.coopInv).concat(Object.values(O.coopMine)).map(d => [d.id, d.status, d.hostName, d.mode, Object.keys(d.members || {}).length, (d.meta || {}).week, tms(d.updatedAt) > Date.now() - COOP_LIVE]));
function coopPaneRefresh() { if (coopBox && coopBox.isConnected && coopPaneSig() !== coopSig) renderCoop(); }
function coopBadge() { const n = O.user ? coopOpenInvites().length : 0; document.querySelectorAll('.coop-badge').forEach(b => { b.textContent = n; b.hidden = !n; }); }
setInterval(coopBadge, 30e3);

/* ---- starting, joining, leaving */
async function coopCreate(mode, invite) {
  if (!O.ready || !O.user) { API.toast('Online features are still connecting \u2014 try again in a moment.', 'warn'); return; }
  if (!O.profile || !O.profile.name) { openUserModal(); return; }
  if (!COOP_MODES.includes(mode)) mode = 'standard';
  const me = O.user.uid;
  await coopLeave(true, true);
  for (const d of Object.values(O.coopMine)) if (d.status !== 'ended') await updateDoc(coopRef(d.id), {status: 'ended', updatedAt: serverTimestamp()}).catch(() => {});
  closeM('m-coop-invite'); stopWatching(true);
  O.slot = null; O.lastSaveStr = '';
  API.startCity(mode);
  const state = JSON.stringify(API.serialize());
  const data = {host: me, hostName: myName(), members: {[me]: {name: myName(), colour: AV_COLS[0], at: Date.now()}}, invited: invite && invite.uid ? [invite.uid] : [], status: 'open', seed: 0, mode,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), state, stateAt: serverTimestamp(), meta: coopMeta(), expireAt: new Date(Date.now() + COOP_INV_KEEP)};
  let ref;
  try { ref = await addDoc(collection(db, 'coop'), data); }
  catch (e) { API.toast('Couldn\u2019t start a co-op session: ' + e.message, 'warn'); return; }
  coopPick = null;
  coopEnter(ref.id, true, Object.assign({id: ref.id}, data));
  API.toast(invite && invite.name ? invite.name + ' has been invited \u2014 they join from Co-op on their menu' : 'Co-op session started \u2014 invite friends from the Co-op panel', 'good');
}
async function coopJoin(id) {
  if (!O.ready || !O.user) { API.toast('Online features are still connecting \u2014 try again in a moment.', 'warn'); return; }
  if (!O.profile || !O.profile.name) { openUserModal(); return; }
  const me = O.user.uid;
  let snap; try { snap = await getDoc(coopRef(id)); } catch (e) { API.toast('Couldn\u2019t open that session: ' + e.message, 'warn'); return; }
  if (!snap.exists() || snap.data().status === 'ended') { API.toast('That session has ended.', 'warn'); renderCoop(); return; }
  const d = Object.assign({id}, snap.data());
  if (d.host === me) { coopResume(d); return; }
  if (tms(d.updatedAt) < Date.now() - COOP_LIVE) { API.toast(d.hostName + ' doesn\u2019t seem to be online right now.', 'warn'); return; }
  const st = API.state();
  if (st.started && !st.atMenu && !st.over && !st.spectating && !st.tutorialMode) { API.saveNow(); cloudSave(true); API.toast('Your city is saved' + (O.slot ? ' in slot ' + O.slot : '') + ' \u2014 open it again from Save files.', 'tip'); }
  await coopLeave(true, true);
  const mine = {name: myName(), colour: coopFreeColour(d.members, me), at: Date.now()};
  try { await updateDoc(coopRef(id), {['members.' + me]: mine, updatedAt: serverTimestamp()}); }
  catch (e) { API.toast('Couldn\u2019t join: ' + e.message, 'warn'); return; }
  stopWatching(true); closeM('m-player'); closeM('m-board');
  d.members = Object.assign({}, d.members, {[me]: mine});
  const C = coopEnter(id, false, d);
  coopShowState(C, d);
  API.toast('You\u2019re in ' + d.hostName + '\u2019s city \u2014 pick a tool and build', 'good');
}
/* the host coming back to a session of theirs (after a reload, say): the last snapshot becomes their city again */
function coopResume(d) {
  let city = null; try { city = d.state ? JSON.parse(d.state) : null; } catch (e) {}
  if (!city || !API.loadCity(city)) { API.toast('That session\u2019s city couldn\u2019t be opened.', 'warn'); return; }
  O.slot = null; O.lastSaveStr = '';
  coopEnter(d.id, true, d);
  updateDoc(coopRef(d.id), {status: 'playing', updatedAt: serverTimestamp()}).catch(() => {});
}
function coopEnter(id, host, first) {
  const me = O.user.uid;
  const C = O.coop = {id, host, uid: me, d: first || null, key: '', loaded: false, stateStr: '', city: null, seq: 0, applied: new Set(), cursors: {}, curList: [], lastCur: 0, curQ: null, curT: null,
    lastPush: 0, lastState: '', lastBeat: Date.now(), lastMemberBeat: Date.now(), pending: {}, unsubs: [], ending: false, dirty: false, quiet: false};
  API.coopSet({id, host, uid: me, send: a => coopSend(a), cursor: (x, y) => coopCursor(x, y), end: why => coopEnd(why)});
  C.unsubs.push(onSnapshot(coopRef(id), snap => {
    if (O.coop !== C) return;
    if (!snap.exists()) { coopGone(C, 'The session was closed.'); return; }
    const d = Object.assign({id}, snap.data()); C.d = d;
    if (d.status === 'ended') { coopGone(C, null, d); return; }
    if (!host) {
      if (!d.members || !d.members[me]) { coopGone(C, 'You were taken out of the session.'); return; }
      coopShowState(C, d);
    }
    renderCoopHud();
  }, e => { console.warn('co-op', e); if (O.coop === C) coopNote('Lost connection: ' + e.message); }));
  C.unsubs.push(onSnapshot(query(collection(coopRef(id), 'actions'), where('t', '>', Date.now() - 60e3)), snap => {
    if (O.coop !== C) return;
    const adds = [];
    snap.docChanges().forEach(ch => {
      if (ch.type === 'removed') return;
      const a = Object.assign({id: ch.doc.id}, ch.doc.data());
      if (ch.type === 'added') adds.push(a);
      if (!host && a.by === me && a.done && C.pending[a.id]) { delete C.pending[a.id]; if (!a.ok) API.coopHint(a.note || 'The city couldn\u2019t do that.'); }
    });
    adds.sort((x, y) => (x.t - y.t) || (x.seq - y.seq));
    for (const a of adds) {
      if (C.applied.has(a.id)) continue; C.applied.add(a.id);
      if (a.act === 'emote') { if (a.by !== me && !isBlocked(a.by) && !isMuted(a.by)) API.coopEmote({uid: a.by, name: a.name, colour: coopColour(a.by), kind: String(a.kind || '').slice(0, 4)}); continue; }
      if (!host || a.by === me || a.done) continue;
      if (!(C.d && C.d.members && C.d.members[a.by])) continue;
      const r = API.coopApply(a);
      updateDoc(doc(coopRef(id), 'actions', a.id), {done: true, ok: !!r.ok, note: String(r.note || '').slice(0, 160)}).catch(() => {});
      if (r.ok) C.dirty = true;
    }
    if (host && C.dirty) coopPush(true);
  }, e => console.warn('co-op actions', e)));
  C.unsubs.push(onSnapshot(collection(coopRef(id), 'cursors'), snap => {
    if (O.coop !== C) return;
    snap.docChanges().forEach(ch => {
      if (ch.type === 'removed') { delete C.cursors[ch.doc.id]; return; }
      if (ch.doc.metadata.hasPendingWrites) return;
      const v = ch.doc.data(), o = C.cursors[ch.doc.id] || (C.cursors[ch.doc.id] = {uid: ch.doc.id});
      Object.assign(o, {x: +v.x || 0, y: +v.y || 0, name: String(v.name || 'Player'), colour: String(v.colour || coopColour(ch.doc.id)), at: Date.now()});   // arrival time, not the sender's clock
    });
    C.curList = Object.values(C.cursors).filter(c => C.d && C.d.members && C.d.members[c.uid]); API.coopCursors(C.curList);
  }, () => {}));
  C.timer = setInterval(() => coopTick(C), 1000);
  const hud = $('coop-hud'); hud.hidden = false; hud.classList.toggle('min', coopCompact());
  renderCoopHud();
  return C;
}
/* a guest showing the host's city: a new layout reloads it, otherwise only the numbers are patched */
function coopShowState(C, d) {
  if (!d.state) return;
  if (C.stateStr === d.state) { if (C.city && C.loaded) API.spectate.patch(C.city, d.meta); return; }
  let city = null; try { city = JSON.parse(d.state); } catch (e) { return; }
  C.stateStr = d.state; C.city = city;
  const key = layoutKey(city);
  if (!C.loaded || key !== C.key) {
    if (!API.spectate.enter(city, d.meta, C.loaded)) { coopNote('Couldn\u2019t show the city.'); return; }
    C.loaded = true; C.key = key;
  } else API.spectate.patch(city, d.meta);
}
function coopTick(C) {
  if (O.coop !== C) return;
  const now = Date.now(), st = API.state();
  if (C.host) {
    if (st.atMenu || !st.started || st.spectating || st.tutorialMode) { coopEnd('home'); return; }
    if (st.over) { coopEnd('over'); return; }
    const mem = (C.d && C.d.members) || {};
    const others = Object.keys(mem).filter(u => u !== C.uid);
    // members who stopped answering are taken out
    const gone = others.filter(u => mem[u] && +mem[u].at && now - mem[u].at > COOP_MEMBER_STALE);
    if (gone.length) { const up = {updatedAt: serverTimestamp()}; gone.forEach(u => { up['members.' + u] = deleteField(); }); updateDoc(coopRef(C.id), up).catch(() => {}); }
    if (C.dirty || (others.length && now - C.lastPush >= COOP_PUSH)) coopPush(C.dirty);
    else if (now - C.lastBeat >= COOP_BEAT) coopBeat(C);
  } else {
    if (now - C.lastMemberBeat >= COOP_MEMBER_BEAT) { C.lastMemberBeat = now; updateDoc(coopRef(C.id), {['members.' + C.uid + '.at']: now, updatedAt: serverTimestamp()}).catch(() => {}); }
    const quiet = C.d && tms(C.d.updatedAt) && now - tms(C.d.updatedAt) > COOP_HOST_QUIET;
    if (quiet !== C.quiet) { C.quiet = quiet; coopNote(quiet ? (C.d.hostName || 'The host') + ' seems to have lost connection\u2026' : ''); }
    for (const id in C.pending) if (now - C.pending[id] > 6000) { delete C.pending[id]; if (!C.waitedHint) { C.waitedHint = true; API.coopHint('Waiting for the host\u2019s city to answer\u2026'); } }
  }
}
async function coopPush(force) {
  const C = O.coop; if (!C || !C.host || C.ending) return;
  const now = Date.now();
  if (!force && now - C.lastPush < COOP_PUSH) return;
  if (force && now - C.lastPush < 500) { C.dirty = true; return; }
  C.dirty = false;
  let state; try { state = JSON.stringify(API.serialize()); } catch (e) { return; }
  if (state.length > MAX_STATE) { coopNote('The city is too big to share now.'); return; }
  const same = state === C.lastState; C.lastPush = now; C.lastBeat = now;
  const up = {meta: coopMeta(), updatedAt: serverTimestamp(), expireAt: new Date(now + COOP_INV_KEEP), status: 'playing'};
  if (!same) { up.state = state; up.stateAt = serverTimestamp(); C.lastState = state; }
  await updateDoc(coopRef(C.id), up).catch(e => console.warn('co-op push', e));
  renderCoopHud();
}
function coopBeat(C) { C.lastBeat = Date.now(); updateDoc(coopRef(C.id), {meta: coopMeta(), updatedAt: serverTimestamp(), expireAt: new Date(Date.now() + COOP_INV_KEEP)}).catch(() => {}); }
function coopNote(t) { const n = $('ch-note'); if (!n) return; n.textContent = t || ''; n.hidden = !t; }
/* a guest's action on its way to the host */
function coopSend(a) {
  const C = O.coop; if (!C || !a) return;
  const ref = doc(collection(coopRef(C.id), 'actions'));
  const data = {by: C.uid, name: myName(), t: Date.now(), seq: ++C.seq, act: String(a.act), k: Number.isFinite(+a.k) ? a.k | 0 : -1, k2: Number.isFinite(+a.k2) ? a.k2 | 0 : -1,
    kind: a.kind ? String(a.kind).slice(0, 16) : '', payload: a.payload === undefined || a.payload === null ? null : String(a.payload).slice(0, 32), at: serverTimestamp()};
  if (a.act !== 'emote') C.pending[ref.id] = Date.now();
  setDoc(ref, data).catch(e => { delete C.pending[ref.id]; API.coopHint('Couldn\u2019t send that: ' + e.message); });
}
function coopEmote(kind) {
  const C = O.coop; if (!C) return;
  API.coopEmote({uid: C.uid, name: myName(), colour: coopColour(C.uid), kind});
  coopSend({act: 'emote', k: -1, kind});
}
/* my pointer, at most a few times a second */
function coopCursor(x, y) {
  const C = O.coop; if (!C) return;
  C.curQ = [x, y];
  if (C.curT) return;
  const wait = Math.max(0, COOP_CURSOR - (Date.now() - C.lastCur));
  C.curT = setTimeout(() => {
    C.curT = null; if (O.coop !== C || !C.curQ) return;
    const [qx, qy] = C.curQ; C.curQ = null; C.lastCur = Date.now();
    setDoc(doc(coopRef(C.id), 'cursors', C.uid), {x: Math.round(qx), y: Math.round(qy), name: myName(), colour: coopColour(C.uid), at: serverTimestamp()}).catch(() => {});
  }, wait);
}
function coopTeardown(C) {
  C.unsubs.forEach(u => u()); clearInterval(C.timer); if (C.curT) clearTimeout(C.curT);
  if (O.coop === C) O.coop = null;
  API.coopSet(null); $('coop-hud').hidden = true; coopNote(''); closeM('m-coop-invite');
  deleteDoc(doc(coopRef(C.id), 'cursors', C.uid)).catch(() => {});
}
/* the session ended under a guest (or the doc vanished): keep a copy of the city, back to the menu */
function coopGone(C, msg, d) {
  if (O.coop !== C) return;
  const host = C.host;
  coopTeardown(C);
  if (host) { API.toast(msg || 'The co-op session has ended.'); return; }
  let saved = '';
  if (d && d.state) { try { const city = JSON.parse(d.state); saved = API.coopSaveCopy(d.mode || 'standard', city, (d.meta && d.meta.score) || city.score || 0, (d.meta && d.meta.week) || city.week || 1); } catch (e) {} }
  API.toast(msg || ((d && d.hostName) || 'The host') + ' ended the session' + (saved ? ' \u2014 a copy of the city is in your ' + API.diffLabel(saved) + ' slot 5' : ''), 'tip');
  if (API.state().spectating) API.spectate.exit(); else API.showStart();
}
async function coopLeave(silent, noExit) {
  const C = O.coop; if (!C) return;
  if (C.host) { await coopEnd(silent ? 'quiet' : 'leave'); return; }
  coopTeardown(C);
  await updateDoc(coopRef(C.id), {['members.' + C.uid]: deleteField(), updatedAt: serverTimestamp()}).catch(() => {});
  if (!silent) API.toast('You left ' + ((C.d && C.d.hostName) || 'the') + '\u2019s city.');
  if (!noExit && API.state().spectating) API.spectate.exit();
}
/* the host closes the session: the last snapshot goes out with status 'ended' so every guest keeps a copy */
async function coopEnd(why) {
  const C = O.coop; if (!C || !C.host || C.ending) return; C.ending = true;
  let state = null; try { const st = API.state(); if (st.started && !st.atMenu) state = JSON.stringify(API.serialize()); } catch (e) {}
  const up = {status: 'ended', updatedAt: serverTimestamp(), meta: coopMeta()};
  if (state && state.length <= MAX_STATE) { up.state = state; up.stateAt = serverTimestamp(); }
  coopTeardown(C);
  await updateDoc(coopRef(C.id), up).catch(() => {});
  if (why !== 'quiet') API.toast('Co-op session ended' + (why === 'over' ? '.' : ' \u2014 everyone keeps a copy of the city.'), 'tip');
}
API.events.on('over', () => { if (O.coop && O.coop.host) coopEnd('over'); });
/* leaving the view (Main menu while a guest) leaves the session */
{
  const _specExit0 = API.spectate.exit;
  API.spectate.exit = function () { const C = O.coop; if (C && !C.host) coopLeave(false, true); return _specExit0.call(API.spectate); };
}
window.addEventListener('pagehide', () => { const C = O.coop; if (!C) return; if (C.host) updateDoc(coopRef(C.id), {status: 'ended', updatedAt: serverTimestamp()}).catch(() => {}); else updateDoc(coopRef(C.id), {['members.' + C.uid]: deleteField(), updatedAt: serverTimestamp()}).catch(() => {}); });

/* ---- invitations */
async function coopInvite(uid, name) {
  if (!O.ready || !O.user) { API.toast('Online features are still connecting \u2014 try again in a moment.', 'warn'); return; }
  if (uid === O.user.uid) { API.toast('That\u2019s you.', 'warn'); return; }
  if (isBlocked(uid)) { API.toast('You\u2019ve blocked ' + name + '.', 'warn'); return; }
  const C = O.coop;
  if (C && C.host) {
    if (C.d && C.d.members && C.d.members[uid]) { API.toast(name + ' is already in the city.'); return; }
    try {
      await runTransaction(db, async tx => { const x = await tx.get(coopRef(C.id)); if (!x.exists()) throw new Error('The session has ended.'); const inv = (x.data().invited || []).filter(u => u !== uid).concat([uid]).slice(-40); tx.update(coopRef(C.id), {invited: inv, updatedAt: serverTimestamp()}); });
      API.toast(name + ' invited \u2014 they join from Co-op on their menu', 'good');
    }
    catch (e) { API.toast('Couldn\u2019t invite: ' + e.message, 'warn'); }
    return;
  }
  if (C) { API.toast('Only the host can invite players.', 'warn'); return; }
  coopPick = {uid, name}; closeM('m-player'); closeM('m-board'); closeM('m-run');
  if (API.showMenuPane) API.showMenuPane('coop');
}
async function openCoopInvite() {
  const C = O.coop; if (!C || !C.host) return;
  $('ci-err').textContent = ''; $('ci-name').value = '';
  $('ci-list').innerHTML = '<p class="mini">Loading friends\u2026</p>';
  openM('m-coop-invite');
  const list = (await loadFriends()).filter(f => !isBlocked(f.uid));
  if ($('m-coop-invite').hidden) return;
  const d = C.d || {}, inv = d.invited || [], mem = d.members || {};
  $('ci-list').innerHTML = list.length ? list.map(f => '<div class="ci-row"><span class="av" style="background:' + avColour(f.uid) + '">' + esc(String(f.name).charAt(0).toUpperCase()) + '</span><b>' + esc(f.name) + '</b>' +
    (mem[f.uid] ? '<span class="mini">In the city</span>' : inv.includes(f.uid) ? '<span class="mini">\u2713 Invited</span>' : '<button type="button" class="act small" data-ci="' + esc(f.uid) + '" data-name="' + esc(f.name) + '">Invite</button>') + '</div>').join('')
    : '<p class="mini">No friends yet \u2014 invite someone by their username above, or add friends from the Friends page.</p>';
  $('ci-list').querySelectorAll('[data-ci]').forEach(b => b.onclick = async () => { b.disabled = true; await coopInvite(b.dataset.ci, b.dataset.name); openCoopInvite(); });
}
$('ci-close').addEventListener('click', () => closeM('m-coop-invite'));
$('ci-go').addEventListener('click', async () => {
  const n = $('ci-name').value.trim(); $('ci-err').textContent = '';
  if (!NAME_RE.test(n)) { $('ci-err').textContent = 'Usernames are 3\u201316 letters, numbers, _ or -.'; return; }
  try {
    const u = await getDoc(nameRef(n.toLowerCase()));
    if (!u.exists() || !u.data().uid) { $('ci-err').textContent = 'No player called ' + n + '.'; return; }
    await coopInvite(u.data().uid, n); openCoopInvite();
  } catch (e) { $('ci-err').textContent = e.message; }
});
$('ci-name').addEventListener('keydown', e => { if (e.key === 'Enter') $('ci-go').click(); });

/* ---- the panel beside the city */
function renderCoopHud() {
  const C = O.coop, box = $('coop-hud'); if (!box) return;
  if (!C) { box.hidden = true; return; }
  box.hidden = false;
  const d = C.d || {}, mem = d.members || {}, me = C.uid;
  $('ch-sub').textContent = (d.hostName || myName()) + '\u2019s city';
  $('ch-members').innerHTML = Object.entries(mem).sort((a, b) => (+a[1].at || 0) - (+b[1].at || 0)).map(([u, m]) =>
    '<span class="ch-m' + (u === me ? ' me' : '') + '" title="' + esc(m.name || '') + '"><i style="background:' + esc(m.colour || coopColour(u)) + '"></i>' + esc(m.name || 'Player') + (u === d.host ? '<em>host</em>' : '') + '</span>').join('');
  const ci = API.coopCityInfo ? API.coopCityInfo() : {};
  $('ch-stats').innerHTML = '<span><b>' + money(ci.money || 0) + '</b> shared cash</span><span><b>Week ' + (ci.week || 1) + '</b></span><span><b>' + (ci.score || 0).toLocaleString() + '</b> parcels</span>';
  $('ch-invite').hidden = !C.host; $('ch-end').hidden = !C.host; $('ch-leave').hidden = C.host;
}
setInterval(() => { if (O.coop) renderCoopHud(); }, 1000);
$('coop-hud').addEventListener('click', e => {
  const em = e.target.closest('[data-emote]'); if (em) { coopEmote(em.dataset.emote); return; }
  if (e.target.closest('.ch-head')) $('coop-hud').classList.toggle('min');
});
$('ch-invite').addEventListener('click', openCoopInvite);
$('ch-leave').addEventListener('click', async () => { if (await API.ask({title: 'Leave the city?', text: 'You can come back while the session is open.', ok: 'Leave'})) coopLeave(false); });
$('ch-end').addEventListener('click', async () => { if (await API.ask({title: 'End the session?', text: 'Everyone keeps a copy of the city; yours is saved as usual and you carry on alone.', ok: 'End session', danger: true})) coopEnd('end'); });

/* ---- the Co-op section of the main menu */
function renderCoop(box) {
  coopBox = box || coopBox; if (!coopBox || !coopBox.isConnected) { coopBox = null; return; }
  if (!O.ready || !O.user) { coopBox.innerHTML = '<p class="mini">Co-op needs the online service \u2014 it\u2019s still connecting, or unavailable right now.</p>'; return; }
  if (!O.profile || !O.profile.name) { coopBox.innerHTML = '<p class="mini">Pick a username first, then you can build with friends.</p><button class="bigbtn" type="button" id="coop-pick-name">Pick a username</button>'; $('coop-pick-name').onclick = () => openUserModal(); return; }
  startCoopListeners();
  const me = O.user.uid, now = Date.now();
  const invs = coopOpenInvites();
  const mine = Object.values(O.coopMine).filter(d => d.status !== 'ended' && tms(d.updatedAt) > now - COOP_LIVE * 4).sort((a, b) => tms(b.updatedAt) - tms(a.updatedAt))[0];
  const row = (d, own) => { const n = Object.keys(d.members || {}).length, m = d.meta || {};
    return '<div class="iso-row"><span class="av" style="background:' + coopColour(d.host) + '">' + esc(String(d.hostName || '?').charAt(0).toUpperCase()) + '</span><span class="iso-who"><b>' + (own ? 'Your city' : esc(d.hostName) + '\u2019s city') + '</b><small>' +
      esc(API.diffLabel(d.mode || 'standard')) + ' \u00b7 week ' + (m.week || 1) + ' \u00b7 ' + n + (n === 1 ? ' player' : ' players') + ' \u00b7 ' + (d.status === 'playing' ? 'playing' : 'open') + ' \u00b7 ' + ago(d.updatedAt) + '</small></span>' +
      '<span class="iso-acts">' + (own ? '<button type="button" class="bigbtn small" data-cjoin="' + esc(d.id) + '">Resume</button><button type="button" class="act small" data-cend="' + esc(d.id) + '">End</button>'
        : '<button type="button" class="bigbtn small" data-cjoin="' + esc(d.id) + '">Join</button>') + '</span></div>'; };
  let h = '<div class="coop-intro"><p><b>Build one city together.</b> The host\u2019s city runs on their screen; everyone they invite can lay roads, place lights, lots and bays, upgrade stores and hire trucks from the shared budget. You see each other\u2019s cursors and reactions as you go. When the host leaves, everyone keeps a copy of the city.</p></div>';
  if (coopPick) h += '<div class="coop-pick"><span>Start a city with <b>' + esc(coopPick.name) + '</b> \u2014 pick a mode below and they\u2019re invited.</span><button type="button" class="linkbtn" id="coop-pick-x">Not now</button></div>';
  h += '<h3>Invitations</h3>' + (invs.length ? invs.map(d => row(d, false)).join('') : '<p class="mini">Nobody has invited you yet. A friend can invite you from their Co-op panel, or from your name on their Friends page.</p>');
  if (mine) h += '<h3>Your session</h3>' + row(mine, true);
  h += '<h3>' + (coopPick ? 'Start a city with ' + esc(coopPick.name) : 'New session') + '</h3><div class="coop-modes">' + COOP_MODES.map(m => '<button type="button" class="coop-mode" data-cmode="' + m + '"><b>' + esc(API.diffLabel(m)) + '</b><small>' + esc(COOP_NOTES[m]) + '</small></button>').join('') + '</div>';
  coopBox.innerHTML = h; coopSig = coopPaneSig();
  coopBox.querySelectorAll('[data-cmode]').forEach(b => b.onclick = () => { b.disabled = true; coopCreate(b.dataset.cmode, coopPick); });
  coopBox.querySelectorAll('[data-cjoin]').forEach(b => b.onclick = () => { b.disabled = true; coopJoin(b.dataset.cjoin); });
  coopBox.querySelectorAll('[data-cend]').forEach(b => b.onclick = async () => { b.disabled = true; await updateDoc(coopRef(b.dataset.cend), {status: 'ended', updatedAt: serverTimestamp()}).catch(() => {}); renderCoop(); });
  const px = $('coop-pick-x'); if (px) px.onclick = () => { coopPick = null; renderCoop(); };
}
Object.assign(window.JunctionOnline, {
  coopCreate(mode, invite) { return coopCreate(mode, invite); }, coopJoin(id) { return coopJoin(id); }, coopInvite(uid, name) { return coopInvite(uid, name); },
  coopLeave(silent) { return coopLeave(silent); }, renderCoop(box) { renderCoop(box); },
  coopInfo() { const C = O.coop; return C ? {id: C.id, host: C.host, members: (C.d && C.d.members) || {}, status: C.d && C.d.status} : null; }
});


/* ===== p68: Google sign-in for the installed apps. A browser tab does the Google part; the app collects the result. ===== */
const NATIVE_APP = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) || /Electron/i.test(navigator.userAgent || '');
const HANDOFF_HOST = 'https://junction-rm.web.app/';
const handoffCode = () => { const a = new Uint8Array(20); crypto.getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); };
async function openOutside(url) {
  const B = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
  if (B && B.open) { try { await B.open({url}); return; } catch (e) {} }
  window.open(url, '_blank');
}
let handoffRun = 0;
async function nativeGoogle() {
  const run = ++handoffRun, err = $('user-err'), name = $('user-name').value.trim(), code = handoffCode(), ref = doc(db, 'authHandoff', code);
  err.textContent = 'Finish signing in with Google in your browser, then come back here\u2026';
  await openOutside(HANDOFF_HOST + '?applogin=' + code);
  const until = Date.now() + 5 * 60e3; let data = null;
  const check = async () => { try { const s = await getDoc(ref); if (s.exists()) data = s.data(); } catch (e) {} };
  const onVis = () => { if (!document.hidden && !data) check(); }; document.addEventListener('visibilitychange', onVis);
  while (run === handoffRun && Date.now() < until && !data) { await new Promise(r => setTimeout(r, 2000)); if (!data) await check(); }
  document.removeEventListener('visibilitychange', onVis);
  if (run !== handoffRun) return;
  if (!data) { err.textContent = 'Google sign-in timed out. Press Continue with Google to try again.'; return; }
  deleteDoc(ref).catch(() => {});
  try {
    err.textContent = '';
    const cred = GoogleAuthProvider.credential(data.idToken), keep = NAME_RE.test(name) ? name : '';
    if (O.user && O.user.isAnonymous) {
      try { await linkWithCredential(O.user, cred); }
      catch (e) {
        if (!String(e.code).includes('credential-already-in-use')) throw e;
        await dropLive(); O.pendingName = keep;
        await signInWithCredential(auth, GoogleAuthProvider.credentialFromError(e) || cred);   // an existing account: onAuthStateChanged takes over
        closeM('m-user'); return;
      }
    } else { await dropLive(); O.pendingName = keep; await signInWithCredential(auth, cred); closeM('m-user'); return; }
    await afterPermanent(keep || (O.profile && O.profile.name) || '');
  } catch (e) { err.textContent = e.code ? friendlyAuthError(e) : e.message; }
}
if (NATIVE_APP) {
  const mu = $('m-user');
  if (mu) mu.addEventListener('click', ev => { const b = ev.target.closest && ev.target.closest('#user-google'); if (!b) return; ev.stopImmediatePropagation(); ev.preventDefault(); nativeGoogle(); }, true);
}

/* the browser side: https://junction-rm.web.app/?applogin=CODE shows one Google button and files the result for the app */
(function () {
  const code = new URLSearchParams(location.search).get('applogin');
  if (!code || !/^[0-9a-f]{40}$/.test(code) || NATIVE_APP) return;
  const wrap = document.createElement('div');
  wrap.id = 'applogin';
  wrap.setAttribute('style', 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;background:#0b2029;color:#eef4f3;font:16px/1.5 system-ui,sans-serif');
  wrap.innerHTML = '<div style="max-width:420px;width:100%;padding:24px;border-radius:18px;background:#143845;box-shadow:0 10px 40px rgba(0,0,0,.4);text-align:center">' +
    '<div style="font:italic 900 30px/1 system-ui,sans-serif;letter-spacing:.04em;margin-bottom:10px">JUNCTION</div>' +
    '<p id="al-msg" style="margin:0 0 16px">Sign in with Google for the Junction app. When it\u2019s done, come back to the app: it signs in by itself.</p>' +
    '<button id="al-go" type="button" style="cursor:pointer;border:0;border-radius:12px;padding:12px 22px;font:800 16px system-ui,sans-serif;background:#ffc933;color:#10262f">Continue with Google</button></div>';
  document.body.appendChild(wrap);
  const msg = wrap.querySelector('#al-msg'), go = wrap.querySelector('#al-go');
  go.addEventListener('click', async () => {
    go.disabled = true; msg.textContent = 'Opening Google\u2026';
    try {
      const r = await signInWithPopup(auth, new GoogleAuthProvider()), c = GoogleAuthProvider.credentialFromResult(r);
      if (!c || !c.idToken) throw new Error('Google did not return a sign-in token. Try again.');
      await setDoc(doc(db, 'authHandoff', code), {idToken: c.idToken, at: serverTimestamp()});
      msg.textContent = 'You\u2019re signed in. You can close this tab and go back to the Junction app.'; go.hidden = true;
    } catch (e) { msg.textContent = (e && e.code === 'auth/popup-closed-by-user') ? 'The Google window was closed. Press the button to try again.' : 'That didn\u2019t work: ' + (e.message || e.code || e); go.disabled = false; }
  });
})();
