import {createSceneScope,disposeGraph} from './scene-scope.js?v=20261003-lifecycle-1';
import * as THREE from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {loadEarthCulture,readCulture} from './earth-culture.js?v=20261010-culture-1';

const page=document.querySelector('#page-landmark');
const host=document.querySelector('#landmarkCanvasHost');
const stage=page.querySelector('.landmark-stage');
stage.insertAdjacentHTML('beforeend','<div class="landmark-location" id="landmarkLocation">地标外观</div><div class="landmark-load" id="landmarkLoad" role="status" aria-live="polite" hidden></div>');
page.querySelector('.landmark-stage-actions').innerHTML='<button id="landmarkReset" type="button">↺ 完整外观</button><button id="landmarkFullscreen" type="button">⛶ 放大观察</button>';
stage.insertAdjacentHTML('afterend','<div class="landmark-tour"><div class="landmark-tour-heading"><b>选择观察角度</b><span>拖动旋转 · 滚轮缩放</span></div><div class="landmark-stations" id="landmarkStations"></div><p id="landmarkTourText">从整体轮廓认识地标，再看看细节。</p></div>');
const workbench=document.createElement('div');workbench.className='landmark-workbench';stage.before(workbench);workbench.append(stage,page.querySelector('.landmark-tour'));
page.querySelector('.landmark-scale-note').textContent='外观模型用于观察轮廓与结构，细节可能经过简化。';
const loader=new GLTFLoader(),assets=new Map();
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const loadEl=document.querySelector('#landmarkLoad');
let scope,renderer,scene,camera,exteriorGroup,sky,ground,keyLight;
let current=null,ready=false,requestId=0,drag=null,motion=null;
let yaw=.38,pitch=.13,distance=51,orbitTarget=new THREE.Vector3(0,14.7,0);
const escape=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function setup() {
  if (renderer) return;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(43,1,.035,450);
  renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance' });
  scope.own(scene,renderer);
  renderer.setPixelRatio(window.FufuPerformance?.pixelRatio || Math.min(devicePixelRatio || 1,1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.setAttribute('aria-label','地标三维外观，拖动旋转，使用观察角度按钮查看细节');
  host.append(renderer.domElement);
  const canvas = document.createElement('canvas');canvas.width=512;canvas.height=256;
  const c=canvas.getContext('2d'),g=c.createLinearGradient(0,0,0,256);
  g.addColorStop(0,'#719eb5');g.addColorStop(.34,'#b6c9ce');g.addColorStop(.47,'#ddd4be');g.addColorStop(.56,'#b8c0b2');g.addColorStop(.76,'#899887');g.addColorStop(1,'#566b5c');
  c.fillStyle=g;c.fillRect(0,0,512,256);
  sky=new THREE.CanvasTexture(canvas);sky.mapping=THREE.EquirectangularReflectionMapping;sky.colorSpace=THREE.SRGBColorSpace;
  const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromEquirectangular(sky).texture;pmrem.dispose();
  scene.environmentIntensity=.7;
  scene.add(new THREE.HemisphereLight(0xd4e5f4,0x7c7256,1.5));
  keyLight=new THREE.DirectionalLight(0xffe1a7,3.4);keyLight.position.set(-22,45,28);
  keyLight.castShadow=true;keyLight.shadow.mapSize.set(window.FufuPerformance?.touch?1024:2048,window.FufuPerformance?.touch?1024:2048);keyLight.shadow.camera.left=-20;keyLight.shadow.camera.right=20;
  keyLight.shadow.camera.top=40;keyLight.shadow.camera.bottom=-20;keyLight.shadow.camera.far=100;keyLight.shadow.normalBias=.03;scene.add(keyLight);

  scene.background=sky;scene.fog=new THREE.Fog(0xb5c7c9,95,230);
  ground=new THREE.Mesh(new THREE.PlaneGeometry(600,600),new THREE.MeshStandardMaterial({color:0xadb3a6,roughness:1}));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.39;ground.receiveShadow=true;scene.add(ground);
  exteriorGroup=new THREE.Group();scene.add(exteriorGroup);
  scope.listen(renderer.domElement,'pointerdown',event=>{
    if(!ready||motion)return;
    drag={x:event.clientX,y:event.clientY,yaw,pitch};renderer.domElement.setPointerCapture(event.pointerId);
  });
  scope.listen(renderer.domElement,'pointermove',event=>{
    if(!drag)return;
    yaw=drag.yaw-(event.clientX-drag.x)*.006;
    pitch=THREE.MathUtils.clamp(drag.pitch+(event.clientY-drag.y)*.005,-.18,1.23);
  });
  for(const event of ['pointerup','pointercancel','lostpointercapture'])scope.listen(renderer.domElement,event,()=>{drag=null;});
  scope.listen(renderer.domElement,'wheel',event=>{
    event.preventDefault();if(!ready||motion)return;
    distance=THREE.MathUtils.clamp(distance+Math.sign(event.deltaY)*Math.max(.35,distance*.08),1.6,85);
  },{passive:false});
  new scope.ResizeObserver(resize).observe(host);scope.listen(window,'resize',resize);scope.frame(animate);
}
function resize(){if(!renderer)return;const r=host.getBoundingClientRect();if(!r.width||!r.height)return;camera.aspect=r.width/r.height;camera.updateProjectionMatrix();renderer.setSize(r.width,r.height,false);}
function loading(message){loadEl.textContent=message;loadEl.hidden=!message;}
function loadAsset(name){
  const owner=scope;
  for(const [key,promise] of assets)if(key!==name){assets.delete(key);promise.then(disposeGraph).catch(()=>{});}
  if(!assets.has(name)){
    const job=loader.loadAsync(`/assets/landmarks-v2/${name}.glb?v=20260924-pyramid-1`).then(gltf=>{
      if(owner.disposed){disposeGraph(gltf.scene);throw new Error('Scene released');}
      gltf.scene.traverse(ob=>{if(ob.isMesh){ob.castShadow=true;ob.receiveShadow=true;}});return gltf.scene;
    }).catch(error=>{if(assets.get(name)===job)assets.delete(name);throw error;});
    assets.set(name,job);
  }
  return assets.get(name);
}
function setOrbit(eye,target){
  orbitTarget.fromArray(target);const delta=new THREE.Vector3(...eye).sub(orbitTarget);
  distance=delta.length();yaw=Math.atan2(delta.x,delta.z);pitch=Math.asin(delta.y/distance);
  camera.position.fromArray(eye);camera.lookAt(orbitTarget);
}
function cancelMotion(){if(motion){motion.resolve(false);motion=null;}}
function travel(eye,target,duration=900){
  cancelMotion();drag=null;
  const radial=new THREE.Vector3(...eye).sub(new THREE.Vector3(...target));
  const endYaw=Math.atan2(radial.x,radial.z),yawDelta=Math.atan2(Math.sin(endYaw-yaw),Math.cos(endYaw-yaw));
  return new Promise(resolve=>{motion={start:performance.now(),duration:reduced?1:duration,
    to:new THREE.Vector3(...eye),fromTarget:orbitTarget.clone(),toTarget:new THREE.Vector3(...target),
    yaw,pitch,distance,yawDelta,endPitch:Math.asin(radial.y/radial.length()),endDistance:radial.length(),resolve};});
}
function fullView(animated=true){
  if(!ready)return;
  const height=current.view?.height??14.7,d=(current.view?.distance??51)*(host.clientWidth<500?1.2:1);
  const eye=[Math.sin(.38)*Math.cos(.13)*d,height+Math.sin(.13)*d,Math.cos(.38)*Math.cos(.13)*d];
  if(animated)travel(eye,[0,height,0]);else setOrbit(eye,[0,height,0]);
  document.querySelector('#landmarkTourText').textContent='从整体轮廓认识地标，再选择一个角度看看细节。';
  document.querySelectorAll('#landmarkStations button').forEach(button=>button.classList.remove('active'));
}
function updateInfo(){
  document.querySelector('#landmarkHeading').textContent=`走近${current.name}`;
  page.querySelector('.landmark-heading p').textContent='从外观认识地标，听听它的历史与文化故事。';
  document.querySelector('#landmarkSceneName').textContent=current.code;
  document.querySelector('#landmarkCountry').textContent=current.country;
  document.querySelector('#landmarkTitle').textContent=current.name;
  document.querySelector('#landmarkDescription').textContent=current.intro;
  document.querySelector('#landmarkLocation').textContent=current.landform?'山体外观':'建筑外观';
  document.querySelector('#landmarkFacts').innerHTML=current.facts.map(([label,value])=>`<div><small>${escape(label)}</small><strong>${escape(value)}</strong></div>`).join('')+`<a class="landmark-source" href="${escape(current.source)}" target="_blank" rel="noopener noreferrer">历史文化资料 ↗</a>`+(current.modelCredit?`<a class="landmark-source" href="${escape(current.modelCredit.url)}" target="_blank" rel="noopener noreferrer">原模型：${escape(current.modelCredit.author)} ↗</a><a class="landmark-source" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">模型许可：CC BY 4.0 ↗</a>`:'');
  const stations=document.querySelector('#landmarkStations');
  stations.innerHTML=current.closeups.map((item,i)=>`<button type="button" data-station="${i}" disabled><span>0${i+1}</span>${escape(item.label)}</button>`).join('');
  stations.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{
    if(!ready)return;const index=Number(button.dataset.station),item=current.closeups[index];
    document.querySelector('#landmarkTourText').textContent=`${item.label}：拖动旋转，观察这一处的外观。`;
    stations.querySelectorAll('button').forEach((el,i)=>el.classList.toggle('active',i===index));
    travel(item.eye,item.target,1100);
  }));
}
window.openLandmark=async key=>{
  window.navigate('landmark');
  const token=++requestId,owner=scope;
  cancelMotion();ready=false;drag=null;current=null;
  exteriorGroup.clear();loading('正在展开地标与历史故事…');
  document.querySelector('#landmarkRead').disabled=true;
  document.querySelector('#landmarkTitle').textContent='正在加载';
  document.querySelector('#landmarkDescription').textContent='';
  document.querySelector('#landmarkFacts').replaceChildren();
  document.querySelector('#landmarkStations').replaceChildren();
  try{
    const data=await loadEarthCulture();
    if(token!==requestId||owner.disposed||!page.classList.contains('active'))return;
    current=data.landmarks[key];if(!current)throw new Error('Unknown landmark');
    updateInfo();resize();
    document.querySelector('#landmarkRead').disabled=false;
    const model=await loadAsset(current.asset+'-exterior');
    if(token!==requestId||owner.disposed||!page.classList.contains('active'))return;
    exteriorGroup.add(model);ready=true;loading('');fullView(false);
  }catch(error){if(token!==requestId||owner.disposed)return;loading('模型暂时无法显示，请返回地球仪后重试。');console.warn('Landmark unavailable',error);}
};
function animate(now){
  scope.frame(animate);if(!page.classList.contains('active')||document.hidden)return;
  if(motion){
    const a=motion,t=Math.min(1,(now-a.start)/a.duration),ease=t*t*(3-2*t);
    const target=new THREE.Vector3().lerpVectors(a.fromTarget,a.toTarget,ease);
    const angle=a.yaw+a.yawDelta*ease,p=THREE.MathUtils.lerp(a.pitch,a.endPitch,ease),r=THREE.MathUtils.lerp(a.distance,a.endDistance,ease);
    camera.position.set(target.x+Math.sin(angle)*Math.cos(p)*r,target.y+Math.sin(p)*r,target.z+Math.cos(angle)*Math.cos(p)*r);camera.lookAt(target);
    if(t===1){motion=null;setOrbit(a.to.toArray(),a.toTarget.toArray());a.resolve(true);}
  }else if(ready){const h=Math.cos(pitch)*distance;camera.position.set(orbitTarget.x+Math.sin(yaw)*h,orbitTarget.y+Math.sin(pitch)*distance,orbitTarget.z+Math.cos(yaw)*h);camera.lookAt(orbitTarget);}
  document.querySelectorAll('#landmarkStations button').forEach(button=>{button.disabled=!ready;});
  renderer.render(scene,camera);
}
document.querySelector('#landmarkReset').addEventListener('click',()=>fullView());
document.querySelector('#landmarkFullscreen').addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await workbench.requestFullscreen();}
  catch{window.toast?.('当前浏览器暂不支持全屏观察');}
});
document.addEventListener('fullscreenchange',()=>{document.querySelector('#landmarkFullscreen').textContent=document.fullscreenElement?'⛶ 退出全屏':'⛶ 放大观察';resize();});
for(const id of ['landmarkBack','landmarkReturn'])document.querySelector(`#${id}`).addEventListener('click',()=>{requestId++;cancelMotion();window.navigate('globe');});
document.querySelector('#landmarkRead').addEventListener('click',()=>readCulture(current));
window.FufuScenes.register('landmark',()=>{
  scope=createSceneScope();const instance=scope;setup();instance.cleanup(()=>sky?.dispose());
  return {pause(){requestId++;drag=null;cancelMotion();instance.pause();},resume:instance.resume,dispose(){
    requestId++;cancelMotion();ready=false;
    for(const promise of assets.values())promise.then(disposeGraph).catch(()=>{});
    assets.clear();instance.dispose();renderer=scene=camera=exteriorGroup=sky=ground=keyLight=null;
  }};
});
