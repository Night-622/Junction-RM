"use strict";
/* =====================================================================
   JUNCTION 2 — a top-down traffic sim.

   Layout of this file
     1  CONFIG            every tuning number
     2  World & network   tiles, links, junction analysis, routing
     3  Traffic           lanes, car following, junction controllers
     4  Game rules        dispatch, spawning, weeks, perks, events, saves
     5  Rendering         a flat 2D canvas
     6  Interface         HUD, tools, panels, input
   ===================================================================== */

/* ---------------------------------------------------------------------
   1. CONFIG — all pacing lives here.
   --------------------------------------------------------------------- */
const CONFIG = {
  // clock & map
  weekSeconds:        110,
  startSpan:          9,
  growPerWeek:        1,      // tiles added on EVERY side each week
  maxSpan:            128,
  cameraEase:         2.4,

  // starting kit
  startRoads:         20,
  startBridges:       1,
  startLights:        0,
  startRoundabouts:   0,
  startMotorways:     0,
  startSigns:         0,
  startParking:       0,
  startDepots:        0,
  startHouses:        1,
  startStores:        1,

  // spawning
  houseIntervalBase:  58,  houseIntervalRamp: 1.1,  houseIntervalMin: 24,  houseJitter: 8,  firstHouseDelay: 28,
  storeIntervalBase:  54,  storeIntervalRamp: 0.8,  storeIntervalMin: 30,  storeJitter: 16, firstStoreDelay: 12,
  newColourChance:    0.6,
  housesOnStoreSpawn: 1,       // houses of the same colour that appear when a new store opens
  housesOnStoreTierUp:2,       // houses of the same colour that appear when a store tiers up (gets busier)

  // demand
  pinIntervalBase:    12,  pinIntervalRamp:   0.3,  pinIntervalMin:   7.5, pinJitter: 4,
  pinCapacity:        8,       // parcels a store holds before its clock starts
  overflowSeconds:    26,
  overflowDrain:      1.5,
  arrivalRelief:      2.0,     // seconds knocked off a store's clock per parcel collected

  // store evolution: stores randomly grow busier over time, demanding cars more often
  storeEvolveMaxTier:  3,       // a store can step up through this many tiers
  storeEvolveStartWeek:2,       // no evolving before this week
  storeEvolveChance:   0.35,    // chance, at each random check, that an eligible store steps up a tier
  storeEvolveCheckMin: 40,      // seconds between a store's evolve checks (random each time)
  storeEvolveCheckMax: 85,
  storeEvolvePinStep:  0.8,     // each tier multiplies the pin interval by this (parcels appear faster, more often)
  storeEvolveBonus:    1,       // extra dollars per parcel, per tier

  // cars
  carsPerHouse:       2,
  carsPerHouseMax:    6,
  carCapacityStart:   1,
  carCapacityMax:     4,
  carSpeed:           38,      // world px / second (a tile is 32 px)
  motorwayScale:      6.0,     // x2
  accel:              70,
  brake:              170,
  carLen:             12,
  carBuyBase:         30,      // first extra car bought for a house
  carBuyRamp:         1.6,     // each further car at the same house costs this much more
  carBuyCityRamp:     0.12,    // and every car bought anywhere nudges all prices up by this
  carBuyExtraMax:     2,       // extra cars a house can buy (its forecourt fits four)
  vanLen:             15,
  carGap:             4,
  laneOffset:         5.6,
  roadWidth:          22,
  driveWidth:         12,
  pickupPause:        2.0,
  loadPause:          0.45,
  dispatchInterval:   0.5,
  maxSolvesPerFrame:  7,
  replanSeconds:      3.5,     // how often a driver reconsiders their route
  vanSpeedScale:      0.8,
  vanCapacityBonus:   2,

  // junction control
  batchSize:          6,       // cars released from one side before the next side gets a turn (x2)
  headway:            0.85,    // seconds between cars in a batch (slow, on purpose)
  clearTime:          0.6,     // pause while the junction empties before the next side
  crossScale:         0.5,     // speed through a give-way junction, fraction of cruising
  lightPhase:         4.2,     // (old fixed timer, no longer used: lights are sensor-driven now)
  lightAllRed:        0.8,     // everyone stops while the junction empties between sides
  lightHeadway:       0.7,
  lightBatch:         6,       // default cars let through per turn, per side (x2)
  lightMax:           99,      // biggest count a player can dial in
  lightGapOut:        0.5,     // green side empty this long -> hand over to a waiting side
  lightStall:         3.5,     // green side made no progress this long -> hand over
  roundCap:           4,       // cars that can circulate at once (x2)
  roundHeadway:       0.8,
  roundScale:         0.72,
  gridlockSeconds:    30,      // exit blocked this long: a tow truck steps in
  breakdownSeconds:   7,

  // docks & parking
  docksPerStore:      2,
  parkCarsPerLot:     2,        // x2
  parkPinsPerLot:     6,        // x2
  parkDocksPerLot:    2,        // x2
  depotCapacity:      8,        // x2
  buildingLinkRadius: 1,

  // look
  dayLengthSeconds:   240,
  nightDepth:         0.5,
  zoomMin:            0.35,
  zoomMax:            5,
  treeDensity:        0.16,

  // events
  rushEveryWeeks:     3,
  rushSeconds:        30,
  rushRate:           2.1,
  rainEveryWeeks:     4,
  rainSeconds:        45,
  rainSlow:           0.85,
  breakdownFromWeek:  2,
  breakdownEvery:     38,      // average seconds between breakdowns (shrinks with weeks)
  autosaveSeconds:    12,

  // economy: every parcel delivered pays cash, and cash buys everything
  startMoney:         0,
  parcelValue:        1,        // dollars per parcel from a level-0 store
  rushPayBonus:       0.5,      // parcels pay 50% more during rush hour
  contractsBonus:     0.1,      // per level of the Bulk contracts upgrade
  weeklyGrant:        10,       // council grant every new week...
  weeklyGrantRamp:    2,        // ...plus this much per week survived
  prices: {road: 10, bridge: 15, sign: 20, light: 30, round: 30, park: 30, depot: 30, moto: 60, van: 30, car: 30},
  // prices for road tiles, bridges, signs, lights, roundabouts, lots, bays and motorways all rise this much
  // per week (compounding); store upgrades, junction upgrades and tow trucks are NOT part of this rise
  roadPriceWeeklyRise: 0.15,
  storeUpgradeCosts:  [40, 90, 160],   // level 1, 2, 3: each adds a dollar per parcel
  storeUpgradeMax:    3,

  // tow trucks: hired for cash, based at a store, they drive out and haul stuck cars clear
  towTruckPrice:      50,
  towTruckStep:       25,       // every truck you already own adds this to the next one
  towTrucksPerStore:  2,
  towTruckSpeed:      1.25,     // relative to a car
  truckLen:           16,
  towHookSeconds:     1.6,
  towCooldown:        3,        // a truck rests this long between jobs
  towSeekBlocked:     5,        // send a truck to a car blocked this long...
  towSeekStopped:     14,       // ...or standing still this long...
  towSeekBroken:      2.2,      // ...or broken down with at least this long left
  towHookBlocked:     3,        // the truck hooks whatever stuck car is right in front of it
  towHookStopped:     8,
  towHookBroken:      1.2,
  roadsPerWeekMin:    10,       // road tiles every weekly reward pick also gives
  roadsPerWeekMax:    24,

  // junction upgrades: a late-game cash sink, up to 3 levels on every junction
  junctionUpgradeCosts: [80, 200, 450],
  junctionUpgradeMax:   3,
  junctionUpgradeStep:  15,     // each level already bought anywhere in the city adds this to the next price

  // road closures: from this week on, a busy stretch of road is coned off for a while
  closureFromWeek:    4,
  closureEvery:       55,       // average seconds between closures (shrinks with weeks)
  closureSeconds:     30,
  closureMax:         2,        // at most this many closed at once

  // ambulances: race from a house to a store; lights turn green along the way
  ambFromWeek:        3,
  ambEvery:           85,       // average seconds between calls (shrinks with weeks)
  ambSpeed:           1.55,     // relative to a car
  ambLen:             15,
  ambLookahead:       120,      // world px: a light this close to an ambulance turns green for it
  ambSlackMul:        1.6,      // time allowed = estimated free-flow time x this + ambSlack
  ambSlack:           12,
  ambGrace:           25,       // seconds past the limit before the call is written off
  ambBonus:           25,       // paid for arriving in time...
  ambBonusFast:       25,       // ...plus up to this much more for arriving early
  ambPenalty:         20,       // the call was lost altogether
  ambPenaltyMax:      30,       // a late arrival costs 5 + 0.8 a second late, up to this

  // one-way roads: only usable on a plain two-way stretch (not a junction). Free to place or clear.

  // timed contract stores: a store occasionally offers a cash bonus for prompt pickups
  contractFromWeek:    2,
  contractEvery:       70,      // average seconds between offers
  contractSeconds:     40,      // time limit to collect enough parcels
  contractNeed:         3,      // parcels that must be collected from the store while the offer is open
  contractBonusBase:   30,
  contractBonusPerWeek: 4,

  // road upkeep: once the network passes a free allowance, every extra tile costs a little each week
  roadUpkeepFreeTiles: 60,
  roadUpkeepRate:       0.04,

  // a citywide gridlock: if almost nothing is moving for long enough, the city has failed even
  // though no single store has overflowed
  cityGridlockFromWeek: 3,
  cityJamThreshold:     0.62,
  cityGridlockSeconds:  45,
  cityGridlockMinCars:   6,

  // camera easing (Zen/slow-mode calm multiplies these down; every other difficulty is unchanged)
  camFollowEase:        4,
  camChaseEase:         5,
  camZoomEase:           3
};
const CFG = CONFIG;
const BASE_PRICE = CFG.prices;
// road tiles, bridges, signs, lights, roundabouts, lots, bays and motorways cost 15% more each week that
// passes (compounding); cars and vans (bought in the Shop tab) are not road pieces, so they stay flat.
const ROAD_PRICE_KEYS = new Set(['road', 'bridge', 'sign', 'light', 'round', 'park', 'depot', 'moto']);
function priceScale() { return Math.pow(1 + CFG.roadPriceWeeklyRise, Math.max(0, (week || 1) - 1)); }
const PRICE = new Proxy(BASE_PRICE, {
  get(target, kind) {
    const base = target[kind];
    if (typeof base !== 'number') return base;
    return ROAD_PRICE_KEYS.has(kind) ? Math.max(1, Math.round(base * priceScale())) : base;
  }
});

const DIFFS = {
  chill:    {label:'Relaxed',  note:'Slower parcels, more patience, extra road to start.',  pin:1.3,  over:1.5, spawn:1.25, roads:8, cash:15, grant:1.5},
  standard: {label:'Standard', note:'The intended pace.',                                    pin:1,    over:1,   spawn:1,    roads:0, cash:0, grant:1},
  frantic:  {label:'Frantic',  note:'Parcels arrive fast and stores lose patience sooner.',  pin:0.78, over:0.8, spawn:0.85, roads:-4, cash:-10, grant:0.75},
  zen:      {label:'Zen',      note:'Nothing you build can lose the game. Rare weather, gentle traffic, slower camera.',
             pin:1.4, over:999, spawn:1.3, roads:12, cash:30, grant:1.3, noFail:true, calm:true}
};

const CELL = 32, MAXD = CFG.maxSpan, COLS = MAXD, ROWS = MAXD, N = COLS * ROWS;
const DX = [0, 1, 1, 1, 0, -1, -1, -1], DY = [-1, -1, 0, 1, 1, 1, 0, -1];
const DIAG = d => (d & 1) === 1;
const idx = (c, r) => r * COLS + c;
const cx = k => k % COLS, cy = k => (k / COLS) | 0;
const tx = k => (cx(k) + 0.5) * CELL, ty = k => (cy(k) + 0.5) * CELL;
const relDir = (a, b) => (((b - a) % 8) + 8) % 8;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
function nbr(k, d) {
  const c = cx(k) + DX[d], r = cy(k) + DY[d];
  return (c < 0 || r < 0 || c >= COLS || r >= ROWS) ? -1 : idx(c, r);
}
function hash01(k, salt) {
  let h = (k * 374761393 + (salt || 0) * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function approxDir(dc, dr) {
  const a = Math.atan2(dr, dc);
  const d = Math.round(a / (Math.PI / 4));
  return (((d + 2) % 8) + 8) % 8;
}

const COLORS = [
  {name: 'red',    hex: '#e0483e', glyph: 0},
  {name: 'blue',   hex: '#2f7de1', glyph: 1},
  {name: 'amber',  hex: '#f0a81c', glyph: 2},
  {name: 'green',  hex: '#2fa66a', glyph: 3},
  {name: 'violet', hex: '#8a5bd6', glyph: 4},
  {name: 'teal',   hex: '#16a2b8', glyph: 5}
];
const BASE_NAMES = COLORS.map(c => c.name);
/* The colours players can build a custom city from. All sit in a mid lightness range so roofs, cars and
   store fascias stay readable on both the light and dark ground. */
const COLOR_LIBRARY = [
  {group: 'Standard', cols: [['red', '#e0483e'], ['blue', '#2f7de1'], ['amber', '#f0a81c'], ['green', '#2fa66a'], ['violet', '#8a5bd6'], ['teal', '#16a2b8']]},
  {group: 'Classic', cols: [['crimson', '#c8102e'], ['orange', '#f57c1f'], ['yellow', '#f2c511'], ['lime', '#8cc63f'], ['forest', '#2e7d32'], ['cyan', '#00acc1'],
    ['sky blue', '#4aa3f0'], ['navy', '#25408f'], ['purple', '#7b2cbf'], ['magenta', '#d0268f'], ['pink', '#f06292'], ['brown', '#8d5a35'], ['grey', '#7d8790'], ['charcoal', '#3a4046']]},
  {group: 'Creative', more: true, cols: [
    ['coral', '#ff8a75'], ['terracotta', '#c1592c'], ['rust', '#8a3a1a'], ['garnet', '#7a1830'], ['wine', '#5e1f38'],
    ['tangerine', '#e88a0e'], ['apricot', '#f0b26a'], ['copper', '#b57a4a'], ['mahogany', '#6a2c20'], ['mustard', '#c99a1a'],
    ['wheat', '#c9a24a'], ['avocado', '#7a8a2e'], ['moss', '#5f7a35'], ['pistachio', '#93c47d'], ['jade', '#2a9670'],
    ['basil', '#2e5a24'], ['hunter green', '#215030'], ['kelly green', '#2e9e44'], ['mint', '#4fd1a5'], ['seafoam', '#3fbfad'],
    ['cerulean', '#1a7ca6'], ['ocean', '#0d5f82'], ['royal blue', '#2440c4'], ['denim', '#3c5c8f'], ['powder blue', '#7fb0d6'],
    ['periwinkle', '#8a94e6'], ['midnight', '#1c2050'], ['lavender', '#a58bdb'], ['lilac', '#c9a3e0'], ['orchid', '#b755c9'],
    ['mauve', '#9b6b8f'], ['plum', '#8e3b6e'], ['amethyst', '#8b4fb0'], ['grape', '#5c2f8e'], ['eggplant', '#5a2f5e'],
    ['rose', '#e3799d'], ['bubblegum', '#ff9ecb'], ['blush', '#e8a5b0'], ['raspberry', '#a0184f'], ['watermelon', '#f2495f'],
    ['chocolate', '#54301c'], ['mocha', '#8a7060'], ['sand', '#c9a876'], ['khaki', '#7d7346'], ['olive drab', '#6b6b2a'],
    ['slate', '#5b6f86'], ['hibiscus', '#c81c6e'], ['heather', '#8878a8'], ['laurel', '#4e7a4a'], ['sapphire', '#1f4fb5'],
    ['peach fuzz', '#f2b78a'], ['nectarine', '#e88a4a'], ['lagoon', '#1a9a9a']
  ]}
]
const LIB_NAME = {}; for (const g of COLOR_LIBRARY) for (const [n, h] of g.cols) LIB_NAME[h] = n;
/* Colour modes. Each palette fills the same six slots, so saves and colour indices never change —
   only what the slots look like and what they're called. 'custom' uses the player's own picks. */
const PALETTES = {
  standard: {label: 'Standard', note: 'The original city colours',
    cols: [['red', '#e0483e'], ['blue', '#2f7de1'], ['amber', '#f0a81c'], ['green', '#2fa66a'], ['violet', '#8a5bd6'], ['teal', '#16a2b8']]},
  redgreen: {label: 'Red–green safe', note: 'For protanopia and deuteranopia',
    cols: [['vermilion', '#d55e00'], ['blue', '#0072b2'], ['orange', '#e69f00'], ['sea green', '#009e73'], ['pink', '#cc79a7'], ['sky blue', '#56b4e9']]},
  bluey: {label: 'Blue–yellow safe', note: 'For tritanopia',
    cols: [['red', '#d7263d'], ['blue', '#2563eb'], ['orange', '#f08a24'], ['brown', '#8b5a2b'], ['violet', '#8e44ad'], ['pink', '#ef7fb0']]},
  contrast: {label: 'High contrast', note: 'Bold, saturated and far apart',
    cols: [['red', '#d00000'], ['blue', '#0047ff'], ['yellow', '#f5c400'], ['green', '#00a651'], ['magenta', '#c000c0'], ['brown', '#7a4510']]},
  custom: {label: 'Custom', note: 'Build your own set from ' + COLOR_LIBRARY.reduce((n, g) => n + g.cols.length, 0) + ' colours', cols: null}
};
let colorMode = 'standard', customHex = PALETTES.standard.cols.map(c => c[1]), showSymbols = false;
function hueName(hex) {
  const [r, g, b] = rgbOf(hex).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (sat < 0.16) return l < 0.25 ? 'black' : l > 0.82 ? 'white' : 'grey';
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360;
  if (h < 15 || h >= 340) return l < 0.3 ? 'maroon' : 'red';
  if (h < 42) return l < 0.36 ? 'brown' : 'orange';
  if (h < 66) return l < 0.34 ? 'olive' : 'yellow';
  if (h < 160) return 'green';
  if (h < 195) return 'teal';
  if (h < 250) return 'blue';
  if (h < 290) return 'violet';
  return 'pink';
}
function lightOf(hex) { const [r, g, b] = rgbOf(hex); return (Math.max(r, g, b) + Math.min(r, g, b)) / 510; }
function applyPalette() {
  const pal = PALETTES[colorMode] || PALETTES.standard;
  const hexes = pal.cols ? pal.cols.map(c => c[1]) : customHex.slice();
  let names = pal.cols ? pal.cols.map(c => c[0]) : hexes.map(h => LIB_NAME[h.toLowerCase()] || hueName(h));
  if (!pal.cols) {                                   // keep custom names apart: "light blue" and "dark blue", not two "blue"s
    const seen = {};
    names = names.map((n, i) => {
      const same = names.filter((m, j) => m === n && j !== i);
      if (!same.length) return n;
      const mine = lightOf(hexes[i]), others = names.map((m, j) => m === n && j !== i ? lightOf(hexes[j]) : null).filter(v => v !== null);
      let nn = mine >= Math.max(...others) ? 'light ' + n : mine <= Math.min(...others) ? 'dark ' + n : n;
      seen[nn] = (seen[nn] || 0) + 1; return seen[nn] > 1 ? nn + ' ' + seen[nn] : nn;
    });
  }
  COLORS.forEach((c, i) => { c.hex = hexes[i]; c.name = names[i]; });
  retintTutorial();
  if (typeof pathCache !== 'undefined') pathCache.ver = -1;
}
/* Tutorial copy was written with the standard colour names; swap in whatever the slots are called now. */
const COLOR_WORD = new RegExp('\\b(' + BASE_NAMES.join('|') + ')\\b(\u2019s)?', 'g');
function tcol(str) { return String(str).replace(COLOR_WORD, (m, w, poss) => COLORS[BASE_NAMES.indexOf(w)].name + (poss || '')); }
function retintTutorial() {
  if (typeof TUT_STEPS === 'undefined') return;
  for (const st of TUT_STEPS) {
    if (!st._t) { st._t = st.t; st._done = st.done; st._active = st.active; }
    st.t = tcol(st._t); st.done = tcol(st._done); st.active = tcol(st._active);
  }
}

/* ---------------------------------------------------------------------
   2. WORLD STATE
   --------------------------------------------------------------------- */
let water, road, lnk, sign, special, bAt, parkAt, depotAt;
let nodes = [], nodeList = [], edges = [], edgeMap = new Map(), netVer = 0, motoSeq = 0;
let buildings = [], cars = [], motorways = [], parks = [], depots = [];
let inv, perks, score = 0, week = 1, weekTimer = 0, houseTimer = 0, storeTimer = 0;
let money = 0, trucks = [];
let running = true, speed = 1, over = false, clock = 0, best = 0, started = false;
/* Spectating: this client is showing someone else's live city (see online.js). The layout comes from their
   snapshots; locally we only animate traffic, so anything random or player-driven is switched off. */
let spectating = false;
/* A tiny event bus so online.js (cloud saves, leaderboard, live view) can follow the game without touching it. */
const JEvents = {h: {}, on(n, f) { (this.h[n] = this.h[n] || []).push(f); }, emit(n, d) { for (const f of this.h[n] || []) { try { f(d); } catch (e) { console.error(e); } } }};
let span = CFG.startSpan, org = 0, camSpan = span, camOrg = 0;
let diffKey = 'standard', DIFF = DIFFS.standard;
let keepLeft = true, laneSign = -1;
let rush = {t: 0}, rain = {t: 0, amt: 0}, breakdownTimer = 30;
let solveBudget = 0, dispatchTimer = 0, carSeq = 0;
let closed = new Map(), closureTimer = 60, rerouteN = 0;       // closed road tile -> seconds left
let ambs = [], ambTimer = 60;
let stats = null;
let onewayDir = null;                                  // per tile: -1 = two-way, else 0-7 = the only allowed entry direction
let contractTimer = 40, cityStressClock = 0;
let tutorialMode = false, tutLastStage = -1, tutStage = 0, tutDone = new Set(), tutInspected = new Set(), tutLightTuned = false, tutShopOpened = false, tutEventTried = false, tutRoadBaseline = 0;
let carCapacity = CFG.carCapacityStart, carsBought = 0;
let lightClock = 0;
const lightQ = new Map();      // tile -> [cars per turn for side 0, for side 1], chosen by the player

const isRoad = k => k >= 0 && road[k] === 1;
const inPlay = k => { const c = cx(k), r = cy(k); return c >= org && r >= org && c < org + span && r < org + span; };
const occupied = k => road[k] === 1 || bAt[k] >= 0 || parkAt[k] >= 0 || depotAt[k] >= 0;
const ramp = (base, rmp, min) => Math.max(min, base - week * rmp);

function freshStats() {
  return {delivered: 0, trips: 0, waitSum: 0, waitN: 0, tows: 0, breakdowns: 0, hist: [], lastDeliveries: [],
          worstJam: 0, jamPct: 0, perMin: 0, avgWait: 0, earned: 0, spent: 0, hauls: 0, ambOk: 0, ambLate: 0, ambFail: 0,
          runHist: [], runStep: 5, runNext: 0, weekMarks: []};   // runHist: a sample every runStep seconds of the whole run, for the game-over chart
}

/* ---------------------------------------------------------------------
   Money. Parcels pay when they reach a house. Roads, lights, signs and the
   rest are bought at the moment they are placed: a piece already in stock
   is used first, otherwise it is paid for from cash.
   --------------------------------------------------------------------- */
const fmt$ = n => '$' + Math.floor(n + 1e-9).toLocaleString('en-US');
function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
let incomeLog = [];
function earn(n) { money += n; stats.earned += n; if (incomeLog.length && incomeLog[incomeLog.length - 1][0] > clock) incomeLog = []; incomeLog.push([clock, n]); }
function incomePerMin() {
  while (incomeLog.length && incomeLog[0][0] < clock - 60) incomeLog.shift();
  if (incomeLog.length && incomeLog[incomeLog.length - 1][0] > clock) incomeLog = [];
  let sum = 0; for (const e of incomeLog) sum += e[1];
  return sum * 60 / Math.max(20, Math.min(60, clock));
}
function spend(n) { money -= n; stats.spent += n; }
const canTake = kind => inv[kind] > 0 || money >= PRICE[kind];
function take(kind) {
  if (inv[kind] > 0) { inv[kind]--; return true; }
  if (money >= PRICE[kind]) { spend(PRICE[kind]); return true; }
  return false;
}
const shortBy = n => 'You need ' + fmt$(n - money) + ' more.';
const baseRate = s => CFG.parcelValue + s.lvl + s.tier * CFG.storeEvolveBonus;
const payMult = () => (1 + CFG.contractsBonus * perks.contracts) * (rush.t > 0 ? 1 + CFG.rushPayBonus : 1);
const payPerParcel = s => baseRate(s) * payMult();
const storeUpCost = s => s.lvl < CFG.storeUpgradeMax ? CFG.storeUpgradeCosts[s.lvl] : null;
const truckPrice = () => CFG.towTruckPrice + CFG.towTruckStep * trucks.length;
const juncLevels = () => { let n = 0; for (const nd of nodeList) n += nd.lvl || 0; return n; };
const junctionUpCost = nd => nd.lvl < CFG.junctionUpgradeMax ? Math.round(CFG.junctionUpgradeCosts[nd.lvl] + CFG.junctionUpgradeStep * juncLevels()) : null;
const roundCapOf = nd => CFG.roundCap + nd.lvl;
/* what each junction level does, by kind of junction */
function juncEffect(nd, l) {
  if (nd.type === 'yield') return (CFG.batchSize + perks.marshal + l) + ' cars through per turn';
  if (nd.type === 'light') return 'changeovers ' + Math.round(l * 15) + '% quicker, cars follow ' + Math.round(l * 12) + '% closer';
  if (nd.type === 'round') return 'up to ' + (CFG.roundCap + l) + ' cars circulate, entering ' + Math.round(l * 10) + '% quicker';
  return 'more cars per turn';
}

/* ---------------------------------------------------------------------
   Links between tiles. Roads only join where the player drew a link:
   lnk[k] is a bitmask (bit d = "joined to the neighbour in direction d").
   Two road tiles that merely sit side by side are NOT connected; a road
   that is dragged through or onto another one shares that tile and so
   crosses it (a - | - junction). Diagonals exist only where a diagonal
   step was drawn.
   --------------------------------------------------------------------- */
function linked(k, d) {
  if (k < 0 || road[k] !== 1) return false;
  if (!((lnk[k] >> d) & 1)) return false;
  return isRoad(nbr(k, d));
}
function setLink(k, d, on) {
  const n = nbr(k, d); if (n < 0) return;
  const o = (d + 4) % 8;
  if (on) { lnk[k] |= (1 << d); lnk[n] |= (1 << o); }
  else { lnk[k] &= ~(1 << d); lnk[n] &= ~(1 << o); }
}
function clearLinks(k) { for (let d = 0; d < 8; d++) if ((lnk[k] >> d) & 1) setLink(k, d, false); lnk[k] = 0; }
function dirBetween(a, b) { for (let d = 0; d < 8; d++) if (nbr(a, d) === b) return d; return -1; }
/* two diagonals may not cross in the middle of a 2x2 block */
function diagBlocked(k, d) {
  if (!DIAG(d)) return false;
  const n1 = nbr(k, (d + 1) % 8), n2 = nbr(k, (d + 7) % 8);
  return n1 >= 0 && n2 >= 0 && areLinked(n1, n2);
}
/* saves from before explicit links: rebuild what the old rule would have joined */
function legacyLinks() {
  for (let k = 0; k < N; k++) {
    if (!road[k]) continue;
    for (let d = 0; d < 8; d++) {
      const n = nbr(k, d); if (n < 0 || !road[n]) continue;
      if (DIAG(d) && isRoad(nbr(k, (d + 1) % 8)) && isRoad(nbr(k, (d + 7) % 8))) continue;
      lnk[k] |= (1 << d);
    }
  }
}
function linkCount(k) {
  let n = 0;
  for (let d = 0; d < 8; d++) if (linked(k, d)) n++;
  for (const m of motorways) if (m.a === k || m.b === k) n++;
  return n;
}
function areLinked(a, b) {
  for (let d = 0; d < 8; d++) if (nbr(a, d) === b) return linked(a, d);
  return false;
}
/* One-way roads. onewayDir[k] (-1 by default) names the ONE neighbour direction (from k's point of
   view) traffic is allowed to enter k from; the opposite approach is simply never built as a lane.
   It only ever applies to a plain two-way stretch (exactly two neighbours) — a junction ignores it,
   so widening a one-way tile into a junction later makes it two-way again automatically. */
function onewayBlocked(fromK, toK, d) {
  const allowed = onewayDir[toK];
  if (allowed < 0 || linkCount(toK) !== 2) return false;
  return ((d + 4) % 8) !== allowed;
}
function toggleOneway(k) {
  if (!isRoad(k)) { hint('One-way works on a plain stretch of road.'); return; }
  if (linkCount(k) !== 2 || (nodes[k] && nodes[k].junction)) { hint('One-way only works on a plain two-way stretch, not a junction.'); return; }
  const dirs = []; for (let d = 0; d < 8; d++) if (linked(k, d)) dirs.push(d);
  if (dirs.length !== 2) { hint('One-way only works on a plain two-way stretch.'); return; }
  const cur = onewayDir[k];
  if (cur < 0) onewayDir[k] = dirs[0];
  else if (cur === dirs[0]) onewayDir[k] = dirs[1];
  else onewayDir[k] = -1;
  rebuildNet(); refreshUI(); sfx('place');
}
/* Junction analysis. A corner that has been "chamfered" by a drawn diagonal
   is a fork, not a crossing: the two tiles on the inside are joined to
   each other, and one of them is a plain pass-through tile. Those are
   collapsed so an elbow never turns into a stop sign. */
function effDegree(k) {
  const ns = [];
  for (let d = 0; d < 8; d++) if (linked(k, d)) ns.push(nbr(k, d));
  let deg = ns.length + motorways.filter(m => m.a === k || m.b === k).length;
  const raw = deg;
  for (let i = 0; i < ns.length; i++)
    for (let j = i + 1; j < ns.length; j++)
      if (areLinked(ns[i], ns[j]) && (linkCount(ns[i]) === 2 || linkCount(ns[j]) === 2)) deg--;
  return Math.max(Math.min(raw, 2), deg);
}
const isJunction = k => nodes[k] ? nodes[k].junction : false;

/* ---------------------------------------------------------------------
   Turn rules
   --------------------------------------------------------------------- */
function signAllows(s, rel) {
  if (!s) return true;
  const ahead = rel === 0, right = rel >= 1 && rel <= 3, left = rel >= 5 && rel <= 7;
  switch (s) {
    case 'no-forward':   return !ahead;
    case 'no-right':     return !right;
    case 'no-left':      return !left;
    case 'only-forward': return ahead;
    case 'only-right':   return right;
    case 'only-left':    return left;
  }
  return true;
}
function isReverse(e, f) { return f.a === e.b && f.b === e.a; }
function turnAllowed(nd, e, f) {
  if (isReverse(e, f)) return false;
  return signAllows(sign[nd.k], relDir(e.d, f.d));
}
/* every legal exit from edge e; a dead end may turn round */
function exitsFor(nd, e) {
  const out = [];
  if (closed.size && closed.has(nd.k)) {              // a coned-off tile behaves like a dead end: the only way is back
    for (const f of nd.outs) if (isReverse(e, f)) out.push(f);
    return out;
  }
  for (const f of nd.outs) if (turnAllowed(nd, e, f)) out.push(f);
  if (!out.length) for (const f of nd.outs) if (isReverse(e, f)) out.push(f);
  return out;
}

/* ---------------------------------------------------------------------
   The graph. Every road tile is a node; every link is a pair of one-way
   lane edges. Edges keep their identity across rebuilds so that cars
   already on them are undisturbed.
   --------------------------------------------------------------------- */
function makeNode(k) {
  return {k, outs: [], ins: [], junction: false, type: 'free', deg: 0,
          wait: [], cross: [], crossEdge: null, actEdge: null, served: 0, gap: 0, idleAct: 0, blockT: 0,
          phaseOff: hash01(k, 3) * 6, passed: 0, qNow: 0, qPeak: 0, lvl: 0, spent: 0, waitSum: 0, waitN: 0, pg: -1,
          lph: 0, lnext: -1, lclear: 0, lserved: 0, lidle: 0, lstall: 0, ldem: [0, 0]};
}
function makeEdge(key, a, b, d, fast, L) {
  const ax = tx(a), ay = ty(a), bx = tx(b), by = ty(b);
  const len = L || Math.hypot(bx - ax, by - ay);
  const ux = (bx - ax) / (Math.hypot(bx - ax, by - ay) || 1), uy = (by - ay) / (Math.hypot(bx - ax, by - ay) || 1);
  const r0 = CELL * 0.3;
  return {key, id: 0, a, b, d, fast, L: Math.hypot(bx - ax, by - ay), ax, ay, bx, by, ux, uy, nx: -uy, ny: ux,
          r0, stop: Math.hypot(bx - ax, by - ay) - r0, cars: [], inb: [], q: 0, qRaw: 0, gap: 0, dead: false, passed: 0};
}

function rebuildNet() {
  netVer++;
  const oldNodes = nodes;
  nodes = new Array(N).fill(null);
  nodeList = [];
  for (let k = 0; k < N; k++) {
    if (!road[k]) continue;
    const nd = oldNodes[k] || makeNode(k);
    nd.outs = []; nd.ins = [];
    nodes[k] = nd; nodeList.push(nd);
  }
  const seen = new Set(), list = [];
  const take = (key, a, b, d, fast) => {
    let e = edgeMap.get(key);
    if (!e) { e = makeEdge(key, a, b, d, fast); edgeMap.set(key, e); }
    e.dead = false; seen.add(key); list.push(e);
    nodes[a].outs.push(e); nodes[b].ins.push(e);
  };
  for (const nd of nodeList)
    for (let d = 0; d < 8; d++) if (linked(nd.k, d)) {
      const n = nbr(nd.k, d);
      if (onewayBlocked(nd.k, n, d)) continue;          // a one-way tile only accepts traffic from its allowed side
      take(nd.k * 8 + d, nd.k, n, d, false);
    }
  for (const m of motorways) {
    const dab = approxDir(cx(m.b) - cx(m.a), cy(m.b) - cy(m.a));
    take(N * 8 + m.id * 2, m.a, m.b, dab, true);
    take(N * 8 + m.id * 2 + 1, m.b, m.a, (dab + 4) % 8, true);
  }
  for (const [key, e] of edgeMap) {
    if (seen.has(key)) continue;
    e.dead = true;
    for (const c of e.cars.slice()) tow(c, true);
    for (const c of e.inb.slice()) { if (c.state === 'exiting') { c.xf = null; c.xfEdge = null; } }
    edgeMap.delete(key);
  }
  edges = list;
  edges.forEach((e, i) => { e.id = i; });
  for (const nd of nodeList) {
    nd.ins.sort((p, q) => p.d - q.d);
    nd.deg = effDegree(nd.k);
    nd.junction = nd.deg >= 3;
    nd.type = 'free';
    if (nd.junction) nd.type = special[nd.k] === 'round' ? 'round' : special[nd.k] === 'light' ? 'light' : 'yield';
    if (nd.actEdge && nd.actEdge.dead) nd.actEdge = null;
  }
  linkBuildings();
  routeVersion++;
}
let routeVersion = 0;

/* Which road tile each building / bay attaches to. A building only
   attaches to a road tile that shares an EDGE with it (north, east, south
   or west), and it faces that tile. `pref` remembers the road the player
   last dragged into it, so it keeps facing that one. */
const ORTH = [0, 2, 4, 6];
function nearestRoadTo(k, pref) {
  if (pref !== undefined && pref >= 0 && road[pref]) for (const d of ORTH) if (nbr(k, d) === pref) return pref;
  let best = -1, bs = 9;
  for (const d of ORTH) {
    const t = nbr(k, d); if (t < 0 || !road[t]) continue;
    const sc = lnk[t] ? 0 : 1;                       // prefer a road that actually goes somewhere
    if (sc < bs) { bs = sc; best = t; }
  }
  return best;
}
function faceAngle(k, acc) {
  if (acc < 0) return 0;
  const a = Math.atan2(cy(acc) - cy(k), cx(acc) - cx(k)) - Math.PI / 2;
  return Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
}
function linkBuildings() {
  for (const b of buildings) { b.acc = nearestRoadTo(b.k, b.pref); b.face = faceAngle(b.k, b.acc); }
  for (const p of parks) p.face = buildings[p.b] ? buildings[p.b].face : 0;
  for (const d of depots) { d.acc = nearestRoadTo(d.k, d.pref); d.face = faceAngle(d.k, d.acc); }
  netVer++;                                          // driveways are part of the road drawing
}

/* ---------------------------------------------------------------------
   Routing. States are directed edges, so turn bans and signs can be
   honoured exactly. Costs are seconds: travel time, plus a price for every
   junction, plus whatever queue is currently standing on the lane.
   --------------------------------------------------------------------- */
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(p, v) {
    const a = this.a; a.push([p, v]); let i = a.length - 1;
    while (i > 0) { const j = (i - 1) >> 1; if (a[j][0] <= a[i][0]) break; const t = a[i]; a[i] = a[j]; a[j] = t; i = j; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break; const t = a[i]; a[i] = a[m]; a[m] = t; i = m;
      }
    }
    return top;
  }
}
let dDist = new Float32Array(2048), dPrev = new Int32Array(2048), dStamp = new Int32Array(2048), stampN = 0;
let lastCost = 0;
function edgeCost(e, avoid) {
  if (closed.size && closed.has(e.b)) return Infinity;      // nobody plans a route through coned-off road
  const sp = CFG.carSpeed * (e.fast ? CFG.motorwayScale : 1);
  let c = e.L / sp;
  const nd = nodes[e.b];
  if (nd) c += nd.type === 'yield' ? 2.3 : nd.type === 'light' ? 1.5 : nd.type === 'round' ? 1.0 : 0.05;
  c += e.q * 1.25;
  if (e === avoid) c += 8;
  return c;
}
/* startEdge: the lane a car is already on (route begins with it), or null
   to start at the tile fromK. Returns an array of edges or null. */
function planRoute(startEdge, fromK, toK, avoid) {
  const E = edges.length;
  if (dDist.length < E + 4) { dDist = new Float32Array(E * 2); dPrev = new Int32Array(E * 2); dStamp = new Int32Array(E * 2); }
  stampN++;
  const heap = new Heap();
  const setD = (e, d, p) => { dDist[e.id] = d; dPrev[e.id] = p; dStamp[e.id] = stampN; heap.push(d, e); };
  if (startEdge) {
    if (startEdge.dead) return null;
    if (startEdge.b === toK) { lastCost = 0; return [startEdge]; }
    setD(startEdge, 0, -1);
  } else {
    if (fromK === toK) { lastCost = 0; return []; }
    const nd = nodes[fromK];
    if (!nd) return null;
    for (const f of nd.outs) { const ec = edgeCost(f, avoid); if (ec < Infinity) setD(f, ec, -1); }
  }
  while (heap.size) {
    const [d, e] = heap.pop();
    if (dStamp[e.id] !== stampN || d > dDist[e.id] + 1e-4) continue;
    if (e.b === toK) {
      const path = [];
      let cur = e.id;
      while (cur >= 0) { path.push(edges[cur]); cur = dPrev[cur]; }
      path.reverse(); lastCost = d; return path;
    }
    const nd = nodes[e.b];
    if (!nd) continue;
    for (const f of exitsFor(nd, e)) {
      const ec = edgeCost(f, avoid); if (ec === Infinity) continue;
      const nc = d + ec;
      if (dStamp[f.id] !== stampN || nc < dDist[f.id] - 1e-4) setD(f, nc, e.id);
    }
  }
  return null;
}

/* ---------------------------------------------------------------------
   3. TRAFFIC
   Cars ride lane edges, follow the car ahead, and queue back through
   tiles. Junctions are little controllers that decide who may cross:

     yield  – a give-way junction. One side at a time; up to three cars
              (CFG.batchSize) go from that side, slowly, then the next
              side with a waiting car gets its turn.
     light  – two phases, several cars per phase, both directions at once.
     round  – any side may enter while fewer than two cars are circulating.
     free   – a plain tile: cars simply roll through when there is room.

   A car is never let into a junction unless the lane it wants has room
   for it, so a full street backs up instead of being driven over.
   --------------------------------------------------------------------- */
/* Per-vehicle upgrades. Every car and van has three tracks, bought individually from its
   inspector; each level also changes how the vehicle looks. */
const CAR_UP = {
  cap:  {name: 'Carry size', max: 4, cost: [25, 45, 75, 110], what: '+1 parcel slot, 10% slower'},
  spd:  {name: 'Speed',      max: 3, cost: [30, 55, 90],      what: '+12% top speed'},
  load: {name: 'Loading',    max: 2, cost: [20, 40],          what: 'loads 20% faster'}
};
/* Carry size picks the body; speed picks the kit fitted to it. Vans bought from the Shop start as a panel van. */
const BODY = [
  {name: 'Hatchback', L: 12,   W: 6.6},
  {name: 'Estate',    L: 13.4, W: 6.6},
  {name: 'Pickup',    L: 14.4, W: 7.0},
  {name: 'Panel van', L: 15.2, W: 7.4},
  {name: 'Box truck', L: 17.2, W: 8.0}
];
const KIT = ['Stock', 'Sport', 'GT', 'Racer'];
const bodyOf = c => Math.min(BODY.length - 1, c.van ? Math.max(3, carUp(c, 'cap')) : carUp(c, 'cap'));
const modelName = c => (carUp(c, 'spd') ? KIT[carUp(c, 'spd')] + ' ' : '') + BODY[bodyOf(c)].name.toLowerCase();
function syncCarLen(c) { if (!c.isTruck) c.len = BODY[bodyOf(c)].L; }
function makeVan(c) { if (!c) return; c.van = true; syncCarLen(c); }
const carUp = (c, t) => (c && c.up && c.up[t]) || 0;
const carUpTotal = c => carUp(c, 'cap') + carUp(c, 'spd') + carUp(c, 'load');
function carUpCost(c, t) { const l = carUp(c, t); return l >= CAR_UP[t].max ? null : CAR_UP[t].cost[l]; }
function upgradeCar(id, t) {
  const c = cars.find(x => x.id === id); if (!c || !CAR_UP[t]) return false;
  const p = carUpCost(c, t);
  if (p === null) { hint('That upgrade is already maxed out.'); return false; }
  if (money < p) { hint(CAR_UP[t].name + ' costs ' + fmt$(p) + '. ' + shortBy(p)); return false; }
  spend(p); c.up[t]++;
  syncCarLen(c);
  popRing(c.x, c.y, '#ffc933'); popText(c.x, c.y - 14, t === 'load' ? 'Loading ' + c.up.load : modelName(c).replace(/^./, m => m.toUpperCase()), '#ffc933');
  sfx('upgrade'); bump('v-money'); refreshUI(); renderInspector();
  return true;
}
function carBuyPrice(b) {
  return Math.round(CFG.carBuyBase * Math.pow(CFG.carBuyRamp, b.extra || 0) * (1 + CFG.carBuyCityRamp * carsBought));
}
function buyHouseCar(bi) {
  const b = buildings[bi]; if (!b || b.type !== 'house') return false;
  if ((b.extra || 0) >= CFG.carBuyExtraMax || b.carsN >= CFG.carsPerHouseMax) { hint('That house\u2019s forecourt is full.'); return false; }
  const p = carBuyPrice(b);
  if (money < p) { hint('A new car here costs ' + fmt$(p) + '. ' + shortBy(p)); return false; }
  spend(p); b.extra = (b.extra || 0) + 1; carsBought++;
  addCar(bi);
  for (const c of b.cars) if (c.state === 'parked' && c.loc.t === 'home') { const q = parkedPose(c); c.x = q.x; c.y = q.y; c.ang = q.a; }
  popRing(tx(b.k), ty(b.k), COLORS[b.color].hex); popText(tx(b.k), ty(b.k) - 16, 'New car', COLORS[b.color].hex);
  sfx('upgrade'); bump('v-money'); refreshUI(); renderInspector();
  return true;
}
const carCap = c => carCapacity + (c.van ? CFG.vanCapacityBonus : 0) + carUp(c, 'cap');
const houseCap = h => Math.min(CFG.carsPerHouseMax, CFG.carsPerHouse + (h.extra || 0) + h.park * CFG.parkCarsPerLot);
const storeCap = s => CFG.pinCapacity + s.park * CFG.parkPinsPerLot;
const dockCap = s => CFG.docksPerStore + s.park * CFG.parkDocksPerLot;
const overflowLimit = () => (CFG.overflowSeconds + 4 * perks.patience) * DIFF.over;

const _p = {x: 0, y: 0};
function laneAt(e, s) {
  const o = CFG.laneOffset * laneSign;
  return {x: e.ax + e.ux * s + e.nx * o, y: e.ay + e.uy * s + e.ny * o};
}
function carVmax(c, e) {
  let v = CFG.carSpeed * (1 + 0.1 * perks.tyres);
  if (c.isTruck) v = CFG.carSpeed * CFG.towTruckSpeed * (1 + 0.15 * perks.winch);
  if (c.isAmb) v = CFG.carSpeed * CFG.ambSpeed;
  if (c.van) v *= CFG.vanSpeedScale;
  if (!c.isTruck) v *= (1 + 0.12 * carUp(c, 'spd')) * Math.pow(0.9, carUp(c, 'cap'));
  if (rain.amt > 0.05 && !perks.grip) v *= 1 - (1 - CFG.rainSlow) * rain.amt;
  if (e && e.fast) v *= CFG.motorwayScale;
  return v;
}
function angDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }

/* ------------------------------------------------------- parking spots */
function rot(cxp, cyp, th, lx, ly) {
  const c = Math.cos(th), s = Math.sin(th);
  return {x: cxp + lx * c - ly * s, y: cyp + lx * s + ly * c};
}
function homeSpots(b) {
  const list = [], x = tx(b.k), y = ty(b.k), th = b.face || 0;
  const nHome = CFG.carsPerHouse + (b.extra || 0), xs = nHome >= 4 ? [-9, -3, 3, 9] : nHome === 3 ? [-8, 0, 8] : [-6, 6];
  for (const lx of xs) { const p = rot(x, y, th, lx, 9.5); list.push({x: p.x, y: p.y, a: th + Math.PI / 2}); }
  for (const p of parks) if (buildings[p.b] === b) {
    const q = rot(tx(p.k), ty(p.k), p.face || 0, -6, 0);
    list.push({x: q.x, y: q.y, a: (p.face || 0) + Math.PI / 2});
  }
  return list;
}
function dockSpots(s) {
  const list = [], x = tx(s.k), y = ty(s.k), th = s.face || 0;
  for (const lx of [-7, 7]) { const p = rot(x, y, th, lx, 10.5); list.push({x: p.x, y: p.y, a: th + Math.PI / 2}); }
  for (const p of parks) if (buildings[p.b] === s) {
    const q = rot(tx(p.k), ty(p.k), p.face || 0, 6, 0);
    list.push({x: q.x, y: q.y, a: (p.face || 0) + Math.PI / 2});
  }
  return list;
}
function baySpots(d) {
  const list = [], x = tx(d.k), y = ty(d.k), th = d.face || 0;
  for (const [lx, ly] of [[-6.5, -6.5], [6.5, -6.5], [-6.5, 6.5], [6.5, 6.5]]) {
    const p = rot(x, y, th, lx, ly); list.push({x: p.x, y: p.y, a: th + Math.PI / 2});
  }
  return list;
}
function parkedPose(c) {
  const L = c.loc;
  if (L.t === 'yard') {
    const s = buildings[L.i], p = rot(tx(s.k), ty(s.k), s.face || 0, 0, 10.5);
    return {x: p.x, y: p.y, a: (s.face || 0) + Math.PI / 2};
  }
  if (L.t === 'home') {
    const b = buildings[c.home], sp = homeSpots(b), i = Math.max(0, b.cars.indexOf(c));
    return sp[Math.min(i, sp.length - 1)];
  }
  if (L.t === 'bay') {
    const d = depots[L.i]; if (!d) return {x: c.x, y: c.y, a: c.ang};
    const sp = baySpots(d), i = Math.max(0, d.slots.indexOf(c));
    return sp[Math.min(i, sp.length - 1)];
  }
  const s = buildings[L.i], sp = dockSpots(s), i = Math.max(0, s.docks.indexOf(c));
  return sp[Math.min(i, sp.length - 1)];
}

/* ------------------------------------------------------------ car life */
function addCar(bi) {
  const h = buildings[bi];
  const c = {id: ++carSeq, home: bi, color: h.color, van: false, state: 'parked', loc: {t: 'home', i: bi},
    x: 0, y: 0, ang: 0, v: 0, len: CFG.carLen, edge: null, s: 0, route: null, ri: 0, destNode: -1,
    job: null, store: -1, bay: -1, want: 0, load: 0, taken: false, timer: 0,
    stopT: 0, stopAcc: 0, blockedT: 0, replanT: rnd(1, CFG.replanSeconds), replanCool: 0, planFail: 0,
    brake: false, broken: 0, xf: null, xfEdge: null, cr: null, idle: 0, trips: 0, carried: 0, tripStart: 0, hazard: 0,
    cash: 0, claim: null, towedBy: null, up: {cap: 0, spd: 0, load: 0}};
  h.cars.push(c); cars.push(c); h.carsN = h.cars.length;
  const p = parkedPose(c); c.x = p.x; c.y = p.y; c.ang = p.a;
  return c;
}
function removeCar(c) {
  tow(c, true);
  const b = buildings[c.home];
  if (b) { const i = b.cars.indexOf(c); if (i >= 0) b.cars.splice(i, 1); b.carsN = b.cars.length; }
  const j = cars.indexOf(c); if (j >= 0) cars.splice(j, 1);
}
function nodeOfParked(c) {
  const L = c.loc;
  if (L.t === 'yard') return buildings[L.i].acc;
  if (L.t === 'home') return buildings[c.home].acc;
  if (L.t === 'bay') { const d = depots[L.i]; return d ? d.acc : -1; }
  return buildings[L.i].acc;
}
function destNodeOf(c) {
  if (c.isAmb) { const s = buildings[c.store]; return s ? s.acc : -1; }
  if (c.isTruck) { const s = buildings[c.store]; return c.job === 'home' && s ? s.acc : -1; }
  if (c.job === 'fetch') { const s = buildings[c.store]; return s ? s.acc : -1; }
  if (c.job === 'return') return buildings[c.home].acc;
  if (c.job === 'reposition') { const d = depots[c.bay]; return d ? d.acc : -1; }
  return -1;
}
function leaveSpot(c) {
  const L = c.loc;
  if (L.t === 'bay') { const d = depots[L.i]; if (d) { const i = d.slots.indexOf(c); if (i >= 0) d.slots.splice(i, 1); } }
  else if (L.t === 'store') { const s = buildings[L.i]; if (s) { const i = s.docks.indexOf(c); if (i >= 0) s.docks.splice(i, 1); } }
}
function dropFromRoad(c) {
  if (c.edge) { const i = c.edge.cars.indexOf(c); if (i >= 0) c.edge.cars.splice(i, 1); c.edge = null; }
  if (c.cr) {
    const i = c.cr.node.cross.indexOf(c); if (i >= 0) c.cr.node.cross.splice(i, 1);
    const j = c.cr.outE.inb.indexOf(c); if (j >= 0) c.cr.outE.inb.splice(j, 1);
    if (!c.cr.node.cross.length) c.cr.node.crossEdge = null;
    c.cr = null;
  }
  if (c.xfEdge) { const j = c.xfEdge.inb.indexOf(c); if (j >= 0) c.xfEdge.inb.splice(j, 1); c.xfEdge = null; }
  c.xf = null;
}
function releaseClaims(c) {
  if (c.job === 'fetch' && !c.taken) { const s = buildings[c.store]; if (s) s.claimed = Math.max(0, s.claimed - c.want); }
  if (c.job === 'reposition') { const d = depots[c.bay]; if (d) d.res = Math.max(0, d.res - 1); }
}
/* A tow truck clears a car straight back to its driveway. */
function tow(c, silent) {
  if (c.isAmb) { ambEnd(c, silent ? 'removed' : 'lost'); return; }
  if (c.isTruck) { truckReset(c); return; }
  dropFromRoad(c);
  if (c.towedBy) { if (c.towedBy.hauling === c) c.towedBy.hauling = null; c.towedBy = null; }
  if (c.claim) { if (c.claim.tgt === c) c.claim.tgt = null; if (c.claim.hook && c.claim.hook.car === c) c.claim.hook = null; c.claim = null; }
  if (c.loc && (c.loc.t === 'store' || c.loc.t === 'bay')) leaveSpot(c);
  releaseClaims(c);
  const lost = c.load;
  c.load = 0; c.cash = 0; c.want = 0; c.job = null; c.route = null; c.taken = false; c.broken = 0; c.hazard = 0;
  c.state = 'parked'; c.loc = {t: 'home', i: c.home}; c.v = 0; c.idle = 0; c.blockedT = 0; c.stopT = 0; c.stopAcc = 0;
  const p = parkedPose(c); c.x = p.x; c.y = p.y; c.ang = p.a;
  if (!silent) {
    stats.tows++;
    toast('The council tow truck cleared a stuck ' + COLORS[c.color].name + ' car' + (lost ? ' — ' + lost + ' parcel' + (lost > 1 ? 's' : '') + ' lost' : ''), 'warn');
    sfx('alarm');
  }
}
function cancelJob(c) {
  if (c.isTruck) { truckReset(c); return; }
  releaseClaims(c);
  c.job = null; c.route = null; c.want = 0;
  if (c.state === 'exiting') { c.state = 'parked'; c.xf = null; }
}

/* room for a car of length `len` to land at the start of lane f? */
function progressOf(x) {
  if (x.state === 'crossing' && x.cr) return x.cr.u;
  if (x.xf) return clamp(x.xf.t / x.xf.dur, 0, 1);
  return 1;
}
function roomOn(f, len, self) {
  if (self && self.isTruck && truckMayMerge(self, f)) return true;
  const cs = f.cars;
  if (cs.length) {
    const l = cs[cs.length - 1];
    if (l.s - f.r0 < (l.len + len) / 2 + CFG.carGap) return false;
  }
  for (const x of f.inb) { if (x !== self && progressOf(x) < 0.7) return false; }
  return true;
}
/* ---- sensor-driven traffic lights ----------------------------------------
   A light has two sides (the two axis groups, see groupOf). A sensor on every
   approach counts the cars heading for the junction:
     - cars on one side only  -> that side stays green (no limit)
     - cars on both sides     -> each side gets its own count of cars per turn
                                 (default 3 each, set by clicking the light)
     - the green side runs dry -> hand over straight away to the waiting side
   Between sides everything is red while the box empties. */
function lightCfg(k) {
  let q = lightQ.get(k);
  if (!q) { q = [CFG.lightBatch, CFG.lightBatch]; lightQ.set(k, q); }
  return q;
}
function setLightQ(k, g, v) {
  const q = lightCfg(k), n = Math.round(+v);
  q[g] = clamp(isFinite(n) ? n : CFG.lightBatch, 1, CFG.lightMax);
  if (tutorialMode) tutLightTuned = true;
}
function lightState(nd) { return {ph: nd.lph, allRed: nd.lnext >= 0}; }
/* the sensor: cars on (or just about to land on) this side's approach lanes that still need to cross */
function lightWants(c, i) {
  if (c.prio) return !!c.route && i < c.route.length - 1;          // an emergency vehicle always counts, even when it is slowed
  return !!c.route && i < c.route.length - 1 && !(c.broken > 0) && !c.hook;
}
function lightDemand(nd, g) {
  let n = 0;
  for (const e of nd.ins) {
    if (e.dead || groupOf(e) !== g) continue;
    for (const c of e.cars) if (lightWants(c, c.ri)) n++;
    for (const c of e.inb) if (lightWants(c, c.state === 'crossing' ? c.ri + 1 : c.ri)) n++;
  }
  return n;
}
/* may a lead car on lane e roll through right now? */
function lightOpen(nd, e) {
  if (nd.lnext >= 0 || groupOf(e) !== nd.lph) return false;
  if (nd.pg >= 0) return nd.pg === nd.lph;                        // an emergency vehicle is coming: its side stays open, whatever the count
  return !(nd.lserved >= lightCfg(nd.k)[nd.lph] && nd.ldem[1 - nd.lph] > 0);
}
const groupOf = e => (e.d % 4) < 2 ? 0 : 1;

/* the next lane a car intends to take, if it is still legal */
function validNext(c, e, nd) {
  const r = c.route; if (!r) return null;
  const f = r[c.ri + 1];
  if (!f || f.dead || f.a !== e.b) return null;
  if (isReverse(e, f)) return exitsFor(nd, e).includes(f) ? f : null;
  if (closed.size && closed.has(nd.k)) return null;
  return signAllows(sign[nd.k], relDir(e.d, f.d)) ? f : null;
}
/* -1: the destination has changed underneath us, 0: no space yet, 1: go */
function destOk(c) {
  const e = c.edge;
  if (!e || c.destNode !== e.b) return -1;
  if (c.isAmb) { const s = buildings[c.store]; return s && s.acc === e.b ? 1 : -1; }
  if (c.isTruck) { const s = buildings[c.store]; return c.job === 'home' && s && s.acc === e.b ? 1 : -1; }
  if (c.job === 'fetch') {
    const s = buildings[c.store];
    if (!s || s.acc !== e.b) return -1;
    return s.docks.length < dockCap(s) ? 1 : 0;
  }
  if (c.job === 'return') { const h = buildings[c.home]; return h.acc === e.b ? 1 : -1; }
  if (c.job === 'reposition') { const d = depots[c.bay]; return d && d.acc === e.b ? 1 : -1; }
  return -1;
}
/* could this lead car roll through its stop line right now, without stopping? */
function leaderPass(e, c, nd) {
  if (!c.route || c.broken > 0 || c.hook) return false;
  if (c.ri >= c.route.length - 1) return destOk(c) === 1;
  if (!nd) return false;
  const f = validNext(c, e, nd);
  if (!f || !roomOn(f, c.len, c)) return false;
  switch (nd.type) {
    case 'free':  return true;
    case 'round': return nd.cross.length < roundCapOf(nd) && nd.gap <= 0;
    case 'light': return lightOpen(nd, e) && e.gap <= 0;
  }
  return false;
}

/* --------------------------------------------- moving along a lane */
function moveEdge(e, dt) {
  const cs = e.cars; let q = 0;
  const nd = nodes[e.b];
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    let limit, lv = 0;
    if (i === 0) limit = e.stop + (leaderPass(e, c, nd) ? 1.5 : 0);
    else { const l = cs[i - 1]; limit = l.s - (l.len + c.len) / 2 - CFG.carGap; lv = l.v; }
    let vmax = (c.broken > 0 || c.hook) ? 0 : carVmax(c, e);
    const dist = limit - c.s;
    let vdes = Math.min(vmax, Math.max(0, dist) * 3.6 + (i > 0 ? lv * 0.5 : 0) + (dist > 0.6 && vmax > 0 ? 5 : 0));
    const pv = c.v;
    const calmDrive = DIFF.calm ? 0.55 : 1;
    if (c.v < vdes) c.v = Math.min(vdes, c.v + CFG.accel * calmDrive * dt);
    else c.v = Math.max(vdes, c.v - CFG.brake * calmDrive * dt);
    c.brake = c.v < pv - 0.05 || (c.v < 2 && vmax > 0);
    let ns = c.s + c.v * dt;
    if (ns > limit) { ns = Math.max(c.s, limit); if (c.v > 0) c.v = Math.min(c.v, Math.max(0, (ns - c.s) / dt)); }
    c.s = ns;
    if (c.v < 1.6) { c.stopT += dt; c.stopAcc += dt; } else c.stopT = Math.max(0, c.stopT - dt * 2);
    if (c.v < 4) q++;
    const o = CFG.laneOffset * laneSign;
    c.x = e.ax + e.ux * c.s + e.nx * o; c.y = e.ay + e.uy * c.s + e.ny * o;
    const ta = Math.atan2(e.uy, e.ux);
    c.ang = Math.abs(angDiff(c.ang, ta)) < 0.02 ? ta : c.ang + angDiff(c.ang, ta) * Math.min(1, dt * 12);
    if (c.broken > 0) { c.broken -= dt; c.hazard += dt; if (c.broken <= 0) { c.broken = 0; c.hazard = 0; } }
  }
  e.qRaw = q;
  e.q += (q - e.q) * Math.min(1, dt * 1.6);
  if (e.gap > 0) e.gap -= dt;
}

/* ---------------------------------------------------- crossing nodes */
function beginCross(nd, c, f, kind) {
  const e = c.edge;
  nd.waitSum += c.stopT; nd.waitN++;                   // how long this car stood at the line (recent cars count most)
  if (nd.waitN > 40) { nd.waitSum *= 0.5; nd.waitN *= 0.5; }
  const p0x = c.x, p0y = c.y, P1 = laneAt(f, f.r0);
  const o = CFG.laneOffset * laneSign;
  const ox = e.ax + e.ux * c.s + e.nx * o, oy = e.ay + e.uy * c.s + e.ny * o;
  const mx = (p0x + P1.x) / 2, my = (p0y + P1.y) / 2;
  let ccx = mx, ccy = my;
  const cross = e.ux * f.uy - e.uy * f.ux;
  if (Math.abs(cross) > 0.25) {
    const t = ((P1.x - ox) * f.uy - (P1.y - oy) * f.ux) / cross;
    const ix = ox + t * e.ux, iy = oy + t * e.uy;
    if (Math.hypot(ix - mx, iy - my) < CELL * 0.7) { ccx = ix; ccy = iy; }
  }
  const chord = Math.hypot(P1.x - p0x, P1.y - p0y);
  const poly = Math.hypot(ccx - p0x, ccy - p0y) + Math.hypot(P1.x - ccx, P1.y - ccy);
  const len = Math.max(6, (2 * chord + poly) / 3);
  const vmax = carVmax(c, e);
  let sp;
  if (kind === 'free') sp = Math.max(c.v, vmax * 0.55);
  else if (kind === 'yield') sp = vmax * CFG.crossScale * (1 + 0.08 * perks.quick);
  else if (kind === 'light') sp = vmax * 0.75;
  else sp = vmax * CFG.roundScale;
  const ci = e.cars.indexOf(c); if (ci >= 0) e.cars.splice(ci, 1);
  c.cr = {node: nd, inE: e, outE: f, u: 0, len, speed: sp, x0: p0x, y0: p0y, cx: ccx, cy: ccy, x1: P1.x, y1: P1.y};
  c.state = 'crossing'; c.edge = null; c.blockedT = 0; c.stopT = 0;
  nd.cross.push(c); nd.crossEdge = e; nd.passed++; e.passed++;
  f.inb.push(c);
}
function stepCross(nd, dt) {
  for (let i = nd.cross.length - 1; i >= 0; i--) {
    const c = nd.cross[i], cr = c.cr;
    cr.u += cr.speed * dt / cr.len;
    c.v = cr.speed;
    const u = Math.min(1, cr.u), w = 1 - u;
    c.x = w * w * cr.x0 + 2 * w * u * cr.cx + u * u * cr.x1;
    c.y = w * w * cr.y0 + 2 * w * u * cr.cy + u * u * cr.y1;
    const dx = 2 * w * (cr.cx - cr.x0) + 2 * u * (cr.x1 - cr.cx), dy = 2 * w * (cr.cy - cr.y0) + 2 * u * (cr.y1 - cr.cy);
    if (Math.abs(dx) + Math.abs(dy) > 1e-3) { const ta = Math.atan2(dy, dx); c.ang += angDiff(c.ang, ta) * Math.min(1, dt * 14); }
    c.brake = false;
    if (cr.u >= 1) {
      nd.cross.splice(i, 1);
      const f = cr.outE, j = f.inb.indexOf(c); if (j >= 0) f.inb.splice(j, 1);
      if (f.dead) { c.cr = null; tow(c, true); continue; }
      f.cars.push(c); c.edge = f; c.s = f.r0; c.ri++; c.state = 'driving'; c.cr = null; c.v = cr.speed;
      if (!nd.cross.length) nd.crossEdge = null;
    }
  }
}
/* can this waiting lead car go? returns its next lane or null. also
   keeps the "blocked" clock that eventually calls a tow truck */
function canGo(nd, c, dt) {
  const e = c.edge;
  const f = validNext(c, e, nd);
  if (!f) {
    if (c.replanCool <= 0 && solveBudget > 0) {
      c.replanCool = 1;
      if (!replan(c)) { c.planFail++; if (c.planFail >= 3) giveUp(c); }
    }
    return null;
  }
  if (roomOn(f, c.len, c)) { c.blockedT = Math.max(0, c.blockedT - dt * 2); return f; }
  c.blockedT += dt;
  if (c.blockedT > 1.4 && c.replanCool <= 0 && solveBudget > 0) { c.replanCool = 3; replan(c, f); }
  if (c.blockedT > CFG.gridlockSeconds) tow(c, false);
  return null;
}
function headOf(nd, e) {
  const W = nd.wait;
  for (let i = 0; i < W.length; i++) if (W[i].edge === e) return W[i];
  return null;
}
function runLight(nd, dt) {
  const W = nd.wait, q = lightCfg(nd.k), pg = nd.pg;
  nd.ldem[0] = lightDemand(nd, 0); nd.ldem[1] = lightDemand(nd, 1);
  if (nd.lnext >= 0 && pg >= 0 && nd.lph === pg) { nd.lnext = -1; nd.lidle = 0; nd.lstall = 0; }   // it was about to lose green: give it back
  if (nd.lnext >= 0) {                                  // all red: wait for the box to empty, then flip
    nd.lclear -= dt;
    if (nd.lclear <= 0 && !nd.cross.length) { nd.lph = nd.lnext; nd.lnext = -1; nd.lserved = 0; nd.lidle = 0; nd.lstall = 0; }
    return;
  }
  const cur = nd.lph, oth = 1 - cur, dc = nd.ldem[cur], dw = nd.ldem[oth];
  let swap = false;
  if (pg >= 0) { if (cur !== pg) swap = true; }          // the emergency vehicle's side gets green now, and keeps it until it has passed
  else if (dw > 0) {
    if (dc === 0) { nd.lidle += dt; if (nd.lidle >= CFG.lightGapOut) swap = true; }        // green side finished
    else {
      nd.lidle = 0;
      if (nd.lserved >= q[cur]) swap = true;                                                // its count is used up
      else { nd.lstall += dt; if (nd.lstall >= CFG.lightStall) swap = true; }               // it can't move (jam, breakdown)
    }
  } else { nd.lidle = 0; nd.lstall = 0; }                                                    // nobody waiting: stay green
  if (swap) { nd.lnext = oth; nd.lclear = ((nd.cross.length || dc) ? CFG.lightAllRed : CFG.lightAllRed * 0.4) * (1 - 0.15 * nd.lvl); return; }
  for (const c of W) {
    const e = c.edge;
    if (groupOf(e) !== cur || e.gap > 0) continue;
    if (nd.lserved >= q[cur] && dw > 0 && pg < 0) break;
    const f = canGo(nd, c, dt);
    if (f) { beginCross(nd, c, f, 'light'); e.gap = CFG.lightHeadway * (1 - 0.1 * perks.quick) * (1 - 0.12 * nd.lvl); nd.lserved++; nd.lstall = 0; }
  }
}
function runNode(nd, dt) {
  const W = nd.wait;
  nd.qNow = W.length;
  if (nd.qNow > nd.qPeak) nd.qPeak = nd.qNow;
  if (nd.type === 'yield') {
    const batch = CFG.batchSize + perks.marshal + nd.lvl;
    let act = nd.actEdge;
    if (act && !headOf(nd, act)) nd.idleAct += dt; else nd.idleAct = 0;
    if (!W.length && !nd.cross.length) { if (act && nd.idleAct > 0.6) { nd.actEdge = null; nd.served = 0; } return; }
    const needSwitch = !act || nd.served >= batch || nd.idleAct > 0.6 || nd.blockT > 0.9;
    if (needSwitch && !nd.cross.length) {
      const ins = nd.ins, start = act ? ins.indexOf(act) : -1;
      let chosen = null;
      for (let i = 1; i <= ins.length; i++) {
        const e = ins[((start + i) % ins.length + ins.length) % ins.length];
        const h = headOf(nd, e);
        if (!h) continue;
        const f = validNext(h, e, nd);
        if (f && roomOn(f, h.len, h)) { chosen = e; break; }
      }
      if (chosen) {
        if (chosen !== act) nd.gap = Math.max(nd.gap, CFG.clearTime);
        nd.actEdge = chosen; nd.served = 0; nd.blockT = 0; nd.idleAct = 0;
      }
    }
    if (nd.actEdge && nd.gap <= 0 && nd.served < batch) {
      const h = headOf(nd, nd.actEdge);
      if (h && !(nd.cross.length && nd.crossEdge !== nd.actEdge)) {
        const f = canGo(nd, h, dt);
        if (f) { beginCross(nd, h, f, 'yield'); nd.served++; nd.gap = CFG.headway * (1 - 0.12 * perks.quick); nd.blockT = 0; }
        else nd.blockT += dt;
      }
    }
    // cars that can't go still need their blocked clocks to tick
    for (const c of W) if (c.edge && c.edge !== nd.actEdge) { const f = validNext(c, c.edge, nd); if (f && !roomOn(f, c.len, c)) c.blockedT += dt * 0.5; }
    return;
  }
  if (nd.type === 'light') { runLight(nd, dt); return; }
  if (nd.type === 'round') {
    const ins = nd.ins, n = Math.max(1, ins.length), last = nd.lastIn || 0;
    const order = W.slice().sort((p, q) => ((ins.indexOf(p.edge) - last - 1 + n * 2) % n) - ((ins.indexOf(q.edge) - last - 1 + n * 2) % n));
    for (const c of order) {
      if (nd.cross.length >= roundCapOf(nd) || nd.gap > 0) break;
      const f = canGo(nd, c, dt);
      if (f) { nd.lastIn = ins.indexOf(c.edge); beginCross(nd, c, f, 'round'); nd.gap = CFG.roundHeadway * (1 - 0.1 * perks.quick) * (1 - 0.1 * nd.lvl); }
    }
    return;
  }
  for (const c of W.slice()) {           // free tile
    const f = canGo(nd, c, dt);
    if (f) beginCross(nd, c, f, 'free');
  }
}

/* ---------------------------------------------------- replanning */
function replan(c, avoid) {
  if (solveBudget <= 0 || c.state !== 'driving' || !c.edge) return false;
  if (c.isTruck) return truckReplan(c);
  const dest = destNodeOf(c);
  if (dest < 0) { giveUp(c); return false; }
  solveBudget--;
  const r = planRoute(c.edge, null, dest, avoid);
  if (r) { c.route = r; c.ri = 0; c.destNode = dest; c.planFail = 0; return true; }
  return false;
}
/* the trip can't be completed: go home, or failing that, be towed */
function giveUp(c) {
  if (c.isTruck) { if (c.job === 'seek') truckHeadHome(c); else truckReset(c); return; }
  if (c.job === 'return') { tow(c, true); return; }
  releaseClaims(c);
  c.job = 'return'; c.want = 0; c.taken = false;
  if (c.state === 'driving' && c.edge) {
    const dest = buildings[c.home].acc;
    const r = dest >= 0 ? planRoute(c.edge, null, dest) : null;
    if (r) { c.route = r; c.ri = 0; c.destNode = dest; c.planFail = 0; return; }
  }
  tow(c, true);
}

/* --------------------------------------------- entering & leaving */
function startEnter(c) {
  if (c.edge) { const i = c.edge.cars.indexOf(c); if (i >= 0) c.edge.cars.splice(i, 1); c.edge = null; }
  let pose;
  if (c.isTruck) {
    c.loc = {t: 'yard', i: c.store}; pose = parkedPose(c);
  } else if (c.job === 'fetch') {
    const s = buildings[c.store]; s.docks.push(c); c.loc = {t: 'store', i: c.store}; pose = parkedPose(c);
  } else if (c.job === 'return') {
    c.loc = {t: 'home', i: c.home}; pose = parkedPose(c);
  } else {
    const d = depots[c.bay]; d.res = Math.max(0, d.res - 1); d.slots.push(c); c.loc = {t: 'bay', i: c.bay}; pose = parkedPose(c);
  }
  c.state = 'entering'; c.v = 0;
  c.xf = {t: 0, dur: 0.6, x0: c.x, y0: c.y, a0: c.ang, x1: pose.x, y1: pose.y, a1: pose.a};
}
function stepXf(c, dt) {
  const xf = c.xf; xf.t += dt;
  const u = clamp(xf.t / xf.dur, 0, 1), w = u * u * (3 - 2 * u);
  c.x = lerp(xf.x0, xf.x1, w); c.y = lerp(xf.y0, xf.y1, w);
  c.ang = xf.a0 + angDiff(xf.a0, xf.a1) * w;
  return xf.t >= xf.dur;
}
function arrive(c) {
  c.xf = null; c.v = 0; c.blockedT = 0; c.stopT = 0;
  if (c.loc.t === 'store') {
    const s = buildings[c.store];
    c.state = 'loading'; c.taken = false;
    c.timer = (CFG.pickupPause * Math.pow(0.7, perks.loading) + CFG.loadPause * Math.max(0, Math.min(c.want, s.pins) - 1)) * Math.pow(0.8, carUp(c, 'load'));
  } else if (c.loc.t === 'home') {
    const n = c.load, cash = c.cash || 0;
    if (n > 0) {
      score += n; stats.delivered += n; stats.lastDeliveries.push(clock);
      earn(cash);
      onDeliver(c, n, cash);
    }
    c.cash = 0;
    stats.trips++; stats.waitSum += c.stopAcc; stats.waitN++; c.stopAcc = 0; c.trips++;
    c.load = 0; c.job = null; c.route = null; c.state = 'parked'; c.idle = 0;
  } else {
    c.job = null; c.route = null; c.state = 'parked'; c.idle = 0;
  }
}
function finishLoading(c) {
  const s = buildings[c.store];
  if (!c.taken) {
    const n = Math.min(c.want, s.pins);
    s.pins -= n; s.claimed = Math.max(0, s.claimed - c.want);
    s.timer = Math.max(0, s.timer - CFG.arrivalRelief * n);
    s.served += n;
    if (s.contract) s.contract.got += n;
    c.load = n; c.carried = n; c.want = 0; c.taken = true;
    c.cash = Math.round(n * payPerParcel(s));
    if (n > 0) popText(tx(s.k), ty(s.k) - 14, '-' + n, COLORS[s.color].hex);
  }
  const h = buildings[c.home];
  if (solveBudget <= 0) return;
  solveBudget--;
  const r = (s.acc >= 0 && h.acc >= 0) ? planRoute(null, s.acc, h.acc) : null;
  if (!r) { c.planFail++; if (c.planFail > 6) tow(c, false); return; }
  c.job = 'return'; c.route = r; c.ri = 0; c.destNode = h.acc; c.planFail = 0;
  c.state = 'exiting'; c.xf = null;
}
function stepExiting(c, dt) {
  if (!c.xf) {
    if (!c.route) { cancelJob(c); return; }
    if (c.route.length === 0) { leaveSpot(c); startEnter(c); return; }
    const f = c.route[0];
    if (f.dead || f.a !== nodeOfParked(c)) {              // the roads changed under us
      if (c.isTruck) { truckReset(c); return; }
      const dest = destNodeOf(c), from = nodeOfParked(c);
      const r = (dest >= 0 && from >= 0 && solveBudget > 0) ? (solveBudget--, planRoute(null, from, dest)) : null;
      if (r) { c.route = r; c.ri = 0; } else if (solveBudget > 0) { if (c.job === 'fetch') cancelJob(c); else tow(c, true); }
      return;
    }
    if (c.broken > 0) return;
    if (roomOn(f, c.len, c)) {
      leaveSpot(c);
      const p = laneAt(f, f.r0);
      c.xfEdge = f; f.inb.push(c);
      c.xf = {t: 0, dur: 0.55, x0: c.x, y0: c.y, a0: c.ang, x1: p.x, y1: p.y, a1: Math.atan2(f.uy, f.ux)};
      c.tripStart = clock;
    } else { const p = parkedPose(c); c.x = p.x; c.y = p.y; c.ang = p.a; }
    return;
  }
  if (stepXf(c, dt)) {
    const f = c.xfEdge, j = f.inb.indexOf(c); if (j >= 0) f.inb.splice(j, 1);
    c.xfEdge = null; c.xf = null;
    if (f.dead) { tow(c, true); return; }
    f.cars.push(c); c.edge = f; c.s = f.r0; c.ri = 0; c.v = 6; c.state = 'driving'; c.stopT = 0; c.blockedT = 0;
    c.replanT = rnd(1.5, CFG.replanSeconds);
  }
}

/* ---------------------------------------------------- the traffic tick */
function stepTraffic(dt) {
  markPriority();
  for (const e of edges) moveEdge(e, dt);
  for (const nd of nodeList) { nd.wait.length = 0; nd.gap = Math.max(-1, nd.gap - dt); }
  // lead cars at their stop line
  for (const e of edges) {
    const c = e.cars[0];
    if (!c || c.s < e.stop - 1.2 || c.broken > 0 || c.hook) continue;
    if (c.replanCool > 0) c.replanCool -= dt;
    if (!c.route) { c.planFail++; if (c.planFail > 3) giveUp(c); continue; }
    if (c.ri >= c.route.length - 1) {
      const ok = destOk(c);
      if (ok === 1) startEnter(c);
      else if (ok < 0) { if (c.replanCool <= 0 && solveBudget > 0) { c.replanCool = 1; if (!replan(c)) { c.planFail++; if (c.planFail > 3) giveUp(c); } } }
      else { c.blockedT += dt; if (c.blockedT > CFG.gridlockSeconds) tow(c, false); }
      continue;
    }
    const nd = nodes[e.b];
    if (nd) nd.wait.push(c);
  }
  for (const nd of nodeList) {
    if (nd.wait.length || nd.cross.length || nd.type === 'yield' || nd.type === 'light') runNode(nd, dt);
    if (nd.cross.length) stepCross(nd, dt);
  }
  // periodic replanning so drivers notice jams
  for (const c of cars) {
    if (c.state !== 'driving') continue;
    if (c.replanCool > 0) c.replanCool -= dt * 0.25;
    c.replanT -= dt;
    if (c.replanT <= 0 && c.route && c.ri < c.route.length - 1 && solveBudget > 0 && c.stopT > 0.4) {
      c.replanT = CFG.replanSeconds * rnd(0.8, 1.3);
      replan(c);
    } else if (c.replanT <= 0) c.replanT = 1;
  }
  // everything that isn't on a lane
  for (const c of cars) {
    switch (c.state) {
      case 'parked': {
        const p = parkedPose(c); c.x = p.x; c.y = p.y; c.ang = p.a; c.idle += dt; c.v = 0; c.brake = false; break;
      }
      case 'exiting': stepExiting(c, dt); break;
      case 'entering': if (stepXf(c, dt)) arrive(c); break;
      case 'loading': {
        const p = parkedPose(c); c.x = p.x; c.y = p.y; c.ang = p.a; c.brake = false;
        c.timer -= dt;
        if (c.timer <= 0) finishLoading(c);
        break;
      }
    }
  }
  for (const t of trucks) truckStep(t, dt);
  for (const a of ambs.slice()) ambStep(a, dt);
  // heat: a slow-moving record of where traffic stands still
  let worst = 0, stopped = 0, moving = 0;
  for (const c of cars) if (c.state === 'driving') { moving++; if (c.stopT > 2) stopped++; }
  for (const e of edges) if (e.q > worst) worst = e.q;
  stats.worstJam = worst;
  stats.jamPct = moving ? stopped / moving : 0;
}

/* ---------------------------------------------------------------------
   4. GAME RULES
   --------------------------------------------------------------------- */
let undoStack = [], redoStack = [], undoGroup = 0, replaying = false, tool = 'select', motoPick = -1, sel = null, follow = false, hoverCell = -1;
let goalsDone = new Set(), autosaveT = CFG.autosaveSeconds, statT = 0;

function resetGame(dk) {
  tutorialMode = false;
  setTutorialUI(false);
  if (dk) diffKey = dk;
  DIFF = DIFFS[diffKey] || DIFFS.standard; best = bestFor(diffKey);
  water = new Uint8Array(N); road = new Uint8Array(N); lnk = new Uint8Array(N);
  sign = new Array(N).fill(null); special = new Array(N).fill(null);
  bAt = new Int32Array(N).fill(-1); parkAt = new Int32Array(N).fill(-1); depotAt = new Int32Array(N).fill(-1);
  onewayDir = new Int8Array(N).fill(-1);
  nodes = []; nodeList = []; edges = []; edgeMap = new Map(); buildings = []; cars = []; motorways = []; parks = []; depots = [];
  motoSeq = 0; carSeq = 0;
  inv = {road: Math.max(6, CFG.startRoads + DIFF.roads), bridge: CFG.startBridges, moto: CFG.startMotorways,
         light: CFG.startLights, round: CFG.startRoundabouts, sign: CFG.startSigns, park: CFG.startParking, depot: CFG.startDepots};
  perks = Object.assign({}, PERK_DEFAULTS);
  carCapacity = CFG.carCapacityStart; carsBought = 0;
  money = Math.max(0, CFG.startMoney + DIFF.cash); trucks = [];
  score = 0; week = 1; weekTimer = CFG.weekSeconds; clock = 0; lightClock = 0; lightQ.clear();
  houseTimer = CFG.firstHouseDelay * DIFF.spawn; storeTimer = CFG.firstStoreDelay * DIFF.spawn;
  running = true; speed = 1; over = false; started = true;
  rush = {t: 0}; rain = {t: 0, amt: 0}; breakdownTimer = 30;
  closed = new Map(); closureTimer = 60; rerouteN = 0; ambs = []; ambTimer = 60;
  contractTimer = CFG.contractSeconds; cityStressClock = 0;
  span = CFG.startSpan; org = Math.floor((MAXD - span) / 2); camSpan = span; camOrg = org;
  undoStack = []; redoStack = []; sel = null; follow = false; motoPick = -1; goalsDone = new Set();
  stats = freshStats(); fx.length = 0;
  genRiver();
  for (let i = 0; i < CFG.startStores; i++) addBuilding('store', i % COLORS.length);
  for (let i = 0; i < CFG.startHouses; i++) addBuilding('house', i % Math.max(1, CFG.startStores));
  rebuildNet();
  for (const c of cars) { const p = parkedPose(c); c.x = p.x; c.y = p.y; c.ang = p.a; }
  camReset(true);
  closeInspector(); setTool('select'); refreshUI();
}
function genRiver() {
  let c = 6 + Math.floor(Math.random() * (MAXD - 12));
  for (let r = 0; r < ROWS; r++) {
    const w = Math.random() < 0.35 ? 2 : 1;
    for (let i = 0; i < w; i++) water[idx(clamp(c + i, 0, COLS - 1), r)] = 1;
    c = clamp(c + pick([-1, 0, 0, 1]), 2, COLS - 3);
  }
}
function growMap() {
  const ns = Math.min(MAXD, span + CFG.growPerWeek * 2);
  if (ns === span) return false;
  span = ns; org = Math.floor((MAXD - span) / 2);
  return true;
}
function freeSpot(minGap, edgeBias) {
  for (let t = 0; t < 600; t++) {
    let c, r;
    if (edgeBias && span > CFG.startSpan && Math.random() < 0.45) {
      const ring = Math.floor(Math.random() * Math.max(1, CFG.growPerWeek)), side = Math.floor(Math.random() * 4);
      const along = org + 1 + Math.floor(Math.random() * (span - 2));
      if (side === 0) { c = along; r = org + ring; } else if (side === 1) { c = org + span - 1 - ring; r = along; }
      else if (side === 2) { c = along; r = org + span - 1 - ring; } else { c = org + ring; r = along; }
    } else { c = org + 1 + Math.floor(Math.random() * (span - 2)); r = org + 1 + Math.floor(Math.random() * (span - 2)); }
    const k = idx(c, r);
    if (!inPlay(k) || water[k] || occupied(k)) continue;
    let ok = true;
    for (let dc = -minGap; dc <= minGap && ok; dc++) for (let dr = -minGap; dr <= minGap && ok; dr++) {
      const cc = c + dc, rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= COLS || rr >= ROWS) continue;
      if (bAt[idx(cc, rr)] >= 0) ok = false;
    }
    if (ok) return k;
  }
  return -1;
}
function addBuilding(type, colorIdx) {
  const k = freeSpot(type === 'store' ? 3 : 1, true);
  if (k < 0) return null;
  const b = {k, type, color: colorIdx, pins: 0, claimed: 0, timer: 0, tier: 0, cars: [], carsN: 0, park: 0, lvl: 0, trucks: 0,
             docks: [], served: 0, acc: -1, face: 0, pref: -1, unreach: 0, born: clock, bornAnim: animT, contract: null,
             pinTimer: CFG.pinIntervalBase * 0.6 * DIFF.pin,
             evolveTimer: rnd(CFG.storeEvolveCheckMin, CFG.storeEvolveCheckMax)};
  bAt[k] = buildings.length; buildings.push(b);
  linkBuildings();
  if (type === 'house') for (let i = 0; i < CFG.carsPerHouse; i++) addCar(buildings.length - 1);
  if (clock > 1) { popRing(tx(k), ty(k), COLORS[colorIdx].hex); }
  return b;
}

/* ---------------------------------------------------------------------
   TUTORIAL. A small, hand-laid staged city — not the random generator.
   Stage 0: only a red store+house exist; the player connects them, which
     starts the parcel cycle.
   Stage 1: once 2 red parcels are delivered, an amber store+house appear
     positioned so the natural connecting road crosses the red one,
     forcing a real intersection.
   Stage 2: an "explainer" modal (junctions, bridges & motorways, signs,
     Q&A) becomes available.
   Stage 3: the map widens into a full practice city — a light-controlled
     crossing, a roundabout-controlled crossing, a give-way T, a loose
     stub, an isolated one-way stretch and two more colour pairs — with a
     checklist for whatever tools the player hasn't tried yet.
   It runs on Zen's safety net throughout (no losing), with the week
   frozen, which also quietly suppresses every week-gated random event;
   the "try an event" buttons in stage 3 call the same functions the
   scheduler would, on demand.
   --------------------------------------------------------------------- */
/* Find a free tile for a tutorial building as close as possible to where the script wants it.
   The player may already have laid road, lots or bays there, so never assume the spot is empty. */
function tutFreeTile(dc, dr) {
  const free = k => k >= 0 && !occupied(k) && !water[k];
  for (let rad = 0; rad < 9; rad++)
    for (let a = -rad; a <= rad; a++) for (let b = -rad; b <= rad; b++) {
      if (Math.max(Math.abs(a), Math.abs(b)) !== rad) continue;
      const c = dc + a, r = dr + b;
      if (c < 1 || r < 1 || c > span - 2 || r > span - 2) continue;
      const k = tutAt(c, r); if (!free(k)) continue;
      // keep at least one side open (or already road) so a road can actually reach it
      let reach = false;
      for (const d of ORTH) { const n = nbr(k, d); if (n >= 0 && !water[n] && bAt[n] < 0 && parkAt[n] < 0 && depotAt[n] < 0) { reach = true; break; } }
      if (reach) return k;
    }
  return tutAt(dc, dr);
}
function placeTutBuilding(type, colorIdx, dc, dr) {
  const k = tutFreeTile(dc, dr);
  const b = {k, type, color: colorIdx, pins: 0, claimed: 0, timer: 0, tier: 0, cars: [], carsN: 0, park: 0, lvl: 0, trucks: 0,
             docks: [], served: 0, acc: -1, face: 0, pref: -1, unreach: 0, born: clock, bornAnim: animT, contract: null,
             pinTimer: CFG.pinIntervalBase * 0.6 * DIFF.pin,
             evolveTimer: rnd(CFG.storeEvolveCheckMin, CFG.storeEvolveCheckMax)};
  bAt[k] = buildings.length; buildings.push(b);
  return buildings.length - 1;
}
function tutAt(dc, dr) { return idx(org + dc, org + dr); }
function tutRoad1(dc, dr) { const k = tutAt(dc, dr); road[k] = 1; return k; }
function tutLink2(a, b) { const d = dirBetween(a, b); if (d >= 0) setLink(a, d, true); }
function tutPath(coords) { let prev = null; for (const [dc, dr] of coords) { const k = tutRoad1(dc, dr); if (prev !== null) tutLink2(prev, k); prev = k; } }
function tutAddCarsFrom(startIdx) {
  for (let i = startIdx; i < buildings.length; i++) if (buildings[i].type === 'house') for (let j = 0; j < CFG.carsPerHouse; j++) addCar(i);
}
function tutFinishPlacement() {
  linkBuildings(); rebuildNet();
  for (const c of cars) { const p = parkedPose(c); c.x = p.x; c.y = p.y; c.ang = p.a; }
}
/* place one colour pair (nudged off anything the player already built) and ring both buildings */
function tutSpawnPair(col, st, ho) {
  const startIdx = buildings.length;
  const si = placeTutBuilding('store', col, st[0], st[1]);
  const hi = placeTutBuilding('house', col, ho[0], ho[1]);
  tutAddCarsFrom(startIdx);
  tutFinishPlacement();
  for (const i of [si, hi]) popRing(tx(buildings[i].k), ty(buildings[i].k), COLORS[col].hex);
}
/* stage 0: just the red pair, nothing else — a blank canvas for the first road */
function buildTutorialStage0() {
  placeTutBuilding('store', 0, 4, 8);
  placeTutBuilding('house', 0, 12, 8);
}
/* stage 1: an amber pair north/south of where the red road most likely runs, so the natural
   connection meets it. Whether it actually does is checked, not assumed (see tutStatus). */
function tutSpawnAmber() { tutSpawnPair(2, [8, 3], [8, 13]); }
/* stage 3: a blue pair whose straight connection likely crosses the amber road */
function tutSpawnBlue() { tutSpawnPair(1, [4, 5], [13, 5]); }
/* stage 4: a green pair on a fresh axis, likely crossing the red road */
function tutSpawnGreen() { tutSpawnPair(3, [6, 3], [6, 13]); }
/* stage 6: a small pre-built loop with the teal pair on it — making part of it one-way keeps
   an alternate way round. The 3x5 block is moved if the player has already built over it. */
let tutLoopTiles = [];
const TEAL_LOOP = [[0, 2], [0, 1], [1, 1], [2, 1], [2, 2], [2, 3], [1, 3], [0, 3], [0, 2]];
function tutSpawnTeal() {
  const blockFree = (ox, oy) => {
    if (ox < 1 || oy < 1 || ox + 2 > span - 2 || oy + 4 > span - 2) return false;
    for (let a = 0; a < 3; a++) for (let b = 0; b < 5; b++) { const k = tutAt(ox + a, oy + b); if (occupied(k) || water[k]) return false; }
    return true;
  };
  let ox = 14, oy = 6, found = blockFree(ox, oy);
  for (let rad = 1; rad < 12 && !found; rad++)
    for (let a = -rad; a <= rad && !found; a++) for (let b = -rad; b <= rad && !found; b++) {
      if (Math.max(Math.abs(a), Math.abs(b)) !== rad) continue;
      if (blockFree(14 + a, 6 + b)) { ox = 14 + a; oy = 6 + b; found = true; }
    }
  tutPath(TEAL_LOOP.map(([a, b]) => [ox + a, oy + b]));
  tutLoopTiles = TEAL_LOOP.slice(0, -1).map(([a, b]) => tutAt(ox + a, oy + b));
  tutSpawnPair(5, [ox + 1, oy], [ox + 1, oy + 4]);
}

/* ---- tutorial checks: look at what the player actually built instead of assuming they followed
   the instructions. Every pair is tested with the same router the cars use, both ways round. */
const TUT_PAIRS = [{col: 0, from: 0}, {col: 2, from: 1}, {col: 1, from: 3}, {col: 3, from: 4}, {col: 5, from: 6}];
const cname = col => COLORS[col].name;
const capFirst = t => t.charAt(0).toUpperCase() + t.slice(1);
function tutPair(col) {
  let s = null, h = null;
  for (const b of buildings) { if (b.color !== col) continue; if (b.type === 'store' && !s) s = b; else if (b.type === 'house' && !h) h = b; }
  return {s, h};
}
function tutRoute(col) {
  const {s, h} = tutPair(col);
  if (!s || !h) return {state: 'missing'};
  if (h.acc < 0 && s.acc < 0) return {state: 'none', s, h};
  if (h.acc < 0) return {state: 'house', s, h};
  if (s.acc < 0) return {state: 'store', s, h};
  const go = planRoute(null, h.acc, s.acc), back = planRoute(null, s.acc, h.acc);
  if (!go || !back) return {state: (go || back) ? 'oneway' : 'apart', s, h};
  const tiles = new Set([h.acc, s.acc]);
  for (const e of go.concat(back)) { tiles.add(e.a); tiles.add(e.b); }
  return {state: 'ok', tiles, s, h};
}
const tutPairAt = r => (r && r.s && r.h) ? [r.s.k, r.h.k] : [];
const tutJunctionsOn = tiles => [...tiles].filter(k => nodes[k] && nodes[k].junction);
function tutConnMsg(col, r) {
  const n = cname(col);
  const m = {
    none: 'Nothing touches the ' + n + ' store or house yet. Start your drag right on one of them and end on the other.',
    house: 'The road doesn\u2019t reach the ' + n + ' house yet \u2014 finish on a tile directly beside it (not diagonally).',
    store: 'The road doesn\u2019t reach the ' + n + ' store yet \u2014 finish on a tile directly beside it (not diagonally).',
    apart: 'Both ' + n + ' buildings touch road, but those roads aren\u2019t joined. Drag one onto the other so they share a tile.',
    oneway: capFirst(n) + ' cars can get there but not back \u2014 a one-way or a sign is blocking the return trip.'
  }[r.state] || ('The ' + n + ' pair isn\u2019t connected yet.');
  return {ok: false, kind: r.state === 'none' ? 'info' : 'warn', msg: m, at: tutPairAt(r), line: true};
}
/* first pair already introduced that has lost its connection (skip = the colour this step is about) */
function tutBroken(skip, R) {
  for (const p of TUT_PAIRS) {
    if (p.from > tutStage || p.col === skip) continue;
    const r = R(p.col);
    if (r.state !== 'ok' && r.state !== 'missing') return {col: p.col, r};
  }
  return null;
}
const tutBrokenMsg = b => ({ok: false, kind: 'warn', msg: 'The ' + cname(b.col) + ' house can\u2019t reach its store any more. Reconnect it before moving on.', at: tutPairAt(b.r), line: true});
/* a junction step: the pair must be connected, cross another road, and have the control ON its route */
function tutControlStep(col, kind, R) {
  const r = R(col); if (r.state !== 'ok') return tutConnMsg(col, r);
  const b = tutBroken(col, R); if (b) return tutBrokenMsg(b);
  const n = cname(col), what = kind === 'light' ? 'light' : 'roundabout', toolName = kind === 'light' ? 'Light' : 'Roundabout';
  const js = tutJunctionsOn(r.tiles);
  if (!js.length) return {ok: false, kind: 'warn', msg: capFirst(n) + ' is connected, but its road never crosses another one \u2014 so there\u2019s no junction to control. Re-route it across another road.', at: tutPairAt(r), line: true};
  if (js.some(k => nodes[k].type === kind)) return {ok: true, at: js.filter(k => nodes[k].type === kind)};
  const loose = []; for (let k = 0; k < N; k++) if (special[k] === kind) loose.push(k);
  if (loose.some(k => !(nodes[k] && nodes[k].junction))) return {ok: false, kind: 'warn', msg: 'A ' + what + ' only works where three or more roads meet. Erase that one and use a marked junction on the ' + n + ' road.', at: js.slice(0, 3)};
  if (loose.length) return {ok: false, kind: 'warn', msg: 'That ' + what + ' is on a junction ' + n + ' cars don\u2019t drive through. Put one on a marked junction along the ' + n + ' road.', at: js.slice(0, 3)};
  return {ok: false, kind: 'info', msg: capFirst(n) + ' is connected. Now pick the ' + toolName + ' tool and tap the marked junction on its road.', at: js.slice(0, 3)};
}
/* what the current step needs, judged from the map as it is right now */
function tutStatus() {
  const cache = {}, R = c => cache[c] || (cache[c] = tutRoute(c));
  const st = tutStage;
  if (st === 0) {
    const r = R(0); if (r.state !== 'ok') return tutConnMsg(0, r);
    const n = Math.min(2, stats.delivered);
    return n >= 2 ? {ok: true} : {ok: false, kind: 'good', msg: 'Connected \u2713 \u2014 ' + n + ' of 2 parcels delivered. Watch a car make the trip.', at: tutPairAt(r)};
  }
  if (st === 1) {
    const a = R(2); if (a.state !== 'ok') return tutConnMsg(2, a);
    const b = tutBroken(2, R); if (b) return tutBrokenMsg(b);
    const js = tutJunctionsOn(a.tiles);
    if (!js.length) return {ok: false, kind: 'warn', msg: capFirst(cname(2)) + ' is connected, but its road never meets the ' + cname(0) + ' road. Make them share a tile \u2014 that shared tile becomes the intersection.', at: tutPairAt(a), line: true};
    return {ok: true, at: js};
  }
  if (st === 2) return {ok: false};
  if (st === 3) return tutControlStep(1, 'light', R);
  if (st === 4) return tutControlStep(3, 'round', R);
  if (st === 5) {
    const placed = []; for (let k = 0; k < N; k++) if (sign[k] && road[k]) placed.push(k);
    const js = nodeList.filter(nd => nd.junction).map(nd => nd.k);
    if (!placed.length) return {ok: false, kind: 'info', msg: 'Pick the Signs tool, choose a sign, then tap one of the marked junctions.', at: js.slice(0, 3)};
    const b = tutBroken(-1, R);
    if (b) return {ok: false, kind: 'warn', msg: 'The ' + cname(b.col) + ' cars have no legal route any more. If that happened after your sign, erase it or pick a different sign.', at: placed.slice(0, 3)};
    if (!placed.some(k => nodes[k] && nodes[k].junction)) return {ok: false, kind: 'warn', msg: 'Signs only matter where drivers have a choice of turn. Put one on a junction (marked).', at: js.slice(0, 3)};
    return {ok: true};
  }
  if (st === 6) {
    const ow = []; for (let k = 0; k < N; k++) if (road[k] && onewayDir[k] >= 0 && linkCount(k) === 2) ow.push(k);
    const t = R(5);
    if (!ow.length) {
      if (t.state !== 'ok') return tutConnMsg(5, t);
      const plain = tutLoopTiles.filter(k => road[k] && linkCount(k) === 2 && !(nodes[k] && nodes[k].junction));
      return {ok: false, kind: 'info', msg: 'Pick Signs \u2192 One-way, then tap a marked stretch of the ' + cname(5) + ' loop.', at: plain.slice(1, 3)};
    }
    const b = tutBroken(-1, R);
    if (b) return {ok: false, kind: 'warn', msg: 'The ' + cname(b.col) + ' cars have no way through any more. If your one-way did that, tap it again to flip its direction, or a third time to clear it.', at: ow.slice(0, 3)};
    return {ok: true, at: ow};
  }
  if (st === 7) {
    if (motorways.length) return {ok: true};
    const b = tutBroken(-1, R); if (b) return tutBrokenMsg(b);
    const red = R(0), loop = tutLoopTiles.filter(k => road[k]);
    const from = red.state === 'ok' ? [...red.tiles] : nodeList.map(nd => nd.k);
    const to = loop.length ? loop : nodeList.map(nd => nd.k);
    let best = null, bd = Infinity;
    for (const a of from) for (const c of to) { const d = Math.hypot(cx(a) - cx(c), cy(a) - cy(c)); if (d >= 4.5 && d < bd) { bd = d; best = [a, c]; } }
    if (motoPick >= 0) return {ok: false, kind: 'info', msg: 'Now tap the far end \u2014 a road tile at least 4 tiles away.', at: best ? [best[1]] : []};
    return {ok: false, kind: 'info', msg: 'Pick the Motorway tool, tap a tile on the ' + cname(0) + ' road, then one on the ' + cname(5) + ' loop (both marked).', at: best || [], line: !!best};
  }
  // steps 8+ are menus and upgrades: the old gates are fine, but still warn about broken pairs
  let ok = false; try { ok = TUT_GATES[st](); } catch (e) {}
  const red = tutPair(0), js = nodeList.filter(nd => nd.junction).map(nd => nd.k);
  const at = st === 10 ? js.slice(0, 3) : (st === 8 || st === 9) ? (red.h ? [red.h.k] : []) : (red.s ? [red.s.k] : []);
  if (ok) return {ok: true};
  const b = tutBroken(-1, R); if (b) return Object.assign(tutBrokenMsg(b), {ok: false});
  if (st === 10 && !js.length) return {ok: false, kind: 'warn', msg: 'There are no junctions on the map right now. Join two roads to make one, then upgrade it.', at: []};
  return {ok: false, at};
}
/* free play after the guided steps: things worth trying that don't need a scripted scenario */
const TUT_LESSONS = [
  {id: 'van', name: 'Grow a car into a pickup', hint: 'Buy Carry size twice on one car: hatchback \u2192 estate \u2192 pickup. Each size carries more but drives 10% slower.', hit: () => cars.some(c => bodyOf(c) >= 2)},
  {id: 'shop', name: 'Open the Shop tab', hint: 'Cars, vans and motorways can also be bought outright there.', hit: () => tutShopOpened},
  {id: 'event', name: 'Trigger a live event', hint: 'Use the buttons below to see rush hour, rain, a breakdown, a closure, an ambulance or a contract.', hit: () => tutEventTried}
];
/* the guided steps; TUT_STEPS[tutStage] is always the active one */
const TUT_STEPS = [
  {t: 'Connect the red store and house', done: 'Parcels are flowing.',
   active: 'Drag a road between them \u2014 starting right on either building works. Store \u2192 road \u2192 house \u2192 paid: that\u2019s the whole loop.'},
  {t: 'Connect the amber store and house', done: 'You built your first intersection.',
   active: 'Connect the amber store to the amber house so its road crosses or joins the red road. Where two roads share a tile, that tile becomes an intersection.'},
  {t: 'See how junctions work', done: 'You know a give-way from a light from a roundabout.',
   active: 'What you just made is a give-way \u2014 the simplest, free control. Open the guide to see the others.'},
  {t: 'Turn a junction into a light', done: 'That crossing now runs on a timed cycle.',
   active: 'Connect the blue store to the blue house across another road. Then tap a junction on the blue road with the Light tool.'},
  {t: 'Turn a junction into a roundabout', done: 'Several streams can merge without stopping.',
   active: 'Connect the green pair across another road, then tap a junction on the green road with the Roundabout tool.'},
  {t: 'Place a turn sign', done: 'Signs are read from the driver\u2019s seat.',
   active: 'Pick the Signs tool, choose a sign, then tap a junction \u2014 it restricts one turn. Make sure every car still has a way through.'},
  {t: 'Make part of a loop one-way', done: 'Cars still reach both ends, without sharing a lane.',
   active: 'The teal loop has two ways round. With the Signs tool\u2019s One-way option, tap one straight stretch of it. Check nobody gets cut off.'},
  {t: 'Build a motorway', done: 'An express link that skips every junction between.',
   active: 'Pick the Motorway tool, tap a tile on the red road, then one on the teal loop at least 4 tiles away. Motorways are fast but only link two points.'},
  {t: 'Buy a car for a house', done: 'More cars per house means more trips a minute.',
   active: 'Tap any house (the red one is marked) and press Buy a car. Each extra car at the same house costs more than the last.'},
  {t: 'Upgrade a car', done: 'Each upgrade also changes how the vehicle looks.',
   active: 'Click any red car (or pick one from the house list). Carry size turns it into a bigger model with one more slot but 10% slower; Speed fits a faster kit.'},
  {t: 'Upgrade a junction', done: 'Upgraded junctions let more cars through per turn.',
   active: 'Tap any junction and press its upgrade button. The gold ring shows its level.'},
  {t: 'Upgrade a store', done: 'Every parcel from that store now pays more.',
   active: 'Pick the Upgrade tool (U) and tap any store.'},
  {t: 'Hire a tow truck', done: 'It will clear stuck and broken-down cars on its own.',
   active: 'Pick the Hire tow tool (Y) and tap any store. The truck waits in its yard until something breaks down.'}
];
/* per-step coaching: which tool to reach for, where on the map to look, whether to draw a guide line, and why it matters */
const TUT_COACH = [
  {tool: 'road', at: [[4, 8], [12, 8]], line: true, why: 'Every point you score starts here: a store, a road, and a house of the same colour.'},
  {tool: 'road', at: [[8, 3], [8, 13]], line: true, why: 'Networks grow by sharing road. Where two routes join, traffic has to take turns.'},
  {tool: null, at: [], why: 'A junction is only as good as the control you give it. The wrong one becomes your bottleneck.'},
  {tool: 'light', at: [[4, 5], [13, 5], [8, 5]], line: true, why: 'Lights give each direction a guaranteed turn, so busy crossings stop jamming from one side.'},
  {tool: 'round', at: [[6, 3], [6, 13], [6, 8]], line: true, why: 'Roundabouts let several streams merge without anyone stopping outright.'},
  {tool: 'signs', at: [[8, 8]], why: 'Banning one awkward turn can stop a whole junction locking up.'},
  {tool: 'signs', at: [[15, 7], [16, 8]], why: 'On a loop, one-way costs nothing: every stop stays reachable and no lane carries traffic both ways.'},
  {tool: 'moto', at: [[10, 8], [16, 8]], line: true, why: 'Long hauls clog local streets. A motorway pulls that traffic off them entirely.'},
  {tool: 'select', at: [[12, 8]], why: 'More cars mean more trips, but also more traffic. Buy where a store is waiting on you.'},
  {tool: 'select', at: [[12, 8]], why: 'Upgrading one busy car is often cheaper than buying a new one.'},
  {tool: 'select', at: [[8, 8]], why: 'A well-controlled junction at a higher level beats two extra roads around it.'},
  {tool: 'upgrade', at: [[4, 8]], why: 'Same traffic, more money: store upgrades are pure profit.'},
  {tool: 'tow', at: [[4, 8]], why: 'One broken car can back up a whole street. A tow truck clears it before you notice.'}
];
const TUT_GATES = [
  () => stats.delivered >= 2,
  () => nodeList.some(nd => nd.junction),
  () => false,                                              // advanced by the guide's Start building button
  () => nodeList.some(nd => nd.type === 'light'),
  () => nodeList.some(nd => nd.type === 'round'),
  () => sign.some(s => s),
  () => onewayDir && onewayDir.some(d => d >= 0),
  () => motorways.length > 0,
  () => buildings.some(b => (b.extra || 0) > 0),
  () => cars.some(c => carUpTotal(c) > 0),
  () => nodeList.some(nd => nd.lvl > 0),
  () => buildings.some(b => b.type === 'store' && b.lvl > 0),
  () => trucks.length > 0
];
const TUT_ENTER = {1: () => tutSpawnAmber(), 3: () => tutSpawnBlue(), 4: () => tutSpawnGreen(), 6: () => tutSpawnTeal()};
function tutGoto(n) {
  tutStage = n; tutLive = null;
  const f = TUT_ENTER[n]; if (f) f();
  renderTutorialPanel();
}
function tutSkipStep() {
  if (tutStage >= TUT_STEPS.length) return;
  if (tutStage === 2) { tutOpenExplainer(); return; }
  if (tutStage === 7 && !motorways.length) inv.moto = Math.max(inv.moto, 1);
  tutGoto(tutStage + 1);
  toast('Step skipped \u2014 you can come back to it any time in a real city.');
}
function renderTutorialCoach() {
  const card = $('tut-coach');
  if (!card) return;
  if (tutorialMode && tutLastStage >= 0 && tutStage > tutLastStage && TUT_STEPS[tutStage - 1]) tutFlash(TUT_STEPS[tutStage - 1].t);
  const changed = tutStage !== tutLastStage;
  if (tutorialMode) tutLastStage = tutStage;
  const inGuide = tutorialMode && tutStage < TUT_STEPS.length;
  card.hidden = !inGuide;
  document.querySelectorAll('.tool').forEach(b => b.classList.remove('tut-glow'));
  if (!inGuide) return;
  const st = TUT_STEPS[tutStage], co = TUT_COACH[tutStage];
  $('tc-step').textContent = 'Step ' + (tutStage + 1) + ' of ' + TUT_STEPS.length;
  $('tc-title').textContent = st.t;
  $('tc-body').textContent = st.active;
  $('tc-why').textContent = co.why;
  const tl = co.tool ? TOOLS.find(t => t.id === co.tool) : null;
  const tt = $('tc-tool'); tt.hidden = !tl; if (tl) tt.textContent = tl.label + ' \u00b7 ' + tl.key;
  const ic = $('tc-icon'); if (ic) ic.innerHTML = icon(tl ? tl.icon : 'select', 22);
  setHTML($('tc-dots'), TUT_STEPS.map((_, i) => '<i class="' + (i < tutStage ? 'd' : i === tutStage ? 'a' : '') + '"></i>').join(''));
  if (co.tool) { const b = document.querySelector('.tool[data-id="' + co.tool + '"]'); if (b) b.classList.add('tut-glow'); }
  renderTutLive();
  if (changed) { card.classList.remove('swap'); void card.offsetWidth; card.classList.add('swap'); card.classList.remove('full'); }
}
function tutFlash(title) {
  const f = $('tut-flash'); if (!f) return;
  $('tf-title').textContent = title;
  f.hidden = false; f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  clearTimeout(tutFlash.t); tutFlash.t = setTimeout(() => { f.hidden = true; }, 1900);
}
/* on-map guidance: a marching guide line between the two ends of a connection, then a pulsing
   ring and a bobbing arrow over each place the current step points at */
function drawTutorialBeacons() {
  if (!tutorialMode || tutStage >= TUT_COACH.length) return;
  const co = TUT_COACH[tutStage];
  // prefer the spots the live check found on the real map; fall back to the scripted ones
  const live = tutLive && tutLive.at && tutLive.at.length;
  const ks = (live ? tutLive.at : co.at.map(p => tutAt(p[0], p[1]))).slice(0, 4);
  const line = live ? !!tutLive.line : !!co.line;
  if (line && ks.length >= 2) {
    const a = ks[0], b = ks[1];
    ctx.save(); ctx.strokeStyle = 'rgba(255,200,40,.75)'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.setLineDash([5, 6]); ctx.lineDashOffset = REDUCED_MOTION ? 0 : -animT * 18;
    ctx.beginPath(); ctx.moveTo(tx(a), ty(a)); ctx.lineTo(tx(b), ty(b)); ctx.stroke(); ctx.restore();
  }
  for (let i = 0; i < ks.length; i++) {
    const k = ks[i], x = tx(k), y = ty(k);
    const ph = REDUCED_MOTION ? 0.4 : (animT * 0.9 + i * 0.33) % 1;
    ctx.strokeStyle = 'rgba(255,200,40,' + (0.85 * (1 - ph)).toFixed(3) + ')'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 10 + ph * 16, 0, Math.PI * 2); ctx.stroke();
    const by = y - 26 - (REDUCED_MOTION ? 0 : Math.abs(Math.sin(animT * 3 + i)) * 5);
    ctx.fillStyle = '#ffc828'; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, by + 7); ctx.lineTo(x - 5.5, by); ctx.lineTo(x - 2, by); ctx.lineTo(x - 2, by - 6);
    ctx.lineTo(x + 2, by - 6); ctx.lineTo(x + 2, by); ctx.lineTo(x + 5.5, by); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}
function renderTutorialPanel() {
  renderTutorialCoach();
  const box = $('tut-list'), cnt = $('tut-count'), openBtn = $('tut-open-explain'), evWrap = $('tut-events-wrap'), exitBtn = $('tut-exit');
  if (!box) return;
  const N = TUT_STEPS.length, free = tutStage >= N;
  if (openBtn) openBtn.hidden = tutStage !== 2;
  if (evWrap) evWrap.hidden = !free;
  if (exitBtn) exitBtn.textContent = free ? 'Finish \u2014 start a real city' : 'Skip the tutorial';
  const pb = $('tut-bar');
  if (!free) {
    let h = '<div class="tsum">' + TUT_STEPS.map((s, i) => '<i class="' + (i < tutStage ? 'd' : i === tutStage ? 'a' : '') + '" title="' + s.t + '"></i>').join('') + '</div>';
    if (tutStage > 0) h += '<div class="goal done"><span class="tick">\u2713</span><div><b>' + TUT_STEPS[tutStage - 1].t + '</b><small>' + TUT_STEPS[tutStage - 1].done + '</small></div></div>';
    h += '<div class="goal now"><span class="tick">' + (tutStage + 1) + '</span><div><b>' + TUT_STEPS[tutStage].t + '</b><small>' + TUT_STEPS[tutStage].active + '</small></div></div>';
    for (let i = tutStage + 1; i < Math.min(N, tutStage + 3); i++) h += '<div class="goal next"><span class="tick">' + (i + 1) + '</span><div><b>' + TUT_STEPS[i].t + '</b></div></div>';
    if (tutStage < N - 1) h += '<button class="linkbtn" id="tut-skip" type="button">Stuck? Skip this step</button>';
    setHTML(box, h);
    const sk = $('tut-skip'); if (sk) sk.onclick = tutSkipStep;
    if (cnt) cnt.textContent = 'Step ' + (tutStage + 1) + ' of ' + N;
    if (pb) pb.style.width = Math.round(tutStage / N * 100) + '%';
  } else {
    let h = '<p class="mini">All ' + N + ' guided steps done. A few more things to try, in any order:</p>';
    for (const l of TUT_LESSONS) {
      const done = tutDone.has(l.id);
      h += '<div class="goal' + (done ? ' done' : '') + '"><span class="tick">' + (done ? '\u2713' : '') + '</span><div><b>' + l.name + '</b><small>' + l.hint + '</small></div></div>';
    }
    setHTML(box, h);
    if (cnt) cnt.textContent = tutDone.size + ' of ' + TUT_LESSONS.length + ' extras';
    if (pb) pb.style.width = '100%';
  }
}
function checkTutorial() {
  if (!tutorialMode) return;
  if (tutStage < TUT_STEPS.length) {
    let st = null; try { st = tutStatus(); } catch (e) { console.error(e); st = {ok: false}; }
    tutLive = st; renderTutLive();
    if (st.ok) {
      const done = TUT_STEPS[tutStage];
      tutGoto(tutStage + 1);
      toast(done.done, 'good');
    }
    return;
  }
  let changed = false;
  for (const l of TUT_LESSONS) {
    if (tutDone.has(l.id)) continue;
    let ok = false; try { ok = l.hit(); } catch (e) {}
    if (ok) { tutDone.add(l.id); changed = true; toast('Tutorial: ' + l.name + ' \u2713', 'good'); }
  }
  if (changed) renderTutorialPanel();
}
let tutLive = null, tutCheckT = 0;
function renderTutLive() {
  const el = $('tc-live'); if (!el) return;
  const msg = tutLive && !tutLive.ok && tutLive.msg ? tutLive.msg : '';
  if (el.textContent !== msg) el.textContent = msg;
  el.hidden = !msg;
  el.dataset.kind = (tutLive && tutLive.kind) || 'info';
  const card = $('tut-coach'); if (card) card.classList.toggle('has-live', !!msg);
}
function tutOpenExplainer() { openModal('m-explain'); }
function tutStartBuilding() {
  closeModal('m-explain');
  if (tutStage === 2) tutGoto(3); else renderTutorialPanel();
  toast(tcol('Connect the blue store and house \u2014 then turn that junction into a light.'), 'good');
}
function tutTriggerRush() { rush.t = CFG.rushSeconds; toast('Rush hour — parcels pile up fast, and pay ' + Math.round(CFG.rushPayBonus * 100) + '% more', 'warn'); tutEventTried = true; }
function tutTriggerRain() { rain.t = CFG.rainSeconds; toast('Rain — roads are slower'); tutEventTried = true; }
function tutTriggerBreakdown() {
  const cand = cars.filter(c => c.state === 'driving' && c.edge && !c.edge.fast && c.s > c.edge.r0 && c.s < c.edge.stop - 6 && !c.broken);
  if (!cand.length) { toast('No car is in the right spot right now — try again in a moment.', 'warn'); return; }
  const c = pick(cand); c.broken = CFG.breakdownSeconds; c.hazard = 0; stats.breakdowns++;
  toast('A ' + COLORS[c.color].name + ' car has broken down', 'warn'); tutEventTried = true;
}
function tutTriggerClosure() { if (!tryCloseRoad()) toast('No good spot to close right now — try again in a moment.', 'warn'); tutEventTried = true; }
function tutTriggerAmb() { if (!spawnAmb()) toast('No house-and-store pair is ready for a call right now.', 'warn'); tutEventTried = true; }
function tutTriggerContract() { if (!maybeOfferContract()) toast('Every store already has an offer — try again shortly.', 'warn'); tutEventTried = true; }
/* swap the normal side panel for the tutorial checklist, or back */
function setTutorialUI(on) {
  const p = $('panel'), tp = $('tut-panel');
  if (p) p.style.display = on ? 'none' : '';
  if (tp) tp.hidden = !on;
  const app = $('app'); if (app) app.classList.toggle('tut-on', !!on);
  if (!on) { const c = $('tut-coach'); if (c) c.hidden = true; document.querySelectorAll('.tool').forEach(b => b.classList.remove('tut-glow')); }
}
function startTutorial() {
  tutorialMode = true; DIFF = DIFFS.zen; diffKey = 'zen'; tutStage = 0; tutLastStage = -1;
  water = new Uint8Array(N); road = new Uint8Array(N); lnk = new Uint8Array(N);
  sign = new Array(N).fill(null); special = new Array(N).fill(null);
  bAt = new Int32Array(N).fill(-1); parkAt = new Int32Array(N).fill(-1); depotAt = new Int32Array(N).fill(-1);
  onewayDir = new Int8Array(N).fill(-1);
  nodes = []; nodeList = []; edges = []; edgeMap = new Map(); buildings = []; cars = []; motorways = []; parks = []; depots = [];
  motoSeq = 0; carSeq = 0;
  inv = {road: 60, bridge: 10, moto: 6, light: 6, round: 6, sign: 12, park: 10, depot: 6};
  perks = Object.assign({}, PERK_DEFAULTS);
  carCapacity = CFG.carCapacityStart; carsBought = 0;
  money = 900; trucks = [];
  score = 0; week = 1; weekTimer = 1e9; clock = 0; lightClock = 0; lightQ.clear();
  houseTimer = 1e9; storeTimer = 1e9;
  running = true; speed = 1; over = false; started = true;
  rush = {t: 0}; rain = {t: 0, amt: 0}; breakdownTimer = 1e9;
  closed = new Map(); closureTimer = 1e9; rerouteN = 0; ambs = []; ambTimer = 1e9;
  contractTimer = 1e9; cityStressClock = 0;
  // org is fixed for the whole session, sized for the eventual (bigger) stage-3 map;
  // span starts small so the camera frames just the staged area first
  span = 18; org = Math.floor((MAXD - 18) / 2); camSpan = span; camOrg = org;
  undoStack = []; redoStack = []; sel = null; follow = false; motoPick = -1; goalsDone = new Set();
  stats = freshStats(); fx.length = 0;
  buildTutorialStage0();
  tutAddCarsFrom(0);
  tutFinishPlacement();
  camReset(true);
  closeInspector(); setTool('select'); refreshUI();
  tutLoopTiles = []; tutLive = null; tutDone = new Set(); tutInspected = new Set(); tutLightTuned = false; tutShopOpened = false; tutEventTried = false;
  let n0 = 0; for (let k = 0; k < N; k++) if (road[k]) n0++; tutRoadBaseline = n0;
  setTutorialUI(true);
  setTutMin(compactUI(), true);
  renderTutorialPanel();
  toast(tcol('Welcome \u2014 connect the red store to the red house to get started.'), 'good');
}
function exitTutorial() {
  tutorialMode = false;
  setTutorialUI(false);
  showStartBest(); openModal('m-start'); running = false; refreshUI();
}

/* --------------------------------------------------- placing things */
function tileBusy(k) {
  const nd = nodes[k];
  if (nd && (nd.cross.length || nd.wait.length)) return true;
  for (const e of edges) if ((e.a === k || e.b === k) && (e.cars.length || e.inb.length)) return true;
  return false;
}
function parentFor(k) {
  let bi = -1, bd = Infinity;
  for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
    if (!dc && !dr) continue;
    const c = cx(k) + dc, r = cy(k) + dr;
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
    const nb = idx(c, r);
    if (bAt[nb] < 0) continue;
    const d = Math.hypot(dc, dr);
    if (d < bd) { bd = d; bi = bAt[nb]; }
  }
  return bi;
}
function roadCost(k) { return (inv.road > 0 ? 0 : PRICE.road) + (water[k] ? (inv.bridge > 0 ? 0 : PRICE.bridge) : 0); }
function canRoad(k) { return k >= 0 && !road[k] && bAt[k] < 0 && parkAt[k] < 0 && depotAt[k] < 0 && inPlay(k) && money >= roadCost(k); }
/* one tile of new road: pays for it and claims the tile, but links nothing */
function putTile(k) {
  const br = !!water[k];
  if (br) { if (inv.bridge > 0) inv.bridge--; else spend(PRICE.bridge); }
  if (inv.road > 0) inv.road--; else spend(PRICE.road);
  road[k] = 1; lnk[k] = 0;
  return br;
}
function pushUndo(u) {
  u.g = undoGroup; undoStack.push(u); if (undoStack.length > 400) undoStack.shift();
  if (!replaying) redoStack.length = 0;            // building something new ends the redo chain
}
/* point a building / bay at the road tile the player just dragged into it */
function attachTo(bk, roadK) {
  if (bAt[bk] >= 0) buildings[bAt[bk]].pref = roadK;
  else if (depotAt[bk] >= 0) depots[depotAt[bk]].pref = roadK;
  else return;
  rebuildNet();
}
const isFront = k => k >= 0 && (bAt[k] >= 0 || depotAt[k] >= 0);
/* a click: one unlinked tile. If it sits beside a house or store, that
   building turns to face it. */
function placeRoad(k, silent, attach) {
  if (!canRoad(k)) return false;
  const br = putTile(k);
  if (attach) for (const d of ORTH) { const n = nbr(k, d); if (isFront(n)) attachTo(n, k); }
  rebuildNet(); refreshUI();
  if (!silent) sfx('place');
  pushUndo({t: 'road', k, br, a: -1, d: -1});
  return true;
}
/* The pen goes from tile a to the neighbouring tile b: lay b if it is
   empty and JOIN the two. Joining is what makes roads connect - dragging
   onto or through an existing road ties into it, while roads that merely
   sit next to each other stay separate. */
function layRoad(a, b) {
  const d = dirBetween(a, b);
  if (d < 0) return false;
  const orth = !DIAG(d);
  if (!isRoad(a)) {                                  // pen is on a house, a gap or open ground
    if (isRoad(b)) { if (orth && isFront(a)) attachTo(a, b); return false; }
    if (!placeRoad(b, false, false)) return false;
    if (orth && isFront(a)) attachTo(a, b);          // dragging away from a building
    return false;
  }
  if (!isRoad(b)) {
    if (orth && isFront(b)) { attachTo(b, a); return false; }   // dragging into a building: it faces this road
    if (!canRoad(b)) { if (inPlay(b) && !occupied(b)) hint('Road costs ' + fmt$(roadCost(b)) + ' a tile. ' + shortBy(roadCost(b))); return false; }
  }
  if (!orth && diagBlocked(a, d)) return false;
  const had = isRoad(b);
  if (had && ((lnk[a] >> d) & 1)) return true;       // already joined
  const br = had ? false : putTile(b);
  setLink(a, d, true);
  rebuildNet(); refreshUI(); sfx('place');
  pushUndo({t: 'road', k: had ? -1 : b, br, a, d});
  return true;
}
function placePark(k) {
  if (k < 0 || !inPlay(k) || water[k] || occupied(k)) return false;
  if (!canTake('park')) { hint('A lot costs ' + fmt$(PRICE.park) + '. ' + shortBy(PRICE.park)); return false; }
  const bi = parentFor(k);
  if (bi < 0) { hint('A lot must touch a house or a store.'); return false; }
  const b = buildings[bi];
  if (b.type === 'house' && houseCap(b) >= CFG.carsPerHouseMax) { hint('That house already has the most cars it can hold.'); return false; }
  parks.push({k, b: bi, face: b.face}); parkAt[k] = parks.length - 1; b.park++; take('park');
  if (b.type === 'house') for (let i = 0; i < CFG.parkCarsPerLot; i++) addCar(bi);
  rebuildNet(); refreshUI(); sfx('place');
  pushUndo({t: 'park', k});
  return true;
}
function placeDepot(k) {
  if (k < 0 || !inPlay(k) || water[k] || occupied(k)) return false;
  if (!canTake('depot')) { hint('A waiting bay costs ' + fmt$(PRICE.depot) + '. ' + shortBy(PRICE.depot)); return false; }
  if (nearestRoadTo(k) < 0) { hint('A waiting bay must touch a road.'); return false; }
  depots.push({k, cap: CFG.depotCapacity, slots: [], res: 0, acc: -1, face: 0, pref: -1}); depotAt[k] = depots.length - 1;
  take('depot'); rebuildNet(); refreshUI(); sfx('place');
  pushUndo({t: 'depot', k});
  return true;
}
function removePark(pi) {
  const p = parks[pi], b = buildings[p.b];
  if (b) {
    b.park = Math.max(0, b.park - 1);
    if (b.type === 'house') {
      while (b.cars.length > houseCap(b)) removeCar(b.cars[b.cars.length - 1]);
      if (sel && sel.type === 'car' && !cars.includes(sel.ref)) closeInspector();
    }
  }
  parkAt[p.k] = -1; parks.splice(pi, 1);
  parks.forEach((q, i) => { parkAt[q.k] = i; });
  inv.park++;
}
function removeDepot(di) {
  const d = depots[di];
  for (const c of cars) {
    if (c.loc && c.loc.t === 'bay' && c.loc.i === di) tow(c, true);
    else if (c.job === 'reposition' && c.bay === di) { if (c.state === 'driving') giveUp(c); else tow(c, true); }
  }
  depotAt[d.k] = -1; depots.splice(di, 1);
  depots.forEach((q, i) => { depotAt[q.k] = i; });
  for (const c of cars) { if (c.loc && c.loc.t === 'bay' && c.loc.i > di) c.loc.i--; if (c.job === 'reposition' && c.bay > di) c.bay--; }
  inv.depot++;
}
function eraseAt(k, silent) {
  if (k < 0) return false;
  let done = false;
  if (parkAt[k] >= 0) { removePark(parkAt[k]); done = true; }
  else if (depotAt[k] >= 0) { removeDepot(depotAt[k]); done = true; }
  else if (sign[k]) { sign[k] = null; inv.sign++; done = true; }
  else if (special[k]) { if (special[k] === 'light') { inv.light++; lightQ.delete(k); } else inv.round++; special[k] = null; done = true; }
  else {
    const mi = motorways.findIndex(m => m.a === k || m.b === k);
    if (mi >= 0) {
      const m = motorways[mi];
      if (motoBusy(m)) { hint('Cars are on that motorway.'); return false; }
      motorways.splice(mi, 1); inv.moto++; done = true;
    } else if (road[k]) {
      if (tileBusy(k)) { hint('Wait for the cars to clear that tile.'); return false; }
      refundJunction(nodes[k]); road[k] = 0; clearLinks(k); inv.road++; if (water[k]) inv.bridge++;
      if (onewayDir) onewayDir[k] = -1; done = true;
    }
  }
  if (done) { rebuildNet(); refreshUI(); if (!silent) sfx('erase'); }
  return done;
}
function edgeBusy(a, b) {
  for (const e of edges) if (((e.a === a && e.b === b) || (e.a === b && e.b === a)) && (e.cars.length || e.inb.length)) return true;
  return false;
}
const motoBusy = m => edges.some(e => e.fast && (e.a === m.a || e.a === m.b) && (e.cars.length || e.inb.length));
/* Undo one entry. Returns true when something was taken back, false when it can't be
   yet (cars in the way), or 'noop' when the thing is already gone (so it isn't offered for redo). */
function undoEntry(u) {
  if (u.t === 'road') {
    const hasLink = u.a >= 0 && isRoad(u.a) && ((lnk[u.a] >> u.d) & 1);
    const hasTile = u.k >= 0 && road[u.k];
    if (hasLink && edgeBusy(u.a, nbr(u.a, u.d))) return false;
    if (hasTile && tileBusy(u.k)) return false;
    if (!hasLink && !hasTile) return 'noop';
    if (hasLink) setLink(u.a, u.d, false);
    if (hasTile) { refundJunction(nodes[u.k]); road[u.k] = 0; clearLinks(u.k); inv.road++; if (u.br) inv.bridge++; }
  }
  else if (u.t === 'park') { if (parkAt[u.k] < 0) return 'noop'; removePark(parkAt[u.k]); }
  else if (u.t === 'depot') { if (depotAt[u.k] < 0) return 'noop'; removeDepot(depotAt[u.k]); }
  else if (u.t === 'special') {
    if (!special[u.k]) return 'noop';
    if (special[u.k] === 'light') { inv.light++; lightQ.delete(u.k); } else inv.round++;
    special[u.k] = null;
  }
  else if (u.t === 'sign') {
    if (sign[u.k] !== u.kind) return 'noop';
    if (u.prev) sign[u.k] = u.prev;                  // it replaced another sign: put that one back, nothing to refund
    else { sign[u.k] = null; inv.sign++; }
  }
  else if (u.t === 'moto') {
    const mi = motorways.findIndex(m => m.id === u.id);
    if (mi < 0) return 'noop';
    if (motoBusy(motorways[mi])) return false;
    motorways.splice(mi, 1); inv.moto++;
  }
  return true;
}
/* one undo takes back everything from the last press-and-drag; each entry goes onto the redo stack */
function undo() {
  if (spectating) return;
  const top = undoStack[undoStack.length - 1];
  if (!top) { hint('Nothing to undo.'); return; }
  const g = top.g; let did = false;
  while (undoStack.length && undoStack[undoStack.length - 1].g === g) {
    const u = undoStack.pop(), r = undoEntry(u);
    if (r === false) { undoStack.push(u); hint('Wait for the cars to clear that tile.'); break; }
    if (r === true) { redoStack.push(u); if (redoStack.length > 400) redoStack.shift(); did = true; }
  }
  rebuildNet(); refreshUI(); if (did) sfx('erase');
}
/* Redo goes back through the ordinary placement functions, so the piece (or the cash) is spent again. */
function redoEntry(u) {
  switch (u.t) {
    case 'road':
      if (u.a >= 0) return isRoad(u.a) && layRoad(u.a, nbr(u.a, u.d));
      return placeRoad(u.k, false, false);
    case 'park': return placePark(u.k);
    case 'depot': return placeDepot(u.k);
    case 'special': return placeSpecial(u.k, u.kind);
    case 'sign': return placeSign(u.k, u.kind);
    case 'moto': return placeMoto(u.a, u.b);
  }
  return false;
}
function redo() {
  if (spectating) return;
  const top = redoStack[redoStack.length - 1];
  if (!top) { hint('Nothing to redo.'); return; }
  const g = top.g, hc = hintCount; let did = false;
  undoGroup++; replaying = true;                   // the replayed pieces form one new undo group
  try {
    while (redoStack.length && redoStack[redoStack.length - 1].g === g) {
      const u = redoStack.pop();
      if (!redoEntry(u)) { redoStack.push(u); if (hintCount === hc) hint('Can’t redo that any more.'); break; }
      did = true;
    }
  } finally { replaying = false; }
  rebuildNet(); refreshUI(); if (did) sfx('place');
}
/* ---- pieces that go on an existing road tile ---- */
function placeSpecial(k, kind) {
  if (!isRoad(k)) { hint('Lights and roundabouts go on road tiles.'); return false; }
  if (special[k]) { hint('That tile already has one.'); return false; }
  if (!canTake(kind)) { hint('That costs ' + fmt$(PRICE[kind]) + '. ' + shortBy(PRICE[kind])); return false; }
  if (!nodes[k] || nodes[k].deg < 3) hint('It only works where three or more roads meet.');
  special[k] = kind; take(kind); pushUndo({t: 'special', k, kind});
  if (kind === 'light') lightQ.set(k, [CFG.lightBatch, CFG.lightBatch]);
  rebuildNet(); refreshUI(); sfx('place');
  return true;
}
function placeSign(k, kind) {
  if (!isRoad(k) || sign[k] === kind) return false;
  const prev = sign[k] || null;
  if (!prev) { if (!canTake('sign')) { hint('A sign costs ' + fmt$(PRICE.sign) + '. ' + shortBy(PRICE.sign)); return false; } take('sign'); }
  sign[k] = kind; rebuildNet(); refreshUI(); sfx('place');
  pushUndo({t: 'sign', k, kind, prev});
  return true;
}
function placeMoto(a, b) {
  if (!isRoad(a) || !isRoad(b) || a === b || !canTake('moto')) return false;
  const len = Math.hypot(cx(b) - cx(a), cy(b) - cy(a));
  if (len < 4) { hint('Motorways need at least 4 tiles between ends.'); return false; }
  const m = {id: ++motoSeq, a, b, len};
  motorways.push(m); take('moto'); rebuildNet(); refreshUI(); sfx('place');
  pushUndo({t: 'moto', id: m.id, a, b});
  return true;
}
function applyTool(k, dragging) {
  if (k < 0) return;
  switch (tool) {
    case 'select': break;
    case 'road': placeRoad(k, false, !dragging); break;
    case 'erase': eraseAt(k); break;
    case 'park': if (!dragging) placePark(k); break;
    case 'depot': if (!dragging) placeDepot(k); break;
    case 'light': case 'round': {
      if (dragging) return;
      if (!isRoad(k)) { hint('Lights and roundabouts go on road tiles.'); return; }
      if (special[k] === 'light' && tool === 'light') { sel = {type: 'tile', k}; renderInspector(); refreshUI(); return; }
      placeSpecial(k, tool); break;
    }
    case 'upgrade': if (!dragging) upgradeStore(k >= 0 && bAt[k] >= 0 ? bAt[k] : -1); break;
    case 'tow': if (!dragging) hireTruck(k >= 0 && bAt[k] >= 0 ? bAt[k] : -1); break;
    case 'moto': {
      if (dragging || !isRoad(k) || !canTake('moto')) {
        if (!dragging && !isRoad(k)) hint('Motorways start and end on road tiles.');
        else if (!dragging && !canTake('moto')) hint('A motorway costs ' + fmt$(PRICE.moto) + '. ' + shortBy(PRICE.moto));
        return;
      }
      if (motoPick < 0) { motoPick = k; hint('Now pick the far end.'); return; }
      if (motoPick === k) { motoPick = -1; return; }
      const len = Math.hypot(cx(k) - cx(motoPick), cy(k) - cy(motoPick));
      if (len < 4) { motoPick = k; hint('Motorways need at least 4 tiles between ends.'); return; }
      if (placeMoto(motoPick, k)) motoPick = -1;
      break;
    }
    default:
      if (tool === 'oneway') { if (!dragging) toggleOneway(k); return; }
      if (tool.startsWith('only') || tool.startsWith('no')) {
        if (dragging || !isRoad(k)) return;
        if (sign[k] === tool) { sign[k] = null; inv.sign++; rebuildNet(); refreshUI(); return; }
        placeSign(k, tool);
      }
  }
}
/* Walk the pen across the tiles between two pointer positions. A step that
   changes both column and row is a true diagonal (corner to corner); if a
   diagonal would cross another one it is drawn as an elbow instead. */
function stepRoad(from, to) {
  let c = cx(from), r = cy(from);
  const tc = cx(to), tr = cy(to);
  let guard = 0;
  while ((c !== tc || r !== tr) && guard++ < 90) {
    const dc = Math.sign(tc - c), dr = Math.sign(tr - r);
    const a = idx(c, r);
    if (dc && dr) {
      const d = dirBetween(a, idx(c + dc, r + dr));
      if (!diagBlocked(a, d)) { layRoad(a, idx(c + dc, r + dr)); c += dc; r += dr; continue; }
      layRoad(a, idx(c + dc, r)); c += dc;           // elbow: across, then down
      layRoad(idx(c, r), idx(c, r + dr)); r += dr;
      continue;
    }
    layRoad(a, idx(c + dc, r + dr)); c += dc; r += dr;
  }
}
function stepTo(from, to) {
  if (from < 0) { applyTool(to, true); return; }
  if (tool === 'road') { stepRoad(from, to); return; }
  let c = cx(from), r = cy(from);
  const tc = cx(to), tr = cy(to);
  let guard = 0;
  while ((c !== tc || r !== tr) && guard++ < 90) {
    if (c !== tc) c += Math.sign(tc - c);
    if (r !== tr) r += Math.sign(tr - r);
    applyTool(idx(c, r), true);
  }
}

/* ------------------------------------------------------- dispatch */
function idleCarsOf(color) {
  const out = [];
  for (const c of cars) if (c.state === 'parked' && !c.job && c.color === color && nodeOfParked(c) >= 0) out.push(c);
  return out;
}
function dispatch() {
  const stores = buildings.filter(b => b.type === 'store' && b.acc >= 0 && b.pins - b.claimed > 0);
  stores.sort((a, b) => (b.timer - a.timer) || ((b.pins - b.claimed) - (a.pins - a.claimed)));
  for (const s of stores) {
    if (s.unreach > 0) continue;
    let avail = s.pins - s.claimed;
    while (avail > 0) {
      if (solveBudget <= 0) return;
      const idle = idleCarsOf(s.color);
      if (!idle.length) break;
      const sx = cx(s.acc), sy = cy(s.acc);
      idle.sort((p, q) => {
        const a = nodeOfParked(p), b = nodeOfParked(q);
        return Math.hypot(cx(a) - sx, cy(a) - sy) - Math.hypot(cx(b) - sx, cy(b) - sy);
      });
      let best = null, bestCost = Infinity;
      for (const c of idle.slice(0, 3)) {
        if (solveBudget <= 0) break;
        solveBudget--;
        const r = planRoute(null, nodeOfParked(c), s.acc);
        if (r && lastCost < bestCost) { bestCost = lastCost; best = {c, r}; }
      }
      if (!best) { s.unreach = 1.5; break; }
      const want = Math.min(carCap(best.c), avail);
      assignFetch(best.c, s, best.r, want);
      avail -= want;
    }
  }
  repositionIdle();
}
function assignFetch(c, s, route, want) {
  c.job = 'fetch'; c.store = buildings.indexOf(s); c.want = want; c.taken = false;
  s.claimed += want;
  c.route = route; c.ri = 0; c.destNode = s.acc; c.state = 'exiting'; c.xf = null; c.planFail = 0; c.stopAcc = 0;
}
function repositionIdle() {
  if (!depots.length || solveBudget <= 0) return;
  let moved = 0;
  for (const c of cars) {
    if (moved >= 2 || solveBudget <= 0) break;
    if (c.state !== 'parked' || c.job || c.loc.t !== 'home' || c.idle < 4) continue;
    const stores = buildings.filter(b => b.type === 'store' && b.color === c.color && b.acc >= 0);
    if (!stores.length) continue;
    const h = buildings[c.home], from = h.acc; if (from < 0) continue;
    let bestBay = -1, gain = 3;
    depots.forEach((d, i) => {
      if (d.acc < 0 || d.slots.length + d.res >= d.cap) return;
      let dh = Infinity, db = Infinity;
      for (const s of stores) { dh = Math.min(dh, Math.hypot(cx(h.k) - cx(s.k), cy(h.k) - cy(s.k))); db = Math.min(db, Math.hypot(cx(d.k) - cx(s.k), cy(d.k) - cy(s.k))); }
      if (dh - db > gain) { gain = dh - db; bestBay = i; }
    });
    if (bestBay < 0) { c.idle = 0; continue; }
    solveBudget--;
    const r = planRoute(null, from, depots[bestBay].acc);
    if (!r) { c.idle = 0; continue; }
    depots[bestBay].res++;
    c.job = 'reposition'; c.bay = bestBay; c.route = r; c.ri = 0; c.destNode = depots[bestBay].acc; c.state = 'exiting'; c.xf = null;
    moved++;
  }
  // cars parked in a bay whose nearest store is now farther than home: let them be — they'll come back after their next trip
}

/* ------------------------------------------------------------ perks (bought with cash) */
const PERK_DEFAULTS = {boots: 0, tyres: 0, marshal: 0, quick: 0, loading: 0, patience: 0, tow: 0, grip: 0, winch: 0, contracts: 0};
const PERKS = {
  boots:     {name: 'Bigger boots',      max: 3, cost: [70, 130, 210],      icon: 'box',   desc: l => 'Every car carries ' + Math.min(CFG.carCapacityMax, CFG.carCapacityStart + l) + ' parcels a trip.'},
  tyres:     {name: 'Engine tuning',     max: 4, cost: [60, 100, 160, 240], icon: 'bolt',  desc: l => 'Every car cruises ' + (l * 10) + '% faster.'},
  contracts: {name: 'Bulk contracts',    max: 3, cost: [90, 160, 260],      icon: 'coin',  desc: l => 'Every parcel pays ' + Math.round(l * CFG.contractsBonus * 100) + '% more.'},
  marshal:   {name: 'Junction marshal',  max: 2, cost: [80, 150],           icon: 'cone',  desc: l => 'Give-way junctions release ' + (CFG.batchSize + l) + ' cars per turn.'},
  quick:     {name: 'Slick junctions',   max: 3, cost: [70, 120, 190],      icon: 'cross', desc: l => 'Crossing takes ' + (l * 8) + '% less time, headways ' + (l * 12) + '% tighter.'},
  loading:   {name: 'Loading dock crew', max: 2, cost: [50, 100],           icon: 'dock',  desc: l => 'Pickups take ' + Math.round((1 - Math.pow(0.7, l)) * 100) + '% less time.'},
  patience:  {name: 'Loyal customers',   max: 3, cost: [60, 110, 170],      icon: 'heart', desc: l => 'Stores wait ' + (l * 4) + ' seconds longer before giving up.'},
  tow:       {name: 'Recovery crew',     max: 2, cost: [50, 100],           icon: 'hook',  desc: l => 'Breakdowns clear ' + Math.round((1 - Math.pow(0.6, l)) * 100) + '% faster.'},
  winch:     {name: 'Tow winches',       max: 2, cost: [60, 120],           icon: 'truck', desc: l => 'Your tow trucks hook on ' + Math.round((1 - Math.pow(0.65, l)) * 100) + '% faster and drive ' + (l * 15) + '% quicker.'},
  grip:      {name: 'All-weather tyres', max: 1, cost: [90],                icon: 'drop',  desc: () => 'Rain no longer slows the cars.'}
};
const perkCost = id => perks[id] < PERKS[id].max ? PERKS[id].cost[perks[id]] : null;
function buyPerk(id) {
  const P = PERKS[id], c = perkCost(id);
  if (!P || c === null) return false;
  if (money < c) { hint(P.name + ' costs ' + fmt$(c) + '. ' + shortBy(c)); return false; }
  spend(c); perks[id]++;
  if (id === 'boots') carCapacity = Math.min(CFG.carCapacityMax, CFG.carCapacityStart + perks.boots);
  toast(P.name + ' — ' + P.desc(perks[id]), 'good'); sfx('upgrade'); renderPerks(); refreshUI();
  return true;
}

/* ------------------------------------------------------------ weekly rewards (free picks) */
const weekBonus = () => 40 + 10 * week;
const UPGRADES = [
  {id: 'cash',  kind: 'item', name: 'Cash bonus',      icon: 'coin',  desc: () => fmt$(weekBonus()) + ' straight into your pocket.', apply: () => { earn(weekBonus()); }},
  {id: 'moto',  kind: 'item', name: 'Motorway',        icon: 'moto',  desc: () => 'Links two distant road tiles at six times the speed.', apply: () => inv.moto++},
  {id: 'light', kind: 'item', name: 'Two traffic lights', icon: 'light', desc: () => 'Sensors give green to the side with cars; both sides take turns.', apply: () => { inv.light += 2; }},
  {id: 'round', kind: 'item', name: 'Roundabout',      icon: 'round', desc: () => 'Lets two cars hold a junction at once.', apply: () => inv.round++},
  {id: 'bridge',kind: 'item', name: 'Two bridges',     icon: 'bridge',desc: () => 'Carry road over the river.', apply: () => { inv.bridge += 2; }},
  {id: 'sign',  kind: 'item', name: 'Three signs',     icon: 'sign',  desc: () => 'Turn rules to untangle a junction.', apply: () => { inv.sign += 3; }},
  {id: 'park',  kind: 'item', name: 'Two parking lots',icon: 'park',  desc: () => 'On a house: one more car. On a store: three more bays and a loading dock.', apply: () => { inv.park += 2; }},
  {id: 'depot', kind: 'item', name: 'Waiting bay',     icon: 'depot', desc: () => 'Idle cars gather here, off the road, closer to the stores.', apply: () => inv.depot++},
  {id: 'van',   kind: 'item', name: 'Delivery van',    icon: 'van',   desc: () => 'Turns a car into a van: ' + CFG.vanCapacityBonus + ' extra parcels, 20% slower.',
   avail: () => cars.some(c => !c.van), apply: () => { const p = cars.filter(c => !c.van); if (p.length) makeVan(pick(p)); }},
  {id: 'cars',  kind: 'item', name: 'Two extra cars',  icon: 'car',   desc: () => 'For two houses that have a spare bay.',
   avail: () => buildings.some(b => b.type === 'house' && b.carsN < houseCap(b)),
   apply: () => { shuffle(buildings.map((b, i) => ({b, i})).filter(o => o.b.type === 'house' && o.b.carsN < houseCap(o.b))).slice(0, 2).forEach(o => addCar(o.i)); }}
];
for (const id in PERKS) {
  const P = PERKS[id];
  UPGRADES.push({id: 'perk-' + id, kind: 'perk', perk: id, name: P.name, icon: P.icon,
    desc: () => P.desc(perks[id] + 1), avail: () => perks[id] < P.max,
    apply: () => { perks[id]++; if (id === 'boots') carCapacity = Math.min(CFG.carCapacityMax, CFG.carCapacityStart + perks.boots); }});
}

/* ------------------------------------------------------------ the shop: things that are not tools */
const spareHouses = () => buildings.map((b, i) => ({b, i})).filter(o => o.b.type === 'house' && o.b.carsN < houseCap(o.b));
const SHOP = [
  {id: 'truck', name: 'Tow truck', icon: 'truck', selfPaid: true, price: truckPrice, avail: () => bestTruckStore() >= 0,
   desc: () => 'Based at a store. Drives out to broken and stuck cars, hauls them clear and saves their parcels. Hired: ' + trucks.length + '. Or use the Tow tool to pick the store.',
   buy: () => hireTruck(bestTruckStore())},
  {id: 'moto', name: 'Motorway', icon: 'moto', price: () => PRICE.moto, avail: () => true,
   desc: () => 'One motorway piece for your stock, ready to place with the Motorway tool. In stock: ' + inv.moto + '.',
   buy: () => { inv.moto++; return true; }},
  {id: 'car', name: 'Extra car', icon: 'car', price: () => Math.round(PRICE.car * (1 + CFG.carBuyCityRamp * carsBought)), avail: () => spareHouses().length > 0,
   desc: () => 'One more car for a house with a spare space.',
   buy: () => { const o = pick(spareHouses()); addCar(o.i); carsBought++; popRing(tx(o.b.k), ty(o.b.k), COLORS[o.b.color].hex); return true; }},
  {id: 'van', name: 'Delivery van', icon: 'van', price: () => PRICE.van, avail: () => cars.some(c => !c.van),
   desc: () => 'Turns a car into a van: ' + CFG.vanCapacityBonus + ' extra parcels a trip, 20% slower.',
   buy: () => { makeVan(pick(cars.filter(c => !c.van))); return true; }}
];
function buyItem(id) {
  const it = SHOP.find(x => x.id === id);
  if (!it || !it.avail()) return false;
  const p = it.price();
  if (money < p) { hint(it.name + ' costs ' + fmt$(p) + '. ' + shortBy(p)); return false; }
  if (it.selfPaid) return it.buy() !== false;
  spend(p);
  if (it.buy() === false) { money += p; stats.spent -= p; return false; }
  toast(it.name + ' bought for ' + fmt$(p), 'good'); sfx('upgrade'); refreshUI();
  return true;
}
/* what a buy button should show, and what a click on it does */
function offerOf(kind, id) {
  if (kind === 'shop') { const it = SHOP.find(x => x.id === id); if (!it) return null; const p = it.price(), av = it.avail(); return {can: av && money >= p, label: av ? fmt$(p) : 'n/a'}; }
  if (kind === 'perk') { const p = perkCost(id); return p === null ? {can: false, label: 'Max'} : {can: money >= p, label: fmt$(p)}; }
  if (kind === 'store') { const s = buildings[+id]; if (!s) return null; const p = storeUpCost(s); return p === null ? {can: false, label: 'Max'} : {can: money >= p, label: fmt$(p)}; }
  if (kind === 'junction') { const nd = nodes[+id]; if (!nd || !nd.junction) return null; const p = junctionUpCost(nd); return p === null ? {can: false, label: 'Max'} : {can: money >= p, label: fmt$(p)}; }
  if (kind === 'carbuy') { const b = buildings[+id]; if (!b || b.type !== 'house') return null; if ((b.extra || 0) >= CFG.carBuyExtraMax || b.carsN >= CFG.carsPerHouseMax) return {can: false, label: 'Full'}; const p = carBuyPrice(b); return {can: money >= p, label: fmt$(p)}; }
  if (kind === 'carup') { const [cid, t] = String(id).split(':'); const c = cars.find(x => x.id === +cid); if (!c || !CAR_UP[t]) return null; const p = carUpCost(c, t); return p === null ? {can: false, label: 'Max'} : {can: money >= p, label: fmt$(p)}; }
  if (kind === 'vanconv') { const c = cars.find(x => x.id === +id); if (!c) return null; if (c.van) return {can: false, label: 'Max'}; const p = PRICE.van; return {can: money >= p, label: fmt$(p)}; }
  if (kind === 'truck') { const s = buildings[+id]; if (!s) return null; const p = truckPrice(); return s.trucks >= CFG.towTrucksPerStore ? {can: false, label: 'Full'} : {can: money >= p, label: fmt$(p)}; }
  return null;
}
function doBuy(kind, id) {
  if (kind === 'shop') return buyItem(id);
  if (kind === 'perk') return buyPerk(id);
  if (kind === 'store') return upgradeStore(+id);
  if (kind === 'truck') return hireTruck(+id);
  if (kind === 'carbuy') return buyHouseCar(+id);
  if (kind === 'carup') { const [cid, t] = String(id).split(':'); return upgradeCar(+cid, t); }
  if (kind === 'vanconv') { const c = cars.find(x => x.id === +id); if (!c || c.van) return false; const p = PRICE.van; if (money < p) { hint('A van conversion costs ' + fmt$(p) + '. ' + shortBy(p)); return false; } spend(p); makeVan(c); popRing(c.x, c.y, '#ffc933'); sfx('upgrade'); refreshUI(); renderInspector(); return true; }
  if (kind === 'junction') return upgradeJunction(+id);
  return false;
}

/* ------------------------------------------------------------ junction upgrades */
function upgradeJunction(k) {
  const nd = nodes[k];
  if (!nd || !nd.junction) { hint('Only junctions (three or more roads) can be upgraded.'); return false; }
  const c = junctionUpCost(nd);
  if (c === null) { hint('That junction is already at its top level.'); return false; }
  if (money < c) { hint('Upgrading costs ' + fmt$(c) + '. ' + shortBy(c)); return false; }
  spend(c); nd.lvl++; nd.spent += c;
  popRing(tx(k), ty(k), '#ffc933'); popText(tx(k), ty(k) - 18, 'Level ' + nd.lvl, '#ffc933');
  toast('Junction upgraded to level ' + nd.lvl + ' — ' + juncEffect(nd, nd.lvl), 'good'); sfx('upgrade'); refreshUI();
  return true;
}
/* a junction that is erased hands back what was spent on it */
function refundJunction(nd) {
  if (!nd || !nd.spent) return;
  money += nd.spent; stats.spent -= nd.spent;
  toast('Junction upgrade refunded: ' + fmt$(nd.spent)); nd.spent = 0; nd.lvl = 0;
}

/* ------------------------------------------------------------ store upgrades */
function upgradeStore(si) {
  const s = buildings[si];
  if (!s || s.type !== 'store') { hint('Click a store to upgrade it.'); return false; }
  const c = storeUpCost(s);
  if (c === null) { hint('That store is already at its top level.'); return false; }
  if (money < c) { hint('Upgrading costs ' + fmt$(c) + '. ' + shortBy(c)); return false; }
  spend(c); s.lvl++;
  popRing(tx(s.k), ty(s.k), '#ffc933'); popText(tx(s.k), ty(s.k) - 20, fmt$(baseRate(s)) + ' a parcel', '#ffc933');
  toast('The ' + COLORS[s.color].name + ' store now pays ' + fmt$(baseRate(s)) + ' a parcel', 'good'); sfx('upgrade'); refreshUI();
  return true;
}

/* ---------------------------------------------------------------------
   TOW TRUCKS. A hired truck lives inside a store. When a car is broken
   down or has been stuck for a while, the truck drives out along the real
   road network (queueing and giving way like any other vehicle, only
   quicker), stops behind the stuck car, hooks it on, and hauls it back to
   the store's yard. The car is sent home with its parcels delivered.
   --------------------------------------------------------------------- */
function makeTruck(si) {
  const s = buildings[si];
  const t = {id: ++carSeq, isTruck: true, home: -1, store: si, color: s.color, van: false, state: 'garage', loc: {t: 'yard', i: si},
    x: tx(s.k), y: ty(s.k), ang: 0, v: 0, len: CFG.truckLen, edge: null, s: 0, route: null, ri: 0, destNode: -1,
    job: null, bay: -1, want: 0, load: 0, cash: 0, taken: false, timer: 0, stopT: 0, stopAcc: 0, blockedT: 0,
    replanT: rnd(1, CFG.replanSeconds), replanCool: 0, planFail: 0, brake: false, broken: 0, xf: null, xfEdge: null, cr: null,
    idle: 0, trips: 0, carried: 0, tripStart: 0, hazard: 0, tgt: null, hook: null, hauling: null, cool: 2};
  trucks.push(t);
  return t;
}
/* the store that most needs a truck: room for one, fewest already, most stressed */
function bestTruckStore() {
  let best = -1, bs = -1e9;
  buildings.forEach((b, i) => {
    if (b.type !== 'store' || b.acc < 0 || b.trucks >= CFG.towTrucksPerStore) return;
    const sc = 100 - b.trucks * 40 + b.timer;
    if (sc > bs) { bs = sc; best = i; }
  });
  return best;
}
function hireTruck(si) {
  const s = buildings[si];
  if (!s || s.type !== 'store') { hint('Tow trucks are based at stores. Click a store.'); return false; }
  if (s.acc < 0) { hint('Connect that store to a road first.'); return false; }
  if (s.trucks >= CFG.towTrucksPerStore) { hint('That store already has ' + CFG.towTrucksPerStore + ' tow trucks.'); return false; }
  const p = truckPrice();
  if (money < p) { hint('A tow truck costs ' + fmt$(p) + '. ' + shortBy(p)); return false; }
  spend(p); s.trucks++; makeTruck(si);
  popRing(tx(s.k), ty(s.k), '#f08a1c');
  toast('Tow truck hired at the ' + COLORS[s.color].name + ' store', 'good'); sfx('upgrade'); refreshUI();
  return true;
}

const towSeekable = c => c.state === 'driving' && !!c.edge && !c.claim && (c.broken > CFG.towSeekBroken || c.blockedT > CFG.towSeekBlocked || c.stopT > CFG.towSeekStopped);
const towHookable = c => c.state === 'driving' && (c.broken > CFG.towHookBroken || c.blockedT > CFG.towHookBlocked || c.stopT > CFG.towHookStopped);
function truckTargetOk(t) {
  const c = t.tgt;
  return !!c && c.claim === t && (c.state === 'driving' || c.state === 'crossing') && cars.includes(c);
}
function truckDropTarget(t) {
  if (t.tgt && t.tgt.claim === t) t.tgt.claim = null;
  if (t.hook && t.hook.car && t.hook.car.claim === t) t.hook.car.claim = null;
  t.tgt = null; t.hook = null;
}
/* a route that ends on the very lane the stuck car is standing in */
function routeToTarget(t, fromEdge) {
  const c = t.tgt, e = c && c.edge;
  if (!e || e.dead) return null;
  if (fromEdge === e) return [e];
  const s = buildings[t.store];
  const base = fromEdge ? planRoute(fromEdge, null, e.a) : (s && s.acc >= 0 ? planRoute(null, s.acc, e.a) : null);
  if (!base) return null;
  const last = base[base.length - 1], nd = nodes[e.a];
  if (last && (!nd || !exitsFor(nd, last).includes(e))) return null;
  return base.concat([e]);
}
/* every half second: idle trucks pick the nearest car that needs rescuing */
function dispatchTrucks() {
  if (!trucks.length) return;
  let cand = null;
  for (const t of trucks) {
    if (t.state !== 'garage' || t.cool > 0 || solveBudget <= 0) continue;
    const s = buildings[t.store]; if (!s || s.acc < 0) continue;
    if (!cand) cand = cars.filter(towSeekable);
    if (!cand.length) return;
    const sx = tx(s.k), sy = ty(s.k);
    cand.sort((a, b) => Math.hypot(a.x - sx, a.y - sy) - Math.hypot(b.x - sx, b.y - sy));
    for (let i = 0; i < Math.min(3, cand.length) && solveBudget > 0; i++) {
      const c = cand[i]; solveBudget--;
      t.tgt = c;
      const r = routeToTarget(t, null);
      if (r) {
        c.claim = t; t.job = 'seek'; t.route = r; t.ri = 0; t.destNode = r[r.length - 1].b;
        t.state = 'exiting'; t.xf = null; t.planFail = 0; t.hook = null;
        cand.splice(i, 1); break;
      }
      t.tgt = null;
    }
  }
}
function truckReplan(t, force) {
  if (t.isAmb) return ambReplan(t, force);
  if (t.state !== 'driving' || !t.edge) return false;
  if (!force && solveBudget <= 0) return false;
  solveBudget--;
  let r = null;
  if (t.job === 'seek') {
    if (truckTargetOk(t)) r = routeToTarget(t, t.edge);
    if (!r) { truckDropTarget(t); t.job = 'home'; }
  }
  if (!r && t.job === 'home') {
    const s = buildings[t.store];
    r = s && s.acc >= 0 ? planRoute(t.edge, null, s.acc) : null;
  }
  if (r) { t.route = r; t.ri = 0; t.destNode = r[r.length - 1].b; t.planFail = 0; return true; }
  t.planFail++;
  return false;
}
function truckHeadHome(t) {
  truckDropTarget(t); t.job = 'home';
  if (t.state !== 'driving' || !t.edge) return;          // mid-junction: the stop-line check replans it
  if (!truckReplan(t, true) && t.planFail > 3) truckReset(t);
}
/* put the truck back in its garage, wherever it is (the road under it was removed, say) */
function truckReset(t) {
  if (t.isAmb) { ambEnd(t, 'lost'); return; }
  dropFromRoad(t);
  truckDropTarget(t);
  const h = t.hauling; t.hauling = null;
  if (h) recoverCar(h, t);
  t.job = null; t.route = null; t.broken = 0; t.state = 'garage'; t.loc = {t: 'yard', i: t.store};
  t.v = 0; t.blockedT = 0; t.stopT = 0; t.planFail = 0; t.cool = CFG.towCooldown;
  const p = parkedPose(t); t.x = p.x; t.y = p.y; t.ang = p.a;
}
function truckArrive(t) {
  t.xf = null; t.v = 0; t.edge = null;
  const h = t.hauling; t.hauling = null;
  if (h) recoverCar(h, t);
  t.job = null; t.route = null; t.tgt = null; t.hook = null; t.state = 'garage'; t.cool = CFG.towCooldown;
}
/* a hauled car reaches the yard: its parcels are delivered and it goes home */
function recoverCar(c, t) {
  c.towedBy = null;
  if (!cars.includes(c)) return;
  const n = c.load, cash = c.cash || 0;
  c.state = 'parked'; c.loc = {t: 'home', i: c.home}; c.job = null; c.route = null; c.taken = false; c.want = 0;
  c.load = 0; c.cash = 0; c.v = 0; c.idle = 0; c.stopAcc = 0; c.claim = null;
  const p = parkedPose(c); c.x = p.x; c.y = p.y; c.ang = p.a;
  stats.tows++; stats.hauls++;
  if (n > 0) { score += n; stats.delivered += n; stats.lastDeliveries.push(clock); earn(cash); }
  toast('Tow truck rescued a ' + COLORS[c.color].name + ' car' + (n > 0 ? ' — ' + n + ' parcel' + (n > 1 ? 's' : '') + ' saved, +' + fmt$(cash) : ''), 'good');
  sfx(n > 0 ? 'deliver' : 'place');
  const h = buildings[c.home];
  if (n > 0 && h) { popText(tx(h.k), ty(h.k) - 12, '+' + fmt$(cash), '#ffc933'); popRing(tx(h.k), ty(h.k), COLORS[c.color].hex); }
}
function hookCar(t, c) {
  t.hook = null;
  dropFromRoad(c); releaseClaims(c);
  c.job = null; c.route = null; c.want = 0; c.broken = 0; c.hazard = 0; c.v = 0; c.stopT = 0; c.stopAcc = 0; c.blockedT = 0;
  c.claim = null; c.state = 'towed'; c.towedBy = t;
  t.hauling = c; t.tgt = null; t.job = 'home'; t.planFail = 0;
  if (!truckReplan(t, true)) truckReset(t);
}
/* pulling out of the yard: the truck may squeeze in behind the very car it came for */
function truckMayMerge(t, f) {
  const l = f.cars[f.cars.length - 1];
  return !!(t.isTruck && t.job === 'seek' && t.tgt && l === t.tgt);
}
/* each tick, after the lanes have moved */
function truckStep(t, dt) {
  if (t.cool > 0) t.cool -= dt;
  switch (t.state) {
    case 'garage': return;
    case 'exiting':
      if (t.job === 'seek' && !truckTargetOk(t)) { truckReset(t); return; }
      stepExiting(t, dt); break;
    case 'entering': if (stepXf(t, dt)) { truckArrive(t); return; } break;
    case 'driving': truckDrive(t, dt); break;
  }
  if (t.hauling) {
    const h = t.hauling, back = t.len / 2 + h.len / 2 + 1.5;
    h.x = t.x - Math.cos(t.ang) * back; h.y = t.y - Math.sin(t.ang) * back; h.ang = t.ang; h.v = 0;
  }
}
function truckDrive(t, dt) {
  if (t.job === 'seek') {
    if (t.hook) {
      const c = t.hook.car;
      if (!cars.includes(c) || c.state !== 'driving' || c.edge !== t.edge) { if (c.claim === t) c.claim = null; t.hook = null; return; }
      t.hook.t += dt;
      if (t.hook.t >= t.hook.dur) hookCar(t, c);
      return;
    }
    if (!truckTargetOk(t)) { truckHeadHome(t); return; }
    const e = t.edge, i = e ? e.cars.indexOf(t) : -1, L = i > 0 ? e.cars[i - 1] : null;
    if (L && !L.isTruck && !L.hook && (!L.claim || L.claim === t) && towHookable(L) && (L.s - t.s) - (L.len + t.len) / 2 < 10 && t.v < 5) {
      if (t.tgt && t.tgt !== L && t.tgt.claim === t) t.tgt.claim = null;
      L.claim = t; t.tgt = L; t.hook = {t: 0, dur: CFG.towHookSeconds * Math.pow(0.65, perks.winch), car: L};
      return;
    }
  }
  t.replanT -= dt;
  if (t.replanT <= 0) {
    t.replanT = 1.5;
    if (t.job === 'seek' && t.tgt && t.tgt.edge && t.route && t.route[t.route.length - 1] !== t.tgt.edge && solveBudget > 0) truckReplan(t);
  }
}

/* ------------------------------------------------------------ goals */
/* ---------------------------------------------------------------------
   AMBULANCES. A call comes in at a house and an ambulance races to a store. It is a
   tow-truck-style vehicle (isTruck, faster) flagged `prio`: every traffic light on its
   route that it is about to reach turns green for its side, overriding the count. It
   pays a bonus for arriving inside its time limit (more the earlier it is) and costs
   money when it is late or never gets through.
   --------------------------------------------------------------------- */
const prioNodes = [];
/* which lights have an ambulance close enough that they should open for it */
function markPriority() {
  for (const nd of prioNodes) nd.pg = -1;
  prioNodes.length = 0;
  for (const a of ambs) {
    if (a.state !== 'driving' || !a.edge || !a.route) continue;
    let dist = Math.max(0, a.edge.stop - a.s);
    for (let j = a.ri; j < a.route.length - 1 && dist <= CFG.ambLookahead; j++) {
      const e = a.route[j], nd = nodes[e.b];
      if (nd && nd.type === 'light') { nd.pg = groupOf(e); prioNodes.push(nd); }
      dist += a.route[j + 1].L;
    }
  }
}
function spawnAmb() {
  const houses = [], stores = [];
  buildings.forEach((b, i) => { if (b.acc >= 0) (b.type === 'house' ? houses : stores).push(i); });
  if (!houses.length || !stores.length) return false;
  for (let t = 0; t < 6; t++) {
    const hi = pick(houses), si = pick(stores), h = buildings[hi], s = buildings[si];
    if (h.acc === s.acc) continue;
    const r = planRoute(null, h.acc, s.acc);
    if (!r || lastCost < 6) continue;
    const sp = homeSpots(h)[0];
    const a = {id: ++carSeq, isTruck: true, isAmb: true, prio: true, home: hi, store: si, color: s.color, van: false,
      state: 'exiting', loc: {t: 'home', i: hi}, x: sp.x, y: sp.y, ang: sp.a, v: 0, len: CFG.ambLen, edge: null, s: 0,
      route: r, ri: 0, destNode: s.acc, job: 'amb', bay: -1, want: 0, load: 0, cash: 0, taken: false, timer: 0,
      stopT: 0, stopAcc: 0, blockedT: 0, replanT: rnd(1, 2.5), replanCool: 0, planFail: 0, brake: false, broken: 0,
      xf: null, xfEdge: null, cr: null, idle: 0, trips: 0, carried: 0, tripStart: clock, hazard: 0, tgt: null, hook: null, hauling: null, cool: 0,
      t0: clock, limit: lastCost * CFG.ambSlackMul + CFG.ambSlack};
    ambs.push(a);
    toast('Ambulance! The ' + COLORS[h.color].name + ' house is calling — get it to the ' + COLORS[s.color].name + ' store in ' + Math.round(a.limit) + 's', 'warn');
    popRing(tx(h.k), ty(h.k), '#ff4d3d'); sfx('alarm');
    return true;
  }
  return false;
}
function ambReplan(a, force) {
  if (a.state !== 'driving' || !a.edge) return false;
  if (!force && solveBudget <= 0) return false;
  solveBudget--;
  const s = buildings[a.store], r = s && s.acc >= 0 ? planRoute(a.edge, null, s.acc) : null;
  if (r) { a.route = r; a.ri = 0; a.destNode = s.acc; a.planFail = 0; return true; }
  a.planFail++;
  if (a.planFail > 3) ambEnd(a, 'lost');
  return false;
}
function ambPenalty(n) {
  const p = Math.min(Math.round(n), Math.floor(money));
  if (p > 0) spend(p);
  return p;
}
/* the call is over without a delivery: 'lost' and 'late' cost money, 'removed' (the road went) doesn't */
function ambEnd(a, why) {
  const i = ambs.indexOf(a); if (i < 0) return;
  dropFromRoad(a); ambs.splice(i, 1);
  if (why === 'removed') { toast('The ambulance call was cancelled'); return; }
  const p = ambPenalty(why === 'late' ? CFG.ambPenaltyMax : CFG.ambPenalty);
  stats.ambFail++;
  toast('The ambulance never got through' + (p ? ' · −' + fmt$(p) : ''), 'warn'); sfx('alarm');
}
function ambArrive(a) {
  const i = ambs.indexOf(a); if (i < 0) return;
  ambs.splice(i, 1); a.xf = null;
  const el = clock - a.t0, s = buildings[a.store];
  if (el <= a.limit) {
    const bonus = Math.round(CFG.ambBonus + CFG.ambBonusFast * clamp((a.limit - el) / a.limit, 0, 1));
    earn(bonus); stats.ambOk++;
    toast('Ambulance arrived in ' + Math.round(el) + 's · +' + fmt$(bonus), 'good'); sfx('deliver');
    if (s) { popText(tx(s.k), ty(s.k) - 14, '+' + fmt$(bonus), '#7be495'); popRing(tx(s.k), ty(s.k), '#ff4d3d'); }
    bump('v-money');
  } else {
    const p = ambPenalty(5 + (el - a.limit) * 0.8 > CFG.ambPenaltyMax ? CFG.ambPenaltyMax : 5 + (el - a.limit) * 0.8);
    stats.ambLate++;
    toast('The ambulance was ' + Math.round(el - a.limit) + 's late' + (p ? ' · −' + fmt$(p) : ''), 'warn'); sfx('alarm');
  }
}
function ambStep(a, dt) {
  if (a.state === 'exiting') stepExiting(a, dt);
  else if (a.state === 'entering') { if (stepXf(a, dt)) { ambArrive(a); return; } }
  else if (a.state === 'driving') {
    a.replanT -= dt;
    if (a.replanT <= 0) { a.replanT = 2; if (a.stopT > 1 && a.route && a.ri < a.route.length - 1 && solveBudget > 0) ambReplan(a); }
  }
  if (a.state !== 'entering' && ambs.includes(a) && clock - a.t0 > a.limit + CFG.ambGrace) ambEnd(a, 'late');
}

/* ---------------------------------------------------------------------
   ROAD CLOSURES. A busy plain stretch of road is coned off for about half a minute.
   Routes avoid it (edgeCost), a coned-off tile acts as a dead end for cars already
   in its lane (they turn round and replan), and it is never picked if that would cut
   a house or store off from every partner of its colour.
   --------------------------------------------------------------------- */
/* connected pieces of the road network with some tiles blocked */
function roadComps(blocked) {
  const comp = new Int32Array(N).fill(-1); let n = 0;
  for (const nd of nodeList) {
    if (comp[nd.k] >= 0 || blocked.has(nd.k)) continue;
    const stack = [nd.k]; comp[nd.k] = n;
    while (stack.length) {
      const un = nodes[stack.pop()];
      for (const e of un.outs) { const v = e.b; if (comp[v] < 0 && !blocked.has(v) && nodes[v]) { comp[v] = n; stack.push(v); } }
    }
    n++;
  }
  return comp;
}
function closureSafe(k) {
  const now = new Set(closed.keys()), after = new Set(closed.keys()); after.add(k);
  const cb = roadComps(now), ca = roadComps(after);
  const partnered = (comp, b) => b.acc >= 0 && comp[b.acc] >= 0 &&
    buildings.some(o => o !== b && o.acc >= 0 && o.type !== b.type && o.color === b.color && comp[o.acc] === comp[b.acc]);
  for (const b of buildings) if (partnered(cb, b) && !partnered(ca, b)) return false;
  return true;
}
function closeTile(k) {
  closed.set(k, CFG.closureSeconds * rnd(0.85, 1.2));
  for (const v of cars.concat(trucks, ambs)) {                 // everyone whose route enters the tile must look for another way
    if (!v.route) continue;
    for (let j = v.ri; j < v.route.length; j++) if (v.route[j].b === k) { v.reroute = true; rerouteN++; break; }
  }
  popRing(tx(k), ty(k), '#ff8a1c'); toast('Road closed — traffic is rerouting', 'warn'); sfx('alarm');
}
function tryCloseRoad() {
  if (closed.size >= CFG.closureMax + (week >= 10 ? 1 : 0) + (week >= 18 ? 1 : 0)) return false;
  const access = new Set();
  for (const b of buildings) if (b.acc >= 0) access.add(b.acc);
  for (const d of depots) if (d.acc >= 0) access.add(d.acc);
  for (const m of motorways) { access.add(m.a); access.add(m.b); }
  const cand = [];
  for (const nd of nodeList) {
    if (nd.junction || nd.deg !== 2 || closed.has(nd.k) || access.has(nd.k)) continue;
    let load = 0;
    for (const e of nd.ins) load += e.cars.length + e.q;
    for (const e of nd.outs) load += e.cars.length;
    if (load >= 1.5) cand.push({k: nd.k, load});
  }
  cand.sort((a, b) => b.load - a.load);
  for (const o of shuffle(cand.slice(0, 6))) if (closureSafe(o.k)) { closeTile(o.k); return true; }
  return false;
}
function processReroutes() {
  let pending = 0;
  for (const v of cars.concat(trucks, ambs)) {
    if (!v.reroute) continue;
    if (v.state === 'driving' && v.edge) { if (solveBudget > 0) { v.reroute = false; replan(v); } else pending++; }
    else if (v.state === 'crossing') pending++;              // wait until it lands on a lane
    else v.reroute = false;
  }
  rerouteN = pending;
}

/* ---------------------------------------------------------------------
   TIMED CONTRACT STORES. Every so often an eligible store offers a cash
   bonus for prompt pickups — a short-lived push distinct from the ambient
   overflow pressure, since missing one costs nothing but the bonus itself.
   --------------------------------------------------------------------- */
function maybeOfferContract() {
  const cand = buildings.filter(b => b.type === 'store' && b.acc >= 0 && !b.contract);
  if (!cand.length) return false;
  const b = pick(cand), bonus = Math.round(CFG.contractBonusBase + CFG.contractBonusPerWeek * week);
  b.contract = {left: CFG.contractSeconds, need: CFG.contractNeed, got: 0, bonus};
  toast('The ' + COLORS[b.color].name + ' store wants ' + CFG.contractNeed + ' parcels moved fast — ' + fmt$(bonus) + ' if you deliver in time', 'warn');
  popRing(tx(b.k), ty(b.k), '#ffd23a'); sfx('alarm');
  return true;
}
function stepContracts(dt) {
  if (week >= CFG.contractFromWeek && !spectating) {
    contractTimer -= dt;
    if (contractTimer <= 0) contractTimer = maybeOfferContract() ? Math.max(30, CFG.contractEvery - week) * rnd(0.8, 1.3) : 10;
  }
  for (const b of buildings) {
    if (b.type !== 'store' || !b.contract) continue;
    const c = b.contract;
    if (c.got >= c.need) {
      earn(c.bonus); toast('Contract met at the ' + COLORS[b.color].name + ' store — +' + fmt$(c.bonus), 'good');
      popText(tx(b.k), ty(b.k) - 20, '+' + fmt$(c.bonus), '#7be495'); sfx('upgrade'); b.contract = null;
    } else {
      c.left -= dt;
      if (c.left <= 0) { toast('The ' + COLORS[b.color].name + ' store’s contract offer expired'); b.contract = null; }
    }
  }
}

/* Each goal pays a one-off reward: {cash: n} or {inv: {piece: n}}. Goals about earning money give a fixed
   piece instead of cash, because cash rewards would themselves count towards those goals. */
const PIECE_NAMES = {road: ['road tile', 'road tiles'], bridge: ['bridge', 'bridges'], moto: ['motorway', 'motorways'], light: ['light', 'lights'],
                     round: ['roundabout', 'roundabouts'], sign: ['sign', 'signs'], park: ['lot', 'lots'], depot: ['bay', 'bays']};
function rewardText(r) {
  const parts = [];
  if (r.cash) parts.push('+' + fmt$(r.cash));
  for (const k in (r.inv || {})) { const n = r.inv[k], nm = PIECE_NAMES[k]; if (nm) parts.push('+' + n + ' ' + nm[n === 1 ? 0 : 1]); }
  return parts.join(', ');
}
function giveReward(r) {
  if (r.cash) earn(r.cash);
  for (const k in (r.inv || {})) if (k in inv) inv[k] += r.inv[k];
}
const GOALS = [
  {id: 'p10',   name: 'First ten',           hint: 'Deliver 10 parcels',                hit: () => score >= 10,   reward: {cash: 10}},
  {id: 'p50',   name: 'The city is working', hint: 'Deliver 50 parcels',                hit: () => score >= 50,   reward: {cash: 25}},
  {id: 'p150',  name: 'Good business',       hint: 'Deliver 150 parcels',               hit: () => score >= 150,  reward: {inv: {light: 1}}},
  {id: 'p400',  name: 'Remarkable',          hint: 'Deliver 400 parcels',               hit: () => score >= 400,  reward: {inv: {moto: 1}}},
  {id: 'w5',    name: 'Five weeks in',       hint: 'Reach week 5',                      hit: () => week >= 5,     reward: {inv: {road: 10}}},
  {id: 'w10',   name: 'A proper town',       hint: 'Reach week 10',                     hit: () => week >= 10,    reward: {inv: {light: 1, round: 1}}},
  {id: 'bay',   name: 'Off the road',        hint: 'Have a car wait in a bay',          hit: () => cars.some(c => c.loc && c.loc.t === 'bay' && c.state === 'parked'), reward: {cash: 15}},
  {id: 'lot',   name: 'Room to park',        hint: 'Build a parking lot',               hit: () => parks.length > 0, reward: {cash: 15}},
  {id: 'moto',  name: 'Fast lane',           hint: 'Open a motorway',                   hit: () => motorways.length > 0, reward: {inv: {bridge: 1}}},
  {id: 'van',   name: 'Van life',            hint: 'Put a van on the road',             hit: () => cars.some(c => c.van), reward: {cash: 15}},
  {id: 'round', name: 'Round and round',     hint: 'Build a roundabout',                hit: () => special.some(s => s === 'round'), reward: {inv: {sign: 2}}},
  {id: 'diag',  name: 'Straight to the point', hint: 'Lay a diagonal road link',        hit: () => edges.some(e => (e.d & 1) && !e.fast), reward: {inv: {road: 6}}},
  {id: 'six',   name: 'Six-car garage',      hint: 'Own 6 cars at one house',           hit: () => buildings.some(b => b.carsN >= 6), reward: {inv: {park: 1}}},
  {id: 'flow',  name: 'Smooth operator',     hint: 'Keep 12+ cars moving, no jams',     hit: () => cars.filter(c => c.state === 'driving').length >= 12 && stats.jamPct < 0.05, reward: {inv: {light: 1}}},
  {id: 'tow',   name: 'Gridlock survivor',   hint: 'Have a tow truck clear a car',      hit: () => stats.tows > 0, reward: {cash: 25}},
  {id: 'c100',  name: 'Petty cash',          hint: 'Earn $100 in total',                hit: () => stats.earned >= 100,  reward: {inv: {road: 10}}},
  {id: 'c1000', name: 'Small fortune',       hint: 'Earn $1,000 in total',              hit: () => stats.earned >= 1000, reward: {inv: {moto: 1}}},
  {id: 'shop',  name: 'Better margins',      hint: 'Upgrade a store',                   hit: () => buildings.some(b => b.lvl > 0), reward: {cash: 20}},
  {id: 'tuned', name: 'Under the bonnet',    hint: 'Buy an engine upgrade',             hit: () => perks.tyres > 0, reward: {cash: 30}},
  {id: 'fleet', name: 'On call',             hint: 'Hire a tow truck',                  hit: () => trucks.length > 0, reward: {cash: 30}},
  {id: 'haul',  name: 'Recovery run',        hint: 'Have your own tow truck rescue a car', hit: () => stats.hauls > 0, reward: {inv: {light: 1}}}
];
function checkGoals() {
  if (spectating) return;
  for (const g of GOALS) {
    if (goalsDone.has(g.id)) continue;
    let ok = false; try { ok = g.hit(); } catch (e) {}
    if (ok) {
      goalsDone.add(g.id);
      if (g.reward) giveReward(g.reward);
      toast('Goal: ' + g.name + (g.reward ? ' · ' + rewardText(g.reward) : ''), 'good'); sfx('upgrade'); renderGoals(); refreshUI();
      if (goalsDone.size === GOALS.length && !tutorialMode) JEvents.emit('allGoals', {clock, diffKey});
    }
  }
}

/* ------------------------------------------------------ main update */
function pinCount(s) { return s.pins; }
function update(dt) {
  solveBudget = CFG.maxSolvesPerFrame;
  clock += dt; lightClock += dt;
  rain.amt += ((rain.t > 0 ? 1 : 0) - rain.amt) * Math.min(1, dt * 0.5);
  if (rain.t > 0) { rain.t -= dt; if (rain.t <= 0) toast('The rain has cleared'); }
  if (rush.t > 0) { rush.t -= dt; if (rush.t <= 0) toast('Rush hour is over'); }

  for (const s of buildings) {
    if (s.type !== 'store') continue;
    if (s.unreach > 0) s.unreach -= dt;
    // stores randomly grow busier over time: each gets a random countdown to its next chance to
    // step up a tier, so evolution is unpredictable in both timing and which store it hits
    if (!spectating && week >= CFG.storeEvolveStartWeek && s.tier < CFG.storeEvolveMaxTier) {
      s.evolveTimer -= dt;
      if (s.evolveTimer <= 0) {
        s.evolveTimer = rnd(CFG.storeEvolveCheckMin, CFG.storeEvolveCheckMax);
        if (Math.random() < CFG.storeEvolveChance) {
          s.tier++;
          for (let i = 0; i < CFG.housesOnStoreTierUp; i++) addBuilding('house', s.color);
          toast('The ' + COLORS[s.color].name + ' store is busier now (tier ' + s.tier + ') — ' + CFG.housesOnStoreTierUp + ' new ' + COLORS[s.color].name + (CFG.housesOnStoreTierUp === 1 ? ' house' : ' houses') + ' moved in', 'warn');
          popRing(tx(s.k), ty(s.k), COLORS[s.color].hex); sfx('upgrade');
        }
      }
    }
    s.pinTimer -= dt;
    if (s.pinTimer <= 0) {
      const base = ramp(CFG.pinIntervalBase, CFG.pinIntervalRamp, CFG.pinIntervalMin) * DIFF.pin;
      s.pinTimer = base * Math.pow(CFG.storeEvolvePinStep, s.tier) / (rush.t > 0 ? CFG.rushRate : 1) + Math.random() * CFG.pinJitter;
      if (s.pins < storeCap(s) + 8) { s.pins++; }
    }
    if (s.pins > storeCap(s)) s.timer += dt; else s.timer = Math.max(0, s.timer - dt * CFG.overflowDrain);
    if (s.timer >= overflowLimit() && !DIFF.noFail && !tutorialMode && !spectating) { endGame('The ' + COLORS[s.color].name + ' store ran out of patience.'); return; }
  }
  stepContracts(dt);

  dispatchTimer -= dt;
  if (dispatchTimer <= 0) { dispatchTimer = CFG.dispatchInterval; dispatch(); dispatchTrucks(); }
  stepTraffic(dt);
  // a citywide gridlock: even with no store overflowing, sustained near-total standstill also ends the run
  if (week >= CFG.cityGridlockFromWeek && !DIFF.noFail && !tutorialMode && !spectating) {
    const movingCars = cars.filter(c => c.state === 'driving' || c.state === 'crossing').length;
    if (movingCars >= CFG.cityGridlockMinCars && stats.jamPct > CFG.cityJamThreshold) cityStressClock += dt;
    else cityStressClock = Math.max(0, cityStressClock - dt * CFG.overflowDrain);
    if (cityStressClock >= CFG.cityGridlockSeconds) { endGame('The whole city has gridlocked — nothing is moving.'); return; }
  }

  if (spectating) { specTick(dt); return; }
  // spawning
  houseTimer -= dt;
  if (houseTimer <= 0) {
    houseTimer = ramp(CFG.houseIntervalBase, CFG.houseIntervalRamp, CFG.houseIntervalMin) * DIFF.spawn + Math.random() * CFG.houseJitter;
    const cols = [...new Set(buildings.filter(b => b.type === 'store').map(b => b.color))];
    if (cols.length) { const h = addBuilding('house', pick(cols)); if (h) { rebuildNetSoft(); toast('A new ' + COLORS[h.color].name + ' house appeared'); } }
  }
  storeTimer -= dt;
  if (storeTimer <= 0) {
    storeTimer = ramp(CFG.storeIntervalBase, CFG.storeIntervalRamp, CFG.storeIntervalMin) * DIFF.spawn + Math.random() * CFG.storeJitter;
    const cols = [...new Set(buildings.filter(b => b.type === 'store').map(b => b.color))];
    let c;
    if (cols.length < COLORS.length && Math.random() < CFG.newColourChance) c = pick(COLORS.map((_, i) => i).filter(i => !cols.includes(i)));
    else c = pick(cols);
    const ns = addBuilding('store', c);
    if (ns) {
      for (let i = 0; i < CFG.housesOnStoreSpawn; i++) addBuilding('house', c);
      toast('A new ' + COLORS[c].name + ' store opened, with ' + CFG.housesOnStoreSpawn + ' new ' + COLORS[c].name + (CFG.housesOnStoreSpawn === 1 ? ' house' : ' houses') + ' nearby', 'warn');
    }
  }

  // events
  const calmMul = DIFF.calm ? 2.5 : 1;
  if (week >= CFG.breakdownFromWeek) {
    breakdownTimer -= dt;
    if (breakdownTimer <= 0) {
      breakdownTimer = Math.max(14, CFG.breakdownEvery - week * 1.2) * rnd(0.7, 1.4) * calmMul;
      const cand = cars.filter(c => c.state === 'driving' && c.edge && !c.edge.fast && c.s > c.edge.r0 && c.s < c.edge.stop - 6 && !c.broken);
      if (cand.length) {
        const c = pick(cand); c.broken = CFG.breakdownSeconds * Math.pow(0.6, perks.tow); c.hazard = 0; stats.breakdowns++;
        toast('A ' + COLORS[c.color].name + ' car has broken down', 'warn');
      }
    }
  }

  // road closures compound at high weeks: more can be open at once the longer a run goes
  const closureMaxNow = CFG.closureMax + (week >= 10 ? 1 : 0) + (week >= 18 ? 1 : 0);
  if (week >= CFG.closureFromWeek) {
    closureTimer -= dt;
    if (closureTimer <= 0) closureTimer = (closed.size < closureMaxNow && tryCloseRoad()) ? Math.max(26, CFG.closureEvery - week * 1.5) * rnd(0.8, 1.3) * calmMul : 8;
  }
  for (const [k, t] of closed) {
    if (t - dt <= 0 || !road[k]) { closed.delete(k); if (road[k]) { popRing(tx(k), ty(k), '#7be495'); toast('Road reopened'); } }
    else closed.set(k, t - dt);
  }
  if (rerouteN > 0) processReroutes();
  if (week >= CFG.ambFromWeek && !ambs.length) {
    ambTimer -= dt;
    if (ambTimer <= 0) ambTimer = spawnAmb() ? Math.max(45, CFG.ambEvery - week * 3) * rnd(0.8, 1.3) * calmMul : 10;
  }

  weekTimer -= dt;
  if (weekTimer <= 0) {
    weekTimer = CFG.weekSeconds; week++;
    // at high weeks these can now land on the same week and overlap, instead of always taking turns
    if (!DIFF.calm) {
      if (week % CFG.rushEveryWeeks === 0) { rush.t = CFG.rushSeconds; toast('Rush hour — parcels pile up fast, and pay ' + Math.round(CFG.rushPayBonus * 100) + '% more', 'warn'); sfx('alarm'); }
      if (week % CFG.rainEveryWeeks === 0) { rain.t = CFG.rainSeconds; toast('Rain — roads are slower' + (rush.t > 0 ? ', and rush hour is still on' : '')); }
    }
    const grew = growMap();
    weekStart(grew);
  }
  const camEase = CFG.cameraEase * (DIFF.calm ? 0.55 : 1);
  camSpan += (span - camSpan) * Math.min(1, dt * camEase);
  camOrg += (org - camOrg) * Math.min(1, dt * camEase);

  statT -= dt;
  if (statT <= 0) {
    statT = 1;
    const cutoff = clock - 60;
    while (stats.lastDeliveries.length && stats.lastDeliveries[0] < cutoff) stats.lastDeliveries.shift();
    stats.perMin = stats.lastDeliveries.length * (clock < 60 ? 60 / Math.max(10, clock) : 1);
    stats.avgWait = stats.waitN ? stats.waitSum / stats.waitN : 0;
    stats.hist.push({jam: stats.jamPct, rate: stats.perMin});
    if (stats.hist.length > 90) stats.hist.shift();
    if (clock >= stats.runNext) { stats.runNext = clock + stats.runStep; sampleRun(); }
    checkGoals();
    checkTutorial();
  }
  autosaveT -= dt;
  if (autosaveT <= 0) { autosaveT = CFG.autosaveSeconds; saveGame(); }
}
function rebuildNetSoft() { linkBuildings(); }
/* The bits of update() a spectator still runs: timers count down smoothly between the host's snapshots,
   but nothing spawns, closes, breaks down or ends — the next snapshot is the truth. */
function specTick(dt) {
  for (const [k, t] of closed) { if (t - dt <= 0 || !road[k]) closed.delete(k); else closed.set(k, t - dt); }
  if (rerouteN > 0) processReroutes();
  weekTimer = Math.max(0, weekTimer - dt);
  camSpan += (span - camSpan) * Math.min(1, dt * CFG.cameraEase);
  camOrg += (org - camOrg) * Math.min(1, dt * CFG.cameraEase);
  statT -= dt;
  if (statT <= 0) {
    statT = 1;
    const cutoff = clock - 60;
    while (stats.lastDeliveries.length && stats.lastDeliveries[0] < cutoff) stats.lastDeliveries.shift();
    stats.perMin = stats.lastDeliveries.length * (clock < 60 ? 60 / Math.max(10, clock) : 1);
    stats.hist.push({jam: stats.jamPct, rate: stats.perMin}); if (stats.hist.length > 90) stats.hist.shift();
  }
}
/* One point of the whole-run history. Capped at about 600 points: when full, every second point is dropped and the
   sampling interval doubles, so the chart always covers the entire run. */
function sampleRun() {
  const h = stats.runHist;
  if (h.length && Math.abs(h[h.length - 1].t - clock) < 0.5) return;
  h.push({t: clock, jam: stats.jamPct, rate: stats.perMin});
  if (h.length > 600) { stats.runHist = h.filter((_, i) => i % 2 === 0); stats.runStep *= 2; }
}
/* a new week: the map grows and the council pays a small grant */
function weekStart(grew) {
  if (!tutorialMode) JEvents.emit('week', {week, score, diffKey});
  stats.weekMarks.push(clock);
  const grant = Math.round((CFG.weeklyGrant + CFG.weeklyGrantRamp * week) * DIFF.grant);
  money += grant;
  let upkeep = 0;
  if (!DIFF.calm) {
    let tiles = 0; for (let k = 0; k < N; k++) if (road[k]) tiles++;
    if (tiles > CFG.roadUpkeepFreeTiles) {
      upkeep = Math.round((tiles - CFG.roadUpkeepFreeTiles) * CFG.roadUpkeepRate * (1 + 0.03 * week));
      if (upkeep > 0) { money = Math.max(0, money - upkeep); stats.spent += upkeep; }
    }
  }
  const bits = [];
  if (grew) bits.push('the city grew to ' + span + ' × ' + span);
  bits.push('council grant ' + fmt$(grant));
  if (upkeep) bits.push('road upkeep −' + fmt$(upkeep));
  bits.push('prices up ' + Math.round((priceScale() - 1) * 100) + '% from week 1');
  toast('Week ' + week + ' — ' + bits.join(' · '), 'good');
  sfx('upgrade'); refreshUI();
  offerUpgrade(grew);
}

/* best score is kept per difficulty, under junction2-best-<difficulty> */
const bestKey = dk => 'junction2-best-' + dk;
function bestFor(dk) {
  try {
    let v = +localStorage.getItem(bestKey(dk)) || 0;
    if (!v && dk === 'standard') v = +localStorage.getItem('junction2-best') || 0;   // the old single best belongs to Standard
    return v;
  } catch (e) { return 0; }
}
function endGame(why) {
  if (spectating) return;
  running = false; over = true;
  best = Math.max(best, score);
  sampleRun();
  try { localStorage.setItem(bestKey(diffKey), String(best)); localStorage.removeItem(SAVE_KEY); } catch (e) {}
  showGameOver(why);
  sfx('over');
  if (!tutorialMode) JEvents.emit('over', {score, week, diffKey, clock});
}

/* ------------------------------------------------------------ saving */
const SAVE_KEY = 'junction2-save-v1';
function loadGame(data) {
  if (data) return loadGameCore(data);
  if (loadGameCore(null)) return true;
  try {
    const b = JSON.parse(localStorage.getItem(SAVE_KEY + '-backup'));
    if (b && loadGameCore(b)) { toast('Your last save was damaged, so the backup was loaded.', 'warn'); return true; }
  } catch (e) {}
  return false;
}
function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
/* everything a save holds, as a plain object (also what "Export city" writes) */
function serialize() {
  const list = a => { const o = []; for (let k = 0; k < N; k++) if (a[k]) o.push(k); return o; };
  return {
    v: 3, diffKey, score, week, weekTimer, span, houseTimer, storeTimer, clock, keepLeft, carCapacity, money,
    inv, perks, water: list(water), road: list(road),
    links: (() => { const o = []; for (let k = 0; k < N; k++) if (lnk[k]) o.push([k, lnk[k]]); return o; })(),
    sign: sign.map((s, k) => s ? [k, s] : null).filter(Boolean),
    special: special.map((s, k) => s ? [k, s] : null).filter(Boolean),
    lights: [...lightQ].filter(([k]) => special[k] === 'light').map(([k, q]) => [k, q[0], q[1]]),
    buildings: buildings.map(b => ({pref: b.pref, k: b.k, type: b.type, color: b.color, pins: b.pins, tier: b.tier, timer: b.timer, lvl: b.lvl, trucks: b.trucks, vans: b.cars.map(c => c.van ? 1 : 0), extra: b.extra || 0, ups: b.cars.map(c => [carUp(c, 'cap'), carUp(c, 'spd'), carUp(c, 'load')])})), carsBought,
    parks: parks.map(p => ({k: p.k, b: p.b})), depots: depots.map(d => d.k), dprefs: depots.map(d => d.pref),
    juncLvl: nodeList.filter(nd => nd.lvl > 0).map(nd => [nd.k, nd.lvl, nd.spent]),
    motorways: motorways.map(m => ({a: m.a, b: m.b, len: m.len})), goals: [...goalsDone],
    stats: {delivered: stats.delivered, trips: stats.trips, tows: stats.tows, breakdowns: stats.breakdowns, earned: stats.earned, spent: stats.spent, hauls: stats.hauls,
            ambOk: stats.ambOk, ambLate: stats.ambLate, ambFail: stats.ambFail},
    // live events, so reloading mid-storm doesn't clear it
    rushT: rush.t, rainT: rain.t, breakdownTimer,
    closures: [...closed].map(([k, t]) => [k, +t.toFixed(1)]),
    // the run so far, for the game-over chart
    runHist: stats.runHist.map(p => [Math.round(p.t), +p.jam.toFixed(3), +p.rate.toFixed(1)]), runStep: stats.runStep, weekMarks: stats.weekMarks.map(Math.round),
    oneway: (() => { const o = []; if (onewayDir) for (let k = 0; k < N; k++) if (onewayDir[k] >= 0) o.push([k, onewayDir[k]]); return o; })()
  };
}
function saveGame(urgent) {
  if (over || !started || tutorialMode || spectating) return;
  JEvents.emit('autosave', {urgent: !!urgent});
  try {
    const prev = localStorage.getItem(SAVE_KEY);
    if (prev) localStorage.setItem(SAVE_KEY + '-backup', prev);
    localStorage.setItem(SAVE_KEY, JSON.stringify(serialize()));
    localStorage.setItem(bestKey(diffKey), String(Math.max(best, score)));
  } catch (e) {}
}
/* Load a city: the one in `data` (an imported file), or else the one in local storage. */
function loadGameCore(data) {
  let d = data;
  if (!d) { try { d = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return false; } }
  if (!d || (d.v !== 1 && d.v !== 2 && d.v !== 3)) return false;
  try {
    resetGameBlank(d.diffKey);
    for (const k of d.water) water[k] = 1;
    for (const k of d.road) road[k] = 1;
    if (d.links) for (const [k, m] of d.links) lnk[k] = m; else legacyLinks();
    for (const [k, s] of d.sign) sign[k] = s;
    for (const [k, s] of d.special) special[k] = s;
    if (d.lights) for (const [k, a, b] of d.lights) if (special[k] === 'light') { setLightQ(k, 0, a); setLightQ(k, 1, b); }
    if (d.oneway) for (const [k, dir] of d.oneway) if (onewayDir && road[k]) onewayDir[k] = dir;
    score = d.score; week = d.week; weekTimer = d.weekTimer; span = d.span; org = Math.floor((MAXD - span) / 2); camSpan = span; camOrg = org;
    houseTimer = d.houseTimer; storeTimer = d.storeTimer; clock = d.clock; keepLeft = d.keepLeft; laneSign = keepLeft ? -1 : 1;
    inv = d.inv; perks = Object.assign({}, PERK_DEFAULTS, d.perks); carCapacity = d.carCapacity;
    money = d.money !== undefined ? d.money : Math.max(0, CFG.startMoney + DIFF.cash);
    d.buildings.forEach(o => {
      const b = {k: o.k, type: o.type, color: o.color, pins: o.pins, claimed: 0, timer: o.timer || 0,
                 tier: o.tier !== undefined ? o.tier : (o.big ? 1 : 0), cars: [], carsN: 0, park: 0, contract: null,
                 docks: [], served: 0, acc: -1, face: 0, pref: o.pref === undefined ? -1 : o.pref, unreach: 0, born: 0, pinTimer: rnd(3, 9), lvl: o.lvl || 0, trucks: 0,
                 evolveTimer: rnd(CFG.storeEvolveCheckMin, CFG.storeEvolveCheckMax)};
      bAt[b.k] = buildings.length; buildings.push(b);
    });
    d.parks.forEach(p => { parks.push({k: p.k, b: p.b, face: 0}); parkAt[p.k] = parks.length - 1; buildings[p.b].park++; });
    d.depots.forEach((k, i) => { depots.push({k, cap: CFG.depotCapacity, slots: [], res: 0, acc: -1, face: 0, pref: d.dprefs && d.dprefs[i] !== undefined ? d.dprefs[i] : -1}); depotAt[k] = depots.length - 1; });
    d.motorways.forEach(m => motorways.push({id: ++motoSeq, a: m.a, b: m.b, len: m.len}));
    linkBuildings();
    carsBought = d.carsBought | 0;
    d.buildings.forEach((o, i) => {
      if (o.type !== 'house') return;
      buildings[i].extra = clamp(o.extra | 0, 0, CFG.carBuyExtraMax);
      o.vans.forEach((v, j) => {
        const c = addCar(i); c.van = !!v;
        const u = o.ups && o.ups[j];
        if (u) { c.up = {cap: clamp(u[0] | 0, 0, CAR_UP.cap.max), spd: clamp(u[1] | 0, 0, CAR_UP.spd.max), load: clamp(u[2] | 0, 0, CAR_UP.load.max)}; }
        syncCarLen(c);
      });
    });
    d.buildings.forEach((o, i) => { for (let t = 0; t < (o.trucks || 0); t++) { buildings[i].trucks++; makeTruck(i); } });
    rebuildNet();
    if (d.juncLvl) for (const [k, l, sp] of d.juncLvl) if (nodes[k]) { nodes[k].lvl = clamp(l | 0, 0, CFG.junctionUpgradeMax); nodes[k].spent = +sp || 0; }
    for (const c of cars) { const p = parkedPose(c); c.x = p.x; c.y = p.y; c.ang = p.a; }
    goalsDone = new Set(d.goals || []);
    Object.assign(stats, d.stats || {});
    rush = {t: Math.max(0, +d.rushT || 0)};
    const rt = Math.max(0, +d.rainT || 0); rain = {t: rt, amt: rt > 0 ? 1 : 0};
    breakdownTimer = isFinite(d.breakdownTimer) ? d.breakdownTimer : 30;
    closed = new Map((d.closures || []).filter(p => Array.isArray(p) && road[p[0]] && p[1] > 0).map(p => [p[0], +p[1]]));
    stats.runHist = (d.runHist || []).map(p => ({t: p[0], jam: p[1], rate: p[2]}));
    stats.runStep = d.runStep > 0 ? d.runStep : 5; stats.runNext = clock + stats.runStep;
    stats.weekMarks = d.weekMarks || [];
    camReset(true); closeInspector(); setTool('select'); refreshUI(); renderGoals();
    return true;
  } catch (e) { return false; }
}
function resetGameBlank(dk) {
  tutorialMode = false;
  setTutorialUI(false);
  DIFF = DIFFS[dk] || DIFFS.standard; diffKey = dk in DIFFS ? dk : 'standard'; best = bestFor(diffKey);
  water = new Uint8Array(N); road = new Uint8Array(N); lnk = new Uint8Array(N);
  sign = new Array(N).fill(null); special = new Array(N).fill(null);
  bAt = new Int32Array(N).fill(-1); parkAt = new Int32Array(N).fill(-1); depotAt = new Int32Array(N).fill(-1);
  onewayDir = new Int8Array(N).fill(-1);
  nodes = []; nodeList = []; edges = []; edgeMap = new Map(); buildings = []; cars = []; motorways = []; parks = []; depots = [];
  motoSeq = 0; carSeq = 0; running = true; speed = 1; over = false; started = true; money = 0; trucks = [];
  rush = {t: 0}; rain = {t: 0, amt: 0}; breakdownTimer = 30; undoStack = []; redoStack = [];
  closed = new Map(); closureTimer = 60; rerouteN = 0; ambs = []; ambTimer = 60; sel = null; follow = false; motoPick = -1;
  contractTimer = CFG.contractSeconds; cityStressClock = 0;
  stats = freshStats(); fx.length = 0; lightClock = 0; lightQ.clear();
}

/* ---------------------------------------------------------------------
   5. RENDERING — a flat, top-down canvas.
   --------------------------------------------------------------------- */
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
let W = 900, H = 700, dpr = 1;
const cam = {x: 0, y: 0, z: 1, auto: true};
const insets = {l: 0, r: 0, t: 0, b: 0};
let theme = 'light', animT = 0, showHeat = false, showGrid = false, nightOn = true, fxOn = true;
let fx = [];

const PALS = {
  light: {land: '#dde5cf', land2: '#d4dec4', check: 'rgba(255,255,255,.28)', water: '#9dc9df', foam: '#cfe9f4', wave: 'rgba(255,255,255,.55)',
          road: '#fbfaf5', roadWet: '#e6ebea', edge: '#33424d', lane: '#e2b022', stop: 'rgba(51,66,77,.5)', shadow: 'rgba(24,44,34,.14)',
          grid: 'rgba(30,60,40,.07)', tree1: '#79b26f', tree2: '#5f9a5b', treeSh: 'rgba(24,52,34,.2)', pave: '#cbc9bd', asphalt: '#66727b',
          outside: 'rgba(28,48,58,.32)', deck: '#2c62a8', deckEdge: '#0f3566', stone: '#8b8d86', grass: '#a9cf95', roofBase: '#e9e6dc', ink: '#16303c', night: [12, 22, 52]},
  dark:  {land: '#23322f', land2: '#1f2d2b', check: 'rgba(255,255,255,.03)', water: '#1c4458', foam: '#2c6178', wave: 'rgba(160,210,235,.22)',
          road: '#4a565f', roadWet: '#3c474f', edge: '#141c21', lane: '#c9a12a', stop: 'rgba(230,240,245,.35)', shadow: 'rgba(0,0,0,.28)',
          grid: 'rgba(255,255,255,.05)', tree1: '#3c6b4a', tree2: '#2f5a3e', treeSh: 'rgba(0,0,0,.3)', pave: '#55605f', asphalt: '#39444b',
          outside: 'rgba(4,10,14,.5)', deck: '#2a5896', deckEdge: '#0c2a52', stone: '#66696a', grass: '#3f6b48', roofBase: '#77807e', ink: '#e8f0f2', night: [6, 12, 34]}
};
let PAL = PALS.light;
function setTheme(t) {
  theme = t; PAL = PALS[t];
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('junction2-theme', t); } catch (e) {}
}

/* --------------------------------------------------------------- colour */
function rgbOf(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
function shade(hex, f) {
  const [r, g, b] = rgbOf(hex);
  const t = f < 0 ? 0 : 255, p = Math.abs(f);
  return 'rgb(' + Math.round(lerp(r, t, p)) + ',' + Math.round(lerp(g, t, p)) + ',' + Math.round(lerp(b, t, p)) + ')';
}
function rgba(hex, a) { const [r, g, b] = rgbOf(hex); return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; }
function rr(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
}
function glyph(g, x, y, r, col) {
  ctx.fillStyle = col; ctx.beginPath();
  if (g === 0) ctx.arc(x, y, r, 0, Math.PI * 2);
  else if (g === 1) ctx.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
  else if (g === 2) { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r * 0.8); ctx.lineTo(x - r, y + r * 0.8); ctx.closePath(); }
  else if (g === 3) { ctx.moveTo(x, y - r * 1.1); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r * 1.1); ctx.lineTo(x - r, y); ctx.closePath(); }
  else if (g === 4) { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.45 : r * 1.1; ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); } ctx.closePath(); }
  else { for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); }
  ctx.fill();
}

/* --------------------------------------------------------------- camera */
function usable() {
  const w = Math.max(200, W - insets.l - insets.r), h = Math.max(200, H - insets.t - insets.b);
  return {w, h, cx: insets.l + w / 2, cy: insets.t + h / 2};
}
function camTarget() {
  const u = usable(), size = (camSpan + 2.4) * CELL;
  const z = clamp(Math.min(u.w / size, u.h / size), CFG.zoomMin, CFG.zoomMax);
  const wx = (camOrg + camSpan / 2) * CELL, wy = (camOrg + camSpan / 2) * CELL;
  return {z, x: wx + (W / 2 - u.cx) / z, y: wy + (H / 2 - u.cy) / z};
}
function camReset(instant) {
  cam.auto = true; follow = false;
  if (instant) { const t = camTarget(); cam.x = t.x; cam.y = t.y; cam.z = t.z; }
}
function camUpdate(dt) {
  const camCalm = DIFF.calm ? 0.6 : 1;
  if (follow && sel && sel.type === 'car' && cars.includes(sel.ref)) {
    const c = sel.ref, u = usable();
    cam.z += (clamp(2.2, CFG.zoomMin, CFG.zoomMax) - cam.z) * Math.min(1, dt * CFG.camZoomEase * camCalm);
    cam.x += (c.x + (W / 2 - u.cx) / cam.z - cam.x) * Math.min(1, dt * CFG.camChaseEase * camCalm);
    cam.y += (c.y + (H / 2 - u.cy) / cam.z - cam.y) * Math.min(1, dt * CFG.camChaseEase * camCalm);
    return;
  }
  if (cam.auto) {
    const t = camTarget(), k = Math.min(1, dt * CFG.camFollowEase * camCalm);
    cam.x += (t.x - cam.x) * k; cam.y += (t.y - cam.y) * k; cam.z += (t.z - cam.z) * k;
  }
}
function toWorld(sx, sy) { return {x: (sx - W / 2) / cam.z + cam.x, y: (sy - H / 2) / cam.z + cam.y}; }
function cellAt(sx, sy) {
  const p = toWorld(sx, sy), c = Math.floor(p.x / CELL), r = Math.floor(p.y / CELL);
  return (c < 0 || r < 0 || c >= COLS || r >= ROWS) ? -1 : idx(c, r);
}
function viewRect() {
  const a = toWorld(0, 0), b = toWorld(W, H);
  return {x0: a.x, y0: a.y, x1: b.x, y1: b.y,
          c0: Math.max(0, Math.floor(a.x / CELL) - 1), r0: Math.max(0, Math.floor(a.y / CELL) - 1),
          c1: Math.min(COLS - 1, Math.ceil(b.x / CELL) + 1), r1: Math.min(ROWS - 1, Math.ceil(b.y / CELL) + 1)};
}

/* ----------------------------------------------------- day and night */
function dayPhase() { return ((clock / CFG.dayLengthSeconds) % 1 + 1) % 1; }
function nightAmount() {
  if (!nightOn) return 0;
  const p = dayPhase();                            // 0 noon → 0.5 midnight
  const d = 0.5 - 0.5 * Math.cos(p * Math.PI * 2);
  return clamp((d - 0.38) / 0.4, 0, 1);
}
function clockText() {
  const h = ((dayPhase() * 24 + 12) % 24);
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
}

/* ----------------------------------------------------------- road paths */
let pathCache = {ver: -1};
function buildPaths() {
  const P = {ver: netVer, all: new Path2D(), dash: new Path2D(), bridge: new Path2D(), disc: new Path2D(), stop: new Path2D(),
             moto: new Path2D(), motoDash: new Path2D(), pillars: new Path2D(), drive: new Path2D()};
  const RW = CFG.roadWidth;
  for (const nd of nodeList) {
    const k = nd.k, x = tx(k), y = ty(k);
    P.all.moveTo(x, y); P.all.lineTo(x, y);
    if (nd.junction) { P.disc.moveTo(x + RW * 0.62, y); P.disc.arc(x, y, RW * 0.62, 0, Math.PI * 2); }
    for (let d = 0; d < 8; d++) {
      if (!linked(k, d)) continue;
      const n = nbr(k, d);
      if (k < n) {
        const nx = tx(n), ny = ty(n);
        P.all.moveTo(x, y); P.all.lineTo(nx, ny);
        if (water[k] || water[n]) { P.bridge.moveTo(x, y); P.bridge.lineTo(nx, ny); }
        const L = Math.hypot(nx - x, ny - y), ux = (nx - x) / L, uy = (ny - y) / L;
        const ia = nd.junction ? CELL * 0.3 + 2 : 0, ib = nodes[n].junction ? CELL * 0.3 + 2 : 0;
        if (L - ia - ib > 4) { P.dash.moveTo(x + ux * ia, y + uy * ia); P.dash.lineTo(nx - ux * ib, ny - uy * ib); }
      }
    }
    if (nd.type === 'yield' || nd.type === 'light') {
      for (const e of nd.ins) {
        const o = CFG.laneOffset * laneSign;
        const sx = e.ax + e.ux * (e.stop + 2) + e.nx * o, sy = e.ay + e.uy * (e.stop + 2) + e.ny * o;
        P.stop.moveTo(sx - e.nx * 4.6, sy - e.ny * 4.6); P.stop.lineTo(sx + e.nx * 4.6, sy + e.ny * 4.6);
      }
    }
  }
  const conn = (k, acc) => { if (acc >= 0) { P.drive.moveTo(tx(k), ty(k)); P.drive.lineTo(tx(acc), ty(acc)); } };
  for (const b of buildings) conn(b.k, b.acc);
  for (const dp of depots) conn(dp.k, dp.acc);
  for (const m of motorways) {
    const ax = tx(m.a), ay = ty(m.a), bx = tx(m.b), by = ty(m.b);
    P.moto.moveTo(ax, ay); P.moto.lineTo(bx, by);
    const L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L;
    P.motoDash.moveTo(ax + ux * 14, ay + uy * 14); P.motoDash.lineTo(bx - ux * 14, by - uy * 14);
    for (let s = 40; s < L - 30; s += 64) { P.pillars.moveTo(ax + ux * s + 1.8, ay + uy * s); P.pillars.arc(ax + ux * s, ay + uy * s, 1.8, 0, Math.PI * 2); }
  }
  pathCache = P;
}

/* -------------------------------------------------------------- ground */
function drawGround(vr) {
  ctx.fillStyle = PAL.land; ctx.fillRect(vr.x0, vr.y0, vr.x1 - vr.x0, vr.y1 - vr.y0);
  const x0 = camOrg * CELL, y0 = camOrg * CELL, sz = camSpan * CELL;
  ctx.fillStyle = PAL.land2; ctx.fillRect(x0, y0, sz, sz);
  if (cam.z > 0.7) {
    ctx.fillStyle = PAL.check;
    for (let r = vr.r0; r <= vr.r1; r++) for (let c = vr.c0; c <= vr.c1; c++) {
      if (((c + r) & 1) && c >= camOrg && r >= camOrg && c < camOrg + camSpan && r < camOrg + camSpan) ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
    }
  }
  // water
  ctx.fillStyle = PAL.water;
  for (let r = vr.r0; r <= vr.r1; r++) for (let c = vr.c0; c <= vr.c1; c++) if (water[idx(c, r)]) ctx.fillRect(c * CELL - 0.4, r * CELL - 0.4, CELL + 0.8, CELL + 0.8);
  ctx.strokeStyle = PAL.foam; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let r = vr.r0; r <= vr.r1; r++) for (let c = vr.c0; c <= vr.c1; c++) {
    const k = idx(c, r); if (!water[k]) continue;
    const X = c * CELL, Y = r * CELL;
    if (c > 0 && !water[k - 1]) { ctx.moveTo(X + 1, Y); ctx.lineTo(X + 1, Y + CELL); }
    if (c < COLS - 1 && !water[k + 1]) { ctx.moveTo(X + CELL - 1, Y); ctx.lineTo(X + CELL - 1, Y + CELL); }
    if (r > 0 && !water[k - COLS]) { ctx.moveTo(X, Y + 1); ctx.lineTo(X + CELL, Y + 1); }
    if (r < ROWS - 1 && !water[k + COLS]) { ctx.moveTo(X, Y + CELL - 1); ctx.lineTo(X + CELL, Y + CELL - 1); }
  }
  ctx.stroke();
  if (cam.z > 0.6) {
    ctx.strokeStyle = PAL.wave; ctx.lineWidth = 1.3; ctx.beginPath();
    for (let r = vr.r0; r <= vr.r1; r++) for (let c = vr.c0; c <= vr.c1; c++) {
      const k = idx(c, r); if (!water[k] || hash01(k, 9) > 0.45) continue;
      const X = c * CELL + 6 + hash01(k, 4) * 8, Y = r * CELL + 8 + hash01(k, 5) * 14, ph = animT * 0.9 + hash01(k, 6) * 6;
      ctx.moveTo(X, Y + Math.sin(ph) * 1.2);
      ctx.quadraticCurveTo(X + 5, Y - 3 + Math.sin(ph + 1) * 1.2, X + 10, Y + Math.sin(ph + 2) * 1.2);
    }
    ctx.stroke();
  }
  if (showGrid) {
    ctx.strokeStyle = PAL.grid; ctx.lineWidth = 1 / cam.z; ctx.beginPath();
    for (let c = vr.c0; c <= vr.c1 + 1; c++) { ctx.moveTo(c * CELL, vr.r0 * CELL); ctx.lineTo(c * CELL, (vr.r1 + 1) * CELL); }
    for (let r = vr.r0; r <= vr.r1 + 1; r++) { ctx.moveTo(vr.c0 * CELL, r * CELL); ctx.lineTo((vr.c1 + 1) * CELL, r * CELL); }
    ctx.stroke();
  }
}
function drawOutside(vr) {
  const x0 = camOrg * CELL, y0 = camOrg * CELL, sz = camSpan * CELL;
  ctx.fillStyle = PAL.outside;
  ctx.fillRect(vr.x0, vr.y0, vr.x1 - vr.x0, y0 - vr.y0);
  ctx.fillRect(vr.x0, y0 + sz, vr.x1 - vr.x0, vr.y1 - y0 - sz);
  ctx.fillRect(vr.x0, y0, x0 - vr.x0, sz);
  ctx.fillRect(x0 + sz, y0, vr.x1 - x0 - sz, sz);
  ctx.strokeStyle = theme === 'dark' ? 'rgba(255,255,255,.35)' : 'rgba(22,48,60,.5)';
  ctx.lineWidth = 1.6 / cam.z; ctx.setLineDash([6 / cam.z, 5 / cam.z]);
  ctx.strokeRect(x0, y0, sz, sz); ctx.setLineDash([]);
}
function drawTrees(vr) {
  for (let r = vr.r0; r <= vr.r1; r++) for (let c = vr.c0; c <= vr.c1; c++) {
    const k = idx(c, r);
    if (water[k] || occupied(k) || hash01(k, 1) > CFG.treeDensity) continue;
    let ok = true;
    for (let d = 0; d < 8 && ok; d++) { const n = nbr(k, d); if (n >= 0 && (road[n] || bAt[n] >= 0 || parkAt[n] >= 0 || depotAt[n] >= 0)) ok = false; }
    if (!ok) continue;
    const X = (c + 0.5 + (hash01(k, 2) - 0.5) * 0.4) * CELL, Y = (r + 0.5 + (hash01(k, 7) - 0.5) * 0.4) * CELL, R = 6 + hash01(k, 8) * 4;
    const sway = Math.sin(animT * 0.8 + k) * 0.35;
    ctx.fillStyle = PAL.treeSh; ctx.beginPath(); ctx.arc(X + 2.5, Y + 3.5, R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PAL.tree2; ctx.beginPath(); ctx.arc(X + sway, Y, R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PAL.tree1; ctx.beginPath(); ctx.arc(X - R * 0.22 + sway, Y - R * 0.25, R * 0.66, 0, Math.PI * 2); ctx.fill();
  }
}

/* --------------------------------------------------------------- roads */
function drawRoads() {
  if (pathCache.ver !== netVer) buildPaths();
  const P = pathCache, RW = CFG.roadWidth, wet = rain.amt;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // shadow
  ctx.save(); ctx.translate(0, 1.6); ctx.strokeStyle = PAL.shadow; ctx.lineWidth = RW + 3; ctx.stroke(P.all); ctx.restore();
  // bridge parapets
  ctx.strokeStyle = PAL.stone; ctx.lineWidth = RW + 7; ctx.stroke(P.bridge);
  // motorway deck
  if (motorways.length) {
    ctx.save(); ctx.translate(0, 4); ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 17; ctx.stroke(P.moto); ctx.restore();
  }
  ctx.strokeStyle = PAL.edge; ctx.lineWidth = RW + 3.4; ctx.stroke(P.all);
  ctx.lineCap = 'butt'; ctx.lineWidth = CFG.driveWidth + 3.4; ctx.stroke(P.drive); ctx.lineCap = 'round';   // driveways: building door to road
  ctx.fillStyle = PAL.edge;
  ctx.save(); ctx.lineWidth = 3.4; ctx.strokeStyle = PAL.edge; ctx.stroke(P.disc); ctx.restore();
  ctx.strokeStyle = wet > 0.2 ? PAL.roadWet : PAL.road; ctx.lineWidth = RW; ctx.stroke(P.all);
  ctx.fillStyle = wet > 0.2 ? PAL.roadWet : PAL.road; ctx.fill(P.disc);
  ctx.lineCap = 'butt'; ctx.lineWidth = CFG.driveWidth; ctx.stroke(P.drive); ctx.lineCap = 'round';
  ctx.strokeStyle = PAL.lane; ctx.lineWidth = 1.3; ctx.setLineDash([4.5, 5]); ctx.globalAlpha = 0.85; ctx.stroke(P.dash);
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  ctx.strokeStyle = PAL.stop; ctx.lineWidth = 1.8; ctx.lineCap = 'butt'; ctx.stroke(P.stop); ctx.lineCap = 'round';
  if (motorways.length) {
    ctx.strokeStyle = PAL.deckEdge; ctx.lineWidth = 15; ctx.stroke(P.moto);
    ctx.strokeStyle = PAL.deck; ctx.lineWidth = 12.6; ctx.stroke(P.moto);
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.4; ctx.setLineDash([7, 6]); ctx.stroke(P.motoDash); ctx.setLineDash([]);
    ctx.fillStyle = PAL.deckEdge; ctx.fill(P.pillars);
  }
  // unlinked road stubs and bridges' little posts are implicit in the passes above
}

/* --------------------------------------------------- junction furniture */
function drawSignIcon(kind, x, y, R) {
  const only = kind.startsWith('only'), dir = kind.endsWith('left') ? -1 : kind.endsWith('right') ? 1 : 0;
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fillStyle = only ? '#1b57b0' : '#ffffff'; ctx.fill();
  if (!only) { ctx.lineWidth = R * 0.24; ctx.strokeStyle = '#c8362c'; ctx.stroke(); }
  ctx.strokeStyle = only ? '#fff' : '#16202b'; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = R * 0.2; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
  ctx.beginPath();
  if (dir === 0) {
    ctx.moveTo(0, R * 0.5); ctx.lineTo(0, -R * 0.15); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -R * 0.55); ctx.lineTo(R * 0.3, -R * 0.1); ctx.lineTo(-R * 0.3, -R * 0.1); ctx.closePath(); ctx.fill();
  } else {
    ctx.moveTo(-dir * R * 0.05, R * 0.5); ctx.lineTo(-dir * R * 0.05, -R * 0.05); ctx.lineTo(dir * R * 0.2, -R * 0.05); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(dir * R * 0.58, -R * 0.05); ctx.lineTo(dir * R * 0.2, R * 0.27); ctx.lineTo(dir * R * 0.2, -R * 0.37); ctx.closePath(); ctx.fill();
  }
  if (!only) { ctx.strokeStyle = '#c8362c'; ctx.lineWidth = R * 0.2; ctx.beginPath(); ctx.moveTo(-R * 0.62, R * 0.62); ctx.lineTo(R * 0.62, -R * 0.62); ctx.stroke(); }
  ctx.restore();
}
function drawJunctionFurniture(vr) {
  for (const nd of nodeList) {
    const x = tx(nd.k), y = ty(nd.k);
    if (x < vr.x0 - 40 || x > vr.x1 + 40 || y < vr.y0 - 40 || y > vr.y1 + 40) continue;
    if (nd.type === 'round') {
      // Mini Motorways style: one flat road-coloured disc, a flat island the colour of the ground,
      // and a single fixed dashed lane ring
      const R = 15, IR = 6.2, wet = rain.amt > 0.2;
      ctx.fillStyle = PAL.shadow; ctx.beginPath(); ctx.arc(x + 0.8, y + 1.4, R, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = wet ? PAL.roadWet : PAL.road; ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PAL.land; ctx.beginPath(); ctx.arc(x, y, IR, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = PAL.stop; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(x, y, IR, 0, Math.PI * 2); ctx.stroke();
      ctx.save(); ctx.translate(x, y);
      ctx.strokeStyle = PAL.lane; ctx.globalAlpha = 0.75; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
      ctx.setLineDash([2.6, 3.4]); ctx.beginPath(); ctx.arc(0, 0, (R + IR) / 2, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]); ctx.restore(); ctx.globalAlpha = 1;
    }
    if (nd.type === 'light') {
      const ls = lightState(nd);
      const heads = [[-11, -11, 0], [11, 11, 0], [11, -11, 1], [-11, 11, 1]];
      for (const [hx, hy, g] of heads) {
        rr(x + hx - 2.6, y + hy - 2.6, 5.2, 5.2, 1.6); ctx.fillStyle = '#1a242b'; ctx.fill();
        const green = !ls.allRed && ls.ph === g;
        ctx.fillStyle = green ? '#48e08a' : '#ff5a4a';
        ctx.beginPath(); ctx.arc(x + hx, y + hy, 1.7, 0, Math.PI * 2); ctx.fill();
        if (nd.ldem[g] > 0) {                                   // the sensor sees a car on this side
          ctx.strokeStyle = 'rgba(96,200,255,' + (0.55 + 0.35 * Math.sin(animT * 7)).toFixed(2) + ')'; ctx.lineWidth = 0.9;
          ctx.beginPath(); ctx.arc(x + hx, y + hy, 4.3, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }
    if (nd.lvl > 0 && nd.junction) {
      ctx.strokeStyle = 'rgba(255,201,51,.85)'; ctx.lineWidth = 0.9 + 0.7 * nd.lvl;
      ctx.beginPath(); ctx.arc(x, y, 16.8, 0, Math.PI * 2); ctx.stroke();
    }
    if (sign[nd.k]) {
      ctx.fillStyle = '#5c666d'; ctx.fillRect(x + 8.3, y - 9.5, 1.4, 6);
      drawSignIcon(sign[nd.k], x + 9, y - 11, 5.2);
    }
    if (nd.junction && cam.z > 1.3 && nd.type === 'yield') {
      // little give-way chevron dots at the corners hint at the stop rule
    }
  }
}

/* ------------------------------------------------------------ buildings */
function drawLot(p) {
  const x = tx(p.k), y = ty(p.k), b = buildings[p.b], col = b ? COLORS[b.color].hex : '#888';
  ctx.save(); ctx.translate(x, y); ctx.rotate(p.face || 0);
  rr(-13 + 1.5, -13 + 2, 26, 26, 3); ctx.fillStyle = PAL.shadow; ctx.fill();
  rr(-13, -13, 26, 26, 3); ctx.fillStyle = PAL.asphalt; ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 2; rr(-13, -13, 26, 26, 3); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(0, 9); ctx.moveTo(-12, -9); ctx.lineTo(-12, 9); ctx.moveTo(12, -9); ctx.lineTo(12, 9); ctx.stroke();
  ctx.restore();
}
function drawDepot(d) {
  const x = tx(d.k), y = ty(d.k);
  ctx.save(); ctx.translate(x, y); ctx.rotate(d.face || 0);
  rr(-13 + 1.5, -13 + 2, 26, 26, 4); ctx.fillStyle = PAL.shadow; ctx.fill();
  rr(-13, -13, 26, 26, 4); ctx.fillStyle = theme === 'dark' ? '#2f4a63' : '#5d7e9d'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, 12); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.stroke();
  rr(-13, -13, 26, 26, 4); ctx.lineWidth = 1.6; ctx.strokeStyle = '#eaf3fa'; ctx.stroke();
  ctx.restore();
  // "P" plate stays upright
  rr(x + 6, y - 15, 9, 9, 2); ctx.fillStyle = '#1b57b0'; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '700 7.5px Overpass, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('P', x + 10.5, y - 10.3);
  const used = d.slots.length + d.res;
  if (used > 0 || cam.z > 1.4) {
    ctx.fillStyle = 'rgba(10,25,35,.75)'; rr(x - 9, y + 12, 18, 7, 3); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '600 5.5px Overpass, system-ui, sans-serif'; ctx.fillText(d.slots.length + '/' + d.cap, x, y + 15.7);
  }
}
const REDUCED_MOTION = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
/* buildings pop in with a small overshoot when they appear (visual only; bornAnim never touches the simulation) */
function spawnScale(b) {
  if (b.bornAnim === undefined || REDUCED_MOTION) return 1;
  const t = clamp((animT - b.bornAnim) / 0.45, 0, 1); if (t >= 1) return 1;
  const k = 1.70158; return 1 + (k + 1) * Math.pow(t - 1, 3) + k * Math.pow(t - 1, 2);
}
/* shared helper: a rectangle split into two roof planes along its ridge */
function gable(x, y, w, h, col) {
  rr(x, y, w, h, 1.6); ctx.fillStyle = shade(col, -0.12); ctx.fill();
  ctx.save(); rr(x, y, w, h, 1.6); ctx.clip();
  ctx.fillStyle = shade(col, 0.14); ctx.fillRect(x, y, w, h / 2);
  ctx.fillStyle = 'rgba(0,0,0,.08)'; for (let i = 1; i < 4; i++) { ctx.fillRect(x, y + h * i / 8, w, 0.3); ctx.fillRect(x, y + h / 2 + h * i / 8, w, 0.3); }   // tile courses
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(x, y + h / 2 - 0.3, w, 0.6);
}
/* four-plane hipped roof seen from above */
function hipRoof(x, y, w, h, col) {
  const cx0 = x + h / 2, cx1 = x + w - h / 2, my = y + h / 2;
  ctx.fillStyle = shade(col, 0.16); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(cx1, my); ctx.lineTo(cx0, my); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(col, -0.16); ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(cx1, my); ctx.lineTo(cx0, my); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(col, 0.02); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(cx0, my); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(cx1, my); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(cx0, my); ctx.lineTo(cx1, my); ctx.stroke();
}
function win(x, y, w, h) { ctx.fillStyle = 'rgba(24,44,58,.7)'; ctx.fillRect(x, y, w, h); ctx.fillStyle = 'rgba(160,210,240,.3)'; ctx.fillRect(x + 0.3, y + 0.3, w * 0.3, h - 0.6); }
/* Houses grow with the cars bought for them: cottage (none), family home with a garage (one), villa (two). */
function drawHouse(b) {
  const x = tx(b.k), y = ty(b.k), col = COLORS[b.color].hex, s = spawnScale(b), model = Math.min(2, b.extra || 0);
  ctx.save(); ctx.translate(x, y); ctx.rotate(b.face || 0); ctx.scale(s, s);
  rr(-12.5, 2.5, 25, 13.5, 3); ctx.fillStyle = PAL.pave; ctx.fill();                              // forecourt
  const nHome = CFG.carsPerHouse + (b.extra || 0), xs = nHome >= 4 ? [-9, -3, 3, 9] : nHome === 3 ? [-8, 0, 8] : [-6, 6];
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 0.6;
  for (const lx of xs) { rr(lx - 2.9, 5, 5.8, 9.4, 1); ctx.stroke(); }
  if (model === 0) {
    // cottage: small gabled house, garden hedge, chimney
    rr(-9 + 1.2, -12 + 2, 18, 15.5, 2.6); ctx.fillStyle = PAL.shadow; ctx.fill();
    rr(-9, -12, 18, 15.5, 2.6); ctx.fillStyle = PAL.roofBase; ctx.fill();
    gable(-9, -12, 18, 12, col);
    ctx.fillStyle = '#4a4f54'; ctx.fillRect(3.5, -10.6, 2.6, 2.6);                                      // chimney
    win(-6.6, 0.8, 2.8, 1.8); win(3.8, 0.8, 2.8, 1.8);
    rr(-1.5, 0.2, 3, 3.3, 0.6); ctx.fillStyle = shade(col, -0.45); ctx.fill();
    ctx.fillStyle = PAL.tree1; rr(-12, -12, 2.2, 15.5, 1.1); ctx.fill(); rr(9.8, -12, 2.2, 15.5, 1.1); ctx.fill();   // hedges
    if (showSymbols) glyph(COLORS[b.color].glyph, 0, -6, 2.5, 'rgba(255,255,255,.92)');
  } else if (model === 1) {
    // family home: gabled main house plus a flat-roofed garage wing with its own door
    rr(-11.5 + 1.2, -13 + 2, 23, 16.5, 2.6); ctx.fillStyle = PAL.shadow; ctx.fill();
    rr(-11.5, -13, 14.5, 16.5, 2.6); ctx.fillStyle = PAL.roofBase; ctx.fill();
    gable(-11.5, -13, 14.5, 13, col);
    rr(3.4, -8.5, 8.1, 12, 1.4); ctx.fillStyle = shade(PAL.roofBase, -0.08); ctx.fill();            // garage block
    ctx.fillStyle = shade(col, -0.25); ctx.fillRect(3.4, -8.5, 8.1, 1.2);                               // garage roof trim
    ctx.fillStyle = shade(col, -0.4); ctx.fillRect(4.6, -0.6, 5.8, 4);                                   // garage door
    ctx.fillStyle = 'rgba(255,255,255,.25)'; for (let i = 0; i < 3; i++) ctx.fillRect(4.6, 0 + i * 1.2, 5.8, 0.3);
    win(-9.2, 0.8, 2.6, 1.8); win(-2.2, 0.8, 2.6, 1.8);
    rr(-5.9, 0.2, 2.8, 3.3, 0.6); ctx.fillStyle = shade(col, -0.45); ctx.fill();
    if (showSymbols) glyph(COLORS[b.color].glyph, -4.2, -6.5, 2.5, 'rgba(255,255,255,.92)');
  } else {
    // villa: wide hipped roof, solar panels, balcony and a porch
    rr(-11.5 + 1.2, -13.5 + 2, 23, 17, 2.6); ctx.fillStyle = PAL.shadow; ctx.fill();
    rr(-11.5, -13.5, 23, 17, 2.6); ctx.fillStyle = PAL.roofBase; ctx.fill();
    hipRoof(-11.5, -13.5, 23, 13.2, col);
    ctx.fillStyle = '#1f3552'; ctx.strokeStyle = 'rgba(160,200,240,.5)'; ctx.lineWidth = 0.3;
    for (let i = 0; i < 3; i++) { ctx.fillRect(-7 + i * 3.2, -12.4, 2.8, 4.2); ctx.strokeRect(-7 + i * 3.2, -12.4, 2.8, 4.2); }   // solar
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillRect(-4.5, -0.9, 9, 0.7);                           // balcony rail
    win(-9.6, 0.6, 2.4, 2); win(-6.3, 0.6, 2.4, 2); win(3.9, 0.6, 2.4, 2); win(7.2, 0.6, 2.4, 2);
    rr(-2.2, 0, 4.4, 3.5, 0.8); ctx.fillStyle = shade(col, -0.45); ctx.fill();                        // double door
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(-0.15, 0.2, 0.3, 3.2);
    if (showSymbols) glyph(COLORS[b.color].glyph, 6, -5, 2.4, 'rgba(255,255,255,.92)');
  }
  ctx.restore();
  if (b.acc < 0) drawUnlinked(x, y);
}
/* Stores change building with their tier (corner shop, supermarket, depot, distribution centre)
   and gain a rooftop sign, solar panels and flags with each paid upgrade level. */
const STORE_MODELS = ['Corner shop', 'Supermarket', 'Depot', 'Distribution centre'];
function rollerDoor(x, y, w, h, col) {
  ctx.fillStyle = shade(col, -0.4); ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,.22)'; for (let yy = y + 0.5; yy < y + h; yy += 0.8) ctx.fillRect(x, yy, w, 0.25);
}
function roofParcels(b, x0, y0, cols, rows) {
  const n = Math.min(b.pins, cols * rows);
  for (let i = 0; i < n; i++) {
    const px = x0 + (i % cols) * 4.9, py = y0 + Math.floor(i / cols) * 3.9;
    ctx.fillStyle = i % 2 ? '#d7a862' : '#e3b46a'; ctx.fillRect(px, py, 4.2, 3.2);
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(px + 1.8, py, 0.6, 3.2);
  }
}
function drawStore(b) {
  const x = tx(b.k), y = ty(b.k), col = COLORS[b.color].hex, tier = Math.min(3, b.tier || 0), lvl = b.lvl || 0, s = spawnScale(b);
  ctx.save(); ctx.translate(x, y); ctx.rotate(b.face || 0); ctx.scale(s, s);
  rr(-13.5, 2.5, 27, 13.5, 3); ctx.fillStyle = PAL.pave; ctx.fill();                              // yard
  for (const [lx, ly] of dockSpotsLocal(b)) {
    rr(lx - 5, ly - 6, 10, 12, 1.5); ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.fillStyle = 'rgba(255,200,40,.75)'; ctx.fillRect(lx - 4.4, ly - 5.6, 8.8, 0.8);
  }
  if (tier === 0) {
    // corner shop: small flat-roofed unit with a striped awning over its door
    rr(-10 + 1.3, -12 + 2, 20, 15, 2.6); ctx.fillStyle = PAL.shadow; ctx.fill();
    rr(-10, -12, 20, 15, 2.6); ctx.fillStyle = PAL.roofBase; ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(-9, -11, 18, 0.4);
    roofParcels(b, -9.4, -10.4, 4, 2);
    for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#fff' : col; ctx.fillRect(-10 + i * 2.5, 0, 2.5, 3.6); }   // awning
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(-10, 3.6, 20, 0.6);
    ctx.strokeStyle = col; ctx.lineWidth = 1.3; rr(-9.4, -11.4, 18.8, 14, 2.2); ctx.stroke();
    rollerDoor(-12.8, -3, 2.6, 5, col); rollerDoor(10.2, -3, 2.6, 5, col);                          // side goods doors to the docks
  } else {
    // supermarket, depot and distribution centre share the full plot with a fascia and two docks
    rr(-13 + 1.4, -15 + 2.2, 26, 19, 3.4); ctx.fillStyle = PAL.shadow; ctx.fill();
    rr(-13, -15, 26, 19, 3.4); ctx.fillStyle = tier === 3 ? shade(PAL.roofBase, -0.12) : PAL.roofBase; ctx.fill();
    ctx.save(); rr(-13, -15, 26, 19, 3.4); ctx.clip();
    if (tier === 2) {                                                                            // depot: sawtooth roof
      for (let i = 0; i < 6; i++) { ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.fillRect(-13 + i * 4.4, -15, 2.2, 15.4); ctx.fillStyle = 'rgba(170,215,240,.45)'; ctx.fillRect(-10.8 + i * 4.4, -15, 0.6, 15.4); }
    }
    if (tier === 3) {                                                                            // distribution centre: skylight grid
      ctx.fillStyle = 'rgba(170,215,240,.4)';
      for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) ctx.fillRect(-11.5 + i * 5, -13.6 + j * 4.4, 3, 1);
    }
    const fh = tier === 3 ? 4.6 : 3.6;
    ctx.fillStyle = col; ctx.fillRect(-13, 4 - fh, 26, fh);                                     // fascia
    rollerDoor(-10.4, 4 - fh + 0.5, 6.8, fh - 1, col); rollerDoor(3.6, 4 - fh + 0.5, 6.8, fh - 1, col);
    if (tier === 3) rollerDoor(-2.2, 4 - fh + 0.5, 4.4, fh - 1, col);
    ctx.restore();
    if (tier === 1) { ctx.fillStyle = '#9aa3a8'; ctx.fillRect(4, -13, 5.6, 3.6); ctx.fillRect(4, -8.6, 5.6, 2.6); ctx.fillStyle = '#6f777c'; ctx.beginPath(); ctx.arc(6.8, -11.2, 1.2, 0, 6.3); ctx.fill(); }   // rooftop plant
    if (tier === 3) { ctx.strokeStyle = '#5a646a'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(10.5, -13); ctx.lineTo(10.5, -17); ctx.stroke(); ctx.fillStyle = '#ff5a4a'; ctx.beginPath(); ctx.arc(10.5, -17, 0.8, 0, 6.3); ctx.fill(); }   // radio mast
    roofParcels(b, -10.6, -12.4, tier === 1 ? 3 : 4, 3);
    ctx.strokeStyle = col; ctx.lineWidth = 1.3 + tier * 0.8; rr(-12.4, -14.4, 24.8, 17.8, 3); ctx.stroke();
  }
  // paid upgrade levels: 1 rooftop sign, 2 solar panels, 3 flags and gold trim
  if (lvl >= 1) {
    const sx = tier === 0 ? 0 : -7.5, sy = tier === 0 ? -12.6 : -15;
    rr(sx - 4, sy - 1.6, 8, 3.2, 0.8); ctx.fillStyle = '#12303f'; ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 0.6; ctx.stroke();
    if (showSymbols) glyph(COLORS[b.color].glyph, sx, sy, 1.1, col); else { ctx.fillStyle = col; ctx.fillRect(sx - 2.6, sy - 0.45, 5.2, 0.9); }
  }
  if (lvl >= 2 && tier > 0) {
    ctx.fillStyle = '#1f3552'; ctx.strokeStyle = 'rgba(160,200,240,.5)'; ctx.lineWidth = 0.3;
    for (let i = 0; i < 3; i++) { ctx.fillRect(-11.5 + i * 3.3, -7.8, 3, 2.4); ctx.strokeRect(-11.5 + i * 3.3, -7.8, 3, 2.4); }
  }
  if (lvl >= 3) {
    const fx = tier === 0 ? [-10.8, 10.8] : [-13.4, 13.4];
    for (const px of fx) {
      ctx.strokeStyle = '#8a9296'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(px, 3); ctx.lineTo(px, -4); ctx.stroke();
      const wave = REDUCED_MOTION ? 0 : Math.sin(animT * 4 + px) * 0.6;
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(px, -4); ctx.lineTo(px + (px < 0 ? -3 : 3), -3.2 + wave); ctx.lineTo(px, -2.2); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = '#ffc933'; ctx.lineWidth = 0.6;
    if (tier === 0) rr(-10.4, -12.4, 20.8, 15.8, 2.8); else rr(-13.3, -15.3, 26.6, 19.6, 3.6);
    ctx.stroke();
  }
  for (let i = 0; i < tier; i++) {                                                            // tier chevrons on the fascia
    const cx = 10 - i * 3.4, cy = tier === 0 ? 1.2 : -1.9;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(cx - 1.4, cy + 0.9); ctx.lineTo(cx, cy - 0.7); ctx.lineTo(cx + 1.4, cy + 0.9);
    ctx.lineTo(cx + 1.4, cy + 1.8); ctx.lineTo(cx, cy + 0.2); ctx.lineTo(cx - 1.4, cy + 1.8); ctx.closePath(); ctx.fill();
  }
  if (tier > 0 && showSymbols) glyph(COLORS[b.color].glyph, 0, tier === 3 ? 1.3 : 2.2, 1.6, '#fff');
  ctx.restore();
  if (b.acc < 0) drawUnlinked(x, y);
}
/* above each house: one dot per parking spot, filled when that car is home, ringed when it is out */
function drawHouseBadge(b) {
  if (b.acc < 0) return;
  const x = tx(b.k), y = ty(b.k), col = COLORS[b.color].hex, cap = houseCap(b), s = clamp(0.95 / cam.z, 1, 2.4);
  const home = b.cars.filter(c => c.state === 'parked' && c.loc.t === 'home').length;
  ctx.save(); ctx.translate(x, y - 21 * s + 5 * (s - 1)); ctx.scale(s, s);
  const w = cap * 4.4 + 4;
  rr(-w / 2, -3.4, w, 6.8, 3.4); ctx.fillStyle = 'rgba(18,48,63,.82)'; ctx.fill();
  for (let i = 0; i < cap; i++) {
    const cx = -w / 2 + 4.2 + i * 4.4;
    ctx.beginPath(); ctx.arc(cx, 0, 1.45, 0, Math.PI * 2);
    if (i < home) { ctx.fillStyle = col; ctx.fill(); }
    else if (i < b.carsN) { ctx.strokeStyle = col; ctx.lineWidth = 0.9; ctx.stroke(); }
    else { ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fill(); }
  }
  ctx.restore();
}
/* stores overflowing off screen get an arrow pinned to the screen edge, pointing at them */
function drawOffscreenAlerts() {
  const al = buildings.filter(b => b.type === 'store' && b.timer > 0.05);
  if (!al.length) return;
  const lim = overflowLimit(), m = 30, top = 96;
  ctx.save();
  for (const b of al) {
    const sx = (tx(b.k) - cam.x) * cam.z + W / 2, sy = (ty(b.k) - cam.y) * cam.z + H / 2;
    if (sx > m && sx < W - m && sy > top && sy < H - m) continue;
    const cx = W / 2, cy = (H + top) / 2, dx = sx - cx, dy = sy - cy;
    const k = Math.min((W / 2 - m) / Math.max(1e-6, Math.abs(dx)), ((H - top) / 2 - m) / Math.max(1e-6, Math.abs(dy)));
    const px = cx + dx * k, py = cy + dy * k, a = Math.atan2(dy, dx), f = clamp(b.timer / lim, 0, 1);
    const pulse = REDUCED_MOTION ? 1 : 1 + 0.1 * Math.sin(animT * (4 + f * 8));
    ctx.setTransform(dpr, 0, 0, dpr, dpr * px, dpr * py);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(0, 1.5, 14 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = f > 0.66 ? '#d6342a' : '#e08a1e'; ctx.beginPath(); ctx.arc(0, 0, 14 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = COLORS[b.color].hex; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.rotate(a); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(19, 0); ctx.lineTo(12, -5); ctx.lineTo(12, 5); ctx.closePath(); ctx.fill();
    ctx.rotate(-a); ctx.fillStyle = '#fff'; ctx.font = '800 13px Overpass, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', 0, 1);
  }
  ctx.restore();
}
function dockSpotsLocal(s) {
  const out = [[-7, 10.5], [7, 10.5]];
  return out;
}
function drawUnlinked(x, y) {
  const pulse = 0.5 + 0.5 * Math.sin(animT * 4);
  ctx.strokeStyle = 'rgba(230,70,55,' + (0.5 + pulse * 0.4) + ')'; ctx.lineWidth = 1.6; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.arc(x, y, 19 + pulse * 2, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
}
function drawStoreBadge(b) {
  const x = tx(b.k), y = ty(b.k), col = COLORS[b.color].hex, cap = storeCap(b), lim = overflowLimit();
  const s = clamp(0.95 / cam.z, 1, 2.6);
  const over = b.pins > cap, frac = clamp(b.timer / lim, 0, 1);
  ctx.save(); ctx.translate(x, y - 25 * s + 6 * (s - 1)); ctx.scale(s, s);
  const label = b.pins + '/' + cap, w = 20 + (label.length > 3 ? 3 : 0);
  rr(-w / 2 + 0.6, -5.5 + 1.2, w, 11, 5.5); ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fill();
  rr(-w / 2, -5.5, w, 11, 5.5); ctx.fillStyle = over ? '#d6342a' : '#12303f'; ctx.fill();
  ctx.lineWidth = 1.4; ctx.strokeStyle = col; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = '700 7.2px Overpass, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, 0.4);
  ctx.restore();
  if (b.timer > 0.05) {
    ctx.save(); ctx.translate(x, y - 2); ctx.lineWidth = 3.2;
    ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.stroke();
    const pulse = frac > 0.7 ? 0.65 + 0.35 * Math.sin(animT * 9) : 1;
    ctx.strokeStyle = 'rgba(224,60,48,' + pulse + ')'; ctx.beginPath(); ctx.arc(0, 0, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke();
    ctx.restore();
  }
}
function drawBuildings(vr) {
  for (const p of parks) drawLot(p);
  for (const d of depots) drawDepot(d);
  for (const b of buildings) { if (b.type === 'house') drawHouse(b); else drawStore(b); }
}

/* ----------------------------------------------------------------- cars */
function lerpAng(a, b, t) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }
/* parcel slots on a vehicle's roof or cargo box: one square per parcel it can carry, filled as it loads */
/* parcel slots on a vehicle: one square per parcel it can carry, filled as it loads */
function drawSlots(c, x0, x1, h) {
  const cap = carCap(c); if (cap <= 0 || x1 - x0 < 1) return;
  const rows = cap > 3 ? 2 : 1, cols = Math.ceil(cap / rows);
  const cw = (x1 - x0) / cols, ch = h / rows, s = Math.max(0.8, Math.min(cw, ch) - 0.45);
  for (let i = 0; i < cap; i++) {
    const cx = x0 + (i % cols + 0.5) * cw, cy = -h / 2 + (Math.floor(i / cols) + 0.5) * ch;
    if (i < c.load) { ctx.fillStyle = '#e3b46a'; ctx.fillRect(cx - s / 2, cy - s / 2, s, s); ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fillRect(cx - 0.2, cy - s / 2, 0.4, s); }
    else { ctx.fillStyle = 'rgba(0,0,0,.24)'; ctx.fillRect(cx - s / 2, cy - s / 2, s, s); }
  }
}
function glass(x, y, w, h, r) { rr(x, y, w, h, r); ctx.fillStyle = 'rgba(24,44,58,.9)'; ctx.fill(); ctx.fillStyle = 'rgba(160,210,240,.35)'; ctx.fillRect(x + w * 0.15, y + 0.3, Math.max(0.3, w * 0.25), h - 0.6); }
function wheel(x, y, w, h) { rr(x - w / 2, y - h / 2, w, h, h / 2); ctx.fillStyle = '#1b2125'; ctx.fill(); }
/* Vehicles. The body is chosen by carry size (hatchback, estate, pickup, panel van, box truck);
   the speed kit (sport, GT, racer) and loading upgrades are fitted on top. Front is +x. */
function drawCar(c, sizeBoost) {
  c.da = c.da === undefined ? c.ang : lerpAng(c.da, c.ang, 0.28);            // eased heading into turns
  const bi = bodyOf(c), B = BODY[bi], L = B.L, Wd = B.W, col = COLORS[c.color].hex;
  const kit = carUp(c, 'spd'), ld = carUp(c, 'load'), hw = Wd / 2, f = L / 2, r = -L / 2;
  const light = '#f2f0e8', dark = shade(col, -0.35), hi = 'rgba(255,255,255,.2)';
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.da);
  rr(r + 0.7, -hw + 1.6, L, Wd, 2.2); ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fill();      // drop shadow
  // wheels peek out past the body; GT and racer kits sit on wider tyres
  const tw = kit >= 2 ? 3.4 : 3, th = kit >= 2 ? 1.5 : 1.2, ax = [f - 2.9, r + 2.9];
  if (bi === 4) ax.push(r + 5.8);
  for (const x of ax) { wheel(x, -hw, tw, th); wheel(x, hw, tw, th); }
  let bon0, bon1, roof0, roof1;                                                 // bonnet and roof spans, for kit parts and slots
  if (bi === 0 || bi === 1) {
    // hatchback / estate: one rounded coloured shell, glass front and back, roof carries the slots
    rr(r, -hw, L, Wd, hw * 0.9); ctx.fillStyle = col; ctx.fill();
    rr(r + 1, -hw + 0.5, L - 2, Wd * 0.3, 1); ctx.fillStyle = hi; ctx.fill();
    const ws = f - (bi === 0 ? 4.2 : 4.4);
    glass(ws, -hw + 0.9, 1.7, Wd - 1.8, 0.6);
    const rw = bi === 0 ? r + 1.1 : r + 0.8;
    glass(rw, -hw + 1.1, 1.1, Wd - 2.2, 0.5);
    roof0 = rw + 1.6; roof1 = ws - 0.4;
    rr(roof0, -hw + 0.8, roof1 - roof0, Wd - 1.6, 1.2); ctx.fillStyle = shade(col, 0.18); ctx.fill();
    if (bi === 1) { ctx.fillStyle = 'rgba(30,30,30,.55)'; ctx.fillRect(roof0, -hw + 0.7, roof1 - roof0, 0.45); ctx.fillRect(roof0, hw - 1.15, roof1 - roof0, 0.45); }   // roof rails
    drawSlots(c, roof0 + 0.4, roof1 - 0.4, Wd - 2.4);
    bon0 = ws + 1.9; bon1 = f - 0.5;
  } else if (bi === 2) {
    // pickup: coloured cab up front, open load bed behind with the parcels in it
    const cab = 6.2;
    rr(f - cab, -hw, cab, Wd, 2); ctx.fillStyle = col; ctx.fill();
    rr(f - cab + 0.6, -hw + 0.5, cab - 1.2, Wd * 0.3, 1); ctx.fillStyle = hi; ctx.fill();
    glass(f - 3.4, -hw + 0.9, 1.6, Wd - 1.8, 0.6);
    rr(r, -hw, L - cab - 0.4, Wd, 1.2); ctx.fillStyle = dark; ctx.fill();          // bed walls
    rr(r + 0.7, -hw + 0.7, L - cab - 1.8, Wd - 1.4, 0.8); ctx.fillStyle = 'rgba(0,0,0,.42)'; ctx.fill();   // bed floor
    roof0 = r + 0.9; roof1 = f - cab - 1.3;
    drawSlots(c, roof0, roof1, Wd - 2);
    bon0 = f - 1.7; bon1 = f - 0.4;
  } else if (bi === 3) {
    // panel van: tall pale body, coloured nose and livery stripe
    rr(r, -hw, L, Wd, 1.8); ctx.fillStyle = light; ctx.fill();
    ctx.lineWidth = 0.45; ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.stroke();
    ctx.fillStyle = col; ctx.fillRect(r + 0.5, -hw + 0.35, L - 4.5, 0.8); ctx.fillRect(r + 0.5, hw - 1.15, L - 4.5, 0.8);
    rr(f - 3.6, -hw + 0.2, 3.6, Wd - 0.4, 1.8); ctx.fillStyle = col; ctx.fill();
    glass(f - 2.6, -hw + 0.9, 1.4, Wd - 1.8, 0.5);
    ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(r + 1, -0.15, L - 5, 0.3);   // roof seam
    roof0 = r + 1; roof1 = f - 4.2;
    drawSlots(c, roof0, roof1, Wd - 2.6);
    bon0 = f - 1.1; bon1 = f - 0.3;
  } else {
    // box truck: short coloured cab, gap, then a ribbed cargo box
    const cab = 4.6;
    rr(f - cab, -hw + 0.4, cab, Wd - 0.8, 1.6); ctx.fillStyle = col; ctx.fill();
    glass(f - 1.9, -hw + 1.1, 1.3, Wd - 2.2, 0.5);
    rr(r, -hw, L - cab - 0.6, Wd, 0.9); ctx.fillStyle = light; ctx.fill();
    ctx.lineWidth = 0.45; ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,.1)';
    for (let x = r + 1.6; x < f - cab - 1; x += 1.6) ctx.fillRect(x, -hw + 0.3, 0.35, Wd - 0.6);        // box ribs
    ctx.fillStyle = col; ctx.fillRect(r + 0.3, -hw + 0.3, L - cab - 1.2, 0.9); ctx.fillRect(r + 0.3, hw - 1.2, L - cab - 1.2, 0.9);
    roof0 = r + 1; roof1 = f - cab - 1.4;
    drawSlots(c, roof0, roof1, Wd - 2.8);
    bon0 = f - 0.9; bon1 = f - 0.3;
  }
  // lights and mirrors
  ctx.fillStyle = '#fff4c4'; ctx.fillRect(f - 0.7, -hw + 0.7, 0.7, 1.2); ctx.fillRect(f - 0.7, hw - 1.9, 0.7, 1.2);
  ctx.fillStyle = c.brake ? '#ff3b30' : '#8f2a24'; ctx.fillRect(r, -hw + 0.7, 0.7, 1.2); ctx.fillRect(r, hw - 1.9, 0.7, 1.2);
  const mx = bi <= 1 ? f - 4.2 : bi === 2 ? f - 3.4 : f - 2.6;
  ctx.fillStyle = bi >= 3 ? col : dark; ctx.fillRect(mx, -hw - 0.7, 0.8, 0.7); ctx.fillRect(mx, hw, 0.8, 0.7);
  // speed kits: sport stripes, GT spoiler and side skirts, racer wing, roundel and exhaust glow
  if (kit >= 1) {
    ctx.fillStyle = kit >= 3 ? '#ffd23a' : 'rgba(255,255,255,.9)';
    const s0 = Math.min(bon0, roof0), s1 = bon1;
    ctx.fillRect(s0, -1.1, s1 - s0, 0.5); ctx.fillRect(s0, 0.6, s1 - s0, 0.5);
  }
  if (kit >= 2) {
    ctx.fillStyle = '#20282e';
    ctx.fillRect(r + 2, -hw - 0.35, L - 4, 0.45); ctx.fillRect(r + 2, hw - 0.1, L - 4, 0.45);           // side skirts
    ctx.fillRect(r - 0.9, -hw + 0.4, 1, Wd - 0.8);                                                  // spoiler
  }
  if (kit >= 3) {
    ctx.fillStyle = '#20282e'; ctx.fillRect(r - 1.6, -hw - 0.8, 1.2, Wd + 1.6);                      // big rear wing
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc((roof0 + roof1) / 2, 0, Math.min(1.5, hw - 1.3), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc((roof0 + roof1) / 2, 0, Math.min(0.8, hw - 2), 0, Math.PI * 2); ctx.fill();
    if (c.v > 12 && !REDUCED_MOTION) { ctx.fillStyle = 'rgba(255,150,40,' + (0.5 + 0.4 * Math.sin(animT * 30 + c.id)).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(r - 2.1, -hw + 1.3, 0.8, 0, 6.3); ctx.arc(r - 2.1, hw - 1.3, 0.8, 0, 6.3); ctx.fill(); }
  }
  // loading upgrades: orange tail-lift, then side loading lights
  if (ld > 0) {
    ctx.fillStyle = '#f39a1e'; ctx.fillRect(r - 0.7, -hw + 1.6, 0.8, Wd - 3.2);
    if (ld >= 2) { ctx.fillRect(r + 0.9, -hw - 0.3, 1.6, 0.6); ctx.fillRect(r + 0.9, hw - 0.3, 1.6, 0.6); }
  }
  if (c.broken > 0 && Math.sin(animT * 12) > 0) { ctx.fillStyle = '#ffab1a'; ctx.beginPath(); ctx.arc(r, -hw, 1.3, 0, 6.3); ctx.arc(r, hw, 1.3, 0, 6.3); ctx.arc(f, -hw, 1.3, 0, 6.3); ctx.arc(f, hw, 1.3, 0, 6.3); ctx.fill(); }
  ctx.restore();
  if (c.broken > 0) {
    ctx.save(); ctx.translate(c.x - Math.cos(c.ang) * 14, c.y - Math.sin(c.ang) * 14);
    ctx.fillStyle = '#e63a2e'; ctx.beginPath(); ctx.moveTo(0, -3.4); ctx.lineTo(3, 2.4); ctx.lineTo(-3, 2.4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -1.6); ctx.lineTo(1.5, 1.4); ctx.lineTo(-1.5, 1.4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  if (c.state === 'driving' && c.stopT > 6) {           // an angry car
    const p = 0.5 + 0.5 * Math.sin(animT * 8 + c.id);
    ctx.fillStyle = 'rgba(224,60,48,' + (0.55 + p * 0.4) + ')'; ctx.beginPath(); ctx.arc(c.x, c.y - 9, 1.9, 0, 6.3); ctx.fill();
  }
  if (sel && sel.type === 'car' && sel.ref === c) {
    ctx.strokeStyle = theme === 'dark' ? '#fff' : '#12303f'; ctx.lineWidth = 1.8 / Math.max(0.6, cam.z * 0.6);
    ctx.beginPath(); ctx.arc(c.x, c.y, 11 + Math.sin(animT * 5), 0, 6.3); ctx.stroke();
  }
}
function drawTruck(t) {
  const L = t.len, Wd = 7.6, on = t.job === 'seek' || t.job === 'home' || t.hauling;
  ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.ang);
  rr(-L / 2 + 1, -Wd / 2 + 1.7, L, Wd, 2.4); ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fill();
  rr(-L / 2, -Wd / 2, L, Wd, 2.4); ctx.fillStyle = '#f08a1c'; ctx.fill(); ctx.lineWidth = 0.7; ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.stroke();
  rr(-L / 2 + 1, -Wd / 2 + 1, L * 0.5, Wd - 2, 1.2); ctx.fillStyle = '#3b4650'; ctx.fill();        // flat bed
  rr(L * 0.08, -Wd / 2 + 0.9, L * 0.34, Wd - 1.8, 1.4); ctx.fillStyle = '#fff1d0'; ctx.fill();       // cab
  rr(L * 0.28, -Wd / 2 + 1.3, L * 0.12, Wd - 2.6, 1); ctx.fillStyle = 'rgba(22,40,52,.85)'; ctx.fill();
  ctx.fillStyle = COLORS[t.color].hex; ctx.fillRect(-L / 2 + 2.2, -0.9, L * 0.34, 1.8);                 // store colour stripe
  ctx.strokeStyle = '#2b333a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-L / 2 + 1, 0); ctx.lineTo(-L / 2 - 3.2, 0); ctx.stroke();
  ctx.fillStyle = '#fff5c8'; ctx.beginPath(); ctx.arc(L / 2 - 0.9, -Wd / 2 + 1.3, 0.85, 0, 6.3); ctx.arc(L / 2 - 0.9, Wd / 2 - 1.3, 0.85, 0, 6.3); ctx.fill();
  ctx.fillStyle = on && Math.sin(animT * 11 + t.id) > 0 ? '#ffd23a' : '#a37a1a'; ctx.beginPath(); ctx.arc(L * 0.2, 0, 1.5, 0, 6.3); ctx.fill();
  ctx.restore();
}
function drawAmb(a) {
  const L = a.len, Wd = 7.8, on = Math.sin(animT * 14 + a.id) > 0;
  ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.ang);
  rr(-L / 2 + 1, -Wd / 2 + 1.7, L, Wd, 2.4); ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fill();
  rr(-L / 2, -Wd / 2, L, Wd, 2.4); ctx.fillStyle = '#fbfbf7'; ctx.fill(); ctx.lineWidth = 0.7; ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.stroke();
  ctx.fillStyle = '#d8352a'; ctx.fillRect(-L / 2 + 1, -0.7, L * 0.62, 1.4);                              // stripe
  ctx.fillRect(-L * 0.3 - 0.6, -2.6, 1.2, 5.2); ctx.fillRect(-L * 0.3 - 2.6, -0.6, 5.2, 1.2);              // cross
  rr(L * 0.22, -Wd / 2 + 0.9, L * 0.2, Wd - 1.8, 1.2); ctx.fillStyle = 'rgba(22,40,52,.88)'; ctx.fill();   // windscreen
  ctx.fillStyle = on ? '#3a8dff' : '#ff3b30'; ctx.beginPath(); ctx.arc(L * 0.12, -Wd / 2 + 1.6, 1.3, 0, 6.3); ctx.fill();
  ctx.fillStyle = on ? '#ff3b30' : '#3a8dff'; ctx.beginPath(); ctx.arc(L * 0.12, Wd / 2 - 1.6, 1.3, 0, 6.3); ctx.fill();
  ctx.fillStyle = '#fff5c8'; ctx.beginPath(); ctx.arc(L / 2 - 0.9, -Wd / 2 + 1.3, 0.85, 0, 6.3); ctx.arc(L / 2 - 0.9, Wd / 2 - 1.3, 0.85, 0, 6.3); ctx.fill();
  ctx.restore();
  ctx.fillStyle = on ? 'rgba(58,141,255,.28)' : 'rgba(255,59,48,.28)'; ctx.beginPath(); ctx.arc(a.x, a.y, 15, 0, 6.3); ctx.fill();   // glow
}
function drawAmbTarget(a) {
  const s = buildings[a.store]; if (!s) return;
  const late = clock - a.t0 > a.limit;
  ctx.strokeStyle = late ? '#ff3b30' : '#ff8a80'; ctx.lineWidth = 2.2; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.arc(tx(s.k), ty(s.k), 24 + Math.sin(animT * 5) * 2, 0, 6.3); ctx.stroke(); ctx.setLineDash([]);
}
/* cones and a striped barrier across a closed tile */
function drawClosures(vr) {
  for (const [k, t] of closed) {
    if (!road[k]) continue;
    const x = tx(k), y = ty(k);
    if (x < vr.x0 - 40 || x > vr.x1 + 40 || y < vr.y0 - 40 || y > vr.y1 + 40) continue;
    let ang = 0; for (let d = 0; d < 8; d++) if ((lnk[k] >> d) & 1) { ang = Math.atan2(DY[d], DX[d]); break; }
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang + Math.PI / 2);
    const w = CFG.roadWidth - 2;
    ctx.fillStyle = '#f6f2e8'; ctx.fillRect(-w / 2, -2, w, 4);
    ctx.fillStyle = '#d8352a'; for (let i = 0; i < 4; i++) ctx.fillRect(-w / 2 + i * w / 4 + w / 8, -2, w / 8, 4);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {          // four cones seen from above: an orange disc with a white ring
      const px = sx * (w / 2 - 3.4), py = sy * 5.6;
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(px + 0.7, py + 0.9, 3.1, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.arc(px, py, 3.1, 0, 6.3); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(px, py, 1.6, 0, 6.3); ctx.stroke();
    }
    ctx.restore();
    if (Math.sin(animT * 6 + k) > 0) { ctx.fillStyle = '#ffab1a'; ctx.beginPath(); ctx.arc(x, y - 6, 1.6, 0, 6.3); ctx.fill(); }
  }
}
/* a small arrow on every one-way tile, pointing the direction traffic is allowed to travel */
function drawOneways(vr) {
  for (let k = 0; k < N; k++) {
    if (!onewayDir || onewayDir[k] < 0 || !road[k]) continue;
    const x = tx(k), y = ty(k);
    if (x < vr.x0 - 30 || x > vr.x1 + 30 || y < vr.y0 - 30 || y > vr.y1 + 30) continue;
    if (linkCount(k) !== 2) continue;                   // a later junction here quietly suspends the arrow
    const d = (onewayDir[k] + 4) % 8, ang = Math.atan2(DY[d], DX[d]);
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = '#ffd23a'; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(7.5, 0); ctx.lineTo(-4, -5); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
function drawContractBadge(b) {
  if (!b.contract) return;
  const x = tx(b.k), y = ty(b.k) - CELL * 0.62, frac = clamp(b.contract.left / CFG.contractSeconds, 0, 1);
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = '#ffd23a'; ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, 7, 0, 6.3); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#8a5b00'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 4.6, -Math.PI / 2, -Math.PI / 2 + frac * 6.283); ctx.stroke();
  ctx.restore();
}
function drawStoreLevel(b) {
  if (!b.lvl) return;
  const x = tx(b.k), y = ty(b.k) + CELL * 0.4;
  for (let i = 0; i < b.lvl; i++) { ctx.fillStyle = '#ffc933'; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(x + (i - (b.lvl - 1) / 2) * 5, y, 1.8, 0, 6.3); ctx.fill(); ctx.stroke(); }
}
function drawSelectedRoute() {
  if (!sel) return;
  if (sel.type === 'car') {
    const c = sel.ref;
    if (!c || !cars.includes(c) || !c.route || c.state !== 'driving') return;
    const col = COLORS[c.color].hex;
    ctx.strokeStyle = rgba(col, 0.85); ctx.lineWidth = 2.4; ctx.setLineDash([5, 4]); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(c.x, c.y);
    for (let i = c.ri; i < c.route.length; i++) {
      const e = c.route[i], p = laneAt(e, i === c.route.length - 1 ? e.stop : e.L);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke(); ctx.setLineDash([]);
    const dn = destNodeOf(c);
    if (dn >= 0) { ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(tx(dn), ty(dn), 12 + Math.sin(animT * 4) * 1.5, 0, 6.3); ctx.stroke(); }
  }
}

/* ------------------------------------------------------------- effects */
function popText(wx, wy, txt, col) { if (fxOn) fx.push({kind: 'text', x: wx, y: wy, txt, col, t: 0, life: 1.4}); }
function popRing(wx, wy, col) { if (fxOn) fx.push({kind: 'ring', x: wx, y: wy, col, t: 0, life: 0.8}); }
function stepFX(dt) { for (let i = fx.length - 1; i >= 0; i--) { fx[i].t += dt; if (fx[i].t >= fx[i].life) fx.splice(i, 1); } }
function drawFX() {
  for (const f of fx) {
    const u = f.t / f.life;
    if (f.kind === 'text') {
      const s = clamp(1 / cam.z * 0.9, 1, 2.2);
      ctx.save(); ctx.translate(f.x, f.y - u * 20 * s); ctx.scale(s, s); ctx.globalAlpha = 1 - u * u;
      ctx.font = '800 11px Overpass, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,25,35,.8)';
      ctx.strokeText(f.txt, 0, 0); ctx.fillStyle = f.col; ctx.fillText(f.txt, 0, 0); ctx.restore();
    } else {
      ctx.strokeStyle = f.col; ctx.globalAlpha = 1 - u; ctx.lineWidth = 2.5 * (1 - u) + 0.5;
      ctx.beginPath(); ctx.arc(f.x, f.y, 6 + u * 30, 0, 6.3); ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
}
const rainDrops = Array.from({length: 130}, () => ({x: Math.random(), y: Math.random(), s: 0.7 + Math.random() * 0.6}));

/* --------------------------------------------------------- night pass */
function drawNight(vr, na) {
  const [r, g, b] = PAL.night;
  ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (na * CFG.nightDepth) + ')';
  ctx.fillRect(vr.x0, vr.y0, vr.x1 - vr.x0, vr.y1 - vr.y0);
  ctx.globalCompositeOperation = 'lighter';
  const glow = (x, y, R, a, col) => {
    const gr = ctx.createRadialGradient(x, y, 0, x, y, R);
    gr.addColorStop(0, 'rgba(' + col + ',' + a + ')'); gr.addColorStop(1, 'rgba(' + col + ',0)');
    ctx.fillStyle = gr; ctx.fillRect(x - R, y - R, R * 2, R * 2);
  };
  for (const nd of nodeList) if (nd.junction) glow(tx(nd.k), ty(nd.k), 34, 0.3 * na, '255,214,140');
  for (const bd of buildings) glow(tx(bd.k), ty(bd.k), 30, 0.28 * na, '255,200,120');
  for (const c of cars) {
    if (c.state === 'parked' || c.state === 'loading') continue;
    const fx_ = c.x + Math.cos(c.ang) * (c.len / 2 + 9), fy_ = c.y + Math.sin(c.ang) * (c.len / 2 + 9);
    glow(fx_, fy_, 19, 0.5 * na, '255,236,170');
  }
  ctx.globalCompositeOperation = 'source-over';
}

/* ---------------------------------------------------------- overlays */
function drawHeat() {
  ctx.lineCap = 'round';
  for (const e of edges) {
    if (e.q < 0.2) continue;
    const t = clamp(e.q / 2, 0, 1), hue = 120 - 120 * t;
    ctx.strokeStyle = 'hsla(' + hue + ',85%,50%,0.75)'; ctx.lineWidth = 6 + t * 5;
    const a = laneAt(e, e.r0), b = laneAt(e, e.stop);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  for (const nd of nodeList) {
    if (!nd.junction) continue;
    const t = clamp(nd.qNow / 3, 0, 1);
    ctx.fillStyle = 'hsla(' + (120 - 120 * t) + ',85%,50%,0.55)'; ctx.beginPath(); ctx.arc(tx(nd.k), ty(nd.k), 8 + t * 6, 0, 6.3); ctx.fill();
  }
}
function drawHover() {
  if (hoverCell < 0) return;
  const c = cx(hoverCell), r = cy(hoverCell), X = c * CELL, Y = r * CELL;
  let ok = true;
  if (tool === 'road') ok = canRoad(hoverCell);
  else if (tool === 'park') ok = !(!inPlay(hoverCell) || water[hoverCell] || occupied(hoverCell)) && parentFor(hoverCell) >= 0 && canTake('park');
  else if (tool === 'depot') ok = inPlay(hoverCell) && !water[hoverCell] && !occupied(hoverCell) && nearestRoadTo(hoverCell) >= 0 && canTake('depot');
  else if (tool === 'erase') ok = occupied(hoverCell) || !!special[hoverCell] || !!sign[hoverCell];
  else if (tool === 'light' || tool === 'round' || tool === 'moto' || tool.startsWith('only') || tool.startsWith('no') || tool === 'oneway') ok = isRoad(hoverCell);
  else if (tool === 'select') ok = true;
  else if (tool === 'upgrade') ok = bAt[hoverCell] >= 0 && buildings[bAt[hoverCell]].type === 'store' && storeUpCost(buildings[bAt[hoverCell]]) !== null && money >= storeUpCost(buildings[bAt[hoverCell]]);
  else if (tool === 'tow') ok = bAt[hoverCell] >= 0 && buildings[bAt[hoverCell]].type === 'store' && buildings[bAt[hoverCell]].trucks < CFG.towTrucksPerStore && money >= truckPrice();
  const col = tool === 'select' ? 'rgba(255,255,255,.7)' : ok ? (theme === 'dark' ? '#ffd766' : '#12303f') : '#e0483e';
  ctx.strokeStyle = col; ctx.lineWidth = 2 / Math.max(0.7, cam.z * 0.7); ctx.setLineDash([4, 3]);
  rr(X + 1, Y + 1, CELL - 2, CELL - 2, 5); ctx.stroke(); ctx.setLineDash([]);
  if (tool === 'road' && ok) { ctx.globalAlpha = 0.4; ctx.fillStyle = PAL.road; ctx.beginPath(); ctx.arc(X + CELL / 2, Y + CELL / 2, CFG.roadWidth / 2, 0, 6.3); ctx.fill(); ctx.strokeStyle = PAL.edge; ctx.lineWidth = 1.6; ctx.stroke(); ctx.globalAlpha = 1; }
  if (tool === 'moto' && motoPick >= 0) {
    ctx.strokeStyle = PAL.deck; ctx.lineWidth = 3; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(tx(motoPick), ty(motoPick)); ctx.lineTo(X + CELL / 2, Y + CELL / 2); ctx.stroke(); ctx.setLineDash([]);
  }
}
function drawMotoPick() {
  if (motoPick < 0) return;
  ctx.strokeStyle = PAL.deck; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(tx(motoPick), ty(motoPick), 13 + Math.sin(animT * 5) * 2, 0, 6.3); ctx.stroke();
}
function drawSelectedBuilding() {
  if (!sel || sel.type !== 'building') return;
  const b = buildings[sel.i]; if (!b) return;
  ctx.strokeStyle = theme === 'dark' ? '#fff' : '#12303f'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
  rr(tx(b.k) - 19, ty(b.k) - 19, 38, 38, 8); ctx.stroke(); ctx.setLineDash([]);
}

/* ------------------------------------------------------------- draw */
function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (W / 2 - cam.x * cam.z), dpr * (H / 2 - cam.y * cam.z));
  const vr = viewRect();
  drawGround(vr);
  drawTrees(vr);
  drawRoads();
  drawJunctionFurniture(vr);
  drawOneways(vr);
  drawClosures(vr);
  drawBuildings(vr);
  drawTutorialBeacons();
  if (showHeat) drawHeat();
  drawSelectedBuilding();
  drawSelectedRoute();
  for (const c of cars) drawCar(c);
  for (const t of trucks) if (t.state !== 'garage') drawTruck(t);
  for (const a of ambs) { drawAmbTarget(a); drawAmb(a); }
  for (const b of buildings) { if (b.type === 'store') { drawStoreLevel(b); drawStoreBadge(b); drawContractBadge(b); } else drawHouseBadge(b); }
  drawFX(); drawMotoPick();
  const na = nightAmount();
  if (na > 0.02) drawNight(vr, na);
  drawOutside(vr);
  drawHover();
  drawOffscreenAlerts();
  // rain, in screen space
  if (rain.amt > 0.03) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = 'rgba(40,70,100,' + (0.1 * rain.amt) + ')'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(210,230,250,' + (0.45 * rain.amt) + ')'; ctx.lineWidth = 1; ctx.beginPath();
    for (const d of rainDrops) {
      const X = ((d.x * W + animT * 30 * d.s) % W), Y = ((d.y + animT * 0.9 * d.s) % 1) * H;
      ctx.moveTo(X, Y); ctx.lineTo(X - 3, Y + 11 * d.s);
    }
    ctx.stroke();
  }
}

/* ------------------------------------------------------------ minimap */
const mini = document.getElementById('mini');
const mctx = mini ? mini.getContext('2d') : null;
function drawMini() {
  if (!mctx) return;
  const S = mini.width, sc = S / (MAXD);
  const x0 = Math.max(0, org - 2), x1 = Math.min(MAXD, org + span + 2);
  const size = x1 - x0, k = S / size;
  mctx.clearRect(0, 0, S, S);
  mctx.fillStyle = PAL.land; mctx.fillRect(0, 0, S, S);
  mctx.fillStyle = PAL.land2; mctx.fillRect((org - x0) * k, (org - x0) * k, span * k, span * k);
  mctx.fillStyle = PAL.water;
  for (let r = x0; r < x1; r++) for (let c = x0; c < x1; c++) if (water[idx(c, r)]) mctx.fillRect((c - x0) * k, (r - x0) * k, k + 0.5, k + 0.5);
  mctx.strokeStyle = PAL.edge; mctx.lineWidth = Math.max(1, k * 0.5); mctx.lineCap = 'round';
  mctx.beginPath();
  for (const e of edges) { if (e.a > e.b && !e.fast) continue; mctx.moveTo((e.ax / CELL - x0) * k, (e.ay / CELL - x0) * k); mctx.lineTo((e.bx / CELL - x0) * k, (e.by / CELL - x0) * k); }
  mctx.stroke();
  for (const b of buildings) {
    mctx.fillStyle = COLORS[b.color].hex;
    const X = (cx(b.k) - x0) * k, Y = (cy(b.k) - x0) * k;
    if (b.type === 'store') mctx.fillRect(X - 0.5, Y - 0.5, k + 1, k + 1); else { mctx.beginPath(); mctx.arc(X + k / 2, Y + k / 2, k * 0.45, 0, 6.3); mctx.fill(); }
    if (b.type === 'store' && b.timer > 0.5) { mctx.strokeStyle = '#e0483e'; mctx.lineWidth = 1.5; mctx.strokeRect(X - 2, Y - 2, k + 4, k + 4); }
  }
  mctx.fillStyle = theme === 'dark' ? '#fff' : '#12303f';
  for (const c of cars) if (c.state !== 'parked' && c.state !== 'loading') mctx.fillRect((c.x / CELL - x0) * k - 0.8, (c.y / CELL - x0) * k - 0.8, 1.6, 1.6);
  const a = toWorld(0, 0), b = toWorld(W, H);
  mctx.strokeStyle = '#ffc933'; mctx.lineWidth = 1.5;
  mctx.strokeRect((a.x / CELL - x0) * k, (a.y / CELL - x0) * k, (b.x - a.x) / CELL * k, (b.y - a.y) / CELL * k);
  mini._map = {x0, k};
}

/* ---------------------------------------------------------------------
   6. INTERFACE
   --------------------------------------------------------------------- */
const $ = id => document.getElementById(id);
const IC = {
  select: '<path d="M6 3l11 7.5-5 1.3-2.2 5.2z"/>',
  road: '<path d="M7 21L10 3M17 21L14 3"/><path d="M12 6v3M12 11v3M12 16v3"/>',
  erase: '<path d="M4 15l8-9 8 8-5 5H9z"/><path d="M8.5 11.5l7 7"/>',
  park: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M10 17V8h3a2.6 2.6 0 010 5.2h-3"/>',
  depot: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 5v14M16 5v14"/><circle cx="12" cy="12" r="1.5"/>',
  moto: '<path d="M3 19c5 0 6-11 9-11s4 11 9 11"/><path d="M3 21h18"/>',
  light: '<rect x="8" y="2.5" width="8" height="19" rx="3"/><circle cx="12" cy="7.5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="16.5" r="1.6"/>',
  round: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.6"/><path d="M12 4l2.4-1.6M12 4l2.4 1.6"/>',
  sign: '<circle cx="12" cy="12" r="8.5"/><path d="M12 17V8M8.5 11.5L12 8l3.5 3.5"/>',
  bridge: '<path d="M3 15h18M5 15v-4M9 15v-4M15 15v-4M19 15v-4M3 19c3-2 6-2 9 0s6 2 9 0"/>',
  box: '<path d="M4 8l8-4 8 4v9l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v9"/>',
  bolt: '<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>',
  cone: '<path d="M12 3l6 16H6z"/><path d="M8 13h8M3 21h18"/>',
  cross: '<path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
  dock: '<rect x="3" y="9" width="18" height="10" rx="1.5"/><path d="M7 9V5h10v4M9 14h6"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 017-2.5A4 4 0 0119 10c0 5.5-7 10-7 10z"/>',
  hook: '<path d="M12 3v9a4 4 0 11-4 4"/><circle cx="12" cy="3.5" r="1.3"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 11-12 0c0-4.5 6-11 6-11z"/>',
  van: '<path d="M2 16V8h11v8M13 11h4l3 3v2H2"/><circle cx="7" cy="17" r="1.8"/><circle cx="16" cy="17" r="1.8"/>',
  car: '<path d="M3 15v-3l2.2-4.5h9.6L17 12v3z"/><circle cx="7" cy="16.5" r="1.7"/><circle cx="15" cy="16.5" r="1.7"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M14.6 9.3c-.6-.8-1.5-1.3-2.7-1.3-1.5 0-2.5.8-2.5 1.9 0 2.6 5.3 1.2 5.3 3.9 0 1.2-1.1 2-2.7 2-1.2 0-2.2-.5-2.8-1.4M12 6.4V8m0 8v1.6"/>',
  truck: '<path d="M3 16v-5h9v5M12 12h4l2 2v2H3"/><circle cx="7" cy="17.6" r="1.7"/><circle cx="15" cy="17.6" r="1.7"/><path d="M6 11l6-7 4 2M16 6v4"/>',
  up: '<path d="M12 19V6M6 12l6-6 6 6"/><path d="M5 22h14"/>',
  oneway: '<path d="M12 4v16"/><path d="M6 10l6-6 6 6"/>'
};
function icon(name, size) {
  return '<svg viewBox="0 0 24 24" width="' + (size || 24) + '" height="' + (size || 24) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[name] || '<circle cx="12" cy="12" r="3"/>') + '</svg>';
}
function signSVG(kind, size) {
  const only = kind.startsWith('only'), dir = kind.endsWith('left') ? -1 : kind.endsWith('right') ? 1 : 0;
  const fg = only ? '#fff' : '#16202b';
  let arrow;
  if (dir === 0) arrow = '<path d="M12 18V11" stroke="' + fg + '" stroke-width="2.4" fill="none"/><path d="M12 5l4 6h-8z" fill="' + fg + '"/>';
  else arrow = '<path d="M' + (12 - dir) + ' 18v-7h' + (dir * 4) + '" stroke="' + fg + '" stroke-width="2.4" fill="none"/><path d="M' + (12 + dir * 8.5) + ' 11l' + (-dir * 4) + ' -3.6v7.2z" fill="' + fg + '"/>';
  return '<svg viewBox="0 0 24 24" width="' + (size || 26) + '" height="' + (size || 26) + '" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="' + (only ? '#1b57b0' : '#fff') + '"' + (only ? '' : ' stroke="#c8362c" stroke-width="2.6"') + '/>' + arrow + (only ? '' : '<path d="M5.5 18.5l13-13" stroke="#c8362c" stroke-width="2.4"/>') + '</svg>';
}

const TOOLS = [
  {id: 'select', label: 'Inspect', icon: 'select', key: '1', group: 'build', hint: 'Click a car, house or store to inspect it. Right-drag or hold Shift to pan.'},
  {id: 'road', label: 'Road', icon: 'road', key: '2', inv: 'road', group: 'build', hint: 'Drag to lay road. Drag onto another road to join it; side-by-side roads stay apart. Slant your drag for a diagonal. Drag into a house or store to point it at that road.'},
  {id: 'erase', label: 'Erase', icon: 'erase', key: '3', group: 'build', hint: 'Click or drag to remove road, signs, lights and lots. Pieces go back in your stock.'},
  {id: 'park', label: 'Lot', icon: 'park', key: '4', inv: 'park', group: 'build', hint: 'Touch a lot to a house for another car, or a store for more bays and a dock.'},
  {id: 'depot', label: 'Bay', icon: 'depot', key: '5', inv: 'depot', group: 'build', hint: 'Place beside a road. Idle cars wait here, off the road, closer to the stores.'},
  {id: 'moto', label: 'Motorway', icon: 'moto', key: '6', inv: 'moto', group: 'build', hint: 'Click one road tile, then a far one at least 4 tiles away.'},
  {id: 'light', label: 'Light', icon: 'light', key: '7', inv: 'light', group: 'manage', hint: 'Click a junction to place a light. Click a placed light to set how many cars each side lets through.'},
  {id: 'round', label: 'Roundabout', icon: 'round', key: '8', inv: 'round', group: 'manage', hint: 'Click a junction. Two cars can circulate at once and nobody has to stop.'},
  {id: 'signs', label: 'Signs', icon: 'sign', key: '9', inv: 'sign', group: 'manage', hint: 'Pick a sign, then click a road tile. Signs are read from the driver’s seat. Also has a one-way option, for a plain two-way stretch.'},
  {id: 'upgrade', label: 'Upgrade', icon: 'up', key: 'U', group: 'manage', hint: 'Click a store to make every parcel it gives pay more. Costs cash.'},
  {id: 'tow', label: 'Hire tow', icon: 'truck', key: 'Y', group: 'manage', hint: 'Click a store to hire a tow truck based there. It drives out to stuck and broken cars and hauls them clear.'}
];
const SIGNS = [
  {id: 'only-left', label: 'Left only'}, {id: 'only-forward', label: 'Ahead only'}, {id: 'only-right', label: 'Right only'},
  {id: 'no-left', label: 'No left'}, {id: 'no-forward', label: 'No ahead'}, {id: 'no-right', label: 'No right'},
  {id: 'oneway', label: 'One-way'}
];
const isSignTool = t => t.startsWith('only') || t.startsWith('no') || t === 'oneway';
function buildToolbars() {
  const boxBuild = $('tools-build'), boxManage = $('tools-manage');
  if (boxBuild) boxBuild.innerHTML = ''; if (boxManage) boxManage.innerHTML = '';
  for (const t of TOOLS) {
    const box = (t.group === 'manage' ? boxManage : boxBuild) || boxBuild;
    if (!box) continue;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tool'; b.dataset.id = t.id; b.dataset.tip = t.label; b.dataset.key = t.key; b.dataset.tipPos = 'right'; b.setAttribute('aria-label', t.label);
    b.innerHTML = icon(t.icon, 24) + '<span>' + t.label + '</span><i class="n" hidden></i><kbd>' + t.key + '</kbd>';
    b.addEventListener('click', () => setTool(t.id === 'signs' ? (isSignTool(tool) ? tool : 'only-forward') : t.id));
    box.append(b);
  }
  const sb = $('signs'); sb.innerHTML = '';
  for (const s of SIGNS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'signbtn' + (s.id === 'oneway' ? ' onewaybtn' : ''); b.dataset.id = s.id; b.dataset.tip = s.label; b.dataset.tipPos = 'below'; b.setAttribute('aria-label', s.label);
    b.innerHTML = s.id === 'oneway' ? icon('oneway', 26) : signSVG(s.id, 28);
    b.addEventListener('click', () => setTool(s.id));
    sb.append(b);
  }
}
function setTool(t) {
  if (spectating && t !== 'select') return;
  tool = t; motoPick = -1;
  refreshUI();
  const def = TOOLS.find(x => x.id === (isSignTool(t) ? 'signs' : t));
  if (!def) return;
  if (compactUI()) {                                   // phones: a small label naming what was tapped, nothing more
    const sg = isSignTool(t) ? SIGNS.find(x => x.id === t) : null;
    hint(sg ? sg.label : def.label, false, true);
  } else hint(def.hint, true);
}
/* phones and small touch screens get compact pop-ups */
function compactUI() {
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  return window.innerWidth < 820 || (coarse && Math.min(window.innerWidth, window.innerHeight) < 820);
}
let hintTimer = 0, hintCount = 0;
function hint(msg, sticky, label) {
  hintCount++;
  const h = $('hint'); if (!h) return;
  h.textContent = msg; h.classList.toggle('label', !!label); h.classList.add('on');
  clearTimeout(hintTimer);
  const ms = compactUI() ? (label ? 1300 : 2600) : (sticky ? 6500 : 3200);
  hintTimer = setTimeout(() => h.classList.remove('on'), ms);
}
const HUD_ICONS = {
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>',
  good: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.8"/>',
  warn: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  tip: '<path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.6 10.8c.8.6 1.1 1.4 1.1 2.2h5c0-.8.3-1.6 1.1-2.2A6 6 0 0012 3z"/>',
  amb: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M12 8v8M8 12h8"/>',
  closed: '<path d="M4 20h16M7 20l3.5-15h3L17 20M8.6 14h6.8M9.6 9.5h4.8"/>',
  rush: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/>',
  rain: '<path d="M12 3.5c3 4 5.5 7 5.5 10a5.5 5.5 0 01-11 0c0-3 2.5-6 5.5-10z"/>',
  contract: '<path d="M7 3.5h7l4 4V20a.5.5 0 01-.5.5h-10.5a.5.5 0 01-.5-.5V4a.5.5 0 01.5-.5z"/><path d="M14 3.5V8h4M9 12.5h6M9 16h4"/>',
  alarm: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9l9-5.5L21 9M9 14h6"/>'
};
const hudIcon = (k, sz) => '<svg class="hi" viewBox="0 0 24 24" width="' + (sz || 16) + '" height="' + (sz || 16) + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (HUD_ICONS[k] || HUD_ICONS.info) + '</svg>';
function toast(msg, kind) {
  const box = $('toasts'); if (!box) return;
  const small = compactUI();
  while (box.children && box.children.length > (small ? 1 : 3)) box.removeChild(box.children[0]);
  const d = document.createElement('div');
  d.className = 'toast' + (kind ? ' ' + kind : '');
  const txt = document.createElement('span'); txt.textContent = kind === 'tip' ? String(msg).replace(/^Tip:\s*/, '').replace(/^./, c => c.toUpperCase()) : msg;
  d.innerHTML = hudIcon(kind === 'good' ? 'good' : kind === 'warn' ? 'warn' : kind === 'tip' ? 'tip' : 'info', 17);
  if (kind === 'tip') { const k = document.createElement('b'); k.textContent = 'Tip'; d.append(k); }
  d.append(txt);
  box.append(d);
  setTimeout(() => { d.classList.add('out'); setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 400); }, small ? (kind === 'tip' ? 4200 : 2400) : (kind === 'tip' ? 6500 : 3400));
}

/* ---------------------------------------------------------------- sound */
let actx = null, muted = false;
function sfxReady() { return !!actx; }
function sfx(kind) {
  if (muted) return;
  const nowMs = performance.now(); sfx.last = sfx.last || {};
  if (sfx.last[kind] && nowMs - sfx.last[kind] < 70) return;
  sfx.last[kind] = nowMs;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t = actx.currentTime;
    const tone = (f, dur, type, vol, delay, slide) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t + (delay || 0));
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + (delay || 0) + dur);
      g.gain.setValueAtTime(0.0001, t + (delay || 0)); g.gain.exponentialRampToValueAtTime(vol || 0.05, t + (delay || 0) + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (delay || 0) + dur);
      o.connect(g); g.connect(actx.destination); o.start(t + (delay || 0)); o.stop(t + (delay || 0) + dur + 0.02);
    };
    if (kind === 'place') tone(420, 0.08, 'triangle', 0.05, 0, 520);
    else if (kind === 'erase') tone(300, 0.09, 'triangle', 0.04, 0, 200);
    else if (kind === 'deliver') { tone(660, 0.09, 'sine', 0.045); tone(880, 0.12, 'sine', 0.04, 0.07); }
    else if (kind === 'upgrade') { tone(523, 0.12, 'triangle', 0.05); tone(659, 0.12, 'triangle', 0.05, 0.1); tone(784, 0.2, 'triangle', 0.05, 0.2); }
    else if (kind === 'alarm') { tone(320, 0.18, 'square', 0.03); tone(260, 0.22, 'square', 0.03, 0.2); }
    else if (kind === 'over') { tone(300, 0.3, 'sawtooth', 0.05, 0, 90); }
  } catch (e) {}
}
const fmtP = n => '$' + (Math.round(n * 10) / 10);
function setHTML(el, h) { if (el && el._h !== h) { el._h = h; el.innerHTML = h; } }
function buyBtn(kind, id, lead) {
  const o = offerOf(kind, id); if (!o) return '';
  const dead = o.label === 'Max' || o.label === 'Full' || o.label === 'n/a';
  return '<button type="button" class="buy" data-kind="' + kind + '" data-id="' + id + '" data-can="' + (o.can ? 1 : 0) + '"' + (dead ? ' disabled' : '') + '>' + (dead ? '' : lead || '') + '<b>' + o.label + '</b></button>';
}
function bump(id) { const el = $(id); if (el && el.classList) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } }
function onDeliver(c, n, cash) {
  const h = buildings[c.home];
  popText(tx(h.k), ty(h.k) - 12, '+' + n, COLORS[c.color].hex); popRing(tx(h.k), ty(h.k), COLORS[c.color].hex);
  if (cash) popText(tx(h.k), ty(h.k) - 25, '+' + fmtP(cash), '#7be495');
  sfx('deliver'); bump('v-score'); bump('v-money');
}

/* ----------------------------------------------------------- HUD refresh */
let hudT = 0; const evMax = {};
function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
function refreshUI() {
  if (!inv) return;
  document.querySelectorAll('.tool').forEach(b => {
    const id = b.dataset.id, def = TOOLS.find(t => t.id === id);
    const on = id === 'signs' ? isSignTool(tool) : tool === id;
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    const n = b.querySelector('.n');
    if (def && def.inv && n) {
      const v = inv[def.inv], pr = PRICE[def.inv];
      n.textContent = v > 0 ? v : fmt$(pr); n.hidden = false; b.dataset.empty = v <= 0 && money < pr ? '1' : '0';
      b.dataset.sub = (v > 0 ? v + ' in stock, then ' : '') + fmt$(pr) + ' each' + (money < pr && v <= 0 ? ', ' + fmt$(pr - money) + ' short' : '');
    } else if (n && (id === 'upgrade' || id === 'tow')) {
      const live = buildings.filter(x => x.type === 'store' && x.acc >= 0);
      const ups = live.map(storeUpCost).filter(c => c !== null);
      const pr = id === 'tow' ? (live.some(x => x.trucks < CFG.towTrucksPerStore) ? truckPrice() : null) : (ups.length ? Math.min(...ups) : null);
      n.hidden = pr === null; if (pr !== null) n.textContent = fmt$(pr);
      b.dataset.empty = pr === null || money < pr ? '1' : '0';
      b.dataset.sub = !live.length ? 'Connect a store first' : pr === null ? (id === 'tow' ? 'Every store has its trucks' : 'Every store is fully upgraded') : 'From ' + fmt$(pr);
    }
  });
  document.querySelectorAll('.signbtn').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === tool ? 'true' : 'false'));
  const sp = $('signs'); if (sp) sp.hidden = !isSignTool(tool);
  const br = $('v-bridge'); if (br) br.textContent = inv.bridge;
  const bp = $('btn-play'); if (bp) { bp.setAttribute('aria-pressed', running ? 'false' : 'true'); bp.dataset.tip = running ? 'Pause' : 'Resume'; bp.dataset.key = 'P'; bp.innerHTML = running ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M8 5v14M16 5v14"/></svg>' : '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7 4l13 8-13 8z"/></svg>'; }
  document.querySelectorAll('#speed-seg button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.speed === speed ? 'true' : 'false'));
  const side = $('btn-side'); if (side) side.textContent = keepLeft ? 'Keep left' : 'Keep right';
  const ht = $('btn-heat'); if (ht) ht.setAttribute('aria-pressed', showHeat ? 'true' : 'false');
  const sd = $('btn-sound'); if (sd) { sd.setAttribute('aria-pressed', muted ? 'true' : 'false'); sd.dataset.tip = muted ? 'Sound off' : 'Sound on'; sd.dataset.key = 'M'; }
  const fl = $('btn-follow'); if (fl) fl.setAttribute('aria-pressed', follow ? 'true' : 'false');
  const ud = $('btn-undo'); if (ud) ud.disabled = !undoStack.length;
  const rd = $('btn-redo'); if (rd) rd.disabled = !redoStack.length;
}
const hudShown = {score: 0, money: 0}, hudTarget = {score: 0, money: 0};
function rollHud() {
  for (const k of ['score', 'money']) {
    const t = hudTarget[k], s = hudShown[k];
    const nv = Math.abs(t - s) < 0.6 || REDUCED_MOTION ? t : s + (t - s) * 0.22;
    if (nv === s) continue;
    hudShown[k] = nv;
    const el = $(k === 'score' ? 'v-score' : 'v-money');
    if (el) el.textContent = k === 'score' ? String(Math.round(nv)) : fmt$(Math.round(nv));
  }
}
/* 2.6: one short tip, once ever, at the moment it becomes relevant (never during the tutorial) */
const TIPS = {
  junction: 'Tip: three or more roads meeting make a give-way junction. Click one to see its options.',
  overflow: 'Tip: a store is overflowing. Connect more houses of its colour, buy cars, or add a lot.',
  rain: 'Tip: rain slows every car for a while. Nothing to fix \u2014 ride it out.',
  contract: 'Tip: contract! Collect enough parcels from that store before its dial runs out.',
  tier: 'Tip: a store got busier. Two new houses of its colour have moved in nearby.',
  breakdown: 'Tip: a broken-down car blocks its lane. A tow truck clears it automatically.',
  upgrade: 'Tip: click any car to upgrade its cargo, engine or loading \u2014 or a house to buy another car.',
  offscreen: 'Tip: red arrows on the screen edge point at stores overflowing out of view.'
};
const TIPS_KEY = 'junction-tips-seen';
const seenTips = new Set((() => { try { return JSON.parse(localStorage.getItem(TIPS_KEY)) || []; } catch (e) { return []; } })());
function tipOnce(id) {
  if (tutorialMode || seenTips.has(id) || !TIPS[id]) return;
  seenTips.add(id);
  try { localStorage.setItem(TIPS_KEY, JSON.stringify([...seenTips])); } catch (e) {}
  toast(TIPS[id], 'tip');
}
function checkTips() {
  if (tutorialMode || !started || over) return;
  if (nodeList.some(nd => nd.junction)) tipOnce('junction');
  if (buildings.some(b => b.type === 'store' && b.timer > 0.05)) { tipOnce('overflow'); if (seenTips.has('overflow')) tipOnce('offscreen'); }
  if (rain.t > 0) tipOnce('rain');
  if (buildings.some(b => b.contract)) tipOnce('contract');
  if (buildings.some(b => b.tier > 0)) tipOnce('tier');
  if (cars.some(c => c.broken > 0)) tipOnce('breakdown');
  if (money >= 60 && stats.delivered >= 25) tipOnce('upgrade');
}
function refreshHud() {
  if (!stats) return;
  hudTarget.score = score; hudTarget.money = money;
  checkTips();
  $('v-week').textContent = week;
  const wf = 1 - weekTimer / CFG.weekSeconds;
  $('v-weekfill').style.width = (clamp(wf, 0, 1) * 100).toFixed(1) + '%';
  $('v-weektime').textContent = weekTimer > 99999 ? 'No limit' : fmtTime(weekTimer); const wl = $('v-weekleft'); if (wl) wl.hidden = weekTimer > 99999;
  const jam = stats.jamPct;
  $('v-jamfill').style.width = (clamp(jam, 0, 1) * 100).toFixed(0) + '%';
  $('v-jamfill').dataset.level = jam > 0.35 ? 'bad' : jam > 0.12 ? 'mid' : 'ok';
  $('v-jam').textContent = jam < 0.03 ? 'Flowing' : jam < 0.12 ? 'Busy' : jam < 0.35 ? 'Congested' : 'Gridlock';
  const out = cars.filter(c => c.state === 'driving' || c.state === 'crossing').length;
  $('v-cars').textContent = out + '/' + cars.length;
  const inc = incomePerMin(), vi = $('v-income');
  if (vi) { vi.textContent = (inc >= 0.5 ? '+' + fmt$(Math.round(inc)) : '$0') + ' a min'; vi.dataset.up = inc >= 0.5 ? '1' : '0'; }
  const vr = $('v-rate'); if (vr) vr.textContent = stats.perMin.toFixed(1) + ' a min';
  $('v-clock').textContent = clockText();
  $('v-day').dataset.night = nightAmount() > 0.5 ? '1' : '0';
  let worst = null, wt = 0;
  for (const b of buildings) if (b.type === 'store' && b.timer > wt) { wt = b.timer; worst = b; }
  const al = $('alarm');
  if (worst && wt > 0.6) {
    const frac = clamp(wt / overflowLimit(), 0, 1);
    al.hidden = false;
    setHTML($('alarm-text'), '<i class="sw" style="background:' + COLORS[worst.color].hex + '"></i><span>' + COLORS[worst.color].name.replace(/^./, c => c.toUpperCase()) + ' store overflowing</span><b class="num">' + Math.max(0, Math.ceil(overflowLimit() - wt)) + 's</b>');
    al.style.setProperty('--p', (1 - frac).toFixed(3));
    al.dataset.hot = frac > 0.6 ? '1' : '0';
    al.dataset.focus = buildings.indexOf(worst);
  } else al.hidden = true;
  // event ticker: an ambulance call, road closures, the weather and contract offers can all be live together
  const evs = [], cap = w => w.replace(/^./, c => c.toUpperCase());
  for (const a of ambs) { const left = a.limit - (clock - a.t0); evs.push({id: 'amb' + a.t0, k: 'amb', txt: left > 0 ? 'Ambulance' : 'Ambulance late', left: Math.max(0, left), max: a.limit}); }
  if (closed.size) { let m = Infinity; for (const t of closed.values()) m = Math.min(m, t); evs.push({id: 'closed', k: 'closed', txt: closed.size > 1 ? closed.size + ' roads closed' : 'Road closed', left: m}); }
  if (rush.t > 0) evs.push({id: 'rush', k: 'rush', txt: 'Rush hour', left: rush.t});
  if (rain.t > 0) evs.push({id: 'rain', k: 'rain', txt: 'Rain', left: rain.t});
  buildings.forEach((b, i) => { if (b.type === 'store' && b.contract) evs.push({id: 'ct' + i, k: 'contract', txt: cap(COLORS[b.color].name) + ' contract', left: b.contract.left, sw: COLORS[b.color].hex, focus: i}); });
  const live = new Set();
  for (const e of evs) {
    live.add(e.id);
    const m = Math.max(e.max || 0, evMax[e.id] || 0, e.left); evMax[e.id] = m;
    e.p = m > 0 ? clamp(e.left / m, 0, 1) : 0;
  }
  for (const k in evMax) if (!live.has(k)) delete evMax[k];
  const ev = $('events');
  queueMicrotask(() => { const ch = document.querySelector('#topbar .chips'), h = ch && getComputedStyle(ch).position === 'absolute' ? ch.getBoundingClientRect().height : 0; document.documentElement.style.setProperty('--chips', (h ? Math.round(h) + 8 : 0) + 'px'); });
  if (ev) setHTML(ev, evs.map(e => '<div class="chip event" data-k="' + e.k + '"' + (e.focus !== undefined ? ' data-focus="' + e.focus + '" role="button" tabindex="0"' : '') + ' style="--p:' + e.p.toFixed(3) + '">' +
    hudIcon(e.k, 15) + (e.sw ? '<i class="sw" style="background:' + e.sw + '"></i>' : '') + '<span>' + e.txt + '</span><b class="num">' + Math.ceil(e.left) + 's</b></div>').join(''));
  // city panel
  $('k-rate').textContent = stats.perMin.toFixed(1);
  $('k-wait').textContent = stats.avgWait.toFixed(1) + 's';
  $('k-jam').textContent = Math.round(jam * 100) + '%';
  $('k-out').textContent = out;
  $('k-trips').textContent = stats.trips;
  $('k-tows').textContent = stats.tows;
  const spots = troubleSpots();
  setHTML($('trouble'), spots.length ? spots.map(o => '<div class="trow" role="button" tabindex="0" data-focus-tile="' + o.k + '"><b>' + o.type + '</b><span>' + o.q + ' waiting</span><span>avg ' + o.w.toFixed(1) + 's</span><small>col ' + (cx(o.k) - org + 1) + ' · row ' + (cy(o.k) - org + 1) + '</small></div>').join('')
                                : '<p class="muted">Nothing is backing up.</p>');
  const stores = buildings.map((s, i) => ({s, i})).filter(o => o.s.type === 'store');
  setHTML($('stores'), stores.length ? stores.map(({s, i}) => {
    const cap = storeCap(s), frac = Math.round(clamp(s.timer / overflowLimit(), 0, 1) * 20) * 5;
    let pips = ''; for (let l = 0; l < CFG.storeUpgradeMax; l++) pips += '<i class="' + (l < s.lvl ? 'f' : '') + '"></i>';
    return '<div class="srow"><div class="stop" data-focus="' + i + '"><i class="sw" style="background:' + COLORS[s.color].hex + '"></i><b>' + COLORS[s.color].name + (s.tier ? ' · tier ' + s.tier : '') + '</b><span>' + s.pins + '/' + cap + '</span></div>' +
      '<em class="bar"><i style="width:' + frac + '%"></i></em>' +
      '<div class="sact"><span class="pips" title="Store level">' + pips + '</span><small>' + fmtP(payPerParcel(s)) + ' a parcel</small>' + buyBtn('store', i, 'Upgrade ') + buyBtn('truck', i, 'Tow ') + '</div></div>';
  }).join('') : '<p class="muted">No stores yet.</p>');
  const at = document.querySelector('.tab[aria-selected="true"]'), tn = at && at.dataset && at.dataset.tab;
  if (tn === 'perks') renderPerks(); else if (tn === 'shop') renderShop();
  drawSpark();
}
/* The three junctions with the longest queues right now (cars nearly stopped on the roads leading in),
   ties broken by how long cars have been standing there. Re-ranked once a second so the list doesn't flicker. */
let troubleAt = -9, troubleKs = [];
const JUNC_NAMES = {yield: 'Give-way', light: 'Traffic light', round: 'Roundabout'};
function troubleSpots() {
  if (animT - troubleAt > 1) {
    troubleAt = animT;
    const list = [];
    for (const nd of nodeList) {
      if (!nd.junction) continue;
      let q = 0; for (const e of nd.ins) q += e.qRaw;
      const w = nd.waitN ? nd.waitSum / nd.waitN : 0;
      if (q > 0 || w >= 3) list.push({k: nd.k, q, w});
    }
    list.sort((a, b) => (b.q - a.q) || (b.w - a.w));
    troubleKs = list.slice(0, 3).map(o => o.k);
  }
  const out = [];
  for (const k of troubleKs) {
    const nd = nodes[k]; if (!nd || !nd.junction) continue;
    let q = 0; for (const e of nd.ins) q += e.qRaw;
    out.push({k, type: JUNC_NAMES[nd.type] || 'Junction', q, w: nd.waitN ? nd.waitSum / nd.waitN : 0});
  }
  return out;
}
/* Parcels a minute (filled green) and jam level (red) for a list of {rate, jam} points. xOf(i) is each point's x as a
   fraction of the width; `ticks` are optional vertical marks: [{x: fraction, label}]. */
function plotSeries(c, pts, xOf, ticks) {
  if (!c || !c.getContext) return;
  const g = c.getContext('2d'), w = c.width, h = c.height;
  g.clearRect(0, 0, w, h);
  if (pts.length < 2) return;
  if (ticks && ticks.length) {
    const soft = (getComputedStyle(document.documentElement).getPropertyValue('--soft') || '#aab').trim();
    g.save(); g.strokeStyle = soft; g.fillStyle = soft; g.globalAlpha = 0.45; g.lineWidth = 1; g.font = '10px system-ui, sans-serif'; g.textBaseline = 'top';
    let lastX = -99;
    for (const t of ticks) {
      const x = Math.round(t.x * w) + 0.5;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
      if (x - lastX > 26) {
        const tw = g.measureText(t.label).width, lx = x + 3 + tw > w ? x - 3 - tw : x + 3;      // flip to the left of the tick at the right edge
        g.globalAlpha = 0.8; g.fillText(t.label, lx, 2); g.globalAlpha = 0.45; lastX = x;
      }
    }
    g.restore();
  }
  const maxRate = Math.max(6, ...pts.map(p => p.rate));
  const line = (fn, col, fill) => {
    g.beginPath();
    pts.forEach((p, i) => { const x = xOf(i) * w, y = h - 3 - fn(p) * (h - 8); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.strokeStyle = col; g.lineWidth = 2; g.stroke();
    if (fill) { g.lineTo(xOf(pts.length - 1) * w, h); g.lineTo(xOf(0) * w, h); g.closePath(); g.fillStyle = fill; g.fill(); }
  };
  line(p => p.rate / maxRate, '#43d17a', 'rgba(67,209,122,.16)');
  line(p => Math.min(1, p.jam * 2), '#ff6a4d', null);
}
function drawSpark() { plotSeries($('spark'), stats.hist, i => i / 89); }
/* the whole run, on the game-over screen, with a tick at the start of each week */
function drawRunChart() {
  const wrap = $('over-chart-wrap'), c = $('over-chart'), pts = stats.runHist;
  if (!c || !wrap) return;
  wrap.hidden = pts.length < 2; if (wrap.hidden) return;
  const T = Math.max(1, pts[pts.length - 1].t);
  plotSeries(c, pts, i => pts[i].t / T, stats.weekMarks.map((t, i) => ({x: t / T, label: 'W' + (i + 2)})).filter(t => t.x > 0 && t.x < 1));
}

/* -------------------------------------------------------------- panels */
function renderPerks() {
  let h = '';
  for (const id in PERKS) {
    const P = PERKS[id], l = perks[id];
    let pips = ''; for (let i = 0; i < P.max; i++) pips += '<i class="' + (i < l ? 'f' : '') + '"></i>';
    h += '<div class="perk' + (l ? ' on' : '') + '"><span class="pic">' + icon(P.icon, 20) + '</span><div><b>' + P.name + '</b><small>' + (l >= P.max ? P.desc(l) : (l ? 'Now: ' + P.desc(l) + ' ' : '') + 'Next: ' + P.desc(l + 1)) + '</small></div><div class="pbuy"><span class="pips">' + pips + '</span>' + buyBtn('perk', id) + '</div></div>';
  }
  setHTML($('perk-list'), h);
  const items = [['road', 'Road tiles'], ['bridge', 'Bridges'], ['park', 'Lots'], ['depot', 'Bays'], ['moto', 'Motorways'], ['light', 'Lights'], ['round', 'Roundabouts'], ['sign', 'Signs']];
  setHTML($('inv-list'), items.map(([k, n]) => '<div class="invrow"><span>' + n + '</span><b>' + inv[k] + '</b></div>').join(''));
}
function renderShop() {
  let h = '';
  for (const it of SHOP) {
    h += '<div class="perk on"><span class="pic">' + icon(it.icon, 20) + '</span><div><b>' + it.name + '</b><small>' + it.desc() + '</small></div><div class="pbuy">' + buyBtn('shop', it.id) + '</div></div>';
  }
  setHTML($('shop-list'), h);
  const P = PRICE, rows = [['Road tile', P.road], ['Bridge (extra)', P.bridge], ['Sign', P.sign], ['Traffic light', P.light], ['Roundabout', P.round], ['Lot', P.park], ['Bay', P.depot], ['Motorway', P.moto]];
  setHTML($('price-list'), '<div class="invrow wide"><span>Rise ' + Math.round(CFG.roadPriceWeeklyRise * 100) + '% a week</span><b>Week ' + week + '</b></div>' +
    rows.map(([n, p]) => '<div class="invrow"><span>' + n + '</span><b>' + fmt$(p) + '</b></div>').join('') +
    '<div class="invrow wide"><span>Earned so far</span><b>' + fmt$(stats ? stats.earned : 0) + '</b></div><div class="invrow wide"><span>Spent so far</span><b>' + fmt$(stats ? stats.spent : 0) + '</b></div>');
}
function renderGoals() {
  const box = $('goal-list'); if (!box) return; box.innerHTML = '';
  $('goal-count').textContent = goalsDone.size + ' of ' + GOALS.length;
  for (const g of GOALS) {
    const done = goalsDone.has(g.id), d = document.createElement('div');
    d.className = 'goal' + (done ? ' done' : '');
    d.innerHTML = '<span class="tick">' + (done ? '✓' : '') + '</span><div><b>' + g.name + '</b><small>' + g.hint + '</small></div>' +
                  (g.reward ? '<em class="prize" title="' + (done ? 'Claimed' : 'Reward') + '">' + rewardText(g.reward) + '</em>' : '');
    box.append(d);
  }
}
function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', t.dataset.tab === name ? 'true' : 'false'));
  document.querySelectorAll('.tabpane').forEach(p => { p.hidden = p.dataset.tab !== name; });
  if (name === 'perks') renderPerks();
  if (name === 'shop') { renderShop(); if (tutorialMode) tutShopOpened = true; }
  if (name === 'goals') renderGoals();
}
function focusOn(wx, wy) { cam.auto = false; follow = false; cam.x = wx; cam.y = wy; cam.z = Math.max(cam.z, 1.8); }

/* ----------------------------------------------------------- inspector */
function closeInspector() { sel = null; follow = false; const e = $('inspect'); if (e) e.hidden = true; refreshUI(); }
function etaOf(c) {
  if (c.state === 'parked') return null;
  if (c.state === 'driving' && c.route) {
    let t = 0;
    for (let i = c.ri; i < c.route.length; i++) {
      const e = c.route[i], sp = carVmax(c, e);
      t += (i === c.ri ? Math.max(0, e.L - c.s) : e.L) / sp + e.q * 1.2;
      const nd = nodes[e.b]; if (nd && nd.type !== 'free' && i < c.route.length - 1) t += nd.type === 'yield' ? 1.6 : 0.8;
    }
    return t;
  }
  return 0;
}
function carStatus(c) {
  const col = COLORS[c.color].name;
  const dst = c.job === 'fetch' ? 'the ' + col + ' store' : c.job === 'return' ? 'home' : 'a waiting bay';
  switch (c.state) {
    case 'parked': return c.loc.t === 'bay' ? 'Waiting in a bay' : 'Parked at home';
    case 'exiting': return c.job ? 'Pulling out — heading to ' + dst : 'Pulling out';
    case 'driving': return c.broken > 0 ? 'Broken down' : c.stopT > 1.5 ? 'Stuck in traffic, heading to ' + dst : 'Heading to ' + dst;
    case 'crossing': return 'Crossing a junction';
    case 'entering': return 'Pulling in';
    case 'loading': return 'Loading parcels';
  }
  return '';
}
/* ---- traffic-light settings (shown when a light is clicked) ----
   The markup holds no live numbers, so the 4x-a-second refresh never rebuilds the
   buttons under the player's finger; live values are written in by bindLightPanel. */
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const LIGHT_PRESETS = [[3, 3], [6, 3], [3, 6], [20, 3], [3, 20]];
function lightSideName(nd, g) {
  const names = [];
  for (const e of nd.ins) if (groupOf(e) === g) { const n = COMPASS[(e.d + 4) % 8]; if (!names.includes(n)) names.push(n); }
  return names.length ? 'From ' + names.join(' & ') : 'No road on this side';
}
function lightPanelHTML(nd) {
  let h = '<p class="line">Sensors give green to the side that has cars. When both sides have cars they take turns.</p>';
  for (let g = 0; g < 2; g++) {
    h += '<div class="ltside"><div class="lthead"><i class="ltdot" id="lt-dot' + g + '"></i><b>' + lightSideName(nd, g) + '</b></div>' +
         '<div class="ltstat" id="lt-st' + g + '"></div>' +
         '<div class="ltrow"><label for="lt-q' + g + '">Cars per turn</label><div class="stepper">' +
         '<button type="button" class="stp" data-g="' + g + '" data-d="-1" aria-label="One fewer car">−</button>' +
         '<input type="number" class="ltnum" id="lt-q' + g + '" min="1" max="' + CFG.lightMax + '" step="1" inputmode="numeric">' +
         '<button type="button" class="stp" data-g="' + g + '" data-d="1" aria-label="One more car">+</button></div></div></div>';
  }
  h += '<div class="ltpre" role="group" aria-label="Ratio presets">' + LIGHT_PRESETS.map(([a, b]) => '<button type="button" class="pre" data-a="' + a + '" data-b="' + b + '" title="' + a + ' cars from the first side to ' + b + ' from the second">' + a + ':' + b + '</button>').join('') + '</div>';
  return h;
}
function bindLightPanel(nd) {
  const q = lightCfg(nd.k), ls = lightState(nd);
  for (let g = 0; g < 2; g++) {
    const inp = $('lt-q' + g), st = $('lt-st' + g), dot = $('lt-dot' + g);
    if (inp && document.activeElement !== inp) inp.value = q[g];
    const green = !ls.allRed && ls.ph === g, n = nd.ldem[g];
    if (st) st.textContent = (green ? 'Green · ' + Math.min(nd.lserved, 999) + ' of ' + q[g] + ' passed' : (ls.allRed && ls.ph === g ? 'Stopping…' : 'Red')) + ' · ' + n + (n === 1 ? ' car' : ' cars') + ' sensed';
    if (dot) dot.className = 'ltdot ' + (green ? 'go' : 'stop');
    if (inp) {
      inp.oninput = () => { const v = parseInt(inp.value, 10); if (v >= 1) setLightQ(nd.k, g, v); };
      inp.onchange = () => { setLightQ(nd.k, g, inp.value); inp.value = q[g]; };
    }
  }
  const ps = $('lt-pass'); if (ps) ps.textContent = 'Passed ' + nd.passed + ' cars in all';
  $('i-body').querySelectorAll('.stp').forEach(b => b.onclick = () => {
    const g = +b.dataset.g; setLightQ(nd.k, g, q[g] + +b.dataset.d); $('lt-q' + g).value = q[g]; sfx('place');
  });
  $('i-body').querySelectorAll('.pre').forEach(b => b.onclick = () => {
    setLightQ(nd.k, 0, +b.dataset.a); setLightQ(nd.k, 1, +b.dataset.b);
    $('lt-q0').value = q[0]; $('lt-q1').value = q[1]; sfx('place');
  });
}
function renderInspector() {
  const box = $('inspect'); if (!sel || !box) return;
  const body = $('i-body'), title = $('i-title'); let html = '';
  if (sel.type === 'car') {
    const c = sel.ref;
    if (!cars.includes(c)) { closeInspector(); return; }
    title.textContent = COLORS[c.color].name + ' ' + BODY[bodyOf(c)].name.toLowerCase();
    const eta = etaOf(c), cap = carCap(c);
    const spdPct = Math.round(((1 + 0.12 * carUp(c, 'spd')) * Math.pow(0.9, carUp(c, 'cap')) * (c.van ? CFG.vanSpeedScale : 1) - 1) * 100);
    html += '<div class="vcard" style="--vc:' + COLORS[c.color].hex + '"><div class="vtype">' + modelName(c) + ' \u00b7 speed ' + (spdPct >= 0 ? '+' : '') + spdPct + '%</div>' +
            '<div class="vslots" title="Parcel slots">' + Array.from({length: cap}, (_, i) => '<i class="' + (i < c.load ? 'full' : i < c.load + (c.job === 'fetch' ? c.want : 0) ? 'claim' : '') + '"></i>').join('') + '</div>' +
            '<div class="vsub"><b>' + c.load + '</b> of ' + cap + ' slots full' + (c.job === 'fetch' ? ' \u00b7 collecting ' + c.want : '') + '</div></div>';
    html += '<p class="line"><b>' + carStatus(c) + '</b></p>';
    html += '<h5 class="ihead2">Upgrades for this vehicle</h5><div class="uprows">';
    for (const t of ['cap', 'spd', 'load']) {
      const u = CAR_UP[t], l = carUp(c, t);
      const nextName = l >= u.max ? 'Fully upgraded' : t === 'cap' ? 'Next: ' + BODY[Math.min(BODY.length - 1, Math.max(bodyOf(c), l + 1))].name + ' \u2014 ' + u.what : t === 'spd' ? 'Next: ' + KIT[l + 1] + ' kit \u2014 ' + u.what : u.what;
      html += '<div class="uprow"><div><b>' + u.name + '</b><small>' + nextName + '</small><span class="pips">' + Array.from({length: u.max}, (_, i) => '<i class="' + (i < l ? 'on' : '') + '"></i>').join('') + '</span></div>' + buyBtn('carup', c.id + ':' + t, '') + '</div>';
    }
    html += '</div>';
    if (eta !== null) html += '<p class="line">Arrives in about <b>' + Math.max(1, Math.round(eta)) + 's</b></p>';
    html += '<p class="line muted">Trips ' + c.trips + ' · waited ' + c.stopAcc.toFixed(0) + 's this trip</p>';
    html += '<div class="acts"><button class="act" id="a-follow" type="button">' + (follow ? 'Stop following' : 'Follow') + '</button>' +
            '<button class="act" id="a-home" type="button"' + (c.state === 'driving' ? '' : ' disabled') + '>Send home</button>' +
            '<button class="act" id="a-reroute" type="button"' + (c.state === 'driving' ? '' : ' disabled') + '>Reroute</button></div>';
  } else if (sel.type === 'building') {
    const b = buildings[sel.i]; if (!b) { closeInspector(); return; }
    title.textContent = COLORS[b.color].name + ' ' + (b.type === 'store' ? STORE_MODELS[Math.min(3, b.tier || 0)].toLowerCase() : ['cottage', 'family home', 'villa'][Math.min(2, b.extra || 0)]);
    if (b.acc < 0) html += '<p class="line warn">Not connected to a road. Lay road on a tile beside it.</p>';
    if (b.type === 'store') {
      const cap = storeCap(b), frac = clamp(b.timer / overflowLimit(), 0, 1);
      html += '<p class="line">Parcels waiting <b>' + b.pins + '</b> of ' + cap + ' bays · ' + b.claimed + ' claimed</p>';
      html += '<span class="bar"><i style="width:' + (frac * 100).toFixed(0) + '%;background:var(--bad)"></i></span>';
      html += '<p class="line muted">Loading docks ' + b.docks.length + '/' + dockCap(b) + ' · handed out ' + b.served + '</p>';
      html += '<p class="line">Pays <b>' + fmtP(payPerParcel(b)) + '</b> a parcel · level ' + b.lvl + ' of ' + CFG.storeUpgradeMax + ' · tow trucks ' + b.trucks + '/' + CFG.towTrucksPerStore + '</p>';
      html += '<div class="acts">' + buyBtn('store', sel.i, 'Upgrade ') + buyBtn('truck', sel.i, 'Hire tow ') + '</div>';
      const heading = cars.filter(c => c.job === 'fetch' && buildings[c.store] === b);
      html += '<div class="rows">' + (heading.length ? heading.map(c => '<button class="row" data-car="' + c.id + '"><b>' + (c.van ? 'Van' : 'Car') + '</b><span>' + (eta2(c)) + '</span></button>').join('') : '<p class="line muted">No cars on the way.</p>') + '</div>';
    } else {
      const home = b.cars.filter(c => c.state === 'parked' && c.loc.t === 'home').length;
      html += '<div class="fore">' + Array.from({length: houseCap(b)}, (_, i) => '<i class="' + (i < b.carsN ? (i < home ? 'home' : 'out') : '') + '" style="--vc:' + COLORS[b.color].hex + '"></i>').join('') + '</div>';
      html += '<p class="line">Cars <b>' + b.carsN + '</b> of ' + houseCap(b) + ' \u00b7 <b>' + home + '</b> at home, ' + (b.carsN - home) + ' out</p>';
      html += '<div class="uprow"><div><b>Buy a car</b><small>' + ((b.extra || 0) >= CFG.carBuyExtraMax ? 'Forecourt full \u2014 add a lot for more room' : 'Each extra car here costs more than the last') + '</small></div>' + buyBtn('carbuy', sel.i, '') + '</div>';
      html += '<h5 class="ihead2">Vehicles \u2014 click one to upgrade it</h5>';
      html += '<div class="rows">' + b.cars.map(c => '<button class="row" data-car="' + c.id + '"><b>' + modelName(c).replace(/^./, m => m.toUpperCase()) + (carUpTotal(c) ? ' <em class="upb">+' + carUpTotal(c) + '</em>' : '') + '</b><span>' + carCap(c) + ' slots \u00b7 ' + carStatus(c) + '</span></button>').join('') + '</div>';
    }
  } else if (sel.type === 'tile') {
    const nd = nodes[sel.k];
    if (!nd) { closeInspector(); return; }
    if (tutorialMode) { tutInspected.add(nd.type); checkTutorial(); }
    const names = {yield: 'Give-way junction', light: 'Traffic light', round: 'Roundabout', free: 'Road'};
    title.textContent = names[nd.type];
    html += '<p class="line">' + (nd.junction ? 'Roads meeting: <b>' + nd.deg + '</b>' : 'A plain stretch of road.') + '</p>';
    if (nd.type === 'light') html += lightPanelHTML(nd);
    if (nd.type === 'yield') html += '<p class="line">Lets <b>' + (CFG.batchSize + perks.marshal + nd.lvl) + '</b> cars through from one side, then the next side.</p>';
    if (nd.type === 'round') html += '<p class="line">Up to <b>' + roundCapOf(nd) + '</b> cars circulate at once.</p>';
    html += nd.type === 'light' ? '<p class="line muted" id="lt-pass"></p>'
                                : '<p class="line muted">Waiting now ' + nd.qNow + ' · passed ' + nd.passed + ' cars</p>';
    if (nd.junction) html += '<div id="i-junc"></div>';       // filled below on its own, so the light panel above isn't rebuilt when cash changes
  }
  setHTML(body, html);
  if (sel.type === 'tile' && nodes[sel.k] && nodes[sel.k].type === 'light') bindLightPanel(nodes[sel.k]);
  const jb = $('i-junc');
  if (jb && sel.type === 'tile' && nodes[sel.k]) {
    const nd = nodes[sel.k], nx = nd.lvl < CFG.junctionUpgradeMax ? 'Next: ' + juncEffect(nd, nd.lvl + 1) + '.' : 'Top level: ' + juncEffect(nd, nd.lvl) + '.';
    setHTML(jb, '<p class="line">Junction level <b>' + nd.lvl + '</b> of ' + CFG.junctionUpgradeMax + '. ' + nx + '</p><div class="acts">' + buyBtn('junction', sel.k, 'Upgrade ') + '</div>');
  }
  box.hidden = false;
  const f = $('a-follow'); if (f) f.onclick = () => { follow = !follow; if (follow) cam.auto = false; renderInspector(); refreshUI(); };
  const h = $('a-home'); if (h) h.onclick = () => { const c = sel.ref; if (c.job !== 'return') giveUp(c); renderInspector(); };
  const r = $('a-reroute'); if (r) r.onclick = () => { const c = sel.ref; if (c.state === 'driving') { const nx = c.route && c.route[c.ri + 1]; solveBudget = Math.max(solveBudget, 2); replan(c, nx); toast('Rerouted'); } };
  body.querySelectorAll('[data-car]').forEach(b => b.onclick = (() => { const c = cars.find(x => x.id === +b.dataset.car); if (c) { sel = {type: 'car', ref: c}; renderInspector(); } }));
}
function eta2(c) { const e = etaOf(c); return e === null ? carStatus(c) : Math.max(1, Math.round(e)) + 's away'; }
function selectAt(sx, sy) {
  const p = toWorld(sx, sy), R = Math.max(12, 16 / cam.z);
  let best = null, bd = R;
  for (const c of cars) { const d = Math.hypot(c.x - p.x, c.y - p.y); if (d < bd) { bd = d; best = c; } }
  if (best) { sel = {type: 'car', ref: best}; }
  else {
    const k = cellAt(sx, sy);
    if (k >= 0 && bAt[k] >= 0) sel = {type: 'building', i: bAt[k]};
    else if (k >= 0 && nodes[k]) sel = {type: 'tile', k};
    else { closeInspector(); return; }
  }
  renderInspector(); refreshUI();
}

/* -------------------------------------------------------------- modals */
let modalOpen = false, rerollLeft = 1, lastGrew = false;
function openModal(id) { $(id).hidden = false; modalOpen = true; }
function closeModal(id) { $(id).hidden = true; modalOpen = !!document.querySelector('.modal:not([hidden])'); }
function offerUpgrade(grew) {
  lastGrew = grew; rerollLeft = 1; running = false; openModal('m-upgrade'); renderUpgrade();
  refreshUI();
}
let upRoads = 12;
function renderUpgrade(reroll) {
  if (!reroll) upRoads = CFG.roadsPerWeekMin + Math.floor(Math.random() * (CFG.roadsPerWeekMax - CFG.roadsPerWeekMin + 1));
  const pool = UPGRADES.filter(u => !u.avail || u.avail());
  const picks = [];
  const perkPool = pool.filter(u => u.kind === 'perk'), itemPool = pool.filter(u => u.kind === 'item');
  const take = (arr) => { if (!arr.length) return; const u = arr.splice(Math.floor(Math.random() * arr.length), 1)[0]; picks.push(u); const i = pool.indexOf(u); if (i >= 0) pool.splice(i, 1); };
  take(perkPool); take(itemPool);
  while (picks.length < 3 && pool.length) { const u = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]; picks.push(u); }
  $('up-title').textContent = 'Week ' + week;
  $('up-sub').textContent = (lastGrew ? 'The city now reaches ' + span + ' × ' + span + ' tiles. ' : 'The city has reached its limits. ') + 'Pick one reward.';
  const wrap = $('up-picks'); wrap.innerHTML = '';
  for (const p of picks) {
    const b = document.createElement('button'); b.className = 'pick'; b.type = 'button';
    const perk = p.kind === 'perk' ? PERKS[p.perk] : null;
    const lvl = perk ? '<em class="tag">Permanent · level ' + (perks[p.perk] + 1) + ' of ' + perk.max + '</em>' : '<em class="tag alt">Item</em>';
    b.innerHTML = '<span class="pic">' + icon(p.icon, 30) + '</span>' + lvl + '<b>' + p.name + '</b><i>' + p.desc() + '</i><small>+ ' + upRoads + ' road tiles</small>';
    b.addEventListener('click', () => {
      inv.road += upRoads; p.apply(); sfx('upgrade');
      closeModal('m-upgrade'); running = true; refreshUI(); renderPerks();
    });
    wrap.append(b);
  }
  const rb = $('btn-reroll'); rb.disabled = rerollLeft <= 0; rb.textContent = rerollLeft > 0 ? 'Shuffle the offer (once)' : 'Already shuffled';
  const first = document.querySelector('#up-picks .pick'); if (first && first.focus) first.focus();
}
function showGameOver(why) {
  $('over-why').textContent = why;
  $('over-score').textContent = score;
  $('over-best').textContent = 'parcels delivered · best on ' + DIFF.label + ': ' + best;
  $('over-stats').innerHTML = [['Weeks', week], ['Trips', stats.trips], ['Average wait per trip', stats.avgWait.toFixed(1) + 's'], ['Tow trucks', stats.tows], ['Breakdowns', stats.breakdowns], ['Cars', cars.length]]
    .concat(stats.ambOk + stats.ambLate + stats.ambFail ? [['Ambulances on time', stats.ambOk + ' of ' + (stats.ambOk + stats.ambLate + stats.ambFail)]] : [])
    .map(([a, b]) => '<div><span>' + a + '</span><b>' + b + '</b></div>').join('');
  openModal('m-over');
  drawRunChart();
}

/* ---------------------------------------------------------------- input */
let startDiff = 'standard';       // difficulty highlighted on the start screen (the running game keeps diffKey until a new one starts)
function showStartBest() {
  const b = bestFor(startDiff), lb = DIFFS[startDiff].label;
  $('start-best').textContent = b ? 'Best on ' + lb + ': ' + b + ' parcels' : 'No games yet on ' + lb;
}
let drawing = false, lastCell = -1, panning = false, panFrom = null, spaceHeld = false;
const pointers = new Map(); let pinch = null;
/* On touch, the first finger doesn't act at once: a second finger may be about to arrive to pan or
   pinch. It commits after TOUCH_HOLD ms, or the moment that finger moves, or when it lifts. */
const TOUCH_HOLD = 80, TOUCH_SLOP = 6;
let pendingTouch = null;
function commitPending() {
  const pt = pendingTouch; if (!pt) return;
  clearTimeout(pt.timer); pendingTouch = null;
  if (pointers.size >= 2 || !pointers.has(pt.id)) return;
  undoGroup++; drawing = true; applyTool(pt.k, false); lastCell = pt.k;
}
function cancelPending() { if (pendingTouch) { clearTimeout(pendingTouch.timer); pendingTouch = null; } }
const midOf = () => { const [a, b] = [...pointers.values()]; return {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y)}; };
function evPos(e) { const r = cv.getBoundingClientRect(); return {x: e.clientX - r.left, y: e.clientY - r.top}; }
function bindInput() {
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    if (over || modalOpen) return;
    cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
    const p = evPos(e); pointers.set(e.pointerId, p);
    if (pointers.size === 2) {
      cancelPending();
      const m = midOf();
      pinch = {d: Math.max(1, m.d), z: cam.z, mx: m.x, my: m.y}; drawing = false; panning = false; cam.auto = false; follow = false; return;
    }
    if (e.button === 1 || e.button === 2 || spaceHeld || e.shiftKey) { panning = true; panFrom = p; cam.auto = false; follow = false; return; }
    if (tool === 'select') { selectAt(p.x, p.y); return; }
    const k0 = cellAt(p.x, p.y);
    if (e.pointerType === 'touch') {
      pendingTouch = {id: e.pointerId, k: k0, x: p.x, y: p.y, timer: setTimeout(commitPending, TOUCH_HOLD)};
      return;
    }
    undoGroup++; drawing = true; applyTool(k0, false); lastCell = k0;
  });
  cv.addEventListener('pointermove', e => {
    const p = evPos(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
    hoverCell = cellAt(p.x, p.y);
    if (pinch && pointers.size >= 2) {
      // Zoom about the midpoint and pan with it: the world point that was under the old midpoint
      // is put back under the new one, exactly as the wheel handler anchors on the cursor.
      const m = midOf(), before = toWorld(pinch.mx, pinch.my);
      cam.z = clamp(pinch.z * m.d / pinch.d, CFG.zoomMin, CFG.zoomMax);
      cam.x = before.x - (m.x - W / 2) / cam.z; cam.y = before.y - (m.y - H / 2) / cam.z;
      pinch.mx = m.x; pinch.my = m.y; cam.auto = false; follow = false; return;
    }
    if (pendingTouch && pendingTouch.id === e.pointerId) {
      if (Math.hypot(p.x - pendingTouch.x, p.y - pendingTouch.y) < TOUCH_SLOP) return;   // finger jitter, not a drag
      commitPending();
    }
    if (panning) { cam.x -= (p.x - panFrom.x) / cam.z; cam.y -= (p.y - panFrom.y) / cam.z; panFrom = p; return; }
    if (drawing) { const k = hoverCell; if (k >= 0 && k !== lastCell) { stepTo(lastCell, k); lastCell = k; } }
  });
  const up = e => {
    if (pendingTouch && pendingTouch.id === e.pointerId) { if (e.type === 'pointerup') commitPending(); else cancelPending(); }   // a quick tap still places
    pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; drawing = false; panning = false; lastCell = -1;
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', () => { hoverCell = -1; });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const p = evPos(e), before = toWorld(p.x, p.y);
    cam.z = clamp(cam.z * Math.exp(-e.deltaY * 0.0016), CFG.zoomMin, CFG.zoomMax);
    cam.x = before.x - (p.x - W / 2) / cam.z; cam.y = before.y - (p.y - H / 2) / cam.z;
    cam.auto = false; follow = false;
  }, {passive: false});
  mini.addEventListener('pointerdown', e => {
    const r = mini.getBoundingClientRect(), m = mini._map; if (!m) return;
    const fx_ = (e.clientX - r.left) / r.width * mini.width, fy_ = (e.clientY - r.top) / r.height * mini.height;
    focusOn((fx_ / m.k + m.x0) * CELL, (fy_ / m.k + m.x0) * CELL);
  });
  document.addEventListener('keydown', e => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    const k = e.key;
    if (k === ' ') { spaceHeld = true; e.preventDefault(); return; }
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (k === 'Escape') { closeInspector(); $('menu').hidden = true; if (!$('m-help').hidden) closeModal('m-help'); if (!$('m-explain').hidden) closeModal('m-explain'); if (!$('m-feedback').hidden) closeModal('m-feedback'); setTool('select'); return; }
    if (modalOpen) return;
    const n = parseInt(k, 10);
    if (n >= 1 && n <= 9) { const t = TOOLS[n - 1]; setTool(t.id === 'signs' ? (isSignTool(tool) ? tool : 'only-forward') : t.id); return; }
    switch (k.toLowerCase()) {
      case 'p': togglePlay(); break;
      case 'e': setTool('erase'); break;
      case 'u': setTool('upgrade'); break;
      case 'y': setTool('tow'); break;
      case 'h': showHeat = !showHeat; refreshUI(); break;
      case 'g': showGrid = !showGrid; syncPrefUI(); savePrefs(); break;
      case 'f': if (sel && sel.type === 'car') { follow = !follow; cam.auto = !follow ? cam.auto : false; refreshUI(); renderInspector(); } break;
      case 'm': toggleMute(); break;
      case 'c': snapshot(); break;
      case 't': setTheme(theme === 'dark' ? 'light' : 'dark'); pathCache.ver = -1; break;
      case 'tab': break;
      case '0': case 'home': camReset(false); break;
      case '+': case '=': cycleSpeed(1); break;
      case '-': cycleSpeed(-1); break;
      case '?': openModal('m-help'); break;
      case 'z': undo(); break;
    }
  });
  document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.dataset && e.target.dataset.focusTile) { e.preventDefault(); e.target.click(); } });
  document.addEventListener('keyup', e => { if (e.key === ' ') spaceHeld = false; });
  $('i-close').addEventListener('click', closeInspector);
  $('btn-play').addEventListener('click', togglePlay);
  document.querySelectorAll('#speed-seg button').forEach(b => b.addEventListener('click', () => { speed = +b.dataset.speed; refreshUI(); }));
  bindTips(); bindSettings();
  $('btn-heat').addEventListener('click', () => { showHeat = !showHeat; refreshUI(); });
  $('btn-side').addEventListener('click', () => { keepLeft = !keepLeft; laneSign = keepLeft ? -1 : 1; pathCache.ver = -1; refreshUI(); });
  $('btn-sound').addEventListener('click', toggleMute);
  $('btn-theme').addEventListener('click', () => { setTheme(theme === 'dark' ? 'light' : 'dark'); pathCache.ver = -1; });
  $('btn-help').addEventListener('click', () => openModal('m-help'));
  $('btn-tutorial').addEventListener('click', () => openModal('m-help'));
  $('btn-undo').addEventListener('click', undo);
  $('btn-redo').addEventListener('click', redo);
  $('btn-fit').addEventListener('click', () => camReset(false));
  $('btn-full').addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', syncFullscreen);
  document.addEventListener('webkitfullscreenchange', syncFullscreen);
  syncFullscreen();
  $('btn-feedback').addEventListener('click', () => { $('menu').hidden = true; $('btn-menu').setAttribute('aria-expanded', 'false'); openFeedback(); });
  $('btn-feedback-s').addEventListener('click', openFeedback);
  bindFeedback();
  $('tut-min').addEventListener('click', () => setTutMin(!$('tut-panel').classList.contains('min')));
  $('tut-coach').addEventListener('click', () => { if (compactUI()) $('tut-coach').classList.toggle('full'); });
  $('btn-snap').addEventListener('click', snapshot);
  $('btn-export').addEventListener('click', () => { $('menu').hidden = true; exportCity(); });
  $('btn-import').addEventListener('click', () => $('file-import').click());
  $('file-import').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (f.size > 5e6) { toast('Not a Junction save', 'warn'); return; }
    const r = new FileReader();
    r.onload = () => importCity(String(r.result)); r.onerror = () => toast('Could not read that file', 'warn');
    r.readAsText(f);
  });
  $('btn-menu').addEventListener('click', () => { const m = $('menu'); m.hidden = !m.hidden; $('btn-menu').setAttribute('aria-expanded', m.hidden ? 'false' : 'true'); if (!m.hidden) renderPaletteUI(); });
  document.addEventListener('pointerdown', e => {
    const m = $('menu'); if (m.hidden) return;
    if (e.target.closest && (e.target.closest('#menu') || e.target.closest('#btn-menu'))) return;
    m.hidden = true; $('btn-menu').setAttribute('aria-expanded', 'false');
  });
  $('btn-panel').addEventListener('click', () => { $('app').classList.toggle('panel-off'); layout(); });
  $('opt-night').addEventListener('change', e => { nightOn = e.target.checked; savePrefs(); });
  $('opt-grid').addEventListener('change', e => { showGrid = e.target.checked; savePrefs(); });
  $('opt-fx').addEventListener('change', e => { fxOn = e.target.checked; savePrefs(); });
  $('btn-restart').addEventListener('click', () => { $('menu').hidden = true; showStartBest(); openModal('m-start'); running = false; refreshUI(); });
  $('help-close').addEventListener('click', () => closeModal('m-help'));
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
  $('btn-reroll').addEventListener('click', () => { if (rerollLeft > 0) { rerollLeft--; renderUpgrade(true); } });
  // every buy button in the game (side panel, store rows, inspector) is wired here
  const buyNow = b => {
    if (!b || b.disabled || over) return;
    doBuy(b.dataset.kind, b.dataset.id);
    renderPerks(); if (!$('tab-shop-pane').hidden) renderShop(); refreshHud(); if (sel) renderInspector();
  };
  document.addEventListener('pointerdown', e => { const b = e.target.closest && e.target.closest('[data-kind]'); if (b && e.button === 0) { e.preventDefault(); buyNow(b); } });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-kind]'); if (b && e.detail === 0) buyNow(b);
    const f = e.target.closest && e.target.closest('[data-focus]'); if (f) { const s = buildings[+f.dataset.focus]; if (s) focusOn(tx(s.k), ty(s.k)); }
    const ft = e.target.closest && e.target.closest('[data-focus-tile]');
    if (ft) { const k = +ft.dataset.focusTile; if (nodes[k]) { focusOn(tx(k), ty(k)); sel = {type: 'tile', k}; renderInspector(); refreshUI(); } }
  });
  $('btn-again').addEventListener('click', () => { closeModal('m-over'); showStartBest(); openModal('m-start'); });
  const dp = $('diff-picks'); dp.innerHTML = '';
  for (const k in DIFFS) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'diff'; b.dataset.id = k; b.setAttribute('aria-pressed', k === startDiff ? 'true' : 'false');
    b.innerHTML = '<b>' + DIFFS[k].label + '</b><small>' + DIFFS[k].note + '</small>';
    b.addEventListener('click', () => { startDiff = k; dp.querySelectorAll('.diff').forEach(x => x.setAttribute('aria-pressed', x.dataset.id === k ? 'true' : 'false')); showStartBest(); });
    dp.append(b);
  }
  $('btn-start').addEventListener('click', () => {
    if (window.JunctionOnline && window.JunctionOnline.ready) { window.JunctionOnline.openSaves('new'); return; }
    closeModal('m-start'); resetGame(startDiff); running = true; refreshHud(); layout();
  });
  $('btn-resume').addEventListener('click', () => { if (loadGame()) { closeModal('m-start'); running = true; refreshHud(); layout(); } else toast('No saved city found', 'warn'); });
  $('btn-try-tutorial').addEventListener('click', () => { closeModal('m-start'); startTutorial(); refreshHud(); layout(); });
  $('tut-exit').addEventListener('click', exitTutorial);
  $('tut-open-explain').addEventListener('click', tutOpenExplainer);
  $('explain-start').addEventListener('click', tutStartBuilding);
  $('tut-rush').addEventListener('click', tutTriggerRush);
  $('tut-rain').addEventListener('click', tutTriggerRain);
  $('tut-break').addEventListener('click', tutTriggerBreakdown);
  $('tut-close').addEventListener('click', tutTriggerClosure);
  $('tut-amb').addEventListener('click', tutTriggerAmb);
  $('tut-contract').addEventListener('click', tutTriggerContract);
  window.addEventListener('resize', layout);
  window.addEventListener('beforeunload', saveGame);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(true); });
}
function togglePlay() { if (over || modalOpen || spectating) return; running = !running; refreshUI(); }
function cycleSpeed(d) { if (spectating) return; const s = CFG_SPEEDS; let i = s.indexOf(speed); i = (i + d + s.length) % s.length; speed = s[i]; refreshUI(); }
const CFG_SPEEDS = [0.5, 1, 2, 3];
function toggleMute() { muted = !muted; savePrefs(); refreshUI(); }
/* settings that should outlive a reload */
const PREFS_KEY = 'junction2-prefs';
function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify({muted, nightOn, showGrid, fxOn, colorMode, customHex, showSymbols})); } catch (e) {} }
function syncPrefUI() {
  const set = (id, v) => { const el = $(id); if (el) el.checked = !!v; };
  set('opt-night', nightOn); set('opt-grid', showGrid); set('opt-fx', fxOn); set('opt-symbols', showSymbols);
}
function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY));
    if (p && typeof p === 'object') {
      if (typeof p.muted === 'boolean') muted = p.muted;
      if (typeof p.nightOn === 'boolean') nightOn = p.nightOn;
      if (typeof p.showGrid === 'boolean') showGrid = p.showGrid;
      if (typeof p.fxOn === 'boolean') fxOn = p.fxOn;
      if (typeof p.showSymbols === 'boolean') showSymbols = p.showSymbols;
      if (typeof p.colorMode === 'string' && PALETTES[p.colorMode]) colorMode = p.colorMode;
      if (Array.isArray(p.customHex) && p.customHex.length === COLORS.length && p.customHex.every(h => /^#[0-9a-f]{6}$/i.test(h))) customHex = p.customHex.slice();
    }
  } catch (e) {}
  applyPalette();
  syncPrefUI();
}
/* ------------------------------------------------ settings: colours and symbols */
function renderPaletteUI() {
  const pk = $('pal-picks'), sw = $('pal-swatches'); if (!pk || !sw) return;
  pk.innerHTML = '';
  for (const id in PALETTES) {
    const pal = PALETTES[id], hexes = pal.cols ? pal.cols.map(c => c[1]) : customHex;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'palpick'; b.dataset.pal = id;
    b.setAttribute('aria-pressed', id === colorMode ? 'true' : 'false');
    b.innerHTML = '<span class="dots">' + hexes.map(h => '<i style="background:' + h + '"></i>').join('') + '</span><b>' + pal.label + '</b><small>' + pal.note + '</small>';
    b.addEventListener('click', () => { colorMode = id; applyPalette(); savePrefs(); renderPaletteUI(); refreshHud(); drawMini(); });
    pk.append(b);
  }
  sw.innerHTML = '';
  const slots = document.createElement('div'); slots.className = 'slotrow'; slots.setAttribute('role', 'tablist'); slots.setAttribute('aria-label', 'Colour slots');
  COLORS.forEach((c, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'slot'; b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', i === palSlot ? 'true' : 'false');
    b.innerHTML = '<i style="background:' + c.hex + '"></i><span>' + c.name + '</span>';
    b.addEventListener('click', () => { palSlot = i; renderPaletteUI(); });
    slots.append(b);
  });
  sw.append(slots);
  const lib = document.createElement('div'); lib.className = 'libgrid';
  const cur = COLORS[palSlot].hex.toLowerCase(), usedBy = {};
  COLORS.forEach((c, i) => { usedBy[c.hex.toLowerCase()] = i; });
  const mkSwatch = (name, hex) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'libsw'; b.style.background = hex;
    const u = usedBy[hex];
    b.dataset.tip = name.replace(/^./, ch => ch.toUpperCase());
    if (u !== undefined && u !== palSlot) b.dataset.sub = 'In use as colour ' + (u + 1) + ' \u2014 picking it swaps the two';
    b.setAttribute('aria-label', name + (hex === cur ? ', selected' : ''));
    b.setAttribute('aria-pressed', hex === cur ? 'true' : 'false');
    if (u !== undefined && u !== palSlot) { b.dataset.used = '1'; b.innerHTML = '<em>' + (u + 1) + '</em>'; }
    b.addEventListener('click', () => pickLibColour(hex));
    return b;
  };
  for (const g of COLOR_LIBRARY) {
    if (g.more && !libExpanded) continue;
    const h = document.createElement('h5'); h.textContent = g.group; lib.append(h);
    const row = document.createElement('div'); row.className = 'librow';
    for (const [name, hex] of g.cols) row.append(mkSwatch(name, hex));
    lib.append(row);
  }
  sw.append(lib);
  const moreGroup = COLOR_LIBRARY.find(g => g.more);
  if (moreGroup && !libExpanded) {
    const mb = document.createElement('button'); mb.type = 'button'; mb.className = 'linkbtn libmore';
    mb.textContent = 'See ' + moreGroup.cols.length + ' more \u2014 ' + moreGroup.group.toLowerCase() + ' colours';
    mb.addEventListener('click', () => { libExpanded = true; renderPaletteUI(); });
    sw.append(mb);
  }
}
let palSlot = 0, libExpanded = false;
function pickLibColour(hex) {
  const cur = COLORS.map(c => c.hex.toLowerCase());
  if (colorMode !== 'custom') { customHex = cur.slice(); colorMode = 'custom'; }
  const other = customHex.findIndex((h, j) => j !== palSlot && h.toLowerCase() === hex);
  if (other >= 0) customHex[other] = customHex[palSlot];          // taken by another slot: swap rather than duplicate
  customHex[palSlot] = hex;
  applyPalette(); savePrefs(); renderPaletteUI(); refreshHud(); drawMini();
}
function bindSettings() {
  const sy = $('opt-symbols'); if (sy) sy.addEventListener('change', e => { showSymbols = e.target.checked; savePrefs(); });
  const rs = $('pal-reset'); if (rs) rs.addEventListener('click', () => { colorMode = 'standard'; customHex = PALETTES.standard.cols.map(c => c[1]); applyPalette(); savePrefs(); renderPaletteUI(); refreshHud(); drawMini(); });
}
/* ------------------------------------------------ tooltips: one styled tip for every control */
function bindTips() {
  const tip = $('tip'); if (!tip) return;
  let cur = null, timer = 0;
  const show = el => {
    const label = el.dataset.tip; if (!label) return;
    let h = '<b></b>'; tip.innerHTML = h; tip.querySelector('b').textContent = label;
    if (el.dataset.key) { const k = document.createElement('kbd'); k.textContent = el.dataset.key; tip.append(k); }
    if (el.dataset.sub) { const sm = document.createElement('small'); sm.textContent = el.dataset.sub; tip.append(sm); }
    tip.hidden = false;
    const r = el.getBoundingClientRect(), sr = $('stage').getBoundingClientRect(), tr = tip.getBoundingClientRect(), pos = el.dataset.tipPos || 'below';
    let x, y;
    if (pos === 'right') { x = r.right + 10; y = r.top + r.height / 2 - tr.height / 2; }
    else if (pos === 'above') { x = r.left + r.width / 2 - tr.width / 2; y = r.top - tr.height - 8; }
    else { x = r.left + r.width / 2 - tr.width / 2; y = r.bottom + 8; }
    x = clamp(x - sr.left, 6, sr.width - tr.width - 6); y = clamp(y - sr.top, 6, sr.height - tr.height - 6);
    tip.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)'; tip.dataset.pos = pos;
  };
  const hide = () => { clearTimeout(timer); cur = null; tip.hidden = true; };
  document.addEventListener('pointerover', e => {
    if (e.pointerType === 'touch') return;
    let el = e.target.closest && e.target.closest('[data-tip],[title]');
    if (el && el.closest('#m-start,#m-over,#m-help,#m-explain,#m-upgrade')) el = null;
    if (el && el.hasAttribute('title')) {                     // adopt plain titles into the styled tip
      const t = el.getAttribute('title'), m = t.match(/^(.*?)\s*\(([^()]{1,10})\)$/);
      el.dataset.tip = m ? m[1] : t; if (m) el.dataset.key = m[2];
      if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', el.dataset.tip);
      el.removeAttribute('title');
      if (!el.dataset.tipPos && el.closest('#dock')) el.dataset.tipPos = 'right';
      if (!el.dataset.tipPos && el.closest('.inspect')) el.dataset.tipPos = 'above';
    }
    if (el === cur) return;
    clearTimeout(timer); tip.hidden = true; cur = el;
    if (el) timer = setTimeout(() => { if (cur === el && document.contains(el)) show(el); }, 380);
  });
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('keydown', hide, true);
  window.addEventListener('blur', hide);
}
/* Save a Blob as a file. Claude's own downloads capability is tried first; anywhere else a temporary <a download> does it. */
async function saveFile(blob, filename) {
  try {
    const dl = (typeof window !== 'undefined' && window.claude && window.claude.use) ? await window.claude.use('downloads') : null;
    if (dl) { await dl.save({filename, data: blob}); return true; }
  } catch (e) { /* fall through to the ordinary browser download */ }
  try {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); if (a.parentNode) a.parentNode.removeChild(a); }, 2000);
    return true;
  } catch (e) { return false; }
}
function snapshot() {
  try {
    draw();
    cv.toBlob(async b => {
      if (!b) { toast('Snapshot unavailable here', 'warn'); return; }
      const ok = await saveFile(b, 'junction-week-' + week + '.png');
      if (ok) toast('Snapshot saved'); else toast('Snapshot unavailable here', 'warn');
    });
  } catch (e) {}
}

/* ---- export and import a whole city ---- */
function exportCity() {
  if (!started || over) { toast('Nothing to export yet', 'warn'); return; }
  const blob = new Blob([JSON.stringify(serialize())], {type: 'application/json'});
  saveFile(blob, 'junction-city-week-' + week + '.json').then(ok => { if (ok) toast('City exported'); else toast('Export unavailable here', 'warn'); });
}
const INV_KEYS = ['road', 'bridge', 'moto', 'light', 'round', 'sign', 'park', 'depot'];
/* is this parsed JSON a Junction save that loadGame can safely read? */
function validSave(d) {
  if (!d || typeof d !== 'object' || ![1, 2, 3].includes(d.v)) return false;
  for (const k of ['water', 'road', 'sign', 'special', 'buildings', 'parks', 'depots', 'motorways']) if (!Array.isArray(d[k])) return false;
  const tile = k => Number.isInteger(k) && k >= 0 && k < N, num = v => typeof v === 'number' && isFinite(v);
  if (!d.water.every(tile) || !d.road.every(tile) || !d.depots.every(tile)) return false;
  if (!d.sign.every(p => Array.isArray(p) && tile(p[0]) && typeof p[1] === 'string')) return false;
  if (!d.special.every(p => Array.isArray(p) && tile(p[0]) && (p[1] === 'light' || p[1] === 'round'))) return false;
  if (d.links !== undefined && !(Array.isArray(d.links) && d.links.every(p => Array.isArray(p) && tile(p[0]) && Number.isInteger(p[1])))) return false;
  if (!d.buildings.every(b => b && tile(b.k) && (b.type === 'house' || b.type === 'store') && Number.isInteger(b.color) && b.color >= 0 && b.color < COLORS.length && num(b.pins) && (b.type !== 'house' || Array.isArray(b.vans)))) return false;
  if (!d.parks.every(p => p && tile(p.k) && Number.isInteger(p.b) && p.b >= 0 && p.b < d.buildings.length)) return false;
  if (!d.motorways.every(m => m && tile(m.a) && tile(m.b) && num(m.len))) return false;
  if (!['score', 'week', 'weekTimer', 'span', 'houseTimer', 'storeTimer', 'clock', 'carCapacity'].every(k => num(d[k]))) return false;
  if (d.span < 3 || d.span > MAXD || !d.inv || typeof d.inv !== 'object') return false;
  return true;
}
function importCity(text) {
  let d = null; try { d = JSON.parse(text); } catch (e) {}
  if (!validSave(d)) { toast('Not a Junction save', 'warn'); return false; }
  for (const k of INV_KEYS) if (!isFinite(d.inv[k])) d.inv[k] = 0;
  const before = (started && !over) ? serialize() : null;       // so a file that still fails to load leaves the open city alone
  if (!loadGame(d)) {
    if (before) loadGame(before);
    toast('Not a Junction save', 'warn'); return false;
  }
  saveGame();                                                   // the imported city becomes the saved one
  $('menu').hidden = true; closeModal('m-start'); closeModal('m-over');
  $('btn-resume').hidden = !hasSave();
  running = true; refreshHud(); layout(); refreshUI();
  toast('City imported — week ' + week, 'good');
  return true;
}

/* ------------------------------------------------------- full screen */
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
function isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}
function fsFallback() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  toast(ios ? 'For full screen on iPhone, tap Share \u2192 Add to Home Screen, then open Junction from there.' : 'Full screen isn\u2019t available in this browser.', 'warn');
}
function toggleFullscreen() {
  const el = document.documentElement;
  try {
    if (fsElement()) {
      const ex = document.exitFullscreen || document.webkitExitFullscreen;
      if (ex) { const p = ex.call(document); if (p && p.catch) p.catch(() => {}); }
      return;
    }
    if (el.requestFullscreen) { const p = el.requestFullscreen({navigationUI: 'hide'}); if (p && p.catch) p.catch(fsFallback); }
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else fsFallback();
  } catch (e) { fsFallback(); }
}
function syncFullscreen() {
  const b = $('btn-full'); if (!b) return;
  const on = !!fsElement();
  b.hidden = isStandalone();                        // a home-screen app is already full screen
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
  const label = on ? 'Exit full screen' : 'Full screen';
  b.setAttribute('aria-label', label);
  if (b.hasAttribute('title')) b.setAttribute('title', label); else b.dataset.tip = label;
  setTimeout(layout, 80);
}

/* ---------------------------------------------------------- feedback */
const FEEDBACK_TO = 'support.jamesnortinen@gmail.com';
let fbKind = 'Bug';
function openFeedback() {
  $('fb-err').textContent = '';
  openModal('m-feedback');
  setTimeout(() => { const t = $('fb-text'); if (t && !compactUI()) t.focus(); }, 60);
}
function feedbackDetails() {
  const lines = ['', '\u2014', 'Junction ' + (($('menu').querySelector('.ver') || {}).textContent || '').replace(/^Junction\s*/, ''),
    'Screen: ' + window.innerWidth + '\u00d7' + window.innerHeight + ' @' + (window.devicePixelRatio || 1) + 'x' + (compactUI() ? ' (mobile layout)' : ''),
    'Browser: ' + navigator.userAgent];
  if (started) lines.push('Game: ' + (tutorialMode ? 'tutorial step ' + (tutStage + 1) : (DIFF.label || diffKey) + ', week ' + week + ', ' + score + ' parcels'));
  return lines.join('\n');
}
function bindFeedback() {
  document.querySelectorAll('#fb-kind button').forEach(b => b.addEventListener('click', () => {
    fbKind = b.dataset.kindFb;
    document.querySelectorAll('#fb-kind button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
  }));
  $('fb-close').addEventListener('click', () => closeModal('m-feedback'));
  $('fb-send').addEventListener('click', () => {
    const msg = $('fb-text').value.trim();
    if (msg.length < 3) { $('fb-err').textContent = 'Write a few words first.'; return; }
    const body = msg + ($('fb-device').checked ? '\n' + feedbackDetails() : '');
    const url = 'mailto:' + FEEDBACK_TO + '?subject=' + encodeURIComponent('Junction ' + fbKind.toLowerCase() + ' report') + '&body=' + encodeURIComponent(body);
    const a = document.createElement('a'); a.href = url; a.rel = 'noopener'; a.style.display = 'none'; document.body.append(a); a.click(); a.remove();
    $('fb-err').textContent = '';
    setTimeout(() => { closeModal('m-feedback'); $('fb-text').value = ''; toast('Thanks! If no email app opened, use Copy address and email us directly.', 'good'); }, 400);
  });
  $('fb-copy').addEventListener('click', async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(FEEDBACK_TO); ok = true; } catch (e) {
      try { const t = document.createElement('textarea'); t.value = FEEDBACK_TO; document.body.append(t); t.select(); ok = document.execCommand('copy'); t.remove(); } catch (e2) {}
    }
    $('fb-err').textContent = ok ? 'Copied: ' + FEEDBACK_TO : FEEDBACK_TO;
  });
}

/* tutorial panel collapsed to a slim bar (default on phones, so it doesn't cover the map) */
function setTutMin(on, silent) {
  const tp = $('tut-panel'), b = $('tut-min'); if (!tp) return;
  tp.classList.toggle('min', !!on);
  if (b) { b.textContent = on ? 'Show steps' : 'Hide'; b.setAttribute('aria-expanded', on ? 'false' : 'true'); }
  if (!silent) layout();
}

/* --------------------------------------------------------------- layout */
function layout() {
  const stage = $('stage'), r = stage.getBoundingClientRect();
  W = Math.max(320, Math.round(r.width)); H = Math.max(320, Math.round(r.height));
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const mobile = W < 820, panelOn = !$('app').classList.contains('panel-off');
  const topH = Math.round($('topbar').getBoundingClientRect().height) + 20;
  document.documentElement.style.setProperty('--top', topH + 'px');
  insets.l = mobile ? 0 : 92; insets.r = (!mobile && panelOn) ? 312 : 0; insets.t = topH; insets.b = mobile ? (panelOn ? Math.round(H * 0.44) + 100 : 100) : 40;
  if (tutorialMode) {
    const tp = $('tut-panel');
    if (mobile) insets.b = tp && tp.classList.contains('min') ? 270 : Math.round(H * 0.52) + 100;
    else insets.r = 312;
  }
  if (cam.auto) camReset(true);
}

/* ----------------------------------------------------------------- loop */
let last = 0, accHud = 0, accMini = 0, accIns = 0;
const SIM_STEP = 1 / 30;
let simAcc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const real = Math.min(0.1, (now - last) / 1000); last = now;
  animT += real;
  if (running && !over && !modalOpen && started) {
    simAcc += real * speed;
    let n = 0;
    while (simAcc >= SIM_STEP && n < 12) {
      update(SIM_STEP); simAcc -= SIM_STEP; n++;
      if (over || !running) { simAcc = 0; break; }
    }
    if (n === 12) simAcc = 0;                 // drop a backlog after a long stall rather than freeze
  }
  if (tutorialMode && started && !spectating) { tutCheckT += real; if (tutCheckT > 0.35) { tutCheckT = 0; checkTutorial(); } }
  rollHud();
  stepFX(real);
  camUpdate(real);
  draw();
  accHud += real; accMini += real; accIns += real;
  if (accHud > 0.2) { accHud = 0; refreshHud(); }
  if (accMini > 0.25) { accMini = 0; drawMini(); }
  if (accIns > 0.25 && sel) { accIns = 0; renderInspector(); }
}

/* ----------------------------------------------------------------- boot */
function boot() {
  let t = 'light';
  try { t = localStorage.getItem('junction2-theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch (e) {}
  setTheme(t);
  loadPrefs();
  if (window.innerWidth < 820) $('app').classList.add('panel-off');
  buildToolbars(); bindInput(); showTab('city');
  resetGame('standard'); running = false;
  layout();
  showStartBest();
  $('btn-resume').hidden = !hasSave();
  openModal('m-start');
  requestAnimationFrame(t2 => { last = t2; frame(t2); });
}
boot();
if (typeof window !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || /[?&]debug\b/.test(location.search))) window.__JUNCTION = {update, resetGame, placeRoad, placePark, placeDepot, eraseAt, rebuildNet, planRoute, draw, saveGame, loadGame,
  get cars() { return cars; }, get edges() { return edges; }, get nodes() { return nodes; }, get nodeList() { return nodeList; }, get buildings() { return buildings; },
  get stats() { return stats; }, get score() { return score; }, get inv() { return inv; }, get road() { return road; }, get water() { return water; }, get org() { return org; },
  get span() { return span; }, idx, cx, cy, CFG, get perks() { return perks; }, get depots() { return depots; }, get parks() { return parks; }, get special() { return special; },
  addCar, refreshHud, renderInspector, offerUpgrade, renderShop, doBuy, offerOf, money: () => money, renderPerks, renderGoals, drawMini, endGame, get rush() { return rush; }, get rain() { return rain; }, get breakdownTimer() { return breakdownTimer; }, serialize, validSave, importCity, exportCity, saveFile, sampleRun, drawRunChart, upgradeJunction, spawnAmb, tryCloseRoad, closeTile, closureSafe, troubleSpots, get ambs() { return ambs; }, get closed() { return closed; }, checkGoals, GOALS, rewardText, bestFor, setScore(v) { score = v; }, setMoney(v) { money = v; }, get goalsDone() { return goalsDone; }, undo, redo, get redoStack() { return redoStack; }, get cam() { return cam; }, select(o) { sel = o; }, get sign() { return sign; }, set running(v) { running = v; }, get week() { return week; }, tow, applyTool, setTool, get motorways() { return motorways; }, linked, dispatch,
  stepTo, layRoad, get lnk() { return lnk; }, get tool() { return tool; }, nearestRoadTo, get undoStack() { return undoStack; }, get netVer() { return netVer; }, set undoGroup(v) { undoGroup = v; }, get pathCache() { return pathCache; }, buildPaths};
/* ---------------------------------------------------------------- online bridge
   online.js (a module, loaded after this file) drives cloud saves, the leaderboard and live viewing
   through this small surface. The game still runs fine on its own if online.js never loads. */
(function () {
  const INV_FIX = d => { if (d && d.inv) for (const k of INV_KEYS) if (!isFinite(d.inv[k])) d.inv[k] = 0; return d; };
  function applyMeta(meta) {
    if (!meta) return;
    running = !!meta.running;
    if (CFG_SPEEDS.includes(meta.speed)) speed = meta.speed;
    refreshUI();
  }
  function blockWhileSpectating(e) {
    if (!spectating) return;
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('#dock, #signs, #inspect .ibody button, #stores button, [data-kind], #tab-shop-pane button, .tabpane[data-tab="perks"] button, #btn-undo, #btn-redo, #btn-side, #btn-play, #speed-seg button, #up-picks button, #btn-reroll')) {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation && e.stopImmediatePropagation();
    }
  }
  ['pointerdown', 'click'].forEach(ev => document.addEventListener(ev, blockWhileSpectating, true));

  window.JunctionAPI = {
    events: JEvents,
    goalsTotal: GOALS.length,
    get startDiff() { return startDiff; },
    diffLabel(k) { return (DIFFS[k] && DIFFS[k].label) || k; },
    serialize,
    state() {
      return {started, over, tutorialMode, spectating, running: running && !modalOpen, speed, score, week, diffKey, clock, goals: goalsDone.size,
        atMenu: !$('m-start').hidden};
    },
    saveNow() { saveGame(true);
    },
    /* open a saved city (an object from serialize()) as the running game */
    loadCity(d) {
      if (!validSave(INV_FIX(d))) return false;
      if (!loadGame(d)) return false;
      document.querySelectorAll('.modal').forEach(m => { m.hidden = true; }); modalOpen = false;
      running = true; refreshHud(); layout(); saveGame();
      return true;
    },
    startCity(dk) {
      document.querySelectorAll('.modal').forEach(m => { m.hidden = true; }); modalOpen = false;
      resetGame(dk || startDiff); running = true; refreshHud(); layout();
    },
    showStart() {
      if (spectating) this.spectate.exit(); else { running = false; }
      showStartBest(); $('btn-resume').hidden = !hasSave(); openModal('m-start'); refreshUI();
    },
    toast, openModal, closeModal,
    spectate: {
      enter(d, meta, keepCam) {
        const was = spectating, c0 = {x: cam.x, y: cam.y, z: cam.z, auto: cam.auto};
        spectating = true; $('app').classList.add('spectating');
        if (!validSave(INV_FIX(d)) || !loadGame(d)) { if (!was) this.exit(); return false; }
        spectating = true;                                   // loadGame resets state; stay in view mode
        document.querySelectorAll('.modal').forEach(m => { m.hidden = true; }); modalOpen = false;
        $('menu').hidden = true; tool = 'select'; closeInspector();
        if (keepCam) Object.assign(cam, c0);
        applyMeta(meta); refreshHud(); layout(); renderGoals();
        return true;
      },
      /* same layout as last time: just bring the numbers and timers up to date, keep the moving traffic */
      patch(d, meta) {
        if (!spectating) return;
        score = d.score; week = d.week; weekTimer = d.weekTimer; money = d.money !== undefined ? d.money : money;
        houseTimer = d.houseTimer; storeTimer = d.storeTimer; clock = Math.max(clock, d.clock);
        if (d.inv) inv = INV_FIX(d).inv;
        if (d.stats) Object.assign(stats, d.stats);
        goalsDone = new Set(d.goals || []);
        rush.t = Math.max(0, +d.rushT || 0); rain.t = Math.max(0, +d.rainT || 0);
        closed = new Map((d.closures || []).filter(([k]) => road[k]).map(([k, t]) => [k, t]));
        d.buildings.forEach((o, i) => { const b = buildings[i]; if (b) { b.pins = o.pins; b.timer = o.timer || 0; } });
        applyMeta(meta); renderGoals();
      },
      exit() {
        if (!spectating) return;
        spectating = false; $('app').classList.remove('spectating');
        resetGame('standard'); running = false; closeInspector();
        showStartBest(); $('btn-resume').hidden = !hasSave(); openModal('m-start'); refreshUI(); layout();
      }
    }
  };
})();
