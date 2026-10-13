// 远古生命馆（陆地 / 海洋 / 天空）与工程探索的展示数据与交互。
//
// 图标（"logo"）说明：Unicode 13.0 及以后新增的表情符号，在旧版 Windows 自带字体里
// 没有字形，会显示成空心方框。这里统一换成各系统都有的老表情，并在页面末尾对整份
// DOM 做一次兜底替换＋变更观察（index.html 是压缩过的单行文件，只能从脚本侧处理）。
const ICON_SWAP = {
  '🪽': '🕊️',   // 翅膀（Unicode 15.0）→ 鸽子
  '🪶': '🐦',   // 羽毛（13.0）→ 小鸟
  '🪰': '🦗',   // 苍蝇（13.0）→ 蟋蟀
  '🪸': '🐠',   // 珊瑚（14.0）→ 热带鱼
  '🦣': '🐘',   // 猛犸（13.0）→ 大象
  '🪣': '💧',   // 水桶（13.0）→ 水滴
  '🪧': '🚩',   // 路牌（13.0）→ 旗子
  '🪵': '🌲',   // 木头（13.0）→ 松树
  '🪷': '🌸',   // 莲花（14.0）→ 花朵
  '🪺': '🥚',   // 巢（14.0）→ 蛋
  '🫧': '💧',   // 气泡（14.0）→ 水滴
};
const ICON_PATTERN = new RegExp(`[${Object.keys(ICON_SWAP).join('')}]`, 'gu');
function swapUnsupportedIcons(root) {
  const target = root || document.body;
  if (!target || !document.createTreeWalker) return;
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent || parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') continue;
    const text = node.nodeValue;
    if (!text) continue;
    ICON_PATTERN.lastIndex = 0;
    if (!ICON_PATTERN.test(text)) continue;
    ICON_PATTERN.lastIndex = 0;
    node.nodeValue = text.replace(ICON_PATTERN, (char) => ICON_SWAP[char] || char);
  }
}
const DINO_LOGO_KIND = {
  apatosaurus: 'longneck', maiasaura: 'duckbill', sauropelta: 'armored', stegosaurus: 'armored',
  triceratops: 'horned', pachycephalosaurus: 'dome', mammoth: 'mammal', lystrosaurus: 'mammal',
  anomalocaris: 'shrimp', ichthyosaur: 'marine', megalodon: 'shark', mosasaurus: 'marine',
  plesiosaurus: 'longneck-marine', archaeopteryx: 'bird', meganeura: 'insect',
  pteranodon: 'pterosaur', rhamphorhynchus: 'pterosaur', tupandactylus: 'pterosaur',
};
const DINO_LOGO_ART = {
  theropod: '<path d="M8 29c4-7 12-11 20-10l6-6 6 2-3 6 7 3-2 4-12 1-5 7-2 8h-4l-1-8-7 1-4 7h-4l2-9-6 2-3-3z"/><path d="m21 20 2-5 3 4m4-1 2-5 3 5"/>',
  longneck: '<path d="M7 31c4-7 11-10 20-8l4-12 4 1-1 14 6 3-2 4-12 1-3 8h-4l-1-8-7 1-4 7H7l2-9-5 1-2-3z"/>',
  duckbill: '<path d="M7 30c4-7 12-10 23-8l7 2 5 3-6 3-12 1-5 7h-4l-1-7-7 1-4 6H9l2-8-6 2-2-3z"/><path d="m22 20 2-5 3 5m5-3 3 4"/>',
  armored: '<path d="M7 30c4-7 12-10 23-8l8 4 4 2-4 3-13 1-4 7h-4l-1-7-7 1-4 6H9l2-8-6 2-2-3z"/><path d="m12 22 2-6 4 5m2-6 4 5m2-5 4 5m2-3 4 4"/>',
  horned: '<path d="M8 30c4-7 12-10 22-8l8 3 5 3-6 3-13 1-4 7h-4l-1-7-7 1-4 6H9l2-8-6 2-2-3z"/><path d="m31 21 3-8 2 9m1 2 7-5-4 8"/>',
  dome: '<path d="M7 31c4-7 12-10 23-8l8 4 4 2-4 3-13 1-4 7h-4l-1-7-7 1-4 6H9l2-8-6 2-2-3z"/><path d="M19 23c1-7 5-10 10-10s9 3 10 10"/>',
  mammal: '<path d="M8 31c2-8 10-12 20-10 7 1 10 5 12 8l-4 4-12 1-4 7h-4l-1-7-7 1-3 6H9l2-8-5 1-2-3z"/><path d="M35 28c3 1 5 4 4 8m-3-7c5 1 7 5 6 9"/>',
  shrimp: '<path d="M8 30c4-9 14-13 23-8 6 3 8 8 5 12-3 4-10 4-15 1l-8 5-3-3 5-6-9 2-4-3z"/><path d="m24 20 1-7m4 6 4-7m-16 6-4-5"/>',
  marine: '<path d="M5 26c9-9 23-10 33 0-10 10-24 9-33 0zm33 0 7-7v14z"/><circle cx="15" cy="25" r="1.7" fill="#fff"/>',
  shark: '<path d="M5 29c9-12 23-13 34-3l5 4-6 4c-11 8-25 6-33-5z"/><path d="m22 21 5-11 6 14m5 1 7-8-2 13"/><circle cx="14" cy="28" r="1.6" fill="#fff"/>',
  'longneck-marine': '<path d="M8 31c6-9 17-12 27-5l7 4-6 4-13 1-3 6h-4l-1-7-7 1-4 5H9l2-7-5 1-2-3z"/><path d="m29 26 3-13 4 1-1 13"/>',
  bird: '<path d="M7 32c7-12 21-16 33-8-6 2-11 6-15 13-4-4-9-5-18-5z"/><path d="m22 29 4-12 7 10m6-3 6-3-4 6"/>',
  insect: '<ellipse cx="25" cy="29" rx="4" ry="12"/><circle cx="25" cy="14" r="4"/><path d="M21 22c-10-9-15-4-12 2 3 4 7 5 12 5m8-7c10-9 15-4 12 2-3 4-7 5-12 5M21 32l-8 7m11-5-4 8m9-8 8 7m-11-6 4 7m-8-25-6-6m12 6 6-6"/>',
  pterosaur: '<path d="M6 31c9-12 16-16 21-10 6-8 13-9 16-7-3 9-4 15-12 19l-4-5-4 10h-4l1-10-8 5-6-2z"/><path d="m27 21 1-10 4 1"/>',
};
function dinosaurLogo(dinosaur, detail = false) {
  const kind = DINO_LOGO_KIND[dinosaur.model] ||
    (dinosaur.type.includes('翼龙') ? 'pterosaur' : dinosaur.type.includes('昆虫') ? 'insect' : 'theropod');
  const badge = document.createElement('span');
  badge.className = detail ? 'dino-animal-logo dino-animal-logo-large' : 'dino-animal-logo';
  badge.setAttribute('aria-hidden', 'true');
  badge.innerHTML = `<svg viewBox="0 0 48 48" focusable="false">${DINO_LOGO_ART[kind]}</svg>`;
  return badge;
}
// 页面上的图标有一部分是脚本动态生成的（积分商店卡片、物种列表……），
// 所以再加一个观察器兜底：有新内容进来就顺手换一次。
// 只替换上面表里那些字符，替换后再跑一次不会有任何改动，不会打转。
let iconSweepTimer = 0;
function scheduleIconSweep() {
  if (iconSweepTimer) return;
  iconSweepTimer = window.setTimeout(() => { iconSweepTimer = 0; swapUnsupportedIcons(document.body); }, 120);
}

