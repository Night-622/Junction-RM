/* =====================================================================
   Junction online: accounts, cloud save files, leaderboard, live viewing.
   Loaded as a module after game.js. It talks to the game only through
   window.JunctionAPI, and if anything here fails the game keeps working
   offline exactly as before.

   Firestore layout
     users/{uid}                 name, nameLower, star, liveCode (accounts only)
     users/{uid}/saves/{1|2|3}   data (serialized city, as a string), score, week, diffKey, over, updatedAt
     usernames/{nameLower}       uid   — names claimed by permanent accounts
     leaderboard/{uid}           name, star, parcels, weeks, goalsSec (+ which difficulty each came from)
     live/{6-digit code}         uid, name, star, playing, state, meta, watchT — the live view channel
     feedback/{auto id}          kind, message, replyTo, details, uid, name, createdAt — write-only for players
   ===================================================================== */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js';
import { getAnalytics, isSupported } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-analytics.js';
import {
  getAuth, onAuthStateChanged, signInAnonymously, signOut,
  GoogleAuthProvider, EmailAuthProvider, linkWithPopup, linkWithCredential,
  signInWithPopup, signInWithCredential, signInWithEmailAndPassword, createUserWithEmailAndPassword
} from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, orderBy, limit,
  onSnapshot, runTransaction, serverTimestamp, deleteField, addDoc
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
const SLOTS = ['1', '2', '3'];
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
  best: {parcels: 0, weeks: 0, goalsSec: 0}, lastBoardAt: 0,
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
function nameHTML(name, star) { return esc(name) + (star ? ' <span class="star" title="Permanent account">★</span>' : ''); }
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
  if (O.user && O.user.uid !== user.uid) { O.slot = null; O.lastSaveStr = ''; O.best = {parcels: 0, weeks: 0, goalsSec: 0}; }
  O.user = user;
  try {
    await loadProfile();
    if (O.pendingName && isPerm() && !(O.profile && O.profile.name)) await claimName(O.pendingName);
  } catch (e) { console.warn(e); }
  O.ready = true;
  renderAccount();
  loadBest();
  await setupLive();
  if (needsName()) openUserModal();
});
const needsName = () => !O.profile || !O.profile.name || (isPerm() && !O.profile.star);

async function loadProfile() {
  const snap = await getDoc(doc(db, 'users', O.user.uid));
  O.profile = snap.exists() ? snap.data() : null;
}

/* Guests pick any free name and can change it. Permanent accounts reserve it for good. */
async function saveGuestName(name) {
  const lower = name.toLowerCase();
  const taken = await getDoc(doc(db, 'usernames', lower));
  if (taken.exists() && taken.data().uid !== O.user.uid) throw new Error('That name belongs to a permanent account. Try another.');
  const data = {name, nameLower: lower, star: false, updatedAt: serverTimestamp()};
  await setDoc(doc(db, 'users', O.user.uid), data, {merge: true});
  O.profile = Object.assign({}, O.profile, data);
  syncBoardName();
}
async function claimName(name) {
  if (!NAME_RE.test(name || '')) throw new Error('Type the username you want to keep.');
  const lower = name.toLowerCase(), uid = O.user.uid;
  await O.user.getIdToken(true);                  // make sure the token already says "permanent account"
  await runTransaction(db, async tx => {
    const uref = doc(db, 'usernames', lower), pref = doc(db, 'users', uid);
    const u = await tx.get(uref);
    if (u.exists() && u.data().uid !== uid) throw new Error('That username is taken. Pick another.');
    if (!u.exists()) tx.set(uref, {uid});
    tx.set(pref, {name, nameLower: lower, star: true, updatedAt: serverTimestamp()}, {merge: true});
  });
  O.profile = Object.assign({}, O.profile, {name, nameLower: lower, star: true});
  O.pendingName = '';
  syncBoardName();
}
async function syncBoardName() {
  try {
    const ref = doc(db, 'leaderboard', O.user.uid), s = await getDoc(ref);
    if (s.exists()) await updateDoc(ref, {name: myName(), star: isPerm()});
  } catch (e) { /* no board entry yet */ }
  if (O.liveCode) updateDoc(doc(db, 'live', O.liveCode), {name: myName(), star: isPerm()}).catch(() => {});
}

