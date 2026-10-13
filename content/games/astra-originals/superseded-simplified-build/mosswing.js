const rand=(a,b)=>a+Math.random()*(b-a),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function createGame({bridge}){
 let y,vy,gates,score,best=bridge.get('mosswing-adapt.save.v1',{best:0}).best||0,dead=false,flap=false,time=0;
 function reset(){y=.48;vy=0;score=0;dead=false;time=0;flap=false;gates=[{x:1.15,c:.5,g:.38}];}
 function flapUp(){if(!dead){vy=-.62;flap=true;}}
 reset();
 return{
  restart:reset,
  start:flapUp,
  key(k,down){if(down&&(k===' '||k==='ArrowUp'||k.toLowerCase()==='w'))flapUp();},
  pointer(x,y,down){if(down)flapUp();},
  action(name,down){if(name==='flap'&&down)flapUp();},
  update(dt){if(dead)return;time+=dt;const speed=.34+Math.min(.17,score*.004);vy+=1.18*dt;y+=vy*dt;flap=Math.max(0,flap-dt);for(const g of gates)g.x-=speed*dt;
    for(const g of gates)if(!g.passed&&g.x<.29){g.passed=true;score++;if(score>best){best=score;bridge.set('mosswing-adapt.save.v1',{best});}}
    gates=gates.filter(g=>g.x>-.15);if(gates.length<3){const last=gates.at(-1);gates.push({x:(last?.x??1)+rand(.48,.62),c:rand(.28,.7),g:Math.max(.27,.39-score*.002)});}
    if(y<.04||y>.96||gates.some(g=>Math.abs(g.x-.29)<.055&&(y<g.c-g.g/2||y>g.c+g.g/2)))dead=true;
  },
  draw(c,w,h){const bg=c.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#172b4c');bg.addColorStop(.55,'#527783');bg.addColorStop(1,'#e4b778');c.fillStyle=bg;c.fillRect(0,0,w,h);
    c.globalAlpha=.7;for(let i=0;i<36;i++){const x=(i*173+time*22)%(w+20),y0=(i*79+Math.sin(time+i)*18)%(h*.62);c.fillStyle=i%3?'#e7edca':'#fff';c.beginPath();c.arc(w-x,y0,1+(i%3),0,Math.PI*2);c.fill();}c.globalAlpha=1;
    for(let i=0;i<3;i++){const yy=h*(.59+i*.12);c.fillStyle=['#456771','#315362','#203d4b'][i];c.beginPath();c.moveTo(0,yy+40);for(let x=0;x<=w+20;x+=25)c.lineTo(x,yy+Math.sin(x*.012+i*2+time*.2)*22+i*8);c.lineTo(w,h);c.lineTo(0,h);c.fill();}
    for(const g of gates){let x=g.x*w,cy=g.c*h,gap=g.g*h,top=cy-gap/2,bot=cy+gap/2;c.fillStyle='#355e57';c.fillRect(x-26,0,52,top);c.fillRect(x-26,bot,52,h-bot);c.fillStyle='#8eb58d';c.fillRect(x-34,top-8,68,17);c.fillRect(x-34,bot-8,68,17);c.fillStyle='#c5dca8';c.fillRect(x-17,4,7,Math.max(0,top-17));c.fillRect(x-17,bot+17,7,Math.max(0,h-bot-21));}
    let px=w*.29,py=y*h;c.save();c.translate(px,py);c.rotate(clamp(vy,-.5,.6));c.fillStyle='#17343c';c.beginPath();c.ellipse(-2,4,22,17,0,0,7);c.fill();c.fillStyle='#83c7a6';c.beginPath();c.ellipse(0,0,20,15,0,0,7);c.fill();c.fillStyle='#f5d386';c.beginPath();c.ellipse(-6,4,9,9,-.4,0,7);c.fill();c.fillStyle='#142a37';c.beginPath();c.arc(8,-5,3,0,7);c.fill();c.fillStyle='#f0a16c';c.beginPath();c.moveTo(18,0);c.lineTo(30,4);c.lineTo(18,8);c.fill();if(flap>0){c.fillStyle='#e6c479';c.beginPath();c.ellipse(-5,10,10,4,-.4,0,7);c.fill();}c.restore();
    c.fillStyle='#0d2135d9';c.beginPath();c.roundRect(14,14,145,54,14);c.fill();c.fillStyle='#fff';c.font='bold 23px system-ui';c.fillText(`月露 ${score}`,25,42);c.fillStyle='#c9ded6';c.font='12px system-ui';c.fillText(`最佳 ${best}`,28,58);c.fillStyle='#fff';c.font='600 13px system-ui';c.textAlign='center';c.fillText('轻点振翅 · 穿过浮石门',w/2,h-16);c.textAlign='left';},
  result(){return dead?['小旅人需要休息','撞上浮石门了，慢一点振翅，再试试新的飞行节奏。']:null;}
 };
}