// ------------------------------------------------------------------ 体型参照
// 用孩子身边就能看到的东西当尺子。所有数字都是"约"值：化石只能给出区间估计，
// 不同研究给出的结论也不完全一样，这里取常见的中位说法。
const SIZE_REFERENCES = [
  { short: '成年人', meters: 1.7 },
  { short: '轿车', meters: 4.6 },
  { short: '公交车', meters: 12 },
  { short: '篮球场', meters: 28 },
];
const numberText = (value) => String(Number(value.toFixed(2)));
// 尺寸卡片的样式：靠脚本注入，不去改 index.html 与 style.css
function injectSizeStyles() {
  if (document.getElementById('dinoSizeStyles')) return;
  const style = document.createElement('style');
  style.id = 'dinoSizeStyles';
  style.textContent = `
    .dino-size{margin-top:14px;padding:14px 16px 16px;border-radius:18px;background:rgba(255,255,255,.72);border:1px solid rgba(120,100,70,.18);width:100%;box-sizing:border-box}
    .dino-size h3{margin:0 0 10px;font-size:15px;letter-spacing:.01em;color:#4a3c2c}
    .dino-size-metrics{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:22px}
    .dino-size-metrics span{font-size:13px;color:#5b4a33;background:rgba(255,243,206,.95);border-radius:999px;padding:4px 10px}
    .dino-size-track{position:relative;height:12px;border-radius:999px;background:rgba(255,232,178,.75);margin:0 6px 6px 0}
    .dino-size-fill{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:linear-gradient(90deg,#8ed07a,#3f9d55)}
    .dino-size-tick{position:absolute;top:16px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;line-height:1.35;white-space:nowrap}
    .dino-size-tick::before{content:'';position:absolute;top:-16px;width:1px;height:14px;background:rgba(120,100,70,.5)}
    .dino-size-tick b{font-size:11px;font-weight:600;color:#6b5a41}
    .dino-size-tick em{font-size:10px;font-style:normal;color:#9c8a6d}
    .dino-size-scale{margin:34px 0 0;font-size:11px;color:#9c8a6d}
    .dino-size-compare{margin:10px 0 0;font-size:13px;line-height:1.75;color:#4b4032}
    .dino-size-note{margin:8px 0 0;font-size:12px;line-height:1.7;color:#8b7a5f}
    .dino-pick-size{display:block;margin-top:2px;font-size:11px;color:#9c8a6d}
    .dino-animal-logo{display:grid;place-items:center;width:38px;height:38px;margin-bottom:3px;border-radius:50%;background:linear-gradient(145deg,#f8edcf,#e7d6ab);color:#66744e;box-shadow:inset 0 0 0 1px #ffffffb8,0 2px 6px #55442818}
    .dino-animal-logo svg{width:27px;height:27px;fill:currentColor;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
    .dino-animal-logo-large{position:absolute;right:16px;top:16px;width:58px;height:58px;margin:0;background:linear-gradient(145deg,#fbf1d9,#e9d5a5);color:#66744e}
    .dino-animal-logo-large svg{width:41px;height:41px}
    .dino-profile-symbol{display:grid;place-items:center;width:58px;height:58px;font-size:0;filter:none}
    .dino-profile-symbol .dino-animal-logo-large{position:static;width:58px;height:58px}
    .dino-pick{position:relative;transition:transform .16s ease,border-color .16s ease,background .16s ease}
    .dino-pick:hover{transform:translateY(-2px)}
  `;
  document.head.appendChild(style);
}
function sizeMarkup(dinosaur) {
  const size = dinosaur.size;
  const axisMax = Math.max(size.lengthM * 1.15, 3);
  const ticks = SIZE_REFERENCES.filter((item) => item.meters <= axisMax * 1.02);
  return `
    <h3>它有多大 · HOW BIG</h3>
    <div class="dino-size-metrics">
      <span>${size.mainLabel} 约 ${numberText(size.lengthM)} 米</span>
      <span>${size.heightLabel} 约 ${numberText(size.heightM)} 米</span>
      <span>体重 ${size.weight}</span>
    </div>
    <div class="dino-size-track">
      <span class="dino-size-fill" style="width:${((size.lengthM / axisMax) * 100).toFixed(1)}%"></span>
      ${ticks.map((item) => `<i class="dino-size-tick" style="left:${((item.meters / axisMax) * 100).toFixed(1)}%"><b>${item.short}</b><em>${numberText(item.meters)} 米</em></i>`).join('')}
    </div>
    <p class="dino-size-scale">整条尺 = ${numberText(axisMax)} 米　·　绿色这一段就是你看到的这一只</p>
    <p class="dino-size-compare">${size.compare}</p>
    ${size.modelNote ? `<p class="dino-size-note">${size.modelNote}</p>` : ''}
  `;
}
// 尺寸卡片插在简介面板底部；面板结构写在 index.html 里（单行大文件，不能整份重写），
// 所以这里就近插到已知元素所在的 <aside> 里。
let sizeHost = null;
function renderSize(dinosaur) {
  if (!dinosaur.size) return;
  if (!sizeHost || !sizeHost.isConnected) {
    const credit = document.querySelector('#dinoModelCredit');
    const anchor = (credit && credit.closest('aside')) || (credit && credit.parentElement) || document.querySelector('.dino-profile');
    if (!anchor) return;
    sizeHost = document.createElement('section');
    sizeHost.className = 'dino-size';
    sizeHost.setAttribute('aria-label', '体型与参照物对比');
    anchor.appendChild(sizeHost);
  }
  sizeHost.innerHTML = sizeMarkup(dinosaur);
}

