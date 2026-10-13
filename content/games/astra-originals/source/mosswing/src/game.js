'use strict';

class FlightModel {
  constructor(random = Math.random) { this.random = random; this.limit=5.5; this.reset(-3); }
  reset(x) {
    this.x=x; this.y=0; this.vy=0; this.score=0; this.alive=true; this.distance=0;
    this.gates=Array.from({length:6},(_,i)=>({x:x+5.9+i*4.45,center:i===0?.1:this.nextCenter(),passed:false}));
  }
  nextCenter() { return (this.random()-.5)*2.8; }
  flap() { if(this.alive)this.vy=6.05; }
  step(dt) {
    if(!this.alive)return {hit:false,passed:0};
    const speed=2.65+Math.min(this.score,35)*.012;
    this.vy=Math.max(-10,this.vy-18.5*dt); this.y+=this.vy*dt; this.distance+=speed*dt;
    let hit=this.y-.27<-this.limit||this.y+.27>this.limit,passed=0;
    for(const g of this.gates){
      g.x-=speed*dt;
      if(Math.abs(g.x-this.x)<.83){
        const dx=Math.max(Math.abs(g.x-this.x)-.56,0);
        const half=1.52;
        const dy=Math.max(0,half-Math.abs(this.y-g.center));
        if(dx*dx+dy*dy<.27*.27)hit=true;
      }
      if(this.y<-4.29&&this.y>-6.59){
        const width=.22+.78*Math.min(1,Math.max(0,(this.y+6.32)/1.76));
        const dx=Math.max(Math.abs(g.x-this.x)-width,0),dy=Math.max(this.y+4.56,-6.32-this.y,0);
        if(dx*dx+dy*dy<.27*.27)hit=true;
      }
    }
    if(!hit)for(const g of this.gates){if(!g.passed&&g.x+.56<this.x-.27){g.passed=true;this.score++;passed++;}}
    for(const g of this.gates)if(g.x<this.x-7){g.x=Math.max(...this.gates.map(p=>p.x))+4.45;g.center=this.nextCenter();g.passed=false;}
    this.alive=!hit; return {hit,passed};
  }
}

(()=>{
const $=id=>document.getElementById(id),canvas=$('game');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let renderer;
try {renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});} catch { $('error').style.display='grid';$('reload').onclick=()=>location.reload();return; }
renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.04;
const scene=new THREE.Scene();scene.fog=new THREE.Fog(0xf1d7b5,33,85);
const camera=new THREE.OrthographicCamera(-8,8,5.5,-5.5,.1,160);
camera.position.set(0,4.2,30);camera.lookAt(0,0,0);
scene.add(new THREE.HemisphereLight(0xfff5e9,0x658c83,1.65));
const sunlight=new THREE.DirectionalLight(0xffebd8,2.2);sunlight.position.set(-6,10,12);scene.add(sunlight);
const rim=new THREE.DirectionalLight(0xf3fff0,.9);rim.position.set(2,5,-6);scene.add(rim);
let seed=87;
const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const range=(a,b)=>a+rand()*(b-a);
const materials={};
function mat(color,flat=true){const key=color+':'+flat;return materials[key]??=new THREE.MeshStandardMaterial({color,roughness:.95,flatShading:flat});}
const sphere=new THREE.IcosahedronGeometry(1,1),smooth=new THREE.SphereGeometry(1,20,14),stemGeo=new THREE.CylinderGeometry(.65,1,1,5);
function mesh(geo,color,parent,x=0,y=0,z=0,sx=1,sy=sx,sz=sx){const m=new THREE.Mesh(geo,typeof color==='number'?mat(color):color);m.position.set(x,y,z);m.scale.set(sx,sy,sz);parent.add(m);return m;}
function pebble(parent,x,y,z,s,color){const m=mesh(sphere,color,parent,x,y,z,s,s*range(.6,1),s*range(.7,1.1));m.rotation.set(rand(),rand()*6,rand());return m;}
function segment(parent,a,b,r,color){const d=new THREE.Vector3().subVectors(b,a);const m=mesh(stemGeo,color,parent,0,0,0,r,d.length(),r);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return m;}
function leafGeometry(){
  const geo=new THREE.BufferGeometry(),p=[],c=[];
  const pts=[[0,0,0],[-.26,.35,.025],[-.3,.77,0],[0,1.25,0],[.28,.77,0],[.22,.35,.025],[0,.5,.12],[0,.91,.07]];
  const faces=[[0,1,6],[1,2,6],[2,7,6],[2,3,7],[0,6,5],[5,6,4],[4,6,7],[4,7,3]];
  faces.forEach((f,i)=>{const color=new THREE.Color(i<4?0x829b53:0xa7b46c);f.forEach(j=>{p.push(...pts[j]);c.push(color.r,color.g,color.b);});});
  geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(c,3));geo.computeVertexNormals();return geo;
}
const leafGeo=leafGeometry(),leafMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.83,side:THREE.DoubleSide,flatShading:true});
function leaf(parent,x,y,z,scale,angle){const m=mesh(leafGeo,leafMat,parent,x,y,z,scale);m.rotation.z=angle;return m;}

