const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('frontend/tts.js','utf8'),context={};vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('  function readerBounds('),source.indexOf('  function waStop(')),context);
const data=new Float32Array(1000);data.fill(.02,200,700);
const bounds=context.readerBounds({sampleRate:1000,getChannelData:()=>data});
assert(Math.abs(bounds.start-.12)<.0001);assert(Math.abs(bounds.duration-.68)<.0001);
assert.equal(context.readerBounds({sampleRate:1000,getChannelData:()=>new Float32Array(1000)}),null);
assert.equal(context.readerBounds({}),null);
console.log('Reader silence shortened with 80/100 ms speech margins; silent and legacy buffers safe');