const machineParts = {
  cab: { title: '驾驶室：司机的观察位置', text: '司机坐在驾驶室里，用操纵杆和踏板控制回转、行走与工作装置。玻璃窗让司机观察铲斗和周围环境。', fact: '想一想：为什么挖掘机驾驶室通常能向左右回转？' },
  boom: { title: '动臂：抬起整条工作臂', text: '动臂连接机身和斗杆。液压油推动油缸伸缩，动臂就能抬高或放低。', fact: '观察线索：动臂是挖掘机工作装置中靠近机身的长臂。' },
  arm: { title: '斗杆：把铲斗送到目标位置', text: '斗杆连着动臂和铲斗。它向外伸、向内收，帮助铲斗够到沟槽或土堆。', fact: '想一想：动臂和斗杆配合，能让铲斗到达哪些位置？' },
  bucket: { title: '铲斗：挖起并装载泥土', text: '铲斗边缘的斗齿切入土壤，斗杆和铲斗油缸配合，把土装进斗里，再转运到合适的位置。', fact: '安全提醒：真实工地上，挖掘机作业半径内不能站人。' },
  track: { title: '履带：在松软地面上移动', text: '两条履带由发动机和传动系统驱动，可以让挖掘机前进、后退和原地转向。较宽的履带能把重量分散到更大的地面上。', fact: '工程师会根据地面和任务选择履带或轮式底盘。' },
};
const machineSteps = {
  dig: ['第一步：挖掘', '挖掘机把铲斗压入土里，再收回斗杆，让泥土进入铲斗。液压系统为这几个动作提供力量。', '看看铲斗怎样切入土壤，再观察动臂和斗杆如何配合。'],
  swing: ['第二步：回转', '装满土后，上部机身带着驾驶室和工作臂一起回转，把铲斗转向运输车辆或指定堆放区。履带底盘此时可以保持不动。', '挖掘和回转可以配合进行，减少不必要的移动。'],
  dump: ['第三步：卸土', '铲斗到达目标上方后，铲斗油缸改变斗口方向，泥土落入自卸车或堆放区，然后挖掘机回到挖掘位置。', '看一看：把挖、转、卸连起来，就是一次常见的装车循环。'],
};
const machineKinds = {
  bulldozer: '推土机：用前方铲刀推运土石、平整场地；履带让它能在松软地面行驶。',
  crane: '起重机：用吊臂、钢丝绳和吊钩垂直起吊并移动重物；吊装时要留意载荷和稳定性。',
  dump: '自卸车：负责把土石运到别处；到达卸料点后，车厢在液压装置作用下倾斜卸料。',
};
// size：长（飞行类用翼展）/ 高 / 体重 + 一句用参照物说的对比。数字都是约值。
const dinosaurs = {
  land: [
    { name: '剑龙', latin: 'Stegosaurus', model: 'stegosaurus', symbol: '🦕', type: '植食恐龙', date: '晚侏罗世', feature: '背板与尾刺', diet: '植物',
      size: { mainLabel: '体长', lengthM: 9, heightLabel: '站立高度', heightM: 4, weight: '约 5 吨', compare: '长度和一辆公交车差不多；背板最高处有 4 米——成年人站在它旁边，头顶只到它的肚子。' },
      description: '剑龙生活在晚侏罗世。它背上的骨板和尾部尖刺很醒目，四肢结构显示它主要以植物为食，取食时头几乎贴近地面。' },
    { name: '迷惑龙', latin: 'Apatosaurus', model: 'apatosaurus', symbol: '🦕', type: '蜥脚类恐龙', date: '晚侏罗世', feature: '粗壮的腿与长尾', diet: '植物',
      size: { mainLabel: '体长', lengthM: 21, heightLabel: '肩部高度', heightM: 4.5, weight: '约 20 吨', compare: '体长 21 米，比两辆公交车首尾接起来还长一点；它的一条腿差不多和一个成年人一样高。' },
      description: '迷惑龙是生活在北美的蜥脚类恐龙，身体庞大，四条腿像柱子一样支撑着身躯。它的长尾巴有助于平衡，长脖子可以伸向不同位置取食。' },
    { name: '重爪龙', latin: 'Baryonyx', model: 'baryonyx', symbol: '🦖', type: '肉食恐龙', date: '早白垩世', feature: '细长吻部与大拇指爪', diet: '鱼类与其他动物',
      size: { mainLabel: '体长', lengthM: 8.5, heightLabel: '站立高度', heightM: 2.6, weight: '约 1.7 吨', compare: '体长 8.5 米，比一辆轿车长将近一倍；站直时比教室门框（2.1 米）还高一个头。' },
      description: '重爪龙前肢上有一枚醒目的大爪，细长的吻部和牙齿适合抓取食物。它可能常在河流、湖泊附近活动，化石中也发现过鱼类遗骸。' },
    { name: '食肉牛龙', latin: 'Carnotaurus', model: 'carnotaurus', symbol: '🦖', type: '肉食恐龙', date: '晚白垩世', feature: '眼睛上方的角与短前肢', diet: '其他动物',
      size: { mainLabel: '体长', lengthM: 8, heightLabel: '站立高度', heightM: 3, weight: '约 1.5 吨', compare: '体长 8 米，站着有 3 米高：成年人举起手也够不到它的背。' },
      description: '食肉牛龙生活在白垩纪晚期的南美洲。它头部上方长有一对角，后肢较长，前肢则非常短小，是容易辨认的兽脚类恐龙。' },
    { name: '双脊龙', latin: 'Dilophosaurus', model: 'dilophosaurus', symbol: '🦖', type: '肉食恐龙', date: '早侏罗世', feature: '头顶一对骨质冠饰', diet: '其他动物',
      size: { mainLabel: '体长', lengthM: 6, heightLabel: '站立高度', heightM: 2.1, weight: '约 400 千克', compare: '体长 6 米，比一辆轿车长一半；它站起来比成年人高一头。' },
      description: '双脊龙生活在侏罗纪早期，名字来自头顶成对的细长骨冠。它用两条后腿行走，长尾巴帮助身体保持平衡。' },
    { name: '巨盗龙', latin: 'Gigantoraptor', model: 'gigantoraptor', symbol: '🦚', type: '有羽毛的兽脚类恐龙', date: '晚白垩世', feature: '高大的身躯与喙状嘴', diet: '植物与小动物',
      size: { mainLabel: '体长', lengthM: 8, heightLabel: '站立高度', heightM: 3.5, weight: '约 1.5 吨', compare: '体长 8 米、高 3.5 米：差不多是一层楼再加一个小朋友那么高。' },
      description: '巨盗龙是体形高大的偷蛋龙类恐龙。它用喙状嘴取食，化石证据和近亲特征也让科学家推测它可能有羽毛。' },
    { name: '水龙兽', latin: 'Lystrosaurus', model: 'lystrosaurus', symbol: '🦎', type: '兽孔类动物', date: '晚二叠世至早三叠世', feature: '喙状嘴与一对獠牙', diet: '植物',
      size: { mainLabel: '体长', lengthM: 1, heightLabel: '肩部高度', heightM: 0.6, weight: '约 90 千克', compare: '体长只有 1 米，大约是一只大狗那么大；但抱是抱不动的，它差不多有 90 千克。' },
      description: '水龙兽不是恐龙，而是生活在恐龙出现之前的兽孔类动物。它用喙状嘴啃食植物，化石遍布多个大陆，是二叠纪末大灭绝后仍繁盛的动物之一。' },
    { name: '慈母龙', latin: 'Maiasaura', model: 'maiasaura', symbol: '🦕', type: '植食恐龙', date: '晚白垩世', feature: '鸭嘴与巢区化石', diet: '植物',
      size: { mainLabel: '体长', lengthM: 9, heightLabel: '站立高度', heightM: 2.5, weight: '约 4 吨', compare: '体长 9 米，和一辆公交车差不多；站着约 2.5 米，比教室门框还高出一个小孩的头。' },
      description: '慈母龙的名字有“好母亲蜥蜴”的意思，来自一处保存了巢、蛋和幼龙遗骸的化石遗址。它让科学家能够研究恐龙成长和育幼的线索。' },
    { name: '长毛猛犸象', latin: 'Woolly mammoth', model: 'mammoth', symbol: '🐘', type: '已灭绝哺乳动物', date: '更新世至全新世早期', feature: '长毛、弯曲象牙与厚脂肪层', diet: '草与灌木',
      size: { mainLabel: '体长（含象牙）', lengthM: 5.5, heightLabel: '肩部高度', heightM: 3, weight: '4～6 吨', compare: '成年猛犸象肩高 3 米，比成年人的两倍还高；体重 4～6 吨，比一辆小汽车重得多。',
        modelNote: '注意：这件三维模型是一只猛犸象幼崽，所以在屏幕上看着比上面的数字小很多。' },
      description: '长毛猛犸象是适应寒冷环境的已灭绝象类，身上覆盖着浓密长毛，并有弯曲的象牙。它生活在冰期的草原环境中，与恐龙相隔数千万年。' },
    { name: '肿头龙', latin: 'Pachycephalosaurus', model: 'pachycephalosaurus', symbol: '🦖', type: '植食恐龙', date: '晚白垩世', feature: '厚厚的圆顶头骨', diet: '植物',
      size: { mainLabel: '体长', lengthM: 4.5, heightLabel: '站立高度', heightM: 2, weight: '约 450 千克', compare: '体长 4.5 米，比一辆轿车短一点点；头骨上的圆顶像戴了一顶厚厚的头盔。' },
      description: '肿头龙以厚实的圆顶头骨和头部周围的小骨突闻名。它生活在白垩纪晚期，头骨可能用于展示或同类之间的互动。' },
    { name: '结节龙', latin: 'Sauropelta', model: 'sauropelta', symbol: '🦕', type: '植食恐龙', date: '早白垩世', feature: '骨甲与肩部尖刺', diet: '低矮植物',
      size: { mainLabel: '体长', lengthM: 5.5, heightLabel: '背部高度', heightM: 1.5, weight: '约 1.5 吨', compare: '体长 5.5 米，比轿车长一些；它低头走路时，背的高度差不多到成年人的胸口。' },
      description: '结节龙属于结节龙类，身体覆盖着骨质甲片，肩部还有向外伸出的长刺。它用四条腿行走，低头取食地面附近的植物。' },
    { name: '棘龙', latin: 'Spinosaurus', model: 'spinosaurus', symbol: '🦖', type: '肉食恐龙', date: '白垩纪', feature: '背部高帆与鳄形长吻', diet: '鱼类与其他动物',
      size: { mainLabel: '体长', lengthM: 15, heightLabel: '站立高度', heightM: 4, weight: '约 7 吨', compare: '体长 15 米，比一辆公交车还长；背上那面“帆”竖起来差不多和一个成年人一样高。' },
      description: '棘龙背部有由脊椎延长形成的高帆状结构，头骨细长，牙齿呈圆锥形。化石和身体特征显示它与水域关系密切，常被认为是适应捕鱼的大型兽脚类恐龙。' },
    { name: '三角龙', latin: 'Triceratops', model: 'triceratops', symbol: '🦕', type: '植食恐龙', date: '晚白垩世', feature: '三只角与颈盾', diet: '植物',
      size: { mainLabel: '体长', lengthM: 8, heightLabel: '站立高度', heightM: 3, weight: '约 8 吨', compare: '体长 8 米，比公交车短一点；可它重约 8 吨，和一辆公交车一样重。' },
      description: '三角龙生活在白垩纪末期。头上的三只角和颈部骨质盾板是它的代表性特征，可能用于防御或展示。' },
    { name: '霸王龙', latin: 'Tyrannosaurus rex', model: 'tyrannosaurus-rex', symbol: '🦖', type: '肉食恐龙', date: '晚白垩世', feature: '强大的头骨与短前肢', diet: '其他动物',
      size: { mainLabel: '体长', lengthM: 12, heightLabel: '站立高度', heightM: 4, weight: '约 8 吨', compare: '体长 12 米，正好和一整辆公交车一样长；站着有 4 米高，成年人站在它面前，头顶还不到它的胸口。' },
      description: '霸王龙生活在白垩纪末期。它有强壮的后肢和很大的头骨；两只前肢较短，但并不是完全没有作用。' },
  ],
  sea: [
    { name: '奇虾', latin: 'Anomalocaris', model: 'anomalocaris', symbol: '🦐', type: '寒武纪海洋动物', date: '寒武纪中期', feature: '环形口器与一对捕捉附肢', diet: '小型海洋动物',
      size: { mainLabel: '体长', lengthM: 1, heightLabel: '身体厚度', heightM: 0.2, weight: '约 2 千克', compare: '体长大约 1 米，像一只趴在海底的大虾；在 5 亿年前的海洋里，它已经算是“巨兽”了。' },
      description: '奇虾生活在寒武纪海洋，是当时体形较大的游泳动物之一。它头部前方的附肢可以抓取猎物，环形口器帮助它处理食物。' },
    { name: '鱼龙类', latin: 'Ichthyosaur', model: 'ichthyosaur', symbol: '🐬', type: '海生爬行动物', date: '三叠纪至晚白垩世', feature: '流线型身体与鳍状肢', diet: '鱼类与鱿鱼类',
      size: { mainLabel: '体长', lengthM: 3, heightLabel: '身体厚度', heightM: 0.8, weight: '约 200 千克', compare: '体长约 3 米，比一辆轿车短一些；外形像海豚，可它用肺呼吸，要浮上水面换气。' },
      description: '鱼龙类是重新适应海洋生活的爬行动物，身体外形像鱼和海豚，四肢演化成鳍状肢。它们用肺呼吸，需要浮上海面换气。' },
    { name: '巨齿鲨', latin: 'Megalodon', model: 'megalodon', symbol: '🦈', type: '已灭绝鲨鱼', date: '中新世至上新世', feature: '巨大牙齿与强壮的下颌', diet: '海洋动物',
      size: { mainLabel: '体长', lengthM: 16, heightLabel: '含背鳍的高度', heightM: 4, weight: '约 50 吨', compare: '体长 16 米，比一辆公交车还长；一颗牙齿就有成年人手掌那么大，体重差不多是 10 头大象。' },
      description: '巨齿鲨是已经灭绝的大型鲨鱼，最容易找到的化石是它宽大而锯齿状的牙齿。科学家用牙齿和椎骨化石推测它的体形与捕食方式。' },
    { name: '沧龙', latin: 'Mosasaurus', model: 'mosasaurus', symbol: '🦎', type: '海生爬行动物', date: '晚白垩世', feature: '长尾鳍与桨状四肢', diet: '鱼类与其他海洋动物',
      size: { mainLabel: '体长', lengthM: 13, heightLabel: '身体厚度', heightM: 2, weight: '约 10 吨', compare: '体长 13 米，比公交车还要长一点；把它想成一条放大的鳄鱼——它的头就有成年人的一条手臂那么长。' },
      description: '沧龙是白垩纪海洋中的大型爬行动物。它用桨状四肢转向，以强壮的长尾巴推进，鼻孔位置显示它需要浮出水面呼吸。' },
    { name: '蛇颈龙类', latin: 'Plesiosaur', model: 'plesiosaurus', symbol: '🐢', type: '海生爬行动物', date: '晚三叠世至晚白垩世', feature: '长颈与四枚宽大的鳍', diet: '鱼类与鱿鱼类',
      size: { mainLabel: '体长', lengthM: 10, heightLabel: '身体厚度', heightM: 1.5, weight: '约 2 吨', compare: '体长 10 米，其中脖子就占了将近一半——它的脖子比一个成年人还长。' },
      description: '蛇颈龙类用四枚宽大的鳍在海中划水，身体后方还有短尾巴。不同种类的脖子长短不一，长颈种类能从不同方向接近猎物。' },
  ],
  sky: [
    { name: '始祖鸟', latin: 'Archaeopteryx', model: 'archaeopteryx', symbol: '🐦', type: '带羽毛的兽脚类恐龙', date: '晚侏罗世', feature: '羽毛、翅膀与长骨尾', diet: '小型动物',
      size: { mainLabel: '翼展', lengthM: 0.6, heightLabel: '站立高度', heightM: 0.3, weight: '约 1 千克', compare: '从头到尾大约 50 厘米，和一只鸽子差不多大；可它嘴里还长着牙齿，翅膀上也有爪子。' },
      description: '始祖鸟生活在侏罗纪晚期，化石同时保存了羽毛和许多恐龙般的骨骼特征。它帮助科学家研究鸟类与兽脚类恐龙之间的演化关系。' },
    { name: '巨脉蜻蜓', latin: 'Meganeura', model: 'meganeura', symbol: '🦗', type: '古生代巨型昆虫', date: '石炭纪', feature: '巨大的翅膀与复眼', diet: '小型昆虫',
      size: { mainLabel: '翼展', lengthM: 0.7, heightLabel: '身体厚度', heightM: 0.1, weight: '约 100 克', compare: '翼展 70 厘米，和一把打开的雨伞差不多宽；比现在看到的蜻蜓大好几倍。' },
      description: '巨脉蜻蜓生活在石炭纪，是一种已经灭绝的巨型昆虫。它的化石翅膀显示当时出现过体形远大于现代蜻蜓的昆虫。' },
    { name: '无齿翼龙', latin: 'Pteranodon', model: 'pteranodon', symbol: '🕊️', type: '翼龙', date: '晚白垩世', feature: '头冠与无齿长喙', diet: '鱼类',
      size: { mainLabel: '翼展', lengthM: 6, heightLabel: '站立高度', heightM: 1.8, weight: '约 20 千克', compare: '翼展 6 米，比一辆轿车还长；它从你头顶飞过时，翅膀张开能盖住半个教室。' },
      description: '无齿翼龙是翼龙，不是恐龙。它用延展的翼膜飞行，头部后方有长冠，可能帮助平衡或展示；长喙适合捕捉鱼类。' },
    { name: '喙嘴翼龙', latin: 'Rhamphorhynchus', model: 'rhamphorhynchus', symbol: '🕊️', type: '翼龙', date: '晚侏罗世', feature: '长尾末端的菱形尾帆', diet: '鱼类',
      size: { mainLabel: '翼展', lengthM: 1.8, heightLabel: '身体厚度', heightM: 0.3, weight: '约 1 千克', compare: '翼展 1.8 米，比一个成年人张开双臂还宽一点；尾巴末端还有一片菱形的尾帆。' },
      description: '喙嘴翼龙生活在侏罗纪晚期。它的长尾末端有菱形尾帆，尖长的牙齿适合抓住滑溜的鱼类。' },
    { name: '图潘达克翼龙', latin: 'Tupandactylus', model: 'tupandactylus', symbol: '🕊️', type: '翼龙', date: '早白垩世', feature: '高大的头冠与无齿喙', diet: '植物与小动物',
      size: { mainLabel: '翼展', lengthM: 3.5, heightLabel: '站立高度', heightM: 1, weight: '约 5 千克', compare: '翼展 3.5 米，比一辆轿车短一点点；头顶的冠有半米高，像戴了一顶很大的帽子。' },
      description: '图潘达克翼龙以高大的头冠和无齿喙为特征。头冠可能用于展示或识别，轻巧的骨骼和翼膜帮助它在空中飞行。' },
  ],
};
const dinoModelCredits = {
  anomalocaris: ['Anomalocaris 3D Model', 'Skache', 'https://sketchfab.com/3d-models/anomalocaris-3d-model-dad76e60589a41e18a42db1e979f81f8'],
  apatosaurus: ['Apatosaurus', 'toro ardido modelos 3d', 'https://sketchfab.com/3d-models/apatosaurus-fecabec8e4ef42ef98b5480dbf50c57d'],
  archaeopteryx: ['Archaeopteryx', 'khata', 'https://sketchfab.com/3d-models/archaeopteryx-cbec5591c584438392824d13fbef401b'],
  baryonyx: ['Baryonyx', 'Paleo Modelist', 'https://sketchfab.com/3d-models/baryonyx-09b838e4bad84b33a647c647f42f4acd'],
  carnotaurus: ['CARNOTAURUS DİNOSAUR', 'Cenker Turhan', 'https://sketchfab.com/3d-models/carnotaurus-dinosaur-548c9a0575b14deaae1f12ca9a6c31ca'],
  dilophosaurus: ['Dilophosaurus', 'Marcel Schanz', 'https://sketchfab.com/3d-models/dilophosaurus-d09b3aa874db4e1cbf29a14797ca351f'],
  gigantoraptor: ['Gigantoraptor', 'seth the yutyrannus', 'https://sketchfab.com/3d-models/gigantoraptor-e51509d66d464104aef1b72c298a40cf'],
  ichthyosaur: ['ichthyosaurus', 'Julian Johnson-Mortimer / FreddyFoxFreddy', 'https://sketchfab.com/3d-models/ichthyosaurus-ef8609f5efa84984bc1800bdb36aac3c'],
  lystrosaurus: ['Lystrosaurus', 'seth the yutyrannus', 'https://sketchfab.com/3d-models/lystrosaurus-32ea6a3bedd948638f9add8da7483b28'],
  maiasaura: ['Maiasaura With Rig', 'Dino Dan', 'https://sketchfab.com/3d-models/maiasaura-with-rig-3da9f211ae304bd0afd1d15a290eabbd'],
  mammoth: ['3D High-poly Baby Woolly Mammoth', 'SDPM Esare', 'https://sketchfab.com/3d-models/3d-high-poly-baby-woolly-mammoth-fce1c86ccedf47a5b9627098be6719d5'],
  megalodon: ['Otodus Megalodon updated animations', 'CanYuTsai', 'https://sketchfab.com/3d-models/otodus-megalodon-updated-animations-7e65b8c51251440e9aca8385f286714f'],
  meganeura: ['Meganeura Dinoraul but it is a bit accurate', 'Nobilis the Palaeovespa (@nobilishornet)', 'https://sketchfab.com/3d-models/meganeura-dinoraul-but-it-is-a-bit-accurate-1aaab4a72fbc42b4901d5f1dde12a281'],
  mosasaurus: ['Mosasaurus', 'Lukiethewesly13', 'https://sketchfab.com/3d-models/mosasaurus-fe0c25c4ed4e4d4aa05312121e2f68df'],
  pachycephalosaurus: ['PBR Pachycephalasaurus Animated', 'Ferocious Industries', 'https://sketchfab.com/3d-models/pbr-pachycephalasaurus-animated-6eea5cee4afa4730bf75c6329a43e56d'],
  plesiosaurus: ['Plesiosaure', 'leo kerjean', 'https://sketchfab.com/3d-models/plesiosaure-2f59d503e0754c9d9e157a90ed415c38'],
  pteranodon: ['Pteranodon (Animated)', 'Chistodrako._. / Oscar López Riviello', 'https://sketchfab.com/3d-models/pteranodon-animated-7d7683df41d1405283f160e81a5dff1b'],
  rhamphorhynchus: ['Low-poly Rhamphorhynchus idle', 'Robear (@xiaorobear)；动作源 Chistodrako._. / Oscar López Riviello', 'https://sketchfab.com/3d-models/low-poly-rhamphorhynchus-idle-c1e35c7ac4374c778f78025717694675'],
  sauropelta: ['Animated Sauropelta (Free)', 'Anees Animates', 'https://sketchfab.com/3d-models/animated-sauropelta-free-c6373f12f3954facb8d5fe48055c9161'],
  spinosaurus: ['Spinosaurus', 'Pedro B. Goulart', 'https://sketchfab.com/3d-models/spinosaurus-2a325726dd7b4a7c888277f262fd09bc'],
  stegosaurus: ['PBR Stegasaurus (Animated)', 'Ferocious Industries', 'https://sketchfab.com/3d-models/pbr-stegasaurus-animated-ec254ea1554941fe8a131f62db0faf3d'],
  triceratops: ['Triceratops dinosaur', 'wojciechmiedziocha', 'https://sketchfab.com/3d-models/triceratops-dinosaur-87527079bad44917ab1b98a456b46c7e'],
  tupandactylus: ['Tupandactylus', 'Paleo Modelist (@victory_)；动作源 Chistodrako._. / Oscar López Riviello', 'https://sketchfab.com/3d-models/tupandactylus-4ea8f4466c2c4e61bc57c12af296d43a'],
  'tyrannosaurus-rex': ['Tyrant King - Tyrannosaurus', 'Marcel Schanz', 'https://sketchfab.com/3d-models/tyrant-king-tyrannosaurus-6465a297fa784598adc49f6e0042d449'],
};
const habitatCopy = {
  land: { label: '陆地居民', roster: '陆地 · 14 种', intro: '从装甲恐龙、长颈巨兽到冰期哺乳动物，观察陆地生命怎样适应不同环境。', scenery: ['🌿', '🌴', '🌱', '🌳', '🌿'] },
  sea: { label: '海洋居民', roster: '海洋 · 5 种', intro: '从寒武纪游泳捕食者到巨型海生爬行动物，沿着海洋生命的长历史展开探索。', scenery: ['🌊', '🐚', '🐠', '🐟', '🌊'] },
  sky: { label: '天空居民', roster: '天空 · 5 种', intro: '看看带羽毛的恐龙、古昆虫和翼龙，比较它们在空中移动的不同方式。', scenery: ['☁️', '🕊️', '🌤️', '🕊️', '☁️'] },
};