// Static scenery is batched by geometry and material to keep mobile draw calls low.
function batch(group){
  const buckets=new Map();group.updateMatrixWorld(true);const inv=group.matrixWorld.clone().invert();
  group.traverse(o=>{if(!o.isMesh)return;const key=o.geometry.uuid+o.material.uuid;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push({o,m:inv.clone().multiply(o.matrixWorld)});});
  group.clear();for(const list of buckets.values()){const b=new THREE.InstancedMesh(list[0].o.geometry,list[0].o.material,list.length);list.forEach(({m},i)=>b.setMatrixAt(i,m));b.instanceMatrix.needsUpdate=true;group.add(b);}
}
const flowerGeo=new THREE.SphereGeometry(1,5,4);
function flowers(parent,x,y,z,s=1){
  for(let j=0;j<3;j++){const px=x+range(-.18,.18)*s,pz=z+range(-.16,.16)*s,py=y+range(.015,.08)*s;
    for(let i=0;i<5;i++){const a=i*Math.PI*2/5;mesh(flowerGeo,0xffedbc,parent,px+Math.cos(a)*.075*s,py,pz+Math.sin(a)*.075*s,.063*s,.024*s,.045*s);}
    mesh(flowerGeo,0xd8aa50,parent,px,py+.025*s,pz,.027*s);
  }
}
function sprout(parent,x,y,z,s=1){
  segment(parent,new THREE.Vector3(x,y,z),new THREE.Vector3(x+.09*s,y+.7*s,z),.014*s,0x647e43);
  for(let i=0;i<4;i++)leaf(parent,x+i*.02*s,y+(.08+i*.14)*s,z,.22*s,i%2?-.8:.9);
}
function tree(parent,x,y,z,s=1){
  segment(parent,new THREE.Vector3(x,y,z),new THREE.Vector3(x+.12*s,y+1.65*s,z),.09*s,0x6b7050);
  const crowns=[[-.48,1.15,.1,.58],[.32,1.57,0,.62],[.05,2.02,-.04,.54]];
  for(const [a,b,c,r]of crowns){segment(parent,new THREE.Vector3(x+.05*s,y+.58*s,z),new THREE.Vector3(x+a*s,y+b*s,z+c*s),.045*s,0x6b7050);pebble(parent,x+a*s,y+b*s,z+c*s,r*s,[0x849762,0x9ca776,0x758d66][Math.floor(rand()*3)]);}
}
function island(s=1,detail=true){
  const g=new THREE.Group();
  mesh(new THREE.CylinderGeometry(1.15,.25,1.9,7,2),0x6e8d7e,g,0,-.85*s,0,s,s,s*.8);
  mesh(new THREE.CylinderGeometry(1.18,1.06,.15,7),0x8eaa7a,g,0,.09*s,0,s,s,s*.8);
  for(let i=0;i<7;i++){const a=i/7*Math.PI*2;pebble(g,Math.cos(a)*.83*s,-.25*s,Math.sin(a)*.58*s,range(.25,.43)*s,[0x769384,0x9aa780,0x617f72][i%3]);}
  if(detail){for(let i=0;i<5;i++)pebble(g,range(-.8,.8)*s,.16*s,range(-.6,.6)*s,.23*s,0x98a461);flowers(g,-.45*s,.2*s,.43*s,s);sprout(g,.65*s,.13*s,.06*s,.8*s);tree(g,-.25*s,.17*s,-.25*s,.7*s);}
  return g;
}
const scenery=[];
for(let layer=0;layer<3;layer++){
  for(let i=0;i<8;i++){
    const z=-9-layer*12,g=island(range(.65,1.8),layer<2);g.position.set(-22+i*6.4+range(-1,1),range(-6.8,-4.4)+z*.14,z);
    if(layer===2)tree(g,0,.15,0,range(.8,1.9));batch(g);scene.add(g);scenery.push({g,rate:.12+(.18*(2-layer)),origin:g.position.y,phase:rand()*6});
  }
}
const homeIsland=island(1.85,true);homeIsland.position.set(-8,-2.8,-1.4);batch(homeIsland);scene.add(homeIsland);
const sun=mesh(new THREE.SphereGeometry(1,32,16),new THREE.MeshBasicMaterial({color:0xfff5d1,fog:false,toneMapped:false}),scene,7,3.4,-42,.57);
const haloMat=new THREE.MeshBasicMaterial({color:0xffefd1,transparent:true,opacity:.1,depthWrite:false,fog:false,toneMapped:false});
const halo=mesh(new THREE.SphereGeometry(1,24,12),haloMat,scene,7,3.4,-42,.8);

