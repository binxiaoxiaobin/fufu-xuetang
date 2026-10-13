const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const tick=()=>new Promise(setImmediate);
function setup(){
 const nodes=new Map(),listeners=new Map(),recordings=[];let lastLetterResolve,saveResolve;
 const lastLetter=new Promise(r=>lastLetterResolve=r),save=new Promise(r=>saveResolve=r);
 const node=()=>({textContent:'',innerHTML:'',clientWidth:500,offsetWidth:40,offsetLeft:0,style:{setProperty(){}},append(){},setAttribute(){},remove(){},addEventListener(){},classList:{add(){},remove(){},toggle(){}}});
 const root={innerHTML:'',querySelector(selector){if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);},querySelectorAll(selector){return selector==='[data-memory-slot]'?[0,1,2].map(i=>{const n=this.querySelector(`[data-memory-slot="${i}"]`);n.dataset={memorySlot:String(i)};return n;}):[];},addEventListener(type,fn){listeners.set(type,fn);}};
 const context={window:{FufuTTS:{cancel(){},speak:text=>text==='T'?lastLetter:Promise.resolve({hit:true}),playRecordings:async urls=>recordings.push(Array.from(urls))}},document:{createElement:()=>node()},AbortController,console};
 vm.createContext(context);vm.runInContext(fs.readFileSync('frontend/reader-memory.js','utf8'),context);
 const stop=context.window.FufuMemory.mount({root,lesson:{word:'cat',language:'en-US',word_audio:'/cat.mp3',translation_audio:'/mao.mp3'},memoryUnit:'word',onSubmit:()=>save});
 nodes.get('#memoryBurst').onclick();
 const fill=()=>[0,1,2].forEach(id=>listeners.get('click')({detail:0,target:{closest:()=>({dataset:{memoryPiece:String(id)}})}}));
 return{nodes,recordings,fill,stop,lastLetterResolve,saveResolve};
}
(async()=>{
 let h=setup();h.fill();await tick();assert.equal(h.recordings.length,0,'Last letter must finish');
 h.lastLetterResolve({hit:true});await tick();assert.deepEqual(h.recordings,[['/cat.mp3','/mao.mp3']],'Automatic bilingual word audio must precede delayed save');
 h.saveResolve({correct:true,reward:1});await tick();assert.equal(h.recordings.length,1,'Saving and completion must not repeat the word');h.stop();
 h=setup();h.fill();h.stop();h.lastLetterResolve({hit:true});h.saveResolve({correct:true,reward:1});await tick();assert.equal(h.recordings.length,0,'Leaving cancels queued whole-word audio');
 console.log('Auto-check, last-letter sequencing, immediate bilingual audio, single playback and exit passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
