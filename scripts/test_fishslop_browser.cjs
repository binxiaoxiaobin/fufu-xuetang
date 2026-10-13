/* Real production rendering and input; API fixtures never touch learner records. */
const {chromium} = require('../artifacts/toy2game/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const origin = process.env.FUFU_TEST_ORIGIN || 'http://localhost:8000';
const game = JSON.parse(fs.readFileSync(path.join(root, 'backend/seed_data/fishslop_game.json'), 'utf8'));
const shell = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><link rel="stylesheet" href="/assets/games/toy2game/arcade.css"></head><body>
<main id="page-arcade"><header class="library-head"><span class="eyebrow"></span><h1></h1><p></p></header><div class="game-tabs"></div><div class="game-layout"></div></main>
<script>window.navigate=id=>{document.querySelectorAll('main').forEach(p=>{p.classList.toggle('active',p.id==='page-'+id);p.style.display=p.id==='page-'+id?'block':'none'});};window.addEventListener('load',()=>window.navigate('arcade'));</script>
<script type="module" src="/toy-arcade.js"></script></body></html>`;
let activePage;

(async () => {
  const browser = await chromium.launch({headless:true,
    executablePath: process.env.FUFU_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context = await browser.newContext({viewport:{width:1280,height:900}});
  await context.addInitScript(() => {
    if (location.pathname.includes('/assets/games/fishslop/')) history.replaceState(null,'',location.pathname+'?quality=low&scale=0.35');
  });
  let learner = 700001, fail = false;
  const records = new Map(), posts = [];
  const state = () => {if (!records.has(learner)) records.set(learner,{learnerId:learner,revision:0,storage:{},stats:{},reward:0}); return records.get(learner);};
  await context.route('**/__fishslop_test.html', route => route.fulfill({contentType:'text/html',body:shell}));
  await context.route('**/api/toy-games', route => route.fulfill({json:{games:[{...game,hasSave:state().revision>0}]}}));
  await context.route('**/api/toy-games/fishslop/save', async route => {
    if (route.request().method() === 'POST') {
      if (fail) return route.fulfill({status:503,json:{error:'测试断网：保存失败'}});
      const body = route.request().postDataJSON();
      if (body.learnerId !== learner || body.expectedRevision !== state().revision) return route.fulfill({status:409,json:{error:'进度已变化'}});
      posts.push(body); state().storage = body.storage; state().revision++;
    }
    return route.fulfill({json:state()});
  });
  const page = await context.newPage(), errors = [];
  activePage = page;
  page.setDefaultTimeout(60000);
  page.on('console', m => { if (m.type()==='error') console.log('BROWSER:',m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin+'/__fishslop_test.html');
  await page.locator('[data-toy=fishslop]').click();
  let frame = page.frameLocator('#page-toy-game iframe');
  await frame.locator('#btn-dive:not(:disabled)').waitFor({timeout:30000});
  assert.equal(await frame.locator('#btn-dive').innerText(), '开始潜水');
  assert.equal((await frame.locator('#logo').innerText()).replace(/\s/g,''), '海底小鱼乐园');
  await page.locator('.toy-fullscreen').click();
  await page.waitForFunction(() => document.fullscreenElement?.id === 'page-toy-game',null,{timeout:20000});
  await page.locator('.toy-fullscreen').click();
  await page.waitForFunction(() => !document.fullscreenElement,null,{timeout:20000});
  console.log('PASS: Chinese title and optional fullscreen');
  await frame.locator('#btn-dive').click();
  await frame.locator('#hud').waitFor();
  const child = page.frames().find(f => f.url().includes('/assets/games/fishslop/'));
  assert.equal(await child.evaluate(() => window.__fishslop.mode),'playing');
  const before = await child.evaluate(() => window.__fishslop.sim.sub.pos.toArray());
  await child.locator('#scene').click({position:{x:600,y:300}});
  await page.keyboard.down('w');
  await page.waitForTimeout(1200);
  await page.keyboard.up('w');
  const after = await child.evaluate(() => window.__fishslop.sim.sub.pos.toArray());
  assert.notDeepEqual(after,before,'keyboard moves the sub');
  await page.keyboard.down('Space');
  await page.waitForTimeout(700);
  await page.keyboard.up('Space');
  assert(await child.evaluate(() => window.__fishslop.sim.stats.pelletsDropped > 0));
  await page.keyboard.press('f');
  await child.waitForFunction(() => window.__fishslop.sim.sonarCooldown > 0,null,{timeout:20000});
  console.log('PASS: keyboard movement, feed, sonar');
  assert(await child.evaluate(() => window.__fishslop.sim.sonarCooldown > 0));
  await frame.locator('#btn-dock').click();
  await child.evaluate(() => window.__fishslop.sim.coins = 500);
  await frame.locator('[data-fish=glimmer]:not(:disabled)').waitFor();
  await frame.locator('[data-fish=glimmer]').click();
  assert.equal(await child.evaluate(() => window.__fishslop.sim.fish.length),9);
  await frame.locator('#tab-sub').click();
  await frame.locator('[data-upgrade=hopper]').click();
  assert.equal(await child.evaluate(() => window.__fishslop.sim.upgrades.hopper),1);
  console.log('PASS: fish and upgrade purchases');
  await frame.locator('#btn-shop-close').click();
  await frame.locator('#btn-night').click();
  await frame.locator('#btn-pause').click();
  await frame.locator('#pause').waitFor();
  assert.equal(await child.evaluate(() => window.__fishslop.mode),'paused');
  const count = posts.length;
  fail = true;
  await frame.locator('#btn-resume').click();
  await frame.locator('#btn-sound').click();
  await page.locator('.toy-back').click({force:true});
  await page.locator('.toy-game-toolbar [data-kind=error]').waitFor();
  assert.equal(await page.locator('#page-toy-game iframe').count(),1,'failed save keeps game open');
  fail = false;
  await page.locator('.toy-back').click({force:true});
  await page.locator('#page-toy-game iframe').waitFor({state:'detached'});
  console.log('PASS: failed exit save and retry');
  assert(posts.length > count);
  const saved = JSON.parse(state().storage['fishslop.save.v1']);
  assert.equal(saved.fish.length,9); assert.equal(saved.upgrades.hopper,1);
  await page.locator('[data-toy=fishslop]').click();
  frame = page.frameLocator('#page-toy-game iframe');
  await frame.locator('#btn-dive:not(:disabled)').waitFor();
  assert.equal(await frame.locator('#btn-dive').innerText(),'继续探索');
  assert((await frame.locator('#save-note').innerText()).includes('9 条小鱼'));
  await page.locator('.toy-back').click({force:true});
  await page.locator('#page-toy-game iframe').waitFor({state:'detached'});
  learner = 700002;
  await page.locator('[data-toy=fishslop]').click();
  frame = page.frameLocator('#page-toy-game iframe');
  await frame.locator('#btn-dive:not(:disabled)').waitFor();
  assert.equal(await frame.locator('#btn-dive').innerText(),'开始潜水','new learner has separate progress');
  assert.equal(Object.keys(state().storage).length,0);
  await page.locator('.toy-back').click({force:true});
  await page.locator('#page-toy-game iframe').waitFor({state:'detached'});
  console.log('PASS: resume and learner separation');
  assert.deepEqual(errors,[]);

  // A fresh title capture supplies the game-centre cover.
  await page.setViewportSize({width:1200,height:800});
  await page.goto(origin+'/assets/games/fishslop/index.html?quality=low&scale=0.5');
  await page.locator('#btn-dive:not(:disabled)').waitFor().catch(async error => {console.log('TITLE ERROR:',await page.locator('#webgl-error').textContent(),errors);throw error;});
  await page.waitForTimeout(1000);
  await page.screenshot({path:path.join(root,'artifacts/fishslop-title-zh.png')});
  await context.close();
  const mobile = await browser.newContext({viewport:{width:1024,height:768},isMobile:true,hasTouch:true});
  await mobile.route('**/api/toy-games/fishslop/save', route => route.fulfill({json:{learnerId:700003,revision:0,storage:{},stats:{}}}));
  const tablet = await mobile.newPage();
  tablet.on('pageerror',e => errors.push(e.message));
  await tablet.goto(origin+'/assets/games/fishslop/index.html?scale=0.35');
  await tablet.locator('#btn-dive:not(:disabled)').waitFor();
  await tablet.locator('#btn-dive').click();
  await tablet.locator('.tbtn.feed').waitFor();
  assert.equal(await tablet.evaluate(() => window.__fishslop.quality),'low');
  await tablet.locator('.tbtn.feed').dispatchEvent('pointerdown',{pointerId:11});
  await tablet.waitForFunction(() => window.__fishslop.sim.stats.pelletsDropped > 0,null,{timeout:20000});
  await tablet.locator('.tbtn.feed').dispatchEvent('pointerup',{pointerId:11});
  assert(await tablet.evaluate(() => window.__fishslop.sim.stats.pelletsDropped > 0));
  await tablet.locator('.tbtn[data-tap=sonar]').dispatchEvent('pointerdown',{pointerId:12});
  await tablet.locator('.tbtn[data-tap=sonar]').dispatchEvent('pointerup',{pointerId:12});
  await tablet.waitForFunction(() => window.__fishslop.sim.sonarCooldown > 0,null,{timeout:20000});
  assert(await tablet.evaluate(() => window.__fishslop.sim.sonarCooldown > 0));
  await tablet.screenshot({path:path.join(root,'artifacts/fishslop-tablet-zh.png')});
  await tablet.setViewportSize({width:768,height:1024});
  assert(await tablet.locator('.touch-buttons').evaluate(el => {const r=el.getBoundingClientRect();return r.right<=innerWidth&&r.bottom<=innerHeight&&r.left>=0&&r.top>=0;}));
  await tablet.screenshot({path:path.join(root,'artifacts/fishslop-tablet-portrait-zh.png')});
  assert.deepEqual(errors,[]);
  await browser.close();
  console.log('PASS: production WebGL, Chinese UI, optional fullscreen, movement, feed, sonar, species/upgrade purchases, pause, failure/retry on exit, restoration, learner isolation, tablet controls and low quality. API fixtures only.');
})().catch(async error => {console.error(error);if(activePage){console.log('PAGE:',await activePage.locator('body').innerText().catch(()=>''));await activePage.screenshot({path:path.join(root,'artifacts/fishslop-test-failure.png')}).catch(()=>{});}process.exit(1);});
