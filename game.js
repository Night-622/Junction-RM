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
  startSpan:          8,     // stores take a 3x4 plot, so the first map needs a little more room
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
  houseIntervalBase:  80,  houseIntervalRamp: 0.6,  houseIntervalMin: 34,  houseJitter: 16,  firstHouseDelay: 28,
  storeIntervalBase:  46,  storeIntervalRamp: 0.7,  storeIntervalMin: 28,  storeJitter: 10, firstStoreDelay: 12,
  newColourChance:    0.8,
  housesOnStoreSpawn: 1,       // houses of the same colour that appear when a new store opens
  // Houses ONLY appear with a new store (above) or when a store fills up (below). There is no timed house spawning
  // and tiering up brings no houses. When a store's parcels reach its capacity (8/8, 10/10...) one house of its
  // colour moves in, and one more follows after overflowHouseDelay seconds. That store can trigger again once
  // its parcels have dropped to overflowRearm x capacity or below.
  overflowHouseDelay: 20,      // seconds until the second house after a store fills up (it only ever comes once)
  overflowRearm:      0.5,     // a store re-arms once its parcels are at or below this fraction of capacity

  // demand
  pinIntervalBase:    12,  pinIntervalRamp:   0.3,  pinIntervalMin:   7.5, pinJitter: 4,
  pinCapacity:        8,       // parcels a store holds before its clock starts
  overflowSeconds:    26,
  overflowDrain:      1.5,
  arrivalRelief:      2.0,     // seconds knocked off a store's clock per parcel collected

  // store evolution: stores randomly grow busier over time, demanding cars more often
  storeEvolveMaxTier:  3,       // a store can step up through this many tiers
  storeEvolveStartWeek:2,       // no evolving before this week
  storeEvolveChance:   0.25,    // chance, at each random check, that an eligible store steps up a tier
  storeEvolveCheckMin: 60,      // seconds between a store's evolve checks (random each time)
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
  prices: {road: 10, bridge: 15, sign: 20, light: 30, round: 45, park: 30, depot: 30, moto: 60, van: 30, car: 30},
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
  towSeekBroken:      0.4,      // ...or broken down (a claimed car stays broken until the truck gets there)
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
  expert:   {label:'Expert Survival', note:'This week\u2019s seeded city: the same map for everyone. Tighter than Frantic \u2014 survive as long as you can.',
             pin:0.7,  over:0.72, spawn:0.8, roads:-6, cash:-15, grant:0.65, expert:true},
  iso:      {label:'ISO 1v1', note:'Head to head with another player on the same map. Live or daily.',
             pin:0.85, over:0.85, spawn:0.9, roads:-2, cash:-5, grant:0.85, iso:true},
  zen:      {label:'Zen',      note:'Nothing you build can lose the game. Rare weather, gentle traffic, slower camera.',
             pin:1.4, over:999, spawn:1.3, roads:12, cash:30, grant:1.3, noFail:true, calm:true}
};

/* ---- Expert Survival seeds: one per ISO week (Monday to Sunday, UTC), each with a name and a code ---- */
const SEED_NAMES = ['Amber Crossing', 'Velvet Loop', 'Copper Harbour', 'Quiet Meridian', 'Lantern Row', 'Saffron Bend', 'Iron Orchard', 'Mossy Junction',
  'Silver Causeway', 'Tidewater Lane', 'Paper Lanterns', 'Cobalt Fields', 'Hollow Pines', 'Rust Belt Run', 'Glass Garden', 'Northern Lights', 'Maple Interchange',
  'Ember Hills', 'Cinder Docks', 'Lilac Avenue', 'Granite Gate', 'Willow Weir', 'Thunder Flats', 'Pebble Point', 'Opal Ring', 'Driftwood Quay', 'Crimson Crescent',
  'Fernwood Spur', 'Harbour Lights', 'Sable Square', 'Kestrel Ridge', 'Moonlit Mews', 'Chalk Downs', 'Indigo Terrace', 'Juniper Junction', 'Marble Bridge',
  'Oakmoss Circle', 'Pewter Park', 'Quartz Quarter', 'Riverbend Reach', 'Sandstone Strand', 'Tamarind Turn', 'Umber Underpass', 'Verdant Vale', 'Whistle Stop',
  'Yarrow Yard', 'Zephyr Heights', 'Aurora Approach', 'Birchwood Bypass', 'Cedar Cut', 'Dune Drive', 'Elm Exchange', 'Foxglove Flyover', 'Gull Harbour',
  'Heather Hollow', 'Ivy Interchange', 'Jasper Junction', 'Kelp Coast', 'Lumen Lanes', 'Mistral Mile', 'Nettle Nook', 'Orchid Overpass', 'Poppy Plaza',
  'Quill Quay', 'Rosemary Ring', 'Starling Street', 'Thistle Track', 'Urchin Bay', 'Violet Viaduct', 'Wren Way', 'Xenon Yards', 'Yew Corner', 'Zinc Zone',
  'Basalt Basin', 'Clover Cross', 'Dew Point', 'Echo Esplanade', 'Frost Ferry', 'Gilded Grove', 'Honey Haven', 'Inkwell Isle', 'Jade Jetty', 'Kite Knoll',
  'Larch Landing', 'Mango Market', 'Nimbus Narrows', 'Olive Outskirts', 'Prism Pass', 'Quarry Quay', 'Rain Run', 'Sorrel Sidings', 'Tulip Tunnel', 'Upland Union',
  'Vesper Village', 'Wharf Walk', 'Saltmarsh Spur', 'Bramble Bend', 'Cascade Corner', 'Lighthouse Loop', 'Midnight Market'];
function strHash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
/* the ISO week a date falls in, plus its Monday-to-Sunday dates */
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = d.getUTCFullYear(), w = Math.ceil(((d - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  const mon = new Date(d); mon.setUTCDate(d.getUTCDate() - 3); const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6);
  return {key: y + '-W' + String(w).padStart(2, '0'), mon, sun};
}
/* this week's seed (or one from weeksAgo weeks back) */
function expertSeed(weeksAgo) {
  const now = new Date(Date.now() - (weeksAgo || 0) * 7 * 86400000), w = isoWeek(now), h = strHash('junction-expert-' + w.key);
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let code = '', x = strHash(w.key + '#code');
  for (let i = 0; i < 6; i++) { code += A[x % A.length]; x = (Math.floor(x / A.length) ^ strHash(code + i)) >>> 0; }
  const fmt = d => d.toLocaleDateString('en-US', {day: 'numeric', month: 'short', timeZone: 'UTC'});
  return {key: w.key, num: h, name: SEED_NAMES[h % SEED_NAMES.length], code, label: fmt(w.mon) + ' \u2013 ' + fmt(w.sun) + ', ' + w.sun.getUTCFullYear()};
}
const VERSION = '2.3';
const CHANGELOG = [
  {v: '2.3', date: 'October 6, 2026', items: [
    'Campaign: 30 handcrafted levels in three chapters, each with a goal and 1–3 stars. Stars open the next chapter and unlock the Mayor house, Medal roundabout and Trophy car.',
    'New transport: railways (trains shuttle 6 parcels between stations, with level crossings), bus routes (a bus loops up to 4 houses from a store) and delivery drones (a perk, 50 drone designs in the Store).',
    'Ranked ISO: a rating and divisions from Bronze to Diamond, quick-match against players near your rating, monthly seasons with an exclusive car for each division, spectating, and weekend tournaments.',
    'Co-op: build one city with up to four friends, with coloured cursors and shared cash.',
    'Time-lapse replays: every city is recorded day by day. Watch it back with a cinematic camera or export a video.',
    'Map editor: paint water, place stores and houses, set rules and a goal, then publish with a code. Browse, like and play community maps, each with its own leaderboard.',
    'Living cities: houses grow into blocks and towers, stores into malls, named districts, pedestrians, weather that affects traffic, and streetlights at night.',
    'Behind the scenes: automated browser tests on every push, server checks on leaderboard scores and match results, error reporting, and rules deployed from GitHub.']},
  {v: '2.2.1', date: 'October 5, 2026', items: [
    'A pause menu on Esc: stats so far, restart, settings, how to play, and save & quit. You can keep building while paused.',
    'The game-over screen shows your city, the big numbers, the run chart and what you unlocked. Share a card of any run, ISO match or weekly run.',
    'A splash screen, and smooth fades between the menu and your city.',
    'Quality presets (High, Balanced, Battery saver): shadows, decorations, smooth motion and a frame cap.',
    'Vibration on phones, soft button clicks, and separate sliders for music, traffic and effects.',
    'Accessibility: interface size, high contrast, reduce motion, and labels on every icon button.',
    'A daily reward with a 7-day streak. Day 7 opens a free Object crate.',
    'Block, mute and report players. Names and chats are checked for bad language.',
    'Install Junction as an app; single player works offline.',
    'At least 50 of everything in the Store.',
    'Questions pop up in the game\u2019s own style instead of browser boxes.',
    'Your coins, items, look, streak and quests follow your account to any device.',
    'Quests: three a day and three a week, with coins, stars and crates. One free reroll a day.',
    'Traffic flow view (F2): roads tinted by how busy they are, junctions ringed by wait, the worst spots listed, and a five-minute chart on every junction.',
    'Profile looks: banners, avatar frames and titles, and three pinned achievements, shown on leaderboards, chats and player cards.',
    'Seasonal events, starting with Halloween in the last two weeks of October: ghost cars, bat-wing stores, ghost lights and event quests.',
    'Short guides the first time you open ISO 1v1, Weeklys, the Store, Chats or Friends.']},
  {v: '2.1', date: 'October 2026', items: ['Chats in a messaging layout, and Friends with head-to-head records.', 'ISO 1v1: live and daily duels on the same map.', 'Player cards from any leaderboard, with Watch live.', 'Cars drive round roundabouts and reverse into their parking.', 'Smoother motion at 1\u00d7.', 'Credits reset: \u25ce coins (2 per 3 parcels) and \u2726 stars from Frantic cities.']},
  {v: '2.0', date: 'September 2026', items: ['An hourly Store, mystery crates and the Collection.', 'Weekly Expert Survival seeds, with a map of the seed.', 'Hundreds of designs, themes, maps and panel styles.', 'A new main menu with a live city behind it.']}
];
function openWhatsNew() {
  $('wn-ver').textContent = VERSION;
  $('wn-list').innerHTML = CHANGELOG.map((c, i) => '<section class="wn-sec' + (i ? '' : ' now') + '"><h3>v' + c.v + ' <small>' + c.date + '</small></h3><ul>' + c.items.map(t => '<li>' + t + '</li>').join('') + '</ul></section>').join('');
  openModal('m-whatsnew');
}
let demoMode = false, demoT = 0;                      // the main menu's background city
let iso = null;                                        // the ISO 1v1 match being played: {id, kind, seed, opp, ctl, prop, oppSt}
let expWeek = '', prevDiff = 'standard';             // prevDiff: the ordinary difficulty to go back to after an Expert start                                      // the seed week of the Expert city being played ('' otherwise)
const CELL = 32, MAXD = CFG.maxSpan, COLS = MAXD, ROWS = MAXD, N = COLS * ROWS;
const DX = [0, 1, 1, 1, 0, -1, -1, -1], DY = [-1, -1, 0, 1, 1, 1, 0, -1];
const DIAG = d => (d & 1) === 1;
const idx = (c, r) => r * COLS + c;
const cx = k => k % COLS, cy = k => (k / COLS) | 0;
const tx = k => (cx(k) + 0.5) * CELL, ty = k => (cy(k) + 0.5) * CELL;
const relDir = (a, b) => (((b - a) % 8) + 8) % 8;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
/* All the game's randomness goes through rand(). Normally that's Math.random; an Expert Survival city swaps in a
   seeded stream so everyone playing that week starts from the same map, the same first store and house, and the
   same early events (what happens later still depends on how each player builds). */
let rand = Math.random;
function seededRand(seed) {                            // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = (a, b) => a + rand() * (b - a);
const pick = arr => arr[Math.floor(rand() * arr.length)];
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
  ]},
  {group: 'Soft', cols: [['cream', '#f4efe1'], ['mist', '#e3e9ee'], ['sage', '#d7e3cc'], ['pale blush', '#f6dfe6'], ['pale sky', '#dceefa'], ['pale sand', '#efe3c8'],
    ['pale lilac', '#e9e1f5'], ['pale mint', '#dcf3e8'], ['deep charcoal', '#1d2226'], ['deep navy', '#142235'], ['deep forest', '#16291f'], ['deep plum', '#2a1a33']]},
  {group: 'Premium', cols: [['gold', '#d4af37', 60], ['neon pink', '#ff2bd6', 55], ['electric lime', '#b6ff00', 55], ['ultraviolet', '#5b2bff', 55], ['arctic', '#bff3ff', 50],
    ['obsidian', '#0b0b10', 70], ['pearl', '#f3efe6', 50], ['chrome', '#c9d3dc', 65], ['lava', '#ff4d1a', 55], ['aurora teal', '#00d1b2', 50]]},
  {group: 'Unique', unique: true, cols: [['starlight', '#e8e4ff'], ['molten gold', '#ffb81c'], ['deep space', '#1a0f3d'], ['toxic', '#7dff3a'], ['blood moon', '#8c0f1f'], ['glacier', '#a8f0ff']]}
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
/* p62: weather beyond rain, the per-day replay frames and the pedestrian pool (functions live at the end of the file) */
let weather = {kind: 'clear', t: 0, amt: 0}, weatherTimer = 300, weatherSeen = {};
let replayFrames = [], replayDay = -1;
const PED_MAX = 40, peds = []; for (let i = 0; i < PED_MAX; i++) peds.push({on: false, e: null, s: 0, side: 1, dir: 1, spd: 0, life: 0, col: 0, x: 0, y: 0});
let pedN = 0, pedSpawnT = 0, lampSprite = null, distKey = -1, distNames = null, distOff = false;
const PED_COLS = ['#e86a5a', '#4f8fd6', '#f0c24a', '#6fc27a', '#b07ad6', '#f4f1ea'];
const DISTRICT_NAMES = ['Oakwood', 'Harbour Row', 'The Narrows', 'Maple Heights', 'Fernhill', 'Old Quay', 'Brightside', 'Elm Park', 'Stonebridge', 'The Meadows', 'Larkspur', 'Ironside', 'Willow End', 'Copperfield', 'Northgate', 'Kingsmead'];
const WEATHER_START = {snow: 'Snow \u2014 roads are slower', fog: 'Fog \u2014 traffic lights can\u2019t see as far', heat: 'Heatwave \u2014 the stores are busier'};
const WEATHER_END = {snow: 'The snow has stopped', fog: 'The fog has lifted', heat: 'The heatwave has broken'};
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
function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
let incomeLog = [];
function earn(n) { money += n; stats.earned += n; if (incomeLog.length && incomeLog[incomeLog.length - 1][0] > clock) incomeLog = []; incomeLog.push([clock, n]); }
function incomePerMin() {
  while (incomeLog.length && incomeLog[0][0] < clock - 60) incomeLog.shift();
  if (incomeLog.length && incomeLog[incomeLog.length - 1][0] > clock) incomeLog = [];
  let sum = 0; for (const e of incomeLog) sum += e[1];
  return sum * 60 / Math.max(20, Math.min(60, clock));
}
function spend(n) { money -= n; stats.spent += n; }
const bannedTools = new Set();                        // p60: tools a campaign level forbids (inventory kinds)
const canTake = kind => !bannedTools.has(kind) && (inv[kind] > 0 || money >= PRICE[kind]);
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
  for (const c of cars) c.noRouteT = 0;                    // the roads changed: every car may have a way now
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
/* Store footprints. A store covers 2x3 tiles: a 2x2 building with a 1x2 car park along one side. b.k is the
   first car-park tile, the second sits clockwise of it, and b.sd (0 N, 2 E, 4 S, 6 W) points from the building
   out across the car park. Cars drive in along the car park's aisle, so a road reaches the store only past an
   END of the car park, never along its sides. b.ends says which ends are open: 0 both, 1 only the end beside
   b.k, 2 only the far end (picked at random when the store opens). Cities saved before stores grew keep their
   single-tile store (no b.sd). */
const STORE_W = 2, STORE_DEPTH = 3;
const isBig = b => !!b && b.type === 'store' && b.sd >= 0;
function storeTilesAt(k, sd) {                       // car park first (2 tiles), then the building, row by row
  if (k < 0) return null;
  const fx = DX[sd], fy = DY[sd], px = -fy, py = fx, c0 = cx(k), r0 = cy(k), out = [];
  for (let depth = 0; depth < STORE_DEPTH; depth++) for (let s = 0; s < STORE_W; s++) {
    const c = c0 + px * s - fx * depth, r = r0 + py * s - fy * depth;
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return null;
    out.push(idx(c, r));
  }
  return out;
}
/* the footprint stores had in older saves: three tiles wide (centred on k) and depthN deep */
function oldStoreTiles(k, sd, depthN) {
  const fx = DX[sd], fy = DY[sd], px = -fy, py = fx, out = [];
  for (let depth = 0; depth < depthN; depth++) for (let s = -1; s <= 1; s++) {
    const c = cx(k) + px * s - fx * depth, r = cy(k) + py * s - fy * depth;
    if (c >= 0 && r >= 0 && c < COLS && r < ROWS) out.push(idx(c, r));
  }
  return out;
}
const bTiles = b => isBig(b) ? storeTilesAt(b.k, b.sd) : [b.k];
const rowTiles = b => isBig(b) ? storeTilesAt(b.k, b.sd).slice(0, STORE_W) : [b.k];
const sdFace = sd => Math.atan2(DY[sd], DX[sd]) - Math.PI / 2;    // local +y points from the building across the car park
/* world-space centre of a building's whole plot */
const bX = b => isBig(b) ? tx(b.k) + DX[(b.sd + 2) % 8] * CELL / 2 - DX[b.sd] * CELL : tx(b.k);
const bY = b => isBig(b) ? ty(b.k) + DY[(b.sd + 2) % 8] * CELL / 2 - DY[b.sd] * CELL : ty(b.k);
/* [road tile, car-park tile it leads into] for each open end of a store's car park */
function storeDoorsAt(k, sd, ends) {
  const t = storeTilesAt(k, sd); if (!t) return [];
  const out = [];
  if (ends !== 2) out.push([nbr(t[0], (sd + 6) % 8), t[0]]);
  if (ends !== 1) out.push([nbr(t[1], (sd + 2) % 8), t[1]]);
  return out.filter(o => o[0] >= 0);
}
const storeDoors = b => storeDoorsAt(b.k, b.sd, b.ends || 0);
function storeAccess(b) {
  const doors = storeDoors(b);
  b.door = b.k;
  if (b.pref >= 0 && road[b.pref]) for (const [t, d] of doors) if (t === b.pref) { b.door = d; return t; }
  let best = -1, bs = 9;
  for (const [t, d] of doors) {
    if (!road[t]) continue;
    const sc = lnk[t] ? 0 : 1;                      // prefer a road that actually goes somewhere
    if (sc < bs) { bs = sc; best = t; b.door = d; }
  }
  return best;
}
function markBuilding(b, i) { for (const t of bTiles(b)) bAt[t] = i; }
/* can a store sit with its car park starting on k, facing sd, open at `ends`? every tile must be open ground
   in play, and at least one open end must have room for a road */
function storeFits(k, sd, inBounds, ends) {
  const tiles = storeTilesAt(k, sd); if (!tiles) return false;
  for (const t of tiles) if (!inBounds(t) || water[t] || occupied(t)) return false;
  return storeDoorsAt(k, sd, ends || 0).some(([f]) => inBounds(f) && !water[f] && (road[f] || !occupied(f)));
}
function linkBuildings() {
  for (const b of buildings) {
    if (isBig(b)) { b.acc = storeAccess(b); b.face = sdFace(b.sd); }
    else { b.acc = nearestRoadTo(b.k, b.pref); b.face = faceAngle(b.k, b.acc); b.door = b.k; }
  }
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
  if (e.fast && routeFuel < 1) return Infinity;              // a stock fuel tank can't use motorways
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
  load: {name: 'Loading',    max: 2, cost: [20, 40],          what: 'loads 20% faster'},
  fuel: {name: 'Fuel tank',  max: 2, cost: [35, 70],          what: 'drives further'}
};
/* FUEL. A stock tank covers 16 road tiles each way and can't use motorways. A bigger tank covers 32
   and opens motorways; the long-range tank goes any distance. Houses only send a car on a trip it can make. */
const FUEL_RANGE = [16, 32, Infinity];
const fuelRange = c => FUEL_RANGE[Math.min(FUEL_RANGE.length - 1, carUp(c, 'fuel'))];
const fuelText = l => l >= 2 ? 'any distance, motorways too' : l >= 1 ? 'up to 32 road tiles, motorways too' : 'up to 16 road tiles, no motorways';
const routeTiles = r => r ? Math.round(r.reduce((a, e) => a + e.L, 0) / CELL) : 0;
let routeFuel = 9;                                           // fuel level of the car being planned for (9 = no limits)
/* plan for one car. strict: respect its fuel (used when choosing trips). Otherwise a car already out
   is never stranded: if its fuel rules out every way, it may take any way home. */
function planFor(c, startEdge, fromK, toK, avoid, strict) {
  routeFuel = c && !c.isTruck ? carUp(c, 'fuel') : 9;
  let r = planRoute(startEdge, fromK, toK, avoid);
  routeFuel = 9;
  if (!r && !strict) r = planRoute(startEdge, fromK, toK, avoid);
  return r;
}
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
const carUpTotal = c => carUp(c, 'cap') + carUp(c, 'spd') + carUp(c, 'load') + carUp(c, 'fuel');
function carUpCost(c, t) { const l = carUp(c, t); return l >= CAR_UP[t].max ? null : CAR_UP[t].cost[l]; }
function upgradeCar(id, t) {
  const c = cars.find(x => x.id === id); if (!c || !CAR_UP[t]) return false;
  const p = carUpCost(c, t);
  if (p === null) { hint('That upgrade is already maxed out.'); return false; }
  if (money < p) { hint(CAR_UP[t].name + ' costs ' + fmt$(p) + '. ' + shortBy(p)); return false; }
  spend(p); c.up[t] = (c.up[t] || 0) + 1; c.noRouteT = 0;
  syncCarLen(c);
  popRing(c.x, c.y, '#ffc933'); popText(c.x, c.y - 14, t === 'load' ? 'Loading ' + c.up.load : t === 'fuel' ? (c.up.fuel >= 2 ? 'Long-range tank' : 'Bigger tank') : modelName(c).replace(/^./, m => m.toUpperCase()), '#ffc933');
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
  if (weather.kind === 'snow' && weather.amt > 0.05 && !perks.plough) v *= 1 - 0.25 * weather.amt;   // p62: snow, unless the ploughs are out
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
/* a store's car park has six bays against the building and an aisle along the far side; cars back in so
   they leave nose first. Docks fill from the middle out. Local coordinates are relative to the middle bay's
   tile, +y away from the building. */
const STORE_BAYS = [-7.5, 7.5, -22.5, 22.5];
const STORE_BAY_Y = 25;
function dockSpots(s) {
  const list = [], x = tx(s.k), y = ty(s.k), th = s.face || 0;
  if (isBig(s)) for (const lx of STORE_BAYS) { const p = rot(bX(s), bY(s), th, lx, STORE_BAY_Y); list.push({x: p.x, y: p.y, a: th + Math.PI / 2}); }
  else for (const lx of [-7, 7]) { const p = rot(x, y, th, lx, 10.5); list.push({x: p.x, y: p.y, a: th + Math.PI / 2}); }
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
/* a car keeps the bay it took until it leaves (bays used to be handed out by queue order, so when one car
   left, the rest all shuffled along) */
function stableSlot(c, list, n, key) {
  if (c.slotKey === key && c.slotI < n && !list.some(o => o !== c && o.slotKey === key && o.slotI === c.slotI)) return c.slotI;
  const used = new Set(); for (const o of list) if (o !== c && o.slotKey === key) used.add(o.slotI);
  let i = 0; while (used.has(i) && i < n - 1) i++;
  c.slotKey = key; c.slotI = i; return i;
}
function parkedPose(c) {
  const L = c.loc;
  if (c.isBus && L.t === 'home') return busStopPose(c);
  if (L.t === 'yard') {
    const s = buildings[L.i];
    if (c.isTruck && !c.isAmb) {                     // tow trucks wait inside their store, side by side
      const mine = trucks.filter(x => x.store === L.i), i = Math.max(0, mine.indexOf(c));
      const p = isBig(s) ? rot(bX(s), bY(s), s.face || 0, i ? 18 : -18, 9)               // in the garage bays of the facade
        : rot(tx(s.k), ty(s.k), s.face || 0, mine.length > 1 ? (i ? 5.2 : -5.2) : 0, -1.5);
      return {x: p.x, y: p.y, a: (s.face || 0) + Math.PI / 2};
    }
    const p = isBig(s) ? rot(bX(s), bY(s), s.face || 0, 0, 40) : rot(tx(s.k), ty(s.k), s.face || 0, 0, 10.5);
    return {x: p.x, y: p.y, a: (s.face || 0) + Math.PI / 2};
  }
  if (L.t === 'home') {
    const b = buildings[c.home], sp = homeSpots(b), i = Math.max(0, b.cars.indexOf(c));
    return sp[Math.min(i, sp.length - 1)];
  }
  if (L.t === 'bay') {
    const d = depots[L.i]; if (!d) return {x: c.x, y: c.y, a: c.ang};
    const sp = baySpots(d);
    return sp[stableSlot(c, d.slots, sp.length, 'b' + L.i)];
  }
  const s = buildings[L.i], sp = dockSpots(s);
  return sp[stableSlot(c, s.docks, sp.length, 'd' + L.i)];
}

/* ------------------------------------------------------------ car life */
function addCar(bi) {
  const h = buildings[bi];
  const c = {id: ++carSeq, home: bi, color: h.color, van: false, state: 'parked', loc: {t: 'home', i: bi},
    x: 0, y: 0, ang: 0, v: 0, len: CFG.carLen, edge: null, s: 0, route: null, ri: 0, destNode: -1,
    job: null, store: -1, bay: -1, want: 0, load: 0, taken: false, timer: 0,
    stopT: 0, stopAcc: 0, blockedT: 0, replanT: rnd(1, CFG.replanSeconds), replanCool: 0, planFail: 0,
    brake: false, broken: 0, xf: null, xfEdge: null, cr: null, idle: 0, trips: 0, carried: 0, tripStart: 0, hazard: 0,
    cash: 0, claim: null, towedBy: null, noRouteT: 0, up: {cap: 0, spd: 0, load: 0, fuel: 0}};
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
  const look = weather.kind === 'fog' && weather.amt > 0.3 ? 0.5 : 1;                             // p62: in fog the sensor sees half as far
  for (const e of nd.ins) {
    if (e.dead || groupOf(e) !== g) continue;
    for (const c of e.cars) if (lightWants(c, c.ri) && (look === 1 || e.stop - c.s <= e.L * look)) n++;
    if (look === 1) for (const c of e.inb) if (lightWants(c, c.state === 'crossing' ? c.ri + 1 : c.ri)) n++;
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
  if (xingN && xingT[e.b] > clock) return false;
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
    if (c.broken > 0) { if (!(c.claim && c.claim.isTruck)) c.broken -= dt; c.hazard += dt; if (c.broken <= 0) { c.broken = 0; c.hazard = 0; } }   // waits for a tow truck that's on its way
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
  if (nd.type === 'round') {
    // Round the ring, the way your side of the road turns: a car turns toward its own side as it joins (so
    // anticlockwise when driving on the right, clockwise on the left), then follows the ring to its exit.
    const ox_ = tx(nd.k), oy_ = ty(nd.k), vx = p0x - ox_, vy = p0y - oy_;
    const a0 = Math.atan2(vy, vx), a1 = Math.atan2(P1.y - oy_, P1.x - ox_), along = vx * e.ux + vy * e.uy;
    const side = (-Math.sin(a0)) * (vx - along * e.ux) + Math.cos(a0) * (vy - along * e.uy), dir = side >= 0 ? 1 : -1;
    let sw = (((a1 - a0) * dir) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    if (sw < 0.3) sw += Math.PI * 2;                      // back the way it came: all the way round
    const Rr = 10.6, r0 = Math.hypot(vx, vy), r1 = Math.hypot(P1.x - ox_, P1.y - oy_);
    const ringLen = sw * Rr + Math.abs(r0 - Rr) + Math.abs(r1 - Rr);
    c.cr.ring = {ox: ox_, oy: oy_, a0, dir, sw, Rr, r0, r1};
    c.cr.speed = sp * ringLen / (len * 1.25);             // about as long as the old crossing (a quarter more), at the ring's pace
    c.cr.len = ringLen;
  }
  c.state = 'crossing'; c.edge = null; c.blockedT = 0; c.stopT = 0;
  nd.cross.push(c); nd.crossEdge = e; nd.passed++; e.passed++;
  f.inb.push(c);
}
/* where a car is on a roundabout's ring at progress u: it swings in to the ring, round, and out to its exit lane */
function ringPos(g, u) {
  const a = g.a0 + g.dir * g.sw * u;
  const r = g.Rr + (g.r0 - g.Rr) * Math.pow(Math.max(0, 1 - u / 0.2), 2) + (g.r1 - g.Rr) * Math.pow(Math.max(0, (u - 0.8) / 0.2), 2);
  return {x: g.ox + Math.cos(a) * r, y: g.oy + Math.sin(a) * r};
}
const ringAng = c => c.cr.ring.a0 + c.cr.ring.dir * c.cr.ring.sw * Math.min(1, c.cr.u);
function stepCross(nd, dt) {
  for (let i = nd.cross.length - 1; i >= 0; i--) {
    const c = nd.cross[i], cr = c.cr;
    cr.u += cr.speed * dt / cr.len;
    c.v = cr.speed;
    if (cr.ring) {                                         // round the ring: keep a gap to the car ahead on it
      const g = cr.ring, me = ringAng(c);
      for (const o of nd.cross) if (o !== c && o.cr && o.cr.ring && o.cr.u > 0.12 && o.cr.u < 0.9) {
        const ahead = ((ringAng(o) - me) * g.dir % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        if (ahead > 0.05 && ahead < 1.0) { cr.u -= cr.speed * dt / cr.len * 0.7; break; }
      }
    }
    const u = Math.min(1, cr.u), w = 1 - u;
    let dx, dy;
    if (cr.ring) {
      const p = ringPos(cr.ring, u), q = ringPos(cr.ring, Math.min(1, u + 0.01));
      c.x = p.x; c.y = p.y; dx = q.x - p.x; dy = q.y - p.y;
    } else {
      c.x = w * w * cr.x0 + 2 * w * u * cr.cx + u * u * cr.x1;
      c.y = w * w * cr.y0 + 2 * w * u * cr.cy + u * u * cr.y1;
      dx = 2 * w * (cr.cx - cr.x0) + 2 * u * (cr.x1 - cr.cx); dy = 2 * w * (cr.cy - cr.y0) + 2 * u * (cr.y1 - cr.cy);
    }
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
  if (f && xingN && xingT[nd.k] > clock) return null;                 // a train is at the level crossing ahead
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
  if (c.blockedT > CFG.gridlockSeconds && !(c.claim && c.claim.isTruck)) tow(c, false);
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
  const r = planFor(c, c.edge, null, dest, avoid);
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
    const r = dest >= 0 ? planFor(c, c.edge, null, dest) : null;
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
  c.xf = c.isBus ? busPath(c, pose) : parkPath(c, pose);
}
/* A drive into a parking spot. Spots face the road (cars leave nose first), so a car drives in past its spot,
   stops broadside to it, then reverses in. Each leg is a curve whose ends match the car's heading. */
const cubicAt = (p, t) => {
  const w = 1 - t, a = w * w * w, b = 3 * w * w * t, c2 = 3 * w * t * t, d = t * t * t;
  return {x: a * p[0] + b * p[2] + c2 * p[4] + d * p[6], y: a * p[1] + b * p[3] + c2 * p[5] + d * p[7],
          dx: 3 * w * w * (p[2] - p[0]) + 6 * w * t * (p[4] - p[2]) + 3 * t * t * (p[6] - p[4]), dy: 3 * w * w * (p[3] - p[1]) + 6 * w * t * (p[5] - p[3]) + 3 * t * t * (p[7] - p[5])};
};
function leg(x0, y0, h0, x1, y1, h1, rev, pace) {
  const d = Math.hypot(x1 - x0, y1 - y0), k = Math.max(3, d * 0.42), m = rev ? -1 : 1;    // reversing: the car moves against its heading
  const p = [x0, y0, x0 + Math.cos(h0) * k * m, y0 + Math.sin(h0) * k * m, x1 - Math.cos(h1) * k * m, y1 - Math.sin(h1) * k * m, x1, y1];
  return {p, rev, dur: clamp(d / pace, 0.35, 1.5)};
}
function parkPath(c, pose) {
  const out = pose.a, fx = Math.cos(out), fy = Math.sin(out);
  // broadside to the spot, a little out from it, on the side away from the car (it drives past, then backs in)
  const sx = -fy, sy = fx, ax = pose.x + fx * 8 - c.x, ay = pose.y + fy * 8 - c.y;
  const sgn = ax * sx + ay * sy >= 0 ? 1 : -1;         // the far side, seen from where the car is now
  const side = Math.atan2(sy * sgn, sx * sgn);
  const S = {x: pose.x + fx * 8 + Math.cos(side) * 8, y: pose.y + fy * 8 + Math.sin(side) * 8};
  // past the driveway already? then back up to it rather than loop round
  const behind = (S.x - c.x) * Math.cos(c.ang) + (S.y - c.y) * Math.sin(c.ang) < 0;
  const ph = [leg(c.x, c.y, c.ang, S.x, S.y, side, behind, behind ? 22 : 34), leg(S.x, S.y, side, pose.x, pose.y, out, true, 20)];
  return {t: 0, ph, dur: ph.reduce((a, q) => a + q.dur, 0), park: true};
}
function stepXf(c, dt) {
  const xf = c.xf; xf.t += dt;
  if (xf.ph) {                                             // a drive along curved legs (forward, or reversing)
    let t = xf.t, i = 0;
    while (i < xf.ph.length - 1 && t > xf.ph[i].dur) { t -= xf.ph[i].dur; i++; }
    const L_ = xf.ph[i], u = clamp(t / L_.dur, 0, 1);
    const q = cubicAt(L_.p, u * u * (3 - 2 * u));
    c.x = q.x; c.y = q.y;
    if (Math.abs(q.dx) + Math.abs(q.dy) > 1e-4) c.ang = Math.atan2(q.dy, q.dx) + (L_.rev ? Math.PI : 0);
    c.brake = L_.rev || u > 0.8;
    return xf.t >= xf.dur;
  }
  const u = clamp(xf.t / xf.dur, 0, 1), w = u * u * (3 - 2 * u);
  c.x = lerp(xf.x0, xf.x1, w); c.y = lerp(xf.y0, xf.y1, w);
  c.ang = xf.a0 + angDiff(xf.a0, xf.a1) * w;
  return xf.t >= xf.dur;
}
function arrive(c) {
  c.xf = null; c.v = 0; c.blockedT = 0; c.stopT = 0;
  if (c.isBus) { busArrive(c); return; }
  if (c.loc.t === 'store') {
    const s = buildings[c.store];
    c.state = 'loading'; c.taken = false;
    c.timer = (CFG.pickupPause * Math.pow(0.7, perks.loading) + CFG.loadPause * Math.max(0, Math.min(c.want, s.pins) - 1)) * Math.pow(0.8, carUp(c, 'load'));
  } else if (c.loc.t === 'home') {
    const n = c.load, cash = c.cash || 0;
    if (n > 0) {
      score += n; stats.delivered += n; stats.lastDeliveries.push(clock);
      const hh = buildings[c.home]; if (hh) hh.delivered = (hh.delivered || 0) + n;                  // p62: houses grow with what they receive
      if (!spectating && !demoMode) earnBucks(n, buildings[c.home]);
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
  if (c.isBus) { busLoaded(c); return; }
  if (!c.taken) {
    const n = Math.min(c.want, s.pins);
    s.pins -= n; s.claimed = Math.max(0, s.claimed - c.want);
    s.timer = Math.max(0, s.timer - CFG.arrivalRelief * n);
    s.served += n;
    if (s.contract) s.contract.got += n;
    c.load = n; c.carried = n; c.want = 0; c.taken = true;
    c.cash = Math.round(n * payPerParcel(s));
    if (n > 0) popText(bX(s), bY(s) - 14, '-' + n, COLORS[s.color].hex);
  }
  const h = buildings[c.home];
  if (solveBudget <= 0) return;
  solveBudget--;
  const r = (s.acc >= 0 && h.acc >= 0) ? planFor(c, null, s.acc, h.acc) : null;
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
      const r = (dest >= 0 && from >= 0 && solveBudget > 0) ? (solveBudget--, planFor(c, null, from, dest)) : null;
      if (r) { c.route = r; c.ri = 0; } else if (solveBudget > 0) { if (c.job === 'fetch') cancelJob(c); else tow(c, true); }
      return;
    }
    if (c.broken > 0) return;
    if (roomOn(f, c.len, c)) {
      leaveSpot(c);
      const p = laneAt(f, f.r0);
      c.xfEdge = f; f.inb.push(c);
      const lg = leg(c.x, c.y, c.ang, p.x, p.y, Math.atan2(f.uy, f.ux), false, 40);   // drive out nose first, curving onto the lane
      c.xf = {t: 0, ph: [lg], dur: lg.dur};
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
      else { c.blockedT += dt; if (c.blockedT > CFG.gridlockSeconds && !(c.claim && c.claim.isTruck)) tow(c, false); }
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
  stepPeds(dt); weatherTick(dt);                                                               // p62
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

let runT0 = 0, lastRun = {newBest: false, prevBest: 0};
function resetGame(dk) {
  demoMode = false; curSlot = pendingSlot; pendingSlot = ''; runT0 = Date.now(); cityQ = {round: 0, light: 0, moto: 0};
  lifeNewCity = true; lifeSnap = null;
  tutorialMode = false;
  setTutorialUI(false);
  if (dk) diffKey = dk;
  DIFF = DIFFS[diffKey] || DIFFS.standard; best = bestFor(diffKey);
  if (diffKey !== 'iso') iso = null;
  if (DIFF.expert) { const sd = expertSeed(); expWeek = sd.key; rand = seededRand(sd.num); if (startDiff === 'expert') startDiff = prevDiff; }
  else if (DIFF.iso && iso) { expWeek = ''; rand = seededRand(iso.seed); }      // both players get the same map from the match's seed
  else { expWeek = ''; rand = Math.random; }
  water = new Uint8Array(N); road = new Uint8Array(N); lnk = new Uint8Array(N);
  sign = new Array(N).fill(null); special = new Array(N).fill(null);
  bAt = new Int32Array(N).fill(-1); parkAt = new Int32Array(N).fill(-1); depotAt = new Int32Array(N).fill(-1);
  onewayDir = new Int8Array(N).fill(-1);
  nodes = []; nodeList = []; edges = []; edgeMap = new Map(); buildings = []; cars = []; motorways = []; parks = []; depots = []; transportReset();
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
  genWater();
  for (let tries = 0; tries < 6; tries++) {           // keep trying until the first store and its house both fit
    for (let i = 0; i < CFG.startStores; i++) addBuilding('store', i % COLORS.length);
    let homes = 0; for (let i = 0; i < CFG.startHouses; i++) if (addBuilding('house', i % Math.max(1, CFG.startStores))) homes++;
    if (homes && buildings.some(b => b.type === 'store')) break;
    for (const b of buildings) for (const t of bTiles(b)) bAt[t] = -1;
    buildings = []; cars = [];
  }
  rebuildNet();
  for (const c of cars) { const p = parkedPose(c); c.x = p.x; c.y = p.y; c.ang = p.a; }
  camReset(true);
  closeInspector(); setTool('select'); refreshUI();
}
/* Water is different every city: winding rivers in any direction, ponds of every size, and some bigger ponds
   with an island in the middle. Most of it lands within reach of where the city will grow. */
function genWater() {
  const mid = MAXD / 2, stamp = (x, y, rad, v) => {
    for (let r = Math.floor(y - rad); r <= Math.ceil(y + rad); r++) for (let c = Math.floor(x - rad); c <= Math.ceil(x + rad); c++) {
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
      if ((c + 0.5 - x) ** 2 + (r + 0.5 - y) ** 2 <= rad * rad) water[idx(c, r)] = v;
    }
  };
  // a river that winds from one edge of the map to another
  const river = () => {
    const side = Math.floor(rand() * 4), along = () => 10 + rand() * (MAXD - 20);
    const ends = [[along(), 0], [MAXD, along()], [along(), MAXD], [0, along()]];
    let [x, y] = ends[side];
    const [tx_, ty_] = ends[(side + 2) % 4];
    let head = Math.atan2(ty_ - y, tx_ - x);
    const ph1 = rand() * 6.3, ph2 = rand() * 6.3, wiggle = 0.35 + rand() * 0.5, wide = rand() < 0.4 ? 1.1 : 0.75;
    for (let t = 0; t < 900; t++) {
      const want = Math.atan2(ty_ - y, tx_ - x);
      let d = want - head; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      head += d * 0.06 + (Math.sin(t * 0.045 + ph1) + Math.sin(t * 0.11 + ph2) * 0.5) * 0.06 * wiggle;
      x += Math.cos(head) * 0.5; y += Math.sin(head) * 0.5;
      stamp(x, y, wide + Math.max(0, Math.sin(t * 0.03 + ph2)) * 0.45, 1);
      if (x < -2 || y < -2 || x > MAXD + 2 || y > MAXD + 2) break;
    }
  };
  // a pond: a cluster of overlapping circles, and sometimes an island left dry in the middle
  const pond = (big) => {
    let x, y, tries = 0;
    do { const a = rand() * 6.3, d = 7 + rand() * 30; x = mid + Math.cos(a) * d; y = mid + Math.sin(a) * d; } while (++tries < 20 && Math.hypot(x - mid, y - mid) < 6);
    const R = big ? 3.4 + rand() * 2.2 : 1.4 + rand() * 1.8;
    stamp(x, y, R, 1);
    for (let i = 0, n = 2 + Math.floor(rand() * 3); i < n; i++) {
      const a = rand() * 6.3, d = R * (0.4 + rand() * 0.4);
      stamp(x + Math.cos(a) * d, y + Math.sin(a) * d, R * (0.5 + rand() * 0.4), 1);
    }
    if (big && rand() < 0.6) stamp(x + (rand() - 0.5) * 0.8, y + (rand() - 0.5) * 0.8, Math.max(1, R * (0.28 + rand() * 0.12)), 0);
  };
  const style = rand();
  if (style < 0.3) { river(); for (let i = Math.floor(rand() * 3); i > 0; i--) pond(false); }        // a river and a few ponds
  else if (style < 0.55) { for (let i = 3 + Math.floor(rand() * 3); i > 0; i--) pond(rand() < 0.5); pond(true); }   // lake country
  else if (style < 0.85) { river(); pond(true); for (let i = 1 + Math.floor(rand() * 3); i > 0; i--) pond(rand() < 0.4); }
  else { river(); river(); pond(rand() < 0.5); }                                       // two rivers that may cross
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
    if (edgeBias && span > CFG.startSpan && rand() < 0.45) {
      const ring = Math.floor(rand() * Math.max(1, CFG.growPerWeek)), side = Math.floor(rand() * 4);
      const along = org + 1 + Math.floor(rand() * (span - 2));
      if (side === 0) { c = along; r = org + ring; } else if (side === 1) { c = org + span - 1 - ring; r = along; }
      else if (side === 2) { c = along; r = org + span - 1 - ring; } else { c = org + ring; r = along; }
    } else { c = org + 1 + Math.floor(rand() * (span - 2)); r = org + 1 + Math.floor(rand() * (span - 2)); }
    const k = idx(c, r);
    if (!inPlay(k) || water[k] || occupied(k) || storeFront(k)) continue;
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
/* the open tiles at each end of a store's car park stay free of houses, so a road can always get in */
function storeFront(k) {
  for (const b of buildings) if (isBig(b)) for (const [t] of storeDoors(b)) if (t === k) return true;
  return false;
}
/* a random spot for a whole 3x4 store, at least `gap` tiles clear of every other building */
function storeSpot(gap) {
  for (let t = 0; t < 900; t++) {
    const c = org + 1 + Math.floor(rand() * Math.max(1, span - 2)), r = org + 1 + Math.floor(rand() * Math.max(1, span - 2));
    const k = idx(c, r), sd = ORTH[Math.floor(rand() * 4)], ends = randomEnds();
    if (!storeFits(k, sd, inPlay, ends)) continue;
    let ok = true;
    for (const tl of storeTilesAt(k, sd)) {
      for (let dc = -gap; dc <= gap && ok; dc++) for (let dr = -gap; dr <= gap && ok; dr++) {
        const cc = cx(tl) + dc, rr = cy(tl) + dr;
        if (cc >= 0 && rr >= 0 && cc < COLS && rr < ROWS && bAt[idx(cc, rr)] >= 0) ok = false;
      }
      if (!ok) break;
    }
    if (ok) return {k, sd, ends};
  }
  return null;
}
/* half of all stores open at both ends of their car park, the rest at just one */
const randomEnds = () => rand() < 0.5 ? 0 : rand() < 0.5 ? 1 : 2;
/* take back the building just added (a store that found no room for its house) */
function dropLastBuilding(b) {
  if (buildings[buildings.length - 1] !== b) return;
  for (const t of bTiles(b)) if (bAt[t] === buildings.length - 1) bAt[t] = -1;
  buildings.pop(); linkBuildings(); rebuildNet();
}
function newBuilding(k, type, colorIdx, sd, ends) {
  const b = {k, type, color: colorIdx, pins: 0, claimed: 0, timer: 0, tier: 0, cars: [], carsN: 0, park: 0, lvl: 0, trucks: 0,
             docks: [], served: 0, acc: -1, face: 0, pref: -1, unreach: 0, born: clock, bornAnim: animT, contract: null,
             pinTimer: CFG.pinIntervalBase * 0.6 * DIFF.pin,
             evolveTimer: rnd(CFG.storeEvolveCheckMin, CFG.storeEvolveCheckMax)};
  if (type === 'store' && sd >= 0) { b.sd = sd; b.ends = ends || 0; }
  markBuilding(b, buildings.length); buildings.push(b);
  return b;
}
function addBuilding(type, colorIdx) {
  let b;
  if (type === 'store') {
    const spot = storeSpot(2) || storeSpot(1) || storeSpot(0);
    if (!spot) return null;
    b = newBuilding(spot.k, type, colorIdx, spot.sd, spot.ends);
  } else {
    let k = freeSpot(1, true);
    if (k < 0) k = freeSpot(0, true);                 // a tight map: right beside other buildings is fine
    if (k < 0) return null;
    b = newBuilding(k, type, colorIdx);
  }
  linkBuildings();
  if (type === 'house') for (let i = 0; i < CFG.carsPerHouse; i++) addCar(buildings.length - 1);
  if (clock > 1) { popRing(bX(b), bY(b), COLORS[colorIdx].hex); }
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
  const free = k => k >= 0 && !occupied(k) && !water[k] && !storeFront(k);
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
/* a big store as close as possible to where the script wants its parking row, facing `sds[0]` if it can */
function tutStoreSpot(dc, dr, sds) {
  const inside = t => { const c = cx(t) - org, r = cy(t) - org; return c >= 1 && r >= 1 && c <= span - 2 && r <= span - 2; };
  const near = (maxRad, list) => {
    for (const sd of list)                          // the right facing a few tiles off beats the wrong one on the spot
      for (let rad = 0; rad < maxRad; rad++)
        for (let a = -rad; a <= rad; a++) for (let b = -rad; b <= rad; b++) {
          if (Math.max(Math.abs(a), Math.abs(b)) !== rad) continue;
          const k = tutAt(dc + a, dr + b);
          if (storeFits(k, sd, inside)) return {k, sd};
        }
    return null;
  };
  return near(4, sds.slice(0, 1)) || near(4, sds.slice(1, 3)) || near(12, sds);
}
function placeTutBuilding(type, colorIdx, dc, dr, sds) {
  const spot = type === 'store' ? tutStoreSpot(dc, dr, sds || ORTH) : null;
  newBuilding(spot ? spot.k : tutFreeTile(dc, dr), type, colorIdx, spot ? spot.sd : undefined);
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
  // the store's car park runs towards its house, so the natural road meets one end of it
  const dx = ho[0] - st[0], dy = ho[1] - st[1];
  const face = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 2 : 6) : (dy >= 0 ? 4 : 0);
  const si = placeTutBuilding('store', col, st[0], st[1], [(face + 2) % 8, (face + 6) % 8, face, (face + 4) % 8]);
  const hi = placeTutBuilding('house', col, ho[0], ho[1]);
  tutAddCarsFrom(startIdx);
  tutFinishPlacement();
  for (const i of [si, hi]) popRing(bX(buildings[i]), bY(buildings[i]), COLORS[col].hex);
}
/* stage 0: just the red pair, nothing else — a blank canvas for the first road */
function buildTutorialStage0() {
  placeTutBuilding('store', 0, 4, 8, [0, 4, 2, 6]);
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
  const at = st === 11 ? js.slice(0, 3) : (st === 8 || st === 9 || st === 10) ? (red.h ? [red.h.k] : []) : (red.s ? [red.s.k] : []);
  if (ok) return {ok: true};
  const b = tutBroken(-1, R); if (b) return Object.assign(tutBrokenMsg(b), {ok: false});
  if (st === 11 && !js.length) return {ok: false, kind: 'warn', msg: 'There are no junctions on the map right now. Join two roads to make one, then upgrade it.', at: []};
  return {ok: false, at};
}
/* free play after the guided steps: things worth trying that don't need a scripted scenario */
const TUT_LESSONS = [
  {id: 'van', name: 'Grow a car into a pickup', hint: 'Tap one car and buy Carry size twice: hatchback \u2192 estate \u2192 pickup. Each size carries one more parcel per trip but drives 10% slower.', hit: () => cars.some(c => bodyOf(c) >= 2)},
  {id: 'shop', name: 'Open the Shop tab', hint: 'In the side panel, the Shop tab sells tow trucks, motorway pieces, extra cars and delivery vans for cash, any time you can afford them.', hit: () => tutShopOpened},
  {id: 'event', name: 'Trigger a live event', hint: 'In a real city these happen by themselves. Use the buttons below to try rush hour, rain, a breakdown, a road closure, an ambulance or a contract, and see how your roads cope.', hit: () => tutEventTried},
  {id: 'rail', name: 'Lay a railway', hint: 'Pick the Rail tool and drag a line from beside a store to beside a house of the same colour. A train appears and shuttles six parcels a trip on its own line, waiting for nobody.', hit: () => trains.length > 0},
  {id: 'bus', name: 'Start a bus route', hint: 'Pick the Bus tool, tap a store, then up to four houses of its colour, then the store again. The bus carries three parcels round the loop and drops some at every stop.', hit: () => busRoutes.length > 0},
  {id: 'drone', name: 'Get a delivery drone', hint: 'Buy Delivery drones in the Perks tab (in a real city it is also a weekly reward from week 6). Each level adds a drone that flies one parcel straight to a house, over everything.', hit: () => perks.drone > 0}
];
/* the guided steps; TUT_STEPS[tutStage] is always the active one.
   t: the title, active: one line on what this step is, how: what to do, click by click, tip: what's worth knowing,
   done: what you've just achieved (shown once the step is complete) */
const TUT_STEPS = [
  {t: 'Connect the red store and house',
   active: 'Your first delivery route: join the red store to the red house with a road.',
   how: ['The Road tool (key 2) is already picked.', 'Press on the end of the red store\u2019s car park, where the white arrow points.',
         'Drag along the glowing ghost road to a tile beside the red house, then let go.', 'Watch a red car drive out, collect a parcel and bring it home.'],
   tip: 'Stores only join a road at the ends of their car park; houses join on any side. Made a mistake? Ctrl+Z undoes it, and the Erase tool (E) removes road.',
   done: 'Parcels are flowing. Every round trip scores a point and earns cash.'},
  {t: 'Connect the amber store and house',
   active: 'A second route, and this one has to cross the first.',
   how: ['Find the amber store and house (they have pulsing rings).', 'Drag a road from an end of the amber car park toward the amber house.',
         'Let your road run across the red road: the shared tile becomes an intersection.'],
   tip: 'Crossing roads is free, but cars meeting there have to take turns. Busy crossings are where jams begin, so keep an eye on them.',
   done: 'You built your first intersection. Cars now give way to each other where the roads meet.'},
  {t: 'See how junctions work',
   active: 'Every crossing starts as a give-way. Learn the other controls before you need them.',
   how: ['Read the guide that opens: give-way, traffic lights and roundabouts.', 'Press Start building when you\u2019re ready.'],
   tip: 'Give-way: free and fine while it\u2019s quiet. Lights: the two directions take turns, a few cars at a time. Roundabouts: cars from every side merge without stopping.',
   done: 'You know a give-way from a light from a roundabout.'},
  {t: 'Turn a junction into a light',
   active: 'Connect the blue pair across a road, then put traffic lights on that crossing.',
   how: ['Drag a road from an end of the blue car park to the blue house so it crosses another road.', 'Pick the Light tool (key 7).',
         'Tap the crossing on the blue road. It uses one of your traffic lights.'],
   tip: 'Lights have sensors: a side with nobody waiting hands over straight away. Click a placed light to choose how many cars each side lets through per turn.',
   done: 'That crossing now takes turns: each side lets a few cars through, then hands over.'},
  {t: 'Turn a junction into a roundabout',
   active: 'Connect the green pair across a road, then make that crossing a roundabout.',
   how: ['Drag a road from an end of the green car park to the green house, across another road.', 'Pick the Roundabout tool (key 8).',
         'Tap the crossing on the green road.'],
   tip: 'Cars drive round the ring and leave at their exit. Roundabouts handle traffic from many sides at once, but a ring that fills up can still lock.',
   done: 'Several streams can now merge without anyone stopping outright.'},
  {t: 'Place a turn sign',
   active: 'Ban one turn at a junction, to stop awkward turns blocking it.',
   how: ['Pick the Signs tool (key 9).', 'Choose a sign in the bar that appears, like No left or Ahead only.',
         'Tap a junction. Every car arriving there follows it, judged from its own direction.'],
   tip: 'Before you go on, check every store and house can still be reached. A sign that cuts a route off makes cars give up and turn back.',
   done: 'Signs are read from the driver\u2019s seat, and every car obeys them.'},
  {t: 'Make part of a loop one-way',
   active: 'The teal loop has two ways round, so one stretch of it can be one-way for free.',
   how: ['Keep the Signs tool and choose One-way.', 'Tap a straight stretch of the teal loop (not a junction). Arrows show the direction.',
         'Tap it again to flip the direction, a third time to make it two-way again.'],
   tip: 'One-way roads stop cars meeting head-on in the same street. Use them on loops, where every stop can still be reached the other way round.',
   done: 'Cars still reach both teal buildings, without sharing a lane.'},
  {t: 'Build a motorway',
   active: 'Link two far-apart roads with an express route that skips every junction between them.',
   how: ['Pick the Motorway tool (key 6).', 'Tap a tile on the red road.', 'Tap a tile on the teal loop at least 4 tiles away. The motorway is built between the two.'],
   tip: 'Only cars with a bigger fuel tank can use motorways. Nobody drives on this one yet; you\u2019ll fit a tank in a few steps.',
   done: 'An express link now skips every junction between its two ends.'},
  {t: 'Buy a car for a house',
   active: 'Give a house another car, so it can make more trips at once.',
   how: ['Pick Inspect (key 1).', 'Tap the red house (it\u2019s marked).', 'Press Buy a car in the panel that opens.'],
   tip: 'Each extra car at the same house costs more than the last. Buy for houses whose store keeps filling up faster than its cars can empty it.',
   done: 'More cars per house means more trips a minute, and a bigger house to park them.'},
  {t: 'Upgrade a car',
   active: 'Make one car carry more, or drive faster.',
   how: ['Tap a red car on the road, or pick one from the house\u2019s car list.', 'Press Carry size for one more parcel per trip (but 10% slower), or Speed for a faster kit.'],
   tip: 'Cars change model as they grow: hatchback, estate, then pickup. Speed kits add racing stripes, then a GT and a racer look.',
   done: 'Each upgrade changes how the car looks, so you can spot your best ones.'},
  {t: 'Fit a bigger fuel tank',
   active: 'Give a car the range for long trips and your motorway.',
   how: ['Tap any red car.', 'Press Fuel tank.', 'Watch it use the motorway on its next long trip.'],
   tip: 'A stock tank covers 16 road tiles each way and can\u2019t use motorways. If a far-away house stops sending cars, its cars are out of range.',
   done: 'That car can now take the motorway and reach houses further away.'},
  {t: 'Upgrade a junction',
   active: 'Let more cars through a busy crossing on each turn.',
   how: ['Pick Inspect (key 1) and tap any junction.', 'Press its upgrade button.', 'A gold ring around the junction shows its level.'],
   tip: 'A busy junction at a higher level often does more good than building extra roads around it.',
   done: 'Upgraded junctions let more cars through on each turn.'},
  {t: 'Upgrade a store',
   active: 'Make every parcel from a store pay more.',
   how: ['Pick the Upgrade tool (key U).', 'Tap any store.'],
   tip: 'Store upgrades are pure profit: the same traffic earns more cash. Stores also grow by themselves as they get busier.',
   done: 'Every parcel from that store now pays more.'},
  {t: 'Hire a tow truck',
   active: 'Keep a truck ready to clear broken-down and stuck cars.',
   how: ['Pick Hire tow (key Y).', 'Tap any store. The truck parks in that store\u2019s garage.'],
   tip: 'When a car breaks down or gets stuck for too long, the truck drives out, clears it and comes home, before one car can back up a whole street.',
   done: 'Your tow truck will clear stuck and broken-down cars on its own. That\u2019s everything: the city is yours.'}
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
  {tool: 'select', at: [[12, 8]], why: 'Range decides which houses can serve a store. Long trips and motorways need a bigger tank.'},
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
  () => cars.some(c => carUp(c, 'fuel') > 0),
  () => nodeList.some(nd => nd.lvl > 0),
  () => buildings.some(b => b.type === 'store' && b.lvl > 0),
  () => trucks.length > 0
];
const TUT_ENTER = {1: () => tutSpawnAmber(), 3: () => tutSpawnBlue(), 4: () => tutSpawnGreen(), 6: () => tutSpawnTeal()};
function tutGoto(n) {
  tutStage = n; tutLive = null;
  if (n >= TUT_STEPS.length) awardAch('tutorial');
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
  setHTML($('tc-how'), (st.how || []).map(x => '<li>' + x + '</li>').join(''));
  $('tc-tip').textContent = st.tip || ''; $('tc-tip').parentNode.hidden = !st.tip;
  $('tc-why').textContent = co.why;
  const tl = co.tool ? TOOLS.find(t => t.id === co.tool) : null;
  const tt = $('tc-tool'); tt.hidden = !tl; if (tl) tt.textContent = tl.label + ' \u00b7 ' + tl.key;
  const ic = $('tc-icon'); if (ic) ic.innerHTML = icon(tl ? tl.icon : 'select', 22);
  setHTML($('tc-dots'), TUT_STEPS.map((_, i) => '<i class="' + (i < tutStage ? 'd' : i === tutStage ? 'a' : '') + '"></i>').join(''));
  if (co.tool) { const b = document.querySelector('.tool[data-id="' + co.tool + '"]'); if (b) b.classList.add('tut-glow'); }
  renderTutLive();
  applyCoachDock();
  if (changed) { card.classList.remove('swap'); void card.offsetWidth; card.classList.add('swap'); card.classList.remove('full'); }
}
/* The coach card can shrink to a slim bar flat against the bottom, and (on bigger screens) be dragged to the bottom
   middle, the bottom left, or into the right-hand tutorial panel. Phones only get the shrink. Remembered per browser. */
const COACH_KEY = 'junction-coach-v1';
let coachPref = (() => { try { const d = JSON.parse(localStorage.getItem(COACH_KEY)); if (d && typeof d === 'object') return {dock: ['center', 'left', 'right'].includes(d.dock) ? d.dock : 'center', bar: !!d.bar}; } catch (e) {} return {dock: 'center', bar: false}; })();
let coachHome = null, coachDrag = null, coachNoClick = false;
const coachMobile = () => window.matchMedia('(max-width: 700px)').matches;
function saveCoach() { try { localStorage.setItem(COACH_KEY, JSON.stringify(coachPref)); } catch (e) {} }
function applyCoachDock() {
  const card = $('tut-coach'), panel = $('tut-panel'); if (!card || !panel) return;
  if (!coachHome) coachHome = card.parentNode;
  const mobile = coachMobile(), dock = mobile ? 'center' : coachPref.dock;
  const inPanel = dock === 'right' && !panel.hidden && !panel.classList.contains('min');
  if (inPanel) { const before = $('tut-open-explain'); if (card.parentNode !== panel || card.nextSibling !== before) panel.insertBefore(card, before); }
  else if (card.parentNode !== coachHome) coachHome.insertBefore(card, $('coach-zones'));
  card.classList.toggle('dock-left', dock === 'left');
  card.classList.toggle('dock-right', dock === 'right' && !inPanel);
  card.classList.toggle('in-panel', inPanel);
  card.classList.toggle('tc-bar', coachPref.bar);
  $('app').classList.toggle('coach-bar', coachPref.bar && !inPanel && !card.hidden && tutorialMode);   // lift the hint above the bar
  card.classList.toggle('can-drag', !mobile);
  const b = $('tc-shrink'); if (b) { b.title = coachPref.bar ? 'Show the step' : 'Shrink to the bottom'; b.setAttribute('aria-label', b.title); b.classList.toggle('up', coachPref.bar); }
}
function coachZoneAt(x) { return x > innerWidth - 330 ? 'right' : x < innerWidth * 0.36 ? 'left' : 'center'; }
function bindCoachDock() {
  const card = $('tut-coach'), zones = $('coach-zones');
  $('tc-shrink').addEventListener('click', e => { e.stopPropagation(); coachPref.bar = !coachPref.bar; if (coachPref.bar) card.classList.remove('full'); saveCoach(); applyCoachDock(); });
  card.addEventListener('click', () => {
    if (coachNoClick) return;
    if (coachPref.bar) { coachPref.bar = false; saveCoach(); applyCoachDock(); return; }   // tapping the bar brings the card back
    card.classList.toggle('full');
  });
  card.addEventListener('pointerdown', e => {
    if (coachMobile() || e.button !== 0 || e.target.closest('button')) return;
    const r = card.getBoundingClientRect();
    coachDrag = {x0: e.clientX, y0: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, moved: false};
  });
  addEventListener('pointermove', e => {
    const d = coachDrag; if (!d) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
      d.moved = true;
      if (card.parentNode !== coachHome) coachHome.insertBefore(card, zones);
      card.classList.add('dragging'); card.style.width = d.w + 'px'; zones.hidden = false;
    }
    card.style.left = (e.clientX - d.dx) + 'px'; card.style.top = (e.clientY - d.dy) + 'px';
    const z = coachZoneAt(e.clientX); zones.querySelectorAll('i').forEach(i => i.classList.toggle('on', i.dataset.z === z));
  });
  addEventListener('pointerup', e => {
    const d = coachDrag; coachDrag = null; if (!d || !d.moved) return;
    coachPref.dock = coachZoneAt(e.clientX); saveCoach();
    card.classList.remove('dragging'); card.style.left = card.style.top = card.style.width = ''; zones.hidden = true;
    coachNoClick = true; setTimeout(() => { coachNoClick = false; }, 50);   // the drop isn't a tap
    applyCoachDock();
    hint(coachPref.dock === 'right' ? 'The tutorial card now sits in the right-hand panel.' : coachPref.dock === 'left' ? 'The tutorial card now sits bottom left.' : 'The tutorial card is back at the bottom.');
  });
  addEventListener('resize', () => applyCoachDock());
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
  if (tutGhost && tutGhost.length > 1) {                 // the ghost road and a hand showing the drag
    const pts = tutGhost.map(k => [tx(k), ty(k)]);
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.strokeStyle = 'rgba(255,200,40,.35)'; ctx.lineWidth = CFG.roadWidth + 6; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = CFG.roadWidth - 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,180,20,.95)'; ctx.lineWidth = 2; ctx.setLineDash([5, 6]); ctx.lineDashOffset = REDUCED_MOTION ? 0 : -animT * 22; ctx.stroke();
    ctx.restore();
    // the hand travels the route, then lifts and starts again
    const seg = []; let tot = 0; for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); tot += l; }
    const cyc = REDUCED_MOTION ? 0.5 : (animT * 0.28) % 1.25, u = Math.min(1, cyc);
    let d = u * tot, i = 0; while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
    const t = seg[i] ? d / seg[i] : 0, hx = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, hy = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
    const press = cyc <= 1, lift = press ? 0 : (cyc - 1) * 40;
    ctx.save(); ctx.translate(hx + 6, hy + 8 - lift);
    if (press) { ctx.strokeStyle = 'rgba(255,200,40,.85)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(-6, -8, 6 + Math.sin(animT * 8) * 1.2, 0, 6.3); ctx.stroke(); }
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(2, 3, 7, 4, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#1d2b33'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(-3.5, -10.5); ctx.lineTo(-1, -8); ctx.lineTo(-1, -1); ctx.lineTo(4, -2); ctx.lineTo(7, 1); ctx.lineTo(6, 8); ctx.lineTo(-3, 8); ctx.lineTo(-7, 2); ctx.lineTo(-6, -8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    const [sx, sy] = pts[0];
    ctx.save(); ctx.font = '800 10px Overpass, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,25,35,.8)'; ctx.fillStyle = '#ffd23a';
    const ly = sy + 26; ctx.strokeText('Drag from here', sx, ly); ctx.fillText('Drag from here', sx, ly); ctx.restore();
  } else if (line && ks.length >= 2) {
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
    h += '<div class="goal now"><span class="tick">' + (tutStage + 1) + '</span><div><b>' + TUT_STEPS[tutStage].t + '</b><small>' + TUT_STEPS[tutStage].active + '</small>' +
      ((TUT_STEPS[tutStage].how || []).length ? '<ol class="goal-how">' + TUT_STEPS[tutStage].how.map(x => '<li>' + x + '</li>').join('') + '</ol>' : '') + '</div></div>';
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
/* For a step that needs a connection, a suggested route from an open end of the store's car park to the house:
   drawn on the map as a ghost road with a hand tracing the drag. */
const TUT_CONNECT = {0: 0, 1: 2, 3: 1, 4: 3};
let tutGhost = null, tutFollowDone = false;
function tutGhostPath(col) {
  const {s: st, h} = tutPair(col); if (!st || !h) return null;
  const starts = isBig(st) ? storeDoors(st) : ORTH.map(d => [nbr(st.k, d), st.k]);
  const goal = new Set(ORTH.map(d => nbr(h.k, d)).filter(k => k >= 0));
  const ok = k => k >= 0 && inPlay(k) && !water[k] && (road[k] || !occupied(k));
  const prev = new Map(), from = new Map(), q = [];
  for (const [t, f] of starts) if (ok(t) && !prev.has(t)) { prev.set(t, -1); from.set(t, f); q.push(t); }
  while (q.length) {
    const k = q.shift();
    if (goal.has(k)) {                                     // walk back to the store, then add its car-park tile and the house
      const path = [h.k]; let c = k;
      while (c !== -1) { path.push(c); if (prev.get(c) === -1) { path.push(from.get(c)); break; } c = prev.get(c); }
      return path.reverse();
    }
    for (const d of ORTH) { const n = nbr(k, d); if (!prev.has(n) && ok(n)) { prev.set(n, k); q.push(n); } }
  }
  return null;
}
function checkTutorial() {
  if (!tutorialMode) return;
  if (tutStage in TUT_CONNECT) { const col = TUT_CONNECT[tutStage], r = tutRoute(col); tutGhost = r.state === 'ok' ? null : tutGhostPath(col); } else tutGhost = null;
  if (tutStage === 0 && !tutFollowDone) {                // the first trip: follow a red car out and back
    const c = cars.find(x => x.color === 0 && (x.state === 'driving' || x.state === 'exiting') && x.job === 'fetch');
    if (c && !(sel && sel.ref === c)) { sel = {type: 'car', ref: c}; follow = true; cam.auto = false; toast(tcol('Watch this red car: it drives to the store, loads a parcel, and brings it home. That\u2019s one delivery.'), 'tip'); }
    if (stats.delivered >= 1) { tutFollowDone = true; follow = false; cam.auto = true; closeInspector(); toast('Delivered! +1 point and cash. Each parcel delivered also earns towards Junc Bucks (◎).', 'good'); }
  }
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
/* ---- the tutorial's opening: five short animated cards on how the game works, drawn with the real artwork ---- */
const TI_CARDS = [
  {t: 'Stores make parcels', b: 'Each store fills up with parcels of its colour; the number over it shows how full it is. If a store stays full for too long, the city is lost (not in the tutorial, though). Your job is to keep every store emptying.'},
  {t: 'Houses send cars', b: 'Houses send their cars to fetch parcels from stores of the <b>same colour</b> and bring them home. Each parcel delivered scores a point and earns cash. A house starts with two cars, and you can buy more.'},
  {t: 'You draw the roads', b: 'Drag to lay road. Houses join on any side; stores only at the <b>ends of their car park</b> (the white arrows); some open at both ends, some at one. Road tiles are limited: you get more each week. Ctrl+Z undoes, and the Erase tool (E) removes road.'},
  {t: 'Keep traffic moving', b: 'Where roads cross, cars take turns. Traffic lights, roundabouts, turn signs, one-way streets and motorways each fix a different kind of jam. You\u2019ll try every one of them in this tutorial.'},
  {t: 'Weeks and rewards', b: 'Each week the map grows and new stores and houses appear. When a week ends you pick one reward: extra roads plus a perk, a bridge, a light, a roundabout or another tool. Plan for the traffic that\u2019s coming, not just what\u2019s there.'},
  {t: 'Cash, \u25ce coins and \u2726 stars', b: '<b>Cash</b> is earned in each city and spent there on cars, upgrades and the Shop. <b>\u25ce coins</b> (2 for every 3 parcels) stay with you between cities and buy looks in the Store. <b>\u2726 stars</b> come only from Frantic cities and buy the daily special.'},
  {t: 'Getting around', b: 'Scroll or pinch to zoom; right-drag, or hold Shift and drag, to move the map. Keys 1\u20139 pick tools, P pauses, and the speed buttons go from half to 3\u00d7. Tap anything with Inspect (key 1) to see what it\u2019s doing.'}
];
let tiCard = 0, tiRaf = 0, tiT0 = 0;
function openTutIntro() {
  tiCard = 0; openModal('m-tutintro'); running = false; renderTutIntro();
  cancelAnimationFrame(tiRaf); tiT0 = performance.now();
  const loop = now => { if ($('m-tutintro').hidden) return; drawTutIntro((now - tiT0) / 1000); tiRaf = requestAnimationFrame(loop); };
  tiRaf = requestAnimationFrame(loop);
}
function closeTutIntro() { if ($('m-tutintro').hidden) return; closeModal('m-tutintro'); cancelAnimationFrame(tiRaf); running = true; toast(tcol('Your turn: connect the red store to the red house. Follow the ghost road.'), 'good'); }
function renderTutIntro() {
  const c = TI_CARDS[tiCard];
  $('ti-stage').innerHTML = '<canvas id="ti-cv" width="560" height="250"></canvas><h3>' + (tiCard + 1) + '. ' + c.t + '</h3><p>' + c.b + '</p>';
  $('ti-dots').innerHTML = TI_CARDS.map((_, i) => '<i class="' + (i === tiCard ? 'a' : i < tiCard ? 'd' : '') + '"></i>').join('');
  $('ti-back').disabled = tiCard === 0;
  $('ti-next').textContent = tiCard === TI_CARDS.length - 1 ? 'Let\u2019s build' : 'Next';
}
function drawTutIntro(t) {
  const cv2 = $('ti-cv'); if (!cv2) return;
  const g = cv2.getContext('2d'), W2 = cv2.width, H2 = cv2.height, keepSun = Object.assign({}, SUN);
  SUN.x = 0.55; SUN.y = 0.8; SUN.a = 1;
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = PAL.land2; g.fillRect(0, 0, W2, H2);
  const keepAnim = animT; animT = t;
  withCtx(g, () => {
    const at = (wx, wy, z) => g.setTransform(z, 0, 0, z, W2 / 2 - wx * z, H2 / 2 - wy * z);
    const store = {type: 'store', k: idx(6, 6), sd: 2, ends: 0, tier: 1, lvl: 0, pins: 0, color: 0, face: sdFace(2), acc: 0, park: 0, docks: []};
    const house = {k: idx(10, 6), face: Math.PI / 2, extra: 0, color: 0, acc: 0, cars: [], carsN: 2};
    const road = () => { const P = new Path2D(); P.moveTo(tx(idx(7, 4)), ty(idx(7, 4))); P.lineTo(tx(idx(9, 4)), ty(idx(9, 4))); P.lineTo(tx(idx(9, 6)), ty(idx(9, 6))); return P; };
    const car = (x, y, a, load) => drawCar({x, y, ang: a, da: a, color: 0, up: {cap: 0, spd: 0, load: 0, fuel: 0}, van: false, load: load || 0, state: 'driving', v: 0, id: 3, brake: false, broken: 0, stopT: 0});
    if (tiCard === 0) { store.pins = Math.floor((t * 1.6) % 9); at(bX(store), bY(store), 1.9); drawStore(store);
      g.font = '800 15px Overpass, system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#12303f'; g.fillText(store.pins + ' / 8', bX(store), bY(store) - 56); }
    else if (tiCard === 1) { at(tx(house.k), ty(house.k), 3.2); drawHouse(house);
      const u = (t * 0.35) % 1, x = tx(house.k) - 28 + u * 56; car(x, ty(house.k) + 22, 0, u > 0.5 ? 1 : 0); }
    else if (tiCard === 2) {
      at((tx(idx(6, 6)) + tx(idx(10, 6))) / 2, ty(idx(5, 5)), 1.5);
      drawStore(store); drawHouse(house);
      const u = Math.min(1, (t * 0.45) % 1.6);
      const P = road(); g.save(); g.setLineDash([u * 200, 400]); paintRoadPath(P, false); g.restore();
      if (u >= 1) { const v = ((t * 0.45) % 1.6 - 1) / 0.6; car(tx(idx(7, 4)) + v * 64, ty(idx(7, 4)) + 4, 0, 1); }
    } else if (tiCard === 3) {
      at(tx(idx(8, 8)), ty(idx(8, 8)), 2.2);
      const P = new Path2D(); P.moveTo(tx(idx(4, 8)), ty(idx(4, 8))); P.lineTo(tx(idx(12, 8)), ty(idx(12, 8))); P.moveTo(tx(idx(6, 6)), ty(idx(6, 6))); P.lineTo(tx(idx(6, 10)), ty(idx(6, 10)));
      P.moveTo(tx(idx(10, 6)), ty(idx(10, 6))); P.lineTo(tx(idx(10, 10)), ty(idx(10, 10))); paintRoadPath(P, false, true);
      drawLightHeads(tx(idx(6, 8)), ty(idx(6, 8)), {ph: Math.floor(t / 2) % 2, allRed: false}, [0, 0]);
      drawRoundAt(tx(idx(10, 8)), ty(idx(10, 8)));
      const a = t * 1.2; car(tx(idx(10, 8)) + Math.cos(a) * 10.6, ty(idx(10, 8)) + Math.sin(a) * 10.6, a + Math.PI / 2, 0);
    } else if (tiCard === 4) {                             // the map growing week by week
      g.setTransform(1, 0, 0, 1, 0, 0);
      const ph = (t * 0.5) % 3, wk = 1 + Math.floor(ph);
      for (let i = 0; i < 3; i++) { const sz = 70 + i * 50, a = i < ph ? 1 : 0.18; g.strokeStyle = 'rgba(30,60,75,' + (0.75 * a).toFixed(2) + ')'; g.lineWidth = 3; g.setLineDash([10, 8]); g.beginPath(); if (g.roundRect) g.roundRect(W2 / 2 - sz, H2 / 2 - sz * 0.5, sz * 2, sz, 16); else g.rect(W2 / 2 - sz, H2 / 2 - sz * 0.5, sz * 2, sz); g.stroke(); }
      g.setLineDash([]); g.fillStyle = '#12303f'; g.font = '900 22px Overpass, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Week ' + wk, W2 / 2, H2 / 2);
    } else if (tiCard === 6) {                             // keys and the mouse
      g.setTransform(1, 0, 0, 1, 0, 0);
      const key = (x, y, w, txt, on) => { g.fillStyle = on ? '#ffc933' : '#f4f2ec'; g.beginPath(); if (g.roundRect) g.roundRect(x - w / 2, y - 22, w, 44, 12); else g.rect(x - w / 2, y - 22, w, 44); g.fill(); g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2; g.stroke(); g.fillStyle = '#12303f'; g.font = '800 17px Overpass, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, x, y + 1); };
      const hi = Math.floor(t * 0.8) % 4;
      key(W2 * 0.2, H2 * 0.4, 70, '1\u20139', hi === 0); key(W2 * 0.4, H2 * 0.4, 50, 'P', hi === 1); key(W2 * 0.6, H2 * 0.4, 96, 'Ctrl Z', hi === 2); key(W2 * 0.8, H2 * 0.4, 70, 'Shift', hi === 3);
      g.fillStyle = '#12303f'; g.font = '700 14px Overpass, system-ui, sans-serif';
      ['tools', 'pause', 'undo', '+ drag to move'].forEach((l, i) => g.fillText(l, W2 * (0.2 + i * 0.2), H2 * 0.4 + 40));
      const mx = W2 / 2, my = H2 * 0.78 + Math.sin(t * 2) * 3; g.fillStyle = '#f4f2ec'; g.beginPath(); g.ellipse(mx, my, 18, 26, 0, 0, 6.3); g.fill(); g.strokeStyle = 'rgba(0,0,0,.2)'; g.stroke(); g.fillStyle = '#ffc933'; g.beginPath(); if (g.roundRect) g.roundRect(mx - 3, my - 18, 6, 12, 3); else g.rect(mx - 3, my - 18, 6, 12); g.fill();
    } else {
      g.setTransform(1, 0, 0, 1, 0, 0);
      const coin = (x, y, txt, c1, c2) => { const gr = g.createRadialGradient(x - 8, y - 8, 2, x, y, 30); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.beginPath(); g.arc(x, y + Math.sin(t * 2 + x) * 6, 30, 0, 6.3); g.fill(); g.fillStyle = '#4a3400'; g.font = '900 26px Overpass, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, x, y + Math.sin(t * 2 + x) * 6); };
      coin(W2 * 0.3, H2 / 2, '$', '#d6ffe2', '#43d17a'); coin(W2 * 0.5, H2 / 2, '\u25ce', '#fff1a8', '#d4a017'); coin(W2 * 0.7, H2 / 2, '\u2726', '#efe0ff', '#9a6bff');
    }
  });
  animT = keepAnim; Object.assign(SUN, keepSun);
  g.setTransform(1, 0, 0, 1, 0, 0);
}
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
  demoMode = false; curSlot = '';
  tutorialMode = true; DIFF = DIFFS.zen; diffKey = 'zen'; tutStage = 0; tutLastStage = -1;
  water = new Uint8Array(N); road = new Uint8Array(N); lnk = new Uint8Array(N);
  sign = new Array(N).fill(null); special = new Array(N).fill(null);
  bAt = new Int32Array(N).fill(-1); parkAt = new Int32Array(N).fill(-1); depotAt = new Int32Array(N).fill(-1);
  onewayDir = new Int8Array(N).fill(-1);
  nodes = []; nodeList = []; edges = []; edgeMap = new Map(); buildings = []; cars = []; motorways = []; parks = []; depots = []; transportReset();
  motoSeq = 0; carSeq = 0;
  inv = {road: 60, bridge: 10, moto: 6, light: 6, round: 6, sign: 12, park: 10, depot: 6, rail: 24, bus: 2}; TR.railOn = true; TR.busOn = true;
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
  setTutMin(compactUI() || window.innerHeight < 900, true);
  tutGhost = null; tutFollowDone = false;
  renderTutorialPanel();
  openTutIntro();
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
  const b = bAt[bk] >= 0 ? buildings[bAt[bk]] : null;
  if (isBig(b) && !storeDoors(b).some(([t]) => t === roadK)) {      // a store only opens at the ends of its car park
    hint((b.ends ? 'This store only opens at one end of its car park' : 'Stores connect at the ends of their car park') + ' — bring the road to the end with the arrow.');
    return;
  }
  if (b) b.pref = roadK;
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
  if (questsActive()) { cityQ[kind] = (cityQ[kind] || 0) + 1; questEvent(kind === 'round' ? 'build_round' : 'build_light', cityQ[kind]); }
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
  if (questsActive()) { cityQ.moto = (cityQ.moto || 0) + 1; questEvent('build_moto', cityQ.moto); }
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
    case 'rail': railTool(k, dragging); break;
    case 'bus': busTool(k, dragging); break;
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
  if (tool === 'rail') { stepRail(from, to); return; }
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
  for (const c of cars) if (c.state === 'parked' && !c.job && !c.isBus && c.color === color && nodeOfParked(c) >= 0) out.push(c);
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
      // Try cars nearest first, skipping any that can't make the trip (no road, or not enough fuel)
      // instead of giving up after the three closest. Cars that fail sit out a few seconds.
      let best = null, bestCost = Infinity, good = 0, allTried = true;
      for (const c of idle) {
        if (c.noRouteT > clock) continue;
        if (good >= 3 || solveBudget <= 0) { allTried = false; break; }
        solveBudget--;
        const r = planFor(c, null, nodeOfParked(c), s.acc, null, true), cost = lastCost;
        if (!r) {
          c.noRouteT = clock + 4;
          if (carUp(c, 'fuel') < 1 && motorways.length && planRoute(null, nodeOfParked(c), s.acc)) { s.fuelShort = clock; tipOnce('fuel'); }
          continue;
        }
        if (routeTiles(r) > fuelRange(c)) { c.noRouteT = clock + 4; s.fuelShort = clock; tipOnce('fuel'); continue; }
        good++;
        if (cost < bestCost) { bestCost = cost; best = {c, r}; }
      }
      if (!best) { if (allTried) s.unreach = 1.5; break; }
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
    const r = planFor(c, null, from, depots[bestBay].acc, null, true);
    if (!r || routeTiles(r) > fuelRange(c)) { c.idle = 0; continue; }
    depots[bestBay].res++;
    c.job = 'reposition'; c.bay = bestBay; c.route = r; c.ri = 0; c.destNode = depots[bestBay].acc; c.state = 'exiting'; c.xf = null;
    moved++;
  }
  // cars parked in a bay whose nearest store is now farther than home: let them be — they'll come back after their next trip
}

/* ------------------------------------------------------------ perks (bought with cash) */
const PERK_DEFAULTS = {boots: 0, tyres: 0, marshal: 0, quick: 0, loading: 0, patience: 0, tow: 0, grip: 0, winch: 0, contracts: 0, drone: 0}; /* p61 */
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
  grip:      {name: 'All-weather tyres', max: 1, cost: [90],                icon: 'drop',  desc: () => 'Rain no longer slows the cars.'},
  drone:     {name: 'Delivery drones',   max: 3, cost: [180, 300, 450],     icon: 'drone', desc: l => l + (l === 1 ? ' drone flies' : ' drones fly') + ' one parcel at a time straight to a house, over everything, at a gentle pace.'}
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
   apply: () => { shuffle(buildings.map((b, i) => ({b, i})).filter(o => o.b.type === 'house' && o.b.carsN < houseCap(o.b))).slice(0, 2).forEach(o => addCar(o.i)); }},
  /* p62: offered once snow has fallen on this city */
  {id: 'plough', kind: 'item', name: 'Snow ploughs', icon: 'truck', desc: () => 'The roads are cleared as the snow falls: no slowdown in a snowstorm, for good.',
   avail: () => !!weatherSeen.snow && !perks.plough, apply: () => { perks.plough = 1; }}
];
UPGRADES.push(   /* p61: the railway and the bus depot, offered as weekly rewards */
  {id: 'rail',  kind: 'item', name: 'Railway',         icon: 'rail',  desc: () => '20 rail tiles and a train. Lay rail from beside a store to beside a house of its colour: the train shuttles 6 parcels a trip on its own line.',
   avail: () => week >= 4, apply: () => { inv.rail = (inv.rail | 0) + 20; TR.railOn = true; syncTransportTools(); }},
  {id: 'bus',   kind: 'item', name: 'Bus depot',       icon: 'bus',   desc: () => 'Two bus routes. Tap a store, then up to 4 houses of its colour: a bus loops them with 3 parcels at a time.',
   avail: () => week >= 3, apply: () => { inv.bus = (inv.bus | 0) + 2; TR.busOn = true; syncTransportTools(); }});
for (const id in PERKS) {
  const P = PERKS[id];
  UPGRADES.push({id: 'perk-' + id, kind: 'perk', perk: id, name: P.name, icon: P.icon,
    desc: () => P.desc(perks[id] + 1), avail: () => perks[id] < P.max,
    apply: () => { perks[id]++; if (id === 'boots') carCapacity = Math.min(CFG.carCapacityMax, CFG.carCapacityStart + perks.boots); }});
}

{ const u = UPGRADES.find(x => x.id === 'perk-drone'); if (u) u.avail = () => week >= 6 && perks.drone < PERKS.drone.max; }   /* p61: a late-game offer */
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
  popRing(bX(s), bY(s), '#ffc933'); popText(bX(s), bY(s) - 20, fmt$(baseRate(s)) + ' a parcel', '#ffc933');
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
  poseYard(si);
  return t;
}
/* line up the trucks waiting inside a store */
function poseYard(si) {
  for (const x of trucks) if (x.store === si && x.state === 'garage') { const p = parkedPose(x); x.x = p.x; x.y = p.y; x.ang = p.a; }
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
  popRing(bX(s), bY(s), '#f08a1c');
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
/* a route that ends on the very lane the stuck car is standing in - or, when that lane can't be
   reached from behind (a car heading for the store on a plain street, say), on the lane beside it */
const twinOf = e => e && edges.find(f => f.a === e.b && f.b === e.a && !f.dead && !f.fast);
const isTwin = (a, b) => !!a && !!b && a.a === b.b && a.b === b.a;
function routeOnto(t, fromEdge, e) {
  if (!e || e.dead) return null;
  if (fromEdge === e) return [e];
  const s = buildings[t.store];
  const base = fromEdge ? planRoute(fromEdge, null, e.a) : (s && s.acc >= 0 ? planRoute(null, s.acc, e.a) : null);
  if (!base) return null;
  const last = base[base.length - 1], nd = nodes[e.a];
  if (last && (!nd || !exitsFor(nd, last).includes(e))) return null;
  return base.concat([e]);
}
function routeToTarget(t, fromEdge) {
  const c = t.tgt, e = c && c.edge;
  if (!e || e.dead) return null;
  return routeOnto(t, fromEdge, e) || routeOnto(t, fromEdge, twinOf(e));
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
  t.loc = {t: 'yard', i: t.store}; poseYard(t.store);
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
      if (!cars.includes(c) || c.state !== 'driving' || (c.edge !== t.edge && !isTwin(c.edge, t.edge))) { if (c.claim === t) c.claim = null; t.hook = null; return; }
      t.hook.t += dt;
      if (t.hook.t >= t.hook.dur) hookCar(t, c);
      return;
    }
    if (!truckTargetOk(t)) { truckHeadHome(t); return; }
    // alongside the car on the other lane: pull up and hook it across
    if (isTwin(t.edge, t.tgt.edge) && Math.hypot(t.x - t.tgt.x, t.y - t.tgt.y) < 26) { hookCar(t, t.tgt); return; }
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
    if (t.job === 'seek' && t.tgt && t.tgt.edge && t.route && t.route[t.route.length - 1] !== t.tgt.edge && !isTwin(t.route[t.route.length - 1], t.tgt.edge) && solveBudget > 0) truckReplan(t);
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
    if (s) { popText(bX(s), bY(s) - 14, '+' + fmt$(bonus), '#7be495'); popRing(bX(s), bY(s), '#ff4d3d'); }
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
  popRing(bX(b), bY(b), '#ffd23a'); sfx('alarm');
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
      popText(bX(b), bY(b) - 20, '+' + fmt$(c.bonus), '#7be495'); sfx('upgrade'); b.contract = null;
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
  {id: 'bay',   name: 'Off the road',        hint: 'Have a car wait in a bay',          hit: () => cars.some(c => c.loc && c.loc.t === 'bay' && c.state === 'parked'), reward: {cash: 15}},
  {id: 'lot',   name: 'Room to park',        hint: 'Build a parking lot',               hit: () => parks.length > 0, reward: {cash: 15}},
  {id: 'moto',  name: 'Fast lane',           hint: 'Open a motorway',                   hit: () => motorways.length > 0, reward: {inv: {bridge: 1}}},
  {id: 'maxcar', name: 'Fully loaded',       hint: 'Max every upgrade on one car',       hit: () => cars.some(c => !c.isTruck && Object.keys(CAR_UP).every(t => carUp(c, t) >= CAR_UP[t].max)), reward: {cash: 60}},
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
  if (demoMode) return;
  if (spectating) return;
  for (const g of GOALS) {
    if (goalsDone.has(g.id)) continue;
    let ok = false; try { ok = g.hit(); } catch (e) {}
    if (ok) {
      goalsDone.add(g.id);
      if (g.reward) giveReward(g.reward);
      toast('Goal: ' + g.name + (g.reward ? ' · ' + rewardText(g.reward) : ''), 'good'); sfx('upgrade'); renderGoals(); refreshUI();
      if (goalsDone.size === GOALS.length && !tutorialMode) { if (life[diffKey] && !spectating) { life[diffKey].allGoals++; saveLife(); } JEvents.emit('allGoals', {clock, diffKey}); }
    }
  }
}

/* ------------------------------------------------------ main update */
function pinCount(s) { return s.pins; }
function update(dt) {
  solveBudget = CFG.maxSolvesPerFrame;
  clock += dt; lightClock += dt; flowTick();
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
        if (rand() < CFG.storeEvolveChance) {
          s.tier++;
          toast('The ' + COLORS[s.color].name + ' store is busier now (tier ' + s.tier + ') \u2014 parcels arrive faster', 'warn');
          popRing(bX(s), bY(s), COLORS[s.color].hex); sfx('upgrade');
        }
      }
    }
    s.pinTimer -= dt;
    if (s.pinTimer <= 0) {
      const base = ramp(CFG.pinIntervalBase, CFG.pinIntervalRamp, CFG.pinIntervalMin) * DIFF.pin;
      s.pinTimer = base * Math.pow(CFG.storeEvolvePinStep, s.tier) / (rush.t > 0 ? CFG.rushRate : 1) * (weather.kind === 'heat' && weather.amt > 0.5 ? 0.8 : 1) + rand() * CFG.pinJitter;   // p62: heat
      if (s.pins < storeCap(s) + 8) { s.pins++; }
    }
    // a full store (8/8, 10/10...) brings one house of its colour now and one more a little later
    if (!spectating && !tutorialMode) {
      const capNow = storeCap(s);
      if (!s.overSpent && s.pins >= capNow) { s.overSpent = true; s.followT = CFG.overflowHouseDelay; spawnOverflowHouse(s); }
      else if (s.overSpent && s.pins <= capNow * CFG.overflowRearm) s.overSpent = false;
      if (s.followT > 0) { s.followT -= dt; if (s.followT <= 0) { s.followT = 0; spawnOverflowHouse(s); } }
    }
    if (s.pins > storeCap(s)) s.timer += dt; else s.timer = Math.max(0, s.timer - dt * CFG.overflowDrain);
    if (s.timer >= overflowLimit() && !DIFF.noFail && !tutorialMode && !spectating) { endGame('The ' + COLORS[s.color].name + ' store ran out of patience.'); return; }
  }
  stepContracts(dt);

  dispatchTimer -= dt;
  if (dispatchTimer <= 0) { dispatchTimer = CFG.dispatchInterval; dispatchTrucks(); dispatch(); }   // trucks plan first so busy frames can't starve them
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
  // (no timed house spawning any more: houses arrive with new stores or when a store fills up)
  storeTimer -= dt;
  if (storeTimer <= 0) {
    storeTimer = ramp(CFG.storeIntervalBase, CFG.storeIntervalRamp, CFG.storeIntervalMin) * DIFF.spawn + rand() * CFG.storeJitter;
    const cols = [...new Set(buildings.filter(b => b.type === 'store').map(b => b.color))];
    let c;
    if (cols.length < COLORS.length && rand() < CFG.newColourChance) c = pick(COLORS.map((_, i) => i).filter(i => !cols.includes(i)));
    else c = pick(cols);
    const ns = addBuilding('store', c);
    let homes = 0;
    if (ns) for (let i = 0; i < CFG.housesOnStoreSpawn; i++) if (addBuilding('house', c)) homes++;
    if (ns && !homes) { dropLastBuilding(ns); storeTimer = 8; }        // no room for its house yet: try again shortly
    else if (ns) {
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
function spawnOverflowHouse(s) {
  const h = addBuilding('house', s.color);
  if (!h) return false;
  toast('The ' + COLORS[s.color].name + ' store is full \u2014 a new ' + COLORS[s.color].name + ' house moved in', 'warn');
  sfx('upgrade');
  return true;
}
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
  if (questsActive()) { questEvent('survive', week); questEvent('earn', Math.floor(stats.earned || 0)); }
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
  sfx('upgrade'); haptic('week'); refreshUI();
  offerUpgrade(grew);
}

/* New houses favour colours that are short of houses for their stores, so a city gets a
   proper mix instead of piling up the first colour. */
function houseColour() {
  const st = {}, hs = {};
  for (const b of buildings) { if (b.type === 'store') st[b.color] = (st[b.color] || 0) + 1; else hs[b.color] = (hs[b.color] || 0) + 1; }
  const cols = Object.keys(st).map(Number); if (!cols.length) return null;
  const w = cols.map(c => st[c] / Math.pow((hs[c] || 0) + 1, 1.6));
  let r = rand() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < cols.length; i++) { r -= w[i]; if (r <= 0) return cols[i]; }
  return cols[cols.length - 1];
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
  writeSlot(true);
  if (spectating) return;
  lifeTick(0);
  if (!tutorialMode && life[diffKey]) { life[diffKey].ended++; saveLife(); }
  running = false; over = true;
  lastRun = {newBest: score > best && best > 0, prevBest: best, first: !best};
  best = Math.max(best, score);
  sampleRun();
  try { localStorage.setItem(bestKey(diffKey), String(best)); localStorage.removeItem(SAVE_KEY); } catch (e) {}
  showGameOver(why);
  sfx('over'); haptic('over');
  if (!tutorialMode) JEvents.emit('over', {score, week, diffKey, clock});
}

/* ------------------------------------------------------------ lifetime stats
   Totals per mode across every city, kept in localStorage per player (online.js tells us who
   that is and mirrors it to the cloud). Averages are worked out from these when shown. */
const LIFE_KEY = 'junction-life-v1';
const LIFE_FIELDS = ['cities', 'ended', 'parcels', 'weeks', 'earned', 'spent', 'trips', 'tows', 'breakdowns', 'goals', 'allGoals', 'playSec', 'bestParcels', 'bestWeek', 'bestEarned', 'bodies', 'kits'];
const LIFE_MAX = new Set(['bestParcels', 'bestWeek', 'bestEarned']);
const LIFE_BITS = new Set(['bodies', 'kits']);          // which car bodies / speed kits have ever been driven (bit sets)
let lifeOwner = '', life = readLife(''), lifeSnap = null, lifeNewCity = false, lifeDirty = false;
function blankLife() { const o = {}; for (const m in DIFFS) o[m] = Object.fromEntries(LIFE_FIELDS.map(f => [f, 0])); return o; }
function cleanLife(d) {
  const o = blankLife();
  if (d && typeof d === 'object') for (const m in o) if (d[m] && typeof d[m] === 'object') for (const f of LIFE_FIELDS) { const v = +d[m][f]; if (isFinite(v) && v > 0) o[m][f] = v; }
  return o;
}
function readLife(owner) { try { return cleanLife(JSON.parse(localStorage.getItem(LIFE_KEY + (owner ? ':' + owner : '')))); } catch (e) { return blankLife(); } }
function lifeEmpty(L) { return Object.values(L).every(m => !m.cities && !m.playSec); }
function saveLife() {
  try { localStorage.setItem(LIFE_KEY + (lifeOwner ? ':' + lifeOwner : ''), JSON.stringify(life)); } catch (e) {}
  lifeDirty = false; JEvents.emit('life', {});
}
/* switch to a player's own stats; anything played before they were known (offline) is folded in once */
function setLifeOwner(uid) {
  if (uid === lifeOwner) return;
  lifeTick(0); if (lifeDirty) saveLife();
  const loose = lifeOwner ? null : life, looseAch = lifeOwner ? null : ach;
  lifeOwner = uid || ''; life = readLife(lifeOwner); ach = readAch(lifeOwner);
  if (loose && !lifeEmpty(loose)) { mergeLife(loose, true); try { localStorage.removeItem(LIFE_KEY); } catch (e) {} }
  if (looseAch && Object.keys(looseAch).length) { mergeAch(looseAch); try { localStorage.removeItem(ACH_KEY); } catch (e) {} }
  JEvents.emit('ach', {});
  lifeSnap = null; saveLife();
}
/* add (sum) or take the higher value (max) of another copy, e.g. the cloud copy */
function mergeLife(other, add) {
  const o = cleanLife(other);
  for (const m in life) for (const f of LIFE_FIELDS) life[m][f] = LIFE_BITS.has(f) ? (life[m][f] | o[m][f]) : LIFE_MAX.has(f) || !add ? Math.max(life[m][f], o[m][f]) : life[m][f] + o[m][f];
  lifeDirty = true;
}
function lifeMark() { lifeSnap = {score, week, earned: stats.earned, spent: stats.spent, trips: stats.trips, tows: stats.tows, breakdowns: stats.breakdowns, goals: goalsDone.size}; }
function lifeTick(realDt) {
  if (!started || over || tutorialMode || spectating || demoMode || !life[diffKey] || !stats) return;
  const playing = running && !modalOpen, L = life[diffKey];
  if (lifeNewCity) { if (!playing) return; L.cities++; L.weeks += week; lifeNewCity = false; lifeMark(); lifeDirty = true; }
  if (!lifeSnap) { lifeMark(); return; }
  if (playing) L.playSec += realDt;
  const s = lifeSnap, up = v => v > 0 ? v : 0;
  L.parcels += up(score - s.score); L.weeks += up(week - s.week); L.earned += up(stats.earned - s.earned); L.spent += up(stats.spent - s.spent);
  L.trips += up(stats.trips - s.trips); L.tows += up(stats.tows - s.tows); L.breakdowns += up(stats.breakdowns - s.breakdowns); L.goals += up(goalsDone.size - s.goals);
  for (const c of cars) { L.bodies |= 1 << bodyOf(c); L.kits |= 1 << carUp(c, 'spd'); }
  L.bestParcels = Math.max(L.bestParcels, score); L.bestWeek = Math.max(L.bestWeek, week); L.bestEarned = Math.max(L.bestEarned, Math.round(stats.earned));
  lifeMark(); if (playing || realDt === 0) lifeDirty = true;
}
window.addEventListener('pagehide', () => { lifeTick(0); if (lifeDirty) saveLife(); });

/* ------------------------------------------------------------ achievements
   Lifetime badges with no in-game reward — just bragging rights. Unlock every one and your
   name gets three stars. Kept per player like the lifetime stats (and synced by online.js). */
const cntSpecial = t => { let n = 0; for (const s of special) if (s === t) n++; return n; };
const inMode = m => diffKey === m;
const ACH = [
  // weeks
  {id: 'w5',  g: 'Weeks', name: 'Five weeks in',   hint: 'Reach week 5 in one city',  hit: () => week >= 5},
  {id: 'w10', g: 'Weeks', name: 'A proper town',   hint: 'Reach week 10 in one city', hit: () => week >= 10},
  {id: 'w15', g: 'Weeks', name: 'Built to last',   hint: 'Reach week 15 in one city', hit: () => week >= 15},
  {id: 'w20', g: 'Weeks', name: 'Metropolis',      hint: 'Reach week 20 in one city', hit: () => week >= 20},
  {id: 'w30', g: 'Weeks', name: 'Eternal city',    hint: 'Reach week 30 in one city', hit: () => week >= 30},
  // parcels and money in one city
  {id: 'p500',  g: 'One city', name: 'Parcel pusher',    hint: 'Deliver 500 parcels in one city',   hit: () => score >= 500},
  {id: 'p1000', g: 'One city', name: 'Four figures',     hint: 'Deliver 1,000 parcels in one city', hit: () => score >= 1000},
  {id: 'p2500', g: 'One city', name: 'Logistics legend', hint: 'Deliver 2,500 parcels in one city', hit: () => score >= 2500},
  {id: 'e5k',   g: 'One city', name: 'Deep pockets',     hint: 'Earn $5,000 in one city',           hit: () => stats.earned >= 5000},
  {id: 'e25k',  g: 'One city', name: 'Tycoon',           hint: 'Earn $25,000 in one city',          hit: () => stats.earned >= 25000},
  {id: 'goals', g: 'One city', name: 'Completionist',    hint: 'Finish every goal in one city',     hit: () => goalsDone.size >= GOALS.length},
  {id: 'speed', g: 'One city', name: 'Speedrunner',      hint: 'Finish every goal within 30 minutes of game time', hit: () => goalsDone.size >= GOALS.length && clock <= 1800},
  // building
  {id: 'cars30', g: 'Building', name: 'Rush hour regular', hint: 'Have 30 cars in one city',       hit: () => cars.length >= 30},
  {id: 'moto3',  g: 'Building', name: 'Highway network',   hint: 'Have 3 motorways at once',       hit: () => motorways.length >= 3},
  {id: 'round5', g: 'Building', name: 'Roundabout fan',    hint: 'Have 5 roundabouts at once',     hit: () => cntSpecial('round') >= 5},
  {id: 'light8', g: 'Building', name: 'Signal box',        hint: 'Have 8 traffic lights at once',  hit: () => cntSpecial('light') >= 8},
  {id: 'clock',  g: 'Building', name: 'Clockwork',         hint: 'Keep 25+ cars moving with no jams', hit: () => cars.filter(c => c.state === 'driving').length >= 25 && stats.jamPct < 0.05},
  {id: 'tow10',  g: 'Building', name: 'Tow fleet',         hint: 'Rescue 10 cars with tow trucks in one city', hit: () => stats.tows >= 10},
  {id: 'van',    g: 'Building', name: 'Van life',          hint: 'Put a van on the road',          hit: () => cars.some(c => c.van)},
  {id: 'bodies', g: 'Building', name: 'Car collector',     hint: 'Drive every kind of car: hatchback, estate, pickup, panel van and box truck', life: L => lifeBits(L, 'bodies') === (1 << BODY.length) - 1},
  {id: 'kits',   g: 'Building', name: 'Tuner',             hint: 'Fit every speed kit: Sport, GT and Racer', life: L => (lifeBits(L, 'kits') & 14) === 14},
  {id: 'amb10',  g: 'Building', name: 'Blue lights',       hint: 'Get 10 ambulances there on time in one city', hit: () => (stats.ambOk || 0) >= 10},
  // modes
  {id: 'frantic10',  g: 'Modes', name: 'Nerves of steel', hint: 'Reach week 10 on Frantic',          hit: () => inMode('frantic') && week >= 10},
  {id: 'frantic500', g: 'Modes', name: 'Under pressure',  hint: 'Deliver 500 parcels on Frantic',    hit: () => inMode('frantic') && score >= 500},
  {id: 'chill15',    g: 'Modes', name: 'Easy does it',    hint: 'Reach week 15 on Relaxed',          hit: () => inMode('chill') && week >= 15},
  {id: 'zen1h',      g: 'Modes', name: 'Zen master',      hint: 'Play one Zen city for an hour of game time', hit: () => inMode('zen') && clock >= 3600},
  {id: 'allmodes',   g: 'Modes', name: 'Well rounded',    hint: 'Play a city on every mode',         life: L => Object.keys(DIFFS).filter(m => !DIFFS[m].expert).every(m => L[m] && L[m].cities > 0)},
  // lifetime
  {id: 'cities10',  g: 'Lifetime', name: 'Urban planner',  hint: 'Start 10 cities',                 life: L => lifeSum(L, 'cities') >= 10},
  {id: 'cities50',  g: 'Lifetime', name: 'Serial builder', hint: 'Start 50 cities',                 life: L => lifeSum(L, 'cities') >= 50},
  {id: 'parcels10k', g: 'Lifetime', name: 'Ten thousand',  hint: 'Deliver 10,000 parcels all time', life: L => lifeSum(L, 'parcels') >= 10000},
  {id: 'parcels50k', g: 'Lifetime', name: 'Parcel empire', hint: 'Deliver 50,000 parcels all time', life: L => lifeSum(L, 'parcels') >= 50000},
  {id: 'hours10',   g: 'Lifetime', name: 'Dedicated',      hint: 'Play for 10 hours',               life: L => lifeSum(L, 'playSec') >= 36000},
  {id: 'earned100k', g: 'Lifetime', name: 'Millionaire in training', hint: 'Earn $100,000 all time', life: L => lifeSum(L, 'earned') >= 100000},
  // community
  {id: 'tutorial', g: 'Community', name: 'Graduate',      hint: 'Finish the tutorial'},
  {id: 'account',  g: 'Community', name: 'Here to stay',  hint: 'Make a permanent account'},
  {id: 'watcher',  g: 'Community', name: 'Spectator',     hint: 'Watch another player\u2019s city live'},
  {id: 'feedback', g: 'Community', name: 'Helping hand',  hint: 'Send feedback to the developer'}
];
const ACH_KEY = 'junction-ach-v1';
const lifeSum = (L, f) => Object.values(L).reduce((a, m) => a + (m[f] || 0), 0);
const lifeBits = (L, f) => Object.values(L).reduce((a, m) => a | (m[f] || 0), 0);
let ach = readAch(lifeOwner);
function readAch(owner) { try { return cleanAch(JSON.parse(localStorage.getItem(ACH_KEY + (owner ? ':' + owner : '')))); } catch (e) { return {}; } }
function cleanAch(d) { const o = {}; if (d && typeof d === 'object') for (const a of ACH) if (+d[a.id] > 0) o[a.id] = +d[a.id]; return o; }
function saveAch() { try { localStorage.setItem(ACH_KEY + (lifeOwner ? ':' + lifeOwner : ''), JSON.stringify(ach)); } catch (e) {} JEvents.emit('ach', {}); }
const achDone = () => ACH.filter(a => ach[a.id]).length;
function awardAch(id, quiet) {
  const a = ACH.find(x => x.id === id); if (!a || ach[id]) return false;
  ach[id] = Date.now(); saveAch();
  if (!quiet) {
    toast('Achievement unlocked: ' + a.name, 'good'); sfx('upgrade');
    if (achDone() === ACH.length) setTimeout(() => toast('Every achievement unlocked \u2014 your name now has \u2605\u2605\u2605', 'good'), 1600);
  }
  return true;
}
function mergeAch(other) {
  const o = cleanAch(other); let changed = false;
  for (const id in o) if (!ach[id] || o[id] < ach[id]) { ach[id] = o[id]; changed = true; }
  if (changed) saveAch();
}
function checkAch() {
  if (demoMode) return;
  if (!started || tutorialMode || spectating || !stats) return;
  for (const a of ACH) {
    if (ach[a.id]) continue;
    let ok = false;
    try { ok = a.life ? a.life(life) : a.hit ? (!over && a.hit()) : false; } catch (e) {}
    if (ok) awardAch(a.id);
  }
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
    v: 3, sv: 3, expWeek, diffKey, score, week, weekTimer, span, houseTimer, storeTimer, clock, keepLeft, carCapacity, money,
    inv, perks, water: list(water), road: list(road),
    links: (() => { const o = []; for (let k = 0; k < N; k++) if (lnk[k]) o.push([k, lnk[k]]); return o; })(),
    sign: sign.map((s, k) => s ? [k, s] : null).filter(Boolean),
    special: special.map((s, k) => s ? [k, s] : null).filter(Boolean),
    lights: [...lightQ].filter(([k]) => special[k] === 'light').map(([k, q]) => [k, q[0], q[1]]),
    buildings: buildings.map(b => ({pref: b.pref, k: b.k, sd: isBig(b) ? b.sd : undefined, se: isBig(b) ? b.ends || 0 : undefined, type: b.type, color: b.color, pins: b.pins, tier: b.tier, timer: b.timer, lvl: b.lvl, trucks: b.trucks, vans: b.cars.map(c => c.van ? 1 : 0), extra: b.extra || 0, dl: b.delivered | 0, sr: b.served | 0, ov: b.overSpent ? 1 : 0, ovT: +(b.followT || 0).toFixed(1), ups: b.cars.map(c => [carUp(c, 'cap'), carUp(c, 'spd'), carUp(c, 'load'), carUp(c, 'fuel')])})), carsBought, fuelV: 1,
    parks: parks.map(p => ({k: p.k, b: p.b})), depots: depots.map(d => d.k), dprefs: depots.map(d => d.pref),
    juncLvl: nodeList.filter(nd => nd.lvl > 0).map(nd => [nd.k, nd.lvl, nd.spent]),
    motorways: motorways.map(m => ({a: m.a, b: m.b, len: m.len})), goals: [...goalsDone], tr: transportSave(),
    stats: {delivered: stats.delivered, trips: stats.trips, tows: stats.tows, breakdowns: stats.breakdowns, earned: stats.earned, spent: stats.spent, hauls: stats.hauls,
            ambOk: stats.ambOk, ambLate: stats.ambLate, ambFail: stats.ambFail},
    // live events, so reloading mid-storm doesn't clear it
    rushT: rush.t, rainT: rain.t, breakdownTimer,
    closures: [...closed].map(([k, t]) => [k, +t.toFixed(1)]),
    // the run so far, for the game-over chart
    runHist: stats.runHist.map(p => [Math.round(p.t), +p.jam.toFixed(3), +p.rate.toFixed(1)]), runStep: stats.runStep, weekMarks: stats.weekMarks.map(Math.round),
    oneway: (() => { const o = []; if (onewayDir) for (let k = 0; k < N; k++) if (onewayDir[k] >= 0) o.push([k, onewayDir[k]]); return o; })(),
    // the colours this city was played in, so each save file keeps its own
    pal: {mode: colorMode, hex: customHex.slice()},
    // p62: the time-lapse so far (≤ 120 frames, ≤ 300 KB) and the weather, so a reload keeps both
    replay: replayStore(), wx: weather.t > 0 ? {kind: weather.kind, t: +weather.t.toFixed(1)} : null
  };
}
const SLOT_KEY = 'junction-slot-v1:', SLOT_MODES = ['chill', 'standard', 'frantic', 'zen', 'expert'];
let curSlot = '', pendingSlot = '';                     // the local slot ("standard-2") of the city being played
function readSlot(id) { try { return JSON.parse(localStorage.getItem(SLOT_KEY + id)); } catch (e) { return null; } }
function writeSlot(final) {
  if (!curSlot || tutorialMode || spectating || demoMode || !started) return;
  try { localStorage.setItem(SLOT_KEY + curSlot, JSON.stringify(final ? {over: true, score, week, diffKey, at: Date.now()} : {data: serialize(), score, week, diffKey, at: Date.now()})); } catch (e) {}
}
const agoLocal = t => { const s2 = (Date.now() - t) / 1000; return s2 < 90 ? 'just now' : s2 < 3600 ? Math.round(s2 / 60) + ' min ago' : s2 < 86400 ? Math.round(s2 / 3600) + ' h ago' : Math.round(s2 / 86400) + ' days ago'; };
function renderLocalSlots(box, mode) {
  box.innerHTML = '';
  for (let n = 1; n <= 5; n++) {
    const id = mode + '-' + n, d = readSlot(id), el = document.createElement('div');
    el.className = 'slot-card' + (curSlot === id && started && !over ? ' current' : '');
    let desc, btns;
    if (d && d.data) { desc = '<b>Week ' + d.week + '</b> \u00b7 ' + d.score + ' parcels<small>Saved ' + agoLocal(d.at) + '</small>'; btns = '<button class="bigbtn" data-act="load">Continue</button><button class="act" data-act="new">New city here</button><button class="act danger" data-act="del">Delete</button>'; }
    else if (d && d.over) { desc = '<b>Finished</b> \u00b7 week ' + d.week + ', ' + d.score + ' parcels<small>' + agoLocal(d.at) + '</small>'; btns = '<button class="bigbtn" data-act="new">New city here</button><button class="act danger" data-act="del">Clear</button>'; }
    else { desc = '<b>Empty slot</b><small>' + DIFFS[mode].label + ' \u00b7 nothing saved yet</small>'; btns = '<button class="bigbtn" data-act="new">New city here</button>'; }
    el.innerHTML = '<div class="slotnum">' + n + '</div><div class="slotinfo">' + desc + '</div><div class="slotbtns">' + btns + '</div>';
    el.querySelectorAll('[data-act]').forEach(b => { b.type = 'button'; b.onclick = async () => {
      const act = b.dataset.act;
      if (act === 'load') { if (!loadGame(d.data)) { toast('That save couldn\u2019t be opened.', 'warn'); return; } curSlot = id; closeModal('m-start'); running = true; refreshHud(); layout(); }
      else if (act === 'new') { if (d && d.data && !(await ask({title: 'Replace this city?', text: DIFFS[mode].label + ' slot ' + n + ' holds a week ' + d.week + ' city. A new one will take its place.', ok: 'Replace', danger: true}))) return; pendingSlot = id; closeModal('m-start'); resetGame(mode); running = true; refreshHud(); layout(); writeSlot(); }
      else if (act === 'del') { if (!(await ask({title: 'Delete this save?', text: DIFFS[mode].label + ' slot ' + n + ' will be emptied. This can\u2019t be undone.', ok: 'Delete', danger: true}))) return; try { localStorage.removeItem(SLOT_KEY + id); } catch (e) {} if (curSlot === id) curSlot = ''; renderLocalSlots(box, mode); }
    }; });
    box.append(el);
  }
}
/* five slots for a mode: in the cloud when signed in, otherwise on this device */
function renderSlotsFor(box, mode, tabs) {
  const on = window.JunctionOnline;
  if (on && on.ready && on.renderSlots && on.renderSlots(box, mode, tabs)) return;
  if (tabs) {
    const wrap = document.createElement('div'); box.innerHTML = '<div class="seg boardtabs slottabs">' + SLOT_MODES.map(m => '<button type="button" data-smode="' + m + '" aria-pressed="' + (m === mode) + '">' + DIFFS[m].label + '</button>').join('') + '</div>';
    box.querySelectorAll('[data-smode]').forEach(b => b.onclick = () => renderSlotsFor(box, b.dataset.smode, true));
    box.append(wrap); renderLocalSlots(wrap, mode); return;
  }
  renderLocalSlots(box, mode);
}
function saveGame(urgent) {
  if (over || !started || tutorialMode || spectating || demoMode || diffKey === 'iso') return;
  JEvents.emit('autosave', {urgent: !!urgent});
  try {
    const prev = localStorage.getItem(SAVE_KEY);
    if (prev) localStorage.setItem(SAVE_KEY + '-backup', prev);
    localStorage.setItem(SAVE_KEY, JSON.stringify(serialize()));
    writeSlot();
    localStorage.setItem(bestKey(diffKey), String(Math.max(best, score)));
  } catch (e) {}
}
/* Load a city: the one in `data` (an imported file), or else the one in local storage. */
/* bring back the colours a city was saved with (not while watching someone — viewers keep their own) */
function applyCityPalette(p) {
  if (!p || typeof p !== 'object' || !PALETTES[p.mode]) return;
  if (Array.isArray(p.hex) && p.hex.length === COLORS.length && p.hex.every(h => /^#[0-9a-f]{6}$/i.test(h))) customHex = p.hex.slice();
  colorMode = p.mode;
  applyPalette(); savePrefs(true); renderPaletteUI();
}
/* Older cities: stores saved as a single tile (before stores grew), or as the earlier 3-wide plots (3x4, then
   3x2: oldDepth says which), are refitted into today's 2x3 plot, open at both ends. The new plot stays on ground the old store already covered, and if it can, it turns
   so one end of its car park meets the road the store was already using. A store with no room stays small. */
function refitStores(oldDepth) {
  const list = buildings.map((b, i) => [b, i]).filter(([b]) => b.type === 'store');
  for (const [b, i] of list) {
    const old = isBig(b) ? oldStoreTiles(b.k, b.sd, oldDepth) : [b.k];
    for (const t of old.concat(bTiles(b) || [])) if (bAt[t] === i) bAt[t] = -1;
    const oldSet = new Set(old);
    let c0 = 1e9, r0 = 1e9, c1 = -1, r1 = -1;
    for (const t of old) { c0 = Math.min(c0, cx(t)); r0 = Math.min(r0, cy(t)); c1 = Math.max(c1, cx(t)); r1 = Math.max(r1, cy(t)); }
    let best = null, bs = -1;
    for (let r = r0 - 2; r <= r1 + 2; r++) for (let c = c0 - 2; c <= c1 + 2; c++) {
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
      const k = idx(c, r);
      for (const sd of ORTH) {
        if (!storeFits(k, sd, inPlay)) continue;
        const tiles = storeTilesAt(k, sd); let ov = 0;
        for (const t of tiles) if (oldSet.has(t)) ov++;
        if (!ov) continue;
        const sc = (storeDoorsAt(k, sd).some(([f]) => road[f]) ? 100 : 0) + ov * 3 + (tiles.includes(b.k) ? 1 : 0);
        if (sc > bs) { bs = sc; best = {k, sd}; }
      }
    }
    if (best) { b.k = best.k; b.sd = best.sd; b.ends = 0; } else { delete b.sd; delete b.ends; }
    b.pref = -1;
    markBuilding(b, i);
  }
}
function loadGameCore(data) {
  const view = spectating;
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
    if (DIFF.expert) { expWeek = typeof d.expWeek === 'string' ? d.expWeek : expertSeed().key; rand = seededRand(strHash(expWeek) ^ Math.floor(d.clock || 0)); }
    score = d.score; week = d.week; weekTimer = d.weekTimer; span = d.span; org = Math.floor((MAXD - span) / 2); camSpan = span; camOrg = org;
    houseTimer = d.houseTimer; storeTimer = d.storeTimer; clock = d.clock; keepLeft = d.keepLeft; laneSign = keepLeft ? -1 : 1;
    inv = d.inv; perks = Object.assign({}, PERK_DEFAULTS, d.perks); carCapacity = d.carCapacity; inv.rail = inv.rail | 0; inv.bus = inv.bus | 0;
    money = d.money !== undefined ? d.money : Math.max(0, CFG.startMoney + DIFF.cash);
    d.buildings.forEach(o => {
      const b = {k: o.k, type: o.type, color: o.color, pins: o.pins, claimed: 0, timer: o.timer || 0,
                 tier: o.tier !== undefined ? o.tier : (o.big ? 1 : 0), cars: [], carsN: 0, park: 0, contract: null,
                 docks: [], served: o.sr | 0, acc: -1, face: 0, pref: o.pref === undefined ? -1 : o.pref, unreach: 0, born: 0, pinTimer: rnd(3, 9), lvl: o.lvl || 0, trucks: 0,
                 overSpent: o.ov === undefined ? true : !!o.ov, followT: +o.ovT || 0,
                 evolveTimer: rnd(CFG.storeEvolveCheckMin, CFG.storeEvolveCheckMax)};
      if (b.type === 'store' && ORTH.includes(o.sd)) { b.sd = o.sd; b.ends = [0, 1, 2].includes(o.se) ? o.se : 0; }
      markBuilding(b, buildings.length); buildings.push(b);
    });
    d.parks.forEach(p => { parks.push({k: p.k, b: p.b, face: 0}); parkAt[p.k] = parks.length - 1; buildings[p.b].park++; });
    d.depots.forEach((k, i) => { depots.push({k, cap: CFG.depotCapacity, slots: [], res: 0, acc: -1, face: 0, pref: d.dprefs && d.dprefs[i] !== undefined ? d.dprefs[i] : -1}); depotAt[k] = depots.length - 1; });
    d.motorways.forEach(m => motorways.push({id: ++motoSeq, a: m.a, b: m.b, len: m.len}));
    transportLoad(d.tr);
    if (!view && !(d.sv >= 3)) refitStores(d.sv >= 2 ? 2 : 4);
    linkBuildings();
    carsBought = d.carsBought | 0;
    d.buildings.forEach((o, i) => {
      if (o.type !== 'house') return;
      buildings[i].extra = clamp(o.extra | 0, 0, CFG.carBuyExtraMax); buildings[i].delivered = o.dl | 0;
      o.vans.forEach((v, j) => {
        const c = addCar(i); c.van = !!v;
        const u = o.ups && o.ups[j];
        if (u) { c.up = {cap: clamp(u[0] | 0, 0, CAR_UP.cap.max), spd: clamp(u[1] | 0, 0, CAR_UP.spd.max), load: clamp(u[2] | 0, 0, CAR_UP.load.max), fuel: clamp(u[3] | 0, 0, CAR_UP.fuel.max)}; }
        if (!d.fuelV) { c.up = c.up || {}; c.up.fuel = CAR_UP.fuel.max; }   // cities saved before fuel existed keep working as they were
        syncCarLen(c);
      });
    });
    d.buildings.forEach((o, i) => { for (let t = 0; t < (o.trucks || 0); t++) { buildings[i].trucks++; makeTruck(i); } });
    rebuildNet();
    if (d.juncLvl) for (const [k, l, sp] of d.juncLvl) if (nodes[k]) { nodes[k].lvl = clamp(l | 0, 0, CFG.junctionUpgradeMax); nodes[k].spent = +sp || 0; }
    for (const c of cars) { const p = parkedPose(c); c.x = p.x; c.y = p.y; c.ang = p.a; }
    goalsDone = new Set((d.goals || []).filter(id => GOALS.some(g => g.id === id)));   // week goals moved to achievements
    Object.assign(stats, d.stats || {});
    rush = {t: Math.max(0, +d.rushT || 0)};
    const rt = Math.max(0, +d.rainT || 0); rain = {t: rt, amt: rt > 0 ? 1 : 0};
    breakdownTimer = isFinite(d.breakdownTimer) ? d.breakdownTimer : 30;
    closed = new Map((d.closures || []).filter(p => Array.isArray(p) && road[p[0]] && p[1] > 0).map(p => [p[0], +p[1]]));
    stats.runHist = (d.runHist || []).map(p => ({t: p[0], jam: p[1], rate: p[2]}));
    stats.runStep = d.runStep > 0 ? d.runStep : 5; stats.runNext = clock + stats.runStep;
    stats.weekMarks = d.weekMarks || [];
    camReset(true); closeInspector(); setTool('select'); refreshUI(); renderGoals();
    if (!view) applyCityPalette(d.pal);
    replayFrames = Array.isArray(d.replay) ? d.replay.filter(f => f && typeof f.snap === 'string') : []; replayDay = Math.floor(clock / CFG.dayLengthSeconds);   // p62
    weather = {kind: 'clear', t: 0, amt: 0}; weatherTimer = 240 + Math.random() * 180; weatherSeen = {};
    if (d.wx && ['snow', 'fog', 'heat'].includes(d.wx.kind) && +d.wx.t > 0) { weather = {kind: d.wx.kind, t: +d.wx.t, amt: 1}; weatherSeen[d.wx.kind] = true; }
    return true;
  } catch (e) { return false; }
}
function resetGameBlank(dk) {
  demoMode = false;
  lifeNewCity = false; lifeSnap = null;
  tutorialMode = false;
  setTutorialUI(false);
  DIFF = DIFFS[dk] || DIFFS.standard; diffKey = dk in DIFFS ? dk : 'standard'; best = bestFor(diffKey);
  rand = Math.random; expWeek = '';
  water = new Uint8Array(N); road = new Uint8Array(N); lnk = new Uint8Array(N);
  sign = new Array(N).fill(null); special = new Array(N).fill(null);
  bAt = new Int32Array(N).fill(-1); parkAt = new Int32Array(N).fill(-1); depotAt = new Int32Array(N).fill(-1);
  onewayDir = new Int8Array(N).fill(-1);
  nodes = []; nodeList = []; edges = []; edgeMap = new Map(); buildings = []; cars = []; motorways = []; parks = []; depots = []; transportReset();
  motoSeq = 0; carSeq = 0; running = true; speed = 1; over = false; started = true; money = 0; trucks = [];
  rush = {t: 0}; rain = {t: 0, amt: 0}; breakdownTimer = 30; undoStack = []; redoStack = [];
  closed = new Map(); closureTimer = 60; rerouteN = 0; ambs = []; ambTimer = 60; sel = null; follow = false; motoPick = -1;
  contractTimer = CFG.contractSeconds; cityStressClock = 0;
  stats = freshStats(); fx.length = 0; lightClock = 0; lightQ.clear();
}

/* p61 */
/* ---------------------------------------------------------------------
   4b. NEW TRANSPORT (p61). Three late unlocks that help without taking over:
     trains  - a rail layer of its own. Rail beside a store or a house is a station; every rail
               network with two stations gets one train that shuttles 6 parcels a trip at 1.3x car
               speed. Where rail crosses road, cars wait at the level crossing while a train is near.
     buses   - a store plus up to 4 houses of its colour. The bus is a car with a fixed loop: it
               loads 3 at the store and drops some at every stop, never parking.
     drones  - a perk (3 levels). Each level is one drone at a store that flies one parcel straight
               to the nearest house of its colour, slowly, over everything.
   --------------------------------------------------------------------- */
CFG.prices.rail = 8; CFG.prices.bus = 120;
const TRC = {trainSpeed: 1.3, trainCap: 6, trainStop: 1.6, busCap: 3, busMax: 4, busLen: 20, droneSpeed: 0.4, droneLoad: 1.2, xingHold: 1.2, xingRange: 2};
let rail = new Uint8Array(N), rlnk = new Uint8Array(N), railComp = new Int32Array(N), railN = 0, trains = [], busRoutes = [], drones = [], stations = [], stationAt = new Map();
let xingT = null, xingN = 0, railVer = 0, railCache = {ver: -1}, trainSeq = 0, busSeq = 0, droneSeq = 0, busPick = null, trPending = null, trSyncT = 0;
let bfsQ = new Int32Array(N), bfsPrev = new Int32Array(N), bfsSeen = new Int32Array(N), bfsStamp = 0, trainQ = null;
const TR = {railOn: false, busOn: false, stats: {train: 0, bus: 0, drone: 0}};
const _tp = {x: 0, y: 0, a: 0};
function transportReset() {
  rail = new Uint8Array(N); rlnk = new Uint8Array(N); railComp.fill(-1); railN = 0; trains = []; busRoutes = []; drones = []; stations = []; stationAt.clear();
  xingT = null; xingN = 0; railVer++; railCache.ver = -1; trainSeq = 0; busSeq = 0; droneSeq = 0; busPick = null; trPending = null; trSyncT = 0;
  TR.railOn = false; TR.busOn = false; TR.stats = {train: 0, bus: 0, drone: 0};
}
function ensureTr() { if (inv && inv.rail === undefined) inv.rail = 0; if (inv && inv.bus === undefined) inv.bus = 0; if (perks && perks.drone === undefined) perks.drone = 0; }
const railUnlocked = () => TR.railOn || (inv && inv.rail > 0) || railN > 0;
const busUnlocked = () => TR.busOn || (inv && inv.bus > 0) || busRoutes.length > 0;
/* the Rail and Bus tools only show once the player has them */
function syncTransportTools() {
  const show = (id, on) => { const b = document.querySelector('.tool[data-id="' + id + '"]'); if (b && b.hidden === on) b.hidden = !on; };
  show('rail', railUnlocked()); show('bus', busUnlocked());
}
/* a parcel reaching a house by any new transport scores and pays exactly like a car delivery */
function creditDelivery(hi, n, cash, col) {
  const h = buildings[hi]; if (!h || n <= 0) return;
  score += n; stats.delivered += n; stats.lastDeliveries.push(clock);
  if (!spectating && !demoMode) earnBucks(n, h);
  earn(cash); onDeliver({home: hi, color: col}, n, cash);
}

/* ------------------------------------------------------------ rail */
const railFits = k => k >= 0 && inPlay(k) && !water[k] && !rail[k] && bAt[k] < 0 && parkAt[k] < 0 && depotAt[k] < 0 && !special[k] && !(nodes[k] && nodes[k].junction);
function placeRail(k, silent) {
  if (!railFits(k)) { if (!silent && k >= 0 && inPlay(k) && (bAt[k] >= 0 || (nodes[k] && nodes[k].junction) || special[k])) hint('Rail runs beside buildings and across plain road, not through them.'); return false; }
  if (!canTake('rail')) { if (!silent) hint('Rail costs ' + fmt$(PRICE.rail) + ' a tile. ' + shortBy(PRICE.rail)); return false; }
  take('rail'); rail[k] = 1; rlnk[k] = 0; rebuildRail(); refreshUI(); if (!silent) sfx('place');
  return true;
}
/* the pen moves from rail tile a onto neighbouring b: lay b if needed and join the two */
function linkRail(a, b) {
  const d = dirBetween(a, b); if (d < 0) return false;
  if (!rail[a]) { if (!rail[b]) placeRail(b, false); return false; }
  if (!rail[b] && !placeRail(b, true)) return false;
  if ((rlnk[a] >> d) & 1) return true;
  rlnk[a] |= 1 << d; rlnk[b] |= 1 << ((d + 4) % 8); rebuildRail(); refreshUI(); sfx('place');
  return true;
}
function stepRail(from, to) {
  let c = cx(from), r = cy(from); const tc = cx(to), tr = cy(to); let guard = 0;
  while ((c !== tc || r !== tr) && guard++ < 90) {
    const a = idx(c, r); if (c !== tc) c += Math.sign(tc - c); if (r !== tr) r += Math.sign(tr - r);
    linkRail(a, idx(c, r));
  }
}
function railTool(k, dragging) { placeRail(k, !!dragging); }
function eraseRail(k) {
  if (!rail[k]) return false;
  for (const t of trains) if (t.k === k || t.nk === k) { hint('A train is on that rail.'); return false; }
  for (let d = 0; d < 8; d++) if ((rlnk[k] >> d) & 1) { const n = nbr(k, d); if (n >= 0) rlnk[n] &= ~(1 << ((d + 4) % 8)); }
  rail[k] = 0; rlnk[k] = 0; inv.rail = (inv.rail | 0) + 1; rebuildRail(); refreshUI(); sfx('erase');
  return true;
}
/* networks, stations and trains follow from the rail tiles; called after every change */
function rebuildRail() {
  railVer++; railCache.ver = -1; stations = []; stationAt.clear(); railComp.fill(-1); railN = 0;
  let nc = 0; const q = bfsQ;
  for (let k = 0; k < N; k++) {
    if (!rail[k]) continue; railN++;
    if (railComp[k] >= 0) continue;
    let h = 0, t = 0; q[t++] = k; railComp[k] = nc;
    while (h < t) { const a = q[h++]; for (let d = 0; d < 8; d++) if ((rlnk[a] >> d) & 1) { const n = nbr(a, d); if (n >= 0 && rail[n] && railComp[n] < 0) { railComp[n] = nc; q[t++] = n; } } }
    nc++;
  }
  const seen = new Set();                                 // a station: a rail tile beside a house or store (one per building, never on a level crossing)
  for (let k = 0; k < N; k++) {
    if (!rail[k] || road[k]) continue;
    for (const d of ORTH) { const n = nbr(k, d); if (n < 0 || bAt[n] < 0 || seen.has(bAt[n])) continue; const st = {k, b: bAt[n], d, comp: railComp[k]}; stations.push(st); stationAt.set(k, st); seen.add(bAt[n]); break; }
  }
  const want = new Map(); for (const st of stations) want.set(st.comp, (want.get(st.comp) || 0) + 1);
  for (let i = trains.length - 1; i >= 0; i--) {       // trains whose line is gone are scrapped; the rest look for work again
    const t = trains[i], c = rail[t.k] ? railComp[t.k] : -1;
    if (c < 0 || (want.get(c) || 0) < 2) { trains.splice(i, 1); continue; }
    t.comp = c; t.path = null; t.target = -1;
  }
  for (const [c, n] of want) if (n >= 2 && !trains.some(t => t.comp === c)) {
    const st = stations.find(x => x.comp === c && buildings[x.b].type === 'store') || stations.find(x => x.comp === c);
    trains.push(makeTrain(st.k, c));
    if (started && !trPending && !demoMode) { popRing(tx(st.k), ty(st.k), '#ffffff'); toast('A train is running on your new line', 'good'); sfx('upgrade'); }
  }
  xingN = 0; for (let k = 0; k < N; k++) if (rail[k] && road[k]) xingN++;
  if (xingN && !xingT) xingT = new Float32Array(N);
}
function makeTrain(k, comp) {
  let a = 0; for (let d = 0; d < 8; d++) if ((rlnk[k] >> d) & 1) { a = Math.atan2(DY[d], DX[d]); break; }
  return {id: ++trainSeq, comp, k, nk: k, u: 0, x: tx(k), y: ty(k), ang: a, da: a, load: 0, color: -1, cash: 0, state: 'stop', stopT: 0.6, path: null, pi: 0, target: -1,
          hx: new Float32Array(32), hy: new Float32Array(32), hn: 0, hh: 0};
}
/* shortest rail path (in tiles) from `from` to the first tile ok() accepts, or null */
function railPath(from, ok) {
  bfsStamp++; let h = 0, t = 0; bfsQ[t++] = from; bfsSeen[from] = bfsStamp; bfsPrev[from] = -1;
  while (h < t) {
    const a = bfsQ[h++];
    if (a !== from && ok(a)) { const out = []; let c = a; while (c >= 0) { out.push(c); c = bfsPrev[c]; } return out.reverse(); }
    for (let d = 0; d < 8; d++) if ((rlnk[a] >> d) & 1) { const n = nbr(a, d); if (n >= 0 && rail[n] && bfsSeen[n] !== bfsStamp) { bfsSeen[n] = bfsStamp; bfsPrev[n] = a; bfsQ[t++] = n; } }
  }
  return null;
}
const wantHouse = k => { const st = stationAt.get(k); if (!st) return false; const b = buildings[st.b]; return !!b && b.type === 'house' && b.color === trainQ.color; };
const wantStore = k => {
  const st = stationAt.get(k); if (!st) return false; const b = buildings[st.b];
  if (!b || b.type !== 'store' || b.pins - b.claimed <= 0) return false;
  for (const o of stations) if (o.comp === st.comp && o !== st && buildings[o.b].type === 'house' && buildings[o.b].color === b.color) return true;
  return false;
};
function trainStep(t, dt) {
  if (t.state === 'stop') { t.stopT -= dt; trainGate(t); if (t.stopT > 0) return; t.state = 'run'; }
  if (!t.path || t.pi >= t.path.length - 1) {
    trainQ = t;
    if (t.load > 0 ? wantHouse(t.k) : wantStore(t.k)) { t.path = null; trainArrive(t); return; }   // the station it stands at can serve it
    const p = railPath(t.k, t.load > 0 ? wantHouse : wantStore);
    if (!p) { t.state = 'stop'; t.stopT = 1; t.path = null; return; }      // nothing to do: wait a moment and look again
    t.path = p; t.pi = 0; t.u = 0; t.nk = p[1];
  }
  let left = CFG.carSpeed * TRC.trainSpeed * dt;
  while (left > 0) {
    const a = t.path[t.pi], b = t.path[t.pi + 1], d = dirBetween(a, b);
    if (d < 0 || !rail[b] || !((rlnk[a] >> d) & 1)) { t.path = null; t.state = 'stop'; t.stopT = 0.4; break; }   // the line was cut ahead
    const L = DIAG(d) ? CELL * Math.SQRT2 : CELL, rem = (1 - t.u) * L;
    if (left < rem) { t.u += left / L; left = 0; }
    else { left -= rem; t.pi++; t.u = 0; t.k = b; if (t.pi >= t.path.length - 1) { t.nk = b; trainArrive(t); break; } t.nk = t.path[t.pi + 1]; }
  }
  if (t.path) {
    const a = t.path[t.pi], b = t.path[Math.min(t.pi + 1, t.path.length - 1)];
    t.x = lerp(tx(a), tx(b), t.u); t.y = lerp(ty(a), ty(b), t.u);
    if (a !== b) t.ang = Math.atan2(ty(b) - ty(a), tx(b) - tx(a));
  }
  trainPush(t); trainGate(t);
}
function trainArrive(t) {
  t.state = 'stop'; t.stopT = TRC.trainStop; t.u = 0;
  const st = stationAt.get(t.k); if (!st) return;
  const b = buildings[st.b]; if (!b) return;
  if (b.type === 'store' && t.load === 0) {
    const n = Math.min(TRC.trainCap, b.pins - b.claimed);
    if (n > 0) {
      b.pins -= n; b.served += n; b.timer = Math.max(0, b.timer - CFG.arrivalRelief * n); if (b.contract) b.contract.got += n;
      t.load = n; t.color = b.color; t.cash = Math.round(n * payPerParcel(b));
      popText(bX(b), bY(b) - 14, '-' + n, COLORS[b.color].hex); sfx('place');
    }
  } else if (b.type === 'house' && t.load > 0 && b.color === t.color) {
    creditDelivery(st.b, t.load, t.cash, t.color); TR.stats.train += t.load; stats.trips++;
    t.load = 0; t.cash = 0; t.color = -1;
  }
}
/* a level crossing stays closed while a train is within two tiles of it */
function trainGate(t) {
  if (!xingN) return;
  const until = clock + TRC.xingHold;
  if (road[t.k]) xingT[t.k] = until;
  if (!t.path) return;
  for (let i = Math.max(0, t.pi - TRC.xingRange); i <= Math.min(t.path.length - 1, t.pi + TRC.xingRange); i++) { const q = t.path[i]; if (road[q]) xingT[q] = until; }
}
/* where the train has been, so the wagon can follow it round bends (and lead when it reverses) */
function trainPush(t) {
  const i = t.hh; if (t.hn && Math.abs(t.x - t.hx[i]) + Math.abs(t.y - t.hy[i]) < 1) return;
  const j = (i + 1) % 32; t.hx[j] = t.x; t.hy[j] = t.y; t.hh = j; if (t.hn < 32) t.hn++;
}
function trainTail(t, back) {
  let px = t.x, py = t.y, left = back;
  for (let n = 0; n < t.hn; n++) {
    const i = (t.hh - n + 32) % 32, qx = t.hx[i], qy = t.hy[i], d = Math.hypot(qx - px, qy - py);
    if (d >= left && d > 0) { const u = left / d; _tp.x = px + (qx - px) * u; _tp.y = py + (qy - py) * u; _tp.a = Math.atan2(py - qy, px - qx); return _tp; }
    left -= d; px = qx; py = qy;
  }
  _tp.x = px - Math.cos(t.da) * left; _tp.y = py - Math.sin(t.da) * left; _tp.a = t.da; return _tp;
}
function railSnap() { const o = []; for (let k = 0; k < N; k++) if (rail[k]) for (let d = 2; d <= 5; d++) if ((rlnk[k] >> d) & 1) { const n = nbr(k, d); if (n > k) o.push([k, n]); } return o; }

/* ------------------------------------------------------------ buses */
const busRouteOf = c => busRoutes.find(r => r.bus === c);
function makeBusCar(si, hi) {
  const s = buildings[si];
  const c = {id: ++carSeq, home: hi, color: s.color, van: false, state: 'loading', loc: {t: 'store', i: si}, x: 0, y: 0, ang: 0, v: 0, len: TRC.busLen, edge: null, s: 0, route: null, ri: 0, destNode: -1,
    job: 'fetch', store: si, bay: -1, want: 0, load: 0, taken: false, timer: 1, stopT: 0, stopAcc: 0, blockedT: 0, replanT: rnd(1, CFG.replanSeconds), replanCool: 0, planFail: 0,
    brake: false, broken: 0, xf: null, xfEdge: null, cr: null, idle: 0, trips: 0, carried: 0, tripStart: 0, hazard: 0, cash: 0, claim: null, towedBy: null, noRouteT: 0,
    up: {cap: 0, spd: 0, load: 0, fuel: 2}, isBus: true, bus: null};
  s.docks.push(c); cars.push(c);
  const p = parkedPose(c); c.x = p.x; c.y = p.y; c.ang = p.a;
  return c;
}
function makeBusRoute(si, houses, silent) {
  const s = buildings[si]; if (!s || s.type !== 'store') return null;
  const hs = (houses || []).filter((hi, i, a) => buildings[hi] && buildings[hi].type === 'house' && buildings[hi].color === s.color && a.indexOf(hi) === i).slice(0, TRC.busMax);
  if (!hs.length) return null;
  const c = makeBusCar(si, hs[0]), r = {id: ++busSeq, store: si, houses: hs, bus: c};
  c.bus = {route: r.id, i: 0, ppp: 0, retry: 0};
  busRoutes.push(r);
  if (!silent) { popRing(bX(s), bY(s), COLORS[s.color].hex); toast('Bus route started: the ' + COLORS[s.color].name + ' store and ' + hs.length + ' house' + (hs.length > 1 ? 's' : ''), 'good'); sfx('upgrade'); }
  return r;
}
function removeBusRoute(id) {
  const i = busRoutes.findIndex(r => r.id === id); if (i < 0) return false;
  const c = busRoutes[i].bus;
  dropFromRoad(c); if (c.loc && (c.loc.t === 'store' || c.loc.t === 'bay')) leaveSpot(c);
  const j = cars.indexOf(c); if (j >= 0) cars.splice(j, 1);
  busRoutes.splice(i, 1); inv.bus = (inv.bus | 0) + 1;
  if (sel && sel.type === 'car' && sel.ref === c) closeInspector();
  toast('Bus route scrapped' + (c.load ? ' — ' + c.load + ' parcel' + (c.load > 1 ? 's' : '') + ' lost' : '') + '. The route token is back in stock.', 'warn'); refreshUI();
  return true;
}
/* the bus stop: on the verge in front of the house, parallel to its road */
function busStopPose(c) {
  const h = buildings[c.home]; if (!h) return {x: c.x, y: c.y, a: c.ang};
  const th = h.face || 0, p = rot(tx(h.k), ty(h.k), th, 0, 15.5);
  return {x: p.x, y: p.y, a: Math.abs(angDiff(c.ang, th)) <= Math.PI / 2 ? th : th + Math.PI};
}
function busPath(c, pose) { const lg = leg(c.x, c.y, c.ang, pose.x, pose.y, pose.a, false, 30); return {t: 0, ph: [lg], dur: lg.dur}; }
/* at the store: take up to 3 parcels (never ones a car has claimed), then set off round the loop */
function busLoaded(c) {
  const r = busRouteOf(c), s = buildings[c.store];
  if (!r || !s) { removeBusRoute(r ? r.id : -1); return; }
  if (c.load <= 0) {
    const n = Math.min(TRC.busCap, s.pins - s.claimed);
    if (n <= 0) { c.timer = 1.5; return; }                                   // nothing waiting: hold at the dock and look again
    s.pins -= n; s.served += n; s.timer = Math.max(0, s.timer - CFG.arrivalRelief * n); if (s.contract) s.contract.got += n;
    c.load = n; c.carried = n; c.bus.ppp = payPerParcel(s); c.cash = Math.round(n * c.bus.ppp); c.bus.i = 0; c.taken = true;
    popText(bX(s), bY(s) - 14, '-' + n, COLORS[s.color].hex);
  }
  busGo(c);
}
/* drive to the next house on the route that can be reached, else back to the store */
function busGo(c) {
  const r = busRouteOf(c), s = buildings[c.store], from = nodeOfParked(c);
  if (!r || !s) return;
  while (c.load > 0 && c.bus.i < r.houses.length) {
    const hi = r.houses[c.bus.i], h = buildings[hi];
    if (h && h.acc >= 0 && from >= 0) {
      const rt = planFor(c, null, from, h.acc);
      if (rt) { c.home = hi; c.job = 'return'; c.want = 0; c.route = rt; c.ri = 0; c.destNode = h.acc; c.state = 'exiting'; c.xf = null; c.planFail = 0; return; }
    }
    c.bus.i++;
  }
  busHome(c);
}
function busHome(c) {
  const s = buildings[c.store], from = nodeOfParked(c);
  c.bus.i = 0; c.bus.retry = 2;
  if (!s) return;
  if (c.loc.t === 'store') { c.state = 'loading'; c.job = 'fetch'; c.want = 0; c.timer = 3; return; }   // already there (no house reachable): wait
  const rt = (s.acc >= 0 && from >= 0) ? planFor(c, null, from, s.acc) : null;
  if (!rt) { c.state = 'parked'; c.job = null; c.route = null; c.v = 0; return; }               // no way yet: busTick tries again shortly
  c.job = 'fetch'; c.want = 0; c.route = rt; c.ri = 0; c.destNode = s.acc; c.state = 'exiting'; c.xf = null; c.planFail = 0;
}
/* pulled in: at the store, start loading; at a house, drop a share of the load and carry on */
function busArrive(c) {
  if (c.loc.t === 'store') { c.state = 'loading'; c.taken = false; c.timer = CFG.pickupPause * Math.pow(0.7, perks.loading); return; }
  const r = busRouteOf(c);
  if (c.loc.t === 'home' && c.load > 0 && r) {
    const left = Math.max(1, r.houses.length - c.bus.i), n = Math.min(c.load, Math.ceil(c.load / left)), cash = Math.round(n * c.bus.ppp);
    creditDelivery(c.home, n, cash, c.color); TR.stats.bus += n; c.load -= n; c.cash = Math.max(0, c.cash - cash); stats.trips++; c.trips++;
  }
  c.bus.i++; c.state = 'parked'; c.job = null; c.route = null; c.idle = 0;
  busGo(c);
}
function busTick(r, dt) {
  const c = r.bus;
  if (!cars.includes(c) || !buildings[r.store]) { busRoutes.splice(busRoutes.indexOf(r), 1); return; }
  if (c.state === 'parked') { c.bus.retry -= dt; if (c.bus.retry <= 0) { c.bus.retry = 2; if (c.load > 0) busGo(c); else busHome(c); } }
}
function busStatus(c) { return c.state === 'loading' ? 'Loading at the store' : c.job === 'return' ? 'Heading for a house' : c.job === 'fetch' ? 'Heading back to the store' : c.state === 'entering' ? 'Pulling in' : 'Waiting for a road'; }
/* the Bus tool: a store, then its houses, then the store again */
function busTool(k, dragging) {
  if (dragging || k < 0) return;
  const bi = bAt[k], b = bi >= 0 ? buildings[bi] : null;
  if (!busPick) {
    if (!b || b.type !== 'store') { hint('Tap a store first, then up to ' + TRC.busMax + ' houses of its colour.'); return; }
    if (!canTake('bus')) { hint('A bus route costs ' + fmt$(PRICE.bus) + '. ' + shortBy(PRICE.bus)); return; }
    busPick = {store: bi, houses: []}; hint('Now tap up to ' + TRC.busMax + ' ' + COLORS[b.color].name + ' houses, then the store again to start the bus.'); sfx('ui');
    return;
  }
  const s = buildings[busPick.store];
  if (bi === busPick.store) { if (busPick.houses.length) busFinish(); else hint('Tap some ' + COLORS[s.color].name + ' houses first.'); return; }
  if (!b || b.type !== 'house') { hint('Houses only, then the store again to start.'); return; }
  if (b.color !== s.color) { hint('That house is the wrong colour — the bus serves ' + COLORS[s.color].name + ' houses.'); return; }
  const j = busPick.houses.indexOf(bi);
  if (j >= 0) { busPick.houses.splice(j, 1); hint('House removed from the route.'); return; }
  busPick.houses.push(bi); sfx('ui');
  if (busPick.houses.length >= TRC.busMax) busFinish(); else hint('Stop ' + busPick.houses.length + ' of ' + TRC.busMax + '. Tap more houses, or the store to start the bus.');
}
function busFinish() {
  const p = busPick; busPick = null;
  if (!canTake('bus')) { hint('A bus route costs ' + fmt$(PRICE.bus) + '. ' + shortBy(PRICE.bus)); return; }
  if (!makeBusRoute(p.store, p.houses)) { hint('That route couldn’t be started.'); return; }
  take('bus'); refreshUI();
}
function renderBusInspector() {
  const box = $('inspect'), body = $('i-body'), title = $('i-title'), c = sel.ref; if (!box || !body) return;
  if (!cars.includes(c)) { closeInspector(); return; }
  const r = busRouteOf(c), n = r ? r.houses.length : 0;
  title.textContent = COLORS[c.color].name + ' bus';
  let html = '<div class="vcard" style="--vc:' + COLORS[c.color].hex + '"><div class="vtype">bus · ' + n + ' stop' + (n === 1 ? '' : 's') + '</div>' +
    '<div class="vslots" title="Parcel seats">' + Array.from({length: TRC.busCap}, (_, i) => '<i class="' + (i < c.load ? 'full' : '') + '"></i>').join('') + '</div>' +
    '<div class="vsub"><b>' + c.load + '</b> of ' + TRC.busCap + ' seats full</div></div>';
  html += '<p class="line"><b>' + busStatus(c) + '</b></p>';
  html += '<p class="line muted">Loops the ' + COLORS[c.color].name + ' store and ' + n + ' of its houses, dropping parcels at every stop. ' + TR.stats.bus + ' delivered by bus so far.</p>';
  html += '<div class="acts"><button class="act" id="a-follow" type="button">' + (follow ? 'Stop following' : 'Follow') + '</button><button class="act danger" id="a-scrap" type="button">Scrap route</button></div>';
  setHTML(body, html); box.hidden = false;
  const f = $('a-follow'); if (f) f.onclick = () => { follow = !follow; if (follow) cam.auto = false; renderInspector(); refreshUI(); };
  const sc = $('a-scrap'); if (sc) sc.onclick = () => { if (r) removeBusRoute(r.id); };
}

/* ------------------------------------------------------------ drones */
function syncDrones() {
  const want = perks ? Math.min(PERKS.drone.max, perks.drone | 0) : 0;
  while (drones.length > want) drones.pop();
  if (drones.length >= want) return;
  const stores = []; for (let i = 0; i < buildings.length; i++) if (buildings[i].type === 'store') stores.push(i);
  if (!stores.length) return;
  while (drones.length < want) {
    let best = -1, bs = -Infinity;                                    // the busiest store without a drone yet
    for (const i of stores) { let sc = buildings[i].pins; for (const d of drones) if (d.store === i) sc -= 100; if (sc > bs) { bs = sc; best = i; } }
    const s = buildings[best];
    drones.push({id: ++droneSeq, store: best, house: -1, lastH: -1, x: bX(s), y: bY(s) - 10, ang: 0, st: 'idle', load: 0, color: -1, cash: 0, t: 0.5});
    if (started && !trPending && !demoMode) popRing(bX(s), bY(s), '#ffffff');
  }
}
function nearestHouse(s, skip) {
  let best = -1, bd = Infinity, n = 0; const sx = cx(s.k), sy = cy(s.k);
  for (let i = 0; i < buildings.length; i++) { const h = buildings[i]; if (h.type !== 'house' || h.color !== s.color) continue; n++; if (i === skip) continue; const d = Math.hypot(cx(h.k) - sx, cy(h.k) - sy); if (d < bd) { bd = d; best = i; } }
  return best >= 0 ? best : (n ? skip : -1);
}
function droneFly(d, gx, gy, v) {
  const dx = gx - d.x, dy = gy - d.y, L = Math.hypot(dx, dy);
  if (L <= v) { d.x = gx; d.y = gy; return true; }
  d.x += dx / L * v; d.y += dy / L * v; d.ang = lerpAng(d.ang, Math.atan2(dy, dx), 0.12); return false;
}
function droneStep(d, dt) {
  let s = buildings[d.store];
  if (!s || s.type !== 'store') { d.store = buildings.findIndex(b => b.type === 'store'); s = buildings[d.store]; if (!s) return; d.st = 'back'; }
  const v = CFG.carSpeed * TRC.droneSpeed * dt;
  switch (d.st) {
    case 'idle': {
      d.x = bX(s) + Math.cos(animT * 0.5 + d.id) * 5; d.y = bY(s) - 10 + Math.sin(animT * 0.5 + d.id) * 3; d.ang = lerpAng(d.ang, animT * 0.5 + d.id + Math.PI / 2, 0.1);
      d.t -= dt; if (d.t > 0) break;
      if (s.pins - s.claimed > 0) { const hi = nearestHouse(s, d.lastH); if (hi >= 0) { s.claimed++; d.house = hi; d.st = 'load'; d.t = TRC.droneLoad; } else d.t = 2; }
      else d.t = 0.5;
      break;
    }
    case 'load':
      d.t -= dt; if (d.t > 0) break;
      s.claimed = Math.max(0, s.claimed - 1);
      if (s.pins > 0 && buildings[d.house]) {
        s.pins--; s.served++; s.timer = Math.max(0, s.timer - CFG.arrivalRelief); if (s.contract) s.contract.got++;
        d.load = 1; d.color = s.color; d.cash = Math.round(payPerParcel(s)); d.st = 'out';
        popText(bX(s), bY(s) - 14, '-1', COLORS[s.color].hex);
      } else { d.st = 'idle'; d.t = 1; }
      break;
    case 'out': {
      const h = buildings[d.house]; if (!h) { d.st = 'back'; break; }
      if (droneFly(d, tx(h.k), ty(h.k) - 4, v)) { creditDelivery(d.house, 1, d.cash, d.color); TR.stats.drone++; stats.trips++; d.lastH = d.house; d.load = 0; d.cash = 0; d.st = 'back'; }
      break;
    }
    case 'back': if (droneFly(d, bX(s), bY(s) - 10, v)) { d.st = 'idle'; d.t = 0.3; d.color = -1; } break;
    default: d.st = 'idle';
  }
}

/* ------------------------------------------------------------ the tick, save and load */
function stepTransport(dt) {
  if (trPending) finishTransportLoad();
  ensureTr();
  trSyncT -= dt; if (trSyncT <= 0) { trSyncT = 1; syncDrones(); syncTransportTools(); }
  for (const t of trains) trainStep(t, dt);
  for (let i = busRoutes.length - 1; i >= 0; i--) busTick(busRoutes[i], dt);
  for (const d of drones) droneStep(d, dt);
}
function transportSave() {
  const list = []; for (let k = 0; k < N; k++) if (rail[k]) list.push([k, rlnk[k]]);
  return {on: [TR.railOn ? 1 : 0, TR.busOn ? 1 : 0], rail: list, dstat: TR.stats,
    trains: trains.map(t => ({k: t.k, load: t.load, col: t.color, cash: t.cash})),
    buses: busRoutes.map(r => ({s: r.store, h: r.houses.slice(), i: r.bus.bus.i, load: r.bus.load, cash: r.bus.cash, ppp: r.bus.bus.ppp})),
    drones: drones.map(d => ({s: d.store, h: d.house, st: d.st, x: +d.x.toFixed(1), y: +d.y.toFixed(1), load: d.load, cash: d.cash, col: d.color}))};
}
/* the rail layer comes back at once; trains, buses and drones are rebuilt on the first tick, once the roads exist */
function transportLoad(o) {
  if (!o || typeof o !== 'object') return;
  if (Array.isArray(o.rail)) for (const p of o.rail) if (Array.isArray(p) && Number.isInteger(p[0]) && p[0] >= 0 && p[0] < N) { rail[p[0]] = 1; rlnk[p[0]] = p[1] & 255; }
  for (let k = 0; k < N; k++) if (rail[k]) for (let d = 0; d < 8; d++) if ((rlnk[k] >> d) & 1) { const n = nbr(k, d); if (n < 0 || !rail[n]) rlnk[k] &= ~(1 << d); }
  TR.railOn = !!(o.on && o.on[0]); TR.busOn = !!(o.on && o.on[1]);
  if (o.dstat) TR.stats = {train: o.dstat.train | 0, bus: o.dstat.bus | 0, drone: o.dstat.drone | 0};
  trPending = o;
}
function finishTransportLoad() {
  const o = trPending; trPending = null;
  rebuildRail();
  for (const st of (o.trains || [])) {
    if (!(st.k >= 0 && st.k < N && rail[st.k])) continue;
    const t = trains.find(x => x.comp === railComp[st.k]); if (!t) continue;
    t.k = st.k; t.nk = st.k; t.x = tx(st.k); t.y = ty(st.k); t.load = clamp(st.load | 0, 0, TRC.trainCap); t.color = st.col >= 0 && st.col < COLORS.length ? st.col : -1; if (t.color < 0) t.load = 0; t.cash = +st.cash || 0;
  }
  for (const b of (o.buses || [])) {
    const r = makeBusRoute(b.s, b.h, true); if (!r) continue;
    r.bus.load = clamp(b.load | 0, 0, TRC.busCap); r.bus.cash = +b.cash || 0; r.bus.bus.ppp = +b.ppp || 0; r.bus.bus.i = clamp(b.i | 0, 0, r.houses.length - 1);
  }
  syncDrones();
  (o.drones || []).forEach((sd, i) => {
    const d = drones[i]; if (!d) return;
    if (buildings[sd.s] && buildings[sd.s].type === 'store') d.store = sd.s;
    d.house = buildings[sd.h] && buildings[sd.h].type === 'house' ? sd.h : -1;
    d.st = sd.st === 'out' && d.house >= 0 && sd.load > 0 ? 'out' : sd.st === 'back' ? 'back' : 'idle';
    d.load = d.st === 'out' ? 1 : 0; d.cash = +sd.cash || 0; d.color = d.st === 'out' && sd.col >= 0 && sd.col < COLORS.length ? sd.col : -1;
    if (isFinite(sd.x) && isFinite(sd.y)) { d.x = sd.x; d.y = sd.y; }
  });
}

/* ------------------------------------------------------------ drawing */
function buildRailPaths() {
  const P = {ver: railVer, bed: new Path2D(), rails: new Path2D(), lone: new Path2D(), xings: []};
  for (let k = 0; k < N; k++) {
    if (!rail[k]) continue;
    const x = tx(k), y = ty(k);
    if (!rlnk[k]) { P.lone.moveTo(x - 0.01, y); P.lone.lineTo(x + 0.01, y); }
    if (road[k]) { let a = 0; for (let d = 0; d < 8; d++) if ((lnk[k] >> d) & 1) { a = Math.atan2(DY[d], DX[d]); break; } P.xings.push({k, x, y, a}); }
    for (let d = 2; d <= 5; d++) {
      if (!((rlnk[k] >> d) & 1)) continue; const n = nbr(k, d); if (n <= k) continue;
      const nx = tx(n), ny = ty(n), L = Math.hypot(nx - x, ny - y), ux = (nx - x) / L, uy = (ny - y) / L, o = 2.4;
      P.bed.moveTo(x, y); P.bed.lineTo(nx, ny);
      P.rails.moveTo(x - uy * o, y + ux * o); P.rails.lineTo(nx - uy * o, ny + ux * o);
      P.rails.moveTo(x + uy * o, y - ux * o); P.rails.lineTo(nx + uy * o, ny - ux * o);
    }
  }
  railCache = P;
}
function drawRail(vr) {
  if (trPending) finishTransportLoad();
  if (!railN) return;
  if (railCache.ver !== railVer) buildRailPaths();
  const P = railCache, bed = PAL.pave || '#cbc9bd', dark = shade(bed, -0.3), steel = theme === 'dark' ? '#b4bcc3' : '#7f8a93';
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = SUN.a; ctx.translate(SUN.x * 1.2, SUN.y * 1.2); ctx.strokeStyle = PAL.sh; ctx.lineWidth = 11.5; ctx.stroke(P.bed); ctx.stroke(P.lone); ctx.translate(-SUN.x * 1.2, -SUN.y * 1.2); ctx.globalAlpha = 1;
  ctx.strokeStyle = bed; ctx.lineWidth = 10; ctx.stroke(P.bed); ctx.stroke(P.lone);                        // ballast
  ctx.strokeStyle = dark; ctx.lineWidth = 7.4; ctx.lineCap = 'butt'; ctx.setLineDash([1.7, 4.3]); ctx.stroke(P.bed); ctx.setLineDash([]); ctx.lineCap = 'round';   // sleepers
  ctx.strokeStyle = steel; ctx.lineWidth = 1.3; ctx.stroke(P.rails);                                       // two rails
  for (const st of stations) drawStation(st);
  for (const xg of P.xings) drawCrossing(xg);
  ctx.restore();
}
/* a small platform on the building's side of the rail, with a round shelter in the building's colour */
function drawStation(st) {
  const b = buildings[st.b]; if (!b) return;
  const a = Math.atan2(DY[st.d], DX[st.d]), x = tx(st.k) + DX[st.d] * 10, y = ty(st.k) + DY[st.d] * 10, col = COLORS[b.color].hex;
  dropShadow(x, y, a, 1, 1.4, [[-2.3, -9, 4.6, 18, 2.3]]);
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  rr(-2.3, -9, 4.6, 18, 2.3); ctx.fillStyle = theme === 'dark' ? '#6b7574' : '#ebe6d8'; ctx.fill(); ctx.lineWidth = 0.8; ctx.strokeStyle = rgba(col, 0.9); ctx.stroke();
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -5, 2.4, 0, 6.3); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(-0.6, -5.6, 0.9, 0, 6.3); ctx.fill();
  ctx.fillStyle = rgba(col, 0.6); for (const py of [1, 4, 7]) { rr(-1.2, py - 0.5, 2.4, 1, 0.5); ctx.fill(); }
  ctx.restore();
}
/* striped gate arms either side of the rails across the road; they flash red while a train is near */
function drawCrossing(xg) {
  const shut = xingT && xingT[xg.k] > clock, blink = shut && Math.sin(animT * 9) > 0;
  for (const sgn of [-1, 1]) {
    ctx.save(); ctx.translate(xg.x + Math.cos(xg.a) * sgn * 9.5, xg.y + Math.sin(xg.a) * sgn * 9.5); ctx.rotate(xg.a + Math.PI / 2);
    rr(-6.5, -1.4, 13, 2.8, 1.4); ctx.fillStyle = '#f6f2e8'; ctx.fill();
    ctx.fillStyle = shut ? '#ff3b30' : '#d8352a'; for (let i = 0; i < 3; i++) { rr(-5.4 + i * 4.3, -1.4, 2.1, 2.8, 1); ctx.fill(); }
    ctx.fillStyle = blink ? '#ff3b30' : '#5a2a28'; ctx.beginPath(); ctx.arc(sgn * 7.6, 0, 1.5, 0, 6.3); ctx.fill();
    ctx.restore();
  }
}
function drawTrain(t) {
  t.da = lerpAng(t.da, t.ang, 0.25);
  const col = t.color >= 0 ? COLORS[t.color].hex : (theme === 'dark' ? '#8b97a0' : '#9ba6ad'), tl = trainTail(t, 18), ta = tl.a, wx = tl.x, wy = tl.y;
  dropShadow(wx, wy, ta, 1, 2.6, [[-7.5, -3.8, 15, 7.6, 2.8]]);
  ctx.save(); ctx.translate(wx, wy); ctx.rotate(ta);                                           // the wagon
  rr(-7.5, -3.8, 15, 7.6, 2.8); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.stroke();
  rr(-6.2, -2.7, 12.4, 5.4, 1.8); ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fill();
  for (let i = 0; i < TRC.trainCap; i++) { ctx.fillStyle = i < t.load ? '#e3b46a' : 'rgba(0,0,0,.2)'; rr(-5.3 + (i % 3) * 3.7, i < 3 ? -2.1 : 0.5, 2.7, 1.6, 0.5); ctx.fill(); }
  ctx.restore();
  ctx.strokeStyle = '#2b333a'; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(wx + Math.cos(ta) * 7, wy + Math.sin(ta) * 7); ctx.lineTo(t.x - Math.cos(t.da) * 8.5, t.y - Math.sin(t.da) * 8.5); ctx.stroke();
  dropShadow(t.x, t.y, t.da, 1, 3, [[-9, -4, 18, 8, 3]]);
  ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.da);                                        // the locomotive
  rr(-9, -4, 18, 8, 3); ctx.fillStyle = theme === 'dark' ? '#4a5660' : '#3b4650'; ctx.fill(); ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.stroke();
  rr(-8, -1, 16, 2, 1); ctx.fillStyle = col; ctx.fill();
  rr(2, -3, 5.6, 6, 2); ctx.fillStyle = 'rgba(24,44,58,.9)'; ctx.fill();
  ctx.fillStyle = '#fff5d6'; for (const vx of [-6.4, -3.4, -0.4]) { ctx.beginPath(); ctx.arc(vx, -2.6, 0.85, 0, 6.3); ctx.fill(); ctx.beginPath(); ctx.arc(vx, 2.6, 0.85, 0, 6.3); ctx.fill(); }
  ctx.fillStyle = '#ffd98a'; ctx.beginPath(); ctx.arc(8.2, 0, 1.1, 0, 6.3); ctx.fill();
  ctx.restore();
}
function drawBus(c) {
  c.da = c.da === undefined ? c.ang : lerpAng(c.da, c.ang, 0.28);
  const L = TRC.busLen, Wd = 7.6, hw = Wd / 2, col = COLORS[c.color].hex;
  dropShadow(c.x, c.y, c.da, 1, 3, [[-L / 2, -hw, L, Wd, 3]]);
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.da);
  for (const x of [L / 2 - 4, -L / 2 + 4]) for (const sy of [-1, 1]) wheel(x, sy * hw, 3.2, 1.3);
  rr(-L / 2, -hw, L, Wd, 3); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.stroke();
  rr(-L / 2 + 1.2, -1.1, L - 4.6, 2.2, 1.1); ctx.fillStyle = '#f4f2ec'; ctx.fill();                      // white roof stripe
  rr(L / 2 - 3.6, -hw + 0.8, 2.7, Wd - 1.6, 1.2); ctx.fillStyle = 'rgba(24,44,58,.9)'; ctx.fill();        // windscreen
  ctx.fillStyle = 'rgba(24,44,58,.85)';
  for (let i = 0; i < 5; i++) for (const sy of [-1, 1]) { ctx.beginPath(); ctx.arc(-L / 2 + 2.6 + i * 3.2, sy * (hw - 1.45), 0.95, 0, 6.3); ctx.fill(); }   // round windows
  for (let i = 0; i < TRC.busCap; i++) { ctx.fillStyle = i < c.load ? '#e3b46a' : 'rgba(0,0,0,.22)'; rr(-L / 2 + 3 + i * 3.6, -0.75, 2.6, 1.5, 0.5); ctx.fill(); }
  ctx.fillStyle = '#fff5c8'; ctx.beginPath(); ctx.arc(L / 2 - 0.9, -hw + 1.3, 0.85, 0, 6.3); ctx.fill(); ctx.beginPath(); ctx.arc(L / 2 - 0.9, hw - 1.3, 0.85, 0, 6.3); ctx.fill();
  if (c.brake) { ctx.fillStyle = '#ff4a3a'; ctx.beginPath(); ctx.arc(-L / 2 + 0.8, -hw + 1.3, 0.7, 0, 6.3); ctx.fill(); ctx.beginPath(); ctx.arc(-L / 2 + 0.8, hw - 1.3, 0.7, 0, 6.3); ctx.fill(); }
  ctx.restore();
  if (sel && sel.type === 'car' && sel.ref === c) {
    ctx.strokeStyle = theme === 'dark' ? '#fff' : '#12303f'; ctx.lineWidth = 1.8 / Math.max(0.6, cam.z * 0.6);
    ctx.beginPath(); ctx.arc(c.x, c.y, 14 + Math.sin(animT * 5), 0, 6.3); ctx.stroke();
  }
}
const DRONE_STD = {body: '#f4f2ec', rotor: '#1f262b', k: 'nose'}, DRONE_ARMS = [[4.4, -3.9], [4.4, 3.9], [-4.4, -3.9], [-4.4, 3.9]];
/* a drone from above: four spinning rotors on short arms, a rounded body, a parcel slung underneath */
function drawDrone(d, sc, preview) {
  const sk = GEN_P.drone[design('drone')] || DRONE_STD, body = sk.body, rot_ = sk.rotor, acc = d.color >= 0 ? COLORS[d.color].hex : '#9ba6ad', pc = sk.c || acc;
  const spin = REDUCED_MOTION ? 0.4 : animT * 24 + d.id;
  if (gfx.shadows !== 'off') { ctx.save(); ctx.globalAlpha = SUN.a * 0.45; ctx.fillStyle = PAL.sh; ctx.beginPath(); ctx.ellipse(d.x + SUN.x * 7 * (sc || 1), d.y + SUN.y * 7 * (sc || 1), 6.5 * (sc || 1), 5 * (sc || 1), d.ang, 0, 6.3); ctx.fill(); ctx.restore(); }
  ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.ang); if (sc && sc !== 1) ctx.scale(sc, sc);
  if (sk.k === 'glow') { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const gl = ctx.createRadialGradient(0, 0, 1, 0, 0, 9); gl.addColorStop(0, rgba(pc, 0.6)); gl.addColorStop(1, rgba(pc, 0)); ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, 0, 9, 0, 6.3); ctx.fill(); ctx.restore(); }
  ctx.strokeStyle = rot_; ctx.lineWidth = 1.1; ctx.lineCap = 'round'; ctx.beginPath(); for (const [ax, ay] of DRONE_ARMS) { ctx.moveTo(0, 0); ctx.lineTo(ax, ay); } ctx.stroke();
  for (const [ax, ay] of DRONE_ARMS) {
    ctx.fillStyle = rgba(rot_, 0.8); for (let i = 0; i < 3; i++) { const a = spin * (ax > 0 ? 1 : -1) + i * 2.094 + ay; ctx.beginPath(); ctx.arc(ax + Math.cos(a) * 2.3, ay + Math.sin(a) * 2.3, 0.75, 0, 6.3); ctx.fill(); }
    ctx.fillStyle = rot_; ctx.beginPath(); ctx.arc(ax, ay, 0.95, 0, 6.3); ctx.fill();
  }
  if (d.load > 0) { ctx.fillStyle = '#e3b46a'; rr(-1.7, 1.4, 3.4, 2.6, 0.6); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.45)'; rr(-0.25, 1.4, 0.5, 2.6, 0.2); ctx.fill(); }
  rr(-4.2, -2.6, 8.4, 5.2, 2.6); ctx.fillStyle = body; ctx.fill(); ctx.lineWidth = 0.5; ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.stroke();
  if (sk.k === 'dots') { ctx.fillStyle = pc; for (const px of [-2.2, 0, 2.2]) { ctx.beginPath(); ctx.arc(px, 0.3, 0.7, 0, 6.3); ctx.fill(); } }
  else if (sk.k === 'band') { ctx.fillStyle = pc; rr(-1.2, -2.6, 2.4, 5.2, 0.9); ctx.fill(); }
  else if (sk.k === 'stripe') { ctx.fillStyle = pc; rr(-4.2, -0.7, 8.4, 1.4, 0.7); ctx.fill(); }
  else if (sk.k === 'nose' || !sk.k) { ctx.fillStyle = acc; rr(1.2, -1.6, 2.4, 3.2, 1.2); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,.4)'; rr(-3.4, -2.1, 3.6, 1.1, 0.55); ctx.fill();
  ctx.fillStyle = 'rgba(24,44,58,.9)'; ctx.beginPath(); ctx.arc(3.3, 0, 0.8, 0, 6.3); ctx.fill();
  ctx.restore();
}
function drawDrones() { for (const d of drones) drawDrone(d, 1, false); }   // above the badges: they fly
function drawTransport() {
  for (const t of trains) drawTrain(t);
  if (sel && sel.type === 'car' && sel.ref.isBus) drawBusRoute(busRouteOf(sel.ref), COLORS[sel.ref.color].hex);
  if (busPick && tool === 'bus') { const s = buildings[busPick.store]; if (s) drawBusRoute({store: busPick.store, houses: busPick.houses}, COLORS[s.color].hex); }
}
function drawBusRoute(r, col) {
  if (!r) return;
  const s = buildings[r.store]; if (!s) return;
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.setLineDash([5, 5]); ctx.lineDashOffset = REDUCED_MOTION ? 0 : -animT * 20; ctx.globalAlpha = 0.8;
  ctx.beginPath(); let px = bX(s), py = bY(s);
  for (const hi of r.houses) { const h = buildings[hi]; if (!h) continue; ctx.moveTo(px, py); ctx.lineTo(tx(h.k), ty(h.k)); px = tx(h.k); py = ty(h.k); }
  ctx.moveTo(px, py); ctx.lineTo(bX(s), bY(s)); ctx.stroke(); ctx.setLineDash([]);
  const box = plotBox(s, 3); rr(box.x, box.y, box.w, box.h, 8); ctx.stroke();
  for (const hi of r.houses) { const h = buildings[hi]; if (h) { ctx.beginPath(); ctx.arc(tx(h.k), ty(h.k), 20 + Math.sin(animT * 4), 0, 6.3); ctx.stroke(); } }
  ctx.restore();
}

/* ------------------------------------------------------------ hooks: wrap rather than edit the busy functions */
const _stepTraffic61 = stepTraffic;
stepTraffic = function (dt) { _stepTraffic61(dt); stepTransport(dt); };
const _drawCar61 = drawCar;
drawCar = function (c, sb) { if (c.isBus) return drawBus(c); return _drawCar61(c, sb); };
const _eraseAt61 = eraseAt;
eraseAt = function (k, silent) { if (k >= 0 && rail[k] && parkAt[k] < 0 && depotAt[k] < 0 && !sign[k] && !special[k]) return eraseRail(k); return _eraseAt61(k, silent); };
const _renderInspector61 = renderInspector;
renderInspector = function () { if (sel && sel.type === 'car' && sel.ref && sel.ref.isBus) { renderBusInspector(); return; } _renderInspector61(); };
const _refreshUI61 = refreshUI;
refreshUI = function () { ensureTr(); if (busPick && tool !== 'bus') busPick = null; _refreshUI61(); syncTransportTools(); };

/* ---------------------------------------------------------------------
   5. RENDERING — a flat, top-down canvas.
   --------------------------------------------------------------------- */
const cv = document.getElementById('cv');
let ctx = cv.getContext('2d');                       // swapped briefly to draw shop previews with the real artwork
function withCtx(g, fn) { const keep = ctx; ctx = g; try { fn(); } finally { ctx = keep; } }
let W = 900, H = 700, dpr = 1;
const cam = {x: 0, y: 0, z: 1, auto: true};
const insets = {l: 0, r: 0, t: 0, b: 0};
/* ---- quality: shadows, decoration density, smooth motion and a frame cap. Three presets, or your own mix. */
const GFX_PRESETS = {high: {shadows: 'on', decor: 1, smooth: true, cap: 0, res: 2}, balanced: {shadows: 'simple', decor: 0.6, smooth: true, cap: 60, res: 1.5}, battery: {shadows: 'off', decor: 0.3, smooth: false, cap: 30, res: 1}};
const GFX_NOTES = {high: 'Everything on. Best on computers.', balanced: 'Simple shadows, fewer decorations, 60 fps. The phone default.', battery: 'No shadows, few decorations, 30 fps. Easiest on the battery.', custom: 'Your own mix.'};
let gfx = Object.assign({preset: 'high'}, GFX_PRESETS.high);
function gfxPresetOf() { for (const k in GFX_PRESETS) { const p = GFX_PRESETS[k]; if (p.shadows === gfx.shadows && +p.decor === +gfx.decor && !!p.smooth === !!gfx.smooth && +p.cap === +gfx.cap) return k; } return 'custom'; }
function setGfx(o) { Object.assign(gfx, o); gfx.preset = gfxPresetOf(); savePrefs(true); syncGfxUI(); }
function syncGfxUI() {
  const seg = (id, v) => document.querySelectorAll('#' + id + ' button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v !== undefined ? +b.dataset.v === +v || b.dataset.v === String(v) : b.dataset.gfx === v)));
  seg('gfx-pre', gfx.preset); seg('gfx-shadows', gfx.shadows); seg('gfx-decor', gfx.decor); seg('gfx-cap', gfx.cap);
  const sm = $('gfx-smooth'); if (sm) sm.checked = !!gfx.smooth;
  const n = $('gfx-note'); if (n) n.textContent = GFX_NOTES[gfx.preset] || GFX_NOTES.custom;
}
/* flow-view */
/* ---------------------------------------------------------- traffic flow view (F2)
   Roads tinted by how many cars use them (blue where they move freely, orange where they queue), little chevrons
   drifting along the busy ones, and a ring round every junction coloured by its average wait. An edge's flow is cars
   a minute: e.passed is snapshotted every 5 s of city time into a 12-slot ring kept in a Map by edge key, so it
   survives rebuildNet(). Each junction keeps a five-minute history (a point every 10 s) for the inspector chart,
   keyed by tile. Sampling runs from update() and costs a few comparisons a tick. */
let showFlow = false;
const FLOW_SLOTS = 12, FLOW_HIST = 30, FLOW_T = 6;
const flowEdges = new Map(), flowNodes = new Map();
let flowSampleAt = -99, flowHistAt = -99, flowPanelAt = -99, flowMax = 12, flowCols = null;
function flowTick() {
  if (clock < flowSampleAt) { flowSampleAt = flowHistAt = -99; flowEdges.clear(); flowNodes.clear(); flowMax = 12; }   // a new city
  if (clock - flowSampleAt >= 5) {
    flowSampleAt = clock;
    let mx = 0;
    for (const e of edges) {
      let f = flowEdges.get(e.key);
      if (!f || e.passed < f.ring[f.i]) { f = {ring: new Array(FLOW_SLOTS).fill(e.passed), i: 0, n: 0, rate: 0}; flowEdges.set(e.key, f); }
      f.i = (f.i + 1) % FLOW_SLOTS; const old = f.ring[f.i]; f.ring[f.i] = e.passed;
      f.n = Math.min(FLOW_SLOTS, f.n + 1);
      f.rate = (e.passed - old) * FLOW_SLOTS / f.n;           // cars in the last minute (scaled up while the ring fills)
      if (f.rate > mx) mx = f.rate;
    }
    flowMax += (Math.max(12, mx) - flowMax) * 0.5;            // the tint scale follows the busiest road, gently
    if (flowEdges.size > edges.length + 64) for (const k of flowEdges.keys()) if (!edgeMap.has(k)) flowEdges.delete(k);
  }
  if (clock - flowHistAt >= 10) {
    flowHistAt = clock;
    for (const nd of nodeList) {
      if (!nd.junction) continue;
      let h = flowNodes.get(nd.k);
      if (!h || nd.passed < h.last) { h = {pts: [], last: nd.passed, seen: [nd.passed]}; flowNodes.set(nd.k, h); }
      const w = nd.waitN ? nd.waitSum / nd.waitN : 0;
      h.seen.push(nd.passed); if (h.seen.length > 4) h.seen.shift();           // cars a minute over the last 30 s, so the line isn't all spikes
      h.pts.push({rate: (nd.passed - h.seen[0]) * 6 / (h.seen.length - 1), jam: w / 10, w}); h.last = nd.passed;
      if (h.pts.length > FLOW_HIST) h.pts.shift();
    }
    if (flowNodes.size > nodeList.length) for (const k of flowNodes.keys()) if (!nodes[k] || !nodes[k].junction) flowNodes.delete(k);
  }
}
function flowRateInto(nd) { let r = 0; for (const e of nd.ins) { const f = flowEdges.get(e.key); if (f) r += f.rate; } return r; }
function flowPalette() {
  const cs = getComputedStyle(document.documentElement), get = (k, d) => (cs.getPropertyValue(k) || '').trim() || d;
  flowCols = {good: get('--good', '#43d17a'), mid: get('--mid', '#ffb02e'), bad: get('--bad', '#ff5a4a'),
              pill: theme === 'dark' ? 'rgba(255,255,255,.92)' : 'rgba(18,48,63,.88)', pillInk: theme === 'dark' ? '#12303f' : '#fff', lut: []};
  for (let j = 0; j < 3; j++) for (let t = 0; t < FLOW_T; t++) {        // j: 0 moving, 1 slowing, 2 queued; t: how busy
    const u = t / (FLOW_T - 1), m = j / 2, r = Math.round(70 + (255 - 70) * m), g = Math.round(150 + (140 - 150) * m), b = Math.round(255 + (40 - 255) * m);
    flowCols.lut.push('rgba(' + r + ',' + g + ',' + b + ',' + (0.16 + 0.56 * u).toFixed(2) + ')');
  }
}
const flowBuckets = []; for (let i = 0; i < 3 * FLOW_T; i++) flowBuckets.push([]);
const flowBusy = [], flowRing = [[], [], []];
function drawFlow(vr) {
  if (!flowCols) flowPalette();
  const x0 = vr.x0 - CELL, y0 = vr.y0 - CELL, x1 = vr.x1 + CELL, y1 = vr.y1 + CELL, o = CFG.laneOffset * laneSign;
  for (const b of flowBuckets) b.length = 0;
  flowBusy.length = 0;
  const inv = 1 / Math.max(12, flowMax);
  for (const e of edges) {
    if (Math.max(e.ax, e.bx) < x0 || Math.min(e.ax, e.bx) > x1 || Math.max(e.ay, e.by) < y0 || Math.min(e.ay, e.by) > y1) continue;
    const f = flowEdges.get(e.key), t = clamp((f ? f.rate : 0) * inv, 0, 1), ti = Math.min(FLOW_T - 1, Math.floor(t * FLOW_T));
    flowBuckets[(e.q < 0.5 ? 0 : e.q < 1.5 ? 1 : 2) * FLOW_T + ti].push(e);
    if (t > 0.3) flowBusy.push(e);
  }
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 0; i < flowBuckets.length; i++) {
    const b = flowBuckets[i]; if (!b.length) continue;
    ctx.strokeStyle = flowCols.lut[i]; ctx.lineWidth = 5 + 7 * ((i % FLOW_T) / (FLOW_T - 1));
    ctx.beginPath();
    for (const e of b) {                                      // one continuous line along plain road; a gap where a junction ring sits
      const s0 = nodes[e.a] && nodes[e.a].junction ? e.r0 : 0, s1 = nodes[e.b] && nodes[e.b].junction ? e.stop : e.L;
      ctx.moveTo(e.ax + e.ux * s0 + e.nx * o, e.ay + e.uy * s0 + e.ny * o); ctx.lineTo(e.ax + e.ux * s1 + e.nx * o, e.ay + e.uy * s1 + e.ny * o);
    }
    ctx.stroke();
  }
  if (flowBusy.length && cam.z > 0.55) {                      // chevrons drift the way the traffic goes
    const SP = 16, off = REDUCED_MOTION ? 6 : (animT * 26) % SP;
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.7; ctx.beginPath();
    for (const e of flowBusy) {
      const bx = e.ax + e.nx * o, by = e.ay + e.ny * o;
      for (let s = e.r0 + off; s < e.stop - 1; s += SP) {
        const x = bx + e.ux * s, y = by + e.uy * s, tx_ = x - e.ux * 3.2, ty_ = y - e.uy * 3.2;
        ctx.moveTo(tx_ + e.nx * 3.2, ty_ + e.ny * 3.2); ctx.lineTo(x, y); ctx.lineTo(tx_ - e.nx * 3.2, ty_ - e.ny * 3.2);
      }
    }
    ctx.stroke();
  }
  for (const r of flowRing) r.length = 0;
  for (const nd of nodeList) {
    if (!nd.junction) continue;
    const x = tx(nd.k), y = ty(nd.k); if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    const w = nd.waitN ? nd.waitSum / nd.waitN : 0;
    flowRing[w < 1.5 ? 0 : w < 4 ? 1 : 2].push(nd);
  }
  const cols = [flowCols.good, flowCols.mid, flowCols.bad];
  for (let i = 0; i < 3; i++) {
    const L = flowRing[i]; if (!L.length) continue;
    ctx.beginPath(); for (const nd of L) { const x = tx(nd.k), y = ty(nd.k); ctx.moveTo(x + 11, y); ctx.arc(x, y, 11, 0, 6.3); }
    ctx.fillStyle = cols[i]; ctx.globalAlpha = 0.16; ctx.fill();
    ctx.globalAlpha = 0.95; ctx.strokeStyle = cols[i]; ctx.lineWidth = 2.6; ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (cam.z > 1.3) {                                          // the wait itself, on a little pill under the ring
    ctx.font = '700 6.5px system-ui, -apple-system, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const L of flowRing) for (const nd of L) {
      if (!nd.waitN) continue;
      const x = tx(nd.k), y = ty(nd.k) + 18, t = (nd.waitSum / nd.waitN).toFixed(1) + ' s', pw = ctx.measureText(t).width + 7;
      ctx.fillStyle = flowCols.pill; rr(x - pw / 2, y - 4.6, pw, 9.2, 4.6); ctx.fill();
      ctx.fillStyle = flowCols.pillInk; ctx.fillText(t, x, y + 0.3);
    }
  }
  ctx.restore();
  if (animT - flowPanelAt > 1) { flowPanelAt = animT; flowPalette(); renderFlowPanel(); }
}
/* the five worst places right now: junctions by average wait (plus what's queued on the way in), and plain
   stretches of road that are backing up (a store entrance, a dead end) by how many cars stand on them */
function flowSpots() {
  const list = [];
  for (const nd of nodeList) {
    if (!nd.junction) continue;
    const w = nd.waitN ? nd.waitSum / nd.waitN : 0, r = flowRateInto(nd); let q = 0;
    for (const e of nd.ins) q += e.qRaw;
    const score = w + q * 0.6;
    if (score < 0.5 || (r <= 0 && q <= 0)) continue;
    list.push({k: nd.k, x: tx(nd.k), y: ty(nd.k), score, what: JUNC_NAMES[nd.type] || 'Junction', w, q, r});
  }
  for (const e of edges) {
    const nd = nodes[e.b]; if (!nd || nd.junction || e.q < 1) continue;
    const f = flowEdges.get(e.key);
    list.push({k: e.b, x: (e.ax + e.bx) / 2, y: (e.ay + e.by) / 2, score: e.q * 0.8, what: e.fast ? 'Motorway' : 'Road', w: -1, q: e.q, r: f ? f.rate : 0});
  }
  list.sort((a, b) => b.score - a.score);
  return list.slice(0, 5);
}
function renderFlowPanel() {
  const box = $('flow-list'); if (!box || !showFlow) return;
  const spots = flowSpots();
  setHTML(box, spots.length ? spots.map(o => '<div class="fp-row"><div><b>' + o.what + ' at col ' + (cx(o.k) - org + 1) + ', row ' + (cy(o.k) - org + 1) + '</b><small>' +
    (o.w >= 0 ? o.w.toFixed(1) + ' s avg wait' + (o.q >= 1 ? ' \u00b7 ' + Math.round(o.q) + ' queued' : '') : Math.round(o.q) + ' queued') + ' \u00b7 ' + Math.round(o.r) + ' cars/min</small></div>' +
    '<button class="act" type="button" data-flow-jump="' + o.x.toFixed(0) + ',' + o.y.toFixed(0) + '" aria-label="Jump to ' + o.what + ' at col ' + (cx(o.k) - org + 1) + ', row ' + (cy(o.k) - org + 1) + '">Jump</button></div>').join('')
    : '<p class="fp-empty">Traffic is moving freely everywhere.</p>');
}
function toggleFlow(on) {
  showFlow = on === undefined ? !showFlow : !!on;
  flowCols = null;
  const b = $('btn-flow'); if (b) b.setAttribute('aria-pressed', showFlow ? 'true' : 'false');
  const p = $('flow-panel'); if (p) p.hidden = !showFlow;
  if (showFlow) { flowPanelAt = animT; renderFlowPanel(); }
}
/* the inspector chart: cars a minute (filled) and average wait (line, 5 s = full height) over the last five minutes */
function drawFlowChart(c, nd) {
  if (!c || !c.getContext) return;
  const h = flowNodes.get(nd.k), pts = h ? h.pts : [];
  if (pts.length < 2) {
    const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = (getComputedStyle(document.documentElement).getPropertyValue('--soft') || '#aab').trim(); g.font = '11px system-ui, sans-serif'; g.textBaseline = 'middle';
    g.fillText('Watching this junction\u2026 the chart fills in over five minutes.', 8, c.height / 2); return;
  }
  const n = pts.length, off = FLOW_HIST - n, D = FLOW_HIST - 1;
  plotSeries(c, pts, i => (i + off) / D, [4, 3, 2, 1].map(m => ({x: (D - m * 6) / D, label: '\u2212' + m + ' min'})));   // ticks left to right
}
let theme = 'light', animT = 0, showHeat = false, showGrid = false, nightOn = true, fxOn = true, showMoto = true;
let fx = [];

const PALS = {
  light: {land: '#dde5cf', land2: '#d4dec4', check: 'rgba(255,255,255,.28)', water: '#9dc9df', foam: '#cfe9f4', wave: 'rgba(255,255,255,.55)',
          road: '#fbfaf5', roadWet: '#e6ebea', edge: '#33424d', lane: '#e2b022', stop: 'rgba(51,66,77,.5)', shadow: 'rgba(24,44,34,.14)',
          grid: 'rgba(30,60,40,.07)', tree1: '#79b26f', tree2: '#5f9a5b', treeSh: 'rgba(24,52,34,.2)', pave: '#cbc9bd', asphalt: '#66727b',
          outside: 'rgba(28,48,58,.32)', deck: '#2c62a8', deckEdge: '#0f3566', stone: '#8b8d86', grass: '#a9cf95', roofBase: '#e9e6dc', ink: '#16303c', night: [12, 22, 52],
          sh: 'rgba(22,42,40,.24)', lot: '#d9d6cb', curb: '#c3bfb2'},
  dark:  {land: '#23322f', land2: '#1f2d2b', check: 'rgba(255,255,255,.03)', water: '#1c4458', foam: '#2c6178', wave: 'rgba(160,210,235,.22)',
          road: '#4a565f', roadWet: '#3c474f', edge: '#141c21', lane: '#c9a12a', stop: 'rgba(230,240,245,.35)', shadow: 'rgba(0,0,0,.28)',
          grid: 'rgba(255,255,255,.05)', tree1: '#3c6b4a', tree2: '#2f5a3e', treeSh: 'rgba(0,0,0,.3)', pave: '#55605f', asphalt: '#39444b',
          outside: 'rgba(4,10,14,.5)', deck: '#2a5896', deckEdge: '#0c2a52', stone: '#66696a', grass: '#3f6b48', roofBase: '#77807e', ink: '#e8f0f2', night: [6, 12, 34],
          sh: 'rgba(0,0,0,.34)', lot: '#4b5655', curb: '#5d6766'}
};
let PAL = PALS.light;
/* ---- map themes. Each theme is a ground colour, soft patches of a second colour across it, its own water
   and a default decoration for the open ground. The decoration can be picked separately (snowmen in the
   desert are allowed), and the ground, patch and water colours can be set by hand. theme stays 'light' or
   'dark' (the tone the rest of the drawing and the interface key off); mapPrefs.theme is the named theme. */
const MAP_KEY = 'junction-map-v1';
/* v1.10 designs: [key, name, price (old scale; 45+ is rare), 'U' for unique (crates only), settings for its renderer] */
const GEN = {
  car: [
    ['polka', 'Polka dots', 30, '', {k: 'dots', c: ['#ffffff']}], ['bubbles', 'Bubbles', 35, '', {k: 'dots', c: ['#ff9ecb', '#9fd5f2', '#fff3a8'], big: 1}],
    ['pinstripe', 'Pinstripe', 25, '', {k: 'stripe', c: ['#ffffff', 'rgba(0,0,0,0)', '#ffffff']}], ['tricolour', 'Tricolour', 35, '', {k: 'stripe', c: ['#2f7de1', '#ffffff', '#e0483e']}],
    ['surf', 'Surf wave', 30, '', {k: 'wave', c: ['#ffffff']}], ['sunrise', 'Sunrise fade', 50, '', {k: 'fade', c: ['#ffd23a', '#ff6f61']}],
    ['zebra', 'Zebra', 40, '', {k: 'zebra', c: ['#1f262b']}], ['minttop', 'Mint top', 30, '', {k: 'band', c: ['#7ff0c8'], roof: '#7ff0c8'}],
    ['creamsides', 'Cream sides', 25, '', {k: 'band', c: ['#f4efe1']}], ['darknose', 'Dark nose', 30, '', {k: 'nose', c: ['#1f262b']}],
    ['pinkglow', 'Pink glow', 55, '', {glow: '#ff3df2'}], ['candycane', 'Candy cane', 60, '', {k: 'zebra', c: ['#ffffff']}],
    ['tidal', 'Tidal', 0, 'U', {k: 'wave', c: ['#7fe3ff'], glow: '#00e1ff'}], ['rainbowstripe', 'Rainbow stripe', 0, 'U', {k: 'stripe', c: ['#ff4d4d', '#ff9f1a', '#ffd23a', '#3fd16a', '#2f9bff', '#8a5bff']}],
    /* p30 designs */
    ['leopard', 'Leopard', 35, '', {k: 'spots', c: ['#3a2a1a', '#d9a35a']}], ['roundel', 'Racing roundel', 30, '', {k: 'roundel', c: ['#ffffff', '#1f262b']}],
    ['halfhalf', 'Half and half', 25, '', {k: 'split', c: ['#f4f2ec']}], ['confetti', 'Confetti', 35, '', {k: 'confetti', c: ['#ff6b8b', '#ffd23a', '#7fe3ff', '#3fd16a', '#ffffff']}],
    ['tartan', 'Tartan', 40, '', {k: 'plaid', c: ['#1f3a5f', '#c8102e']}], ['cloudnine', 'Cloud nine', 30, '', {k: 'clouds', c: ['#ffffff']}],
    ['mermaid', 'Mermaid scales', 55, '', {k: 'scales', c: ['#e9fbff'], glow: '#5ccbd4'}], ['flowerpower', 'Flower power', 45, '', {k: 'flowers', c: ['#ffffff', '#ffd23a']}],
    ['hoops', 'Hoops', 25, '', {k: 'rings', c: ['#ffffff']}], ['lagoonfade', 'Lagoon fade', 50, '', {k: 'fade', c: ['#7fe3ff', '#2f9bff']}],
    ['bumblebee', 'Bumblebee', 40, '', {k: 'zebra', c: ['#1f262b'], roof: '#ffd23a'}], ['firefly', 'Firefly', 0, 'U', {k: 'dots', c: ['#fff1a8'], glow: '#ffd23a'}],
    /* p40 designs */
    ['paws', 'Paw prints', 30, '', {k: 'paws', c: ['#ffffff']}], ['tiger', 'Tiger', 35, '', {k: 'tiger', c: ['#1f262b']}],
    ['softcamo', 'Soft camo', 35, '', {k: 'blobs', c: ['#5b7a4a', '#8a9e6a', '#3e5a36']}], ['sunsettop', 'Sunset top', 30, '', {k: 'vfade', c: ['#ffd23a', '#ff6f61']}],
    ['swirl', 'Swirl', 35, '', {k: 'swirl', c: ['#ffffff']}], ['mintdots', 'Mint dots', 25, '', {k: 'dots', c: ['#7ff0c8']}],
    ['gingham', 'Gingham', 30, '', {k: 'plaid', c: ['#ffffff', '#ffffff']}], ['bluebird', 'Bluebird', 30, '', {k: 'band', c: ['#2f7de1'], roof: '#2f7de1'}],
    ['dalmatian', 'Dalmatian', 35, '', {k: 'spots', c: ['#1f262b']}], ['peppermint', 'Peppermint', 30, '', {k: 'rings', c: ['#ff6b8b']}],
    ['ladybird', 'Ladybird', 45, '', {k: 'spots', c: ['#1f262b'], roof: '#e0483e'}], ['lavaflow', 'Lava flow', 50, '', {k: 'blobs', c: ['#ff6a2b', '#ffb347'], glow: '#ff6a2b'}],
    ['seafoam', 'Sea foam', 50, '', {k: 'clouds', c: ['#e9fbff'], glow: '#5ccbd4'}], ['koi', 'Koi', 55, '', {k: 'blobs', c: ['#ff6f3c', '#ffffff']}],
    ['goldpaws', 'Golden paws', 45, '', {k: 'paws', c: ['#ffd23a']}],
    ['northern', 'Northern lights', 0, 'U', {k: 'vfade', c: ['#4dffc3', '#7a5bff'], glow: '#4dffc3'}], ['twinkle', 'Twinkle', 0, 'U', {k: 'dots', c: ['#ffffff', '#7fe3ff'], big: 1, glow: '#7fe3ff'}],
    /* p51 Halloween */
    ['ghost', 'Ghost', 60, '', {k: 'ghost'}],
    /* p60 campaign reward */
    ['trophy', 'Trophy', 0, 'C', {k: 'star', c: ['#ffd23a', '#fffaf0'], roof: '#ffd23a', glow: '#ffd23a'}]
  ],
  house: [
    ['cabin', 'Log cabin', 35, '', {shape: 'box', roof: '#8a5a35', pat: 'logs', x: ['chimney']}], ['chalet', 'Alpine chalet', 40, '', {shape: 'box', roof: '#6b4a30', pat: 'ridge', x: ['chimney', 'flowers']}],
    ['yurt', 'Yurt', 35, '', {shape: 'round', roof: '#f1e6cf', pat: 'rings'}], ['burrow', 'Hillside burrow', 45, '', {shape: 'round', roof: '#7cbf5e', pat: 'garden', door: 'col', noTrim: 1}],
    ['greenhouse', 'Greenhouse', 40, '', {shape: 'box', roof: '#cfeef7', pat: 'glass'}], ['bungalow', 'Bungalow', 30, '', {shape: 'pill', roof: 'col', pat: 'tiles'}],
    ['teahouse', 'Teahouse', 55, '', {shape: 'pill', roof: '#3a4a3f', pat: 'shingle', x: ['lantern']}], ['ecodome', 'Eco dome', 50, '', {shape: 'dome', roof: '#e8f1f6', pat: 'rings'}],
    ['gardencottage', 'Garden cottage', 30, '', {shape: 'box', roof: 'col', pat: 'tiles', x: ['tree']}], ['solarhome', 'Solar home', 50, '', {shape: 'box', roof: '#ebebe6', pat: 'solar'}],
    ['seaside', 'Seaside villa', 60, '', {shape: 'box', roof: '#fbf8f1', pat: 'stripes', x: ['pool']}], ['farmhouse', 'Farmhouse', 30, '', {shape: 'box', roof: 'col', pat: 'ridge', x: ['chimney', 'tree']}],
    ['gingerbread', 'Gingerbread house', 0, 'U', {shape: 'box', roof: '#a0612e', pat: 'dots', acc: '#ffffff', x: ['flowers']}], ['observatory', 'Observatory', 0, 'U', {shape: 'dome', roof: '#cfd6dc', pat: 'slit', x: ['antenna']}],
    ['shellcottage', 'Shell cottage', 35, '', {shape: 'round', roof: '#f6e3d3', pat: 'scallop', acc: 'col'}], ['boathouse', 'Boathouse', 45, '', {shape: 'box', roof: '#5b7f95', pat: 'waves', acc: '#bfe7f5', x: ['umbrella']}],
    ['beehive', 'Beehive', 45, '', {shape: 'dome', roof: '#f2c14e', pat: 'honey'}], ['pavilion', 'Garden pavilion', 40, '', {shape: 'pill', roof: '#fbf8f1', pat: 'petals', acc: 'col', x: ['flowers']}],
    ['leafpod', 'Leafy pod', 35, '', {shape: 'round', roof: '#6fae55', pat: 'leaves', door: 'col'}], ['chequered', 'Chequered cottage', 30, '', {shape: 'box', roof: '#f4efe1', pat: 'checker', acc: 'col', x: ['chimney']}],
    ['snowcabin', 'Snowy cabin', 40, '', {shape: 'box', roof: '#7a5236', pat: 'logs', x: ['snow', 'chimney']}], ['bubblehouse', 'Bubble house', 55, '', {shape: 'dome', roof: '#cfeef7', pat: 'bubbles'}],
    ['terrace', 'Terrace garden', 50, '', {shape: 'box', roof: '#e9e4da', pat: 'terrace', acc: '#86c46a', x: ['umbrella']}], ['mintchip', 'Mint chip', 30, '', {shape: 'pill', roof: '#bff0dc', pat: 'chips', acc: '#6b4220', x: ['hedge']}],
    ['arched', 'Arched cottage', 50, '', {shape: 'box', roof: '#ffffff', pat: 'arcs'}], ['moonhouse', 'Moon house', 0, 'U', {shape: 'dome', roof: '#e8e6df', pat: 'craters', x: ['antenna']}],
    /* p40 designs */
    ['rainbowroof', 'Rainbow roof', 35, '', {shape: 'box', roof: '#f4efe1', pat: 'rainbow'}], ['lattice', 'Lattice cottage', 30, '', {shape: 'box', roof: '#e9e4da', pat: 'lattice', acc: 'col', x: ['chimney']}],
    ['mosaic', 'Mosaic house', 35, '', {shape: 'pill', roof: '#f4f2ec', pat: 'mosaic', acc: 'col'}], ['twill', 'Twill roof', 30, '', {shape: 'box', roof: 'col', pat: 'twill'}],
    ['porthole', 'Porthole house', 35, '', {shape: 'round', roof: '#dfe8ef', acc: 'col', x: ['portholes']}], ['balloonhouse', 'Balloon house', 40, '', {shape: 'box', roof: '#fbf8f1', pat: 'dots', acc: 'col', x: ['balloons']}],
    ['keep', 'Little keep', 40, '', {shape: 'box', roof: '#cfc8bb', pat: 'tiles', acc: 'col', x: ['turret']}], ['lemon', 'Lemon cottage', 25, '', {shape: 'pill', roof: '#fff3c4', pat: 'tiles'}],
    ['lilacdome', 'Lilac dome', 30, '', {shape: 'dome', roof: '#d9b8e8', pat: 'dots', acc: '#ffffff'}], ['peachpod', 'Peach pod', 25, '', {shape: 'round', roof: '#f6cdb4', pat: 'scallop', acc: 'col'}],
    ['arbour', 'Rose arbour', 40, '', {shape: 'box', roof: '#e9e4da', pat: 'lattice', acc: '#6fae55', x: ['flowers', 'hedge']}], ['parlour', 'Ice cream parlour', 55, '', {shape: 'pill', roof: '#ffd1e3', pat: 'rainbow', cols: ['#ffd1e3', '#fff3c4', '#c9eedc'], x: ['umbrella']}],
    ['starrydome', 'Starry dome', 50, '', {shape: 'dome', roof: '#1a1f3a', pat: 'dots', acc: '#fff1a8', x: ['antenna']}], ['sunsetdome', 'Sunset dome', 50, '', {shape: 'dome', roof: '#ff9f6a', pat: 'rainbow', cols: ['#ffd23a', '#ff9f6a', '#e3527a', '#8a4fb0']}],
    ['candyquilt', 'Candy quilt', 0, 'U', {shape: 'box', roof: '#fbf8f1', pat: 'mosaic', acc: 'col', cols: ['#ff6b8b', '#ffd23a', '#7fe3ff', '#3fd16a'], x: ['balloons']}], ['crystaldome', 'Crystal dome', 0, 'U', {shape: 'dome', roof: '#bfe8ff', pat: 'lattice', acc: '#ffffff', x: ['turret']}],
    /* p60 campaign reward */
    ['mayor', 'Mayor\u2019s hall', 0, 'C', {shape: 'box', roof: '#e9e4da', pat: 'arcs', acc: '#d4af37', x: ['turret', 'flowers']}]
  ],
  road: [
    ['midnight', 'Midnight', 35, '', {road: '#1d2a3a', edge: '#0d1520', lane: '#ffd23a'}], ['mint', 'Mint', 30, '', {road: '#bfe8d6', edge: '#4fa688', lane: '#ffffff'}],
    ['lavender', 'Lavender', 30, '', {road: '#cbbde8', edge: '#7a62b0', lane: '#ffffff'}], ['sandstone', 'Sandstone', 30, '', {road: '#dcc59a', edge: '#9c7f4e', lane: '#ffffff'}],
    ['slate', 'Slate', 25, '', {road: '#6b7b8c', edge: '#3a4652', lane: '#e3e9ee'}], ['terracotta', 'Terracotta', 35, '', {road: '#c1592c', edge: '#7a3216', lane: '#ffe0c2'}],
    ['ocean', 'Ocean', 40, '', {road: '#2a6f8f', edge: '#13405a', lane: '#bff3ff'}], ['forest', 'Forest track', 30, '', {road: '#6b7a4a', edge: '#3e4a26', lane: 'rgba(0,0,0,0)'}],
    ['chalk', 'Chalk', 25, '', {road: '#f4f1ea', edge: '#c9c3b5', lane: '#7d8790'}], ['rose', 'Rose', 50, '', {road: '#e8a5b0', edge: '#a0184f', lane: '#ffffff'}],
    ['ice', 'Ice', 55, '', {road: '#dff3fb', edge: '#7fc4e0', lane: '#ffffff'}], ['chocolate', 'Chocolate', 60, '', {road: '#54301c', edge: '#2a160c', lane: '#f0b26a'}],
    ['galaxy', 'Galaxy', 0, 'U', {road: '#1a0f3d', edge: '#c59bff', lane: '#fff1a8'}],
    ['peach', 'Peach', 30, '', {road: '#f6cdb4', edge: '#c97c5d', lane: '#ffffff'}], ['olive', 'Olive', 25, '', {road: '#8c8f5a', edge: '#565833', lane: '#f1ecc8'}],
    ['plum', 'Plum', 35, '', {road: '#5a3a6b', edge: '#2e1a3a', lane: '#ffd1f0'}], ['sky', 'Sky', 30, '', {road: '#bfe0f5', edge: '#5b9cc8', lane: '#ffffff'}],
    ['butter', 'Butter', 30, '', {road: '#f2e3a6', edge: '#b89a3a', lane: '#ffffff'}], ['teal', 'Teal', 35, '', {road: '#2f7a78', edge: '#174746', lane: '#c7fff5'}],
    ['blush', 'Blush', 30, '', {road: '#f3c9cf', edge: '#c06b7a', lane: '#ffffff'}], ['sage', 'Sage', 25, '', {road: '#b8c6a8', edge: '#6f8261', lane: '#ffffff'}],
    ['coral', 'Coral', 45, '', {road: '#ff9b85', edge: '#c4523c', lane: '#fff3e0'}], ['denim', 'Denim', 50, '', {road: '#3d5a80', edge: '#22324a', lane: '#e0fbfc'}],
    ['aurora', 'Aurora', 0, 'U', {road: '#10233a', edge: '#4dffc3', lane: '#c59bff'}],
    /* p40 designs */
    ['lemon', 'Lemon', 25, '', {road: '#fff0b0', edge: '#c9a227', lane: '#ffffff'}], ['lilac', 'Lilac', 30, '', {road: '#e3d6f3', edge: '#8f74c4', lane: '#ffffff'}],
    ['moss', 'Moss', 30, '', {road: '#7f9a6a', edge: '#4a6038', lane: '#f1f5e6'}], ['pebble', 'Pebble', 25, '', {road: '#cfc8bb', edge: '#8a8378', lane: '#ffffff'}],
    ['copper', 'Copper', 50, '', {road: '#b87a55', edge: '#6a3f26', lane: '#ffe6cc'}], ['seafoam', 'Sea foam', 30, '', {road: '#cdeee3', edge: '#4fa688', lane: '#ffffff'}],
    ['charcoal', 'Charcoal', 30, '', {road: '#3a3f45', edge: '#1d2024', lane: '#e3e9ee'}], ['mulberry', 'Mulberry', 45, '', {road: '#7a3b5e', edge: '#45203a', lane: '#ffd1f0'}],
    ['honey', 'Honey', 45, '', {road: '#e8b85a', edge: '#9a6f1c', lane: '#fff8e1'}],
    ['cherry', 'Cherry', 45, '', {road: '#c8102e', edge: '#7a1830', lane: '#ffffff'}], ['pearl', 'Pearl', 50, '', {road: '#f7f5f0', edge: '#c9c3ba', lane: '#d4af37', wet: '#ffffff'}],
    ['neonmint', 'Neon mint', 55, '', {road: '#10233a', edge: '#4dffc3', lane: '#ffffff'}],
    ['sunset', 'Sunset', 0, 'U', {road: '#2d1638', edge: '#ffa05c', lane: '#ffd23a'}], ['candyfloss', 'Candy floss', 0, 'U', {road: '#ffd1e3', edge: '#7fe3ff', lane: '#ffffff', wet: '#ffe4ee'}]
  ],
  store: [
    ['awning', 'Striped awning', 30, '', {base: '#fbf8f1', pat: 'stripes', acc: 'col'}], ['skylights', 'Skylights', 30, '', {base: '#c9ced2', pat: 'grid', acc: '#aee0f5'}],
    ['garden', 'Rooftop garden', 40, '', {base: '#6fae55', pat: 'garden'}], ['solar', 'Solar farm', 35, '', {base: '#d9dde0', pat: 'solar', acc: '#1f3552'}],
    ['pool', 'Rooftop pool', 55, '', {base: '#e9e4da', pat: 'pool', acc: '#5fc4e6'}], ['polka', 'Polka roof', 30, '', {base: 'dark', pat: 'dots', acc: '#ffffff'}],
    ['target', 'Target', 35, '', {base: '#f4efe1', pat: 'rings', acc: 'col'}], ['chequer', 'Chequer', 50, '', {base: '#2b3036', pat: 'checker', acc: 'col'}],
    ['terracotta', 'Terracotta', 30, '', {base: '#c1592c', pat: 'stripes', acc: '#d9774a'}], ['waves', 'Ocean waves', 40, '', {base: '#1a7ca6', pat: 'waves', acc: '#7fe3ff'}],
    ['mint', 'Mint', 25, '', {base: '#bff0dc', pat: 'dots', acc: '#4fd1a5'}], ['candy', 'Candy', 55, '', {base: '#ffd1e3', pat: 'stripes', acc: '#ff6fb5'}],
    ['golden', 'Golden roof', 0, 'U', {base: '#d4af37', pat: 'rings', acc: '#fff1a8'}],
    ['scales', 'Fish scales', 35, '', {base: '#e8f1f6', pat: 'scallop', acc: 'col'}], ['bubbles', 'Bubble roof', 30, '', {base: '#f4efe1', pat: 'bubbles', acc: 'col'}],
    ['confetti', 'Confetti', 35, '', {base: '#fbf8f1', pat: 'confetti', acc: 'col'}], ['courtyard', 'Courtyard', 50, '', {base: 'col', pat: 'courtyard', acc: '#f4efe1'}],
    ['daisies', 'Daisy roof', 40, '', {base: '#7cbf5e', pat: 'flowers', acc: 'col'}], ['lanes', 'Racing lanes', 35, '', {base: '#3e4448', pat: 'lanes', acc: 'col'}],
    ['cloudy', 'Cloudy sky', 30, '', {base: 'col', pat: 'clouds', acc: '#ffffff'}], ['tiles', 'Soft tiles', 25, '', {base: '#e9e4da', pat: 'tiles', acc: 'col'}],
    ['sundeck', 'Sun deck', 55, '', {base: '#c9a876', pat: 'sundeck', acc: 'col'}], ['jungle', 'Jungle roof', 45, '', {base: '#4f8d3f', pat: 'leaves', acc: 'col'}],
    ['nightdots', 'Midnight dots', 30, '', {base: '#1d2a3a', pat: 'dots', acc: 'col'}], ['bigtop', 'Big top', 0, 'U', {base: '#f4efe1', pat: 'bigtop', acc: 'col'}],
    /* p40 designs */
    ['mosaic', 'Mosaic roof', 35, '', {base: '#f4f2ec', pat: 'mosaic', acc: 'col'}], ['rainbow', 'Rainbow roof', 35, '', {base: '#fbf8f1', pat: 'rainbow', acc: 'col'}],
    ['spiral', 'Spiral roof', 30, '', {base: 'col', pat: 'spiral', acc: '#ffffff'}], ['bloom', 'Big bloom', 35, '', {base: '#7cbf5e', pat: 'bloom', acc: 'col'}],
    ['honeycomb', 'Honeycomb', 30, '', {base: '#f2c14e', pat: 'honey', acc: 'col'}], ['peachtiles', 'Peach tiles', 25, '', {base: '#f6cdb4', pat: 'tiles', acc: 'col'}],
    ['lilacdots', 'Lilac dots', 25, '', {base: '#d9b8e8', pat: 'dots', acc: '#ffffff'}], ['seafoam', 'Sea foam', 30, '', {base: '#bff0dc', pat: 'scallop', acc: 'col'}],
    ['teabox', 'Tea box', 30, '', {base: 'dark', pat: 'grid', acc: 'col'}],
    ['sunsetbands', 'Sunset bands', 45, '', {base: '#ff9f6a', pat: 'rainbow', cols: ['#ffd23a', '#ff9f6a', '#e3527a', '#8a4fb0'], acc: 'col'}], ['lagoonpool', 'Lagoon pool', 50, '', {base: '#e9e4da', pat: 'pool', acc: '#4fc6d6'}],
    ['nightbloom', 'Night bloom', 50, '', {base: '#1d2a3a', pat: 'bloom', acc: 'col'}], ['candymosaic', 'Candy mosaic', 55, '', {base: '#fbf8f1', pat: 'mosaic', acc: 'col', cols: ['#ff6b8b', '#ffd23a', '#7fe3ff', '#3fd16a']}],
    ['goldspiral', 'Golden spiral', 0, 'U', {base: '#d4af37', pat: 'spiral', acc: '#fff1a8'}], ['auroraroof', 'Aurora roof', 0, 'U', {base: '#10233a', pat: 'rainbow', cols: ['#3dffb0', '#2fd6ff', '#7a5bff', '#d65bff'], acc: 'col'}],
    /* p51 Halloween */
    ['batwing', 'Bat wing', 60, '', {base: '#2a1f3d', pat: 'batwing', acc: 'col'}]
  ],
  light: [
    ['mint', 'Mint', 25, '', {h: '#bff0dc', ring: '#4fa688'}], ['coral', 'Coral', 25, '', {h: '#ff8a75'}], ['sky', 'Sky', 25, '', {h: '#9fd5f2'}],
    ['lilac', 'Lilac', 25, '', {h: '#c9a3e0'}], ['cream', 'Cream', 25, '', {h: '#f4efe1', ring: '#c9c3b5'}], ['navy', 'Navy', 30, '', {h: '#25408f', shape: 'square'}],
    ['forest', 'Forest', 30, '', {h: '#2e7d32', shape: 'square'}], ['rose', 'Rose', 30, '', {h: '#e3799d', shape: 'pill'}], ['copper', 'Copper', 35, '', {h: '#b57a4a', ring: '#e0a878'}],
    ['chrome', 'Chrome', 40, '', {h: '#c9d3dc', ring: '#ffffff', shape: 'square'}], ['neonring', 'Neon ring', 50, '', {h: '#151a28', ring: '#00e1ff', glow: '#00e1ff'}],
    ['sunflower', 'Sunflower', 35, '', {h: '#ffd23a', ring: '#7a5a10'}], ['pebble', 'Pebble', 25, '', {h: '#9aa3a8', shape: 'pill'}], ['bubble', 'Bubble', 35, '', {h: '#9fd5f2', ring: '#ffffff', shape: 'pill'}],
    ['ember', 'Ember', 55, '', {h: '#3a1f18', ring: '#ff6a2b', glow: '#ff6a2b'}], ['candy', 'Candy', 50, '', {h: '#ff9ecb', ring: '#ffffff'}],
    ['halo', 'Halo', 0, 'U', {h: '#f4f2ec', ring: '#fff1a8', glow: '#ffffff'}], ['nightowl', 'Night owl', 0, 'U', {h: '#151a28', ring: '#ffd23a', glow: '#ffd23a', shape: 'pill'}],
    ['peach', 'Peach', 25, '', {h: '#ffc9a8'}], ['teal', 'Teal', 30, '', {h: '#2f7a78', ring: '#9fe3d9', shape: 'square'}], ['plum', 'Plum', 30, '', {h: '#5a3a6b', ring: '#d9b8e8', shape: 'pill'}],
    ['butter', 'Butter', 25, '', {h: '#f2e3a6', ring: '#b89a3a'}], ['daisy', 'Daisy', 40, '', {h: '#ffffff', ring: '#ffd23a', shape: 'flower'}], ['blossom', 'Blossom', 45, '', {h: '#ff9ecb', ring: '#ffffff', shape: 'flower'}],
    ['cloud', 'Cloud', 40, '', {h: '#f4f8fb', ring: '#9fd5f2', shape: 'cloud'}], ['storm', 'Storm cloud', 35, '', {h: '#5b6f86', ring: '#c9d3dc', shape: 'cloud'}], ['olive', 'Olive', 25, '', {h: '#8c8f5a', shape: 'pill'}],
    ['marine', 'Marine', 30, '', {h: '#1a7ca6', ring: '#7fe3ff', shape: 'square'}], ['studded', 'Studded', 50, '', {h: '#2b3036', ring: '#ffd23a', studs: '#ffd23a'}],
    ['sunburst', 'Sunburst', 0, 'U', {h: '#ffd23a', ring: '#ff9f1a', glow: '#ffb02e', shape: 'flower'}],
    /* p40 designs */
    ['lemon', 'Lemon', 25, '', {h: '#fff3c4', ring: '#e8c55a'}], ['sage', 'Sage', 25, '', {h: '#b8c6a8', ring: '#6f8261', shape: 'pill'}],
    ['denim', 'Denim', 30, '', {h: '#3d5a80', ring: '#a9c4e0', shape: 'square'}], ['coralring', 'Coral ring', 30, '', {h: '#ff8a75', shape: 'ring', ring: '#ffffff'}],
    ['pebbleblob', 'Pebble blob', 50, '', {h: '#9aa3a8', shape: 'blob', ring: '#e3e9ee'}], ['pearl', 'Pearl', 45, '', {h: '#f4f2ec', ring: '#ffffff', cap: 1}],
    ['lifebuoy', 'Life buoy', 45, '', {h: '#ffffff', shape: 'ring', dash: '#e0483e'}], ['mossy', 'Mossy', 25, '', {h: '#6fae55', shape: 'blob', ring: '#4f8d3f'}],
    ['bubblegum', 'Bubblegum', 45, '', {h: '#ff9ecb', shape: 'blob', cap: 1}], ['liquorice', 'Liquorice', 45, '', {h: '#2b3036', shape: 'ring', dash: '#ffffff'}],
    ['candystripe', 'Candy stripe', 45, '', {h: '#ffffff', shape: 'ring', dash: '#ff6b8b', ring: '#ff6b8b'}], ['lagoonglow', 'Lagoon glow', 50, '', {h: '#0e3b3e', ring: '#5ff2d0', glow: '#5ff2d0', shape: 'ring'}],
    ['moonstone', 'Moonstone', 50, '', {h: '#e8e6df', ring: '#c9c5ba', cap: 1, glow: '#ffffff', shape: 'blob'}],
    ['lifesaver', 'Spinning buoy', 0, 'U', {h: '#ffd23a', shape: 'ring', dash: '#e0483e', spin: 1, glow: '#ffd23a'}], ['cosmicring', 'Cosmic ring', 0, 'U', {h: '#1a0f3d', shape: 'ring', dash: '#c59bff', spin: 1, glow: '#c59bff'}]
  ],
  round: [
    ['rosegarden', 'Rose garden', 35, '', {fill: '#6fb35e', pat: 'petals', acc: '#ff6b8b', c2: '#ffd23a'}], ['sunflower', 'Sunflower', 35, '', {fill: '#86c46a', pat: 'petals', acc: '#ffd23a', c2: '#7a4a20'}],
    ['target', 'Target', 30, '', {fill: '#ffffff', pat: 'rings', acc: '#e0483e'}], ['pebbles', 'Pebbles', 25, '', {fill: '#cfc8bb', pat: 'dots', acc: ['#9a9389', '#b4ada1', '#e3ddd2']}],
    ['lawn', 'Lawn stripes', 25, '', {fill: '#6fb35e', pat: 'wedges', acc: ['#86c46a']}], ['spiral', 'Spiral', 40, '', {fill: '#f4efe1', pat: 'spiral', acc: '#2f7de1'}],
    ['oak', 'Oak tree', 35, '', {fill: '#6fb35e', pat: 'tree'}], ['koi', 'Koi pond', 45, '', {fill: '#7cc9a6', pat: 'water', acc: '#ff9f1a'}],
    ['lavender', 'Lavender', 30, '', {fill: '#6fb35e', pat: 'dots', acc: ['#a58bdb', '#c9a3e0']}], ['beachball', 'Beach ball', 50, '', {fill: '#ffffff', pat: 'wedges', acc: ['#e0483e', '#2f7de1', '#ffd23a', '#2fa66a']}],
    ['pizza', 'Pizza', 55, '', {fill: '#f0b26a', pat: 'wedges', acc: ['#e8c06a'], dots: '#c8102e'}], ['compass', 'Compass', 40, '', {fill: '#f4efe1', pat: 'wedges', acc: ['#25408f']}],
    ['snowglobe', 'Snow globe', 50, '', {fill: '#e8f1f6', pat: 'rings', acc: '#9fd5f2', dots: '#ffffff'}], ['lilypads', 'Lily pads', 35, '', {fill: '#7cc9a6', pat: 'water', acc: '#4f9b4f'}],
    ['mosaic', 'Mosaic', 0, 'U', {fill: '#f4efe1', pat: 'dots', acc: ['#e0483e', '#2f7de1', '#ffd23a', '#2fa66a', '#8a5bd6', '#16a2b8']}], ['galaxy', 'Galaxy', 0, 'U', {fill: '#1a0f3d', pat: 'spiral', acc: '#c59bff', dots: '#ffffff'}],
    ['zengarden', 'Zen garden', 35, '', {fill: '#e9e1cf', pat: 'zen', acc: '#b4ab9b'}], ['donut', 'Donut', 45, '', {fill: '#f2b8cf', pat: 'donut', acc: ['#ffffff', '#ffd23a', '#7fe3ff', '#3fd16a'], c2: '#c98a4a'}],
    ['citrus', 'Citrus', 35, '', {fill: '#ffb347', pat: 'citrus', acc: '#fff1d6', c2: '#ffcf5c'}], ['watermelon', 'Watermelon', 50, '', {fill: '#ff6b7a', pat: 'melon', acc: '#2f7d32', c2: '#1f262b'}],
    ['hedgering', 'Hedge ring', 30, '', {fill: '#86c46a', pat: 'hedge', acc: '#4f8d3f', c2: '#6fb35e'}], ['bullseye', 'Bullseye', 25, '', {fill: '#ffd23a', pat: 'bands', acc: ['#e0483e', '#ffffff']}],
    ['stepping', 'Stepping stones', 30, '', {fill: '#6fb35e', pat: 'stones', acc: ['#cfc8bb', '#b4ada1']}], ['fullmoon', 'Full moon', 45, '', {fill: '#e8e6df', pat: 'craters', acc: '#c9c5ba', c2: '#d8d5cc'}],
    ['balance', 'Balance', 40, '', {fill: '#f4efe1', pat: 'yinyang', acc: '#2b3036'}], ['cookie', 'Cookie', 30, '', {fill: '#d9a066', pat: 'dots', acc: ['#5a3418', '#6b4220']}],
    ['clock', 'Clock', 55, '', {fill: '#ffffff', pat: 'clock', acc: '#2b3036', c2: '#e0483e'}], ['flowerbed', 'Flower bed', 35, '', {fill: '#6fb35e', pat: 'flowerbed', acc: ['#ff6b8b', '#ffffff', '#b07bff'], c2: '#ffd23a'}],
    ['planet', 'Ringed planet', 0, 'U', {fill: '#1a0f3d', pat: 'planet', acc: '#f0b26a', c2: '#ffd9a8', dots: '#ffffff'}],
    /* p40 designs */
    ['maze', 'Hedge maze', 35, '', {fill: '#86c46a', pat: 'maze', acc: '#4f8d3f'}], ['bubblepool', 'Bubble pool', 30, '', {fill: '#5fb4d6', pat: 'bubbles', acc: '#ffffff'}],
    ['ripple', 'Ripple pond', 30, '', {fill: '#7cc9a6', pat: 'ripple', acc: '#e9fbff'}], ['tyre', 'Tyre', 25, '', {fill: '#2b3036', pat: 'tyre', acc: '#9aa3a8'}],
    ['peachrings', 'Peach rings', 25, '', {fill: '#f6cdb4', pat: 'rings', acc: '#ffffff'}], ['lilacbed', 'Lilac bed', 30, '', {fill: '#6fb35e', pat: 'flowerbed', acc: ['#d9b8e8', '#ffffff', '#a58bdb'], c2: '#ffd23a'}],
    ['sandcircle', 'Sand circle', 25, '', {fill: '#efe3c8', pat: 'zen', acc: '#c9a876'}], ['lemonslice', 'Lemon slice', 45, '', {fill: '#ffe066', pat: 'citrus', acc: '#fff7c2', c2: '#ffef9a'}],
    ['berrypie', 'Berry pie', 35, '', {fill: '#d9a066', pat: 'wedges', acc: ['#a0184f'], dots: '#ffffff'}],
    ['lavapool', 'Lava pool', 50, '', {fill: '#2a1714', pat: 'bubbles', acc: '#ff6a2b'}], ['icerink', 'Ice rink', 45, '', {fill: '#dff3fb', pat: 'ripple', acc: '#ffffff'}],
    ['racering', 'Race ring', 45, '', {fill: '#3e4448', pat: 'tyre', acc: '#ffffff'}],
    ['goldmaze', 'Golden maze', 0, 'U', {fill: '#d4af37', pat: 'maze', acc: '#fff1a8'}], ['nebula', 'Nebula', 0, 'U', {fill: '#1a0f3d', pat: 'ripple', acc: '#c59bff', dots: '#ffffff'}],
    /* p60 campaign reward */
    ['medal', 'Medal', 0, 'C', {fill: '#d4af37', pat: 'bands', acc: ['#fff1a8', '#b8901c']}]
  ],
  bridge: [
    ['mint', 'Mint rails', 30, '', ['#4fd1a5', '#bff0dc', '#2a9670']], ['cherry', 'Cherry', 35, '', ['#c8102e', '#ff8a75', '#7a1830']], ['ocean', 'Ocean', 35, '', ['#1a7ca6', '#7fe3ff', '#0d5f82']],
    ['sandstone', 'Sandstone', 30, '', ['#c9a876', '#efe3c8', '#8d6d48']], ['slate', 'Slate', 25, '', ['#5b6f86', '#9fb3c2', '#3a4a5a']], ['bamboo', 'Bamboo', 40, '', ['#93c47d', '#5f7a35', '#4e7a4a']],
    ['copper', 'Copper', 40, '', ['#b57a4a', '#e0a878', '#6a2c20']], ['lilac', 'Lilac', 30, '', ['#a58bdb', '#e9e1f5', '#5c2f8e']], ['candycane', 'Candy cane', 55, '', ['#ffffff', '#e0483e', '#c8102e']],
    ['night', 'Night', 50, '', ['#151a28', '#ffd23a', '#0b0f1f']], ['marble', 'Marble', 35, '', ['#e9e6e1', '#a59f96', '#c9c3ba']], ['jungle', 'Jungle vines', 40, '', ['#2e7d32', '#8cc63f', '#215030']],
    ['gold', 'Gold', 0, 'U', ['#d4af37', '#fff1a8', '#8f6d10']], ['lava', 'Lava', 0, 'U', ['#2a1714', '#ff5a1a', '#ff8a3a']],
    ['peach', 'Peach', 30, '', ['#f6b89a', '#ffe6d6', '#c97c5d']], ['teal', 'Teal', 35, '', ['#2f7a78', '#9fe3d9', '#174746']], ['plum', 'Plum', 35, '', ['#5a3a6b', '#d9b8e8', '#2e1a3a']],
    ['lemon', 'Lemon', 30, '', ['#ffe066', '#fff7c2', '#c9a227']], ['denim', 'Denim', 25, '', ['#3d5a80', '#98c1d9', '#22324a']],
    ['pebble', 'Pebble rails', 30, '', Object.assign(['#9aa3a8', '#e3e9ee', '#6b7378'], {k: 'beads', gap: 9})], ['mintchip', 'Mint chip', 35, '', Object.assign(['#bff0dc', '#6b4220', '#7fd1b0'], {k: 'beads', gap: 7})],
    ['pearl', 'Pearl', 50, '', Object.assign(['#f4f2ec', '#ffffff', '#c9c3ba'], {k: 'beads', gap: 7})], ['garland', 'Flower garland', 55, '', Object.assign(['#4f8d3f', '#86c46a', '#3f7a35'], {k: 'flowers', c: ['#ff6b8b', '#ffd23a', '#ffffff']})],
    ['lanterns', 'Lantern rails', 50, '', Object.assign(['#3a2a22', '#ffb347', '#2a1d17'], {k: 'beads', gap: 16, glow: '#ffb347'})], ['cotton', 'Cotton candy', 40, '', Object.assign(['#ffd1e3', '#ffffff', '#f5b8d0'], {k: 'flowers', c: ['#ffffff', '#9fd5f2']})],
    ['seaside', 'Seaside stripes', 35, '', Object.assign(['#ffffff', '#2f7de1', '#dfe8f2'], {k: 'bands'})], ['starlight', 'Starlight', 0, 'U', Object.assign(['#151a28', '#fff1a8', '#0b0f1f'], {k: 'beads', gap: 10, glow: '#fff1a8'})],
    /* p40 designs */
    ['lilaclinks', 'Lilac links', 30, '', Object.assign(['#a58bdb', '#e9e1f5', '#7a5fb0'], {k: 'links'})], ['peachlinks', 'Peach links', 30, '', Object.assign(['#f6b89a', '#fff1e6', '#c97c5d'], {k: 'links'})],
    ['sagerail', 'Sage rail', 25, '', Object.assign(['#b8c6a8', '#ffffff', '#6f8261'], {k: 'twinrail'})], ['butterrail', 'Butter rail', 25, '', Object.assign(['#f2e3a6', '#ffffff', '#b89a3a'], {k: 'twinrail'})],
    ['chain', 'Chain rail', 45, '', Object.assign(['#5b6f86', '#c9d3dc', '#3a4a5a'], {k: 'chain'})], ['coralchain', 'Coral chain', 45, '', Object.assign(['#ff8a75', '#ffd9d0', '#c4523c'], {k: 'chain'})],
    ['olive', 'Olive', 25, '', ['#8c8f5a', '#f1ecc8', '#565833']], ['rose', 'Rose', 30, '', ['#e8a5b0', '#fff0f3', '#a0184f']], ['sky', 'Sky', 45, '', ['#9fd5f2', '#ffffff', '#5b9cc8']],
    ['pearlchain', 'Pearl chain', 50, '', Object.assign(['#f4f2ec', '#ffffff', '#c9c3ba'], {k: 'chain', glow: '#ffffff'})], ['neonlinks', 'Neon links', 55, '', Object.assign(['#151a28', '#00e1ff', '#0b0f1f'], {k: 'links', glow: '#00e1ff'})],
    ['icerail', 'Ice rail', 45, '', Object.assign(['#dff3fb', '#ffffff', '#7fc4e0'], {k: 'twinrail'})],
    ['goldchain', 'Gold chain', 0, 'U', Object.assign(['#d4af37', '#fff1a8', '#8f6d10'], {k: 'chain', glow: '#ffd23a'})], ['auroralinks', 'Aurora links', 0, 'U', Object.assign(['#10233a', '#4dffc3', '#0b0f1f'], {k: 'links', glow: '#4dffc3'})]
  ],
  moto: [
    ['mint', 'Mint', 30, '', ['#bff0dc', '#4fd1a5']], ['peach', 'Peach', 30, '', ['#ffd9c2', '#f0b26a']], ['ocean', 'Ocean', 35, '', ['#7fe3ff', '#1a7ca6', '#0d5f82']],
    ['forest', 'Forest', 30, '', ['#86c46a', '#2e7d32']], ['berry', 'Berry', 35, '', ['#ff8fb1', '#a0184f']], ['lilac', 'Lilac', 30, '', ['#e9e1f5', '#a58bdb']],
    ['sand', 'Sand', 25, '', ['#efe3c8', '#c9a876']], ['slate', 'Slate', 25, '', ['#9fb3c2', '#5b6f86']], ['candy', 'Candy', 50, '', ['#ffffff', '#ff9ecb', '#ffffff']],
    ['tropical', 'Tropical', 55, '', ['#ffd23a', '#3fbfad', '#1a7ca6']], ['ember', 'Ember', 55, '', ['#ffcf5c', '#ff6a2b', '#8a1a10']], ['neonnight', 'Neon night', 45, '', ['#ff3df2', '#151a28', '#00e1ff']],
    ['chalk', 'Chalk', 25, '', ['#f4efe1', '#e3e9ee']], ['gold', 'Gold', 0, 'U', ['#fff1a8', '#d4af37', '#8f6d10']], ['galaxy', 'Galaxy', 0, 'U', ['#c59bff', '#5b2bff', '#1a0f3d']],
    ['coral', 'Coral', 30, '', ['#ffb4a2', '#e5737a']], ['teal', 'Teal', 30, '', ['#9fe3d9', '#2f7a78']], ['butter', 'Butter', 25, '', ['#fff3c4', '#e8c55a']],
    ['plum', 'Plum', 35, '', ['#d9b8e8', '#5a3a6b']], ['denim', 'Denim', 30, '', ['#a9c4e0', '#3d5a80', '#22324a']], ['pastel', 'Pastel ribbon', 35, '', ['#ffd1e3', '#c9eedc', '#bfe0f5']],
    ['lagoon', 'Lagoon', 40, '', ['#bff3ff', '#5ccbd4', '#1a7ca6']], ['citrus', 'Citrus', 45, '', ['#fff1a8', '#ffb347', '#ff6f61']],
    ['catseye', 'Cat\u2019s eyes', 35, '', Object.assign(['#5a656e', '#3a4249'], {k: 'dots', x: '#ffd23a'})], ['pebbledash', 'Pebble dash', 30, '', Object.assign(['#cfc8bb', '#9a9389'], {k: 'dots', x: '#f4efe1'})],
    ['runway', 'Runway lights', 50, '', Object.assign(['#2b3240', '#1c2230'], {k: 'edge', x: '#7fe3ff'})], ['verge', 'Wildflower verge', 55, '', Object.assign(['#a8d88e', '#6fb35e'], {k: 'flowers', x: ['#ff6b8b', '#ffd23a', '#ffffff']})],
    ['starlit', 'Starlit', 0, 'U', Object.assign(['#1a0f3d', '#0b0f1f'], {k: 'edge', x: '#fff1a8', glow: 1})],
    /* p40 designs */
    ['sagerails', 'Sage rails', 30, '', Object.assign(['#b8c6a8', '#8ea07e'], {k: 'rails', x: '#ffffff'})], ['peachcentre', 'Peach centre', 30, '', Object.assign(['#ffd9c2', '#f0b26a'], {k: 'centre', x: '#ffffff'})],
    ['lilacpills', 'Lilac pills', 30, '', Object.assign(['#e9e1f5', '#a58bdb'], {k: 'pills', x: '#ffffff'})], ['olive', 'Olive', 25, '', ['#c8cb9a', '#8c8f5a']],
    ['rose', 'Rose', 30, '', ['#f3c9cf', '#e8a5b0', '#a0184f']], ['sky', 'Sky', 25, '', ['#dff3fb', '#9fd5f2']],
    ['mintrails', 'Mint rails', 30, '', Object.assign(['#bff0dc', '#4fd1a5'], {k: 'rails', x: '#2a9670'})], ['sandpills', 'Sand pills', 30, '', Object.assign(['#efe3c8', '#c9a876'], {k: 'pills', x: '#fff7e6'})],
    ['cherrycentre', 'Cherry centre', 45, '', Object.assign(['#ff8a75', '#c8102e'], {k: 'centre', x: '#ffffff'})],
    ['nightrails', 'Night rails', 50, '', Object.assign(['#2b3240', '#1c2230'], {k: 'rails', x: '#ffd23a', glow: 1})], ['icepills', 'Ice pills', 45, '', Object.assign(['#dff3fb', '#7fc4e0'], {k: 'pills', x: '#ffffff'})],
    ['rainbowcentre', 'Rainbow centre', 50, '', Object.assign(['#f4efe1', '#e3e9ee'], {k: 'centre', x: ['#ff4d4d', '#ffd23a', '#3fd16a', '#2f9bff']})],
    ['goldrails', 'Gold rails', 0, 'U', Object.assign(['#fff1a8', '#d4af37', '#8f6d10'], {k: 'rails', x: '#fff8d0', glow: 1})], ['neonpills', 'Neon pills', 0, 'U', Object.assign(['#151a28', '#0b0f1f'], {k: 'pills', x: '#ff3df2', glow: 1})]
  ]
};
/* p61 drone skins: body colour, rotor colour and a pattern (nose / dots / band / stripe / glow) */
GEN.drone = [
  ['snow', 'Snow', 25, '', {body: '#ffffff', rotor: '#9fb3c2', k: 'band', c: '#dfe8f2'}], ['mint', 'Mint', 25, '', {body: '#bff0dc', rotor: '#2a9670', k: 'nose'}],
  ['peach', 'Peach', 25, '', {body: '#ffd9c2', rotor: '#c97c5d', k: 'nose'}], ['lilac', 'Lilac', 25, '', {body: '#e9e1f5', rotor: '#8a5bd6', k: 'nose'}],
  ['sky', 'Sky', 25, '', {body: '#dff3fb', rotor: '#5b9cc8', k: 'nose'}], ['butter', 'Butter', 25, '', {body: '#fff3c4', rotor: '#b89a3a', k: 'nose'}],
  ['slate', 'Slate', 25, '', {body: '#5b6f86', rotor: '#c9d3dc', k: 'stripe', c: '#9fb3c2'}], ['charcoal', 'Charcoal', 30, '', {body: '#3a4046', rotor: '#ffd23a', k: 'dots', c: '#ffd23a'}],
  ['polka', 'Polka dots', 30, '', {body: '#f4f2ec', rotor: '#e0483e', k: 'dots', c: '#e0483e'}], ['bluebird', 'Bluebird', 30, '', {body: '#2f7de1', rotor: '#dff3fb', k: 'band', c: '#ffffff'}],
  ['ladybird', 'Ladybird', 35, '', {body: '#e0483e', rotor: '#1f262b', k: 'dots', c: '#1f262b'}], ['bumble', 'Bumblebee', 35, '', {body: '#ffd23a', rotor: '#1f262b', k: 'band', c: '#1f262b'}],
  ['coral', 'Coral', 30, '', {body: '#ff8a75', rotor: '#ffffff', k: 'stripe', c: '#ffd9d0'}], ['teal', 'Teal', 30, '', {body: '#16a2b8', rotor: '#bff0dc', k: 'stripe', c: '#ffffff'}],
  ['olive', 'Olive', 25, '', {body: '#8c8f5a', rotor: '#f1ecc8', k: 'nose'}], ['rose', 'Rose', 30, '', {body: '#e8a5b0', rotor: '#a0184f', k: 'dots', c: '#ffffff'}],
  ['denim', 'Denim', 30, '', {body: '#3d5a80', rotor: '#98c1d9', k: 'band', c: '#98c1d9'}], ['sand', 'Sand', 25, '', {body: '#efe3c8', rotor: '#c9a876', k: 'stripe', c: '#c9a876'}],
  ['forest', 'Forest', 30, '', {body: '#2e7d32', rotor: '#93c47d', k: 'nose'}], ['plum', 'Plum', 35, '', {body: '#5a3a6b', rotor: '#d9b8e8', k: 'dots', c: '#d9b8e8'}],
  ['pistachio', 'Pistachio', 30, '', {body: '#93c47d', rotor: '#2e5a24', k: 'band', c: '#f4efe1'}], ['tangerine', 'Tangerine', 30, '', {body: '#e88a0e', rotor: '#fff1a8', k: 'stripe', c: '#fff1a8'}],
  ['pearl', 'Pearl', 40, '', {body: '#f3efe6', rotor: '#c9c3ba', k: 'band', c: '#ffffff'}], ['copper', 'Copper', 35, '', {body: '#b57a4a', rotor: '#e0a878', k: 'stripe', c: '#6a2c20'}],
  ['lagoon', 'Lagoon', 35, '', {body: '#1a9a9a', rotor: '#bff3ff', k: 'dots', c: '#bff3ff'}], ['raspberry', 'Raspberry', 35, '', {body: '#a0184f', rotor: '#ff9ecb', k: 'band', c: '#ff9ecb'}],
  ['midnight', 'Midnight', 40, '', {body: '#1c2050', rotor: '#8a94e6', k: 'dots', c: '#ffffff'}], ['chalk', 'Chalk', 25, '', {body: '#e3e9ee', rotor: '#7d8790', k: 'nose'}],
  ['mocha', 'Mocha', 30, '', {body: '#8a7060', rotor: '#f6b89a', k: 'stripe', c: '#54301c'}], ['kelly', 'Kelly green', 30, '', {body: '#2e9e44', rotor: '#ffffff', k: 'band', c: '#ffffff'}],
  ['neon', 'Neon', 55, '', {body: '#151a28', rotor: '#22e6ff', k: 'glow', c: '#22e6ff'}], ['pinkglow', 'Pink glow', 55, '', {body: '#2a1a33', rotor: '#ff3df2', k: 'glow', c: '#ff3df2'}],
  ['ember', 'Ember', 50, '', {body: '#3a1f18', rotor: '#ff6a2b', k: 'glow', c: '#ff6a2b'}], ['sunrise', 'Sunrise', 45, '', {body: '#ff8a5c', rotor: '#ffd23a', k: 'band', c: '#ffd23a'}],
  ['candycane', 'Candy cane', 50, '', {body: '#ffffff', rotor: '#c8102e', k: 'stripe', c: '#e0483e'}], ['tiger', 'Tiger', 45, '', {body: '#f0a81c', rotor: '#1f262b', k: 'stripe', c: '#1f262b'}],
  ['icecream', 'Ice cream', 45, '', {body: '#ffd1e3', rotor: '#6b4220', k: 'dots', c: '#6b4220'}], ['royal', 'Royal', 50, '', {body: '#221a4c', rotor: '#d4af37', k: 'band', c: '#d4af37'}],
  ['arctic', 'Arctic', 45, '', {body: '#bff3ff', rotor: '#ffffff', k: 'glow', c: '#bff3ff'}], ['lava', 'Lava', 55, '', {body: '#2a1714', rotor: '#ff5a1a', k: 'stripe', c: '#ffc23a'}],
  ['firefly', 'Firefly', 50, '', {body: '#1f3a2a', rotor: '#fff1a8', k: 'glow', c: '#ffd23a'}], ['seafoam', 'Sea foam', 45, '', {body: '#3fbfad', rotor: '#e9fbff', k: 'dots', c: '#e9fbff'}],
  ['honey', 'Honey', 45, '', {body: '#f2c511', rotor: '#8d5a35', k: 'dots', c: '#8d5a35'}], ['orchid', 'Orchid', 50, '', {body: '#b755c9', rotor: '#f6dfe6', k: 'glow', c: '#c9a3e0'}],
  ['chrome', 'Chrome', 60, '', {body: '#c9d3dc', rotor: '#3a4046', k: 'stripe', c: '#ffffff'}],
  ['gold', 'Gold', 0, 'U', {body: '#d4af37', rotor: '#fff1a8', k: 'glow', c: '#ffd23a'}], ['galaxy', 'Galaxy', 0, 'U', {body: '#1a0f3d', rotor: '#c59bff', k: 'dots', c: '#ffffff'}],
  ['aurora', 'Aurora', 0, 'U', {body: '#0e1b2e', rotor: '#3dffb0', k: 'glow', c: '#4dffc3'}], ['toxic', 'Toxic', 0, 'U', {body: '#2a3a1a', rotor: '#7dff3a', k: 'glow', c: '#7dff3a'}],
  ['starlight', 'Starlight', 0, 'U', {body: '#e8e4ff', rotor: '#8a5bff', k: 'dots', c: '#8a5bff'}]
];
const GEN_P = {}; for (const c in GEN) { GEN_P[c] = {}; for (const e of GEN[c]) GEN_P[c][e[0]] = e[4]; }
/* a generated house: one rounded body (box, pill, round or dome), a roof pattern, a trim in the house's colour, a door and a few extras */
function houseGen(p, b, col, model) {
  const C = v => v === 'col' ? col : v === 'dark' ? shade(col, -0.35) : v === 'light' ? shade(col, 0.35) : v;
  const roof = C(p.roof), acc = C(p.acc || 'col'), round = p.shape === 'round' || p.shape === 'dome';
  const body = () => { if (round) { ctx.beginPath(); ctx.arc(0, -5, 9.5, 0, 6.3); } else if (p.shape === 'pill') rr(-11.5, -11.5, 23, 13, 6.5); else rr(-11, -13, 22, 16, 4); };
  const dot = (x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill(); };
  body();
  if (p.shape === 'dome') { const gr = ctx.createRadialGradient(-3, -8, 1, 0, -5, 10); gr.addColorStop(0, shade(roof, 0.25)); gr.addColorStop(1, shade(roof, -0.15)); ctx.fillStyle = gr; } else ctx.fillStyle = roof;
  ctx.fill();
  ctx.save(); body(); ctx.clip();
  const pt = p.pat;
  if (pt === 'tiles') { ctx.fillStyle = shade(roof, -0.14); for (let y = -12, j = 0; y < 4; y += 2.4, j++) for (let x = -12 + (j % 2) * 1.2; x < 12; x += 2.4) { ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI); ctx.fill(); } }
  else if (pt === 'stripes') { ctx.fillStyle = acc; for (let x = -11; x < 11; x += 3.4) sfr(x, -14, 1.7, 18); }
  else if (pt === 'rings') { ctx.strokeStyle = acc; ctx.lineWidth = 1.1; for (const r_ of [3, 6.2]) { ctx.beginPath(); if (round) ctx.arc(0, -5, r_, 0, 6.3); else rr(-r_ * 1.5, -5 - r_, r_ * 3, r_ * 2, r_); ctx.stroke(); } }
  else if (pt === 'garden') { for (let i = 0; i < 16; i++) dot(-9 + hash01(i, 31) * 18, -13 + hash01(i, 32) * 16, 1 + hash01(i, 33) * 1.4, i % 3 ? '#86c46a' : '#4f8d3f'); for (let i = 0; i < 5; i++) dot(-7 + hash01(i, 34) * 14, -11 + hash01(i, 35) * 12, 0.6, ['#ff6b8b', '#ffd23a', '#ffffff'][i % 3]); }
  else if (pt === 'solar') { ctx.fillStyle = '#1f3552'; for (let y = -11; y < 0; y += 4) for (let x = -9; x < 9; x += 6) sfr(x, y, 5, 3); }
  else if (pt === 'logs') { for (let y = -12.5, i = 0; y < 3; y += 2, i++) { ctx.fillStyle = i % 2 ? shade(roof, 0.12) : shade(roof, -0.1); sfr(-11, y, 22, 1.6); } }
  else if (pt === 'dots') { for (let y = -11, j = 0; y < 2; y += 3.2, j++) for (let x = -9 + (j % 2) * 1.6; x < 10; x += 3.2) dot(x, y, 0.75, acc); }
  else if (pt === 'glass') { ctx.fillStyle = 'rgba(255,255,255,.55)'; for (let y = -12; y < 2; y += 4) for (let x = -10; x < 10; x += 5) sfr(x, y, 4.2, 3.2); }
  else if (pt === 'shingle') { ctx.fillStyle = shade(roof, 0.12); for (let y = -11, j = 0; y < 1; y += 2.6, j++) for (let x = -11 + (j % 2) * 1.6; x < 11; x += 3.2) sfr(x, y, 2.6, 1.8); }
  else if (pt === 'ridge') { ctx.fillStyle = shade(roof, 0.14); ctx.fillRect(-12, -14, 24, 9); ctx.fillStyle = 'rgba(255,255,255,.5)'; sfr(-10.5, -5.6, 21, 0.8); }
  else if (pt === 'slit') { ctx.fillStyle = '#2b3036'; sfr(-1.4, -14, 2.8, 9); dot(0, -5, 1.6, '#2b3036'); }
  else if (pt === 'scallop') { ctx.strokeStyle = acc; ctx.lineWidth = 0.5; for (let y = 5, j = 0; y > -16; y -= 1.7, j++) { ctx.fillStyle = j % 2 ? shade(roof, -0.07) : roof; ctx.beginPath(); for (let x = -13 + (j % 2) * 1.6; x < 13; x += 3.2) { ctx.moveTo(x + 1.75, y); ctx.arc(x, y, 1.75, 0, 6.3); } ctx.fill(); ctx.stroke(); } }
  else if (pt === 'waves') { ctx.strokeStyle = acc; ctx.lineWidth = 0.9; ctx.lineCap = 'round'; ctx.beginPath(); for (let y = -12; y < 4; y += 3) for (let x = -12; x <= 12.01; x += 0.8) { const yy = y + Math.sin(x * 0.9) * 0.7; x === -12 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); } ctx.stroke(); }
  else if (pt === 'honey') { const hx = (fn) => { for (let y = -14, j = 0; y < 4; y += 2.3, j++) for (let x = -12 + (j % 2) * 1.35; x < 12; x += 2.7) fn(x, y); }; ctx.fillStyle = shade(roof, -0.16); ctx.beginPath(); hx((x, y) => { ctx.moveTo(x + 1.05, y); ctx.arc(x, y, 1.05, 0, 6.3); }); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); hx((x, y) => { ctx.moveTo(x - 0.1, y - 0.4); ctx.arc(x - 0.4, y - 0.4, 0.3, 0, 6.3); }); ctx.fill(); }
  else if (pt === 'petals') { ctx.fillStyle = acc; for (let i = 0; i < 8; i++) { const a = i * 0.785; ctx.beginPath(); ctx.ellipse(Math.cos(a) * 4.4, -5 + Math.sin(a) * 4.4, 3.2, 1.8, a, 0, 6.3); ctx.fill(); } dot(0, -5, 2.1, '#ffd23a'); dot(-0.5, -5.5, 0.8, 'rgba(255,255,255,.5)'); }
  else if (pt === 'leaves') { for (let i = 0; i < 22; i++) { ctx.fillStyle = [shade(roof, -0.15), shade(roof, 0.14), roof][i % 3]; ctx.beginPath(); ctx.ellipse(-10 + hash01(i, 142) * 20, -14 + hash01(i, 143) * 17, 2.3, 1.1, hash01(i, 141) * 6.3, 0, 6.3); ctx.fill(); } }
  else if (pt === 'checker') { ctx.fillStyle = acc; for (let y = -13, j = 0; y < 4; y += 3, j++) for (let x = -12 + (j % 2) * 3; x < 12; x += 6) sfr(x + 0.25, y + 0.25, 2.5, 2.5); }
  else if (pt === 'bubbles') { ctx.lineWidth = 0.55; ctx.strokeStyle = 'rgba(255,255,255,.9)'; for (let i = 0; i < 9; i++) { const bx = -7.5 + hash01(i, 151) * 15, by = -12.5 + hash01(i, 152) * 13, br = 1 + hash01(i, 153) * 1.8; ctx.fillStyle = rgba(acc, 0.35); ctx.beginPath(); ctx.arc(bx, by, br, 0, 6.3); ctx.fill(); ctx.stroke(); dot(bx - br * 0.35, by - br * 0.35, br * 0.25, 'rgba(255,255,255,.85)'); } }
  else if (pt === 'terrace') { for (let y = -13, i = 0; y < 4; y += 3.2, i++) { ctx.fillStyle = i % 2 ? shade(roof, -0.08) : roof; sfr(-12, y, 24, 3.2); ctx.fillStyle = acc; ctx.beginPath(); for (let x = -9 + (i % 2) * 2; x < 10; x += 4) { ctx.moveTo(x + 0.9, y + 1.6); ctx.arc(x, y + 1.6, 0.9, 0, 6.3); } ctx.fill(); } }
  else if (pt === 'chips') { ctx.fillStyle = acc; ctx.beginPath(); for (let i = 0; i < 16; i++) { const cx = -10 + hash01(i, 161) * 20, cy = -13 + hash01(i, 162) * 15, a = hash01(i, 163) * 3; ctx.moveTo(cx + Math.cos(a) * 0.75, cy + Math.sin(a) * 0.75); ctx.ellipse(cx, cy, 0.75, 0.45, a, 0, 6.3); } ctx.fill(); }
  else if (pt === 'arcs') { const cs_ = [shade(col, 0.55), shade(col, 0.3), col, shade(col, -0.2)]; ctx.lineWidth = 2.3; ctx.lineCap = 'round'; for (let i = 0; i < 4; i++) { ctx.strokeStyle = cs_[i]; ctx.beginPath(); ctx.arc(0, 4.5, 13.5 - i * 2.4, Math.PI, 0); ctx.stroke(); } }
  else if (pt === 'craters') { for (let i = 0; i < 6; i++) { const cx = -6.5 + hash01(i, 171) * 13, cy = -11.5 + hash01(i, 172) * 12, cr = 0.9 + hash01(i, 173) * 1.5; dot(cx, cy, cr, shade(roof, -0.15)); dot(cx + cr * 0.22, cy + cr * 0.22, cr * 0.68, shade(roof, -0.05)); } }
  else if (pt === 'lattice') { ctx.strokeStyle = acc; ctx.lineWidth = 0.7; ctx.lineCap = 'round'; ctx.globalAlpha = 0.85; ctx.beginPath(); for (let d = -30; d < 30; d += 3.4) { ctx.moveTo(d - 14, 5); ctx.lineTo(d + 6, -15); ctx.moveTo(d + 14, 5); ctx.lineTo(d - 6, -15); } ctx.stroke(); ctx.globalAlpha = 1; }
  else if (pt === 'mosaic') { const cs_ = p.cols || [acc, shade(acc, 0.35), shade(acc, 0.6), '#ffffff']; for (let y = -13, j = 0; y < 4; y += 3, j++) for (let x = -12, i = 0; x < 12; x += 3, i++) { ctx.fillStyle = cs_[Math.floor(hash01(i * 17 + j, 251) * cs_.length)]; sfr(x + 0.2, y + 0.2, 2.6, 2.6); } }
  else if (pt === 'rainbow') { const cs_ = p.cols || ['#ff6b6b', '#ffb347', '#ffd23a', '#3fd16a', '#2f9bff', '#8a5bff'], bh = 18 / cs_.length; cs_.forEach((c, i) => { ctx.fillStyle = c; sfr(-13, -14 + i * bh, 26, bh + 0.2); }); }
  else if (pt === 'twill') { ctx.strokeStyle = shade(roof, -0.18); ctx.lineWidth = 0.6; ctx.lineCap = 'round'; ctx.beginPath(); for (let y = -12.5, j = 0; y < 4; y += 2.4, j++) for (let x = -12; x < 12; x += 2.4) { const up = j % 2; ctx.moveTo(x + 0.3, y + (up ? 1.4 : 0.2)); ctx.lineTo(x + 1.9, y + (up ? 0.2 : 1.4)); } ctx.stroke(); }
  ctx.restore();
  if (p.roof !== 'col' && !p.noTrim) { body(); ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke(); }
  const dy = round ? 1.4 : p.shape === 'pill' ? -1.6 : 0.2;
  rr(-1.6, dy, 3.2, 3.2, 1.5); ctx.fillStyle = p.door ? C(p.door) : shade(col, -0.45); ctx.fill();
  for (const xk of p.x || []) {
    if (xk === 'chimney') { ctx.fillStyle = '#6b5f55'; sfr(5, -12.5, 2.8, 3.2); }
    else if (xk === 'tree') { dotShadow(10.5, -11, 3, 3); dot(10.5, -11, 3, PAL.tree2); dot(9.8, -11.8, 1.8, PAL.tree1); }
    else if (xk === 'pool') { ctx.fillStyle = '#5fc4e6'; sfr(-10.5, -12, 6, 3.4); ctx.fillStyle = 'rgba(255,255,255,.6)'; sfr(-9.8, -11.4, 3, 0.7); }
    else if (xk === 'flowers' && model >= 1) for (let i = 0; i < 5; i++) dot(-8 + i * 4, 3.9, 0.7, ['#ff6b8b', '#ffd23a', '#ffffff', '#b07bff', '#ff6b8b'][i]);
    else if (xk === 'lantern') { ctx.save(); ctx.globalCompositeOperation = 'lighter'; dot(8.5, 2, 2.4, 'rgba(255,200,120,.3)'); ctx.restore(); dot(8.5, 2, 1, '#ff6a3a'); }
    else if (xk === 'antenna') { dot(6.5, -11, 2, '#e3e9ee'); dot(6.5, -11, 0.8, '#7d8790'); }
    else if (xk === 'snow') { ctx.fillStyle = '#fbfdff'; ctx.beginPath(); for (let x = -9; x <= 9; x += 3) { const r_ = 1.5 + hash01(x + 20, 181) * 0.6, yy = round ? -5 - Math.sqrt(Math.max(0, 90 - x * x)) + 0.6 : p.shape === 'pill' ? -11.3 : -12.8; ctx.moveTo(x + r_, yy); ctx.arc(x, yy, r_, 0, 6.3); } ctx.fill(); }
    else if (xk === 'umbrella') { const ux = -7.4, uy = -8.4; dotShadow(ux, uy, 3, 3); for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : col; ctx.beginPath(); ctx.moveTo(ux, uy); ctx.arc(ux, uy, 3, i * 1.047, (i + 1) * 1.047); ctx.closePath(); ctx.fill(); } dot(ux, uy, 0.6, shade(col, -0.3)); }
    else if (xk === 'hedge') for (let x = -9.5; x <= 9.6; x += 2.4) { dot(x, 4.6, 1.35, PAL.tree2); dot(x - 0.4, 4.2, 0.75, PAL.tree1); }
    else if (xk === 'portholes') for (const px of [-4.6, 4.6]) { dot(px, -7.2, 2.2, acc); dot(px, -7.2, 1.45, '#bfe7f5'); dot(px - 0.4, -7.7, 0.5, 'rgba(255,255,255,.75)'); }
    else if (xk === 'balloons') { ctx.strokeStyle = 'rgba(60,60,60,.45)'; ctx.lineWidth = 0.3; ctx.lineCap = 'round'; ctx.beginPath(); for (const [bx, by] of [[9.6, -12.5], [12.4, -8.6], [7.6, -16]]) { ctx.moveTo(bx, by + 1.8); ctx.quadraticCurveTo(bx - 0.8, by + 4.5, 10.5, -3.5); } ctx.stroke(); [[9.6, -12.5, '#ff6b8b'], [12.4, -8.6, '#7fe3ff'], [7.6, -16, '#ffd23a']].forEach(([bx, by, c]) => { dotShadow(bx, by, 1.8, 2.5); dot(bx, by, 1.8, c); dot(bx - 0.5, by - 0.6, 0.55, 'rgba(255,255,255,.6)'); }); }
    else if (xk === 'turret') { dotShadow(-9, -11, 3.2, 3); dot(-9, -11, 3.2, '#cfc8bb'); dot(-9, -11, 2.3, col); dot(-9.6, -11.6, 0.7, 'rgba(255,255,255,.45)'); }
  }
  if (showSymbols) glyph(COLORS[b.color].glyph, 0, round ? -5 : -6, 2.3, roof.startsWith('#') && lum(roof) > 0.5 ? col : 'rgba(255,255,255,.92)');
}
/* a generated store roof: a base colour and a pattern (the store's colour can be the pattern's) */
function storeGen(p, Bx, By, Bw, Bh, col) {
  const C = v => v === 'col' ? col : v === 'dark' ? shade(col, -0.4) : v;
  const acc = C(p.acc || 'col'), dot = (x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill(); };
  ctx.fillStyle = C(p.base); ctx.fillRect(Bx, By, Bw, Bh);
  const pt = p.pat;
  if (pt === 'stripes') { ctx.fillStyle = acc; for (let x = Bx + 2; x < Bx + Bw; x += 8) sfr(x, By, 4, Bh); }
  else if (pt === 'grid') { ctx.fillStyle = acc; for (let y = By + 6; y < By + Bh - 8; y += 10) for (let x = Bx + 6; x < Bx + Bw - 8; x += 10) sfr(x, y, 6, 6); }
  else if (pt === 'dots') { for (let y = By + 5, j = 0; y < By + Bh - 3; y += 7, j++) for (let x = Bx + 5 + (j % 2) * 3.5; x < Bx + Bw - 3; x += 7) dot(x, y, 1.8, acc); }
  else if (pt === 'rings') { ctx.strokeStyle = acc; ctx.lineWidth = 2.2; for (let i = 1; i <= 3; i++) { const m = i * 6; rr(Bx + m, By + m, Bw - m * 2, Bh - m * 2, 6); ctx.stroke(); } }
  else if (pt === 'garden') { for (let i = 0; i < 34; i++) dot(Bx + hash01(i, 81) * Bw, By + hash01(i, 82) * Bh, 1.4 + hash01(i, 83) * 1.8, i % 3 ? '#86c46a' : '#4f8d3f'); for (let i = 0; i < 8; i++) dot(Bx + hash01(i, 84) * Bw, By + hash01(i, 85) * Bh, 0.9, ['#ff6b8b', '#ffd23a', '#ffffff'][i % 3]); }
  else if (pt === 'solar') { ctx.fillStyle = acc; for (let y = By + 5; y < By + Bh - 8; y += 9) for (let x = Bx + 5; x < Bx + Bw - 10; x += 13) sfr(x, y, 11, 6); }
  else if (pt === 'pool') { ctx.fillStyle = acc; sfr(Bx + 5, By + 6, Bw * 0.55, Bh * 0.42); ctx.fillStyle = 'rgba(255,255,255,.55)'; sfr(Bx + 8, By + 9, Bw * 0.3, 1.6); dot(Bx + Bw - 10, By + Bh * 0.7, 3, '#ff6f61'); }
  else if (pt === 'checker') { ctx.fillStyle = acc; for (let y = By + 3, j = 0; y < By + Bh - 3; y += 6, j++) for (let x = Bx + 3 + (j % 2) * 6; x < Bx + Bw - 3; x += 12) sfr(x, y, 5.2, 5.2); }
  else if (pt === 'scallop') { const b0 = C(p.base); ctx.strokeStyle = acc; ctx.lineWidth = 1.1; for (let y = By + Bh + 3, j = 0; y > By - 5; y -= 4, j++) { ctx.fillStyle = j % 2 && b0[0] === '#' ? shade(b0, -0.06) : b0; ctx.beginPath(); for (let x = Bx - 2 + (j % 2) * 4; x < Bx + Bw + 4; x += 8) { ctx.moveTo(x + 4.3, y); ctx.arc(x, y, 4.3, 0, 6.3); } ctx.fill(); ctx.stroke(); } }
  else if (pt === 'bubbles') { ctx.lineWidth = 1.1; ctx.strokeStyle = acc; for (let i = 0; i < 16; i++) { const x = Bx + 4 + hash01(i, 191) * (Bw - 8), y = By + 4 + hash01(i, 192) * (Bh - 8), r = 2 + hash01(i, 193) * 4.5; ctx.fillStyle = rgba(acc, 0.28); ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill(); ctx.stroke(); dot(x - r * 0.35, y - r * 0.35, r * 0.22, 'rgba(255,255,255,.85)'); } }
  else if (pt === 'confetti') { const cs = [acc, shade(acc, -0.25), shade(acc, 0.25)]; for (let i = 0; i < 52; i++) { ctx.fillStyle = cs[i % 3]; ctx.beginPath(); ctx.ellipse(Bx + hash01(i, 201) * Bw, By + hash01(i, 202) * Bh, 2.6, 1.2, hash01(i, 203) * 3.1, 0, 6.3); ctx.fill(); } }
  else if (pt === 'courtyard') { const cx = Bx + Bw / 2, cy = By + Bh / 2, R = Math.min(Bw, Bh) * 0.3; dot(cx, cy, R + 2.4, acc); dot(cx, cy, R, '#86c46a'); for (let i = 0; i < 8; i++) { const a = i * 0.785; dot(cx + Math.cos(a) * R * 0.74, cy + Math.sin(a) * R * 0.74, 1.1, ['#ff6b8b', '#ffd23a', '#ffffff'][i % 3]); } dot(cx + 1.2, cy + 1.6, R * 0.42, 'rgba(0,0,0,.16)'); dot(cx, cy, R * 0.42, '#3f8a4a'); dot(cx - R * 0.12, cy - R * 0.12, R * 0.24, '#5cab5f'); for (const [ex, ey] of [[Bx + 7, By + 7], [Bx + Bw - 7, By + 7], [Bx + 7, By + Bh - 7], [Bx + Bw - 7, By + Bh - 7]]) dot(ex, ey, 2.4, acc); }
  else if (pt === 'flowers') { for (let y = By + 7, j = 0; y < By + Bh - 3; y += 11, j++) for (let x = Bx + 7 + (j % 2) * 5.5; x < Bx + Bw - 3; x += 11) { ctx.fillStyle = acc; ctx.beginPath(); for (let q = 0; q < 5; q++) { const a = q * 1.2566 + j, px = x + Math.cos(a) * 2.2, py = y + Math.sin(a) * 2.2; ctx.moveTo(px + 1.7, py); ctx.arc(px, py, 1.7, 0, 6.3); } ctx.fill(); dot(x, y, 1.4, '#ffd23a'); } }
  else if (pt === 'lanes') { ctx.fillStyle = acc; for (let y = By + 5; y < By + Bh - 4; y += 9) sfr(Bx + 3, y, Bw - 6, 3); ctx.fillStyle = 'rgba(255,255,255,.75)'; for (let y = By + 11; y < By + Bh - 4; y += 9) for (let x = Bx + 5; x < Bx + Bw - 5; x += 6) sfr(x, y - 0.5, 3, 1); }
  else if (pt === 'clouds') { const puff = (x, y, s) => { for (const [dx, dy, r_] of [[-1.6, 0.4, 1], [0, -0.5, 1.3], [1.6, 0.4, 1], [0, 0.7, 1]]) { ctx.moveTo(x + dx * s + r_ * s, y + dy * s); ctx.arc(x + dx * s, y + dy * s, r_ * s, 0, 6.3); } }; const P = []; for (let i = 0; i < 5; i++) P.push([Bx + 8 + hash01(i, 211) * (Bw - 16), By + 7 + hash01(i, 212) * (Bh - 14), 2.2 + hash01(i, 213) * 1.6]); ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); for (const [x, y, s_] of P) puff(x + 1.4, y + 1.8, s_); ctx.fill(); ctx.fillStyle = acc; ctx.beginPath(); for (const [x, y, s_] of P) puff(x, y, s_); ctx.fill(); }
  else if (pt === 'tiles') { for (let y = By + 3, j = 0; y < By + Bh - 3; y += 8, j++) for (let x = Bx + 3, i = 0; x < Bx + Bw - 3; x += 8, i++) { ctx.fillStyle = (i + j) % 3 === 0 ? acc : (i + j) % 3 === 1 ? shade(acc, 0.3) : shade(acc, 0.55); sfr(x, y, 6.6, 6.6); } }
  else if (pt === 'sundeck') { for (let y = By, i = 0; y < By + Bh; y += 3, i++) { ctx.fillStyle = i % 2 ? '#b8946a' : '#c9a876'; sfr(Bx, y + 0.3, Bw, 2.6); } ctx.fillStyle = '#5fc4e6'; sfr(Bx + Bw * 0.5, By + 6, Bw * 0.4, Bh * 0.38); ctx.fillStyle = 'rgba(255,255,255,.55)'; sfr(Bx + Bw * 0.53, By + 9, Bw * 0.22, 1.4); ctx.fillStyle = '#fbf8f1'; sfr(Bx + 6, By + Bh - 12, 9, 4); sfr(Bx + 18, By + Bh - 12, 9, 4); for (const [ux, uy] of [[Bx + 12, By + 12], [Bx + Bw * 0.7, By + Bh - 9]]) { dot(ux + 1.5, uy + 2, 5, 'rgba(0,0,0,.15)'); for (let q = 0; q < 8; q++) { ctx.fillStyle = q % 2 ? '#ffffff' : acc; ctx.beginPath(); ctx.moveTo(ux, uy); ctx.arc(ux, uy, 5, q * 0.785, (q + 1) * 0.785); ctx.closePath(); ctx.fill(); } dot(ux, uy, 0.9, '#6b4a2e'); } }
  else if (pt === 'leaves') { for (let i = 0; i < 26; i++) { ctx.fillStyle = ['#2f6a3a', '#4f8d3f', '#6fae55'][i % 3]; ctx.beginPath(); ctx.ellipse(Bx + hash01(i, 222) * Bw, By + hash01(i, 223) * Bh, 4.6, 2.2, hash01(i, 221) * 6.3, 0, 6.3); ctx.fill(); } for (let i = 0; i < 7; i++) { const x = Bx + 5 + hash01(i, 224) * (Bw - 10), y = By + 5 + hash01(i, 225) * (Bh - 10); dot(x, y, 2.3, acc); dot(x, y, 0.8, '#ffd23a'); } }
  else if (pt === 'bigtop') { const cx = Bx + Bw / 2, cy = By + Bh / 2, R = Math.min(Bw, Bh) * 0.44; dot(cx + 1.6, cy + 2, R + 1.5, 'rgba(0,0,0,.15)'); for (let q = 0; q < 12; q++) { ctx.fillStyle = q % 2 ? '#ffffff' : acc; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, q * 0.5236, (q + 1) * 0.5236); ctx.closePath(); ctx.fill(); } for (let q = 0; q < 12; q++) { const a = (q + 0.5) * 0.5236; dot(cx + Math.cos(a) * R, cy + Math.sin(a) * R, R * 0.14, q % 2 ? acc : '#ffffff'); } dot(cx, cy, 2.6, '#ffd23a'); dot(cx - 0.7, cy - 0.7, 0.9, '#fff6c8'); }
  else if (pt === 'mosaic') { const cs_ = p.cols || [acc, shade(acc, 0.3), shade(acc, 0.55), '#ffffff']; for (let y = By + 3, j = 0; y < By + Bh - 3; y += 7, j++) for (let x = Bx + 3, i = 0; x < Bx + Bw - 3; x += 7, i++) { ctx.fillStyle = cs_[Math.floor(hash01(i * 31 + j, 241) * cs_.length)]; sfr(x, y, 5.6, 5.6); } }
  else if (pt === 'rainbow') { const cs_ = p.cols || ['#ff6b6b', '#ffb347', '#ffd23a', '#3fd16a', '#2f9bff', '#8a5bff'], bh = Bh / cs_.length; cs_.forEach((c, i) => { ctx.fillStyle = c; sfr(Bx + 2, By + i * bh + 0.6, Bw - 4, bh - 1.2); }); }
  else if (pt === 'spiral') { const cx = Bx + Bw / 2, cy = By + Bh / 2, rx = Bw * 0.46, ry = Bh * 0.46; ctx.strokeStyle = acc; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.beginPath(); for (let t = 0; t <= 14; t += 0.25) { const f_ = t / 14; t ? ctx.lineTo(cx + Math.cos(t) * f_ * rx, cy + Math.sin(t) * f_ * ry) : ctx.moveTo(cx, cy); } ctx.stroke(); }
  else if (pt === 'bloom') { const cx = Bx + Bw / 2, cy = By + Bh / 2, R = Math.min(Bw, Bh) * 0.42; ctx.fillStyle = '#4f8d3f'; for (const [ex, ey] of [[Bx + 7, By + 7], [Bx + Bw - 7, By + 7], [Bx + 7, By + Bh - 7], [Bx + Bw - 7, By + Bh - 7]]) { ctx.beginPath(); ctx.ellipse(ex, ey, 5, 2.6, (ex - cx) * (ey - cy) > 0 ? 0.785 : -0.785, 0, 6.3); ctx.fill(); } dot(cx + 1.5, cy + 2, R * 0.92, 'rgba(0,0,0,.12)'); ctx.fillStyle = acc; for (let i = 0; i < 8; i++) { const a = i * 0.785; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * R * 0.55, cy + Math.sin(a) * R * 0.55, R * 0.42, R * 0.24, a, 0, 6.3); ctx.fill(); } dot(cx, cy, R * 0.3, '#ffd23a'); dot(cx - R * 0.08, cy - R * 0.08, R * 0.12, 'rgba(255,255,255,.5)'); }
  else if (pt === 'honey') { const b0 = C(p.base); for (let y = By + 5, j = 0; y < By + Bh - 2; y += 7, j++) for (let x = Bx + 5 + (j % 2) * 4; x < Bx + Bw - 2; x += 8) { dot(x, y, 3.3, acc); dot(x, y, 2.3, b0); dot(x - 0.7, y - 0.7, 0.6, 'rgba(255,255,255,.45)'); } }
  else if (pt === 'waves') { ctx.strokeStyle = acc; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath(); for (let y = By + 6; y < By + Bh; y += 7) for (let x = Bx; x <= Bx + Bw; x += 1) { const yy = y + Math.sin(x * 0.35) * 1.6; x === Bx ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); } ctx.stroke(); }
  else if (pt === 'batwing') {                            // bat-wing scallops along every edge, a crescent moon and a few stars in the store's colour
    const b0 = C(p.base), rim = b0[0] === '#' ? shade(b0, -0.45) : 'rgba(0,0,0,.4)';
    ctx.fillStyle = rim; ctx.beginPath();
    for (let x = Bx + 4; x < Bx + Bw; x += 8) { ctx.moveTo(x + 4, By); ctx.arc(x, By, 4, 0, Math.PI); ctx.moveTo(x + 4, By + Bh); ctx.arc(x, By + Bh, 4, Math.PI, 6.2832); }
    for (let y = By + 4; y < By + Bh; y += 8) { ctx.moveTo(Bx, y - 4); ctx.arc(Bx, y, 4, -1.5708, 1.5708); ctx.moveTo(Bx + Bw, y + 4); ctx.arc(Bx + Bw, y, 4, 1.5708, 4.7124); }
    ctx.fill(); ctx.strokeStyle = acc; ctx.lineWidth = 1; ctx.stroke();
    const mx = Bx + Bw / 2, my = By + Bh / 2, R = Math.min(Bw, Bh) * 0.2;
    dot(mx + 1, my + 1.2, R, 'rgba(0,0,0,.2)'); dot(mx, my, R, acc); dot(mx + R * 0.5, my - R * 0.3, R * 0.8, b0);
    for (const [sx, sy] of [[0.27, 0.3], [0.72, 0.24], [0.3, 0.74], [0.76, 0.7]]) dot(Bx + Bw * sx, By + Bh * sy, 0.9, rgba(acc, 0.8));
  }
}
/* a generated roundabout middle: a fill and a pattern */
function roundGen(p, x, y, IR) {
  const R0 = IR + 0.5, cs = [].concat(p.acc || '#ffffff'), dot = (px, py, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(px, py, r, 0, 6.3); ctx.fill(); };
  dot(x, y, R0, p.fill);
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, R0, 0, 6.3); ctx.clip();
  const pt = p.pat;
  if (pt === 'rings') { ctx.strokeStyle = cs[0]; ctx.lineWidth = 1; for (const r of [R0 * 0.72, R0 * 0.4]) { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.stroke(); } dot(x, y, 0.9, cs[0]); }
  else if (pt === 'petals') { ctx.fillStyle = cs[0]; for (let i = 0; i < 8; i++) { const a = i * 0.785; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * R0 * 0.48, y + Math.sin(a) * R0 * 0.48, R0 * 0.3, R0 * 0.17, a, 0, 6.3); ctx.fill(); } dot(x, y, R0 * 0.24, p.c2 || '#7a4a20'); }
  else if (pt === 'dots') { for (let i = 0; i < 12; i++) { const a = i * 2.4, d = Math.sqrt((i + 0.5) / 12) * R0 * 0.85; dot(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.8, cs[i % cs.length]); } }
  else if (pt === 'wedges') { for (let i = 1; i < 8; i += 2) { ctx.fillStyle = cs[(i >> 1) % cs.length]; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, R0, i * 0.785, (i + 1) * 0.785); ctx.closePath(); ctx.fill(); } }
  else if (pt === 'spiral') { ctx.strokeStyle = cs[0]; ctx.lineWidth = 0.9; ctx.lineCap = 'round'; ctx.beginPath(); const a0 = REDUCED_MOTION ? 0 : animT * 0.5; for (let t = 0; t <= 12.6; t += 0.2) { const r = t / 12.6 * R0 * 0.88, a = t + a0; t ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x, y); } ctx.stroke(); }
  else if (pt === 'tree') { dot(x + SUN.x * 1.5, y + SUN.y * 1.5, R0 * 0.62, 'rgba(0,0,0,.18)'); dot(x, y, R0 * 0.62, '#3f8a4a'); dot(x - R0 * 0.18, y - R0 * 0.18, R0 * 0.36, '#5cab5f'); }
  else if (pt === 'water') { dot(x, y, R0 - 1, '#5fb4d6'); for (const [dx, dy] of [[-2, -1.4], [2, 1], [0.2, 2.4]]) { ctx.fillStyle = cs[0]; ctx.beginPath(); ctx.ellipse(x + dx, y + dy, 1.1, 0.6, dx, 0, 6.3); ctx.fill(); } }
  else if (pt === 'zen') { ctx.strokeStyle = cs[0]; ctx.lineWidth = 0.35; ctx.beginPath(); for (let r = 1.7; r < R0 + 2; r += 1.05) { ctx.moveTo(x + 1.3 + r, y - 1); ctx.arc(x + 1.3, y - 1, r, 0, 6.3); } ctx.stroke(); dot(x + 1.3, y - 1, 1.25, '#7d766b'); dot(x + 1, y - 1.35, 0.45, 'rgba(255,255,255,.4)'); dot(x - 2.5, y + 2.3, 0.9, '#8a8378'); }
  else if (pt === 'donut') { dot(x, y, R0, p.c2 || '#c98a4a'); dot(x, y, R0 - 1.1, p.fill); ctx.lineCap = 'round'; ctx.lineWidth = 0.45; for (let i = 0; i < 14; i++) { const a = i * 2.4, d = R0 * (0.48 + hash01(i, 231) * 0.3), b_ = hash01(i, 232) * 3; ctx.strokeStyle = cs[i % cs.length]; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * d - Math.cos(b_) * 0.5, y + Math.sin(a) * d - Math.sin(b_) * 0.5); ctx.lineTo(x + Math.cos(a) * d + Math.cos(b_) * 0.5, y + Math.sin(a) * d + Math.sin(b_) * 0.5); ctx.stroke(); } dot(x, y, R0 * 0.3, PAL.road); }
  else if (pt === 'citrus') { dot(x, y, R0 - 0.9, cs[0]); dot(x, y, R0 - 1.4, p.c2 || '#ffcf5c'); ctx.strokeStyle = cs[0]; ctx.lineWidth = 0.5; ctx.lineCap = 'round'; ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * 0.785 + 0.2; ctx.moveTo(x + Math.cos(a) * 0.8, y + Math.sin(a) * 0.8); ctx.lineTo(x + Math.cos(a) * (R0 - 1.7), y + Math.sin(a) * (R0 - 1.7)); } ctx.stroke(); dot(x, y, 0.9, cs[0]); }
  else if (pt === 'melon') { dot(x, y, R0, cs[0]); dot(x, y, R0 - 0.7, '#eef6d8'); dot(x, y, R0 - 1.2, p.fill); ctx.fillStyle = p.c2 || '#1f262b'; for (let i = 0; i < 9; i++) { const a = i * 0.698, d = i % 2 ? R0 * 0.55 : R0 * 0.32; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.5, 0.3, a, 0, 6.3); ctx.fill(); } }
  else if (pt === 'hedge') { const ring = (rad, ox, oy) => { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = i * 0.628, px = x + Math.cos(a) * R0 * 0.72 + ox, py = y + Math.sin(a) * R0 * 0.72 + oy; ctx.moveTo(px + rad, py); ctx.arc(px, py, rad, 0, 6.3); } ctx.fill(); }; ctx.fillStyle = cs[0]; ring(1.35, 0, 0); ctx.fillStyle = p.c2 || '#6fb35e'; ring(0.7, -0.35, -0.35); dot(x, y, 1.5, '#e9e1cf'); dot(x, y, 0.8, '#5fb4d6'); }
  else if (pt === 'bands') { for (let i = 0, r = R0; r > 0.6; r -= 1.25, i++) dot(x, y, r, cs[i % cs.length]); }
  else if (pt === 'stones') { for (let i = 0; i < 7; i++) { const a = i * 0.898, px = x + Math.cos(a) * R0 * 0.62, py = y + Math.sin(a) * R0 * 0.62; ctx.fillStyle = cs[i % cs.length]; ctx.beginPath(); ctx.ellipse(px, py, 1.25, 0.95, a, 0, 6.3); ctx.fill(); } dot(x, y, 1.5, cs[0]); }
  else if (pt === 'craters') { dot(x + 1.6, y + 1.6, R0, 'rgba(0,0,0,.08)'); for (const [dx, dy, r] of [[-2.2, -1.6, 1.5], [2, 0.8, 1.9], [-0.6, 2.8, 1], [1.6, -2.8, 0.8], [-3.5, 1.4, 0.7]]) { dot(x + dx, y + dy, r, cs[0]); dot(x + dx + r * 0.22, y + dy + r * 0.22, r * 0.68, p.c2 || cs[0]); } }
  else if (pt === 'yinyang') { const r2 = R0 / 2; ctx.fillStyle = cs[0]; ctx.beginPath(); ctx.arc(x, y, R0, -Math.PI / 2, Math.PI / 2); ctx.arc(x, y + r2, r2, Math.PI / 2, -Math.PI / 2, true); ctx.arc(x, y - r2, r2, Math.PI / 2, -Math.PI / 2, false); ctx.fill(); dot(x, y - r2, R0 * 0.14, p.fill); dot(x, y + r2, R0 * 0.14, cs[0]); }
  else if (pt === 'clock') { ctx.fillStyle = cs[0]; ctx.beginPath(); for (let i = 0; i < 12; i++) { const a = i * 0.5236, d = R0 - 1.2, rd = i % 3 ? 0.28 : 0.5; ctx.moveTo(x + Math.cos(a) * d + rd, y + Math.sin(a) * d); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rd, 0, 6.3); } ctx.fill(); const ph = dayPhase(), ha = ph * 12.566 - 1.5708, ma = ph * 150.8 - 1.5708; ctx.lineCap = 'round'; ctx.strokeStyle = cs[0]; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ha) * R0 * 0.4, y + Math.sin(ha) * R0 * 0.4); ctx.stroke(); ctx.strokeStyle = p.c2 || cs[0]; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ma) * R0 * 0.64, y + Math.sin(ma) * R0 * 0.64); ctx.stroke(); dot(x, y, 0.6, cs[0]); }
  else if (pt === 'flowerbed') { for (let ring = 0; ring < 3; ring++) { const d = R0 * (0.76 - ring * 0.26), n = 12 - ring * 4; ctx.fillStyle = cs[ring % cs.length]; ctx.beginPath(); for (let i = 0; i < n; i++) { const a = i * 6.283 / n + ring * 0.3; ctx.moveTo(x + Math.cos(a) * d + 0.75, y + Math.sin(a) * d); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.75, 0, 6.3); } ctx.fill(); } dot(x, y, 0.9, p.c2 || '#ffd23a'); }
  else if (pt === 'planet') { const ringH = (a0, a1) => { ctx.save(); ctx.translate(x, y); ctx.rotate(-0.45); ctx.strokeStyle = cs[0]; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.ellipse(0, 0, R0 * 0.8, R0 * 0.26, 0, a0, a1); ctx.stroke(); ctx.restore(); }; ringH(Math.PI, 2 * Math.PI); dot(x, y, R0 * 0.4, p.c2 || '#f0b26a'); dot(x - R0 * 0.12, y - R0 * 0.12, R0 * 0.2, 'rgba(255,255,255,.35)'); ringH(0, Math.PI); }
  else if (pt === 'maze') { ctx.strokeStyle = cs[0]; ctx.lineWidth = 0.9; ctx.lineCap = 'round'; for (let i = 0; i < 3; i++) { const rad = R0 * (0.82 - i * 0.26), g0 = i * 2.1; ctx.beginPath(); ctx.arc(x, y, rad, g0 + 0.5, g0 + 3.4); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, rad, g0 + 4, g0 + 6.3); ctx.stroke(); } dot(x, y, 0.9, cs[0]); }
  else if (pt === 'bubbles') { ctx.lineWidth = 0.35; ctx.strokeStyle = cs[0]; for (let i = 0; i < 7; i++) { const a = i * 2.4, d = Math.sqrt((i + 0.5) / 7) * R0 * 0.7, bx = x + Math.cos(a) * d, by = y + Math.sin(a) * d, br = 0.7 + hash01(i, 261) * 1.1; ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.beginPath(); ctx.arc(bx, by, br, 0, 6.3); ctx.fill(); ctx.stroke(); dot(bx - br * 0.35, by - br * 0.35, br * 0.28, 'rgba(255,255,255,.9)'); } }
  else if (pt === 'ripple') { ctx.strokeStyle = cs[0]; ctx.lineWidth = 0.5; for (let i = 0; i < 4; i++) { ctx.globalAlpha = 0.95 - i * 0.22; ctx.beginPath(); ctx.arc(x, y, R0 * (0.22 + i * 0.22), 0, 6.3); ctx.stroke(); } ctx.globalAlpha = 1; dot(x, y, 0.8, cs[0]); }
  else if (pt === 'tyre') { ctx.strokeStyle = cs[0]; ctx.lineWidth = 1.3; ctx.lineCap = 'butt'; ctx.setLineDash([1.2, 1.4]); ctx.beginPath(); ctx.arc(x, y, R0 - 0.9, 0, 6.3); ctx.stroke(); ctx.setLineDash([]); dot(x, y, R0 * 0.5, cs[0]); dot(x, y, R0 * 0.36, p.fill); dot(x, y, R0 * 0.16, cs[0]); }
  if (p.dots) for (let i = 0; i < 7; i++) { const a = i * 2.4 + 0.5, d = Math.sqrt((i + 0.5) / 7) * R0 * 0.75; dot(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.6, p.dots); }
  ctx.restore();
}
const MAP_THEMES = {
  meadow:   {label: 'Meadow',   tone: 'light', decor: 'tree',    land: '#dde5cf', land2: '#d4dec4', patch: '#bdd49c', water: '#9dc9df'},
  night:    {label: 'Night',    tone: 'dark',  decor: 'tree',    land: '#23322f', land2: '#1f2d2b', patch: '#2e463a', water: '#1c4458'},
  winter:   {label: 'Winter',   tone: 'light', decor: 'snowpine', land: '#e2e9ee', land2: '#dae3e9', patch: '#f8fbfd', water: '#a6cde3', foam: '#eef7fb',
             tree1: '#5f8f7a', tree2: '#46745f', grass: '#eff4f7', check: 'rgba(255,255,255,.35)'},
  desert:   {label: 'Desert',   tone: 'light', decor: 'cactus',  land: '#ead8ad', land2: '#e4cf9f', patch: '#d6b77b', water: '#79c3c4', foam: '#d2efe9',
             tree1: '#7fae5e', tree2: '#5f8f45', grass: '#d9c58f'},
  autumn:   {label: 'Autumn',   tone: 'light', decor: 'autumn',  land: '#e3dcc4', land2: '#dbd2b6', patch: '#e2b277', water: '#94bfd2',
             tree1: '#d9893a', tree2: '#b8612b', grass: '#d8c58f'},
  blossom:  {label: 'Blossom',  tone: 'light', decor: 'blossom', land: '#e2ebd6', land2: '#d9e4ca', patch: '#f1cbd9', water: '#a4cfe6',
             tree1: '#f2a7c3', tree2: '#d98aa8', grass: '#cfe2b8'},
  tropical: {label: 'Tropical', tone: 'light', decor: 'palm',    land: '#d3ebc3', land2: '#c9e4b7', patch: '#eee0ae', water: '#5ccbd4', foam: '#d6f6f7', grass: '#b9de9d'},
  candy:    {label: 'Candy',    tone: 'light', decor: 'flowers', land: '#f5dce8', land2: '#f0d1df', patch: '#c9eedc', water: '#9fd5f2', foam: '#e3f4fd',
             tree1: '#ff9ec7', tree2: '#e77fae', grass: '#c9eedc', check: 'rgba(255,255,255,.4)'},
  spooky:   {label: 'Spooky',   tone: 'dark',  decor: 'pumpkin', land: '#2a2633', land2: '#25212e', patch: '#3b3046', water: '#263b55', foam: '#3b5a7a',
             tree1: '#4d3d60', tree2: '#3a2d4a', grass: '#3a3346'},
  lunar:    {label: 'Lunar',    tone: 'dark',  decor: 'crystal', land: '#3a3c48', land2: '#353743', patch: '#4a4c5c', water: '#1e2f4f', foam: '#4a6a9a',
             tree1: '#8ad8ff', tree2: '#5aa8e0', grass: '#45475a'},
  volcano:  {label: 'Volcano',  tone: 'dark',  decor: 'rock',    land: '#3b2a26', land2: '#352521', patch: '#5a3328', water: '#e8501e', foam: '#ffc23a',
             tree1: '#6b4a3a', tree2: '#4a3228', grass: '#4a3530'},
  /* p30 map themes */
  orchard: {label: 'Orchard', tone: 'light', decor: 'orchard', land: '#e1e6c8', land2: '#d8dfbc', patch: '#c7d99a', water: '#9ccbe0', tree1: '#86bb5f', tree2: '#5f9a4b', grass: '#b9d68f'},
  provence: {label: 'Provence', tone: 'light', decor: 'lavender', land: '#e6e2cf', land2: '#ddd8c2', patch: '#cbbbe2', water: '#8fc3d8', grass: '#c8d6a8'},
  sunfields: {label: 'Sunflower fields', tone: 'light', decor: 'sunflower', land: '#e8e2b8', land2: '#e0d9aa', patch: '#efd36e', water: '#8cc7d8', grass: '#cfd98f'},
  harvest: {label: 'Harvest', tone: 'light', decor: 'haybale', land: '#ece0b8', land2: '#e4d6aa', patch: '#d9be7a', water: '#93c0cf', tree1: '#c9a24a', tree2: '#a8832e', grass: '#e0cd94'},
  tulips: {label: 'Tulip fields', tone: 'light', decor: 'tulip', land: '#dfe8cf', land2: '#d6e1c3', patch: '#f5c9cf', water: '#9fcbe3', grass: '#c4dca6'},
  birchwood: {label: 'Birch wood', tone: 'light', decor: 'birch', land: '#e4e6d6', land2: '#dbdeca', patch: '#d6dca8', water: '#a3c9d9', tree1: '#c8de8a', tree2: '#a8c96a'},
  marsh: {label: 'Marshland', tone: 'light', decor: 'willow', land: '#d8e2c8', land2: '#cfdabc', patch: '#b6cfa0', water: '#8bbfb8', foam: '#cfe8e2', tree1: '#9cc47a', tree2: '#7fae5e'},
  bamboo: {label: 'Bamboo grove', tone: 'light', decor: 'bamboo', land: '#dbe8cc', land2: '#d1e0bf', patch: '#b8d69a', water: '#92cbd0', tree1: '#8cc063', tree2: '#5f8f45'},
  reef: {label: 'Coral reef', tone: 'light', decor: 'coral', land: '#f0e3c4', land2: '#e9dab5', patch: '#f6cdbd', water: '#4fc6d6', foam: '#c9f2f5', grass: '#e8d6a8'},
  seaside: {label: 'Seaside', tone: 'light', decor: 'shell', land: '#f1e6cc', land2: '#eadcbd', patch: '#e3eef0', water: '#6bbfd8', foam: '#e0f5fb', grass: '#dfd3a8'},
  riviera: {label: 'Riviera', tone: 'light', decor: 'parasol', land: '#f3e7d0', land2: '#ecdfc4', patch: '#f4c9a8', water: '#4aa6d6', foam: '#d7f0fb'},
  fairground: {label: 'Fairground', tone: 'light', decor: 'balloon', land: '#e0ead2', land2: '#d6e2c6', patch: '#f7d58a', water: '#9fd5f2', grass: '#c9e2b0'},
  bakery: {label: 'Bakery', tone: 'light', decor: 'cupcake', land: '#f6e9dc', land2: '#efdfcf', patch: '#f3cdd8', water: '#b5dcf0', foam: '#eaf6fc', tree1: '#f2a7c3', tree2: '#d98aa8', check: 'rgba(255,255,255,.4)'},
  lollipop: {label: 'Lollipop lane', tone: 'light', decor: 'lollipop', land: '#f7e7f0', land2: '#f1dce8', patch: '#fff0b5', water: '#a8dcf2'},
  gumdrop: {label: 'Gumdrop hills', tone: 'light', decor: 'gumdrop', land: '#dff3ea', land2: '#d3eee1', patch: '#f9d6e8', water: '#a6d8f0'},
  cloudland: {label: 'Cloudland', tone: 'light', decor: 'cloud', land: '#dbe9f5', land2: '#d0e2f1', patch: '#c4d9ee', water: '#8fbfe6', foam: '#ffffff', grass: '#e7eff7', tree1: '#ffffff', tree2: '#dfe9f3'},
  palace: {label: 'Palace gardens', tone: 'light', decor: 'topiary', land: '#dfe6cc', land2: '#d5dec0', patch: '#c3d8a2', water: '#93c4dc', grass: '#b7d494'},
  watergarden: {label: 'Water garden', tone: 'light', decor: 'pond', land: '#d9e6d0', land2: '#cfdfc5', patch: '#bcd7b0', water: '#86c1d4'},
  arctic: {label: 'Arctic', tone: 'light', decor: 'snowfolk', land: '#eef3f6', land2: '#e5edf2', patch: '#ffffff', water: '#7fb8d8', foam: '#eaf6fb', tree1: '#6f9a86', tree2: '#557f6c', grass: '#f3f7fa', check: 'rgba(255,255,255,.4)'},
  savanna: {label: 'Savanna', tone: 'light', decor: 'bush', land: '#eadcab', land2: '#e2d29c', patch: '#d4c27e', water: '#86b9c4', tree1: '#9caf55', tree2: '#7a8c3c', grass: '#dccb8c'},
  deepsea: {label: 'Deep sea', tone: 'dark', decor: 'bubble', land: '#123a4a', land2: '#0f3342', patch: '#1a4f5e', water: '#0a2433', foam: '#1f6f86', grass: '#1d4a55', tree1: '#2f8a7a', tree2: '#1f6a5e'},
  fireflies: {label: 'Firefly night', tone: 'dark', decor: 'firefly', land: '#1e2b26', land2: '#1a2621', patch: '#26392f', water: '#18394a', tree1: '#2f5a3e', tree2: '#21452e', grass: '#2c4636'},
  mars: {label: 'Red planet', tone: 'dark', decor: 'crater', land: '#6b3a2a', land2: '#633527', patch: '#7d4632', water: '#3a5f7a', foam: '#6a8fa8', grass: '#5e3426'},
  twilight: {label: 'Twilight', tone: 'dark', decor: 'pine', land: '#262a3f', land2: '#222539', patch: '#2f3450', water: '#1d3254', foam: '#3a5a8a', tree1: '#3a4a6a', tree2: '#2a3654', grass: '#2e3350'},
  festival: {label: 'Lantern festival', tone: 'dark', decor: 'lantern', land: '#2a2230', land2: '#251e2b', patch: '#3a2a36', water: '#1f3a52', foam: '#3a5f80', grass: '#3a2e3e', tree1: '#5a3a4a', tree2: '#40283a'},
  cosmos: {label: 'Cosmos', tone: 'dark', decor: 'planet', land: '#1a1838', land2: '#16142f', patch: '#26224a', water: '#0e0c22', foam: '#3a3470', grass: '#24204a'},
  /* p40 map themes */
  poppyfield: {label: 'Poppy field', tone: 'light', decor: 'poppy', land: '#e3e6c6', land2: '#dadeba', patch: '#e8b2a8', water: '#9cc8e0', grass: '#c4d69a'},
  daisymeadow: {label: 'Daisy meadow', tone: 'light', decor: 'daisy', land: '#dfe8cc', land2: '#d6e1c0', patch: '#f2f4e6', water: '#9fcbe3', grass: '#c0da9e'},
  rosegarden: {label: 'Rose garden', tone: 'light', decor: 'rosebush', land: '#e0e6cf', land2: '#d7dfc3', patch: '#f1cbd9', water: '#9ac6de', tree1: '#5a9c58', tree2: '#3f7a45', grass: '#bfd79c'},
  lemongrove: {label: 'Lemon grove', tone: 'light', decor: 'lemontree', land: '#e9e8c0', land2: '#e1e0b2', patch: '#f2e58a', water: '#8fc7d8', tree1: '#6fae55', tree2: '#4f8d3f', grass: '#d2dc92'},
  apiary: {label: 'Apiary', tone: 'light', decor: 'beehive', land: '#ebe3b8', land2: '#e3daaa', patch: '#f0cf6a', water: '#93c0cf', tree1: '#9caf55', tree2: '#7a8c3c', grass: '#dccf8c'},
  oakwood: {label: 'Oak wood', tone: 'light', decor: 'acorn', land: '#e0e3c4', land2: '#d7dbb8', patch: '#c9d39a', water: '#9cc6d8', tree1: '#8fb35a', tree2: '#5f8a3a', grass: '#b9cf8a'},
  gelato: {label: 'Gelato', tone: 'light', decor: 'icecream', land: '#fbeee6', land2: '#f5e3d8', patch: '#fde0c8', water: '#a8dcf2', foam: '#e9f7fd', tree1: '#f2a7c3', tree2: '#d98aa8', check: 'rgba(255,255,255,.4)'},
  teagarden: {label: 'Tea garden', tone: 'light', decor: 'teacup', land: '#efe6d6', land2: '#e8ddcb', patch: '#d6c9e8', water: '#a3c9d9', grass: '#d8d3a8'},
  pebblebeach: {label: 'Pebble beach', tone: 'light', decor: 'cairn', land: '#e8e2d4', land2: '#e0d9c9', patch: '#d6d0c4', water: '#6bbfd8', foam: '#e0f5fb', grass: '#d9d2bc'},
  plaza: {label: 'Fountain plaza', tone: 'light', decor: 'fountain', land: '#e9e4da', land2: '#e1dbcf', patch: '#c9d8a8', water: '#86c1d4', grass: '#c9d8a8'},
  donutshop: {label: 'Donut shop', tone: 'light', decor: 'donut', land: '#f7e9dc', land2: '#f0dfcf', patch: '#f3d0dc', water: '#b5dcf0', foam: '#eaf6fc', check: 'rgba(255,255,255,.4)'},
  yuletide: {label: 'Yuletide', tone: 'dark', decor: 'bauble', land: '#1f3a2a', land2: '#1a3324', patch: '#2b4d36', water: '#1c4458', foam: '#3a6a8a', tree1: '#3f7a4a', tree2: '#2f5a3a', grass: '#2a4a34'},
  abyss: {label: 'Abyss', tone: 'dark', decor: 'jellyfish', land: '#0f2a3a', land2: '#0c2431', patch: '#163d4d', water: '#071a26', foam: '#1f5a70', tree1: '#2f8a7a', tree2: '#1f6a5e', grass: '#143a46'},
  wispmarsh: {label: 'Wisp marsh', tone: 'dark', decor: 'wisp', land: '#1e2a2e', land2: '#1a2529', patch: '#27393a', water: '#16343a', foam: '#2f6a6a', tree1: '#2f5a4e', tree2: '#21453a', grass: '#2a403e'}
};
const MAP_PAL_KEYS = ['land', 'land2', 'patch', 'water', 'foam', 'tree1', 'tree2', 'grass', 'check'];
let mapPrefs = {theme: 'meadow', decor: 'auto', land: '', patch: '', water: '', road: '', moto: '', lastDay: 'meadow'};
/* the full drawing palette for a map theme (plus any hand-picked colours) */
function palFor(id, custom) {
  const T = MAP_THEMES[id] || MAP_THEMES.meadow, cu = custom || {};
  const land = cu.land || T.land, tone = cu.land ? (lum(land) > 0.25 ? 'light' : 'dark') : T.tone;
  const P = Object.assign({}, PALS[tone]);
  for (const k of MAP_PAL_KEYS) if (T[k]) P[k] = T[k];
  if (cu.land) { P.land = land; P.land2 = mixHex(land, '#000000', 0.035); P.check = tone === 'light' ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.03)'; }
  if (cu.patch) P.patch = cu.patch;
  if (cu.water) { P.water = cu.water; P.foam = mixHex(cu.water, '#ffffff', 0.45); }
  let rd = 'standard'; try { rd = design('road'); } catch (e) {}
  if (rd === 'cobble') { P.road = '#bdb5a8'; P.roadWet = '#a69f93'; P.edge = '#6f665b'; P.lane = 'rgba(255,255,255,.55)'; }
  else if (rd === 'dirt') { P.road = '#c8a274'; P.roadWet = '#ad8a60'; P.edge = '#7a5f40'; P.lane = 'rgba(0,0,0,0)'; }
  else if (rd === 'neon') { P.road = '#1c1f2e'; P.roadWet = '#171a27'; P.edge = '#00e1ff'; P.lane = '#ff3df2'; }
  else if (rd === 'concrete') { P.road = '#d3d1cb'; P.roadWet = '#bebcb5'; P.edge = '#8d8b85'; P.lane = '#e2b022'; }
  else if (rd === 'brick') { P.road = '#b4644a'; P.roadWet = '#9b533c'; P.edge = '#6c3426'; P.lane = 'rgba(255,240,220,.7)'; }
  else if (rd === 'snowy') { P.road = '#e9eef2'; P.roadWet = '#dfe6ea'; P.edge = '#9fb3c2'; P.lane = 'rgba(110,140,160,.45)'; }
  else if (rd === 'candy') { P.road = '#f8c9db'; P.roadWet = '#efb6cc'; P.edge = '#d3779d'; P.lane = '#ffffff'; }
  else if (rd === 'boardwalk') { P.road = '#b48a5a'; P.roadWet = '#9f7748'; P.edge = '#6b4a2b'; P.lane = 'rgba(0,0,0,0)'; }
  else if (rd === 'racetrack') { P.road = '#3e4448'; P.roadWet = '#34393d'; P.edge = '#e8473a'; P.lane = '#ffffff'; }
  else if (rd === 'gold') { P.road = '#efc23a'; P.roadWet = '#d9ad27'; P.edge = '#8a6a10'; P.lane = 'rgba(255,255,255,.75)'; }
  else if (rd === 'marble') { P.road = '#e9e6e1'; P.roadWet = '#dcd8d2'; P.edge = '#a59f96'; P.lane = '#c9a24a'; }
  else if (rd === 'lava') { P.road = '#2a1714'; P.roadWet = '#24130f'; P.edge = '#ff5a1a'; P.lane = '#ffc23a'; }
  else if (GEN_P.road[rd]) { const q = GEN_P.road[rd]; P.road = q.road; P.roadWet = q.wet || mixHex(q.road, '#000000', 0.08); P.edge = q.edge; P.lane = q.lane; }
  if (cu.road) {                                     // road surface; its kerb and the wet look follow it
    P.road = cu.road; P.roadWet = mixHex(cu.road, '#000000', 0.09);
    P.edge = mixHex(cu.road, '#000000', lum(cu.road) > 0.3 ? 0.72 : 0.6);
  }
  let md = 'standard'; try { md = design('moto'); } catch (e) {}
  if (md === 'concrete') { P.deck = '#a9adb0'; P.deckEdge = '#6b7074'; }
  else if (md === 'ivy') { P.deck = '#4f8f4a'; P.deckEdge = '#2c5629'; }
  else if (md === 'lights') { P.deck = '#2b3240'; P.deckEdge = '#141921'; }
  else if (md === 'rainbow') { P.deck = '#8a5bff'; P.deckEdge = '#3b2a6b'; }
  else if (md === 'sunset') { P.deck = '#ff8a5c'; P.deckEdge = '#6b2a4a'; }
  else if (md === 'glass') { P.deck = 'rgba(170,220,245,.55)'; P.deckEdge = 'rgba(70,140,175,.85)'; }
  else if (md === 'skyline') { P.deck = '#151a28'; P.deckEdge = '#00e1ff'; }
  else if (md === 'aurora') { P.deck = '#2fd6ff'; P.deckEdge = '#1a2a4a'; }
  else if (GEN_P.moto[md]) { const q = GEN_P.moto[md]; P.deck = q[0]; P.deckEdge = mixHex(q[q.length - 1], '#000000', 0.45); }
  if (cu.moto) { P.deck = cu.moto; P.deckEdge = mixHex(cu.moto, '#000000', 0.55); }
  P.tone = tone;
  return P;
}
const decorKind = () => mapPrefs.decor !== 'auto' && DECOR[mapPrefs.decor] ? mapPrefs.decor : (MAP_THEMES[mapPrefs.theme] || MAP_THEMES.meadow).decor;
const mapCustom = () => !!(mapPrefs.land || mapPrefs.patch || mapPrefs.water || mapPrefs.road || mapPrefs.moto);
function applyMap() {
  PAL = palFor(mapPrefs.theme, mapPrefs); theme = PAL.tone;
  const root = document.documentElement;
  root.setAttribute('data-theme', theme); root.style.setProperty('--land', PAL.land);
  patchCache = null; if (typeof pathCache !== 'undefined') pathCache.ver = -1;
  try { localStorage.setItem(MAP_KEY, JSON.stringify(mapPrefs)); localStorage.setItem('junction2-theme', theme); } catch (e) {}
  if (typeof uiTheme !== 'undefined') { applyUiTheme(); renderUiThemeUI(); renderMapUI(); rememberMode(); }
  if (water) drawMini();
}
function setMap(ch) { Object.assign(mapPrefs, ch); if (mapPrefs.theme !== 'night') mapPrefs.lastDay = mapPrefs.theme; applyMap(); }
function loadMap() {
  try {
    const m = JSON.parse(localStorage.getItem(MAP_KEY));
    if (m && typeof m === 'object') {
      if (MAP_THEMES[m.theme]) mapPrefs.theme = m.theme;
      if (MAP_THEMES[m.lastDay]) mapPrefs.lastDay = m.lastDay;
      if (m.decor === 'snowman') m.decor = 'snowpine';
      if (m.decor === 'auto' || DECOR[m.decor]) mapPrefs.decor = m.decor;
      for (const f of ['land', 'patch', 'water', 'road', 'moto']) mapPrefs[f] = hexOk(m[f]) ? m[f].toLowerCase() : '';
    } else {                                           // first run on this version: keep the old light/dark choice
      let t = 'light';
      try { t = localStorage.getItem('junction2-theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch (e) {}
      mapPrefs.theme = t === 'dark' ? 'night' : 'meadow';
    }
  } catch (e) {}
  applyMap();
}
/* the T key and the half-moon button: switch to the night map, and back to whichever day theme you had */
function setTheme(t) { useMode(t); }

/* Patches of the theme's second colour, laid on the tile grid like road: whole tiles filled solid, outside
   corners rounded and inside corners filleted, so a patch reads as one smooth shape. Which tiles are patch comes
   from smooth noise. The shapes are built once as Path2Ds in 16x16-tile chunks (only visible chunks are filled)
   and rebuilt when the map theme changes. */
let patchCache = null, patchMask = null;
const PATCH_CHUNK = 16;
function patchNoise(c, r) {
  const v = (salt, sc) => {
    const x = c / sc, y = r / sc, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), h = (a, b) => hash01((b + 8) * 1031 + a + 8, salt);
    return lerp(lerp(h(x0, y0), h(x0 + 1, y0), sx), lerp(h(x0, y0 + 1), h(x0 + 1, y0 + 1), sx), sy);
  };
  return v(21, 6) * 0.65 + v(22, 2.5) * 0.35;
}
function buildPatches() {
  patchMask = new Uint8Array(N);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (patchNoise(c, r) > 0.57) patchMask[idx(c, r)] = 1;
  const isP = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS && patchMask[idx(c, r)] === 1;
  const R = CELL * 0.42, e = 0.3;                      // corner radius; tiny overlap so neighbouring chunks never show a seam
  const n = COLS / PATCH_CHUNK, chunks = [];
  for (let cy_ = 0; cy_ < n; cy_++) for (let cx_ = 0; cx_ < n; cx_++) {
    const P = new Path2D(), F = new Path2D();         // tiles, and the inside-corner fillets (filled separately so mirrored windings never cancel)
    for (let r = cy_ * PATCH_CHUNK; r < (cy_ + 1) * PATCH_CHUNK; r++) for (let c = cx_ * PATCH_CHUNK; c < (cx_ + 1) * PATCH_CHUNK; c++) {
      const x0 = c * CELL - e, y0 = r * CELL - e, x1 = (c + 1) * CELL + e, y1 = (r + 1) * CELL + e;
      const N_ = isP(c, r - 1), S_ = isP(c, r + 1), W_ = isP(c - 1, r), E_ = isP(c + 1, r);
      if (isP(c, r)) {
        // a patch tile: round each corner that sticks out (open on both of its sides)
        const tl = !N_ && !W_, tr = !N_ && !E_, br = !S_ && !E_, bl = !S_ && !W_;
        P.moveTo(x0 + (tl ? R : 0), y0);
        if (tr) { P.lineTo(x1 - R, y0); P.arcTo(x1, y0, x1, y0 + R, R); } else P.lineTo(x1, y0);
        if (br) { P.lineTo(x1, y1 - R); P.arcTo(x1, y1, x1 - R, y1, R); } else P.lineTo(x1, y1);
        if (bl) { P.lineTo(x0 + R, y1); P.arcTo(x0, y1, x0, y1 - R, R); } else P.lineTo(x0, y1);
        if (tl) { P.lineTo(x0, y0 + R); P.arcTo(x0, y0, x0 + R, y0, R); } else P.lineTo(x0, y0);
        P.closePath();
      } else {
        // open ground: fill the inside corner wherever patch wraps round it on two sides
        const fil = (cxp, cyp, sx, sy) => { F.moveTo(cxp + sx * R, cyp); F.lineTo(cxp, cyp); F.lineTo(cxp, cyp + sy * R); F.arcTo(cxp, cyp, cxp + sx * R, cyp, R); F.closePath(); };
        const X0 = c * CELL, Y0 = r * CELL, X1 = X0 + CELL, Y1 = Y0 + CELL;
        if (N_ && W_) fil(X0, Y0, 1, 1);
        if (N_ && E_) fil(X1, Y0, -1, 1);
        if (S_ && E_) fil(X1, Y1, -1, -1);
        if (S_ && W_) fil(X0, Y1, 1, -1);
      }
    }
    chunks.push([P, F]);
  }
  patchCache = chunks;
}
function drawPatches(vr) {
  if (!patchCache) buildPatches();
  const C = PATCH_CHUNK * CELL, n = COLS / PATCH_CHUNK;
  ctx.fillStyle = PAL.patch;
  for (let cy_ = Math.max(0, Math.floor(vr.y0 / C)); cy_ <= Math.min(n - 1, Math.floor(vr.y1 / C)); cy_++)
    for (let cx_ = Math.max(0, Math.floor(vr.x0 / C)); cx_ <= Math.min(n - 1, Math.floor(vr.x1 / C)); cx_++) { const ch = patchCache[cy_ * n + cx_]; ctx.fill(ch[0]); ctx.fill(ch[1]); }
}

/* ---- decorations on open ground. Each is drawn into context g at (X, Y) with size R (a tree's radius);
   k seeds any per-item variety. Shadows follow the same sun as everything else. */
const DECOR = {
  tree: 'Trees', pine: 'Pines', bush: 'Bushes', blossom: 'Blossom', autumn: 'Autumn trees', palm: 'Palms', cactus: 'Cacti',
  snowpine: 'Snowy pines', pumpkin: 'Pumpkins', mushroom: 'Mushrooms', flowers: 'Flowers', rock: 'Rocks', crystal: 'Crystals',
  topiary: 'Topiary', sunflower: 'Sunflowers', tulip: 'Tulips', lavender: 'Lavender', haybale: 'Hay bales', snowfolk: 'Snowballs', lantern: 'Lanterns', birch: 'Birches', willow: 'Willows', bamboo: 'Bamboo', coral: 'Coral', shell: 'Seashells', pond: 'Ponds', parasol: 'Parasols', balloon: 'Balloons', cupcake: 'Cupcakes', lollipop: 'Lollipops', gumdrop: 'Gumdrops', cloud: 'Clouds', bubble: 'Bubbles', crater: 'Craters', orchard: 'Fruit trees', firefly: 'Fireflies', planet: 'Planets',
  poppy: 'Poppies', daisy: 'Daisies', rosebush: 'Rose bushes', lemontree: 'Lemon trees', beehive: 'Beehives', acorn: 'Acorns', icecream: 'Ice creams', teacup: 'Teacups', cairn: 'Pebble stacks', donut: 'Donuts', bauble: 'Baubles', fountain: 'Fountains', jellyfish: 'Jellyfish', wisp: 'Wisps', ghostlight: 'Ghost lights'
};
function drawDecor(g, kind, X, Y, R, sway, k) {
  const sh = (x, y, rx, ry, h) => { g.globalAlpha = SUN.a; g.fillStyle = PAL.treeSh; g.beginPath(); g.ellipse(x + SUN.x * h, y + SUN.y * h, rx, ry, 0, 0, 6.3); g.fill(); g.globalAlpha = 1; };
  const dot = (x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill(); };
  const h1 = hash01(k, 41), h2 = hash01(k, 42), h3 = hash01(k, 43);
  switch (kind) {
    case 'pine': {
      sh(X, Y, R * 0.85, R * 0.85, R * 0.6);
      const layer = (rad, col, rot) => {
        g.fillStyle = col; g.beginPath();
        for (let i = 0; i < 16; i++) { const a = rot + i * Math.PI / 8, rr_ = i % 2 ? rad * 0.62 : rad; g.lineTo(X + sway + Math.cos(a) * rr_, Y + Math.sin(a) * rr_); }
        g.closePath(); gSoft(g);
      };
      layer(R, '#2f6a4a', h1); layer(R * 0.68, '#3d8259', h1 + 0.2); layer(R * 0.36, '#55a06e', h1 + 0.4);
      break;
    }
    case 'bush': {
      sh(X, Y + R * 0.1, R * 0.95, R * 0.6, R * 0.35);
      const parts = [[-0.45, 0.12, 0.55], [0.45, 0.16, 0.5], [0, -0.22, 0.62]];
      for (const [dx, dy, rr_] of parts) dot(X + dx * R + sway * 0.5, Y + dy * R, rr_ * R, PAL.tree2);
      for (const [dx, dy, rr_] of parts) dot(X + dx * R - rr_ * R * 0.2 + sway * 0.5, Y + dy * R - rr_ * R * 0.25, rr_ * R * 0.55, PAL.tree1);
      if (h1 < 0.4) for (let i = 0; i < 3; i++) dot(X + (hash01(k, 50 + i) - 0.5) * R * 1.2, Y + (hash01(k, 60 + i) - 0.5) * R * 0.8, R * 0.09, '#e8455a');
      break;
    }
    case 'blossom': case 'autumn': case 'tree': {
      let c2 = PAL.tree2, c1 = PAL.tree1;
      if (kind === 'blossom') { c2 = '#df90b0'; c1 = '#f6bfd3'; }
      if (kind === 'autumn') [c1, c2] = [['#e8963a', '#c9692c'], ['#ecc045', '#c99a2e'], ['#cf4f3a', '#a5372d']][Math.floor(h1 * 3)];
      sh(X, Y, R, R, R * 0.55);
      dot(X + sway, Y, R, c2); dot(X - R * 0.22 + sway, Y - R * 0.25, R * 0.66, c1);
      if (kind === 'blossom') for (let i = 0; i < 5; i++) dot(X + sway + (hash01(k, 70 + i) - 0.5) * R * 1.4, Y + (hash01(k, 80 + i) - 0.5) * R * 1.4, R * 0.1, '#fff4f8');
      break;
    }
    case 'palm': {
      sh(X, Y, R * 0.95, R * 0.95, R * 0.7);
      g.save(); g.translate(X + sway, Y); g.rotate(h1 * 6.3);
      for (let i = 0; i < 6; i++) {
        g.rotate(Math.PI / 3);
        g.fillStyle = i % 2 ? '#3f9a4a' : '#4fae58'; g.beginPath(); g.ellipse(R * 0.52, 0, R * 0.56, R * 0.2, 0, 0, 6.3); g.fill();
        g.strokeStyle = 'rgba(30,70,35,.5)'; g.lineWidth = Math.max(0.4, R * 0.05); g.beginPath(); g.moveTo(R * 0.1, 0); g.lineTo(R * 1.0, 0); g.stroke();
      }
      g.restore();
      dot(X + sway, Y, R * 0.2, '#8a5a2b'); dot(X + sway + R * 0.18, Y + R * 0.1, R * 0.12, '#6b4220'); dot(X + sway - R * 0.12, Y + R * 0.16, R * 0.12, '#6b4220');
      break;
    }
    case 'cactus': {
      sh(X, Y + R * 0.6, R * 0.55, R * 0.28, R * 0.6);
      const w = R * 0.42, col = '#5c9e4c', hi = '#7cbf68';
      g.fillStyle = col;
      rr_(g, X - w / 2, Y - R * 0.95, w, R * 1.6, w / 2);
      rr_(g, X - R * 0.62, Y - R * 0.15, R * 0.42, R * 0.24, R * 0.12); rr_(g, X - R * 0.62, Y - R * 0.6, R * 0.22, R * 0.6, R * 0.11);
      if (h1 > 0.3) { rr_(g, X + R * 0.2, Y - R * 0.35, R * 0.42, R * 0.24, R * 0.12); rr_(g, X + R * 0.4, Y - R * 0.75, R * 0.22, R * 0.6, R * 0.11); }
      g.fillStyle = hi; gsfr(g, X - w * 0.12, Y - R * 0.85, w * 0.18, R * 1.35);
      if (h2 > 0.55) dot(X, Y - R * 0.95, R * 0.14, '#ff6f91');
      break;
    }
    case 'snowpine': {                                  // a pine with snow settled on every tier
      sh(X, Y + R * 0.72, R * 0.78, R * 0.3, R * 0.35);
      g.fillStyle = '#6b4a2e'; gsfr(g, X - R * 0.13, Y + R * 0.45, R * 0.26, R * 0.4);           // trunk
      const tiers = [[0.62, 0.92, 0.82], [0.2, 0.72, 0.74], [-0.2, 0.5, 0.72]];               // [base y, half width, height] x R
      tiers.forEach(([by, w, h], i) => {
        const sx = sway * (0.3 + i * 0.35), bx = X + sx, base = Y + by * R, apex = base - h * R, hw_ = w * R;
        g.fillStyle = '#2f6a4a'; g.beginPath(); g.moveTo(bx, apex); g.lineTo(bx + hw_, base); g.lineTo(bx - hw_, base); g.closePath(); gSoft(g);
        g.fillStyle = '#3f8459'; g.beginPath(); g.moveTo(bx, apex); g.lineTo(bx + hw_, base); g.lineTo(bx + hw_ * 0.15, base); g.closePath(); gSoft(g);
        // snow cap: the top part of the tier, with a soft scalloped lower edge
        const sb = apex + h * R * 0.55, sw = hw_ * 0.55;
        g.fillStyle = '#fbfdff'; g.beginPath(); g.moveTo(bx, apex - 0.2); g.lineTo(bx + sw, sb); g.lineTo(bx - sw, sb); g.closePath(); gSoft(g);
        for (let j = 0; j < 3; j++) { const t = (j + 0.5) / 3; dot(bx - sw + sw * 2 * t, sb, sw * 0.36, '#fbfdff'); }
        g.fillStyle = 'rgba(150,180,205,.35)'; g.beginPath(); g.moveTo(bx, apex); g.lineTo(bx + sw, sb); g.lineTo(bx + sw * 0.3, sb); g.closePath(); gSoft(g);
      });
      if (h1 > 0.5) dot(X + sway, Y - R * 0.95, R * 0.12, '#fbfdff');
      break;
    }
    case 'pumpkin': {
      sh(X, Y + R * 0.2, R * 0.75, R * 0.5, R * 0.4);
      const o = '#ef8a22', od = '#cf6c14';
      g.fillStyle = od; g.beginPath(); g.ellipse(X - R * 0.32, Y, R * 0.42, R * 0.52, 0, 0, 6.3); g.ellipse(X + R * 0.32, Y, R * 0.42, R * 0.52, 0, 0, 6.3); g.fill();
      g.fillStyle = o; g.beginPath(); g.ellipse(X, Y, R * 0.42, R * 0.56, 0, 0, 6.3); g.fill();
      g.fillStyle = '#4c7a2e'; gsfr(g, X - R * 0.07, Y - R * 0.72, R * 0.14, R * 0.24);
      if (h1 > 0.45) {                                   // a jack-o'-lantern
        g.fillStyle = theme === 'dark' ? '#ffd35a' : '#5a2a08';
        for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(X + sx * R * 0.22, Y - R * 0.2); g.lineTo(X + sx * R * 0.08, Y - R * 0.02); g.lineTo(X + sx * R * 0.34, Y - R * 0.02); g.closePath(); gSoft(g); }
        gsfr(g, X - R * 0.26, Y + R * 0.14, R * 0.52, R * 0.1);
      }
      break;
    }
    case 'mushroom': {
      sh(X, Y + R * 0.3, R * 0.6, R * 0.35, R * 0.5);
      g.fillStyle = '#f2e8d6'; rr_(g, X - R * 0.18, Y - R * 0.15, R * 0.36, R * 0.6, R * 0.12);
      g.fillStyle = h1 > 0.5 ? '#d8443a' : '#b9702e'; g.beginPath(); g.ellipse(X, Y - R * 0.15, R * 0.62, R * 0.45, 0, Math.PI, 0); g.closePath(); gSoft(g);
      dot(X - R * 0.28, Y - R * 0.32, R * 0.09, '#fff'); dot(X + R * 0.12, Y - R * 0.45, R * 0.1, '#fff'); dot(X + R * 0.35, Y - R * 0.25, R * 0.07, '#fff');
      if (h2 > 0.5) { g.fillStyle = '#f2e8d6'; rr_(g, X + R * 0.45, Y + R * 0.05, R * 0.18, R * 0.32, R * 0.07); g.fillStyle = '#d8443a'; g.beginPath(); g.ellipse(X + R * 0.54, Y + R * 0.07, R * 0.28, R * 0.2, 0, Math.PI, 0); g.closePath(); gSoft(g); }
      break;
    }
    case 'flowers': {
      g.globalAlpha = 0.85; dot(X, Y, R * 0.7, PAL.tree1); g.globalAlpha = 1;
      const cols = ['#ff6b8b', '#ffd23a', '#ffffff', '#a77bff', '#ff9a3c'];
      for (let i = 0; i < 5; i++) {
        const fx = X + (hash01(k, 90 + i) - 0.5) * R * 1.2, fy = Y + (hash01(k, 95 + i) - 0.5) * R * 1.2, c = cols[Math.floor(hash01(k, 100 + i) * cols.length)];
        for (let j = 0; j < 5; j++) { const a = j * 1.2566; dot(fx + Math.cos(a) * R * 0.13, fy + Math.sin(a) * R * 0.13, R * 0.11, c); }
        dot(fx, fy, R * 0.08, '#f5b417');
      }
      break;
    }
    case 'crystal': {                                      // clusters of glowing crystal shards
      sh(X, Y, R * 0.6, R * 0.45, R * 0.5);
      const c1 = h1 < 0.5 ? '#8fd8ff' : '#c59bff', c2 = h1 < 0.5 ? '#5aa8e0' : '#9a6be0';
      const shard = (ox, oy, w, h, a) => {
        g.save(); g.translate(X + ox + sway * 0.3, Y + oy); g.rotate(a);
        g.fillStyle = c1; g.beginPath(); g.moveTo(0, -h); g.lineTo(w, -h * 0.35); g.lineTo(w * 0.6, 0); g.lineTo(-w * 0.6, 0); g.lineTo(-w, -h * 0.35); g.closePath(); gSoft(g);
        g.fillStyle = c2; g.beginPath(); g.moveTo(0, -h); g.lineTo(w, -h * 0.35); g.lineTo(w * 0.6, 0); g.lineTo(0, 0); g.closePath(); gSoft(g);
        g.restore();
      };
      shard(-R * 0.35, R * 0.25, R * 0.28, R * 0.9, -0.35); shard(R * 0.3, R * 0.3, R * 0.24, R * 0.75, 0.4); shard(0, R * 0.35, R * 0.34, R * 1.25, 0);
      break;
    }
    case 'rock': {
      sh(X, Y, R * 0.75, R * 0.6, R * 0.35);
      const base = theme === 'dark' ? '#5c6366' : '#9ba1a4', lite = theme === 'dark' ? '#737b7e' : '#b8bdc0';
      const poly = (sc, col, ox, oy) => {
        g.fillStyle = col; g.beginPath();
        for (let i = 0; i < 7; i++) { const a = i * 0.8976 + h1, rad = R * sc * (0.75 + hash01(k, 110 + i) * 0.3); g.lineTo(X + ox + Math.cos(a) * rad, Y + oy + Math.sin(a) * rad * 0.8); }
        g.closePath(); gSoft(g);
      };
      poly(0.75, base, 0, 0); poly(0.42, lite, -R * 0.15, -R * 0.15);
      if (h2 > 0.5) { poly(0.32, base, R * 0.62, R * 0.32); }
      break;
    }
    default: {                                             // p30 decorations: everything built from circles and ellipses
      const circ = (x, y, r) => { g.moveTo(x + r, y); g.arc(x, y, r, 0, 6.3); };
      const ell = (x, y, rx, ry, a) => { g.moveTo(x + Math.cos(a) * rx, y + Math.sin(a) * rx); g.ellipse(x, y, rx, ry, a, 0, 6.3); };
      const lc = g.lineCap, lw = v => Math.max(0.3, v);
      switch (kind) {
        case 'topiary': {
          sh(X, Y, R * 0.78, R * 0.78, R * 0.6);
          dot(X + sway, Y, R * 0.74, '#3f7a45'); dot(X - R * 0.16 + sway, Y - R * 0.18, R * 0.5, '#5a9c58'); dot(X - R * 0.3 + sway, Y - R * 0.32, R * 0.17, 'rgba(255,255,255,.28)');
          if (h1 > 0.45) { sh(X + R * 0.66, Y + R * 0.52, R * 0.34, R * 0.34, R * 0.3); dot(X + R * 0.66 + sway * 0.4, Y + R * 0.52, R * 0.34, '#3f7a45'); dot(X + R * 0.58 + sway * 0.4, Y + R * 0.44, R * 0.2, '#5a9c58'); }
          break;
        }
        case 'sunflower': {
          sh(X, Y, R * 0.8, R * 0.7, R * 0.4);
          g.fillStyle = '#5f9a4b'; g.beginPath(); for (let i = 0; i < 4; i++) { const a = h1 * 6 + i * 1.57; ell(X + Math.cos(a) * R * 0.45, Y + Math.sin(a) * R * 0.45, R * 0.36, R * 0.16, a); } g.fill();
          for (const [dx, dy, s_] of [[-0.28, -0.18, 0.62], [0.38, 0.22, 0.48]]) {
            const fx = X + dx * R + sway * 0.6, fy = Y + dy * R, r_ = s_ * R;
            g.fillStyle = '#ffc928'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * 0.785; ell(fx + Math.cos(a) * r_ * 0.55, fy + Math.sin(a) * r_ * 0.55, r_ * 0.38, r_ * 0.2, a); } g.fill();
            dot(fx, fy, r_ * 0.36, '#6b4220'); dot(fx - r_ * 0.1, fy - r_ * 0.1, r_ * 0.14, '#8a5a2b');
          }
          break;
        }
        case 'tulip': {
          g.globalAlpha = 0.8; dot(X, Y, R * 0.72, PAL.tree1); g.globalAlpha = 1;
          const cols = [['#e8455a', '#b8303f'], ['#ffb3c7', '#e07a98'], ['#ffd23a', '#d9a514'], ['#b07bff', '#7f52cc'], ['#ff8a3c', '#d4631c']];
          for (let i = 0; i < 5; i++) {
            const fx = X + (hash01(k, 300 + i) - 0.5) * R * 1.1 + sway * 0.5, fy = Y + (hash01(k, 310 + i) - 0.5) * R * 1.1, cc = cols[Math.floor(hash01(k, 320 + i) * cols.length)];
            g.fillStyle = '#4f8d3f'; g.beginPath(); ell(fx - R * 0.15, fy + R * 0.1, R * 0.17, R * 0.07, 0.6); ell(fx + R * 0.15, fy + R * 0.1, R * 0.17, R * 0.07, -0.6); g.fill();
            dot(fx, fy, R * 0.16, cc[1]); dot(fx, fy - R * 0.03, R * 0.1, cc[0]);
          }
          break;
        }
        case 'lavender': {
          sh(X, Y + R * 0.1, R * 0.9, R * 0.55, R * 0.25);
          g.fillStyle = '#7d9a5c'; rr_(g, X - R * 0.92, Y - R * 0.56, R * 1.84, R * 1.12, R * 0.5);
          for (let row = 0; row < 2; row++) for (let i = 0; i < 4; i++) {
            const fx = X - R * 0.64 + i * R * 0.42 + (row ? R * 0.16 : 0) + sway * 0.4, fy = Y - R * 0.22 + row * R * 0.46;
            dot(fx, fy, R * 0.2, '#8a6cc4'); dot(fx - R * 0.05, fy - R * 0.06, R * 0.12, '#b39ae6');
          }
          break;
        }
        case 'haybale': {
          const bale = (bx, by, s_, a0) => {
            sh(bx, by, s_, s_, s_ * 0.7); dot(bx, by, s_, '#d9b65a'); dot(bx - s_ * 0.07, by - s_ * 0.07, s_ * 0.86, '#e8c96e');
            g.strokeStyle = '#c29a3e'; g.lineWidth = lw(s_ * 0.08); g.lineCap = 'round'; g.beginPath();
            for (let t = 0; t <= 15; t += 0.5) { const rad = t / 15 * s_ * 0.78, a = t + a0; t ? g.lineTo(bx + Math.cos(a) * rad, by + Math.sin(a) * rad) : g.moveTo(bx, by); }
            g.stroke(); g.lineCap = lc;
          };
          bale(X, Y, R * 0.7, h1 * 6);
          if (h2 > 0.5) bale(X + R * 0.8, Y + R * 0.55, R * 0.42, h3 * 6);
          break;
        }
        case 'snowfolk': {                                 // a heap of snowballs (no snowmen: winter maps use snowy pines)
          sh(X, Y + R * 0.1, R * 0.7, R * 0.55, R * 0.45);
          for (const [dx, dy, r_] of [[-0.32, 0.2, 0.34], [0.3, 0.22, 0.3], [0, -0.12, 0.36], [0.05, 0.4, 0.22]]) {
            dot(X + dx * R + sway * 0.2, Y + dy * R, r_ * R, '#dfe9f0'); dot(X + (dx - 0.05) * R + sway * 0.2, Y + (dy - 0.05) * R, r_ * R * 0.82, '#fbfdff');
          }
          break;
        }
        case 'lantern': {
          const ga = theme === 'dark' ? 0.32 : 0.16;
          for (const [dx, dy, s_, c] of [[-0.28, -0.15, 0.42, h1 > 0.5 ? '#e8453c' : '#ff8a3c'], [0.38, 0.3, 0.32, '#ffb347']]) {
            const lx = X + dx * R + sway, ly = Y + dy * R, r_ = s_ * R;
            sh(lx, ly, r_, r_, R * 0.9);
            g.save(); g.globalCompositeOperation = 'lighter'; dot(lx, ly, r_ * 1.9, 'rgba(255,190,110,' + ga + ')'); g.restore();
            dot(lx, ly, r_, c);
            g.strokeStyle = 'rgba(120,30,20,.45)'; g.lineWidth = lw(R * 0.04); g.beginPath(); g.ellipse(lx, ly, r_ * 0.45, r_, 0, 0, 6.3); g.moveTo(lx, ly - r_); g.lineTo(lx, ly + r_); g.stroke();
            dot(lx - r_ * 0.3, ly - r_ * 0.35, r_ * 0.25, 'rgba(255,240,200,.55)'); dot(lx, ly, r_ * 0.2, '#3a2a22');
          }
          break;
        }
        case 'birch': {
          sh(X, Y, R * 0.88, R * 0.88, R * 0.55);
          g.fillStyle = '#f4f2ec'; rr_(g, X - R * 0.1, Y + R * 0.4, R * 0.2, R * 0.66, R * 0.1);
          dot(X - R * 0.02, Y + R * 0.92, R * 0.045, '#2b3036');
          dot(X + sway, Y, R * 0.84, '#9fbf5a'); dot(X - R * 0.22 + sway, Y - R * 0.24, R * 0.54, '#c3d97a'); dot(X + R * 0.3 + sway, Y + R * 0.2, R * 0.26, '#b2cf6a');
          g.fillStyle = '#e8e2a0'; g.beginPath(); for (let i = 0; i < 4; i++) ell(X + sway + (hash01(k, 360 + i) - 0.5) * R * 1.1, Y + (hash01(k, 365 + i) - 0.5) * R * 1.1, R * 0.12, R * 0.05, 1.3); g.fill();
          break;
        }
        case 'willow': {
          sh(X, Y, R, R, R * 0.5);
          dot(X + sway * 0.5, Y, R * 0.92, '#7fae5e');
          g.strokeStyle = '#a3ca80'; g.lineWidth = lw(R * 0.13); g.lineCap = 'round'; g.beginPath();
          for (let i = 0; i < 14; i++) { const a = i * 0.449 + h1, ca = Math.cos(a), sa = Math.sin(a); g.moveTo(X + ca * R * 0.2, Y + sa * R * 0.2); g.quadraticCurveTo(X + ca * R * 0.62 + sway, Y + sa * R * 0.55, X + ca * R * 0.8 + sway, Y + sa * R * 0.8 + R * 0.1); }
          g.stroke(); g.lineCap = lc;
          dot(X + sway * 0.5, Y, R * 0.24, '#bfe09a');
          break;
        }
        case 'bamboo': {
          sh(X, Y, R * 0.7, R * 0.7, R * 0.6);
          g.fillStyle = '#5f8f45'; g.beginPath(); for (let i = 0; i < 9; i++) { const a = i * 0.698 + h1 * 3; ell(X + Math.cos(a) * R * 0.55 + sway, Y + Math.sin(a) * R * 0.55, R * 0.4, R * 0.12, a); } g.fill();
          g.fillStyle = '#86b85c'; g.beginPath(); for (let i = 0; i < 6; i++) { const a = i * 1.047 + h1 * 3 + 0.4; ell(X + Math.cos(a) * R * 0.38 + sway, Y + Math.sin(a) * R * 0.38, R * 0.3, R * 0.1, a); } g.fill();
          for (const [dx, dy] of [[-0.18, -0.1], [0.16, -0.18], [0.02, 0.16], [-0.24, 0.24]]) { dot(X + dx * R + sway * 0.6, Y + dy * R, R * 0.12, '#a9cf6a'); dot(X + dx * R + sway * 0.6, Y + dy * R, R * 0.06, '#6f9a3c'); }
          break;
        }
        case 'coral': {
          sh(X, Y, R * 0.75, R * 0.6, R * 0.3);
          const cc = [['#ff8a75', '#ffb4a2'], ['#ff6f91', '#ffa8c0'], ['#ffb347', '#ffd59a']][Math.floor(h1 * 3)], P = [];
          for (let i = 0; i < 7; i++) { const a = i * 0.9 + h2 * 6, d = R * (0.15 + hash01(k, 330 + i) * 0.45); P.push([X + Math.cos(a) * d + sway * 0.3, Y + Math.sin(a) * d * 0.8, R * (0.2 + hash01(k, 340 + i) * 0.12)]); }
          g.fillStyle = cc[0]; g.beginPath(); for (const [x, y, r_] of P) circ(x, y, r_); g.fill();
          g.fillStyle = cc[1]; g.beginPath(); for (const [x, y, r_] of P) circ(x - r_ * 0.2, y - r_ * 0.2, r_ * 0.6); g.fill();
          g.fillStyle = 'rgba(140,40,50,.3)'; g.beginPath(); for (const [x, y, r_] of P) circ(x + r_ * 0.15, y + r_ * 0.1, r_ * 0.16); g.fill();
          break;
        }
        case 'shell': {
          const c1 = h2 > 0.5 ? '#f6d6c8' : '#f8e7c9', c2 = h2 > 0.5 ? '#e3a996' : '#dcb98a';
          sh(X, Y + R * 0.1, R * 0.55, R * 0.5, R * 0.18);
          g.save(); g.translate(X, Y + R * 0.25); g.rotate((h1 - 0.5) * 1.6);
          g.fillStyle = c1; g.beginPath(); for (let i = 0; i < 7; i++) { const a = -1.2 + i * 0.4; circ(Math.sin(a) * R * 0.52, -Math.cos(a) * R * 0.52, R * 0.17); } circ(0, -R * 0.24, R * 0.42); g.fill();
          g.fillStyle = c1; rr_(g, -R * 0.17, -R * 0.08, R * 0.34, R * 0.18, R * 0.08);
          g.strokeStyle = c2; g.lineWidth = lw(R * 0.05); g.lineCap = 'round'; g.beginPath(); for (let i = 0; i < 7; i++) { const a = -1.2 + i * 0.4; g.moveTo(0, 0); g.lineTo(Math.sin(a) * R * 0.56, -Math.cos(a) * R * 0.56); } g.stroke(); g.lineCap = lc;
          g.restore();
          break;
        }
        case 'pond': {
          dot(X, Y, R * 0.86, theme === 'dark' ? '#3f6b48' : '#a9c98f'); dot(X, Y, R * 0.7, PAL.water);
          g.fillStyle = 'rgba(255,255,255,.3)'; g.beginPath(); ell(X - R * 0.25, Y - R * 0.3, R * 0.22, R * 0.07, -0.4); g.fill();
          for (const [dx, dy, s_] of [[0.25, 0.15, 0.2], [-0.2, 0.3, 0.15]]) { dot(X + dx * R, Y + dy * R, s_ * R, '#4f9b4f'); dot(X + dx * R - s_ * R * 0.25, Y + dy * R - s_ * R * 0.25, s_ * R * 0.55, '#6fb35e'); }
          if (h1 > 0.4) dot(X + R * 0.25, Y + R * 0.15, R * 0.08, '#ff9ec7');
          break;
        }
        case 'parasol': {
          const pp = [['#e8453c', '#ffffff'], ['#2f7de1', '#ffffff'], ['#ffd23a', '#ff8a3c'], ['#3fbfad', '#fff3d6']][Math.floor(h1 * 4)];
          g.fillStyle = pp[0]; rr_(g, X - R * 0.3, Y + R * 0.15, R * 0.6, R * 0.85, R * 0.16); g.fillStyle = pp[1]; rr_(g, X - R * 0.3, Y + R * 0.5, R * 0.6, R * 0.16, R * 0.08);
          sh(X, Y, R * 0.8, R * 0.8, R * 0.9);
          for (let i = 0; i < 8; i++) { g.fillStyle = pp[i % 2]; g.beginPath(); g.moveTo(X + sway * 0.3, Y); g.arc(X + sway * 0.3, Y, R * 0.78, i * 0.785 + h2, (i + 1) * 0.785 + h2); g.closePath(); g.fill(); }
          dot(X + sway * 0.3, Y, R * 0.09, '#6b4a2e');
          break;
        }
        case 'balloon': {
          const cols = ['#e8453c', '#ffd23a', '#2f9bff', '#3fd16a', '#ff6fb5', '#a77bff'], B = [[-0.34, -0.32], [0.32, -0.4], [0.02, 0.02]].map(([dx, dy], i) => [X + dx * R + sway, Y + dy * R, R * 0.34, cols[Math.floor(hash01(k, 370 + i) * 6)]]);
          for (const [bx, by, s_] of B) sh(bx, by, s_ * 0.9, s_, R * 1.2);
          g.strokeStyle = 'rgba(70,70,70,.5)'; g.lineWidth = lw(R * 0.04); g.beginPath(); for (const [bx, by, s_] of B) { g.moveTo(bx, by + s_); g.quadraticCurveTo(bx, Y + R * 0.6, X, Y + R * 0.85); } g.stroke();
          dot(X, Y + R * 0.85, R * 0.06, '#6b5f55');
          for (const [bx, by, s_, c] of B) { g.fillStyle = c; g.beginPath(); g.ellipse(bx, by, s_ * 0.88, s_, 0, 0, 6.3); g.fill(); dot(bx, by + s_ * 0.98, s_ * 0.14, c); dot(bx - s_ * 0.3, by - s_ * 0.35, s_ * 0.22, 'rgba(255,255,255,.55)'); }
          break;
        }
        case 'cupcake': {
          const wrap = h1 > 0.5 ? '#9fd5f2' : '#f2b8cf', fr = ['#fff3f7', '#ffe08a', '#c9f2e3'][Math.floor(h2 * 3)];
          sh(X, Y, R * 0.66, R * 0.66, R * 0.45);
          g.fillStyle = wrap; g.beginPath(); circ(X, Y, R * 0.6); for (let i = 0; i < 12; i++) { const a = i * 0.5236; circ(X + Math.cos(a) * R * 0.6, Y + Math.sin(a) * R * 0.6, R * 0.1); } g.fill();
          dot(X, Y, R * 0.5, fr);
          g.strokeStyle = 'rgba(0,0,0,.09)'; g.lineWidth = lw(R * 0.07); g.lineCap = 'round'; g.beginPath(); for (let t = 0; t <= 12.6; t += 0.5) { const rad = R * 0.44 * (1 - t / 14), a = t; t ? g.lineTo(X + Math.cos(a) * rad, Y + Math.sin(a) * rad) : g.moveTo(X + rad, Y); } g.stroke();
          for (let i = 0; i < 6; i++) { g.strokeStyle = ['#ff6b8b', '#7fe3ff', '#ffd23a'][i % 3]; g.beginPath(); const a = i * 1.05 + h3 * 6, d = R * 0.32, bx = X + Math.cos(a) * d, by = Y + Math.sin(a) * d; g.moveTo(bx - R * 0.04, by - R * 0.03); g.lineTo(bx + R * 0.04, by + R * 0.03); g.stroke(); }
          g.lineCap = lc;
          dot(X + R * 0.04, Y - R * 0.04, R * 0.14, '#d8203a'); dot(X, Y - R * 0.09, R * 0.05, 'rgba(255,255,255,.7)');
          break;
        }
        case 'lollipop': {
          const c = ['#ff6b8b', '#7fe3ff', '#ffd23a', '#a77bff'][Math.floor(h1 * 4)], lx = X + sway * 0.4, ly = Y - R * 0.15;
          sh(lx, ly, R * 0.5, R * 0.5, R * 0.6);
          g.fillStyle = '#f4f2ec'; rr_(g, X - R * 0.05, Y + R * 0.1, R * 0.1, R * 0.8, R * 0.05);
          dot(lx, ly, R * 0.5, c);
          g.strokeStyle = '#ffffff'; g.lineWidth = lw(R * 0.1); g.lineCap = 'round'; g.beginPath(); for (let t = 0; t <= 15; t += 0.5) { const rad = t / 15 * R * 0.42, a = t + h2 * 6; t ? g.lineTo(lx + Math.cos(a) * rad, ly + Math.sin(a) * rad) : g.moveTo(lx, ly); } g.stroke(); g.lineCap = lc;
          dot(lx - R * 0.18, ly - R * 0.2, R * 0.08, 'rgba(255,255,255,.6)');
          break;
        }
        case 'gumdrop': {
          const cols = ['#ff6b8b', '#ffd23a', '#3fd16a', '#a77bff', '#ff8a3c', '#2f9bff'];
          for (const [dx, dy, s_, i] of [[-0.32, -0.15, 0.36, 0], [0.34, -0.05, 0.3, 1], [0, 0.35, 0.32, 2]]) {
            const bx = X + dx * R, by = Y + dy * R, r_ = s_ * R, c = cols[Math.floor(hash01(k, 380 + i) * 6)];
            sh(bx, by, r_, r_, r_ * 0.7); dot(bx, by, r_, c); g.globalAlpha = 0.35; dot(bx - r_ * 0.2, by - r_ * 0.2, r_ * 0.6, '#ffffff'); g.globalAlpha = 1;
            g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); for (let j = 0; j < 4; j++) circ(bx + (hash01(k + j, 390 + i) - 0.5) * r_ * 1.2, by + (hash01(k + j, 395 + i) - 0.5) * r_ * 1.2, r_ * 0.07); g.fill();
          }
          break;
        }
        case 'cloud': {
          const P = [[-0.42, 0.12, 0.38], [0.4, 0.14, 0.36], [0, -0.12, 0.48], [-0.05, 0.28, 0.36]], cx = X + sway * 1.5;
          g.globalAlpha = SUN.a * 0.8; g.fillStyle = PAL.treeSh; g.beginPath(); for (const [dx, dy, s_] of P) circ(cx + dx * R + SUN.x * R * 1.2, Y + dy * R + SUN.y * R * 1.2, s_ * R); g.fill(); g.globalAlpha = 1;
          g.fillStyle = '#dbe6f1'; g.beginPath(); for (const [dx, dy, s_] of P) circ(cx + dx * R, Y + dy * R + R * 0.06, s_ * R); g.fill();
          g.fillStyle = '#ffffff'; g.beginPath(); for (const [dx, dy, s_] of P) circ(cx + dx * R - R * 0.04, Y + dy * R - R * 0.03, s_ * R * 0.9); g.fill();
          break;
        }
        case 'bubble': {
          g.fillStyle = theme === 'dark' ? '#2f8a7a' : '#5fae8f'; g.beginPath(); for (let i = 0; i < 5; i++) ell(X + (i - 2) * R * 0.14 + sway * 0.5, Y + R * 0.45, R * 0.28, R * 0.07, -1.57 + (i - 2) * 0.35); g.fill();
          for (const [dx, dy, s_] of [[-0.25, -0.2, 0.3], [0.3, -0.35, 0.2], [0.1, 0.1, 0.16], [-0.35, 0.25, 0.12]]) {
            const bx = X + dx * R + sway, by = Y + dy * R, r_ = s_ * R;
            g.fillStyle = 'rgba(200,240,255,.16)'; g.strokeStyle = 'rgba(220,250,255,.8)'; g.lineWidth = lw(R * 0.05); g.beginPath(); g.arc(bx, by, r_, 0, 6.3); g.fill(); g.stroke();
            dot(bx - r_ * 0.35, by - r_ * 0.35, r_ * 0.22, 'rgba(255,255,255,.85)');
          }
          break;
        }
        case 'firefly': {
          sh(X, Y + R * 0.1, R * 0.8, R * 0.55, R * 0.3);
          for (const [dx, dy, r_] of [[-0.38, 0.1, 0.45], [0.38, 0.14, 0.42], [0, -0.18, 0.52]]) dot(X + dx * R + sway * 0.5, Y + dy * R, r_ * R, PAL.tree2);
          for (const [dx, dy, r_] of [[-0.38, 0.1, 0.45], [0.38, 0.14, 0.42], [0, -0.18, 0.52]]) dot(X + dx * R - r_ * R * 0.2 + sway * 0.5, Y + dy * R - r_ * R * 0.25, r_ * R * 0.55, PAL.tree1);
          g.save(); g.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 4; i++) { const tw = REDUCED_MOTION ? 0.8 : 0.5 + 0.5 * Math.sin(animT * 2.2 + k + i * 1.7), fx = X + (hash01(k, 400 + i) - 0.5) * R * 1.8, fy = Y + (hash01(k, 405 + i) - 0.5) * R * 1.6; dot(fx, fy, R * 0.28, 'rgba(255,225,110,' + (0.28 * tw).toFixed(2) + ')'); dot(fx, fy, R * 0.07, 'rgba(255,248,190,' + (0.4 + 0.6 * tw).toFixed(2) + ')'); }
          g.restore();
          break;
        }
        case 'crater': {
          const base = /^#[0-9a-f]{6}$/i.test(PAL.land) ? PAL.land : '#7d4632', dk = mixHex(base, '#000000', 0.22), lt = mixHex(base, '#ffffff', 0.16);
          const cr = (cx, cy, s_) => { dot(cx, cy, s_, lt); dot(cx + s_ * 0.08, cy + s_ * 0.08, s_ * 0.8, dk); dot(cx + s_ * 0.2, cy + s_ * 0.2, s_ * 0.58, mixHex(base, '#000000', 0.1)); };
          cr(X, Y, R * 0.72); if (h1 > 0.4) cr(X + R * 0.75, Y + R * 0.45, R * 0.3);
          g.fillStyle = lt; g.beginPath(); for (let i = 0; i < 3; i++) circ(X + (hash01(k, 410 + i) - 0.5) * R * 1.8, Y + (hash01(k, 415 + i) - 0.5) * R * 1.8, R * 0.08); g.fill();
          break;
        }
        case 'planet': {
          const pc = [['#f0b26a', '#ffd9a8', '#c59bff'], ['#7fc4e0', '#c9ecfb', '#ffd23a'], ['#e3799d', '#ffc2d6', '#9fe3d9']][Math.floor(h1 * 3)], s_ = R * 0.46, px = X + sway, py = Y, rot = -0.5 + h2 * 0.4;
          sh(px, py, s_, s_, R * 1.1);
          const ring = (a0, a1) => { g.save(); g.translate(px, py); g.rotate(rot); g.strokeStyle = pc[2]; g.lineWidth = lw(R * 0.1); g.beginPath(); g.ellipse(0, 0, s_ * 1.65, s_ * 0.5, 0, a0, a1); g.stroke(); g.restore(); };
          ring(Math.PI, 2 * Math.PI); dot(px, py, s_, pc[0]); dot(px - s_ * 0.3, py - s_ * 0.3, s_ * 0.45, pc[1]); ring(0, Math.PI);
          if (h3 > 0.4) { g.fillStyle = '#fff8d0'; g.beginPath(); for (let i = 0; i < 3; i++) circ(X + (hash01(k, 420 + i) - 0.5) * R * 2, Y + (hash01(k, 425 + i) - 0.5) * R * 2, R * 0.05); g.fill(); }
          break;
        }
        case 'orchard': {
          const fr = h1 < 0.5 ? '#e8453c' : '#ff9f1a';
          sh(X, Y, R, R, R * 0.55); dot(X + sway, Y, R, PAL.tree2); dot(X - R * 0.22 + sway, Y - R * 0.25, R * 0.66, PAL.tree1);
          for (let i = 0; i < 6; i++) { const a = i * 1.05 + h2 * 6, d = R * (0.3 + hash01(k, 350 + i) * 0.45), fx = X + Math.cos(a) * d + sway, fy = Y + Math.sin(a) * d; dot(fx, fy, R * 0.12, fr); dot(fx - R * 0.03, fy - R * 0.03, R * 0.045, 'rgba(255,255,255,.5)'); }
          break;
        }
        /* p40 decorations */
        case 'poppy': {
          g.globalAlpha = 0.8; dot(X, Y, R * 0.72, PAL.tree1); g.globalAlpha = 1;
          for (let i = 0; i < 5; i++) {
            const fx = X + (hash01(k, 500 + i) - 0.5) * R * 1.2 + sway * 0.5, fy = Y + (hash01(k, 505 + i) - 0.5) * R * 1.2, r_ = R * (0.14 + hash01(k, 510 + i) * 0.06);
            g.fillStyle = '#e0483e'; g.beginPath(); for (let q = 0; q < 4; q++) { const a = q * 1.571 + i; circ(fx + Math.cos(a) * r_ * 0.5, fy + Math.sin(a) * r_ * 0.5, r_ * 0.6); } g.fill();
            dot(fx, fy, r_ * 0.3, '#2b3036');
          }
          break;
        }
        case 'daisy': {
          g.globalAlpha = 0.8; dot(X, Y, R * 0.75, PAL.tree1); g.globalAlpha = 1;
          for (const [dx, dy, s_] of [[-0.3, -0.15, 0.34], [0.32, 0.1, 0.28], [-0.05, 0.35, 0.24]]) {
            const fx = X + dx * R + sway * 0.5, fy = Y + dy * R, r_ = s_ * R;
            g.fillStyle = '#ffffff'; g.beginPath(); for (let q = 0; q < 7; q++) { const a = q * 0.8976 + h1; ell(fx + Math.cos(a) * r_ * 0.6, fy + Math.sin(a) * r_ * 0.6, r_ * 0.42, r_ * 0.2, a); } g.fill();
            dot(fx, fy, r_ * 0.3, '#ffd23a'); dot(fx - r_ * 0.08, fy - r_ * 0.08, r_ * 0.12, '#fff1a8');
          }
          break;
        }
        case 'rosebush': {
          sh(X, Y + R * 0.1, R * 0.95, R * 0.6, R * 0.35);
          const parts = [[-0.45, 0.12, 0.55], [0.45, 0.16, 0.5], [0, -0.22, 0.62]];
          for (const [dx, dy, r_] of parts) dot(X + dx * R + sway * 0.5, Y + dy * R, r_ * R, '#3f7a45');
          for (const [dx, dy, r_] of parts) dot(X + dx * R - r_ * R * 0.2 + sway * 0.5, Y + dy * R - r_ * R * 0.25, r_ * R * 0.55, '#5a9c58');
          const rc = h1 > 0.6 ? ['#d8203a', '#ff6b8b'] : h1 > 0.3 ? ['#ff9ecb', '#ffd1e3'] : ['#ffd23a', '#fff1a8'];
          for (let i = 0; i < 5; i++) { const rx = X + (hash01(k, 520 + i) - 0.5) * R * 1.4 + sway * 0.5, ry = Y + (hash01(k, 525 + i) - 0.5) * R; dot(rx, ry, R * 0.15, rc[0]); dot(rx - R * 0.02, ry - R * 0.02, R * 0.09, rc[1]); dot(rx + R * 0.02, ry + R * 0.02, R * 0.04, rc[0]); }
          break;
        }
        case 'lemontree': {
          sh(X, Y, R, R, R * 0.55); dot(X + sway, Y, R, '#4f8d3f'); dot(X - R * 0.22 + sway, Y - R * 0.25, R * 0.66, '#6fae55');
          const P = []; for (let i = 0; i < 6; i++) { const a = i * 1.05 + h2 * 6, d = R * (0.3 + hash01(k, 530 + i) * 0.45); P.push([X + Math.cos(a) * d + sway, Y + Math.sin(a) * d, a]); }
          g.fillStyle = '#ffe066'; g.beginPath(); for (const [px, py, a] of P) ell(px, py, R * 0.14, R * 0.1, a); g.fill();
          g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); for (const [px, py] of P) circ(px - R * 0.04, py - R * 0.03, R * 0.04); g.fill();
          break;
        }
        case 'beehive': {
          sh(X, Y + R * 0.5, R * 0.7, R * 0.3, R * 0.4);
          g.fillStyle = '#8a5a2b'; rr_(g, X - R * 0.45, Y + R * 0.45, R * 0.9, R * 0.18, R * 0.09);
          [[0.45, 0.62, 0.2], [0.12, 0.7, 0.24], [-0.22, 0.62, 0.22], [-0.5, 0.46, 0.18]].forEach(([dy, rx, ry], i) => {
            g.fillStyle = i % 2 ? '#f2c14e' : '#e3a93a'; g.beginPath(); g.ellipse(X + sway * 0.1 * i, Y + dy * R, rx * R, ry * R, 0, 0, 6.3); g.fill();
            g.fillStyle = 'rgba(255,255,255,.28)'; g.beginPath(); g.ellipse(X - rx * R * 0.3, Y + dy * R - ry * R * 0.3, rx * R * 0.4, ry * R * 0.35, 0, 0, 6.3); g.fill();
          });
          dot(X, Y + R * 0.2, R * 0.11, '#5a3418');
          g.fillStyle = '#ffd23a'; g.beginPath(); for (let i = 0; i < 3; i++) circ(X + (hash01(k, 490 + i) - 0.5) * R * 1.8 + sway, Y - R * 0.3 + (hash01(k, 495 + i) - 0.5) * R * 1.2, R * 0.06); g.fill();
          break;
        }
        case 'acorn': {
          sh(X, Y + R * 0.2, R * 0.7, R * 0.45, R * 0.3);
          for (const [dx, dy, s_, i] of [[-0.3, 0.1, 0.5, 0], [0.35, 0.2, 0.4, 1]]) {
            const r_ = s_ * R;
            g.save(); g.translate(X + dx * R + sway * 0.3, Y + dy * R); g.rotate((hash01(k, 480 + i) - 0.5) * 0.8);
            g.fillStyle = '#b8794a'; g.beginPath(); g.ellipse(0, r_ * 0.2, r_ * 0.5, r_ * 0.62, 0, 0, 6.3); g.fill();
            dot(-r_ * 0.15, r_ * 0.15, r_ * 0.15, 'rgba(255,255,255,.3)');
            g.fillStyle = '#6b4220'; g.beginPath(); g.ellipse(0, -r_ * 0.25, r_ * 0.56, r_ * 0.36, 0, 0, 6.3); g.fill();
            g.fillStyle = '#8a5a2b'; g.beginPath(); for (let q = 0; q < 5; q++) circ(-r_ * 0.4 + q * r_ * 0.2, -r_ * 0.3 + (q % 2) * r_ * 0.12, r_ * 0.08); g.fill();
            g.fillStyle = '#6b4220'; rr_(g, -r_ * 0.07, -r_ * 0.75, r_ * 0.14, r_ * 0.3, r_ * 0.07);
            g.restore();
          }
          break;
        }
        case 'icecream': {
          const sc = [['#ffb3c7', '#fff3f7'], ['#c9f2e3', '#ffffff'], ['#ffe08a', '#fff8d0'], ['#8a5a3a', '#b9794a']], a_ = sc[Math.floor(h1 * 4)], b_ = sc[Math.floor(h2 * 4)];
          sh(X, Y + R * 0.4, R * 0.5, R * 0.3, R * 0.4);
          for (let i = 0; i < 4; i++) dot(X + sway * 0.2 * i, Y + R * 0.1 + i * R * 0.2, R * (0.42 - i * 0.1), '#d9a066');
          g.fillStyle = '#b8794a'; g.beginPath(); for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) circ(X - R * 0.12 + j * R * 0.24 + (i % 2) * R * 0.12, Y + R * 0.1 + i * R * 0.2, R * 0.035); g.fill();
          dot(X, Y - R * 0.15, R * 0.45, a_[0]); dot(X - R * 0.12, Y - R * 0.25, R * 0.16, a_[1]);
          dot(X + R * 0.05, Y - R * 0.65, R * 0.38, b_[0]); dot(X - R * 0.06, Y - R * 0.74, R * 0.13, b_[1]);
          dot(X + R * 0.1, Y - R * 1.0, R * 0.11, '#d8203a'); dot(X + R * 0.07, Y - R * 1.03, R * 0.04, 'rgba(255,255,255,.7)');
          break;
        }
        case 'teacup': {
          const cc = [['#ffffff', '#9fd5f2'], ['#fff3f7', '#ff9ecb'], ['#fbf8f1', '#ffd23a']][Math.floor(h1 * 3)];
          sh(X, Y + R * 0.3, R * 0.8, R * 0.35, R * 0.3);
          g.fillStyle = cc[0]; g.beginPath(); g.ellipse(X, Y + R * 0.35, R * 0.85, R * 0.3, 0, 0, 6.3); g.fill();
          g.strokeStyle = cc[1]; g.lineWidth = lw(R * 0.06); g.beginPath(); g.ellipse(X, Y + R * 0.35, R * 0.7, R * 0.22, 0, 0, 6.3); g.stroke();
          g.strokeStyle = cc[0]; g.lineWidth = lw(R * 0.13); g.lineCap = 'round'; g.beginPath(); g.arc(X + R * 0.55, Y - R * 0.05, R * 0.22, -1.4, 1.4); g.stroke(); g.lineCap = lc;
          g.fillStyle = cc[0]; rr_(g, X - R * 0.5, Y - R * 0.45, R, R * 0.8, R * 0.3);
          g.fillStyle = cc[1]; g.beginPath(); g.ellipse(X, Y - R * 0.42, R * 0.5, R * 0.2, 0, 0, 6.3); g.fill();
          g.fillStyle = '#b9733a'; g.beginPath(); g.ellipse(X, Y - R * 0.42, R * 0.38, R * 0.13, 0, 0, 6.3); g.fill();
          g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(X - R * 0.1, Y - R * 0.44, R * 0.14, R * 0.05, 0, 0, 6.3); g.fill();
          break;
        }
        case 'cairn': {
          const base = theme === 'dark' ? '#5c6366' : '#9ba1a4', lite = theme === 'dark' ? '#737b7e' : '#b8bdc0';
          sh(X, Y + R * 0.5, R * 0.75, R * 0.3, R * 0.3);
          for (const [dy, rx, ry, i] of [[0.55, 0.72, 0.32, 0], [0.1, 0.6, 0.28, 1], [-0.3, 0.46, 0.24, 2], [-0.62, 0.3, 0.18, 3]]) {
            const px = X + (hash01(k, 470 + i) - 0.5) * R * 0.12 + sway * 0.2 * i, py = Y + dy * R;
            g.fillStyle = i % 2 ? lite : base; g.beginPath(); g.ellipse(px, py, rx * R, ry * R, (hash01(k, 475 + i) - 0.5) * 0.3, 0, 6.3); g.fill();
            g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.ellipse(px - rx * R * 0.25, py - ry * R * 0.35, rx * R * 0.45, ry * R * 0.3, 0, 0, 6.3); g.fill();
          }
          if (h2 > 0.5) dot(X + R * 0.85, Y + R * 0.55, R * 0.16, base);
          break;
        }
        case 'donut': {
          const ic = [['#f2b8cf', '#ffffff'], ['#6b4220', '#ffd23a'], ['#9fd5f2', '#ffffff']][Math.floor(h1 * 3)], land = /^#[0-9a-f]{6}$/i.test(PAL.land) ? PAL.land : '#dde5cf';
          sh(X, Y, R * 0.8, R * 0.8, R * 0.4);
          dot(X, Y, R * 0.8, '#d9a066'); dot(X - R * 0.04, Y - R * 0.06, R * 0.7, ic[0]);
          dot(X, Y, R * 0.26, land);
          g.strokeStyle = ic[1]; g.lineWidth = lw(R * 0.07); g.lineCap = 'round'; g.beginPath();
          for (let i = 0; i < 7; i++) { const a = i * 0.9 + h2 * 6, d = R * (0.4 + hash01(k, 430 + i) * 0.2), bx = X + Math.cos(a) * d, by = Y + Math.sin(a) * d, b = hash01(k, 440 + i) * 3; g.moveTo(bx - Math.cos(b) * R * 0.08, by - Math.sin(b) * R * 0.08); g.lineTo(bx + Math.cos(b) * R * 0.08, by + Math.sin(b) * R * 0.08); }
          g.stroke(); g.lineCap = lc;
          break;
        }
        case 'bauble': {
          const cols = [['#e0483e', '#ff8a75'], ['#d4af37', '#fff1a8'], ['#2f7de1', '#7fe3ff'], ['#8a5bd6', '#c59bff']];
          for (const [dx, dy, s_, i] of [[-0.32, 0.15, 0.42, 0], [0.36, 0.2, 0.36, 1], [0.05, -0.3, 0.3, 2]]) {
            const bx = X + dx * R + sway * 0.3, by = Y + dy * R, r_ = s_ * R, c = cols[Math.floor(hash01(k, 460 + i) * 4)];
            sh(bx, by, r_, r_, r_ * 0.8);
            g.fillStyle = '#d4af37'; rr_(g, bx - r_ * 0.22, by - r_ * 1.15, r_ * 0.44, r_ * 0.3, r_ * 0.1);
            g.strokeStyle = '#d4af37'; g.lineWidth = lw(R * 0.04); g.beginPath(); g.arc(bx, by - r_ * 1.25, r_ * 0.16, 0, 6.3); g.stroke();
            dot(bx, by, r_, c[0]); g.fillStyle = c[1]; g.beginPath(); g.ellipse(bx, by, r_ * 0.95, r_ * 0.22, 0, 0, 6.3); g.fill();
            dot(bx - r_ * 0.35, by - r_ * 0.38, r_ * 0.22, 'rgba(255,255,255,.65)');
          }
          break;
        }
        case 'fountain': {
          dot(X, Y, R * 0.95, theme === 'dark' ? '#5a6168' : '#cfc8bb'); dot(X, Y, R * 0.78, '#5fb4d6');
          g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = lw(R * 0.05); g.beginPath(); g.arc(X, Y, R * 0.6, 0, 6.3); g.stroke();
          sh(X, Y, R * 0.26, R * 0.26, R * 0.5); dot(X, Y, R * 0.26, '#b4ada1'); dot(X - R * 0.05, Y - R * 0.05, R * 0.16, '#e3ddd2');
          g.strokeStyle = 'rgba(220,245,255,.85)'; g.lineWidth = lw(R * 0.07); g.lineCap = 'round'; g.beginPath();
          for (let i = 0; i < 6; i++) { const a = i * 1.047 + h1; g.moveTo(X, Y); g.quadraticCurveTo(X + Math.cos(a) * R * 0.25, Y + Math.sin(a) * R * 0.25 - R * 0.3, X + Math.cos(a) * R * 0.5, Y + Math.sin(a) * R * 0.5); }
          g.stroke(); g.lineCap = lc;
          g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); for (let i = 0; i < 6; i++) { const a = i * 1.047 + h1 + 0.5; circ(X + Math.cos(a) * R * 0.62, Y + Math.sin(a) * R * 0.62, R * 0.05); } g.fill();
          break;
        }
        case 'jellyfish': {
          const pc = h1 > 0.5 ? ['#c59bff', '#ffd1f0'] : ['#7fe3ff', '#e9fbff'], jx = X + sway * 1.5, jy = Y - R * 0.2 + (REDUCED_MOTION ? 0 : Math.sin(animT * 1.5 + k) * R * 0.08);
          g.save(); g.globalCompositeOperation = 'lighter'; dot(jx, jy, R * 0.95, rgba(pc[0], theme === 'dark' ? 0.16 : 0.08)); g.restore();
          g.strokeStyle = rgba(pc[0], 0.85); g.lineWidth = lw(R * 0.07); g.lineCap = 'round'; g.beginPath();
          for (let i = 0; i < 5; i++) { const tx_ = jx - R * 0.4 + i * R * 0.2, sg = i % 2 ? 1 : -1; g.moveTo(tx_, jy + R * 0.05); g.quadraticCurveTo(tx_ + sg * R * 0.18, jy + R * 0.5, tx_ - sg * R * 0.08 + sway, jy + R * 0.95); }
          g.stroke(); g.lineCap = lc;
          g.fillStyle = rgba(pc[0], 0.9); g.beginPath(); g.ellipse(jx, jy, R * 0.55, R * 0.42, 0, Math.PI, 0); g.fill();
          g.beginPath(); g.ellipse(jx, jy, R * 0.55, R * 0.14, 0, 0, 6.3); g.fill();
          dot(jx - R * 0.18, jy - R * 0.16, R * 0.14, rgba(pc[1], 0.7));
          break;
        }
        case 'wisp': {
          g.fillStyle = theme === 'dark' ? '#2a4a3e' : '#8fb37a'; g.beginPath(); for (let i = 0; i < 5; i++) ell(X + (i - 2) * R * 0.18 + sway * 0.5, Y + R * 0.5, R * 0.3, R * 0.07, -1.57 + (i - 2) * 0.3); g.fill();
          g.save(); g.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 3; i++) {
            const t = REDUCED_MOTION ? 0 : animT * 1.3 + k + i * 2.1, wx = X + (hash01(k, 450 + i) - 0.5) * R * 1.4 + sway * 1.5, wy = Y - R * 0.2 + (hash01(k, 455 + i) - 0.5) * R * 0.9 + (REDUCED_MOTION ? 0 : Math.sin(t) * R * 0.1), pulse = 0.6 + (REDUCED_MOTION ? 0.3 : 0.4 * Math.sin(t * 1.7));
            dot(wx, wy, R * 0.42, 'rgba(120,230,210,' + (0.16 * pulse).toFixed(2) + ')'); dot(wx, wy, R * 0.18, 'rgba(160,240,230,' + (0.5 * pulse).toFixed(2) + ')'); dot(wx, wy, R * 0.08, i === 1 ? '#9fe3d9' : '#bff3ff');
          }
          g.restore();
          break;
        }
        case 'ghostlight': {                               // p51: a hovering will-o'-the-wisp lantern: a soft green glow round a little rounded lantern with a pale flame
          const bob = REDUCED_MOTION ? 0 : Math.sin(animT * 1.6 + k) * R * 0.08, pulse = REDUCED_MOTION ? 0.8 : 0.7 + 0.3 * Math.sin(animT * 3.1 + k * 2), lx = X + sway, ly = Y - R * 0.25 + bob;
          sh(X, Y + R * 0.6, R * 0.4, R * 0.15, 0);
          g.save(); g.globalCompositeOperation = 'lighter';
          dot(lx, ly, R * 0.95, 'rgba(140,255,200,' + (0.14 * pulse).toFixed(2) + ')'); dot(lx, ly, R * 0.55, 'rgba(180,255,220,' + (0.2 * pulse).toFixed(2) + ')');
          g.restore();
          g.strokeStyle = '#4a4262'; g.lineWidth = lw(R * 0.06); g.beginPath(); g.arc(lx, ly - R * 0.56, R * 0.13, Math.PI, 0); g.stroke();
          g.fillStyle = '#3b3550'; rr_(g, lx - R * 0.3, ly - R * 0.38, R * 0.6, R * 0.76, R * 0.16); g.fill();
          g.fillStyle = '#4a4262'; rr_(g, lx - R * 0.22, ly - R * 0.52, R * 0.44, R * 0.16, R * 0.06); g.fill();
          g.fillStyle = 'rgba(200,255,225,' + (0.5 + 0.3 * pulse).toFixed(2) + ')'; rr_(g, lx - R * 0.2, ly - R * 0.28, R * 0.4, R * 0.56, R * 0.1); g.fill();
          g.fillStyle = '#9fffd0'; g.beginPath(); g.ellipse(lx, ly + R * 0.04, R * 0.1, R * 0.17 * (0.8 + 0.3 * pulse), 0, 0, 6.3); g.fill();
          dot(lx, ly + R * 0.08, R * 0.05, '#ffffff');
          break;
        }
      }
    }
  }
}
/* rounded rect on any context */
function rr_(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fill(); }

/* --------------------------------------------------------------- colour */
function rgbOf(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
function shade(hex, f) {
  const [r, g, b] = rgbOf(hex);
  const t = f < 0 ? 0 : 255, p = Math.abs(f);
  return 'rgb(' + Math.round(lerp(r, t, p)) + ',' + Math.round(lerp(g, t, p)) + ',' + Math.round(lerp(b, t, p)) + ')';
}
function rgba(hex, a) { const [r, g, b] = rgbOf(hex); return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; }
/* the game's soft look, used by every design: a rectangle with rounded corners (a thin strip becomes a pill),
   and a pointed shape whose corners are rounded off by a stroke in its own colour.
   Rounding is skipped where the corner would be under a pixel on screen, and the rounded shapes are kept for reuse. */
let softZ = 0;                                        // the drawing scale for that test (0: the camera's zoom)
const softPaths = new Map();
function gsfr(g, x, y, w, h) {
  if (w < 0) { x += w; w = -w; } if (h < 0) { y += h; h = -h; }
  const r = Math.min(w, h) * 0.38;
  if (r * (softZ || cam.z) < 0.8) { g.fillRect(x, y, w, h); return; }
  const key = x + ',' + y + ',' + w + ',' + h;
  let p = softPaths.get(key);
  if (!p) {
    if (softPaths.size > 3000) softPaths.clear();
    p = new Path2D(); if (p.roundRect) p.roundRect(x, y, w, h, r); else p.rect(x, y, w, h); softPaths.set(key, p);
  }
  g.fill(p);
}
const sfr = (x, y, w, h) => gsfr(ctx, x, y, w, h);
function gSoft(g, lw) { g.fill(); g.save(); g.lineJoin = 'round'; g.lineWidth = lw || 0.9; g.strokeStyle = g.fillStyle; g.stroke(); g.restore(); }
const softFill = lw => gSoft(ctx, lw);
function rr(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
}
/* rr without starting a new path, so several shapes can share one fill */
function rrp(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
}
/* One sun for the whole map: every shadow falls the same way, a little longer and softer through the
   morning and evening, and fades out at night. SUN.x/y is the world offset per unit of height. */
const SUN = {x: 0.55, y: 0.8, a: 1};
function updateSun() {
  const p = nightOn ? dayPhase() : 0, sw = Math.sin(p * Math.PI * 2);   // 0 at noon, ±1 at dawn and dusk
  const ang = Math.PI * 0.31 - sw * 0.38, len = 1 + Math.abs(sw) * 0.45;
  SUN.x = Math.cos(ang) * len; SUN.y = Math.sin(ang) * len;
  SUN.a = 1 - nightAmount() * 0.6;
}
/* a solid shadow for rounded boxes standing `h` high, drawn as the sweep from the base to the offset copy so
   it stays joined to its object. (x, y, ang, sc) is the object's own frame; rects are in that frame. */
function dropShadow(x, y, ang, sc, h, rects, alphaMul) {
  if (gfx.shadows === 'off') return;
  const ox = SUN.x * h, oy = SUN.y * h, c = Math.cos(ang), s = Math.sin(ang);
  const lx = (ox * c + oy * s) / sc, ly = (-ox * s + oy * c) / sc, steps = gfx.shadows === 'simple' ? 1 : h > 3 ? 5 : 3;
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); if (sc !== 1) ctx.scale(sc, sc);
  ctx.beginPath();
  for (const [rx, ry, rw, rh, r] of rects) for (let i = 1; i <= steps; i++) { const t = i / steps; rrp(rx + lx * t, ry + ly * t, rw, rh, r); }
  ctx.globalAlpha = SUN.a * (alphaMul === undefined ? 1 : alphaMul); ctx.fillStyle = PAL.sh; ctx.fill();
  ctx.restore();
}
/* a round shadow (trees, cones, sign posts, badges) */
function dotShadow(x, y, r, h) {
  if (gfx.shadows === 'off') return;
  ctx.globalAlpha = SUN.a; ctx.fillStyle = PAL.sh;
  ctx.beginPath(); ctx.arc(x + SUN.x * h, y + SUN.y * h, r, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
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
  for (const b of buildings) conn(b.door >= 0 ? b.door : b.k, b.acc);
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
  drawPatches(vr);
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
  const dk = decorKind();
  for (let r = vr.r0; r <= vr.r1; r++) for (let c = vr.c0; c <= vr.c1; c++) {
    const k = idx(c, r);
    if (water[k] || occupied(k) || hash01(k, 1) > CFG.treeDensity * gfx.decor) continue;
    let ok = true;
    for (let d = 0; d < 8 && ok; d++) { const n = nbr(k, d); if (n >= 0 && (road[n] || bAt[n] >= 0 || parkAt[n] >= 0 || depotAt[n] >= 0)) ok = false; }
    if (!ok) continue;
    const X = (c + 0.5 + (hash01(k, 2) - 0.5) * 0.4) * CELL, Y = (r + 0.5 + (hash01(k, 7) - 0.5) * 0.4) * CELL, R = 6 + hash01(k, 8) * 4;
    const sway = Math.sin(animT * 0.8 + k) * 0.35;
    drawDecor(ctx, dk, X, Y, R, sway, k);
  }
}

/* --------------------------------------------------------------- roads */
function drawRoads() {
  if (pathCache.ver !== netVer) buildPaths();
  const P = pathCache, RW = CFG.roadWidth, wet = rain.amt;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // shadow
  ctx.save(); ctx.globalAlpha = SUN.a; ctx.translate(SUN.x * 1.8, SUN.y * 1.8); ctx.strokeStyle = PAL.sh; ctx.lineWidth = RW + 3.4; ctx.stroke(P.all);
  ctx.lineCap = 'butt'; ctx.lineWidth = CFG.driveWidth + 3.4; ctx.stroke(P.drive); ctx.restore(); ctx.lineCap = 'round';
  // bridge parapets, with the deck's shadow on the water
  ctx.save(); ctx.globalAlpha = SUN.a; ctx.translate(SUN.x * 4, SUN.y * 4); ctx.strokeStyle = PAL.sh; ctx.lineWidth = RW + 7; ctx.stroke(P.bridge); ctx.restore();
  bridgeParapet(P.bridge);
  // motorway deck
  if (motorways.length && showMoto) {
    ctx.save(); ctx.globalAlpha = SUN.a; ctx.translate(SUN.x * 7, SUN.y * 7); ctx.strokeStyle = PAL.sh; ctx.lineWidth = 16; ctx.stroke(P.moto); ctx.restore();
  }
  const rdz = design('road');
  if (rdz === 'neon' || rdz === 'lava') { ctx.save(); ctx.shadowColor = PAL.edge; ctx.shadowBlur = 7; }
  ctx.strokeStyle = PAL.edge; ctx.lineWidth = RW + 3.4; ctx.stroke(P.all);
  ctx.lineCap = 'butt'; ctx.lineWidth = CFG.driveWidth + 3.4; ctx.stroke(P.drive); ctx.lineCap = 'round';   // driveways: building door to road
  if (rdz === 'neon' || rdz === 'lava') ctx.restore();
  ctx.fillStyle = PAL.edge;
  ctx.save(); ctx.lineWidth = 3.4; ctx.strokeStyle = PAL.edge; ctx.stroke(P.disc); ctx.restore();
  ctx.strokeStyle = wet > 0.2 ? PAL.roadWet : PAL.road; ctx.lineWidth = RW; ctx.stroke(P.all);
  ctx.fillStyle = wet > 0.2 ? PAL.roadWet : PAL.road; ctx.fill(P.disc);
  ctx.lineCap = 'butt'; ctx.lineWidth = CFG.driveWidth; ctx.stroke(P.drive); ctx.lineCap = 'round';
  roadTexture(P.all, P.bridge);
  ctx.strokeStyle = PAL.lane; ctx.lineWidth = 1.3; ctx.setLineDash([4.5, 5]); ctx.globalAlpha = 0.85; ctx.stroke(P.dash);
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  ctx.strokeStyle = PAL.stop; ctx.lineWidth = 1.8; ctx.lineCap = 'butt'; ctx.stroke(P.stop); ctx.lineCap = 'round';
  if (motorways.length && showMoto) paintMoto(P.moto, P.motoDash, P.pillars);
  // unlinked road stubs and bridges' little posts are implicit in the passes above
}
/* a motorway deck, per motorway design (custom colours still win over the design's own colours) */
function paintMoto(path, dash, pillars) {
  const md = design('moto'), custom = !!mapPrefs.moto;
  ctx.save(); ctx.lineCap = 'round';
  ctx.strokeStyle = PAL.deckEdge; ctx.lineWidth = 15; ctx.stroke(path);
  const mg = GEN_P.moto[md];
  if (mg && !custom) {
    const sw = (i, W) => W - i * W / (mg.length + 0.7), xs = [].concat(mg.x || []);
    if (mg.glow) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(xs[0], 0.15); ctx.lineWidth = 19; ctx.stroke(path); ctx.restore(); }
    mg.forEach((c, i) => { ctx.strokeStyle = c; ctx.lineWidth = sw(i, 12.6); ctx.stroke(path); });
    if (mg.k === 'edge' || mg.k === 'flowers') {          // round lamps / blooms peeping out along both edges
      ctx.lineWidth = 13.4; const per = mg.k === 'edge' ? 10 : 7 * xs.length;
      xs.forEach((c, i) => { ctx.strokeStyle = c; ctx.setLineDash([0.01, per]); ctx.lineDashOffset = -i * 7; ctx.stroke(path); });
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
      mg.forEach((c, i) => { ctx.strokeStyle = c; ctx.lineWidth = sw(i, 10.2); ctx.stroke(path); });
    } else if (mg.k === 'rails') { ctx.strokeStyle = xs[0]; ctx.lineWidth = 10.6; ctx.stroke(path); mg.forEach((c, i) => { ctx.strokeStyle = c; ctx.lineWidth = sw(i, 9.2); ctx.stroke(path); }); }   // a thin line inside each edge
    else if (mg.k === 'pills') { ctx.strokeStyle = xs[0]; ctx.lineWidth = 13.4; ctx.setLineDash([2, 16]); ctx.stroke(path); ctx.setLineDash([]); mg.forEach((c, i) => { ctx.strokeStyle = c; ctx.lineWidth = sw(i, 10.2); ctx.stroke(path); }); }   // rounded segments along both edges
    else if (mg.k === 'centre') { ctx.lineWidth = 3.4; if (xs.length > 1) { ctx.lineCap = 'butt'; xs.forEach((c, i) => { ctx.strokeStyle = c; ctx.setLineDash([8, 8 * (xs.length - 1)]); ctx.lineDashOffset = -i * 8; ctx.stroke(dash); }); ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.lineCap = 'round'; } else { ctx.strokeStyle = xs[0]; ctx.stroke(dash); } }   // a soft band down the middle
    else if (mg.k === 'dots') { ctx.strokeStyle = xs[0]; ctx.lineWidth = 2.2; ctx.setLineDash([0.01, 13]); ctx.lineDashOffset = 3; ctx.stroke(dash); ctx.setLineDash([]); ctx.lineDashOffset = 0; }   // in the gaps of the lane dashes
  }
  else if (md === 'rainbow' && !custom) {
    ['#ff4d4d', '#ff9f1a', '#ffd23a', '#3fd16a', '#2f9bff', '#8a5bff'].forEach((c, i) => { ctx.strokeStyle = c; ctx.lineWidth = 12.6 - i * 2.1; ctx.stroke(path); });
  } else if (md === 'sunset' && !custom) {
    ['#ffcf5c', '#ff8a5c', '#e3527a', '#8a4fb0'].forEach((c, i) => { ctx.strokeStyle = c; ctx.lineWidth = 12.6 - i * 3; ctx.stroke(path); });
  } else if (md === 'aurora' && !custom) {                 // green, cyan and violet ribbons, shimmering
    ['#3dffb0', '#2fd6ff', '#7a5bff', '#d65bff'].forEach((c, i) => { ctx.strokeStyle = c; ctx.lineWidth = 12.6 - i * 3; ctx.stroke(path); });
    if (!REDUCED_MOTION) { ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 12; ctx.setLineDash([2, 18]); ctx.lineDashOffset = -animT * 30; ctx.stroke(path); ctx.setLineDash([]); ctx.lineDashOffset = 0; }
  } else { ctx.strokeStyle = PAL.deck; ctx.lineWidth = 12.6; ctx.stroke(path); }
  if (md === 'glass') { ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 13.6; ctx.setLineDash([8, 12]); ctx.lineCap = 'butt'; ctx.stroke(path); ctx.setLineDash([]); ctx.lineCap = 'round'; ctx.strokeStyle = PAL.deck; ctx.lineWidth = 11; ctx.stroke(path); }
  if (md === 'skyline') {                                  // glowing edges and pulses of light racing along
    ctx.save(); ctx.shadowColor = '#00e1ff'; ctx.shadowBlur = 8; ctx.strokeStyle = '#00e1ff'; ctx.lineWidth = 14; ctx.globalAlpha = 0.5; ctx.stroke(path); ctx.restore();
    ctx.strokeStyle = PAL.deck; ctx.lineWidth = 12; ctx.stroke(path);
    if (!REDUCED_MOTION) { ctx.strokeStyle = 'rgba(255,61,242,.9)'; ctx.lineWidth = 2; ctx.setLineDash([3, 26]); ctx.lineDashOffset = -animT * 60; ctx.stroke(dash); ctx.setLineDash([]); ctx.lineDashOffset = 0; }
  }
  if (md === 'ivy') {                                      // leafy hedges along both edges
    ctx.strokeStyle = '#6fb35e'; ctx.lineWidth = 14.5; ctx.setLineDash([1.6, 2.4]); ctx.lineCap = 'round'; ctx.stroke(path);
    ctx.setLineDash([]); ctx.strokeStyle = PAL.deck; ctx.lineWidth = 10.4; ctx.stroke(path);
  }
  if (md === 'concrete') { ctx.strokeStyle = 'rgba(0,0,0,.14)'; ctx.lineWidth = 12.6; ctx.setLineDash([0.6, 9]); ctx.lineCap = 'butt'; ctx.stroke(path); ctx.setLineDash([]); ctx.lineCap = 'round'; }
  ctx.strokeStyle = md === 'lights' ? 'rgba(255,214,120,.95)' : 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.4; ctx.setLineDash([7, 6]); ctx.stroke(dash); ctx.setLineDash([]);
  if (md === 'lights') {                                   // a row of street lamps glowing along the deck
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,220,140,.35)'; ctx.lineWidth = 6; ctx.setLineDash([0.1, 22]); ctx.stroke(dash);
    ctx.strokeStyle = 'rgba(255,240,200,.9)'; ctx.lineWidth = 2; ctx.stroke(dash); ctx.setLineDash([]);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (pillars) { ctx.fillStyle = PAL.deckEdge; ctx.fill(pillars); }
  ctx.restore();
}
/* the surface texture each road design adds on top of its colour */
function roadTexture(path, bridgePath) {
  const RW = CFG.roadWidth, rd = design('road');
  if (rd === 'cobble') {                                   // rows of setts
    ctx.save(); ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = RW - 4; ctx.setLineDash([2.2, 2.4]); ctx.stroke(path);
    ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = RW - 10; ctx.lineDashOffset = 2.3; ctx.stroke(path);
    ctx.restore();
  } else if (rd === 'dirt') {                              // two worn wheel tracks and loose grit
    ctx.save(); ctx.strokeStyle = 'rgba(90,60,30,.18)'; ctx.lineWidth = RW * 0.55; ctx.stroke(path);
    ctx.strokeStyle = PAL.road; ctx.lineWidth = RW * 0.3; ctx.stroke(path);
    ctx.strokeStyle = 'rgba(70,45,20,.22)'; ctx.lineWidth = RW - 6; ctx.setLineDash([0.8, 4.6]); ctx.stroke(path);
    ctx.restore();
  } else if (rd === 'concrete') {                          // expansion joints between slabs
    ctx.save(); ctx.lineCap = 'butt'; ctx.strokeStyle = 'rgba(0,0,0,.16)'; ctx.lineWidth = RW; ctx.setLineDash([0.7, 11]); ctx.stroke(path); ctx.restore();
  } else if (rd === 'brick' || rd === 'gold') {            // pavers laid in rows, the yellow brick road with a shimmer
    ctx.save(); ctx.lineCap = 'butt';
    ctx.strokeStyle = rd === 'gold' ? 'rgba(120,85,10,.35)' : 'rgba(255,235,215,.28)'; ctx.lineWidth = RW - 2; ctx.setLineDash([0.6, 2.6]); ctx.stroke(path);
    ctx.lineWidth = RW - 9; ctx.lineDashOffset = 1.6; ctx.stroke(path);
    if (rd === 'gold' && !REDUCED_MOTION) { ctx.setLineDash([2, 40]); ctx.lineDashOffset = -animT * 30; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = RW - 6; ctx.stroke(path); }
    ctx.restore();
  } else if (rd === 'candy') {                             // sugar sprinkles
    ctx.save(); ctx.lineCap = 'round';
    ['#ff6b8b', '#6bc8ff', '#ffd23a', '#9be36b'].forEach((c2, i) => { ctx.strokeStyle = c2; ctx.lineWidth = 0.9; ctx.setLineDash([0.4, 9 + i]); ctx.lineDashOffset = i * 2.3; ctx.stroke(path); });
    ctx.restore();
  } else if (rd === 'boardwalk') {                         // planks across the way
    ctx.save(); ctx.lineCap = 'butt'; ctx.strokeStyle = 'rgba(70,45,20,.38)'; ctx.lineWidth = RW; ctx.setLineDash([0.7, 2.4]); ctx.stroke(path); ctx.restore();
  } else if (rd === 'racetrack') {                         // red-and-white kerbs and a chequered feel
    ctx.save(); ctx.lineCap = 'butt';
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = RW + 3.4; ctx.setLineDash([4, 4]); ctx.stroke(path);
    ctx.setLineDash([]); ctx.strokeStyle = PAL.road; ctx.lineWidth = RW; ctx.lineCap = 'round'; ctx.stroke(path);
    ctx.restore();
  } else if (rd === 'snowy') {                             // packed snow with grey tyre tracks
    ctx.save(); ctx.strokeStyle = 'rgba(120,140,155,.28)'; ctx.lineWidth = RW * 0.55; ctx.stroke(path);
    ctx.strokeStyle = PAL.road; ctx.lineWidth = RW * 0.28; ctx.stroke(path); ctx.restore();
  } else if (rd === 'neon') {                              // a soft glow running down the middle
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(0,225,255,.08)'; ctx.lineWidth = RW - 6; ctx.stroke(path); ctx.restore();
  }
  if (bridgePath && design('bridge') === 'covered') {      // a covered bridge: a shingled roof over the crossing
    ctx.save(); ctx.lineCap = 'butt'; ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#9b3d2c'; ctx.lineWidth = RW + 5; ctx.stroke(bridgePath);
    ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = RW + 5; ctx.setLineDash([0.6, 2]); ctx.stroke(bridgePath);
    ctx.setLineDash([]); ctx.strokeStyle = 'rgba(255,220,190,.55)'; ctx.lineWidth = 1; ctx.stroke(bridgePath);
    ctx.restore();
  }
  if (bridgePath && (design('bridge') === 'wood' || design('bridge') === 'rope')) {   // wooden and rope bridges show their planks
    ctx.save(); ctx.lineCap = 'butt'; ctx.strokeStyle = 'rgba(90,55,25,.35)'; ctx.lineWidth = RW; ctx.setLineDash([0.8, 2.6]); ctx.stroke(bridgePath); ctx.restore();
  }
}
/* the sides of a bridge, per bridge design */
function bridgeParapet(path) {
  const RW = CFG.roadWidth, bd = design('bridge');
  ctx.save(); ctx.lineCap = 'round';
  const bg = GEN_P.bridge[bd];
  if (bg) {
    if (bg.glow) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(bg.glow, 0.13); ctx.lineWidth = RW + 12; ctx.stroke(path); ctx.restore(); }
    ctx.strokeStyle = bg[0]; ctx.lineWidth = RW + 7.5; ctx.stroke(path);
    if (bg.k === 'beads') { ctx.strokeStyle = bg[1]; ctx.lineWidth = RW + 8.4; ctx.setLineDash([0.01, bg.gap || 8]); ctx.stroke(path); }        // round-capped dots: soft scallops along both rails
    else if (bg.k === 'flowers') { ctx.lineCap = 'butt'; bg.c.forEach((c, i) => { ctx.strokeStyle = c; ctx.setLineDash([1.8, 5 * bg.c.length - 1.8]); ctx.lineDashOffset = -i * 5; ctx.stroke(path); }); ctx.lineDashOffset = 0; }   // little blooms of each colour in turn
    else if (bg.k === 'bands') { ctx.strokeStyle = bg[1]; ctx.setLineDash([4, 4]); ctx.lineCap = 'butt'; ctx.stroke(path); }
    else if (bg.k === 'links') { ctx.strokeStyle = bg[1]; ctx.lineCap = 'butt'; ctx.setLineDash([7, 2]); ctx.stroke(path); ctx.lineCap = 'round'; ctx.strokeStyle = bg[0]; ctx.setLineDash([0.01, 9]); ctx.lineDashOffset = -8; ctx.stroke(path); ctx.lineDashOffset = 0; }   // segments with rounded ends
    else if (bg.k === 'twinrail') { ctx.strokeStyle = bg[1]; ctx.lineWidth = RW + 9.6; ctx.stroke(path); ctx.strokeStyle = bg[0]; ctx.lineWidth = RW + 7.5; ctx.stroke(path); }   // a thin outer rim in a second colour
    else if (bg.k === 'chain') { ctx.strokeStyle = bg[1]; ctx.lineWidth = RW + 9.4; ctx.setLineDash([0.01, 16]); ctx.stroke(path); ctx.lineWidth = RW + 7.2; ctx.lineDashOffset = -8; ctx.stroke(path); ctx.lineDashOffset = 0; }   // big and small beads in turn
    else { ctx.strokeStyle = bg[1]; ctx.setLineDash([1.6, 3.4]); ctx.lineCap = 'butt'; ctx.stroke(path); }
    ctx.setLineDash([]); ctx.lineCap = 'round'; ctx.strokeStyle = bg[2]; ctx.lineWidth = RW + 3.6; ctx.stroke(path);
  } else if (bd === 'wood') {
    ctx.strokeStyle = '#7a4f2b'; ctx.lineWidth = RW + 7; ctx.stroke(path);
    ctx.strokeStyle = '#a0703f'; ctx.lineWidth = RW + 4.4; ctx.setLineDash([1.1, 2.4]); ctx.lineCap = 'butt'; ctx.stroke(path);
  } else if (bd === 'steel') {
    ctx.strokeStyle = '#a93226'; ctx.lineWidth = RW + 8; ctx.stroke(path);
    ctx.strokeStyle = '#d24a3a'; ctx.lineWidth = RW + 8; ctx.setLineDash([2, 4]); ctx.lineCap = 'butt'; ctx.stroke(path);
    ctx.setLineDash([]); ctx.strokeStyle = '#7b1f17'; ctx.lineWidth = RW + 3.6; ctx.stroke(path);
  } else if (bd === 'brick') {
    ctx.strokeStyle = '#a5523b'; ctx.lineWidth = RW + 7.5; ctx.stroke(path);
    ctx.strokeStyle = 'rgba(255,225,200,.45)'; ctx.lineWidth = RW + 7.5; ctx.setLineDash([0.5, 2.2]); ctx.lineCap = 'butt'; ctx.stroke(path);
    ctx.setLineDash([]); ctx.strokeStyle = '#7d3a28'; ctx.lineWidth = RW + 3.6; ctx.stroke(path);
  } else if (bd === 'covered') {
    ctx.strokeStyle = '#7a4a2a'; ctx.lineWidth = RW + 7; ctx.stroke(path);
  } else if (bd === 'rope') {
    ctx.strokeStyle = '#c9a46a'; ctx.lineWidth = RW + 6; ctx.stroke(path);
    ctx.strokeStyle = '#7d5a2e'; ctx.lineWidth = RW + 6; ctx.setLineDash([0.9, 3.2]); ctx.lineCap = 'butt'; ctx.stroke(path);
    ctx.setLineDash([]); ctx.strokeStyle = '#a07a45'; ctx.lineWidth = RW + 2.4; ctx.stroke(path);
  } else if (bd === 'glass') {
    ctx.strokeStyle = 'rgba(160,215,240,.75)'; ctx.lineWidth = RW + 8; ctx.stroke(path);
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = RW + 8; ctx.setLineDash([6, 10]); ctx.lineCap = 'butt'; ctx.stroke(path);
    ctx.setLineDash([]); ctx.strokeStyle = 'rgba(70,140,170,.55)'; ctx.lineWidth = RW + 3.6; ctx.stroke(path);
  } else if (bd === 'rainbow') {
    const rb = ['#ff4d4d', '#ff9f1a', '#ffd23a', '#3fd16a', '#2f9bff', '#8a5bff'];
    rb.forEach((c, i) => { ctx.strokeStyle = c; ctx.lineWidth = RW + 10 - i * 1.4; ctx.stroke(path); });
  } else if (bd === 'crystal') {                           // walls of ice, glinting
    ctx.strokeStyle = 'rgba(190,240,255,.85)'; ctx.lineWidth = RW + 8; ctx.stroke(path);
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = RW + 8; ctx.setLineDash([1.2, 5]); ctx.lineCap = 'butt'; ctx.stroke(path);
    ctx.setLineDash([]); ctx.strokeStyle = '#6fc9e8'; ctx.lineWidth = RW + 3.6; ctx.stroke(path);
  } else if (bd === 'suspension') {
    ctx.strokeStyle = '#e9edf0'; ctx.lineWidth = RW + 7.5; ctx.stroke(path);
    ctx.strokeStyle = '#5d6b75'; ctx.lineWidth = RW + 7.5; ctx.setLineDash([1.2, 9]); ctx.lineCap = 'butt'; ctx.stroke(path);
    ctx.setLineDash([]); ctx.strokeStyle = 'rgba(93,107,117,.5)'; ctx.lineWidth = RW + 5; ctx.stroke(path);
  } else { ctx.strokeStyle = PAL.stone; ctx.lineWidth = RW + 7; ctx.stroke(path); }
  ctx.restore();
}
/* one road drawn the way the map draws them, for the shop's previews */
function paintRoadPath(P, bridge, noLane) {
  const RW = CFG.roadWidth;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.save(); ctx.translate(SUN.x * 1.8, SUN.y * 1.8); ctx.strokeStyle = PAL.sh; ctx.lineWidth = RW + 3.4; ctx.stroke(P); ctx.restore();
  if (bridge) bridgeParapet(P);
  const neon = design('road') === 'neon';
  if (neon) { ctx.save(); ctx.shadowColor = PAL.edge; ctx.shadowBlur = 7; }
  ctx.strokeStyle = PAL.edge; ctx.lineWidth = RW + 3.4; ctx.stroke(P);
  if (neon) ctx.restore();
  ctx.strokeStyle = PAL.road; ctx.lineWidth = RW; ctx.stroke(P);
  roadTexture(P, bridge ? P : null);
  if (!noLane) { ctx.strokeStyle = PAL.lane; ctx.lineWidth = 1.3; ctx.setLineDash([4.5, 5]); ctx.stroke(P); ctx.setLineDash([]); }
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
/* A roundabout: a road-coloured disc, a centre island and a dashed lane ring. The island changes with the
   roundabout design: grass (standard), paving, a flower garden, or a fountain. */
function drawRoundAt(x, y) {
  const R = 15, IR = 6.2, wet = rain.amt > 0.2, rd = design('round');
  dotShadow(x, y, R, 1.8);
  ctx.fillStyle = wet ? PAL.roadWet : PAL.road; ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
  const rg = GEN_P.round[rd];
  if (rg) roundGen(rg, x, y, IR);
  else if (rd === 'stone') {
    ctx.fillStyle = '#b4ada1'; ctx.beginPath(); ctx.arc(x, y, IR + 0.6, 0, 6.3); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 0.6;
    for (let r = 2; r < IR; r += 2) { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.stroke(); }
    ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i * 1.047; ctx.moveTo(x + Math.cos(a) * 2, y + Math.sin(a) * 2); ctx.lineTo(x + Math.cos(a) * IR, y + Math.sin(a) * IR); } ctx.stroke();
  } else if (rd === 'garden') {
    ctx.fillStyle = '#6fb35e'; ctx.beginPath(); ctx.arc(x, y, IR + 0.4, 0, 6.3); ctx.fill();
    const cols = ['#ff6b8b', '#ffd23a', '#ffffff', '#b07bff'];
    for (let i = 0; i < 8; i++) { const a = i * 0.785 + 0.3, d = IR * 0.68; ctx.fillStyle = cols[i % 4]; ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.9, 0, 6.3); ctx.fill(); }
    dotShadow(x, y, 2.6, 2.4); ctx.fillStyle = '#3f8a4a'; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 6.3); ctx.fill(); ctx.fillStyle = '#5cab5f'; ctx.beginPath(); ctx.arc(x - 0.7, y - 0.7, 1.5, 0, 6.3); ctx.fill();
  } else if (rd === 'sundial') {                           // a sundial whose shadow follows the time of day
    ctx.fillStyle = '#d8d1c3'; ctx.beginPath(); ctx.arc(x, y, IR + 0.6, 0, 6.3); ctx.fill();
    ctx.strokeStyle = 'rgba(80,70,55,.6)'; ctx.lineWidth = 0.45; ctx.beginPath();
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; ctx.moveTo(x + Math.cos(a) * (IR - 1.6), y + Math.sin(a) * (IR - 1.6)); ctx.lineTo(x + Math.cos(a) * IR, y + Math.sin(a) * IR); } ctx.stroke();
    const a = dayPhase() * Math.PI * 2 + Math.PI / 2;
    ctx.strokeStyle = 'rgba(40,35,30,.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (IR - 1.2), y + Math.sin(a) * (IR - 1.2)); ctx.stroke();
    ctx.fillStyle = '#8a7a5c'; ctx.beginPath(); ctx.arc(x, y, 1, 0, 6.3); ctx.fill();
  } else if (rd === 'pond') {                              // a little pond with lily pads
    ctx.fillStyle = '#7cc9a6'; ctx.beginPath(); ctx.arc(x, y, IR + 0.6, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#5fb4d6'; ctx.beginPath(); ctx.arc(x, y, IR - 0.6, 0, 6.3); ctx.fill();
    for (const [dx, dy, r2] of [[-2, -1.5, 1.4], [2.2, 1, 1.2], [0, 2.6, 1]]) { ctx.fillStyle = '#4f9b4f'; ctx.beginPath(); ctx.arc(x + dx, y + dy, r2, 0.4, 6); ctx.lineTo(x + dx, y + dy); ctx.fill(); }
    ctx.fillStyle = '#ff9ec7'; ctx.beginPath(); ctx.arc(x - 2, y - 1.5, 0.5, 0, 6.3); ctx.fill();
  } else if (rd === 'statue') {                            // a golden statue on a stone plinth
    ctx.fillStyle = '#6fb35e'; ctx.beginPath(); ctx.arc(x, y, IR + 0.4, 0, 6.3); ctx.fill();
    dotShadow(x, y, 2.8, 5);
    ctx.fillStyle = '#bdb6a8'; rr(x - 2.6, y - 2.6, 5.2, 5.2, 0.8); ctx.fill();
    const gg = ctx.createRadialGradient(x - 0.6, y - 0.8, 0.2, x, y, 2); gg.addColorStop(0, '#fff1a8'); gg.addColorStop(1, '#b8901c');
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, 1.7, 0, 6.3); ctx.fill();
  } else if (rd === 'carousel') {                          // a striped carousel canopy, turning slowly
    const a0 = REDUCED_MOTION ? 0 : animT * 0.9;
    dotShadow(x, y, IR, 2.6);
    for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#fff3e0' : '#ff5a7a'; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, IR + 0.4, a0 + i * 0.785, a0 + (i + 1) * 0.785); ctx.closePath(); softFill(); }
    ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.arc(x, y, 1.5, 0, 6.3); ctx.fill();
  } else if (rd === 'fountain') {
    ctx.fillStyle = '#d6cfc2'; ctx.beginPath(); ctx.arc(x, y, IR + 0.6, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#6fc3e6'; ctx.beginPath(); ctx.arc(x, y, IR - 0.8, 0, 6.3); ctx.fill();
    const ph = REDUCED_MOTION ? 0.5 : (animT * 0.8) % 1;
    for (const o of [0, 0.5]) { const u = (ph + o) % 1; ctx.strokeStyle = 'rgba(255,255,255,' + (0.7 * (1 - u)).toFixed(2) + ')'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(x, y, 1 + u * (IR - 2), 0, 6.3); ctx.stroke(); }
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, 1.1, 0, 6.3); ctx.fill();
  } else {
    ctx.fillStyle = PAL.land; ctx.beginPath(); ctx.arc(x, y, IR, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = PAL.stop; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(x, y, IR, 0, Math.PI * 2); ctx.stroke();
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = PAL.lane; ctx.globalAlpha = 0.75; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
  ctx.setLineDash([2.6, 3.4]); ctx.beginPath(); ctx.arc(0, 0, (R + IR) / 2, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]); ctx.restore(); ctx.globalAlpha = 1;
}
/* the four signal heads at a light: square (standard), slim LED bars, or round retro lamps in yellow housings */
function drawLightHeads(x, y, ls, dem) {
  const heads = [[-11, -11, 0], [11, 11, 0], [11, -11, 1], [-11, 11, 1]], ld = design('light');
  for (const [hx, hy] of heads) {
    if (ld === 'modern') dropShadow(x + hx, y + hy, 0, 1, 3, [[-3.4, -1.3, 6.8, 2.6, 1.3]]);
    else if (ld === 'retro' || ld === 'lantern' || ld === 'disco') dotShadow(x + hx, y + hy, 3, 3.5);
    else if (ld === 'minimal') dotShadow(x + hx, y + hy, 1.8, 2.5);
    else dropShadow(x + hx, y + hy, 0, 1, 3, [[-2.6, -2.6, 5.2, 5.2, 1.6]]);
  }
  for (const [hx, hy, g] of heads) {
    const green = !ls.allRed && ls.ph === g, lamp = green ? '#48e08a' : '#ff5a4a', X = x + hx, Y = y + hy;
    const lg = GEN_P.light[ld];
    if (lg) {                                              // a generated head: a housing of some colour and shape, maybe a ring and a glow
      if (lg.glow) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(lg.glow, 0.22); ctx.beginPath(); ctx.arc(X, Y, 4.8, 0, 6.3); ctx.fill(); ctx.restore(); }
      ctx.fillStyle = lg.h;
      if (lg.shape === 'flower' || lg.shape === 'cloud') {            // housings made of overlapping circles: outline first, so it only shows outside
        const bl = lg.shape === 'flower' ? [[0, 0, 2.5], [0, -2.2, 1.55], [2.09, -0.68, 1.55], [1.29, 1.78, 1.55], [-1.29, 1.78, 1.55], [-2.09, -0.68, 1.55]] : [[-1.8, 0.5, 2], [1.8, 0.5, 2], [0, -0.7, 2.5]];
        ctx.beginPath(); for (const [dx, dy, r_] of bl) { ctx.moveTo(X + dx + r_, Y + dy); ctx.arc(X + dx, Y + dy, r_, 0, 6.3); }
        if (lg.ring) { ctx.strokeStyle = lg.ring; ctx.lineWidth = 1.2; ctx.stroke(); }
        ctx.fill();
      } else {
        if (lg.shape === 'square') rr(X - 2.9, Y - 2.9, 5.8, 5.8, 1.8); else if (lg.shape === 'pill') rr(X - 3.6, Y - 2.3, 7.2, 4.6, 2.3);
        else if (lg.shape === 'blob') { ctx.beginPath(); for (const [dx, dy, r_] of [[-1.1, 0.7, 2.2], [1.3, -0.3, 2.1], [-0.4, -1.4, 1.9]]) { ctx.moveTo(X + dx + r_, Y + dy); ctx.arc(X + dx, Y + dy, r_, 0, 6.3); } }
        else if (lg.shape === 'ring') { ctx.beginPath(); ctx.arc(X, Y, 3.4, 0, 6.3); }
        else { ctx.beginPath(); ctx.arc(X, Y, 3, 0, 6.3); }
        ctx.fill(); if (lg.ring) { ctx.strokeStyle = lg.ring; ctx.lineWidth = 0.6; ctx.stroke(); }
      }
      if (lg.dash) { ctx.save(); ctx.strokeStyle = lg.dash; ctx.lineWidth = 1.1; ctx.lineCap = 'butt'; ctx.setLineDash([1.25, 1.25]); ctx.lineDashOffset = lg.spin && !REDUCED_MOTION ? -animT * 3 : 0; ctx.beginPath(); ctx.arc(X, Y, 2.75, 0, 6.3); ctx.stroke(); ctx.restore(); }   // a dashed band round the housing (a spinning one on the unique heads)
      if (lg.cap) { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(X - 1.1, Y - 1.5, 1.1, 0.65, -0.7, 0, 6.3); ctx.fill(); }
      if (lg.studs) { ctx.fillStyle = lg.studs; ctx.beginPath(); for (const [dx, dy] of [[-2.55, -2.55], [2.55, -2.55], [2.55, 2.55], [-2.55, 2.55]]) { ctx.moveTo(X + dx + 0.6, Y + dy); ctx.arc(X + dx, Y + dy, 0.6, 0, 6.3); } ctx.fill(); }
      ctx.fillStyle = '#1a1f24'; ctx.beginPath(); ctx.arc(X, Y, 1.95, 0, 6.3); ctx.fill();
      ctx.fillStyle = lamp; ctx.beginPath(); ctx.arc(X, Y, 1.5, 0, 6.3); ctx.fill();
    } else if (ld === 'modern') {
      rr(X - 3.4, Y - 1.3, 6.8, 2.6, 1.3); ctx.fillStyle = '#11161a'; ctx.fill();
      rr(X - 2.7, Y - 0.6, 5.4, 1.2, 0.6); ctx.fillStyle = lamp; ctx.fill();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = green ? 'rgba(72,224,138,.25)' : 'rgba(255,90,74,.22)'; rr(X - 4, Y - 2, 8, 4, 2); ctx.fill(); ctx.restore();
    } else if (ld === 'minimal') {
      ctx.fillStyle = '#2a3238'; ctx.beginPath(); ctx.arc(X, Y, 2, 0, 6.3); ctx.fill();
      ctx.fillStyle = lamp; ctx.beginPath(); ctx.arc(X, Y, 1.35, 0, 6.3); ctx.fill();
    } else if (ld === 'lantern') {
      ctx.save(); ctx.translate(X, Y); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#23272b'; sfr(-2.8, -2.8, 5.6, 5.6);
      ctx.fillStyle = lamp; sfr(-1.8, -1.8, 3.6, 3.6);
      ctx.strokeStyle = '#23272b'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(-1.8, 0); ctx.lineTo(1.8, 0); ctx.moveTo(0, -1.8); ctx.lineTo(0, 1.8); ctx.stroke();
      ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = green ? 'rgba(72,224,138,.22)' : 'rgba(255,170,90,.22)'; ctx.beginPath(); ctx.arc(X, Y, 4.6, 0, 6.3); ctx.fill(); ctx.restore();
    } else if (ld === 'disco') {                           // a ring cycling through the rainbow round each lamp
      const hue = Math.round((REDUCED_MOTION ? 0 : animT * 120) + hx * 9 + hy * 5) % 360;
      ctx.fillStyle = 'hsl(' + hue + ',90%,60%)'; ctx.beginPath(); ctx.arc(X, Y, 3, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#16121f'; ctx.beginPath(); ctx.arc(X, Y, 2.1, 0, 6.3); ctx.fill();
      ctx.fillStyle = lamp; ctx.beginPath(); ctx.arc(X, Y, 1.5, 0, 6.3); ctx.fill();
    } else if (ld === 'gold') {
      const gg = ctx.createLinearGradient(X - 3, Y - 3, X + 3, Y + 3); gg.addColorStop(0, '#fff1a8'); gg.addColorStop(0.5, '#d4af37'); gg.addColorStop(1, '#8f6d10');
      rr(X - 2.9, Y - 2.9, 5.8, 5.8, 1.8); ctx.fillStyle = gg; ctx.fill();
      ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(X, Y, 1.9, 0, 6.3); ctx.fill();
      ctx.fillStyle = lamp; ctx.beginPath(); ctx.arc(X, Y, 1.5, 0, 6.3); ctx.fill();
    } else if (ld === 'retro') {
      ctx.fillStyle = '#e8b82e'; ctx.beginPath(); ctx.arc(X, Y, 3, 0, 6.3); ctx.fill();
      ctx.strokeStyle = '#7a5a10'; ctx.lineWidth = 0.6; ctx.stroke();
      ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.arc(X, Y, 2, 0, 6.3); ctx.fill();
      ctx.fillStyle = lamp; ctx.beginPath(); ctx.arc(X, Y, 1.5, 0, 6.3); ctx.fill();
    } else {
      rr(X - 2.6, Y - 2.6, 5.2, 5.2, 1.6); ctx.fillStyle = '#1a242b'; ctx.fill();
      ctx.fillStyle = lamp; ctx.beginPath(); ctx.arc(X, Y, 1.7, 0, Math.PI * 2); ctx.fill();
    }
    if (dem && dem[g] > 0) {                                   // the sensor sees a car on this side
      ctx.strokeStyle = 'rgba(96,200,255,' + (0.55 + 0.35 * Math.sin(animT * 7)).toFixed(2) + ')'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.arc(X, Y, 4.3, 0, Math.PI * 2); ctx.stroke();
    }
  }
}
function drawJunctionFurniture(vr) {
  for (const nd of nodeList) {
    const x = tx(nd.k), y = ty(nd.k);
    if (x < vr.x0 - 40 || x > vr.x1 + 40 || y < vr.y0 - 40 || y > vr.y1 + 40) continue;
    if (nd.type === 'round') drawRoundAt(x, y);
    if (nd.type === 'light') drawLightHeads(x, y, lightState(nd), nd.ldem);
    if (nd.lvl > 0 && nd.junction) {
      ctx.strokeStyle = 'rgba(255,201,51,.85)'; ctx.lineWidth = 0.9 + 0.7 * nd.lvl;
      ctx.beginPath(); ctx.arc(x, y, 16.8, 0, Math.PI * 2); ctx.stroke();
    }
    if (sign[nd.k]) {
      dotShadow(x + 9, y - 11, 5.2, 4);
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
  dropShadow(x, y, p.face || 0, 1, 1, [[-13, -13, 26, 26, 3]]);
  ctx.save(); ctx.translate(x, y); ctx.rotate(p.face || 0);
  rr(-13, -13, 26, 26, 3); ctx.fillStyle = PAL.asphalt; ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 2; rr(-13, -13, 26, 26, 3); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(0, 9); ctx.moveTo(-12, -9); ctx.lineTo(-12, 9); ctx.moveTo(12, -9); ctx.lineTo(12, 9); ctx.stroke();
  ctx.restore();
}
function drawDepot(d) {
  const x = tx(d.k), y = ty(d.k);
  dropShadow(x, y, d.face || 0, 1, 1.2, [[-13, -13, 26, 26, 4]]);
  ctx.save(); ctx.translate(x, y); ctx.rotate(d.face || 0);
  rr(-13, -13, 26, 26, 4); ctx.fillStyle = theme === 'dark' ? '#2f4a63' : '#5d7e9d'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, 12); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.stroke();
  rr(-13, -13, 26, 26, 4); ctx.lineWidth = 1.6; ctx.strokeStyle = '#eaf3fa'; ctx.stroke();
  ctx.restore();
  // "P" plate stays upright
  dropShadow(x, y, 0, 1, 3, [[6, -15, 9, 9, 2]]);
  rr(x + 6, y - 15, 9, 9, 2); ctx.fillStyle = '#1b57b0'; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '700 7.5px Overpass, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('P', x + 10.5, y - 10.3);
  const used = d.slots.length + d.res;
  if (used > 0 || cam.z > 1.4) {
    ctx.fillStyle = 'rgba(10,25,35,.75)'; rr(x - 9, y + 12, 18, 7, 3); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '600 5.5px Overpass, system-ui, sans-serif'; ctx.fillText(d.slots.length + '/' + d.cap, x, y + 15.7);
  }
}
const SYS_REDUCED = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
let REDUCED_MOTION = SYS_REDUCED;
let a11y = {scale: 100, contrast: false, motion: 'auto'};
function applyA11y() {
  const root = document.documentElement;
  root.style.setProperty('--ui-zoom', String(a11y.scale / 100));
  root.setAttribute('data-contrast', a11y.contrast ? 'high' : 'normal');
  REDUCED_MOTION = a11y.motion === 'reduce' || (a11y.motion === 'auto' && SYS_REDUCED);
  root.setAttribute('data-motion', REDUCED_MOTION ? 'reduce' : 'full');
  try { if (typeof layout === 'function' && typeof W !== 'undefined' && W) layout(); } catch (e) {}
}
function syncA11yUI() {
  const sc = $('acc-scale'); if (sc) { sc.value = a11y.scale; $('acc-scale-v').textContent = a11y.scale + '%'; }
  const hc = $('acc-contrast'); if (hc) hc.checked = !!a11y.contrast;
  document.querySelectorAll('#acc-motion button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === a11y.motion)));
}
/* every icon-only button gets a label for screen readers (its tooltip text) */
function labelIconButtons() {
  document.querySelectorAll('button').forEach(b => { if (!b.getAttribute('aria-label') && !b.textContent.trim() && b.title) b.setAttribute('aria-label', b.title); });
}
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
function win(x, y, w, h) { ctx.fillStyle = 'rgba(24,44,58,.7)'; sfr(x, y, w, h); ctx.fillStyle = 'rgba(160,210,240,.3)'; sfr(x + 0.3, y + 0.3, w * 0.3, h - 0.6); }
/* Houses grow with the cars bought for them: cottage (none), family home with a garage (one), villa (two). */
function drawHouse(b) {
  const x = tx(b.k), y = ty(b.k), col = COLORS[b.color].hex, s = spawnScale(b), model = Math.min(2, b.extra || 0);
  dropShadow(x, y, b.face || 0, s, 0.6, [[-12.5, 2.5, 25, 13.5, 3]]);                              // forecourt kerb
  const hd = design('house');
  if (hd === 'tower') dropShadow(x, y, b.face || 0, s, 7, [[-8.5, -13, 17, 17, 8.5]]);
  else if (hd === 'igloo') dropShadow(x, y, b.face || 0, s, 3.6, [[-9, -12.5, 18, 15, 7.5]]);
  else if (hd === 'castle') dropShadow(x, y, b.face || 0, s, 6.5, [[-12, -14, 24, 18, 3]]);
  else if (hd === 'treehouse') dropShadow(x, y, b.face || 0, s, 8, [[-11.5, -15, 23, 20, 10]]);
  else if (hd === 'windmill') dropShadow(x, y, b.face || 0, s, 8, [[-7, -12, 14, 14, 7]]);
  else if (hd === 'lighthouse') dropShadow(x, y, b.face || 0, s, 11, [[-6.5, -11.5, 13, 13, 6.5]]);
  else if (hd === 'mushroom') dropShadow(x, y, b.face || 0, s, 6, [[-11, -15, 22, 18, 9]]);
  else if (hd !== 'standard') dropShadow(x, y, b.face || 0, s, hd === 'modern' ? 3.4 : 4.2, [[-11, -13, 22, 16, 2]]);
  else if (houseTier(b)) dropShadow(x, y, b.face || 0, s, 4.5 + houseTier(b) * 2.2, houseTier(b) === 3 ? [[-12, -14, 24, 17.5, 3], [-7, -19, 14, 10, 3]] : [[-12, -14, 24, 17.5, 3]]);   // p62
  else dropShadow(x, y, b.face || 0, s, model === 2 ? 4.4 : 3.6, model === 0 ? [[-9, -12, 18, 15.5, 2.6]] : model === 1 ? [[-11.5, -13, 14.5, 16.5, 2.6], [3.4, -8.5, 8.1, 12, 1.4]] : [[-11.5, -13.5, 23, 17, 2.6]]);
  ctx.save(); ctx.translate(x, y); ctx.rotate(b.face || 0); ctx.scale(s, s);
  rr(-12.5, 2.5, 25, 13.5, 3); ctx.fillStyle = PAL.pave; ctx.fill();                              // forecourt
  const nHome = CFG.carsPerHouse + (b.extra || 0), xs = nHome >= 4 ? [-9, -3, 3, 9] : nHome === 3 ? [-8, 0, 8] : [-6, 6];
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 0.6;
  for (const lx of xs) { rr(lx - 2.9, 5, 5.8, 9.4, 1); ctx.stroke(); }
  if (hd !== 'standard') drawHouseDesign(hd, b, col, model);
  else if (houseTier(b)) drawHouseTier(b, col, houseTier(b));                                      // p62: townhouse, apartments, tower
  else if (model === 0) {
    // cottage: small gabled house, garden hedge, chimney
    rr(-9, -12, 18, 15.5, 2.6); ctx.fillStyle = PAL.roofBase; ctx.fill();
    gable(-9, -12, 18, 12, col);
    ctx.fillStyle = '#4a4f54'; ctx.fillRect(3.5, -10.6, 2.6, 2.6);                                      // chimney
    win(-6.6, 0.8, 2.8, 1.8); win(3.8, 0.8, 2.8, 1.8);
    rr(-1.5, 0.2, 3, 3.3, 0.6); ctx.fillStyle = shade(col, -0.45); ctx.fill();
    ctx.fillStyle = PAL.tree1; rr(-12, -12, 2.2, 15.5, 1.1); ctx.fill(); rr(9.8, -12, 2.2, 15.5, 1.1); ctx.fill();   // hedges
    if (showSymbols) glyph(COLORS[b.color].glyph, 0, -6, 2.5, 'rgba(255,255,255,.92)');
  } else if (model === 1) {
    // family home: gabled main house plus a flat-roofed garage wing with its own door
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
/* House designs, drawn in the house's own frame (front at +y). Bigger houses (more cars bought) get extras. */
function drawHouseDesign(hd, b, col, model) {
  if (GEN_P.house[hd]) { houseGen(GEN_P.house[hd], b, col, model); return; }
  if (hd === 'mushroom') {                                 // a toadstool cottage: a spotted cap in the house colour on a cream stalk
    ctx.fillStyle = '#efe4cc'; rr(-4.5, -4, 9, 7.5, 2); ctx.fill();
    rr(-1.4, 0.3, 2.8, 3.2, 1.2); ctx.fillStyle = '#8a5a35'; ctx.fill();
    const gr = ctx.createRadialGradient(-3, -9, 1, 0, -6, 11); gr.addColorStop(0, shade(col, 0.25)); gr.addColorStop(1, shade(col, -0.2));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(0, -6, 11, 9, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    for (const [dx, dy, r_] of [[-5, -9, 1.8], [3, -10, 1.4], [6.5, -5, 1.6], [-1, -4, 1.2], [-7.5, -4, 1.1], [1, -13, 1]]) { ctx.beginPath(); ctx.arc(dx, dy, r_, 0, 6.3); ctx.fill(); }
    if (model >= 1) { ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.arc(5.5, 2.2, 0.9, 0, 6.3); ctx.fill(); }
    if (showSymbols) glyph(COLORS[b.color].glyph, 0, -7, 2.4, 'rgba(255,255,255,.92)');
  } else if (hd === 'thatch') {                                   // a cottage under a deep golden thatch, door and shutters in the house colour
    rr(-11, -13, 22, 16, 5); ctx.fillStyle = '#b9893d'; ctx.fill();
    ctx.fillStyle = '#d9ad5c'; rr(-11, -13, 22, 7.5, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(110,75,25,.35)'; ctx.lineWidth = 0.35; ctx.beginPath();
    for (let xx = -10; xx < 11; xx += 1.6) { ctx.moveTo(xx, -12.5); ctx.lineTo(xx + 0.6, -6); ctx.moveTo(xx, -5.2); ctx.lineTo(xx + 0.6, 2.4); } ctx.stroke();
    ctx.fillStyle = 'rgba(255,240,200,.6)'; sfr(-10.5, -5.6, 21, 0.7);                                  // ridge
    rr(-1.6, 0.2, 3.2, 3.4, 1.4); ctx.fillStyle = col; ctx.fill();
    for (const wx of [-7.5, 4.5]) { ctx.fillStyle = col; sfr(wx - 0.8, 0.8, 0.7, 2); sfr(wx + 3.1, 0.8, 0.7, 2); win(wx, 0.8, 3, 2); }
    if (model >= 1) { ctx.fillStyle = '#e8455a'; for (const fx of [-9, -8, 8, 9]) { ctx.beginPath(); ctx.arc(fx, 3.4, 0.6, 0, 6.3); ctx.fill(); } }   // window boxes
    if (model >= 2) { ctx.fillStyle = '#7a6a58'; sfr(5, -12, 2.4, 3); }                                                                 // chimney
    if (showSymbols) glyph(COLORS[b.color].glyph, 0, -8, 2.4, 'rgba(255,255,255,.92)');
  } else if (hd === 'beach') {                             // a striped beach hut on stilts with a little deck
    rr(-11, -13, 22, 16, 1.5); ctx.fillStyle = '#fbf8f1'; ctx.fill();
    ctx.save(); rr(-11, -13, 22, 16, 1.5); ctx.clip();
    for (let xx = -11, i = 0; xx < 11; xx += 3.2, i++) if (i % 2 === 0) { ctx.fillStyle = col; sfr(xx, -13, 3.2, 16); }
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,.14)'; sfr(-11, -5.4, 22, 0.6);                                          // roof ridge
    ctx.fillStyle = '#c99a62'; sfr(-7, 2.4, 14, 1.4); ctx.fillStyle = 'rgba(0,0,0,.2)'; for (let xx = -6.5; xx < 7; xx += 1.4) sfr(xx, 2.4, 0.3, 1.4);   // deck
    rr(-1.6, -0.2, 3.2, 2.8, 0.6); ctx.fillStyle = shade(col, -0.45); ctx.fill();
    if (model >= 1) { ctx.fillStyle = '#ff6f61'; ctx.beginPath(); ctx.arc(-8.5, 3.5, 1.6, Math.PI, 0); ctx.fill(); }          // parasol
    if (model >= 2) { ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.arc(8.5, 3.5, 1.6, Math.PI, 0); ctx.fill(); }
    if (showSymbols) glyph(COLORS[b.color].glyph, 0, -9, 2.4, 'rgba(255,255,255,.92)');
  } else if (hd === 'igloo') {                             // a snow-block dome with an entrance tunnel; a flag in the house colour
    const gr = ctx.createRadialGradient(-3, -8, 1, 0, -5, 9); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#cfe1ec');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, -5, 8.5, 0, 6.3); ctx.fill();
    ctx.strokeStyle = 'rgba(120,150,175,.45)'; ctx.lineWidth = 0.4; ctx.beginPath();
    for (const r_ of [3, 5.8]) { ctx.moveTo(r_, -5); ctx.arc(0, -5, r_, 0, 6.3); }
    for (let i = 0; i < 8; i++) { const a = i * 0.785; ctx.moveTo(Math.cos(a) * 3, -5 + Math.sin(a) * 3); ctx.lineTo(Math.cos(a) * 8.5, -5 + Math.sin(a) * 8.5); } ctx.stroke();
    rr(-2.6, 1, 5.2, 3.2, 1.6); ctx.fillStyle = '#e8f1f6'; ctx.fill(); ctx.fillStyle = '#2f4250'; rr(-1.4, 2, 2.8, 2.2, 1.1); ctx.fill();
    ctx.strokeStyle = '#6b6f72'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(5, -9); ctx.lineTo(5, -15); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(5, -15); ctx.lineTo(8.6, -13.9); ctx.lineTo(5, -12.8); ctx.closePath(); softFill();
    if (model >= 1) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(-9.5, 1.5, 1.6, 0, 6.3); ctx.fill(); ctx.beginPath(); ctx.arc(-9.5, -0.6, 1.1, 0, 6.3); ctx.fill(); }   // a tiny snowman
    if (showSymbols) glyph(COLORS[b.color].glyph, 0, -5, 2.2, col);
  } else if (hd === 'castle') {                            // a stone keep with four turrets, roofs and banners in the house colour
    rr(-10, -12, 20, 15, 1); ctx.fillStyle = '#a8a397'; ctx.fill();
    ctx.fillStyle = '#bdb8ac'; sfr(-10, -12, 20, 3);
    ctx.fillStyle = 'rgba(0,0,0,.16)'; for (let xx = -9; xx < 10; xx += 2.5) sfr(xx, -12, 1.2, 1.2);   // battlements
    ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 0.3; ctx.beginPath(); for (let yy = -8; yy < 3; yy += 2) { ctx.moveTo(-10, yy); ctx.lineTo(10, yy); } ctx.stroke();
    for (const [tx_, ty_] of [[-10, -12], [10, -12], [-10, 3], [10, 3]]) {
      ctx.fillStyle = '#9a9589'; ctx.beginPath(); ctx.arc(tx_, ty_, 3.2, 0, 6.3); ctx.fill();
      const g2 = ctx.createRadialGradient(tx_ - 1, ty_ - 1, 0.3, tx_, ty_, 2.8); g2.addColorStop(0, shade(col, 0.3)); g2.addColorStop(1, shade(col, -0.3));
      ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(tx_, ty_, 2.6, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#f2d36b'; ctx.beginPath(); ctx.arc(tx_, ty_, 0.6, 0, 6.3); ctx.fill();
    }
    rr(-2, 0, 4, 3, 2); ctx.fillStyle = '#4a3622'; ctx.fill();                                                    // gate
    ctx.strokeStyle = '#6b6f72'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, -16); ctx.stroke();
    const wv = REDUCED_MOTION ? 0 : Math.sin(animT * 4 + b.k) * 0.8;
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(5, -15 + wv); ctx.lineTo(0, -13.4); ctx.closePath(); softFill();
    if (showSymbols) glyph(COLORS[b.color].glyph, 0, -6, 2.4, col);
  } else if (hd === 'treehouse') {                         // a hut up in a big tree, with a rope ladder down
    for (const [dx, dy, rr2, c2] of [[-5, -8, 7, PAL.tree2], [5, -9, 7, PAL.tree2], [0, -3, 7.5, PAL.tree2], [-4, -10, 4.5, PAL.tree1], [4, -5, 4.2, PAL.tree1]]) { ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(dx, dy, rr2, 0, 6.3); ctx.fill(); }
    ctx.fillStyle = 'rgba(0,0,0,.25)'; rr(-4.6 + 1, -9.5 + 1.2, 9.2, 7.5, 1); ctx.fill();
    rr(-4.6, -9.5, 9.2, 7.5, 1); ctx.fillStyle = '#9a6a3c'; ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-5.6, -9.5); ctx.lineTo(0, -13.5); ctx.lineTo(5.6, -9.5); ctx.closePath(); softFill();
    ctx.fillStyle = 'rgba(24,44,58,.75)'; sfr(-1.2, -7, 2.4, 2);
    ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(-1, -2); ctx.lineTo(-1, 3.5); ctx.moveTo(1, -2); ctx.lineTo(1, 3.5); for (let yy = -1.2; yy < 3.5; yy += 1.1) { ctx.moveTo(-1, yy); ctx.lineTo(1, yy); } ctx.stroke();
    if (showSymbols) glyph(COLORS[b.color].glyph, 0, -11, 1.8, 'rgba(255,255,255,.92)');
  } else if (hd === 'windmill') {                          // a round mill with four turning sails in the house colour
    ctx.fillStyle = '#d9cfbd'; ctx.beginPath(); ctx.arc(0, -5, 6.5, 0, 6.3); ctx.fill();
    ctx.fillStyle = shade(col, -0.2); ctx.beginPath(); ctx.arc(0, -5, 4.6, 0, 6.3); ctx.fill();
    ctx.save(); ctx.translate(0, -5); ctx.rotate(REDUCED_MOTION ? 0.4 : animT * 0.9 + b.k);
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = 'rgba(0,0,0,.18)'; sfr(1.6, -1.2 + 0.8, 9, 2.4);
      ctx.fillStyle = '#f4efe3'; sfr(1.6, -1.2, 9, 2.4); ctx.fillStyle = col; sfr(3, -1.2, 7, 1.1);
      ctx.strokeStyle = '#6b5b45'; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10.6, 0); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#4a3a2a'; ctx.beginPath(); ctx.arc(0, -5, 1, 0, 6.3); ctx.fill();
    rr(-1.4, 1.2, 2.8, 2.2, 0.8); ctx.fillStyle = shade(col, -0.5); ctx.fill();
    if (showSymbols) glyph(COLORS[b.color].glyph, 0, -5, 1.6, 'rgba(255,255,255,.92)');
  } else if (hd === 'lighthouse') {                        // a striped lighthouse with a sweeping beam
    const R_ = 6;
    ctx.fillStyle = '#f6f4ef'; ctx.beginPath(); ctx.arc(0, -5, R_, 0, 6.3); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 1.6; for (const rr2 of [5.1, 2.9]) { ctx.beginPath(); ctx.arc(0, -5, rr2, 0, 6.3); ctx.stroke(); }
    ctx.fillStyle = '#2b3036'; ctx.beginPath(); ctx.arc(0, -5, 1.8, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#ffe58a'; ctx.beginPath(); ctx.arc(0, -5, 1.1, 0, 6.3); ctx.fill();
    const a = REDUCED_MOTION ? 0.6 : animT * 1.4;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,230,140,.28)';
    ctx.beginPath(); ctx.moveTo(0, -5); ctx.arc(0, -5, 18, a - 0.22, a + 0.22); ctx.closePath(); softFill(); ctx.restore();
    rr(-1.3, 0.6, 2.6, 2.4, 0.8); ctx.fillStyle = shade(col, -0.45); ctx.fill();
    if (showSymbols) glyph(COLORS[b.color].glyph, 0, -9.5, 1.4, col);
  } else if (hd === 'barn') {                                     // a gambrel-roofed barn in the house colour with white trim and a cross-braced door
    rr(-11, -13, 22, 16, 2); ctx.fillStyle = shade(col, -0.18); ctx.fill();
    ctx.fillStyle = shade(col, 0.08); sfr(-11, -13, 22, 4); sfr(-11, -1, 22, 4);
    ctx.fillStyle = shade(col, -0.05); sfr(-11, -9, 22, 8);
    ctx.fillStyle = 'rgba(255,255,255,.75)'; sfr(-11, -5.3, 22, 0.6);                                    // ridge
    ctx.strokeStyle = '#f6f2ea'; ctx.lineWidth = 0.9; rr(-11, -13, 22, 16, 2); ctx.stroke();
    ctx.fillStyle = '#f6f2ea'; sfr(-3.4, -0.2, 6.8, 3.4);                                                // barn door
    ctx.strokeStyle = shade(col, -0.35); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-3.4, -0.2); ctx.lineTo(3.4, 3.2); ctx.moveTo(3.4, -0.2); ctx.lineTo(-3.4, 3.2); ctx.stroke();
    if (model >= 1) { ctx.fillStyle = '#c9a54a'; ctx.beginPath(); ctx.arc(-8, 1.6, 1.4, 0, 6.3); ctx.arc(8, 1.6, 1.4, 0, 6.3); ctx.fill(); }   // hay bales
    if (model >= 2) { ctx.fillStyle = '#8a9296'; ctx.beginPath(); ctx.arc(8.5, -10, 2, 0, 6.3); ctx.fill(); ctx.fillStyle = '#c3c9cc'; ctx.beginPath(); ctx.arc(8.5, -10, 1.2, 0, 6.3); ctx.fill(); }   // silo cap
    if (showSymbols) glyph(COLORS[b.color].glyph, 0, -7, 2.4, 'rgba(255,255,255,.92)');
  } else if (hd === 'modern') {                            // a flat-roofed box: pale roof, a block of the house colour, long glazing
    rr(-11, -13, 22, 16, 1.5); ctx.fillStyle = '#ebebe6'; ctx.fill();
    rr(-11, -13, 8.5, 16, 1.5); ctx.fillStyle = col; ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.1)'; sfr(-2.5, -13, 0.5, 16);
    ctx.fillStyle = 'rgba(24,44,58,.82)'; sfr(-1.5, 0.6, 11.5, 1.9);                                      // floor-to-ceiling window
    ctx.fillStyle = 'rgba(160,210,240,.45)'; sfr(-1, 0.9, 3.5, 1.3);
    ctx.fillStyle = 'rgba(170,215,240,.55)'; sfr(1, -10.5, 5, 3.5);                                       // skylight
    if (model >= 1) { ctx.fillStyle = '#1f3552'; for (let i = 0; i < 2; i++) sfr(1 + i * 4, -5.5, 3.4, 3); }   // solar
    if (model >= 2) { rr(-10, -11.5, 5.5, 8, 1); ctx.fillStyle = '#5fc4e6'; ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.5)'; sfr(-9.4, -10.5, 4.3, 0.6); }   // roof pool
    if (showSymbols) glyph(COLORS[b.color].glyph, -6.7, -5, 2.4, 'rgba(255,255,255,.92)');
  } else if (hd === 'tower') {                             // a round stone tower with a conical roof in the house colour
    ctx.fillStyle = PAL.roofBase; ctx.beginPath(); ctx.arc(0, -4.5, 8.5, 0, 6.3); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.arc(0, -4.5, 8.5, 0, 6.3); ctx.stroke();
    const gr = ctx.createRadialGradient(-2, -7, 0.5, 0, -4.5, 7.6); gr.addColorStop(0, shade(col, 0.3)); gr.addColorStop(1, shade(col, -0.25));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, -4.5, 7.6, 0, 6.3); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 0.45; ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * 0.785; ctx.moveTo(0, -4.5); ctx.lineTo(Math.cos(a) * 7.6, -4.5 + Math.sin(a) * 7.6); } ctx.stroke();
    ctx.fillStyle = '#f2d36b'; ctx.beginPath(); ctx.arc(0, -4.5, 1.1, 0, 6.3); ctx.fill();                          // finial
    rr(-1.4, 2.6, 2.8, 1.8, 0.8); ctx.fillStyle = shade(col, -0.5); ctx.fill();                                     // door
    if (model >= 1) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, -4.5); ctx.lineTo(0, -15); ctx.strokeStyle = '#6b6f72'; ctx.lineWidth = 0.5; ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(4, -13.8); ctx.lineTo(0, -12.6); ctx.closePath(); softFill(); }   // pennant
    if (model >= 2) { ctx.fillStyle = PAL.roofBase; ctx.beginPath(); ctx.arc(8.5, -10, 3.2, 0, 6.3); ctx.fill(); ctx.fillStyle = shade(col, -0.1); ctx.beginPath(); ctx.arc(8.5, -10, 2.6, 0, 6.3); ctx.fill(); }   // a second turret
    if (showSymbols) glyph(COLORS[b.color].glyph, 0, -4.5, 2.2, 'rgba(255,255,255,.92)');
  }
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
function drawStoreSmall(b) {
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
/* A big store, drawn in its plot's own frame: origin at the centre of the 2x3 plot, +y across the car park.
   The 2x2 building is y -48..14, a kerb, then the car park y 16..48: bays against the kerb, the aisle beyond.
   The end beside b.k is local +x, the far end local -x. */
const STORE_BOX = [[-24, -40, 48, 54], [-28, -44, 56, 58], [-29, -45, 58, 59], [-30, -46, 60, 60]];
function drawStore(b) {
  if (!isBig(b)) { drawStoreSmall(b); return; }
  const x = bX(b), y = bY(b), th = b.face || 0, col = COLORS[b.color].hex, tier = Math.min(3, b.tier || 0), lvl = b.lvl || 0, s = spawnScale(b);
  const [Bx, By, Bw, Bh] = STORE_BOX[tier], front = By + Bh, roof = tier === 3 ? shade(PAL.roofBase, -0.12) : PAL.roofBase;
  const ends = b.ends || 0, open = [ends !== 2 ? 1 : 0, ends !== 1 ? 1 : 0];        // [+x end, -x end]
  dropShadow(x, y, th, s, 0.5, [[-31, -47, 62, 94, 6]]);                                    // the plot's kerb
  const H = (13 + tier * 3.2) * s;                                                            // how tall it stands, in world px
  ctx.save(); ctx.translate(x, y); ctx.rotate(th); ctx.scale(s, s);
  // plot and kerb
  rr(-31, -47, 62, 94, 6); ctx.fillStyle = PAL.lot; ctx.fill();
  ctx.fillStyle = PAL.curb; ctx.fillRect(-31, 14, 62, 2.5);
  // car park: bays against the kerb, a one-lane aisle beyond, open only at its open end(s)
  ctx.fillStyle = PAL.asphalt; ctx.fillRect(open[1] ? -32 : -29, 16.5, (open[0] ? 32 : 29) - (open[1] ? -32 : -29), 29.5);
  ctx.fillStyle = PAL.curb; ctx.fillRect(-31, 45.5, 62, 2);                                    // far kerb: no way in along this side
  if (!open[0]) ctx.fillRect(29, 16.5, 2.5, 31);
  if (!open[1]) ctx.fillRect(-31.5, 16.5, 2.5, 31);
  const active = Math.min(STORE_BAYS.length, dockCap(b)), on = new Set(STORE_BAYS.slice(0, active));
  for (let i = 0; i <= 4; i++) {
    const lx = -30 + i * 15, lit = on.has(lx - 7.5) || on.has(lx + 7.5);
    ctx.fillStyle = lit ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.22)'; ctx.fillRect(lx - 0.5, 17.5, 1, 15.5);
  }
  for (const lx of on) {
    ctx.fillStyle = '#ffc933'; rr(lx - 4, 18, 8, 1.6, 0.8); ctx.fill();                       // wheel stop
    ctx.fillStyle = rgba(col, 0.6); ctx.fillRect(lx - 1.6, 31.5, 3.2, 1.4);                    // store-colour bay mark
  }
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 0.8; ctx.setLineDash([4, 4]);     // aisle centre line
  ctx.beginPath(); ctx.moveTo(open[1] ? -30 : -24, 39.5); ctx.lineTo(open[0] ? 30 : 24, 39.5); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,.8)';                                                      // arrows in each open end
  for (const [sx, o] of [[1, open[0]], [-1, open[1]]]) {
    if (!o) continue;
    const ax = sx * 26;
    ctx.beginPath(); ctx.moveTo(ax - sx * 3.5, 39.5); ctx.lineTo(ax + sx * 1.5, 36.2); ctx.lineTo(ax + sx * 1.5, 42.8); ctx.closePath(); ctx.fill();
  }
  if (tier === 0) {                                                                            // a corner shop keeps a little garden
    ctx.fillStyle = PAL.grass; rr(-31, -47, 62, 7, 3.5); ctx.fill(); rr(-31, -47, 7, 61, 3.5); ctx.fill(); rr(24, -47, 7, 61, 3.5); ctx.fill();
    const dk = decorKind();
    for (const [gx, gy, gr, sd] of [[-27.5, -43, 3.2, 1], [27.5, -42.5, 3.4, 2], [-27.5, -14, 2.9, 3], [27.5, 2, 3, 4]]) drawDecor(ctx, dk, gx, gy, gr, 0, b.k * 7 + sd);
  }
  ctx.restore();
  // Seen straight from above. How tall the building is shows in its shadow: a soft outer shadow and a darker core,
  // both cast across its own lot and car park (so they're drawn on top of the ground, not hidden under it), plus
  // light falling across the roof and a lit and a shaded rim round its parapet.
  const sdz = storeDesign();
  dropShadow(x, y, th, s, H * 1.55, [[Bx, By, Bw, Bh, 4]], 0.45);
  dropShadow(x, y, th, s, H * 0.95, [[Bx, By, Bw, Bh, 4]], 0.9);
  dropShadow(x, y, th, s, 2.2, [[Bx - 0.5, By - 0.5, Bw + 1, Bh + 1, 4.5]], 1);                 // a crisp contact shadow at its foot
  const cs = [[Bx, By], [Bx + Bw, By], [Bx + Bw, By + Bh], [Bx, By + Bh]].map(([lx, ly]) => rot(x, y, th, lx * s, ly * s));
  const wx0 = Math.min(...cs.map(q => q.x)), wx1 = Math.max(...cs.map(q => q.x)), wy0 = Math.min(...cs.map(q => q.y)), wy1 = Math.max(...cs.map(q => q.y));
  ctx.save(); ctx.translate(x, y); ctx.rotate(th); ctx.scale(s, s);
  const so = (() => { const c_ = Math.cos(th), s_ = Math.sin(th); return [(c_ * 1.6 + s_ * 1.6) / s, (-s_ * 1.6 + c_ * 1.6) / s]; })();   // a small shadow offset, in roof space
  // walls and roof
  rr(Bx, By, Bw, Bh, 4); ctx.fillStyle = shade(roof, -0.14); ctx.fill();
  rr(Bx + 2.5, By + 2.5, Bw - 5, Bh - 5, 3); ctx.fillStyle = roof; ctx.fill();
  ctx.save(); rr(Bx + 2.5, By + 2.5, Bw - 5, Bh - 5, 3); ctx.clip();
  const mall = isMall(b), pw = mall ? 16 : 9;                                                  // p62: a mall gets a wide plant room, skylights and a sign
  if (sdz !== 'standard') storeRoofDesign(sdz, Bx, By, Bw, Bh, col);
  else if (mall) {                                                                             // mall: a glazed atrium strip and skylights down both sides
    ctx.fillStyle = 'rgba(170,215,240,.42)'; rr(-5, By + 12, 10, Bh - 26, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; rr(-3.6, By + 13.5, 2, Bh - 29, 1); ctx.fill();
    ctx.fillStyle = 'rgba(170,215,240,.45)';
    for (let j = 0; j < 4; j++) { rr(Bx + 3.5, By + 14 + j * 8, 4.5, 5, 1.2); ctx.fill(); rr(Bx + Bw - 8, By + 14 + j * 8, 4.5, 5, 1.2); ctx.fill(); }
  } else if (tier === 2) {                                                                       // depot: sawtooth roof
    for (let yy = By + 2; yy < front; yy += 8) { ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(Bx, yy, Bw, 4); ctx.fillStyle = 'rgba(170,215,240,.5)'; ctx.fillRect(Bx, yy + 4, Bw, 0.8); }
  } else if (tier === 3) {                                                                     // distribution centre: skylights down one side
    ctx.fillStyle = 'rgba(170,215,240,.45)';
    for (let j = 0; j < 4; j++) ctx.fillRect(Bx + Bw - 8, By + 14 + j * 8, 4.5, 5);
  } else if (tier === 1) {                                                                     // supermarket: rooflights down one side
    ctx.fillStyle = 'rgba(170,215,240,.45)'; ctx.fillRect(Bx + Bw - 8, By + 13, 2, Bh - 30); ctx.fillRect(Bx + Bw - 5, By + 13, 2, Bh - 30);
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,.24)'; rr(Bx + Bw - 4 - pw + so[0], By + 3 + so[1], pw, 8, 1.5); ctx.fill();
  ctx.fillStyle = '#9aa3a8'; rr(Bx + Bw - 4 - pw, By + 3, pw, 8, 1.5); ctx.fill();               // rooftop plant (wider on a mall)
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(Bx + Bw - 4 - pw, By + 3, pw, 1);
  ctx.fillStyle = '#6f777c'; ctx.beginPath(); ctx.arc(Bx + Bw - 8.5, By + 7, 2.2, 0, 6.3); if (mall) ctx.arc(Bx + Bw - 15.5, By + 7, 2.2, 0, 6.3); ctx.fill();
  if (mall) {                                                                                  // p62: the mall sign, a pill in the store's colour by the front
    ctx.fillStyle = 'rgba(0,0,0,.2)'; rr(Bx + 4.6, front - 14.4, 24, 6, 3); ctx.fill();
    ctx.fillStyle = col; rr(Bx + 4, front - 15, 24, 6, 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.font = '800 4.2px Overpass, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('MALL', Bx + 16, front - 11.8);
  }
  if (tier === 3) { ctx.strokeStyle = '#5a646a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Bx + 6, By + 11); ctx.lineTo(Bx + 6, By + 3); ctx.stroke(); ctx.fillStyle = '#ff5a4a'; ctx.beginPath(); ctx.arc(Bx + 6, By + 3, 1.3, 0, 6.3); ctx.fill(); }
  // parcels waiting, stacked in the middle of the roof
  const pc = tier ? 4 : 3, pr = 3, n = Math.min(b.pins, pc * pr), px0 = -pc * 5 + 1, py0 = By + 14;
  for (let i = 0; i < n; i++) {
    const px = px0 + (i % pc) * 10, py = py0 + Math.floor(i / pc) * 8;
    ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.fillRect(px + 0.8, py + 1, 8, 6);
    ctx.fillStyle = i % 2 ? '#d7a862' : '#e3b46a'; ctx.fillRect(px, py, 8, 6);
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(px + 3.5, py, 1, 6);
  }
  if (b.pins > pc * pr) { const ox = px0 + (pc - 1) * 10, oy = py0 + pr * 8; ctx.fillStyle = '#d6342a'; rr(ox, oy, 8, 7, 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '800 6px Overpass, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+', ox + 4, oy + 3.8); }
  // fascia in the store's colour, shop window and the two tow-truck garages
  ctx.fillStyle = col; ctx.fillRect(Bx, front - 7, Bw, 7);
  for (const gx of [-18, 18]) { ctx.fillStyle = 'rgba(14,24,30,.8)'; ctx.fillRect(gx - 6, front - 2.6, 12, 2.6); }
  ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(Bx, front - 7, Bw, 1);
  if (tier === 0) {                                                                            // striped awning over the shop window
    for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#fff' : col; ctx.fillRect(-10.5 + i * 3.5, front - 0.5, 3.5, 2.8); }
  }
  for (let i = 0; i < tier; i++) {                                                            // tier chevrons on the roof by the sign
    const cx_ = Bx + 6 + i * 4.5, cy_ = By + 15.5;
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(cx_ - 1.7, cy_ + 1.1); ctx.lineTo(cx_, cy_ - 0.8); ctx.lineTo(cx_ + 1.7, cy_ + 1.1);
    ctx.lineTo(cx_ + 1.7, cy_ + 2.2); ctx.lineTo(cx_, cy_ + 0.3); ctx.lineTo(cx_ - 1.7, cy_ + 2.2); ctx.closePath(); ctx.fill();
  }
  if (showSymbols) glyph(COLORS[b.color].glyph, -12, front - 3.5, 2.2, '#fff');
  // paid upgrades: 1 a lit sign on the roof, 2 solar panels, 3 flags and gold trim
  if (lvl >= 1) {
    ctx.fillStyle = 'rgba(0,0,0,.24)'; rr(-11 + so[0] * 1.5, By + 3 + so[1] * 1.5, 22, 6, 1.4); ctx.fill();
    rr(-11, By + 3, 22, 6, 1.4); ctx.fillStyle = '#12303f'; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 0.9; ctx.stroke();
    if (showSymbols) glyph(COLORS[b.color].glyph, 0, By + 6, 1.8, col); else { ctx.fillStyle = col; ctx.fillRect(-7, By + 5.3, 14, 1.4); }
  }
  if (lvl >= 2) {                                                                              // solar panels down the other side
    ctx.fillStyle = '#1f3552'; ctx.strokeStyle = 'rgba(160,200,240,.55)'; ctx.lineWidth = 0.4;
    for (let j = 0; j < 3; j++) { const sx = Bx + 3, sy = By + 21 + j * 8; ctx.fillRect(sx, sy, 5.5, 6.5); ctx.strokeRect(sx, sy, 5.5, 6.5); }
  }
  if (lvl >= 3) {
    for (const fx_ of [Bx + 2, Bx + Bw - 2]) {
      ctx.strokeStyle = '#8a9296'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(fx_, front + 1); ctx.lineTo(fx_, front - 10); ctx.stroke();
      const wave = REDUCED_MOTION ? 0 : Math.sin(animT * 4 + fx_) * 0.9;
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(fx_, front - 10); ctx.lineTo(fx_ + (fx_ < 0 ? -4.5 : 4.5), front - 8.7 + wave); ctx.lineTo(fx_, front - 7.3); ctx.closePath(); ctx.fill();
    }
  }
  ctx.strokeStyle = col; ctx.lineWidth = 1.4 + tier * 0.8; rr(Bx + 1, By + 1, Bw - 2, Bh - 2, 3.5); ctx.stroke();   // thicker outline = busier tier
  if (lvl >= 3) { ctx.strokeStyle = '#ffc933'; ctx.lineWidth = 0.9; rr(Bx - 1, By - 1, Bw + 2, Bh + 2, 5); ctx.stroke(); }
  ctx.restore();
  {
    const rx0 = wx0, ry1 = wy1, rw = wx1 - wx0, rh = wy1 - wy0;
    ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.fillRect(rx0 + 2.5, wy0 + 2.5, rw - 5, 2); ctx.fillRect(rx0 + 2.5, wy0 + 4.5, 2, rh - 7);   // the parapet's shadow on the roof
    const g = ctx.createLinearGradient(rx0, wy0, wx1, ry1); g.addColorStop(0, 'rgba(255,255,255,.18)'); g.addColorStop(0.55, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.16)');
    rr(rx0, wy0, rw, rh, 3.5); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.moveTo(rx0 + 0.8, ry1 - 2); ctx.lineTo(rx0 + 0.8, wy0 + 0.8); ctx.lineTo(wx1 - 2, wy0 + 0.8); ctx.stroke();   // sunlit rim
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.moveTo(wx1 - 0.6, wy0 + 2); ctx.lineTo(wx1 - 0.6, ry1 - 0.6); ctx.lineTo(rx0 + 2, ry1 - 0.6); ctx.stroke();   // shaded rim
  }
  if (b.acc < 0) drawUnlinked(x, y, b);
}
/* store designs re-roof the building (drawn clipped to the roof, in the store's own frame) */
function storeRoofDesign(sdz, Bx, By, Bw, Bh, col) {
  if (GEN_P.store[sdz]) { storeGen(GEN_P.store[sdz], Bx, By, Bw, Bh, col); return; }
  if (sdz === 'arcade') {                                  // a dark roof lit by a chasing grid of neon tiles
    ctx.fillStyle = '#16122a'; sfr(Bx, By, Bw, Bh);
    const t = REDUCED_MOTION ? 0 : Math.floor(animT * 2);
    ctx.globalAlpha = 0.6;
    for (let yy = By + 4, j = 0; yy < By + Bh - 6; yy += 6, j++) for (let xx = Bx + 4, i = 0; xx < Bx + Bw - 6; xx += 6, i++) if ((i + j + t) % 3 === 0) { ctx.fillStyle = (i + j) % 2 ? '#ff3df2' : '#00e1ff'; sfr(xx, yy, 4, 4); }
    ctx.globalAlpha = 1; ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.strokeRect(Bx + 3, By + 3, Bw - 6, Bh - 6);
  } else if (sdz === 'brick') {                                   // a tar roof inside a red-brick parapet
    ctx.fillStyle = '#4b4f52'; sfr(Bx, By, Bw, Bh);
    ctx.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 40; i++) sfr(Bx + hash01(i, 71) * Bw, By + hash01(i, 72) * Bh, 1, 1);
    ctx.strokeStyle = '#a5523b'; ctx.lineWidth = 4; ctx.strokeRect(Bx + 2, By + 2, Bw - 4, Bh - 4);
    ctx.strokeStyle = 'rgba(255,225,200,.35)'; ctx.lineWidth = 0.4; ctx.setLineDash([1.6, 1]); ctx.strokeRect(Bx + 2, By + 2, Bw - 4, Bh - 4); ctx.setLineDash([]);
  } else if (sdz === 'eco') {                              // a living green roof with planters and a row of solar panels
    ctx.fillStyle = '#6fae55'; sfr(Bx, By, Bw, Bh);
    for (let i = 0; i < 30; i++) { ctx.fillStyle = i % 3 ? '#86c46a' : '#4f8d3f'; ctx.beginPath(); ctx.arc(Bx + hash01(i, 81) * Bw, By + hash01(i, 82) * Bh, 1.2 + hash01(i, 83) * 1.6, 0, 6.3); ctx.fill(); }
    ctx.fillStyle = '#1f3552'; for (let i = 0; i < 5; i++) sfr(Bx + 4 + i * 6, By + 4, 5, 3.4);
    ctx.fillStyle = '#c9b089'; sfr(Bx + Bw / 2 - 0.8, By, 1.6, Bh);                                    // a gravel path
  } else if (sdz === 'neon') {                             // a black roof outlined in glowing neon of the store colour
    ctx.fillStyle = '#1d1f27'; sfr(Bx, By, Bw, Bh);
    ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 6; ctx.strokeStyle = shade(col, 0.35); ctx.lineWidth = 1.4;
    ctx.strokeRect(Bx + 4, By + 4, Bw - 8, Bh - 8); ctx.strokeRect(Bx + 8, By + 8, Bw - 16, 4); ctx.restore();
  } else if (sdz === 'diner') {                            // a chrome-topped diner with a chequered band and a sign
    const g = ctx.createLinearGradient(Bx, By, Bx, By + Bh); g.addColorStop(0, '#e9edf0'); g.addColorStop(0.5, '#b9c1c7'); g.addColorStop(1, '#dfe4e8');
    ctx.fillStyle = g; sfr(Bx, By, Bw, Bh);
    for (let xx = Bx, i = 0; xx < Bx + Bw; xx += 3, i++) { ctx.fillStyle = i % 2 ? '#1f262b' : '#ffffff'; sfr(xx, By + Bh * 0.55, 3, 1.6); ctx.fillStyle = i % 2 ? '#ffffff' : '#1f262b'; sfr(xx, By + Bh * 0.55 + 1.6, 3, 1.6); }
    rr(Bx + Bw / 2 - 12, By + 8, 24, 9, 4.5); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.8; ctx.stroke();
  } else if (sdz === 'pagoda') {                           // tiered pagoda roofs in the store colour with gold finials
    for (let i = 0; i < 4; i++) { const ins = i * 6; rr(Bx + ins, By + ins, Bw - ins * 2, Bh - ins * 2, 3); ctx.fillStyle = shade(col, i % 2 ? 0.08 : -0.18); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 0.6; ctx.stroke(); }
    ctx.fillStyle = '#f2c94c'; for (const [px, py] of [[Bx + 2, By + 2], [Bx + Bw - 2, By + 2], [Bx + 2, By + Bh - 2], [Bx + Bw - 2, By + Bh - 2]]) { ctx.beginPath(); ctx.arc(px, py, 1.4, 0, 6.3); ctx.fill(); }
    ctx.beginPath(); ctx.arc(Bx + Bw / 2, By + Bh / 2, 2, 0, 6.3); ctx.fill();
  } else if (sdz === 'helipad') {                          // a helipad on the roof, ringed with lights
    ctx.fillStyle = '#4a5157'; sfr(Bx, By, Bw, Bh);
    const cx_ = Bx + Bw / 2, cy_ = By + Bh / 2, R_ = Math.min(Bw, Bh) * 0.36;
    ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(cx_, cy_, R_, 0, 6.3); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.font = '900 ' + (R_ * 1.2).toFixed(0) + 'px Overpass, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H', cx_, cy_ + R_ * 0.08);
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, on = REDUCED_MOTION || ((animT * 2 + i / 8) % 1) < 0.5; ctx.fillStyle = on ? '#7dffb0' : '#2f6b4a'; ctx.beginPath(); ctx.arc(cx_ + Math.cos(a) * (R_ + 3), cy_ + Math.sin(a) * (R_ + 3), 0.9, 0, 6.3); ctx.fill(); }
  } else if (sdz === 'crystal') {                          // an iridescent crystal roof that shifts colour slowly
    const t = REDUCED_MOTION ? 0 : animT * 0.25;
    const g = ctx.createLinearGradient(Bx, By, Bx + Bw, By + Bh);
    for (let i = 0; i <= 4; i++) g.addColorStop(i / 4, 'hsl(' + (((t * 360) + i * 70) % 360).toFixed(0) + ',80%,78%)');
    ctx.fillStyle = g; sfr(Bx, By, Bw, Bh);
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 0.6; ctx.beginPath();
    const cxr = Bx + Bw / 2, cyr = By + Bh / 2;
    for (const [px, py] of [[Bx, By], [Bx + Bw, By], [Bx + Bw, By + Bh], [Bx, By + Bh], [cxr, By], [Bx + Bw, cyr], [cxr, By + Bh], [Bx, cyr]]) { ctx.moveTo(cxr, cyr); ctx.lineTo(px, py); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.moveTo(cxr, cyr); ctx.lineTo(Bx, By); ctx.lineTo(cxr, By); ctx.closePath(); softFill();
  } else if (sdz === 'warehouse') {                               // dark corrugated metal
    ctx.fillStyle = '#5b666e'; sfr(Bx, By, Bw, Bh);
    for (let xx = Bx; xx < Bx + Bw; xx += 3) { ctx.fillStyle = 'rgba(255,255,255,.12)'; sfr(xx, By, 1, Bh); ctx.fillStyle = 'rgba(0,0,0,.14)'; sfr(xx + 1.5, By, 0.8, Bh); }
    ctx.fillStyle = 'rgba(170,215,240,.45)'; for (let j = 0; j < 3; j++) sfr(Bx + Bw - 10, By + 8 + j * 12, 5, 6);
  } else if (sdz === 'market') {                           // a striped market-hall canopy in the store colour
    for (let i = 0, xx = Bx; xx < Bx + Bw; xx += 6, i++) { ctx.fillStyle = i % 2 ? '#fbf8f1' : col; sfr(xx, By, 6, Bh); }
    const g = ctx.createLinearGradient(0, By, 0, By + Bh); g.addColorStop(0, 'rgba(255,255,255,.18)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.18)');
    ctx.fillStyle = g; sfr(Bx, By, Bw, Bh);
    ctx.fillStyle = 'rgba(0,0,0,.18)'; sfr(Bx, By + Bh / 2 - 0.4, Bw, 0.8);                               // ridge
  } else if (sdz === 'glass') {                            // a glass curtain-wall tower: sky reflections and mullions
    const g = ctx.createLinearGradient(Bx, By, Bx + Bw, By + Bh); g.addColorStop(0, '#d5eef8'); g.addColorStop(0.55, '#8cc4dd'); g.addColorStop(1, '#5d97b4');
    ctx.fillStyle = g; sfr(Bx, By, Bw, Bh);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.moveTo(Bx + Bw * 0.1, By); ctx.lineTo(Bx + Bw * 0.35, By); ctx.lineTo(Bx + Bw * 0.05, By + Bh); ctx.lineTo(Bx - Bw * 0.2, By + Bh); ctx.closePath(); softFill();
    ctx.strokeStyle = 'rgba(30,60,80,.35)'; ctx.lineWidth = 0.5; ctx.beginPath();
    for (let xx = Bx + 7; xx < Bx + Bw; xx += 7) { ctx.moveTo(xx, By); ctx.lineTo(xx, By + Bh); }
    for (let yy = By + 7; yy < By + Bh; yy += 7) { ctx.moveTo(Bx, yy); ctx.lineTo(Bx + Bw, yy); }
    ctx.stroke();
    ctx.fillStyle = rgba(col, 0.55); sfr(Bx, By, Bw, 2.5);
  }
}
/* world-space box around a building's plot, for outlines */
function plotBox(b, pad) {
  if (!isBig(b)) return {x: tx(b.k) - 19 - pad, y: ty(b.k) - 19 - pad, w: 38 + pad * 2, h: 38 + pad * 2};
  const t = bTiles(b); let c0 = 1e9, r0 = 1e9, c1 = -1, r1 = -1;
  for (const k of t) { c0 = Math.min(c0, cx(k)); r0 = Math.min(r0, cy(k)); c1 = Math.max(c1, cx(k)); r1 = Math.max(r1, cy(k)); }
  return {x: c0 * CELL - pad, y: r0 * CELL - pad, w: (c1 - c0 + 1) * CELL + pad * 2, h: (r1 - r0 + 1) * CELL + pad * 2};
}
/* where a store's floating badge sits: just above its plot */
function badgeAt(b) {
  if (!isBig(b)) return {x: tx(b.k), y: ty(b.k)};
  const box = plotBox(b, 0);
  return {x: box.x + box.w / 2, y: box.y + 24};
}
/* above each house: one dot per parking spot, filled when that car is home, ringed when it is out */
function drawHouseBadge(b) {
  if (b.acc < 0) return;
  const x = tx(b.k), y = ty(b.k), col = COLORS[b.color].hex, cap = houseCap(b), s = clamp(0.95 / cam.z, 1, 2.4);
  const home = b.cars.filter(c => c.state === 'parked' && c.loc.t === 'home').length;
  ctx.save(); ctx.translate(x, y - 21 * s + 5 * (s - 1)); ctx.scale(s, s);
  const w = cap * 4.4 + 4;
  rr(-w / 2 + SUN.x, -3.4 + SUN.y, w, 6.8, 3.4); ctx.fillStyle = PAL.sh; ctx.fill();
  rr(-w / 2, -3.4, w, 6.8, 3.4); ctx.fillStyle = 'rgba(18,48,63,.86)'; ctx.fill();
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
    const sx = (bX(b) - cam.x) * cam.z + W / 2, sy = (bY(b) - cam.y) * cam.z + H / 2;
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
function drawUnlinked(x, y, b) {
  const pulse = 0.5 + 0.5 * Math.sin(animT * 4);
  ctx.strokeStyle = 'rgba(230,70,55,' + (0.5 + pulse * 0.4) + ')'; ctx.lineWidth = 1.6; ctx.setLineDash([3, 3]);
  if (isBig(b)) {                                                    // mark the two entrance tiles: that's where the road goes
    for (const [t] of storeDoors(b)) {
      if (!inPlay(t) || water[t] || (occupied(t) && !road[t])) continue;
      rr(cx(t) * CELL + 4 - pulse * 2, cy(t) * CELL + 4 - pulse * 2, CELL - 8 + pulse * 4, CELL - 8 + pulse * 4, 7); ctx.stroke();
    }
  } else { ctx.beginPath(); ctx.arc(x, y, 19 + pulse * 2, 0, Math.PI * 2); ctx.stroke(); }
  ctx.setLineDash([]);
}
function drawStoreBadge(b) {
  const at = badgeAt(b), x = at.x, y = at.y, col = COLORS[b.color].hex, cap = storeCap(b), lim = overflowLimit();
  const s = clamp(0.95 / cam.z, 1, 2.6);
  const over = b.pins > cap, frac = clamp(b.timer / lim, 0, 1);
  ctx.save(); ctx.translate(x, y - 25 * s + 6 * (s - 1)); ctx.scale(s, s);
  const label = b.pins + '/' + cap, w = 20 + (label.length > 3 ? 3 : 0);
  rr(-w / 2 + SUN.x * 1.6, -5.5 + SUN.y * 1.6, w, 11, 5.5); ctx.fillStyle = PAL.sh; ctx.fill();
  rr(-w / 2, -5.5, w, 11, 5.5); ctx.fillStyle = over ? '#d6342a' : '#12303f'; ctx.fill();
  ctx.lineWidth = 1.4; ctx.strokeStyle = col; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = '700 7.2px Overpass, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, 0.4);
  ctx.restore();
  if (b.timer > 0.05) {
    const R = isBig(b) ? 60 : 24;
    ctx.save(); ctx.translate(bX(b), bY(b) - (isBig(b) ? 0 : 2)); ctx.lineWidth = isBig(b) ? 4.5 : 3.2;
    ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
    const pulse = frac > 0.7 ? 0.65 + 0.35 * Math.sin(animT * 9) : 1;
    ctx.strokeStyle = 'rgba(224,60,48,' + pulse + ')'; ctx.beginPath(); ctx.arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke();
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
/* Vehicles, seen from above with the front at +x. Every upgrade changes the look so models are easy to tell apart:
     carry size picks the body: hatchback (short bubble), estate (long, square back, roof rack), pickup (cab and
       open bed with a roll bar), panel van (white, coloured nose, roof vents), box truck (cab, then a tall box);
     speed kits paint it: sport (white twin stripes and white trim), GT (black bonnet and roof edges, gold pin
       stripes, spoiler, skirts, wide tyres), racer (chequered bonnet, gold trim and rims, big wing, flames);
     loading fits an orange tail-lift, then amber roof beacons; fuel adds a green jerry can, then silver tanks. */
const KIT_TRIM = [null, '#ffffff', '#ffc933', '#ffc933'];
function drawCar(c, sizeBoost) {
  c.da = c.da === undefined ? c.ang : lerpAng(c.da, c.ang, 0.28);            // eased heading into turns
  const bi = bodyOf(c), B = BODY[bi], L = B.L, Wd = B.W, col = COLORS[c.color].hex;
  const kit = carUp(c, 'spd'), ld = carUp(c, 'load'), fu = carUp(c, 'fuel'), hw = Wd / 2, f = L / 2, r = -L / 2;
  const white = '#f4f2ec', dark = shade(col, -0.35), hi = 'rgba(255,255,255,.22)', black = '#1f262b';
  dropShadow(c.x, c.y, c.da, 1, bi >= 3 ? 2.8 : 1.9, [[r, -hw, L, Wd, 2.2]]);
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.da);
  const cd = design('car');
  const cg = GEN_P.car[cd], glowC = cd === 'neon' || cd === 'ghost' ? col : cg && cg.glow;
  if (glowC) {                                             // underglow: in the car's own colour (neon), or the design's
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gl = ctx.createRadialGradient(0, 0, 1, 0, 0, L * 0.85); gl.addColorStop(0, rgba(glowC, 0.55)); gl.addColorStop(1, rgba(glowC, 0));
    ctx.fillStyle = gl; ctx.beginPath(); ctx.ellipse(0, 0, L * 0.85, Wd * 1.25, 0, 0, 6.3); ctx.fill(); ctx.restore();
  }
  // wheels: GT and racer sit on wider tyres, the racer on gold rims; the box truck has a third axle
  const tw = kit >= 2 ? 3.6 : 3, th = kit >= 2 ? 1.7 : 1.2, ax = [f - 2.9, r + 2.9];
  if (bi === 4) ax.push(r + 5.9);
  for (const x of ax) for (const sy of [-1, 1]) {
    wheel(x, sy * hw, tw, th);
    if (kit >= 3) { ctx.fillStyle = '#ffc933'; sfr(x - 0.5, sy * hw - 0.3, 1, 0.6); }
  }
  // 1. the shell, and where its bonnet (paintable nose) and roof sit
  let bon0, bon1, roof0, roof1, nose0;                     // bonnet span, roof span (slots), start of the coloured nose
  if (bi === 0) {                                          // hatchback: a short rounded bubble
    rr(r, -hw, L, Wd, hw); ctx.fillStyle = col; ctx.fill();
    bon0 = f - 3.2; bon1 = f - 0.4; roof0 = r + 2.4; roof1 = f - 4.6; nose0 = r;
  } else if (bi === 1) {                                   // estate: longer, squarer at the back
    rr(r, -hw, L, Wd, 1.5); ctx.fillStyle = col; ctx.fill();
    rr(f - 3, -hw, 3, Wd, hw * 0.85); ctx.fill();
    bon0 = f - 3.4; bon1 = f - 0.4; roof0 = r + 1.8; roof1 = f - 4.9; nose0 = r;
  } else if (bi === 2) {                                   // pickup: cab up front, open bed behind
    const cab = 6.4;
    rr(f - cab, -hw, cab, Wd, 2); ctx.fillStyle = col; ctx.fill();
    rr(r, -hw, L - cab - 0.3, Wd, 1.1); ctx.fillStyle = '#aab3b8'; ctx.fill();                 // bed walls
    rr(r + 0.7, -hw + 0.7, L - cab - 1.7, Wd - 1.4, 0.7); ctx.fillStyle = '#3a4248'; ctx.fill();  // bed floor
    ctx.fillStyle = 'rgba(255,255,255,.12)'; for (let x = r + 1.4; x < f - cab - 1; x += 1.4) sfr(x, -hw + 0.8, 0.3, Wd - 1.6);
    bon0 = f - 2.2; bon1 = f - 0.4; roof0 = r + 1; roof1 = f - cab - 1.3; nose0 = f - cab;
  } else if (bi === 3) {                                   // panel van: tall white body with a coloured nose
    rr(r, -hw, L, Wd, 1.8); ctx.fillStyle = white; ctx.fill();
    ctx.lineWidth = 0.45; ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.stroke();
    rr(f - 4, -hw, 4, Wd, 1.8); ctx.fillStyle = col; ctx.fill();
    bon0 = f - 1.4; bon1 = f - 0.3; roof0 = r + 1.2; roof1 = f - 5.4; nose0 = f - 4;
  } else {                                                 // box truck: short cab, a gap, then a tall box
    const cab = 4.9;
    rr(f - cab, -hw + 0.4, cab, Wd - 0.8, 1.6); ctx.fillStyle = col; ctx.fill();
    ctx.fillStyle = black; sfr(f - cab - 0.7, -hw + 1.2, 0.7, Wd - 2.4);                 // the gap between cab and box
    rr(r, -hw, L - cab - 0.7, Wd, 0.9); ctx.fillStyle = white; ctx.fill();
    ctx.lineWidth = 0.45; ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.stroke();
    bon0 = f - 1.3; bon1 = f - 0.3; roof0 = r + 1; roof1 = f - cab - 1.6; nose0 = f - cab;
  }
  // 2. speed-kit paint, under the glass and roof
  if (kit === 1) {                                         // sport: white twin racing stripes nose to tail
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    const s0 = bi >= 2 ? nose0 : r + 0.3;
    sfr(s0, -1.35, f - 0.3 - s0, 0.8); sfr(s0, 0.55, f - 0.3 - s0, 0.8);
  } else if (kit === 2) {                                  // GT: black bonnet, gold pin stripes
    ctx.fillStyle = black; rr(bon0 - 0.4, -hw + 0.5, bon1 - bon0 + 0.4, Wd - 1, 0.8); ctx.fill();
    ctx.fillStyle = '#ffc933'; const s0 = bi >= 2 ? nose0 : r + 0.4;
    sfr(s0, -hw + 0.7, f - 0.6 - s0, 0.4); sfr(s0, hw - 1.1, f - 0.6 - s0, 0.4);
  } else if (kit >= 3) {                                   // racer: chequered bonnet
    const cw = Math.max(0.8, (bon1 - bon0 + 0.4) / 3), y0 = -hw + 0.5, rows = 4, chh = (Wd - 1) / rows;
    for (let i = 0; i < 3; i++) for (let j = 0; j < rows; j++) { ctx.fillStyle = (i + j) % 2 ? black : '#ffffff'; sfr(bon0 - 0.4 + i * cw, y0 + j * chh, cw, chh); }
  }
  if (cd === 'camo') {                                     // camouflage blotches in shades of the car's colour
    ctx.save(); rr(r, -hw, L, Wd, 1.5); ctx.clip();
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = i % 2 ? shade(col, -0.4) : shade(col, 0.25);
      ctx.beginPath(); ctx.ellipse(r + hash01(c.id * 7 + i, 91) * L, (hash01(c.id * 7 + i, 92) - 0.5) * Wd, 1.2 + hash01(i, 93) * 1.6, 0.9 + hash01(i, 94), hash01(i, 95) * 3, 0, 6.3); ctx.fill();
    }
    ctx.restore();
  }
  if (cd === 'galaxy') {                                   // a starry night sky over the paint, the car's colour glowing through
    ctx.save(); rr(r, -hw, L, Wd, bi === 0 ? hw : 1.5); ctx.clip();
    const gg = ctx.createLinearGradient(r, -hw, f, hw); gg.addColorStop(0, 'rgba(26,15,61,.88)'); gg.addColorStop(0.55, rgba(col, 0.5)); gg.addColorStop(1, 'rgba(10,8,30,.9)');
    ctx.fillStyle = gg; sfr(r, -hw, L, Wd);
    for (let i = 0; i < 6; i++) { const tw_ = REDUCED_MOTION ? 0.8 : 0.5 + 0.5 * Math.sin(animT * 3 + i * 1.7 + c.id); ctx.fillStyle = 'rgba(255,255,255,' + tw_.toFixed(2) + ')'; sfr(r + hash01(c.id * 5 + i, 97) * L, -hw + hash01(c.id * 5 + i, 98) * Wd, 0.45, 0.45); }
    ctx.restore();
  }
  if (cd === 'police') {                                   // white doors on the car's own colour
    ctx.save(); rr(r, -hw, L, Wd, bi === 0 ? hw : 1.5); ctx.clip(); ctx.fillStyle = '#f4f2ec'; sfr(r + L * 0.3, -hw, L * 0.36, Wd); ctx.restore();
  }
  if (cg && cg.k) {                                        // a generated paint job, kept inside the body
    ctx.save(); rr(r, -hw, L, Wd, bi === 0 ? hw : 1.5); ctx.clip();
    const cs = cg.c || ['#ffffff'];
    if (cg.k === 'dots') { for (let x = r + 1.2, i = 0; x < f - 0.6; x += cg.big ? 2.6 : 2, i++) for (const yy of [-hw * 0.5, hw * 0.5]) { ctx.fillStyle = cs[(i + (yy > 0 ? 1 : 0)) % cs.length]; ctx.beginPath(); ctx.arc(x + (yy > 0 ? 1 : 0), yy, cg.big ? 0.75 + hash01(i, yy > 0 ? 7 : 8) * 0.4 : 0.5, 0, 6.3); ctx.fill(); } }
    else if (cg.k === 'stripe') { const n = cs.length, sw = Math.min(0.9, Wd * 0.55 / n); cs.forEach((cc, i) => { ctx.fillStyle = cc; sfr(r + 0.3, -n * sw / 2 + i * sw, L - 0.6, sw * 0.82); }); }
    else if (cg.k === 'band') { ctx.fillStyle = cs[0]; sfr(r + 1, -hw + 0.2, L - 2, 0.95); sfr(r + 1, hw - 1.15, L - 2, 0.95); }
    else if (cg.k === 'nose') { ctx.fillStyle = cs[0]; ctx.beginPath(); ctx.ellipse(f, 0, L * 0.26, hw * 1.15, 0, 0, 6.3); ctx.fill(); }
    else if (cg.k === 'fade') { const gg = ctx.createLinearGradient(r, 0, f, 0); gg.addColorStop(0, rgba(cs[0], 0.8)); gg.addColorStop(0.55, rgba(cs[1], 0.3)); gg.addColorStop(1, rgba(cs[1], 0)); ctx.fillStyle = gg; ctx.fillRect(r, -hw, L, Wd); }
    else if (cg.k === 'zebra') { ctx.strokeStyle = cs[0]; ctx.lineWidth = 0.8; ctx.lineCap = 'round'; ctx.beginPath(); for (let x = r - Wd; x < f; x += 2.1) { ctx.moveTo(x, hw + 0.5); ctx.lineTo(x + Wd * 0.8, -hw - 0.5); } ctx.stroke(); }
    else if (cg.k === 'spots') { for (let i = 0; i < 9; i++) { const sx = r + 1 + hash01(i, 121) * (L - 2), sy = (hash01(i, 122) - 0.5) * (Wd - 1.4), s_ = 0.55 + hash01(i, 123) * 0.4; ctx.fillStyle = cs[0]; ctx.beginPath(); ctx.ellipse(sx, sy, s_, s_ * 0.8, hash01(i, 124) * 3, 0, 6.3); ctx.fill(); if (cs[1]) { ctx.fillStyle = cs[1]; ctx.beginPath(); ctx.arc(sx, sy, s_ * 0.45, 0, 6.3); ctx.fill(); } } }
    else if (cg.k === 'roundel') { const rx = (bon0 + bon1) / 2; ctx.fillStyle = cs[0]; sfr(r + 0.4, -0.25, L - 0.8, 0.5); ctx.beginPath(); ctx.arc(rx, 0, hw * 0.62, 0, 6.3); ctx.fill(); ctx.fillStyle = cs[1] || col; ctx.beginPath(); ctx.arc(rx, 0, hw * 0.28, 0, 6.3); ctx.fill(); }
    else if (cg.k === 'split') { ctx.fillStyle = cs[0]; rr(r - 1, -hw - 1, L * 0.5 + 1, Wd + 2, hw + 1); ctx.fill(); }
    else if (cg.k === 'confetti') { cs.forEach((cc, j) => { ctx.fillStyle = cc; ctx.beginPath(); for (let i = j; i < 22; i += cs.length) { const ex = r + 0.6 + hash01(i, 131) * (L - 1.2), ey = (hash01(i, 132) - 0.5) * (Wd - 0.8), a = hash01(i, 133) * 3.1; ctx.moveTo(ex + Math.cos(a) * 0.6, ey + Math.sin(a) * 0.6); ctx.ellipse(ex, ey, 0.6, 0.28, a, 0, 6.3); } ctx.fill(); }); }
    else if (cg.k === 'plaid') { ctx.globalAlpha = 0.5; ctx.fillStyle = cs[0]; for (const yy of [-hw * 0.5, hw * 0.5]) sfr(r, yy - 0.45, L, 0.9); ctx.fillStyle = cs[1] || cs[0]; for (let x = r + 1.2; x < f; x += 2.4) sfr(x, -hw, 0.8, Wd); ctx.globalAlpha = 1; for (const yy of [-hw * 0.5, hw * 0.5]) sfr(r, yy - 0.08, L, 0.16); }
    else if (cg.k === 'clouds') { ctx.fillStyle = cs[0]; ctx.beginPath(); for (let x = r + 0.4, i = 0; x < f + 0.5; x += 1.5, i++) { const s_ = 0.85 + (i % 2) * 0.3; ctx.moveTo(x + s_, -hw); ctx.arc(x, -hw, s_, 0, 6.3); ctx.moveTo(x + 0.75 + s_, hw); ctx.arc(x + 0.75, hw, s_, 0, 6.3); } ctx.fill(); }
    else if (cg.k === 'scales') { ctx.strokeStyle = cs[0]; ctx.lineWidth = 0.32; ctx.globalAlpha = 0.85; ctx.beginPath(); for (let y = -hw - 0.2, j = 0; y < hw + 1; y += 1.3, j++) for (let x = r + (j % 2) * 0.85; x < f + 1; x += 1.7) { ctx.moveTo(x + 0.85, y); ctx.arc(x, y, 0.85, 0, Math.PI); } ctx.stroke(); ctx.globalAlpha = 1; }
    else if (cg.k === 'flowers') { for (let i = 0; i < 3; i++) { const fx = r + L * (0.18 + i * 0.32), fy = (i % 2 ? 0.32 : -0.32) * hw; ctx.fillStyle = cs[0]; ctx.beginPath(); for (let j = 0; j < 5; j++) { const a = j * 1.2566 + i, px = fx + Math.cos(a) * 0.62, py = fy + Math.sin(a) * 0.62; ctx.moveTo(px + 0.42, py); ctx.arc(px, py, 0.42, 0, 6.3); } ctx.fill(); ctx.fillStyle = cs[1] || '#ffd23a'; ctx.beginPath(); ctx.arc(fx, fy, 0.36, 0, 6.3); ctx.fill(); } }
    else if (cg.k === 'rings') { ctx.strokeStyle = cs[0]; ctx.lineWidth = 0.35; ctx.beginPath(); for (let i = 0; i < 4; i++) { const x = r + L * (0.16 + i * 0.22), y = (i % 2 ? 0.3 : -0.3) * hw, s_ = 0.75 + (i % 2) * 0.25; ctx.moveTo(x + s_, y); ctx.arc(x, y, s_, 0, 6.3); } ctx.stroke(); }
    else if (cg.k === 'paws') { ctx.fillStyle = cs[0]; ctx.beginPath(); [[f - 2.3, 0, 0.95], [r + 1.25, 0, 0.75]].forEach(([px, py, s_]) => { ctx.moveTo(px - s_ * 0.3 + s_ * 0.5, py); ctx.arc(px - s_ * 0.3, py, s_ * 0.5, 0, 6.3); for (let j = 0; j < 3; j++) { const a = -0.9 + j * 0.9, tx_ = px - s_ * 0.3 + Math.cos(a) * s_ * 0.88, ty_ = py + Math.sin(a) * s_ * 0.88; ctx.moveTo(tx_ + s_ * 0.26, ty_); ctx.arc(tx_, ty_, s_ * 0.26, 0, 6.3); } }); ctx.fill(); }   // a paw on the bonnet and one on the boot
    else if (cg.k === 'tiger') { ctx.strokeStyle = cs[0]; ctx.lineWidth = 0.75; ctx.lineCap = 'round'; ctx.beginPath(); for (let x = r + 1.3; x < f - 0.6; x += 1.9) { ctx.moveTo(x, -hw - 0.3); ctx.lineTo(x + 0.55, -hw * 0.28); ctx.moveTo(x + 0.95, hw + 0.3); ctx.lineTo(x + 0.4, hw * 0.28); } ctx.stroke(); }
    else if (cg.k === 'blobs') { ctx.globalAlpha = 0.9; cs.forEach((cc, j) => { ctx.fillStyle = cc; ctx.beginPath(); for (let i = j; i < 9; i += cs.length) { const edge = i < 6, bx = edge ? r + 0.8 + hash01(i, 141) * (L - 1.6) : i === 6 ? f - 2.2 : i === 7 ? r + 1.2 : f - 1, by = edge ? (i % 2 ? 1 : -1) * (hw - 0.2 - hash01(i, 142) * 0.5) : (hash01(i, 142) - 0.5) * 1.2, rx = (edge ? 0.9 : 0.7) + hash01(i, 143) * 0.7, ry = 0.55 + hash01(i, 144) * 0.4, a = (hash01(i, 145) - 0.5) * 0.8; ctx.moveTo(bx + Math.cos(a) * rx, by + Math.sin(a) * rx); ctx.ellipse(bx, by, rx, ry, a, 0, 6.3); } ctx.fill(); }); ctx.globalAlpha = 1; }   // soft blobs along both sides, the bonnet and the boot
    else if (cg.k === 'vfade') { const gg = ctx.createLinearGradient(0, -hw, 0, hw); gg.addColorStop(0, rgba(cs[0], 0.9)); gg.addColorStop(0.5, rgba(cs[1] || cs[0], 0.35)); gg.addColorStop(1, rgba(cs[1] || cs[0], 0)); ctx.fillStyle = gg; ctx.fillRect(r, -hw, L, Wd); }
    else if (cg.k === 'swirl') { ctx.strokeStyle = cs[0]; ctx.lineWidth = 0.45; ctx.lineCap = 'round'; ctx.beginPath(); [[f - 2.25, 1.75, 1.0], [r + 1.2, 1.0, 0.9]].forEach(([cx, rx, ry]) => { for (let t = 0; t <= 11; t += 0.3) { const k_ = t / 11, a = t * 1.15; t ? ctx.lineTo(cx + Math.cos(a) * rx * k_, Math.sin(a) * ry * k_ * 2.2) : ctx.moveTo(cx, 0); } }); ctx.stroke(); }   // a curl on the bonnet and a smaller one on the boot
    else if (cg.k === 'wave') { ctx.strokeStyle = cs[0]; ctx.lineWidth = 0.75; ctx.lineCap = 'round'; ctx.beginPath(); for (let x = r; x <= f + 0.01; x += 0.4) { const yy = Math.sin((x - r) * 1.1) * hw * 0.45; x === r ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); } ctx.stroke(); }
    else if (cg.k === 'star') {                            // p60 trophy: gold sills and a pale roundel with a five-point gold star
      const rx = (bon0 + bon1) / 2, sr = hw * 0.64;
      ctx.fillStyle = cs[0]; sfr(r + 0.4, -hw, L - 0.8, 0.7); sfr(r + 0.4, hw - 0.7, L - 0.8, 0.7);
      ctx.fillStyle = cs[1] || '#ffffff'; ctx.beginPath(); ctx.arc(rx, 0, sr, 0, 6.3); ctx.fill();
      ctx.fillStyle = cs[0]; ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = -1.5708 + i * 0.6283, rad = i % 2 ? sr * 0.34 : sr * 0.8; ctx.lineTo(rx + Math.cos(a) * rad, Math.sin(a) * rad); }
      ctx.closePath(); ctx.fill();
    }
    else if (cg.k === 'ghost') {                           // a pale see-through sheet over the paint with a wavy hem at the back and two dark eyes; the colour is the outline and the underglow
      const bob = REDUCED_MOTION ? 0 : Math.sin(animT * 3 + c.id) * 0.3, ey = f - 2.4;
      ctx.fillStyle = 'rgba(246,244,255,.88)'; sfr(r, -hw, L, Wd);
      ctx.fillStyle = rgba(col, 0.5); ctx.beginPath(); for (let y = -hw + 0.7; y < hw; y += 1.4) { ctx.moveTo(r + 1.7, y + bob * 0.5); ctx.arc(r + 1, y + bob * 0.5, 0.7, 0, 6.3); } ctx.fill();
      ctx.fillStyle = '#2a2438';
      for (const sy of [-1.05, 1.05]) { ctx.beginPath(); ctx.ellipse(ey, sy + bob, 0.62, 0.88, 0, 0, 6.3); ctx.fill(); }
      ctx.beginPath(); ctx.ellipse(ey + 1.3, bob, 0.3, 0.45, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.75)'; for (const sy of [-1.3, 0.8]) { ctx.beginPath(); ctx.arc(ey - 0.15, sy + bob, 0.18, 0, 6.3); ctx.fill(); }
      rr(r, -hw, L, Wd, bi === 0 ? hw : 1.5); ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.stroke();
    }
    ctx.restore();
  }
  if (cd === 'pastel') {                                   // a soft pastel wash over the paint, with a white roof
    ctx.save(); rr(r, -hw, L, Wd, bi === 0 ? hw : 1.5); ctx.clip(); ctx.fillStyle = 'rgba(255,255,255,.42)'; sfr(r, -hw, L, Wd); ctx.restore();
  }
  if (cd === 'champion') {                                 // a champion's livery: white centre stripe edged in gold
    ctx.fillStyle = '#ffffff'; sfr(r + 0.4, -1.1, L - 0.8, 2.2);
    ctx.fillStyle = '#d4af37'; sfr(r + 0.4, -1.4, L - 0.8, 0.35); sfr(r + 0.4, 1.05, L - 0.8, 0.35);
  }
  if (cd === 'checker') {                                  // a taxi-style chequered band down each side
    ctx.save(); rr(r, -hw, L, Wd, 1.5); ctx.clip();
    const cw = 1.3;
    for (let x = r + 1.5, i = 0; x < f - 1.5; x += cw, i++) for (const [y0, j] of [[-hw, 0], [hw - 1.4, 1]]) {
      ctx.fillStyle = (i + j) % 2 ? '#1f262b' : '#ffffff'; sfr(x, y0, cw, 0.7); ctx.fillStyle = (i + j) % 2 ? '#ffffff' : '#1f262b'; sfr(x, y0 + 0.7, cw, 0.7);
    }
    ctx.restore();
  }
  if (cd === 'flames') {                                   // hot-rod flames licking back from the nose
    ctx.save(); rr(r, -hw, L, Wd, 1.5); ctx.clip();
    const fl = (c1, sc) => {
      ctx.fillStyle = c1; ctx.beginPath(); ctx.moveTo(f, -hw * sc);
      for (let i = 0; i <= 4; i++) { const t = i / 4, yy = -hw * sc + 2 * hw * sc * t; ctx.lineTo(f - L * (0.32 + (i % 2) * 0.18) * sc, yy - hw * 0.22 * sc); ctx.lineTo(f - L * 0.08, yy); }
      ctx.lineTo(f, hw * sc); ctx.closePath(); softFill();
    };
    fl('#ff7a1a', 1); fl('#ffd23a', 0.65);
    ctx.restore();
  }
  if (cd === 'livery') {                                   // a bold white swoosh along the body
    ctx.save(); rr(r, -hw, L, Wd, 1.5); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.beginPath(); ctx.moveTo(r, hw); ctx.lineTo(r + L * 0.35, hw); ctx.lineTo(r + L * 0.7, -hw); ctx.lineTo(r + L * 0.5, -hw); ctx.closePath(); softFill();
    ctx.fillStyle = shade(col, -0.45); ctx.beginPath(); ctx.moveTo(r + L * 0.38, hw); ctx.lineTo(r + L * 0.46, hw); ctx.lineTo(r + L * 0.8, -hw); ctx.lineTo(r + L * 0.72, -hw); ctx.closePath(); softFill();
    ctx.restore();
  }
  // 3. glass, roof and the details that make each body its own
  if (bi === 0 || bi === 1) {
    rr(r + 1, -hw + 0.5, L - 2, Wd * 0.28, 1); ctx.fillStyle = hi; ctx.fill();
    glass(f - (bi === 0 ? 4.4 : 4.7), -hw + 0.8, 1.9, Wd - 1.6, 0.7);                       // windscreen
    glass(r + (bi === 0 ? 1 : 0.6), -hw + 1, bi === 0 ? 1.3 : 1, Wd - 2, 0.5);              // rear window
    rr(roof0, -hw + 0.8, roof1 - roof0, Wd - 1.6, 1.2); ctx.fillStyle = shade(col, kit === 2 ? -0.45 : 0.18); ctx.fill();
    if (bi === 1) {                                        // estate: side windows and a roof rack
      ctx.fillStyle = 'rgba(24,44,58,.75)'; sfr(roof0, -hw + 0.15, roof1 - roof0, 0.5); sfr(roof0, hw - 0.65, roof1 - roof0, 0.5);
      ctx.fillStyle = '#2a3036'; sfr(roof0 + 0.1, -hw + 0.9, roof1 - roof0 - 0.2, 0.45); sfr(roof0 + 0.1, hw - 1.35, roof1 - roof0 - 0.2, 0.45);
      for (const t of [0.12, 0.88]) sfr(roof0 + (roof1 - roof0) * t - 0.2, -hw + 0.9, 0.45, Wd - 1.8);
    }
  } else if (bi === 2) {
    rr(nose0 + 0.6, -hw + 0.5, 6.4 - 1.2, Wd * 0.28, 1); ctx.fillStyle = hi; ctx.fill();
    glass(f - 3.6, -hw + 0.8, 1.7, Wd - 1.6, 0.6);
    glass(nose0 + 0.4, -hw + 1.1, 0.9, Wd - 2.2, 0.4);
    ctx.fillStyle = '#2a3036'; sfr(nose0 - 1, -hw + 0.2, 0.7, Wd - 0.4);               // roll bar
    ctx.fillStyle = '#8b9398'; sfr(r, -hw + 0.4, 0.5, Wd - 0.8);                      // tailgate
  } else if (bi === 3) {
    glass(f - 3, -hw + 0.8, 1.6, Wd - 1.6, 0.5);
    ctx.fillStyle = col; sfr(r + 0.6, -hw + 0.3, L - 5, 1); sfr(r + 0.6, hw - 1.3, L - 5, 1);   // livery bands
    ctx.fillStyle = 'rgba(0,0,0,.14)'; sfr(roof0 + (roof1 - roof0) * 0.5, -hw + 1.4, 0.35, Wd - 2.8);   // roof seam
    ctx.fillStyle = '#c3c8cb'; rr(f - 5.3, -0.9, 1.4, 1.8, 0.3); ctx.fill();                   // roof vent
  } else {
    glass(f - 2, -hw + 1.1, 1.4, Wd - 2.2, 0.5);
    ctx.fillStyle = 'rgba(0,0,0,.09)';
    for (let x = r + 1.6; x < f - 5.6; x += 1.6) sfr(x, -hw + 0.3, 0.35, Wd - 0.6);    // box ribs
    ctx.fillStyle = col; sfr(f - 6.6, -hw + 0.2, 1.1, Wd - 0.4);                       // coloured band on the box front
    sfr(r + 0.3, -hw + 0.25, L - 7, 0.8); sfr(r + 0.3, hw - 1.05, L - 7, 0.8);
  }
  if (cg && cg.roof && bi <= 1) { rr(roof0, -hw + 0.8, roof1 - roof0, Wd - 1.6, 1.2); ctx.fillStyle = cg.roof; ctx.fill(); }
  if (cd && cd.startsWith('season_')) {                    // a season crest: a metal band in the division's tint and a laurel roundel on the bonnet
    const mt = {season_bronze: '#c27a43', season_silver: '#c9d3dc', season_gold: '#ffd23a', season_platinum: '#bff3ff', season_diamond: '#7fe3ff'}[cd] || '#ffd23a';
    ctx.fillStyle = mt; sfr(r + 0.5, -hw + 0.3, L - 1, 0.9); sfr(r + 0.5, hw - 1.2, L - 1, 0.9);
    ctx.fillStyle = mt; ctx.beginPath(); ctx.arc((bon0 + bon1) / 2, 0, 1.5, 0, 6.3); ctx.fill(); ctx.fillStyle = '#1f262b'; ctx.beginPath(); ctx.arc((bon0 + bon1) / 2, 0, 0.7, 0, 6.3); ctx.fill();
  }
  if (cd === 'police') {                                   // a light bar across the roof, flashing red and blue
    const on = REDUCED_MOTION ? 0 : Math.floor(animT * 5 + c.id) % 2, mx = (roof0 + roof1) / 2;
    ctx.fillStyle = '#1f262b'; sfr(mx - 0.8, -hw + 0.8, 1.6, Wd - 1.6);
    ctx.fillStyle = on ? '#ff3b3b' : '#8a2020'; sfr(mx - 0.55, -hw + 1, 1.1, hw - 1.1);
    ctx.fillStyle = on ? '#2f4fa0' : '#3d7bff'; sfr(mx - 0.55, 0.1, 1.1, hw - 1.1);
  }
  if (cd === 'retro') {                                    // chrome everywhere: bumpers, a roof trim line and whitewall tyres
    ctx.fillStyle = '#e6eaee'; sfr(f - 0.8, -hw - 0.2, 0.8, Wd + 0.4); sfr(r, -hw - 0.2, 0.8, Wd + 0.4);
    ctx.strokeStyle = 'rgba(235,240,245,.9)'; ctx.lineWidth = 0.35; rr(roof0 - 0.4, -hw + 0.4, roof1 - roof0 + 0.8, Wd - 0.8, 1.4); ctx.stroke();
    ctx.fillStyle = '#f4f2ec'; for (const x of [f - 2.9, r + 2.9]) for (const sy of [-1, 1]) sfr(x - 0.9, sy * hw - 0.25, 1.8, 0.5);
  }
  if (cd === 'gold') {                                     // gold plated: gold trim, gold wheels and a little sparkle (the body keeps its colour)
    const gg = ctx.createLinearGradient(r, -hw, f, hw); gg.addColorStop(0, '#fff1a8'); gg.addColorStop(0.5, '#d4af37'); gg.addColorStop(1, '#9c7a12');
    ctx.strokeStyle = gg; ctx.lineWidth = 0.75; rr(r + 0.35, -hw + 0.35, L - 0.7, Wd - 0.7, bi === 0 ? hw - 0.35 : 1.4); ctx.stroke();
    ctx.fillStyle = gg; sfr(f - 0.7, -hw + 0.3, 0.7, Wd - 0.6); sfr(r, -hw + 0.3, 0.7, Wd - 0.6);
    for (const x of [f - 2.9, r + 2.9]) for (const sy of [-1, 1]) { ctx.fillStyle = '#e8c547'; sfr(x - 1.1, sy * hw - 0.35, 2.2, 0.7); }
    if (!REDUCED_MOTION) { const tw_ = (animT * 1.3 + c.id * 0.37) % 1; if (tw_ < 0.25) { const sx = r + L * tw_ * 4, a = 1 - Math.abs(tw_ * 8 - 1); ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')'; ctx.beginPath(); ctx.arc(sx, -hw * 0.3, 0.6, 0, 6.3); ctx.fill(); } }
  }
  if (cd === 'pastel' && bi <= 2) { rr(roof0 - 0.2, -hw + 0.6, roof1 - roof0 + 0.4, Wd - 1.2, 1.3); ctx.fillStyle = '#fbfaf6'; ctx.fill(); }
  if (cd === 'twotone') {                                  // a white roof and chrome bumpers (vans and trucks get a coloured roof stripe)
    if (bi <= 2) { rr(roof0 - 0.2, -hw + 0.6, roof1 - roof0 + 0.4, Wd - 1.2, 1.3); ctx.fillStyle = '#f6f4ee'; ctx.fill(); }
    else { ctx.fillStyle = col; sfr(roof0, -0.6, roof1 - roof0, 1.2); }
    ctx.fillStyle = '#dfe4e8'; sfr(f - 0.55, -hw + 0.3, 0.55, Wd - 0.6); sfr(r, -hw + 0.3, 0.55, Wd - 0.6);
  }
  drawSlots(c, roof0 + 0.4, roof1 - 0.4, Wd - (bi >= 3 ? 2.8 : 2.4));
  if (cd === 'champion') {                                 // a gold star on the roof
    const sx = (roof0 + roof1) / 2, R_ = Math.min(1.6, hw - 1);
    ctx.fillStyle = '#ffd23a'; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rd = i % 2 ? R_ * 0.45 : R_; ctx.lineTo(sx + Math.cos(a) * rd, Math.sin(a) * rd); }
    ctx.closePath(); softFill();
  }
  if (cd === 'neon') { ctx.strokeStyle = shade(col, 0.45); ctx.lineWidth = 0.45; rr(r + 0.2, -hw + 0.2, L - 0.4, Wd - 0.4, bi === 0 ? hw - 0.2 : 1.4); ctx.stroke(); }
  // trim around the painted nose shows the kit at a glance, even zoomed out
  if (kit) {
    ctx.strokeStyle = KIT_TRIM[kit]; ctx.lineWidth = 0.55;
    if (bi <= 1) rr(r + 0.25, -hw + 0.25, L - 0.5, Wd - 0.5, bi === 0 ? hw - 0.25 : 1.3);
    else rr(nose0 + 0.25, -hw + 0.25 + (bi === 4 ? 0.4 : 0), f - nose0 - 0.5, Wd - 0.5 - (bi === 4 ? 0.8 : 0), 1.5);
    ctx.stroke();
  }
  // lights and mirrors
  ctx.fillStyle = '#fff4c4'; sfr(f - 0.7, -hw + 0.7, 0.7, 1.2); sfr(f - 0.7, hw - 1.9, 0.7, 1.2);
  ctx.fillStyle = c.brake ? '#ff3b30' : '#8f2a24'; sfr(r, -hw + 0.7, 0.7, 1.2); sfr(r, hw - 1.9, 0.7, 1.2);
  const mx = bi <= 1 ? f - 4.4 : bi === 2 ? f - 3.6 : f - 2.8;
  ctx.fillStyle = bi >= 3 ? col : dark; sfr(mx, -hw - 0.7, 0.8, 0.7); sfr(mx, hw, 0.8, 0.7);
  // GT spoiler and skirts; racer wing and flames
  if (kit === 2) {
    ctx.fillStyle = black;
    sfr(r + 2, -hw - 0.4, L - 4, 0.5); sfr(r + 2, hw - 0.1, L - 4, 0.5);     // side skirts
    rr(r - 1.1, -hw + 0.3, 1.2, Wd - 0.6, 0.4); ctx.fill();                                     // spoiler
  } else if (kit >= 3) {
    rr(r - 2, -hw - 1, 1.5, Wd + 2, 0.5); ctx.fillStyle = '#ffc933'; ctx.fill();                 // big gold wing
    ctx.fillStyle = black; sfr(r - 0.6, -hw + 1.2, 0.7, 0.5); sfr(r - 0.6, hw - 1.7, 0.7, 0.5);   // wing stays
    if (c.v > 10 && !REDUCED_MOTION) {
      const fl = 0.6 + 0.4 * Math.sin(animT * 30 + c.id);
      ctx.fillStyle = 'rgba(255,140,30,' + fl.toFixed(2) + ')'; ctx.beginPath(); ctx.arc(r - 2.6, -hw + 1.6, 0.9, 0, 6.3); ctx.arc(r - 2.6, hw - 1.6, 0.9, 0, 6.3); ctx.fill();
    }
  }
  // loading: an orange tail-lift with hazard marks, then amber roof beacons
  if (ld > 0) {
    const tl = kit >= 2 ? 0 : 0.3;
    ctx.fillStyle = '#f39a1e'; sfr(r - 1.1 - tl, -hw + 1, 1.1, Wd - 2);
    ctx.fillStyle = black; for (let y = -hw + 1.5; y < hw - 1.4; y += 1.4) sfr(r - 1.1 - tl, y, 1.1, 0.5);
    if (ld >= 2) {
      const on = REDUCED_MOTION || Math.sin(animT * 9 + c.id) > -0.2;
      ctx.fillStyle = on ? '#ffb020' : '#a8661a';
      ctx.beginPath(); ctx.arc(roof1 + 0.1, -hw + 1.1, 0.75, 0, 6.3); ctx.arc(roof1 + 0.1, hw - 1.1, 0.75, 0, 6.3); ctx.fill();
    }
  }
  // fuel: a green jerry can on the side, then long-range silver tanks down both sides
  if (fu === 1) {
    rr(r + 1.3, -hw - 1.1, 2.4, 1.2, 0.3); ctx.fillStyle = '#2f9a4a'; ctx.fill();
    ctx.fillStyle = '#ffffff'; sfr(r + 1.6, -hw - 0.95, 0.5, 0.4);
  } else if (fu >= 2) {
    for (const sy of [-1, 1]) {
      const y0 = sy < 0 ? -hw - 1.1 : hw - 0.1;
      rr(r + L * 0.28, y0, L * 0.36, 1.2, 0.6); ctx.fillStyle = '#c9d1d6'; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.7)'; sfr(r + L * 0.3, y0 + 0.2, L * 0.32, 0.3);
      ctx.fillStyle = '#ffc933'; sfr(r + L * 0.28 + L * 0.36 - 1, y0 + 0.3, 0.6, 0.6);
    }
  }
  if (c.broken > 0 && Math.sin(animT * 12) > 0) { ctx.fillStyle = '#ffab1a'; ctx.beginPath(); ctx.arc(r, -hw, 1.3, 0, 6.3); ctx.arc(r, hw, 1.3, 0, 6.3); ctx.arc(f, -hw, 1.3, 0, 6.3); ctx.arc(f, hw, 1.3, 0, 6.3); ctx.fill(); }
  ctx.restore();
  if (c.broken > 0) {
    ctx.save(); ctx.translate(c.x - Math.cos(c.ang) * 14, c.y - Math.sin(c.ang) * 14);
    ctx.fillStyle = '#e63a2e'; ctx.beginPath(); ctx.moveTo(0, -3.4); ctx.lineTo(3, 2.4); ctx.lineTo(-3, 2.4); ctx.closePath(); softFill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -1.6); ctx.lineTo(1.5, 1.4); ctx.lineTo(-1.5, 1.4); ctx.closePath(); softFill();
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
function drawTruck(t, sc) {
  const L = t.len, Wd = 7.6, on = t.job === 'seek' || t.job === 'home' || t.hauling;
  if (!sc) dropShadow(t.x, t.y, t.ang, 1, 2.2, [[-L / 2, -Wd / 2, L, Wd, 2.4]]);
  ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.ang); if (sc) ctx.scale(sc, sc);
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
  dropShadow(a.x, a.y, a.ang, 1, 2.4, [[-L / 2, -Wd / 2, L, Wd, 2.4]]);
  ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.ang);
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
  ctx.beginPath(); ctx.arc(bX(s), bY(s), (isBig(s) ? 58 : 24) + Math.sin(animT * 5) * 2, 0, 6.3); ctx.stroke(); ctx.setLineDash([]);
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
      ctx.fillStyle = PAL.sh; ctx.beginPath(); ctx.arc(px + 0.8, py + 1.1, 3.1, 0, 6.3); ctx.fill();
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
    ctx.save(); ctx.translate(x + SUN.x * 1.2, y + SUN.y * 1.2); ctx.rotate(ang); ctx.globalAlpha = SUN.a; ctx.fillStyle = PAL.sh;
    ctx.beginPath(); ctx.moveTo(7.5, 0); ctx.lineTo(-4, -5); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = '#ffd23a'; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(7.5, 0); ctx.lineTo(-4, -5); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
function drawContractBadge(b) {
  if (!b.contract) return;
  const at = badgeAt(b), sc = clamp(0.95 / cam.z, 1, 2.6), x = isBig(b) ? at.x + 22 * sc : at.x, y = isBig(b) ? at.y - 25 * sc + 6 * (sc - 1) : at.y - CELL * 0.62, frac = clamp(b.contract.left / CFG.contractSeconds, 0, 1);
  dotShadow(x, y, 7, 1.6);
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = '#ffd23a'; ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, 7, 0, 6.3); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#8a5b00'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 4.6, -Math.PI / 2, -Math.PI / 2 + frac * 6.283); ctx.stroke();
  ctx.restore();
}
function drawStoreLevel(b) {
  if (!b.lvl) return;
  const at = badgeAt(b), sc = clamp(0.95 / cam.z, 1, 2.6), x = at.x, y = isBig(b) ? at.y - 25 * sc + 6 * (sc - 1) + 9 * sc : at.y + CELL * 0.4;
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
  for (const bd of buildings) glow(bX(bd), bY(bd), isBig(bd) ? 58 : 30, 0.28 * na, '255,200,120');
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
  else if (tool === 'rail') ok = railFits(hoverCell) && canTake('rail');
  else if (tool === 'bus') ok = bAt[hoverCell] >= 0;
  else if (tool === 'select') ok = true;
  else if (tool === 'upgrade') ok = bAt[hoverCell] >= 0 && buildings[bAt[hoverCell]].type === 'store' && storeUpCost(buildings[bAt[hoverCell]]) !== null && money >= storeUpCost(buildings[bAt[hoverCell]]);
  else if (tool === 'tow') ok = bAt[hoverCell] >= 0 && buildings[bAt[hoverCell]].type === 'store' && buildings[bAt[hoverCell]].trucks < CFG.towTrucksPerStore && money >= truckPrice();
  const col = tool === 'select' ? 'rgba(255,255,255,.7)' : ok ? (theme === 'dark' ? '#ffd766' : '#12303f') : '#e0483e';
  ctx.strokeStyle = col; ctx.lineWidth = 2 / Math.max(0.7, cam.z * 0.7); ctx.setLineDash([4, 3]);
  const hb = bAt[hoverCell] >= 0 ? buildings[bAt[hoverCell]] : null;
  if (isBig(hb) && (tool === 'select' || tool === 'upgrade' || tool === 'tow' || tool === 'erase')) { const bx = plotBox(hb, 1); rr(bx.x, bx.y, bx.w, bx.h, 8); }
  else rr(X + 1, Y + 1, CELL - 2, CELL - 2, 5);
  ctx.stroke(); ctx.setLineDash([]);
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
  const box = plotBox(b, isBig(b) ? 3 : 0); rr(box.x, box.y, box.w, box.h, 8); ctx.stroke(); ctx.setLineDash([]);
}

/* ------------------------------------------------------------- draw */
function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (W / 2 - cam.x * cam.z), dpr * (H / 2 - cam.y * cam.z));
  const vr = viewRect();
  updateSun();
  drawGround(vr);
  drawTrees(vr);
  drawRoads();
  drawRail(vr);
  drawJunctionFurniture(vr);
  drawOneways(vr);
  drawClosures(vr);
  drawBuildings(vr);
  drawTutorialBeacons();
  if (showHeat) drawHeat();
  if (showFlow) drawFlow(vr);
  drawSelectedBuilding();
  drawSelectedRoute();
  for (const c of cars) if (showMoto || !(c.edge && c.edge.fast) && !(c.cr && c.cr.outE && c.cr.outE.fast)) drawCar(c);
  for (const t of trucks) { if (t.state === 'garage' && isBig(buildings[t.store])) continue; drawTruck(t, t.state === 'garage' ? 0.62 : 0); }   // parked ones wait inside their store
  for (const a of ambs) { drawAmbTarget(a); drawAmb(a); }
  drawTransport();
  drawPeds();                                                                                  // p62
  for (const b of buildings) { if (b.type === 'store') { drawStoreLevel(b); drawStoreBadge(b); drawContractBadge(b); } else drawHouseBadge(b); }
  drawDrones(); drawFX(); drawMotoPick();
  const na = nightAmount();
  if (na > 0.02) drawNight(vr, na);
  drawOutside(vr);
  drawHover();
  drawOffscreenAlerts();
  drawWeather();                                                                               // p62: snow, fog, heat (screen space)
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
  if (!patchCache) buildPatches();
  mctx.fillStyle = PAL.patch;
  for (let r = x0; r < x1; r++) for (let c = x0; c < x1; c++) if (patchMask[idx(c, r)]) mctx.fillRect((c - x0) * k, (r - x0) * k, k + 0.5, k + 0.5);
  mctx.fillStyle = PAL.water;
  for (let r = x0; r < x1; r++) for (let c = x0; c < x1; c++) if (water[idx(c, r)]) mctx.fillRect((c - x0) * k, (r - x0) * k, k + 0.5, k + 0.5);
  mctx.strokeStyle = PAL.edge; mctx.lineWidth = Math.max(1, k * 0.5); mctx.lineCap = 'round';
  mctx.beginPath();
  for (const e of edges) { if (e.a > e.b && !e.fast) continue; if (e.fast && !showMoto) continue; mctx.moveTo((e.ax / CELL - x0) * k, (e.ay / CELL - x0) * k); mctx.lineTo((e.bx / CELL - x0) * k, (e.by / CELL - x0) * k); }
  mctx.stroke();
  for (const b of buildings) {
    mctx.fillStyle = COLORS[b.color].hex;
    const X = (cx(b.k) - x0) * k, Y = (cy(b.k) - x0) * k;
    if (b.type === 'store') {
      const bx = plotBox(b, 0), PX = (bx.x / CELL - x0) * k, PY = (bx.y / CELL - x0) * k, PW = bx.w / CELL * k, PH = bx.h / CELL * k;
      if (isBig(b)) mctx.fillRect(PX, PY, PW, PH); else mctx.fillRect(X - 0.5, Y - 0.5, k + 1, k + 1);
      if (b.timer > 0.5) { mctx.strokeStyle = '#e0483e'; mctx.lineWidth = 1.5; if (isBig(b)) mctx.strokeRect(PX - 2, PY - 2, PW + 4, PH + 4); else mctx.strokeRect(X - 2, Y - 2, k + 4, k + 4); }
    } else { mctx.beginPath(); mctx.arc(X + k / 2, Y + k / 2, k * 0.45, 0, 6.3); mctx.fill(); }
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
  oneway: '<path d="M12 4v16"/><path d="M6 10l6-6 6 6"/>',
  rail: '<path d="M8 3v18M16 3v18M8 7.5h8M8 12h8M8 16.5h8"/>',
  bus: '<rect x="4" y="3.5" width="16" height="14.5" rx="3.5"/><path d="M4 11h16M8 18v2.5M16 18v2.5"/><circle cx="8" cy="14.5" r="1"/><circle cx="16" cy="14.5" r="1"/>',
  drone: '<circle cx="12" cy="12" r="2.6"/><path d="M9.9 9.9L7.2 7.2M14.1 9.9l2.7-2.7M9.9 14.1l-2.7 2.7M14.1 14.1l2.7 2.7"/><circle cx="5.5" cy="5.5" r="2.2"/><circle cx="18.5" cy="5.5" r="2.2"/><circle cx="5.5" cy="18.5" r="2.2"/><circle cx="18.5" cy="18.5" r="2.2"/>'
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
TOOLS.push(   /* p61: picked from the dock, no key; hidden until unlocked */
  {id: 'rail', label: 'Rail', icon: 'rail', key: '', inv: 'rail', group: 'build', hint: 'Drag to lay rail. Rail beside a store or a house makes a station; a line with two stations gets a train that shuttles 6 parcels a trip.'},
  {id: 'bus', label: 'Bus', icon: 'bus', key: '', inv: 'bus', group: 'build', hint: 'Tap a store, then up to 4 houses of its colour, then the store again: a bus loops them with 3 parcels at a time.'});
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
/* Notifications while playing: 'all', 'warn' (warnings only) or 'off'. Anything that answers a button
   press still shows, and nothing is hidden on menus or in the tutorial. */
let notesMode = 'all', lastUiAct = 0;
document.addEventListener('pointerdown', e => { if (e.target && e.target.id !== 'cv') lastUiAct = performance.now(); }, true);
document.addEventListener('pointerdown', e => { const b = e.target && e.target.closest && e.target.closest('button,.rl-item,.rl-tile,.tool,.cbtn'); if (b && !b.disabled) sfx('ui'); }, true);
document.addEventListener('keydown', () => { lastUiAct = performance.now(); }, true);
function muteToast(kind) {
  if (notesMode === 'all' || !started || over || tutorialMode || spectating || !$('m-start').hidden) return false;
  if (performance.now() - lastUiAct < 900) return false;           // feedback for something the player just did
  return notesMode === 'off' || kind !== 'warn';
}
function toast(msg, kind) {
  const box = $('toasts'); if (!box || demoMode) return;
  if (muteToast(kind)) return;
  const small = compactUI(), text = kind === 'tip' ? String(msg).replace(/^Tip:\s*/, '').replace(/^./, c => c.toUpperCase()) : String(msg);
  const lastT = box.lastElementChild;
  if (lastT && !lastT.classList.contains('out') && lastT.dataset.text === text && lastT.dataset.kind === (kind || '')) {   // the same again: count it up
    const n = (+lastT.dataset.n || 1) + 1; lastT.dataset.n = n;
    let c = lastT.querySelector('.tcount'); if (!c) { c = document.createElement('em'); c.className = 'tcount'; lastT.append(c); }
    c.textContent = '\u00d7' + n; lastT.classList.remove('bump'); void lastT.offsetWidth; lastT.classList.add('bump');
    clearTimeout(lastT._t); lastT._t = setTimeout(() => { lastT.classList.add('out'); setTimeout(() => { if (lastT.parentNode) lastT.parentNode.removeChild(lastT); }, 400); }, small ? 2400 : 3400);
    return;
  }
  while (box.children && box.children.length >= (small ? 2 : 3)) box.removeChild(box.children[0]);
  const d = document.createElement('div'); d.dataset.text = text; d.dataset.kind = kind || '';
  d.className = 'toast' + (kind ? ' ' + kind : '');
  const txt = document.createElement('span'); txt.textContent = kind === 'tip' ? String(msg).replace(/^Tip:\s*/, '').replace(/^./, c => c.toUpperCase()) : msg;
  d.innerHTML = hudIcon(kind === 'good' ? 'good' : kind === 'warn' ? 'warn' : kind === 'tip' ? 'tip' : 'info', 17);
  if (kind === 'tip') { const k = document.createElement('b'); k.textContent = 'Tip'; d.append(k); }
  d.append(txt);
  box.append(d);
  d._t = setTimeout(() => { d.classList.add('out'); setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 400); }, small ? (kind === 'tip' ? 4200 : 2400) : (kind === 'tip' ? 6500 : 3400));
}

/* ---------------------------------------------------------------- sound */
let actx = null, muted = false;
function sfxReady() { return !!actx; }
function sfx(kind) {
  if (muted || !audioPrefs.sfx || !audioPrefs.sfxVol) return;
  if (kind === 'ui' && !audioPrefs.ui) return;
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
      g.gain.setValueAtTime(0.0001, t + (delay || 0)); g.gain.exponentialRampToValueAtTime((vol || 0.05) * audioPrefs.sfxVol, t + (delay || 0) + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (delay || 0) + dur);
      o.connect(g); g.connect(actx.destination); o.start(t + (delay || 0)); o.stop(t + (delay || 0) + dur + 0.02);
    };
    if (kind === 'place') tone(420, 0.08, 'triangle', 0.05, 0, 520);
    else if (kind === 'erase') tone(300, 0.09, 'triangle', 0.04, 0, 200);
    else if (kind === 'deliver') { tone(660, 0.09, 'sine', 0.045); tone(880, 0.12, 'sine', 0.04, 0.07); }
    else if (kind === 'upgrade') { tone(523, 0.12, 'triangle', 0.05); tone(659, 0.12, 'triangle', 0.05, 0.1); tone(784, 0.2, 'triangle', 0.05, 0.2); }
    else if (kind === 'alarm') { tone(320, 0.18, 'square', 0.03); tone(260, 0.22, 'square', 0.03, 0.2); }
    else if (kind === 'over') { tone(300, 0.3, 'sawtooth', 0.05, 0, 90); }
    else if (kind === 'buck') { tone(988, 0.09, 'sine', 0.035); tone(1319, 0.16, 'sine', 0.03, 0.06); }
    else if (kind === 'ui') tone(1200, 0.025, 'sine', 0.014, 0, 900);
    else if (kind === 'click') tone(700, 0.05, 'triangle', 0.03, 0, 500);
    else if (kind === 'crate') { tone(330, 0.1, 'triangle', 0.05, 0, 660); tone(990, 0.2, 'sine', 0.04, 0.12); }
    else if (kind === 'claim') { tone(784, 0.1, 'sine', 0.04); tone(988, 0.1, 'sine', 0.04, 0.09); tone(1319, 0.25, 'sine', 0.045, 0.18); }
  } catch (e) {}
}
/* ---- the soundtrack: a slow, generated ambient piece (soft pad chords, sparse bell notes, a wash of reverb)
   with a quiet hum of distant traffic underneath that swells and settles with how many cars are moving.
   Nothing is downloaded; it is all made here with Web Audio, and it only starts after your first click or key. */
const audioPrefs = {music: true, musicVol: 0.6, traffic: 0.45, sfx: true, sfxVol: 1, ui: true, haptics: true};
/* a short buzz on phones (deliveries, week ends, game over, crates, the daily reward) */
function haptic(kind) {
  if (!audioPrefs.haptics || !navigator.vibrate) return;
  const P = {deliver: 8, week: [12, 50, 12], over: [70, 40, 70], crate: 18, claim: [10, 30, 20], ui: 4};
  try { navigator.vibrate(P[kind] || 10); } catch (e) {}
}
let mus = null;
const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);
const MUSIC_CHORDS = [[48, 52, 55, 59, 62], [45, 48, 52, 55, 59], [41, 45, 48, 52, 57], [43, 47, 50, 55, 57]];   // Cmaj9, Am9, Fmaj9, G6
const MUSIC_BELLS = [72, 74, 76, 79, 81, 84, 86];                                                              // C major pentatonic
function musicInit() {
  if (mus) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    const a = actx, master = a.createGain(); master.gain.value = muted ? 0 : 1; master.connect(a.destination);
    const len = Math.floor(a.sampleRate * 3.4), ir = a.createBuffer(2, len, a.sampleRate);         // a soft hall
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8); }
    const verb = a.createConvolver(); verb.buffer = ir;
    const wet = a.createGain(); wet.gain.value = 0.6; verb.connect(wet); wet.connect(master);
    const musicBus = a.createGain(); musicBus.gain.value = 0;
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1700;
    musicBus.connect(lp); lp.connect(master); lp.connect(verb);
    const nb = a.createBuffer(1, a.sampleRate * 4, a.sampleRate), nd = nb.getChannelData(0);   // brown noise: a far-off road
    let lastN = 0; for (let i = 0; i < nd.length; i++) { lastN = (lastN + 0.02 * (Math.random() * 2 - 1)) / 1.02; nd[i] = lastN * 3.2; }
    const src = a.createBufferSource(); src.buffer = nb; src.loop = true;
    const tf = a.createBiquadFilter(); tf.type = 'lowpass'; tf.frequency.value = 480;
    const tg = a.createGain(); tg.gain.value = 0;
    src.connect(tf); tf.connect(tg); tg.connect(master); src.start();
    mus = {a, master, musicBus, verb, tg, tf, next: a.currentTime + 0.4, bell: a.currentTime + 4, chord: 0};
  } catch (e) { mus = null; }
}
function musicVoice(f, t0, dur, vol, type, detune) {
  const a = mus.a, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.value = f; o.detune.value = detune || 0;
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(2.6, dur * 0.35));
  g.gain.setValueAtTime(vol, t0 + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(mus.musicBus); o.start(t0); o.stop(t0 + dur + 0.05);
}
function musicTick() {
  if (!mus) return;
  const a = mus.a, now = a.currentTime;
  mus.master.gain.setTargetAtTime(muted ? 0 : 1, now, 0.15);
  mus.musicBus.gain.setTargetAtTime(audioPrefs.music ? audioPrefs.musicVol * 0.9 : 0, now, 0.6);
  // traffic hum: louder with more cars on the move, a little brighter when it jams
  const moving = (started && !over && cars) ? cars.reduce((n, c) => n + (c.state === 'driving' || c.state === 'crossing' ? 1 : 0), 0) : 0;
  const lvl = started && !over && running ? clamp(moving / 24, moving ? 0.18 : 0, 1) : 0;
  mus.tg.gain.setTargetAtTime(audioPrefs.traffic * 0.075 * lvl, now, 1.2);
  mus.tf.frequency.setTargetAtTime(420 + (stats ? stats.jamPct : 0) * 260, now, 2);
  if (!audioPrefs.music || muted) { mus.next = Math.max(mus.next, now + 0.2); mus.bell = Math.max(mus.bell, now + 1); return; }
  if (now > mus.next - 0.25) {                      // the next chord, overlapping the last one as it fades
    const ch = MUSIC_CHORDS[mus.chord++ % MUSIC_CHORDS.length], t0 = Math.max(now, mus.next), dur = 11;
    for (const m of ch) { musicVoice(midiHz(m), t0, dur, 0.016, 'triangle', -5); musicVoice(midiHz(m), t0 + 0.08, dur, 0.012, 'sine', 6); }
    musicVoice(midiHz(ch[0] - 12), t0, dur, 0.03, 'sine');
    mus.next = t0 + 8;
  }
  if (now > mus.bell) {                             // a soft bell now and then
    const m = pick(MUSIC_BELLS), t0 = now + 0.05, f = midiHz(m), g = a.createGain(), o = a.createOscillator(), o2 = a.createOscillator();
    o.type = 'sine'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 2.01;
    const g2 = a.createGain(); g2.gain.value = 0.25; o2.connect(g2); g2.connect(g); o.connect(g); g.connect(mus.musicBus);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.028, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.8);
    o.start(t0); o2.start(t0); o.stop(t0 + 3); o2.stop(t0 + 3);
    mus.bell = now + 1.6 + Math.random() * 4.2;
  }
}
/* browsers only allow sound after the player has clicked or pressed a key */
function audioWake() { musicInit(); if (actx && actx.state === 'suspended') actx.resume(); }
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, audioWake, {capture: true}));
document.addEventListener('visibilitychange', () => { if (!actx) return; if (document.hidden) actx.suspend(); else if (mus) actx.resume(); });
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
  sfx('deliver'); haptic('deliver'); bump('v-score'); bump('v-money');
  if (questsActive()) { questEvent('deliver', n); questEvent('trips', 1); questEvent('earn', Math.floor(stats.earned || 0)); }
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
  const sd = $('btn-sound'); if (sd) { sd.setAttribute('aria-pressed', muted ? 'true' : 'false'); sd.dataset.tip = muted ? 'Sound off' : 'Sound on'; sd.dataset.key = 'N'; }
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
  overflow: 'Tip: a store is overflowing. Connect its new houses, buy cars, or add a lot.',
  rain: 'Tip: rain slows every car for a while. Nothing to fix \u2014 ride it out.',
  contract: 'Tip: contract! Collect enough parcels from that store before its dial runs out.',
  tier: 'Tip: a store got busier, so its parcels arrive faster.',
  breakdown: 'Tip: a broken-down car blocks its lane. A tow truck clears it automatically.',
  upgrade: 'Tip: click any car to upgrade its cargo, engine, loading or fuel tank \u2014 or a house to buy another car.',
  offscreen: 'Tip: red arrows on the screen edge point at stores overflowing out of view.',
  fuel: 'Tip: a house can\u2019t send a car that far. A stock fuel tank covers 16 road tiles and no motorways \u2014 click a car and fit a bigger Fuel tank.'
};
const TIPS_KEY = 'junction-tips-seen';
let tipsOn = true;                  // pop-up tips; they can always be read in the City tab
const seenTips = new Set((() => { try { return JSON.parse(localStorage.getItem(TIPS_KEY)) || []; } catch (e) { return []; } })());
function tipOnce(id) {
  if (demoMode) return;
  if (tutorialMode || seenTips.has(id) || !TIPS[id]) return;
  seenTips.add(id);
  try { localStorage.setItem(TIPS_KEY, JSON.stringify([...seenTips])); } catch (e) {}
  if (tipsOn) toast(TIPS[id], 'tip');
  renderTipsList();
}
function renderTipsList() {
  const box = $('tips-list'); if (!box) return;
  box.innerHTML = '';
  for (const id in TIPS) {
    const li = document.createElement('li'), seen = seenTips.has(id);
    li.className = seen ? '' : 'new';
    li.textContent = TIPS[id].replace(/^Tip:\s*/, '').replace(/^./, c => c.toUpperCase());
    if (!seen) { const t = document.createElement('small'); t.textContent = 'Not come up yet'; li.append(t); }
    box.append(li);
  }
}
function bindTipsToggle() {
  const t = $('opt-tips'); if (t) t.addEventListener('change', () => { tipsOn = t.checked; savePrefs(true); toast(tipsOn ? 'Tips on' : 'Tips off \u2014 you can still read them here'); });
  const r = $('tips-reset'); if (r) r.addEventListener('click', () => {
    seenTips.clear(); try { localStorage.removeItem(TIPS_KEY); } catch (e) {}
    renderTipsList(); toast(tipsOn ? 'Tips will show again as they come up' : 'Tips reset \u2014 turn them on to see them pop up');
  });
  renderTipsList();
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
  const items = [['road', 'Road tiles'], ['bridge', 'Bridges'], ['park', 'Lots'], ['depot', 'Bays'], ['moto', 'Motorways'], ['light', 'Lights'], ['round', 'Roundabouts'], ['sign', 'Signs'], ['rail', 'Rail tiles'], ['bus', 'Bus routes']];
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
    html += '<p class="line muted">Fuel: ' + fuelText(carUp(c, 'fuel')) + '</p>';
    html += '<h5 class="ihead2">Upgrades for this vehicle</h5><div class="uprows">';
    for (const t of ['cap', 'spd', 'load', 'fuel']) {
      const u = CAR_UP[t], l = carUp(c, t);
      const nextName = l >= u.max ? (t === 'fuel' ? 'Long-range: ' + fuelText(l) : 'Fully upgraded') : t === 'fuel' ? 'Now: ' + fuelText(l) + '. Next: ' + fuelText(l + 1) : t === 'cap' ? 'Next: ' + BODY[Math.min(BODY.length - 1, Math.max(bodyOf(c), l + 1))].name + ' \u2014 ' + u.what : t === 'spd' ? 'Next: ' + KIT[l + 1] + ' kit \u2014 ' + u.what : u.what;
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
    if (b.acc < 0) html += '<p class="line warn">' + (isBig(b) ? (b.ends ? 'Not connected to a road. It opens at one end of its car park only: bring a road to the dashed square.' : 'Not connected to a road. Bring a road to either end of its car park (the dashed squares).') : 'Not connected to a road. Lay road on a tile beside it.') + '</p>';
    if (b.type === 'store') {
      const cap = storeCap(b), frac = clamp(b.timer / overflowLimit(), 0, 1);
      html += '<p class="line">Parcels waiting <b>' + b.pins + '</b> of ' + cap + ' bays · ' + b.claimed + ' claimed</p>';
      if (b.fuelShort && clock - b.fuelShort < 8) html += '<p class="line warn">Some ' + COLORS[b.color].name.toLowerCase() + ' cars can\u2019t reach here on their fuel. A stock tank covers 16 road tiles and no motorways \u2014 click a car and fit a bigger Fuel tank.</p>';
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
    if (nd.junction) html += '<h5 class="ihead2">Last five minutes</h5><canvas class="flowchart" id="i-flow" width="240" height="70" aria-label="Cars a minute and average wait over the last five minutes"></canvas>' +
                             '<p class="line muted fp-leg"><i style="background:var(--good)"></i>' + Math.round(flowRateInto(nd)) + ' cars/min <i style="background:var(--bad)"></i>' + (nd.waitN ? nd.waitSum / nd.waitN : 0).toFixed(1) + ' s avg wait</p>';
    if (nd.junction) html += '<div id="i-junc"></div>';       // filled below on its own, so the light panel above isn't rebuilt when cash changes
  }
  setHTML(body, html);
  if (sel.type === 'tile' && nodes[sel.k] && nodes[sel.k].type === 'light') bindLightPanel(nodes[sel.k]);
  if (sel.type === 'tile' && nodes[sel.k]) drawFlowChart($('i-flow'), nodes[sel.k]);
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
/* a yes/no question in the game's own style. Resolves true for OK, false for Cancel; Enter and Esc work too. */
let askResolve = null;
function ask(o) {
  o = o || {};
  $('ask-title').textContent = o.title || 'Are you sure?';
  $('ask-text').textContent = o.text || '';
  const ok = $('ask-ok'), cancel = $('ask-cancel');
  ok.textContent = o.ok || 'OK'; cancel.textContent = o.cancel || 'Cancel';
  ok.classList.toggle('danger', !!o.danger);
  if (askResolve) askResolve(false);
  openModal('m-ask');
  setTimeout(() => { try { (o.danger ? cancel : ok).focus(); } catch (e) {} }, 30);
  return new Promise(res => { askResolve = v => { askResolve = null; closeModal('m-ask'); res(!!v); }; });
}
function bindAsk() {
  $('ask-ok').addEventListener('click', () => { if (askResolve) askResolve(true); });
  $('ask-cancel').addEventListener('click', () => { if (askResolve) askResolve(false); });
  $('m-ask').addEventListener('click', e => { if (e.target === $('m-ask') && askResolve) askResolve(false); });
}
/* ---- the pause menu: Esc while playing. Resume, keep editing while paused, restart, settings, help, or save and quit. */
function openPause() {
  if (!started || over || spectating || demoMode || modalOpen || !$('m-start').hidden) return false;
  if (isoLive()) { isoAsk(running ? 'pause' : 'resume'); return false; }
  running = false; closeInspector(); closeMenu(); toggleCust(false);
  renderPause(); openModal('m-pause'); refreshUI();
  return true;
}
function renderPause() {
  const sec = Math.round(clock), mm = Math.floor(sec / 60), ss = String(sec % 60).padStart(2, '0');
  $('pause-title').textContent = tutorialMode ? 'Tutorial paused' : DIFF.label + ' \u00b7 week ' + week;
  $('pause-stats').innerHTML = [['Week', week], ['Parcels', score.toLocaleString('en-US')], ['Time', mm + ':' + ss], ['Cash', '$' + Math.round(money).toLocaleString('en-US')], ['Cars', cars.length], ['Trips', stats.trips]]
    .map(([a, b]) => '<div><b>' + b + '</b><span>' + a + '</span></div>').join('');
  $('pause-restart').hidden = tutorialMode || diffKey === 'iso';
}
function closePause(resume) {
  if ($('m-pause').hidden) return;
  closeModal('m-pause');
  if (resume) running = true;
  refreshUI();
}
function bindPause() {
  $('pause-resume').addEventListener('click', () => closePause(true));
  $('pause-edit').addEventListener('click', () => { closePause(false); hint('Paused \u2014 build away. Press P or the play button when you\u2019re ready.'); });
  $('pause-restart').addEventListener('click', async () => {
    if (!(await ask({title: 'Restart this city?', text: 'Week ' + week + ' and ' + score + ' parcels will be lost. The same mode starts again on a fresh map.', ok: 'Restart', danger: true}))) return;
    const dk = diffKey, slot = curSlot; closePause(false);
    pendingSlot = slot; resetGame(dk); running = true; refreshHud(); layout(); writeSlot();
  });
  $('pause-settings').addEventListener('click', () => { closePause(false); openMenu('settings'); });
  $('pause-help').addEventListener('click', () => openModal('m-help'));
  $('pause-quit').addEventListener('click', () => { closePause(false); goHome(); });
  $('m-pause').addEventListener('click', e => { if (e.target === $('m-pause')) closePause(true); });
}
/* ---- a quick fade between the main menu and a city (and the splash screen on load) */
function fadeFlash(ms) {
  const f = $('fade'); if (!f) return;
  ms = ms || (REDUCED_MOTION ? 160 : 420);
  f.hidden = false; f.style.transition = 'none'; f.style.opacity = '1'; void f.offsetWidth;
  f.style.transition = 'opacity ' + ms + 'ms ease'; f.style.opacity = '0';
  clearTimeout(fadeFlash.t); fadeFlash.t = setTimeout(() => { f.hidden = true; }, ms + 40);
}
let booted = false;
/* ---- the installable app: a service worker caches the game for offline play; the browser's install prompt is offered in Settings */
let installPrompt = null, swWaiting = null;
function setupApp() {
  const note = $('app-note'), ib = $('btn-install'), ub = $('btn-update');
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').then(reg => {
      const watch = () => { const w = reg.waiting; if (w && navigator.serviceWorker.controller) { swWaiting = w; if (ub) ub.hidden = false; } };
      watch(); reg.addEventListener('updatefound', () => { const nw = reg.installing; if (nw) nw.addEventListener('statechange', watch); });
    }).catch(e => console.warn('Service worker not registered', e));
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (swWaiting) location.reload(); });
  }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; if (ib) ib.hidden = false; });
  window.addEventListener('appinstalled', () => { installPrompt = null; if (ib) ib.hidden = true; if (note) note.textContent = 'Junction is installed. Open it from your home screen or app list.'; toast('Junction is installed', 'good'); });
  if (ib) ib.addEventListener('click', async () => { if (!installPrompt) return; installPrompt.prompt(); try { await installPrompt.userChoice; } catch (e) {} installPrompt = null; ib.hidden = true; });
  if (ub) ub.addEventListener('click', () => { if (swWaiting) swWaiting.postMessage('skipWaiting'); else location.reload(); });
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone && note) note.textContent = 'You\u2019re playing the installed app. Single player works offline; online features need a connection.';
  else if (note && /iphone|ipad/i.test(navigator.userAgent) && !standalone) note.textContent = 'On iPhone and iPad: tap Share, then \u201cAdd to Home Screen\u201d to install Junction.';
}
function splashStep(p) { const b = $('sp-bar'); if (b) b.style.width = Math.round(p * 100) + '%'; }
function splashDone() {
  const sp = $('splash'); if (!sp) return;
  splashStep(1);
  setTimeout(() => { sp.classList.add('out'); setTimeout(() => { if (sp.parentNode) sp.parentNode.removeChild(sp); booted = true; }, REDUCED_MOTION ? 200 : 650); }, 120);
}
function openModal(id) {
  $(id).hidden = false; modalOpen = true;
  if (id === 'm-start') {
    if (!started || over || tutorialMode) startDemo();      // nothing to come back to: put the background city on
    $('app').classList.add('in-menu'); showMM(null); renderNews();
  }
}
/* ---- the main menu: Play, Saves, Friends, Customise, Settings and Account on the left; Leaderboard, Store,
   Weeklys, Tutorial, Feedback and Watch a player on the right; your balance top left. The middle shows
   whichever section is picked. */
let mmPane = null, playMode = 'standard', cusTab = 'mine';
function setIsoPending(n) { isoPending = n; if (mmPane === 'play' && !$('m-start').hidden) renderPlay(); }
function setCusTab(t) {
  cusTab = t;
  document.querySelectorAll('[data-cus]').forEach(b => b.setAttribute('aria-pressed', b.dataset.cus === t ? 'true' : 'false'));
  $('mm-custom').hidden = t !== 'mine'; $('mm-coll').hidden = t !== 'coll'; $('mm-cus-lead').hidden = t !== 'mine';
  if (t === 'coll') renderCollection($('mm-coll')); else renderShop($('mm-custom'), 'owned');
}
/* what's new, sliding by above the weekly tile */
const NEWS = [
  {tag: 'Update', title: 'What’s new in ' + VERSION, text: 'Pause menu, share cards, quality and accessibility settings, daily rewards, 50 of everything, and more.', go: 'whatsnew', art: ['store', 'golden']},
  {tag: 'New credits', title: '◎ coins and ✦ stars', text: 'Everyone starts fresh: 2 ◎ for every 3 parcels, and ✦ stars from Frantic cities.', go: 'store', art: ['store', 'golden']},
  {tag: 'New mode', title: 'ISO 1v1', text: 'Challenge a player: live side by side, or a daily duel scored category by category.', go: 'iso', art: ['car', 'rainbowstripe']},
  {tag: 'New designs', title: 'Hundreds of new designs', text: 'At least 36 of everything: cars, houses, roads, stores, lights, roundabouts, bridges, motorways, themes, maps, decorations and panel styles.', go: 'store', art: ['car', 'tidal']},
  {tag: 'Collection', title: 'Track your collection', text: 'See everything you own and how to get the rest, in Customise and Account.', go: 'coll', art: ['house', 'observatory']},
  {tag: 'Weekly', title: 'See this week\u2019s map', text: 'A seed makes the same map for everyone. Look it over before you play.', go: 'weekly', art: 'seed'},
  {tag: 'Crates', title: 'Mystery crates', text: 'Colour, item and object crates hold unique designs the Store never sells.', go: 'store', art: ['store', 'golden']},
  {tag: 'Store', title: 'Fresh stock every hour', text: '6 items and 6 colours each hour, and a daily special for ✦.', go: 'store', art: ['moto', 'galaxy']}
];
let newsAt = 0, newsHover = false;
function renderNews() {
  const tr = $('news-track'); if (!tr) return;
  const ev = activeEvent();
  if (ev && !NEWS.some(n => n.go === 'event')) NEWS.unshift({tag: ev.tag, title: ev.title, text: ev.text, go: 'event', art: ['car', COSMETICS['design:car:ghost'] ? 'ghost' : 'galaxy']});
  if (!tr.childElementCount) {
    tr.innerHTML = NEWS.map((n, i) => '<button type="button" class="news-s" data-n="' + i + '"><span class="news-t"><em>' + n.tag + '</em><b>' + n.title + '</b><small>' + n.text + '</small></span><canvas width="' + (n.art === 'seed' ? 120 : 132) + '" height="' + (n.art === 'seed' ? 120 : 88) + '"></canvas></button>').join('');
    $('news-dots').innerHTML = NEWS.map((n, i) => '<button type="button" data-nd="' + i + '" aria-label="' + n.title + '"></button>').join('');
    tr.querySelectorAll('.news-s').forEach(b => b.addEventListener('click', () => { const n = NEWS[+b.dataset.n]; if (n.go === 'coll') { showMM('custom'); setCusTab('coll'); } else if (n.go === 'whatsnew') openWhatsNew(); else if (n.go === 'event') showMM('quests'); else if (n.go === 'iso') { playMode = 'iso'; showMM('play'); } else showMM(n.go); }));
    $('news-dots').querySelectorAll('[data-nd]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); newsAt = +b.dataset.nd; showNews(); }));
    $('mm-news').addEventListener('mouseenter', () => { newsHover = true; }); $('mm-news').addEventListener('mouseleave', () => { newsHover = false; });
  }
  tr.querySelectorAll('canvas').forEach((c, i) => { const a = NEWS[i].art; if (a === 'seed') drawSeedMap(c, 0, false); else designPreview(c.getContext('2d'), a[0], a[1], c.width, c.height); });
  showNews();
}
function showNews() {
  document.querySelectorAll('#news-track .news-s').forEach((s2, i) => { s2.classList.toggle('on', i === newsAt); s2.setAttribute('aria-hidden', i === newsAt ? 'false' : 'true'); s2.tabIndex = i === newsAt ? 0 : -1; });
  document.querySelectorAll('#news-dots [data-nd]').forEach((d, i) => d.setAttribute('aria-pressed', i === newsAt ? 'true' : 'false'));
}
setInterval(() => { if (!newsHover && !REDUCED_MOTION && $('m-start') && !$('m-start').hidden && !mmPane) { newsAt = (newsAt + 1) % NEWS.length; showNews(); } }, 6000);
const MM_TITLES = {play: 'Play', saves: 'Saves', chats: 'Chats', friends: 'Friends', custom: 'Customise', store: 'Store', weekly: 'Weeklys', quests: 'Quests'};
function showMM(pane) {
  mmPane = pane || null;
  document.querySelectorAll('#m-start [data-mm]').forEach(b => { if (b.matches('.rl-item,.rl-tile,.rl-icon')) b.setAttribute('aria-pressed', b.dataset.mm === mmPane ? 'true' : 'false'); });
  document.querySelectorAll('#m-start .mm-pane').forEach(p => { p.hidden = p.dataset.mm !== mmPane; });
  $('mm-panel').hidden = !mmPane; $('m-start').classList.toggle('has-panel', !!mmPane);
  $('m-start').classList.toggle('center-pane', ['store', 'weekly', 'chats', 'friends', 'quests', 'campaign'].includes(mmPane));
  if (mmPane) { $('mm-ptitle').textContent = MM_TITLES[mmPane] || ''; const pb = $('mm-panel'); pb.classList.remove('slide'); void pb.offsetWidth; pb.classList.add('slide'); }
  const on = window.JunctionOnline;
  if (mmPane === 'play') renderPlay();
  if (mmPane === 'saves') { renderSlotsFor($('mm-slots'), playMode, true); $('mm-resume').hidden = !hasSave(); }
  if (mmPane === 'chats') { if (on && on.renderChats) on.renderChats($('mm-chats')); else $('mm-chats').innerHTML = '<p class="mini">Chats need the online service, which isn\u2019t available right now.</p>'; }
  if (mmPane === 'friends') { if (on && on.renderFriends) on.renderFriends($('mm-friends')); else $('mm-friends').innerHTML = '<p class="mini">Friends need the online service, which isn\u2019t available right now.</p>'; }
  if (mmPane === 'weekly') { renderExpertCard(); renderWeekly(); }
  if (mmPane === 'custom') setCusTab(cusTab);
  if (mmPane === 'quests') renderQuests();
  renderLook();
}
/* The map a seed makes. An Expert city's water comes from genWater() run on that week's seeded stream, so the
   same can be worked out here, on the side (the city being played is left alone), to show everyone the map first. */
const seedMaps = {};
function seedWater(sd) {
  if (seedMaps[sd.key]) return seedMaps[sd.key];
  const keepW = water, keepR = rand;
  water = new Uint8Array(N); rand = seededRand(sd.num);
  let out; try { genWater(); out = water; } finally { water = keepW; rand = keepR; }
  return (seedMaps[sd.key] = out);
}
/* draw it: land with soft patches, round-banked rivers and ponds, where the city starts and how big it is by week 10 */
function drawSeedMap(cv2, ago, big) {
  const sd = expertSeed(ago), w = seedWater(sd), S = cv2.width, k = S / MAXD, g = cv2.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = PAL.land; g.fillRect(0, 0, S, S);
  g.fillStyle = PAL.patch; g.globalAlpha = 0.4;
  for (let i = 0; i < 90; i++) { const x = hash01(i, sd.num % 997) * S, y = hash01(i, 7 + sd.num % 991) * S, r = (3 + hash01(i, 11) * 6) * k; g.beginPath(); g.arc(x, y, r, 0, 6.3); g.arc(x + r * 0.9, y + r * 0.3, r * 0.7, 0, 6.3); g.fill(); }
  g.globalAlpha = 1;
  if (big) { g.strokeStyle = 'rgba(127,127,127,.14)'; g.lineWidth = 1; g.beginPath(); for (let t = 8; t < MAXD; t += 8) { g.moveTo(t * k, 0); g.lineTo(t * k, S); g.moveTo(0, t * k); g.lineTo(S, t * k); } g.stroke(); }
  // the water tiles, scaled up smoothly and traced where they cross halfway: banks come out as smooth curves
  const m = document.createElement('canvas'); m.width = m.height = MAXD;
  const mg = m.getContext('2d'), md = mg.createImageData(MAXD, MAXD);
  let f = new Float32Array(N); for (let t = 0; t < N; t++) f[t] = w[t] ? 1 : 0;
  for (let pass = 0; pass < 4; pass++) {                // a soft blur across and down, twice, so the tile steps melt into curves
    const o = new Float32Array(N), hz = pass % 2 === 0;
    for (let r = 0; r < MAXD; r++) for (let c = 0; c < MAXD; c++) {
      let sum = 0, n = 0;
      for (let j = -1; j <= 1; j++) { const cc = hz ? c + j : c, rr2 = hz ? r : r + j; if (cc >= 0 && rr2 >= 0 && cc < MAXD && rr2 < MAXD) { sum += f[rr2 * MAXD + cc] * (j ? 1 : 2); n += j ? 1 : 2; } }
      o[r * MAXD + c] = sum / n;
    }
    f = o;
  }
  for (let t = 0; t < N; t++) md.data[t * 4 + 3] = Math.round((w[t] ? Math.max(f[t], 0.62) : Math.min(f[t], 0.38)) * 255);   // every tile keeps its side: no pond or island is lost
  mg.putImageData(md, 0, 0);
  const up = document.createElement('canvas'); up.width = up.height = S;
  const ug = up.getContext('2d'); ug.imageSmoothingEnabled = true; ug.imageSmoothingQuality = 'high'; ug.drawImage(m, 0, 0, S, S);
  const px = ug.getImageData(0, 0, S, S), d = px.data, wc = rgbOf(PAL.water), fc = rgbOf(PAL.foam || mixHex(PAL.water, '#ffffff', 0.45));
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i + 3], fa = clamp((v - 70) / 22, 0, 1), wa = clamp((v - 112) / 22, 0, 1);
    d[i] = fc[0] + (wc[0] - fc[0]) * wa; d[i + 1] = fc[1] + (wc[1] - fc[1]) * wa; d[i + 2] = fc[2] + (wc[2] - fc[2]) * wa; d[i + 3] = 255 * fa;
  }
  ug.putImageData(px, 0, 0); g.drawImage(up, 0, 0);
  const ring = (sp, dash, col, label) => {
    const o = (MAXD - sp) / 2 * k, L = sp * k;
    g.save(); g.setLineDash(dash); g.lineWidth = Math.max(1.5, k * 0.45); g.strokeStyle = col; g.lineJoin = 'round';
    g.beginPath(); if (g.roundRect) g.roundRect(o, o, L, L, k * 1.5); else g.rect(o, o, L, L); g.stroke(); g.restore();
    if (big || label === 'Start') { g.font = '800 ' + Math.max(10, Math.round(S / (big ? 52 : 34))) + 'px Overpass, system-ui, sans-serif'; g.fillStyle = col; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText(label, o + 2, o - 3); }
  };
  ring(CFG.startSpan + CFG.growPerWeek * 2 * 24, [k * 1.2, k * 1.8], 'rgba(255,255,255,.6)', 'Week 25');
  ring(CFG.startSpan + CFG.growPerWeek * 2 * 9, [k * 2, k * 1.5], 'rgba(255,255,255,.85)', 'Week 10');
  ring(CFG.startSpan, [], uiColours().accent, 'Start');
  return sd;
}
function openSeedMap() {
  const sd = expertSeed();
  $('sm-name').textContent = sd.name; $('sm-sub').textContent = sd.label + ' · code ' + sd.code;
  openModal('m-seedmap'); drawSeedMap($('sm-map'), 0, true);
}
/* Weeklys: this week's seed, its top three, its map, and the leaders' cities playing out */
const escH = t => String(t).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
let wkRows = [], wkSel = 0, wkView = 'seed';
function setWkView(v) {
  wkView = v;
  document.querySelectorAll('[data-wkv]').forEach(b => b.setAttribute('aria-pressed', b.dataset.wkv === v ? 'true' : 'false'));
  $('wk-seedmap').hidden = v !== 'seed'; $('wk-map').hidden = v !== 'city';
  if (v === 'seed') { drawSeedMap($('wk-seedmap'), 0, false); $('wk-cap').textContent = 'Everyone gets this same map this week · tap it to look closer'; }
  else showWkMap(wkSel);
}
function renderWeekly() {
  const top = $('wk-top'), cv2 = $('wk-map'); if (!top || !cv2) return;
  const on = window.JunctionOnline;
  wkRows = []; wkSel = 0; setWkView('seed');
  if (!on || !on.ready || !on.expertTop) { top.innerHTML = '<li class="mini">The weekly leaderboard needs the online service. It may still be connecting — try again in a moment.</li>'; return; }
  top.innerHTML = '<li class="mini">Loading the top three…</li>';
  on.expertTop(0, 3).then(rows => {
    if (mmPane !== 'weekly') return;
    wkRows = rows || [];
    top.innerHTML = wkRows.length ? wkRows.map((d, i) => '<li class="wk-p p' + (i + 1) + '" data-i="' + i + '" tabindex="0"><span class="medal">' + (i + 1) + '</span><span class="who"><b>' + escH(d.name) + '</b><small>reached week ' + d.weeks + '</small></span><b class="num">' + d.parcels.toLocaleString('en-US') + '<small>parcels</small></b></li>').join('')
      : '<li class="mini">No one has played this seed yet. Be the first on the podium.</li>';
    top.querySelectorAll('[data-i]').forEach(li => { li.onclick = () => { wkSel = +li.dataset.i; setWkView('city'); }; li.onkeydown = e => { if (e.key === 'Enter') li.onclick(); }; });
    if (wkView === 'city') showWkMap(wkSel);
  }).catch(() => { top.innerHTML = '<li class="mini">Couldn’t load the leaderboard.</li>'; });
}
function showWkMap(i) {
  wkSel = i; const d = wkRows[i];
  if (wkView !== 'city') return;
  document.querySelectorAll('#wk-top [data-i]').forEach(li => li.classList.toggle('sel', +li.dataset.i === i));
  $('wk-cap').textContent = d ? (d.city ? d.name + '’s city · tap it to see their whole run' : d.name + ' didn’t save a map') : 'The leader’s city shows here';
  animCitySnap($('wk-map'), d && d.city || null);
}
/* a city snapshot that sweeps into view, then little cars drive its roads */
let snapAnim = null;
function animCitySnap(cv2, str) {
  if (snapAnim) cancelAnimationFrame(snapAnim.raf); snapAnim = null;
  const S = cv2.width, g = cv2.getContext('2d'), off = document.createElement('canvas'); off.width = off.height = S;
  let d = null; try { d = str ? JSON.parse(str) : null; } catch (e) {}
  if (!d || !drawCitySnap(off, str)) {                    // nothing to show: an empty plot with a slow pulse
    const t0 = performance.now();
    const idle = now => {
      if (!cv2.isConnected || cv2.offsetParent === null) return;
      const el = (now - t0) / 1000;
      g.fillStyle = PAL.land; g.fillRect(0, 0, S, S);
      g.strokeStyle = 'rgba(127,127,127,' + (0.12 + 0.06 * Math.sin(el * 1.5)).toFixed(3) + ')'; g.lineWidth = 1;
      g.beginPath(); for (let x = S / 12; x < S; x += S / 12) { g.moveTo(x, 0); g.lineTo(x, S); g.moveTo(0, x); g.lineTo(S, x); } g.stroke();
      g.fillStyle = 'rgba(127,127,127,.55)'; g.font = '700 ' + Math.round(S / 22) + 'px Overpass, system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('No city yet', S / 2, S / 2);
      if (!REDUCED_MOTION) snapAnim = {raf: requestAnimationFrame(idle)};
    };
    snapAnim = {raf: requestAnimationFrame(idle)}; return;
  }
  const k = S / (d.span + 2), o = d.org - 1, X = t => (cx(t) - o + 0.5) * k, Y = t => (cy(t) - o + 0.5) * k;
  const adj = new Map(), link = (a, b) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); };
  for (const [t, m] of d.links) for (let dd = 0; dd < 8; dd++) if ((m >> dd) & 1) { const n = nbr(t, dd); link(t, n); link(n, t); }
  const nodes_ = [...adj.keys()], pal = d.pal || COLORS.map(c => c.hex), bots = [];
  for (let i = 0; i < Math.min(48, Math.floor(nodes_.length / 3)); i++) { const a = nodes_[Math.floor(Math.random() * nodes_.length)], nb = adj.get(a); bots.push({a, b: nb[Math.floor(Math.random() * nb.length)], u: Math.random(), v: 1.6 + Math.random() * 1.4, c: pal[i % pal.length]}); }
  const t0 = performance.now(); let last = t0;
  const step = now => {
    if (!cv2.isConnected || cv2.offsetParent === null) { snapAnim = null; return; }
    const el = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000); last = now;
    const rev = REDUCED_MOTION ? 1 : Math.min(1, el / 1.4), ease = 1 - Math.pow(1 - rev, 3), z = REDUCED_MOTION ? 1 : 1.03 + 0.03 * Math.sin(el * 0.3);
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = PAL.land; g.fillRect(0, 0, S, S);
    g.save(); g.translate(S / 2, S / 2); g.scale(z, z); g.translate(-S / 2, -S / 2);
    g.beginPath(); g.arc(S / 2, S / 2, ease * S * 0.75, 0, 6.3); g.clip(); g.drawImage(off, 0, 0);
    if (rev > 0.6) for (const c of bots) {
      c.u += dt * c.v;
      while (c.u >= 1) { c.u -= 1; const nb = adj.get(c.b) || [c.a], fwd = nb.filter(n => n !== c.a); const nx = (fwd.length ? fwd : nb)[Math.floor(Math.random() * (fwd.length || nb.length))]; c.a = c.b; c.b = nx; }
      const x = X(c.a) + (X(c.b) - X(c.a)) * c.u, y = Y(c.a) + (Y(c.b) - Y(c.a)) * c.u;
      g.fillStyle = c.c; g.beginPath(); g.arc(x, y, Math.max(1.6, k * 0.17), 0, 6.3); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 0.8; g.stroke();
    }
    g.restore();
    if (!(REDUCED_MOTION && rev >= 1 && el > 2)) snapAnim = {raf: requestAnimationFrame(step)};
  };
  snapAnim = {raf: requestAnimationFrame(step)};
}
/* past weeks' seeds, each with its own leaderboard */
function renderWeeks() {
  const box = $('mm-weeks'); if (!box) return;
  box.innerHTML = '<h3>Earlier seeds</h3>' + [1, 2, 3].map(w => { const sd = expertSeed(w); return '<div class="mm-week"><div><b>' + sd.name + '</b><small>' + sd.label + ' \u00b7 code ' + sd.code + '</small></div><button class="act small" type="button" data-wk="' + w + '">Leaderboard</button></div>'; }).join('');
  box.querySelectorAll('[data-wk]').forEach(b => b.onclick = () => { if (window.JunctionOnline && window.JunctionOnline.openExpert) window.JunctionOnline.openExpert(+b.dataset.wk); else toast('Leaderboards need the online service.', 'warn'); });
}
/* Play: pick a game mode, then one of its five save slots */
const PLAY_MODES = ['chill', 'standard', 'frantic', 'zen', 'iso'];
let isoPending = 0;                                    // challenges waiting on you (shown on the ISO button)
function renderPlay() {
  const box = $('mm-modes'); if (!box) return;
  const sd = expertSeed();
  box.innerHTML = PLAY_MODES.map(m => '<button type="button" class="rl-mode' + (m === 'expert' ? ' expert' : '') + '" data-pmode="' + m + '" aria-pressed="' + (m === playMode) + '"><b>' + DIFFS[m].label + '</b><small>' +
    (m === 'iso' ? 'Challenge a player: live, or a daily duel' : DIFFS[m].note) + (m === 'iso' && isoPending ? '<em class="tabbadge">' + isoPending + '</em>' : '') + '</small></button>').join('');
  box.querySelectorAll('[data-pmode]').forEach(b => b.onclick = () => { playMode = b.dataset.pmode; if (playMode !== 'iso') startDiff = playMode; renderPlay(); });
  if (playMode === 'iso') {
    $('mm-play-h').textContent = 'ISO 1v1 — challenges';
    const on = window.JunctionOnline;
    if (!(on && on.ready && on.renderIso && on.renderIso($('mm-play-slots')))) $('mm-play-slots').innerHTML = '<p class="mini">ISO matches are played online. The online service is still connecting, or isn’t available right now.</p>';
    return;
  }
  $('mm-play-h').textContent = DIFFS[playMode].label + ' — your five saves';
  renderSlotsFor($('mm-play-slots'), playMode, false);
  showStartBest();
}
/* ---- ISO 1v1. Two players on the same seeded map. Live: both cities run at the same time and the same speed;
   pausing or changing speed is asked of the other player and only happens if they agree; the last city standing
   wins. Daily: each plays the map on their own within a day (pause and speed as they like), and the runs are scored
   category by category. online.js runs the match; the game shows it. */
const isoLive = () => !!(iso && iso.kind === 'live' && diffKey === 'iso' && started && !over && !spectating);
const ISO_ASK = {pause: 'pause', resume: 'carry on', 'speed:1': 'go back to normal speed', 'speed:2': 'go 2\u00d7 speed', 'speed:3': 'go 3\u00d7 speed', 'speed:0.5': 'go half speed'};
function isoAsk(what) {
  if (!isoLive()) return;
  if (iso.prop && iso.prop.mine) { hint('Still waiting for ' + iso.opp.name + ' to answer.'); return; }
  JEvents.emit('isoAsk', {what});
  hint('Asked ' + iso.opp.name + ' to ' + (ISO_ASK[what] || what) + ' \u2014 it happens when they agree.');
}
function startIso(m) {
  iso = {id: m.id, kind: m.kind, seed: m.seed >>> 0, opp: m.opp, endsAt: m.endsAt || 0, ctl: {paused: false, speed: 1}, prop: null, oppSt: null, oppKey: '', note: ''};
  document.querySelectorAll('.modal').forEach(x => { x.hidden = true; }); modalOpen = false; closeMenu(); toggleCust(false);
  pendingSlot = ''; resetGame('iso'); running = true; speed = 1; refreshHud(); layout(); renderIsoHud();
  hint(m.kind === 'live' ? 'Go! Same map as ' + m.opp.name + '. Last city standing wins.' : 'Your daily run against ' + m.opp.name + ' \u2014 play at your own pace.');
}
const isoClock = sec => { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s2 = sec % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s2).padStart(2, '0'); };
/* watching a friend's live match: their opponent's city and numbers in the match panel */
let specMatch = null;
function renderSpecMatch() {
  const box = $('iso-hud'); if (!box) return;
  if (!specMatch) { if (spectating) box.hidden = true; return; }
  box.hidden = false; box.classList.remove('min');
  $('ih-kind').textContent = 'Live match'; $('ih-vs').textContent = specMatch.name + ' vs ' + specMatch.opp;
  const o = specMatch, row = (l, b) => '<tr><th>' + l + '</th><td>' + (b === undefined ? '\u2014' : b) + '</td></tr>';
  $('ih-stats').innerHTML = '<table><tr><th></th><td>' + escH(o.opp) + '</td></tr>' + row('Time', o.sec !== undefined ? isoClock(o.sec) : undefined) + row('Parcels', o.parcels) + row('Week', o.week) + row('Earned', o.earned !== undefined ? '$' + Math.round(o.earned) : undefined) + '</table>' + (o.over ? '<p class="ih-over">' + escH(o.opp) + '\u2019s city has ended.</p>' : '<p class="ih-note">You\u2019re watching ' + escH(o.name) + '\u2019s side.</p>');
  const cv2 = $('ih-map'); cv2.hidden = !o.city; if (o.city) drawCitySnap(cv2, o.city);
  $('ih-prop').hidden = true; $('ih-ctl').innerHTML = '';
}
function renderIsoHud() {
  if (specMatch) { renderSpecMatch(); return; }
  const box = $('iso-hud'); if (!box) return;
  const on = !!(iso && diffKey === 'iso' && started && !spectating);
  box.hidden = !on; if (!on) return;
  $('ih-kind').textContent = iso.kind === 'live' ? 'Live' : 'Daily';
  $('ih-vs').textContent = 'vs ' + iso.opp.name;
  const o = iso.oppSt || {}, row = (l, a, b) => '<tr><th>' + l + '</th><td>' + a + '</td><td>' + (b === undefined ? '\u2014' : b) + '</td></tr>';
  $('ih-stats').innerHTML = '<table><tr><th></th><td>You</td><td>' + escH(iso.opp.name) + '</td></tr>' +
    row('Time', isoClock(clock), o.sec !== undefined ? isoClock(o.sec) : undefined) + row('Parcels', score, o.parcels) + row('Week', week, o.week) +
    row('Earned', '$' + Math.round(stats.earned || 0), o.earned !== undefined ? '$' + Math.round(o.earned) : undefined) + '</table>' +
    (o.over ? '<p class="ih-over">' + escH(iso.opp.name) + '\u2019s city has ended.</p>' : '') + (iso.note ? '<p class="ih-note">' + escH(iso.note) + '</p>' : '');
  const key = o.city ? o.city.length + ':' + (o.sec || 0) : '';
  if (key !== iso.oppKey) { iso.oppKey = key; const cv2 = $('ih-map'); if (o.city) drawCitySnap(cv2, o.city); else { const g = cv2.getContext('2d'); g.fillStyle = PAL.land; g.fillRect(0, 0, cv2.width, cv2.height); } }
  $('ih-map').hidden = iso.kind !== 'live' && !o.city;
  const P = iso.prop, pr = $('ih-prop');
  pr.hidden = !P || over;
  if (P && !over) pr.innerHTML = P.mine ? 'Waiting for ' + escH(iso.opp.name) + ' to agree to ' + (ISO_ASK[P.what] || P.what) + '\u2026'
    : '<b>' + escH(iso.opp.name) + '</b> asks to ' + (ISO_ASK[P.what] || P.what) + '. <span class="btnrow"><button class="bigbtn" type="button" data-isoans="1">Agree</button><button class="act" type="button" data-isoans="0">No</button></span>';
  let ctl = '';
  if (over) ctl = '';
  else if (iso.kind === 'live') {
    ctl = '<button class="act small" type="button" data-isoask="' + (running ? 'pause' : 'resume') + '">' + (running ? 'Ask to pause' : 'Ask to carry on') + '</button>' +
      [1, 2, 3].filter(v => v !== speed).map(v => '<button class="act small" type="button" data-isoask="speed:' + v + '">Ask ' + v + '\u00d7</button>').join('');
  } else {
    const left = iso.endsAt ? iso.endsAt - Date.now() : 0;
    ctl = '<button class="act small" type="button" data-isofin="1">Finish and submit</button>' + (left > 0 ? '<small>' + fmtLeft(left) + ' left to play</small>' : '');
  }
  $('ih-ctl').innerHTML = ctl;
}
function bindIsoHud() {
  $('iso-hud').addEventListener('click', e => {
    const a = e.target.closest('[data-isoask]'); if (a) { isoAsk(a.dataset.isoask); return; }
    const r = e.target.closest('[data-isoans]'); if (r) { JEvents.emit('isoReply', {ok: r.dataset.isoans === '1'}); iso.prop = null; renderIsoHud(); return; }
    if (e.target.closest('[data-isofin]')) { ask({title: 'Finish your run?', text: 'It\u2019s scored as it stands and sent to your opponent.', ok: 'Finish'}).then(ok => { if (ok) endGame('You finished your run.'); }); return; }
    if (e.target.closest('.ih-head')) $('iso-hud').classList.toggle('min');
  });
  setInterval(() => { if (iso) renderIsoHud(); }, 1000);
}
/* the match result, with each category side by side */
function showIsoResult(r) {
  lastIsoResult = r;
  if (r.outcome === 'win') questEvent('iso_win', 1);
  $('ir-kind').textContent = 'ISO 1v1 \u00b7 ' + (r.kind === 'live' ? 'Live' : 'Daily') + ' vs ' + r.oppName;
  $('ir-title').textContent = r.outcome === 'win' ? 'You won!' : r.outcome === 'lose' ? r.oppName + ' won' : 'A draw';
  $('ir-sub').textContent = r.reason || '';
  $('ir-table').innerHTML = '<table><tr><th></th><th>You</th><th>' + escH(r.oppName) + '</th></tr>' + r.rows.map(x =>
    '<tr><td>' + x.label + '</td><td class="' + (x.win === 'me' ? 'w' : '') + '">' + x.me + '</td><td class="' + (x.win === 'them' ? 'w' : '') + '">' + x.them + '</td></tr>').join('') +
    (r.points ? '<tr class="tot"><td>Points</td><td>' + r.points[0] + '</td><td>' + r.points[1] + '</td></tr>' : '') + '</table>';
  $('ir-again').onclick = () => { closeModal('m-iso-res'); JEvents.emit('isoRematch', {}); };
  openModal('m-iso-res');
}
/* the Main menu button in the game: save the city, then back to the menu with its own background city.
   "Continue last city" brings the saved one back, into the same save slot. */
let resumeSlot = '';
async function goHome() {
  if (spectating) { if (window.JunctionAPI && window.JunctionAPI.showStart) window.JunctionAPI.showStart(); return; }
  if (iso && diffKey === 'iso' && started && !over) {
    const ok = await ask(iso.kind === 'live' ? {title: 'Leave the match?', text: 'Your city ends now, so ' + iso.opp.name + ' wins.', ok: 'Leave', danger: true} : {title: 'End your daily run?', text: 'It\u2019s scored as it stands.', ok: 'End run', danger: true});
    if (!ok) return;
    endGame(iso.kind === 'live' ? 'You left the match.' : 'You ended your run.');
  }
  const keep = started && !over && !tutorialMode ? curSlot : '';
  saveGame(true);
  closeMenu(); toggleCust(false); closeInspector();
  document.querySelectorAll('.modal').forEach(m => { if (m.id !== 'm-start') m.hidden = true; });
  startDemo(); resumeSlot = keep;
  $('btn-resume').hidden = !hasSave(); showStartBest();
  openModal('m-start'); refreshUI();
}
function bindMainMenu() {
  document.querySelectorAll('#m-start button[data-mm]').forEach(b => b.addEventListener('click', () => showMM(mmPane === b.dataset.mm && !b.classList.contains('rl-tile') ? null : b.dataset.mm)));
  $('mm-close').addEventListener('click', () => showMM(null));
  $('mm-settings2').addEventListener('click', () => $('mm-settings').click());
  document.querySelectorAll('#m-start [data-mm-go]').forEach(b => b.addEventListener('click', () => { if (b.dataset.mmGo === 'tutorial') $('btn-try-tutorial').click(); else showMM(b.dataset.mmGo); }));
  $('mm-settings').addEventListener('click', () => { $('app').classList.add('menu-over'); openMenu('settings'); });
  $('mm-account').addEventListener('click', () => { if (window.__junctionAccount) window.__junctionAccount(); else toast('Accounts need the online service, which isn\u2019t available right now.', 'warn'); });
  $('mm-resume').addEventListener('click', () => $('btn-resume').click());
  for (const id of ['mm-custom', 'mm-store']) $(id).addEventListener('click', shopClick);
  $('wk-map').addEventListener('click', () => { const d = wkRows[wkSel], on = window.JunctionOnline; if (d && on && on.openRun) on.openRun(0, d.uid); });
  $('wk-board').addEventListener('click', () => $('btn-expert-board').click());
  $('wk-seedmap').addEventListener('click', openSeedMap);
  document.querySelectorAll('[data-wkv]').forEach(b => b.addEventListener('click', () => setWkView(b.dataset.wkv)));
  $('sm-close').addEventListener('click', () => closeModal('m-seedmap'));
  $('sm-play').addEventListener('click', () => { closeModal('m-seedmap'); $('btn-expert').click(); });
  $('m-start').addEventListener('click', e => { if (e.target === $('m-start') && $('m-start').classList.contains('center-pane')) showMM(null); });   // the dimmed backdrop closes the Store or Weeklys
  bindCrates(); bindIsoHud(); bindAsk(); bindPause(); bindShare();
  document.querySelectorAll('[data-cus]').forEach(b => b.addEventListener('click', () => setCusTab(b.dataset.cus)));
  // the game's HUD hides while the menu shows: follow the menu however it's opened or closed (some paths just hide it)
  new MutationObserver(() => {
    const on = !$('m-start').hidden; $('app').classList.toggle('in-menu', on); if (!on) $('app').classList.remove('menu-over');
    if (booted) { fadeFlash(); if (!on && cam.auto && !REDUCED_MOTION) cam.z *= 0.84; }   // a quick fade, and a gentle zoom into a new city
  })
    .observe($('m-start'), {attributes: true, attributeFilter: ['hidden']});
}
/* the seed of the week on its tile */
function renderMenuTiles() { const t = $('tile-seed'); if (t) { const sd = expertSeed(); t.textContent = sd.name; $('tile-seedwk').textContent = sd.label; } }
const modalOpenBesides = id => !!document.querySelector('.modal:not([hidden]):not(#' + id + ')');
function closeModal(id) { if (id === 'm-start') $('app').classList.remove('in-menu'); $(id).hidden = true; modalOpen = !!document.querySelector('.modal:not([hidden])'); }
function offerUpgrade(grew) {
  lastGrew = grew; rerollLeft = 1; if (!isoLive()) running = false; openModal('m-upgrade'); renderUpgrade();
  refreshUI();
}
let upRoads = 12;
function renderUpgrade(reroll) {
  if (!reroll) upRoads = CFG.roadsPerWeekMin + Math.floor(rand() * (CFG.roadsPerWeekMax - CFG.roadsPerWeekMin + 1));
  const pool = UPGRADES.filter(u => !u.avail || u.avail());
  const picks = [];
  const perkPool = pool.filter(u => u.kind === 'perk'), itemPool = pool.filter(u => u.kind === 'item');
  const take = (arr) => { if (!arr.length) return; const u = arr.splice(Math.floor(rand() * arr.length), 1)[0]; picks.push(u); const i = pool.indexOf(u); if (i >= 0) pool.splice(i, 1); };
  take(perkPool); take(itemPool);
  while (picks.length < 3 && pool.length) { const u = pool.splice(Math.floor(rand() * pool.length), 1)[0]; picks.push(u); }
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
      closeModal('m-upgrade'); running = !(isoLive() && iso.ctl.paused); refreshUI(); renderPerks();
    });
    wrap.append(b);
  }
  const rb = $('btn-reroll'); rb.disabled = rerollLeft <= 0; rb.textContent = rerollLeft > 0 ? 'Shuffle the offer (once)' : 'Already shuffled';
  const first = document.querySelector('#up-picks .pick'); if (first && first.focus) first.focus();
}
function showGameOver(why) {
  $('over-kicker').textContent = diffKey === 'iso' ? 'Match over' : why && /finished|ended|left/i.test(why) ? 'City closed' : 'Gridlock';
  $('over-why').textContent = why;
  $('over-score').textContent = score.toLocaleString('en-US');
  $('over-newbest').hidden = !lastRun.newBest;
  $('over-best').textContent = lastRun.newBest ? 'Your old best on ' + DIFF.label + ' was ' + lastRun.prevBest.toLocaleString('en-US') + ' parcels.'
    : lastRun.first ? 'Your first ' + DIFF.label + ' city. Every run from here is a record to beat.' : 'Best on ' + DIFF.label + ': ' + best.toLocaleString('en-US') + ' parcels.';
  $('over-stats').innerHTML = overStats().map(([a, b]) => '<div><span>' + a + '</span><b>' + b + '</b></div>').join('');
  const got = ACH.filter(a => ach[a.id] && ach[a.id] >= runT0);
  $('over-ach').hidden = !got.length;
  $('over-ach').innerHTML = got.length ? '<h4>Unlocked this run</h4><div class="over-achs">' + got.map(a => '<span class="achchip" title="' + escH(a.hint) + '"><i>\u2605</i>' + escH(a.name) + '</span>').join('') + '</div>' : '';
  cityPicture($('over-pic'));
  openModal('m-over');
  drawRunChart();
}
/* the numbers a finished run is summed up by (the game-over screen and the share card both use them) */
function overStats() {
  const sec = Math.round(clock), tm = (Math.floor(sec / 3600) ? Math.floor(sec / 3600) + 'h ' : '') + Math.floor(sec % 3600 / 60) + 'm';
  return [['Weeks', week], ['Earned', '$' + Math.round(stats.earned || 0).toLocaleString('en-US')], ['Trips', (stats.trips || 0).toLocaleString('en-US')], ['Time', tm], ['Cars', cars.length], ['Tow trucks', stats.tows],
    ['Avg wait', (stats.avgWait || 0).toFixed(1) + 's'], ['Breakdowns', stats.breakdowns]]
    .concat(stats.ambOk + stats.ambLate + stats.ambFail ? [['Ambulances on time', stats.ambOk + ' of ' + (stats.ambOk + stats.ambLate + stats.ambFail)]] : []);
}
/* a square picture of the whole city, drawn with the game's own renderer into cv2 */
function cityPicture(cv2) {
  if (!cv2) return cv2;
  const keep = {x: cam.x, y: cam.y, z: cam.z, auto: cam.auto}, keepNight = nightOn, keepHeat = showHeat, keepFlow = typeof showFlow !== 'undefined' && showFlow;
  nightOn = false; showHeat = false; if (typeof showFlow !== 'undefined') showFlow = false;                         // a clear daytime picture
  const side = Math.min(W, H), wc = (camOrg + camSpan / 2) * CELL;
  cam.auto = false; cam.z = clamp(side * 0.92 / ((camSpan + 2) * CELL), 0.05, 8); cam.x = wc; cam.y = wc;
  try {
    draw();
    const g = cv2.getContext('2d'), px = Math.min(cv.width, cv.height);
    g.clearRect(0, 0, cv2.width, cv2.height);
    g.drawImage(cv, (cv.width - px) / 2, (cv.height - px) / 2, px, px, 0, 0, cv2.width, cv2.height);
  } catch (e) {}
  Object.assign(cam, keep); nightOn = keepNight; showHeat = keepHeat; if (typeof showFlow !== 'undefined') showFlow = keepFlow;
  return cv2;
}
/* ---- share cards: a 1200x630 picture of a run, shared with the phone's share sheet, copied, or shown to save */
function roundPath(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
function makeShareCard(o) {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 630;
  const g = c.getContext('2d'), pl = uiColours ? uiColours().plate : '#143845', acc = uiColours ? uiColours().accent : '#ffc933';
  const bg = g.createLinearGradient(0, 0, 1200, 630); bg.addColorStop(0, mixHex(pl, '#ffffff', 0.08)); bg.addColorStop(1, mixHex(pl, '#000000', 0.35));
  g.fillStyle = bg; g.fillRect(0, 0, 1200, 630);
  g.fillStyle = 'rgba(255,255,255,.035)'; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(1000 + Math.cos(i * 0.9) * 160, 330 + Math.sin(i * 1.3) * 200, 70 + i * 22, 0, 6.3); g.fill(); }
  // the city picture, in a rounded frame
  if (o.pic) {
    g.save(); roundPath(g, 60, 75, 480, 480, 28); g.fillStyle = 'rgba(0,0,0,.25)'; g.fill(); g.clip(); g.drawImage(o.pic, 60, 75, 480, 480); g.restore();
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3; roundPath(g, 60, 75, 480, 480, 28); g.stroke();
  }
  const ink = '#f2f7f6', x0 = o.pic ? 590 : 70;
  g.fillStyle = acc; g.font = 'italic 900 34px Overpass, system-ui, sans-serif'; g.textBaseline = 'alphabetic'; g.fillText('JUNCTION', x0, 112);
  g.fillStyle = 'rgba(242,247,246,.7)'; g.font = '700 16px Overpass, system-ui, sans-serif'; g.fillText((o.kicker || '').toUpperCase(), x0, 142);
  g.fillStyle = ink; g.font = '900 76px Overpass, system-ui, sans-serif'; g.fillText(String(o.big), x0, 232);
  g.font = '600 22px Overpass, system-ui, sans-serif'; g.fillStyle = 'rgba(242,247,246,.8)'; g.fillText(o.bigLabel || '', x0, 266);
  if (o.title) { g.font = '800 26px Overpass, system-ui, sans-serif'; g.fillStyle = ink; g.fillText(o.title, x0, 320); }
  const st = (o.stats || []).slice(0, 6), cols = 3, cw = (1200 - x0 - 60) / cols;
  st.forEach(([l, v], i) => {
    const x = x0 + (i % cols) * cw, y = 360 + Math.floor(i / cols) * 92;
    roundPath(g, x, y, cw - 14, 76, 14); g.fillStyle = 'rgba(255,255,255,.08)'; g.fill();
    g.fillStyle = ink; g.font = '800 28px Overpass, system-ui, sans-serif'; g.fillText(String(v), x + 16, y + 38);
    g.fillStyle = 'rgba(242,247,246,.65)'; g.font = '700 13px Overpass, system-ui, sans-serif'; g.fillText(String(l).toUpperCase(), x + 16, y + 62);
  });
  roundPath(g, x0, 560, 1200 - x0 - 60, 44, 22); g.fillStyle = acc; g.fill();
  g.fillStyle = onColour ? onColour(acc) : '#10262f'; g.font = '800 19px Overpass, system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillText((o.line || 'Can you beat it?') + '  \u00b7  ' + (location.hostname || 'junction'), x0 + 22, 582);
  return c;
}
function dataURLToBlob(u) { const [h, b64] = u.split(','), mime = /data:([^;]+)/.exec(h)[1], bin = atob(b64), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return new Blob([arr], {type: mime}); }
async function shareCanvas(c, name, text) {
  const url = c.toDataURL('image/png'), blob = dataURLToBlob(url);
  try {
    const file = new File([blob], name + '.png', {type: 'image/png'});
    if (navigator.share && navigator.canShare && navigator.canShare({files: [file]})) { await navigator.share({files: [file], title: 'Junction', text}); return 'shared'; }
  } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
  try {
    if (navigator.clipboard && window.ClipboardItem) { await navigator.clipboard.write([new ClipboardItem({'image/png': blob})]); toast('Card copied \u2014 paste it anywhere', 'good'); return 'copied'; }
  } catch (e) {}
  $('share-img').src = url; openModal('m-share');
  $('share-save').onclick = () => saveFile(blob, name + '.png').then(ok => toast(ok ? 'Saved' : 'Saving isn\u2019t available here', ok ? 'good' : 'warn'));
  return 'shown';
}
function shareRun() {
  const st = overStats();
  const c = makeShareCard({pic: $('over-pic'), kicker: DIFF.label + ' \u00b7 ' + (lastRun.newBest ? 'new personal best' : 'week ' + week), big: score.toLocaleString('en-US'), bigLabel: 'parcels delivered',
    title: 'Survived ' + week + ' week' + (week === 1 ? '' : 's'), stats: [['Weeks', week], st[1], st[2], st[3], st[4], ['Best', best.toLocaleString('en-US')]], line: 'Can you beat it?'});
  return shareCanvas(c, 'junction-run-week-' + week, 'I delivered ' + score + ' parcels and survived ' + week + ' weeks in Junction. Can you beat it?');
}
function bindShare() {
  $('btn-share').addEventListener('click', shareRun);
  $('share-close').addEventListener('click', () => closeModal('m-share'));
  $('btn-over-home').addEventListener('click', () => { closeModal('m-over'); showStartBest(); openModal('m-start'); });
  $('ir-share').addEventListener('click', () => { if (lastIsoResult) shareIso(lastIsoResult); });
}
let lastIsoResult = null;
function shareIso(r) {
  const pic = document.createElement('canvas'); pic.width = pic.height = 480; cityPicture(pic);
  const mine = r.rows.map(x => [x.label, x.me]);
  const c = makeShareCard({pic, kicker: 'ISO 1v1 \u00b7 ' + (r.kind === 'live' ? 'live' : 'daily') + ' vs ' + r.oppName, big: r.outcome === 'win' ? 'Won' : r.outcome === 'lose' ? 'Lost' : 'Draw',
    bigLabel: r.points ? 'points ' + r.points[0] + '\u2013' + r.points[1] : r.reason || '', title: r.outcome === 'win' ? 'Victory over ' + r.oppName : 'Against ' + r.oppName, stats: mine.slice(0, 6), line: r.outcome === 'win' ? 'Think you can take me?' : 'Rematch, anyone?'});
  return shareCanvas(c, 'junction-iso', (r.outcome === 'win' ? 'I beat ' : 'I played ') + r.oppName + ' in an ISO 1v1 on Junction.');
}

/* ---------------------------------------------------------------- input */
let startDiff = 'standard';       // difficulty highlighted on the start screen (the running game keeps diffKey until a new one starts)
function renderExpertCard() {
  renderMenuTiles();
  const sd = expertSeed(), n = $('exp-name'); if (!n) return;
  n.textContent = sd.name; $('exp-code').textContent = sd.code; $('exp-week').textContent = sd.label;
}
/* a compact copy of a city's layout for the Expert leaderboard ("who placed what") */
function citySnap() {
  const inBox = k => { const c = cx(k), r = cy(k); return c >= org - 1 && r >= org - 1 && c <= org + span && r <= org + span; };
  const list = a => { const o = []; for (let k = 0; k < N; k++) if (a[k] && inBox(k)) o.push(k); return o; };
  return JSON.stringify({org, span, water: list(water), road: list(road),
    links: (() => { const o = []; for (let k = 0; k < N; k++) if (lnk[k] && inBox(k)) o.push([k, lnk[k]]); return o; })(),
    special: special.map((v, k) => v ? [k, v === 'light' ? 1 : 2] : null).filter(Boolean),
    b: buildings.map(b => [b.k, b.type === 'store' ? 1 : 0, b.color, isBig(b) ? b.sd : -1]),
    moto: motorways.map(m => [m.a, m.b]), rail: railSnap(), pal: COLORS.map(c => c.hex)});
}
/* draw such a layout into a canvas: water, roads, motorways, junction controls, houses and stores */
function drawCitySnap(cv2, str) {
  let d; try { d = JSON.parse(str); } catch (e) { return false; }
  const g = cv2.getContext('2d'), S = cv2.width, k = S / (d.span + 2), o = d.org - 1, X = t => (cx(t) - o + 0.5) * k, Y = t => (cy(t) - o + 0.5) * k;
  g.fillStyle = PAL.land; g.fillRect(0, 0, S, S);
  g.fillStyle = PAL.land2; g.fillRect(k, k, d.span * k, d.span * k);
  g.fillStyle = PAL.water; for (const t of d.water) g.fillRect((cx(t) - o) * k, (cy(t) - o) * k, k + 0.5, k + 0.5);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const roads = new Path2D();
  for (const [t, m] of d.links) for (let dd = 0; dd < 8; dd++) if ((m >> dd) & 1) { const n = nbr(t, dd); if (n > t) { roads.moveTo(X(t), Y(t)); roads.lineTo(X(n), Y(n)); } }
  for (const t of d.road) { roads.moveTo(X(t), Y(t)); roads.lineTo(X(t), Y(t)); }
  g.strokeStyle = PAL.edge; g.lineWidth = k * 0.78; g.stroke(roads); g.strokeStyle = PAL.road; g.lineWidth = k * 0.62; g.stroke(roads);
  g.strokeStyle = PAL.deck; g.lineWidth = k * 0.4; g.beginPath(); for (const [a, b] of d.moto) { g.moveTo(X(a), Y(a)); g.lineTo(X(b), Y(b)); } g.stroke();
  if (Array.isArray(d.rail)) { g.strokeStyle = PAL.pave || '#cbc9bd'; g.lineWidth = k * 0.3; g.beginPath(); for (const [a, b] of d.rail) { g.moveTo(X(a), Y(a)); g.lineTo(X(b), Y(b)); } g.stroke(); }
  for (const [t, kind] of d.special) { g.fillStyle = kind === 1 ? '#ff5a4a' : '#48e08a'; g.beginPath(); g.arc(X(t), Y(t), k * 0.24, 0, 6.3); g.fill(); }
  for (const [t, isStore, ci, sd] of d.b) {
    const c = (d.pal && d.pal[ci]) || COLORS[ci].hex;
    g.fillStyle = c;
    if (isStore && sd >= 0) { const tl = storeTilesAt(t, sd) || [t]; for (const q of tl) g.fillRect((cx(q) - o) * k + 0.5, (cy(q) - o) * k + 0.5, k - 1, k - 1); }
    else if (isStore) g.fillRect((cx(t) - o) * k + 1, (cy(t) - o) * k + 1, k - 2, k - 2);
    else { g.beginPath(); g.arc(X(t), Y(t), k * 0.38, 0, 6.3); g.fill(); g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 1; g.stroke(); }
  }
  return true;
}
function showStartBest() {
  if (!$('start-best')) return;
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
    if (k === 'Escape' && !$('m-start').hidden && mmPane && $('menu').hidden) { showMM(null); return; }
    if (askResolve) { if (k === 'Enter') { e.preventDefault(); askResolve(true); } else if (k === 'Escape') askResolve(false); return; }
    if (k.toLowerCase() === 'p' && !$('m-pause').hidden && $('m-help').hidden) { closePause(true); return; }
    if (k === 'Escape') {
      const hadOpen = !$('inspect').hidden || !$('menu').hidden || !$('cust-panel').hidden || !$('m-help').hidden || !$('m-explain').hidden || !$('m-feedback').hidden;
      closeInspector(); closeMenu(); toggleCust(false); if (!$('m-help').hidden) closeModal('m-help'); if (!$('m-explain').hidden) closeModal('m-explain'); if (!$('m-feedback').hidden) closeModal('m-feedback'); setTool('select');
      if (hadOpen) return;
      if (!$('m-pause').hidden) closePause(true); else openPause();
      return;
    }
    if (k === 'F2') { e.preventDefault(); if ($('m-start').hidden) toggleFlow(); return; }
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
      case 'm': toggleMoto(); break;
      case 'n': toggleMute(); break;
      case 'c': snapshot(); break;
      case 't': toggleMode(); break;
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
  document.querySelectorAll('#speed-seg button').forEach(b => b.addEventListener('click', () => { if (isoLive()) { if (+b.dataset.speed !== speed) isoAsk('speed:' + b.dataset.speed); return; } speed = +b.dataset.speed; refreshUI(); }));
  bindTips(); bindSettings(); bindTipsToggle();
  $('btn-heat').addEventListener('click', () => { showHeat = !showHeat; refreshUI(); });
  $('btn-side').addEventListener('click', () => { keepLeft = !keepLeft; laneSign = keepLeft ? -1 : 1; pathCache.ver = -1; refreshUI(); });
  $('btn-sound').addEventListener('click', toggleMute);
  $('btn-theme').addEventListener('click', toggleMode);
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
  bindCoachDock();
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
  $('btn-menu').addEventListener('click', () => { if ($('menu').hidden) { toggleCust(false); openMenu(); } else closeMenu(); });
  // the settings popup closes when you click the map behind it (not when you use the tooltip or a modal on top)
  document.addEventListener('pointerdown', e => {
    if ($('menu').hidden || !e.target.closest) return;
    if (e.target.closest('#menu') || e.target.closest('#btn-menu') || e.target.closest('#btn-cust') || e.target.closest('.modal') || e.target.closest('#toasts')) return;
    closeMenu();
  });
  $('btn-panel').addEventListener('click', () => { setLay({panel: $('app').classList.contains('panel-off')}); });
  $('opt-night').addEventListener('change', e => { nightOn = e.target.checked; savePrefs(); });
  $('opt-grid').addEventListener('change', e => { showGrid = e.target.checked; savePrefs(); });
  $('opt-fx').addEventListener('change', e => { fxOn = e.target.checked; savePrefs(); });
  $('opt-moto').addEventListener('change', e => { if (e.target.checked !== showMoto) toggleMoto(); });
  $('snd-music').addEventListener('change', e => { audioPrefs.music = e.target.checked; audioWake(); savePrefs(); musicTick(); });
  $('snd-sfx').addEventListener('change', e => { audioPrefs.sfx = e.target.checked; savePrefs(); });
  $('snd-sfxvol').addEventListener('input', e => { audioPrefs.sfxVol = +e.target.value / 100; audioWake(); });
  $('snd-sfxvol').addEventListener('change', () => { savePrefs(); sfx('deliver'); });
  $('snd-ui').addEventListener('change', e => { audioPrefs.ui = e.target.checked; savePrefs(); });
  $('snd-haptics').addEventListener('change', e => { audioPrefs.haptics = e.target.checked; savePrefs(); if (e.target.checked) haptic('claim'); });
  $('snd-haptics-wrap').hidden = !navigator.vibrate;
  // quality
  document.querySelectorAll('#gfx-pre button').forEach(b => b.addEventListener('click', () => setGfx(Object.assign({}, GFX_PRESETS[b.dataset.gfx]))));
  document.querySelectorAll('#gfx-shadows button').forEach(b => b.addEventListener('click', () => setGfx({shadows: b.dataset.v})));
  document.querySelectorAll('#gfx-decor button').forEach(b => b.addEventListener('click', () => setGfx({decor: +b.dataset.v})));
  document.querySelectorAll('#gfx-cap button').forEach(b => b.addEventListener('click', () => setGfx({cap: +b.dataset.v})));
  $('gfx-smooth').addEventListener('change', e => setGfx({smooth: e.target.checked}));
  // accessibility
  $('acc-scale').addEventListener('input', e => { a11y.scale = +e.target.value; $('acc-scale-v').textContent = a11y.scale + '%'; applyA11y(); });
  $('acc-scale').addEventListener('change', () => savePrefs(true));
  $('acc-contrast').addEventListener('change', e => { a11y.contrast = e.target.checked; applyA11y(); savePrefs(true); });
  document.querySelectorAll('#acc-motion button').forEach(b => b.addEventListener('click', () => { a11y.motion = b.dataset.v; applyA11y(); savePrefs(true); syncA11yUI(); }));
  $('ver-btn').addEventListener('click', () => { closeMenu(); openWhatsNew(); });
  $('wn-close').addEventListener('click', () => closeModal('m-whatsnew'));
  $('daily-claim').addEventListener('click', claimDaily);
  $('daily-close').addEventListener('click', () => closeModal('m-daily'));
  $('mm-streak').addEventListener('click', () => { if (dailyPending) openDaily(); else hint('Today’s reward is claimed — come back tomorrow to keep the streak going.'); });
  $('snd-musicvol').addEventListener('input', e => { audioPrefs.musicVol = +e.target.value / 100; audioWake(); musicTick(); });
  $('snd-traffic').addEventListener('input', e => { audioPrefs.traffic = +e.target.value / 100; audioWake(); musicTick(); });
  for (const id of ['snd-musicvol', 'snd-traffic']) $(id).addEventListener('change', () => savePrefs());
  $('opt-notes').addEventListener('click', e => {
    const b = e.target.closest('button[data-notes]'); if (!b) return;
    notesMode = b.dataset.notes; savePrefs(true); renderNotesUI();
  });
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
    const f = e.target.closest && e.target.closest('[data-focus]'); if (f) { const s = buildings[+f.dataset.focus]; if (s) focusOn(bX(s), bY(s)); }
    const ft = e.target.closest && e.target.closest('[data-focus-tile]');
    if (ft) { const k = +ft.dataset.focusTile; if (nodes[k]) { focusOn(tx(k), ty(k)); sel = {type: 'tile', k}; renderInspector(); refreshUI(); } }
  });
  $('btn-again').addEventListener('click', () => {                       // the same mode (and save slot) again; a match or the tutorial goes back to the menu
    closeModal('m-over');
    if (tutorialMode || diffKey === 'iso' || diffKey === 'expert') { showStartBest(); openModal('m-start'); return; }
    const dk = diffKey, slot = curSlot; pendingSlot = slot; resetGame(dk); running = true; refreshHud(); layout(); writeSlot();
  });
  const dp = $('diff-picks'); dp.innerHTML = '';
  for (const k in DIFFS) {
    if (DIFFS[k].expert) continue;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'diff'; b.dataset.id = k; b.setAttribute('aria-pressed', k === startDiff ? 'true' : 'false');
    b.innerHTML = '<b>' + DIFFS[k].label + '</b><small>' + DIFFS[k].note + '</small>';
    b.addEventListener('click', () => { startDiff = k; dp.querySelectorAll('.diff').forEach(x => x.setAttribute('aria-pressed', x.dataset.id === k ? 'true' : 'false')); showStartBest(); });
    dp.append(b);
  }
  $('btn-start').addEventListener('click', () => {
    if (startDiff === 'expert') startDiff = prevDiff;
    if (window.JunctionOnline && window.JunctionOnline.ready) { window.JunctionOnline.openSaves('new'); return; }
    closeModal('m-start'); resetGame(startDiff); running = true; refreshHud(); layout();
  });
  renderExpertCard(); bindMainMenu();
  $('btn-expert').addEventListener('click', () => {
    if (startDiff !== 'expert') prevDiff = startDiff;
    startDiff = 'expert';
    if (window.JunctionOnline && window.JunctionOnline.ready) { window.JunctionOnline.openSaves('new'); return; }
    closeModal('m-start'); resetGame('expert'); running = true; refreshHud(); layout();
  });
  $('btn-expert-board').addEventListener('click', () => { if (window.JunctionOnline && window.JunctionOnline.openExpert) window.JunctionOnline.openExpert(0); else toast('The Expert leaderboard needs the online service, which isn\u2019t available right now.', 'warn'); });
  $('btn-resume').addEventListener('click', () => { if (loadGame()) { if (resumeSlot) curSlot = resumeSlot; resumeSlot = ''; closeModal('m-start'); running = true; refreshHud(); layout(); } else toast('No saved city found', 'warn'); });
  $('btn-home').addEventListener('click', goHome);
  $('btn-try-tutorial').addEventListener('click', () => { closeModal('m-start'); startTutorial(); refreshHud(); layout(); });
  $('tut-exit').addEventListener('click', exitTutorial);
  $('ti-next').addEventListener('click', () => { if (tiCard < TI_CARDS.length - 1) { tiCard++; renderTutIntro(); } else closeTutIntro(); });
  $('ti-back').addEventListener('click', () => { if (tiCard > 0) { tiCard--; renderTutIntro(); } });
  $('ti-skip').addEventListener('click', closeTutIntro);
  $('tut-open-explain').addEventListener('click', tutOpenExplainer);
  $('explain-start').addEventListener('click', tutStartBuilding);
  $('tut-rush').addEventListener('click', tutTriggerRush);
  $('tut-rain').addEventListener('click', tutTriggerRain);
  $('tut-break').addEventListener('click', tutTriggerBreakdown);
  $('tut-close').addEventListener('click', tutTriggerClosure);
  $('tut-amb').addEventListener('click', tutTriggerAmb);
  $('tut-contract').addEventListener('click', tutTriggerContract);
  window.addEventListener('resize', layout);
  // Phones report a rotation before the page has finished resizing, which left the city drawn at the old shape
  // and stretched. Follow the real size of the play area instead, and check again as a rotation settles.
  if (window.ResizeObserver) new ResizeObserver(() => fitStage()).observe($('stage'));
  const settle = () => { for (const ms of [0, 120, 300, 600, 1000]) setTimeout(fitStage, ms); };
  window.addEventListener('orientationchange', settle);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', settle);
  window.addEventListener('beforeunload', saveGame);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(true); });
}
function togglePlay() { if (!$('m-pause').hidden) { closePause(true); return; } if (over || modalOpen || spectating) return; if (isoLive()) { isoAsk(running ? 'pause' : 'resume'); return; } running = !running; refreshUI(); }
function cycleSpeed(d) { if (spectating) return; const s = CFG_SPEEDS; let i = s.indexOf(speed); i = (i + d + s.length) % s.length; if (isoLive()) { isoAsk('speed:' + s[i]); return; } speed = s[i]; refreshUI(); }
const CFG_SPEEDS = [0.5, 1, 2, 3];
function toggleMute() { muted = !muted; audioWake(); savePrefs(); refreshUI(); musicTick(); }
/* M hides the motorways (and anything driving on them) so the streets underneath are easy to see */
function toggleMoto() {
  showMoto = !showMoto; savePrefs(); syncPrefUI();
  hint(showMoto ? 'Motorways shown.' : 'Motorways hidden — press M to show them again.', false, true);
}
/* settings that should outlive a reload */
const PREFS_KEY = 'junction2-prefs';

/* ------------------------------------------------------------ layout
   Each bar can be full or small, and the side panel shown or hidden. Phones (and phones held
   sideways) and bigger screens each remember their own layout. */
const LAY_KEY = 'junction-layout-v1';
const LAY_PRESETS = {
  full:    {stats: false, ctrl: false, dock: false, panel: true},
  compact: {stats: false, ctrl: true,  dock: true,  panel: true},
  minimal: {stats: true,  ctrl: true,  dock: true,  panel: false}
};
const layDevice = () => compactUI() || window.innerWidth <= 820 || window.innerHeight < 500 ? 'phone' : 'desk';
function layDefault(dev) {
  if (dev === 'phone') return Object.assign({}, LAY_PRESETS.minimal);
  return window.innerHeight <= 760 || window.innerWidth < 1200 ? Object.assign({}, LAY_PRESETS.compact) : Object.assign({}, LAY_PRESETS.full);
}
let layAll = (() => { try { return JSON.parse(localStorage.getItem(LAY_KEY)) || {}; } catch (e) { return {}; } })();
let layDev = '';
function curLay() { const d = layDevice(); return Object.assign(layDefault(d), layAll[d] || {}); }
function applyLayout() {
  layDev = layDevice();
  const L = curLay(), app = $('app');
  app.classList.toggle('lay-stats-mini', !!L.stats);
  app.classList.toggle('lay-ctrl-mini', !!L.ctrl);
  app.classList.toggle('lay-dock-icons', !!L.dock);
  app.classList.toggle('panel-off', !L.panel);
  const set = (id, v) => { const e = $(id); if (e) e.checked = !!v; };
  set('lay-stats', L.stats); set('lay-ctrl', L.ctrl); set('lay-dock', L.dock); set('lay-panel', L.panel);
  const pre = Object.keys(LAY_PRESETS).find(k => ['stats', 'ctrl', 'dock', 'panel'].every(f => !!LAY_PRESETS[k][f] === !!L[f]));
  document.querySelectorAll('#lay-pre button').forEach(b => b.setAttribute('aria-pressed', b.dataset.pre === pre ? 'true' : 'false'));
  document.querySelectorAll('.minbtn').forEach(b => {
    const on = L[b.dataset.min];
    b.setAttribute('aria-label', (on ? 'Grow ' : 'Shrink ') + ({stats: 'the stats bar', ctrl: 'the controls', dock: 'the tools'})[b.dataset.min]);
  });
  requestAnimationFrame(layout);
}
function setLay(ch) {
  const d = layDevice();
  layAll[d] = Object.assign(curLay(), ch);
  try { localStorage.setItem(LAY_KEY, JSON.stringify(layAll)); } catch (e) {}
  applyLayout();
}
function bindLayout() {
  document.querySelectorAll('.minbtn').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const k = b.dataset.min; setLay({[k]: !curLay()[k]});
  }));
  document.querySelectorAll('#lay-pre button').forEach(b => b.addEventListener('click', () => setLay(Object.assign({}, LAY_PRESETS[b.dataset.pre]))));
  [['lay-stats', 'stats'], ['lay-ctrl', 'ctrl'], ['lay-dock', 'dock'], ['lay-panel', 'panel']].forEach(([id, k]) => {
    const e = $(id); if (e) e.addEventListener('change', () => setLay({[k]: e.checked}));
  });
  // rotating a phone or resizing across the phone/laptop line switches to that device's layout
  window.addEventListener('resize', () => { if (layDevice() !== layDev) applyLayout(); });
}
function savePrefs(noCity) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({muted, nightOn, showGrid, fxOn, colorMode, customHex, showSymbols, tipsOn, notesMode, showMoto, audio: audioPrefs, gfx, a11y})); } catch (e) {}
  if (!noCity && started && !over && !tutorialMode && !spectating && running) saveGame();   // the open city keeps these colours
}
function renderNotesUI() {
  document.querySelectorAll('#opt-notes button').forEach(b => b.setAttribute('aria-pressed', b.dataset.notes === notesMode ? 'true' : 'false'));
  const n = $('notes-note');
  if (n) n.textContent = notesMode === 'all' ? '' : notesMode === 'warn'
    ? 'Only warnings pop up (overflowing stores, ambulances, breakdowns). The warning chips and red edge arrows still show everything.'
    : 'No pop-ups while you play. The warning chips and red edge arrows still show trouble.';
}
function syncPrefUI() {
  const set = (id, v) => { const el = $(id); if (el) el.checked = !!v; };
  set('opt-moto', showMoto); set('snd-music', audioPrefs.music); set('snd-sfx', audioPrefs.sfx);
  const sv = (id, v) => { const el = $(id); if (el) el.value = Math.round(v * 100); };
  sv('snd-musicvol', audioPrefs.musicVol); sv('snd-traffic', audioPrefs.traffic); sv('snd-sfxvol', audioPrefs.sfxVol);
  set('snd-ui', audioPrefs.ui); set('snd-haptics', audioPrefs.haptics);
  syncGfxUI(); syncA11yUI();
  set('opt-night', nightOn); set('opt-grid', showGrid); set('opt-fx', fxOn); set('opt-symbols', showSymbols); set('opt-tips', tipsOn);
  renderNotesUI();
}
let gfxSaved = false;
function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY));
    if (p && typeof p === 'object') {
      if (typeof p.muted === 'boolean') muted = p.muted;
      if (typeof p.showMoto === 'boolean') showMoto = p.showMoto;
      if (p.audio && typeof p.audio === 'object') {
        if (typeof p.audio.music === 'boolean') audioPrefs.music = p.audio.music;
        if (typeof p.audio.sfx === 'boolean') audioPrefs.sfx = p.audio.sfx;
        for (const k of ['musicVol', 'traffic', 'sfxVol']) if (isFinite(p.audio[k])) audioPrefs[k] = clamp(+p.audio[k], 0, 1);
        for (const k of ['ui', 'haptics']) if (typeof p.audio[k] === 'boolean') audioPrefs[k] = p.audio[k];
      }
      if (p.gfx && typeof p.gfx === 'object') {
        if (['on', 'simple', 'off'].includes(p.gfx.shadows)) gfx.shadows = p.gfx.shadows;
        if ([1, 0.6, 0.3].includes(+p.gfx.decor)) gfx.decor = +p.gfx.decor;
        if (typeof p.gfx.smooth === 'boolean') gfx.smooth = p.gfx.smooth;
        if ([0, 60, 30].includes(+p.gfx.cap)) gfx.cap = +p.gfx.cap;
        if ([1, 1.5, 2].includes(+p.gfx.res)) gfx.res = +p.gfx.res;
        gfx.preset = gfxPresetOf(); gfxSaved = true;
      }
      if (p.a11y && typeof p.a11y === 'object') {
        if (isFinite(p.a11y.scale)) a11y.scale = clamp(Math.round(+p.a11y.scale / 5) * 5, 90, 130);
        if (typeof p.a11y.contrast === 'boolean') a11y.contrast = p.a11y.contrast;
        if (['auto', 'reduce', 'full'].includes(p.a11y.motion)) a11y.motion = p.a11y.motion;
      }
      if (typeof p.nightOn === 'boolean') nightOn = p.nightOn;
      if (typeof p.showGrid === 'boolean') showGrid = p.showGrid;
      if (typeof p.fxOn === 'boolean') fxOn = p.fxOn;
      if (typeof p.showSymbols === 'boolean') showSymbols = p.showSymbols;
      if (typeof p.tipsOn === 'boolean') tipsOn = p.tipsOn;
      if (['all', 'warn', 'off'].includes(p.notesMode)) notesMode = p.notesMode;
      if (typeof p.colorMode === 'string' && PALETTES[p.colorMode]) colorMode = p.colorMode;
      if (Array.isArray(p.customHex) && p.customHex.length === COLORS.length && p.customHex.every(h => /^#[0-9a-f]{6}$/i.test(h))) customHex = p.customHex.slice();
    }
  } catch (e) {}
  // phones start on Balanced
  if (!gfxSaved) { let phone = false; try { phone = matchMedia('(pointer: coarse)').matches || innerWidth < 820; } catch (e) {} if (phone) Object.assign(gfx, GFX_PRESETS.balanced, {preset: 'balanced'}); }
  applyPalette();
  applyA11y();
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
  lib.insertAdjacentHTML('beforeend', '<p class="mnote liblock">Your colours \u2014 buy or hire more in the <button class="linkbtn inl" type="button" data-gostore="1">Store</button>.</p>');
  lib.querySelector('[data-gostore]').addEventListener('click', () => openMenu('store'));
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
  // only colours you own (or have hired) can go into a city colour slot
  const row = document.createElement('div'); row.className = 'librow';
  const seen = new Set();
  for (const g of COLOR_LIBRARY) for (const [name, hex] of g.cols) if (ownsColour(hex)) { row.append(mkSwatch(name, hex)); seen.add(hex); }
  for (const id in jb.owned) { const hex = id.slice(7); if (id.startsWith('colour:') && !seen.has(hex)) row.append(mkSwatch(colourName(hex), hex)); }
  if (row.children.length) lib.append(row);
  else lib.insertAdjacentHTML('beforeend', '<p class="mnote">No colours yet.</p>');
  sw.append(lib);
}
let palSlot = 0, libExpanded = false;
function pickLibColour(hex) {
  if (!ownsColour(hex)) { hint('Buy or hire that colour in the Store first.'); return; }
  const cur = COLORS.map(c => c.hex.toLowerCase());
  if (colorMode !== 'custom') { customHex = cur.slice(); colorMode = 'custom'; }
  const other = customHex.findIndex((h, j) => j !== palSlot && h.toLowerCase() === hex);
  if (other >= 0) customHex[other] = customHex[palSlot];          // taken by another slot: swap rather than duplicate
  customHex[palSlot] = hex;
  applyPalette(); savePrefs(); renderPaletteUI(); refreshHud(); drawMini();
}
/* ------------------------------------------------ settings: interface theme
   A preset (or the player's own colours for menus, buttons and highlights) and a panel style. Everything
   else the interface needs — text, hairlines, hover tints, the colour of text on a button — is worked out
   from those so any pick stays readable. Saved per browser, separately from the map's light/dark. */
const UI_KEY = 'junction-ui-theme-v1';
const UI_THEMES = {
  petrol:   {label: 'Default',  plate: '#143845', night: '#0d2029', accent: '#ffc933'},
  midnight: {label: 'Midnight', plate: '#171c31', accent: '#8ea8ff'},
  graphite: {label: 'Graphite', plate: '#25282d', accent: '#4fd1a5'},
  forest:   {label: 'Forest',   plate: '#1b3a2b', accent: '#f2c14e'},
  plum:     {label: 'Plum',     plate: '#2f1c40', accent: '#ff8fb1'},
  ember:    {label: 'Ember',    plate: '#3a1f18', accent: '#ffb347'},
  paper:    {label: 'Paper',    plate: '#f6f3ec', accent: '#1f6feb'},
  snow:     {label: 'Snow',     plate: '#ffffff', accent: '#e0483e'},
  sand:     {label: 'Sand',     plate: '#ece1c9', accent: '#1f7a6c'},
  neon:     {label: 'Neon',     plate: '#0b0f1f', accent: '#22e6ff'},
  royal:    {label: 'Royal',    plate: '#221a4c', accent: '#ffcc4d'},
  rosegold: {label: 'Rose gold', plate: '#f5e3de', accent: '#b45f4e'},
  ocean:    {label: 'Ocean',    plate: '#0f3550', accent: '#7fe3ff'},
  aurora:   {label: 'Aurora',   plate: '#0e1b2e', accent: '#4dffc3'},
  molten:   {label: 'Molten',   plate: '#2a0f0a', accent: '#ff6a2b'},
  /* p30 interface themes */
  lagoon: {label: 'Lagoon', plate: '#0e3b3e', accent: '#5ff2d0'},
  slate: {label: 'Slate', plate: '#2c3440', accent: '#ffb86b'},
  cocoa: {label: 'Cocoa', plate: '#3a2a22', accent: '#f6c28b'},
  berry: {label: 'Berry', plate: '#3d1430', accent: '#ff7ab8'},
  moss: {label: 'Moss', plate: '#2e3a1f', accent: '#c6e36b'},
  navy: {label: 'Navy', plate: '#13254a', accent: '#ff8a5c'},
  charcoal: {label: 'Charcoal', plate: '#1d1f22', accent: '#ff5f6d'},
  lavender: {label: 'Lavender', plate: '#ece6f6', accent: '#6b4bc4'},
  mint: {label: 'Mint', plate: '#e3f5ec', accent: '#178a6a'},
  peach: {label: 'Peach', plate: '#fbe6d8', accent: '#d0563b'},
  sky: {label: 'Sky', plate: '#e4f1fb', accent: '#1e6fd0'},
  butter: {label: 'Butter', plate: '#fbf3d5', accent: '#b5541c'},
  blush: {label: 'Blush', plate: '#fbe4ea', accent: '#c2185b'},
  sage: {label: 'Sage', plate: '#e6ece0', accent: '#4a6b3a'},
  denim: {label: 'Denim', plate: '#1f3550', accent: '#f5d06f'},
  wine: {label: 'Wine', plate: '#3b1018', accent: '#ffcf70'},
  pine: {label: 'Pine', plate: '#0f2a24', accent: '#ffd166'},
  storm: {label: 'Storm', plate: '#2b3445', accent: '#7fd1ff'},
  coral: {label: 'Coral', plate: '#ffe9e3', accent: '#e2553f'},
  ivory: {label: 'Ivory', plate: '#fffaf0', accent: '#8a5a00'},
  sunset: {label: 'Sunset', plate: '#2d1638', accent: '#ffa05c'},
  galaxy: {label: 'Galaxy', plate: '#140c2e', accent: '#c59bff'},
  /* p40 interface themes */
  teal: {label: 'Teal', plate: '#0f3d3a', accent: '#ffb86b'},
  olive: {label: 'Olive', plate: '#2f3a24', accent: '#f5d06f'},
  rust: {label: 'Rust', plate: '#3d2217', accent: '#7fe3ff'},
  indigo: {label: 'Indigo', plate: '#1c1f4a', accent: '#ffcc4d'},
  cream: {label: 'Cream', plate: '#fbf6e7', accent: '#2f7a78'},
  lilac: {label: 'Lilac', plate: '#f1e9fa', accent: '#9a3fb0'},
  seafoam: {label: 'Sea foam', plate: '#e2f6f0', accent: '#0f6b5a'},
  stone: {label: 'Stone', plate: '#e9e6df', accent: '#6b4bc4'},
  ink: {label: 'Ink', plate: '#101418', accent: '#ffd23a'},
  cherry: {label: 'Cherry', plate: '#4a0f1c', accent: '#ffd1e3'},
  twilight: {label: 'Twilight', plate: '#262a3f', accent: '#9fd5f2'},
  honey: {label: 'Honey', plate: '#fff1c9', accent: '#8a4a10'},
  candyfloss: {label: 'Candy floss', plate: '#ffe1f0', accent: '#1e6fd0'},
  nebula: {label: 'Nebula', plate: '#1a0f3d', accent: '#ff7ab8'}
};
/* p30 panel styles: each is a base style (clean, glass or road sign, maybe frosted) with its own corner radius, edge,
   shadow, sheen and button shape, applied through CSS variables (see applyUiTheme and the v1.11 block in styles.css) */
const PANEL_X = {
  pebble: {label: 'Pebble', base: 'clean', r: 20, ring: 'inset 0 0 0 1px var(--line)', rings: 'inset 0 0 0 1px var(--line)', drop: 'var(--shadow)', sheen: 'none', bgs: 'auto', btn: 'pill'},
  pillow: {label: 'Pillow', base: 'clean', r: 18, ring: 'inset 0 1px 0 rgba(255,255,255,.3),inset 0 0 0 1px rgba(255,255,255,.14)', rings: 'inset 0 1px 0 rgba(255,255,255,.3),inset 0 0 0 1px rgba(255,255,255,.14)', drop: '0 18px 40px rgba(0,0,0,.28),0 4px 10px rgba(0,0,0,.14)', sheen: 'linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,0) 42%)', bgs: 'auto', btn: 'pill'},
  outline: {label: 'Accent outline', base: 'clean', r: 14, ring: 'inset 0 0 0 1.5px rgba(var(--accent-rgb),.9)', rings: 'inset 0 0 0 1.5px rgba(var(--accent-rgb),.9)', drop: 'var(--shadow)', sheen: 'none', bgs: 'auto', btn: ''},
  ribbon: {label: 'Top ribbon', base: 'clean', r: 14, ring: 'inset 0 3px 0 rgba(var(--accent-rgb),.95),inset 0 0 0 1px var(--line)', rings: 'inset 0 2px 0 rgba(var(--accent-rgb),.95),inset 0 0 0 1px var(--line)', drop: 'var(--shadow)', sheen: 'none', bgs: 'auto', btn: ''},
  tab: {label: 'Side tab', base: 'clean', r: 12, ring: 'inset 4px 0 0 rgba(var(--accent-rgb),.95),inset 0 0 0 1px var(--line)', rings: 'inset 3px 0 0 rgba(var(--accent-rgb),.95),inset 0 0 0 1px var(--line)', drop: 'var(--shadow)', sheen: 'none', bgs: 'auto', btn: ''},
  underline: {label: 'Underline', base: 'clean', r: 16, ring: 'inset 0 -3px 0 rgba(var(--accent-rgb),.9),inset 0 0 0 1px var(--line)', rings: 'inset 0 -2px 0 rgba(var(--accent-rgb),.9),inset 0 0 0 1px var(--line)', drop: 'var(--shadow)', sheen: 'none', bgs: 'auto', btn: 'soft'},
  flat: {label: 'Flat', base: 'clean', r: 10, ring: 'inset 0 0 0 1px var(--line)', rings: 'inset 0 0 0 1px var(--line)', drop: '0 1px 2px rgba(0,0,0,.12)', sheen: 'none', bgs: 'auto', btn: ''},
  floating: {label: 'Floating', base: 'clean', r: 18, ring: 'inset 0 0 0 1px var(--line)', rings: 'inset 0 0 0 1px var(--line)', drop: '0 18px 40px rgba(0,0,0,.28),0 4px 10px rgba(0,0,0,.14)', sheen: 'none', bgs: 'auto', btn: ''},
  halo: {label: 'Halo', base: 'clean', r: 18, ring: 'inset 0 0 0 1px var(--line)', rings: 'inset 0 0 0 1px var(--line)', drop: '0 0 0 3px rgba(var(--accent-rgb),.32),var(--shadow)', sheen: 'none', bgs: 'auto', btn: 'pill'},
  glow: {label: 'Accent glow', base: 'clean', r: 16, ring: 'inset 0 0 0 1px rgba(var(--accent-rgb),.55)', rings: 'inset 0 0 0 1px rgba(var(--accent-rgb),.55)', drop: '0 0 0 1px rgba(var(--accent-rgb),.3),0 6px 24px rgba(var(--accent-rgb),.42)', sheen: 'none', bgs: 'auto', btn: ''},
  sticker: {label: 'Sticker', base: 'clean', r: 18, ring: '0 0 #0000', rings: '0 0 #0000', drop: '0 0 0 3px rgba(255,255,255,.92),0 8px 18px rgba(0,0,0,.26)', sheen: 'none', bgs: 'auto', btn: 'pill'},
  toy: {label: 'Toy block', base: 'clean', r: 16, ring: 'inset 0 1.5px 0 rgba(255,255,255,.22),inset 0 -2.5px 0 rgba(0,0,0,.16),inset 0 0 0 1px var(--line)', rings: 'inset 0 1px 0 rgba(255,255,255,.22),inset 0 -1.5px 0 rgba(0,0,0,.16)', drop: '0 4px 0 rgba(var(--accent-rgb),.85),0 10px 22px rgba(0,0,0,.2)', sheen: 'none', bgs: 'auto', btn: 'pill'},
  bevel: {label: 'Bevelled', base: 'clean', r: 12, ring: 'inset 0 1.5px 0 rgba(255,255,255,.22),inset 0 -2.5px 0 rgba(0,0,0,.16),inset 0 0 0 1px var(--line)', rings: 'inset 0 1px 0 rgba(255,255,255,.22),inset 0 -1.5px 0 rgba(0,0,0,.16)', drop: '0 4px 0 rgba(0,0,0,.24),0 10px 20px rgba(0,0,0,.16)', sheen: 'none', bgs: 'auto', btn: 'soft'},
  glossy: {label: 'Glossy', base: 'clean', r: 16, ring: 'inset 0 1px 0 rgba(255,255,255,.3),inset 0 0 0 1px rgba(255,255,255,.14)', rings: 'inset 0 1px 0 rgba(255,255,255,.3),inset 0 0 0 1px rgba(255,255,255,.14)', drop: 'var(--shadow)', sheen: 'linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,0) 42%)', bgs: 'auto', btn: ''},
  tinted: {label: 'Tinted', base: 'clean', r: 14, ring: 'inset 0 0 0 1px rgba(var(--accent-rgb),.55)', rings: 'inset 0 0 0 1px rgba(var(--accent-rgb),.55)', drop: 'var(--shadow)', sheen: 'linear-gradient(160deg,rgba(var(--accent-rgb),.16),rgba(var(--accent-rgb),.03) 60%)', bgs: 'auto', btn: ''},
  dusk: {label: 'Dusk fade', base: 'clean', r: 16, ring: 'inset 0 0 0 1px var(--line)', rings: 'inset 0 0 0 1px var(--line)', drop: 'var(--shadow)', sheen: 'linear-gradient(180deg,rgba(var(--accent-rgb),0) 35%,rgba(var(--accent-rgb),.15))', bgs: 'auto', btn: ''},
  spotlight: {label: 'Spotlight', base: 'clean', r: 16, ring: 'inset 0 0 0 1px var(--line)', rings: 'inset 0 0 0 1px var(--line)', drop: 'var(--shadow)', sheen: 'radial-gradient(120% 90% at 0% 0%,rgba(255,255,255,.16),rgba(255,255,255,0) 60%)', bgs: 'auto', btn: ''},
  polka: {label: 'Polka dots', base: 'clean', r: 16, ring: 'inset 0 0 0 1px var(--line)', rings: 'inset 0 0 0 1px var(--line)', drop: 'var(--shadow)', sheen: 'radial-gradient(circle,rgba(var(--ov),.08) 1.3px,transparent 1.9px)', bgs: '12px 12px', btn: 'pill'},
  duotone: {label: 'Duotone', base: 'clean', r: 18, ring: 'inset 0 0 0 1px rgba(var(--accent-rgb),.55)', rings: 'inset 0 0 0 1px rgba(var(--accent-rgb),.55)', drop: '0 10px 26px rgba(var(--accent-rgb),.32),0 2px 6px rgba(0,0,0,.14)', sheen: 'linear-gradient(135deg,rgba(var(--accent-rgb),.17),rgba(255,255,255,.04) 55%,rgba(var(--accent-rgb),.09))', bgs: 'auto', btn: 'pill'},
  comic: {label: 'Comic', base: 'clean', r: 14, ring: 'inset 0 0 0 2.5px var(--ink)', rings: 'inset 0 0 0 2px var(--ink)', drop: '0 4px 0 rgba(0,0,0,.24),0 10px 20px rgba(0,0,0,.16)', sheen: 'none', bgs: 'auto', btn: 'soft'},
  deep: {label: 'Deep shadow', base: 'clean', r: 16, ring: 'inset 0 0 0 1px var(--line)', rings: 'inset 0 0 0 1px var(--line)', drop: '0 24px 50px rgba(0,0,0,.35),0 8px 16px rgba(0,0,0,.18)', sheen: 'linear-gradient(180deg,rgba(0,0,0,0) 45%,rgba(0,0,0,.14))', bgs: 'auto', btn: ''},
  fizzy: {label: 'Fizzy', base: 'clean', r: 18, ring: 'inset 0 0 0 1px var(--line)', rings: 'inset 0 0 0 1px var(--line)', drop: 'var(--shadow)', sheen: 'radial-gradient(circle at 30% 30%,rgba(var(--ov),.07) 0 5px,transparent 6px),radial-gradient(circle at 72% 68%,rgba(var(--ov),.05) 0 9px,transparent 10px)', bgs: '46px 46px', btn: 'pill'},
  roundsign: {label: 'Rounded sign', base: 'sign', r: 20, ring: 'inset 0 0 0 3px var(--plate),inset 0 0 0 4.5px var(--keyline)', rings: 'inset 0 0 0 1.5px var(--keyline)', drop: 'var(--shadow)', sheen: 'none', bgs: 'auto', btn: 'pill'},
  accentsign: {label: 'Accent sign', base: 'sign', r: 12, ring: 'inset 0 0 0 3px var(--plate),inset 0 0 0 4.5px rgba(var(--accent-rgb),.9)', rings: 'inset 0 0 0 1.5px rgba(var(--accent-rgb),.9)', drop: 'var(--shadow)', sheen: 'none', bgs: 'auto', btn: ''},
  enamel: {label: 'Enamel sign', base: 'sign', r: 14, ring: 'inset 0 0 0 3px var(--plate),inset 0 0 0 4.5px var(--keyline)', rings: 'inset 0 0 0 1.5px var(--keyline)', drop: '0 18px 40px rgba(0,0,0,.28),0 4px 10px rgba(0,0,0,.14)', sheen: 'linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,0) 42%)', bgs: 'auto', btn: 'soft'},
  bubbleglass: {label: 'Bubble glass', base: 'glass', r: 20, ring: 'inset 0 1px 0 rgba(255,255,255,.3),inset 0 0 0 1px rgba(255,255,255,.14)', rings: 'inset 0 1px 0 rgba(255,255,255,.3),inset 0 0 0 1px rgba(255,255,255,.14)', drop: 'var(--shadow)', sheen: 'linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,0) 42%)', bgs: 'auto', btn: 'pill'},
  tintglass: {label: 'Tinted glass', base: 'glass', r: 16, ring: 'inset 0 0 0 1px rgba(var(--accent-rgb),.55)', rings: 'inset 0 0 0 1px rgba(var(--accent-rgb),.55)', drop: 'var(--shadow)', sheen: 'linear-gradient(160deg,rgba(var(--accent-rgb),.16),rgba(var(--accent-rgb),.03) 60%)', bgs: 'auto', btn: ''},
  glassline: {label: 'Glass outline', base: 'glass', r: 14, ring: 'inset 0 0 0 1.5px rgba(var(--accent-rgb),.9)', rings: 'inset 0 0 0 1.5px rgba(var(--accent-rgb),.9)', drop: '0 1px 2px rgba(0,0,0,.12)', sheen: 'none', bgs: 'auto', btn: ''},
  iceglass: {label: 'Ice glass', base: 'glass', r: 18, ring: 'inset 0 1px 0 rgba(255,255,255,.3),inset 0 0 0 1px rgba(255,255,255,.14)', rings: 'inset 0 1px 0 rgba(255,255,255,.3),inset 0 0 0 1px rgba(255,255,255,.14)', drop: '0 18px 40px rgba(0,0,0,.28),0 4px 10px rgba(0,0,0,.14)', sheen: 'linear-gradient(160deg,rgba(255,255,255,.16),rgba(255,255,255,.04) 45%,rgba(255,255,255,.08))', bgs: 'auto', btn: 'soft', frost: 1},
  frostglow: {label: 'Frosted glow', base: 'glass', r: 16, ring: 'inset 0 1px 0 rgba(255,255,255,.3),inset 0 0 0 1px rgba(255,255,255,.14)', rings: 'inset 0 1px 0 rgba(255,255,255,.3),inset 0 0 0 1px rgba(255,255,255,.14)', drop: '0 0 0 1px rgba(var(--accent-rgb),.3),0 6px 24px rgba(var(--accent-rgb),.42)', sheen: 'linear-gradient(160deg,rgba(255,255,255,.16),rgba(255,255,255,.04) 45%,rgba(255,255,255,.08))', bgs: 'auto', btn: '', frost: 1},
  aurora: {label: 'Aurora panels', base: 'clean', r: 18, ring: 'inset 0 0 0 1px rgba(var(--accent-rgb),.55)', rings: 'inset 0 0 0 1px rgba(var(--accent-rgb),.55)', drop: '0 0 0 1px rgba(var(--accent-rgb),.3),0 6px 24px rgba(var(--accent-rgb),.42)', sheen: 'linear-gradient(120deg,rgba(77,255,195,.16),rgba(127,90,255,.14) 50%,rgba(47,214,255,.14))', bgs: 'auto', btn: 'pill'},
  gilded: {label: 'Gilded', base: 'sign', r: 14, ring: 'inset 0 0 0 3px var(--plate),inset 0 0 0 4.5px #d4af37,inset 0 0 0 5.5px rgba(255,241,168,.45)', rings: 'inset 0 0 0 1.5px #d4af37', drop: '0 18px 40px rgba(0,0,0,.28),0 4px 10px rgba(0,0,0,.14)', sheen: 'linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,0) 42%)', bgs: 'auto', btn: 'soft'},
  opal: {label: 'Opal glass', base: 'glass', r: 20, ring: 'inset 0 1px 0 rgba(255,255,255,.3),inset 0 0 0 1px rgba(255,255,255,.14)', rings: 'inset 0 1px 0 rgba(255,255,255,.3),inset 0 0 0 1px rgba(255,255,255,.14)', drop: '0 18px 40px rgba(0,0,0,.28),0 4px 10px rgba(0,0,0,.14)', sheen: 'linear-gradient(135deg,rgba(255,170,220,.18),rgba(170,220,255,.16) 50%,rgba(200,255,210,.14))', bgs: 'auto', btn: 'pill', frost: 1},
  /* p40 panel styles */
  softstripe: {label: 'Soft stripes', base: 'clean', r: 18, ring: 'inset 0 0 0 1px var(--line)', rings: 'inset 0 0 0 1px var(--line)', drop: 'var(--shadow)', sheen: 'repeating-linear-gradient(135deg,rgba(var(--ov),.05) 0 8px,rgba(var(--ov),0) 8px 16px)', bgs: 'auto', btn: 'pill'},
  ringlets: {label: 'Ringlets', base: 'clean', r: 18, ring: 'inset 0 0 0 1px var(--line)', rings: 'inset 0 0 0 1px var(--line)', drop: 'var(--shadow)', sheen: 'radial-gradient(circle,rgba(var(--ov),0) 5px,rgba(var(--ov),.07) 5.5px,rgba(var(--ov),.07) 7px,rgba(var(--ov),0) 7.5px)', bgs: '26px 26px', btn: 'pill'},
  rainbowtop: {label: 'Rainbow ribbon', base: 'clean', r: 14, ring: 'inset 0 0 0 1px var(--line)', rings: 'inset 0 0 0 1px var(--line)', drop: 'var(--shadow)', sheen: 'linear-gradient(180deg,rgba(0,0,0,0) 4px,var(--plate) 4px),linear-gradient(90deg,#ff6b6b,#ffd23a,#3fd16a,#2f9bff,#8a5bff)', bgs: 'auto', btn: ''},
  boldline: {label: 'Bold outline', base: 'clean', r: 16, ring: 'inset 0 0 0 3px rgba(var(--accent-rgb),.9)', rings: 'inset 0 0 0 2px rgba(var(--accent-rgb),.9)', drop: '0 1px 2px rgba(0,0,0,.12)', sheen: 'none', bgs: 'auto', btn: 'soft'},
  innerglow: {label: 'Inner glow', base: 'clean', r: 18, ring: 'inset 0 0 18px rgba(var(--accent-rgb),.35),inset 0 0 0 1px rgba(var(--accent-rgb),.5)', rings: 'inset 0 0 8px rgba(var(--accent-rgb),.55),inset 0 0 0 1px rgba(var(--accent-rgb),.5)', drop: 'var(--shadow)', sheen: 'none', bgs: 'auto', btn: 'pill'},
  longshadow: {label: 'Long shadow', base: 'clean', r: 14, ring: 'inset 0 0 0 1px var(--line)', rings: 'inset 0 0 0 1px var(--line)', drop: '8px 8px 0 rgba(var(--accent-rgb),.55),0 10px 24px rgba(0,0,0,.18)', sheen: 'none', bgs: 'auto', btn: 'soft'},
  cushion: {label: 'Cushion', base: 'clean', r: 26, ring: 'inset 0 1px 0 rgba(255,255,255,.3),inset 0 0 0 1px rgba(255,255,255,.14)', rings: 'inset 0 1px 0 rgba(255,255,255,.3),inset 0 0 0 1px rgba(255,255,255,.14)', drop: '0 18px 40px rgba(0,0,0,.28),0 4px 10px rgba(0,0,0,.14)', sheen: 'linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,0) 42%)', bgs: 'auto', btn: 'pill'},
  stacked: {label: 'Stacked cards', base: 'clean', r: 16, ring: 'inset 0 0 0 1px var(--line)', rings: 'inset 0 0 0 1px var(--line)', drop: '0 12px 0 -6px rgba(0,0,0,.18),0 14px 30px rgba(0,0,0,.22)', sheen: 'none', bgs: 'auto', btn: ''},
  honeycomb: {label: 'Honeycomb', base: 'clean', r: 16, ring: 'inset 0 0 0 1px var(--line)', rings: 'inset 0 0 0 1px var(--line)', drop: 'var(--shadow)', sheen: 'radial-gradient(circle at 50% 50%,rgba(var(--ov),.07) 0 6px,rgba(var(--ov),0) 7px),radial-gradient(circle at 0 0,rgba(var(--ov),.07) 0 6px,rgba(var(--ov),0) 7px)', bgs: '28px 28px', btn: 'pill'},
  stripesign: {label: 'Striped sign', base: 'sign', r: 14, ring: 'inset 0 0 0 3px var(--plate),inset 0 0 0 4.5px var(--keyline)', rings: 'inset 0 0 0 1.5px var(--keyline)', drop: 'var(--shadow)', sheen: 'repeating-linear-gradient(135deg,rgba(var(--ov),.05) 0 8px,rgba(var(--ov),0) 8px 16px)', bgs: 'auto', btn: ''},
  ripples: {label: 'Ripples', base: 'clean', r: 20, ring: 'inset 0 0 0 1px var(--line)', rings: 'inset 0 0 0 1px var(--line)', drop: 'var(--shadow)', sheen: 'repeating-radial-gradient(circle at 50% 50%,rgba(var(--ov),.05) 0 3px,rgba(var(--ov),0) 3px 10px)', bgs: 'auto', btn: 'pill'},
  velvet: {label: 'Velvet', base: 'clean', r: 18, ring: 'inset 0 0 0 1px rgba(var(--accent-rgb),.55)', rings: 'inset 0 0 0 1px rgba(var(--accent-rgb),.55)', drop: '0 24px 50px rgba(0,0,0,.35),0 8px 16px rgba(0,0,0,.18)', sheen: 'linear-gradient(180deg,rgba(var(--accent-rgb),0) 35%,rgba(var(--accent-rgb),.15))', bgs: 'auto', btn: 'pill'},
  stripeglass: {label: 'Striped glass', base: 'glass', r: 18, ring: 'inset 0 1px 0 rgba(255,255,255,.3),inset 0 0 0 1px rgba(255,255,255,.14)', rings: 'inset 0 1px 0 rgba(255,255,255,.3),inset 0 0 0 1px rgba(255,255,255,.14)', drop: '0 18px 40px rgba(0,0,0,.28),0 4px 10px rgba(0,0,0,.14)', sheen: 'repeating-linear-gradient(135deg,rgba(var(--ov),.05) 0 8px,rgba(var(--ov),0) 8px 16px)', bgs: 'auto', btn: 'pill'},
  candyglass: {label: 'Candy glass', base: 'glass', r: 20, ring: 'inset 0 1px 0 rgba(255,255,255,.3),inset 0 0 0 1px rgba(255,255,255,.14)', rings: 'inset 0 1px 0 rgba(255,255,255,.3),inset 0 0 0 1px rgba(255,255,255,.14)', drop: '0 0 0 3px rgba(var(--accent-rgb),.32),var(--shadow)', sheen: 'linear-gradient(135deg,rgba(255,120,180,.16),rgba(120,200,255,.14))', bgs: 'auto', btn: 'pill', frost: 1},
  prism: {label: 'Prism glass', base: 'glass', r: 20, ring: 'inset 0 1px 0 rgba(255,255,255,.3),inset 0 0 0 1px rgba(255,255,255,.14)', rings: 'inset 0 1px 0 rgba(255,255,255,.3),inset 0 0 0 1px rgba(255,255,255,.14)', drop: '0 0 0 1px rgba(var(--accent-rgb),.3),0 6px 24px rgba(var(--accent-rgb),.42)', sheen: 'linear-gradient(120deg,rgba(255,80,80,.14),rgba(255,210,58,.12) 25%,rgba(63,209,106,.12) 50%,rgba(47,155,255,.14) 75%,rgba(138,91,255,.14))', bgs: 'auto', btn: 'pill', frost: 1}
};
const UI_STYLES = ['clean', 'glass', 'sign'].concat(Object.keys(PANEL_X));
let uiTheme = {preset: 'petrol', style: 'clean', frost: false, plate: '', btn: '', accent: ''};
const hexOk = h => typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h);
function lum(hex) {                                   // WCAG relative luminance
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const [r, g, b] = rgbOf(hex); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const onColour = bg => contrast(bg, '#ffffff') >= contrast(bg, '#10262f') ? '#ffffff' : '#10262f';
function mixHex(a, b, t) {
  const A = rgbOf(a), B = rgbOf(b);
  return '#' + A.map((v, i) => Math.round(lerp(v, B[i], t)).toString(16).padStart(2, '0')).join('');
}
function uiColours() {
  const pr = UI_THEMES[uiTheme.preset] || UI_THEMES.petrol;
  const plate = uiTheme.plate || (theme === 'dark' && pr.night ? pr.night : pr.plate);
  const accent = uiTheme.accent || pr.accent;
  return {plate, accent, btn: uiTheme.btn || accent};
}
function applyUiTheme() {
  const {plate, accent, btn} = uiColours(), light = lum(plate) > 0.4, root = document.documentElement, st = root.style;
  const ov = light ? '0,0,0' : '255,255,255';
  // a highlight that would vanish against the panels is nudged until it reads
  let acc = accent;
  for (let i = 0; i < 6 && contrast(acc, plate) < 2.2; i++) acc = mixHex(acc, light ? '#000000' : '#ffffff', 0.18);
  const vars = {
    '--plate': plate, '--plate-2': mixHex(plate, light ? '#000000' : '#ffffff', 0.07), '--plate-glass': 'rgba(' + rgbOf(plate).join(',') + ',' + (light ? 0.5 : 0.42) + ')', '--plate-frost': 'rgba(' + rgbOf(plate).join(',') + ',' + (light ? 0.62 : 0.55) + ')',
    '--ink': light ? '#17252d' : '#f2f7f6', '--soft': light ? 'rgba(23,37,45,.66)' : 'rgba(242,247,246,.68)', '--ov': ov,
    '--line': 'rgba(' + ov + ',' + (light ? 0.13 : 0.16) + ')', '--keyline': light ? 'rgba(23,37,45,.55)' : (theme === 'dark' ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.88)'),
    '--accent': acc, '--accent-rgb': rgbOf(acc).join(','), '--on-accent': onColour(acc),
    '--btn': btn, '--btn-rgb': rgbOf(btn).join(','), '--on-btn': onColour(btn), '--btn-edge': mixHex(btn, '#000000', 0.28),
    '--shadow': light ? '0 10px 26px rgba(24,34,44,.16), 0 2px 6px rgba(24,34,44,.08)' : (theme === 'dark' ? '0 10px 28px rgba(0,0,0,.5), 0 2px 6px rgba(0,0,0,.25)' : '0 10px 28px rgba(6,20,28,.3), 0 2px 6px rgba(6,20,28,.14)')
  };
  for (const k in vars) st.setProperty(k, vars[k]);
  root.dataset.uiTone = light ? 'light' : 'dark';
  const pv = PANEL_X[uiTheme.style];
  root.dataset.uiStyle = pv ? pv.base : UI_STYLES.includes(uiTheme.style) ? uiTheme.style : 'clean';
  root.dataset.uiFrost = uiTheme.frost || (pv && pv.frost) ? '1' : '0';
  root.dataset.uiPx = pv ? '1' : '0'; root.dataset.uiPbtn = pv ? pv.btn : '';
  if (pv) { const pvv = {'--px-r': pv.r + 'px', '--px-ring': pv.ring, '--px-ring-s': pv.rings, '--px-drop': pv.drop, '--px-sheen': pv.sheen, '--px-bgs': pv.bgs}; for (const k in pvv) st.setProperty(k, pvv[k]); }
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = plate;
}
function saveUiTheme() { try { localStorage.setItem(UI_KEY, JSON.stringify(uiTheme)); } catch (e) {} rememberMode(); }
function loadUiTheme() {
  try {
    const u = JSON.parse(localStorage.getItem(UI_KEY));
    if (u && typeof u === 'object') {
      if (UI_THEMES[u.preset]) uiTheme.preset = u.preset;
      if (UI_STYLES.includes(u.style)) uiTheme.style = u.style;
      uiTheme.frost = !!u.frost;
      for (const f of ['plate', 'btn', 'accent']) uiTheme[f] = hexOk(u[f]) ? u[f].toLowerCase() : '';
    }
  } catch (e) {}
  applyUiTheme();
}
function setUi(ch) { Object.assign(uiTheme, ch); saveUiTheme(); applyUiTheme(); renderLook(); }
const uiCustom = () => !!(uiTheme.plate || uiTheme.btn || uiTheme.accent);
const renderUiThemeUI = () => renderLook(), renderMapUI = () => renderLook(), renderModesUI = () => {};
/* ---- your own light and dark modes. Each mode remembers a whole look: interface theme, panel style, map theme,
   decorations and any custom colours. Whatever you change while a mode is on is saved into that mode, and the
   T key (or the half-moon button) swaps between the two. */
const MODES_KEY = 'junction-modes-v1';
const MODE_DEFAULTS = {
  light: {ui: {preset: 'petrol', style: 'clean', frost: false, plate: '', btn: '', accent: ''}, map: {theme: 'meadow', decor: 'auto', land: '', patch: '', water: '', road: '', moto: ''}},
  dark:  {ui: {preset: 'petrol', style: 'clean', frost: false, plate: '', btn: '', accent: ''}, map: {theme: 'night', decor: 'auto', land: '', patch: '', water: '', road: '', moto: ''}}
};
let modes = {cur: 'light', light: null, dark: null}, modeBusy = true;      // busy until boot has loaded everything
const snapLook = () => ({ui: Object.assign({}, uiTheme), map: {theme: mapPrefs.theme, decor: mapPrefs.decor, land: mapPrefs.land, patch: mapPrefs.patch, water: mapPrefs.water, road: mapPrefs.road, moto: mapPrefs.moto}});
function saveModes() { try { localStorage.setItem(MODES_KEY, JSON.stringify(modes)); } catch (e) {} }
function rememberMode() { if (modeBusy) return; modes[modes.cur] = snapLook(); saveModes(); renderModesUI(); }
function useMode(m) {
  m = m === 'dark' ? 'dark' : 'light';
  const L = modes[m] || MODE_DEFAULTS[m];
  modes.cur = m; modeBusy = true;
  Object.assign(uiTheme, MODE_DEFAULTS[m].ui, L.ui); Object.assign(mapPrefs, MODE_DEFAULTS[m].map, L.map);
  try { localStorage.setItem(UI_KEY, JSON.stringify(uiTheme)); } catch (e) {}
  applyMap();
  modeBusy = false; rememberMode();
  renderUiThemeUI(); renderMapUI();
}
const toggleMode = () => useMode(modes.cur === 'dark' ? 'light' : 'dark');
/* called once at boot, after the current look has been loaded */
function loadModes() {
  let m = null; try { m = JSON.parse(localStorage.getItem(MODES_KEY)); } catch (e) {}
  if (m && typeof m === 'object') {
    modes.cur = m.cur === 'dark' ? 'dark' : 'light';
    for (const k of ['light', 'dark']) modes[k] = m[k] && m[k].ui && m[k].map ? m[k] : null;
  } else modes.cur = theme === 'dark' ? 'dark' : 'light';            // first run: whatever you were using becomes that mode
  modeBusy = false; rememberMode();
}

/* ------------------------------------------------ Junc Bucks (◎) and stars (✦), the Store and what you own
   Every 10 parcels delivered, in any city, earns one Junc Buck. They buy interface themes, panel styles, map themes,
   decorations, designs for cars, houses, roads, stores, traffic lights, roundabouts and bridges, and colours, one
   colour at a time. A colour can also be hired for 3 hours. Buying takes two taps, so nothing goes by accident.
   The standard light and dark looks and the colour-blind colour modes are always free. Saved on this browser. */
const SHOP_KEY = 'junction-shop-v1', HIRE_PRICE = 150, HIRE_MS = 3 * 3600 * 1000;
const CUR = '◎', RCUR = '✦';                     // the credits' symbols: ◎ coins, ✦ stars (rare, from Frantic cities)
const PARCELS_PER_BUCK = 3, BUCKS_EACH = 2, R_PER = 1;  // 2 ◎ for every 3 parcels delivered; ✦ for every parcel in a Frantic city
/* prices are written on the old scale (25-90) and stretched onto today's: standard #500-700, rare #750-1000 */
const newPrice = p => p <= 40 ? 500 + Math.round((p - 25) / 15 * 200 / 25) * 25 : Math.min(1000, 750 + Math.round((p - 45) / 45 * 250 / 25) * 25);
/* [name, price, currency] — currency 'R' means ✦ (rare bucks, only from Frantic games): the super-rare few */
const DESIGNS = {
  car:    {label: 'Car designs', one: 'car design', items: {standard: ['Standard', 0], twotone: ['Two-tone', 35], checker: ['Checker band', 35], livery: ['Racing livery', 40],
           retro: ['Retro chrome', 40], flames: ['Flames', 45], camo: ['Camo', 40], pastel: ['Pastel', 35], neon: ['Neon underglow', 60], gold: ['Gold plated', 30, 'R'], champion: ['Champion', 0, 'A', 'p1000']}},
  house:  {label: 'House designs', one: 'house design', items: {standard: ['Standard', 0], barn: ['Barn', 35], thatch: ['Thatched cottage', 35], beach: ['Beach hut', 35],
           modern: ['Modern', 40], igloo: ['Igloo', 40], treehouse: ['Treehouse', 45], windmill: ['Windmill', 45], tower: ['Tower', 60], castle: ['Castle', 30, 'R'], lighthouse: ['Lighthouse', 0, 'A', 'w20']}},
  road:   {label: 'Road designs', one: 'road design', items: {standard: ['Asphalt', 0], dirt: ['Dirt track', 30], concrete: ['Concrete slabs', 30], brick: ['Red brick', 35],
           snowy: ['Snowy', 35], cobble: ['Cobblestone', 40], candy: ['Candy', 35], boardwalk: ['Boardwalk', 40], neon: ['Neon', 60], gold: ['Yellow brick road', 30, 'R'], racetrack: ['Racetrack', 0, 'A', 'kits']}},
  store:  {label: 'Store designs', one: 'store design', items: {standard: ['Standard', 0], brick: ['Brick', 35], warehouse: ['Warehouse', 40], market: ['Market hall', 45],
           eco: ['Eco roof', 45], neon: ['Neon', 50], diner: ['Diner', 40], pagoda: ['Pagoda', 50], glass: ['Glass tower', 60], crystal: ['Crystal', 30, 'R'], helipad: ['Helipad', 0, 'A', 'e25k']}},
  light:  {label: 'Traffic light designs', one: 'traffic light design', items: {standard: ['Standard', 0], minimal: ['Minimal', 25], modern: ['LED bars', 30], retro: ['Retro', 30], lantern: ['Lanterns', 35], gold: ['Gold', 0, 'A', 'light8']}},
  round:  {label: 'Roundabout designs', one: 'roundabout design', items: {standard: ['Standard', 0], stone: ['Paved', 30], garden: ['Garden', 35], sundial: ['Sundial', 40], pond: ['Lily pond', 40], fountain: ['Fountain', 55], statue: ['Statue', 0, 'A', 'round5']}},
  bridge: {label: 'Bridge designs', one: 'bridge design', items: {standard: ['Stone', 0], wood: ['Wooden', 30], rope: ['Rope bridge', 35], steel: ['Steel truss', 40],
           brick: ['Brick arch', 35], glass: ['Glass', 45], suspension: ['Suspension', 55], rainbow: ['Rainbow', 30, 'R'], covered: ['Covered', 0, 'A', 'cities10']}},
  moto:   {label: 'Motorway designs', one: 'motorway design', items: {standard: ['Blue deck', 0], concrete: ['Concrete', 30], ivy: ['Ivy', 35], lights: ['Night lights', 40], sunset: ['Sunset', 45], glass: ['Glass', 45], rainbow: ['Rainbow', 30, 'R'], skyline: ['Skyline', 0, 'A', 'moto3']}},
  drone:  {label: 'Drone designs', one: 'drone design', items: {standard: ['Standard', 0]}}
};
/* v1.9: new designs. 'U' is unique (only from mystery crates); 'R' items are the daily specials, priced in ✦ */
Object.assign(DESIGNS.car.items, {police: ['Police', 60], galaxy: ['Galaxy', 0, 'U']});
Object.assign(DESIGNS.house.items, {mushroom: ['Mushroom house', 0, 'U']});
Object.assign(DESIGNS.road.items, {marble: ['Marble', 55], lava: ['Lava flow', 0, 'U']});
Object.assign(DESIGNS.store.items, {arcade: ['Arcade', 0, 'U']});
Object.assign(DESIGNS.light.items, {disco: ['Disco', 0, 'U']});
Object.assign(DESIGNS.round.items, {carousel: ['Carousel', 0, 'U']});
Object.assign(DESIGNS.bridge.items, {crystal: ['Ice crystal', 0, 'U']});
Object.assign(DESIGNS.moto.items, {aurora: ['Aurora', 0, 'U']});
for (const cat in GEN) for (const [k, n, pr, cur] of GEN[cat]) DESIGNS[cat].items[k] = cur ? [n, pr, cur] : [n, pr];
const SPECIAL_R = {'car:gold': 200, 'house:castle': 250, 'road:gold': 150, 'store:crystal': 300, 'bridge:rainbow': 200, 'moto:rainbow': 150};
for (const k in SPECIAL_R) { const [c, i] = k.split(':'); DESIGNS[c].items[i][1] = SPECIAL_R[k]; }
/* p52 */
/* ---- profile looks: a banner behind your name, a frame round your avatar, and a title. Bought like any look. */
const BANNERS = {
  sunrise: ['Sunrise', 30, 'linear-gradient(120deg,#ff8a5c,#ffd23a)'], ocean: ['Ocean', 30, 'linear-gradient(120deg,#1a7ca6,#7fe3ff)'], forest: ['Forest', 30, 'linear-gradient(120deg,#2e7d32,#93c47d)'],
  candy: ['Candy', 35, 'linear-gradient(120deg,#ff6fb5,#ffd1e3)'], royal: ['Royal', 40, 'linear-gradient(120deg,#221a4c,#8a5bd6)'], ember: ['Ember', 40, 'linear-gradient(120deg,#3a1f18,#ff6a2b)'],
  dusk: ['Dusk', 35, 'linear-gradient(120deg,#2b1b3d,#e3527a 60%,#ffcf5c)'], mint: ['Mint', 30, 'linear-gradient(120deg,#16a2b8,#bff0dc)'], slate: ['Slate', 25, 'linear-gradient(120deg,#3a4652,#9fb3c2)'],
  neon: ['Neon', 55, 'linear-gradient(120deg,#0b0f1f,#22e6ff 55%,#ff3df2)'], lava: ['Lava', 60, 'linear-gradient(120deg,#2a1714,#ff5a1a 55%,#ffc23a)'], rainbow: ['Rainbow', 70, 'linear-gradient(120deg,#ff4d4d,#ff9f1a,#ffd23a,#3fd16a,#2f9bff,#8a5bff)'],
  aurora: ['Aurora', 0, 'linear-gradient(120deg,#0e1b2e,#3dffb0 40%,#7a5bff 80%)', 'U'], galaxy: ['Galaxy', 0, 'radial-gradient(circle at 30% 30%,#c59bff,#1a0f3d 60%)', 'U'], gold: ['Gold leaf', 0, 'linear-gradient(120deg,#8f6d10,#fff1a8 50%,#d4af37)', 'U']
};
const FRAMES = {
  ring: ['Ring', 25, '#ffffff'], gold: ['Gold', 45, '#d4af37'], teal: ['Teal', 25, '#16a2b8'], rose: ['Rose', 25, '#e3799d'], mint: ['Mint', 25, '#4fd1a5'], violet: ['Violet', 30, '#8a5bd6'],
  neon: ['Neon', 55, '#22e6ff'], ember: ['Ember', 45, '#ff6a2b'], laurel: ['Laurel', 60, '#7cb342'], crown: ['Crown', 0, '#ffd23a', 'U'], halo: ['Halo', 0, '#fff1a8', 'U'], prism: ['Prism', 0, 'conic', 'U']
};
const TITLES = {
  pusher: ['Parcel Pusher', 25], planner: ['City Planner', 30], royalty: ['Roundabout Royalty', 40], whisperer: ['Traffic Whisperer', 40], mogul: ['Motorway Mogul', 40], builder: ['Bridge Builder', 30],
  owl: ['Night Owl', 30], speed: ['Speed Demon', 35], zen: ['Zen Master', 35], tycoon: ['Tycoon', 45], gridlock: ['Gridlock Breaker', 55], mayor: ['Mayor', 60],
  legend: ['Junction Legend', 0, 'U'], ghost: ['Phantom Driver', 0, 'U'], champion: ['Champion', 0, 'A', 'p1000']
};
const COSMETICS = {
  'ui:ocean': [50, 'Ocean theme'], 'ui:aurora': [0, 'Aurora theme', 'U'], 'ui:molten': [0, 'Molten theme', 'U'],
  'map:lunar': [0, 'Lunar map', 'U'], 'map:volcano': [0, 'Volcano map', 'U'], 'decor:crystal': [0, 'Crystals', 'U'],
  'ui:midnight': [30, 'Midnight theme'], 'ui:graphite': [25, 'Graphite theme'], 'ui:forest': [30, 'Forest theme'], 'ui:plum': [35, 'Plum theme'],
  'ui:ember': [35, 'Ember theme'], 'ui:paper': [40, 'Paper theme'], 'ui:snow': [40, 'Snow theme'], 'ui:sand': [35, 'Sand theme'],
  'ui:neon': [75, 'Neon theme'], 'ui:royal': [65, 'Royal theme'], 'ui:rosegold': [85, 'Rose gold theme'],
  'style:glass': [35, 'Glass panels'], 'style:sign': [25, 'Road sign panels'], 'style:frost': [55, 'Frosted glass'],
  'map:winter': [45, 'Winter map'], 'map:desert': [35, 'Desert map'], 'map:autumn': [35, 'Autumn map'], 'map:blossom': [40, 'Blossom map'],
  'map:tropical': [45, 'Tropical map'], 'map:spooky': [75, 'Spooky map'], 'map:candy': [90, 'Candy map'],
  'decor:pine': [25, 'Pines'], 'decor:bush': [25, 'Bushes'], 'decor:rock': [25, 'Rocks'], 'decor:flowers': [30, 'Flowers'], 'decor:autumn': [30, 'Autumn trees'],
  'decor:cactus': [30, 'Cacti'], 'decor:blossom': [35, 'Blossom trees'], 'decor:palm': [35, 'Palms'], 'decor:snowpine': [45, 'Snowy pines'],
  'decor:mushroom': [55, 'Mushrooms'], 'decor:pumpkin': [60, 'Pumpkins']
};
/* p40: more interface themes, map themes, decorations and panel styles */
Object.assign(COSMETICS, {
  'ui:teal': [30, 'Teal theme'],
  'ui:olive': [30, 'Olive theme'],
  'ui:rust': [35, 'Rust theme'],
  'ui:indigo': [35, 'Indigo theme'],
  'ui:cream': [30, 'Cream theme'],
  'ui:lilac': [45, 'Lilac theme'],
  'ui:seafoam': [35, 'Sea foam theme'],
  'ui:stone': [25, 'Stone theme'],
  'ui:ink': [25, 'Ink theme'],
  'ui:cherry': [45, 'Cherry theme'],
  'ui:twilight': [50, 'Twilight theme'],
  'ui:honey': [50, 'Honey theme'],
  'ui:candyfloss': [0, 'Candy floss theme', 'U'],
  'ui:nebula': [0, 'Nebula theme', 'U'],
  'map:poppyfield': [30, 'Poppy field map'],
  'map:daisymeadow': [30, 'Daisy meadow map'],
  'map:rosegarden': [40, 'Rose garden map'],
  'map:lemongrove': [35, 'Lemon grove map'],
  'map:apiary': [35, 'Apiary map'],
  'map:oakwood': [30, 'Oak wood map'],
  'map:gelato': [50, 'Gelato map'],
  'map:teagarden': [35, 'Tea garden map'],
  'map:pebblebeach': [30, 'Pebble beach map'],
  'map:plaza': [35, 'Fountain plaza map'],
  'map:donutshop': [55, 'Donut shop map'],
  'map:yuletide': [60, 'Yuletide map'],
  'map:abyss': [0, 'Abyss map', 'U'],
  'map:wispmarsh': [0, 'Wisp marsh map', 'U'],
  'decor:poppy': [30, 'Poppies'],
  'decor:daisy': [25, 'Daisies'],
  'decor:rosebush': [35, 'Rose bushes'],
  'decor:lemontree': [30, 'Lemon trees'],
  'decor:beehive': [35, 'Beehives'],
  'decor:acorn': [25, 'Acorns'],
  'decor:icecream': [45, 'Ice creams'],
  'decor:teacup': [35, 'Teacups'],
  'decor:cairn': [25, 'Pebble stacks'],
  'decor:donut': [45, 'Donuts'],
  'decor:bauble': [50, 'Baubles'],
  'decor:fountain': [55, 'Fountains'],
  'decor:jellyfish': [0, 'Jellyfish', 'U'],
  'decor:wisp': [0, 'Wisps', 'U'],
  'decor:ghostlight': [55, 'Ghost lights'],
  'style:softstripe': [30, 'Soft stripes panels'],
  'style:ringlets': [35, 'Ringlets panels'],
  'style:rainbowtop': [40, 'Rainbow ribbon panels'],
  'style:boldline': [25, 'Bold outline panels'],
  'style:innerglow': [35, 'Inner glow panels'],
  'style:longshadow': [30, 'Long shadow panels'],
  'style:cushion': [35, 'Cushion panels'],
  'style:stacked': [30, 'Stacked cards panels'],
  'style:honeycomb': [35, 'Honeycomb panels'],
  'style:stripesign': [35, 'Striped sign panels'],
  'style:ripples': [45, 'Ripples panels'],
  'style:velvet': [45, 'Velvet panels'],
  'style:stripeglass': [50, 'Striped glass panels'],
  'style:candyglass': [0, 'Candy glass panels', 'U'],
  'style:prism': [0, 'Prism glass panels', 'U']
});
/* p30: more interface themes, map themes, decorations and panel styles */
Object.assign(COSMETICS, {
  'ui:lagoon': [35, 'Lagoon theme'],
  'ui:slate': [25, 'Slate theme'],
  'ui:cocoa': [30, 'Cocoa theme'],
  'ui:berry': [45, 'Berry theme'],
  'ui:moss': [30, 'Moss theme'],
  'ui:navy': [30, 'Navy theme'],
  'ui:charcoal': [25, 'Charcoal theme'],
  'ui:lavender': [35, 'Lavender theme'],
  'ui:mint': [35, 'Mint theme'],
  'ui:peach': [35, 'Peach theme'],
  'ui:sky': [30, 'Sky theme'],
  'ui:butter': [30, 'Butter theme'],
  'ui:blush': [40, 'Blush theme'],
  'ui:sage': [30, 'Sage theme'],
  'ui:denim': [35, 'Denim theme'],
  'ui:wine': [55, 'Wine theme'],
  'ui:pine': [30, 'Pine theme'],
  'ui:storm': [50, 'Storm theme'],
  'ui:coral': [50, 'Coral theme'],
  'ui:ivory': [45, 'Ivory theme'],
  'ui:sunset': [0, 'Sunset theme', 'U'],
  'ui:galaxy': [0, 'Galaxy theme', 'U'],
  'map:orchard': [30, 'Orchard map'],
  'map:provence': [40, 'Provence map'],
  'map:sunfields': [35, 'Sunflower fields map'],
  'map:harvest': [30, 'Harvest map'],
  'map:tulips': [35, 'Tulip fields map'],
  'map:birchwood': [30, 'Birch wood map'],
  'map:marsh': [30, 'Marshland map'],
  'map:bamboo': [40, 'Bamboo grove map'],
  'map:reef': [55, 'Coral reef map'],
  'map:seaside': [35, 'Seaside map'],
  'map:riviera': [45, 'Riviera map'],
  'map:fairground': [40, 'Fairground map'],
  'map:bakery': [60, 'Bakery map'],
  'map:lollipop': [40, 'Lollipop lane map'],
  'map:gumdrop': [40, 'Gumdrop hills map'],
  'map:cloudland': [55, 'Cloudland map'],
  'map:palace': [35, 'Palace gardens map'],
  'map:watergarden': [30, 'Water garden map'],
  'map:arctic': [40, 'Arctic map'],
  'map:savanna': [35, 'Savanna map'],
  'map:deepsea': [50, 'Deep sea map'],
  'map:fireflies': [50, 'Firefly night map'],
  'map:mars': [45, 'Red planet map'],
  'map:twilight': [40, 'Twilight map'],
  'map:festival': [0, 'Lantern festival map', 'U'],
  'map:cosmos': [0, 'Cosmos map', 'U'],
  'decor:topiary': [30, 'Topiary'],
  'decor:sunflower': [30, 'Sunflowers'],
  'decor:tulip': [25, 'Tulips'],
  'decor:lavender': [30, 'Lavender'],
  'decor:haybale': [25, 'Hay bales'],
  'decor:snowfolk': [40, 'Snowballs'],
  'decor:lantern': [55, 'Lanterns'],
  'decor:birch': [25, 'Birches'],
  'decor:willow': [45, 'Willows'],
  'decor:bamboo': [35, 'Bamboo'],
  'decor:coral': [45, 'Coral'],
  'decor:shell': [30, 'Seashells'],
  'decor:pond': [35, 'Ponds'],
  'decor:parasol': [40, 'Parasols'],
  'decor:balloon': [50, 'Balloons'],
  'decor:cupcake': [55, 'Cupcakes'],
  'decor:lollipop': [45, 'Lollipops'],
  'decor:gumdrop': [35, 'Gumdrops'],
  'decor:cloud': [40, 'Clouds'],
  'decor:bubble': [35, 'Bubbles'],
  'decor:crater': [30, 'Craters'],
  'decor:orchard': [30, 'Fruit trees'],
  'decor:firefly': [0, 'Fireflies', 'U'],
  'decor:planet': [0, 'Planets', 'U'],
  'style:pebble': [25, 'Pebble panels'],
  'style:pillow': [30, 'Pillow panels'],
  'style:outline': [25, 'Accent outline panels'],
  'style:ribbon': [25, 'Top ribbon panels'],
  'style:tab': [25, 'Side tab panels'],
  'style:underline': [25, 'Underline panels'],
  'style:flat': [25, 'Flat panels'],
  'style:floating': [30, 'Floating panels'],
  'style:halo': [45, 'Halo panels'],
  'style:glow': [50, 'Accent glow panels'],
  'style:sticker': [40, 'Sticker panels'],
  'style:toy': [45, 'Toy block panels'],
  'style:bevel': [30, 'Bevelled panels'],
  'style:glossy': [35, 'Glossy panels'],
  'style:tinted': [30, 'Tinted panels'],
  'style:dusk': [35, 'Dusk fade panels'],
  'style:spotlight': [30, 'Spotlight panels'],
  'style:polka': [45, 'Polka dots panels'],
  'style:duotone': [55, 'Duotone panels'],
  'style:comic': [40, 'Comic panels'],
  'style:deep': [35, 'Deep shadow panels'],
  'style:fizzy': [45, 'Fizzy panels'],
  'style:roundsign': [35, 'Rounded sign panels'],
  'style:accentsign': [40, 'Accent sign panels'],
  'style:enamel': [50, 'Enamel sign panels'],
  'style:bubbleglass': [40, 'Bubble glass panels'],
  'style:tintglass': [45, 'Tinted glass panels'],
  'style:glassline': [35, 'Glass outline panels'],
  'style:iceglass': [55, 'Ice glass panels'],
  'style:frostglow': [60, 'Frosted glow panels'],
  'style:aurora': [0, 'Aurora panels panels', 'U'],
  'style:gilded': [0, 'Gilded panels', 'U'],
  'style:opal': [0, 'Opal glass panels', 'U']
});
for (const cat in DESIGNS) for (const k in DESIGNS[cat].items) { const [n, pr, cur, achId] = DESIGNS[cat].items[k]; if (pr || cur) COSMETICS['design:' + cat + ':' + k] = [pr, n + ' ' + DESIGNS[cat].one, cur || '#', achId]; }
Object.assign(DESIGNS.car.items, {season_bronze: ['Bronze season', 0, 'S'], season_silver: ['Silver season', 0, 'S'], season_gold: ['Gold season', 0, 'S'], season_platinum: ['Platinum season', 0, 'S'], season_diamond: ['Diamond season', 0, 'S']});
for (const k of ['season_bronze', 'season_silver', 'season_gold', 'season_platinum', 'season_diamond']) COSMETICS['design:car:' + k] = [0, DESIGNS.car.items[k][0] + ' car design', 'S'];
for (const k in BANNERS) COSMETICS['banner:' + k] = BANNERS[k][3] ? [BANNERS[k][1], BANNERS[k][0] + ' banner', BANNERS[k][3]] : [BANNERS[k][1], BANNERS[k][0] + ' banner'];
for (const k in FRAMES) COSMETICS['frame:' + k] = FRAMES[k][3] ? [FRAMES[k][1], FRAMES[k][0] + ' frame', FRAMES[k][3]] : [FRAMES[k][1], FRAMES[k][0] + ' frame'];
for (const k in TITLES) COSMETICS['title:' + k] = TITLES[k][2] ? [TITLES[k][1], TITLES[k][0] + ' title', TITLES[k][2], TITLES[k][3]] : [TITLES[k][1], TITLES[k][0] + ' title'];
for (const id in COSMETICS) { const c = COSMETICS[id]; if (!c[2] || c[2] === '#') c[0] = newPrice(c[0]); }
/* ---- seasonal events: a themed fortnight with its own designs, quests and news. Dates are month/day, local time. */
const EVENTS = [
  {id: 'halloween', name: 'Halloween', start: [10, 18], end: [10, 31], map: 'spooky', decor: 'pumpkin', items: ['design:car:ghost', 'design:store:batwing', 'decor:ghostlight', 'title:ghost'],
   tag: 'Event', title: 'Halloween in Junction', text: 'Ghost cars, bat-wing stores and ghost lights in the Store until October 31, plus three spooky quests.',
   quests: [['deliver', 300, 'Deliver 300 parcels on the Spooky map', {c: 120}, 'spooky'], ['build_light', 6, 'Light up 6 junctions in one city', {c: 150}], ['survive', 8, 'Survive to week 8 in the dark', {item: 'design:car:ghost'}]]}
];
function activeEvent(d) {
  const x = d || new Date(), m = x.getMonth() + 1, day = x.getDate();
  return EVENTS.find(e => (m > e.start[0] || (m === e.start[0] && day >= e.start[1])) && (m < e.end[0] || (m === e.end[0] && day <= e.end[1]))) || null;
}
const EVENT_ITEMS = new Set(EVENTS.flatMap(e => e.items));
const eventOf = id => EVENTS.find(e => e.items.includes(id));
const eventWhen = e => new Date(2000, e.start[0] - 1, e.start[1]).toLocaleDateString('en-US', {month: 'long', day: 'numeric'}) + '\u2013' + new Date(2000, e.end[0] - 1, e.end[1]).toLocaleDateString('en-US', {day: 'numeric'});
/* every library colour is its own item (standard #500-700, premium ones rare); the Unique group only comes from crates */
const COLOUR_PRICE = {}, UNIQUE_COLS = new Set();
for (const g of COLOR_LIBRARY) g.cols.forEach(([n, h, pr], i) => {
  if (g.unique) { COLOUR_PRICE[h] = 0; UNIQUE_COLS.add(h); return; }
  COLOUR_PRICE[h] = newPrice(pr || ({Standard: 25, Classic: 30, Soft: 30}[g.group] || [35, 40, 45][i % 3]));
});
const colourName = hex => LIB_NAME[hex] || hueName(hex);
const colourPrice = hex => hex in COLOUR_PRICE ? COLOUR_PRICE[hex] : 700;
let jb = {v: 4, bucks: 0, toward: 0, rbucks: 0, rtoward: 0, owned: {}, hired: {}, designs: {}, rot: null, daily: null, prof: {banner: '', frame: '', title: '', pins: []}, quests: null}, jbFirstRun = false, buyPending = null;
const design = cat => (jb.designs && DESIGNS[cat] && DESIGNS[cat].items[jb.designs[cat]]) ? jb.designs[cat] : 'standard';
const storeDesign = () => design('store');
function itemInfo(id) {                                // [price, name] for anything that can be bought
  if (id.startsWith('colour:')) { const h = id.slice(7); return [colourPrice(h), colourName(h).replace(/^./, c => c.toUpperCase()) + ' colour', UNIQUE_COLS.has(h) ? 'U' : '#']; }
  if (/^(banner|frame|title):$/.test(id)) return [0, 'Default', '#'];
  const c = COSMETICS[id]; return c ? [c[0], c[1], c[2] || '#', c[3]] : null;
}
const ownsColour = hex => { const id = 'colour:' + String(hex).toLowerCase(); return !!jb.owned[id] || (jb.hired[id] || 0) > Date.now(); };
const achName = id => { const a = ACH.find(x => x.id === id); return a ? a.name : id; };
/* achievement designs are yours the moment the achievement is */
const owns = id => {
  if (id.startsWith('colour:')) return ownsColour(id.slice(7));
  const c = COSMETICS[id]; if (!c) return true;
  if (c[2] === 'A') return !!(typeof ach !== 'undefined' && ach[c[3]]);
  if (c[2] === 'S') return !!jb.owned[id];
  return !!jb.owned[id];
};
const hiredLeft = id => Math.max(0, (jb.hired[id] || 0) - Date.now());
function saveShop() { try { localStorage.setItem(SHOP_KEY, JSON.stringify(jb)); } catch (e) {} shopDirty = true; }
let shopDirty = false;
setInterval(() => { if (shopDirty) { shopDirty = false; JEvents.emit('shop', {}); } }, 4000);
function cleanProf(p) {
  p = p && typeof p === 'object' ? p : {};
  return {banner: BANNERS[p.banner] ? p.banner : '', frame: FRAMES[p.frame] ? p.frame : '', title: TITLES[p.title] ? p.title : '', pins: Array.isArray(p.pins) ? p.pins.filter(id => ACH.some(a => a.id === id)).slice(0, 3) : []};
}
/* what's worth keeping with your account (B1): balances, what you own and wear, your streak, quests and profile look */
function shopSnapshot() {
  return {v: 4, bucks: jb.bucks, toward: jb.toward, rbucks: jb.rbucks, owned: Object.keys(jb.owned), hired: jb.hired, designs: jb.designs, streak: jb.streak || null, prof: jb.prof, quests: jb.quests || null};
}
/* merge what the account holds into this browser: the higher balance wins, owned items are the union, the longer streak stays */
function mergeShop(d) {
  if (!d || typeof d !== 'object') return false;
  let changed = false;
  for (const k of ['bucks', 'rbucks']) { const v = Math.max(0, Math.floor(+d[k] || 0)); if (v > jb[k]) { jb[k] = v; changed = true; } }
  if (jb.bucks === Math.floor(+d.bucks || 0) && +d.toward > (jb.toward || 0)) jb.toward = clamp(Math.floor(+d.toward), 0, PARCELS_PER_BUCK - 1);
  for (const id of Array.isArray(d.owned) ? d.owned : Object.keys(d.owned || {})) if ((COSMETICS[id] || /^colour:#[0-9a-f]{6}$/.test(id)) && !jb.owned[id]) { jb.owned[id] = 1; changed = true; }
  if (d.hired && typeof d.hired === 'object') for (const k in d.hired) if (/^colour:#[0-9a-f]{6}$/.test(k) && +d.hired[k] > (jb.hired[k] || 0) && +d.hired[k] > Date.now()) { jb.hired[k] = +d.hired[k]; changed = true; }
  if (d.designs && typeof d.designs === 'object') for (const c in DESIGNS) if (!jb.designs[c] && DESIGNS[c].items[d.designs[c]] && owns('design:' + c + ':' + d.designs[c])) { jb.designs[c] = d.designs[c]; changed = true; }
  if (d.streak && typeof d.streak === 'object' && (+d.streak.n || 0) > ((jb.streak && jb.streak.n) || 0)) { jb.streak = {last: String(d.streak.last || ''), n: Math.floor(+d.streak.n)}; checkDaily(); changed = true; }
  const p = cleanProf(d.prof); if ((!jb.prof.banner && p.banner) || (!jb.prof.frame && p.frame) || (!jb.prof.title && p.title) || (!jb.prof.pins.length && p.pins.length)) { jb.prof = {banner: jb.prof.banner || p.banner, frame: jb.prof.frame || p.frame, title: jb.prof.title || p.title, pins: jb.prof.pins.length ? jb.prof.pins : p.pins}; changed = true; }
  if (d.quests && typeof d.quests === 'object' && (!jb.quests || (d.quests.day === (jb.quests || {}).day && JSON.stringify(d.quests).length > JSON.stringify(jb.quests).length))) { jb.quests = d.quests; changed = true; }
  if (changed) { saveShop(); renderBucks(); renderLook(); renderStreak(); if (typeof applyProfLook === 'function') applyProfLook(); }
  return changed;
}
/* the profile look you wear */
const prof = () => jb.prof || cleanProf(null);
function setProf(o) { jb.prof = cleanProf(Object.assign({}, jb.prof, o)); saveShop(); applyProfLook(); renderLook(); JEvents.emit('prof', {}); }
function applyProfLook() { const el = $('acct-banner'); if (el) el.style.background = bannerCSS(prof().banner); }
const bannerCSS = k => BANNERS[k] ? BANNERS[k][2] : 'linear-gradient(120deg,rgba(255,255,255,.08),rgba(255,255,255,.02))';
const frameCSS = k => FRAMES[k] ? (FRAMES[k][2] === 'conic' ? 'conic-gradient(#ff4d4d,#ffd23a,#3fd16a,#2f9bff,#8a5bff,#ff4d4d)' : FRAMES[k][2]) : '';
const titleOf = k => TITLES[k] ? TITLES[k][0] : '';
/* achievements you can pin (the ones you have) */
const pinnable = () => ACH.filter(a => ach[a.id]).map(a => ({id: a.id, name: a.name, hint: a.hint}));
function loadShop() {
  let d = null; try { d = JSON.parse(localStorage.getItem(SHOP_KEY)); } catch (e) {}
  if (!d || typeof d !== 'object') { jbFirstRun = true; return; }
  jb.bucks = Math.max(0, Math.floor(+d.bucks || 0)); jb.toward = clamp(Math.floor(+d.toward || 0), 0, 9);
  jb.rbucks = Math.max(0, Math.floor(+d.rbucks || 0)); jb.rtoward = 0;
  const strs = a => Array.isArray(a) ? a.filter(x => typeof x === 'string') : [];
  if (d.rot && typeof d.rot === 'object') { const c = d.rot.crates || {}; jb.rot = {h: +d.rot.h || 0, n: +d.rot.n || 0, items: strs(d.rot.items), cols: strs(d.rot.cols), crates: {colour: +c.colour || 0, item: +c.item || 0, object: +c.object || 0}}; }
  if (d.daily && typeof d.daily === 'object') jb.daily = {d: +d.daily.d || 0, id: typeof d.daily.id === 'string' ? d.daily.id : ''};
  if (d.streak && typeof d.streak === 'object') jb.streak = {last: String(d.streak.last || ''), n: Math.max(0, Math.floor(+d.streak.n || 0))};
  jb.prof = cleanProf(d.prof);
  if (d.quests && typeof d.quests === 'object') jb.quests = d.quests;
  jb.owned = {}; const old = d.owned && typeof d.owned === 'object' ? d.owned : {};
  for (const k in old) if (COSMETICS[k] || /^colour:#[0-9a-f]{6}$/.test(k)) jb.owned[k] = 1;
  jb.hired = {}; if (d.hired && typeof d.hired === 'object') for (const k in d.hired) if (/^colour:#[0-9a-f]{6}$/.test(k) && +d.hired[k] > Date.now()) jb.hired[k] = +d.hired[k];
  jb.designs = {}; if (d.designs && typeof d.designs === 'object') for (const c in DESIGNS) if (DESIGNS[c].items[d.designs[c]]) jb.designs[c] = d.designs[c];
  if ((d.v || 0) < 2) {                              // the old "unlock a colour picker" purchases are refunded; colours in use stay yours
    const OLD = {'col:ui-plate': 40, 'col:ui-btn': 30, 'col:ui-accent': 30, 'col:land': 40, 'col:patch': 30, 'col:water': 35, 'col:road': 45, 'col:moto': 45, 'col:city': 50};
    let refund = 0; for (const k in OLD) if (old[k]) refund += OLD[k];
    jb.bucks += refund; jb.migrateColours = true; if (refund) jb.refunded = refund;
  }
  if ((d.v || 0) < 4) { jb.bucks = 0; jb.rbucks = 0; jb.toward = 0; jb.resetNote = true; }   // v1.13: credits reset for everyone, with new symbols (◎ and ✦)
  jb.v = 4;
}
/* the first time this version runs, anything already in use stays yours */
function grantInUse() {
  const give = id => { if (COSMETICS[id]) jb.owned[id] = 1; }, giveC = h => { if (hexOk(h)) jb.owned['colour:' + h.toLowerCase()] = 1; };
  const looks = [snapLook()].concat(['light', 'dark'].map(m => modes[m]).filter(Boolean));
  if (jbFirstRun) for (const L of looks) {
    give('ui:' + L.ui.preset); if (L.ui.style !== 'clean') give('style:' + L.ui.style); if (L.ui.frost) give('style:frost');
    give('map:' + L.map.theme); if (L.map.decor !== 'auto') give('decor:' + L.map.decor);
  }
  if (jbFirstRun || jb.migrateColours) {
    for (const L of looks) { for (const f of ['plate', 'btn', 'accent']) giveC(L.ui[f]); for (const f of ['land', 'patch', 'water', 'road', 'moto']) giveC(L.map[f]); }
    if (colorMode === 'custom') customHex.forEach(giveC);
  }
  if (jb.refunded) setTimeout(() => toast('Colours are now bought one at a time — your colour-picker unlocks were refunded: +◎' + jb.refunded, 'good'), 1500);
  delete jb.migrateColours; delete jb.refunded; jbFirstRun = false; saveShop();
}
function earnBucks(n, at) {
  jb.toward = (jb.toward || 0) + n; let got = 0;
  while (jb.toward >= PARCELS_PER_BUCK) { jb.toward -= PARCELS_PER_BUCK; got += BUCKS_EACH; }
  const rgot = diffKey === 'frantic' && !tutorialMode ? n * R_PER : 0;   // ✦ (rare bucks) only come from Frantic cities
  if (got) { jb.bucks += got; if (at) popText(bX(at), bY(at) - 38, '+' + got + ' ' + CUR, '#ffd23a'); bump('v-jb'); }
  if (rgot) { jb.rbucks += rgot; if (at) popText(bX(at), bY(at) - 52, '+' + rgot + ' ' + RCUR, '#d58cff'); }
  saveShop(); renderBucks();
}
function renderBucks() {
  const set = (id, t) => { const e = $(id); if (e && e.textContent !== t) e.textContent = t; };
  const b = CUR + jb.bucks.toLocaleString('en-US');
  const r = RCUR + jb.rbucks;
  const nx = jb.toward + '/' + PARCELS_PER_BUCK;
  set('mm-bucks', b); set('mm-rbucks', r); set('mm-next', nx); set('mm-store-bal', b + ' Junc Bucks · ' + r);
  set('v-jb', b); set('v-jbnext', r + ' · ' + nx); set('jb-bal', b + ' Junc Bucks · ' + r); set('jb-pill', b + ' · ' + r); set('cust-bal', b + ' · ' + r);
}
const fmtLeft = ms => { const m = Math.ceil(ms / 60000); return m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + 'm'; };
/* two taps: the first asks, the second spends. kind is 'buy' or 'hire' (colours only) */
function purchase(id, kind, fn) {
  const info = itemInfo(id); if (!info) return;
  const name = info[1];
  if (info[2] === 'A') { const a = ACH.find(x => x.id === info[3]); hint(name + ' can’t be bought — earn the “' + achName(info[3]) + '” achievement to unlock it' + (a ? ': ' + a.hint.toLowerCase() + '.' : '.')); return; }
  if (info[2] === 'C') { hint(name + ' is a campaign reward \u2014 finish its chapter in Campaign to unlock it.'); return; }
  if (info[2] === 'U') { hint(name + ' is unique — it only comes out of mystery crates in the Store.'); return; }
  if (info[2] === 'S') { hint(name + ' is a ranked season reward: finish a season in that division.'); return; }
  if (!inStock(id)) { hint(name + ' isn’t in the Store right now. The Store restocks every hour (new stock in ' + fmtLeft(HOUR_MS - Date.now() % HOUR_MS) + ')' + (info[2] === 'R' ? ' and has one special item a day.' : '.') + ' Crates can have it too.'); buyPending = null; renderLook(); return; }
  const price = kind === 'hire' ? HIRE_PRICE : info[0], rare = kind !== 'hire' && info[2] === 'R';
  const sym = rare ? RCUR : CUR, have = rare ? jb.rbucks : jb.bucks;
  if (have < price) {
    hint(name + (kind === 'hire' ? ' costs ◎' + HIRE_PRICE + ' to hire' : ' costs ' + sym + price) + ' — you have ' + sym + have + '. ' +
      (rare ? '✦ (rare bucks) only come from Frantic cities: one for every parcel.' : 'You earn ' + BUCKS_EACH + ' ◎ for every ' + PARCELS_PER_BUCK + ' parcels delivered.'));
    buyPending = null; renderLook(); return;
  }
  const nowMs = performance.now();
  if (!buyPending || buyPending.id !== id || buyPending.kind !== kind || nowMs - buyPending.t > 4000) {
    buyPending = {id, kind, t: nowMs};
    hint((kind === 'hire' ? 'Hire ' + name + ' for 3 hours for ◎' + HIRE_PRICE : 'Buy ' + name + ' for ' + sym + price) + '? Tap again to confirm.');
    renderLook();
    setTimeout(() => { if (buyPending && buyPending.id === id && performance.now() - buyPending.t >= 4000) { buyPending = null; renderLook(); } }, 4100);
    return;
  }
  buyPending = null; if (rare) jb.rbucks -= price; else jb.bucks -= price;
  if (kind === 'hire') { jb.hired[id] = Math.max(Date.now(), jb.hired[id] || 0) + HIRE_MS; toast('Hired ' + name + ' for 3 hours (◎' + HIRE_PRICE + ')', 'good'); }
  else { jb.owned[id] = 1; delete jb.hired[id]; toast('Bought ' + name + ' for ' + sym + price, 'good'); }
  saveShop(); sfx('upgrade'); renderBucks(); if (fn) fn(); renderLook(); questEvent('store', 1);
}
/* buy-then-run, used where an item is picked directly (it simply runs if you already own it) */
function buyThen(id, fn) { if (!id || owns(id)) { fn(); return; } purchase(id, 'buy', fn); }
/* when a hired colour runs out, anything wearing it goes back to its default */
function checkHires() {
  let gone = [];
  for (const id in jb.hired) if (jb.hired[id] <= Date.now()) { gone.push(id); delete jb.hired[id]; }
  if (!gone.length) return;
  saveShop();
  const bad = h => h && !ownsColour(h), ui = {}, map = {};
  for (const f of ['plate', 'btn', 'accent']) if (bad(uiTheme[f])) ui[f] = '';
  for (const f of ['land', 'patch', 'water', 'road', 'moto']) if (bad(mapPrefs[f])) map[f] = '';
  if (Object.keys(ui).length) setUi(ui);
  if (Object.keys(map).length) setMap(map);
  if (colorMode === 'custom' && customHex.some(bad)) { customHex = customHex.map((h, i) => bad(h) ? PALETTES.standard.cols[i][1] : h); applyPalette(); savePrefs(); renderPaletteUI(); }
  toast('Your hired colour' + (gone.length > 1 ? 's have' : ' has') + ' run out — buy it in the Store to keep it.', 'warn');
  renderLook();
}
setInterval(() => { if (typeof jb !== 'undefined') { checkHires(); if (!$('menu').hidden || !$('cust-panel').hidden || (!$('m-start').hidden && mmPane === 'store')) renderLook(true); } }, 15000);

/* ---- the daily reward: the first open each day earns coins that grow with the streak; day 7 adds a free Object crate */
const DAILY_REWARDS = [20, 30, 40, 50, 75, 100, 150];
const dayStamp = d => { const x = d || new Date(); return x.getFullYear() + '-' + (x.getMonth() + 1) + '-' + x.getDate(); };
let dailyPending = null;
function checkDaily() {
  const st = jb.streak || {last: '', n: 0}, today = dayStamp(), y = new Date(); y.setDate(y.getDate() - 1);
  if (st.last === today) { dailyPending = null; renderStreak(); return; }
  dailyPending = {n: st.last === dayStamp(y) ? st.n + 1 : 1};
  renderStreak();
}
const streakDay = n => ((Math.max(1, n) - 1) % 7) + 1;           // 1..7, cycling
function renderStreak() {
  const el = $('mm-streak'); if (!el) return;
  const st = jb.streak || {last: '', n: 0}, n = dailyPending ? dailyPending.n : st.n, day = n ? streakDay(n) : 0;
  el.classList.toggle('due', !!dailyPending);
  el.innerHTML = '<small>' + (dailyPending ? 'Daily reward ready' : n ? 'Day ' + day + ' of 7 \u00b7 ' + n + ' day streak' : 'Daily reward') + '</small><span class="pips">' +
    [1, 2, 3, 4, 5, 6, 7].map(i => '<i class="' + (i < day || (i === day && !dailyPending) ? 'd' : i === day ? 'a' : '') + (i === 7 ? ' crate' : '') + '" title="' + (i === 7 ? 'Object crate + \u25ce150' : '\u25ce' + DAILY_REWARDS[i - 1]) + '"></i>').join('') + '</span>';
}
function openDaily() {
  if (!dailyPending) return;
  const n = dailyPending.n, day = streakDay(n), coins = DAILY_REWARDS[day - 1];
  $('daily-title').textContent = n > 1 ? 'Day ' + day + ' \u2014 ' + n + ' days running!' : 'Welcome back!';
  $('daily-sub').textContent = 'Today: \u25ce' + coins + (day === 7 ? ' and a free Object crate' : '') + '. Come back tomorrow for day ' + (day % 7 + 1) + '.';
  $('daily-strip').innerHTML = [1, 2, 3, 4, 5, 6, 7].map(i => '<div class="dd' + (i < day ? ' d' : i === day ? ' a' : '') + '"><b>' + (i === 7 ? '\ud83c\udf81' : '\u25ce' + DAILY_REWARDS[i - 1]) + '</b><span>Day ' + i + '</span></div>').join('');
  $('daily-got').hidden = true; $('daily-claim').hidden = false; $('daily-claim').disabled = false;
  openModal('m-daily');
}
function claimDaily() {
  if (!dailyPending) return;
  const n = dailyPending.n, day = streakDay(n), coins = DAILY_REWARDS[day - 1];
  jb.bucks += coins; jb.streak = {last: dayStamp(), n}; dailyPending = null; saveShop(); renderBucks(); renderStreak();
  sfx('claim'); haptic('claim'); confetti();
  $('daily-claim').hidden = true;
  const got = $('daily-got'); got.hidden = false; got.innerHTML = '<b>+\u25ce' + coins + '</b>' + (day === 7 ? '<span>and your Object crate\u2026</span>' : '<span>See you tomorrow</span>');
  setTimeout(() => { closeModal('m-daily'); if (day === 7) openCrate('object', true, true); }, day === 7 ? 1300 : 1600);
}
/* a little celebration: paper falling over the screen */
function confetti() {
  const box = $('confetti'); if (!box || REDUCED_MOTION) return;
  const cols = ['#ffc933', '#43d17a', '#2f7de1', '#ff6fb5', '#8a5bd6', '#ff8a3c'];
  for (let i = 0; i < 48; i++) { const p = document.createElement('i'); p.style.cssText = 'left:' + (Math.random() * 100) + '%;background:' + cols[i % cols.length] + ';animation-delay:' + (Math.random() * 0.5) + 's;animation-duration:' + (1.3 + Math.random() * 0.9) + 's;transform:rotate(' + (Math.random() * 360) + 'deg)'; box.append(p); }
  setTimeout(() => { box.innerHTML = ''; }, 2600);
}
/* ---- quests (B2): three a day and three a week, picked from the date like the Store, with one free reroll a day.
   Progress is kept with the shop data (so it syncs with the account). Rewards are coins, stars or a crate. */
const QUEST_TYPES = {
  deliver:     {text: (n, m) => 'Deliver ' + n + ' parcels' + (m ? ' in ' + DIFFS[m].label : ''), daily: [60, 100, 150], weekly: [500, 800, 1200], modes: ['', '', 'chill', 'standard', 'frantic', 'zen']},
  trips:       {text: n => 'Make ' + n + ' trips', daily: [40, 60], weekly: [300, 500]},
  build_round: {text: n => 'Build ' + n + ' roundabouts in one city', daily: [2, 3], weekly: [5, 7], city: true},
  build_light: {text: n => 'Place ' + n + ' traffic lights in one city', daily: [2, 3], weekly: [5, 7], city: true},
  build_moto:  {text: n => 'Build ' + n + ' motorway' + (n === 1 ? '' : 's') + ' in one city', daily: [1, 2], weekly: [3, 4], city: true},
  survive:     {text: (n, m) => 'Survive to week ' + n + (m ? ' in ' + DIFFS[m].label : ''), daily: [4, 5, 6], weekly: [8, 10, 12], city: true, modes: ['', '', 'standard', 'frantic']},
  earn:        {text: n => 'Earn $' + n.toLocaleString('en-US') + ' in one city', daily: [1500, 2500], weekly: [6000, 10000], city: true},
  iso_win:     {text: n => 'Win ' + (n === 1 ? 'an ISO 1v1 match' : n + ' ISO 1v1 matches'), daily: [1], weekly: [2, 3]},
  crate:       {text: n => 'Open ' + (n === 1 ? 'a mystery crate' : n + ' mystery crates'), daily: [1], weekly: [3]},
  store:       {text: n => 'Buy ' + (n === 1 ? 'something' : n + ' things') + ' in the Store', daily: [1], weekly: [2]}
};
const Q_REWARDS = {daily: [{c: 40}, {c: 60}, {c: 80}, {s: 3}, {crate: 'colour'}], weekly: [{c: 150}, {c: 220}, {c: 300}, {s: 8}, {crate: 'item'}, {crate: 'object'}]};
const isoWeekKey = () => isoWeek(new Date()).key;
function makeQuest(kind, seed, used) {
  const r = seededRand(seed), types = Object.keys(QUEST_TYPES).filter(t => !used.includes(t));
  const t = types[Math.floor(r() * types.length)], T = QUEST_TYPES[t], n = T[kind][Math.floor(r() * T[kind].length)];
  const m = T.modes ? T.modes[Math.floor(r() * T.modes.length)] : '', rw = Q_REWARDS[kind][Math.floor(r() * Q_REWARDS[kind].length)];
  return {id: kind + ':' + t + ':' + n + ':' + (m || '-') + ':' + (seed >>> 0).toString(36), kind, type: t, n, mode: m, reward: rw, p: 0, done: false, claimed: false};
}
function ensureQuests() {
  const day = dayStamp(), wk = isoWeekKey(), dn = Math.floor(Date.now() / DAY_MS), wn = strHash(wk);
  let q = jb.quests && typeof jb.quests === 'object' ? jb.quests : null, dirty = false;
  if (!q) { q = {day: '', week: '', daily: [], weekly: [], event: [], rerollDay: ''}; dirty = true; }
  if (q.week !== wk) { q.week = wk; q.weekly = []; const used = []; for (let i = 0; i < 3; i++) { const x = makeQuest('weekly', wn + i * 13, used); used.push(x.type); q.weekly.push(x); } dirty = true; }
  if (q.day !== day) { q.day = day; q.daily = []; const used = q.weekly.map(x => x.type); for (let i = 0; i < 3; i++) { const x = makeQuest('daily', dn * 31 + i * 7, used); used.push(x.type); q.daily.push(x); } dirty = true; }
  const ev = activeEvent(), evId = ev ? ev.id + '-' + new Date().getFullYear() : '';
  if ((q.eventId || '') !== evId) { q.eventId = evId; q.event = ev ? ev.quests.map(([t, n, text, reward, map], i) => ({id: 'event:' + evId + ':' + i, kind: 'event', type: t, n, text, mode: '', map: map || '', reward, p: 0, done: false, claimed: false})) : []; dirty = true; }
  jb.quests = q; if (dirty) saveShop();
  return q;
}
const questText = x => x.text || QUEST_TYPES[x.type].text(x.n, x.mode);
const qRewardText = rw => rw.c ? CUR + rw.c : rw.s ? RCUR + rw.s : rw.item ? (COSMETICS[rw.item] ? COSMETICS[rw.item][1] : 'a design') : CRATES[rw.crate].name;
let cityQ = {round: 0, light: 0, moto: 0};              // what this city has built, for the "in one city" quests
const questsActive = () => started && !over && !tutorialMode && !spectating && !demoMode && diffKey !== 'iso';
/* something happened: type is deliver | trips | build_round | build_light | build_moto | survive | earn | iso_win | crate | store */
function questEvent(type, amount, mode) {
  if (typeof jb === 'undefined' || !jb) return;
  const q = ensureQuests(); let changed = false, finished = [];
  const inCity = ['build_round', 'build_light', 'build_moto', 'survive', 'earn'].includes(type);
  for (const x of q.daily.concat(q.weekly, q.event)) {
    if (x.done || x.type !== type) continue;
    if (x.mode && x.mode !== (mode || diffKey)) continue;
    if (x.map && mapPrefs.theme !== x.map) continue;
    const np = inCity ? Math.max(x.p, amount) : x.p + amount;
    if (np === x.p) continue;
    x.p = Math.min(np, x.n); changed = true;
    if (x.p >= x.n) { x.done = true; finished.push(x); }
  }
  if (changed) saveShop();
  for (const x of finished) { toast('Quest complete: ' + questText(x) + ' \u2014 claim ' + qRewardText(x.reward) + ' in Quests', 'good'); sfx('claim'); }
  if (finished.length) renderQuestBadge();
  if (changed && mmPane === 'quests') renderQuests();
}
function claimQuest(id) {
  const q = ensureQuests(), x = q.daily.concat(q.weekly, q.event).find(y => y.id === id);
  if (!x || !x.done || x.claimed) return;
  x.claimed = true; const rw = x.reward;
  if (rw.c) jb.bucks += rw.c; if (rw.s) jb.rbucks += rw.s; if (rw.item && COSMETICS[rw.item]) jb.owned[rw.item] = 1;
  saveShop(); renderBucks(); sfx('claim'); haptic('claim'); confetti();
  toast('Claimed ' + qRewardText(rw), 'good');
  renderQuests(); renderQuestBadge();
  if (rw.crate) setTimeout(() => openCrate(rw.crate, true, true), 350);
}
function rerollQuest(id) {
  const q = ensureQuests();
  if (q.rerollDay === dayStamp()) { hint('You\u2019ve used today\u2019s free reroll. Another tomorrow.'); return; }
  for (const list of [q.daily, q.weekly]) {
    const i = list.findIndex(x => x.id === id); if (i < 0) continue;
    if (list[i].done) { hint('That one\u2019s already done.'); return; }
    const used = list.map(x => x.type); list[i] = makeQuest(list[i].kind, (Date.now() + i * 977) >>> 0, used);
    q.rerollDay = dayStamp(); saveShop(); renderQuests(); toast('New quest: ' + questText(list[i]), 'good'); return;
  }
}
const questClaimable = () => { const q = ensureQuests(); return q.daily.concat(q.weekly, q.event).filter(x => x.done && !x.claimed).length; };
function renderQuestBadge() { const n = questClaimable(); document.querySelectorAll('.q-badge').forEach(el => { el.textContent = n; el.hidden = !n; }); }
function renderQuests() {
  const box = $('mm-quests'); if (!box) return;
  const q = ensureQuests(), now = Date.now();
  const left = ms => { const h = Math.floor(ms / 36e5), d = Math.floor(h / 24); return d >= 1 ? d + 'd ' + (h % 24) + 'h' : h >= 1 ? h + 'h ' + Math.floor(ms % 36e5 / 6e4) + 'm' : Math.max(1, Math.floor(ms / 6e4)) + 'm'; };
  const dayLeft = DAY_MS - (now - new Date(new Date().toDateString()).getTime());
  const wkEnd = isoWeek(new Date()).sun; const weekLeft = new Date(wkEnd.getUTCFullYear(), wkEnd.getUTCMonth(), wkEnd.getUTCDate() + 1).getTime() - now;
  const row = x => '<div class="q-row' + (x.done ? (x.claimed ? ' claimed' : ' done') : '') + '"><div class="q-t"><b>' + questText(x) + '</b><small>' + (x.claimed ? 'Claimed' : x.done ? 'Complete!' : x.p.toLocaleString('en-US') + ' / ' + x.n.toLocaleString('en-US')) + '</small>' +
    '<span class="q-bar"><i style="width:' + Math.round(Math.min(1, x.p / x.n) * 100) + '%"></i></span></div><div class="q-r"><em class="q-reward">' + qRewardText(x.reward) + '</em>' +
    (x.done && !x.claimed ? '<button class="bigbtn" type="button" data-qclaim="' + x.id + '">Claim</button>' : x.claimed ? '<span class="q-tick">\u2713</span>' : x.kind !== 'event' ? '<button class="act small" type="button" data-qreroll="' + x.id + '" title="Swap for another">\u21bb</button>' : '') + '</div></div>';
  const ev = activeEvent();
  box.innerHTML = '<p class="mini">Quests reward \u25ce coins, \u2726 stars and crates. One free reroll a day' + (q.rerollDay === dayStamp() ? ' (used today)' : '') + '.</p>' +
    (ev && q.event.length ? '<h3 class="q-h ev">' + ev.name + ' <small>' + eventWhen(ev) + '</small></h3>' + q.event.map(row).join('') : '') +
    '<h3 class="q-h">Daily <small>new in ' + left(dayLeft) + '</small></h3>' + q.daily.map(row).join('') +
    '<h3 class="q-h">Weekly <small>new in ' + left(weekLeft) + '</small></h3>' + q.weekly.map(row).join('');
  box.querySelectorAll('[data-qclaim]').forEach(b => b.onclick = () => claimQuest(b.dataset.qclaim));
  box.querySelectorAll('[data-qreroll]').forEach(b => b.onclick = () => rerollQuest(b.dataset.qreroll));
  renderQuestBadge();
}
/* ---- the hourly Store: 6 items and 6 colours every hour, one special item (✦) a day, and three mystery crates.
   Each hour's stock is shuffled from the hour itself, so everyone's Store is alike, with things you don't own first. */
const HOUR_MS = 3600e3, DAY_MS = 86400e3;
const RARITY = {standard: 'Standard', rare: 'Rare', unique: 'Unique', special: 'Special', ach: 'Achievement', camp: 'Campaign'};
function rarityOf(id) { const i = itemInfo(id); if (!i) return 'standard'; return i[2] === 'C' ? 'camp' : i[2] === 'A' || i[2] === 'S' ? 'ach' : i[2] === 'R' ? 'special' : i[2] === 'U' ? 'unique' : i[0] >= 750 ? 'rare' : 'standard'; }
const CRATES = {
  colour: {name: 'Colour crate', price: 150, holds: 'a colour', test: id => id.startsWith('colour:')},
  item:   {name: 'Item crate', price: 200, holds: 'a theme, map, panel style, decoration, banner, frame or title', test: id => /^(ui|style|map|decor|banner|frame|title):/.test(id)},
  object: {name: 'Object crate', price: 250, holds: 'a design for cars, houses, roads, stores, lights, roundabouts, bridges, motorways or drones', test: id => id.startsWith('design:')}
};
const CRATE_MAX = 3, CRATE_ODDS = [['standard', 70], ['rare', 25], ['unique', 5]];
const allShopIds = () => Object.keys(COSMETICS).concat(Object.keys(COLOUR_PRICE).map(h => 'colour:' + h));
function shuffleSeeded(arr, seed) { const r = seededRand(seed), a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function ensureRotation() {
  const h = Math.floor(Date.now() / HOUR_MS), d = Math.floor(Date.now() / DAY_MS);
  let dirty = false;
  if (!jb.rot || jb.rot.h !== h || jb.rot.n !== 6) {
    const pool = allShopIds().filter(id => (rarityOf(id) === 'standard' || rarityOf(id) === 'rare') && !EVENT_ITEMS.has(id));
    const pick = (list, n, salt) => { const q = shuffleSeeded(list, h * 7919 + salt); return q.filter(id => !owns(id)).concat(q.filter(id => owns(id))).slice(0, n); };
    jb.rot = {h, n: 6, items: pick(pool.filter(id => !id.startsWith('colour:')), 6, 1), cols: pick(pool.filter(id => id.startsWith('colour:')), 6, 2),
              crates: jb.rot && jb.rot.h === h ? jb.rot.crates : {colour: 0, item: 0, object: 0}};
    dirty = true;
  }
  if (!jb.daily || jb.daily.d !== d) {
    const q = shuffleSeeded(allShopIds().filter(id => rarityOf(id) === 'special'), d * 104729 + 3);
    jb.daily = {d, id: q.find(id => !owns(id)) || q[0] || ''}; dirty = true;
  }
  if (dirty) saveShop();
}
function inStock(id) { ensureRotation(); if (EVENT_ITEMS.has(id)) { const e = eventOf(id); return !!(e && activeEvent() === e); } return jb.rot.items.includes(id) || jb.rot.cols.includes(id) || jb.daily.id === id; }
const crateLeft = kind => { ensureRotation(); return Math.max(0, CRATE_MAX - (jb.rot.crates[kind] || 0)); };
const crateNew = kind => allShopIds().filter(id => CRATES[kind].test(id) && ['standard', 'rare', 'unique'].includes(rarityOf(id)) && !owns(id) && (!EVENT_ITEMS.has(id) || activeEvent() === eventOf(id)));
/* two taps (like buying), then the crate shakes open and shows what was inside */
let crateKind = '', crateGot = '';
function openCrate(kind, sure, free) {
  const C = CRATES[kind]; if (!C) return;
  if (!free && !crateLeft(kind)) { hint('You’ve opened ' + CRATE_MAX + ' ' + C.name.toLowerCase() + 's this hour. More in ' + fmtLeft(HOUR_MS - Date.now() % HOUR_MS) + '.'); return false; }
  const left = crateNew(kind);
  if (!left.length) { hint('You already own everything a ' + C.name.toLowerCase() + ' can hold.'); return false; }
  if (!free && jb.bucks < C.price) { hint(C.name + 's cost ◎' + C.price + ' — you have ◎' + jb.bucks + '. You earn ' + BUCKS_EACH + ' ◎ for every ' + PARCELS_PER_BUCK + ' parcels delivered.'); return false; }
  const nowMs = performance.now(), pid = 'crate:' + kind;
  if (!sure && (!buyPending || buyPending.id !== pid || nowMs - buyPending.t > 4000)) {
    buyPending = {id: pid, kind: 'buy', t: nowMs}; hint('Open a ' + C.name.toLowerCase() + ' for ◎' + C.price + '? Tap again to confirm.'); renderLook();
    setTimeout(() => { if (buyPending && buyPending.id === pid && performance.now() - buyPending.t >= 4000) { buyPending = null; renderLook(); } }, 4100);
    return false;
  }
  buyPending = null;
  let roll = Math.random() * 100, tier = 'standard';
  for (const [t, w] of CRATE_ODDS) { if (roll < w) { tier = t; break; } roll -= w; }
  let got = '';
  for (const t of [tier, 'rare', 'standard', 'unique']) { const l = left.filter(id => rarityOf(id) === t); if (l.length) { got = l[Math.floor(Math.random() * l.length)]; break; } }
  if (!free) { jb.bucks -= C.price; jb.rot.crates[kind] = (jb.rot.crates[kind] || 0) + 1; }
  jb.owned[got] = 1; delete jb.hired[got];
  saveShop(); renderBucks(); renderLook(); showCrate(kind, got); questEvent('crate', 1);
  return true;
}
function showCrate(kind, id) {
  crateKind = kind; crateGot = id; haptic('crate');
  const m = $('m-crate'), box = $('crate-box'), prize = $('crate-prize'), r = rarityOf(id), info = itemInfo(id);
  m.querySelector('.crate-card').className = 'card plate crate-card k-' + kind;
  box.hidden = false; prize.hidden = true; box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
  $('crate-name').textContent = 'Opening a ' + CRATES[kind].name.toLowerCase() + '…'; $('crate-rar').textContent = '';
  for (const b of ['crate-use', 'crate-again']) $(b).hidden = true;
  openModal('m-crate'); sfx('click');
  setTimeout(() => {
    if ($('m-crate').hidden || crateGot !== id) return;
    box.hidden = true; prize.hidden = false; prize.innerHTML = '';
    m.querySelector('.crate-card').classList.add('r-' + r, 'open');
    if (id.startsWith('colour:')) prize.innerHTML = '<span class="csw" style="background:' + id.slice(7) + '"></span>';
    else {
      const it = shopItemById(id);
      if (it && it.html) prize.innerHTML = it.html;
      else if (it && it.canvas) { const c = document.createElement('canvas'); c.width = it.canvas[0]; c.height = it.canvas[1]; prize.append(c); it.canvas[2](c); }
    }
    $('crate-rar').textContent = RARITY[r]; $('crate-rar').className = 'rar r-' + r;
    $('crate-name').textContent = info ? info[1] : id;
    const it = shopItemById(id);
    $('crate-use').hidden = !(it && it.apply);
    const more = crateLeft(kind) && crateNew(kind).length && jb.bucks >= CRATES[kind].price;
    $('crate-again').hidden = !more; $('crate-again').textContent = 'Open another · ◎' + CRATES[kind].price + ' (' + crateLeft(kind) + ' left this hour)';
    sfx('upgrade');
  }, REDUCED_MOTION ? 200 : 1300);
}
function shopItemById(id) {
  if (id.startsWith('colour:')) return null;
  if (!COSMETICS[id]) return null;
  const cat = id.startsWith('design:') ? id.split(':')[1] : id.split(':')[0];
  return shopItems(cat).find(x => x.id === id) || null;
}
function bindCrates() {
  $('crate-done').addEventListener('click', () => closeModal('m-crate'));
  $('crate-use').addEventListener('click', () => { const it = shopItemById(crateGot); if (it && it.apply) it.apply(); closeModal('m-crate'); renderLook(); });
  $('crate-again').addEventListener('click', () => openCrate(crateKind, true));
}
/* the Collection: every look, design and colour, with what you own and how to get the rest. Each group draws its
   previews only when it's opened. Used on the main menu (Customise) and in Account. */
function collIds(cat) { return cat === 'colour' ? Object.keys(COLOUR_PRICE).map(h => 'colour:' + h) : shopItems(cat).map(it => it.id); }
function howToGet(id) {
  const i = itemInfo(id); if (!i) return 'Free';
  if (owns(id)) return 'Owned';
  if (i[2] === 'A') return '🏆 ' + achName(i[3]);
  if (i[2] === 'S') return 'Ranked season reward';
  if (EVENT_ITEMS.has(id)) { const e = eventOf(id); return e.name + ' event · ' + eventWhen(e) + (activeEvent() === e ? ' · in the Store now' : ''); }
  if (i[2] === 'C') return 'Campaign reward';
  if (i[2] === 'U') return 'Crates only';
  if (i[2] === 'R') return 'Daily special \u00b7 ✦' + i[0];
  return (inStock(id) ? 'In the Store now \u00b7 ' + CUR : 'Store or crates \u00b7 ' + CUR) + i[0];
}
function renderCollection(box) {
  if (!box) return;
  ensureRotation();
  let own = 0, all = 0;
  const groups = SHOP_CATS.map(([cat, label]) => { const ids = collIds(cat), n = ids.filter(owns).length; own += n; all += ids.length; return [cat, label, ids, n]; });
  const open = box._open || {};
  box.innerHTML = '<div class="coll-top"><b>' + own + ' of ' + all + ' collected</b><span class="tut-track"><i style="width:' + Math.round(own / all * 100) + '%"></i></span></div>' +
    '<p class="mini">Everything in Junction. Things you own are in colour; the rest show how to get them. Tap an owned item to use it.</p>' +
    groups.map(([cat, label, ids, n]) => '<details class="coll-g" data-cat="' + cat + '"' + (open[cat] ? ' open' : '') + '><summary><b>' + label + '</b><span>' + n + ' / ' + ids.length + '</span><i style="--p:' + Math.round(n / ids.length * 100) + '%"></i></summary><div class="coll-grid"></div></details>').join('');
  const fill = det => {
    const cat = det.dataset.cat, grid = det.querySelector('.coll-grid'); if (grid.childElementCount) return;
    const items = cat === 'colour' ? null : shopItems(cat);
    grid.innerHTML = collIds(cat).map((id, i) => {
      const r = rarityOf(id), o = owns(id), info = itemInfo(id), name = cat === 'colour' ? colourName(id.slice(7)) : items[i].name;
      const pv = cat === 'colour' ? '<span class="csw" style="background:' + id.slice(7) + '"></span>' : items[i].html || '<canvas data-i="' + i + '"></canvas>';
      return '<div class="coll-i r-' + r + (o ? ' own' : ' lock') + '" data-id="' + id + '"' + (o && cat !== 'colour' ? ' role="button" tabindex="0"' : '') + '>' + pv + '<b>' + name + '</b>' +
        (info ? '<em class="rar r-' + r + '">' + RARITY[r] + '</em>' : '') + '<small>' + howToGet(id) + '</small></div>';
    }).join('');
    grid.querySelectorAll('canvas[data-i]').forEach(c => { const it = items[+c.dataset.i]; c.width = it.canvas[0]; c.height = it.canvas[1]; it.canvas[2](c); });
  };
  box.querySelectorAll('details').forEach(det => { if (det.open) fill(det); det.addEventListener('toggle', () => { open[det.dataset.cat] = det.open; box._open = open; if (det.open) fill(det); }); });
  box.onclick = e => { const el = e.target.closest('.coll-i.own'); if (!el || el.dataset.id.startsWith('colour:')) return; const it = shopItemById(el.dataset.id); if (it && it.apply) { it.apply(); hint(it.name + ' is on.'); } };
}
/* the Store page: crates, the daily special, this hour's items and colours */
function storeCard(it, canvases) {
  const r = rarityOf(it.id), own = owns(it.id), info = itemInfo(it.id);
  const pv = it.html || '<canvas data-ci="' + (canvases.push([it.canvas, it.id]) - 1) + '"></canvas>';
  return '<button type="button" class="shopcard st-card r-' + r + (own ? ' owned' : '') + '" data-act="' + (own ? 'apply' : 'buy') + '" data-id="' + it.id + '">' + pv +
    '<em class="rar r-' + r + '">' + RARITY[r] + '</em><b>' + info[1].replace(/ design$/, '') + '</b>' + (own ? '<span class="using">Owned' + (it.active ? ' · in use' : '') + '</span>' : priceTag(it.id, info[0])) + '</button>';
}
function renderStore(box, light) {
  ensureRotation();
  const keepScroll = box.scrollTop, canvases = [], now = Date.now();
  const tLeft = fmtLeft(HOUR_MS - now % HOUR_MS), dLeft = fmtLeft(DAY_MS - now % DAY_MS);
  const parts = ['<div class="st-head"><div><b>New stock in ' + tLeft + '</b><small>Every hour: 6 items, 6 colours and 3 of each crate. ' + BUCKS_EACH + ' ◎ for every ' + PARCELS_PER_BUCK + ' parcels.</small></div><span class="st-bal num">' + CUR + jb.bucks.toLocaleString('en-US') + ' <i>·</i> <span class="rtag">✦' + jb.rbucks + '</span></span></div>'];
  if (jb.resetNote) { parts.push('<p class="mnote st-note">New credits! Everyone\u2019s balance started again from zero with new symbols: ◎ coins (2 for every 3 parcels) and ✦ stars (1 for every parcel in Frantic cities). Everything you own is still yours.</p>'); delete jb.resetNote; saveShop(); }
  parts.push('<h3 class="shop-h">Mystery crates <small>' + CRATE_MAX + ' of each per hour · 70% standard · 25% rare · 5% unique · never something you own</small></h3><div class="crates">' +
    Object.keys(CRATES).map(k => {
      const C = CRATES[k], n = crateLeft(k), none = !crateNew(k).length, conf = buyPending && buyPending.id === 'crate:' + k;
      return '<button type="button" class="crate-s k-' + k + (n && !none ? '' : ' spent') + '" data-act="crate" data-kind="' + k + '"><span class="crate-ico"><i></i></span><b>' + C.name + '</b><small>' + C.holds + '</small>' +
        '<span class="crate-foot"><span class="lock' + (conf ? ' confirm' : '') + '">' + (conf ? 'Tap to open' : CUR + C.price) + '</span><em>' + (none ? 'All owned' : n + ' of ' + CRATE_MAX + ' left') + '</em></span></button>';
    }).join('') + '</div>');
  const ev = activeEvent();
  if (ev) parts.push('<h3 class="shop-h ev-h">' + ev.name + ' event <small>until ' + eventWhen(ev).split('–')[0].split(' ')[0] + ' ' + ev.end[1] + ' · these are only sold during the event</small></h3><div class="shopgrid st-items">' + ev.items.map(shopItemById).filter(Boolean).map(it => storeCard(it, canvases)).join('') + '</div>');
  const sp = jb.daily.id && shopItemById(jb.daily.id);
  if (sp) parts.push('<h3 class="shop-h">Daily special <small>costs ✦, from Frantic cities · a new one in ' + dLeft + '</small></h3><div class="shopgrid st-items st-special">' + storeCard(sp, canvases) + '</div>');
  parts.push('<h3 class="shop-h">This hour’s items</h3><div class="shopgrid st-items">' + jb.rot.items.map(shopItemById).filter(Boolean).map(it => storeCard(it, canvases)).join('') + '</div>');
  parts.push('<h3 class="shop-h">This hour’s colours <small>buy to keep, or hire for 3 hours for ◎' + HIRE_PRICE + '</small></h3><div class="shopgrid colours">' + jb.rot.cols.map(id => {
    const h = id.slice(7), r = rarityOf(id), left = hiredLeft(id), own = !!jb.owned[id], name = colourName(h);
    return '<div class="colcard st-col r-' + r + '"><span class="csw" style="background:' + h + '"></span><em class="rar r-' + r + '">' + RARITY[r] + '</em><b>' + name + '</b>' + (left && !own ? '<small class="hired">Hired · ' + fmtLeft(left) + ' left</small>' : '') +
      (own ? '<span class="using">Owned</span>' : '<span class="colbtns"><button type="button" data-act="buy" data-id="' + id + '">' + priceTag(id, colourPrice(h)) + '</button><button type="button" data-act="hire" data-id="' + id + '">' + priceTag(id, colourPrice(h), 'hire') + '</button></span>') + '</div>';
  }).join('') + '</div>');
  parts.push('<p class="mnote">Standard items cost ◎500–700 and rare ones ◎750–1000. Unique items only come out of crates. 🏆 items still unlock with achievements.</p>');
  const html = parts.join('');
  if (light && box._shopKey === 'st' + html.length) return;
  box._shopKey = 'st' + html.length;
  box.innerHTML = html;
  box.querySelectorAll('canvas[data-ci]').forEach(c => { const [w, h, fn] = canvases[+c.dataset.ci][0]; c.width = w; c.height = h; fn(c); });
  box.scrollTop = keepScroll;
}

/* ---- previews, drawn with the game's own artwork */
function designPreview(g, cat, key, w, h) {
  const keepD = jb.designs[cat]; jb.designs[cat] = key; softZ = 3;
  const keepPal = PAL, keepSun = Object.assign({}, SUN); SUN.x = 0.55; SUN.y = 0.8; SUN.a = 1;
  if (cat === 'road' || cat === 'bridge' || cat === 'moto') PAL = palFor(mapPrefs.theme, Object.assign({}, mapPrefs, cat === 'moto' ? {moto: ''} : {}));
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); g.fillStyle = PAL.land2; g.fillRect(0, 0, w, h);
  withCtx(g, () => {
    if (cat === 'car') {
      g.setTransform(3.4, 0, 0, 3.4, w / 2, h / 2);
      drawCar({x: 0, y: 0, ang: -0.35, da: -0.35, color: 0, up: {cap: 1, spd: 0, load: 0, fuel: 0}, van: false, load: 1, state: 'parked', v: 0, id: 1, brake: false, broken: 0, stopT: 0});
    } else if (cat === 'house') {
      const b = {k: idx(3, 3), face: 0, extra: 1, color: 1, acc: 0, cars: [], carsN: 2};
      g.setTransform(1.9, 0, 0, 1.9, w / 2 - tx(b.k) * 1.9, h / 2 - ty(b.k) * 1.9 + 4); drawHouse(b);
    } else if (cat === 'store') {
      const b = {type: 'store', k: idx(6, 6), sd: 4, ends: 0, tier: 1, lvl: 0, pins: 6, color: 2, face: sdFace(4), acc: 0, park: 0, docks: []};
      g.setTransform(0.62, 0, 0, 0.62, w / 2 - bX(b) * 0.62, h / 2 - bY(b) * 0.62); drawStore(b);
    } else if (cat === 'road' || cat === 'bridge') {
      g.setTransform(1, 0, 0, 1, 0, 0);
      const P = new Path2D(); P.moveTo(-10, h * 0.7); P.bezierCurveTo(w * 0.3, h * 0.7, w * 0.6, h * 0.25, w + 10, h * 0.3);
      if (cat === 'bridge') { g.fillStyle = PAL.water; g.fillRect(w * 0.28, 0, w * 0.44, h); }
      paintRoadPath(P, cat === 'bridge');
    } else if (cat === 'moto') {
      g.setTransform(1, 0, 0, 1, 0, 0);
      const P = new Path2D(); P.moveTo(-10, h * 0.75); P.bezierCurveTo(w * 0.35, h * 0.75, w * 0.55, h * 0.2, w + 10, h * 0.25);
      g.save(); g.translate(SUN.x * 6, SUN.y * 6); g.strokeStyle = PAL.sh; g.lineWidth = 16; g.lineCap = 'round'; g.stroke(P); g.restore();
      paintMoto(P, P, null);
    } else if (cat === 'drone') {
      g.setTransform(3, 0, 0, 3, w / 2, h / 2 + 2);
      drawDrone({id: 1, x: 0, y: 0, ang: -0.5, load: 1, color: 2, st: 'out'}, 1, true);
    } else if (cat === 'light') {
      g.setTransform(2, 0, 0, 2, w / 2, h / 2);
      const P = new Path2D(); P.moveTo(-40, 0); P.lineTo(40, 0); P.moveTo(0, -30); P.lineTo(0, 30); paintRoadPath(P, false, true);
      drawLightHeads(0, 0, {ph: 0, allRed: false}, [1, 0]);
    } else if (cat === 'round') {
      g.setTransform(2, 0, 0, 2, w / 2, h / 2);
      const P = new Path2D(); P.moveTo(-40, 0); P.lineTo(40, 0); P.moveTo(0, -30); P.lineTo(0, 30); paintRoadPath(P, false, true);
      drawRoundAt(0, 0);
    }
  });
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (keepD === undefined) delete jb.designs[cat]; else jb.designs[cat] = keepD;
  softZ = 0; PAL = keepPal; Object.assign(SUN, keepSun);
}
function mapPreview(cvs, id, custom, decor) {
  const g = cvs.getContext('2d'), w = cvs.width, h = cvs.height, keep = PAL, keepTheme = theme;
  PAL = palFor(id, custom); theme = PAL.tone;
  g.clearRect(0, 0, w, h);
  g.fillStyle = PAL.land2; g.fillRect(0, 0, w, h);
  g.fillStyle = PAL.patch; const u = h / 3;
  rr_(g, w * 0.05, h * 0.62, u * 2.2, u, u * 0.4); rr_(g, w * 0.05, h * 0.3, u, u * 1.4, u * 0.4); rr_(g, w * 0.55, -u * 0.4, u, u * 1.2, u * 0.4);
  g.fillStyle = PAL.water; g.fillRect(w * 0.78, 0, w * 0.14, h);
  const dk = decor || (MAP_THEMES[id] || MAP_THEMES.meadow).decor, sc = h / 40;
  drawDecor(g, dk, w * 0.24, h * 0.45, 9 * sc, 0, 11); drawDecor(g, dk, w * 0.55, h * 0.62, 7 * sc, 0, 23);
  PAL = keep; theme = keepTheme;
}
const STYLE_ITEMS = {clean: 'Clean', glass: 'Glass', sign: 'Road sign', frost: 'Frosted glass'};
for (const k in PANEL_X) STYLE_ITEMS[k] = PANEL_X[k].label;
function decorPreview(g, id) {
  g.fillStyle = PAL.land2; g.fillRect(0, 0, 64, 64); g.fillStyle = PAL.patch; rr_(g, 6, 38, 52, 20, 8);
  drawDecor(g, id === 'auto' ? (MAP_THEMES[mapPrefs.theme] || MAP_THEMES.meadow).decor : id, 32, 32, 17, 0, 5);
}
/* everything in one category: id, name, price, whether it's in use, how to put it on, and a preview */
function shopItems(cat) {
  const out = [];
  if (cat === 'ui') for (const k in UI_THEMES) {
    const t = UI_THEMES[k], pl = theme === 'dark' && t.night ? t.night : t.plate;
    out.push({id: 'ui:' + k, name: t.label, active: !uiCustom() && uiTheme.preset === k, apply: () => setUi({preset: k, plate: '', btn: '', accent: ''}),
      html: '<span class="tp-prev" style="background:' + pl + ';color:' + (lum(pl) > 0.4 ? '#17252d' : '#f2f7f6') + '"><i style="background:' + t.accent + '"></i><em></em></span>'});
  }
  if (cat === 'style') for (const k in STYLE_ITEMS) out.push({id: 'style:' + k, name: STYLE_ITEMS[k],
    active: k === 'frost' ? !!uiTheme.frost && uiTheme.style === 'glass' : uiTheme.style === k && !(k === 'glass' && uiTheme.frost),
    apply: () => k === 'frost' ? (owns('style:glass') ? setUi({style: 'glass', frost: !(uiTheme.frost && uiTheme.style === 'glass')}) : hint('Frosted glass needs Glass panels too.')) : setUi({style: k, frost: false}),
    html: '<span class="sp-prev sp-' + k + '"><i></i><em></em></span>'});
  if (cat === 'map') for (const k in MAP_THEMES) out.push({id: 'map:' + k, name: MAP_THEMES[k].label, active: mapPrefs.theme === k && !mapCustom(),
    apply: () => setMap({theme: k, land: '', patch: '', water: '', road: '', moto: ''}), canvas: [132, 72, c => mapPreview(c, k, null, mapPrefs.decor !== 'auto' ? mapPrefs.decor : null)]});
  if (cat === 'decor') for (const k of ['auto', ...Object.keys(DECOR)]) out.push({id: 'decor:' + k, name: k === 'auto' ? 'Theme’s own' : DECOR[k], active: mapPrefs.decor === k,
    apply: () => setMap({decor: k}), canvas: [64, 64, c => decorPreview(c.getContext('2d'), k)]});
  if (DESIGNS[cat]) for (const k in DESIGNS[cat].items) out.push({id: 'design:' + cat + ':' + k, name: DESIGNS[cat].items[k][0], active: design(cat) === k,
    apply: () => setDesign(cat, k), canvas: [120, 80, c => designPreview(c.getContext('2d'), cat, k, 120, 80)]});
  if (cat === 'colour') for (const g of COLOR_LIBRARY) for (const [n, h] of g.cols) out.push({id: 'colour:' + h, name: n, hex: h, group: g.group});
  if (cat === 'banner') { out.push({id: 'banner:', name: 'No banner', active: !prof().banner, apply: () => setProf({banner: ''}), html: '<span class="tp-prev bn-prev" style="background:' + bannerCSS('') + '"></span>'});
    for (const k in BANNERS) out.push({id: 'banner:' + k, name: BANNERS[k][0], active: prof().banner === k, apply: () => setProf({banner: k}), html: '<span class="tp-prev bn-prev" style="background:' + BANNERS[k][2] + '"></span>'}); }
  if (cat === 'frame') { out.push({id: 'frame:', name: 'No frame', active: !prof().frame, apply: () => setProf({frame: ''}), html: '<span class="fr-prev"><i class="av"></i></span>'});
    for (const k in FRAMES) out.push({id: 'frame:' + k, name: FRAMES[k][0], active: prof().frame === k, apply: () => setProf({frame: k}), html: '<span class="fr-prev"><i class="av f-' + k + '" style="--fr:' + frameCSS(k) + '"></i></span>'}); }
  if (cat === 'title') { out.push({id: 'title:', name: 'No title', active: !prof().title, apply: () => setProf({title: ''}), html: '<span class="ttl-prev"><em>\u2014</em></span>'});
    for (const k in TITLES) out.push({id: 'title:' + k, name: TITLES[k][0], active: prof().title === k, apply: () => setProf({title: k}), html: '<span class="ttl-prev"><em>' + TITLES[k][0] + '</em></span>'}); }
  return out.map(it => { const info = itemInfo(it.id); it.price = info ? info[0] : 0; it.rare = !!info && info[2] === 'R'; return it; });
}
function setDesign(cat, k) {
  jb.designs[cat] = k; saveShop();
  if (cat === 'road' || cat === 'bridge' || cat === 'moto') { PAL = palFor(mapPrefs.theme, mapPrefs); pathCache.ver = -1; }
  renderLook();
}
/* custom colour slots: where an owned colour can go */
const COLOUR_SLOTS = [['plate', 'Menus', 'ui'], ['btn', 'Buttons', 'ui'], ['accent', 'Highlights', 'ui'], ['land', 'Ground', 'map'], ['patch', 'Patches', 'map'],
  ['water', 'Water', 'map'], ['road', 'Roads', 'map'], ['moto', 'Motorways', 'map']];
let colourSlot = 'plate';
const slotValue = f => (COLOUR_SLOTS.find(s => s[0] === f)[2] === 'ui' ? uiTheme[f] : mapPrefs[f]) || '';
const slotShown = f => slotValue(f) || ({plate: uiColours().plate, btn: uiColours().btn, accent: uiColours().accent, land: PAL.land, patch: PAL.patch, water: PAL.water, road: PAL.road, moto: PAL.deck})[f];
function setSlot(f, hex) { if (COLOUR_SLOTS.find(s => s[0] === f)[2] === 'ui') setUi({[f]: hex}); else setMap({[f]: hex}); }

const SHOP_CATS = [['ui', 'Interface themes'], ['style', 'Panel styles'], ['map', 'Map themes'], ['decor', 'Decorations'], ['car', 'Car designs'], ['house', 'House designs'],
  ['road', 'Road designs'], ['store', 'Store designs'], ['light', 'Traffic light designs'], ['round', 'Roundabout designs'], ['bridge', 'Bridge designs'], ['moto', 'Motorway designs'], ['drone', 'Drone designs'],
  ['banner', 'Profile banners'], ['frame', 'Avatar frames'], ['title', 'Titles'], ['colour', 'Colours']];
function priceTag(id, price, kind) {
  const conf = buyPending && buyPending.id === id && buyPending.kind === (kind || 'buy'), info = itemInfo(id), rare = !!info && info[2] === 'R' && kind !== 'hire';
  if (kind === 'hire') return '<span class="lock hire' + (conf ? ' confirm' : '') + '">' + (conf ? 'Tap to hire' : 'Hire 3h ◎' + HIRE_PRICE) + '</span>';
  if (info && info[2] === 'A') return '<span class="lock ach" title="' + achName(info[3]) + '">\ud83c\udfc6 ' + achName(info[3]) + '</span>';
  return '<span class="lock' + (rare ? ' rare' : '') + (conf ? ' confirm' : '') + '">' + (conf ? 'Tap to buy' : rare ? '★ ' + RCUR + price : CUR + price) + '</span>';
}
/* one list for all three views: 'store' (things to buy), 'owned' (things to wear) and 'quick' (the Customise drawer) */
function renderShop(box, mode, light) {
  if (!box) return;
  if (mode === 'store') { renderStore(box, light); return; }
  const keepScroll = box.scrollTop, parts = [], canvases = [];
  if (mode !== 'store') {
    parts.push('<h3 class="shop-h">Light and dark modes</h3><div class="shopgrid modes">' + ['light', 'dark'].map(m => {
      const L = modes[m] || MODE_DEFAULTS[m], pal = palFor(L.map.theme, L.map), pr = UI_THEMES[L.ui.preset] || UI_THEMES.petrol;
      const plate = L.ui.plate || (pal.tone === 'dark' && pr.night ? pr.night : pr.plate), acc = L.ui.accent || pr.accent;
      return '<button type="button" class="shopcard modecard' + (modes.cur === m ? ' active' : '') + '" data-act="mode" data-mode="' + m + '"><span class="mp-prev" style="background:linear-gradient(90deg,' + pal.land2 + ' 0 55%,' + plate + ' 55%)"><i style="background:' + pal.patch + '"></i><em style="background:' + acc + '"></em></span><b>' + (m === 'light' ? '☀ Light mode' : '☾ Dark mode') + '</b><small>' + MAP_THEMES[L.map.theme].label + ' · ' + (L.ui.plate ? 'custom' : pr.label) + '</small></button>';
    }).join('') + '</div><p class="mnote">Each mode remembers its own look — change things while it’s on. <kbd>T</kbd> switches. <button class="linkbtn inl" type="button" data-act="modereset">Reset this mode</button></p>');
  }
  for (const [cat, label] of SHOP_CATS) {
    if (cat === 'colour') continue;
    let items = shopItems(cat);
    items = items.filter(it => mode === 'store' ? !owns(it.id) : owns(it.id));
    if (!items.length) continue;
    parts.push('<h3 class="shop-h">' + label + '</h3><div class="shopgrid ' + cat + '">' + items.map(it => {
      const ci = it.canvas ? canvases.push([it.canvas, it.id]) - 1 : -1;
      return '<button type="button" class="shopcard' + (it.active && mode !== 'store' ? ' active' : '') + (mode === 'store' && it.rare ? ' rare' : '') + '" data-act="' + (mode === 'store' ? 'buy' : 'apply') + '" data-id="' + it.id + '">' +
        (it.html || '<canvas data-ci="' + ci + '"></canvas>') + '<b>' + it.name + '</b>' + (mode === 'store' ? priceTag(it.id, it.price) : it.active ? '<span class="using">In use</span>' : '') + '</button>';
    }).join('') + '</div>');
  }
  // colours
  const cols = shopItems('colour');
  if (mode === 'store') {
    const sell = cols.filter(c => !jb.owned[c.id]);
    if (sell.length) {
      const groups = [...new Set(sell.map(c => c.group))];
      parts.push('<h3 class="shop-h">Colours <small>buy to keep, or hire for 3 hours for ◎' + HIRE_PRICE + '</small></h3>' + groups.map(gn => '<h5 class="shop-sub">' + gn + '</h5><div class="shopgrid colours">' +
        sell.filter(c => c.group === gn).map(c => {
          const left = hiredLeft(c.id);
          return '<div class="colcard' + (c.rare ? ' rare' : '') + '"><span class="csw" style="background:' + c.hex + '"></span><b>' + c.name + '</b>' + (left ? '<small class="hired">Hired · ' + fmtLeft(left) + ' left</small>' : '') +
            '<span class="colbtns"><button type="button" data-act="buy" data-id="' + c.id + '">' + priceTag(c.id, c.price) + '</button><button type="button" data-act="hire" data-id="' + c.id + '">' + priceTag(c.id, c.price, 'hire') + '</button></span></div>';
        }).join('') + '</div>').join(''));
    }
  } else {
    const mine = cols.filter(c => owns(c.id));
    for (const h in jb.owned) if (h.startsWith('colour:') && !COLOUR_PRICE[h.slice(7)]) mine.push({id: h, hex: h.slice(7), name: colourName(h.slice(7))});
    parts.push('<h3 class="shop-h">Your colours <small>pick a slot, then a colour</small></h3><div class="slotpicks">' + COLOUR_SLOTS.map(([f, n]) =>
      '<button type="button" class="slotpick' + (colourSlot === f ? ' active' : '') + '" data-act="slot" data-slot="' + f + '"><i style="background:' + slotShown(f) + '"></i><span>' + n + '</span>' + (slotValue(f) ? '<em>custom</em>' : '') + '</button>').join('') + '</div>' +
      '<div class="ownedcols"><button type="button" class="ocol def' + (!slotValue(colourSlot) ? ' active' : '') + '" data-act="colour" data-hex="" title="Theme default"><span>Default</span></button>' +
      mine.map(c => { const left = hiredLeft(c.id); return '<button type="button" class="ocol' + (slotValue(colourSlot) === c.hex ? ' active' : '') + '" data-act="colour" data-hex="' + c.hex + '" style="--c:' + c.hex + '" title="' + c.name + (left ? ' (hired, ' + fmtLeft(left) + ' left)' : '') + '">' + (left ? '<em>' + fmtLeft(left) + '</em>' : '') + '</button>'; }).join('') +
      '</div>' + (mine.length ? '' : '<p class="mnote">You don’t own any colours yet — buy or hire them in the Store.</p>'));
  }
  if (!parts.length) parts.push('<p class="mnote">You own everything here. Nice.</p>');
  if (light && box._shopKey === mode + parts.join('').length) return;   // a timer refresh with nothing new: leave it be
  box._shopKey = mode + parts.join('').length;
  box.innerHTML = parts.join('');
  box.querySelectorAll('canvas[data-ci]').forEach(c => { const [w, h, fn] = canvases[+c.dataset.ci][0]; c.width = w; c.height = h; fn(c); });
  box.scrollTop = keepScroll;
}
function shopClick(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act, id = b.dataset.id;
  if (act === 'buy') purchase(id, 'buy', () => { const it = SHOP_CATS.flatMap(([c]) => c === 'colour' ? [] : shopItems(c)).find(x => x.id === id); if (it && it.apply) it.apply(); });
  else if (act === 'hire') purchase(id, 'hire');
  else if (act === 'crate') openCrate(b.dataset.kind);
  else if (act === 'apply') { const it = SHOP_CATS.flatMap(([c]) => c === 'colour' ? [] : shopItems(c)).find(x => x.id === id); if (it) it.apply(); }
  else if (act === 'mode') useMode(b.dataset.mode);
  else if (act === 'modereset') { modes[modes.cur] = null; useMode(modes.cur); }
  else if (act === 'slot') { colourSlot = b.dataset.slot; renderLook(); }
  else if (act === 'colour') setSlot(colourSlot, b.dataset.hex);
}
let menuTab = 'settings';
function renderLook(light) {
  if (typeof jb === 'undefined' || !document.getElementById('menu')) return;
  if (!$('menu').hidden) {
    document.querySelectorAll('#menu-tabs button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mtab === menuTab ? 'true' : 'false'));
    document.querySelectorAll('#menu .mtab-pane').forEach(p => { p.hidden = p.dataset.mtab !== menuTab; });
    if (menuTab === 'store') renderShop($('store-list'), 'store', light);
    if (menuTab === 'owned') renderShop($('owned-list'), 'owned', light);
  }
  if ($('cust-panel') && !$('cust-panel').hidden) renderShop($('cust-list'), 'quick', light);
  if ($('m-start') && !$('m-start').hidden) {
    if (mmPane === 'custom' && cusTab === 'mine') renderShop($('mm-custom'), 'owned', light);
    if (mmPane === 'store') renderShop($('mm-store'), 'store', light);
  }
  renderBucks();
}
function openMenu(tab) {
  const m = $('menu'); if (tab) menuTab = tab;
  m.hidden = false; $('btn-menu').setAttribute('aria-expanded', 'true');
  renderPaletteUI(); renderLook();
}
function closeMenu() { $('menu').hidden = true; $('btn-menu').setAttribute('aria-expanded', 'false'); $('app').classList.remove('menu-over'); }
function toggleCust(on) {
  const p = $('cust-panel'); if (!p) return;
  p.hidden = on === undefined ? !p.hidden : !on;
  $('btn-cust').setAttribute('aria-expanded', p.hidden ? 'false' : 'true');
  if (!p.hidden) { closeMenu(); renderLook(); }
}
function bindUiTheme() {
  document.querySelectorAll('#menu-tabs button').forEach(b => b.addEventListener('click', () => { menuTab = b.dataset.mtab; renderLook(); }));
  for (const id of ['store-list', 'owned-list', 'cust-list']) { const el = $(id); if (el) el.addEventListener('click', shopClick); }
  $('menu-close').addEventListener('click', closeMenu);
  $('btn-cust').addEventListener('click', () => toggleCust());
  $('cust-close').addEventListener('click', () => toggleCust(false));
  $('cust-store').addEventListener('click', () => { toggleCust(false); openMenu('store'); });
  $('btn-msg').addEventListener('click', () => { closeMenu(); if (window.__junctionMessages) window.__junctionMessages(); else hint('Messages need the online service, which isn\u2019t available right now.'); });
  $('btn-acct').addEventListener('click', () => { closeMenu(); if (window.__junctionAccount) window.__junctionAccount(); else hint('Accounts, save files and watching need the online service, which isn’t available right now.'); });
}
function bindMap() {}
function bindSettings() {
  bindUiTheme(); bindMap();
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

/* ---------------------------------------------------------- feedback
   Sent from the page itself (online.js): guests' notes land in Firestore under
   feedback/{bugs|ideas|other}/entries, signed-in accounts are emailed to support by a Cloud Function. */
const FEEDBACK_TO = 'support.jamesnortinen@gmail.com';
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
let fbKind = 'Bug', fbBusy = false;
function openFeedback() {
  $('fb-err').textContent = '';
  const on = window.JunctionOnline, who = on && on.feedbackIdentity ? on.feedbackIdentity() : null;
  const acct = !!(who && who.account);
  $('fb-reply-wrap').hidden = acct;
  $('fb-as').hidden = !acct;
  if (acct) {
    const as = $('fb-as'); as.textContent = '';
    as.append('Sending from ', Object.assign(document.createElement('b'), {textContent: who.email}), ' \u2014 replies go to that address.');
  }
  openModal('m-feedback');
  setTimeout(() => { const t = $('fb-text'); if (t && !compactUI()) t.focus(); }, 60);
}
function feedbackDetails() {
  const lines = ['Junction ' + (($('menu').querySelector('.ver') || {}).textContent || '').replace(/^Junction\s*/, ''),
    'Screen: ' + window.innerWidth + '\u00d7' + window.innerHeight + ' @' + (window.devicePixelRatio || 1) + 'x' + (compactUI() ? ' (mobile layout)' : ''),
    'Browser: ' + navigator.userAgent];
  if (started) lines.push('Game: ' + (tutorialMode ? 'tutorial step ' + (tutStage + 1) : (DIFF.label || diffKey) + ', week ' + week + ', ' + score + ' parcels'));
  return lines.join('\n').slice(0, 1900);
}
function bindFeedback() {
  document.querySelectorAll('#fb-kind button').forEach(b => b.addEventListener('click', () => {
    fbKind = b.dataset.kindFb;
    document.querySelectorAll('#fb-kind button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
  }));
  $('fb-close').addEventListener('click', () => closeModal('m-feedback'));
  $('fb-send').addEventListener('click', async () => {
    if (fbBusy) return;
    const err = $('fb-err'), btn = $('fb-send');
    const message = $('fb-text').value.trim();
    if (message.length < 3) { err.textContent = 'Write a few words first.'; return; }
    const on = window.JunctionOnline;
    if (!on || !on.sendFeedback || !on.feedbackReady) { err.textContent = 'Feedback needs a connection. Try again in a moment, or email ' + FEEDBACK_TO + '.'; return; }
    const replyTo = $('fb-reply-wrap').hidden ? '' : $('fb-reply').value.trim();
    if (replyTo && !EMAIL_RE.test(replyTo)) { err.textContent = 'That email address doesn\u2019t look right \u2014 fix it or leave it blank.'; return; }
    fbBusy = true; btn.disabled = true; btn.textContent = 'Sending\u2026'; err.textContent = '';
    try {
      const via = await on.sendFeedback({kind: fbKind, message, details: $('fb-device').checked ? feedbackDetails() : '', replyTo});
      closeModal('m-feedback'); $('fb-text').value = ''; awardAch('feedback');
      toast(via === 'email' ? 'Thanks! Sent to support \u2014 we\u2019ll reply to your account email.'
        : replyTo ? 'Thanks! Feedback sent \u2014 we\u2019ll reply to ' + replyTo + '.' : 'Thanks! Feedback sent.', 'good');
    } catch (e) {
      console.warn('Feedback failed:', e);
      err.textContent = (e && e.userMessage) || 'Couldn\u2019t send that just now. Check your connection and try again.';
    } finally { fbBusy = false; btn.disabled = false; btn.textContent = 'Send'; }
  });
}

/* tutorial panel collapsed to a slim bar (default on phones, so it doesn't cover the map) */
function setTutMin(on, silent) {
  const tp = $('tut-panel'), b = $('tut-min'); if (!tp) return;
  tp.classList.toggle('min', !!on);
  applyCoachDock();
  if (b) { b.textContent = on ? 'Show steps' : 'Hide'; b.setAttribute('aria-expanded', on ? 'false' : 'true'); }
  if (!silent) layout();
}

/* --------------------------------------------------------------- layout */
/* re-fit only when the play area's size really differs from what the canvas was sized for */
function fitStage() {
  const st = $('stage'); if (!st) return;
  const w = Math.max(320, Math.round(st.clientWidth)), h = Math.max(320, Math.round(st.clientHeight));
  const d = Math.min(window.devicePixelRatio || 1, gfx.res || 2);
  if (w !== W || h !== H || d !== dpr || cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) {
    const wasW = W, wasH = H; layout();
    if ((wasW > wasH) !== (W > H) && !demoMode) camReset(false);   // turned the phone: fit the city to the new shape
  }
}
function layout() {
  const stage = $('stage'), r = stage.getBoundingClientRect();
  W = Math.max(320, Math.round(r.width)); H = Math.max(320, Math.round(r.height));
  dpr = Math.min(window.devicePixelRatio || 1, gfx.res || 2);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const mobile = W < 820, panelOn = !$('app').classList.contains('panel-off');
  const topH = Math.round($('topbar').getBoundingClientRect().height) + 20;
  document.documentElement.style.setProperty('--top', topH + 'px');
  // keep the city clear of whatever bars are actually on screen, whatever size they are
  const box = id => { const e = $(id); if (!e || e.hidden) return null; const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 ? b : null; };
  insets.l = 0; insets.r = 0; insets.b = 40;
  for (const b of [box('dock'), panelOn ? box('panel') : null]) {
    if (!b) continue;
    const tall = b.height > b.width;
    if (tall && b.left - r.left < W * 0.3) insets.l = Math.max(insets.l, Math.round(b.right - r.left) + 12);        // a column on the left
    else if (tall && r.right - b.right < W * 0.3) insets.r = Math.max(insets.r, Math.round(r.right - b.left) + 12); // a column on the right
    else if (b.top > r.top + H * 0.3) insets.b = Math.max(insets.b, Math.round(r.bottom - b.top) + 30);            // a sheet along the bottom
  }
  insets.t = topH;
  if (tutorialMode) {
    const tp = $('tut-panel');
    const tmin = tp && tp.classList.contains('min');
    if (mobile) insets.b = tmin ? 200 : Math.round(H * 0.36) + 100;
    else insets.r = tmin ? 0 : 312;
  }
  if (cam.auto) camReset(true);
}

/* ----------------------------------------------------------------- loop */
let last = 0, accHud = 0, accMini = 0, accIns = 0, accLife = 0, accLifeSave = 0;
const SIM_STEP = 1 / 30;
let simAcc = 0, fitCheck = 0;
/* Smooth motion: the city moves in steps of 1/30 s, but the screen draws more often than that. Vehicles are drawn
   part way between their last two positions, so they glide at every speed instead of stepping. (Something that
   jumped, like a car towed or parked in one go, is simply drawn where it is.) */
const MOVERS = () => [cars, trucks, ambs];
function snapPrev() { for (const L of MOVERS()) for (const o of L) { o.px = o.x; o.py = o.y; o.pa = o.ang; } }
function drawBetween(alpha) {
  if (!gfx.smooth) alpha = 1;
  const moved = [];
  if (alpha < 1) for (const L of MOVERS()) for (const o of L) {
    if (o.px === undefined) continue;
    const dx = o.x - o.px, dy = o.y - o.py;
    if ((dx || dy || o.ang !== o.pa) && dx * dx + dy * dy < 1600) {
      moved.push([o, o.x, o.y, o.ang]);
      o.x = o.px + dx * alpha; o.y = o.py + dy * alpha; o.ang = o.pa + angDiff(o.pa, o.ang) * alpha;
    }
  }
  try { draw(); } finally { for (const [o, x, y, a] of moved) { o.x = x; o.y = y; o.ang = a; } }
}
function frame(now) {
  requestAnimationFrame(frame);
  if (gfx.cap && now - last < 1000 / gfx.cap - 1.5) return;      // a frame cap: skip until it's time (the clock catches up next frame)
  const real = Math.min(0.1, (now - last) / 1000); last = now;
  animT += real;
  let alpha = 1;
  if (running && !over && started && (!modalOpen || demoMode || isoLive())) {     // the menu's background city keeps playing behind it (and a live match never waits)
    simAcc += real * speed;
    let n = 0;
    while (simAcc >= SIM_STEP && n < 12) {
      snapPrev(); update(SIM_STEP); simAcc -= SIM_STEP; n++;
      if (over || !running) { simAcc = 0; break; }
    }
    if (n === 12) simAcc = 0;                 // drop a backlog after a long stall rather than freeze
    if (running && !over) alpha = clamp(simAcc / SIM_STEP, 0, 1);
  }
  if (tutorialMode && started && !spectating) { tutCheckT += real; if (tutCheckT > 0.35) { tutCheckT = 0; checkTutorial(); } }
  rollHud();
  stepFX(real);
  if (demoMode) demoCam(real); else camUpdate(real);
  fitCheck += real; if (fitCheck > 0.25) { fitCheck = 0; fitStage(); }
  drawBetween(alpha);
  accHud += real; accMini += real; accIns += real;
  if (accHud > 0.2) { accHud = 0; refreshHud(); musicTick(); }
  if (accMini > 0.25) { accMini = 0; drawMini(); }
  if (accIns > 0.25 && sel) { accIns = 0; renderInspector(); }
  accLife += real;
  if (accLife > 1) { lifeTick(accLife); accLife = 0; checkAch(); replayTick(); campaignTick(); }
  accLifeSave += real;
  if (accLifeSave > 20) { accLifeSave = 0; if (lifeDirty) saveLife(); }
}

/* ----------------------------------------------------------------- boot */
/* build the background city: a grid of streets with lights and roundabouts, a store of every colour and
   plenty of houses, then let it run */
function startDemo() {
  pendingSlot = ''; resetGame('zen');
  demoMode = true; curSlot = '';
  DIFF = Object.assign({}, DIFFS.zen, {pin: 0.3});
  weekTimer = houseTimer = storeTimer = breakdownTimer = closureTimer = ambTimer = contractTimer = 1e9;
  for (const b of buildings) for (const t of bTiles(b)) bAt[t] = -1;
  buildings = []; cars = []; trucks = []; road.fill(0); lnk.fill(0); special.fill(null); sign.fill(null); lightQ.clear();
  span = 34; org = Math.floor((MAXD - span) / 2); camSpan = span; camOrg = org;
  money = 1e9;
  const L = (c, r) => idx(org + c, org + r), lay = (a, b) => { road[a] = 1; road[b] = 1; const d = dirBetween(a, b); if (d >= 0) setLink(a, d, true); };
  const lines = []; for (let i = 3; i < span - 2; i += 6) lines.push(i);
  for (const r of lines) for (let c = 1; c < span - 2; c++) lay(L(c, r), L(c + 1, r));
  for (const c of lines) for (let r = 1; r < span - 2; r++) lay(L(c, r), L(c, r + 1));
  lines.forEach((r, i) => lines.forEach((c, j) => { const k = L(c, r), v = (i * 3 + j * 5) % 4; if (v === 0) special[k] = 'round'; else if (v === 1) { special[k] = 'light'; lightQ.set(k, [CFG.lightBatch, CFG.lightBatch]); } }));
  // a store of every colour, opening onto a street, then houses beside the streets
  for (let col = 0; col < COLORS.length; col++) for (let t = 0; t < 600; t++) {
    const k = L(2 + Math.floor(Math.random() * (span - 4)), 2 + Math.floor(Math.random() * (span - 4))), sd = ORTH[Math.floor(Math.random() * 4)];
    if (storeFits(k, sd, inPlay, 0) && storeDoorsAt(k, sd, 0).some(([d]) => road[d])) { newBuilding(k, 'store', col, sd, 0); break; }
  }
  for (let i = 0, made = 0; i < 4000 && made < 30; i++) {
    const k = L(1 + Math.floor(Math.random() * (span - 2)), 1 + Math.floor(Math.random() * (span - 2)));
    if (occupied(k) || water[k] || storeFront(k) || !ORTH.some(d => road[nbr(k, d)])) continue;
    const b = newBuilding(k, 'house', made % COLORS.length); b.extra = 2; made++;
  }
  linkBuildings(); rebuildNet();
  buildings.forEach((b, i) => { if (b.type === 'house') for (let n = 0; n < 4; n++) addCar(i); else b.pins = 4; });
  for (const c of cars) { c.up.spd = Math.floor(Math.random() * 3); c.up.cap = Math.floor(Math.random() * 3); syncCarLen(c); const q = parkedPose(c); c.x = q.x; c.y = q.y; c.ang = q.a; }
  running = true; over = false; demoT = 0; pathCache.ver = -1;
}
/* the background camera drifts slowly across the city, which sits a little right of centre */
function demoCam(dt) {
  demoT += dt;
  const cxw = (org + span / 2) * CELL;
  cam.auto = false; follow = false;
  cam.z = clamp(Math.min(W, H) / (span * CELL * 0.62), 0.9, 2.4);
  cam.x = cxw - (W * 0.14) / cam.z + Math.sin(demoT * 0.045) * span * CELL * 0.16;
  cam.y = cxw + Math.cos(demoT * 0.033) * span * CELL * 0.12;
}
function boot() {
  splashStep(0.15);
  loadShop();
  loadUiTheme();
  loadMap();
  loadModes();
  loadPrefs();
  grantInUse(); renderLook();
  splashStep(0.45);
  buildToolbars(); bindInput(); showTab('city');
  applyLayout(); bindLayout();
  startDemo();
  layout();
  splashStep(0.8);
  showStartBest();
  $('btn-resume').hidden = !hasSave();
  openModal('m-start');
  requestAnimationFrame(t2 => { last = t2; frame(t2); });
  for (const id of ['ver', 'ver-foot', 'wn-ver']) { const el = $(id); if (el) el.textContent = VERSION; }
  setupApp();
  labelIconButtons(); checkDaily(); ensureQuests(); renderQuestBadge(); applyProfLook();
  const ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([ready, new Promise(r => setTimeout(r, 2500))]).then(() => requestAnimationFrame(splashDone));
  setTimeout(() => { if (dailyPending && !$('m-start').hidden && !modalOpenBesides('m-start')) openDaily(); }, 2600);
}
boot();
if (typeof window !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || /[?&]debug\b/.test(location.search))) window.__JUNCTION = {update, resetGame, placeRoad, placePark, placeDepot, eraseAt, rebuildNet, planRoute, draw, saveGame, loadGame,
  get cars() { return cars; }, get edges() { return edges; }, get nodes() { return nodes; }, get nodeList() { return nodeList; }, get buildings() { return buildings; },
  get stats() { return stats; }, get score() { return score; }, get inv() { return inv; }, get road() { return road; }, get water() { return water; }, get org() { return org; },
  get span() { return span; }, idx, cx, cy, CFG, get perks() { return perks; }, get depots() { return depots; }, get parks() { return parks; }, get special() { return special; },
  addCar, refreshHud, renderInspector, offerUpgrade, renderShop, doBuy, offerOf, money: () => money, renderPerks, renderGoals, drawMini, endGame, get rush() { return rush; }, get rain() { return rain; }, get breakdownTimer() { return breakdownTimer; }, serialize, validSave, importCity, exportCity, saveFile, sampleRun, drawRunChart, upgradeJunction, spawnAmb, tryCloseRoad, closeTile, closureSafe, troubleSpots, get ambs() { return ambs; }, get closed() { return closed; }, checkGoals, GOALS, rewardText, bestFor, setScore(v) { score = v; }, setMoney(v) { money = v; }, get goalsDone() { return goalsDone; }, undo, redo, get redoStack() { return redoStack; }, get cam() { return cam; }, select(o) { sel = o; }, get sign() { return sign; }, set running(v) { running = v; }, get week() { return week; }, tow, applyTool, setTool, get motorways() { return motorways; }, linked, dispatch,
  placeRail, linkRail, stepRail, eraseRail, rebuildRail, makeBusRoute, removeBusRoute, syncDrones, stepTransport, drawDrone, drawRail, drawTransport, drawDrones, designPreview, transportSave, finishTransportLoad, TR, TRC, DESIGNS, GEN, shopItems,
  rail: () => rail, rlnk: () => rlnk, trains: () => trains, busRoutes: () => busRoutes, drones: () => drones, stations: () => stations, xingT: () => xingT, clock: () => clock, setInv(k, v) { inv[k] = v; }, setPerk(k, v) { perks[k] = v; },
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
    modes: () => Object.keys(DIFFS),
    life: () => { lifeTick(0); return JSON.parse(JSON.stringify(life)); },
    setLifeOwner, mergeLife(d) { mergeLife(d, false); saveLife(); },
    achList: () => ACH.map(a => ({id: a.id, g: a.g, name: a.name, hint: a.hint})),
    ach: () => Object.assign({}, ach), achAll: () => achDone() === ACH.length, awardAch, mergeAch, get tipsOn() { return tipsOn; },
    diffLabel(k) { return (DIFFS[k] && DIFFS[k].label) || k; },
    expertSeed, citySnap, drawCitySnap,
    serialize,
    state() {
      return {started, over, tutorialMode, spectating, running: running && !modalOpen, speed, score, week, diffKey, clock, goals: goalsDone.size, earned: stats.earned, expWeek,
        trips: stats.trips, tows: stats.tows, delivered: stats.delivered, cars: cars.length, roads: road ? road.reduce((a, v) => a + v, 0) : 0,
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
    toast, openModal, closeModal, renderCollection, ask, makeShareCard, shareCanvas, haptic, get version() { return VERSION; },
    shopSnapshot, mergeShop, prof, setProf, pinnable, bannerCSS, frameCSS, titleOf, questEvent, get questClaimable() { return questClaimable(); },
    grantItem(id) { if (!COSMETICS[id] || jb.owned[id]) return false; jb.owned[id] = 1; saveShop(); renderLook(); return true; },
    isoSpectate(v) { specMatch = v; renderSpecMatch(); },
    profOptions() { return {banners: shopItems('banner').filter(it => owns(it.id)), frames: shopItems('frame').filter(it => owns(it.id)), titles: shopItems('title').filter(it => owns(it.id))}; }, setIsoPending, openIsoPane() { openModal('m-start'); showMM('play'); playMode = 'iso'; renderPlay(); },
    startIso, showIsoResult, showMenuPane(p) { if ($('m-start').hidden) openModal('m-start'); showMM(p); }, get menuOpen() { return !$('m-start').hidden; },
    get iso() { return iso && diffKey === 'iso' ? {id: iso.id, kind: iso.kind, over} : null; },
    isoOpp(st) { if (!iso) return; iso.oppSt = st; renderIsoHud(); },
    isoProp(p) { if (!iso) return; iso.prop = p; renderIsoHud(); if (p && !p.mine) sfx('click'); },
    isoNote(t) { if (!iso) return; iso.note = t || ''; renderIsoHud(); },
    isoControl(c) {                                        // what both players agreed: applied the same on both sides
      if (!iso || diffKey !== 'iso' || over) return;
      iso.ctl = {paused: !!c.paused, speed: CFG_SPEEDS.includes(c.speed) ? c.speed : 1};
      running = !iso.ctl.paused; speed = iso.ctl.speed; refreshUI(); renderIsoHud();
      hint(iso.ctl.paused ? 'Paused — you both agreed.' : 'Running at ' + speed + '× — you both agreed.');
    },
    isoEnd(why) { if (iso && diffKey === 'iso' && started && !over) endGame(why); },
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

/* ---------------------------------------------------------------- traffic flow view: buttons and API */
(function () {
  const fb = $('btn-flow'); if (fb) fb.addEventListener('click', () => toggleFlow());
  const fc = $('flow-close'); if (fc) fc.addEventListener('click', () => toggleFlow(false));
  const fp = $('flow-panel'); if (fp) fp.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-flow-jump]'); if (b) { const [x, y] = b.dataset.flowJump.split(',').map(Number); focusOn(x, y); } });
  if (window.__JUNCTION) Object.assign(window.__JUNCTION, {flowTick, drawFlow, flowSpots, renderFlowPanel, toggleFlow, drawFlowChart, flowOn: () => showFlow, flowData: () => ({edges: flowEdges, nodes: flowNodes, max: flowMax})});
  if (window.JunctionAPI) window.JunctionAPI.flow = {toggle: toggleFlow, on: () => showFlow, spots: flowSpots};
})();

/* ===== p51 guides: the first time a player opens ISO 1v1, Weeklys, the Store, a crate, Chats or Friends, a short
   guide of two or three animated cards (same look as the tutorial intro). Each shows once; the flags live in
   localStorage under junction-guides-v1 and "Replay guides" in Settings clears them. The triggers wrap showMM,
   renderPlay and openCrate rather than editing them. ===== */
const GUIDES_KEY = 'junction-guides-v1';
const GUIDE_NAMES = {iso: 'ISO 1v1', weekly: 'Weeklys', store: 'The Store', crate: 'Mystery crates', chats: 'Chats', friends: 'Friends'};
const GUIDES = {
  iso: [
    {t: 'Challenge a player', b: 'ISO 1v1 puts two players on the <b>same map</b>. Send a challenge to a friend or to any username, live or daily, and it waits on their Play menu until they answer.'},
    {t: 'Live: same time, same speed', b: 'Both cities run at once, at the same speed. Pausing or changing speed only happens when <b>both of you agree</b>. The last city standing wins.'},
    {t: 'Daily: your own pace', b: 'Each of you plays the map within 24 hours, pausing and speeding up as you like. A point for each category you win: time survived, parcels, money, trips and fewest tow trucks.'}
  ],
  weekly: [
    {t: 'One map a week', b: 'Every ISO week has one seed, and everyone plays the <b>same map</b>: an Expert Survival city, tougher than Frantic. Your best run goes on the leaderboard.'},
    {t: 'Top 3 and the map', b: 'The three best runs of the week sit on this pane; tap one to see that city. The seed map shows the whole map before you start, so you can plan your roads.'}
  ],
  store: [
    {t: 'A fresh Store every hour', b: 'The Store restocks on the hour with <b>6 items and 6 colours</b>. You earn \u25ce coins in any city, 2 for every 3 parcels. Tap an item once for its price, again to buy.'},
    {t: 'The daily special', b: 'One special a day costs <b>\u2726 stars</b> instead of coins. Stars come only from <b>Frantic</b> cities, 1 for every parcel delivered.'},
    {t: 'Mystery crates', b: 'Crates hold a random colour, item or object, and can hold <b>unique</b> things that are never for sale. Colour \u25ce150, item \u25ce200, object \u25ce250, up to 3 of each per hour.'}
  ],
  crate: [
    {t: 'Three kinds of crate', b: 'A <b>colour crate</b> (\u25ce150) holds a colour; an <b>item crate</b> (\u25ce200) a theme, map, panel style or decoration; an <b>object crate</b> (\u25ce250) a design for cars, houses, roads, stores and the rest. You can open 3 of each per hour.'},
    {t: 'What\u2019s inside', b: '70% standard, 25% rare, 5% unique, and uniques only ever come from crates. A crate never gives you something you already own.'}
  ],
  chats: [
    {t: 'Your chats', b: 'Conversations are listed on the left and the open chat sits on the right, like a messaging app. New messages show a badge on the Chats icon in the menu.'},
    {t: 'Tap a name', b: 'Tap a name to open their profile: records, a challenge to ISO 1v1, and the block or report options. Messages reach friends and anyone who has messaged you.'}
  ],
  friends: [
    {t: 'Add by username', b: 'Type a username and tap Add; they are on your list straight away. Tap a friend to see their records and whether they are online.'},
    {t: 'Records, head-to-head, Watch live', b: 'A friend\u2019s page shows their best runs and your ISO <b>head-to-head</b> record, and lets you challenge or message them. When they are playing, <b>Watch live</b> shows their city as it runs.'}
  ]
};
let gdKey = '', gdCard = 0, gdRaf = 0, gdT0 = 0;
function guideFlags() { try { return JSON.parse(localStorage.getItem(GUIDES_KEY) || '{}') || {}; } catch (e) { return {}; } }
function guideSeen(k) { return !!guideFlags()[k]; }
function markGuide(k) { try { const f = guideFlags(); f[k] = true; localStorage.setItem(GUIDES_KEY, JSON.stringify(f)); } catch (e) {} }
function maybeGuide(k) {
  const m = $('m-guide'); if (!GUIDES[k] || !m || !m.hidden || guideSeen(k)) return false;
  markGuide(k); openGuide(k); return true;
}
function openGuide(k) {
  gdKey = k; gdCard = 0; openModal('m-guide'); renderGuide();
  cancelAnimationFrame(gdRaf); gdT0 = performance.now();
  const loop = now => { if ($('m-guide').hidden) return; drawGuide((now - gdT0) / 1000); gdRaf = requestAnimationFrame(loop); };
  gdRaf = requestAnimationFrame(loop);
}
function closeGuide() { if ($('m-guide').hidden) return; closeModal('m-guide'); cancelAnimationFrame(gdRaf); }
function renderGuide() {
  const cards = GUIDES[gdKey] || [], c = cards[gdCard]; if (!c) return;
  $('gd-stage').innerHTML = '<canvas id="gd-cv" width="560" height="250"></canvas><em class="gd-k">' + GUIDE_NAMES[gdKey] + ' \u2013 ' + (gdCard + 1) + ' of ' + cards.length + '</em><h3>' + c.t + '</h3><p>' + c.b + '</p>';
  $('gd-dots').innerHTML = cards.map((_, i) => '<i class="' + (i === gdCard ? 'a' : i < gdCard ? 'd' : '') + '"></i>').join('');
  $('gd-back').disabled = gdCard === 0;
  $('gd-next').textContent = gdCard === cards.length - 1 ? 'Got it' : 'Next';
  const nx = $('gd-next'); if (nx) nx.focus();
}
/* the illustrations: simple rounded shapes and the real car and store artwork, animated by t (frozen under reduced motion) */
function drawGuide(t) {
  const cv2 = $('gd-cv'); if (!cv2) return;
  if (REDUCED_MOTION) t = 1.2;
  const g = cv2.getContext('2d'), W2 = cv2.width, H2 = cv2.height, keepSun = Object.assign({}, SUN), keepAnim = animT;
  SUN.x = 0.55; SUN.y = 0.8; SUN.a = 1; animT = t;
  const dk = theme === 'dark', ink = dk ? '#eef4f7' : '#12303f', soft = dk ? 'rgba(238,244,247,.62)' : 'rgba(18,48,63,.62)', plate = dk ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.7)', line = dk ? 'rgba(255,255,255,.18)' : 'rgba(18,48,63,.14)';
  const gold = '#ffc933', green = '#43d17a', blue = '#2f9bff', pink = '#ff6b8b', purple = '#8a5bff';
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = PAL.land2; g.fillRect(0, 0, W2, H2);
  const box = (x, y, w, h, r, c, st) => { rr_(g, x, y, w, h, r); g.fillStyle = c; g.fill(); if (st) { g.strokeStyle = st; g.lineWidth = 1.5; g.stroke(); } };
  const dot = (x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill(); };
  const txt = (s_, x, y, sz, c, w, al) => { g.fillStyle = c || ink; g.font = (w || 800) + ' ' + sz + 'px Overpass, system-ui, sans-serif'; g.textAlign = al || 'center'; g.textBaseline = 'middle'; g.fillText(s_, x, y); };
  const pill = (s_, x, y, c, fg, sz) => { g.font = '800 ' + (sz || 13) + 'px Overpass, system-ui, sans-serif'; const w = g.measureText(s_).width + 22; box(x - w / 2, y - 13, w, 26, 13, c); txt(s_, x, y + 1, sz || 13, fg || '#12303f'); return w; };
  const avatar = (x, y, r, c, ch) => { dot(x, y, r, c); txt(ch, x, y + 1, r * 1.1, '#fff'); };
  const car = (x, y, a, color, z) => withCtx(g, () => { g.setTransform(z, 0, 0, z, x, y); drawCar({x: 0, y: 0, ang: a, da: a, color, up: {cap: 0, spd: 0, load: 0, fuel: 0}, van: false, load: 0, state: 'parked', v: 0, id: 3 + color, brake: false, broken: 0, stopT: 0}); g.setTransform(1, 0, 0, 1, 0, 0); });
  const store = (x, y, z, color) => withCtx(g, () => { const b = {type: 'store', k: idx(6, 6), sd: 2, ends: 0, tier: 1, lvl: 0, pins: 2 + Math.floor(t) % 4, color, face: sdFace(2), acc: 0, park: 0, docks: []}; g.setTransform(z, 0, 0, z, x - bX(b) * z, y - bY(b) * z); drawStore(b); g.setTransform(1, 0, 0, 1, 0, 0); });
  const clock = (x, y, r, ang, c) => { dot(x, y, r, plate); g.strokeStyle = line; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r, 0, 6.3); g.stroke(); g.strokeStyle = c || ink; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang - 1.5708) * r * 0.62, y + Math.sin(ang - 1.5708) * r * 0.62); g.stroke(); dot(x, y, 2.5, c || ink); };
  const pointer = (x, y, down) => { dot(x + 1.5, y + 2.5, down ? 9 : 11, 'rgba(0,0,0,.18)'); dot(x, y, down ? 9 : 11, '#f4f2ec'); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, down ? 9 : 11, 0, 6.3); g.stroke(); if (down) { g.strokeStyle = gold; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, 16, 0, 6.3); g.stroke(); } };
  const ease = u => 1 - Math.pow(1 - Math.max(0, Math.min(1, u)), 3);
  const bob = Math.sin(t * 2) * 4, k = gdKey, i = gdCard;
  if (k === 'iso') {
    if (i === 0) {                                         // two cars face to face, a VS badge between them
      car(W2 * 0.3, H2 * 0.5 + bob, 0, 0, 3.6); car(W2 * 0.7, H2 * 0.5 - bob, Math.PI, 2, 3.6);
      dot(W2 / 2, H2 / 2, 30 + Math.sin(t * 4) * 1.5, gold); txt('VS', W2 / 2, H2 / 2 + 2, 24, '#4a3400');
      txt('You', W2 * 0.3, H2 * 0.5 + 44, 14, soft); txt('Them', W2 * 0.7, H2 * 0.5 + 44, 14, soft);
    } else if (i === 1) {                                  // two cities, one clock each, always in step; a pause that needs two ticks
      for (const [x, c] of [[W2 * 0.3, 0], [W2 * 0.7, 2]]) { box(x - 95, 22, 190, 150, 16, plate, line); store(x - 30, 100, 1.1, c); clock(x + 55, 70, 24, t * 1.4, c ? blue : pink); }
      const ph = (t * 0.5) % 3, ask = ph > 1, both = ph > 2;
      const w = pill(both ? 'Paused' : 'Pause?', W2 / 2, 206, both ? gold : plate, both ? '#4a3400' : ink);
      dot(W2 / 2 - w / 2 - 22, 206, 11, ask ? green : line); txt('\u2713', W2 / 2 - w / 2 - 22, 207, 14, '#fff');
      dot(W2 / 2 + w / 2 + 22, 206, 11, both ? green : line); txt('\u2713', W2 / 2 + w / 2 + 22, 207, 14, '#fff');
    } else {                                               // the five categories, a point each, ticked off one at a time
      const cats = ['Time', 'Parcels', 'Money', 'Trips', 'Tows'], mine = [1, 0, 1, 1, 0], n = Math.floor((t * 1.3) % 8), gap = W2 / 5.6;
      let a = 0, b = 0;
      cats.forEach((cn, j) => {
        const x = W2 / 2 + (j - 2) * gap, on = j < n, you = mine[j]; if (on) { if (you) a++; else b++; }
        box(x - 44, 96, 88, 40, 12, on ? (you ? gold : purple) : plate, on ? '' : line); txt(cn, x, 117, 14, on ? (you ? '#4a3400' : '#fff') : soft);
        if (on) dot(x, you ? 70 : 164, 9, you ? gold : purple);
      });
      txt('You ' + a, W2 * 0.25, 34, 20, ink); txt(b + ' Them', W2 * 0.75, 34, 20, ink);
      txt('24 h', W2 / 2, 36, 13, soft); g.strokeStyle = line; g.lineWidth = 4; g.beginPath(); g.arc(W2 / 2, 36, 18, 0, 6.3); g.stroke(); g.strokeStyle = green; g.lineCap = 'round'; g.beginPath(); g.arc(W2 / 2, 36, 18, -1.5708, -1.5708 + ((t * 0.25) % 1) * 6.283); g.stroke();
      txt('A point for every category you win', W2 / 2, 212, 13, soft, 700);
    }
  } else if (k === 'weekly') {
    if (i === 0) {                                         // one seed, three identical map thumbnails, one each for three players
      box(W2 / 2 - 110, 18, 220, 46, 14, plate, line); txt('This week\u2019s seed', W2 / 2, 33, 12, soft, 700); txt('MARIGOLD HARBOUR', W2 / 2, 51, 14, ink);
      const hi = Math.floor(t * 0.9) % 3;
      for (let j = 0; j < 3; j++) {
        const x = W2 / 2 + (j - 1) * 150, y = 150, w = 112, h = 82, on = j === hi;
        box(x - w / 2 - 4, y - h / 2 - 4, w + 8, h + 8, 14, on ? gold : 'rgba(0,0,0,0)');
        box(x - w / 2, y - h / 2, w, h, 10, dk ? '#2d3a2f' : '#cfe6b8');
        box(x - w / 2 + 10, y - h / 2 + 10, 34, 24, 8, dk ? '#1f2a22' : '#b9d8a0'); box(x + 6, y + 6, 40, 22, 8, dk ? '#1f2a22' : '#b9d8a0');
        box(x + w / 2 - 22, y - h / 2, 22, h, 0, dk ? '#3a5a7a' : '#8fd0e8');
        g.strokeStyle = '#f4f2ec'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - w / 2 + 14, y + 20); g.lineTo(x - 10, y + 20); g.lineTo(x - 10, y - 14); g.lineTo(x + 24, y - 14); g.stroke();
        dot(x - w / 2 + 14, y + 20, 5, pink); dot(x + 24, y - 14, 5, pink);
        avatar(x, y + h / 2 + 20, 11, [blue, pink, green][j], ['A', 'B', 'C'][j]);
      }
      txt('Same map for everyone', W2 / 2, 236, 13, soft, 700);
    } else {                                               // the podium, and the seed map beside it
      const u = ease(t * 0.6), hs = [70, 100, 50], order = [1, 0, 2], cols = [gold, '#c9ced2', '#d9915a'];
      order.forEach((p_, j) => { const x = W2 * 0.33 + (j - 1) * 70, h = hs[p_] * u; box(x - 28, 200 - h, 56, h, 10, cols[p_]); txt(String(p_ + 1), x, 200 - h + 18, 16, '#4a3400'); avatar(x, 200 - h - 20, 13, [blue, pink, green][p_], ['A', 'B', 'C'][p_]); });
      g.strokeStyle = line; g.lineWidth = 2; g.beginPath(); g.moveTo(W2 * 0.12, 201); g.lineTo(W2 * 0.55, 201); g.stroke();
      txt('Top 3 this week', W2 * 0.33, 230, 13, soft, 700);
      const mx = W2 * 0.76, my = 118, w = 150, h = 110;
      box(mx - w / 2, my - h / 2, w, h, 12, dk ? '#2d3a2f' : '#cfe6b8', line);
      box(mx - w / 2 + 12, my - h / 2 + 12, 44, 30, 8, dk ? '#1f2a22' : '#b9d8a0'); box(mx + 10, my + 10, 50, 28, 8, dk ? '#1f2a22' : '#b9d8a0'); box(mx + w / 2 - 28, my - h / 2, 28, h, 0, dk ? '#3a5a7a' : '#8fd0e8');
      for (let j = 0; j < 4; j++) dot(mx - 50 + j * 32, my - 12 + (j % 2) * 40, 5, [pink, blue, green, gold][j]);
      const px = mx + Math.cos(t * 1.2) * 34, py = my + Math.sin(t * 1.2) * 22; pointer(px, py, false);
      txt('Seed map', mx, 190, 13, soft, 700); pill('Tap to see a run', mx, 220, plate, ink, 12);
    }
  } else if (k === 'store' || k === 'crate') {
    const crates = () => {                                 // three crates, their prices, one lid lifting at a time
      const names = ['Colour', 'Item', 'Object'], price = ['\u25ce150', '\u25ce200', '\u25ce250'], cols = ['#ff8ab0', '#6cc6ff', '#ffc933'], on = Math.floor(t * 0.8) % 3;
      for (let j = 0; j < 3; j++) {
        const x = W2 / 2 + (j - 1) * 150, y = 128 + (j === on ? -4 : 0), lift = j === on ? 6 + Math.sin(t * 5) * 2 : 0;
        dot(x + 3, y + 36, 42, 'rgba(0,0,0,.16)');
        box(x - 40, y - 10, 80, 50, 12, cols[j]); box(x - 40, y - 10, 80, 50, 12, 'rgba(0,0,0,.12)');
        box(x - 40, y - 10, 80, 22, 10, cols[j]); box(x - 6, y - 12, 12, 54, 6, 'rgba(255,255,255,.35)');
        box(x - 46, y - 24 - lift, 92, 22, 10, cols[j]); box(x - 46, y - 24 - lift, 92, 22, 10, 'rgba(255,255,255,.2)');
        if (lift) { dot(x, y - 30 - lift, 8 + Math.sin(t * 6) * 2, 'rgba(255,255,255,.55)'); txt('?', x, y - 30 - lift, 15, ink); }
        txt(names[j] + ' crate', x, y + 62, 13, ink); txt(price[j], x, y + 82, 13, soft, 700);
      }
      txt('3 of each per hour', W2 / 2, 236, 13, soft, 700);
    };
    if (k === 'store' && i === 0) {                        // the store, a clock, and the hour's six items and six colours
      store(W2 * 0.2, 118, 1.5, 1); clock(W2 * 0.5, 84, 30, t * 0.9, ink); txt('restocks on the hour', W2 * 0.5, 134, 12, soft, 700);
      const gen = Math.floor(t * 0.9 / 6.283);
      for (let j = 0; j < 6; j++) { const x = W2 * 0.68 + (j % 3) * 42, y = 62 + Math.floor(j / 3) * 42, c = ['#ff8ab0', '#6cc6ff', '#ffc933', '#7ff0c8', '#c59bff', '#ff9f6a'][(j + gen) % 6]; box(x - 16, y - 16, 32, 32, 9, plate, line); dot(x, y, 9, c); }
      txt('6 items', W2 * 0.68 + 42, 136, 12, soft, 700);
      for (let j = 0; j < 6; j++) { const x = W2 * 0.68 - 8 + j * 25, c = ['#e0483e', '#2f7de1', '#43d17a', '#ffc933', '#8a5bff', '#ff6fb5'][(j + gen * 2) % 6]; dot(x, 168, 9, c); }
      txt('6 colours', W2 * 0.68 + 54, 192, 12, soft, 700);
      pill('\u25ce 2 for every 3 parcels', W2 * 0.2, 214, plate, ink, 12);
    } else if (k === 'store' && i === 1) {                 // the star coin, a special tag, and where stars come from
      const y = H2 * 0.46 + bob, gr = g.createRadialGradient(W2 * 0.35 - 12, y - 12, 4, W2 * 0.35, y, 44); gr.addColorStop(0, '#efe0ff'); gr.addColorStop(1, '#9a6bff');
      for (let j = 0; j < 5; j++) { const a = t * 0.8 + j * 1.2566, r_ = 58 + Math.sin(t * 3 + j) * 4; dot(W2 * 0.35 + Math.cos(a) * r_, y + Math.sin(a) * r_ * 0.6, 3 + (j % 2), 'rgba(255,255,255,.7)'); }
      dot(W2 * 0.35 + 3, y + 5, 44, 'rgba(0,0,0,.15)'); g.fillStyle = gr; g.beginPath(); g.arc(W2 * 0.35, y, 44, 0, 6.3); g.fill(); txt('\u2726', W2 * 0.35, y + 2, 40, '#3a1f7a');
      box(W2 * 0.58, 50, 190, 120, 16, plate, line); txt('Daily special', W2 * 0.58 + 95, 76, 15, ink); box(W2 * 0.58 + 30, 92, 130, 36, 10, 'rgba(154,107,255,.18)'); txt('\u2726 ' + (8 + Math.floor(t * 0.3) % 3 * 2), W2 * 0.58 + 95, 111, 16, '#7a4fd1');
      txt('one a day', W2 * 0.58 + 95, 148, 12, soft, 700);
      pill('\u2726 come from Frantic cities', W2 / 2, 214, '#ff6f61', '#fff', 12);
    } else if (k === 'store' || i === 0) crates();
    else {                                                 // the odds, and never a duplicate
      const w = 420, x0 = W2 / 2 - w / 2, y = 86, segs = [[70, '#8fb6c9', 'Standard 70%'], [25, '#8a5bff', 'Rare 25%'], [5, gold, 'Unique 5%']];
      let x = x0; g.save(); rr_(g, x0, y, w, 34, 12); g.clip();
      segs.forEach(([p_, c, l]) => { const sw = w * p_ / 100; g.fillStyle = c; g.fillRect(x, y, sw, 34); if (p_ > 10) txt(l, x + sw / 2, y + 18, 13, '#fff'); x += sw; });
      g.restore(); txt('Unique 5%', x0 + w - 8, y + 54, 13, '#b08a00', 800, 'right');
      const mu = (t * 0.22) % 1, mx = x0 + w * mu; g.strokeStyle = ink; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(mx, y - 10); g.lineTo(mx, y + 44); g.stroke(); dot(mx, y - 14, 6, ink);
      const seen = [pink, blue, green, purple], got = Math.floor(t * 0.7) % 5;
      txt('Already yours', W2 * 0.3, 164, 12, soft, 700); for (let j = 0; j < 4; j++) { box(W2 * 0.3 + (j - 1.5) * 38 - 15, 182, 30, 30, 9, plate, line); dot(W2 * 0.3 + (j - 1.5) * 38, 197, 8, seen[j]); }
      txt('From a crate', W2 * 0.72, 164, 12, soft, 700); box(W2 * 0.72 - 20, 177, 40, 40, 11, gold); dot(W2 * 0.72, 197, 10, got < 4 ? ['#ff9f6a', '#7ff0c8', '#c59bff', '#6cc6ff'][got] : '#ffffff');
      txt('never a duplicate', W2 * 0.72, 234, 12, soft, 700);
    }
  } else if (k === 'chats') {
    if (i === 0) {                                         // the list on the left, the open chat on the right, bubbles arriving
      box(24, 20, 170, 210, 14, plate, line);
      [['M', 'maya', blue], ['J', 'jonah', green], ['R', 'rae', pink]].forEach(([ch, n, c], j) => { const y = 48 + j * 56; if (!j) box(34, y - 20, 150, 44, 10, 'rgba(255,201,51,.2)'); avatar(56, y, 13, c, ch); txt(n, 80, y - 5, 13, ink, 800, 'left'); txt(j ? 'see you there' : 'nice run!', 80, y + 11, 11, soft, 600, 'left'); });
      box(212, 20, 324, 210, 14, plate, line); avatar(238, 44, 11, blue, 'M'); txt('maya', 256, 45, 13, ink, 800, 'left');
      const msgs = [['nice run!', 0], ['thanks, that bridge saved me', 1], ['rematch tonight?', 0], ['you\u2019re on', 1]], n = Math.floor((t * 0.9) % 6);
      msgs.forEach(([m, me], j) => { if (j >= n) return; const u = ease((t * 0.9 % 6 - j) * 3), y = 76 + j * 36; g.font = '700 13px Overpass, system-ui, sans-serif'; const w = g.measureText(m).width + 24; const x = me ? 520 - w : 226; g.globalAlpha = u; box(x, y - 2 + (1 - u) * 6, w, 28, 12, me ? gold : (dk ? 'rgba(255,255,255,.14)' : '#ffffff')); txt(m, x + w / 2, y + 13 + (1 - u) * 6, 13, me ? '#4a3400' : ink, 700); g.globalAlpha = 1; });
      dot(170, 48, 8, pink); txt('2', 170, 49, 10, '#fff');
    } else {                                               // tapping the name at the top opens their profile
      const ph = (t * 0.7) % 3, down = ph > 1 && ph < 1.25, open = ease(ph - 1.1);
      box(60, 20, 440, 44, 14, plate, line); avatar(88, 42, 13, blue, 'M'); txt('maya', 112, 43, 15, ink, 800, 'left'); dot(168, 43, 4, green); txt('online', 177, 44, 11, green, 700, 'left');
      if (open > 0) {
        g.globalAlpha = open; const y = 74 + (1 - open) * 10;
        box(60, y, 440, 150, 14, plate, line); avatar(100, y + 36, 20, blue, 'M'); txt('maya', 134, y + 30, 18, ink, 800, 'left'); txt('Best: 1,284 parcels \u00b7 week 9', 134, y + 50, 12, soft, 700, 'left');
        [['Records', plate, ink], ['Challenge', gold, '#4a3400'], ['Block', plate, ink], ['Report', plate, ink]].forEach(([l, c, fg], j) => pill(l, 125 + j * 102, y + 112, c, fg, 12));
        g.globalAlpha = 1;
      }
      pointer(150 + (ph < 1 ? (1 - ease(ph)) * 120 : 0), 58 + (ph < 1 ? (1 - ease(ph)) * 90 : 0), down);
    }
  } else if (k === 'friends') {
    if (i === 0) {                                         // typing a username into the Add box, and the friend appearing
      const name = 'maya_k', ph = (t * 0.9) % 6, nch = Math.min(name.length, Math.floor(ph * 2)), added = ph > 4, u = ease((ph - 4) * 2);
      box(60, 36, 330, 44, 12, plate, line); txt(nch ? name.slice(0, nch) : 'Add a friend by username', 76, 58, 14, nch ? ink : soft, 700, 'left');
      if (nch && nch < name.length && Math.floor(t * 3) % 2) { g.font = '700 14px Overpass, system-ui, sans-serif'; g.textAlign = 'left'; const cw = g.measureText(name.slice(0, nch)).width; box(78 + cw, 48, 2, 20, 1, ink); }
      box(400, 36, 100, 44, 12, added ? green : gold); txt(added ? '\u2713' : 'Add', 450, 59, 15, added ? '#fff' : '#4a3400');
      pointer(450 + (ph > 3.5 ? 0 : (1 - ease((ph - 3) * 2)) * 60), 58 + (ph > 3.5 ? 0 : (1 - ease((ph - 3) * 2)) * 80), ph > 3.6 && ph < 4.1);
      if (u > 0) { g.globalAlpha = u; box(60, 110 + (1 - u) * 10, 440, 54, 12, plate, line); avatar(90, 137 + (1 - u) * 10, 15, blue, 'M'); txt('maya_k', 116, 137 + (1 - u) * 10, 15, ink, 800, 'left'); dot(430, 137 + (1 - u) * 10, 5, green); txt('online', 442, 138 + (1 - u) * 10, 12, soft, 700, 'left'); g.globalAlpha = 1; }
      txt('Friend added', W2 / 2, 206, 13, added ? green : 'rgba(0,0,0,0)', 800);
    } else {                                               // records, the head-to-head score, and Watch live
      box(30, 22, 250, 206, 14, plate, line); avatar(60, 50, 16, blue, 'M'); txt('maya_k', 86, 50, 17, ink, 800, 'left');
      txt('Records', 48, 88, 12, soft, 700, 'left');
      [['Standard', 1284, blue], ['Frantic', 611, pink], ['Expert', 402, purple]].forEach(([l, v, c], j) => { const y = 108 + j * 34, u = ease(t * 0.7 - j * 0.2); txt(l, 48, y, 12, ink, 700, 'left'); box(120, y - 7, 106, 14, 7, dk ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.07)'); box(120, y - 7, 106 * (v / 1400) * u, 14, 7, c); txt(String(Math.round(v * u)), 266, y, 11, soft, 700, 'right'); });
      box(300, 22, 230, 96, 14, plate, line); txt('Head-to-head', 415, 44, 12, soft, 700); txt('3', 365, 82, 30, gold); txt('\u2013', 415, 82, 22, soft); txt('2', 465, 82, 30, ink); txt('you', 365, 106, 10, soft, 700); txt('them', 465, 106, 10, soft, 700);
      box(300, 134, 230, 94, 14, plate, line); const pl = 0.5 + 0.5 * Math.sin(t * 4); dot(330, 160, 6 + pl * 2, green); dot(330, 160, 12 + pl * 4, 'rgba(67,209,122,' + (0.3 - pl * 0.2).toFixed(2) + ')'); txt('Playing now', 346, 160, 13, ink, 800, 'left');
      pill('Watch live', 415, 200, gold, '#4a3400', 13);
    }
  }
  animT = keepAnim; Object.assign(SUN, keepSun); g.setTransform(1, 0, 0, 1, 0, 0);
}
/* the triggers: wrap the menu functions rather than editing them (function declarations are reassignable bindings) */
const _showMM0 = showMM;
showMM = function (pane) { _showMM0(pane); if (pane === 'weekly' || pane === 'store' || pane === 'chats' || pane === 'friends') maybeGuide(pane); };
const _renderPlay0 = renderPlay;
renderPlay = function () { _renderPlay0(); if (playMode === 'iso' && mmPane === 'play' && $('m-start') && !$('m-start').hidden) maybeGuide('iso'); };
const _openCrate0 = openCrate;
openCrate = function (kind, sure, free) { if (!free && CRATES[kind] && !guideSeen('crate') && maybeGuide('crate')) return false; return _openCrate0(kind, sure, free); };
{
  const nx = $('gd-next'), bk = $('gd-back'), rg = $('btn-guides');
  if (nx) nx.addEventListener('click', () => { if (gdCard < (GUIDES[gdKey] || []).length - 1) { gdCard++; renderGuide(); } else closeGuide(); });
  if (bk) bk.addEventListener('click', () => { if (gdCard > 0) { gdCard--; renderGuide(); } });
  if (rg) rg.addEventListener('click', () => { try { localStorage.removeItem(GUIDES_KEY); } catch (e) {} toast('Guides reset: each one shows again the next time you open its section.', 'good'); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('m-guide') && !$('m-guide').hidden) { e.stopPropagation(); closeGuide(); } }, true);
}


/* ===== p62 replays and living cities =====
   C5: one compact frame (citySnap) per city day goes into replayFrames; the game-over screen plays them back with a
   slow camera and can record a .webm. C7: houses grow past the villa with lifetime deliveries and busy stores become
   malls; big cities get four named districts; pedestrians stroll the pavements; snow, fog and heatwaves join the rain;
   windows and street lamps light up at night. Hooks wrap drawOutside / drawNight / resetGame / showGameOver. ===== */

/* ---------------------------------------------------------------- C5 recording */
function replayTick() {
  if (!started || over || demoMode || spectating || tutorialMode) return;
  const d = Math.floor(clock / CFG.dayLengthSeconds);
  if (d === replayDay) return;
  replayDay = d; replayPush();
}
function replayPush() {
  replayFrames.push({t: Math.round(clock), score, week, snap: citySnap()});
  if (replayFrames.length > 240) { const keep = replayFrames.length - 120; replayFrames = replayFrames.filter((f, i) => i >= keep || i % 2 === 0); }   // thin the older half
}
/* what the save keeps: the last 120 frames, trimmed from the front to stay under 300 KB */
function replayStore() {
  const out = replayFrames.slice(-120); let tot = 0;
  for (const f of out) tot += f.snap.length + 48;
  while (out.length > 3 && tot > 300000) tot -= out.shift().snap.length + 48;
  return out;
}

/* ---------------------------------------------------------------- C5 playback */
const RP_S = 720, rp = {open: false, t: 0, dur: 20, playing: false, speed: 1, raf: 0, last: 0, rec: null, card: null, cardT: 0, drag: false, cache: new Map()};
function rpFrameCanvas(i) {
  let c = rp.cache.get(i);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = RP_S; drawCitySnap(c, replayFrames[i].snap); rp.cache.set(i, c);
    if (rp.cache.size > 6) rp.cache.delete(rp.cache.keys().next().value);
  }
  return c;
}
function openReplay() {
  if (replayFrames.length < 2) { toast('Not enough of this city was recorded for a replay yet', 'warn'); return false; }
  rp.cache.clear(); rp.t = 0; rp.speed = 1; rp.dur = clamp(replayFrames.length * 0.35, 12, 60); rp.playing = true; rp.open = true; rp.rec = null; rp.card = null; rp.cardT = 0; rp.drag = false;
  openModal('m-replay'); rpMarks(); rpSetBusy(false);
  const sv = $('rp-save'); if (sv) sv.hidden = typeof MediaRecorder === 'undefined' || !$('rp-cv').captureStream;
  cancelAnimationFrame(rp.raf); rp.last = performance.now();
  const loop = now => { if (!rp.open) return; const dt = Math.min(0.1, (now - rp.last) / 1000); rp.last = now; rpStep(dt); rp.raf = requestAnimationFrame(loop); };
  rp.raf = requestAnimationFrame(loop);
  rpDraw(0); rpSync();
  return true;
}
function closeReplay() {
  if (!rp.open) return;
  rp.open = false; cancelAnimationFrame(rp.raf);
  if (rp.rec && rp.rec.state !== 'inactive') { try { rp.rec.stop(); } catch (e) {} }
  rp.rec = null; rp.card = null; rp.cache.clear(); closeModal('m-replay');
}
function rpStep(dt) {
  if (rp.playing) {
    rp.t += dt * rp.speed;
    if (rp.t >= rp.dur) { rp.t = rp.dur; if (rp.rec) rp.cardT += dt; else rp.playing = false; }
  }
  rpDraw(rp.t);
  if (rp.rec && rp.cardT >= 2) rpFinishRec();
  rpSync();
}
const rpFrameAt = t => { const n = replayFrames.length; return n > 1 ? clamp(t / rp.dur, 0, 1) * (n - 1) : 0; };
/* the picture: a slow push-in from 1.15x to 1.03x with a gentle drift, crossfading frame to frame (neither under reduced motion) */
function rpDraw(t) {
  const cv2 = $('rp-cv'); if (!cv2 || !replayFrames.length) return;
  const g = cv2.getContext('2d'), n = replayFrames.length, S = RP_S;
  const p = rpFrameAt(t), i = Math.min(n - 1, Math.floor(p)), u = p - i, j = Math.min(n - 1, i + 1);
  const k = clamp(t / rp.dur, 0, 1), z = 1.15 - 0.12 * (1 - Math.pow(1 - k, 3));
  const dr = REDUCED_MOTION ? 0 : 1, dx = Math.sin(t * 0.21) * 9 * dr, dy = Math.cos(t * 0.17) * 7 * dr;
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.fillStyle = PAL.land; g.fillRect(0, 0, S, S);
  g.translate(S / 2 + dx, S / 2 + dy); g.scale(z, z); g.translate(-S / 2, -S / 2);
  const cross = !REDUCED_MOTION && j !== i && u > 0;
  g.drawImage(rpFrameCanvas(cross || u < 0.5 ? i : j), 0, 0);
  if (cross) { g.globalAlpha = u; g.drawImage(rpFrameCanvas(j), 0, 0); g.globalAlpha = 1; }
  g.setTransform(1, 0, 0, 1, 0, 0);
  const f = replayFrames[u >= 0.5 ? j : i], cap = 'Week ' + f.week + ' \u00b7 ' + f.score.toLocaleString('en-US') + ' parcel' + (f.score === 1 ? '' : 's');
  g.font = '800 26px Overpass, system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
  const w = g.measureText(cap).width + 40;
  roundPath(g, 24, S - 70, w, 46, 23); g.fillStyle = 'rgba(10,22,30,.62)'; g.fill();
  g.fillStyle = '#f2f7f6'; g.fillText(cap, 44, S - 46);
  if (rp.card && rp.cardT > 0) {                                                   // the final two seconds of a recording: the run card
    const a = clamp(rp.cardT / 0.4, 0, 1), h = S * 630 / 1200;
    g.globalAlpha = a; g.fillStyle = '#0b1a22'; g.fillRect(0, 0, S, S); g.drawImage(rp.card, 0, (S - h) / 2, S, h); g.globalAlpha = 1;
  }
}
function rpSync() {
  const n = replayFrames.length; if (!n) return;
  const f = replayFrames[Math.min(n - 1, Math.round(rpFrameAt(rp.t)))];
  const cap = $('rp-cap'); if (cap) cap.textContent = 'Week ' + f.week + ' \u00b7 ' + f.score.toLocaleString('en-US') + ' parcel' + (f.score === 1 ? '' : 's') + (rp.rec ? ' \u00b7 recording\u2026' : '');
  const bar = $('rp-bar'); if (bar && !rp.drag) bar.value = String(Math.round(clamp(rp.t / rp.dur, 0, 1) * 1000));
  const pl = $('rp-play'); if (pl) pl.textContent = rp.playing ? 'Pause' : rp.t >= rp.dur ? 'Replay' : 'Play';
  const sp = $('rp-speed'); if (sp) sp.textContent = rp.speed + '\u00d7';
}
/* week ticks under the scrub bar, labelled when there is room */
function rpMarks() {
  const box = $('rp-marks'); if (!box) return;
  const n = replayFrames.length, every = Math.max(1, Math.ceil(replayFrames[n - 1].week / 8));
  let h = '', last = -1;
  replayFrames.forEach((f, i) => { if (f.week === last) return; last = f.week; const x = n > 1 ? i / (n - 1) * 100 : 0; h += '<i style="left:' + x.toFixed(2) + '%"></i>' + ((f.week - 1) % every === 0 ? '<b style="left:' + x.toFixed(2) + '%">W' + f.week + '</b>' : ''); });
  box.innerHTML = h;
}
function rpSetBusy(on) { for (const id of ['rp-bar', 'rp-play', 'rp-speed', 'rp-save']) { const el = $(id); if (el) el.disabled = !!on; } }
/* record the replay at 1x through captureStream + MediaRecorder (webm, vp9 if the browser has it), then the run card for 2 s */
function rpExport() {
  if (!rp.open || rp.rec || typeof MediaRecorder === 'undefined') return false;
  const cv2 = $('rp-cv'); if (!cv2 || !cv2.captureStream) return false;
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(m => { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } }) || '';
  const st = overStats();
  rp.card = makeShareCard({pic: $('over-pic'), kicker: DIFF.label + ' \u00b7 ' + (lastRun.newBest ? 'new personal best' : 'week ' + week), big: score.toLocaleString('en-US'), bigLabel: 'parcels delivered',
    title: 'Survived ' + week + ' week' + (week === 1 ? '' : 's'), stats: [['Weeks', week], st[1], st[2], st[3], st[4], ['Best', best.toLocaleString('en-US')]], line: 'Can you beat it?'});
  let rec; const chunks = [];
  try { rec = new MediaRecorder(cv2.captureStream(30), mime ? {mimeType: mime, videoBitsPerSecond: 5e6} : undefined); } catch (e) { toast('Video recording isn\u2019t available here', 'warn'); return false; }
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    const wasOpen = rp.open && rp.rec === rec; rp.rec = null; rp.card = null; rp.cardT = 0; rp.playing = false; rpSetBusy(false); rpSync();
    if (!wasOpen) return;
    const blob = new Blob(chunks, {type: mime || 'video/webm'});
    if (!blob.size) { toast('The recording came out empty', 'warn'); return; }
    saveFile(blob, 'junction-replay.webm').then(ok => toast(ok ? 'Replay saved as junction-replay.webm' : 'Saving isn\u2019t available here', ok ? 'good' : 'warn'));
  };
  rp.rec = rec; rp.t = 0; rp.speed = 1; rp.playing = true; rp.cardT = 0; rpSetBusy(true); rpDraw(0);
  try { rec.start(250); } catch (e) { rp.rec = null; rp.card = null; rpSetBusy(false); toast('Video recording isn\u2019t available here', 'warn'); return false; }
  rpSync(); return true;
}
function rpFinishRec() { const r = rp.rec; if (r && r.state === 'recording') { try { r.stop(); } catch (e) { rp.rec = null; rp.card = null; rpSetBusy(false); } } }
{
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  on('btn-replay', 'click', () => openReplay());
  on('rp-close', 'click', closeReplay);
  on('rp-play', 'click', () => { if (rp.rec) return; if (!rp.playing && rp.t >= rp.dur) rp.t = 0; rp.playing = !rp.playing; rpSync(); });
  on('rp-speed', 'click', () => { if (rp.rec) return; rp.speed = rp.speed === 1 ? 2 : 1; rpSync(); });
  on('rp-save', 'click', () => rpExport());
  on('rp-bar', 'pointerdown', () => { rp.drag = true; });
  on('rp-bar', 'input', e => { if (rp.rec) return; rp.t = (+e.target.value / 1000) * rp.dur; rp.playing = false; rpDraw(rp.t); rpSync(); });
  on('rp-bar', 'change', e => { rp.drag = false; if (rp.rec) return; rp.t = (+e.target.value / 1000) * rp.dur; rpDraw(rp.t); rpSync(); });
  document.addEventListener('pointerup', () => { rp.drag = false; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && rp.open) { e.stopPropagation(); closeReplay(); } }, true);
}
const _sGO62 = showGameOver;
showGameOver = function (why) {
  if (started && !demoMode && !spectating && !tutorialMode && (!replayFrames.length || clock - replayFrames[replayFrames.length - 1].t > 5)) replayPush();   // the closing frame
  _sGO62(why);
  const b = $('btn-replay'); if (b) b.hidden = replayFrames.length < 3;
};

/* ---------------------------------------------------------------- C7.1 growth tiers */
function houseTier(b) { const d = b.delivered || 0; return d >= 300 ? 3 : d >= 150 ? 2 : d >= 60 ? 1 : 0; }
function isMall(b) { return (b.served || 0) >= 400 && storeDesign() === 'standard'; }
/* in the house's own frame (front at +y): 1 townhouse, 2 apartments, 3 tower. Rounded blocks, more windows each
   step, the house colour on the trim and the door, the glyph on the roof */
function drawHouseTier(b, col, tier) {
  const dark = shade(col, -0.45), trim = shade(col, -0.18), wall = PAL.roofBase, wall2 = shade(PAL.roofBase, -0.08), wall3 = shade(PAL.roofBase, 0.06);
  if (tier === 1) {
    rr(-12, -14, 24, 17.5, 3); ctx.fillStyle = wall; ctx.fill();
    rr(-12, -14, 24, 3.4, 3); ctx.fillStyle = trim; ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.1)'; sfr(-12, -10.6, 24, 0.7);
    ctx.fillStyle = 'rgba(0,0,0,.07)'; sfr(-0.35, -10.6, 0.7, 14);                                     // the party wall
    for (const wy of [-8.4, -3.6]) for (let i = 0; i < 4; i++) win(-10 + i * 5.6 + (i > 1 ? 1.2 : 0), wy, 2.6, 2);
    for (const dx of [-6.5, 5.5]) { rr(dx - 1.4, 0.2, 2.8, 3.3, 0.6); ctx.fillStyle = dark; ctx.fill(); }
    ctx.fillStyle = '#4a4f54'; ctx.fillRect(7.2, -13.4, 2.4, 2.6);
    if (showSymbols) glyph(COLORS[b.color].glyph, 0, -12.3, 2, 'rgba(255,255,255,.92)');
  } else if (tier === 2) {
    rr(-12, -14, 24, 17.5, 3); ctx.fillStyle = wall2; ctx.fill();
    rr(-12, -14, 24, 2.4, 3); ctx.fillStyle = trim; ctx.fill();
    rr(-8, -16.5, 16, 20, 3); ctx.fillStyle = wall; ctx.fill();                                           // the taller middle block
    rr(-8, -16.5, 16, 2.6, 3); ctx.fillStyle = trim; ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.1)'; sfr(-8, -13.9, 16, 0.6);
    for (const wy of [-11.2, -6.6, -2]) for (let i = 0; i < 3; i++) win(-5.4 + i * 4.2, wy, 2.4, 1.9);
    for (const wx of [-11.2, 8.8]) for (const wy of [-8.6, -4]) win(wx, wy, 2.4, 1.9);
    rr(-2.2, 0, 4.4, 3.5, 0.8); ctx.fillStyle = dark; ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(-0.15, 0.2, 0.3, 3.2);
    ctx.fillStyle = '#9aa3a8'; rr(2.5, -15.5, 4, 2.8, 0.8); ctx.fill();                                   // plant room
    if (showSymbols) glyph(COLORS[b.color].glyph, 0, -15.2, 1.8, 'rgba(255,255,255,.92)');
  } else {
    rr(-12, -14, 24, 17.5, 3); ctx.fillStyle = wall2; ctx.fill();
    rr(-12, -14, 24, 2.2, 3); ctx.fillStyle = trim; ctx.fill();
    rr(-7, -19, 14, 22.5, 3); ctx.fillStyle = wall3; ctx.fill();                                          // the tower
    ctx.fillStyle = 'rgba(0,0,0,.08)'; sfr(5.2, -19, 1.8, 22.5);
    rr(-7, -19, 14, 2.6, 3); ctx.fillStyle = col; ctx.fill();
    for (let r = 0; r < 4; r++) for (let i = 0; i < 3; i++) win(-5.3 + i * 3.9, -15.4 + r * 4.1, 2.2, 1.8);
    for (const wx of [-11.2, 8.8]) for (const wy of [-9, -4.4]) win(wx, wy, 2.4, 1.9);
    rr(-2.2, 0, 4.4, 3.5, 0.8); ctx.fillStyle = dark; ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(-0.15, 0.2, 0.3, 3.2);
    ctx.fillStyle = '#9aa3a8'; rr(-4, -18.2, 5, 2.4, 0.8); ctx.fill();
    ctx.fillStyle = '#ff5a4a'; ctx.beginPath(); ctx.arc(3.5, -17.2, 0.9, 0, 6.3); ctx.fill();                   // the aircraft light
    if (showSymbols) glyph(COLORS[b.color].glyph, 0, -11.2, 1.7, 'rgba(255,255,255,.92)');
  }
}

/* ---------------------------------------------------------------- C7.2 district names */
function districtNames() {
  const st = buildings.find(b => b.type === 'store'), key = st ? st.k : 0;
  if (key === distKey && distNames) return distNames;
  distKey = key; const pool = DISTRICT_NAMES.slice(), out = [];
  for (let i = 0; i < 4; i++) out.push(pool.splice(Math.floor(hash01(key, 11 + i) * pool.length), 1)[0]);
  return distNames = out;
}
/* soft pills at the four quadrant centres of a city 16+ tiles across, at low zoom only, fading in as you zoom out */
function drawDistricts(vr) {
  if (span < 16 || cam.z >= 1.1 || demoMode || distOff) return;
  const a = clamp((1.1 - cam.z) / 0.3, 0, 1) * 0.9; if (a <= 0.02) return;
  const names = districtNames(), q = camSpan * CELL / 4, x0 = camOrg * CELL, fs = 13 / cam.z, pad = 9 / cam.z, h = 22 / cam.z;
  ctx.save(); ctx.globalAlpha = a; ctx.font = '800 ' + fs.toFixed(2) + 'px Overpass, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < 4; i++) {
    const cx_ = x0 + q * (i % 2 ? 3 : 1), cy_ = x0 + q * (i < 2 ? 1 : 3);
    if (cx_ < vr.x0 - 120 || cx_ > vr.x1 + 120 || cy_ < vr.y0 - 40 || cy_ > vr.y1 + 40) continue;
    const w = ctx.measureText(names[i]).width + pad * 2;
    rr(cx_ - w / 2, cy_ - h / 2, w, h, h / 2); ctx.fillStyle = theme === 'dark' ? 'rgba(10,22,30,.6)' : 'rgba(255,255,255,.72)'; ctx.fill();
    ctx.fillStyle = PAL.ink; ctx.fillText(names[i], cx_, cy_ + 0.6 / cam.z);
  }
  ctx.restore();
}
const _dO62 = drawOutside;
drawOutside = function (vr) { _dO62(vr); drawDistricts(vr); };
const _cP62 = cityPicture;                                                       // no labels in the game-over picture and share card
cityPicture = function (cv2) { distOff = true; try { return _cP62(cv2); } finally { distOff = false; } };

/* ---------------------------------------------------------------- C7.3 pedestrians
   A fixed pool of PED_MAX walkers (no allocation per frame). Each spawns on a lane leaving a house's road node and
   strolls along the pavement (roadWidth/2 + 3 off the centre line), turns onto a random lane at junctions and leaves
   after 20-40 s. Off when decoration is below 0.6 or the camera is too far out to see them. Math.random, never
   rand(): the seeded expert sim must not notice them. */
function pedsOn() { return false; }   // 2.3.1: the walking pavement dots are switched off
function pedSpawn(p) {
  let h = null;
  for (let tries = 0; tries < 4 && !h; tries++) { const b = buildings[Math.floor(Math.random() * buildings.length)]; if (b && b.type === 'house' && b.acc >= 0 && nodes[b.acc]) h = b; }
  if (!h) return false;
  const nd = nodes[h.acc]; let n = 0;
  for (const e of nd.outs) if (!e.dead && !e.fast) n++;
  if (!n) return false;
  let pick = Math.floor(Math.random() * n), e = null;
  for (const o of nd.outs) if (!o.dead && !o.fast && pick-- === 0) { e = o; break; }
  p.on = true; p.e = e; p.s = e.r0 + Math.random() * Math.max(1, e.stop - e.r0); p.side = Math.random() < 0.5 ? 1 : -1; p.dir = Math.random() < 0.5 ? 1 : -1;
  p.spd = 7 + Math.random() * 5; p.life = 20 + Math.random() * 20; p.col = Math.floor(Math.random() * PED_COLS.length);
  pedN++; return true;
}
function pedPose(p) { const e = p.e, off = p.side * (CFG.roadWidth / 2 + 3); p.x = e.ax + e.ux * p.s + e.nx * off; p.y = e.ay + e.uy * p.s + e.ny * off; }
function stepPeds(dt) {
  if (!pedsOn()) { if (pedN) { for (const p of peds) p.on = false; pedN = 0; } return; }
  pedSpawnT -= dt;
  if (pedSpawnT <= 0 && pedN < PED_MAX && buildings.length) { pedSpawnT = 0.35; for (const p of peds) if (!p.on) { pedSpawn(p); break; } }
  for (const p of peds) {
    if (!p.on) continue;
    p.life -= dt; const e = p.e;
    if (p.life <= 0 || e.dead) { p.on = false; pedN--; continue; }
    p.s += p.spd * p.dir * dt;
    if (p.s > e.stop || p.s < e.r0) {                                                // at the end of the lane: turn onto another, or come back
      const nd = nodes[p.dir > 0 ? e.b : e.a]; let n = 0, nx = null;
      if (nd) for (const o of nd.outs) if (!o.dead && !o.fast && o !== e && !(o.a === e.b && o.b === e.a)) n++;
      if (n) { let pick = Math.floor(Math.random() * n); for (const o of nd.outs) if (!o.dead && !o.fast && o !== e && !(o.a === e.b && o.b === e.a) && pick-- === 0) { nx = o; break; } }
      if (nx) { p.e = nx; p.dir = 1; p.s = nx.r0 + 0.1; }
      else { p.dir = -p.dir; p.side = -p.side; p.s = clamp(p.s, e.r0, e.stop); }
    }
    pedPose(p);
  }
}
/* two-pixel walkers: a coloured body dot and a darker head a touch ahead; one fill per colour, one for the heads */
function drawPeds() {
  if (!pedN || !pedsOn()) return;
  const vr = viewRect(), m = 8;
  for (let c = 0; c < PED_COLS.length; c++) {
    let any = false; ctx.beginPath();
    for (const p of peds) { if (!p.on || p.col !== c || p.x < vr.x0 - m || p.x > vr.x1 + m || p.y < vr.y0 - m || p.y > vr.y1 + m) continue; any = true; ctx.moveTo(p.x + 1.7, p.y); ctx.arc(p.x, p.y, 1.7, 0, 6.3); }
    if (any) { ctx.fillStyle = PED_COLS[c]; ctx.fill(); }
  }
  ctx.beginPath();
  for (const p of peds) { if (!p.on || p.x < vr.x0 - m || p.x > vr.x1 + m || p.y < vr.y0 - m || p.y > vr.y1 + m) continue; const hx = p.x + p.e.ux * p.dir * 0.55, hy = p.y + p.e.uy * p.dir * 0.55; ctx.moveTo(hx + 1, hy); ctx.arc(hx, hy, 1, 0, 6.3); }
  ctx.fillStyle = '#3a3230'; ctx.fill();
}

/* ---------------------------------------------------------------- C7.4 weather */
function startWeather(kind, secs) {
  if (!WEATHER_START[kind]) return false;
  weather.kind = kind; weather.t = secs || 60 + Math.random() * 30; weatherSeen[kind] = true;
  toast(kind === 'snow' && perks.plough ? 'Snow \u2014 the ploughs are out, so the roads stay clear' : WEATHER_START[kind], 'warn');
  return true;
}
function weatherTick(dt) {
  weather.amt += ((weather.t > 0 ? 1 : 0) - weather.amt) * Math.min(1, dt * 0.5);
  if (weather.t > 0) { weather.t -= dt; if (weather.t <= 0) { weather.t = 0; toast(WEATHER_END[weather.kind] || 'The weather has cleared'); } }
  else if (weather.amt < 0.02 && weather.kind !== 'clear') { weather.kind = 'clear'; weather.amt = 0; }
  if (spectating || demoMode || tutorialMode || !started || over || !(diffKey === 'standard' || diffKey === 'frantic')) return;
  weatherTimer -= dt;
  if (weatherTimer <= 0) {
    weatherTimer = 240 + Math.random() * 180;
    if (weather.t > 0 || rain.t > 0) return;
    const r = Math.random(), winter = mapPrefs && mapPrefs.theme === 'winter';
    const kind = winter && r < 0.5 ? 'snow' : r < 0.25 ? 'snow' : r < 0.5 ? 'fog' : r < 0.75 ? 'heat' : '';
    if (kind) startWeather(kind);
  }
}
/* screen-space: drifting flakes, a white veil with slow banks, a warm tint */
function drawWeather() {
  const a = weather.amt; if (a < 0.03 || weather.kind === 'clear') return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (weather.kind === 'snow') {
    ctx.fillStyle = 'rgba(225,235,245,' + (0.08 * a).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,' + (0.85 * a).toFixed(3) + ')'; ctx.beginPath();
    const n = Math.round(rainDrops.length * Math.max(0.4, gfx.decor)), t = REDUCED_MOTION ? 4 : animT;
    for (let i = 0; i < n; i++) {
      const d = rainDrops[i], X = ((d.x * W + Math.sin(t * 0.8 + i) * 16 + t * 6 * d.s) % W + W) % W, Y = ((d.y + t * 0.07 * d.s) % 1) * H, r = 0.9 + d.s * 1.2;
      ctx.moveTo(X + r, Y); ctx.arc(X, Y, r, 0, 6.3);
    }
    ctx.fill();
  } else if (weather.kind === 'fog') {
    const gr = ctx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(236,241,246,' + (0.44 * a).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(236,241,246,' + (0.3 * a).toFixed(3) + ')');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,' + (0.13 * a).toFixed(3) + ')'; const t = REDUCED_MOTION ? 0 : animT;
    for (let i = 0; i < 4; i++) { const X = ((i * 0.27 + t * 0.012 * (1 + i * 0.3)) % 1) * W, Y = (0.2 + i * 0.2) * H; ctx.beginPath(); ctx.ellipse(X, Y, W * 0.35, H * 0.12, 0, 0, 6.3); ctx.fill(); }
  } else if (weather.kind === 'heat') {
    ctx.fillStyle = 'rgba(255,160,60,' + (0.12 * a).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H);
    const gr = ctx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(255,230,150,' + (0.16 * a).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,230,150,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  }
}

/* ---------------------------------------------------------------- C7.5 night lights */
function lampGlow() {
  if (lampSprite) return lampSprite;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,226,160,.6)'); gr.addColorStop(0.35, 'rgba(255,214,140,.22)'); gr.addColorStop(1, 'rgba(255,214,140,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return lampSprite = c;
}
/* warm windows on houses, cooler shop fronts on stores, lamp heads with a cached glow at junction corners: in
   view only, each kind batched into one path, all under 'lighter' */
function drawCityLights(vr, na) {
  if (na < 0.3) return;
  const a = clamp((na - 0.3) / 0.4, 0, 1), m = 60, x0 = vr.x0 - m, x1 = vr.x1 + m, y0 = vr.y0 - m, y1 = vr.y1 + m;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath(); let any = false;
  for (const b of buildings) {
    if (b.type !== 'house') continue;
    const x = tx(b.k), y = ty(b.k); if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    const th = b.face || 0, flip = Math.abs(Math.sin(th)) > 0.5, tier = houseTier(b), rows = tier ? (tier === 1 ? 2 : 3) : 1, cols = tier ? 3 : 2, w = flip ? 1.8 : 2.6, h = flip ? 2.6 : 1.8;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (hash01(b.k, 40 + r * 4 + c) > 0.72) continue;                                        // a few rooms are dark
      const q = rot(x, y, th, (c - (cols - 1) / 2) * 5.4, tier ? -9.5 + r * 4.4 : 1.7);
      rrp(q.x - w / 2, q.y - h / 2, w, h, 0.6); any = true;
    }
  }
  if (any) { ctx.fillStyle = 'rgba(255,196,110,' + (0.6 * a).toFixed(3) + ')'; ctx.fill(); }
  ctx.beginPath(); any = false;
  for (const b of buildings) {
    if (b.type !== 'store') continue;
    const x = bX(b), y = bY(b); if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    const th = b.face || 0, flip = Math.abs(Math.sin(th)) > 0.5;
    if (isBig(b)) { const [Bx, By, Bw, Bh] = STORE_BOX[Math.min(3, b.tier || 0)], q = rot(x, y, th, Bx + Bw / 2, By + Bh - 9.5), L = Bw - 14; rrp(q.x - (flip ? 1.4 : L / 2), q.y - (flip ? L / 2 : 1.4), flip ? 2.8 : L, flip ? L : 2.8, 1.2); }
    else { const q = rot(x, y, th, 0, 1.1); rrp(q.x - (flip ? 1 : 7), q.y - (flip ? 7 : 1), flip ? 2 : 14, flip ? 14 : 2, 0.8); }
    any = true;
  }
  if (any) { ctx.fillStyle = 'rgba(200,232,255,' + (0.42 * a).toFixed(3) + ')'; ctx.fill(); }
  const sp = lampGlow(); ctx.globalAlpha = a; ctx.beginPath(); any = false;
  for (const nd of nodeList) {
    if (!nd.junction) continue;
    const x = tx(nd.k), y = ty(nd.k); if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    for (const [lx, ly] of [[13, 13], [-13, -13]]) { ctx.drawImage(sp, x + lx - 16, y + ly - 16, 32, 32); ctx.moveTo(x + lx + 1.1, y + ly); ctx.arc(x + lx, y + ly, 1.1, 0, 6.3); any = true; }
  }
  if (any) { ctx.fillStyle = 'rgba(255,240,200,.9)'; ctx.fill(); }
  ctx.restore();
}
const _dN62 = drawNight;
drawNight = function (vr, na) { _dN62(vr, na); drawCityLights(vr, na); };

/* ---------------------------------------------------------------- resets and the API */
const _rg62 = resetGame;
resetGame = function (dk) {
  _rg62(dk);
  replayFrames = []; replayDay = -1;
  weather = {kind: 'clear', t: 0, amt: 0}; weatherTimer = 240 + Math.random() * 180; weatherSeen = {};
  for (const p of peds) p.on = false; pedN = 0; distKey = -1; distNames = null;
};
if (window.JunctionAPI) window.JunctionAPI.replay = {frames: () => replayFrames, open: openReplay, close: closeReplay, exportVideo: rpExport};
if (window.__JUNCTION) Object.assign(window.__JUNCTION, {resetGame: (...a) => resetGame(...a), replayTick, replayPush, replayStore, openReplay, closeReplay, rpExport, rp, replayFramesNow: () => replayFrames, setReplayFrames(v) { replayFrames = v; },
  weatherNow: () => weather, setWeather(v) { weather = v; }, startWeather, weatherTick, weatherSeenNow: () => weatherSeen, carVmax, lightDemand, groupOf, houseTier, isMall, drawDistricts, districtNames, stepPeds, drawPeds, peds, pedNow: () => pedN,
  drawCityLights, nightAmount, setClock(v) { clock = v; }, clockNow: () => clock, gfx, loadGameCore, UPGRADES, showGameOverNow: (...a) => showGameOver(...a)});


/* ===== p60 Campaign: three chapters of ten handmade levels. CAMP_LEVELS is plain data, so more can be added.
   A level is an ordinary city built by resetGame on a seeded stream (Math.random is swapped for the level's seed for
   the length of the reset, so rand() stays seeded the way an Expert city's does), then the rules go on top: budget,
   starting roads and stock, banned tools, a fixed map size, and for some levels a hand-laid layout. The goal is
   checked once a second from frame(). Progress lives in localStorage under junction-campaign-v1 and
   JunctionAPI.campaign exposes snapshot/merge for account sync. The game's own functions are wrapped here, never
   edited: resetGame (restarts re-apply the level), saveGame/writeSlot (no slots), JEvents.emit (no leaderboards),
   endGame (mode bests and the autosave are left alone), growMap (fixed maps), setTool/refreshUI (banned tools). ===== */
const CAMP_KEY = 'junction-campaign-v1', CAMP_NEED = 20;                  // stars in a chapter that open the next one
const CAMP_CHAPTERS = [
  {n: 1, name: 'First Streets', blurb: 'The basics at an easy pace: stores, houses, bridges, lights and roundabouts.', unlock: 'design:car:trophy', tint: '#2ea56a'},
  {n: 2, name: 'Growing Pains', blurb: 'Standard pace with a catch on every level: no lights, no roundabouts, tiny budgets, rivers and one-way loops.', unlock: 'design:house:mayor', tint: '#2f6fd1'},
  {n: 3, name: 'Gridlock', blurb: 'Frantic parcels, tight budgets, no motorways, and stores that must never pile up.', unlock: 'design:round:medal', tint: '#c8352a'}
];
/* id, name, blurb, seed, rules {diff, budget?, roads?, inv?, banned?, span?, noGrow?}, goal {type, n, byWeek?, maxOverflow?}, stars, extras {layout?, unlock?}
   stars: for parcels/keepCalm/allGoals goals the weeks to finish by for 1, 2 and 3 stars (the first is the deadline);
   for survive goals [0, parcels for 2 stars, parcels for 3 stars] counted when the target week arrives. */
const L_ = (id, name, blurb, seed, rules, goal, stars, x) => Object.assign({id, ch: +id.split('-')[0], n: +id.split('-')[1], name, blurb, seed, rules, goal, stars}, x || {});
const CAMP_LEVELS = [
  /* chapter 1: First Streets */
  L_('1-1', 'Corner Shop', 'One store, a few houses and all the time in the world. Join the houses to the shop and let the parcels roll.', 11001, {diff: 'chill', budget: 60}, {type: 'parcels', n: 30}, [6, 4, 3]),
  L_('1-2', 'Two Streets', 'A second colour arrives early. Keep the two routes apart and both shops stay happy.', 11002, {diff: 'chill', budget: 60}, {type: 'parcels', n: 60}, [7, 5, 4]),
  L_('1-3', 'Across the Water', 'A river runs through the middle and both pairs sit on opposite banks. Three bridges to start; spend them well.', 11003, {diff: 'standard', inv: {bridge: 3}, span: 12}, {type: 'parcels', n: 80}, [8, 6, 5], {layout: 'river'}),
  L_('1-4', 'Hold the Line', 'Nothing fancy: keep the city running to week 5. The more parcels by then, the more stars.', 11004, {diff: 'standard'}, {type: 'survive', n: 5}, [0, 80, 130]),
  L_('1-5', 'Pocket Money', 'No cash and twelve tiles of road. Short, direct streets until the money comes in.', 11005, {diff: 'standard', budget: 0, roads: 12}, {type: 'parcels', n: 70}, [8, 6, 5]),
  L_('1-6', 'Lights On', 'Two traffic lights and no roundabouts. Find the junction that queues and put a light on it.', 11006, {diff: 'standard', inv: {light: 2}, banned: ['round']}, {type: 'parcels', n: 120}, [9, 7, 6]),
  L_('1-7', 'Round and Round', 'Two roundabouts and no lights. Nobody has to stop if you place them right.', 11007, {diff: 'standard', inv: {round: 2}, banned: ['light']}, {type: 'parcels', n: 120}, [9, 7, 6]),
  L_('1-8', 'Small Town', 'The town never grows past its walls. Make every tile count to week 6.', 11008, {diff: 'standard', span: 12, noGrow: true}, {type: 'survive', n: 6}, [0, 100, 160]),
  L_('1-9', 'Box Ticker', 'Tick off six of the city goals: lots, bays, roundabouts, a motorway, upgrades. Your choice which.', 11009, {diff: 'standard'}, {type: 'allGoals', n: 6}, [9, 7, 6]),
  L_('1-10', 'Main Street', 'Chapter finale. Two hundred parcels on a standard city, and the Trophy car is yours.', 11010, {diff: 'standard'}, {type: 'parcels', n: 200}, [11, 9, 8], {unlock: 'design:car:trophy'}),
  /* chapter 2: Growing Pains */
  L_('2-1', 'Blackout', 'No traffic lights at all. Roundabouts and signs have to carry the busy junctions.', 12001, {diff: 'standard', banned: ['light']}, {type: 'parcels', n: 150}, [10, 8, 7]),
  L_('2-2', 'Straight Through', 'No roundabouts. Lights, signs and a clever layout only.', 12002, {diff: 'standard', banned: ['round']}, {type: 'parcels', n: 150}, [10, 8, 7]),
  L_('2-3', 'Shoestring', 'Ten tiles of road and not a cent. Every parcel pays for the next tile.', 12003, {diff: 'standard', budget: 0, roads: 10}, {type: 'parcels', n: 130}, [10, 8, 7]),
  L_('2-4', 'River Town', 'A river down the middle and three pairs that all need to cross it. Three bridges, no motorways.', 12004, {diff: 'standard', inv: {bridge: 3}, banned: ['moto'], span: 14}, {type: 'parcels', n: 110}, [9, 7, 6], {layout: 'riverTown'}),
  L_('2-5', 'One Way Only', 'A ring road and two pairs, with no lights or roundabouts. One-way signs keep the loop flowing.', 12005, {diff: 'standard', roads: 8, inv: {sign: 6}, banned: ['light', 'round'], span: 12}, {type: 'parcels', n: 100}, [9, 7, 6], {layout: 'ring'}),
  L_('2-6', 'Slow Lane', 'No motorways. Two hundred and twenty parcels on surface streets alone.', 12006, {diff: 'standard', banned: ['moto']}, {type: 'parcels', n: 220}, [12, 10, 8]),
  L_('2-7', 'Keep Calm', 'No store may ever hold more than 8 parcels. One pile-up and the level is lost.', 12007, {diff: 'standard'}, {type: 'keepCalm', n: 150, maxOverflow: 8}, [10, 8, 7]),
  L_('2-8', 'Island Hop', 'The red store sits on an island in a lake. Four bridges, or the long way round.', 12008, {diff: 'standard', inv: {bridge: 4}, banned: ['moto'], span: 16}, {type: 'parcels', n: 120}, [10, 8, 7], {layout: 'island'}),
  L_('2-9', 'Sign Language', 'Signs only: no lights, roundabouts or motorways. Eight signs to start.', 12009, {diff: 'standard', inv: {sign: 8}, banned: ['light', 'round', 'moto']}, {type: 'parcels', n: 180}, [11, 9, 8]),
  L_('2-10', 'City Limits', 'Chapter finale. A town that never grows, for nine weeks. The Mayor\u2019s hall waits at the end.', 12010, {diff: 'standard', span: 14, noGrow: true}, {type: 'survive', n: 9}, [0, 220, 320], {unlock: 'design:house:mayor'}),
  /* chapter 3: Gridlock */
  L_('3-1', 'Frantic Start', 'Welcome to Frantic: parcels come fast and stores lose patience sooner. One hundred and fifty parcels.', 13001, {diff: 'frantic'}, {type: 'parcels', n: 150}, [9, 7, 6]),
  L_('3-2', 'Fast Lane Closed', 'Frantic pace and no motorways. Keep the long trips short.', 13002, {diff: 'frantic', banned: ['moto']}, {type: 'parcels', n: 200}, [11, 9, 8]),
  L_('3-3', 'Empty Wallet', 'Frantic, broke, and ten tiles of road. Earn your way out.', 13003, {diff: 'frantic', budget: 0, roads: 10}, {type: 'parcels', n: 150}, [10, 8, 7]),
  L_('3-4', 'Under Six', 'No store may hold more than 6 parcels at a Frantic pace. Stay ahead of every pile.', 13004, {diff: 'frantic'}, {type: 'keepCalm', n: 120, maxOverflow: 6}, [10, 8, 7]),
  L_('3-5', 'Bare Junctions', 'No lights, no roundabouts, Frantic parcels. Layout is everything.', 13005, {diff: 'frantic', banned: ['light', 'round']}, {type: 'parcels', n: 200}, [11, 9, 8]),
  L_('3-6', 'Marathon', 'Ten weeks of Frantic. The parcels delivered by then decide the stars.', 13006, {diff: 'frantic'}, {type: 'survive', n: 10}, [0, 300, 420]),
  L_('3-7', 'Crossroads', 'Four pairs whose straight routes all cross in the middle. No motorways to go over the top.', 13007, {diff: 'frantic', banned: ['moto'], span: 14}, {type: 'parcels', n: 160}, [10, 8, 7], {layout: 'cross'}),
  L_('3-8', 'Eight and No Lights', 'Two hundred parcels, never more than 8 waiting anywhere, and no traffic lights.', 13008, {diff: 'frantic', banned: ['light']}, {type: 'keepCalm', n: 200, maxOverflow: 8}, [11, 9, 8]),
  L_('3-9', 'Everything at Once', 'Ten city goals at a Frantic pace. Build wide and tick them off.', 13009, {diff: 'frantic'}, {type: 'allGoals', n: 10}, [12, 10, 9]),
  L_('3-10', 'Gridlock', 'The finale. Twelve weeks of Frantic with no cash and no motorways. The Medal roundabout is the prize.', 13010, {diff: 'frantic', budget: 0, banned: ['moto']}, {type: 'survive', n: 12}, [0, 400, 560], {unlock: 'design:round:medal'})
];
const CAMP_INV_NAMES = {bridge: 'bridge', light: 'traffic light', round: 'roundabout', sign: 'sign', moto: 'motorway', park: 'lot', depot: 'bay', road: 'road'};
const CAMP_BAN_NAMES = {light: 'traffic lights', round: 'roundabouts', moto: 'motorways', sign: 'signs', park: 'parking lots', depot: 'waiting bays', road: 'roads'};
/* hand-laid maps: tile coordinates are relative to org, the way the tutorial lays its pairs */
function campWipe(clearWater) {
  for (const b of buildings) for (const t of bTiles(b)) bAt[t] = -1;
  buildings = []; cars = []; trucks = [];
  if (clearWater) water.fill(0);
}
function campStamp(x, y, rad) {
  const X = org + x, Y = org + y;
  for (let r = Math.floor(Y - rad); r <= Math.ceil(Y + rad); r++) for (let c = Math.floor(X - rad); c <= Math.ceil(X + rad); c++) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
    if ((c + 0.5 - X) ** 2 + (r + 0.5 - Y) ** 2 <= rad * rad) water[idx(c, r)] = 1;
  }
}
function campRiver(vertical, at, wig) { for (let t = -1; t <= span + 1; t += 0.5) { const w = at + Math.sin(t * 0.5) * wig; if (vertical) campStamp(w, t, 0.9); else campStamp(t, w, 0.9); } }
const CAMP_LAYOUTS = {
  river() { campWipe(true); campRiver(false, span / 2, 0.8); tutSpawnPair(0, [2, 2], [span - 4, span - 3]); tutSpawnPair(1, [span - 4, 1], [2, span - 3]); },
  riverTown() { campWipe(true); campRiver(true, span / 2, 1); tutSpawnPair(0, [2, 2], [11, 3]); tutSpawnPair(1, [11, 8], [2, 9]); tutSpawnPair(2, [2, 10], [11, 11]); },
  ring() {
    campWipe(true);                                     // the ring first: buildings nudge off road tiles, not the other way round
    const ring = []; for (let c = 2; c <= 9; c++) ring.push([c, 2]); for (let r = 3; r <= 9; r++) ring.push([9, r]); for (let c = 8; c >= 2; c--) ring.push([c, 9]); for (let r = 8; r >= 2; r--) ring.push([2, r]);
    tutPath(ring);
    tutSpawnPair(0, [4, 5], [10, 1]); tutSpawnPair(1, [6, 5], [1, 10]);
  },
  island() {
    campWipe(true); const m = span / 2;
    for (let a = 0; a < 6.3; a += 0.06) for (const rr2 of [3.7, 4.5]) campStamp(m + Math.cos(a) * rr2, m + Math.sin(a) * rr2, 0.75);
    placeTutBuilding('store', 0, m - 1, m - 2, [4, 0, 2, 6]);
    for (const [c, r] of [[1, 1], [span - 2, 1], [1, span - 2]]) placeTutBuilding('house', 0, c, r);
    tutSpawnPair(1, [span - 3, span - 3], [1, m]);     // the blue pair sits outside the lake (the ring reaches 5.25 tiles from the centre)
  },
  cross() {
    campWipe(true);
    tutSpawnPair(0, [1, 6], [12, 6]); tutSpawnPair(1, [6, 1], [6, 12]); tutSpawnPair(2, [2, 11], [11, 2]); tutSpawnPair(3, [11, 11], [2, 2]);
  }
};
/* ---- progress ---- */
let campaignLevel = null, campaignBuilding = false, campaignRestarting = false, campState = null, campPick = null;
function campBlank() { return {levels: {}, unlockedCh: 1}; }
function campClean(d) {
  const o = campBlank();
  if (d && typeof d === 'object' && d.levels && typeof d.levels === 'object') for (const l of CAMP_LEVELS) {
    const v = d.levels[l.id]; if (!v || typeof v !== 'object') continue;
    const st = Math.max(0, Math.min(3, Math.floor(+v.stars || 0))); if (!st) continue;
    o.levels[l.id] = {stars: st, best: v.best && typeof v.best === 'object' ? {week: +v.best.week || 0, score: +v.best.score || 0, sec: +v.best.sec || 0} : null, at: +v.at || 0};
  }
  o.unlockedCh = Math.max(1, Math.min(CAMP_CHAPTERS.length, Math.floor(+(d && d.unlockedCh) || 1)));
  return o;
}
let camp = (() => { try { return campClean(JSON.parse(localStorage.getItem(CAMP_KEY))); } catch (e) { return campBlank(); } })();
function saveCamp() { camp.unlockedCh = Math.max(camp.unlockedCh || 1, ...CAMP_CHAPTERS.filter(c => chapterOpen(c.n)).map(c => c.n)); try { localStorage.setItem(CAMP_KEY, JSON.stringify(camp)); } catch (e) {} }
const campStars = id => (camp.levels[id] && camp.levels[id].stars) || 0;
const chapterStars = n => CAMP_LEVELS.reduce((a, l) => a + (l.ch === n ? campStars(l.id) : 0), 0);
const chapterOpen = n => n <= 1 || chapterStars(n - 1) >= CAMP_NEED;
const levelById = id => CAMP_LEVELS.find(l => l.id === id);
function levelOpen(l) { if (!chapterOpen(l.ch)) return false; if (l.n === 1) return true; const i = CAMP_LEVELS.indexOf(l); return campStars(CAMP_LEVELS[i - 1].id) > 0; }
function nextLevel(l) { const i = CAMP_LEVELS.indexOf(l), n = CAMP_LEVELS[i + 1]; return n && levelOpen(n) ? n : null; }
function campaignSnapshot() { return JSON.parse(JSON.stringify(camp)); }
function mergeCampaign(d) {                            // takes the better of each level (e.g. the cloud copy); true when anything changed
  const o = campClean(d); let changed = false;
  for (const id in o.levels) { const v = o.levels[id], c = camp.levels[id]; if (!c || v.stars > c.stars) { camp.levels[id] = Object.assign({}, c, v, {stars: Math.max(v.stars, c ? c.stars : 0)}); changed = true; } else if (!c.best && v.best) { c.best = v.best; changed = true; } }
  if (changed) { saveCamp(); if (mmPane === 'campaign') renderCampaign(); }
  return changed;
}
/* ---- the goal ---- */
const campDeadline = l => l.goal.type === 'survive' ? 0 : (l.goal.byWeek || l.stars[0]);
function campProgress(l) { const g = l.goal; return g.type === 'survive' ? {cur: Math.min(week, g.n), n: g.n} : g.type === 'allGoals' ? {cur: Math.min(goalsDone.size, g.n), n: g.n} : {cur: Math.min(score, g.n), n: g.n}; }
function campStarsNow(l) { const s = l.stars; if (l.goal.type === 'survive') return 1 + (score >= s[1] ? 1 : 0) + (score >= s[2] ? 1 : 0); return week <= s[2] ? 3 : week <= s[1] ? 2 : 1; }
function campGoalText(l) {
  const g = l.goal, by = ' by week ' + campDeadline(l);
  if (g.type === 'survive') return 'Keep the city running to week ' + g.n;
  if (g.type === 'allGoals') return 'Complete ' + g.n + ' city goals' + by;
  if (g.type === 'keepCalm') return 'Deliver ' + g.n + ' parcels' + by + ' and never let a store hold more than ' + g.maxOverflow + ' parcels';
  return 'Deliver ' + g.n + ' parcels' + by;
}
function campGoalShort(l) { const g = l.goal; return g.type === 'survive' ? 'Reach week ' + g.n : g.type === 'allGoals' ? g.n + ' goals by week ' + campDeadline(l) : g.n + ' parcels by week ' + campDeadline(l) + (g.type === 'keepCalm' ? ' \u00b7 max ' + g.maxOverflow + ' waiting' : ''); }
function campStarRows(l) { const g = l.goal, s = l.stars; return g.type === 'survive' ? [[1, 'Reach week ' + g.n], [2, s[1] + ' parcels by then'], [3, s[2] + ' parcels by then']] : [[1, 'Done by week ' + s[0]], [2, 'Done by week ' + s[1]], [3, 'Done by week ' + s[2]]]; }
function campRuleChips(l) {
  const Rl = l.rules || {}, out = [[(DIFFS[Rl.diff] || DIFFS.standard).label, 'diff']];
  if (Rl.budget !== undefined) out.push(['Budget ' + fmt$(Rl.budget)]);
  if (Rl.roads !== undefined) out.push([Rl.roads + ' roads to start']);
  if (Rl.inv) for (const k in Rl.inv) out.push([Rl.inv[k] + ' ' + CAMP_INV_NAMES[k] + (Rl.inv[k] === 1 ? '' : 's')]);
  for (const k of Rl.banned || []) out.push(['No ' + CAMP_BAN_NAMES[k], 'ban']);
  if (Rl.span) out.push([Rl.span + '\u00d7' + Rl.span + ' map']);
  if (Rl.noGrow) out.push(['Map never grows', 'ban']);
  if (l.layout) out.push(['Hand-laid map']);
  return out.map(([t, c]) => '<span class="lv-chip' + (c ? ' ' + c : '') + '">' + t + '</span>').join('');
}
/* ---- starting and applying a level ---- */
function applyLevel(l) {
  const Rl = l.rules || {};
  bannedTools.clear();
  if (Rl.span && Rl.span > span) { span = Math.min(MAXD, Rl.span); org = Math.floor((MAXD - span) / 2); camSpan = span; camOrg = org; }
  if (Rl.budget !== undefined) money = Rl.budget;
  if (Rl.roads !== undefined) inv.road = Rl.roads;
  if (Rl.inv) for (const k in Rl.inv) if (k in inv) inv[k] = Rl.inv[k];
  for (const k of Rl.banned || []) { bannedTools.add(k); if (k in inv) inv[k] = 0; }
  if (l.layout && CAMP_LAYOUTS[l.layout]) {
    CAMP_LAYOUTS[l.layout]();
    linkBuildings(); rebuildNet();
    for (const c of cars) { const p = parkedPose(c); c.x = p.x; c.y = p.y; c.ang = p.a; }
    pathCache.ver = -1;
  }
  campState = {done: false, failed: false, t0: Date.now()};
  camReset(true); closeInspector(); setTool('select'); refreshUI(); renderCampHud();
}
function startLevel(l) {
  if (typeof l === 'string') l = levelById(l);
  if (!l) return false;
  if (spectating && window.JunctionAPI && window.JunctionAPI.spectate) window.JunctionAPI.spectate.exit();
  campaignBuilding = true;
  try {
    campaignLevel = l; campaignRestarting = false; pendingSlot = '';
    document.querySelectorAll('.modal').forEach(m => { m.hidden = true; }); modalOpen = false;
    const mr = Math.random; Math.random = seededRand(l.seed);
    try { resetGame(l.rules.diff in DIFFS ? l.rules.diff : 'standard'); } finally { Math.random = mr; }
    curSlot = '';
    applyLevel(l);
  } finally { campaignBuilding = false; }
  running = true; refreshHud(); layout();
  hint('Level ' + l.n + ': ' + l.name + ' \u2014 ' + campGoalShort(l) + '.', true);
  return true;
}
function leaveLevel() { campaignLevel = null; campaignRestarting = false; campState = null; bannedTools.clear(); renderCampHud(); }
/* ---- the once-a-second check ---- */
function campaignTick() {
  const l = campaignLevel; if (!l || !campState || demoMode || spectating || !started) return;
  renderCampHud();
  if (campState.done || campState.failed || over) return;
  const g = l.goal;
  if (g.type === 'keepCalm' && g.maxOverflow) { const bad = buildings.find(b => b.type === 'store' && b.pins > g.maxOverflow); if (bad) { campFail('The ' + COLORS[bad.color].name + ' store went past ' + g.maxOverflow + ' parcels waiting in week ' + week + '.'); return; } }
  const p = campProgress(l);
  if (p.cur >= p.n) { campWin(); return; }
  const dl = campDeadline(l); if (dl && week > dl) campFail('Week ' + dl + ' came and went with ' + (g.type === 'allGoals' ? goalsDone.size + ' of ' + g.n + ' goals done.' : score + ' of ' + g.n + ' parcels delivered.'));
}
function campWin() {
  const l = campaignLevel, stars = campStarsNow(l), timed = l.goal.type !== 'survive';
  campState.done = true; running = false;
  const rec = camp.levels[l.id] || {stars: 0, best: null}, now = {week, score, sec: Math.round(clock)};
  if (!rec.best || stars > rec.stars || (stars === rec.stars && (timed ? now.sec < rec.best.sec : now.score > rec.best.score))) rec.best = now;
  rec.stars = Math.max(rec.stars, stars); rec.at = Date.now(); camp.levels[l.id] = rec; saveCamp();
  let unlocked = '';
  if (l.unlock && COSMETICS[l.unlock] && !owns(l.unlock)) { jb.owned[l.unlock] = 1; saveShop(); unlocked = l.unlock; }
  sfx('upgrade'); haptic('claim');
  campEmit('campaign', {id: l.id, stars, score, week, unlocked});
  showLevelCard('win', stars, unlocked);
}
function campFail(why) { campState.failed = true; running = false; refreshUI(); sfx('over'); showLevelCard('fail', 0, why); }
function campaignOver() { if (!campState || campState.done || campState.failed) return; campState.failed = true; closeModal('m-over'); showLevelCard('over', 0, 'The city gridlocked in week ' + week + ' with ' + score + ' parcels delivered.'); }
/* ---- the HUD plate ---- */
function renderCampHud() {
  const box = $('camp-hud'); if (!box) return;
  const l = campaignLevel, on = !!(l && started && !demoMode && !spectating);
  box.hidden = !on; if (!on) return;
  const p = campProgress(l), g = l.goal, dl = campDeadline(l);
  $('ch-title').textContent = 'Chapter ' + l.ch + ' \u00b7 Level ' + l.n + ' \u2014 ' + l.name;
  $('ch-goal').textContent = 'Goal: ' + campGoalShort(l);
  $('ch-bar').style.width = Math.round(Math.min(1, p.cur / p.n) * 100) + '%';
  $('ch-prog').textContent = (campState && campState.done ? '\u2713 Done \u00b7 ' : campState && campState.failed ? '\u2717 Lost \u00b7 ' : '') + p.cur + ' / ' + p.n + (g.type === 'survive' ? ' weeks' : g.type === 'allGoals' ? ' goals' : '') + ' \u00b7 week ' + week + (dl && !(campState && (campState.done || campState.failed)) ? ' of ' + dl : '');
  $('ch-stars').textContent = campStarRows(l).map(([n, t]) => '\u2605'.repeat(n) + ' ' + t).join('  \u00b7  ');
}
/* ---- the world map pane ---- */
const campPts = n => Array.from({length: n}, (_, i) => [6 + i * 88 / Math.max(1, n - 1), i % 2 ? 66 : 34]);
function campRoadSVG(n) {
  const p = campPts(n); let d = 'M' + p[0][0] + ' ' + p[0][1];
  for (let i = 1; i < n; i++) { const [x0, y0] = p[i - 1], [x1, y1] = p[i], mx = (x0 + x1) / 2; d += ' C' + mx + ' ' + y0 + ' ' + mx + ' ' + y1 + ' ' + x1 + ' ' + y1; }
  return '<svg class="cp-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="cp-rd" d="' + d + '"/><path class="cp-ln" d="' + d + '"/></svg>';
}
const campStarStr = s => '\u2605'.repeat(s) + '\u2606'.repeat(3 - s);
function renderCampaign() {
  const box = $('mm-campaign'); if (!box) return;
  const total = CAMP_LEVELS.reduce((a, l) => a + campStars(l.id), 0);
  let h = '<div class="cp-top"><div><b>' + total + ' <i>\u2605</i></b><small>of ' + CAMP_LEVELS.length * 3 + '</small></div><p class="mini">Thirty handmade levels in three chapters. Each is a seeded city with its own rules and goal, and stars come from finishing fast. A chapter opens at ' + CAMP_NEED + ' stars in the one before; its finale unlocks a design found nowhere else.</p></div>';
  for (const ch of CAMP_CHAPTERS) {
    const lv = CAMP_LEVELS.filter(l => l.ch === ch.n), st = chapterStars(ch.n), open = chapterOpen(ch.n), info = itemInfo(ch.unlock), got = owns(ch.unlock);
    h += '<section class="cp-ch' + (open ? '' : ' locked') + '" style="--tint:' + ch.tint + '" data-ch="' + ch.n + '"><header class="cp-h"><div><small>Chapter ' + ch.n + (open ? '' : ' \u00b7 locked') + '</small><b>' + ch.name + '</b><p>' + ch.blurb + '</p></div><div class="cp-hr"><span class="cp-st">' + st + ' / ' + lv.length * 3 + ' \u2605</span>' +
      (open ? '<span class="cp-unl' + (got ? ' got' : '') + '">' + (got ? 'Unlocked: ' : 'Finale reward: ') + (info ? info[1] : ch.unlock) + '</span>' : '<span class="cp-unl">Needs ' + CAMP_NEED + ' \u2605 in chapter ' + (ch.n - 1) + '</span>') + '</div></header>';
    h += '<div class="cp-scroll"><div class="cp-road">' + campRoadSVG(lv.length) + lv.map((l, i) => {
      const [x, y] = campPts(lv.length)[i], s2 = campStars(l.id), ok = levelOpen(l), cls = !ok ? 'locked' : s2 ? 'done' : 'open next';
      return '<button type="button" class="cp-node ' + cls + '" data-lvl="' + l.id + '" style="left:' + x + '%;top:' + y + '%"' + (ok ? '' : ' disabled') + ' aria-label="Level ' + l.n + ': ' + l.name + (s2 ? ', ' + s2 + ' stars' : ok ? '' : ', locked') + '"><b>' + (ok ? l.n : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>') + '</b><i>' + (ok ? campStarStr(s2) : '') + '</i><span>' + l.name + '</span></button>';
    }).join('') + '</div></div></section>';
  }
  box.innerHTML = h;
  box.querySelectorAll('[data-lvl]').forEach(b => b.addEventListener('click', () => openLevelCard(b.dataset.lvl)));
}
function openLevelCard(id) {
  const l = levelById(id); if (!l || !levelOpen(l)) return;
  campPick = l; const s2 = campStars(l.id), rec = camp.levels[l.id];
  $('lv-kicker').textContent = 'Chapter ' + l.ch + ' \u00b7 Level ' + l.n + (s2 ? ' \u00b7 ' + campStarStr(s2) : '');
  $('lv-title').textContent = l.name; $('lv-blurb').textContent = l.blurb;
  $('lv-rules').innerHTML = campRuleChips(l);
  $('lv-goal').innerHTML = '<small>Goal</small>' + campGoalText(l);
  $('lv-stars').innerHTML = campStarRows(l).map(([n, t]) => '<div' + (n <= s2 ? ' class="have"' : '') + '><i>' + campStarStr(n) + '</i>' + t + '</div>').join('') +
    (rec && rec.best ? '<div class="lv-best">Best: ' + rec.best.score + ' parcels, week ' + rec.best.week + '</div>' : '') +
    (l.unlock && itemInfo(l.unlock) ? '<div class="lv-best">Reward: ' + itemInfo(l.unlock)[1] + (owns(l.unlock) ? ' (unlocked)' : '') + '</div>' : '');
  $('lv-play').textContent = s2 ? 'Play again' : 'Play';
  openModal('m-level');
}
function showLevelCard(kind, stars, extra) {
  const l = campaignLevel; if (!l) return;
  const sec = Math.round(clock), mm = Math.floor(sec / 60), ss = String(sec % 60).padStart(2, '0');
  $('ld-kicker').textContent = kind === 'win' ? 'Level complete' : kind === 'over' ? 'Gridlock' : 'Not this time';
  $('ld-title').textContent = l.name;
  $('ld-stars').innerHTML = [1, 2, 3].map(i => '<i class="' + (i <= stars ? 'on' : '') + '" style="--d:' + (0.15 + i * 0.22).toFixed(2) + 's">\u2605</i>').join('');
  $('ld-sub').textContent = kind === 'win' ? (stars === 3 ? 'Three stars. Nothing left to prove here.' : stars === 2 ? 'Two stars. ' + campStarRows(l)[2][1] + ' for the third.' : 'One star. ' + campStarRows(l)[1][1] + ' for two.') : extra;
  $('ld-stats').innerHTML = [['Week', week], ['Parcels', score.toLocaleString('en-US')], ['Time', mm + ':' + ss], ['Cash', fmt$(Math.round(money))], ['Cars', cars.length], ['Trips', stats.trips]].map(([a, b]) => '<div><b>' + b + '</b><span>' + a + '</span></div>').join('');
  const un = $('ld-unlock'), info = kind === 'win' && extra ? itemInfo(extra) : null;
  un.hidden = !info; if (info) un.innerHTML = '<div><small>Unlocked</small>' + info[1] + '</div><span class="rar r-camp">Campaign</span>';
  const nx = kind === 'win' ? nextLevel(l) : null, btns = [];
  if (nx) btns.push('<button class="bigbtn" type="button" data-ld="next">Next: ' + nx.name + '</button>');
  btns.push('<button class="' + (nx || kind === 'win' ? 'bigbtn ghost' : 'bigbtn') + '" type="button" data-ld="replay">' + (kind === 'win' ? 'Replay' : 'Retry') + '</button>');
  if (kind === 'win') btns.push('<button class="bigbtn ghost" type="button" data-ld="keep">Keep playing</button>');
  btns.push('<button class="bigbtn ghost" type="button" data-ld="map">Back to map</button>');
  $('ld-btns').innerHTML = btns.join('');
  openModal('m-level-done'); refreshUI();
}
function campBackToMap() { closeModal('m-level-done'); closeModal('m-level'); goHome(); showMM('campaign'); }
{
  const ld = $('m-level-done'), lv = $('m-level');
  if (ld) ld.addEventListener('click', e => {
    const b = e.target.closest('[data-ld]'); if (!b) return;
    const act = b.dataset.ld, l = campaignLevel;
    if (act === 'next') { const nx = nextLevel(l); closeModal('m-level-done'); if (nx) startLevel(nx); else campBackToMap(); }
    else if (act === 'replay') { closeModal('m-level-done'); startLevel(l); }
    else if (act === 'keep') { closeModal('m-level-done'); running = true; refreshUI(); }
    else if (act === 'map') campBackToMap();
  });
  if (lv) { $('lv-play').addEventListener('click', () => { if (campPick) startLevel(campPick); }); $('lv-close').addEventListener('click', () => closeModal('m-level')); lv.addEventListener('click', e => { if (e.target === lv) closeModal('m-level'); }); }
  const pr = $('pause-restart'); if (pr) pr.addEventListener('click', () => { if (campaignLevel) campaignRestarting = true; }, true);
  new MutationObserver(() => { if (!$('m-start').hidden) campaignRestarting = false; }).observe($('m-start'), {attributes: true, attributeFilter: ['hidden']});
  const tile = document.querySelector('.rl-tile.t-camp .cp-tilest'); if (tile) tile.textContent = CAMP_LEVELS.reduce((a, l) => a + campStars(l.id), 0) + ' / ' + CAMP_LEVELS.length * 3 + ' \u2605';
}
/* ---- wrappers round the game's own functions (function declarations are reassignable bindings) ---- */
MM_TITLES.campaign = 'Campaign';
const _showMM_c = showMM;
showMM = function (pane) { _showMM_c(pane); if (pane === 'campaign') renderCampaign(); const t = document.querySelector('.rl-tile.t-camp .cp-tilest'); if (t) t.textContent = CAMP_LEVELS.reduce((a, l) => a + campStars(l.id), 0) + ' / ' + CAMP_LEVELS.length * 3 + ' \u2605'; };
const _resetGame_c = resetGame;
resetGame = function (dk) {                            // a restart from the pause menu re-applies the level; any other new city leaves the campaign
  if (campaignBuilding) return _resetGame_c(dk);
  if (campaignLevel && campaignRestarting) { const l = campaignLevel; campaignRestarting = false; return startLevel(l); }
  leaveLevel(); return _resetGame_c(dk);
};
const _startDemo_c = startDemo;
startDemo = function () { leaveLevel(); return _startDemo_c(); };
const _loadGame_c = loadGame;
loadGame = function (d) { const ok = _loadGame_c(d); if (ok) leaveLevel(); return ok; };
const _saveGame_c = saveGame;
saveGame = function (u) { if (campaignLevel) return; return _saveGame_c(u); };
const _writeSlot_c = writeSlot;
writeSlot = function (f) { if (campaignLevel) return; return _writeSlot_c(f); };
const _growMap_c = growMap;
growMap = function () { if (campaignLevel && campaignLevel.rules && campaignLevel.rules.noGrow) return false; return _growMap_c(); };
const _endGame_c = endGame;
endGame = function (why) {                             // a lost level leaves the mode's best and the ordinary autosave alone
  if (!campaignLevel) return _endGame_c(why);
  let kb = null, ks = null; try { kb = localStorage.getItem(bestKey(diffKey)); ks = localStorage.getItem(SAVE_KEY); } catch (e) {}
  const keepBest = best;
  try { _endGame_c(why); } finally {
    best = keepBest;
    try { if (kb === null) localStorage.removeItem(bestKey(diffKey)); else localStorage.setItem(bestKey(diffKey), kb); if (ks !== null) localStorage.setItem(SAVE_KEY, ks); } catch (e) {}
  }
};
const _setTool_c = setTool;
setTool = function (t) {
  const def = TOOLS.find(x => x.id === (isSignTool(t) ? 'signs' : t));
  if (def && def.inv && bannedTools.has(def.inv)) { hint('Not on this level \u2014 ' + CAMP_BAN_NAMES[def.inv] + ' are banned.'); return; }
  return _setTool_c(t);
};
const _refreshUI_c = refreshUI;
refreshUI = function () {
  _refreshUI_c();
  if (!inv) return;
  document.querySelectorAll('.tool').forEach(b => {
    const def = TOOLS.find(t => t.id === b.dataset.id), ban = !!(def && def.inv && bannedTools.has(def.inv));
    if (b.disabled !== ban) { b.disabled = ban; b.classList.toggle('banned', ban); }
    if (ban) b.dataset.sub = 'Banned on this level';
  });
};
const campEmit = JEvents.emit.bind(JEvents);
JEvents.emit = function (n, d) {                       // campaign runs stay off leaderboards and cloud saves; a lost level shows the campaign card
  if (campaignLevel && !demoMode) {
    if (n === 'over') { campaignOver(d); return; }
    if (n === 'week' || n === 'autosave' || n === 'allGoals') return;
  }
  return campEmit(n, d);
};
if (window.JunctionAPI) window.JunctionAPI.campaign = {
  snapshot: campaignSnapshot, merge: mergeCampaign, start: startLevel, open() { if ($('m-start').hidden) openModal('m-start'); showMM('campaign'); },
  levels: () => CAMP_LEVELS.map(l => ({id: l.id, ch: l.ch, n: l.n, name: l.name, stars: campStars(l.id), open: levelOpen(l)})),
  get current() { return campaignLevel ? {id: campaignLevel.id, name: campaignLevel.name, done: !!(campState && campState.done), failed: !!(campState && campState.failed)} : null; },
  get total() { return CAMP_LEVELS.reduce((a, l) => a + campStars(l.id), 0); }
};
if (window.__JUNCTION) {                               // debug surface (getters defined as such: Object.assign would copy their values)
  Object.assign(window.__JUNCTION, {startLevel, campaignTick, renderCampaign, CAMP_LEVELS, leaveLevel});
  Object.defineProperties(window.__JUNCTION, {campaignLevel: {get: () => campaignLevel}, campState: {get: () => campState}, camp: {get: () => camp}, bannedTools: {get: () => bannedTools}});
}


/* =====================================================================
   MAP EDITOR AND COMMUNITY MAPS. Build a map by hand (water, stores, houses, roads), give it rules and a goal,
   test-play it, keep drafts on this device, publish it under a 6-letter code and play other people's maps.
   online.js keeps the published copies, likes, play counts and the per-map leaderboards; this side only knows the
   map format and how to start a city from it. While a map city is played, 'week' and 'over' are emitted as
   'mapweek' and 'mapover' so cloud saves and the mode leaderboards leave it alone.
   Map format v1 (tile indexes are relative to the map's own box: idx = r * span + c):
     {v: 1, name, desc, span, mode, rules: {cash, roads, banned: []}, goal: {type: 'survive' | 'parcels', n, byWeek},
      water: [idx...], roads: [idx...], links: [[idx, mask]...], buildings: [[c, r, type (0 house, 1 store), colour, sd, ends]...]}
   ===================================================================== */
let editorMode = false, mapPlay = false, mapCur = null, mapStarting = false, mapGoalDone = false, mapBanned = new Set();
const MAPS_KEY = 'junction-maps-v1', MAP_SPAN_MIN = 10, MAP_SPAN_MAX = 24, MAP_MODES = ['chill', 'standard', 'frantic'], MAP_MAX_JSON = 40000, MAP_CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
const MAP_TOOLS = [['moto', 'Motorways'], ['light', 'Lights'], ['round', 'Roundabouts'], ['sign', 'Signs'], ['park', 'Lots'], ['depot', 'Bays'], ['upgrade', 'Store upgrades'], ['tow', 'Tow trucks']];
const ED_TOOLS = [['road', 'Road'], ['water', 'Water'], ['dry', 'Dry land'], ['store', 'Store'], ['house', 'House'], ['erase', 'Erase']];
const ed = {tool: 'road', size: 2, col: 0, sd: 4, ends: 0, meta: null, draft: '', code: ''};
let edTab = 'browse', edSort = 'likes', mapRows = {};
const mapDefaults = () => ({v: 1, name: '', desc: '', span: 14, mode: 'standard', rules: {cash: 0, roads: 20, banned: []}, goal: {type: 'survive'}, water: [], roads: [], links: [], buildings: []});
function validMap(d) {
  if (!d || typeof d !== 'object' || d.v !== 1) return false;
  const int = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
  if (typeof d.name !== 'string' || d.name.length > 32 || typeof d.desc !== 'string' || d.desc.length > 140) return false;
  if (!int(d.span, MAP_SPAN_MIN, MAP_SPAN_MAX) || !MAP_MODES.includes(d.mode)) return false;
  const R = d.rules, G = d.goal;
  if (!R || typeof R !== 'object' || !int(R.cash, 0, 5000) || !int(R.roads, 0, 200) || !Array.isArray(R.banned) || !R.banned.every(t => MAP_TOOLS.some(x => x[0] === t))) return false;
  if (!G || typeof G !== 'object' || !(G.type === 'survive' || (G.type === 'parcels' && int(G.n, 1, 100000) && int(G.byWeek, 1, 200)))) return false;
  const n = d.span * d.span, tile = k => int(k, 0, n - 1);
  if (![d.water, d.roads, d.links, d.buildings].every(Array.isArray)) return false;
  if (!d.water.every(tile) || !d.roads.every(tile) || !d.links.every(p => Array.isArray(p) && tile(p[0]) && int(p[1], 0, 255))) return false;
  if (!d.buildings.every(b => Array.isArray(b) && int(b[0], 0, d.span - 1) && int(b[1], 0, d.span - 1) && (b[2] === 0 || b[2] === 1) && int(b[3], 0, COLORS.length - 1)
      && (b[2] === 0 || (ORTH.includes(b[4]) && int(b[5], 0, 2))))) return false;
  return true;
}
const mapGoalText = d => d.goal && d.goal.type === 'parcels' ? 'Deliver ' + d.goal.n + ' parcels by the end of week ' + d.goal.byWeek : 'Survive as long as you can';
/* the map being edited, as data */
function serializeMap() {
  const m = ed.meta || mapDefaults(), out = mapDefaults();
  Object.assign(out, {name: m.name || '', desc: m.desc || '', span, mode: m.mode, rules: {cash: m.rules.cash | 0, roads: m.rules.roads | 0, banned: m.rules.banned.slice()}, goal: Object.assign({}, m.goal)});
  const rel = k => (cy(k) - org) * span + (cx(k) - org);
  for (let r = org; r < org + span; r++) for (let c = org; c < org + span; c++) {
    const k = idx(c, r);
    if (water[k]) out.water.push(rel(k));
    if (road[k]) { out.roads.push(rel(k)); if (lnk[k]) out.links.push([rel(k), lnk[k]]); }
  }
  for (const b of buildings) { if (!inPlay(b.k)) continue; out.buildings.push(b.type === 'store' ? [cx(b.k) - org, cy(b.k) - org, 1, b.color, isBig(b) ? b.sd : 4, b.ends || 0] : [cx(b.k) - org, cy(b.k) - org, 0, b.color]); }
  return out;
}
/* lay a map's data into the (blank) world; span and org are already set */
function loadMapInto(d, withCars) {
  const abs = i => idx(org + i % d.span, org + Math.floor(i / d.span));
  for (const i of d.water) water[abs(i)] = 1;
  for (const i of d.roads) road[abs(i)] = 1;
  for (const [i, m] of d.links) { const k = abs(i); if (!road[k]) continue; for (let dd = 0; dd < 8; dd++) if ((m >> dd) & 1) { const n = nbr(k, dd); if (n >= 0 && road[n]) setLink(k, dd, true); } }
  for (const b of d.buildings) {
    const k = idx(org + b[0], org + b[1]);
    if (b[2] === 1) { if (storeFits(k, b[4], inPlay, b[5])) newBuilding(k, 'store', b[3], b[4], b[5]); }
    else if (inPlay(k) && !water[k] && !occupied(k)) newBuilding(k, 'house', b[3]);
  }
  linkBuildings();
  if (withCars) buildings.forEach((b, i) => { if (b.type === 'house') for (let j = 0; j < CFG.carsPerHouse; j++) addCar(i); });
  rebuildNet();
  for (const c of cars) { const p = parkedPose(c); c.x = p.x; c.y = p.y; c.ang = p.a; }
}
/* the same map in a bigger or smaller box, kept centred; anything outside the new box is dropped */
function resizeMapData(d, ns) {
  const o = Object.assign({}, d, {span: ns, water: [], roads: [], links: [], buildings: []}), os = d.span, sh = Math.floor((ns - os) / 2);
  const conv = i => { const c = i % os + sh, r = Math.floor(i / os) + sh; return (c < 0 || r < 0 || c >= ns || r >= ns) ? -1 : r * ns + c; };
  for (const i of d.water) { const j = conv(i); if (j >= 0) o.water.push(j); }
  for (const i of d.roads) { const j = conv(i); if (j >= 0) o.roads.push(j); }
  for (const [i, m] of d.links) { const j = conv(i); if (j >= 0) o.links.push([j, m]); }
  for (const b of d.buildings) { const c = b[0] + sh, r = b[1] + sh; if (c >= 0 && r >= 0 && c < ns && r < ns) o.buildings.push([c, r].concat(b.slice(2))); }
  return o;
}
/* a picture of a map: land, water, roads, stores as blocks and houses as dots */
function mapCanvas(d, S) {
  const cv2 = document.createElement('canvas'); cv2.width = cv2.height = S;
  const g = cv2.getContext('2d'), k = S / d.span, X = i => (i % d.span + 0.5) * k, Y = i => (Math.floor(i / d.span) + 0.5) * k;
  g.fillStyle = PAL.land2 || PAL.land; g.fillRect(0, 0, S, S);
  g.fillStyle = PAL.water; for (const i of d.water) g.fillRect((i % d.span) * k, Math.floor(i / d.span) * k, k + 0.4, k + 0.4);
  const p = new Path2D();
  for (const [i, m] of d.links) for (let dd = 0; dd < 8; dd++) if ((m >> dd) & 1) {
    const c = i % d.span + DX[dd], r = Math.floor(i / d.span) + DY[dd];
    if (c < 0 || r < 0 || c >= d.span || r >= d.span) continue;
    const j = r * d.span + c; if (j > i) { p.moveTo(X(i), Y(i)); p.lineTo(X(j), Y(j)); }
  }
  for (const i of d.roads) { p.moveTo(X(i), Y(i)); p.lineTo(X(i), Y(i)); }
  g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = PAL.edge; g.lineWidth = k * 0.72; g.stroke(p); g.strokeStyle = PAL.road; g.lineWidth = k * 0.52; g.stroke(p);
  for (const b of d.buildings) {
    g.fillStyle = COLORS[b[3]].hex;
    if (b[2] === 1) {
      const fx = DX[b[4]], fy = DY[b[4]], px = -fy, py = fx;
      for (let depth = 0; depth < STORE_DEPTH; depth++) for (let s = 0; s < STORE_W; s++) { const c = b[0] + px * s - fx * depth, r = b[1] + py * s - fy * depth; if (c >= 0 && r >= 0 && c < d.span && r < d.span) g.fillRect(c * k + 0.5, r * k + 0.5, k - 1, k - 1); }
    } else { g.beginPath(); g.arc((b[0] + 0.5) * k, (b[1] + 0.5) * k, k * 0.38, 0, 6.3); g.fill(); g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 1; g.stroke(); }
  }
  return cv2;
}
function drawMapThumb(d) { for (const S of [96, 64, 48]) { const u = mapCanvas(d, S).toDataURL('image/png'); if (u.length <= 8192) return u; } return ''; }
/* ---- drafts on this device */
function readDrafts() { try { const o = JSON.parse(localStorage.getItem(MAPS_KEY)); return o && typeof o === 'object' && o.drafts ? o : {drafts: {}}; } catch (e) { return {drafts: {}}; } }
function writeDrafts(o) { try { localStorage.setItem(MAPS_KEY, JSON.stringify(o)); } catch (e) {} }
function saveDraft(d, quiet) {
  if (!ed.draft) ed.draft = 'd' + Date.now().toString(36);
  const o = readDrafts(); o.drafts[ed.draft] = {data: d, code: ed.code || '', at: Date.now()}; writeDrafts(o);
  if (!quiet) toast('Draft saved on this device.', 'good');
}
/* ---- the editor itself: a paused city with endless road and money, painted with the editor bar's tools */
function openEditor(d, opts) {
  d = d || mapDefaults(); opts = opts || {};
  if (!validMap(d)) { toast('That map can’t be opened.', 'warn'); return false; }
  closeModal('m-start'); document.querySelectorAll('.modal').forEach(m => { m.hidden = true; }); modalOpen = false;
  closeMenu(); toggleCust(false); closeInspector();
  mapStarting = true;
  try { resetGameBlank(d.mode); } finally { mapStarting = false; }
  mapPlay = false; mapCur = null; mapGoalDone = false; window.JunctionAPI.mapId = null; window.JunctionAPI.mapGoalDone = false; mapBanned = new Set(); applyMapBans();
  curSlot = ''; pendingSlot = ''; demoMode = false;
  inv = {road: 1e9, bridge: 1e9, moto: 0, light: 0, round: 0, sign: 0, park: 0, depot: 0}; perks = Object.assign({}, PERK_DEFAULTS);
  money = 1e9; score = 0; week = 1; weekTimer = 1e9; houseTimer = storeTimer = 1e9; clock = 0; carCapacity = CFG.carCapacityStart; carsBought = 0; goalsDone = new Set();
  span = d.span; org = Math.floor((MAXD - span) / 2); camSpan = span; camOrg = org;
  loadMapInto(d, false);
  ed.meta = {name: d.name, desc: d.desc, mode: d.mode, rules: {cash: d.rules.cash, roads: d.rules.roads, banned: d.rules.banned.slice()}, goal: Object.assign({}, d.goal)};
  ed.draft = opts.draft || 'd' + Date.now().toString(36); ed.code = opts.code || '';
  if (!ED_TOOLS.some(t => t[0] === ed.tool)) ed.tool = 'road';
  editorMode = true; started = true; running = false; over = false; tool = ed.tool === 'road' ? 'road' : 'ed'; motoPick = -1;
  $('app').classList.add('editing');
  camReset(true); refreshUI(); refreshHud(); layout(); renderEdBar(); renderMapTest();
  hint('Drag to lay road. Pick Water, Store or House in the editor bar; Settings sets the name, size, rules and goal.', true);
  return true;
}
function exitEditor() {
  if (!editorMode) return;
  editorMode = false; tool = 'select'; $('app').classList.remove('editing');
  const bar = $('ed-bar'); if (bar) bar.hidden = true;
}
function applyMapBans() {
  document.querySelectorAll('#dock .tool').forEach(b => {
    const def = TOOLS.find(t => t.id === b.dataset.id), key = def && def.inv ? def.inv : b.dataset.id;
    b.dataset.banned = mapBanned.has(key) ? '1' : '0';
  });
}
function brushTiles(k) {
  const rad = [0, 0.5, 1.3, 2.1][ed.size] || 0.5, c0 = cx(k), r0 = cy(k), out = [];
  for (let r = Math.floor(r0 - rad); r <= Math.ceil(r0 + rad); r++) for (let c = Math.floor(c0 - rad); c <= Math.ceil(c0 + rad); c++) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
    if ((c - c0) ** 2 + (r - r0) ** 2 > rad * rad + 0.01) continue;
    const t = idx(c, r); if (inPlay(t)) out.push(t);
  }
  return out;
}
function edWater(k, v) {
  let n = 0;
  for (const t of brushTiles(k)) { if (road[t] || bAt[t] >= 0 || water[t] === v) continue; water[t] = v; n++; }
  if (n) netVer++;
}
function removeBuildingAt(bi) {
  const b = buildings[bi]; if (!b) return;
  buildings.splice(bi, 1); cars = [];
  bAt.fill(-1); buildings.forEach((x, i) => { x.cars = []; x.carsN = 0; markBuilding(x, i); });
  linkBuildings(); rebuildNet(); refreshUI(); sfx('erase'); renderEdBar();
}
function edErase(k) {
  if (bAt[k] >= 0) { removeBuildingAt(bAt[k]); return; }
  if (road[k]) { eraseAt(k, false); return; }
  if (water[k]) { water[k] = 0; netVer++; }
}
function edPlaceStore(k) {
  if (!storeFits(k, ed.sd, inPlay, ed.ends)) { hint('No room for a store there: it needs a 2×3 plot of dry land, with space for a road at an open end of its car park.'); return; }
  const b = newBuilding(k, 'store', ed.col, ed.sd, ed.ends);
  linkBuildings(); rebuildNet(); refreshUI(); sfx('place'); popRing(bX(b), bY(b), COLORS[ed.col].hex); renderEdBar();
}
function edPlaceHouse(k) {
  if (water[k] || occupied(k) || storeFront(k)) { hint(storeFront(k) ? 'That tile is kept clear so a road can reach the store’s car park.' : 'A house needs an empty, dry tile.'); return; }
  const b = newBuilding(k, 'house', ed.col);
  linkBuildings(); rebuildNet(); refreshUI(); sfx('place'); popRing(bX(b), bY(b), COLORS[ed.col].hex); renderEdBar();
}
function edApply(k, dragging) {
  if (k < 0 || !inPlay(k)) return;
  switch (ed.tool) {
    case 'road': placeRoad(k, false, !dragging); break;
    case 'water': edWater(k, 1); break;
    case 'dry': edWater(k, 0); break;
    case 'erase': edErase(k); break;
    case 'store': if (!dragging) edPlaceStore(k); break;
    case 'house': if (!dragging) edPlaceHouse(k); break;
  }
}
const ED_ICONS = {
  road: '<path d="M6 20l3-16M18 20l-3-16M12 7v2M12 12v2M12 17v2"/>',
  water: '<path d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
  dry: '<circle cx="12" cy="8" r="3"/><path d="M3 20h18M5 17l3-3 3 3 3-4 4 4"/>',
  store: '<path d="M4 9h16l-1.5 11h-13z"/><path d="M8 9V7a4 4 0 018 0v2"/>',
  house: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  erase: '<path d="M16 4l5 5-10 10H7l-4-4z"/><path d="M9 10l5 5"/>'
};
const edIcon = k => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ED_ICONS[k] + '</svg>';
function renderEdBar() {
  const box = $('ed-bar'); if (!box) return;
  box.hidden = !editorMode; if (!editorMode) return;
  const m = ed.meta;
  $('eb-name').textContent = m.name || 'Untitled map';
  $('eb-sub').textContent = DIFFS[m.mode].label + ' · ' + span + '×' + span + ' · ' + mapGoalText(m) + (ed.code ? ' · code ' + ed.code : '');
  $('eb-tools').innerHTML = ED_TOOLS.map(([id, l]) => '<button type="button" data-edt="' + id + '" aria-pressed="' + (ed.tool === id) + '">' + edIcon(id) + l + '</button>').join('');
  let opt = '';
  if (ed.tool === 'water' || ed.tool === 'dry') opt = '<span class="eb-l">Brush</span><div class="seg">' + [1, 2, 3].map(s => '<button type="button" data-edsize="' + s + '" aria-pressed="' + (ed.size === s) + '">' + ['', 'Dot', 'Small', 'Big'][s] + '</button>').join('') + '</div>';
  if (ed.tool === 'store' || ed.tool === 'house') opt = '<span class="eb-l">Colour</span><div class="eb-cols">' + COLORS.map((c, i) => '<button type="button" class="eb-col" data-edcol="' + i + '" aria-pressed="' + (ed.col === i) + '" style="--c:' + c.hex + '" aria-label="' + c.name + '" title="' + c.name + '"></button>').join('') + '</div>';
  if (ed.tool === 'store') opt += '<span class="eb-l">Car park</span><div class="seg">' + [[0, 'N'], [2, 'E'], [4, 'S'], [6, 'W']].map(([d, l]) => '<button type="button" data-edsd="' + d + '" aria-pressed="' + (ed.sd === d) + '">' + l + '</button>').join('') + '</div>' +
    '<span class="eb-l">Open ends</span><div class="seg">' + [[0, 'Both'], [1, 'Near'], [2, 'Far']].map(([e, l]) => '<button type="button" data-edends="' + e + '" aria-pressed="' + (ed.ends === e) + '">' + l + '</button>').join('') + '</div>';
  $('eb-opts').innerHTML = opt; $('eb-opts').hidden = !opt;
  const n = buildings.filter(b => b.type === 'store').length, h = buildings.length - n;
  $('eb-count').textContent = n + ' store' + (n === 1 ? '' : 's') + ', ' + h + ' house' + (h === 1 ? '' : 's') + ' · tap a tile, drag to paint';
}
/* ---- the settings sheet: name, size, pace, rules and goal */
function openEdSettings() {
  const m = ed.meta; if (!m) return;
  $('es-name').value = m.name || ''; $('es-desc').value = m.desc || ''; $('es-span').value = span; $('es-spanv').textContent = span + '×' + span;
  document.querySelectorAll('#es-mode button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === m.mode)));
  $('es-cash').value = m.rules.cash; $('es-roads').value = m.rules.roads;
  document.querySelectorAll('#es-goal button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === m.goal.type)));
  $('es-goalrow').hidden = m.goal.type !== 'parcels'; $('es-goaln').value = m.goal.n || 100; $('es-goalw').value = m.goal.byWeek || 5;
  $('es-bans').innerHTML = MAP_TOOLS.map(([id, l]) => '<label><input type="checkbox" data-ban="' + id + '"' + (m.rules.banned.includes(id) ? ' checked' : '') + '><span>' + l + '</span></label>').join('');
  $('es-err').textContent = '';
  openModal('m-edset');
}
function applyEdSettings() {
  const m = ed.meta, err = $('es-err'), name = $('es-name').value.trim(), desc = $('es-desc').value.trim();
  if (name && (name.length < 3 || name.length > 32)) { err.textContent = 'Map names are 3–32 characters.'; return; }
  const on = window.JunctionOnline;
  if (on && on.textOk && (!on.textOk(name) || !on.textOk(desc))) { err.textContent = 'Please choose a friendlier name or description.'; return; }
  const cash = clamp(Math.round(+$('es-cash').value || 0), 0, 5000), roads = clamp(Math.round(+$('es-roads').value || 0), 0, 200);
  const gt = document.querySelector('#es-goal [aria-pressed="true"]'), goal = gt && gt.dataset.v === 'parcels' ? {type: 'parcels', n: clamp(Math.round(+$('es-goaln').value || 1), 1, 100000), byWeek: clamp(Math.round(+$('es-goalw').value || 1), 1, 200)} : {type: 'survive'};
  const md = document.querySelector('#es-mode [aria-pressed="true"]'), mode = md && MAP_MODES.includes(md.dataset.v) ? md.dataset.v : 'standard';
  const banned = [...document.querySelectorAll('#es-bans input:checked')].map(i => i.dataset.ban);
  Object.assign(m, {name, desc, mode, goal, rules: {cash, roads, banned}});
  const ns = clamp(Math.round(+$('es-span').value || span), MAP_SPAN_MIN, MAP_SPAN_MAX);
  closeModal('m-edset');
  if (ns !== span) { const d = resizeMapData(serializeMap(), ns); openEditor(d, {draft: ed.draft, code: ed.code}); toast('Map resized to ' + ns + '×' + ns + '.', 'good'); }
  else { DIFF = DIFFS[mode]; diffKey = mode; renderEdBar(); }
}
/* ---- playing a map: a real city of the map's pace, laid out from its data, with its rules and goal */
function startMapCity(d, meta) {
  if (!validMap(d)) { toast('That map can’t be opened.', 'warn'); return false; }
  closeModal('m-start'); document.querySelectorAll('.modal').forEach(m => { m.hidden = true; }); modalOpen = false;
  closeMenu(); toggleCust(false); closeInspector();
  if (editorMode) exitEditor();
  mapStarting = true;
  try { pendingSlot = ''; resetGame(d.mode); } finally { mapStarting = false; }
  curSlot = '';
  for (const b of buildings) for (const t of bTiles(b)) bAt[t] = -1;
  buildings = []; cars = []; trucks = []; water.fill(0); road.fill(0); lnk.fill(0); undoStack = []; redoStack = [];
  span = d.span; org = Math.floor((MAXD - span) / 2); camSpan = span; camOrg = org;
  rand = seededRand(strHash('junction-map-' + ((meta && meta.id) || d.name || 'draft')));
  loadMapInto(d, true);
  money = Math.max(0, d.rules.cash | 0); inv.road = Math.max(0, d.rules.roads | 0);
  if (typeof hudShown === 'object' && hudShown) { hudShown.money = money; hudShown.score = score; }
  mapBanned = new Set(d.rules.banned); applyMapBans();
  mapPlay = true; mapCur = Object.assign({}, meta || {}, {data: d}); mapGoalDone = false;
  window.JunctionAPI.mapId = mapCur.id || null; window.JunctionAPI.mapGoalDone = false;
  running = true; started = true; over = false; camReset(true); setTool('select'); refreshUI(); refreshHud(); layout(); renderMapTest();
  hint(mapCur.test ? 'Test run: the city plays for real. Back to editor keeps your map as it was.' : mapGoalText(d) + '.', true);
  return true;
}
function mapLeave() {
  mapPlay = false; mapCur = null; mapGoalDone = false; window.JunctionAPI.mapId = null; window.JunctionAPI.mapGoalDone = false;
  if (mapBanned.size) { mapBanned = new Set(); applyMapBans(); }
  if (editorMode) exitEditor();
  renderMapTest();
}
function renderMapTest(textOnly) {
  const box = $('ed-test'); if (!box) return;
  const on = mapPlay && started && !editorMode && !!mapCur;
  box.hidden = !on; if (!on) return;
  const d = mapCur.data, g = d.goal;
  const gt = g.type === 'parcels' ? (mapGoalDone ? 'Goal reached ✓ — keep going' : 'Goal: ' + g.n + ' parcels by week ' + g.byWeek + ' · ' + score + ' so far') : 'Survive as long as you can';
  $('et-text').innerHTML = '<small>' + (mapCur.test ? 'Testing your map' : 'Community map') + '</small><b>' + escH(d.name || 'Untitled map') + '</b><span>' + (mapCur.authorName && !mapCur.test ? 'by ' + escH(mapCur.authorName) + ' · ' : '') + escH(gt) + '</span>';
  if (textOnly) return;
  $('et-btns').innerHTML = mapCur.test ? '<button type="button" class="act small" data-et="back">Back to editor</button><button type="button" class="act small" data-et="publish">Publish</button>'
    : '<button type="button" class="act small" data-et="menu">Main menu</button>' + (mapCur.code ? '<button type="button" class="act small" data-et="copy">Copy code</button>' : '');
}
function testPlay() {
  const d = serializeMap();
  if (!d.buildings.some(b => b[2] === 1)) { toast('Place at least one store first.', 'warn'); return; }
  saveDraft(d, true);
  startMapCity(d, {test: true, draft: ed.draft, code: ed.code});
}
async function copyText(t) { try { await navigator.clipboard.writeText(t); toast('Copied: ' + t, 'good'); } catch (e) { toast('Code: ' + t); } }
function shareMap(m) {
  let d; try { d = typeof m.data === 'string' ? JSON.parse(m.data) : m.data; } catch (e) { d = null; }
  const pic = d && validMap(d) ? mapCanvas(d, 480) : null, code = m.code || m.id || '';
  const c = makeShareCard({pic, kicker: 'Community map · code ' + code, big: m.name || 'Untitled map', bigLabel: 'by ' + (m.authorName || 'a player'), title: m.goalText || (d ? mapGoalText(d) : ''),
    stats: [['Likes', m.likes || 0], ['Plays', m.plays || 0], ['Pace', (DIFFS[m.mode] || DIFFS.standard).label], ['Size', d ? d.span + '×' + d.span : '']], line: 'Enter the code in Junction’s Map editor to play it.'});
  return shareCanvas(c, 'junction-map-' + code, 'Play my Junction map “' + (m.name || '') + '”: enter the code ' + code + ' in the Map editor.');
}
async function publishMapData(d, meta) {
  const on = window.JunctionOnline; meta = meta || {};
  if (!(on && on.ready && on.publishMap)) { toast('Publishing needs the online service — sign in or play as a guest first.', 'warn'); return; }
  const name = (d.name || '').trim();
  if (name.length < 3) { toast('Give the map a name (3–32 letters) in Settings first.', 'warn'); return; }
  const ns = d.buildings.filter(b => b[2] === 1).length, nh = d.buildings.length - ns;
  if (!ns || !nh) { toast('A map needs at least one store and one house.', 'warn'); return; }
  if (JSON.stringify(d).length > MAP_MAX_JSON) { toast('This map is too big to publish.', 'warn'); return; }
  if (!(await ask({title: meta.code ? 'Update this map?' : 'Publish this map?', text: meta.code ? 'Everyone who opens code ' + meta.code + ' gets this version.' : 'It gets a 6-letter code anyone can enter, and shows up in Community maps.', ok: meta.code ? 'Update' : 'Publish'}))) return;
  try {
    const r = await on.publishMap({code: meta.code || '', data: d, name, desc: d.desc || '', goalText: mapGoalText(d), thumb: drawMapThumb(d)});
    ed.code = r.code; if (mapCur) mapCur.code = r.code; saveDraft(d, true);
    $('ep-title').textContent = r.updated ? 'Updated' : 'Published!'; $('ep-code').textContent = r.code;
    $('ep-share').onclick = () => shareMap({code: r.code, name, data: d, authorName: on.myName ? on.myName() : '', goalText: mapGoalText(d), mode: d.mode});
    openModal('m-edpub'); renderMapTest(); renderEdBar();
  } catch (e) { toast('Couldn’t publish: ' + ((e && e.message) || e), 'warn'); }
}
/* ---- the Map editor page on the main menu: community maps, your published maps, and drafts */
function mapCardHTML(m, opts) {
  opts = opts || {};
  let d = null; try { d = typeof m.data === 'string' ? JSON.parse(m.data) : m.data; } catch (e) {}
  const thumb = m.thumb || (d && validMap(d) ? mapCanvas(d, 84).toDataURL() : '');
  const mode = (DIFFS[m.mode] || DIFFS.standard).label, code = m.code || m.id || '';
  const btns = opts.draft
    ? '<button class="bigbtn" type="button" data-act="edit">Edit</button><button class="act" type="button" data-act="test">Test play</button>' + (code ? '<button class="act" type="button" data-act="copy">Copy code</button>' : '') + '<button class="act danger" type="button" data-act="deldraft">Delete</button>'
    : '<button class="bigbtn" type="button" data-act="play">Play</button><button class="act" type="button" data-act="board">Leaderboard</button><button class="act" type="button" data-act="share">Share</button>' +
      (m.mine ? '<button class="act" type="button" data-act="edit">Edit</button><button class="act danger" type="button" data-act="del">Delete</button>' : '<button class="act" type="button" data-act="report">Report</button>');
  return '<article class="mapcard' + (m.mine ? ' mine' : '') + '" data-id="' + escH(code || m.draftId || '') + '"' + (opts.draft ? ' data-draft="' + escH(m.draftId) + '"' : '') + '>' +
    (thumb ? '<img class="mc-thumb" alt="" src="' + thumb + '">' : '<span class="mc-thumb"></span>') +
    '<div class="mc-body"><b>' + escH(m.name || 'Untitled map') + '</b><small>' + (opts.draft ? (code ? 'Published as ' + escH(code) : 'Draft') + ' · ' + agoLocal(m.at || Date.now()) : 'by ' + escH(m.authorName || '?')) + '<span class="mc-chip">' + mode + '</span>' + (d ? '<span class="mc-chip">' + d.span + '×' + d.span + '</span>' : '') + '</small>' +
    (m.desc ? '<p>' + escH(m.desc) + '</p>' : '') + '<em>' + escH(m.goalText || (d ? mapGoalText(d) : '')) + '</em></div>' +
    (opts.draft ? '' : '<div class="mc-row"><button type="button" class="mc-like" data-act="like" aria-pressed="' + (!!m.liked) + '" aria-label="Like">♥ <span>' + (m.likes || 0) + '</span></button><span>▶ ' + (m.plays || 0) + ' play' + (m.plays === 1 ? '' : 's') + '</span><code>' + escH(code) + '</code></div>') +
    '<div class="mc-btns">' + btns + '</div></article>';
}
function renderEditorPane() {
  const box = $('mm-editor'); if (!box) return;
  document.querySelectorAll('#ed-tabs [data-edtab]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.edtab === edTab)));
  const on = window.JunctionOnline, online = !!(on && on.ready && on.loadMaps);
  const head = '<div class="ed-head"><button class="bigbtn" type="button" data-act="new">New map</button><p class="mini ed-lead">Build a map, test it, then publish it with a code.</p>' +
    '<form class="ed-code" id="ed-codeform"><input id="ed-codein" type="text" maxlength="6" autocomplete="off" spellcheck="false" placeholder="MAP CODE" aria-label="Map code"><button class="act" type="submit">Open</button></form></div>';
  if (edTab === 'drafts') {
    const o = readDrafts(), list = Object.entries(o.drafts).map(([id, v]) => Object.assign({draftId: id, at: v.at, code: v.code, data: v.data}, v.data)).sort((a, b) => b.at - a.at);
    box.innerHTML = head + '<h3>Drafts on this device</h3>' + (list.length ? '<div class="mapgrid">' + list.map(m => mapCardHTML(m, {draft: true})).join('') + '</div>' : '<p class="mini">No drafts yet. New map starts one; drafts save when you test-play, publish or leave the editor.</p>');
    return;
  }
  if (!online) { box.innerHTML = head + '<p class="mini">Community maps need the online service — it’s still connecting, or isn’t available right now. Drafts still work offline.</p>'; return; }
  if (edTab === 'mine') {
    box.innerHTML = head + '<h3>Your published maps</h3><div class="mapgrid" id="ed-grid"><p class="mini">Loading…</p></div>';
    on.myMaps().then(list => { if (edTab !== 'mine') return; list.forEach(m => { mapRows[m.id] = m; }); $('ed-grid').innerHTML = list.length ? list.map(m => mapCardHTML(m)).join('') : '<p class="mini">Nothing published yet. Publish a map from the editor and it shows up here.</p>'; })
      .catch(e => { $('ed-grid').innerHTML = '<p class="mini">Couldn’t load your maps: ' + escH(e.message) + '</p>'; });
    return;
  }
  box.innerHTML = head + '<div class="ed-sortrow"><h3>Community maps</h3><div class="seg" id="ed-sort">' + [['likes', 'Popular'], ['new', 'New'], ['plays', 'Most played']].map(([k, l]) => '<button type="button" data-edsort="' + k + '" aria-pressed="' + (edSort === k) + '">' + l + '</button>').join('') + '</div></div>' +
    '<div class="mapgrid" id="ed-grid"><p class="mini">Loading…</p></div>';
  const want = edSort;
  on.loadMaps(edSort).then(list => { if (edTab !== 'browse' || edSort !== want || !$('ed-grid')) return; list.forEach(m => { mapRows[m.id] = m; }); $('ed-grid').innerHTML = list.length ? list.map(m => mapCardHTML(m)).join('') : '<p class="mini">No maps yet — publish the first one.</p>'; })
    .catch(e => { if ($('ed-grid')) $('ed-grid').innerHTML = '<p class="mini">Couldn’t load maps: ' + escH(e.message) + '</p>'; });
}
async function edPaneAction(act, card) {
  const on = window.JunctionOnline, id = card ? card.dataset.id : '', draftId = card ? card.dataset.draft : '';
  const need = () => { if (!(on && on.ready)) { toast('Online features are still connecting — try again in a moment.', 'warn'); return false; } return true; };
  try {
    if (act === 'new') { openEditor(mapDefaults(), {}); return; }
    if (draftId) {
      const o = readDrafts(), v = o.drafts[draftId]; if (!v) return;
      if (act === 'edit') openEditor(v.data, {draft: draftId, code: v.code || ''});
      else if (act === 'test') { ed.draft = draftId; ed.code = v.code || ''; ed.meta = {name: v.data.name, desc: v.data.desc, mode: v.data.mode, rules: v.data.rules, goal: v.data.goal}; startMapCity(v.data, {test: true, draft: draftId, code: v.code || ''}); }
      else if (act === 'copy') copyText(v.code);
      else if (act === 'deldraft') { if (await ask({title: 'Delete this draft?', text: 'It’s only on this device' + (v.code ? '; the published copy stays online' : '') + '.', ok: 'Delete', danger: true})) { delete o.drafts[draftId]; writeDrafts(o); renderEditorPane(); } }
      return;
    }
    const m = mapRows[id]; if (!m) return;
    if (act === 'play') { if (need()) await on.playMap(id); }
    else if (act === 'board') { if (need()) await on.openMapBoard(id); }
    else if (act === 'share') shareMap(m);
    else if (act === 'report') { if (need()) on.reportMap(id, m.name); }
    else if (act === 'like') { if (!need()) return; const r = await on.likeMap(id); const b = card.querySelector('.mc-like'); b.setAttribute('aria-pressed', String(r.liked)); b.querySelector('span').textContent = r.likes; }
    else if (act === 'edit') { let d; try { d = JSON.parse(m.data); } catch (e) {} if (!d) return; openEditor(d, {draft: 'p' + id, code: id}); }
    else if (act === 'del') { if (await ask({title: 'Delete this map?', text: 'Code ' + id + ' stops working and the map leaves Community maps. This can’t be undone.', ok: 'Delete', danger: true})) { await on.deleteMap(id); delete mapRows[id]; toast('Map deleted.', 'good'); renderEditorPane(); } }
  } catch (e) { toast((e && e.message) || String(e), 'warn'); }
}
/* ---- the game hooks: all wrappers, so the functions above keep their bodies */
MM_TITLES.editor = 'Map editor';
const _showMMEd = showMM;
showMM = function (pane) { _showMMEd(pane); if (pane === 'editor') { $('m-start').classList.add('center-pane'); renderEditorPane(); } };
const _saveGameEd = saveGame;
saveGame = function (urgent) { if (mapPlay || editorMode) return; return _saveGameEd(urgent); };
const _writeSlotEd = writeSlot;
writeSlot = function (final) { if (mapPlay || editorMode) return; return _writeSlotEd(final); };
const _resetGameEd = resetGame;
resetGame = function (dk) {
  if (!mapStarting) {
    if (mapPlay && mapCur && $('m-start').hidden) { const m = mapCur; return startMapCity(m.data, m); }   // Restart or Play again on a map: the same map again
    mapLeave();
  }
  return _resetGameEd(dk);
};
const _resetBlankEd = resetGameBlank;
resetGameBlank = function (dk) { if (!mapStarting) mapLeave(); return _resetBlankEd(dk); };
const _startDemoEd = startDemo;
startDemo = function () { mapLeave(); return _startDemoEd(); };
const _goHomeEd = goHome;
goHome = async function () {
  if (editorMode) {
    const d = serializeMap();
    if (d.buildings.length || d.water.length || d.roads.length) saveDraft(d, true);
    exitEditor(); started = false;
  }
  return _goHomeEd();
};
const _openPauseEd = openPause;
openPause = function () { if (editorMode) { openEdSettings(); return false; } return _openPauseEd(); };
const _setToolEd = setTool;
setTool = function (t) { if (editorMode) return; return _setToolEd(t); };
const _applyToolEd = applyTool;
applyTool = function (k, dragging) {
  if (editorMode) return edApply(k, dragging);
  if (mapPlay && mapBanned.size) {
    const key = isSignTool(tool) ? 'sign' : tool;
    if (mapBanned.has(key)) { hint('This map doesn’t allow ' + (MAP_TOOLS.find(x => x[0] === key) || [0, key])[1].toLowerCase() + '.'); return; }
  }
  return _applyToolEd(k, dragging);
};
const _endGameEd = endGame;
endGame = function (why) {
  if (!mapPlay) return _endGameEd(why);
  const bk = bestKey(diffKey); let bv = null, sv = null;
  try { bv = localStorage.getItem(bk); sv = localStorage.getItem(SAVE_KEY); } catch (e) {}
  const r = _endGameEd(why);
  try { if (bv === null) localStorage.removeItem(bk); else localStorage.setItem(bk, bv); if (sv === null) localStorage.removeItem(SAVE_KEY); else localStorage.setItem(SAVE_KEY, sv); } catch (e) {}
  best = lastRun.prevBest; $('over-newbest').hidden = true;
  $('over-best').textContent = mapCur && mapCur.id ? 'A community map: this run goes on the map’s own leaderboard, not your ' + DIFF.label + ' best.' : 'A test run of your map.';
  renderMapTest();
  return r;
};
const _drawEd = draw;
draw = function () {
  _drawEd();
  if (!editorMode) return;
  ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (W / 2 - cam.x * cam.z), dpr * (H / 2 - cam.y * cam.z));
  ctx.save();
  ctx.setLineDash([CELL * 0.5, CELL * 0.35]); ctx.lineWidth = 3 / cam.z; ctx.strokeStyle = 'rgba(255,201,51,.9)';
  ctx.strokeRect(org * CELL, org * CELL, span * CELL, span * CELL); ctx.setLineDash([]);
  const k = hoverCell;
  if (k >= 0 && inPlay(k) && !modalOpen && !pinch && !panning) {
    let tiles = null, ok = true;
    if (ed.tool === 'store') { tiles = storeTilesAt(k, ed.sd) || [k]; ok = storeFits(k, ed.sd, inPlay, ed.ends); }
    else if (ed.tool === 'house') { tiles = [k]; ok = !water[k] && !occupied(k) && !storeFront(k); }
    else if (ed.tool === 'water' || ed.tool === 'dry') tiles = brushTiles(k);
    else if (ed.tool === 'erase') { tiles = [k]; ok = false; }
    if (tiles) { ctx.fillStyle = ok ? 'rgba(67,209,122,.38)' : 'rgba(255,90,74,.42)'; for (const t of tiles) ctx.fillRect(cx(t) * CELL + 2, cy(t) * CELL + 2, CELL - 4, CELL - 4); }
    if (ed.tool === 'store' && ok) { ctx.fillStyle = 'rgba(255,201,51,.7)'; for (const [f] of storeDoorsAt(k, ed.sd, ed.ends)) { ctx.beginPath(); ctx.arc(tx(f), ty(f), CELL * 0.2, 0, 6.3); ctx.fill(); } }
  }
  ctx.restore();
};
const _emitEd = JEvents.emit;
JEvents.emit = function (n, d) {
  if (mapPlay && (n === 'over' || n === 'week' || n === 'autosave' || n === 'allGoals')) {
    if (n === 'over' || n === 'week') return _emitEd.call(this, 'map' + n, Object.assign({}, d, {mapId: (mapCur && mapCur.id) || null, goal: mapGoalDone}));
    return;
  }
  return _emitEd.call(this, n, d);
};
/* the goal: reached when the parcels are in; missed when the week after the deadline starts without them */
setInterval(() => {
  if (!mapPlay || !started || over || !mapCur) return;
  const g = mapCur.data.goal;
  if (g.type === 'parcels' && !mapGoalDone) {
    if (score >= g.n) { mapGoalDone = true; window.JunctionAPI.mapGoalDone = true; toast('Goal reached: ' + g.n + ' parcels by week ' + g.byWeek + '!', 'good'); sfx('upgrade'); JEvents.emit('week', {week, score, diffKey}); }
    else if (week > g.byWeek && running && !modalOpen) { endGame('Week ' + g.byWeek + ' ended with ' + score + ' of the ' + g.n + ' parcels this map asks for.'); return; }
  }
  renderMapTest(true);
}, 1000);
Object.assign(window.JunctionAPI, {mapId: null, mapGoalDone: false, validMap, mapCanvas, mapGoalText, startMapCity(d, meta) { return startMapCity(d, meta); }, openEditor(d, o) { return openEditor(d, o); }});
{
  const bar = $('ed-bar');
  if (bar) bar.addEventListener('click', e => {
    const t = e.target.closest('[data-edt],[data-edsize],[data-edcol],[data-edsd],[data-edends]');
    if (t) {
      const ds = t.dataset;
      if (ds.edt !== undefined) { ed.tool = ds.edt; tool = ed.tool === 'road' ? 'road' : 'ed'; motoPick = -1; }
      if (ds.edsize !== undefined) ed.size = +ds.edsize;
      if (ds.edcol !== undefined) ed.col = +ds.edcol;
      if (ds.edsd !== undefined) ed.sd = +ds.edsd;
      if (ds.edends !== undefined) ed.ends = +ds.edends;
      renderEdBar(); return;
    }
    if (e.target.closest('#eb-settings')) openEdSettings();
    else if (e.target.closest('#eb-test')) testPlay();
    else if (e.target.closest('#eb-save')) saveDraft(serializeMap());
    else if (e.target.closest('#eb-publish')) publishMapData(serializeMap(), {code: ed.code});
    else if (e.target.closest('#eb-exit')) goHome();
  });
  const et = $('ed-test');
  if (et) et.addEventListener('click', e => {
    const b = e.target.closest('[data-et]'); if (!b || !mapCur) return;
    const act = b.dataset.et, m = mapCur;
    if (act === 'back') openEditor(m.data, {draft: m.draft, code: m.code});
    else if (act === 'publish') publishMapData(m.data, {code: m.code});
    else if (act === 'menu') goHome();
    else if (act === 'copy') copyText(m.code);
  });
  const pane = $('mm-editor');
  if (pane) {
    pane.addEventListener('click', e => {
      const s = e.target.closest('[data-edsort]'); if (s) { edSort = s.dataset.edsort; renderEditorPane(); return; }
      const b = e.target.closest('[data-act]'); if (!b) return;
      edPaneAction(b.dataset.act, b.closest('.mapcard'));
    });
    pane.addEventListener('submit', async e => {
      if (!e.target.closest('#ed-codeform')) return;
      e.preventDefault();
      const code = $('ed-codein').value.trim().toUpperCase(), on = window.JunctionOnline;
      if (!MAP_CODE_RE.test(code)) { toast('A map code is 6 letters or digits, like AB3CD7.', 'warn'); return; }
      if (!(on && on.ready && on.getMap)) { toast('Online features are still connecting — try again in a moment.', 'warn'); return; }
      try { const m = await on.getMap(code); mapRows[m.id] = m; const g = $('ed-grid'); if (g) g.innerHTML = mapCardHTML(m) + g.innerHTML; else renderEditorPane(); }
      catch (err) { toast((err && err.message) || String(err), 'warn'); }
    });
  }
  document.querySelectorAll('#ed-tabs [data-edtab]').forEach(b => b.addEventListener('click', () => { edTab = b.dataset.edtab; renderEditorPane(); }));
  const seg = (id, after) => { const el = $(id); if (el) el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; el.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); if (after) after(b); }); };
  seg('es-mode'); seg('es-goal', b => { $('es-goalrow').hidden = b.dataset.v !== 'parcels'; });
  if ($('es-span')) $('es-span').addEventListener('input', () => { $('es-spanv').textContent = $('es-span').value + '×' + $('es-span').value; });
  if ($('es-ok')) $('es-ok').addEventListener('click', applyEdSettings);
  if ($('es-cancel')) $('es-cancel').addEventListener('click', () => closeModal('m-edset'));
  if ($('ep-copy')) $('ep-copy').addEventListener('click', () => copyText($('ep-code').textContent));
  if ($('ep-done')) $('ep-done').addEventListener('click', () => closeModal('m-edpub'));
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    for (const id of ['m-edset', 'm-edpub', 'm-mapboard', 'm-mapreport']) if ($(id) && !$(id).hidden) { e.stopPropagation(); closeModal(id); return; }
  }, true);
}

/* ===== Co-op (C4): one city, built together. The host runs the simulation as a normal game; guests see it
   through the spectate path (so nothing simulates or saves on their side) but keep the build tools, and every
   tool action a guest makes is sent to the host, who applies it to the real city. The session, the actions,
   the cursors and the panel's data live in online.js; this part only wraps the game's own functions at the end
   of the file (function declarations are reassignable bindings) and draws the other players' cursors. ===== */
let coop = null, coopApplying = false, coopHint = '', coopCursors = [], coopBubbles = [], coopLayerEl = null, coopLastSend = {};
const coopGuest = () => !!(coop && !coop.host);
const COOP_CUR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l14 8.5-6.2 1.6L9.6 19z" fill="var(--c)" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
function coopSend(a) {
  if (!coop || coop.host || !a || !coop.send) return;
  const key = a.act + ':' + a.k + ':' + (a.k2 === undefined ? '' : a.k2) + ':' + (a.kind || ''), now = performance.now();
  if (a.act !== 'emote' && coopLastSend[key] && now - coopLastSend[key] < 400) return;      // a drag crossing the same tile twice
  coopLastSend[key] = now;
  coop.send(a);
}
/* what a guest's tap means with the current tool (the motorway's two taps are handled here, locally) */
function coopActionFor(k, dragging) {
  if (k < 0 || !inPlay(k)) return null;
  switch (tool) {
    case 'select': return null;
    case 'road': return {act: 'road', k, k2: -1};
    case 'erase': return {act: 'erase', k};
    case 'park': return dragging ? null : {act: 'park', k};
    case 'depot': return dragging ? null : {act: 'depot', k};
    case 'light': case 'round': {
      if (dragging) return null;
      if (!isRoad(k)) { hint('Lights and roundabouts go on road tiles.'); return null; }
      return {act: 'special', k, kind: tool};
    }
    case 'upgrade': return dragging ? null : {act: 'upstore', k};
    case 'tow': return dragging ? null : {act: 'tow', k};
    case 'moto': {
      if (dragging) return null;
      if (!isRoad(k)) { hint('Motorways start and end on road tiles.'); return null; }
      if (motoPick < 0) { motoPick = k; hint('Now pick the far end.'); return null; }
      if (motoPick === k) { motoPick = -1; return null; }
      const a = motoPick;
      if (Math.hypot(cx(k) - cx(a), cy(k) - cy(a)) < 4) { motoPick = k; hint('Motorways need at least 4 tiles between ends.'); return null; }
      motoPick = -1;
      return {act: 'moto', k: a, k2: k};
    }
    default:
      if (tool === 'oneway') return dragging ? null : {act: 'oneway', k};
      if (isSignTool(tool)) { if (dragging) return null; if (!isRoad(k)) { hint('Signs go on road tiles.'); return null; } return {act: 'sign', k, kind: tool}; }
  }
  return null;
}
const _applyTool0 = applyTool;
applyTool = function (k, dragging) {
  if (coopGuest()) { const a = coopActionFor(k, dragging); if (a) coopSend(a); return; }
  return _applyTool0(k, dragging);
};
/* a guest's road drag: the host walks the pen from the last tile to this one, on the real city */
const _stepRoad0 = stepRoad;
stepRoad = function (from, to) {
  if (coopGuest()) { if (to >= 0 && inPlay(to)) coopSend({act: 'road', k: to, k2: from}); return; }
  return _stepRoad0(from, to);
};
/* guests may pick any tool (plain watching keeps the inspector only) */
const _setTool0 = setTool;
setTool = function (t) {
  if (!coopGuest()) return _setTool0(t);
  tool = t; motoPick = -1; refreshUI();
  const def = TOOLS.find(x => x.id === (isSignTool(t) ? 'signs' : t));
  if (def) hint(def.hint, true);
};
/* while the host applies someone else's action, the hints it raises are collected for that player instead of shown */
const _hint0 = hint;
hint = function (msg, sticky, label) { if (coopApplying) { if (!coopHint) coopHint = String(msg || ''); return; } return _hint0(msg, sticky, label); };
/* a guest keeps their tool across the host's snapshots (each new layout reloads the city) */
{
  const sp = window.JunctionAPI.spectate, _enter0 = sp.enter;
  sp.enter = function (d, meta, keepCam) {
    const t = tool, mp = motoPick;
    const r = _enter0.call(sp, d, meta, keepCam);
    if (r && coopGuest()) { tool = t; motoPick = mp; refreshUI(); }
    return r;
  };
}
/* the host going back to the main menu ends the session (the button holds the old reference, so both are caught) */
const _goHome0 = goHome;
goHome = async function () { if (coop && coop.host && coop.end) coop.end('home'); return _goHome0(); };
window.addEventListener('click', e => { if (coop && coop.host && coop.end && e.target && e.target.closest && e.target.closest('#btn-home')) coop.end('home'); }, true);
/* guests' taps on the dock, the sign bar and the inspector's buy buttons: handled here, ahead of the listener that
   blocks them while watching (window capture runs before document capture) */
window.addEventListener('pointerdown', e => {
  if (!coopGuest() || !e.target || !e.target.closest) return;
  const tb = e.target.closest('#dock .tool[data-id], #signs .signbtn[data-id]');
  if (tb) { e.preventDefault(); e.stopPropagation(); const id = tb.dataset.id; sfx('ui'); setTool(id === 'signs' ? (isSignTool(tool) ? tool : 'only-forward') : id); return; }
  const bb = e.target.closest('[data-kind]');
  if (bb && e.button === 0) {
    e.preventDefault(); e.stopPropagation();
    if (bb.disabled) return;
    const kind = bb.dataset.kind, id = bb.dataset.id;
    if (kind === 'carbuy') coopSend({act: 'car', k: +id});
    else if (['store', 'truck', 'junction', 'carup', 'vanconv'].includes(kind)) coopSend({act: 'buy', k: -1, kind, payload: String(id)});
  }
}, true);
window.addEventListener('click', e => { if (coopGuest() && e.target && e.target.closest && e.target.closest('#dock .tool[data-id], #signs .signbtn[data-id], [data-kind]')) { e.preventDefault(); e.stopPropagation(); } }, true);
/* where my pointer is, in world space, for the others' screens */
cv.addEventListener('pointermove', e => { if (!coop || !coop.cursor) return; const p = evPos(e), w = toWorld(p.x, p.y); coop.cursor(w.x, w.y); });
/* the others' cursors and reactions, drawn in a layer over the map */
function coopLayer() { if (!coopLayerEl) coopLayerEl = $('coop-layer'); return coopLayerEl; }
function coopDraw() {
  requestAnimationFrame(coopDraw);
  const L = coopLayer(); if (!L) return;
  if (!coop || !started || !$('m-start').hidden) { if (L.childElementCount) L.innerHTML = ''; L._h = ''; coopBubbles = []; return; }
  const now = Date.now(), toS = (x, y) => ({x: (x - cam.x) * cam.z + W / 2, y: (y - cam.y) * cam.z + H / 2});
  let h = '';
  const at = {};
  for (const c of coopCursors) {
    if (c.uid === coop.uid || now - c.at > 20e3) continue;
    if (c.dx === undefined) { c.dx = c.x; c.dy = c.y; } else { c.dx += (c.x - c.dx) * 0.25; c.dy += (c.y - c.dy) * 0.25; }
    const s = toS(c.dx, c.dy); at[c.uid] = s;
    if (s.x < -60 || s.y < -60 || s.x > W + 60 || s.y > H + 60) continue;
    h += '<div class="coop-cur" style="left:' + s.x.toFixed(1) + 'px;top:' + s.y.toFixed(1) + 'px;--c:' + escH(c.colour || '#2f7de1') + '">' + COOP_CUR_SVG + '<span>' + escH(c.name || 'Player') + '</span></div>';
  }
  if (h !== L._h) { L._h = h; let cc = L.querySelector('.coop-curs'); if (!cc) { cc = document.createElement('div'); cc.className = 'coop-curs'; L.prepend(cc); } cc.innerHTML = h; }
  // reactions: one element each, kept while its CSS animation runs, following the sender's cursor
  coopBubbles = coopBubbles.filter(b => { if (now - b.at >= 2500) { if (b.el) b.el.remove(); return false; } return true; });
  for (const b of coopBubbles) {
    if (!b.el) { b.el = document.createElement('div'); b.el.className = 'coop-bub'; b.el.innerHTML = escH(b.kind) + '<small>' + escH(b.name || '') + '</small>'; L.append(b.el); }
    const s = at[b.uid], x = s ? s.x + 12 : W / 2, y = s ? s.y - 6 : Math.min(H * 0.3, 160);
    b.el.style.left = x.toFixed(1) + 'px'; b.el.style.top = y.toFixed(1) + 'px';
  }
}
coopDraw();
Object.assign(window.JunctionAPI, {
  /* online.js tells the game it is in a session: {id, host, uid, send(action), cursor(x, y), end(why)} or null */
  coopSet(c) {
    coop = c; coopLastSend = {}; coopCursors = []; coopBubbles = [];
    $('app').classList.toggle('coop-guest', !!(c && !c.host)); $('app').classList.toggle('coop-on', !!c);
    if (!c) { const L = coopLayer(); if (L) { L._h = ''; L.innerHTML = ''; } if (spectating && tool !== 'select') { tool = 'select'; motoPick = -1; refreshUI(); } }
  },
  /* the host applies a guest's action to the real city; says whether it worked and, if not, why */
  coopApply(a) {
    if (!coop || !coop.host) return {ok: false, note: 'Not hosting.'};
    if (!started || over) return {ok: false, note: 'The city isn\u2019t running.'};
    const k = Number.isFinite(+a.k) ? a.k | 0 : -1, k2 = Number.isFinite(+a.k2) ? a.k2 | 0 : -1;
    const bi = k >= 0 && k < N ? bAt[k] : -1;
    if (a.act !== 'buy' && a.act !== 'car' && (k < 0 || k >= N)) return {ok: false, note: 'Off the map.'};
    const sig = () => money + '|' + (road ? road.reduce((s, v) => s + v, 0) : 0) + '|' + motorways.length + '|' + parks.length + '|' + depots.length + '|' + JSON.stringify(inv) + '|' + (onewayDir && k >= 0 ? onewayDir[k] : 0) + '|' + (k >= 0 && nodes[k] ? nodes[k].lvl : 0) + '|' + (k >= 0 ? (sign[k] || '') + (special[k] || '') : '') + '|' + buildings.map(b => (b.lvl || 0) + ':' + (b.trucks || 0) + ':' + (b.extra || 0) + ':' + b.cars.length).join(',');
    const before = sig(); coopHint = ''; coopApplying = true; let r;
    try {
      undoGroup++;
      switch (a.act) {
        case 'road':
          if (k2 >= 0 && k2 < N && k2 !== k) { _stepRoad0(k2, k); r = undefined; }
          else { r = placeRoad(k, false, true); if (!r && inPlay(k) && !occupied(k) && money < roadCost(k)) hint('Road costs ' + fmt$(roadCost(k)) + ' a tile. ' + shortBy(roadCost(k))); }
          break;
        case 'erase': r = eraseAt(k); break;
        case 'special': r = (a.kind === 'light' || a.kind === 'round') ? placeSpecial(k, a.kind) : false; break;
        case 'moto': r = (k2 >= 0 && k2 < N) ? placeMoto(k, k2) : false; if (r === false && isRoad(k) && isRoad(k2) && !canTake('moto')) hint('A motorway costs ' + fmt$(PRICE.moto) + '. ' + shortBy(PRICE.moto)); break;
        case 'park': r = placePark(k); break;
        case 'depot': r = placeDepot(k); break;
        case 'sign':
          if (!SIGNS.find(x => x.id === a.kind && x.id !== 'oneway') || !isRoad(k)) { r = false; hint('Signs go on road tiles.'); }
          else if (sign[k] === a.kind) { sign[k] = null; inv.sign++; rebuildNet(); refreshUI(); r = true; }
          else r = placeSign(k, a.kind);
          break;
        case 'oneway': toggleOneway(k); r = undefined; break;
        case 'upjunc': r = upgradeJunction(k); break;
        case 'upstore': r = upgradeStore(bi); break;
        case 'tow': r = hireTruck(bi); break;
        case 'car': r = buyHouseCar(k); break;
        case 'buy': r = ['store', 'truck', 'junction', 'carup', 'vanconv'].includes(a.kind) ? doBuy(a.kind, String(a.payload == null ? '' : a.payload)) : false; break;
        default: r = false;
      }
    } catch (e) { console.error('co-op action', e); r = false; }
    finally { coopApplying = false; }
    const ok = r === true || (r !== false && sig() !== before);
    if (ok) { refreshHud(); if (sel) renderInspector(); }
    return {ok, note: ok ? '' : (coopHint || 'The city couldn\u2019t do that.')};
  },
  coopCursors(list) { coopCursors = list || []; },
  coopEmote(b) { coopBubbles.push(Object.assign({at: Date.now()}, b)); if (coopBubbles.length > 12) coopBubbles.shift(); },
  /* a guest keeps the city when the host ends: it goes into slot 5 of that mode */
  coopSaveCopy(mode, city, score, week) {
    if (!SLOT_MODES.includes(mode)) mode = 'standard';
    try { localStorage.setItem(SLOT_KEY + mode + '-5', JSON.stringify({data: city, score: score | 0, week: week | 0, diffKey: city.diffKey || mode, at: Date.now()})); return mode; } catch (e) { return ''; }
  },
  coopHint(m) { hint(m, true); },
  coopCityInfo() { return {money: Math.round(money), week, score, running, over, started}; }
});
MM_TITLES.coop = 'Co-op';
const _showMM2 = showMM;
showMM = function (pane) {
  _showMM2(pane);
  if (pane !== 'coop') return;
  $('m-start').classList.add('center-pane');
  const on = window.JunctionOnline;
  if (on && on.renderCoop) on.renderCoop($('mm-coop')); else $('mm-coop').innerHTML = '<p class="mini">Co-op needs the online service, which isn\u2019t available right now.</p>';
};

/* 2.3: the HUD counters start from the new city's numbers instead of rolling down from the demo's $1,000,000,000 */
{ const _rgHud = resetGame; resetGame = function () { const r = _rgHud.apply(this, arguments); if (typeof hudShown === 'object') { hudShown.money = hudTarget.money = money; hudShown.score = hudTarget.score = score; const m = $('v-money'), sc = $('v-score'); if (m) m.textContent = fmt$(Math.round(money)); if (sc) sc.textContent = String(Math.round(score)); } return r; }; }


/* ===== p66: Get the app. A panel on the main menu that installs Junction on this device (PC, Mac, Android, iPhone, iPad) from the
   website itself, using the browser's own install support. It reuses installPrompt, which setupApp() fills when the browser offers it. ===== */
function gaDevice() {
  const ua = navigator.userAgent || '', ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /android/i.test(ua), mac = !ios && /mac/i.test(navigator.platform || ua), win = /win/i.test(navigator.platform || ua);
  const edge = /edg\//i.test(ua), firefox = /firefox|fxios/i.test(ua), chrome = /chrome|crios/i.test(ua) && !edge, safari = /safari/i.test(ua) && !chrome && !edge && !firefox;
  return {ios, android, mac, win, edge, firefox, chrome, safari, phone: ios || android};
}
function gaInstalled() { return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches || !!navigator.standalone || !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }
function gaCards() {
  const d = gaDevice(), cards = [];
  const canPrompt = !!installPrompt;
  const pc = {id: 'pc', title: d.mac ? 'On a Mac' : d.win ? 'On a Windows PC' : 'On a computer', steps: null, btn: canPrompt && !d.phone};
  if (d.safari && d.mac) pc.steps = ['Open the <b>File</b> menu in Safari.', 'Choose <b>Add to Dock\u2026</b>, then <b>Add</b>.', 'Open Junction from the Dock like any app.'];
  else if (d.firefox && !d.phone) pc.steps = ['Firefox on a computer can\u2019t install web apps.', 'Open this page in <b>Chrome</b> or <b>Edge</b>, then use the install icon at the right of the address bar.'];
  else pc.steps = canPrompt && !d.phone ? ['Press the button below.', 'Junction opens in its own window and gets a desktop icon.'] : ['Click the <b>install icon</b> at the right of the address bar (a small screen with a down arrow).', 'Or open the browser menu (\u22ee) and choose <b>' + (d.edge ? 'Apps \u2192 Install this site as an app' : 'Cast, save and share \u2192 Install page as app') + '</b>.', 'Junction opens in its own window and gets a desktop icon.'];
  const andr = {id: 'android', title: 'On an Android phone or tablet', btn: canPrompt && d.android, steps: canPrompt && d.android ? ['Press the button below and confirm.', 'Junction gets an icon on your home screen.'] : ['Open this page in <b>Chrome</b>.', 'Tap the menu (\u22ee), then <b>Install app</b> (or <b>Add to Home screen</b>).', 'Junction gets an icon on your home screen.']};
  const ios = {id: 'ios', title: 'On an iPhone or iPad', btn: false, steps: ['Open this page in <b>Safari</b> (other browsers can\u2019t install apps on iPhone).', 'Tap the <b>Share</b> button (a square with an arrow).', 'Scroll and tap <b>Add to Home Screen</b>, then <b>Add</b>.', 'Junction opens full screen from its icon.']};
  const order = d.ios ? [ios, andr, pc] : d.android ? [andr, ios, pc] : [pc, andr, ios];
  for (const c of order) cards.push(c);
  return {cards, mine: d.ios ? 'ios' : d.android ? 'android' : 'pc'};
}
function gaRender() {
  const now = $('ga-now'), list = $('ga-list'); if (!now || !list) return;
  const inst = gaInstalled(), {cards, mine} = gaCards();
  now.textContent = inst ? 'You\u2019re already using the installed app. Single player works offline; online features need a connection.' : 'Install Junction like an app: its own window or icon, full screen with no browser bars, and single player works offline. It\u2019s free and updates by itself.';
  list.innerHTML = cards.map(c => '<section class="ga-card' + (c.id === mine ? ' mine' : '') + '"><h3>' + c.title + (c.id === mine ? ' <small>this device</small>' : '') + '</h3><ol>' + c.steps.map(s => '<li>' + s + '</li>').join('') + '</ol>' + (c.btn && !inst ? '<button class="bigbtn" type="button" data-ga="install">Install Junction</button>' : '') + '</section>').join('');
  list.querySelectorAll('[data-ga="install"]').forEach(b => b.onclick = async () => {
    if (!installPrompt) { toast('Use the browser menu to install, see the steps above', 'tip'); return; }
    installPrompt.prompt(); try { const r = await installPrompt.userChoice; if (r && r.outcome === 'accepted') toast('Installing Junction\u2026', 'ok'); } catch (e) {} installPrompt = null; gaRender();
  });
  const u = $('ga-url'); if (u) u.value = location.origin + location.pathname.replace(/index\.html$/, '');
}
function openGetApp() { gaRender(); openModal('m-getapp'); }
{
  const bind = () => {
    const b = $('btn-getapp'), c = $('ga-close'), cp = $('ga-copy');
    if (b) b.onclick = openGetApp;
    if (c) c.onclick = () => closeModal('m-getapp');
    if (cp) cp.onclick = async () => { const u = $('ga-url'); try { await navigator.clipboard.writeText(u.value); toast('Link copied', 'ok'); } catch (e) { u.select(); toast('Press Cmd/Ctrl+C to copy the link', 'tip'); } };
  };
  bind();
  window.addEventListener('beforeinstallprompt', () => { const m = $('m-getapp'); if (m && !m.hidden) setTimeout(gaRender, 50); });
  window.JunctionAPI = window.JunctionAPI || {}; window.JunctionAPI.openGetApp = openGetApp;
}


/* ===== p67: downloads. Installer files are attached to the latest GitHub Release; releases/latest/download/<name> always points at them. ===== */
const GA_REPO = 'https://github.com/Night-622/Junction-RM/releases/latest/download/';
const GA_FILES = [
  {id: 'win', name: 'Junction-Windows.exe', label: 'Windows', sub: 'Installer (.exe) for Windows 10 and 11'},
  {id: 'macarm', name: 'Junction-Mac-AppleSilicon.dmg', label: 'Mac, Apple chip', sub: 'Disk image (.dmg) for M1, M2, M3 and newer'},
  {id: 'macintel', name: 'Junction-Mac-Intel.dmg', label: 'Mac, Intel chip', sub: 'Disk image (.dmg) for Intel Macs'},
  {id: 'apk', name: 'Junction-Android.apk', label: 'Android', sub: 'App file (.apk) for Android phones and tablets'}
];
{
  const _gaRender = gaRender;
  gaRender = function () {
    _gaRender();
    const list = $('ga-list'); if (!list || gaInstalled() || document.getElementById('ga-dl')) return;
    const d = gaDevice(), mine = d.android ? 'apk' : d.mac ? 'macarm' : d.win ? 'win' : null;
    const files = GA_FILES.slice().sort((a, b) => (b.id === mine) - (a.id === mine) || (d.mac && /^mac/.test(b.id)) - (d.mac && /^mac/.test(a.id)));
    const note = d.mac ? '<p class="ga-note">Not sure which Mac you have? Apple menu, then About This Mac. If it says \u201cChip: Apple M\u2026\u201d use Apple chip; if it says Intel, use Intel.</p>' : d.android ? '<p class="ga-note">After downloading, open the file. Android will ask once to allow installs from your browser: allow it, then tap Install.</p>' : '';
    const sec = document.createElement('section'); sec.className = 'ga-card ga-dl'; sec.id = 'ga-dl';
    sec.innerHTML = '<h3>Download the app</h3>' + note + '<div class="ga-dls">' + files.map(f => '<a class="' + (f.id === mine ? 'bigbtn' : 'act') + '" href="' + GA_REPO + f.name + '" rel="noopener"><b>' + f.label + '</b><small>' + f.sub + '</small></a>').join('') + '</div><p class="ga-note">Windows may show \u201cunknown publisher\u201d and Mac may say the app is from an unidentified developer. Windows: More info, then Run anyway. Mac: right-click the app, choose Open. Junction is safe; the warning appears because the app isn\u2019t signed with a paid certificate. iPhone and iPad can\u2019t install apps outside the App Store, so use the steps below.</p>';
    list.insertBefore(sec, list.firstChild);
  };
}


/* ===== p69: Settings > App: the download button, and a "new version" notice for the Android app ===== */
function verParts(v) { return String(v || '0').split('.').map(n => parseInt(n, 10) || 0); }
function verNewer(a, b) { const x = verParts(a), y = verParts(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; } return false; }
{
  const g = $('btn-getapp2'), isApp = gaInstalled(), isElectron = /Electron/i.test(navigator.userAgent || ''), native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (g) { g.onclick = openGetApp; if (native || isElectron) g.hidden = true; }
  const note = $('app-note');
  if (note && isElectron) note.textContent = 'You\u2019re playing the Junction desktop app. It updates itself each time you open it while you\u2019re online.';
  else if (note && native) note.textContent = 'You\u2019re playing the Junction app. Single player works offline; online features need a connection.';
  if (native) {
    fetch('https://junction-rm.web.app/sw.js', {cache: 'no-store'}).then(r => r.text()).then(t => {
      const m = /const VERSION = '([^']+)'/.exec(t); if (!m || !verNewer(m[1], VERSION)) return;
      if (note) note.innerHTML = 'A newer version of Junction is out (' + m[1] + '; you have ' + VERSION + '). <button type="button" class="linkbtn" id="app-newver">Get it</button>';
      const b = $('app-newver'); if (b) b.onclick = () => { const url = 'https://github.com/Night-622/Junction-RM/releases/latest/download/Junction-Android.apk', B = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser; if (B && B.open) B.open({url}); else window.open(url, '_blank'); };
      setTimeout(() => toast('A newer version of Junction is out. Open Settings to get it.', 'tip'), 4000);
    }).catch(() => {});
  }
}


/* ===== p70: adaptive render resolution. If the game can't hold its frame rate, draw fewer pixels (2x, then 1.5x, then 1x). ===== */
{
  const _setGfx = setGfx;
  setGfx = function (o) { _setGfx(o); fitStage(); };
  let last = performance.now(), acc = 0, n = 0, told = false;
  const tick = t => {
    const dt = t - last; last = t;
    if (!document.hidden && dt < 250 && (running || demoMode)) {
      acc += dt; n++;
      if (n >= 60 || (acc >= 2000 && n >= 8)) {
        const avg = acc / n, limit = gfx.cap === 30 ? 45 : 31; acc = 0; n = 0;
        const res = gfx.res || 2;
        if (avg > limit && res > 1) {
          gfx.res = res > 1.5 ? 1.5 : 1; savePrefs(true); fitStage();
          if (!told && !demoMode) { told = true; toast('Lowered the sharpness for smoother play. Settings, Quality has more.', 'tip'); }
        }
      }
    } else { acc = 0; n = 0; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
