const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('frontend/tts.js','utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};}
function harness(manifest={}){
  const pending=[],audios=[];
  class Audio{constructor(){this.paused=true;this.currentTime=0;audios.push(this);}play(){this.paused=false;this.plays=(this.plays||0)+1;return Promise.resolve();}pause(){this.paused=true;}}
  const synthesis={cancel(){},getVoices(){return[];}};
  const context={window:{speechSynthesis:synthesis},speechSynthesis:synthesis,document:{addEventListener(){}},Audio,
    setTimeout(){return 0;},clearTimeout(){},fetch(url){if(url.includes('manifest.json'))return Promise.resolve({ok:true,json:async()=>manifest});const d=deferred();pending.push({url,...d});return d.promise;}};
  vm.createContext(context);vm.runInContext(source,context);
  return{tts:context.window.FufuTTS,pending,audios};
}
(async()=>{
  const h=harness();await h.tts.ensure();
  const request=h.tts.speak('late request','en-US');await tick();assert.equal(h.pending.length,1);
  h.tts.cancel('exit');h.pending[0].resolve({ok:true,json:async()=>({url:'/late.mp3'})});
  assert.equal((await request).interrupted,true);assert.equal(h.audios.length,0,'Delayed synthesis must not play after exit');

  const failed=harness();await failed.tts.ensure();const failedRequest=failed.tts.speak('late failure');await tick();
  failed.tts.cancel();failed.pending[0].resolve({ok:false,status:503});
  assert.equal((await failedRequest).hit,true,'Cancelled failure must not trigger browser fallback');

  const chain=harness();await chain.tts.ensure();const chainRequest=chain.tts.speakChain(['first','second']);await tick();
  chain.tts.cancel();chain.pending.forEach(p=>p.resolve({ok:true,json:async()=>({url:'/chain.mp3'})}));
  assert.equal((await chainRequest).interrupted,true);assert.equal(chain.audios.length,0);

  const playing=harness();playing.tts.playRecording('/question.mp3');await tick();
  assert.equal(playing.audios[0].paused,false);playing.tts.cancel();
  assert.equal(playing.audios[0].paused,true);assert.equal(playing.audios[0].onended,null,'Cancelled question must not start options');

  const competing=harness();await competing.tts.ensure();const first=competing.tts.speak('first');await tick();
  const second=competing.tts.speak('second');await tick();
  competing.pending[1].resolve({ok:true,json:async()=>({url:'/second.mp3'})});await tick();
  competing.pending[0].resolve({ok:true,json:async()=>({url:'/first.mp3'})});
  assert.equal((await first).interrupted,true);assert.equal(competing.audios.length,1);assert.equal(competing.audios[0].src,'/second.mp3');
  competing.audios[0].onended();assert.equal((await second).hit,true);

  const resume=deferred();let starts=0;
  const webAudio={playToken:1,waSource:null,waGain:{},waCreate:()=>({state:'suspended',resume:()=>resume.promise,
    createBufferSource:()=>({connect(){},start(){starts++;}})}),setTimeout(){return 0;},clearTimeout(){}};
  webAudio.waStop=()=>{webAudio.waSource=null;};vm.createContext(webAudio);
  vm.runInContext(source.slice(source.indexOf('function waPlay('),source.indexOf('// ================================================================ <audio>')),webAudio);
  const waking=webAudio.waPlay({},1);webAudio.playToken++;webAudio.waStop();resume.resolve();await waking;
  assert.equal(starts,0,'A suspended iPad audio context must not restart a cancelled clip when resumed');

  const bilingual=harness();
  const both=bilingual.tts.playRecordings(['/word.mp3','/chinese.mp3']);await tick();
  assert.equal(bilingual.audios[0].src,'/word.mp3');
  bilingual.audios[0].onended();await tick();assert.equal(bilingual.audios[0].src,'/chinese.mp3');
  bilingual.audios[0].onended();assert.equal((await both).hit,true);
  const interruptedBilingual=harness();interruptedBilingual.tts.playRecordings(['/word.mp3','/chinese.mp3']);await tick();
  interruptedBilingual.tts.cancel('exit');await tick();assert.equal(interruptedBilingual.audios[0].src,'/word.mp3');
  assert.equal(interruptedBilingual.audios[0].onended,null);
  const app=fs.readFileSync('frontend/app.js','utf8');
  let active=true,spoken=0,optionsStarted=0;
  const recording=deferred(),q={stage:'幼儿园',prompt_audio:'/recording.mp3',options:[{text:'one'}]};
  const context={state:{quiz:[q],index:0},quizViewGeneration:1,$:()=>({classList:{contains:()=>active}}),
    FufuTTS:{playRecording:()=>recording.promise,speakChain:()=>{optionsStarted++;return Promise.resolve({hit:true});},normalize:t=>t},
    browserSpeak:()=>spoken++,speak:()=>spoken++};
  vm.createContext(context);
  vm.runInContext(app.slice(app.indexOf('function questionLines('),app.indexOf('// 故事旁白路径')),context);
  const question=context.speakQuestion(q);active=false;context.quizViewGeneration++;recording.resolve({hit:true});await question;
  assert.equal(optionsStarted,0);assert.equal(spoken,0);
  assert.match(app,/clearTimeout\(quizSpeechTimer\)/);assert.match(app,/FufuTTS\.cancel\('navigation'\)/);
  console.log('Delayed synthesis, active recording, iPad context resume, competing requests and leaving question: passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
