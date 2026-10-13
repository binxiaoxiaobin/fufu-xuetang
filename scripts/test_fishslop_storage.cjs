const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname,'..');
const ts = require('../artifacts/sunbreak-build/node_modules/typescript');
const code = ts.transpileModule(fs.readFileSync(path.join(root,'content/games/fishslop/adaptation/fufu-storage.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness() {
  const events={},reports=[],requests=[],timers=new Map();let sequence=0,rev=4,conflict=false,offline=false;
  const win={addEventListener:(type,fn)=>(events[type]||=[]).push(fn),dispatchEvent:event=>events[event.type]?.forEach(fn=>fn(event))};
  const parent={postMessage:message=>reports.push(message)};
  const ctx=vm.createContext({exports:{},window:win,parent,location:{origin:'http://localhost:8000'},document:{hidden:false,addEventListener:win.addEventListener},Set,JSON,Promise,AbortController,queueMicrotask,Event,
    setTimeout:fn=>{timers.set(++sequence,fn);return sequence;},clearTimeout:id=>timers.delete(id),
    fetch:async (_url,options)=>{requests.push(options);if(options.method==='GET')return {ok:true,json:async()=>({learnerId:11,revision:rev,storage:{'fishslop.settings.v1':'{"night":true}'}})};
      if(offline)throw new Error('offline');if(conflict)return {ok:false,status:409,json:async()=>({error:'进度已变化'})};
      const body=JSON.parse(options.body);assert.equal(body.learnerId,11);assert.equal(body.expectedRevision,rev);return {ok:true,json:async()=>({revision:++rev})};}
  });
  vm.runInContext(code,ctx);
  return {api:ctx.exports,win,parent,events,reports,requests,setOffline:value=>offline=value,setConflict:value=>conflict=value};
}
(async()=>{
  const h=harness();await h.api.initialize();
  assert.equal(h.api.learnerStorage.getItem('fishslop.settings.v1'),'{"night":true}');
  assert.equal(h.api.learnerStorage.getItem('fishslop.save.v1'),null);
  h.api.learnerStorage.setItem('foreign-game','{}');await h.api.flush();assert.equal(h.requests.length,1);
  h.api.learnerStorage.setItem('fishslop.save.v1','{"v":1}');await h.api.flush();
  assert.equal(JSON.parse(h.requests.at(-1).body).expectedRevision,4);
  const n=h.requests.length;h.api.learnerStorage.setItem('fishslop.save.v1','{"v":1}');await h.api.flush();assert.equal(h.requests.length,n);
  h.setOffline(true);h.api.learnerStorage.setItem('fishslop.save.v1','{"v":1,"coins":5}');await assert.rejects(h.api.flush(),/offline/);
  assert.equal(h.reports.at(-1).type,'fufu-toy-save-error');
  h.setOffline(false);await h.api.flush();assert.equal(h.reports.at(-1).text,'进度已保存');
  h.api.learnerStorage.removeItem('fishslop.save.v1');await h.api.flush();assert(!('fishslop.save.v1' in JSON.parse(h.requests.at(-1).body).storage));
  // A spoofed message cannot close the game or discard this account's progress.
  h.events.message[0]({origin:'https://foreign.example',source:h.parent,data:{type:'fufu-toy-discard'}});
  h.api.learnerStorage.setItem('fishslop.save.v1','{"v":1,"coins":7}');await h.api.flush();
  h.events.message[0]({origin:'http://localhost:8000',source:{},data:{type:'fufu-toy-discard'}});
  h.api.learnerStorage.setItem('fishslop.save.v1','{"v":1,"coins":8}');await h.api.flush();
  h.events.message[0]({origin:'http://localhost:8000',source:h.parent,data:{type:'fufu-toy-discard'}});
  h.api.learnerStorage.setItem('fishslop.save.v1','{"v":1,"coins":100}');
  assert.equal(h.api.learnerStorage.getItem('fishslop.save.v1'),'{"v":1,"coins":8}');
  const conflict=harness();await conflict.api.initialize();conflict.setConflict(true);
  conflict.api.learnerStorage.setItem('fishslop.save.v1','{"v":1}');await assert.rejects(conflict.api.flush(),/进度已变化/);
  await assert.rejects(conflict.api.flush(),/账号或进度已变化/);
  const before=conflict.requests.length;conflict.api.learnerStorage.setItem('fishslop.save.v1','{"v":1,"coins":100}');
  assert.equal(conflict.requests.length,before);assert.equal(conflict.api.learnerStorage.getItem('fishslop.save.v1'),'{"v":1}');
  const main=fs.readFileSync(path.join(root,'artifacts/fishslop-build/src/main.ts'),'utf8');
  const lifecycle=main.slice(main.indexOf("window.addEventListener('pagehide'"),main.indexOf('// ---------------------------------------------------------------- events'));
  const listeners={};
  const life=vm.createContext({window:{addEventListener:(name,fn)=>listeners[name]=fn}});
  vm.runInContext("let exiting=false,mode='playing',snapshots=0;const persist=()=>snapshots++;const pause=()=>{mode='paused'};const audio={suspend(){}};"+lifecycle,life);
  listeners['fufu-game-close']();assert.equal(vm.runInContext('snapshots',life),1);
  listeners.pagehide();assert.equal(vm.runInContext('snapshots',life),1,'removing a saved iframe must not submit another snapshot');
  listeners['fufu-game-reopen']();assert.equal(vm.runInContext('exiting',life),false,'failed exit permits retry');
  listeners.pagehide();assert.equal(vm.runInContext('snapshots',life),2,'native departure captures unsaved progress');
  listeners.pageshow();assert.equal(vm.runInContext('exiting',life),false,'back-forward restoration unfreezes rendering');
  console.log('PASS: learner/revision binding, key whitelist, unchanged save suppression, deletion, offline retry, spoofed-message rejection, account discard and revision conflict.');
  console.log('PASS: exit captures once, iframe removal suppresses duplicate saves, failed exit and back-forward restoration unfreeze the game.');
})().catch(e=>{console.error(e);process.exitCode=1;});
