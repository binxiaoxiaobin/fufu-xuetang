import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { createCharacterRig } from './character-rig.js?v=55';

try{new Image().src='http://127.0.0.1:8765/ping?stage=boot&t='+Date.now();}catch(e){}
const stage = document.querySelector('#characterStage');
const status = document.querySelector('#loadingStatus');
const info = document.querySelector('#modelInfo');
const selectedModel = new URLSearchParams(location.search).get('model');
const riggedMode = selectedModel === 'rigged';
const tripoMode = selectedModel === 'tripo' || riggedMode;
if (tripoMode) {
  document.title = riggedMode ? '团团 · 动作与装扮预览' : '团团 · Tripo 3D 模型预览';
  document.querySelector('.draft-badge').textContent = riggedMode ? '旧动作实验' : 'Tripo 3D 预览';
  document.querySelector('.page-intro p').textContent = riggedMode ? '试试动作、表情和黏土配件，也可以拖动查看侧面和背面。' : '根据女生版设定图生成的完整 3D 模型。拖动模型或切换视角，可以查看正面、侧面和背面。';
  document.querySelector('.preview-note').textContent = riggedMode ? '这是旧版本地绑定实验，挥手等动作仍会变形，仅供对比。首页角色暂未替换。' : '这是独立造型预览，首页角色暂未替换。当前模型没有骨骼动画。';
  if (riggedMode) {
    document.querySelectorAll('[data-rig-action]').forEach(item=>item.style.display='');
    document.querySelector('[aria-label="表情"]').style.display='flex';
    document.querySelector('[aria-label="配件"]').style.display='flex';
  } else document.querySelector('[aria-label="动作"]').style.display = 'none';
}
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:'low-power' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = tripoMode ? 1.0 : 1.45;
stage.append(renderer.domElement);

