import * as THREE from 'three';
import {makeSheep,makePasture,makePlot} from './farm-models.js?v=20261006-farm-feedback-1';
import {FARM_AREA,FARM_PLOTS} from './farm-layout.js';
import {terrainHeight} from './world.js?v=20261003-paddy-1';
import {PADDY} from './data.js';
import {paddyStage,paddyProgress,beijingDay,PADDY_STAGES} from './paddy-cycle.js?v=20261003-daily-water-1';
import {farmRequestId} from './farm-request-id.js?v=20261005-farm-touch-3';

const escape = text => String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function label(text) {
  const c=document.createElement('canvas');c.width=320;c.height=100;const ctx=c.getContext('2d');
  ctx.fillStyle='#fff9e9';ctx.beginPath();
  if(ctx.roundRect)ctx.roundRect(4,8,312,76,24);
  else{ctx.moveTo(28,8);ctx.arcTo(316,8,316,84,24);ctx.arcTo(316,84,4,84,24);ctx.arcTo(4,84,4,8,24);ctx.arcTo(4,8,316,8,24);ctx.closePath();}
  ctx.fill();ctx.font='bold 32px sans-serif';ctx.fillStyle='#705c47';ctx.textAlign='center';ctx.fillText(text,160,58);
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthTest:false}));sprite.scale.set(2.6,.82,1);sprite.renderOrder=5;return sprite;
}
function clear(group) { group.traverse(node=>{if(node.isSprite){node.material.map?.dispose();node.material.dispose();}else if(node.userData.farmDisposable){node.geometry.dispose();node.material.dispose();}});group.clear(); }

