/* Junction Cloud Functions (2nd gen, Node 20).
   What runs on the server:
     - ranked matchmaking: players queue in rankedQueue/{uid}; onQueued pairs two players near each other's rating
       into a challenges/{id} doc (the same shape the game already uses for ISO 1v1, with ranked: true)
     - settlement: when a ranked challenge becomes 'done', ratings in rankedPlayers/{uid} are updated (Elo, K=32,
       ±half for a draw) and the season record grows; onSeasonRoll (monthly) soft-resets ratings and hands out
       the season designs
     - tournaments: a weekend bracket (8 or 16) is built from tournaments/{id}/signups by buildBracket, matches
       are ranked challenges, and winners advance in onTournamentMatchDone
     - validation: leaderboard and weekly submissions, ISO results and shop balances are checked for impossible
       numbers after they're written; bad ones are flagged (deleted or rolled back) and the player's card marked
     - error reports: clients write logs/{autoId}; a rate limit per uid keeps that from flooding
   Deploy: `cd functions && npm install && cd .. && firebase deploy --only functions --project junction-rm`. */
'use strict';
const {onDocumentCreated, onDocumentWritten, onDocumentUpdated} = require('firebase-functions/v2/firestore');
const {onSchedule} = require('firebase-functions/v2/scheduler');
const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {setGlobalOptions} = require('firebase-functions/v2');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore(), FV = admin.firestore.FieldValue || require('firebase-admin/firestore').FieldValue;
const TS = admin.firestore.Timestamp || require('firebase-admin/firestore').Timestamp;
setGlobalOptions({region: 'australia-southeast1', maxInstances: 10});

/* ------------------------------------------------------------------ ratings */
const DIVISIONS = [['bronze', 0], ['silver', 1100], ['gold', 1250], ['platinum', 1400], ['diamond', 1550]];
const divisionOf = r => { let d = 'bronze'; for (const [name, min] of DIVISIONS) if (r >= min) d = name; return d; };
const seasonKey = (d = new Date()) => d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
const K = 32;
function elo(a, b, sa) { const ea = 1 / (1 + Math.pow(10, (b - a) / 400)); return Math.round(K * (sa - ea)); }
async function playerRef(uid) { return db.doc('rankedPlayers/' + uid); }
async function ensurePlayer(tx, uid, name) {        // read only; the caller writes after all its reads
  const s = await tx.get(db.doc('rankedPlayers/' + uid));
  return s.exists ? s.data() : {name: name || 'Player', rating: 1000, peak: 1000, games: 0, wins: 0, losses: 0, draws: 0, season: seasonKey(), seasonGames: 0, division: 'bronze'};
}

/* ------------------------------------------------------------------ matchmaking
   rankedQueue/{uid}: {name, rating, kind: 'live'|'daily', at}. Each new queue doc tries to pair with the oldest
   waiting player whose rating is within a window that widens with wait time (±100 at once, ±400 after a minute). */
exports.onQueued = onDocumentCreated('rankedQueue/{uid}', async ev => {
  const me = ev.params.uid, mine = ev.data.data();
  if (!mine || !['live', 'daily'].includes(mine.kind)) { await ev.data.ref.delete(); return; }
  await db.runTransaction(async tx => {
    // reads first (Firestore transactions require every read before any write)
    const meSnap = await tx.get(db.doc('rankedQueue/' + me)); if (!meSnap.exists) return;
    const others = await tx.get(db.collection('rankedQueue').where('kind', '==', mine.kind).orderBy('at', 'asc').limit(25));
    const now = Date.now();
    let pick = null;
    others.forEach(o => {
      if (pick || o.id === me) return;
      const d = o.data(), waited = now - (d.at && d.at.toMillis ? d.at.toMillis() : now);
      const window = Math.min(400, 100 + waited / 1000 * 5);
      if (Math.abs((d.rating || 1000) - (mine.rating || 1000)) <= window) pick = {id: o.id, d};
    });
    if (!pick) return;
    const refA = db.doc('rankedPlayers/' + me), refB = db.doc('rankedPlayers/' + pick.id);
    const [sa, sb] = await Promise.all([tx.get(refA), tx.get(refB)]);
    const fresh = name => ({name: name || 'Player', rating: 1000, peak: 1000, games: 0, wins: 0, losses: 0, draws: 0, season: seasonKey(), seasonGames: 0, division: 'bronze', updatedAt: FV.serverTimestamp()});
    const a = sa.exists ? sa.data() : fresh(mine.name), b = sb.exists ? sb.data() : fresh(pick.d.name);
    // writes
    if (!sa.exists) tx.set(refA, a); if (!sb.exists) tx.set(refB, b);
    const ref = db.collection('challenges').doc();
    const expires = TS.fromMillis(now + (mine.kind === 'live' ? 15 * 60e3 : 864e5));
    tx.set(ref, {from: pick.id, fromName: pick.d.name || b.name, to: me, toName: mine.name || a.name, kind: mine.kind, seed: Math.floor(Math.random() * 2147483647),
      status: 'accepted', ranked: true, ratings: {[me]: a.rating, [pick.id]: b.rating}, ready: {}, createdAt: FV.serverTimestamp(), acceptedAt: FV.serverTimestamp(), expiresAt: expires});
    tx.delete(db.doc('rankedQueue/' + me)); tx.delete(db.doc('rankedQueue/' + pick.id));
  });
});
/* a queue entry older than 10 minutes is dropped */
exports.sweepQueue = onSchedule('every 10 minutes', async () => {
  const old = await db.collection('rankedQueue').where('at', '<', TS.fromMillis(Date.now() - 10 * 60e3)).get();
  const batch = db.batch(); old.forEach(d => batch.delete(d.ref)); await batch.commit();
});

