// 工程探索页（#page-engineering）与它的子页「小小建造场」（#page-engineering-yard）。
//
// 为什么要"运行时重建"而不是改 HTML：frontend/index.html 是被压缩过的大文件，
// 读取工具每行只拿得到前 2000 个字符，**不能整份重写**。所以页面结构改成运行时生成，
// 只保留 #page-engineering 这个 id（外层的显示/隐藏逻辑挂在这个 id 上）；子页则是
// 运行时**新建一个 <main id="page-engineering-yard" class="page">** 插进 .app-shell ——
// app.js 的 navigate() 就是"给 #page-<名字> 加 .active"，所以新页面天然能接进路由，
// 并且保留顶部导航（比开一个独立 html 更像同一个应用）。
//
// 本模块只管**骨架与交互**，另外三件事各有各的文件：
//   engineering-data.js   内容（三台工程车 + 建造场）
//   engineering-styles.js 样式（逐条抄自远古生命馆）
//   engineering-viewer.js 三维查看器（模型 / 团团 / 地面米格 / 环境光照）
// 拆开的原因：这个会话里没有单点编辑的能力，改文件只能整份重写，大文件一次写完
// 有被截断的风险；顺便也让"内容 / 外观 / 三维 / 页面"各归各位。
//
// 版面骨架与远古生命馆一一对应（对照表在 engineering-styles.js 顶部）。两栏的分工是：
//   左栏（宽）= 名册 + 「怎么干活」+ 「认部件」   —— 都是"挑一台、动手玩"
//   右栏（窄）= 简介 + 三条事实 + 听讲解 + 它有多大 + 来源 —— 都是"读和量"
// 这样两栏长度接近，不会一边很长一边空着。
import { MACHINES, SIZE_REFERENCES, numberText } from './engineering-data.js?v=20261005-observe-5';
import { injectStyles } from './engineering-styles.js?v=20261005-observe-5';
import { createViewer } from './engineering-viewer.js?v=20261005-observe-5';
import { renderMachineThumbnails } from './engineering-machinery.js?v=20261005-observe-5';
import { createPlayback } from './model-playback.js?v=20261005-observe-5';

const page = document.querySelector('#page-engineering');

// 舞台底色：一台机器一种色调，对应远古生命馆的陆地 / 海洋 / 天空
const SCENE_OF = { excavator: 'earth', demolition: 'high' };
const YARD_PAGE_ID = 'page-engineering-yard';
const YARD_SCRIPT = '/engineering-yard.js?v=20261003-lifecycle-1';

let ui = null;
let viewer = null;
let currentId = null;
let playback=null;
function updateToolAvailability(ready) {
  const machine=MACHINES.find(item=>item.id===currentId);
  ui?.tools.querySelectorAll('button[data-part]').forEach(b=>b.disabled=!ready || !viewer?.canFocus(machine.parts[Number(b.dataset.part)][2]));
  ui?.tools.querySelectorAll('button[data-step]').forEach(b=>{
    const action=machine.steps[Number(b.dataset.step)][2];
    b.disabled=!ready || !(action.motion?viewer?.canPlay(action.motion):viewer?.canFocus(action.focus));
  });
  ui?.tools.querySelectorAll('.eng-demo-actions button').forEach(b=>b.disabled=!ready);
}

// 建造场的状态（它是独立页面，所以和主页面分开记）
let yardPage = null;
let yardStage = null;
let yardModule = null;
let yardLoading = false;

// ------------------------------------------------------------------ 路由
// app.js 把 navigate() 挂在 window 上（它是传统脚本，顶层函数就是全局的）。
// 子页不在 app.js 的导航高亮名单里，所以自己把"探索实验室"点亮。
function goPage(name) {
  if (typeof window.navigate === 'function') {
    window.navigate(name);
  } else {
    document.querySelectorAll('.page').forEach((item) => item.classList.remove('active'));
    document.querySelector(`#page-${name}`)?.classList.add('active');
  }
  document.querySelector('.nav-link[data-page="explore"]')?.classList.add('active');
  window.scrollTo(0, 0);
}

