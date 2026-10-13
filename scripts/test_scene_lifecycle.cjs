const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../frontend');
function managerChecks(){
  let timerId=0;const timers=new Map(),listeners={},nodes=new Map(),stats={};
  const document={hidden:false,getElementById(id){if(!nodes.has(id))nodes.set(id,{classList:{contains:()=>false},setAttribute(k,v){this[k]=v}});return nodes.get(id)},addEventListener(type,fn){listeners[type]=fn}};
  const context={window:{},document,setTimeout(fn){timers.set(++timerId,fn);return timerId},clearTimeout(id){timers.delete(id)},console};
  vm.runInNewContext(fs.readFileSync(path.join(root,'scene-manager.js'),'utf8'),context);
  const manager=context.window.FufuScenes;
  function register(name){stats[name]={boots:0,disposals:0,pauses:0,resumes:0};manager.register(name,saved=>{const stat=stats[name];stat.boots++;stat.selected=saved.selected||name;return{pause(){stat.pauses++},resume(){stat.resumes++},snapshot(){return{selected:stat.selected}},dispose(){stat.disposals++}}})}
  ['a','b','c'].forEach(register);
  manager.enter('a');stats.a.selected='remember me';manager.enter('b');assert.equal(stats.a.disposals,0);
  manager.enter('c');assert.equal(stats.a.disposals,1);assert.equal(stats.b.disposals,0);
  manager.enter('a');assert.equal(stats.a.boots,2);assert.equal(stats.a.selected,'remember me');
  manager.enter('c');manager.enter('a');manager.enter('home');
  assert.ok(timers.size>0,'revisited scenes must receive a fresh idle timer');
  for(const callback of [...timers.values()])callback();
  assert.equal(nodes.get('page-a')['data-scene-resident'],'false');
  manager.enter('a');document.hidden=true;listeners.visibilitychange();assert.ok(stats.a.pauses>0);
  document.hidden=false;listeners.visibilitychange();assert.ok(stats.a.resumes>0);
  console.log('Manager checks: bounded warm scenes, remembered choice, re-entry timers, background pause.');
}
function scopeChecks(){
  let rafId=0,draws=0,removed=0,disconnected=0;const raf=new Map(),calls={};
  const count=name=>()=>{calls[name]=(calls[name]||0)+1};
  class Observer{constructor(fn){this.callback=fn}disconnect(){disconnected++}}
  const context={window:{ResizeObserver:Observer,IntersectionObserver:Observer,MutationObserver:Observer},document:{hidden:false},Image:class{},console,requestAnimationFrame(fn){raf.set(++rafId,fn);return rafId},cancelAnimationFrame(id){raf.delete(id)}};
  let source=fs.readFileSync(path.join(root,'scene-scope.js'),'utf8').replace(/^import[^\n]*\n/m,'').replace(/export function/g,'function');
  source+='\nthis.createScope=createSceneScope;';vm.runInNewContext(source,context);
  const scope=context.createScope(),target={addEventListener(){},removeEventListener(){removed++}};
  scope.listen(target,'click',()=>{});new scope.ResizeObserver(()=>{});
  const geometry={dispose:count('geometry')},texture={isTexture:true,dispose:count('texture')},material={map:texture,dispose:count('material')},skeleton={dispose:count('skeleton')};
  const node={geometry,material,skeleton},scene={traverse(fn){fn(node);fn(node)},clear:count('clear')};
  const renderer={renderLists:{dispose:count('lists')},dispose:count('renderer'),forceContextLoss:count('context'),domElement:{remove:count('canvas')}};
  scope.own(scene,renderer);scope.capture(()=>({selected:'mars'}));assert.equal(scope.snapshot().selected,'mars');
  scope.frame(()=>draws++);scope.pause();assert.equal(raf.size,0);scope.resume();assert.equal(raf.size,1);
  const callback=[...raf.values()][0];raf.clear();callback(1);assert.equal(draws,1);
  scope.frame(()=>draws++);scope.dispose();scope.dispose();assert.equal(raf.size,0);scope.resume();scope.frame(()=>draws++);assert.equal(raf.size,0);
  assert.equal(removed,1);assert.equal(disconnected,1);
  for(const name of ['geometry','material','texture','skeleton','renderer','context','canvas'])assert.equal(calls[name],1,name);
  console.log('Scope checks: cancellation, listener/observer cleanup, shared-resource deduplication, GPU release, idempotent disposal.');
}
managerChecks();scopeChecks();
