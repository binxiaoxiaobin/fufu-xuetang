const rand=(a,b)=>a+Math.random()*(b-a),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function createGame({bridge}){
 const old=bridge.get('thunderfall-adapt.save.v1',{best:0});let best=old.best||0,shipType='falcon',spec,ship,shots,foes,enemyShots,pickups,stars,score,sector,elapsed,spawn,life,bombs,burst,boss,dead,won,fire,slow=false;
 const fighters={falcon:{speed:1,life:3,power:1,color:'#76e7e0',label:'鹰隼'},prism:{speed:.92,life:2,power:1.5,color:'#e3a0ff',label:'棱镜'},bastion:{speed:.78,life:4,power:.9,color:'#ffd36e',label:'堡垒'}};
 document.querySelectorAll('[data-fighter]').forEach(b=>b.onclick=()=>{shipType=b.dataset.fighter;document.querySelectorAll('[data-fighter]').forEach(x=>x.classList.toggle('active',x===b));});
 function reset(){spec=fighters[shipType];ship={x:.5,y:.82,ifr:1};shots=[];foes=[];enemyShots=[];pickups=[];stars=Array.from({length:70},()=>({x:rand(0,1),y:rand(0,1),v:rand(.06,.28)}));score=0;sector=1;elapsed=0;spawn=.5;life=spec.life;bombs=2;burst=12;boss=null;dead=false;won=false;fire=0;}
 function bomb(){if(bombs<=0||dead||won)return;bombs--;enemyShots=[];foes.forEach(f=>f.hp-=4);if(boss)boss.hp-=30;}
 function burstAttack(){if(burst<12||dead||won)return;burst=0;enemyShots=[];foes.forEach(f=>f.hp-=8);if(boss)boss.hp-=48;}
 reset();
 return{
  restart:reset,
  key(k,down){if(!down)return;if(k===' '||k==='Spacebar')bomb();if(k.toLowerCase()==='e')burstAttack();if(k==='Shift')slow=true;},
  pointer(x,y,down){if(down){const r=document.querySelector('#game').getBoundingClientRect();ship.x=clamp(x/r.width,.04,.96);ship.y=clamp(y/r.height,.42,.92);}},
  action(action,down){if(!down)return;if(action==='bomb')bomb();if(action==='burst')burstAttack();},
  update(dt,input){if(dead||won)return;elapsed+=dt;burst=Math.min(12,burst+dt);slow=input.keys.has('Shift');let dx=(input.keys.has('ArrowRight')||input.keys.has('d')||input.holds.has('right')?1:0)-(input.keys.has('ArrowLeft')||input.keys.has('a')||input.holds.has('left')?1:0);let dy=(input.keys.has('ArrowDown')||input.keys.has('s')?1:0)-(input.keys.has('ArrowUp')||input.keys.has('w')?1:0);const m=Math.hypot(dx,dy)||1;ship.x=clamp(ship.x+dx/m*.48*spec.speed*(slow?.55:1)*dt,.035,.965);ship.y=clamp(ship.y+dy/m*.45*spec.speed*(slow?.55:1)*dt,.42,.93);
    fire-=dt;if(fire<=0){const n=spec.power>1.2?3:2;for(let i=0;i<n;i++)shots.push({x:ship.x+(i-(n-1)/2)*.018,y:ship.y-.02,v:.95,p:spec.power});fire=.17/spec.power;}
    spawn-=dt;if(spawn<=0&&!boss&&sector<=5){foes.push({x:rand(.09,.91),y:-.05,hp:1+Math.floor(sector/3),t:0,fire:rand(1,2.5),kind:Math.random()<.25?1:0});spawn=Math.max(.55,1.65-sector*.15);}
    for(const s of shots)s.y-=s.v*dt;shots=shots.filter(s=>s.y>-.04);for(const f of foes){f.t+=dt;f.y+=.12*dt;f.x+=Math.sin(f.t*2.5)*.12*dt;f.fire-=dt;if(f.fire<=0){enemyShots.push({x:f.x,y:f.y+.025,v:.25+sector*.018});f.fire=rand(1.2,2.3);}}
    if(sectorTime()>=26&&!boss&&sector<=5){boss={x:.5,y:-.08,hp:65+sector*20,max:65+sector*20,t:0,dir:1};}
    if(boss){boss.t+=dt;boss.y=Math.min(.2,boss.y+.07*dt);boss.x+=Math.sin(boss.t)*.16*dt; if(Math.floor(boss.t*2)!==Math.floor((boss.t-dt)*2))for(let j=-2;j<=2;j++)enemyShots.push({x:boss.x,y:boss.y+.06,v:.3,dx:j*.1});}
    for(const s of enemyShots){s.y+=s.v*dt;s.x+=(s.dx||0)*dt;}for(const s of shots){for(const f of foes)if(f.hp>0&&Math.hypot(f.x-s.x,f.y-s.y)<.04){f.hp-=s.p;s.y=-1;if(f.hp<=0)score+=25;}}
    if(boss)for(const s of shots)if(Math.hypot(boss.x-s.x,boss.y-s.y)<.09){boss.hp-=s.p;s.y=-1;}if(boss&&boss.hp<=0){boss=null;score+=240;sector++;elapsed=0;spawn=2;if(sector>5)won=true;}
    foes=foes.filter(f=>f.hp>0&&f.y<1.1);for(const s of enemyShots)if(Math.hypot(s.x-ship.x,s.y-ship.y)<.025&&ship.ifr<=0){life--;ship.ifr=1.3;if(life<=0)dead=true;}enemyShots=enemyShots.filter(s=>s.y<1.1&&s.x>-.1&&s.x<1.1);ship.ifr-=dt;
    if(Math.random()<dt*.02)pickups.push({x:rand(.1,.9),y:-.04,id:['P','L','A','N'][Math.floor(Math.random()*4)]});for(const p of pickups){p.y+=.1*dt;if(Math.hypot(p.x-ship.x,p.y-ship.y)<.05){score+=40;if(p.id==='N')bombs=Math.min(4,bombs+1);p.y=2;}}pickups=pickups.filter(p=>p.y<1.1);for(const st of stars){st.y+=st.v*dt;if(st.y>1){st.y=0;st.x=rand(0,1);}}if(score>best){best=score;bridge.set('thunderfall-adapt.save.v1',{best,sector:Math.min(5,sector)});}
  },
  draw(c,w,h){const bg=c.createLinearGradient(0,0,0,h);bg.addColorStop(0,['#151f48','#301844','#243650','#163541','#302342'][Math.min(4,sector-1)]);bg.addColorStop(1,'#090f20');c.fillStyle=bg;c.fillRect(0,0,w,h);c.fillStyle='#e6efff';for(const s of stars){c.globalAlpha=.4+s.v;c.fillRect(s.x*w,s.y*h,2,3);}c.globalAlpha=1;
    for(const s of shots){c.fillStyle='#9af7ef';c.shadowColor='#60fff4';c.shadowBlur=12;c.fillRect(s.x*w-2,s.y*h-10,4,15);}c.shadowBlur=0;
    for(const f of foes){c.save();c.translate(f.x*w,f.y*h);c.fillStyle=f.kind?'#ec739e':'#ffae64';c.beginPath();c.moveTo(0,16);c.lineTo(-17,1);c.lineTo(-10,-13);c.lineTo(10,-13);c.lineTo(17,1);c.fill();c.restore();}
    if(boss){c.save();c.translate(boss.x*w,boss.y*h);c.fillStyle='#dc567c';c.shadowColor='#e64d87';c.shadowBlur=22;c.beginPath();c.moveTo(0,40);c.lineTo(-66,10);c.lineTo(-76,-22);c.lineTo(-30,-18);c.lineTo(0,-43);c.lineTo(30,-18);c.lineTo(76,-22);c.lineTo(66,10);c.fill();c.restore();c.fillStyle='#68415a';c.fillRect(w*.24,17,w*.52,9);c.fillStyle='#fa8295';c.fillRect(w*.24,17,w*.52*Math.max(0,boss.hp/boss.max),9);}
    for(const s of enemyShots){c.fillStyle='#ff7d9a';c.shadowColor='#fa617d';c.shadowBlur=8;c.beginPath();c.arc(s.x*w,s.y*h,5,0,7);c.fill();}c.shadowBlur=0;for(const p of pickups){c.fillStyle=({P:'#5caee8',L:'#64d29a',A:'#bf8de8',N:'#eac95a'})[p.id];c.beginPath();c.roundRect(p.x*w-13,p.y*h-13,26,26,7);c.fill();c.fillStyle='#182438';c.font='bold 14px system-ui';c.textAlign='center';c.fillText(p.id,p.x*w,p.y*h+5);}c.textAlign='left';
    if(ship.ifr<=0||Math.floor(ship.ifr*12)%2===0){c.save();c.translate(ship.x*w,ship.y*h);c.fillStyle=spec.color;c.shadowColor=spec.color;c.shadowBlur=17;c.beginPath();c.moveTo(0,-20);c.lineTo(15,15);c.lineTo(0,9);c.lineTo(-15,15);c.fill();c.restore();}c.shadowBlur=0;
    c.fillStyle='#0a172bdc';c.beginPath();c.roundRect(13,13,176,59,13);c.fill();c.fillStyle='#f4f5ff';c.font='bold 14px system-ui';c.fillText(`战区 ${Math.min(5,sector)} / 5`,24,35);c.font='12px system-ui';c.fillStyle='#c3d3e9';c.fillText(`得分 ${score} · 最佳 ${best}`,24,55);c.textAlign='right';c.fillStyle='#f1d274';c.fillText(`装甲 ${'◆'.repeat(Math.max(0,life))}　脉冲 ${bombs}`,w-16,30);c.fillStyle='#a6deef';c.fillText(burst>=12?'E 雷霆爆发':`爆发充能 ${Math.floor(burst/12*100)}%`,w-16,50);c.textAlign='left';if(burst>=12){c.strokeStyle='#9ef8f499';c.lineWidth=4;c.beginPath();c.arc(ship.x*w,ship.y*h,32+Math.sin(performance.now()*.01)*5,0,7);c.stroke();}},
  result(){return won?['远征完成','五个战区的首领全部击退，天穹航线重新开放。']:dead?['战机需要维修','能量耗尽了，选一架战机重新出发。']:null;}
 };
 function sectorTime(){return elapsed;}
}