// ------------------------------------------------------------------ 主页面骨架
function buildShell() {
  const wrap = document.createElement('div');
  wrap.className = 'eng-wrap';

  // ---- 页头：复用共享的 .lab-heading / .lab-back，和远古生命馆完全同一套 ----
  const heading = document.createElement('section');
  heading.className = 'lab-heading';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'lab-back';
  back.dataset.page = 'explore';
  back.textContent = '← 返回探索实验室';
  back.addEventListener('click', () => goPage('explore'));
  const headingEyebrow = document.createElement('div');
  headingEyebrow.className = 'eyebrow';
  headingEyebrow.textContent = 'MACHINES AT WORK · 工程探索';
  const headingTitle = document.createElement('h1');
  headingTitle.append(document.createTextNode('走进工程机械馆 '), textSpan('🏗️'));
  const headingLede = document.createElement('p');
  headingLede.textContent = '选一台机械，看看它如何挖土、举斗、运料和压路。点部件找结构，播动作看配合。';
  heading.append(back, headingEyebrow, headingTitle, headingLede);

  // ---- 舞台 ----
  const hero = document.createElement('section');
  hero.className = 'eng-hero';
  hero.dataset.scene = 'earth';

  const ambience = document.createElement('div');
  ambience.className = 'eng-ambience';
  ambience.setAttribute('aria-hidden', 'true');

  const chip = document.createElement('div');
  chip.className = 'eng-chip';

  const host = document.createElement('div');
  host.className = 'eng-host';
  host.id = 'engineeringCanvasHost';
  host.setAttribute('role', 'img');

  const hint = document.createElement('div');
  hint.className = 'eng-hint';
  hint.textContent = '拖动旋转 · 滚轮缩放';

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'eng-reset';
  reset.textContent = '↺ 重置视角';
  reset.addEventListener('click', () => viewer?.resetView());

  const refBtn = document.createElement('button');
  refBtn.type = 'button';
  refBtn.className = 'eng-refbtn';
  refBtn.textContent = '👧 团团来比一比';
  refBtn.setAttribute('aria-pressed', 'false');
  refBtn.addEventListener('click', () => {
    const next = refBtn.getAttribute('aria-pressed') !== 'true';
    refBtn.setAttribute('aria-pressed', String(next));
    viewer?.setRefEnabled(next);
  });

  const loading = document.createElement('div');
  loading.className = 'eng-loading';
  loading.hidden = true;

  const caption = document.createElement('div');
  caption.className = 'eng-caption';
  const capSmall = document.createElement('small');
  capSmall.textContent = '转一转 · 认部件 · 看动作';
  const capName = document.createElement('b');
  const capTag = document.createElement('span');
  caption.append(capSmall, capName, capTag);

  const legend = document.createElement('div');
  legend.className = 'eng-legend';

  // 换机器只靠下面名册里的卡片（20260930 用户反馈：图内的切换胶囊和外面重复，
  // 还占掉舞台一角），所以舞台里不再放第二套切换按钮。
  hero.append(ambience, chip, host, hint, reset, refBtn, loading, caption, legend);

  // ---- 舞台下两栏 ----
  const layout = document.createElement('div');
  layout.className = 'eng-layout';

  // 左栏：名册 + 动手玩
  const leftCol = document.createElement('div');
  leftCol.className = 'eng-col';

  const roster = document.createElement('section');
  roster.className = 'eng-roster';
  const rosterHead = document.createElement('div');
  rosterHead.className = 'eng-roster-head';
  const rosterCopy = document.createElement('div');
  const rosterEyebrow = document.createElement('div');
  rosterEyebrow.className = 'eyebrow';
  rosterEyebrow.textContent = 'MEET THE MACHINES';
  const rosterTitle = document.createElement('h2');
  rosterTitle.textContent = '选一台工程车看看';
  const rosterIntro = document.createElement('p');
  rosterIntro.textContent = '每台机器都有它擅长的活儿。点一张卡片，舞台上就换成它，右边和下面的资料也跟着换。';
  rosterCopy.append(rosterEyebrow, rosterTitle, rosterIntro);
  const rosterCount = document.createElement('span');
  rosterCount.textContent = `共 ${MACHINES.length} 台`;
  rosterHead.append(rosterCopy, rosterCount);
  const picks = document.createElement('div');
  picks.className = 'eng-picks';
  const pickButtons = new Map();
  MACHINES.forEach((machine) => picks.append(makePick(machine, pickButtons)));
  const filters = document.createElement('div'); filters.className = 'eng-filters';
  filters.setAttribute('role','group'); filters.setAttribute('aria-label','按工作类型筛选机械');
  const filterButtons = [];
  const categories = [['全部机械',null],['挖土与拆除',['excavator','demolition','loader','bulldozer']],['运输与搅拌',['dump','mixer']],['道路压实',['roller']]];
  categories.forEach(([label, ids], index) => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.setAttribute('aria-pressed',String(index===0));
    button.addEventListener('click', () => {
      filterButtons.forEach((item) => item.setAttribute('aria-pressed',String(item===button)));
      pickButtons.forEach((item,id) => { item.hidden = Boolean(ids && !ids.includes(id)); });
      if (ids && !ids.includes(currentId)) selectMachine(ids[0]);
    });
    filterButtons.push(button); filters.append(button);
  });
  roster.append(rosterHead, filters, picks);

  const tools = document.createElement('section');
  tools.className = 'eng-tools';

  leftCol.append(tools);

  // 右栏：读资料 + 量大小
  const profile = document.createElement('aside');
  profile.className = 'eng-profile';
  profile.setAttribute('aria-live', 'polite');

  layout.append(leftCol, profile);

  // ---- 通往小小建造场的横幅（长得像链接：整行可点 + 末尾箭头）----
  const actions = document.createElement('button');
  actions.type = 'button';
  actions.className = 'eng-actions';
  const actionsIcon = textSpan('🏢');
  const actionsCopy = document.createElement('div');
  const actionsTitle = document.createElement('b');
  actionsTitle.textContent = '去小小建造场，看看它们一起干活';
  const actionsNote = document.createElement('small');
  actionsNote.textContent = '微缩工地：挖掘机挖土、塔吊吊砖、渣土车来回运，还有能换的白天黑夜。';
  actionsCopy.append(actionsTitle, actionsNote);
  const actionsArrow = document.createElement('i');
  actionsArrow.textContent = '进去看看 →';
  actions.append(actionsIcon, actionsCopy, actionsArrow);
  actions.addEventListener('click', goYard);

  // hero 和 layout 包进同一个容器：≤1000px 时舞台 position:sticky 钉在屏幕上方，
  // 往下滚去按「认部件 / 怎么干活」的按钮时，画布一直留在视野里；
  // 容器到 actions 为止，滚过两栏之后舞台自然松开，不会一路跟到底。
  const main = document.createElement('div');
  main.className = 'eng-main';
  const stageCol = document.createElement('div'); stageCol.className = 'eng-stage-col';
  stageCol.append(hero);
  tools.id = 'engineeringControls';
  main.append(stageCol, tools);

  wrap.append(heading, main, roster, profile, actions);

  return {
    wrap, hero, ambience, chip, host, loading, capName, capTag, legend,
    layout, tools, profile, pickButtons,
  };
}

