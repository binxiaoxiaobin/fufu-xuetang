const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
const ts=require(path.join(root,'artifacts/sunbreak-build/node_modules/typescript'));
const source=fs.readFileSync(path.join(root,'artifacts/sunbreak-build/src/input.ts'),'utf8');
const listeners={};const context=vm.createContext({exports:{},window:{addEventListener:(name,fn)=>listeners[name]=fn},Set,Number});
vm.runInContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const input=new context.exports.Controls(()=>{});
input.setTouch('ArrowUp',true);input.setTouch('ArrowLeft',true);input.setTouch('Space',true);
let state=input.read();assert.equal(state.pedal,true);assert.equal(state.steer,-1);assert.equal(state.crouch,true);
input.setTouch('Space',false);state=input.read();assert.equal(state.crouch,false);assert.equal(state.pedal,true);
input.setTouch('ShiftLeft',true);input.setTouch('Digit6',true);assert.equal(input.read().boost,true);assert.equal(input.read().trick,6);
listeners.blur();assert.equal(input.read().pedal,false);assert.equal(input.read().boost,false);assert.equal(input.read().trick,0);
input.setTouch('ArrowDown',true);input.reset();assert.equal(input.read().brake,false);

const helper=fs.readFileSync(path.join(root,'frontend/assets/games/fullscreen-entry.js'),'utf8').replace(/export (async )?function/g,'$1function');
function harness(id){
 const docEvents={},winEvents={},replies=[],element={id,contains:()=>true,querySelector:()=>null},button={},message={};
 const notice={dataset:{},innerHTML:'',querySelector:selector=>selector==='button'?button:message};
 const doc={fullscreenElement:null,querySelector:()=>({}),addEventListener:(n,fn)=>(docEvents[n] ||= new Set()).add(fn),removeEventListener:(n,fn)=>docEvents[n]?.delete(fn)};
 const parent={document:doc,postMessage:message=>replies.push(message)};
 const window={frameElement:{closest:()=>element},addEventListener:(n,fn)=>(winEvents[n] ||= new Set()).add(fn),removeEventListener:(n,fn)=>winEvents[n]?.delete(fn),dispatchEvent:()=>{}};
 const fire=()=>{for(const fn of [...(docEvents.fullscreenchange||[])])fn();};
 element.requestFullscreen=()=>{doc.fullscreenElement=element;fire();return Promise.resolve();};
 const ctx=vm.createContext({parent,window,location:{origin:'http://localhost:8000'},Event:class{},Set,Promise});vm.runInContext(helper,ctx);
 return {ctx,doc,element,notice,button,message,window,parent,replies,fire};
}
(async()=>{
 for(const id of ['page-kart-game','page-toy-game']){
  const h=harness(id);assert.equal(h.ctx.fullscreenAllowed(),false);
  const gate=h.ctx.waitForFullscreen('test',h.notice);assert(h.button.onclick,'old callers receive a fullscreen button');
  await h.button.onclick();assert.equal(await gate,true);assert.equal(h.ctx.fullscreenAllowed(),true);
  h.doc.fullscreenElement=null;h.fire();assert.equal(h.replies.at(-1).type,'fufu-toy-exit');
 }
 const h=harness('unexpected-page');h.doc.fullscreenElement=h.element;assert.equal(h.ctx.fullscreenAllowed(),false,'unrelated fullscreen cannot authorize a game');
 const direct=harness('page-kart-game');direct.ctx.parent=direct.window;assert.equal(await direct.ctx.waitForFullscreen('test',direct.notice),false);
 console.log('PASS: downhill multi-action input, hop release, boost/tricks, blur/reset; fullscreen gate, legacy launcher compatibility, exit cleanup, direct/unrelated entry rejection.');
})().catch(e=>{console.error(e);process.exitCode=1;});
