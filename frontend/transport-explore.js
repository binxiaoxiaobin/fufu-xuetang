import {createViewer} from './engineering-viewer.js?v=20261007-realistic-2';
import {createTransportMotion} from './transport-motion.js?v=20261005-observe-5';
import {createPlayback} from './model-playback.js?v=20261005-observe-5';

const page = document.getElementById('page-transport') || document.createElement('main');
page.id = 'page-transport'; page.classList.add('page','learning-lab','transport-lab');
page.innerHTML = `<section class="lab-heading"><button class="lab-back" data-page="explore" type="button">← 返回探索实验室</button><div class="eyebrow">TRANSPORT EXPLORER · 交通工具馆</div><h1>下一站，去哪里？ <span>✈️</span></h1><p>从天空到轨道，从公路到水面，认识带我们出发的交通工具。</p></section>
<div class="transport-layout"><section class="transport-stage" aria-label="交通工具三维观察展台"><div class="transport-stage-top"><span id="transportStageName">准备出发</span><small>拖动旋转 · 滚轮缩放</small></div><div id="transportCanvasHost"></div><div id="transportStatus" role="status">进入后加载展品…</div><div class="transport-toolbar"><button id="transportZoomIn" type="button">+ 放大</button><button id="transportZoomOut" type="button">− 缩小</button><button id="transportReset" type="button">↺ 重置视角</button><button id="transportReference" type="button" aria-pressed="false">团团比一比</button></div><p id="transportLegend" class="transport-legend">每件交通工具都有自己的身体和本领。</p></section>
<aside class="transport-profile"><div class="eyebrow" id="transportCategory">准备出发</div><h2 id="transportName">交通工具观察员</h2><p id="transportTagline">选择一件展品，开启观察之旅。</p><p id="transportDescription"></p><div class="transport-fact"><b>它怎样前进？</b><p id="transportPrinciple"></p></div><div class="transport-size" id="transportSize"></div><div class="transport-task"><b>🔎 小小观察任务</b><p id="transportTask"></p></div><details class="transport-credit"><summary>模型来源与许可</summary><div id="transportCredit"></div></details></aside></div>
<section class="transport-collection"><div class="transport-section-heading"><div><div class="eyebrow">CHOOSE YOUR JOURNEY</div><h2>选一件，仔细看看</h2></div><span id="transportCount"></span></div><div class="transport-filters" role="group" aria-label="交通工具分类"></div><div id="transportGallery" class="transport-gallery"></div><button id="transportRetry" type="button" hidden>重新加载展品</button></section>
<section class="transport-observe"><div><div class="eyebrow">LOOK CLOSER</div><h2>认一认它的部件</h2><div id="transportParts" class="transport-chips"></div><p id="transportPartText">点击名称，看看这个部件有什么用。</p></div><div><div class="eyebrow">STRUCTURE TASKS</div><h2>结构观察任务</h2><div id="transportActions" class="transport-chips"></div><p id="transportActionText">选择一个任务，镜头会定位到相应结构。</p><div class="transport-motion-tools"><button id="transportPause" type="button">暂停</button><button id="transportRestore" type="button">恢复姿态</button></div></div></section>`;
const shell = document.querySelector('.app-shell');
if (!page.isConnected) shell.insertBefore(page, shell.querySelector('footer'));
const $ = id => document.getElementById(id);
const observation = page.querySelector('.transport-observe');
observation.id = 'transportControls';
const panels = [...observation.children];
const profile = page.querySelector('.transport-profile');
page.querySelector('.transport-layout').append(observation);
page.querySelector('.transport-layout').after(profile);
window.FufuWorkbench.tabs(observation, [
  {label:'认部件', node:panels[0]},
  {label:'找一找', node:panels[1]},
], page.querySelector('.transport-stage'));
page.querySelector('.lab-back').addEventListener('click', () => window.navigate('explore'));
const categories = {all:'全部', sky:'✈️ 天空',rail:'🚆 轨道',road:'🚕 公路',water:'⛵ 水上',space:'🚀 航天'};
let items = [], selected = null, machine = null, filter = 'all', viewer = null, loading = false, ready = false;
let playback=null;
$('transportPause').hidden=true;
function button(text, fn) { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.addEventListener('click', fn); return b; }
function pressed(container, target) { container.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === target))); }
Object.entries(categories).forEach(([key, label]) => {
  const b = button(label, () => { filter = key; pressed(b.parentElement, b); renderGallery(); });
  b.setAttribute('aria-pressed', String(key === 'all')); document.querySelector('.transport-filters').append(b);
});
function renderGallery() {
  const shown = items.filter(item => filter === 'all' || item.category === filter);
  $('transportCount').textContent = `${shown.length} 件展品`;
  $('transportGallery').replaceChildren(...shown.map(item => {
    const card = button('', () => {
      select(item);
      page.querySelector('.transport-stage').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    }); card.className = 'transport-card';
    card.dataset.slug = item.slug; card.setAttribute('aria-pressed', String(selected?.slug === item.slug));
    const picture = document.createElement('img'); picture.src = item.cover_path; picture.alt = item.name + '模型'; picture.loading = 'lazy';
    picture.addEventListener('error', () => { picture.replaceWith(Object.assign(document.createElement('span'), {textContent:item.icon, className:'transport-cover-fallback'})); });
    const name = document.createElement('b'); name.textContent = item.name;
    const tag = document.createElement('small'); tag.textContent = categories[item.category]; card.append(picture, name, tag); return card;
  }));
}
function select(item) {
  playback?.dispose();playback=createPlayback(()=>viewer,page);
  panels[1].append(playback.node);playback.node.hidden=item.actions.every(a=>a.kind==='focus');
  selected = item; ready = false; renderGallery();
  $('transportName').textContent = item.name; $('transportCategory').textContent = `${categories[item.category]} · ${item.english}`;
  $('transportStageName').textContent = `${item.icon} ${item.name}`;
  page.querySelector('.transport-stage').dataset.environment = item.category;
  for (const [id,key] of [['transportTagline','tagline'],['transportDescription','description'],['transportPrinciple','principle'],['transportTask','task']]) $(id).textContent = item[key];
  $('transportSize').textContent = `教学比例 · 长约 ${item.size.lengthM} 米${item.size.heightM ? ` · 高约 ${item.size.heightM} 米` : ''}`;
  const credit = $('transportCredit'), source = document.createElement('a'); source.textContent = `${item.credit.author} · ${item.credit.title} ↗`; source.href = item.credit.source; source.target = '_blank'; source.rel = 'noreferrer';
  const note = document.createElement('p'); note.textContent = `${item.credit.license}。${item.credit.note || ''} ${item.size.note}`; const license=document.createElement('a');license.href=item.credit.licenseUrl;license.textContent='查看许可';license.target='_blank';license.rel='noreferrer';credit.replaceChildren(source, note, license);
  machine = {name:item.name, size:item.size, model:{url:item.model_path+'?v=20261007-realistic-2', fitLengthM:item.fitLengthM || item.size.lengthM, fitHeightM:item.fitHeightM, lengthAxis:item.lengthAxis, yawFix:item.yawFix, pitchFix:item.pitchFix, rollFix:item.rollFix, transportActions:item.actions}, steps:item.actions.map(action => [action.label,action.text,action.kind==='focus'?{focus:new RegExp(action.pattern,'i'),label:action.label}:{motion:action.motion,viewPattern:action.viewPattern?new RegExp(action.viewPattern,'i'):null,label:action.label}]), parts:item.parts.map((part,index) => [String(index),part.label,new RegExp(part.pattern,'i'),part.description])};
  $('transportParts').replaceChildren(...item.parts.map(part => {
    const b = button(part.label, () => {
      if (!ready) return;
      pressed(b.parentElement,b); viewer.pauseMotion();playback.stop('已定位部件，可以拖动模型细看');
      const found = viewer.focusPart(new RegExp(part.pattern,'i'), part.label);
      $('transportPartText').textContent = part.description + (found ? '' : ' 这个部件与主体合并展示，可以旋转模型观察。');
    }); b.setAttribute('aria-pressed','false');b.disabled=true; return b;
  }));
  $('transportActions').replaceChildren(...item.actions.map((action,index) => {
    const b = button(action.label, () => {
      if (!ready) return;
      pressed(b.parentElement,b);viewer.resetMotion();const played = viewer.playStep(machine,index);
      if(played && action.kind!=='focus')playback.start();else playback.stop('已定位结构，可以拖动模型细看');
      $('transportActionText').textContent = played ? action.text : '这段动作暂时无法播放，可以先旋转观察模型。';
    }); b.setAttribute('aria-pressed','false');b.disabled=true; return b;
  }));
  $('transportPartText').textContent = '点击名称，看看这个部件有什么用。'; $('transportActionText').textContent = '选择一个任务，镜头会定位到相应结构。';
  page.querySelector('.transport-motion-tools').hidden=item.actions.every(a=>a.kind==='focus');viewer.load(machine);
}
async function initialize() {
  if (loading || items.length) return; loading = true; $('transportRetry').hidden = true;
  $('transportStatus').textContent = '正在准备交通工具展品…'; $('transportStatus').hidden = false;
  try {
    const response = await fetch('/api/transport/exhibits'); if (!response.ok) throw new Error('Transport catalog HTTP ' + response.status);
    const data = await response.json(); if (!Array.isArray(data.items) || !data.items.length) throw new Error('Empty transport catalog');
    items = data.items;
    window.FufuScenes.register('transport', saved=>{
    viewer = createViewer({host:$('transportCanvasHost'), motionFactory:createTransportMotion,
      onStatus(message,error) {
        ready = message === null; $('transportStatus').hidden = ready; $('transportStatus').textContent = message || ''; $('transportStatus').classList.toggle('error',!!error);
        $('transportParts').querySelectorAll('button').forEach((b,i)=>b.disabled=!ready || !viewer?.canFocus(new RegExp(selected.parts[i].pattern,'i')));
        $('transportActions').querySelectorAll('button').forEach((b,i)=>{const a=selected.actions[i];b.disabled=!ready || !(a.kind==='focus'?viewer?.canFocus(new RegExp(a.pattern,'i')):viewer?.canPlay(a.motion));});
      }, onLegend(text) { $('transportLegend').textContent = text; }});
    viewer.setRefEnabled(false);
    select(items.find(item=>item.slug===(saved.itemId || selected?.slug)) || items[0]);
    const instance=viewer;
    return {pause:instance.pause,resume:instance.resume,snapshot:()=>({itemId:selected?.slug}),dispose(){playback?.dispose();playback=null;instance.dispose();if(viewer===instance)viewer=null;}};
    });
  } catch (error) {
    console.error('交通工具馆加载失败',error); items = []; $('transportStatus').textContent = '展品暂时没有加载成功，请重试。'; $('transportRetry').hidden = false;
  } finally { loading = false; }
}
$('transportRetry').addEventListener('click',initialize);
$('transportZoomIn').addEventListener('click',()=>viewer?.zoom(.8));
$('transportZoomOut').addEventListener('click',()=>viewer?.zoom(1.25));
$('transportReset').addEventListener('click',() => viewer?.resetView());
$('transportReference').addEventListener('click',() => { if (viewer) { viewer.setRefEnabled(!viewer.refEnabled); $('transportReference').setAttribute('aria-pressed',String(viewer.refEnabled)); } });
$('transportPause').addEventListener('click',() => viewer?.pauseMotion());
$('transportRestore').addEventListener('click',() => { viewer?.resetMotion();viewer?.resetView();playback?.stop('已恢复姿态，可以重新观察'); $('transportActionText').textContent = '已恢复姿态，可以再选一个动作。'; });
new MutationObserver(() => { if (page.classList.contains('active')) initialize(); }).observe(page,{attributes:true,attributeFilter:['class']});
if (document.body.dataset.transportPreview === 'true') { page.classList.add('active'); initialize(); }
else if (page.classList.contains('active')) initialize();