/* ------------------------------------------------------------ user modal */
function openUserModal() {
  const perm = isPerm(), hasName = !!(O.profile && O.profile.name), claimed = perm && !!(O.profile && O.profile.star);
  $('user-title').textContent = claimed ? 'Your account' : perm ? 'Pick your permanent username' : hasName ? 'Account' : 'Pick a username';
  $('user-lead').innerHTML = claimed
    ? 'Signed in as ' + nameHTML(myName(), true) + (O.user.email ? ' (' + esc(O.user.email) + ')' : '') + '. Your name is permanent.'
    : perm ? 'Your account is ready \u2014 choose the name you\u2019ll keep for good. It gets a \u2605 on the leaderboard.'
    : 'This is the name other players see on the leaderboard and when they watch your city.';
  $('user-name').value = hasName ? myName() : '';
  $('user-name').disabled = claimed;
  $('user-guest').textContent = claimed ? 'Sign out' : perm ? 'Claim this name' : hasName ? 'Save name' : 'Play as a guest';
  $('user-cancel').hidden = !hasName || (perm && !claimed);
  $('user-perm').hidden = perm;
  $('user-err').textContent = '';
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
    O.profile = null; O.slot = null; O.best = {parcels: 0, weeks: 0, goalsSec: 0};
    closeM('m-user'); await signOut(auth);          // onAuthStateChanged signs in a new guest and asks for a name
    return;
  }
  const n = typedName(); if (!n) return;
  if (isPerm()) {                                   // account without a name yet: reserve it
    await claimName(n); await setupLive(false);
    closeM('m-user'); renderAccount(); loadBest();
    API.toast('Welcome, ' + n + ' \u2605', 'good'); return;
  }
  await saveGuestName(n);
  closeM('m-user'); renderAccount();
  API.toast('Playing as ' + n, 'good');
}));
$('user-cancel').addEventListener('click', () => closeM('m-user'));
$('user-name').addEventListener('keydown', e => { if (e.key === 'Enter') $('user-guest').click(); });

/* Upgrading: a guest links Google or email to the same user id, so their saves come along.
   If that Google/email already has its own account, we switch to it instead. */
