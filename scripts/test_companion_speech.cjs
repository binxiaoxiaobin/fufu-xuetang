const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('frontend/extras.js','utf8');
const segment=source.slice(source.indexOf('function loadPetSpeech()'),source.indexOf('async function loadShop()'));
function harness(api){
  const spoken=[],played=[],status={textContent:''};
  const context={window:{pet3d:{play:action=>played.push(action)}},document:{querySelector:()=>({})},
    api,$:()=>status,speak:text=>spoken.push(text),Math,Map};
  vm.createContext(context);
  vm.runInContext('let petSpeech=null,petSpeechRequest=null,petLineBag=[],lastPetLine="",petSpeechSequence=0;'+segment,context);
  return {context,spoken,played,status,respond:context.window.respondPetSpeech};
}
(async()=>{
  let calls=0;
  const h=harness(async()=>{calls++;return {encouragements:['one','two','one'],songs:[{lyrics:'song'}]};});
  await h.respond();await h.respond();await h.respond();
  assert.equal(new Set(h.spoken).size,3,'A complete round must not repeat a line');
  assert.equal(calls,1,'Published speech is cached');
  assert.deepEqual(h.played,['sing']);
  await h.respond();assert.notEqual(h.spoken[2],h.spoken[3],'Round boundary must not repeat the last line');
  let resolve,counter=0;
  const concurrent=harness(()=>{counter++;return new Promise(r=>resolve=r);});
  const first=concurrent.respond(),second=concurrent.respond();
  resolve({encouragements:['hello'],songs:[]});await Promise.all([first,second]);
  assert.equal(counter,1);assert.equal(concurrent.spoken.length,1,'Delayed responses must not queue multiple voices');
  const retry=harness(async()=>{if(!retry.ready)throw Error('offline');return {encouragements:['back'],songs:[]};});
  await retry.respond();assert.match(retry.status.textContent,/语音暂时/);
  retry.ready=true;await retry.respond();assert.deepEqual(retry.spoken,['back']);
  const away=harness(async()=>({encouragements:['hello'],songs:[]}));
  away.context.document.querySelector=()=>null;await away.respond();assert.equal(away.spoken.length,0);
  console.log('Speech shuffle, cache, concurrent taps, retry, singing and leaving-home checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