function textSpan(text) {
  const node = document.createElement('span');
  node.textContent = text;
  return node;
}

// 名册里的一张卡
function makePick(machine, registry) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'eng-pick';
  button.setAttribute('aria-pressed', 'false');
  const mark = document.createElement('span');
  mark.className = 'eng-mark';
  mark.textContent = machine.icon;
  const name = document.createElement('b');
  name.textContent = machine.name;
  const latin = document.createElement('small');
  latin.textContent = machine.group;
  const sub = document.createElement('small');
  sub.className = 'eng-pick-size';
  sub.textContent = machine.size && machine.size.lengthM
    ? machine.tagline
    : machine.tagline;
  button.append(mark, name, latin, sub);
  if (machine.size && machine.size.metrics) {
    const badge = document.createElement('em');
    badge.className = 'eng-badge';
    badge.textContent = '分件教具';
    button.append(badge);
  }
  button.addEventListener('click', () => {
    selectMachine(machine.id);
    ui.hero.scrollIntoView({behavior:'instant',block:'start'});
  });
  registry.set(machine.id, button);
  return button;
}

// ------------------------------------------------------------------ 右栏：档案卡
// 「它有多大」：和远古生命馆的尺寸卡同一种排版——数字胶囊 + 一条带参照物刻度的尺
// + 一句用身边东西说的对比。分件模型没有真实尺寸，于是改成列出"它有多精细"。
function sizeCard(machine) {
  const size = machine.size;
  if (!size) return null;
  const box = document.createElement('section');
  box.className = 'eng-size';
  box.setAttribute('aria-label', '尺寸与参照物对比');
  const html = [`<h3>${size.title}</h3>`];
  if (size.metrics) {
    html.push(`<div class="eng-metrics">${size.metrics
      .map(([label, value]) => `<span>${label} ${value}</span>`).join('')}</div>`);
  } else {
    const axisMax = Math.max(size.lengthM * 1.15, 3);
    const ticks = SIZE_REFERENCES.filter((item) => item.meters <= axisMax * 1.02);
    html.push(`<div class="eng-metrics">
      <span>${size.mainLabel} 约 ${numberText(size.lengthM)} 米</span>
      <span>${size.heightLabel} 约 ${numberText(size.heightM)} 米</span>
      <span>${machine.model.procedural ? '教学比例模型' : `重量 ${size.weight}`}</span>
    </div>`);
    html.push(`<div class="eng-track">
      <span class="eng-fill" style="width:${((size.lengthM / axisMax) * 100).toFixed(1)}%"></span>
      ${ticks.map((item) => `<i class="eng-tick" style="left:${((item.meters / axisMax) * 100).toFixed(1)}%"><b>${item.short}</b><em>${numberText(item.meters)} 米</em></i>`).join('')}
    </div>`);
    html.push(`<p class="eng-scale">整条尺 = ${numberText(axisMax)} 米　·　绿色这一段就是这台机器</p>`);
    html.push(`<p class="eng-compare">${size.compare}</p>`);
  }
  if (size.note) html.push(`<p class="eng-note">${size.note}</p>`);
  box.innerHTML = html.join('');
  return box;
}