async function afterPermanent(name) {
  await O.user.reload(); O.user = auth.currentUser;
  await loadProfile();
  if (!(O.profile && O.profile.star)) {
    try { await claimName(name); }
    catch (e) { O.pendingName = ''; openUserModal(); $('user-err').textContent = n ? e.message : ''; return; }
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
  const taken = await getDoc(doc(db, 'usernames', n.toLowerCase()));
  if (taken.exists() && taken.data().uid !== O.user.uid) throw new Error('That username is taken. Pick another.');
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
  const sa = $('start-account');
  sa.hidden = false;
  sa.innerHTML = '<span>Playing as <b>' + nameHTML(myName(), isPerm()) + '</b>' + (isPerm() ? '' : ' <small>(guest)</small>') + '</span>' +
    '<button class="linkbtn" type="button" id="start-acct-btn">' + (isPerm() ? 'Account' : 'Change name or sign in') + '</button>';
  $('start-acct-btn').addEventListener('click', () => openUserModal());
  $('btn-saves').hidden = false;
  $('start-online').hidden = false;
  $('online-sec').hidden = false;
  $('acct-line').innerHTML = '<b>' + nameHTML(myName(), isPerm()) + '</b><small>' + (isPerm() ? (O.user.email || 'Permanent account') : 'Guest on this browser') + '</small>';
  $('btn-account').textContent = isPerm() ? 'Account' : 'Sign in or upgrade';
  renderLiveCode();
}
$('btn-account').addEventListener('click', () => { $('menu').hidden = true; openUserModal(); });

/* ============================================================ SAVE FILES */
let savesMode = 'load';
const slotRef = n => doc(db, 'users', O.user.uid, 'saves', n);
async function openSaves(mode) {
  if (!O.ready) return;
  savesMode = mode || 'load';
  $('menu').hidden = true;
  $('saves-title').textContent = savesMode === 'new' ? 'Pick a slot for your new city' : 'Save files';
  $('saves-lead').textContent = isPerm()
    ? 'Three cloud save slots, kept with your account on any device.'
    : 'Three cloud save slots for this browser. Make a permanent account to keep them everywhere.';
  $('saves-diff').textContent = 'New cities use the difficulty picked on the start screen: ' + API.diffLabel(API.startDiff) + '.';
  $('save-slots').innerHTML = '<p class="mini">Loading\u2026</p>';
  openM('m-saves');
  await cloudSave(true);
  const rows = await Promise.all(SLOTS.map(n => getDoc(slotRef(n)).then(s => [n, s.exists() ? s.data() : null]).catch(() => [n, null])));
  const box = $('save-slots'); box.innerHTML = '';
  for (const [n, d] of rows) {
    const el = document.createElement('div'); el.className = 'slot-card' + (O.slot === n ? ' current' : '');
    let desc, btns = '';
    if (d && d.data && !d.over) {
      desc = '<b>Week ' + d.week + '</b> \u00b7 ' + d.score + ' parcels \u00b7 ' + esc(API.diffLabel(d.diffKey)) + '<small>Saved ' + ago(d.updatedAt) + (O.slot === n ? ' \u00b7 playing now' : '') + '</small>';
      btns = '<button class="bigbtn" data-act="load" type="button">Continue</button><button class="act" data-act="new" type="button">New city here</button><button class="act danger" data-act="del" type="button">Delete</button>';
    } else if (d && d.over) {
      desc = '<b>Finished</b> \u00b7 week ' + d.week + ', ' + d.score + ' parcels \u00b7 ' + esc(API.diffLabel(d.diffKey)) + '<small>' + ago(d.updatedAt) + '</small>';
      btns = '<button class="bigbtn" data-act="new" type="button">New city here</button><button class="act danger" data-act="del" type="button">Clear</button>';
    } else {
      desc = '<b>Empty slot</b><small>Nothing saved yet</small>';
      btns = '<button class="bigbtn" data-act="new" type="button">New city here</button>';
    }
    el.innerHTML = '<div class="slotnum">' + n + '</div><div class="slotinfo">' + desc + '</div><div class="slotbtns">' + btns + '</div>';
    el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => slotAction(n, b.dataset.act, d)));
    box.append(el);
  }
}
async function slotAction(n, act, d) {
  if (act === 'load') {
    let city = null; try { city = JSON.parse(d.data); } catch (e) {}
    if (!city || !API.loadCity(city)) { API.toast('That save file couldn\u2019t be opened.', 'warn'); return; }
    O.slot = n; O.lastSaveAt = Date.now(); O.lastSaveStr = d.data;
    API.toast('Slot ' + n + ' loaded \u2014 week ' + d.week, 'good');
  } else if (act === 'new') {
    if (d && d.data && !d.over && !confirm('Replace the city in slot ' + n + ' (week ' + d.week + ', ' + d.score + ' parcels) with a new one?')) return;
    O.slot = n; O.lastSaveStr = '';
    API.startCity(API.startDiff);
    setTimeout(() => cloudSave(true), 400);
  } else if (act === 'del') {
    if (!confirm('Delete slot ' + n + '? This can\u2019t be undone.')) return;
    await deleteDoc(slotRef(n)).catch(e => API.toast('Couldn\u2019t delete: ' + e.message, 'warn'));
    if (O.slot === n) O.slot = null;
    openSaves(savesMode);
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
  submitBest({parcels: e.score, weeks: e.week, diff: e.diffKey});
  if (O.ready && O.slot) {
    await setDoc(slotRef(O.slot), {data: deleteField(), score: e.score, week: e.week, diffKey: e.diffKey, over: true, updatedAt: serverTimestamp()}, {merge: true}).catch(() => {});
  }
  O.slot = null;
  pushLive(true);
});
API.events.on('allGoals', e => { if (e.diffKey !== 'zen') submitBest({goalsSec: Math.max(1, Math.round(e.clock)), diff: e.diffKey}); });
window.addEventListener('pagehide', () => { cloudSave(true); });

/* ============================================================ LEADERBOARD
   One document per player holding their personal bests. Zen and the tutorial don't count. */
