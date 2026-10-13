import * as THREE from './vendor/three.module.js';
import { createSceneScope } from './scene-scope.js?v=20261003-lifecycle-1';

// Independent Fufu implementation; ORBIT inspired the observation / lighting UX.
// Licensed texture sources and local transformations: /assets/solar/CREDITS.md.
async function readCatalog(){
  for(;;){
    try{
      const response=await fetch('/api/solar/catalog');
      if(!response.ok)throw new Error('场景资料暂时无法读取');
      const data=await response.json();
      if(!Array.isArray(data.items)||data.items.length!==10)throw new Error('场景资料不完整');
      return data;
    }catch(error){
      // Keep import pending so a temporary backend error does not poison the
      // browser's ESM cache; the learner can retry without reloading the app.
      const host=document.querySelector('#solarCanvasHost');
      const message=document.createElement('div');message.className='solar-fallback';
      const text=document.createElement('p');text.textContent='星球资料还没有准备好，请再试一次。';
      const retry=document.createElement('button');retry.type='button';retry.textContent='重新加载太阳系';
      message.append(text,retry);host.replaceChildren(message);
      await new Promise(resolve=>retry.addEventListener('click',resolve,{once:true}));
      text.textContent='正在读取星球资料…';retry.disabled=true;
    }
  }
}
const catalog = await readCatalog(), bodies = catalog.items;
const periods = {mercury:88,venus:225,earth:365.25,mars:687,jupiter:4333,saturn:10759,uranus:30687,neptune:60190};
const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