export class Farm {
  constructor({scene,world,player,ui,effects,stopTour,hideCard}) {
    Object.assign(this,{scene,world,player,ui,effects,stopTour,hideCard});
    this.root=new THREE.Group();scene.add(this.root);this.sheep=[];this.plots=[];this.tab='sheep';this.selected='cloud';this.busy=false;this.data=null;this.follow=null;this.offset=0;this.lastRefresh=0;this.visible=true;this.pickTargets=[];this.projected=new THREE.Vector3();
    this.launch=document.createElement('button');this.launch.type='button';this.launch.className='farm-launch';this.launch.textContent='🐑 小牧场';this.launch.setAttribute('aria-label','打开团团小牧场');document.body.append(this.launch);
    this.panel=document.createElement('section');this.panel.className='farm-panel';this.panel.hidden=true;this.panel.setAttribute('aria-label','团团的小牧场');
    this.panel.innerHTML=`<div class="farm-heading"><h2>团团的小牧场 <span>🐑</span></h2><button type="button" class="farm-close" aria-label="收起小牧场">×</button></div><p class="farm-intro">点按钮就能照顾，不用先走过去。</p><nav class="farm-tabs" aria-label="牧场内容"><button data-tab="sheep">小羊</button><button data-tab="garden">菜园</button><button data-tab="paddy">稻田</button><button data-tab="craft">制作</button><button data-tab="album">相册</button></nav><div class="farm-content"></div><p class="farm-message" role="status" aria-live="polite">正在准备小牧场…</p><div class="farm-footer"><button type="button" data-home>🚶 去牧场看看</button><button type="button" data-shop>⭐ 积分商店</button></div>`;document.body.append(this.panel);
    this.content=this.panel.querySelector('.farm-content');this.message=this.panel.querySelector('.farm-message');
    this.launch.onclick=()=>this.open('sheep',true);
    this.panel.querySelector('.farm-close').onclick=()=>this.close();
    this.panel.addEventListener('click',event=>this.onPanelClick(event));
    this.panel.addEventListener('submit',event=>{if(event.target.matches('.farm-name-form')){event.preventDefault();const name=new FormData(event.target).get('name');this.act({type:'rename',target:this.selected,name});}});
    window.addEventListener('message',event=>{
      if(event.origin!==location.origin)return;
      if(event.data?.type==='fufu-farm-refresh')this.refresh();
      if(event.data?.type==='fufu-audio-suspend'){this.visible=false;this.follow=null;}
      if(event.data?.type==='fufu-audio-resume'){this.visible=true;this.refresh();}
    });
    window.addEventListener('keydown',event=>{if(event.key==='Escape')this.close();});
    this.load();
  }
  now(){return Date.now()+this.offset;}
  async api(path,body) {
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',signal:controller.signal,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'小牧场暂时没有回应');return data;
    }catch(error){
      if(error.name==='AbortError'||error instanceof TypeError)throw new Error('连接有点慢，请收起再打开牧场，确认操作结果。');
      throw error;
    }finally{clearTimeout(timeout);}
  }
  async load(){try { this.accept(await this.api('/api/farm'));this.message.textContent=this.now()>=this.data.state.sheep[0].woolReadyAt?'毛毛长好啦，去认识棉花糖吧。':'欢迎回来，毛毛正在慢慢长。'; }catch(error){this.message.textContent=error.message;this.content.innerHTML='<button type="button" data-retry>重新加载小牧场</button>';}}
  async refresh(){if(this.busy||this.refreshing)return;this.refreshing=true;try{this.accept(await this.api('/api/farm'));}catch(error){if(!this.panel.hidden)this.message.textContent=error.message;}finally{this.refreshing=false;}}
  accept(data){
    if(this.data&&data.revision<this.data.revision)return;
    const changed=!this.data||JSON.stringify(this.data.state)!==JSON.stringify(data.state);
    this.data=data;this.offset=data.serverTime-Date.now();
    if(changed)this.rebuild();this.render();
  }
  rebuild(){
    clear(this.root);this.sheep=[];this.plots=[];this.pickTargets=[];const {state,catalog}=this.data;
    this.riceStage=paddyStage(state.paddy,this.now());this.world.setPaddyStage(this.riceStage);
    const riceTarget=new THREE.Mesh(new THREE.PlaneGeometry(PADDY.hx*2,PADDY.hz*2),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));
    riceTarget.rotation.x=-Math.PI/2;riceTarget.position.set(PADDY.x,terrainHeight(PADDY.x,PADDY.z)+.12,PADDY.z);riceTarget.userData.farm={type:'paddy'};riceTarget.userData.farmDisposable=true;this.root.add(riceTarget);
    const riceSign=label('🌾 点我照顾稻田');riceSign.position.set(PADDY.x,terrainHeight(PADDY.x,PADDY.z+PADDY.hz)+1.1,PADDY.z+PADDY.hz+.3);riceSign.userData.farm={type:'paddy'};this.root.add(riceSign);this.pickTargets.push(riceSign);
    const pasture=makePasture(state.capacity,state.decorations);pasture.position.set(FARM_AREA.x,terrainHeight(FARM_AREA.x,FARM_AREA.z)+.08,FARM_AREA.z);this.root.add(pasture);
    pasture.traverse(node=>{if(node.isMesh)node.userData.farm={type:'home'};});
    const sign=label('点我打开小牧场');sign.scale.set(2.3,.72,1);sign.position.set(FARM_AREA.x-3.5,terrainHeight(FARM_AREA.x-3.5,FARM_AREA.z+3.6)+1.3,FARM_AREA.z+3.6);sign.userData.farm={type:'home'};this.root.add(sign);this.pickTargets.push(sign);
    state.sheep.forEach((data,index)=>{
      const breed=catalog.breeds.find(b=>b.id===data.breed), model=makeSheep(breed);const x=FARM_AREA.x+(index-1)*1.7,z=FARM_AREA.z+.5;
      model.root.position.set(x,terrainHeight(x,z)+.1,z);this.root.add(model.root);const tag=label(data.name);model.root.add(tag);tag.position.y=2.3;tag.userData.farm={type:'sheep',id:data.id};this.pickTargets.push(tag);
      model.root.traverse(node=>{if(node.isMesh)node.userData.farm={type:'sheep',id:data.id};});
      this.sheep.push({...model,data,index,tag,home:new THREE.Vector3(x,0,z),reaction:0,eating:0});
    });
    for(const point of FARM_PLOTS){
      const data=state.plots.find(p=>p.id===point.id),stage=!data.crop?0:!data.watered?0:this.now()>=data.readyAt?2:1;
      const mesh=makePlot(data.crop,stage);mesh.position.set(point.x,terrainHeight(point.x,point.z)+.18,point.z);this.root.add(mesh);mesh.traverse(n=>{if(n.isMesh)n.userData.farm={type:'plot',id:data.id};});
      this.plots.push({mesh,data,stage,point});
    }
    if(!this.obstaclesAdded){
      this.obstaclesAdded=true;
      // Reserve each fence segment, leaving a wide entrance; never block the whole pasture.
      for(let x=-5;x<=5;x+=.8)for(const z of [-3.5,3.5])if(z<0||Math.abs(x)>1.7)this.world.addObstacle(FARM_AREA.x+x,FARM_AREA.z+z,.32);
      for(const x of [-5,5])for(let z=-3.5;z<=3.5;z+=.8)this.world.addObstacle(FARM_AREA.x+x,FARM_AREA.z+z,.32);
      this.world.addObstacle(FARM_AREA.x-3.5,FARM_AREA.z-2,1.2);
    }
  }
  open(tab='sheep',travel=false){this.stopTour();this.hideCard();this.tab=tab;this.panel.hidden=false;this.launch.hidden=true;this.render();if(travel)this.goHome();this.focusTarget();this.refresh();}
  close(){this.panel.hidden=true;this.launch.hidden=false;this.follow=null;this.journey=null;this.player.clearFarmFocus?.();}
  focusTarget(body={}){
    const sheep=this.sheep.find(s=>s.data.id===(body.target||this.selected));
    const plot=FARM_PLOTS.find(p=>p.id===body.target);
    const rice=body.type?.startsWith('paddy-')||(!body.type&&this.tab==='paddy');
    const point=rice?PADDY:plot||sheep?.root.position||FARM_AREA;
    this.player.focusFarmTarget?.(new THREE.Vector3(point.x,terrainHeight(point.x,point.z)+.7,point.z),rice?20:plot?8:10,this.panel.getBoundingClientRect().width);
  }
  setMessage(text,kind='info'){this.message.textContent=text;this.message.setAttribute('data-kind',kind);}
  syncActionFeedback(){
    const feedback=this.actionFeedback;
    const pending={feed:'喂草中…',pet:'摸摸中…',walk:'准备散步…',shear:'剪毛中…',water:'浇水中…',plant:'播种中…',harvest:'收获中…',craft:'制作中…',rename:'保存中…','paddy-plant':'播种中…','paddy-water':'浇水中…','paddy-harvest':'收获中…'};
    const success={feed:'✓ 已喂草',pet:'✓ 小羊很开心',walk:'✓ 正在散步',shear:'✓ 羊毛已收好',water:'✓ 已浇水',plant:'✓ 种好啦',harvest:'✓ 收获已入库',craft:'✓ 已摆进牧场',rename:'✓ 名字已保存','paddy-plant':'✓ 稻田已播种','paddy-water':'✓ 今日已浇水','paddy-harvest':'✓ 积分已到账'};
    this.panel.querySelectorAll('[data-action],.farm-name-form button').forEach(button=>{
      if(button.dataset.originalLabel===undefined){button.dataset.originalLabel=button.textContent;button.dataset.unavailable=button.disabled?'true':'false';}
      const action=button.dataset.action||'rename',target=button.dataset.target||this.selected;
      const match=feedback&&action===feedback.body.type&&target===feedback.body.target&&(!feedback.body.crop||button.dataset.crop===feedback.body.crop);
      const phase=match?feedback.phase:'';
      button.disabled=this.busy||button.dataset.unavailable==='true';
      button.classList.toggle('is-pending',phase==='pending');button.classList.toggle('is-success',phase==='success');button.classList.toggle('is-error',phase==='error');
      button.setAttribute('aria-busy',String(phase==='pending'));
      button.textContent=phase==='pending'?pending[action]||'处理中…':phase==='success'?success[action]||'✓ 完成':phase==='error'?'再试一次':button.dataset.originalLabel;
    });
  }
  goHome(){const target=this.world.nav.nearest(FARM_AREA.x,FARM_AREA.z+2,5);if(target&&this.player.goTo(target.x,target.z)){this.journey=target;this.message.textContent='团团正在去牧场，照顾按钮现在就能用。';this.player.targetDist=15;this.player.targetPitch=.72;}else this.message.textContent='直接点按钮照顾小羊，也可以点草地自由走动。';}
  goPaddy(){this.player.targetYaw=.35;this.player.targetDist=21;this.player.targetPitch=.8;const target=this.world.nav.nearest(PADDY.x,PADDY.z+PADDY.hz+1.2,5);if(target&&this.player.goTo(target.x,target.z)){this.journey={...target,paddy:true};this.message.textContent='团团正在去稻田，照顾按钮现在就能用。';}else this.message.textContent='直接点按钮照顾稻田，也可以点草地自由走动。';}
  onPanelClick(event){
    const b=event.target.closest('button');if(!b)return;
    if(b.dataset.tab){this.tab=b.dataset.tab;this.render();this.focusTarget();this.setMessage(({sheep:'点喂草或摸摸就能照顾，随时可以陪它玩。',garden:'基础种子免费，作物成熟后可以收获材料。',paddy:'每天浇水一次就好，离线也会自然生长。',craft:'材料来自剪羊毛和收菜，制作不花积分。',album:'每位朋友都有自己的名字，去小羊页陪它玩。'})[this.tab]);return;}
    if(b.dataset.sheep){this.selected=b.dataset.sheep;this.render();this.focusTarget();return;}
    if(b.hasAttribute('data-retry')){this.load();return;}
    if(b.hasAttribute('data-home')){this.tab==='paddy'?this.goPaddy():this.goHome();return;}
    if(b.hasAttribute('data-shop')){
      if(parent!==window)parent.postMessage({type:'fufu-open-farm-shop'},location.origin);else this.message.textContent='回到福福学堂的积分商店，找到“团团小牧场”。';return;
    }
    if(b.hasAttribute('data-stop-walk')){this.follow=null;this.message.textContent='小羊慢慢回到牧场，随时可以再散步。';this.render();return;}
    if(b.dataset.action)this.act({type:b.dataset.action,target:b.dataset.target||this.selected,...(b.dataset.crop?{crop:b.dataset.crop}:{})});
  }
  render(){
    if(!this.data)return;
    const {state,catalog}=this.data,now=this.now();
    this.panel.querySelector('.farm-intro').textContent=({sheep:'照顾小羊 → 收集羊毛 → 制作装饰',garden:'选种子 → 浇一次水 → 成熟后收获',paddy:'播种 → 每天浇水 → 金黄后收获',craft:'收集羊毛与作物，做一件牧场装饰',album:'认识你的每一位牧场朋友'})[this.tab];
    this.panel.querySelector('[data-home]').textContent=this.tab==='paddy'?'🚶 去稻田看看':'🚶 去牧场看看';
    this.panel.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-current',b.dataset.tab===this.tab?'page':'false'));
    let html='';
    if(this.tab==='sheep'){
      const s=state.sheep.find(s=>s.id===this.selected)||state.sheep[0];this.selected=s.id;const adult=s.careCount>=3,ready=adult&&now>=s.woolReadyAt;
      const cared=s.careDay===beijingDay(now),waitHours=Math.max(1,Math.ceil((s.woolReadyAt-now)/3600000));
      html=`${state.sheep.length>1?`<div class="farm-friends">${state.sheep.map(s=>`<button data-sheep="${escape(s.id)}" aria-pressed="${s.id===this.selected}">🐑 ${escape(s.name)}</button>`).join('')}</div>`:''}<article class="farm-sheep-card"><div class="farm-sheep-icon">${escape(catalog.breeds.find(b=>b.id===s.breed).emoji)}</div><div><h3>${escape(s.name)}</h3><p>${ready?'今天可以剪毛，收集制作材料':adult?`羊毛约 ${waitHours} 小时后长好`:`照顾 ${s.careCount}/3 天后长大，不必连续`}</p></div></article><div class="farm-actions"><button data-action="feed" class="${ready?'':'farm-primary'}">☘️ 免费喂草</button>${ready?'<button data-action="shear" class="farm-primary">✂️ 剪羊毛</button>':''}<button data-action="pet">💛 摸摸小羊</button><button data-action="walk">🚶 陪羊散步</button></div>${this.follow?'<button data-stop-walk>让小羊回牧场</button>':''}<p class="farm-note">${cared?(adult?'✓ 今天已经照顾过，随时可以继续陪它玩。':'✓ 今天已经照顾过，明天再来帮助它成长。'):'今天摸摸、喂草或散步，任选一次就算照顾。'}</p><details class="farm-help"><summary>怎么玩：照顾 → 剪毛 → 制作</summary><ol><li>先选小羊，点“免费喂草”或“摸摸小羊”，马上就能照顾。</li><li>每天第一次照顾帮助幼羊成长；长大后，羊毛长好就点“剪羊毛”。</li><li>羊毛和菜园收获用于“制作”。想添新伙伴，去积分商店扩建、兑换。</li></ol><p>离开几天也没关系，作物不会枯萎，羊毛不会消失。</p></details><form class="farm-name-form"><label for="farmSheepName">给小羊起名字</label><div><input id="farmSheepName" name="name" maxlength="12" value="${escape(s.name)}" required><button type="submit">保存</button></div></form><div class="farm-capacity">小牧场 ${state.sheep.length}/${state.capacity} 位朋友 · ${state.capacity===1?'可在商店扩建':'已经扩建好啦'}</div>`;
    }else if(this.tab==='garden'){
      html=`<p class="farm-step-guide">① 选种子　→　② 浇一次水　→　③ 成熟后收获</p><p class="farm-note">种子免费，收获用于制作。${state.tutorialHarvested?'离线也会生长，不会枯萎。':`第一次浇水后约 ${Math.max(1,Math.ceil(catalog.tutorialCropSeconds/60))} 分钟就能收获。`}</p>${state.plots.map((p,i)=>{
        const crop=catalog.crops.find(c=>c.id===p.crop),ready=p.watered&&now>=p.readyAt;
        const tools=!crop?catalog.crops.map(c=>`<button data-action="plant" data-target="${p.id}" data-crop="${c.id}">${c.emoji} 种${escape(c.name)}</button>`).join(''):!p.watered?`<button data-action="water" data-target="${p.id}" class="farm-primary">💧 浇水</button>`:ready?`<button data-action="harvest" data-target="${p.id}" class="farm-primary">🧺 收获</button>`:'';
        return `<article class="farm-plot-card"><b>${crop?crop.emoji:'🌱'} 第 ${i+1} 块地</b><p>${!crop?'空地 · 选一颗种子':!p.watered?escape(crop.name)+'种好啦，浇一点水吧':ready?escape(crop.name)+'成熟啦！':`正在长大 · 约 ${Math.max(1,Math.ceil((p.readyAt-now)/60000))} 分钟后成熟`}</p><div class="farm-actions">${tools}</div></article>`;
      }).join('')}`;
    }else if(this.tab==='paddy'){
      const p=state.paddy,stage=paddyStage(p,now),days=Math.round((p.baseDurationMs||catalog.paddy.seconds*1000)/86400000);
      const progress=paddyProgress(p,now)*100,wateredToday=p.waterDay===beijingDay(now),boostHours=(p.boostPerWaterMs||catalog.paddy.waterBoostSeconds*1000)/3600000;
      const remaining=p.readyAt?Math.max(0,p.readyAt-now):0,hours=Math.ceil(remaining/3600000),remainingDays=Math.floor(hours/24),remainingHours=hours%24;
      const action=stage===0?'paddy-plant':stage===6?'paddy-harvest':'paddy-water';
      const actionName=stage===0?'🌱 免费播种':stage===6?'🧺 收获稻谷':wateredToday?'✓ 今日已浇水':`💧 今日浇水 · 提前 ${boostHours} 小时`;
      html=`<article class="farm-plot-card farm-rice-card"><div class="farm-rice-mark">🌾</div><h3>长周期稻田</h3><p>基础 ${days} 天 · 每轮收获 ${p.readyAt?p.rewardPoints:catalog.paddy.rewardPoints} 积分</p><b>${escape(PADDY_STAGES[stage])}</b><button class="farm-primary" data-action="${action}" data-target="paddy" ${action==='paddy-water'&&wateredToday?'disabled':''}>${actionName}</button><progress class="farm-rice-progress" max="100" value="${progress}" aria-label="稻田生长进度"></progress><p>${stage===0?'下一步：先播种，稻苗就会自然生长。':stage===6?'下一步：收获金黄稻谷，领取积分。':`约剩 ${remainingDays?remainingDays+' 天 ':''}${remainingHours} 小时 · ${wateredToday?'今天已浇水，明天再来。':'今天可以浇水，让它更早成熟。'}`}</p></article><p class="farm-step-guide">① 播种　→　② 每天浇水　→　③ 金黄后收获</p><p class="farm-note">每天最多浇水一次（北京时间），每次最多提前 ${boostHours} 小时。离线自然生长，成熟不枯萎。</p><details class="farm-help"><summary>看看稻田会怎样变色</summary><ol class="farm-rice-timeline">${[['播种生长','开始'],['青绿新叶',Math.round(days*.1)+' 天'],['深绿稻株',Math.round(days/3)+' 天'],['稻穗渐黄',Math.round(days*2/3)+' 天'],['金黄收获',days+' 天']].map(([name,time],i)=>`<li class="${stage>=([1,3,4,5,6][i])?'is-grown':''}"><span>${name}</span><small>${time}</small></li>`).join('')}</ol><p>阶段天数是自然生长参考，浇水会提前成熟。</p></details><div class="farm-inventory">本轮浇水 ${p.waterCount} 次 · 已加速 ${Math.round(p.boostMs/3600000*10)/10} 小时<br>累计收获 ${p.harvests} 轮 · 获得 ${p.totalReward} 积分<br>当前积分：${this.data.points}</div>`;
    }else if(this.tab==='craft'){
      html=`<p class="farm-step-guide">剪羊毛、收菜 → 收集材料 → 制作牧场装饰</p><div class="farm-inventory">🧶 羊毛 ${state.inventory.wool}　☘️ 三叶草 ${state.inventory.clover}　🥕 胡萝卜 ${state.inventory.carrot}</div>${catalog.recipes.map(r=>{
        const owned=state.decorations.includes(r.id),can=Object.entries(r.cost).every(([k,v])=>state.inventory[k]>=v);
        return `<article class="farm-plot-card"><b>${r.emoji} ${escape(r.name)}</b><p>${Object.entries(r.cost).map(([k,v])=>`${({wool:'羊毛',clover:'三叶草',carrot:'胡萝卜'})[k]} × ${v}`).join(' + ')}</p><button data-action="craft" data-target="${r.id}" ${owned||!can?'disabled':''}>${owned?'✓ 已摆进牧场':can?'动手制作':'慢慢收集材料'}</button></article>`;
      }).join('')}<p class="farm-note">产物用来制作小物件，不花积分。毛毛一次积攒一份，收下后再慢慢长。</p>`;
    }else{
      html=`<p class="farm-note">每一位朋友，都有自己的名字和故事。</p>${state.sheep.map(s=>`<article class="farm-plot-card"><b>🐑 ${escape(s.name)}</b><p>${escape(catalog.breeds.find(b=>b.id===s.breed).name)} · ${s.careCount>=3?'已经长大':'正在成长'}</p></article>`).join('')}<div class="farm-inventory">已经布置 ${state.decorations.length} 件作品与装饰</div><details class="farm-source"><summary>小羊的创作来源</summary><p>造型改写自 <a href="https://github.com/songkeys/little-flock" target="_blank" rel="noreferrer">Little Flock</a>，MIT 许可。已改为团团的单人小牧场。</p></details>`;
    }
    // Keep controls and scroll position stable during periodic time updates.
    const key=html;
    if(key!==this.renderedContent){
      const sameTab=this.renderedTab===this.tab,scroll=sameTab?this.content.scrollTop:0,helpOpen=sameTab&&this.content.querySelector('.farm-help')?.open;
      this.content.innerHTML=html;
      if(helpOpen&&this.content.querySelector('.farm-help'))this.content.querySelector('.farm-help').open=true;
      this.content.scrollTop=scroll;this.renderedContent=key;this.renderedTab=this.tab;
    }
    this.syncActionFeedback();
    this.content.setAttribute('aria-busy',String(this.busy));
  }
  async act(body){
    if(this.busy)return;
    this.journey=null;
    await this.send(body);
  }
  async send(body){
    this.busy=true;this.actionFeedback={body:{...body},phase:'pending'};this.setMessage('正在照顾，请稍等…','pending');this.render();this.focusTarget(body);
    try{
      const data=await this.api('/api/farm/actions',{...body,requestId:farmRequestId()});this.accept(data);this.actionFeedback.phase='success';this.actionFeedback.until=performance.now()+6000;this.setMessage('✓ '+data.message,'success');this.focusTarget(body);
      if(body.type==='paddy-harvest'&&parent!==window)parent.postMessage({type:'fufu-farm-points'},location.origin);
      if(body.type.startsWith('paddy-')&&Math.hypot(this.player.pos.x-PADDY.x,this.player.pos.z-PADDY.z)<12)this.player.playFarmGesture(body.type,new THREE.Vector3(PADDY.x,0,PADDY.z));
      const s=this.sheep.find(s=>s.data.id===body.target);
      if(s&&['pet','feed','walk','shear'].includes(body.type)){s.reaction=1;if(body.type==='feed')s.eating=3;if(body.type==='walk'){if(Math.hypot(this.player.pos.x-FARM_AREA.x,this.player.pos.z-FARM_AREA.z)>9)this.goHome();this.follow={id:s.data.id,until:performance.now()+45000};}this.effects.hearts(s.root.position);if(Math.hypot(this.player.pos.x-s.root.position.x,this.player.pos.z-s.root.position.z)<3)this.player.playFarmGesture(body.type,s.root.position);}
      if(body.type==='water'||body.type==='paddy-water'){
        const point=body.type==='paddy-water'?PADDY:FARM_PLOTS.find(p=>p.id===body.target);
        if(point)this.effects.farmWater?.(new THREE.Vector3(point.x,terrainHeight(point.x,point.z)+.25,point.z),body.type==='paddy-water'?4:1);
      }
      if(body.type==='harvest'||body.type==='paddy-harvest'||body.type==='craft'||body.type==='shear')this.effects.sparkle(s?.root.position||this.player.group.position,body.type==='shear'?0xfff6e0:0xffdc8f,18,1);
    }catch(error){this.actionFeedback.phase='error';this.actionFeedback.until=performance.now()+6000;this.setMessage(error.message,'error');}finally{this.busy=false;this.render();}
  }
  pick(ray,event,camera,canvas){
    const hits=ray.intersectObject(this.root,true);const hit=hits.find(h=>h.object.userData.farm);
    let target=hit?.object.userData.farm;
    if(!target&&event&&camera&&canvas){
      const rect=canvas.getBoundingClientRect(),radius=event.pointerType==='touch'?36:20;let best=radius*radius;
      for(const tag of this.pickTargets){
        tag.getWorldPosition(this.projected).project(camera);
        if(this.projected.z < -1 || this.projected.z > 1)continue;
        const x=rect.left+(this.projected.x+1)*rect.width/2,y=rect.top+(1-this.projected.y)*rect.height/2;
        const distance=(x-event.clientX)**2+(y-event.clientY)**2;
        if(distance<best){best=distance;target=tag.userData.farm;}
      }
    }
    if(!target)return false;if(target.type==='sheep')this.selected=target.id;
    this.open(target.type==='paddy'?'paddy':target.type==='plot'?'garden':'sheep');return true;
  }
  update(dt,t){
    if(!this.visible||!this.data)return;
    if(this.actionFeedback?.until&&performance.now()>this.actionFeedback.until){this.actionFeedback=null;this.syncActionFeedback();}
    if(this.journey&&Math.hypot(this.player.pos.x-this.journey.x,this.player.pos.z-this.journey.z)<1.2){const paddy=this.journey.paddy;this.journey=null;this.player.targetYaw=.35;this.player.targetPitch=paddy?.8:.72;this.player.targetDist=paddy?21:15;this.message.textContent=paddy?'到稻田啦，播种、浇水，让它慢慢长大。':'到小牧场啦，看看棉花糖今天有什么小惊喜。';}
    if(this.follow&&performance.now()>this.follow.until){this.follow=null;this.render();}
    for(const s of this.sheep){
      const follow=this.follow?.id===s.data.id&&Math.hypot(this.player.pos.x-FARM_AREA.x,this.player.pos.z-FARM_AREA.z)<9,tx=follow?this.player.pos.x+Math.sin(s.index+1)*1.3:s.home.x+Math.sin(t*.37+s.index*2)*1.2,tz=follow?this.player.pos.z+1.3:s.home.z+Math.cos(t*.29+s.index)*.7;
      const x=THREE.MathUtils.clamp(tx,FARM_AREA.x-2.4,FARM_AREA.x+3),z=THREE.MathUtils.clamp(tz,FARM_AREA.z-1.1,FARM_AREA.z+2.4),dx=x-s.root.position.x,dz=z-s.root.position.z,moving=Math.hypot(dx,dz)>.1;
      s.root.position.x+=dx*Math.min(1,dt*1.2);s.root.position.z+=dz*Math.min(1,dt*1.2);s.root.position.y=terrainHeight(s.root.position.x,s.root.position.z)+.11;
      if(moving){const desired=Math.atan2(dx,dz),delta=Math.atan2(Math.sin(desired-s.root.rotation.y),Math.cos(desired-s.root.rotation.y));s.root.rotation.y+=delta*Math.min(1,dt*3);}
      const size=s.data.careCount>=3?.92:.58+s.data.careCount*.1;s.root.scale.setScalar(size);
      const gait=moving?Math.sin(t*7+s.index)*.22:0;s.legs.forEach((leg,i)=>leg.rotation.x=gait*(i%2?1:-1));
      s.reaction=Math.max(0,s.reaction-dt*.45);s.eating=Math.max(0,s.eating-dt);s.head.rotation.x=s.eating>.1?.65+Math.sin(t*10)*.1:Math.sin(t*1.5)*.07;s.head.rotation.z=Math.sin(t*9)*s.reaction*.2;
      s.root.position.y+=Math.max(0,Math.sin(t*8))*s.reaction*.12;
      if(s.feed){s.feed.visible=s.eating>.1;s.feed.scale.setScalar(Math.max(.15,s.eating/3));}
      const wool=this.now()>=s.data.woolReadyAt?1:.72;s.body.scale.setScalar(wool);s.body.position.y=Math.abs(gait)*.08;
    }
    const vane=this.root.getObjectByName('farm-windvane');if(vane)vane.rotation.y=Math.sin(t*.7)*.5;
    const riceStage=paddyStage(this.data.state.paddy,this.now());if(riceStage!==this.riceStage){this.riceStage=riceStage;this.world.setPaddyStage(riceStage);this.render();}
    const riceDay=beijingDay(this.now());if(this.riceDay&&riceDay!==this.riceDay)this.render();this.riceDay=riceDay;
    for(const p of this.plots)if(p.data.watered&&this.now()>=p.data.readyAt&&p.stage!==2){this.rebuild();this.render();break;}
    if(!this.panel.hidden&&t-this.lastRefresh>10&&!this.panel.querySelector('input:focus,textarea:focus')){this.lastRefresh=t;this.render();}
  }
}