/* ------------------------------------------------------------------ settlement */
exports.onMatchDone = onDocumentUpdated('challenges/{id}', async ev => {
  const before = ev.data.before.data(), after = ev.data.after.data();
  if (!after || !after.ranked || after.status !== 'done' || before.status === 'done' || after.rated) return;
  const {from, to, winner} = after;
  await db.runTransaction(async tx => {
    const a = await ensurePlayer(tx, from, after.fromName), b = await ensurePlayer(tx, to, after.toName);
    const sa = winner === from ? 1 : winner === to ? 0 : 0.5;
    const da = elo(a.rating, b.rating, sa), dbb = elo(b.rating, a.rating, 1 - sa);
    const season = seasonKey();
    const upd = (ref, p, delta, w, l, d) => {
      const rating = Math.max(100, p.rating + delta), seasonReset = p.season !== season;
      tx.set(ref, {rating, peak: Math.max(p.peak || 1000, rating), games: (p.games || 0) + 1, wins: (p.wins || 0) + w, losses: (p.losses || 0) + l, draws: (p.draws || 0) + d,
        season, seasonGames: (seasonReset ? 0 : p.seasonGames || 0) + 1, division: divisionOf(rating), updatedAt: FV.serverTimestamp()}, {merge: true});
    };
    upd(db.doc('rankedPlayers/' + from), a, da, sa === 1 ? 1 : 0, sa === 0 ? 1 : 0, sa === 0.5 ? 1 : 0);
    upd(db.doc('rankedPlayers/' + to), b, dbb, sa === 0 ? 1 : 0, sa === 1 ? 1 : 0, sa === 0.5 ? 1 : 0);
    tx.update(ev.data.after.ref, {rated: true, delta: {[from]: da, [to]: dbb}});
  });
  if (after.tournament) await advanceTournament(after);
});

/* ------------------------------------------------------------------ seasons
   On the 1st of each month: every rating moves a third of the way back to 1000, and last season's division earns
   its exclusive design (written to users/{uid}/stats/shop.owned via a grant list the client merges). */