function columnGeometry(){
 const p=[],c=[],n=7,rings=[0,.025,.28,.56,.83,.975,1],rad=[.83,1,.97,1,.96,1,.83];
 for(let j=0;j<rings.length-1;j++)for(let i=0;i<n;i++){
   const v=(r,k)=>{const a=k/n*Math.PI*2+.18;return [Math.cos(a)*.57*rad[r],rings[r],Math.sin(a)*.48*rad[r]];};
   const a=v(j,i),b=v(j,i+1),d=v(j+1,i),e=v(j+1,i+1);
   for(const face of [[a,b,d],[b,e,d]]){const col=new THREE.Color(0x719389).multiplyScalar(range(.83,1.17));for(const vtx of face){p.push(...vtx);c.push(col.r,col.g,col.b);}}
 }
 for(const r of [0,rings.length-1])for(let i=0;i<n;i++){const a=i/n*Math.PI*2+.18,b=(i+1)/n*Math.PI*2+.18;const col=new THREE.Color(0x91a879);for(const v of [[0,rings[r],0],[Math.cos(a)*.57*rad[r],rings[r],Math.sin(a)*.48*rad[r]],[Math.cos(b)*.57*rad[r],rings[r],Math.sin(b)*.48*rad[r]]]){p.push(...v);c.push(col.r,col.g,col.b);}}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(c,3));geo.computeVertexNormals();return geo;
}
const colGeo=columnGeometry(),colMat=new THREE.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1,side:THREE.DoubleSide});
function cap(){
 const g=new THREE.Group();mesh(new THREE.CylinderGeometry(.54,.54,.06,7),0x8c9e66,g,0,-.016,0,1,1,.82);
 for(let i=0;i<6;i++)pebble(g,range(-.39,.39),0,range(-.29,.29),range(.07,.13),0x9baa6c);
 flowers(g,.17,.055,.09,.64);leaf(g,-.4,-.17,.35,.25,.65);leaf(g,-.43,-.35,.29,.2,.4);batch(g);return g;
}
const gateMeshes=[];
for(let i=0;i<6;i++){
 const root=new THREE.Group(),lower=mesh(colGeo,colMat,root),upper=mesh(colGeo,colMat,root),lowCap=cap(),upCap=cap();root.add(lowCap,upCap);upCap.rotation.z=Math.PI;
 const base=island(.85,false);base.position.y=-4.7;batch(base);root.add(base);scene.add(root);gateMeshes.push({root,lower,upper,lowCap,upCap});
}
function poseGate(g,x,center){
 const bottom=center-1.52,top=center+1.52;
 g.root.position.x=x;g.lower.position.y=-6.7;g.lower.scale.y=bottom+6.7;g.upper.position.y=top;g.upper.scale.y=7.8-top;
 g.lowCap.position.y=bottom;g.upCap.position.y=top;
}