const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
scene.add(new THREE.HemisphereLight(0xfffaec, 0x96ab99, 2.5));
const key = new THREE.DirectionalLight(0xffedcd, 3.3); key.position.set(-3,7,5); scene.add(key);
const fill = new THREE.DirectionalLight(0xc8e0ff, 1.2); fill.position.set(4,4,1); scene.add(fill);
const rim = new THREE.DirectionalLight(0xfff5de, 2.6); rim.position.set(0,5,-5); scene.add(rim);
const ground = new THREE.Mesh(new THREE.CircleGeometry(1.18, 64), new THREE.MeshBasicMaterial({ color:0xd7dfce, transparent:true, opacity:.33, depthWrite:false }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -.038; scene.add(ground);
const groundInner = new THREE.Mesh(new THREE.CircleGeometry(.89, 64), new THREE.MeshBasicMaterial({ color:0x94aa89, transparent:true, opacity:.1, depthWrite:false }));
groundInner.rotation.x = -Math.PI / 2; groundInner.position.y = -.035; scene.add(groundInner);

let model = null, rig = null, parts = {}, base = {}, yaw = -.48, targetYaw = -.48, elevation = .24, targetElevation = .24;
let action = 'idle', expression = 'normal', spin = false, drag = null, zoom = 8.1, time = 0, last = performance.now();
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

function resize(){
  const width = Math.max(stage.clientWidth, 1), height = Math.max(stage.clientHeight, 1);
  renderer.setSize(width, height, false);
  camera.aspect = width/height;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage); resize();

const modelUrl=riggedMode ? '/assets/characters/tuantuan-girl-rigged.glb?v=29' : tripoMode ? '/assets/characters/tuantuan-girl-tripo.glb?v=1' : '/assets/characters/tuantuan-girl.glb?v=2';
new GLTFLoader().load(modelUrl, gltf=>{
  try{new Image().src='http://127.0.0.1:8765/ping?stage=gltf&t='+Date.now();}catch(e){}
  model = gltf.scene;
  model.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}});
  scene.add(model);
  if(riggedMode){
    rig=createCharacterRig(model);
    // URL 预设状态（自动验收用）：?view=&action=&expr=&acc=
    const qs=new URLSearchParams(location.search);
    const view=qs.get('view');
    const viewYaw={front:0,side:Math.PI/2,back:Math.PI,'three-quarter':-.48}[view];
    if(viewYaw!==undefined){targetYaw=yaw=viewYaw;targetElevation=elevation=.24;}
    const act=qs.get('action');
    if(act){action=act;document.querySelectorAll('[data-action]').forEach(b=>b.classList.toggle('selected',b.dataset.action===act));}
    const ex=qs.get('expr');
    if(ex){expression=ex;document.querySelectorAll('[data-expression]').forEach(b=>b.classList.toggle('selected',b.dataset.expression===ex));}
    (qs.get('acc')||'').split(',').filter(Boolean).forEach(a=>{
      rig.setAccessory(a,true);
      const btn=document.querySelector(`[data-accessory="${a}"]`);
      if(btn){btn.setAttribute('aria-pressed','true');btn.classList.add('selected');}
    });
    // 预演若干帧让姿态/表情到位
    const fa=qs.get('fa'),ua=qs.get('ua'),uax=qs.get('uax'),uaz=qs.get('uaz');
    if(fa!==null||ua!==null||uax!==null||uaz!==null){const u=ua===null?-2.25:+ua,f=fa===null?0:+fa;window.__pose={uaRZ:u,uaLZ:-u,faRZ:f,faLZ:-f};if(uax!==null)window.__pose.uaRX=+uax;if(uaz!==null)window.__pose.uaRZ=+uaz;}
    for(let i=0;i<90;i++)rig.update(action,expression,1.2+i*.033,false);
    if(qs.get('dbg')){
      const R=window.__ttRig,out={bones:{},LM:R.LM,names:[]};
      R.model.traverse(n=>{if(n.isBone)out.names.push(n.name);});
      ['UpperArmR','UpperArmL','ForearmR','HandR','Head'].forEach(n=>{const b=R.bones[n];out.bones[n]=b?[b.rotation.x,b.rotation.y,b.rotation.z].map(x=>+x.toFixed(2)):'MISSING';});
      R.mouthAnchor.updateWorldMatrix(true,false);var me=R.mouthAnchor.matrixWorld.elements;out.mouth=[me[12],me[13],me[14]].map(x=>+x.toFixed(3));
      function w3(n){var b=R.bones[n];if(!b)return null;b.updateWorldMatrix(true,false);var m=b.matrixWorld.elements;return [m[12],m[13],m[14]].map(x=>+x.toFixed(3));}
      out.pts={uaR:w3('UpperArmR'),faR:w3('ForearmR'),hdR:w3('HandR'),uaL:w3('UpperArmL'),faL:w3('ForearmL'),hdL:w3('HandL')};
      var os=R.faceParts.mouths[2].group.children[0];os.updateWorldMatrix(true,false);var oe=os.matrixWorld.elements;out.o=[oe[12],oe[13],oe[14]].map(x=>+x.toFixed(3));out.surf=[R.surfaceAt(0,2.222),R.surfaceAt(.07,2.19),R.surfaceAt(-.07,2.19)].map(x=>+x.toFixed(3));
      new Image().src='http://127.0.0.1:8765/ping?dbg='+encodeURIComponent(JSON.stringify(out));
    }
    const autoshot=qs.get('autoshot');
    if(autoshot){rig.setAutoBlink(false);window.__autoshot={name:autoshot,left:40};}
  }
  else {
    parts = {head:model.getObjectByName('head'),leftArm:model.getObjectByName('arm-1'),rightArm:model.getObjectByName('arm1'),leftLeg:model.getObjectByName('leg-1'),rightLeg:model.getObjectByName('leg1')};
    for(const [name,node] of Object.entries(parts)) if(node) base[name]=node.rotation.clone();
  }
  status.remove();
  info.textContent=riggedMode ? '17 根骨骼 · 3 种表情 · 3 件配件' : tripoMode ? 'Tripo H2.5 · 完整模型' : 'GLB · 完整建模';
},undefined,error=>{
  try{new Image().src='http://127.0.0.1:8765/ping?stage=loaderror&e='+encodeURIComponent((error&&(error.message||error.toString())||'?').slice(0,300))+'&t='+Date.now();}catch(e){}
  status.textContent='模型加载失败，请检查本地服务和模型文件。';
  info.textContent='加载失败';
  console.error(error);
});

