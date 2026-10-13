const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require('../artifacts/toy2game/node_modules/playwright');
const root=path.resolve(__dirname,'..'),output=path.join(root,'artifacts/astra-originals/tests');
const origin='http://127.0.0.1:8769';
const definitions={
 mosswing:{id:'mosswing-adapt',keys:['mosswing.best','mosswing.muted'],seed:{'mosswing.best':'7','mosswing.muted':'true'},start:'#start'},
 thunderfall:{id:'thunderfall-adapt',keys:['thunderfall:best','thunderfall:sound','thunderfall:reducedMotion'],seed:{'thunderfall:best':'12345','thunderfall:sound':'false','thunderfall:reducedMotion':'false'},start:'#start-button'},
 'iron-bastion':{id:'iron-bastion-adapt',keys:['iron-bastion-v1'],seed:{'iron-bastion-v1':JSON.stringify({best:54321,lastLevel:2,records:{1:{score:1000,rank:'A',base:90,time:100}},options:{sound:false,music:false,shake:false,quality:'high'}})},start:'#continueBtn'},
};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function run(){
 fs.mkdirSync(output,{recursive:true});
 const server=spawn('python',['-m','http.server','8769','--bind','127.0.0.1','--directory',path.join(root,'frontend/assets/games/astra-originals')],{stdio:'ignore',windowsHide:true});
 let browser;
 try{
  for(let n=0;n<40;n++){try{if((await fetch(origin+'/bootstrap.js')).ok)break;}catch{}await delay(100);}
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
  const results=[];
  for(const [name,cfg] of Object.entries(definitions)){
   for(const mobile of [false,true]){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile});
    const page=await context.newPage(),errors=[],writes=[],external=[];let revision=0,storage={...cfg.seed};
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('data:'))external.push(r.url());});
    await page.addInitScript(()=>{localStorage.setItem('mosswing.best','9999');localStorage.setItem('thunderfall:best','999999');localStorage.setItem('fufu-test-sentinel','unrelated-browser-storage');});
    await page.route('**/api/toy-games/*/save',async route=>{
     if(route.request().method()==='POST'){
      const data=route.request().postDataJSON();
      assert.equal(data.learnerId,991);assert.equal(data.expectedRevision,revision);
      assert(Object.keys(data.storage).every(k=>cfg.keys.includes(k)));
      Object.values(data.storage).forEach(value=>JSON.parse(value));
      storage=data.storage;revision++;writes.push(data);
     }
     await route.fulfill({json:{learnerId:991,revision,storage,stats:{}}});
    });
    await page.route(origin+'/harness',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}iframe{border:0;width:100%;height:100%}</style></head><body><iframe id="original" src="/${name}/index.html"></iframe><script>window.replies=[];addEventListener('message',e=>replies.push(e.data))</script></body></html>`}));
    await page.goto(origin+'/harness');
    const frame=page.frames().find(f=>f.url().includes('/'+name+'/index.html'))||await page.locator('#original').elementHandle().then(e=>e.contentFrame());
    await frame.waitForFunction(()=>window.FufuOriginalAdapter?.readyState,{timeout:20000});
    if(name==='iron-bastion')await frame.waitForFunction(()=>document.querySelector('#loading').hidden,{timeout:10000});
    assert.equal(await frame.evaluate(()=>innerWidth),mobile?390:1440);
    if(name==='mosswing')assert.equal(await frame.locator('#best').textContent(),'07');
    if(name==='thunderfall')assert.equal(await frame.evaluate(()=>window.FufuGameDebug.best),12345);
    if(name==='iron-bastion')assert.equal(await frame.evaluate(()=>IB.app.saved.best),54321);
    await page.screenshot({path:path.join(output,`${name}-${mobile?'mobile':'desktop'}-menu.png`)});
    await frame.locator(cfg.start).click();
    if(name==='mosswing'){
     await page.waitForTimeout(250);await page.screenshot({path:path.join(output,`${name}-${mobile?'mobile':'desktop'}-play.png`)});
     if(!mobile){await frame.locator('#game').press('p');assert.equal(await frame.evaluate(()=>FufuGameDebug.state),'paused');}
     await frame.locator('#sound').click();
    }else if(name==='thunderfall'){
     await page.waitForTimeout(600);
     const x=await frame.evaluate(()=>FufuGameDebug.game.player.x);
     await page.keyboard.down('d');await page.waitForTimeout(220);await page.keyboard.up('d');
     assert((await frame.evaluate(()=>FufuGameDebug.game.player.x))>x);
     await page.screenshot({path:path.join(output,`${name}-${mobile?'mobile':'desktop'}-play.png`)});
     await frame.locator('#pause-button').click();assert.equal(await frame.evaluate(()=>FufuGameDebug.game.mode),'paused');
     const before=await frame.evaluate(()=>FufuGameDebug.game.time);await page.waitForTimeout(150);assert.equal(await frame.evaluate(()=>FufuGameDebug.game.time),before);
     await frame.locator('#sound-button').click();
    }else{
     await frame.waitForFunction(()=>IB.app.game.state==='playing',{timeout:20000});
     assert.equal(await frame.evaluate(()=>IB.app.game.levelIndex),2);
     await page.screenshot({path:path.join(output,`${name}-${mobile?'mobile':'desktop'}-play.png`)});
     await frame.locator('#soundBtn').click();
    }
    await page.evaluate(()=>document.querySelector('iframe').contentWindow.postMessage({type:'fufu-toy-close'},location.origin));
    await page.waitForFunction(()=>window.replies.some(r=>r.type==='fufu-toy-exit'),{timeout:15000});
    assert(writes.length>0,'Account storage must be written on setting changes/exit');
    assert.equal(await frame.evaluate(()=>localStorage.getItem('fufu-test-sentinel')),'unrelated-browser-storage');
    assert.equal(await frame.evaluate(()=>localStorage.getItem('mosswing.best')),'9999');
    assert.deepEqual(errors,[]);assert.deepEqual(external,[],'All game resources must stay local');
    results.push({game:name,mobile,writes:writes.length,errors,external});
    await context.close();
   }
  }
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
 }finally{if(browser)await browser.close();server.kill();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