const creature=new THREE.Group(),bodyPivot=new THREE.Group();creature.add(bodyPivot);scene.add(creature);
const peach=mat(0xe88d42,false),ivory=mat(0xffe4a8,false),ink=mat(0x243e34,false);
mesh(smooth,peach,bodyPivot,0,0,0,.39,.35,.29);
mesh(smooth,ivory,bodyPivot,.205,.025,.205,.25,.255,.125);
mesh(smooth,ink,bodyPivot,.19,.075,.319,.031,.052,.019);
mesh(smooth,ink,bodyPivot,.345,.07,.284,.029,.05,.019);
mesh(smooth,0xfff7dc,bodyPivot,.187,.093,.334,.009);
mesh(smooth,0xfff7dc,bodyPivot,.342,.088,.3,.008);
mesh(smooth,0xd79160,bodyPivot,.17,-.04,.33,.045,.018,.008);
mesh(smooth,0xd79160,bodyPivot,.36,-.037,.283,.031,.016,.008);
const wingBack=new THREE.Group(),wingFront=new THREE.Group();bodyPivot.add(wingBack,wingFront);wingBack.position.set(-.13,.07,-.16);wingFront.position.set(-.15,.08,.17);
leaf(wingBack,0,0,0,.73,.64);leaf(wingFront,0,0,0,.88,.99);
segment(wingFront,new THREE.Vector3(0,0,.025),new THREE.Vector3(-.75,.5,.06),.007,0xc4c889);
for(let i=0;i<3;i++){const m=mesh(smooth,peach,bodyPivot,-.37-i*.025,-.09-i*.05,-.08+i*.08,.2,.039,.055);m.rotation.z=.6+i*.15;}
for(let i=0;i<2;i++){
 const x=.02+i*.18,z=i===0?.04:-.06;
 segment(bodyPivot,new THREE.Vector3(x,.3,z),new THREE.Vector3(x-.07,.67,z),.013,0x7d8246);
 leaf(bodyPivot,x-.07,.61,z,.2,i===0?.85:-.5);
}
const particleCount=80,particleData=[],particlePositions=new Float32Array(particleCount*3),particleColors=new Float32Array(particleCount*3);
const particleGeo=new THREE.BufferGeometry();particleGeo.setAttribute('position',new THREE.BufferAttribute(particlePositions,3));particleGeo.setAttribute('color',new THREE.BufferAttribute(particleColors,3));
const particleMat=new THREE.PointsMaterial({size:.065,vertexColors:true,transparent:true,opacity:.7,depthWrite:false,sizeAttenuation:true});const particles=new THREE.Points(particleGeo,particleMat);scene.add(particles);
for(let i=0;i<particleCount;i++){particleData.push({x:range(-18,18),y:range(-6,6),z:range(-10,3),life:1,vx:-range(.1,.3),vy:range(.02,.1),burst:false});const c=new THREE.Color(i%3?0xffedbc:0xbac985);particleColors.set([c.r,c.g,c.b],i*3);}
let burstCursor=0;
function puff(count,impact=false){if(reduced)return;for(let i=0;i<count;i++){const p=particleData[burstCursor++%18];p.x=creature.position.x-.25;p.y=creature.position.y;p.z=.35;p.vx=impact?range(-2.8,2.8):range(-2,-.5);p.vy=impact?range(-2.5,2.5):range(-.7,.7);p.life=impact?.75:.43;p.burst=true;}}

