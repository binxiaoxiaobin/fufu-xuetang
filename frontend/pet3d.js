import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { createCompanionMotion } from './companion-motion.js?v=20261006-4';
import { setExplorerAccessories } from '/clay-safari/src/accessory-kit.js?v=20260930-tuantuan-3';

const host = document.querySelector('#pet3dHost');
const stage = document.querySelector('#petScene');
const homePage = document.querySelector('#page-home');
if (host && stage) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 30);
  camera.position.set(0, 0.9, 3.5);
  camera.lookAt(0, 0.59, 0);
  const renderer = new THREE.WebGLRenderer({ alpha:true, antialias:true, powerPreference:'low-power' });
  renderer.setPixelRatio((window.FufuPerformance?.pixelRatio || Math.min(window.devicePixelRatio || 1, 1.5)));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  host.append(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xfff8ea, 0x7eae87, 2.2));
  const sun = new THREE.DirectionalLight(0xfff2d4, 2.7);
  sun.position.set(-2,4,3); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xb4dcff, 1.1);
  fill.position.set(2,2,-2); scene.add(fill);
  const mat = (color) => new THREE.MeshStandardMaterial({color,roughness:.94,metalness:0});
  // A soft contact shadow places Tuantuan on the garden ground without a pedestal.
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 64;
  const shadowContext = shadowCanvas.getContext('2d');
  const shadowGradient = shadowContext.createRadialGradient(32,32,2,32,32,31);
  shadowGradient.addColorStop(0,'rgba(53,66,35,.38)');
  shadowGradient.addColorStop(.45,'rgba(53,66,35,.18)');
  shadowGradient.addColorStop(1,'rgba(53,66,35,0)');
  shadowContext.fillStyle = shadowGradient;
  shadowContext.fillRect(0,0,64,64);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  shadowTexture.colorSpace = THREE.SRGBColorSpace;
  const contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1,.72),
    new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false,toneMapped:false}));
  contactShadow.rotation.x = -Math.PI/2;
  contactShadow.position.y = -.035;
  scene.add(contactShadow);
  // 配件材质：与动物园里的探险家共用同一套配色和装配代码
  const accessoryMaterials = {
    pink: mat(0xf4a8b7), yellow: mat(0xffd969), cream: mat(0xfff0cf), brown: mat(0x9d6a43),
    leather: mat(0xd99464), red: mat(0xe88c8d), mint: mat(0x8ac7a6), shoeCream: mat(0xffe7bd),
    glassBlue: mat(0x76aeb5), bronze: mat(0xc89854),
  };
  const swivel = new THREE.Group(); scene.add(swivel);
  const pose = new THREE.Group(); swivel.add(pose);
  pose.position.y=.45;
  let model=null, parts={}, rest={}, motion=null;
  let equipment={}, mode='idle', modeUntil=0, yaw=0, pitch=0, drag=null, tick=0, last=performance.now();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');

  // ---------------------------------------------------------------- 渲染调度
  // 团团是首页常驻的 3D，原来的循环不管看不看得见都按 60fps 满速画：
  // 切到别的页面、滚出视口、甚至切到别的标签页，它都还在画。平板在首页
  // 多待一会儿就会持续满载发热、被系统降频，手感就越来越"卡卡的"。
  // 这里补三道闸，外观和交互行为一点不变：
  //   ① 看不见就一个 draw call 都不发；
  //   ② 安静时把帧率从 60 压到 24（拖动和做动作时仍是满帧，跟手）；
  //   ③ 每帧复用它自己的对象，不再新建 targets / entries 数组。
  let inView = true, onScreen = !document.hidden, lastDrawn = 0;
  const IDLE_FPS = 24;
  const targetRot = { legL:0, legR:0, armL:0, armR:0, head:0 };
  const targetSpread = { legL:0, legR:0, armL:0, armR:0, head:0 };
  let partList = [];
  document.addEventListener('visibilitychange', () => { onScreen = !document.hidden; last = performance.now(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      inView = entries.some(entry => entry.isIntersecting);
      last = performance.now();          // 回到画面里别补一大段 dt
    }, { rootMargin:'96px' }).observe(host);
  }
  function isVisible() {
    if (!onScreen || !inView) return false;                              // 后台 / 滚出视口
    if (homePage && !homePage.classList.contains('active')) return false; // 切到别的页面
    return true;
  }
  function isBusy() {
    const settling = Math.abs(yaw - swivel.rotation.y) > .0015
                  || Math.abs(pitch - swivel.rotation.x) > .0015;        // 松开手还在归位
    return !!drag || mode !== 'idle' || settling;
  }

  function equip(value) {
    equipment=value&&typeof value==='object'?value:{};
    if(!model)return;
    setExplorerAccessories(THREE, model, equipment, accessoryMaterials);
  }
  function play(action) {
    mode=['companion','play','sing','wave','smile','nod'].includes(action)?action:'idle';
    modeUntil=performance.now()+(mode==='sing'?4200:mode==='play'?2900:2400);
    motion?.play(mode);
  }
  const api={play,equip,switchModel:()=>{},currentModel:()=> 'clay_explorer'};
  window.pet3d=api;
  new GLTFLoader().load('/clay-safari/models/explorer.glb?v=20260930-tuantuan-3', gltf=>{
    model=gltf.scene;
    let hasSkin=false;
    model.traverse(object=>{if(object.isSkinnedMesh&&object.skeleton?.bones.length)hasSkin=true;});
    model.userData.claySafariRigged=hasSkin;
    model.userData.animationClips=gltf.animations;
    model.scale.setScalar(.9);
    if(!model.userData.claySafariRigged)for(const name of ['hatdome','hatband','brim']){
      const hatPart=model.getObjectByName(name);
      if(hatPart)hatPart.visible=false;
    }
    model.position.y=-.45;
    pose.add(model);
    parts=model.userData.claySafariRigged
      ? {head:model.getObjectByName('mixamorig:Head'),armL:model.getObjectByName('mixamorig:LeftArm'),armR:model.getObjectByName('mixamorig:RightArm'),legL:model.getObjectByName('mixamorig:LeftUpLeg'),legR:model.getObjectByName('mixamorig:RightUpLeg')}
      : {head:model.getObjectByName('head'),armL:model.getObjectByName('arm-1'),armR:model.getObjectByName('arm1'),legL:model.getObjectByName('leg-1'),legR:model.getObjectByName('leg1')};
    for(const [key,part] of Object.entries(parts))if(part)rest[key]=part.rotation.clone();
    partList=Object.entries(parts).filter(([,part])=>part);   // 预算一次，渲染循环里不再拆对象
    if(hasSkin)motion=createCompanionMotion(model);
    host.classList.add('is-ready');
    equip(window.petAccessoryState?.equipment||equipment);
  },undefined,error=>console.warn('黏土探险家模型载入失败',error));
  function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);}
  new ResizeObserver(resize).observe(host);resize();
  let lastResponse=null;
  const actionLabels={wave:'嗨！团团轻轻向你招手',smile:'团团笑眯眯，真高兴见到你',nod:'团团点点头：我们一起加油！'};
  function respond(){
    if(motion?.active)return;
    const choices=['wave','smile','nod'].filter(action=>action!==lastResponse);
    lastResponse=choices[Math.floor(Math.random()*choices.length)];
    play(lastResponse);
    const status=document.querySelector('#petLastAction');if(status)status.textContent=actionLabels[lastResponse];
    window.respondPetSpeech?.();
  }
  host.addEventListener('pointerdown',e=>{if(!e.isPrimary&&e.isPrimary!==undefined){drag=null;return;}drag={id:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,moved:false,slack:e.pointerType==='touch'?12:4};host.setPointerCapture(e.pointerId);});
  host.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>drag.slack)drag.moved=true;if(drag.moved){yaw+=dx*.012;pitch=Math.max(-.2,Math.min(.25,pitch+dy*.004));}drag.x=e.clientX;drag.y=e.clientY;});
  host.addEventListener('pointerup',e=>{if(drag&&drag.id===e.pointerId){if(!drag.moved)respond();drag=null;}});
  host.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();respond();}});
  // 双指捏合时手势层会派发 pointercancel 作废这次拖动。少了这一句，
  // 捏合结束抬起最后一根手指会被当成"点了一下"，宠物就莫名其妙招手。
  host.addEventListener('pointercancel',()=>{drag=null;});
  document.querySelector('#petRotateReset')?.addEventListener('click',()=>{yaw=0;pitch=0;});
  fetch('/api/companion/appearance').then(r=>r.ok?r.json():{}).then(data=>{
    if(data.avatar)document.querySelectorAll('[data-tuantuan-avatar]').forEach(img=>{img.src=data.avatar;});
  }).catch(()=>{});
  function frame(now){
    requestAnimationFrame(frame);
    // ① 看不见就一个 draw call 都不发：切页、切标签页、滚出视口，三种一样处理。
    if(!isVisible()){ last=now; return; }
    const dt=Math.min(.05,(now-last)/1000);last=now;tick+=dt;
    if(motion){if(!motion.active)mode='idle';}else if(now>modeUntil)mode='idle';
    // ② 看得见但安静时降到 24fps：团团大半时间只是极轻微的呼吸，
    //    跑满 60fps 只会白白发热（平板降频后手感就"卡卡的"）。
    if(!isBusy()&&now-lastDrawn<1000/IDLE_FPS)return;
    const motionDelta=Math.min(.05,(now-lastDrawn)/1000);
    lastDrawn=now;
    const animate=!reduced.matches;
    const t=animate?tick:0;
    const wave=mode==='wave',companion=mode==='companion',playful=mode==='play',sing=mode==='sing';
    const smoothing=Math.min(1,dt*7);
    swivel.rotation.y+=(yaw-swivel.rotation.y)*smoothing;
    swivel.rotation.x+=(pitch-swivel.rotation.x)*smoothing;
    if(model){
      if(motion){
        const state=motion.update(motionDelta,reduced.matches);
        model.position.y=-.45+state.bounce+(reduced.matches?0:Math.sin(t*2.2)*.006);
        model.rotation.z=0;
      }else{
      const bounce=playful?Math.max(0,Math.sin(t*9))*.12:Math.sin(t*2.2)*.008;
      targetRot.legL=playful?Math.sin(t*9)*.35:0;
      targetRot.legR=playful?-Math.sin(t*9)*.35:0;
      targetRot.armL=companion?-.55:playful?-.35:0;
      targetRot.armR=wave?-.9+Math.sin(t*12)*.22:companion?-.55:playful?-.35:0;
      targetRot.head=sing?Math.sin(t*5)*.13:companion?-.1:wave?-.06:0;
      targetSpread.armL=companion?.28:0;
      targetSpread.armR=companion?-.28:wave?-.65:0;
      for(let i=0;i<partList.length;i++){
        const key=partList[i][0], part=partList[i][1], base=rest[key];
        part.rotation.x+=(base.x+targetRot[key]-part.rotation.x)*smoothing;
        part.rotation.z+=(base.z+targetSpread[key]-part.rotation.z)*smoothing;
      }
      model.position.y=-.45+bounce;
      model.rotation.z=sing?Math.sin(t*5)*.09:companion?Math.sin(t*3)*.035:0;
      }
    }
    renderer.render(scene,camera);
  }
  requestAnimationFrame(frame);
}
