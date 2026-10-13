const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('frontend/reader-lessons.js','utf8');
const actual=source.slice(source.indexOf('    function readPlacedLetter('),source.indexOf('    const announce='));
function harness(){
  const requests=[],played=[];
  const context={alive:true,phase:'word',speechSerial:0,playWholeWord:()=>played.push('word'),window:{FufuTTS:{speak(text,lang){let resolve;const promise=new Promise(r=>resolve=r);requests.push({text,lang,resolve});return promise;}}}};
  vm.createContext(context);vm.runInContext(actual,context);return{context,requests,played};
}
(async()=>{
  const whole=source.slice(source.indexOf('    function playWholeWord('),source.indexOf('    function readPlacedLetter('));
  for(const language of ['en-US','zh-CN']){
    const urls=[];const ctx={speechSerial:0,alive:true,lesson:{language,word_audio:'/word.mp3',translation_audio:'/chinese.mp3'},window:{FufuTTS:{playRecordings:items=>{urls.push(items);return Promise.resolve({hit:true});}}}};
    vm.createContext(ctx);vm.runInContext(whole,ctx);await ctx.playWholeWord();
    assert.equal(JSON.stringify(urls[0]),JSON.stringify(language==='en-US'?['/word.mp3','/chinese.mp3']:['/word.mp3']));
  }
  const h=harness();h.context.readPlacedLetter('a',false);
  assert.equal(h.requests[0].text,'A');assert.equal(h.requests[0].lang,'en-US');
  h.requests[0].resolve({hit:true});await new Promise(setImmediate);assert.deepEqual(h.played,[]);
  h.context.readPlacedLetter('e',true);assert.deepEqual(h.played,[],'Whole word must wait for final letter');
  h.requests[1].resolve({hit:true});await new Promise(setImmediate);assert.deepEqual(h.played,['word']);
  for(const reason of ['exit','phase','new-sound','interrupted']){
    const h=harness();h.context.readPlacedLetter('z',true);
    if(reason==='exit')h.context.alive=false;
    if(reason==='phase')h.context.phase='sentence';
    if(reason==='new-sound')h.context.speechSerial++;
    h.requests[0].resolve({hit:true,interrupted:reason==='interrupted'});await new Promise(setImmediate);
    assert.deepEqual(h.played,[],reason+' must suppress deferred whole-word speech');
  }
  console.log('Letter names, final-letter sequencing, navigation and interruption: passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
