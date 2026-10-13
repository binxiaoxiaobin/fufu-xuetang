const fs=require('fs'),assert=require('assert/strict');
const {chromium}=require('../artifacts/toy2game/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 for(const game of process.argv.slice(2).length?process.argv.slice(2):['starcatcher']){
  let learner=771,revision=0,storage=game==='starcatcher'?{'starcatcher.save.v1':JSON.stringify({level:1,flip:false})}:{};let fail=false;const posts=[],errors=[];
  const context=await browser.newContext({viewport:{width:1000,height:720}});
  await context.route('**/__itch_test',r=>r.fulfill({contentType:'text/html',body:`<style>html,body{margin:0;height:100%}iframe{width:100%;height:100%;border:0}</style><iframe src="/assets/games/${game}/index.html"></iframe><script>window.messages=[];addEventListener('message',e=>messages.push(e.data))</script>`}));
  await context.route('**/api/toy-games/*/save',r=>{if(r.request().method()==='POST'){if(fail)return r.fulfill({status:503,json:{error:'test offline'}});const body=r.request().postDataJSON();assert.equal(body.learnerId,learner);assert.equal(body.expectedRevision,revision);storage=body.storage;revision++;posts.push(body);}return r.fulfill({json:{learnerId:learner,revision,storage,stats:{}}});});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:8000/__itch_test');let frame=page.frames().find(f=>f.url().includes('/index.html'));
  await frame.locator('#start').click();await frame.locator('#loading').waitFor({state:'hidden',timeout:60000});await page.waitForTimeout(6000);
  if(game==='starcatcher'){
   assert.equal(await frame.evaluate(()=>window.FufuGodot.state.level),1);
   await frame.locator('canvas').focus();await page.keyboard.down('x');await page.waitForTimeout(1000);await page.keyboard.up('x');
  }
  await frame.locator('#pause').click();assert.equal(await frame.locator('#pause').textContent(),'继续');await frame.locator('#pause').click();
  await page.screenshot({path:'artifacts/itch-ports/tests/'+game+'-playing.png'});
  fail=true;await frame.evaluate(async game=>{const {learnerStorage}=await import('./fufu-storage.js');learnerStorage.setItem(game+'.settings.v1',JSON.stringify({test:Date.now()}));},game);await frame.locator('#exit').click();await page.waitForFunction(()=>messages.some(m=>m.type==='fufu-toy-save-error'),null,{timeout:10000});assert(!await page.evaluate(()=>messages.some(m=>m.type==='fufu-toy-exit')));
  fail=false;await frame.locator('#exit').click();await page.waitForFunction(()=>messages.some(m=>m.type==='fufu-toy-exit'),null,{timeout:10000});
  assert(posts.length>0);const parsed=JSON.parse(storage[game+'.save.v1']);
  assert(errors.every(e=>e.includes('503')||e.includes('test offline')),JSON.stringify(errors));
  fs.writeFileSync('artifacts/itch-ports/tests/'+game+'-integration.json',JSON.stringify({posts:posts.length,saveKeys:Object.keys(parsed),errors},null,2));
  console.log('PASS',game,'native gameplay, pause, real snapshot, failed close retained, successful close;',posts.length,'saves');
  await context.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
