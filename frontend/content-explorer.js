const api = `${window.FUFU_API_BASE || ''}/api`;
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names = {comic:'图文漫画',dinosaur:'3D 恐龙科普',machine:'3D 工程车科普'};
let kind = new URLSearchParams(location.search).get('kind') || 'comic';
if (!names[kind]) kind = 'comic';
let page = 0, total = 0, viewerDispose = null, activeAudio = null;
async function request(path){const response=await fetch(`${api}${path}`);const data=await response.json();if(!response.ok)throw new Error(data.error||'内容暂时无法加载');return data;}
function showError(error){$('#message').textContent=error.message||String(error);}
async function load(reset=false){
  if(reset){page=0;total=0;$('#catalog').replaceChildren();$('#reader').hidden=true;$('#catalog').hidden=false;viewerDispose?.();viewerDispose=null;}
  $('#pageTitle').textContent=names[kind];
  document.querySelectorAll('[data-kind]').forEach(button=>button.classList.toggle('active',button.dataset.kind===kind));
  try{
    const result=await request(`/content?kind=${kind}&page=${page+1}&page_size=12`);
    page=result.page;total=result.total;
    for(const item of result.items){const button=document.createElement('button');button.className='card';button.type='button';button.innerHTML=`${item.cover_path?`<img loading="lazy" src="${esc(item.cover_path)}" alt="${esc(item.title)}封面">`:`<span class="placeholder">${kind==='comic'?'📖':kind==='dinosaur'?'🦕':'🚜'}</span>`}<div><small>${esc(item.category||names[kind])}</small><b>${esc(item.title)}</b><em>${esc(item.summary)}</em></div>`;button.addEventListener('click',()=>open(item.id));$('#catalog').append(button);}
    if(!result.items.length&&!$('#catalog').children.length)$('#catalog').innerHTML='<p>这类内容正在准备中，发布后会出现在这里。</p>';
    $('#more').hidden=page*12>=total;
    $('#message').textContent='';
  }catch(error){showError(error);}
}
async function open(id){
  try{
    const item=await request(`/content/${id}`);
    $('#catalog').hidden=true;$('#more').hidden=true;$('#reader').hidden=false;
    $('#readerInfo').innerHTML=`<small>${esc(item.category||names[item.kind])}</small><h2>${esc(item.title)}</h2><p>${esc(item.summary)}</p>`;
    const segments=$('#segments');segments.replaceChildren();let chapter=0;
    for(const segment of item.segments){
      if(item.kind==='comic'&&segment.chapter_no!==chapter){chapter=segment.chapter_no;const heading=document.createElement('div');heading.className='chapter';heading.textContent=`第 ${chapter} 章`;segments.append(heading);}
      const section=document.createElement('section');section.className='segment';
      section.innerHTML=`${segment.image_path?`<img loading="lazy" src="${esc(segment.image_path)}" alt="${esc(segment.title||item.title)}">`:''}<h3>${esc(segment.title)}</h3><p>${esc(segment.body)}</p>${segment.audio_path?'<button type="button">🔊 听讲解</button>':''}`;
      if(segment.audio_path)section.querySelector('button').addEventListener('click',()=>{activeAudio?.pause();activeAudio=new Audio(segment.audio_path);activeAudio.play().catch(showError);});
      segments.append(section);
    }
    viewerDispose?.();viewerDispose=null;$('#viewer').hidden=!item.model_path;
    if(item.model_path) viewerDispose=await mountViewer(item);
    scrollTo({top:0,behavior:'smooth'});
  }catch(error){showError(error);}
}
async function mountViewer(item){
  const THREE=await import('/vendor/three.module.js');
  const {GLTFLoader}=await import('/vendor/GLTFLoader.js');
  const host=$('#modelHost'),layer=$('#hotspotLayer');host.replaceChildren();layer.replaceChildren();
  const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(42,1,.01,1000);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));host.append(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff,0x6a806a,2));const light=new THREE.DirectionalLight(0xffffff,2.5);light.position.set(4,7,5);scene.add(light);
  const model=await new GLTFLoader().loadAsync(item.model_path);scene.add(model.scene);
  const box=new THREE.Box3().setFromObject(model.scene),center=box.getCenter(new THREE.Vector3()),radius=Math.max(box.getSize(new THREE.Vector3()).length()/2,.5);
  model.scene.position.sub(center);camera.position.set(radius*1.7,radius*.8,radius*2.1);camera.lookAt(0,0,0);
  let angle=0,elevation=.27,distance=camera.position.length(),drag=null,frame=0,disposed=false;
  const markers=(item.segments||[]).filter(s=>s.hotspot_x!==null&&s.hotspot_y!==null&&s.hotspot_z!==null).map(s=>{const button=document.createElement('button');button.type='button';button.className='hotspot';button.textContent=s.title||'知识点';button.addEventListener('click',()=>{const target=[...$('#segments').children].find(el=>el.querySelector('h3')?.textContent===s.title);target?.scrollIntoView({behavior:'smooth',block:'center'});});layer.append(button);return{button,segment:s};});
  const resize=()=>{const w=host.clientWidth,h=host.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);};const observer=new ResizeObserver(resize);observer.observe(host);resize();
  const down=e=>{drag={x:e.clientX,y:e.clientY};renderer.domElement.setPointerCapture(e.pointerId);};
  const move=e=>{if(!drag)return;angle+=(e.clientX-drag.x)*.008;elevation=Math.max(-1.2,Math.min(1.2,elevation+(e.clientY-drag.y)*.006));drag={x:e.clientX,y:e.clientY};};
  const up=()=>{drag=null;};const wheel=e=>{e.preventDefault();distance=Math.max(radius*1.3,Math.min(radius*8,distance*(e.deltaY>0?1.1:.9)));};
  renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('wheel',wheel,{passive:false});
  const tick=()=>{if(disposed)return;camera.position.set(Math.sin(angle)*Math.cos(elevation)*distance,Math.sin(elevation)*distance,Math.cos(angle)*Math.cos(elevation)*distance);camera.lookAt(0,0,0);renderer.render(scene,camera);for(const {button,segment} of markers){const point=new THREE.Vector3(Number(segment.hotspot_x),Number(segment.hotspot_y),Number(segment.hotspot_z)).sub(center).project(camera);button.hidden=point.z>1||point.z< -1;button.style.left=`${(point.x+1)*50}%`;button.style.top=`${(1-point.y)*50}%`;}frame=requestAnimationFrame(tick);};tick();
  return ()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();model.scene.traverse(object=>{object.geometry?.dispose();if(object.material){const materials=Array.isArray(object.material)?object.material:[object.material];for(const material of materials){for(const value of Object.values(material))if(value?.isTexture)value.dispose();material.dispose();}}});renderer.dispose();host.replaceChildren();layer.replaceChildren();};
}
document.querySelectorAll('[data-kind]').forEach(button=>button.addEventListener('click',()=>{kind=button.dataset.kind;history.replaceState(null,'',`?kind=${kind}`);load(true);}));
$('#more').addEventListener('click',()=>load());$('#closeReader').addEventListener('click',()=>{activeAudio?.pause();viewerDispose?.();viewerDispose=null;$('#reader').hidden=true;$('#catalog').hidden=false;$('#more').hidden=page*12>=total;});
load(true);
