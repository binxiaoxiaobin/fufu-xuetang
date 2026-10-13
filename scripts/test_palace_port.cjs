const fs=require('fs'),assert=require('assert/strict');
const {chromium}=require('../artifacts/toy2game/node_modules/playwright');
(async()=>{
 fs.mkdirSync('artifacts/palace/tests',{recursive:true});
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 let storage={},revision=0,fail=false;const posts=[],errors=[];
 const page=await browser.newPage({viewport:{width:1000,height:800},hasTouch:true});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/toy-games/palace-for-fools/save',route=>{
  if(route.request().method()==='POST'){
   if(fail)return route.fulfill({status:503,json:{error:'test offline'}});
   const body=route.request().postDataJSON();assert.equal(body.learnerId,811);assert.equal(body.expectedRevision,revision);storage=body.storage;revision++;posts.push(body);
  }return route.fulfill({json:{learnerId:811,revision,storage,stats:{}}});
 });
 await page.route('**/__palace_test',r=>r.fulfill({contentType:'text/html',body:'<style>html,body{margin:0;height:100%}iframe{width:100%;height:100%;border:0}</style><iframe src="/assets/games/palace-for-fools/index.html"></iframe><script>window.messages=[];addEventListener("message",e=>messages.push(e.data))</script>'}));
 await page.goto('http://localhost:8000/__palace_test');const frame=page.frames().find(f=>f.url().includes('/palace-for-fools/index.html'));
 await frame.locator('#start').click();await frame.locator('#loading').waitFor({state:'hidden',timeout:60000});
 assert.equal(await frame.evaluate(()=>FufuPalace.core.ev.loc.dialogue.story[4].trim()),'这是一个错误。');
 await page.waitForTimeout(700);await page.screenshot({path:'artifacts/palace/tests/audio.png'});
 await frame.locator('canvas').focus();await page.keyboard.press('Enter',{delay:70});await page.keyboard.press('Enter',{delay:70});
 await frame.waitForFunction(()=>FufuPalace.core.ev.activeScene===FufuPalace.core.ev.scenes.title,{timeout:15000});
 await frame.waitForFunction(()=>!FufuPalace.core.ev.tr.active);await page.waitForTimeout(100);
 await page.keyboard.press('Enter',{delay:70});await page.waitForTimeout(200);await page.screenshot({path:'artifacts/palace/tests/title.png'});
 await page.keyboard.press('Enter',{delay:70});await frame.waitForFunction(()=>FufuPalace.core.ev.activeScene===FufuPalace.core.ev.scenes.storyintro);await frame.waitForFunction(()=>!FufuPalace.core.ev.tr.active);
 await page.waitForTimeout(1500);await page.screenshot({path:'artifacts/palace/tests/story.png'});
 for(let i=0;i<12;i++){await page.keyboard.press('z',{delay:70});await page.waitForTimeout(160);}
 await frame.waitForFunction(()=>FufuPalace.core.ev.activeScene===FufuPalace.core.ev.scenes.game);await frame.waitForFunction(()=>!FufuPalace.core.ev.tr.active);
 for(let i=0;i<5;i++){await page.keyboard.press('z',{delay:70});await page.waitForTimeout(120);}
 await frame.waitForFunction(()=>!FufuPalace.core.ev.scenes.game.textbox.active);
 const position=()=>frame.evaluate(()=>({x:FufuPalace.core.ev.scenes.game.objm.player.pos.x,y:FufuPalace.core.ev.scenes.game.objm.player.pos.y}));
 const before=await position();await page.keyboard.down('ArrowRight');await page.waitForTimeout(400);await page.keyboard.up('ArrowRight');const after=await position();assert.notEqual(after.x,before.x);
 await page.keyboard.press('z',{delay:150});await page.waitForTimeout(400);
 await frame.locator('canvas').screenshot({path:'artifacts/palace/tests/gameplay.png'});
 await frame.locator('#pause').click();const paused=await position();await page.keyboard.down('ArrowRight');await page.waitForTimeout(300);assert.deepEqual(await position(),paused);await page.keyboard.up('ArrowRight');await frame.locator('#pause').click();
 await page.keyboard.press('Enter',{delay:60});await page.waitForTimeout(100);assert(await frame.evaluate(()=>FufuPalace.core.ev.scenes.game.pauseMenu.active));await page.screenshot({path:'artifacts/palace/tests/pause-menu.png'});await page.keyboard.press('Enter',{delay:60});
 // Press the real pointer buttons and verify the native action state, including release.
 await frame.locator('#touch').evaluate(el=>el.style.display='flex');const button=frame.locator('[data-code="KeyX"]');const box=await button.boundingBox();assert(box);await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(50);assert.equal(await frame.evaluate(()=>FufuPalace.core.ev.input.action.fire2.state),1);await page.mouse.up();await page.waitForTimeout(50);assert.equal(await frame.evaluate(()=>FufuPalace.core.ev.input.action.fire2.state),0);
 await frame.evaluate(()=>fufuBeforeClose());await frame.evaluate(async()=>{const s=await import('./fufu-storage.js');await s.flush();});
 const saved=JSON.parse(storage['palace-for-fools.save.v1']);assert(saved.checkpoint&&Array.isArray(saved.items));const checkpoint=saved.checkpoint;
 fail=true;await frame.locator('#sound').click();await frame.locator('#exit').click();await page.waitForFunction(()=>messages.some(m=>m.type==='fufu-toy-save-error'));assert(!await page.evaluate(()=>messages.some(m=>m.type==='fufu-toy-exit')));
 fail=false;await frame.locator('#exit').click();await page.waitForFunction(()=>messages.some(m=>m.type==='fufu-toy-exit'));
 await frame.goto('http://localhost:8000/assets/games/palace-for-fools/index.html');await frame.locator('#start').click();await frame.locator('#loading').waitFor({state:'hidden'});await page.waitForTimeout(700);await frame.locator('canvas').focus();await page.keyboard.press('Enter',{delay:70});await page.keyboard.press('Enter',{delay:70});await frame.waitForFunction(()=>FufuPalace.core.ev.activeScene===FufuPalace.core.ev.scenes.title);await frame.waitForFunction(()=>!FufuPalace.core.ev.tr.active);
 await page.keyboard.press('Enter',{delay:70});await page.keyboard.press('ArrowDown',{delay:70});await page.keyboard.press('Enter',{delay:70});await frame.waitForFunction(()=>FufuPalace.core.ev.activeScene===FufuPalace.core.ev.scenes.game);assert.deepEqual(await frame.evaluate(()=>({x:FufuPalace.core.ev.scenes.game.objm.player.checkpoint.x,y:FufuPalace.core.ev.scenes.game.objm.player.checkpoint.y})),checkpoint);
 assert.deepEqual(errors,[]);fs.writeFileSync('artifacts/palace/tests/result.json',JSON.stringify({posts:posts.length,checkpoint,errors},null,2));
 console.log('PASS: Chinese story, original gameplay, pause/menu, touch input, save failure/retry and native continue');await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