async function loadBest() {
  try {
    const s = await getDoc(doc(db, 'leaderboard', O.user.uid));
    const d = s.exists() ? s.data() : {};
    O.best = {parcels: d.parcels || 0, weeks: d.weeks || 0, goalsSec: d.goalsSec || 0};
  } catch (e) { O.best = {parcels: 0, weeks: 0, goalsSec: 0}; }
}
function maybeBoard(force) {
  const st = API.state();
  if (!st.started || st.atMenu || st.tutorialMode || st.spectating || st.over) return;
  if (!force && Date.now() - O.lastBoardAt < 60e3) return;
  O.lastBoardAt = Date.now();
  submitBest({parcels: st.score, weeks: st.week, diff: st.diffKey});
}
async function submitBest({parcels, weeks, goalsSec, diff}) {
  if (!O.ready || !O.profile || !O.profile.name || diff === 'zen') return;
  const up = {};
  if (parcels > O.best.parcels) { up.parcels = parcels; up.parcelsDiff = diff; }
  if (weeks > O.best.weeks) { up.weeks = weeks; up.weeksDiff = diff; }
  if (goalsSec && (!O.best.goalsSec || goalsSec < O.best.goalsSec)) { up.goalsSec = goalsSec; up.goalsDiff = diff; }
  if (!Object.keys(up).length) return;
  Object.assign(O.best, {parcels: Math.max(O.best.parcels, parcels || 0), weeks: Math.max(O.best.weeks, weeks || 0)});
  if (up.goalsSec) O.best.goalsSec = up.goalsSec;
  try {
    await setDoc(doc(db, 'leaderboard', O.user.uid), Object.assign({
      name: myName(), star: isPerm(), parcels: O.best.parcels, weeks: O.best.weeks, updatedAt: serverTimestamp()
    }, up), {merge: true});
    if (up.goalsSec) API.toast('New personal best: every goal in ' + mmss(up.goalsSec), 'good');
  } catch (e) { console.warn('Leaderboard update failed', e); }
}
const BOARDS = {
  parcels: {field: 'parcels', dir: 'desc', diff: 'parcelsDiff', fmt: v => v.toLocaleString() + ' parcels', note: 'Most parcels delivered in a single city.'},
  weeks: {field: 'weeks', dir: 'desc', diff: 'weeksDiff', fmt: v => 'Week ' + v, note: 'Furthest week reached in a single city.'},
  goals: {field: 'goalsSec', dir: 'asc', diff: 'goalsDiff', fmt: v => mmss(v), note: 'Quickest game time to finish every goal in one city.'}
};
let boardTab = 'parcels';
async function openBoard(tab) {
  boardTab = tab || boardTab;
  $('menu').hidden = true;
  document.querySelectorAll('#board-tabs button').forEach(b => b.setAttribute('aria-pressed', b.dataset.board === boardTab ? 'true' : 'false'));
  const B = BOARDS[boardTab];
  $('board-note').textContent = B.note + ' Zen and tutorial runs don\u2019t count. \u2605 marks permanent accounts.';
  $('board-list').innerHTML = '<li class="mini">Loading\u2026</li>';
  $('board-me').textContent = '';
  if ($('m-board').hidden) openM('m-board');
  try {
    const snap = await getDocs(query(collection(db, 'leaderboard'), orderBy(B.field, B.dir), limit(25)));
    const rows = []; let meIn = false;
    snap.forEach(s => {
      const d = s.data(); if (!(d[B.field] > 0)) return;
      const me = O.user && s.id === O.user.uid; if (me) meIn = true;
      rows.push('<li class="' + (me ? 'me' : '') + '"><span class="rank">' + (rows.length + 1) + '</span><span class="who">' + nameHTML(d.name || '?', d.star) +
        '</span><span class="dk">' + esc(API.diffLabel(d[B.diff] || '')) + '</span><b class="num">' + B.fmt(d[B.field]) + '</b></li>');
    });
    $('board-list').innerHTML = rows.join('') || '<li class="mini">No entries yet \u2014 be the first.</li>';
    const mine = boardTab === 'goals' ? O.best.goalsSec : O.best[boardTab];
    $('board-me').innerHTML = mine > 0 ? 'Your best: <b>' + B.fmt(mine) + '</b>' + (meIn ? '' : ' (outside the top 25)') : (boardTab === 'goals' ? 'Finish all ' + API.goalsTotal + ' goals in one city to get on this board.' : '');
  } catch (e) {
    $('board-list').innerHTML = '<li class="mini">Couldn\u2019t load the leaderboard: ' + esc(e.message) + '</li>';
  }
}
document.querySelectorAll('#board-tabs button').forEach(b => b.addEventListener('click', () => openBoard(b.dataset.board)));
$('btn-board').addEventListener('click', () => openBoard());
$('btn-board-s').addEventListener('click', () => openBoard());
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
      await setDoc(ref, {uid: O.user.uid, name: myName(), star: isPerm(), playing: false, state: null, meta: null, stateAt: null, updatedAt: serverTimestamp(), expireAt: new Date(Date.now() + 864e5)});
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
  renderLiveCode();
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
$('watch-go').addEventListener('click', async () => {
  const code = $('watch-code').value;
  if (!/^\d{6}$/.test(code)) { $('watch-err').textContent = 'Live codes are 6 digits.'; return; }
  if (code === O.liveCode) { $('watch-err').textContent = 'That\u2019s your own code.'; return; }
  $('watch-go').disabled = true;
  try {
    const s = await getDoc(doc(db, 'live', code));
    if (!s.exists()) { $('watch-err').textContent = 'No player has that code right now.'; return; }
    const d = s.data();
    if (d.uid === O.user.uid) { $('watch-err').textContent = 'That\u2019s your own code.'; return; }
    closeM('m-watch');
    startWatching(code, d);
  } catch (e) { $('watch-err').textContent = 'Couldn\u2019t reach that player: ' + e.message; }
  finally { $('watch-go').disabled = false; }
});

