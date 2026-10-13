const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const audios=[];
class Audio{constructor(){audios.push(this);}play(){return Promise.resolve();}pause(){}}
const context={window:{speechSynthesis:{cancel(){}}},document:{addEventListener(){}},Audio,setTimeout(){},clearTimeout(){},fetch:async()=>({ok:true,json:async()=>({}),arrayBuffer:async()=>new ArrayBuffer(1)})};
vm.createContext(context);vm.runInContext(fs.readFileSync('frontend/tts.js','utf8'),context);
const tts=context.window.FufuTTS,tick=()=>new Promise(setImmediate);
(async()=>{
 let done=tts.playRecordings(['/word.mp3','/translation.mp3'],{readerPace:true});await tick();assert.equal(audios[0].playbackRate,1.05);
 audios[0].onended();await tick();assert.equal(audios[0].src,'/translation.mp3');assert.equal(audios[0].playbackRate,1.05);audios[0].onended();await done;
 done=tts.playRecording('/story.mp3');await tick();assert.equal(audios[0].playbackRate,1,'Other modules keep their original pace');audios[0].onended();await done;
 console.log('Reader recordings use a slight pace increase; other modules keep their speed');
})().catch(e=>{console.error(e);process.exitCode=1;});