const SEASON_DESIGNS = {bronze: 'design:car:season_bronze', silver: 'design:car:season_silver', gold: 'design:car:season_gold', platinum: 'design:car:season_platinum', diamond: 'design:car:season_diamond'};
exports.onSeasonRoll = onSchedule({schedule: '0 0 1 * *', timeZone: 'UTC'}, async () => {
  const players = await db.collection('rankedPlayers').get();
  const last = seasonKey(new Date(Date.now() - 2 * 864e5));
  let batch = db.batch(), n = 0;
  for (const p of players.docs) {
    const d = p.data(); if (!d.seasonGames) continue;
    const rating = Math.round(1000 + (d.rating - 1000) * 2 / 3);
    batch.set(p.ref, {rating, division: divisionOf(rating), seasonGames: 0, season: seasonKey(), lastSeason: {key: last, rating: d.rating, division: d.division || divisionOf(d.rating)}}, {merge: true});
    batch.set(db.doc('users/' + p.id + '/stats/grants'), {items: FV.arrayUnion(SEASON_DESIGNS[d.division || divisionOf(d.rating)]), updatedAt: FV.serverTimestamp()}, {merge: true});
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
});

/* ------------------------------------------------------------------ tournaments
   tournaments/{id}: {name, size: 8|16, kind: 'live'|'daily', startsAt, status: 'signup'|'running'|'done', rounds: [[{a, b, chal, winner}...]...], winner}
   signups: tournaments/{id}/signups/{uid} {name, rating, at}. buildBracket (callable, admin only, or scheduled on Fridays)
   seeds by rating and creates round 1. */
async function makeMatch(t, tid, a, b, round) {
  const ref = db.collection('challenges').doc();
  await ref.set({from: a.uid, fromName: a.name, to: b.uid, toName: b.name, kind: t.kind, seed: Math.floor(Math.random() * 2147483647), status: 'accepted', ranked: true,
    tournament: {id: tid, round}, ready: {}, createdAt: FV.serverTimestamp(), acceptedAt: FV.serverTimestamp(), expiresAt: TS.fromMillis(Date.now() + (t.kind === 'live' ? 2 * 3600e3 : 864e5))});
  return ref.id;
}
async function buildBracketFor(tid) {
  const tref = db.doc('tournaments/' + tid), t = (await tref.get()).data();
  if (!t || t.status !== 'signup') return;
  const su = await tref.collection('signups').orderBy('rating', 'desc').limit(t.size).get();
  const players = su.docs.map(d => ({uid: d.id, name: d.data().name, rating: d.data().rating || 1000}));
  if (players.length < 2) { await tref.update({status: 'done', winner: null, note: 'Not enough players'}); return; }
  const size = players.length >= 16 ? 16 : players.length >= 8 ? 8 : players.length >= 4 ? 4 : 2;
  const seeded = players.slice(0, size), order = []; for (let i = 0; i < size / 2; i++) order.push([seeded[i], seeded[size - 1 - i]]);   // 1 v 16, 2 v 15 ...
  const round = [];
  for (const [a, b] of order) round.push({a: a.uid, an: a.name, b: b.uid, bn: b.name, chal: await makeMatch(t, tid, a, b, 0), winner: null});
  await tref.update({status: 'running', size, rounds: [round], startedAt: FV.serverTimestamp()});
}
exports.buildBracket = onCall(async req => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const t = (await db.doc('tournaments/' + req.data.id).get()).data();
  if (!t || t.host !== req.auth.uid) throw new HttpsError('permission-denied', 'Only the host can start the bracket');
  await buildBracketFor(req.data.id); return {ok: true};
});
exports.startDueTournaments = onSchedule('every 15 minutes', async () => {
  const due = await db.collection('tournaments').where('status', '==', 'signup').where('startsAt', '<=', TS.now()).get();
  for (const d of due.docs) await buildBracketFor(d.id);
});
async function advanceTournament(chal) {
  const {id, round} = chal.tournament, tref = db.doc('tournaments/' + id);
  await db.runTransaction(async tx => {
    const t = (await tx.get(tref)).data(); if (!t || t.status !== 'running') return;
    const rounds = t.rounds.map(r => r.slice()), cur = rounds[round];
    const m = cur.find(x => x.chal === chal.id || (x.a === chal.from && x.b === chal.to)); if (!m) return;
    m.winner = chal.winner === 'draw' || chal.winner === 'none' ? (Math.random() < 0.5 ? m.a : m.b) : chal.winner;
    if (cur.every(x => x.winner)) {
      if (cur.length === 1) { tx.update(tref, {rounds, status: 'done', winner: cur[0].winner, endedAt: FV.serverTimestamp()}); return; }
      const next = [];
      for (let i = 0; i < cur.length; i += 2) { const A = cur[i], B = cur[i + 1]; const a = {uid: A.winner, name: A.winner === A.a ? A.an : A.bn}, b = {uid: B.winner, name: B.winner === B.a ? B.an : B.bn}; next.push({a: a.uid, an: a.name, b: b.uid, bn: b.name, chal: '', winner: null, pending: [a, b]}); }
      rounds.push(next); tx.update(tref, {rounds});
    } else tx.update(tref, {rounds});
  });
  // create the next round's matches outside the transaction
  const t = (await tref.get()).data(); if (!t || t.status !== 'running') return;
  const last = t.rounds[t.rounds.length - 1], upd = last.map(x => Object.assign({}, x)); let changed = false;
  for (const m of upd) if (!m.chal && m.pending) { m.chal = await makeMatch(t, id, m.pending[0], m.pending[1], t.rounds.length - 1); delete m.pending; changed = true; }
  if (changed) { const rounds = t.rounds.slice(); rounds[rounds.length - 1] = upd; await tref.update({rounds}); }
}

/* ------------------------------------------------------------------ validation
   Impossible numbers are rejected after the fact: the document is removed (or reverted) and the player's public
   card gets a flag the client shows as "under review". Limits are generous: a week is 90 s of game time in the
   fastest mode and a city can't deliver more than ~4 parcels a second even when perfect. */