function showMachinePart(key) {
  const info = machineParts[key];
  if (!info) return;
  document.querySelector('#machineKicker').textContent = '挖掘机部件观察';
  document.querySelector('#machineTitle').textContent = info.title;
  document.querySelector('#machineText').textContent = info.text;
  document.querySelector('#machineFact').textContent = info.fact;
}
document.querySelectorAll('[data-machine-part]').forEach((part) => part.addEventListener('click', () => showMachinePart(part.dataset.machinePart)));
window.addEventListener('engineering-part-select', (event) => showMachinePart(event.detail.key));
document.querySelectorAll('[data-machine-step]').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('[data-machine-step]').forEach((item) => item.classList.toggle('active', item === button));
  const step = machineSteps[button.dataset.machineStep];
  document.querySelector('#machineKicker').textContent = '一次常见的挖掘任务';
  document.querySelector('#machineTitle').textContent = step[0];
  document.querySelector('#machineText').textContent = step[1];
  document.querySelector('#machineFact').textContent = step[2];
}));
document.querySelectorAll('[data-machine-kind]').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('[data-machine-kind]').forEach((item) => item.classList.toggle('active', item === button));
  document.querySelector('#machineKindText').textContent = machineKinds[button.dataset.machineKind];
}));
document.querySelector('#machineRead').addEventListener('click', () => {
  if (typeof window.speak === 'function') window.speak(`${document.querySelector('#machineTitle').textContent}。${document.querySelector('#machineText').textContent}。${document.querySelector('#machineFact').textContent}`);
});

