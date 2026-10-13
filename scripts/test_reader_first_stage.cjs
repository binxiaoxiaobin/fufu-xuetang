const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('../artifacts/toy2game/node_modules/playwright');
const out=path.resolve('artifacts/reader-first-stage');
const base='http://127.0.0.1:8000';
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  for(const touch of [false,true]){
   const context=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1000,height:760},hasTouch:touch,isMobile:touch,reducedMotion:'reduce'});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route(base+'/__reader-first-stage-test__',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/reader-lessons.css?v=20261012-first-stage-match-1"><link rel="stylesheet" href="/reader-round.css"></head><body><main id="page-quest"></main><main id="practice"></main><script>window.speech=[];window.navigate=()=>{};window.FufuTTS={preloadRecordings(){},cancel(){},speak(text){speech.push(text);return Promise.resolve({hit:true})},playRecording(url){speech.push(url);return Promise.resolve({hit:true})},playRecordings(urls){speech.push(urls);return Promise.resolve({hit:true})}};</script><script src="/reader-lessons.js?v=20261012-first-stage-match-1"></script><script src="/reader-round.js"></script></body></html>`}));
   await page.goto(base+'/__reader-first-stage-test__');
   assert.deepEqual(errors,[],'Practice scripts must initialize');
   const mount=async(word,language)=>page.evaluate(({word,language})=>{
    window.stopReader?.();window.speech=[];window.nextCount=0;window.mistakes=0;
    const lesson={word,language,pinyin:language==='zh-CN'?'shǒu':'',meaning:'测试字词',translation:'测试',word_audio:'/word.mp3',extra_characters:language==='zh-CN'?['毛']:['z']};
    window.stopReader=FufuReader.mount({root:document.querySelector('#practice'),lesson,recognitionDistractors:['头','脚'],onStageComplete(){nextCount++},onMistake(){mistakes++},nextLabel:'继续下一个'});
   },{word,language});
   const use=locator=>touch?locator.tap():locator.click();
   await mount('手','zh-CN');
   assert.equal(await page.locator('#practice .reader-puzzle-title h2').textContent(),'手');
   assert.equal(await page.locator('#practice [data-slot] span').textContent(),'手');
   assert.deepEqual(await page.evaluate(()=>speech),[],'First stage shows a character model rather than starting a listening question');
   await page.screenshot({path:path.join(out,`chinese-${touch?'touch':'desktop'}.png`)});
   await use(page.locator('#practice [data-piece]').filter({hasText:'毛'}));
   assert.equal(await page.locator('#practice .reader-slot.filled').count(),0);
   await use(page.locator('#practice [data-piece]').filter({hasText:'手'}));
   assert.equal(await page.locator('#practice .reader-slot.filled').count(),1);
   await use(page.locator('#practice [data-slot]'));
   assert.equal(await page.locator('#practice [data-slot] span').textContent(),'手','Removing a placed tile must keep the pale model');
   await use(page.locator('#practice [data-piece]').filter({hasText:'手'}));
   await page.locator('#practice #readerToSentence').click();
   assert.equal(await page.evaluate(()=>nextCount),1);
   for(const word of ['苹果','cat','apple','ice cream']){
    await mount(word,word==='苹果'?'zh-CN':'en-US');
    const model=await page.locator('#practice [data-slot] span').allTextContents();
    assert.equal(model.join(''),word.replaceAll(' ',''));
    for(const token of Array.from(word).filter(c=>c!==' ')){
     const piece=page.locator('#practice [data-piece]:not([hidden])').filter({has:page.locator('span',{hasText:new RegExp('^'+token+'$')})}).first();
     await use(piece);
    }
    assert.equal(await page.locator('#practice .reader-slot.filled').count(),word.replaceAll(' ','').length);
    await page.locator('#practice #readerToSentence').click();assert.equal(await page.evaluate(()=>nextCount),1);
   }
   if(!touch){
    await mount('手','zh-CN');await page.locator('#practice [data-piece]').filter({hasText:'手'}).dragTo(page.locator('#practice [data-slot]'));
    assert.equal(await page.locator('#practice .filled').count(),1);
    await mount('手','zh-CN');await page.locator('#practice [data-piece]').filter({hasText:'手'}).press('Enter');assert.equal(await page.locator('#practice .filled').count(),1);
   }
   await page.evaluate(()=>{
    stopReader();speech=[];const items=['手','头'].map((word,i)=>({question_id:i+1,word,pinyin:'',language:'zh-CN',word_audio:'/word.mp3',choice_words:['毛']}));
    window.stopReader=FufuReaderRound.mount({root:document.querySelector('#practice'),items,settings:{unit:'character'},onSubmit:async()=>({correct:true,reward:1}),onReturn(){},onProgress(){}});
   });
   await page.locator('#practice #readerStageStart').click();
   for(let n=0;n<2;n++){
    const word=await page.locator('#practice .reader-puzzle-title h2').textContent();
    assert.equal(await page.locator('#practice [data-slot] span').textContent(),word);
    await use(page.locator('#practice [data-piece]').filter({hasText:word}));
    await page.locator('#practice #readerToSentence').click();
   }
   assert.match(await page.locator('#practice #readerStageStart').textContent(),/听音辨词/);
   await page.locator('#practice #readerStageStart').click();assert.equal(await page.locator('#practice [data-phase="listen"]').count(),1);
   assert.deepEqual(errors,[]);console.log(`PASS ${touch?'touch':'desktop'}: pale character models, wrong/correct clicks, remove/retry, Chinese words, repeated English letters, word spaces, first-group transition to later listening; no errors.`);
   await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
