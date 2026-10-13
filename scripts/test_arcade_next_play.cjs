const fs=require('fs'),assert=require('assert/strict');
const {chromium}=require('../artifacts/toy2game/node_modules/playwright');
(async()=>{
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
const slug=process.argv[2]||'sokoworld',saved={storage:{},revision:0},logs=[],errors=[];
async function open(){const p=await browser.newPage({viewport:{width:1100,height:760}});p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>logs.push(m.text()));await p.route('**/api/toy-games/*/save',async r=>{if(r.request().method()==='POST'){const body=r.request().postDataJSON();saved.storage=body.storage;saved.revision++;}await r.fulfill({json:{...saved,learnerId:881,stats:{}}});});await p.goto(`http://localhost:8000/assets/games/${slug}/index.html`);if(slug!=='open-jigsaw')await p.locator('#start').click();await p.waitForTimeout(slug==='little-spy'?13000:4500);return p;}
const page=await open();
if(slug==='little-spy'){
 await page.locator('canvas').focus();await page.keyboard.press('Enter',{delay:120});await page.waitForFunction(()=>window.FufuGodot.nativeState?.level===1,{},{timeout:40000});await page.waitForTimeout(1500);
 const before=await page.evaluate(()=>window.FufuGodot.nativeState);await page.keyboard.down('ArrowRight');await page.waitForTimeout(500);await page.keyboard.up('ArrowRight');await page.waitForTimeout(400);assert.notEqual((await page.evaluate(()=>window.FufuGodot.nativeState)).x,before.x);
 await page.locator('#pause').click();await page.waitForTimeout(400);const frozen=await page.evaluate(()=>window.FufuGodot.nativeState);await page.waitForTimeout(1200);assert.deepEqual(await page.evaluate(()=>window.FufuGodot.nativeState),frozen);await page.locator('#pause').click();await page.waitForTimeout(400);
 await page.screenshot({path:`artifacts/arcade-next/tests/${slug}-play.png`});await page.locator('#exit').click();assert.equal(JSON.parse(saved.storage[slug+'.save.v1']).level,1);
 const again=await open();await again.locator('canvas').focus();await again.keyboard.press('Enter');await again.waitForFunction(()=>window.FufuGodot.nativeState?.level===1);await again.close();
}
if(slug==='sokoworld'){
 const native=()=>page.frames().find(f=>f.url().endsWith('/native.html'));
 await native().locator('canvas').focus();await page.keyboard.press('z',{delay:120});await page.waitForTimeout(300);await page.keyboard.press('z',{delay:120});await page.waitForTimeout(500);await page.keyboard.press('ArrowRight',{delay:120});await page.waitForTimeout(1000);await page.keyboard.press('z',{delay:120});await page.waitForTimeout(300);await page.keyboard.press('ArrowDown',{delay:120});await page.waitForTimeout(1100);
 await page.screenshot({path:`artifacts/arcade-next/tests/${slug}-play.png`});await page.locator('#exit').click();
 await page.waitForTimeout(1200);assert(Object.keys(saved.storage).length>0);const cache=JSON.parse(saved.storage[slug+'.save.v1']);const state=JSON.parse(Object.values(cache).find(v=>v.includes('completions')));assert.equal(state.session.level_index,2);assert(state.session.pl.steps>0);assert.equal(Object.keys(state.completions).length,1);
 const again=await open();await again.screenshot({path:`artifacts/arcade-next/tests/${slug}-resume.png`});await again.locator('#exit').click();const recovered=JSON.parse(Object.values(JSON.parse(saved.storage[slug+'.save.v1'])).find(v=>v.includes('completions')));assert.equal(recovered.session.level_index,2);assert.equal(recovered.session.pl.steps,state.session.pl.steps);await again.close();
}
if(slug==='taipo'){
 const frame=page.frames().find(f=>f.url().endsWith('/native.html'));const canvas=await frame.locator('canvas').boundingBox();console.log('canvas',canvas,await frame.locator('canvas').evaluate(c=>({w:c.width,h:c.height,clientW:c.clientWidth,clientH:c.clientHeight})));await page.evaluate(()=>window.FufuNative.native.setPaused(false));await page.mouse.move(canvas.x+canvas.width*.5,canvas.y+canvas.height*.675);await page.mouse.down();await page.waitForTimeout(160);await page.mouse.up();await page.waitForTimeout(2000);
 await page.screenshot({path:`artifacts/arcade-next/tests/${slug}-play.png`});await page.locator('#pause').click();await page.waitForTimeout(300);const a=await frame.locator('canvas').screenshot();await page.waitForTimeout(1000);const b=await frame.locator('canvas').screenshot();assert.deepEqual(a,b);await page.locator('#pause').click();
 assert(logs.some(s=>s.includes('TaipoState')||s.includes('spawn'))||Object.keys(saved.storage).length>0,'native battle must start');await page.evaluate(()=>window.FufuNative.native.text('help'));await page.waitForTimeout(600);assert(logs.some(s=>s.includes('Processing action: SwitchLanguageMode')),'mobile typing must reach native action');await page.locator('#exit').click();await page.waitForTimeout(1000);assert(JSON.parse(saved.storage['taipo.save.v1'])['taipo_prefs.ron'].includes('english.txt'));const again=await open();await again.close();
}
if(slug==='open-jigsaw'){
 await page.waitForFunction(()=>window.FufuPuzzle?.state.pieces.length===9);await page.locator('#start').click();
 for(let i=0;i<9;i++){
  const data=await page.evaluate(()=>{const p=[...FufuPuzzle.state.pieces].reverse().find(p=>!p.isCorrect);const r=document.querySelector('canvas').getBoundingClientRect(),cv=document.querySelector('canvas'),sx=r.width/cv.width,sy=r.height/cv.height;return p?{from:[r.x+(p.current.x+p.w/2)*sx,r.y+(p.current.y+p.h/2)*sy],to:[r.x+(p.correct.x+p.w/2)*sx,r.y+(p.correct.y+p.h/2)*sy]}:null;});
  await page.mouse.move(...data.from);await page.mouse.down();await page.mouse.move(...data.to,{steps:4});await page.mouse.up();
 }
 assert.equal(await page.evaluate(()=>FufuPuzzle.state.phase),'completed');await page.screenshot({path:`artifacts/arcade-next/tests/${slug}-play.png`});await page.locator('#exit').click();
 const again=await open();assert.equal(await again.evaluate(()=>FufuPuzzle.state.phase),'completed');await again.locator('#difficulty').selectOption('4');await again.waitForFunction(()=>FufuPuzzle.state.pieces.length===16);await again.locator('#difficulty').selectOption('5');await again.waitForFunction(()=>FufuPuzzle.state.pieces.length===25);await again.close();
}
fs.writeFileSync(`artifacts/arcade-next/tests/${slug}-play.json`,JSON.stringify({saved,logs,errors},null,2));assert.deepEqual(errors,[]);assert(!logs.some(s=>s.includes('**ERROR**')||s.includes('[usagi] error')));console.log('PASS',slug);await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});