let activeHabitat = 'land';
function selectDinosaur(dinosaur) {
  document.querySelector('.dino-hero').dataset.environment = dinosaur.model === 'mammoth' ? 'tundra' : activeHabitat;

  document.querySelector('#dinoHeroName').textContent = `${dinosaur.name} ${dinosaur.latin}`;
  document.querySelector('#dinoHeroTag').textContent = `${dinosaur.type} · 观察：${dinosaur.feature}`;
  const profileLogo = document.querySelector('#dinoSymbol');
  profileLogo.replaceChildren(dinosaurLogo(dinosaur, true));
  document.querySelector('#dinoKicker').textContent = `${dinosaur.type} · ${habitatCopy[activeHabitat].label}`;
  document.querySelector('#dinoTitle').textContent = dinosaur.name;
  document.querySelector('#dinoDescription').textContent = dinosaur.description;
  document.querySelector('#dinoDate').textContent = dinosaur.date;
  document.querySelector('#dinoFeature').textContent = dinosaur.feature;
  document.querySelector('#dinoDiet').textContent = dinosaur.diet;
  document.querySelector('#dinoModelHost').setAttribute('aria-label', dinosaur.model ? `可拖动旋转和滚轮缩放的${dinosaur.name}三维模型` : `${dinosaur.name}教学展示`);
  document.querySelector('.dino-model-hint').hidden = !dinosaur.model;
  document.querySelector('#dinoModelReset').hidden = !dinosaur.model;
  document.querySelectorAll('[data-dino-name]').forEach((button) => button.classList.toggle('active', button.dataset.dinoName === dinosaur.name));
  renderSize(dinosaur);
  const credit = document.querySelector('#dinoModelCredit');
  if (dinosaur.model && dinoModelCredits[dinosaur.model]) {
    const [title, author, source] = dinoModelCredits[dinosaur.model];
    credit.replaceChildren(document.createTextNode(`模型：“${title}” by ${author}，`));
    const sourceLink = document.createElement('a'); sourceLink.href = source; sourceLink.target = '_blank'; sourceLink.rel = 'noreferrer'; sourceLink.textContent = '模型来源 ↗';
    const licenseLink = document.createElement('a'); licenseLink.href = 'https://creativecommons.org/licenses/by/4.0/'; licenseLink.target = '_blank'; licenseLink.rel = 'noreferrer'; licenseLink.textContent = 'CC BY 4.0 ↗';
    credit.append(sourceLink, document.createTextNode(' · '), licenseLink, document.createTextNode('。已按来源项目说明压缩或调整模型；逐模型许可和改动记录：'));
    const recordLink = document.createElement('a'); recordLink.href = `/assets/jurassic/credits/${dinosaur.model}-model-license.txt`; recordLink.target = '_blank'; recordLink.rel = 'noreferrer'; recordLink.textContent = '许可记录';
    credit.append(recordLink, document.createTextNode(' · '));
    const changesLink = document.createElement('a'); changesLink.href = `/assets/jurassic/credits/${dinosaur.model}-model-source.txt`; changesLink.target = '_blank'; changesLink.rel = 'noreferrer'; changesLink.textContent = '来源与改动记录';
    credit.append(changesLink);
  } else {
    credit.textContent = '该条目暂时以科普资料和剪影展示。';
  }
  window.setDinoModelActive?.(dinosaur.model || null);
}
function renderDinosaurs(habitat) {
  activeHabitat = habitat;
  const copy = habitatCopy[habitat];
  document.querySelector('#dinoHabitatChip').textContent = copy.label;
  document.querySelector('#dinoRosterCount').textContent = copy.roster;
  document.querySelector('#dinoHabitatIntro').textContent = copy.intro;
  document.querySelector('.dino-hero').dataset.habitat = habitat;
  const environment = document.querySelector('#dinoEnvironment');
  environment.replaceChildren(...copy.scenery.map((icon) => { const span = document.createElement('span'); span.textContent = icon; return span; }));
  document.querySelectorAll('[data-dino-habitat]').forEach((button) => button.classList.toggle('active', button.dataset.dinoHabitat === habitat));
  const picks = document.querySelector('#dinoPicks');
  picks.replaceChildren(...dinosaurs[habitat].map((dinosaur) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'dino-pick'; button.dataset.dinoName = dinosaur.name; button.dataset.dinoModel = dinosaur.model || '';
    const icon = dinosaurLogo(dinosaur);
    const name = document.createElement('b'); name.textContent = dinosaur.name;
    const latin = document.createElement('small'); latin.textContent = dinosaur.latin;
    button.append(icon, name, latin);
    // 列表上直接带上"多大"，不用点进去也能比一比
    if (dinosaur.size) {
      const sizeHint = document.createElement('small');
      sizeHint.className = 'dino-pick-size';
      sizeHint.textContent = `${dinosaur.size.mainLabel} ${numberText(dinosaur.size.lengthM)} 米`;
      button.append(sizeHint);
    }
    if (dinosaur.model) { const badge = document.createElement('em'); badge.className = 'dino-3d-badge'; badge.textContent = '3D 模型'; button.append(badge); }
    button.addEventListener('click', () => selectDinosaur(dinosaur));
    return button;
  }));
  selectDinosaur(dinosaurs[habitat][0]);
}
document.querySelectorAll('[data-dino-habitat]').forEach((button) => button.addEventListener('click', () => renderDinosaurs(button.dataset.dinoHabitat)));
document.querySelector('#dinoRead').addEventListener('click', () => {
  const current = dinosaurs[activeHabitat].find((item) => item.name === document.querySelector('#dinoTitle').textContent);
  const sizeText = current && current.size
    ? `它有多大呢？${current.size.mainLabel}大约 ${numberText(current.size.lengthM)} 米，${current.size.heightLabel}大约 ${numberText(current.size.heightM)} 米，体重${current.size.weight}。${current.size.compare}`
    : '';
  if (typeof window.speak === 'function') window.speak(`${document.querySelector('#dinoTitle').textContent}。${document.querySelector('#dinoDescription').textContent}。观察重点是${document.querySelector('#dinoFeature').textContent}。食物或能量来源主要是${document.querySelector('#dinoDiet').textContent}。${sizeText}`);
});
// 先修一遍静态页面上的方框（例如"🪽 天空"按钮），再渲染动态内容，最后再兜一遍
injectSizeStyles();
swapUnsupportedIcons(document.body);
renderDinosaurs(activeHabitat);
swapUnsupportedIcons(document.body);
// 动态内容（积分商店卡片等）出现时也顺手换一次
if (document.body && window.MutationObserver) new MutationObserver(scheduleIconSweep).observe(document.body, { childList: true, subtree: true, characterData: true });
