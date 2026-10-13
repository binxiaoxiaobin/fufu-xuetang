/* Exercise actual builds: prolonged recording, restarts, pause, touch quality and fish workload. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const ts=require(path.join(root,'artifacts/sunbreak-build/node_modules/typescript'));
const THREE=require(path.join(root,'artifacts/sunbreak-build/node_modules/three'));
const loaded={};
function load(name){
 if(loaded[name])return loaded[name];
 const ctx={exports:{},require:n=>n==='three'?THREE:load(n.replace('./','')),localStorage:{getItem:()=>null,setItem:()=>{}}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'artifacts/sunbreak-build/src',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,ctx);
 return loaded[name]=ctx.exports;
}
const world={length:1e9,checkpoints:[],obstacles:[],height:()=>0,sample:(s,l=0)=>({position:new THREE.Vector3(l,0,s),tangent:new THREE.Vector3(0,0,1),right:new THREE.Vector3(1,0,0),width:10,curvature:0,slope:0,surface:'dirt',jump:0,section:'test'})};
const race=new (load('race').Race)(world),input={steer:0,pedal:true,brake:false,crouch:false,hop:false,boost:false,manual:false,trick:0};
race.start();race.update(input,3);
for(let i=0;i<60*60*60;i++){
 race.update(input,1/60);
 assert(race.recording.length<=3600,'hour-long race must retain bounded samples');
}
assert(Math.abs(race.elapsed-3600)<.01);
assert(race.recording[0].time<1,'long replay retains the beginning');
assert(race.elapsed-race.recording.at(-1).time<race.recordInterval+.1,'long replay retains recent time');
assert(race.recording.every((s,i,a)=>!i||s.time>a[i-1].time),'ghost samples remain chronological');
race.player.s=world.length;race.update(input,1/60);
assert.equal(race.phase,'results');assert(race.ghost.length<=3600);
race.reset();assert.equal(race.recording.length,0);assert.equal(race.recordInterval,.1);
console.log('PASS: one simulated hour, replay <= 3600 samples, chronological ghost, finish and reset.');

const {chromium}=require('../artifacts/toy2game/node_modules/playwright');
const origin=process.env.FUFU_TEST_ORIGIN||'http://localhost:8000';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.FUFU_TEST_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const context=await browser.newContext({viewport:{width:640,height:420},deviceScaleFactor:2,hasTouch:true});
  await context.addInitScript(()=>{window.__gpuDraws=0;for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){const original=WebGL2RenderingContext.prototype[name];WebGL2RenderingContext.prototype[name]=function(...args){window.__gpuDraws++;return original.apply(this,args);};}});
  await context.route('**/api/toy-games/fishslop/save',route=>route.fulfill({json:{learnerId:700099,revision:0,storage:{},stats:{}}}));
  const errors=[];const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/__performance.html*',route=>route.fulfill({contentType:'text/html',body:`<button id="open">开始</button><main id="page-kart-game"></main><script>open.onclick=()=>{};document.querySelector('#open').onclick=async()=>{const main=document.querySelector('main');await main.requestFullscreen();const f=document.createElement('iframe');f.allow='fullscreen; autoplay';f.style='width:640px;height:420px;border:0';f.src=new URLSearchParams(location.search).get('game');main.append(f);};</script>`}));
  async function open(entry,ready){
   await page.goto(origin+'/__performance.html?game='+encodeURIComponent(entry));await page.locator('#open').click();
   await page.waitForFunction(()=>document.querySelector('iframe'));
   const child=page.frames().find(f=>f!==page.mainFrame());
   try{await child.waitForFunction(ready,null,{timeout:60000});}catch(e){console.error('BOOT',entry,errors,await child.locator('body').innerText(),await page.evaluate(()=>document.fullscreenElement?.id));throw e;}return child;
  }
  const kart=await open('/assets/games/turbo-kart-rally/index.html',()=>window.__game?.state==='title');
  const resources=[];
  for(let i=0;i<8;i++){
   await kart.evaluate(()=>window.__game.startRace({laps:1}));
   await kart.waitForFunction(()=>window.__game.state==='intro');
   await kart.waitForTimeout(250);
   resources.push(await kart.evaluate(()=>({...window.__game.renderer.info.memory})));
  }
  assert(resources.slice(2).every(s=>s.geometries<=resources[2].geometries+3&&s.textures<=resources[2].textures+2),JSON.stringify(resources));
  await kart.evaluate(()=>{const r=window.__game.renderer,render=r.render.bind(r);window.__draws=0;r.render=(...a)=>{window.__draws++;return render(...a);};window.__game.pause();});await kart.waitForFunction(()=>window.__game.state==='paused');
  const pausedFrame=await kart.evaluate(()=>window.__draws);
  await kart.waitForTimeout(750);assert.equal(await kart.evaluate(()=>window.__draws),pausedFrame,'paused kart must stop drawing');
  await kart.evaluate(()=>window.__game.resume());await kart.waitForTimeout(300);
  await kart.waitForFunction(n=>window.__draws>n,pausedFrame);
  assert.deepEqual(await kart.evaluate(()=>window.__game.errors()),[]);
  console.log('PASS: 8 kart restarts, stable GPU resources, pause stops rendering, resume works.',JSON.stringify(resources));

  const sun=await open('/assets/games/sunbreak/index.html',()=>window.__SUNBREAK?.ready);
  await sun.evaluate(()=>window.__SUNBREAK.start());await sun.waitForTimeout(600);
  await sun.evaluate(()=>window.__SUNBREAK.pause());await sun.locator('#pause-panel:not(.hidden)').waitFor();
  const time=await sun.evaluate(()=>window.__SUNBREAK.state().time);
  const sunDraws=await sun.evaluate(()=>window.__gpuDraws);
  await sun.waitForTimeout(600);assert.equal(await sun.evaluate(()=>window.__SUNBREAK.state().time),time);
  assert.equal(await sun.evaluate(()=>window.__gpuDraws),sunDraws,'paused downhill must stop GPU draws');
  await sun.locator('#pause-panel [data-action=pause]').click();
  await sun.waitForTimeout(700);assert.notEqual(await sun.evaluate(()=>window.__SUNBREAK.state().phase),'paused');
  assert(await sun.evaluate(n=>window.__gpuDraws>n,sunDraws));
  await sun.waitForTimeout(5000);assert(await sun.evaluate(()=>window.__SUNBREAK.state().performance.pixelRatio<=1),'touch quality ceiling');
  console.log('PASS: downhill pause panel, frozen clock, resume and touch DPR ceiling.');

  const fish=await open('/assets/games/fishslop/index.html?quality=low&scale=.35',()=>!!window.__fishslop);
  await fish.locator('#btn-dive:not(:disabled)').click();
  await fish.evaluate(()=>{const s=window.__fishslop.sim;s.coins=1e30;for(let i=0;i<160;i++)s.buySpecies('glimmer');});
  const counts=[];
  for(let i=0;i<4;i++){
   await fish.waitForTimeout(1500);
   counts.push(await fish.evaluate(()=>{const s=window.__fishslop;return {fish:s.sim.fish.length,...s.world.renderer.info.memory};}));
  }
  assert(counts.every(s=>s.fish===110));assert(counts.slice(1).every(s=>s.geometries<=counts[1].geometries+2&&s.textures<=counts[1].textures+2),JSON.stringify(counts));
  await fish.evaluate(()=>{const r=window.__fishslop.world.renderer,render=r.render.bind(r);window.__draws=0;r.render=(...a)=>{window.__draws++;return render(...a);};});
  await fish.locator('#btn-pause').click();const fishFrame=await fish.evaluate(()=>window.__draws);
  await fish.waitForTimeout(600);assert.equal(await fish.evaluate(()=>window.__draws),fishFrame);
  console.log('PASS: fish population workload, stable GPU resources, pause.',JSON.stringify(counts));
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