const model=new FlightModel();let state='ready',worldW=16,worldH=11,elapsed=0,wingKick=0,deathAge=0,shake=0,runAge=0,previous=0,accumulator=0;
let best=0,muted=false,audio=null,oldBest=0,readyPhase=0;
try{const stored=Number(localStorage.getItem('mosswing.best'));best=Number.isFinite(stored)?Math.max(0,Math.floor(stored)):0;muted=localStorage.getItem('mosswing.muted')==='true';}catch{}
const fmt=n=>String(n).padStart(2,'0');$('best').textContent=fmt(best);
function updateSound(){ $('sound').classList.toggle('muted',muted);$('sound').setAttribute('aria-label',muted?'Enable sound':'Mute sound');$('sound').setAttribute('aria-pressed',String(muted)); }
updateSound();
function unlockAudio(){try{if(!audio)audio=new(window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume().catch(()=>{});}catch{}}
function note(freq,end,duration,volume=.05,delay=0,type='sine'){
 if(muted||!audio||audio.state!=='running')return;
 const t=audio.currentTime+delay,osc=audio.createOscillator(),gain=audio.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,t);osc.frequency.exponentialRampToValueAtTime(end,t+duration);gain.gain.setValueAtTime(.001,t);gain.gain.exponentialRampToValueAtTime(volume,t+.015);gain.gain.exponentialRampToValueAtTime(.001,t+duration);osc.connect(gain);gain.connect(audio.destination);osc.start(t);osc.stop(t+duration+.01);osc.onended=()=>{osc.disconnect();gain.disconnect();};
}
function setState(next){state=next;document.body.className=next;for(const[id,visible]of[['gameover',next==='over'],['paused',next==='paused']]){$(id).classList.toggle('visible',visible);$(id).setAttribute('aria-hidden',String(!visible));$(id).inert=!visible;}$('intro').inert=next!=='ready';}
function start(){
 oldBest=best;model.reset(-worldW*.23);homeIsland.position.x=-worldW*.48-1;creature.position.set(model.x,model.y,0);creature.rotation.set(0,0,0);bodyPivot.rotation.set(0,0,0);deathAge=0;runAge=0;accumulator=0;previous=performance.now();$('score').textContent='0';$('tap-hint').classList.add('visible');setState('playing');canvas.focus({preventScroll:true});flap();
}
function flap(){model.flap();wingKick=1;puff(3);note(420,760,.095,.035);}
function act(){unlockAudio();if(state==='ready'||state==='over'&&deathAge>.85)start();else if(state==='playing')flap();else if(state==='paused')resume();}
function die(){setState('dying');deathAge=0;shake=reduced?0:.14;puff(16,true);note(170,58,.3,.07,0,'triangle');if(!reduced)$('flash').animate([{opacity:.36},{opacity:0}],{duration:260});}
function finish(){
 best=Math.max(best,model.score);try{localStorage.setItem('mosswing.best',String(best));}catch{}
 $('best').textContent=fmt(best);$('final-score').textContent=model.score;$('final-best').textContent=best;
 $('record').textContent=model.score>oldBest?'A new personal best':'';
 $('result-message').textContent=model.score===0?'Every flight starts with a little lift.':model.score<5?'The next gap is always an invitation.':'Somewhere between the leaves, you found your rhythm.';
 setState('over');$('retry').focus({preventScroll:true});
}
function pause(){if(state!=='playing')return;setState('paused');audio?.suspend().catch(()=>{});$('resume').focus({preventScroll:true});}
function resume(){if(state!=='paused')return;unlockAudio();setState('playing');previous=performance.now();accumulator=0;canvas.focus({preventScroll:true});flap();}
document.addEventListener('pointerdown',e=>{if(e.target.closest('button')||e.button!==0||!e.isPrimary)return;e.preventDefault();act();});
$('start').onclick=act;$('retry').onclick=act;$('resume').onclick=resume;$('pause').onclick=()=>state==='paused'?resume():pause();
$('sound').onclick=()=>{muted=!muted;unlockAudio();updateSound();try{localStorage.setItem('mosswing.muted',String(muted));}catch{};if(!muted)note(660,880,.14,.03);};
document.addEventListener('keydown',e=>{if(['Space','ArrowUp','KeyW'].includes(e.code)){if(e.target.closest('button')&&e.code==='Space')return;e.preventDefault();if(!e.repeat)act();}else if(e.code==='Escape'||e.code==='KeyP'){e.preventDefault();state==='paused'?resume():pause();}else if(e.code==='KeyM'&&!e.repeat){$('sound').click();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();previous=performance.now();});
window.addEventListener('blur',pause);
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();pause();$('error').style.display='grid';$('error').querySelector('p').textContent='The garden lost its canvas. Reload to take flight again.';});
$('reload').onclick=()=>location.reload();
function resize(){
 const width=innerWidth,height=innerHeight,oldX=model.x;worldH=width/height<.75?12.4:11;worldW=worldH*width/height;
 model.limit=worldH*.5/Math.cos(Math.atan(.14));
 renderer.setSize(width,height);camera.left=-worldW/2;camera.right=worldW/2;camera.top=worldH/2;camera.bottom=-worldH/2;camera.updateProjectionMatrix();
 const x=-worldW*.23,dx=x-oldX;model.x=x;model.gates.forEach(g=>g.x+=dx);
 sun.position.x=worldW*.4;sun.position.y=worldH*.31-5.88;halo.position.copy(sun.position);
 homeIsland.position.x=-worldW*.48-1;homeIsland.position.y=-3.05;
 if(state==='playing')pause();
}
window.addEventListener('resize',resize);resize();setState('ready');
function render(dt){
 if(state!=='paused')elapsed+=dt;
 if(state==='playing'){
   runAge+=dt;if(runAge>3)$('tap-hint').classList.remove('visible');
   accumulator+=dt;while(accumulator>=1/120&&state==='playing'){const result=model.step(1/120);accumulator-=1/120;if(result.hit)die();else if(result.passed){$('score').textContent=model.score;if(!reduced)$('score').animate([{transform:'scale(1.2)'},{transform:'scale(1)'}],{duration:200});note(659,659,.17,.045);note(988,988,.25,.035,.095);puff(7);}}
   creature.position.set(model.x,model.y,0);
 }else if(state==='ready'){
   readyPhase+=dt;creature.position.set(-worldW*.22,Math.sin(elapsed*1.7)*.12-.12,0);model.y=creature.position.y;
 }else if(state==='dying'){
   deathAge+=dt;if(deathAge>.12){model.vy=Math.max(-9,model.vy-14*dt);creature.position.y=Math.max(-5.8,creature.position.y+model.vy*dt);bodyPivot.rotation.z-=dt*2.3;}if(deathAge>.8)finish();
 }else if(state==='over')deathAge+=dt;
 if(state!=='paused'){
   wingKick=Math.max(0,wingKick-dt*5.5);
   if(state!=='dying'&&state!=='over'){const target=state==='ready'?.035:Math.max(-.75,Math.min(.38,model.vy*.055));bodyPivot.rotation.z+=(target-bodyPivot.rotation.z)*(1-Math.exp(-12*dt));
     const flutter=state==='playing'?Math.sin(elapsed*18)*.12:Math.sin(elapsed*6)*.3;wingFront.rotation.x=.2+flutter-wingKick*1.5;wingFront.rotation.z=-wingKick*.22;wingBack.rotation.x=-.2-flutter+wingKick*1.3;
     bodyPivot.scale.set(1+wingKick*.05,1-wingKick*.07,1);
   }
   const drift=state==='playing'?2.65:state==='ready'?.22:0;
   for(const s of scenery){s.g.position.x-=dt*drift*s.rate;if(s.g.position.x<-worldW/2-7)s.g.position.x=Math.max(worldW/2+8,25);s.g.position.y=s.origin+(reduced?0:Math.sin(elapsed*.35+s.phase)*.08);}
   homeIsland.position.x-=state==='playing'?dt*2.65:0;
   particleData.forEach((p,i)=>{p.x+=p.vx*dt-(state==='playing'?.7*dt:0);p.y+=p.vy*dt;if(p.burst){p.life-=dt;if(p.life<=0){p.x=range(-worldW/2,worldW/2);p.y=range(-6,6);p.z=range(-10,-2);p.vx=-.12;p.vy=.03;p.burst=false;}}if(p.x<-worldW/2-2)p.x=worldW/2+2;if(p.y>7)p.y=-6;particlePositions.set([p.x,p.y,p.z],i*3);});particleGeo.attributes.position.needsUpdate=true;
 }
 if(state==='ready'){gateMeshes.forEach((g,i)=>{g.root.visible=i<3;const x=worldW*((worldW<8?.46:.26)+i*.29);poseGate(g,x,i%2?.55:.2);});}else gateMeshes.forEach((g,i)=>{g.root.visible=true;poseGate(g,model.gates[i].x,model.gates[i].center);});
 shake=Math.max(0,shake-dt*.7);camera.position.x=shake?Math.sin(elapsed*90)*shake:0;camera.position.y=4.2+(shake?Math.cos(elapsed*100)*shake:0);
 renderer.render(scene,camera);
}
function frame(now){requestAnimationFrame(frame);const dt=Math.min(.05,Math.max(0,(now-previous)/1000));previous=now;render(dt);}
requestAnimationFrame(now=>{previous=now;frame(now);});
})();
