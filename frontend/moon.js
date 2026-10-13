import * as THREE from './vendor/three.module.js';
import { createSceneScope, disposeGraph } from './scene-scope.js?v=20261003-lifecycle-1';
window.FufuScenes.register('moon', saved => {
const scope=createSceneScope();

const host = document.querySelector('#moonCanvasHost');
if (host) {
  const phases = [
    { name: '新月', short: '几乎看不见', text: '月球位于地球和太阳之间。它朝向地球的一面较暗，所以我们几乎看不见月亮。' },
    { name: '蛾眉月', short: '右边露出细弯', text: '月球沿轨道向前走，我们开始看到一小部分被太阳照亮的月面，亮光像一弯细细的月牙。' },
    { name: '上弦月', short: '右半边明亮', text: '从地球看，月亮右半边明亮。月球、地球与太阳大致形成一个直角。' },
    { name: '盈凸月', short: '亮面越来越多', text: '月亮亮起的部分超过一半，而且还在增加。再过几天，就会来到满月。' },
    { name: '满月', short: '圆圆的亮月', text: '地球大致位于太阳与月球之间。月球朝向地球的这一面被太阳照亮，看起来又圆又亮。' },
    { name: '亏凸月', short: '亮面开始变少', text: '满月之后，能看到的亮面慢慢减少，但此时仍超过半个月面。' },
    { name: '下弦月', short: '左半边明亮', text: '从地球看，月亮左半边明亮。它又走到了与太阳方向大致成直角的位置。' },
    { name: '残月', short: '左边剩下细弯', text: '亮面继续缩小，只剩左侧一弯细细的月牙。接下来又会回到新月。' }
  ];
  const modeButtons = [...document.querySelectorAll('.moon-mode')];
  const phaseButtons = document.querySelector('#phaseSteps');
  const slider = document.querySelector('#moonTime');
  const readButton = document.querySelector('#moonRead');
  const title = document.querySelector('#moonExplainTitle');
  const body = document.querySelector('#moonExplainBody');
  const kicker = document.querySelector('#moonExplainKicker');
  const extra = document.querySelector('#moonExplainExtra');
  const day = document.querySelector('#moonDay');
  const fraction = document.querySelector('#moonIllumination');
  const previewCanvas = document.querySelector('#moonPhasePreview');
  const preview = previewCanvas.getContext('2d');
  let moonPixels=null;
  const moonPreviewImage=scope.image();
  moonPreviewImage.onload=()=>{
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
    const context=canvas.getContext('2d');context.drawImage(moonPreviewImage,0,0,512,256);
    moonPixels=context.getImageData(0,0,512,256).data;
    if(state.mode==='phase')drawMoonPhase();
  };
  moonPreviewImage.src='/assets/moon-nasa.jpg';
  const stage = document.querySelector('.moon-stage');
  const stageTitle = document.querySelector('#moonSceneTitle');
  const stageSubtitle = document.querySelector('#moonSceneSubtitle');
  const objectLabels = {
    earth: document.querySelector('#moonEarthLabel'),
    moon: document.querySelector('#moonSatelliteLabel'),
    near: document.querySelector('#moonTideNearLabel'),
    far: document.querySelector('#moonTideFarLabel')
  };
  const state = { angle: 90, playing: false, mode: 'phase', ...saved };
  scope.capture(()=>({...state}));
  let renderer;

  function seededRandom(seed) {
    let value = seed;
    return () => { value = (1664525 * value + 1013904223) >>> 0; return value / 4294967296; };
  }
  function loadSurfaceTexture(url, material, downsample) {
    const image=scope.image();
    image.onload=()=>{
      if(scope.disposed)return;
      let texture;
      if(downsample){
        const canvas=document.createElement('canvas');canvas.width=Math.min(image.naturalWidth,1536);canvas.height=Math.round(canvas.width/2);
        canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
        texture=new THREE.CanvasTexture(canvas);
      }else texture=new THREE.Texture(image);
      texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);
      texture.needsUpdate=true;material.map=texture;material.needsUpdate=true;
    };
    image.src=url;
  }
  function glowTexture() {
    const canvas = document.createElement('canvas'); canvas.width=canvas.height=128;
    const c=canvas.getContext('2d'); const g=c.createRadialGradient(64,64,4,64,64,64);
    g.addColorStop(0,'#fff9d6');g.addColorStop(.2,'#ffdb82dd');g.addColorStop(.6,'#ed99454d');g.addColorStop(1,'#ed994500');
    c.fillStyle=g;c.fillRect(0,0,128,128);return new THREE.CanvasTexture(canvas);
  }
  let scene, camera, earth, moon, moonGlow, tideShell, tideNear, tideFar, moonLine;
  let viewYaw=.2, viewPitch=.38, viewDistance=16, pointerStart=null;
  let targetYaw=viewYaw,targetPitch=viewPitch,targetDistance=viewDistance;
  let transitionCamera=null;
  const cameraFocus=new THREE.Vector3();
  try {
    scene = new THREE.Scene(); // Transparent canvas reveals the shared quiet space backdrop.
    camera = new THREE.PerspectiveCamera(44,1,.1,100); camera.position.set(0,7,16);
    renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:'high-performance' });
    scope.own(scene, renderer);
  renderer.setPixelRatio((window.FufuPerformance?.pixelRatio || Math.min(window.devicePixelRatio || 1, 1.5)));
    renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.5;
    host.append(renderer.domElement); renderer.domElement.style.touchAction='none';
    renderer.domElement.setAttribute('aria-label','地球、月球和阳光的三维轨道模型');
    scene.add(new THREE.AmbientLight(0x6482ad,.55));
    const sunlight = new THREE.DirectionalLight(0xffe7bc,3.25); sunlight.position.set(-14,1,0); scene.add(sunlight);
    const sun = new THREE.Mesh(new THREE.SphereGeometry(1,32,24),new THREE.MeshBasicMaterial({color:0xffd687}));
    sun.position.set(-10.2,0,0);scene.add(sun);
    const sunGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture(),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));
    sunGlow.position.copy(sun.position);sunGlow.scale.set(6.5,6.5,1);scene.add(sunGlow);
    const earthMaterial=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.93});
    earth=new THREE.Mesh(new THREE.SphereGeometry(2.15,64,48),earthMaterial);earth.rotation.y=-.5;scene.add(earth);
    const atmosphere=new THREE.Mesh(new THREE.SphereGeometry(2.29,64,48),new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,uniforms:{glowColor:{value:new THREE.Color('#51baff')}},
      vertexShader:'varying vec3 vNormal;varying vec3 vView;void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);vNormal=normalize(normalMatrix*normal);vView=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
      fragmentShader:'uniform vec3 glowColor;varying vec3 vNormal;varying vec3 vView;void main(){float rim=pow(1.0-max(dot(vNormal,vView),0.0),2.5);gl_FragColor=vec4(glowColor,rim*0.55);}'
    }));scene.add(atmosphere);
    const moonMaterial=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1});
    moon=new THREE.Mesh(new THREE.SphereGeometry(.81,48,36),moonMaterial);scene.add(moon);
    moonGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture(),color:0x8fbeff,transparent:true,blending:THREE.AdditiveBlending,opacity:.38,depthWrite:false}));
    moonGlow.scale.set(2.5,2.5,1);scene.add(moonGlow);
    loadSurfaceTexture('/assets/optimized/earth-99f5faad74efe985fbf1714c-1536.webp',earthMaterial,true);
    loadSurfaceTexture('/assets/moon-nasa.jpg',moonMaterial,false);
    const orbitPoints=Array.from({length:193},(_,i)=>new THREE.Vector3(-6.4*Math.cos(i/192*Math.PI*2),0,6.4*Math.sin(i/192*Math.PI*2)));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(orbitPoints),new THREE.LineBasicMaterial({color:0x85accd,transparent:true,opacity:.5})));
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4;
      const marker=new THREE.Mesh(new THREE.SphereGeometry(i%2===0 ? .085 : .055,12,8),new THREE.MeshBasicMaterial({color:i%2===0 ? 0x9ecdea : 0x617e9a}));
      marker.position.set(-6.4*Math.cos(a),0,6.4*Math.sin(a));scene.add(marker);
    }
    for(const y of [-1.7,0,1.7]){
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-8.7,y,-4.3),new THREE.Vector3(8.5,y,-4.3)]),new THREE.LineBasicMaterial({color:0xffdc95,transparent:true,opacity:.12,depthWrite:false}));scene.add(line);
    }
    moonLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:0xd2eaff,transparent:true,opacity:.45}));scene.add(moonLine);
    tideShell=new THREE.Mesh(new THREE.SphereGeometry(1,64,48),new THREE.MeshBasicMaterial({color:0x40caff,transparent:true,opacity:.4,depthWrite:false,side:THREE.BackSide}));
    tideShell.scale.set(2.82,2.25,2.25);scene.add(tideShell);
    const bulgeMaterial=new THREE.MeshBasicMaterial({color:0x56cfff,transparent:true,opacity:.18,depthWrite:false});
    tideNear=new THREE.Mesh(new THREE.SphereGeometry(.52,24,16),bulgeMaterial);tideFar=new THREE.Mesh(new THREE.SphereGeometry(.52,24,16),bulgeMaterial.clone());scene.add(tideNear,tideFar);
    const rand=seededRandom(42),starPositions=[];
    for(let i=0;i<1400;i++){const a=rand()*Math.PI*2,z=rand()*2-1,d=28+rand()*36,s=Math.sqrt(1-z*z);starPositions.push(Math.cos(a)*s*d,z*d,Math.sin(a)*s*d);}
    const starGeo=new THREE.BufferGeometry();starGeo.setAttribute('position',new THREE.Float32BufferAttribute(starPositions,3));
    scene.add(new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xd7eaff,size:.12,transparent:true,opacity:.8})));
  } catch(error) {
    host.innerHTML='<div class="moon-fallback">这台设备暂时无法显示 3D 模型。请用支持 WebGL 的浏览器再试一次。</div>';
    console.warn('Earth–Moon renderer unavailable:',error);
  }

  function phaseIndex() { return Math.floor(((state.angle+22.5)%360)/45); }
  function tideKind() {
    const separation=Math.abs(Math.cos(state.angle*Math.PI/180));
    return separation>.85?'spring':separation<.4?'neap':'middle';
  }
  function drawMoonPhase() {
    const size=previewCanvas.width, center=size/2, radius=size*.39;
    preview.clearRect(0,0,size,size);
    const a=state.angle*Math.PI/180, sunX=Math.sin(a), sunZ=-Math.cos(a);
    const image=preview.createImageData(size,size);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const px=(x-center)/radius,py=(y-center)/radius,rr=px*px+py*py;
      if(rr>1)continue;
      const z=Math.sqrt(1-rr),lit=Math.max(0,px*sunX+z*sunZ),shade=lit>0?Math.min(1,.23+lit*.98):.12;
      const edge=Math.min(1,(1-Math.sqrt(rr))*radius/2);
      const i=(y*size+x)*4;
      if(moonPixels){
        const u=Math.min(511,Math.max(0,Math.floor((.5+Math.atan2(px,z)/(Math.PI*2))*512)));
        const v=Math.min(255,Math.max(0,Math.floor((.5-Math.asin(-py)/Math.PI)*256)));
        const source=(v*512+u)*4;
        image.data[i]=moonPixels[source]*shade;
        image.data[i+1]=moonPixels[source+1]*shade;
        image.data[i+2]=moonPixels[source+2]*shade;
      }else{
        const noise=(Math.sin(x*.42+y*.73)+Math.sin(x*.11-y*.26))*3;
        image.data[i]=Math.max(0,Math.min(255,225*shade+noise));
        image.data[i+1]=Math.max(0,Math.min(255,229*shade+noise));
        image.data[i+2]=Math.max(0,Math.min(255,238*shade+noise));
      }
      image.data[i+3]=Math.round(255*edge);
    }
    preview.putImageData(image,0,0);
  }
  function drawTideDiagram() {
    const size=previewCanvas.width,c=size/2,a=state.angle*Math.PI/180;
    preview.clearRect(0,0,size,size);
    preview.save();preview.translate(c,c);preview.rotate(Math.PI-a);
    preview.fillStyle='#4ec6ef34';preview.strokeStyle='#83dfff';preview.lineWidth=2;
    preview.beginPath();preview.ellipse(0,0,61,43,0,0,Math.PI*2);preview.fill();preview.stroke();
    const water=preview.createRadialGradient(-12,-13,5,0,0,45);
    water.addColorStop(0,'#6ad1e1');water.addColorStop(.55,'#237bae');water.addColorStop(1,'#164d82');
    preview.fillStyle=water;preview.beginPath();preview.arc(0,0,40,0,Math.PI*2);preview.fill();
    preview.strokeStyle='#b3ebffbb';preview.lineWidth=1;preview.beginPath();preview.arc(0,0,40,0,Math.PI*2);preview.stroke();
    preview.fillStyle='#d7f8ff';preview.beginPath();preview.arc(77,0,9,0,Math.PI*2);preview.fill();
    preview.restore();
    preview.fillStyle='#d5f0ff';preview.textAlign='center';preview.font='11px sans-serif';
    preview.fillText('两侧海水隆起',c,size-8);
  }
  function updateExplanation() {
    const index=phaseIndex(),phase=phases[index],tide=tideKind();
    const lit=Math.round((1-Math.cos(state.angle*Math.PI/180))*50);
    slider.value=Math.round(state.angle);day.textContent=`月相周期第 ${(state.angle/360*29.5).toFixed(1)} 天`;
    fraction.textContent=state.mode==='phase'?`可见亮面约 ${lit}%`:'蓝色两端：理想化的高潮区域';
    document.querySelectorAll('[data-phase]').forEach(button=>{const active=Number(button.dataset.phase)===index;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    modeButtons.forEach(button=>{const active=button.dataset.mode===state.mode;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    stage.classList.toggle('tide-mode',state.mode==='tide');
    stageTitle.textContent=state.mode==='phase'?phase.name:tide==='spring'?'大潮附近':tide==='neap'?'小潮附近':'潮汐力';
    stageSubtitle.textContent=state.mode==='phase'?phase.short:'看蓝色隆起与月球的方向';
    previewCanvas.parentElement.classList.toggle('tide-view',state.mode==='tide');
    previewCanvas.parentElement.querySelector('.eyebrow').textContent=state.mode==='phase'?'从地球看到的月亮':'从上方看潮汐隆起';
    previewCanvas.setAttribute('aria-label',state.mode==='phase'?`${phase.name}月相预览`:'地球两侧海水隆起示意');
    if(state.mode==='phase'){
      kicker.textContent='月相观察';title.textContent=phase.name;
      body.textContent=phase.text;
      extra.textContent='月相改变，是因为我们从地球看到的月球受光部分不同，并不是地球的影子每天遮住了月球。';
    }else{
      kicker.textContent='潮汐力示意';title.textContent=tide==='spring'?'大潮附近':tide==='neap'?'小潮附近':'两处海水隆起';
      body.textContent='月球一侧受到较强的引力，背向月球的一侧在地月共同运动中也形成隆起。蓝色的两个隆起表示理想化的高潮区域。';
      extra.textContent=(tide==='spring'?'新月或满月附近，太阳和月球的潮汐作用方向大致一致，潮差往往更大。':tide==='neap'?'上弦月或下弦月附近，太阳和月球的潮汐作用方向大致成直角，潮差往往较小。':'拖动时间滑杆，比较新月、上弦月与满月附近的潮汐差别。')+'实际海岸的潮位还会受到地形、水深和天气影响。';
    }
    if(renderer){tideShell.visible=tideNear.visible=tideFar.visible=state.mode==='tide';}
    if(state.mode==='phase')drawMoonPhase();else drawTideDiagram();
  }
  phaseButtons.innerHTML=phases.map((phase,i)=>`<button type="button" data-phase="${i}"><span>${['🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘'][i]}</span>${phase.name}</button>`).join('');
  scope.listen(phaseButtons, 'click',event=>{const button=event.target.closest('[data-phase]');if(!button)return;state.angle=Number(button.dataset.phase)*45;state.playing=false;syncPlay();updateExplanation();});
  modeButtons.forEach(button=>scope.listen(button, 'click',()=>{state.mode=button.dataset.mode;updateExplanation();}));
  scope.listen(slider, 'input',()=>{state.angle=Number(slider.value)%360;state.playing=false;syncPlay();updateExplanation();});
  const play=document.querySelector('#moonPlay');
  function syncPlay(){play.textContent=state.playing?'⏸ 暂停演示':'▶ 自动演示';}
  window.pauseMoonForTransition=()=>{const wasPlaying=state.playing;if(wasPlaying){state.playing=false;syncPlay();}return()=>{if(wasPlaying){state.playing=true;syncPlay();}};};
  scope.listen(play, 'click',()=>{state.playing=!state.playing;syncPlay();});
  scope.listen(document.querySelector('#moonStepBack'), 'click',()=>{state.angle=(Math.round(state.angle/45)*45-45+360)%360;state.playing=false;syncPlay();updateExplanation();});
  scope.listen(document.querySelector('#moonStepNext'), 'click',()=>{state.angle=(Math.round(state.angle/45)*45+45)%360;state.playing=false;syncPlay();updateExplanation();});
  scope.listen(readButton, 'click',()=>{
    const phase=phases[phaseIndex()];
    const narration=state.mode==='phase'
      ? `现在我们看到的是${phase.name}。${phase.text}月相的变化，是因为从地球看到的受光月面不断改变。完整的月相周期大约是二十九天半。`
      : `来看潮汐力。${body.textContent}${extra.textContent}这里展示的是原理。真实海岸的潮位还会受到海岸形状、水深和天气等影响。`;
    if(typeof window.speak==='function')window.speak(narration);
  });
  function resize(){if(!renderer)return;const rect=host.getBoundingClientRect();if(!rect.width||!rect.height)return;camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();renderer.setSize(rect.width,rect.height,false);}
  if(renderer){
    new scope.ResizeObserver(resize).observe(host);scope.listen(window, 'resize',resize);
    const element=renderer.domElement;
    const earthRaycaster=new THREE.Raycaster(),clickPoint=new THREE.Vector2();
    scope.listen(element, 'pointerdown',event=>{pointerStart={x:event.clientX,y:event.clientY,yaw:targetYaw,pitch:targetPitch,moved:false,slack:event.pointerType==='touch'?14:5};element.setPointerCapture(event.pointerId);});
    scope.listen(element, 'pointermove',event=>{if(!pointerStart)return;const dx=event.clientX-pointerStart.x,dy=event.clientY-pointerStart.y;if(Math.abs(dx)+Math.abs(dy)>pointerStart.slack)pointerStart.moved=true;if(!pointerStart.moved)return;targetYaw=pointerStart.yaw-dx*.006;targetPitch=Math.max(-.15,Math.min(1.48,pointerStart.pitch+dy*.005));});
    scope.listen(element, 'pointerup',event=>{
      if(pointerStart&&!pointerStart.moved){
        const rect=element.getBoundingClientRect();
        clickPoint.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
        earthRaycaster.setFromCamera(clickPoint,camera);
        const hit=earthRaycaster.intersectObjects([earth,moon],false)[0]?.object;
        if(hit===earth)window.navigateWithZoom('globe','earth',event);else if(hit===moon)window.navigateWithZoom('lunar','moon',event);
      }
      pointerStart=null;
    });scope.listen(element, 'pointercancel',()=>{pointerStart=null;});
    scope.listen(element, 'wheel',event=>{event.preventDefault();targetDistance=Math.max(12,Math.min(31,targetDistance+Math.sign(event.deltaY)*1.2));},{passive:false});
    scope.listen(document.querySelector('#moonAngleView'), 'click',()=>{targetYaw=.2;targetPitch=.38;targetDistance=16;});
    scope.listen(document.querySelector('#moonTopView'), 'click',()=>{targetYaw=0;targetPitch=1.45;targetDistance=23;});
    scope.listen(document.querySelector('#moonToGlobe'), 'click',event=>window.navigateWithZoom('globe','earth',event.currentTarget));
    window.zoomMoonForTransition=body=>{
      transitionCamera={started:performance.now(),duration:900,startDistance:viewDistance,startFocus:cameraFocus.clone(),endDistance:body==='moon'?4.8:8.5,endFocus:(body==='moon'?moon.position:earth.position).clone()};
    };
    const clock=scope.clock(new THREE.Clock());let uiCounter=0;
    const labelPoint=new THREE.Vector3();
    function placeLabel(element,point,offsetX=0){
      labelPoint.copy(point).project(camera);
      const w=host.clientWidth,h=host.clientHeight;
      const x=(labelPoint.x*.5+.5)*w+offsetX,y=(-labelPoint.y*.5+.5)*h;
      element.style.left=`${x}px`;element.style.top=`${y}px`;
      element.style.visibility=labelPoint.z<1&&x>35&&x<w-35&&y>35&&y<h-35?'visible':'hidden';
    }
    function animate(){scope.frame(animate);const dt=Math.min(clock.getDelta(),.05);if(!document.querySelector('#page-moon').classList.contains('active')||document.hidden)return;
      if(state.playing){state.angle=(state.angle+dt*8)%360;uiCounter+=dt;if(uiCounter>.08){updateExplanation();uiCounter=0;}}
      const a=state.angle*Math.PI/180,direction=new THREE.Vector3(-Math.cos(a),0,Math.sin(a));
      moon.position.copy(direction).multiplyScalar(6.4);moon.rotation.y=a;
      moonGlow.position.copy(moon.position);moonGlow.material.opacity=.29+.1*Math.sin(performance.now()*.002);
      earth.rotation.y+=dt*.045;
      const linePositions=moonLine.geometry.attributes.position;linePositions.setXYZ(1,moon.position.x,moon.position.y,moon.position.z);linePositions.needsUpdate=true;
      // Three.js 的 Y 轴旋转会将 +X 轴转向 -Z；与月球方向保持一致。
      tideShell.rotation.y=Math.PI+a;tideNear.position.copy(direction).multiplyScalar(2.45);tideFar.position.copy(direction).multiplyScalar(-2.45);
      const easing=Math.min(1,dt*7);
      viewYaw+=(targetYaw-viewYaw)*easing;viewPitch+=(targetPitch-viewPitch)*easing;viewDistance+=(targetDistance-viewDistance)*easing;
      if(transitionCamera){
        const progress=Math.min(1,(performance.now()-transitionCamera.started)/transitionCamera.duration),eased=progress*progress*(3-2*progress);
        viewDistance=THREE.MathUtils.lerp(transitionCamera.startDistance,transitionCamera.endDistance,eased);
        cameraFocus.copy(transitionCamera.startFocus).lerp(transitionCamera.endFocus,eased);
        if(progress>=1)transitionCamera=null;
      }
      camera.position.set(cameraFocus.x+Math.sin(viewYaw)*Math.cos(viewPitch)*viewDistance,cameraFocus.y+Math.sin(viewPitch)*viewDistance,cameraFocus.z+Math.cos(viewYaw)*Math.cos(viewPitch)*viewDistance);
      camera.lookAt(cameraFocus);renderer.render(scene,camera);
      const topViewBlend=Math.max(0,Math.min(1,(viewPitch-1)/.35));
      placeLabel(objectLabels.earth,new THREE.Vector3(0,-2.7,0),topViewBlend*105);
      placeLabel(objectLabels.moon,moon.position.clone().add(new THREE.Vector3(0,-1.25,0)),topViewBlend*80);
      if(state.mode==='tide'){
        placeLabel(objectLabels.near,direction.clone().multiplyScalar(3.2).add(new THREE.Vector3(0,.48,0)));
        placeLabel(objectLabels.far,direction.clone().multiplyScalar(-3.2).add(new THREE.Vector3(0,.48,0)));
      }
    }
    resize();animate();
  }
  scope.hooks(['pauseMoonForTransition','zoomMoonForTransition']);
  updateExplanation();syncPlay();
}

return scope;
});
