const {chromium}=require('../artifacts/toy2game/node_modules/playwright');
const fs=require('fs'),path=require('path');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 fs.mkdirSync('artifacts/itch-ports/tests',{recursive:true});
 for(const game of process.argv.slice(2).length?process.argv.slice(2):['starcatcher']){
  const page=await browser.newPage({viewport:{width:1000,height:720}});const errors=[],logs=[];
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());else logs.push(m.text());});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/toy-games/*/save',route=>route.fulfill({json:{learnerId:991,revision:0,storage:{},stats:{}}}));
  await page.goto('http://127.0.0.1:8000/assets/games/'+game+'/index.html');
  await page.locator('#start').click({timeout:15000});
  await page.waitForTimeout(15000);
  await page.screenshot({path:'artifacts/itch-ports/tests/'+game+'.png'});
  fs.writeFileSync('artifacts/itch-ports/tests/'+game+'.json',JSON.stringify({errors,logs,status:await page.locator('#status').textContent(),loadingHidden:await page.locator('#loading').evaluate(el=>el.hidden)},null,2));
  console.log(game,JSON.stringify(errors),await page.locator('#status').textContent());await page.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