function renderProfile(machine) {
  const nodes = [];

  const eyebrow = document.createElement('div');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = `${machine.group} · ${machine.latin}`;

  const title = document.createElement('h2');
  title.textContent = machine.name;

  const lede = document.createElement('p');
  lede.className = 'eng-lede';
  lede.textContent = machine.intro;

  const facts = document.createElement('div');
  facts.className = 'eng-facts';
  machine.facts.forEach(([label, value]) => {
    const row = document.createElement('div');
    const key = document.createElement('b');
    key.textContent = label;
    const val = document.createElement('span');
    val.textContent = value;
    row.append(key, val);
    facts.append(row);
  });

  const read = document.createElement('button');
  read.type = 'button';
  read.className = 'eng-read';
  read.textContent = '🔊 听工程讲解';
  read.addEventListener('click', () => {
    if (typeof window.speak !== 'function') return;
    const size = machine.size;
    const sizeText = size
      ? (size.metrics
        ? `它有多精细呢？${size.metrics.map(([k, v]) => `${k} ${v}`).join('，')}。${size.note}`
        : `它有多大呢？${size.mainLabel}大约 ${numberText(size.lengthM)} 米，${size.heightLabel}大约 ${numberText(size.heightM)} 米，重量${size.weight}。${size.compare}`)
      : '';
    window.speak(`${machine.name}，${machine.latin}。${machine.intro}它主要用来${machine.facts[0][1]}。${sizeText}`);
  });

  nodes.push(eyebrow, title, lede, facts, read);

  const card = sizeCard(machine);
  if (card) nodes.push(card);

  const credit = document.createElement('p');
  credit.className = 'eng-credit';
  if (machine.model.credit.local) {
    credit.textContent = machine.model.credit.note;
    nodes.push(credit); ui.profile.replaceChildren(...nodes); return;
  }
  const { title: modelTitle, author, license, licenseUrl, source, note } = machine.model.credit;
  credit.append(document.createTextNode(`模型：“${modelTitle}” by ${author}，`));
  const licenseLink = document.createElement('a');
  licenseLink.href = licenseUrl;
  licenseLink.target = '_blank';
  licenseLink.rel = 'noreferrer';
  licenseLink.textContent = `${license} ↗`;
  const sourceLink = document.createElement('a');
  sourceLink.href = source;
  sourceLink.target = '_blank';
  sourceLink.rel = 'noreferrer';
  sourceLink.textContent = '模型来源 ↗';
  credit.append(licenseLink, document.createTextNode(' · '), sourceLink, document.createTextNode(`。${note}`));
  nodes.push(credit);

  ui.profile.replaceChildren(...nodes);
}