/* The shape of a city: anything that changes the roads or buildings. When it differs from the last
   snapshot we reload the whole city; otherwise we only patch the numbers so the traffic keeps moving. */
function layoutKey(d) {
  return JSON.stringify([d.span, d.water.length, d.road, d.links, d.sign, d.special, d.lights, d.oneway, d.parks, d.depots, d.motorways, d.juncLvl, d.keepLeft, d.perks, d.carsBought, d.diffKey,
    d.buildings.map(b => [b.k, b.type, b.color, b.tier, b.lvl, b.trucks, b.vans, b.extra, b.ups])]);
}
function startWatching(code, first) {
  stopWatching(true);
  const st = API.state();
  if (st.started && !st.atMenu && !st.over && !st.spectating && !st.tutorialMode) {
    API.saveNow(); cloudSave(true);
    API.toast('Your city is saved' + (O.slot ? ' in slot ' + O.slot : '') + ' \u2014 open it again from Save files.', 'tip');
  }
  const S = O.spec = {code, name: first.name, star: first.star, key: '', unsub: null, ping: null, loaded: false, lastStateAt: 0};
  const bar = $('spec-bar'); bar.hidden = false;
  setSpecText('Connecting to ' + nameHTML(first.name, first.star) + '\u2026');
  const ping = () => updateDoc(doc(db, 'live', code), {watchT: serverTimestamp()}).catch(() => {});
  ping(); S.ping = setInterval(ping, WATCH_PING);
  S.unsub = onSnapshot(doc(db, 'live', code), snap => {
    if (O.spec !== S) return;
    if (!snap.exists()) { setSpecText(nameHTML(S.name, S.star) + ' has left.'); return; }
    const d = snap.data(); S.name = d.name; S.star = d.star;
    const online = d.updatedAt && d.updatedAt.toMillis && Date.now() - d.updatedAt.toMillis() < 3 * LIVE_HEARTBEAT;
    if (!d.playing || !d.state) {
      setSpecText(nameHTML(d.name, d.star) + (d.meta && d.meta.over ? '\u2019s city just ended.' : online ? ' is on the menu \u2014 waiting for them to play\u2026' : ' isn\u2019t online right now.'));
      return;
    }
    let city = null; try { city = JSON.parse(d.state); } catch (e) { return; }
    const key = layoutKey(city);
    if (!S.loaded || key !== S.key) {
      if (!API.spectate.enter(city, d.meta, S.loaded)) { setSpecText('Couldn\u2019t show ' + nameHTML(d.name, d.star) + '\u2019s city.'); return; }
      S.loaded = true; S.key = key;
    } else API.spectate.patch(city, d.meta);
    setSpecText('Watching <b>' + nameHTML(d.name, d.star) + '</b> live' + (d.meta && !d.meta.running ? ' \u00b7 paused' : '') + ' \u00b7 view only');
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

/* Feedback from the in-game form. Players never need an account: if the automatic guest sign-in
   hasn't finished yet, this waits for it (or starts it). Read the results in the Firebase console
   under Firestore -> feedback. */
async function sendFeedback(f) {
  if (!auth.currentUser) await signInAnonymously(auth);
  const clip = (v, n) => String(v || '').slice(0, n);
  await addDoc(collection(db, 'feedback'), {
    kind: ['Bug', 'Idea', 'Other'].includes(f.kind) ? f.kind : 'Other',
    message: clip(f.message, 1500),
    replyTo: clip(f.replyTo, 120),
    details: clip(f.details, 3000),
    uid: auth.currentUser.uid,
    name: clip(O.profile && O.profile.name, 16),
    createdAt: serverTimestamp()
  });
}

/* public surface used by game.js */
window.JunctionOnline = {
  get ready() { return O.ready && !!(O.profile && O.profile.name); },
  openSaves, openBoard, openWatch, sendFeedback,
  /* a permanent (Google or email) account, or null for guests and when online features are off */
  get account() { return isPerm() ? {email: O.user.email || '', name: myName(), uid: O.user.uid} : null; }
};
