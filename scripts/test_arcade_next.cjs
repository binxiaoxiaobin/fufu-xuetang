const fs=require('fs');
const {chromium}=require('../artifacts/toy2game/node_modules/playwright');
(async()=>{
 fs.mkdirSync('artifacts/arcade-next/tests',{recursive:true});
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const slug of ['little-spy','taipo','sokoworld','open-jigsaw']){
  const page=await browser.newPage({viewport:{width:1100,height:760}}),errors=[],logs=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>logs.push(m.type()+': '+m.text()));page.on('response',r=>{if(r.status()>=400)requests.push(r.status()+' '+r.url());});
  await page.route('**/api/toy-games/*/save',r=>r.fulfill({json:{learnerId:881,revision:0,storage:{},stats:{}}}));
  await page.goto(`http://localhost:8000/assets/games/${slug}/index.html`);
  if(slug!=='open-jigsaw')await page.locator('#start').click();
  await page.waitForTimeout(slug==='little-spy'?12000:6500);
  await page.screenshot({path:`artifacts/arcade-next/tests/${slug}.png`});
  const info=await page.evaluate(()=>({text:document.body.innerText,cache:window.FufuNative?.memory?null:window.FufuGodot?.nativeState,frames:document.querySelectorAll('iframe').length}));
  fs.writeFileSync(`artifacts/arcade-next/tests/${slug}.json`,JSON.stringify({errors,logs,requests,info},null,2));
  console.log(slug,JSON.stringify({errors,requests,text:info.text.slice(0,420),cache:info.cache}));
  await page.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