document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('[data-view]').forEach(other=>other.classList.toggle('selected',other===button));
  const view=button.dataset.view;
  spin=view==='spin';
  if(view==='three-quarter')targetYaw=-.48;
  if(view==='front')targetYaw=0;
  if(view==='side')targetYaw=Math.PI/2;
  if(view==='back')targetYaw=Math.PI;
  targetElevation=.24;
}));
document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>{
  action=button.dataset.action;
  document.querySelectorAll('[data-action]').forEach(other=>other.classList.toggle('selected',other===button));
}));
document.querySelectorAll('[data-expression]').forEach(button=>button.addEventListener('click',()=>{
  expression=button.dataset.expression;
  document.querySelectorAll('[data-expression]').forEach(other=>other.classList.toggle('selected',other===button));
}));
document.querySelectorAll('[data-accessory]').forEach(button=>button.addEventListener('click',()=>{
  const on=button.getAttribute('aria-pressed')!=='true';
  button.setAttribute('aria-pressed',String(on));
  button.classList.toggle('selected',on);
  rig?.setAccessory(button.dataset.accessory,on);
}));

stage.addEventListener('pointerdown',event=>{drag={x:event.clientX,y:event.clientY};stage.setPointerCapture(event.pointerId);spin=false;});
stage.addEventListener('pointermove',event=>{
  if(!drag)return;
  targetYaw+=(event.clientX-drag.x)*.009;
  targetElevation=THREE.MathUtils.clamp(targetElevation+(event.clientY-drag.y)*.006,-.32,.65);
  drag={x:event.clientX,y:event.clientY};
  document.querySelectorAll('[data-view]').forEach(button=>button.classList.remove('selected'));
});
stage.addEventListener('pointerup',()=>{drag=null;});
stage.addEventListener('pointercancel',()=>{drag=null;});
stage.addEventListener('wheel',event=>{event.preventDefault();zoom=THREE.MathUtils.clamp(zoom+event.deltaY*.0045,6.0,10.5);},{passive:false});

function setRotation(node, axis, value, speed){if(node)node.rotation[axis]=THREE.MathUtils.lerp(node.rotation[axis],value,speed);}
function frame(now){
  requestAnimationFrame(frame);
  const dt=Math.min((now-last)/1000,.05);last=now;
  if(!reduced.matches)time+=dt;
  if(spin&&!reduced.matches)targetYaw+=dt*.4;
  yaw=THREE.MathUtils.lerp(yaw,targetYaw,Math.min(1,dt*6));
  elevation=THREE.MathUtils.lerp(elevation,targetElevation,Math.min(1,dt*6));
  const focus=1.68, h=Math.sin(elevation)*zoom;
  camera.position.set(Math.sin(yaw)*Math.cos(elevation)*zoom,focus+h,Math.cos(yaw)*Math.cos(elevation)*zoom);
  camera.lookAt(0,focus,0);
  if(model){
    if(riggedMode)rig?.update(action,expression,time,reduced.matches);
    else {
      const sway=reduced.matches?0:Math.sin(time*2.2);
      model.position.y=action==='cheer'&&!reduced.matches?Math.max(0,Math.sin(time*7))*.11:sway*.012;
      setRotation(parts.head,'z',action==='cheer'?.07:sway*.025,.12);
      setRotation(parts.rightArm,'y',action==='wave'?-2.25+(reduced.matches?0:Math.sin(time*8)*.11):action==='cheer'?-2.3:base.rightArm?.y||0,.14);
      setRotation(parts.leftArm,'y',action==='cheer'?2.3:base.leftArm?.y||0,.14);
      setRotation(parts.rightArm,'x',action==='wave'&&!reduced.matches?Math.sin(time*10)*.15:0,.14);
      setRotation(parts.leftLeg,'x',action==='cheer'&&!reduced.matches?Math.sin(time*7)*.22:0,.12);
      setRotation(parts.rightLeg,'x',action==='cheer'&&!reduced.matches?-Math.sin(time*7)*.22:0,.12);
    }
  }
  renderer.render(scene,camera);
  if(window.__autoshot){
    window.__autoshot.left--;
    if(window.__autoshot.left<=0){
      const shot=window.__autoshot;window.__autoshot=null;
      fetch('http://127.0.0.1:8765/?name='+shot.name,{method:'POST',body:renderer.domElement.toDataURL('image/png')}).then(()=>setTimeout(()=>window.close(),400));
    }
  }
}
requestAnimationFrame(frame);