// ------------------------------------------------------------------ 左栏：动手玩
// 一排可点的胶囊 + 下方跟着换的一段说明。
function chipBlock(title, items, onPick) {
  const box = document.createElement('section');
  box.className = 'eng-block';
  const head = document.createElement('h3');
  head.textContent = title;
  const row = document.createElement('div');
  row.className = 'eng-chips';
  const text = document.createElement('p');
  text.setAttribute('aria-live', 'polite');
  const buttons = [];
  items.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = item.label;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      buttons.forEach((other) => {
        other.classList.toggle('active', other === button);
        other.setAttribute('aria-pressed', String(other === button));
      });
      text.textContent = onPick?.(index, item)===false?'这个演示暂时无法显示，请重新选择机械。':item.text;
    });
    row.append(button);
    buttons.push(button);
  });
  text.textContent = '选择一个项目，边看模型边观察。';
  box.append(head, row, text);
  return box;
}

function renderTools(machine) {
  playback?.dispose();
  const nodes = [];
  const actions = document.createElement('div'); actions.className = 'eng-demo-actions';
  [['▶ 连续演示', () => {if(viewer?.playSequence(machine))playback.start();}],['↺ 恢复姿态', () => { viewer?.resetMotion(); viewer?.resetView();playback.stop('已恢复姿态，可以重新观察'); }]].forEach(([label,onClick],index) => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.addEventListener('click', onClick); button.disabled = !machine.model.procedural && index<2; actions.append(button);
  });
  nodes.push(actions);

  const stepsBlock = chipBlock(
    '它怎么干活 · 分步观察',
    machine.steps.map(([label, text]) => ({ label, text })),
    (index) => {
      viewer?.pauseMotion();
      const success=viewer?.playStep(machine,index);
      if(success && machine.steps[index][2].motion)playback.start();
      else playback.stop('已定位部件，可以拖动模型细看');
      return success;
    },
  );
  stepsBlock.querySelectorAll('button').forEach((b,i)=>b.dataset.step=i);
  playback=createPlayback(()=>viewer,page,index=>{
    if(index<0)return;
    stepsBlock.querySelectorAll('button').forEach((b,i)=>{b.classList.toggle('active',i===index);b.setAttribute('aria-pressed',String(i===index));});
    stepsBlock.querySelector('p').textContent=machine.steps[index][1];
  });
  // 模型做不到的动作（上半身回转、钳口开合）在这里直说，不拿别的动画硬充
  if (machine.stepNote) {
    const note = document.createElement('p');
    note.className = 'eng-note';
    note.textContent = machine.stepNote;
    stepsBlock.append(note);
  }
  nodes.push(stepsBlock);

  // 部件观察：点一个部件名，除了换文字，还会在模型上框出对应的零件
  const partsNote = document.createElement('p');
  partsNote.className = 'eng-note';
  partsNote.textContent = '这件模型里的零件没有按名字分组，所以只能换文字，没法在图上框出来。';
  partsNote.hidden = true;

  const partsNode = chipBlock(
    '认一认它的部件（点一下，在模型上找出来）',
    machine.parts.map(([, label, , text]) => ({ label, text })),
    (index) => {
      viewer?.pauseMotion();playback.stop('已定位部件，可以拖动模型细看');
      const found = viewer?.focusPart(machine.parts[index][2], machine.parts[index][1]);
      partsNote.hidden = Boolean(found);
      return found;
    },
  );
  partsNode.append(partsNote);
  partsNode.querySelectorAll('button').forEach((b,i)=>b.dataset.part=i);
  nodes.push(partsNode);

  const motionPanel = document.createElement('div');
  motionPanel.append(actions, stepsBlock,playback.node);
  window.FufuWorkbench.tabs(ui.tools, [
    {label:'看动作', node:motionPanel},
    {label:'认部件', node:partsNode},
  ], ui.hero.parentElement);
  updateToolAvailability(false);
}

// ------------------------------------------------------------------ 切换机器
function selectMachine(id) {
  const machine = MACHINES.find((item) => item.id === id) || MACHINES[0];
  currentId = machine.id;
  ui.hero.dataset.scene = SCENE_OF[machine.id] || 'earth';
  ui.chip.textContent = machine.group;
  ui.capName.textContent = machine.name;
  ui.capTag.textContent = machine.tagline;
  ui.ambience.replaceChildren(...machine.ambience.map((icon) => textSpan(icon)));
  ui.pickButtons.forEach((button, key) => button.setAttribute('aria-pressed', String(key === machine.id)));
  renderProfile(machine);
  renderTools(machine);
  viewer?.load(machine);
}