window.FufuScenes.register('solar', saved => {
  const scope=createSceneScope(),host=document.querySelector('#solarCanvasHost');
  if(!host)return scope;
  try{
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(44,1,.02,500);
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
  scope.own(scene,renderer);
  renderer.setPixelRatio(Math.min(window.FufuPerformance?.pixelRatio || devicePixelRatio || 1,1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  host.replaceChildren(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','太阳系模型，拖动旋转，双指缩放，点击星球近看');renderer.domElement.style.touchAction='none';
  scene.add(new THREE.AmbientLight(0x9eaecb,.35));
  // Illuminate every planet from the Sun; distances are educational, not physical.
  scene.add(new THREE.PointLight(0xfff3dc,3.2,0,0));
  const sphere=new THREE.SphereGeometry(1,48,32),roots=new Map(),surfaces=new Map(),textures=new Map();
  const uniforms={sunDirection:{value:new THREE.Vector3(1,0,0)},nightMap:{value:null}};
  const orbitGroup=new THREE.Group();scene.add(orbitGroup);
  const target=new THREE.Vector3(),nextTarget=new THREE.Vector3(),temp=new THREE.Vector3(),zero=new THREE.Vector3(),q=new THREE.Quaternion();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),byId=Object.fromEntries(bodies.map(b=>[b.id,b]));
  let selected=saved.selected || 'earth',closeup=!!saved.closeup,playing=saved.playing ?? !reduced.matches;
  let speed=saved.speed || 1,clock=saved.clock || 0,yaw=saved.yaw || 0,pitch=saved.pitch ?? .58;
  let distance=saved.distance || 72,desiredDistance=distance,flight=null,transitionZoom=null;
  let labelsOn=saved.labelsOn ?? true,orbitsOn=saved.orbitsOn ?? true,w=1,h=1;
  const deltaClock=scope.clock(new THREE.Clock()),stage=host.closest('.solar-stage');
  const layout=stage.closest('.solar-layout'),page=stage.closest('.page');
  const maximizeButton=document.querySelector('#solarMaximize');
  let maximized=false,previousOverflow='';
  function maximize(value,restoreFocus=true){
    if(value===maximized)return;
    maximized=value;layout.classList.toggle('is-maximized',value);
    maximizeButton.textContent=value?'↙ 还原':'⛶ 最大化';
    maximizeButton.setAttribute('aria-expanded',String(value));
    maximizeButton.setAttribute('aria-label',value?'还原太阳系':'最大化太阳系');
    if(value){previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';layout.setAttribute('role','dialog');layout.setAttribute('aria-modal','true');layout.setAttribute('aria-label','太阳系观察工作台');}
    else{document.body.style.overflow=previousOverflow;layout.removeAttribute('role');layout.removeAttribute('aria-modal');layout.removeAttribute('aria-label');}
    if(restoreFocus)maximizeButton.focus({preventScroll:true});
  }
  scope.listen(maximizeButton,'click',()=>maximize(!maximized));
  scope.listen(document,'keydown',event=>{
    if(!maximized)return;
    if(event.key==='Escape'){event.preventDefault();maximize(false);}
    if(event.key==='Tab'){
      const items=[...layout.querySelectorAll('button,a[href]')].filter(node=>!node.disabled&&!node.hidden&&node.getClientRects().length);
      const first=items[0],last=items[items.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  });
  new scope.MutationObserver(()=>{if(!page.classList.contains('active'))maximize(false,false);}).observe(page,{attributes:true,attributeFilter:['class']});
  scope.cleanup(()=>maximize(false,false));
  function overlay(className){const node=document.createElement('div');node.className=className;stage.append(node);scope.cleanup(()=>node.remove());return node;}
  const labels=overlay('solar-labels'),badge=overlay('solar-view-badge'),loadStatus=overlay('solar-load-status'),labelNodes=new Map();
  badge.setAttribute('role','status');loadStatus.textContent='正在铺开星球表面…';
  function ringLine(radius,parent=orbitGroup,color=0x7292b5){
    const points=Array.from({length:161},(_,i)=>new THREE.Vector3(Math.cos(i/160*Math.PI*2)*radius,0,Math.sin(i/160*Math.PI*2)*radius));
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,transparent:true,opacity:.25}));parent.add(line);return line;
  }
  function atmosphere(parent,radius,color){
    const glow=new THREE.Mesh(sphere,new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.BackSide,blending:THREE.AdditiveBlending,
      uniforms:{tint:{value:new THREE.Color(color)}},
      vertexShader:'varying vec3 n;varying vec3 v;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',
      fragmentShader:'uniform vec3 tint;varying vec3 n;varying vec3 v;void main(){float edge=pow(1.-abs(dot(normalize(n),normalize(v))),3.);gl_FragColor=vec4(tint,edge*.22);}'
    }));glow.scale.setScalar(radius*1.04);parent.add(glow);
  }
  function glowTexture(){const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
    const ctx=canvas.getContext('2d'),g=ctx.createRadialGradient(64,64,8,64,64,64);
    g.addColorStop(0,'#ffe9b6c0');g.addColorStop(.32,'#ffc56855');g.addColorStop(1,'#ff8a3000');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);return new THREE.CanvasTexture(canvas);}
  let earthClouds,moonOrbit,saturnRing;
  for(const b of bodies){
    const root=new THREE.Group();root.userData.id=b.id;scene.add(root);roots.set(b.id,root);
    const tilted=new THREE.Group();tilted.rotation.z=b.id==='uranus'?1.7:b.id==='saturn'?.466:b.id==='earth'?.409:0;root.add(tilted);
    const material=b.id==='sun'?new THREE.MeshBasicMaterial({color:0xffc672}):new THREE.MeshStandardMaterial({color:b.color,roughness:.92});
    const surface=new THREE.Mesh(sphere,material);surface.scale.setScalar(b.size);surface.userData.id=b.id;tilted.add(surface);surfaces.set(b.id,surface);
    if(b.orbit)ringLine(b.orbit);
    if(b.id==='earth'){
      material.onBeforeCompile=shader=>{
        shader.uniforms.sunDirection=uniforms.sunDirection;shader.uniforms.nightMap=uniforms.nightMap;
        shader.vertexShader='uniform vec3 sunDirection;varying float solarDot;varying vec2 planetUv;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nsolarDot=dot(normalize(objectNormal),sunDirection);planetUv=uv;');
        shader.fragmentShader='uniform sampler2D nightMap;varying float solarDot;varying vec2 planetUv;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=texture2D(nightMap,planetUv).rgb*(1.-smoothstep(-.2,.12,solarDot))*.8;');
      };
      earthClouds=new THREE.Mesh(sphere,new THREE.MeshStandardMaterial({transparent:true,opacity:.5,depthWrite:false,roughness:1}));earthClouds.scale.setScalar(1.015);surface.add(earthClouds);
      atmosphere(tilted,b.size,0x5ba6e6);moonOrbit=ringLine(1.3,root,0x809abd);
    }
    if(b.id==='venus')atmosphere(tilted,b.size,0xf8c883);
    if(b.id==='neptune'||b.id==='uranus')atmosphere(tilted,b.size,0x85cde5);
    if(b.id==='sun'){const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture(),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));glow.scale.set(13,13,1);root.add(glow);}
    if(b.id==='saturn'){
      const geometry=new THREE.RingGeometry(b.size*1.25,b.size*2.3,128),uv=geometry.attributes.uv,pos=geometry.attributes.position;
      for(let i=0;i<pos.count;i++)uv.setXY(i,(Math.hypot(pos.getX(i),pos.getY(i))-b.size*1.25)/(b.size*1.05),.5);
      // Keep the thin ring legible from both faces at this schematic scale.
      saturnRing=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0xd7c494,side:THREE.DoubleSide,transparent:true,depthWrite:false}));saturnRing.rotation.x=-Math.PI/2;tilted.add(saturnRing);
    }
    const label=document.createElement('button');label.type='button';label.textContent=b.name;label.dataset.planet=b.id;labels.append(label);labelNodes.set(b.id,label);scope.listen(label,'click',()=>select(b.id,true));
  }
  // One static star draw call. No full-screen bloom / 8K textures on tablets.
  const stars=[];let seed=28;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<850;i++){const a=random()*Math.PI*2,z=random()*2-1,r=95+random()*70,s=Math.sqrt(1-z*z);stars.push(Math.cos(a)*s*r,z*r,Math.sin(a)*s*r);}
  const starGeometry=new THREE.BufferGeometry();starGeometry.setAttribute('position',new THREE.Float32BufferAttribute(stars,3));
  scene.add(new THREE.Points(starGeometry,new THREE.PointsMaterial({color:0xc9d8ee,size:.16,transparent:true,opacity:.65})));
  const loader=new THREE.TextureLoader();scope.cleanup(()=>textures.forEach(texture=>texture.dispose()));
  let loaded=0,failures=0;
  function finishLoad(){if(scope.disposed)return;if(++loaded===Object.keys(catalog.textures).length){loadStatus.textContent=failures?'部分表面未加载，仍可观察星球':'';loadStatus.hidden=!failures;}}
  for(const [id,path] of Object.entries(catalog.textures))loader.load(path,texture=>{
    if(scope.disposed){texture.dispose();return;}
    texture.colorSpace=id==='earth-clouds'?THREE.NoColorSpace:THREE.SRGBColorSpace;textures.set(id,texture);
    if(surfaces.has(id)){const mat=surfaces.get(id).material;mat.map=texture;mat.color.set(0xffffff);mat.needsUpdate=true;}
    if(id==='earth-night'){uniforms.nightMap.value=texture;surfaces.get('earth').material.needsUpdate=true;}
    if(id==='earth-clouds'){earthClouds.material.alphaMap=texture;earthClouds.material.needsUpdate=true;}
    if(id==='saturn-rings'){saturnRing.material.map=texture;saturnRing.material.color.set(0xffffff);saturnRing.material.needsUpdate=true;}finishLoad();
  },undefined,()=>{failures++;finishLoad();});
  const list=document.querySelector('#planetList'),card=document.querySelector('#planetCard');
  list.innerHTML=bodies.map(b=>`<button type="button" class="planet-option" data-planet="${esc(b.id)}"><span style="--planet-color:${esc(b.color)}"></span>${esc(b.name)}</button>`).join('');
  scope.listen(list,'click',event=>{const b=event.target.closest('[data-planet]');if(b)select(b.dataset.planet,true);});
  // One delegated listener; switching planets does not accumulate old closures.
  scope.listen(card,'click',event=>{
    if(event.target.closest('.planet-read')){const b=byId[selected];window.speak?.(`让我们认识${b.name}。${b.intro}${b.detail}${b.id==='sun'?'':`它${b.id==='moon'?'绕地球':'绕太阳'}一周，大约需要${b.year}。`}`);}
    if(event.target.closest('.planet-to-globe'))window.navigateWithZoom('globe','earth',event.target);
    if(event.target.closest('.planet-to-lunar'))window.navigate('lunar');
  });
  function select(id,focus=false){const b=byId[id];if(!b)return;selected=id;
    list.querySelectorAll('button').forEach(button=>{const active=button.dataset.planet===id;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});labelNodes.forEach((label,key)=>label.setAttribute('aria-pressed',String(key===id)));
    card.innerHTML=`<div class="eyebrow">${esc(b.kind)}</div><h2>${esc(b.name)}</h2><div class="planet-meta"><span>${id==='sun'?'所在位置':id==='moon'?'绕地球一周':'绕太阳一周'}</span><strong>${esc(b.year)}</strong></div><p>${esc(b.intro)}</p><p>${esc(b.detail)}</p><button class="planet-read" type="button">听星球介绍</button>${id==='earth'?'<button class="planet-to-globe" type="button">进入地球仪 →</button>':id==='moon'?'<button class="planet-to-lunar" type="button">探索月面环形山 →</button>':''}`;
    if(focus){closeup=true;const pos=roots.get(id).position;let angle=Math.atan2(-pos.x,-pos.z)+.75;if(id==='sun')angle=.35;
      flight={elapsed:0,duration:reduced.matches?.01:1.15,startDistance:distance,endDistance:Math.max(id==='saturn'?11*b.size:6*b.size,2.5),startYaw:yaw,endYaw:yaw+Math.atan2(Math.sin(angle-yaw),Math.cos(angle-yaw)),startPitch:pitch,endPitch:.25};}updateBadge();
  }
  function updateBadge(){badge.textContent=closeup?`${byId[selected].name} · 近距离观察`:'太阳系全景 · 点一颗星球近看';}
  const playButton=document.querySelector('#solarPlay'),speedButton=document.querySelector('#solarSpeed'),controls=stage.querySelector('.solar-controls'),additional=[];
  function control(id,text,fn){const button=document.createElement('button');button.id=id;button.type='button';button.textContent=text;controls.append(button);additional.push(button);scope.listen(button,'click',fn);return button;}
  const orbitButton=control('solarOrbits','轨道',()=>{orbitsOn=!orbitsOn;orbitGroup.visible=orbitsOn;orbitButton.setAttribute('aria-pressed',String(orbitsOn));});orbitButton.setAttribute('aria-pressed',String(orbitsOn));orbitGroup.visible=orbitsOn;
  const labelButton=control('solarLabels','名称',()=>{labelsOn=!labelsOn;labelButton.setAttribute('aria-pressed',String(labelsOn));});labelButton.setAttribute('aria-pressed',String(labelsOn));
  control('solarZoomIn','＋',()=>zoom(.8)).setAttribute('aria-label','放大太阳系');control('solarZoomOut','－',()=>zoom(1.25)).setAttribute('aria-label','缩小太阳系');scope.cleanup(()=>additional.forEach(button=>button.remove()));
  function playText(){playButton.textContent=playing?'暂停公转':'继续公转';playButton.setAttribute('aria-pressed',String(playing));}playText();scope.listen(playButton,'click',()=>{playing=!playing;playText();});
  scope.listen(speedButton,'click',()=>{speed=speed===1?3:speed===3?.25:1;speedButton.textContent=`${speed}× 演示`;});speedButton.textContent=`${speed}× 演示`;
  function overviewDistance(){return 68/Math.min(1,camera.aspect)*1.06;}
  function overview(){closeup=false;flight=null;transitionZoom=null;desiredDistance=overviewDistance();yaw=0;pitch=.58;updateBadge();}
  document.querySelector('#solarReset').textContent='太阳系全景';scope.listen(document.querySelector('#solarReset'),'click',overview);
  scope.listen(document.querySelector('#solarToGlobe'),'click',event=>window.navigateWithZoom('globe','earth',event.currentTarget));
  window.pauseSolarForTransition=()=>{const was=playing;playing=false;playText();return()=>{playing=was;playText();};};
  window.zoomSolarForTransition=()=>{select('earth');closeup=true;flight=null;transitionZoom={elapsed:0,startDistance:distance};};scope.hooks(['pauseSolarForTransition','zoomSolarForTransition']);
  function zoom(factor){flight=null;desiredDistance=THREE.MathUtils.clamp(desiredDistance*factor,byId[selected].size*2.8,115);}
  const pointers=new Map();let drag=null,pinch=null;
  scope.listen(renderer.domElement,'pointerdown',event=>{pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});renderer.domElement.setPointerCapture(event.pointerId);
    if(pointers.size===1)drag={x:event.clientX,y:event.clientY,yaw,pitch,moved:false};else{drag=null;const [a,b]=[...pointers.values()];pinch={length:Math.hypot(a.x-b.x,a.y-b.y),distance:desiredDistance};}});
  scope.listen(renderer.domElement,'pointermove',event=>{if(!pointers.has(event.pointerId))return;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pointers.size>1&&pinch){const [a,b]=[...pointers.values()];flight=null;desiredDistance=THREE.MathUtils.clamp(pinch.distance*pinch.length/Math.max(20,Math.hypot(a.x-b.x,a.y-b.y)),byId[selected].size*2.8,115);return;}
    if(!drag)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(Math.hypot(dx,dy)>8)drag.moved=true;if(drag.moved){flight=null;yaw=drag.yaw-dx*.006;pitch=THREE.MathUtils.clamp(drag.pitch+dy*.005,-.8,1.4);}});
  scope.listen(renderer.domElement,'pointerup',event=>{pointers.delete(event.pointerId);if(pinch){if(!pointers.size)pinch=null;drag=null;return;}
    const click=drag&&!drag.moved;drag=null;if(!click)return;const rect=renderer.domElement.getBoundingClientRect();let closest=null,min=Infinity;
    for(const b of bodies){temp.copy(roots.get(b.id).position).project(camera);if(temp.z< -1||temp.z>1)continue;const x=(temp.x*.5+.5)*w,y=(-temp.y*.5+.5)*h,d=Math.hypot(event.clientX-rect.left-x,event.clientY-rect.top-y);
      const radius=b.size/camera.position.distanceTo(roots.get(b.id).position)*h/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));if(d<Math.max(22,radius)&&d<min){closest=b.id;min=d;}}if(closest)select(closest,true);});
  scope.listen(renderer.domElement,'pointercancel',()=>{pointers.clear();drag=null;pinch=null;});scope.listen(renderer.domElement,'wheel',event=>{event.preventDefault();zoom(event.deltaY>0?1.1:.9);},{passive:false});
  function resize(){const rect=host.getBoundingClientRect();if(!rect.width||!rect.height)return;w=rect.width;h=rect.height;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);if(!closeup){desiredDistance=overviewDistance();distance=desiredDistance;}}
  new scope.ResizeObserver(resize).observe(host);resize();select(selected);updatePositions();
  scope.capture(()=>({selected,closeup,playing,speed,clock,yaw,pitch,distance,labelsOn,orbitsOn}));
  function updatePositions(){for(let i=0;i<bodies.length;i++){const b=bodies[i];if(!b.orbit)continue;const angle=i*2.36+clock*.075*365.25/periods[b.id];roots.get(b.id).position.set(Math.cos(angle)*b.orbit,0,Math.sin(angle)*b.orbit);}
    roots.get('moon').position.copy(roots.get('earth').position).add(temp.set(Math.cos(clock*.8)*1.3,.08,Math.sin(clock*.8)*1.3));
    // Synchronous rotation: retain the same hemisphere toward Earth.
    roots.get('moon').lookAt(roots.get('earth').position);}
  const occupied=[],labelOrder=[...bodies];
  function updateLabels(){occupied.length=0;labels.hidden=!labelsOn;labelOrder.sort((a,b)=>a.id===selected?-1:b.id===selected?1:0);
    for(const b of labelOrder){const label=labelNodes.get(b.id);if(!labelsOn){label.hidden=true;continue;}temp.copy(roots.get(b.id).position).project(camera);
      const radius=b.size/camera.position.distanceTo(roots.get(b.id).position)*h/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
      const offset=closeup&&b.id===selected?radius*(b.id==='saturn'?1.5:1)+14:20;
      const x=(temp.x*.5+.5)*w,y=(-temp.y*.5+.5)*h+offset;
      const visible=temp.z>=-1&&temp.z<=1&&x>34&&x<w-34&&y>76&&y<h-120&&(b.id!=='moon'||closeup&&['earth','moon'].includes(selected));
      label.hidden=!visible||occupied.some(p=>Math.abs(p.x-x)<72&&Math.abs(p.y-y)<42);if(!label.hidden){label.style.transform=`translate(${x}px,${y}px) translate(-50%,0)`;occupied.push({x,y});}}}
  function frame(){scope.frame(frame);const dt=Math.min(deltaClock.getDelta(),.05);if(document.hidden)return;
    if(playing){clock+=dt*speed;surfaces.forEach((mesh,id)=>{if(id!=='moon')mesh.rotation.y+=dt*speed*(id==='venus'?-.07:id==='sun'?.025:.13);});earthClouds.rotation.y+=dt*speed*.02;}updatePositions();nextTarget.copy(closeup?roots.get(selected).position:zero);
    if(transitionZoom){transitionZoom.elapsed+=dt;const k=Math.min(1,transitionZoom.elapsed/.9);distance=THREE.MathUtils.lerp(transitionZoom.startDistance,3.5,k*k*(3-2*k));desiredDistance=distance;if(k===1)transitionZoom=null;}
    else if(flight){flight.elapsed+=dt;const f=Math.min(1,flight.elapsed/flight.duration),k=f*f*(3-2*f);distance=THREE.MathUtils.lerp(flight.startDistance,flight.endDistance,k);desiredDistance=distance;yaw=THREE.MathUtils.lerp(flight.startYaw,flight.endYaw,k);pitch=THREE.MathUtils.lerp(flight.startPitch,flight.endPitch,k);if(f===1)flight=null;}
    else distance=THREE.MathUtils.lerp(distance,desiredDistance,1-Math.exp(-dt*8));target.lerp(nextTarget,1-Math.exp(-dt*7));
    const horizontal=Math.cos(pitch)*distance;camera.position.set(target.x+Math.sin(yaw)*horizontal,target.y+Math.sin(pitch)*distance,target.z+Math.cos(yaw)*horizontal);camera.lookAt(target);
    surfaces.get('earth').getWorldQuaternion(q);uniforms.sunDirection.value.copy(roots.get('earth').position).negate().normalize().applyQuaternion(q.invert());
    moonOrbit.visible=orbitsOn&&closeup&&['earth','moon'].includes(selected);updateLabels();renderer.render(scene,camera);
  }
  frame();return scope;
  }catch(error){
    scope.dispose();
    console.warn('Solar renderer unavailable',error);
    host.innerHTML='<div class="solar-fallback"><p>暂时无法显示三维太阳系，请刷新后再试。</p><button type="button">刷新页面</button></div>';
    const fallback=createSceneScope();fallback.listen(host.querySelector('button'),'click',()=>location.reload());return fallback;
  }
});
