const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const pending=[],choices=[{disabled:false,dataset:{choice:'cat'}},{disabled:false,dataset:{choice:'dog'}}];
const nodes=new Map();const node=()=>({textContent:'',innerHTML:'',addEventListener(){},classList:{add(){},remove(){}}});
const root={innerHTML:'',addEventListener(){},querySelector(selector){if(selector==='#readerSound'||selector==='#readerScatter')return null;if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);},querySelectorAll(selector){return selector==='[data-choice]'?choices:[];}};
const context={window:{navigate(){},FufuTTS:{cancel(){},playRecording(url){return new Promise((resolve,reject)=>pending.push({url,resolve,reject}));}}},document:{createElement:()=>({className:'',querySelector:()=>node()}),querySelector:()=>({before(){}})},AbortController,console};
vm.createContext(context);vm.runInContext(fs.readFileSync('frontend/reader-lessons.js','utf8'),context);
const lesson={word:'cat',sentence:'I see a cat.',before:'I see a ',after:'.',sentence_audio:'/sentence.mp3',word_audio:'/cat.mp3',choice_words:['dog'],language:'en-US'};
(async()=>{
 let stop=context.window.FufuReader.mount({root,lesson,stage:'sentence',onSubmit:()=>{throw Error('Early score');}});
 assert.equal(pending[0].url,'/sentence.mp3');assert(choices.every(b=>b.disabled));
 pending.shift().resolve({interrupted:false});await new Promise(setImmediate);assert(choices.every(b=>!b.disabled));
 nodes.get('#readerHearWord').onclick();assert(choices.every(b=>b.disabled));
 const old=pending.shift();nodes.get('#readerHearWord').onclick();old.resolve({interrupted:false});await new Promise(setImmediate);assert(choices.every(b=>b.disabled));
 pending.shift().resolve({interrupted:true});await new Promise(setImmediate);assert(choices.every(b=>b.disabled));
 nodes.get('#readerHearWord').onclick();const last=pending.shift();stop();last.resolve({interrupted:false});await new Promise(setImmediate);assert(choices.every(b=>b.disabled));
 stop=context.window.FufuReader.mount({root,lesson,stage:'sentence'});pending.shift().reject(Error('missing audio'));await new Promise(setImmediate);assert(choices.every(b=>b.disabled));stop();
 console.log('Sentence-first audio; replay, interruption, failure and exit guards passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