// ------------------------------------------------------------------ 小小建造场（独立页面）
// 它在自己的页面上，所以进来之前先把页面建好、再交给 navigate() 切过去。
function ensureYardPage() {
  if (yardPage?.isConnected) return;
  const shell = document.querySelector('.app-shell') || document.body;

  const main = document.createElement('main');
  main.id = YARD_PAGE_ID;
  main.className = 'page learning-lab engineering-lab';

  const heading = document.createElement('section');
  heading.className = 'lab-heading';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'lab-back';
  back.textContent = '← 返回工程探索';
  back.addEventListener('click', () => goPage('engineering'));
  const eyebrow = document.createElement('div');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'MACHINES AT WORK · 小小建造场';
  const title = document.createElement('h1');
  title.append(document.createTextNode('小小建造场 '), textSpan('🏗️'));
  const lede = document.createElement('p');
  lede.textContent = '走进桌面上的微型建筑工地，看看挖掘、运输与吊装如何配合，一层层把房子建起来。';
  heading.append(back, eyebrow, title, lede);

  const stage = document.createElement('section');
  stage.className = 'eng-yard-stage';
  stage.setAttribute('aria-label', '会动的微缩工地');

  const foot = document.createElement('p');
  foot.className = 'eng-yard-foot';
  foot.textContent = '观察小任务：找找戴安全帽的工人、堆放整齐的材料和基坑边的警戒栏。拖动旋转，滚轮缩放；调整施工进度，看看房子怎样长高。';

  main.append(heading, stage, foot);

  const footer = shell.querySelector('footer');
  if (footer) footer.before(main);
  else shell.append(main);

  yardPage = main;
  yardStage = stage;
}

function goYard() {
  ensureYardPage();
  goPage('engineering-yard');
  mountYard();
}

function mountYard() {
  if (!yardStage) return;
  if (yardModule) {
    yardModule.resume?.();
    return;
  }
  if(window.fufuYard){window.FufuScenes.enter('engineering-yard');return;}
  if (yardLoading) return;
  yardLoading = true;
  yardStage.replaceChildren(yardMessage('正在搭建工地…'));
  const script = document.createElement('script');
  script.type = 'module';
  script.src = YARD_SCRIPT;
  script.onerror = () => {
    yardLoading = false;
    yardStage.replaceChildren(yardMessage('建造场模块没能加载。看看浏览器控制台里的报错。'));
  };
  document.head.append(script);
  // engineering-yard.js 加载完会把自己挂到 window.fufuYard 上
  const wait = window.setInterval(() => {
    if (!window.fufuYard) return;
    window.clearInterval(wait);
    yardLoading = false;
    window.FufuScenes.register('engineering-yard', saved=>{
      yardStage.replaceChildren();
      yardModule=window.fufuYard.mount(yardStage,saved);
      const instance=yardModule;
      return {pause:instance.pause,resume:instance.resume,snapshot:instance.snapshot,dispose(){instance.dispose();if(yardModule===instance)yardModule=null;}};
    });
  }, 60);
}

function yardMessage(text) {
  const node = document.createElement('div');
  node.className = 'eng-yard-msg';
  node.textContent = text;
  return node;
}

// ------------------------------------------------------------------ 启动
function boot() {
  if (!page) return;
  injectStyles();
  ui = buildShell();
  page.replaceChildren(ui.wrap);
  try { renderMachineThumbnails(MACHINES, ui.pickButtons); } catch (error) { console.warn('机械缩略图暂不可用', error); }
  window.FufuScenes.register('engineering', saved=>{
  viewer = createViewer({
    host: ui.host,
    onLegend: (text) => { ui.legend.textContent = text; },
    onStatus: (text, isError) => {
      updateToolAvailability(!text && !isError);
      if (!text) {
        ui.loading.hidden = true;
        return;
      }
      ui.loading.textContent = text;
      ui.loading.classList.toggle('is-error', Boolean(isError));
      ui.loading.hidden = false;
    },
  });
  selectMachine(saved.machineId || currentId || MACHINES[0].id);
  const instance=viewer;
  return {pause:instance.pause,resume:instance.resume,snapshot:()=>({machineId:currentId}),dispose(){playback?.dispose();playback=null;instance.dispose();if(viewer===instance)viewer=null;}};
  });
}

boot();
