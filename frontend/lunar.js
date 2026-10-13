import * as THREE from './vendor/three.module.js';
import { createSceneScope, disposeGraph } from './scene-scope.js?v=20261003-lifecycle-1';
window.FufuScenes.register('lunar', saved => {
const scope=createSceneScope();

const host=document.querySelector('#lunarCanvasHost');
if(host){
  const moonRadius=5.2;
  const places=[
    {id:'tycho',name:'第谷环形山',latin:'Tycho',lat:-43.31,lon:-11.32,diameter:85,rays:true,depth:.10,relief:.087,text:'第谷环形山周围伸展着明亮的辐射纹。它们是撞击时飞溅出去的碎屑，像车轮的辐条一样向四周铺开。',fact:'直径约 85 千米。中央峰由撞击后被挤压、回弹的月壳物质形成。'},
    {id:'copernicus',name:'哥白尼环形山',latin:'Copernicus',lat:9.62,lon:-20.08,diameter:93,rays:true,depth:.085,relief:.083,text:'哥白尼环形山位于月球正面，坑壁层层跌落，坑底还能看到中央峰。撞击抛出的亮色物质形成了周围的辐射纹。',fact:'直径约 93 千米，明亮的撞击物质辐射纹延伸到更远的月面。'},
    {id:'plato',name:'柏拉图环形山',latin:'Plato',lat:51.6,lon:-9.3,diameter:101,depth:.067,relief:.109,text:'柏拉图环形山的坑底看起来比较平坦而暗。它是一个大型撞击坑，内部后来被较平滑的熔岩覆盖。',fact:'位于月球正面的北部高地附近，暗色坑底与明亮坑壁形成对比。'},
    {id:'clavius',name:'克拉维斯环形山',latin:'Clavius',lat:-58.4,lon:-14.4,diameter:231,depth:.12,relief:.157,text:'克拉维斯是一座巨大的古老环形山，宽阔坑底上又叠着一串大小不一的小坑，像一圈圈保存下来的撞击年轮。',fact:'位于月球南部高地。多个较小撞击坑叠在坑底，呈弧形排列。'}
  ];
  let renderer,scene,camera,moon,craterGroup,drag=null,selectedId='',yaw=.72,pitch=.23,distance=18.2,targetYaw=yaw,targetPitch=pitch,targetDistance=distance;
  try{
    scene=new THREE.Scene();scene.background=null;
    camera=new THREE.PerspectiveCamera(42,1,.1,100);camera.position.set(0,3.1,18.2);distance=targetDistance=18.2;
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
    scope.own(scene, renderer);
  renderer.setPixelRatio((window.FufuPerformance?.pixelRatio || Math.min(window.devicePixelRatio || 1, 1.5)));renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;host.append(renderer.domElement);
    renderer.domElement.style.touchAction='none';renderer.domElement.setAttribute('aria-label','月球三维模型，可拖动旋转、滚轮缩放或点击陨石坑');
    scene.add(new THREE.HemisphereLight(0xa9c7e4,0x221c1a,.78));
    const key=new THREE.DirectionalLight(0xffe2b4,2.1);key.position.set(-8,5,11);scene.add(key);
    const fill=new THREE.DirectionalLight(0x8ab8eb,.25);fill.position.set(9,-3,-7);scene.add(fill);
    const seed=()=>{let s=1258;return()=>((s=(s*1664525+1013904223)>>>0)/4294967296)};
    const rand=seed();
    const ordinary=Array.from({length:38},(_,i)=>({lat:Math.asin(rand()*2-1)*180/Math.PI,lon:rand()*360-180,relief:.012+rand()*.025,depth:.012+rand()*.023,radius:.024+rand()*.027,peak:false,id:`minor-${i}`}));
    const all=[...places.map(p=>({...p,radius:p.relief*.7,depth:p.depth*.38,peak:p.depth>.08})),...ordinary];
    const geometry=new THREE.SphereGeometry(moonRadius,640,320),positions=geometry.attributes.position;
    const craters=all.map(c=>{const a=c.lat*Math.PI/180,l=c.lon*Math.PI/180;return{...c,center:new THREE.Vector3(Math.cos(a)*Math.sin(l),Math.sin(a),Math.cos(a)*Math.cos(l)),cosRadius:Math.cos(c.radius)};});
    for(let i=0;i<positions.count;i++){
      const n=new THREE.Vector3().fromBufferAttribute(positions,i).normalize();let h=0;
      for(const c of craters){const dot=n.dot(c.center);if(dot<=c.cosRadius)continue;const t=Math.acos(Math.min(1,dot))/c.radius;if(t>=1)continue;
        const rim=Math.exp(-Math.pow((t-.88)/.105,2))*.46;
        const bowl=-.62*Math.exp(-t*t*5.2);
        const peak=c.peak?.38*Math.exp(-Math.pow(t/.13,2)):0;
        h+=c.depth*(rim+bowl+peak);
      }
      positions.setXYZ(i,n.x*(moonRadius+h),n.y*(moonRadius+h),n.z*(moonRadius+h));
    }
    geometry.computeVertexNormals();
    const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.97,metalness:0});
    moon=new THREE.Mesh(geometry,material);scene.add(moon);
    new THREE.TextureLoader().load('/assets/moon-nasa.jpg',texture=>{if(scope.disposed){texture.dispose();return;}texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);material.map=texture;material.needsUpdate=true;});
    craterGroup=new THREE.Group();scene.add(craterGroup);
    const points=[];for(let i=0;i<1600;i++){const z=rand()*2-1,a=rand()*Math.PI*2,r=25+rand()*40,s=Math.sqrt(1-z*z);points.push(Math.cos(a)*s*r,z*r,Math.sin(a)*s*r);}
    const stars=new THREE.BufferGeometry();stars.setAttribute('position',new THREE.Float32BufferAttribute(points,3));scene.add(new THREE.Points(stars,new THREE.PointsMaterial({color:0xc5dcf1,size:.12,transparent:true,opacity:.8})));
  }catch(error){host.innerHTML='<div class="lunar-fallback">这台设备暂时无法显示月球 3D 模型。请用支持 WebGL 的浏览器再试一次。</div>';console.warn('Lunar surface viewer unavailable:',error);}

  const title=document.querySelector('#lunarFeatureTitle'),text=document.querySelector('#lunarFeatureText'),fact=document.querySelector('#lunarFeatureFacts'),kicker=document.querySelector('#lunarFeatureKicker');
  const list=document.querySelector('#lunarCraterList');
  list.innerHTML=places.map(p=>`<button type="button" data-crater="${p.id}"><span>◉</span><b>${p.name}</b><small>${p.latin} · ${p.diameter} km</small></button>`).join('');
  function coords(lat,lon){const a=lat*Math.PI/180,l=lon*Math.PI/180;return new THREE.Vector3(Math.cos(a)*Math.sin(l),Math.sin(a),Math.cos(a)*Math.cos(l));}
  const markers=new Map();
  let activeLabelId='';
  function makeNameTexture(name){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;
    const c=canvas.getContext('2d');c.fillStyle='#071827f2';c.beginPath();c.roundRect(6,8,500,80,26);c.fill();
    c.strokeStyle='#7ad8e9';c.lineWidth=3;c.stroke();c.fillStyle='#8be4ee';c.beginPath();c.arc(39,48,9,0,Math.PI*2);c.fill();
    c.fillStyle='#f1f8fc';c.font='bold 38px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';c.textBaseline='middle';c.fillText(name,64,48);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
  }
  function addCraterMarkers(){
    if(!craterGroup)return;
    for(const p of places){
      const normal=coords(p.lat,p.lon),surface=normal.clone().multiplyScalar(moonRadius+p.relief+.12);
      const group=new THREE.Group();group.userData.craterId=p.id;craterGroup.add(group);
      const dot=new THREE.Mesh(new THREE.SphereGeometry(.14,16,12),new THREE.MeshBasicMaterial({color:0x74dfec,depthTest:true,depthWrite:false}));dot.position.copy(surface);dot.scale.setScalar(.23);dot.userData.craterId=p.id;group.add(dot);
      const tangent=new THREE.Vector3(0,1,0).cross(normal).normalize();
      if(tangent.lengthSq()<.01)tangent.set(1,0,0);
      const side=['tycho','plato'].includes(p.id)?-1:1;
      const labelPosition=surface.clone().add(normal.clone().multiplyScalar(.28)).add(tangent.multiplyScalar(side*.78));
      const connector=new THREE.Line(new THREE.BufferGeometry().setFromPoints([surface,labelPosition]),new THREE.LineBasicMaterial({color:0x78d8e8,transparent:true,opacity:.9,depthTest:true}));
      connector.userData.craterId=p.id;group.add(connector);
      const label=new THREE.Sprite(new THREE.SpriteMaterial({map:makeNameTexture(p.name),transparent:true,depthTest:true,depthWrite:false}));
      label.position.copy(labelPosition);label.scale.set(2.2,.42,1);label.userData.craterId=p.id;label.visible=false;connector.visible=false;group.add(label);
      markers.set(p.id,{group,dot,label,connector});
    }
  }
  addCraterMarkers();
  function frameAt(lat,lon,zoom=7.9){const n=coords(lat,lon);targetYaw=Math.atan2(n.x,n.z);targetPitch=Math.asin(n.y);targetDistance=zoom;}
  function choose(p,animate=true){const hideLabel=activeLabelId===p.id;selectedId=p.id;activeLabelId=hideLabel?'':p.id;kicker.textContent=`代表性陨石坑 · ${p.latin}`;title.textContent=p.name;text.textContent=p.text;fact.textContent=p.fact;
    document.querySelectorAll('[data-crater]').forEach(b=>b.classList.toggle('active',b.dataset.crater===p.id));
    markers.forEach((marker,id)=>{const selected=id===p.id;marker.dot.material.color.set(selected?0xffd17b:0x74dfec);marker.dot.scale.setScalar(selected?.28:.23);marker.label.visible=activeLabelId===id;marker.connector.visible=activeLabelId===id;marker.label.material.opacity=1;marker.connector.material.color.set(0xffd17b);});
    frameAt(p.lat,p.lon,animate?8.8:distance);
  }
  function hideSurfaceLabel(){activeLabelId='';markers.forEach(marker=>{marker.label.visible=false;marker.connector.visible=false;});}
  function globalView(){selectedId='';hideSurfaceLabel();targetYaw=.72;targetPitch=.23;targetDistance=18.2;kicker.textContent='月面观察';title.textContent='月面上为什么有这么多坑？';text.textContent='点击月面上的环形山标记，显示中文名称和撞击特征；再点一次可收起标识。';fact.textContent='放大时，名称会逐渐缩小，避免遮住月面。';document.querySelectorAll('[data-crater]').forEach(b=>b.classList.remove('active'));markers.forEach(marker=>{marker.dot.material.color.set(0x74dfec);marker.dot.scale.setScalar(.23);marker.connector.material.color.set(0x78d8e8);});}
  scope.listen(list, 'click',event=>{const button=event.target.closest('[data-crater]');if(button)choose(places.find(p=>p.id===button.dataset.crater));});
  scope.listen(document.querySelector('#lunarReset'), 'click',globalView);
  scope.listen(document.querySelector('#lunarZoomIn'), 'click',()=>targetDistance=Math.max(6.4,targetDistance-1.2));
  scope.listen(document.querySelector('#lunarZoomOut'), 'click',()=>targetDistance=Math.min(19,targetDistance+1.2));
  scope.listen(document.querySelector('#lunarRead'), 'click',()=>{const selected=places.find(p=>p.id===selectedId);const narration=selected?`${selected.name}。${selected.text}${selected.fact}这里的地形起伏经过夸张，方便观察。`:`月球表面有许多撞击留下的环形山。撞击会挖出坑穴、抛出碎屑，有些较大的坑中央还会形成隆起的中央峰。月面起伏经过夸张，让我们更容易看清地形。`;if(typeof window.speak==='function')window.speak(narration);});
  if(renderer){
    const canvas=renderer.domElement,raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
    scope.listen(canvas, 'pointerdown',event=>{drag={x:event.clientX,y:event.clientY,yaw:targetYaw,pitch:targetPitch,moved:false,slack:event.pointerType==='touch'?14:5};canvas.setPointerCapture(event.pointerId);});
    scope.listen(canvas, 'pointermove',event=>{if(!drag)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>drag.slack)drag.moved=true;if(drag.moved){targetYaw=drag.yaw-dx*.006;targetPitch=Math.max(-1.42,Math.min(1.42,drag.pitch+dy*.005));}});
    scope.listen(canvas, 'pointerup',event=>{if(drag&&!drag.moved){const r=canvas.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);const markerHit=raycaster.intersectObject(craterGroup,true).find(hit=>hit.object.visible&&hit.object.userData.craterId);if(markerHit){choose(places.find(p=>p.id===markerHit.object.userData.craterId));}else{const hit=raycaster.intersectObject(moon,false)[0];if(hit){const n=hit.point.clone().normalize();const lat=Math.asin(n.y)*180/Math.PI,lon=Math.atan2(n.x,n.z)*180/Math.PI;let nearest=places[0],angle=10;for(const p of places){const d=coords(p.lat,p.lon),a=Math.acos(THREE.MathUtils.clamp(n.dot(d),-1,1));if(a<angle){angle=a;nearest=p;}}if(angle<nearest.relief*1.65)choose(nearest);else{hideSurfaceLabel();kicker.textContent='月面撞击地貌';title.textContent=`月球 ${lat.toFixed(0)}° ${lon.toFixed(0)}°`;text.textContent='这里也保留着古老的小天体撞击痕迹。圆形坑缘围住较低的坑底，周围散布着撞击时抛出的碎屑。';fact.textContent='拖动月球观察不同区域，或选择柏拉图、克拉维斯、第谷和哥白尼环形山继续探索。';selectedId='';document.querySelectorAll('[data-crater]').forEach(b=>b.classList.remove('active'));markers.forEach(marker=>{marker.dot.material.color.set(0x74dfec);marker.dot.scale.setScalar(.23);});} }else hideSurfaceLabel();}}drag=null;});
    scope.listen(canvas, 'pointercancel',()=>drag=null);
    scope.listen(canvas, 'wheel',event=>{event.preventDefault();targetDistance=THREE.MathUtils.clamp(targetDistance+Math.sign(event.deltaY)*1.1,6.4,19);},{passive:false});
    new scope.ResizeObserver(()=>{const r=host.getBoundingClientRect();if(!r.width||!r.height)return;camera.aspect=r.width/r.height;camera.updateProjectionMatrix();renderer.setSize(r.width,r.height,false);}).observe(host);
    const clock=scope.clock(new THREE.Clock());
    function animate(){scope.frame(animate);if(!document.querySelector('#page-lunar').classList.contains('active')||document.hidden)return;const k=Math.min(1,clock.getDelta()*6);yaw+=(targetYaw-yaw)*k;pitch+=(targetPitch-pitch)*k;distance+=(targetDistance-distance)*k;const labelScale=THREE.MathUtils.clamp(Math.pow(distance/18.2,1.4),.12,1.15);markers.forEach(marker=>marker.label.scale.set(2.2*labelScale,.42*labelScale,1));camera.position.set(Math.sin(yaw)*Math.cos(pitch)*distance,Math.sin(pitch)*distance,Math.cos(yaw)*Math.cos(pitch)*distance);camera.lookAt(0,0,0);renderer.render(scene,camera);}
    if(saved.selectedId)choose(places.find(p=>p.id===saved.selectedId));targetYaw=saved.targetYaw??targetYaw;targetPitch=saved.targetPitch??targetPitch;targetDistance=saved.targetDistance??targetDistance;
    scope.capture(()=>({selectedId,targetYaw,targetPitch,targetDistance}));
    animate();
  }
}

return scope;
});
