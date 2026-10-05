/* Junction browser tests. `cd tests && npm install && npm test`.
   Serves the game from the parent folder on a free port, opens it in headless Chrome, and checks the flows that
   have broken before: boot and the main menu, starting a city and delivering parcels, the store and crates,
   save slots, the pause menu, game over and the share card, rotation, the tutorial, quality presets, and the
   traffic flow view. Any page error fails the run. Screenshots land in tests/shots/. */
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer');
const root = path.join(__dirname, '..'), shots = path.join(__dirname, 'shots');
fs.mkdirSync(shots, {recursive: true});
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png'};
const sl = ms => new Promise(r => setTimeout(r, ms));
let failed = 0, passed = 0;
function check(name, ok, info) { if (ok) { passed++; console.log('  ok   ' + name); } else { failed++; console.log('  FAIL ' + name + (info ? ' :: ' + JSON.stringify(info) : '')); } }

async function main() {
  const server = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
    fs.readFile(path.join(root, p), (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type': types[path.extname(p)] || 'application/octet-stream'}); r.end(d); });
  });
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await puppeteer.launch({headless: 'new', args: ['--no-sandbox', '--disable-gpu']});
  const today = (() => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); })();
  async function open(vp) {
    const ctx = await browser.createBrowserContext(), page = await ctx.newPage();
    await page.setViewport(vp || {width: 1300, height: 850});
    const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|firestore|Firestore|firebase/i.test(m.text())) errs.push(m.text()); });
    await page.evaluateOnNewDocument((today) => {
      try { localStorage.setItem('junction-guides-v1', JSON.stringify({iso: true, weekly: true, store: true, crate: true, chats: true, friends: true}));
        localStorage.setItem('junction-shop-v1', JSON.stringify({v: 4, bucks: 3000, toward: 0, rbucks: 50, owned: {}, hired: {}, designs: {}, streak: {last: today, n: 1}})); } catch (e) {}
    }, today);
    await page.goto('http://localhost:' + port + '/?debug', {waitUntil: 'load'});
    await page.waitForFunction(() => window.__JUNCTION && document.getElementById('m-start') && !document.getElementById('m-start').hidden, {timeout: 30000});
    await sl(800);
    await page.evaluate(() => { const u = document.getElementById('m-user'); if (u) u.hidden = true; modalOpen = !!document.querySelector('.modal:not([hidden]):not(#m-start)'); });
    return {page, errs, ctx};
  }
  const play = page => page.evaluate(() => { document.querySelectorAll('.modal').forEach(m => { m.hidden = true; }); modalOpen = false; window.JunctionAPI.startCity('standard'); });

  console.log('Boot and menu');
  { const {page, errs, ctx} = await open();
    check('menu shows', await page.evaluate(() => !document.getElementById('m-start').hidden && !!document.querySelector('.rl-item')));
    check('version set', await page.evaluate(() => /^\d+\.\d+/.test(document.getElementById('ver-foot').textContent)));
    check('skins >= 50 everywhere', await page.evaluate(() => Object.keys(DESIGNS).every(c => Object.keys(DESIGNS[c].items).length >= 50)));
    await page.evaluate(() => showMM('store')); await sl(400);
    check('store renders', await page.evaluate(() => document.querySelectorAll('#mm-store .st-card').length >= 6));
    check('crate opens', await page.evaluate(() => { const b0 = jb.bucks; return openCrate('object', true) === true && jb.bucks === b0 - 250 && !document.getElementById('m-crate').hidden; }));
    await page.screenshot({path: path.join(shots, 'menu.png')});
    check('no page errors (menu)', errs.length === 0, errs); await ctx.close(); }

  console.log('A city');
  { const {page, errs, ctx} = await open();
    await play(page); await sl(300);
    const r = await page.evaluate(() => { const J = window.__JUNCTION; for (let i = 0; i < 30 * 120; i++) J.update(1 / 30); return {started, over, trips: J.stats.trips, cars: J.cars.length}; });
    check('city runs 120 s', r.started && !r.over, r);
    check('pause menu opens on Esc', await page.evaluate(() => { document.querySelectorAll('.modal').forEach(m => { m.hidden = true; }); modalOpen = false; openPause(); return !document.getElementById('m-pause').hidden && !running; }));
    await page.evaluate(() => closePause(true));
    check('save slot written', await page.evaluate(() => { pendingSlot = 'standard-2'; resetGame('standard'); writeSlot(); return !!localStorage.getItem('junction-slot-v1:standard-2'); }));
    check('game over screen', await page.evaluate(() => { window.__JUNCTION.setScore(42); window.__JUNCTION.endGame('test'); return !document.getElementById('m-over').hidden && document.getElementById('over-score').textContent === '42'; }));
    check('share card draws', await page.evaluate(() => { const c = makeShareCard({pic: document.getElementById('over-pic'), kicker: 'test', big: '42', bigLabel: 'parcels', title: 't', stats: [['Weeks', 1]]}); return c.width === 1200 && c.height === 630; }));
    await page.screenshot({path: path.join(shots, 'gameover.png')});
    check('no page errors (city)', errs.length === 0, errs); await ctx.close(); }

  console.log('Deliveries on the demo city');
  { const {page, errs, ctx} = await open();
    const r = await page.evaluate(() => { startDemo(); const t0 = stats.trips; for (let i = 0; i < 30 * 120; i++) update(1 / 30); return {trips: stats.trips - t0}; });
    check('demo city delivers (>= 30 trips in 120 s)', r.trips >= 30, r);
    check('flow view toggles', await page.evaluate(() => { toggleFlow(true); const on = showFlow; toggleFlow(false); return on && !showFlow; }));
    check('quality presets change draw cost', await page.evaluate(() => { const t = n => { const a = performance.now(); for (let i = 0; i < n; i++) draw(); return (performance.now() - a) / n; }; setGfx(Object.assign({}, GFX_PRESETS.high)); t(3); const hi = t(15); setGfx(Object.assign({}, GFX_PRESETS.battery)); t(3); const bat = t(15); setGfx(Object.assign({}, GFX_PRESETS.high)); return bat < hi; }));
    check('no page errors (demo)', errs.length === 0, errs); await ctx.close(); }

  console.log('Phone rotation');
  { const {page, errs, ctx} = await open({width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
    await play(page);
    const fit = () => page.evaluate(() => { const st = document.getElementById('stage'); return cv.width === Math.round(st.clientWidth * dpr) && cv.height === Math.round(st.clientHeight * dpr); });
    await page.setViewport({width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true}); await sl(900);
    check('canvas fits after rotation', await fit());
    await page.setViewport({width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true}); await sl(900);
    check('canvas fits back upright', await fit());
    await page.screenshot({path: path.join(shots, 'phone.png')});
    check('no page errors (phone)', errs.length === 0, errs); await ctx.close(); }

  console.log('Tutorial');
  { const {page, errs, ctx} = await open();
    await page.evaluate(() => document.getElementById('btn-try-tutorial').click()); await sl(600);
    check('intro opens', await page.evaluate(() => !document.getElementById('m-tutintro').hidden));
    for (let i = 0; i < 8; i++) { await page.evaluate(() => document.getElementById('ti-next').click()); await sl(120); }
    await sl(800);
    check('tutorial step 1 shows', await page.evaluate(() => tutorialMode && document.getElementById('tc-step').textContent.startsWith('Step 1')));
    check('no page errors (tutorial)', errs.length === 0, errs); await ctx.close(); }

  await browser.close(); server.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
