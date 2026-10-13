const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

function harness() {
  const nodes = new Map(), images = [], played = [];
  const node = id => {
    if(!nodes.has(id)) nodes.set(id, {id,textContent:'',disabled:false,hidden:false,style:{},
      classList:{add(){},remove(){},contains(){return true;}},
      setAttribute(){},removeAttribute(){},replaceWith(value){nodes.set(id,value);}});
    return nodes.get(id);
  };
  class Image {
    constructor(){images.push(this);this.naturalWidth=0;}
    set src(value){this.url=value;}
    get src(){return this.url;}
    decode(){return Promise.resolve();}
    replaceWith(value){nodes.set(this.id,value);}
    load(){this.naturalWidth=1200;this.onload?.();}
    fail(){this.onerror?.();}
  }
  const ctx = {Image,console,Promise,Map,Set,Date,Number,Math,
    setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},
    window:{addEventListener(){}},document:{addEventListener(){},createElement:()=>new Image()},
    $:selector=>node(selector.replace(/^#/,'')), state:{},
    FufuTTS:{cancel(){},playUrls:async urls=>{played.push(urls[0]);return {hit:true};}},
    speechSynthesis:{cancel(){}},escapeHtml:s=>s,storyCategory:()=>'',
    paragraphArt:(story,i)=>`image-${i}`,api:async()=>({visited:0,wait_seconds:0,completed:false}),
    refreshProfile:async()=>{},smoothSpeechText:s=>s, preferredVoice:()=>null,
  };
  vm.createContext(ctx); vm.runInContext(readFileSync('frontend/story-reader.js','utf8'),ctx);
  const story={id:1,title:'Test',age:'',paragraphs:['A','B','C'],audio_paths:['audio-0','audio-1','audio-2']};
  return {ctx,nodes,images,played,node,story, reader:ctx.window.FufuStoryReader};
}
const tick = async()=>{for(let i=0;i<12;i++) await Promise.resolve();};
(async()=>{
  const h=harness(); await h.reader.open(h.story);
  assert.equal(h.node('storyParagraph').textContent,'');
  h.images.find(i=>i.url==='image-0').load(); await tick();
  assert.equal(h.node('storyParagraph').textContent,'A');
  const next=h.node('nextParagraph').onclick();
  assert.equal(h.node('storyParagraph').textContent,'A','keep previous text while next image is loading');
  const later=h.node('nextParagraph').onclick();
  h.images.find(i=>i.url==='image-2').load(); await later;
  assert.equal(h.node('storyParagraph').textContent,'C');
  h.images.find(i=>i.url==='image-1').load(); await next;
  assert.equal(h.node('storyParagraph').textContent,'C','late intermediate image must not overwrite requested page');
  assert.equal(h.node('storyPageImage').src,'image-2');

  const n=harness(); await n.reader.open(n.story);
  n.images.find(i=>i.url==='image-0').load();await tick();
  const reading=n.node('listenWholeStory').onclick(); await tick();
  assert.deepEqual(n.played,['audio-0'],'next narration must await matching image');
  n.images.find(i=>i.url==='image-1').load();await tick();
  assert.deepEqual(n.played,['audio-0','audio-1']);
  n.reader.close(); n.images.find(i=>i.url==='image-2').load();await reading;
  assert.deepEqual(n.played,['audio-0','audio-1'],'closing during image load must stop subsequent narration');
  assert.equal(n.node('storyParagraph').textContent,'B');
  const broken=harness(); await broken.reader.open(broken.story);
  broken.images.find(i=>i.url==='image-0').load(); await tick();
  const failure=broken.node('nextParagraph').onclick();
  broken.images.find(i=>i.url==='image-1').fail(); await failure;
  assert.equal(broken.node('storyParagraph').textContent,'B');
  assert.equal(broken.node('storyPageImage').src,undefined,'failed image must clear the preceding illustration');
  console.log('Story image/text/audio synchronization checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
