const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('frontend/app.js','utf8');
let shown=0,cancelled=0,status=401,message='请先登录学习账号';
const context={window:{FufuAuth:{ensure:async()=>{shown++;}},FufuTTS:{cancel:()=>cancelled++}},fetch:async()=>({ok:status===200,status,json:async()=>({error:message})})};
vm.createContext(context);vm.runInContext(source.slice(source.indexOf('async function api('),source.indexOf('function toast(')),context);
(async()=>{
 await assert.rejects(context.api('/quiz-sessions'),/登录/);assert.equal(shown,1);assert.equal(cancelled,1);
 status=403;message='权限不足';await assert.rejects(context.api('/something'),/权限/);assert.equal(shown,1);
 status=500;message='服务器暂时不可用';await assert.rejects(context.api('/profile'),/服务器/);assert.equal(shown,1);
 status=200;await context.api('/profile');assert.equal(shown,1);
 console.log('Expired learner session opens sign-in; unrelated errors preserve their meaning: passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