const MAX_PARCELS_PER_WEEK = 420, MAX_WEEKS = 400, MAX_EARN_PER_WEEK = 20000;
function impossibleRun(d) {
  const weeks = +d.weeks || 0, parcels = +d.parcels || 0, earned = +d.earned || 0;
  if (weeks > MAX_WEEKS || parcels < 0 || weeks < 0) return 'range';
  if (parcels > Math.max(60, weeks * MAX_PARCELS_PER_WEEK)) return 'parcels';
  if (earned > Math.max(500, weeks * MAX_EARN_PER_WEEK)) return 'earned';
  if (d.playSec !== undefined && +d.playSec > weeks * 1200 + 600) return 'time';
  return '';
}
async function flag(uid, why, where) {
  await db.doc('profiles/' + uid).set({flag: why, flagWhere: where, flaggedAt: FV.serverTimestamp()}, {merge: true}).catch(() => {});
  await db.collection('logs').add({kind: 'flag', uid, why, where, at: FV.serverTimestamp()});
}
exports.checkBoard = onDocumentWritten('boards/{mode}/players/{uid}', async ev => {
  const d = ev.data.after.exists ? ev.data.after.data() : null; if (!d) return;
  const why = impossibleRun(d); if (!why) return;
  await ev.data.after.ref.delete(); await flag(ev.params.uid, why, 'boards/' + ev.params.mode);
});
exports.checkExpert = onDocumentWritten('expert/{week}/players/{uid}', async ev => {
  const d = ev.data.after.exists ? ev.data.after.data() : null; if (!d) return;
  const why = impossibleRun(d); if (!why) return;
  await ev.data.after.ref.delete(); await flag(ev.params.uid, why, 'expert/' + ev.params.week);
});
exports.checkIso = onDocumentUpdated('challenges/{id}', async ev => {
  const a = ev.data.after.data(); if (!a || !a.res) return;
  for (const uid in a.res) { const r = a.res[uid]; const why = impossibleRun({weeks: r.week || 1, parcels: r.parcels, earned: r.earned, playSec: r.sec}); if (why) { await flag(uid, why, 'iso/' + ev.params.id); await ev.data.after.ref.update({['res.' + uid]: FV.delete(), flagged: FV.arrayUnion(uid)}); } }
});
/* coins: a balance can't grow faster than the parcels that earned it (2 per 3 parcels, plus daily rewards and quests) */
exports.checkShop = onDocumentWritten('users/{uid}/stats/shop', async ev => {
  const after = ev.data.after.exists ? ev.data.after.data() : null, before = ev.data.before.exists ? ev.data.before.data() : null; if (!after) return;
  const life = (await db.doc('users/' + ev.params.uid + '/stats/life').get()).data();
  let parcels = 0; if (life && life.modes) for (const m in life.modes) parcels += +((life.modes[m] || {}).parcels || 0);
  const cap = Math.floor(parcels * 2 / 3) + 5000 + 400 * 365 * 2;   // lifetime earnings + rewards headroom (quests/daily for two years)
  if ((+after.bucks || 0) > cap) {
    const fix = before ? Math.min(+before.bucks || 0, cap) : Math.min(+after.bucks, cap);
    await ev.data.after.ref.set({bucks: fix}, {merge: true}); await flag(ev.params.uid, 'coins', 'shop');
  }
});

/* ------------------------------------------------------------------ error reports: at most 20 per player per hour */
exports.onLog = onDocumentCreated('logs/{id}', async ev => {
  const d = ev.data.data(); if (!d || d.kind !== 'error' || !d.uid) return;
  const ref = db.doc('rankedLimits/' + d.uid);
  await db.runTransaction(async tx => {
    const s = await tx.get(ref), now = Date.now(), cur = s.exists ? s.data() : {n: 0, since: now};
    const fresh = now - (cur.since || 0) < 3600e3;
    const n = (fresh ? cur.n : 0) + 1;
    tx.set(ref, {n, since: fresh ? cur.since : now});
    if (n > 20) tx.delete(ev.data.ref);
  });
});


/* how many players are waiting in the ranked queue: a small public counter for the ISO screen (who is waiting stays private) */
exports.queueStats = onDocumentWritten('rankedQueue/{uid}', async () => {
  const cutoff = TS.fromMillis(Date.now() - 10 * 60e3), count = kind => db.collection('rankedQueue').where('kind', '==', kind).where('at', '>', cutoff).count().get().then(s => s.data().count);
  const [live, daily] = await Promise.all([count('live'), count('daily')]);
  await db.doc('rankedStats/queue').set({live, daily, at: FV.serverTimestamp()});
});
