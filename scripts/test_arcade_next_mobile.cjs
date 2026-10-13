const fs=require('fs'),assert=require('assert/strict'),{chromium}=require('../artifacts/toy2game/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const slug of ['little-spy','taipo','sokoworld','open-jigsaw']){
 const context=await browser.newContext({viewport:{width:900,height:600},isMobile:true,hasTouch:true});const page=await context.newPage(),logs=[],errors=[];let fail=false,storage={},revision=0;
 page.on('console',m=>logs.push(m.text()));page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/__arcade_mobile',r=>r.fulfill({contentType:'text/html',body:`<style>body{margin:0}iframe{width:100vw;height:100vh;border:0}</style><iframe src="/assets/games/${slug}/index.html"></iframe><script>window.messages=[];addEventListener('message',e=>messages.push(e.data));</script>`}));
 await context.route('**/api/toy-games/*/save',r=>{if(r.request().method()==='POST'){if(fail)return r.fulfill({status:503,json:{error:'test offline'}});storage=r.request().postDataJSON().storage;revision++;}return r.fulfill({json:{learnerId:991,revision,storage,stats:{}}});});
 await page.goto('http://localhost:8000/__arcade_mobile');const host=page.frames().find(f=>f.url().includes(slug+'/index.html'));
 if(slug!=='open-jigsaw'){await host.locator('#start').tap();await host.locator('#loading').waitFor({state:'hidden'});await page.waitForTimeout(slug==='little-spy'?12000:4500);}
 if(slug==='sokoworld'){const button=host.locator('[data-code="KeyZ"]');assert(await button.isVisible());const box=await button.boundingBox();const cdp=await context.newCDPSession(page);for(let i=0;i<2;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});await page.waitForTimeout(150);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(500);}await page.waitForTimeout(1000);assert(Object.keys(storage).length>0);}
 if(slug==='taipo')assert(await host.locator('#typing').isVisible());
 if(slug==='little-spy')assert(await host.locator('nav').isVisible());
 if(slug==='open-jigsaw'){await host.waitForFunction(()=>FufuPuzzle.state.pieces.length===9);await host.locator('#start').tap();}
 await host.locator('#guide,#preview').tap();await page.screenshot({path:`artifacts/arcade-next/tests/${slug}-mobile-help.png`});await host.locator('#dismiss').tap();
 assert(await host.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 fail=true;await host.evaluate(async slug=>{const {learnerStorage}=await import('./fufu-storage.js');learnerStorage.setItem(slug+'.settings.v1',JSON.stringify({test:Date.now()}));},slug);await host.locator('#exit').tap();await page.waitForFunction(()=>messages.some(m=>m.type==='fufu-toy-save-error'));assert(!await page.evaluate(()=>messages.some(m=>m.type==='fufu-toy-exit')));
 fail=false;await host.locator('#exit').tap();await page.waitForFunction(()=>messages.some(m=>m.type==='fufu-toy-exit'));assert.deepEqual(errors,[]);assert(!logs.some(s=>s.includes('**ERROR**')));console.log('PASS mobile controls/help/layout and failed-save recovery:',slug);await context.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
