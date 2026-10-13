// 工程探索页的**内容**：三台工程车 + 小小建造场。
//
// 数据形状刻意对齐远古生命馆的恐龙条目（exploration-modules.js 里的 dinosaurs）：
//   名字 / 拉丁名 / 分类 / 一句概括 / 简介
//   + size（「它有多大」：数字 + 刻度尺 + 一句用参照物说的对比）
//   + facts（三条"事实"，对应恐龙的 年代 / 特征 / 食物）
//   + steps（工作三步：[标签, 说明, 动作]）+ parts（可点选的部件）
//   + model（本地 glb + 许可与来源 + rig/motions 动作脚本 + nodeParts 部件标签）
//
// ── steps 的第三个元素（2026-09-30 新增）────────────────────────────
//   { motion: 'dig' }              → 播放代码驱动的动作演示（见 engineering-motion.js）
//   { focus: /…/, label: '…" }     → 不播动作，把对应零件在模型上框出来（分件模型用）
//   配套的 machine.stepNote 是一行诚实说明：模型做不到的动作（回转、钳口开合）直说，
//   不拿别的动画硬充。
//
// ── model.rig / model.motions（动作脚本）────────────────────────────
//   rig 的角度范围全部量自 glb 自带动画的首末关键帧（作者摆好的安全范围），
//   在这个范围内插值不会穿地、不会散架。scripts/verify_engineering_motion.js
//   会拿 rig 和 glb 逐帧核对，改模型或改数值对不上会当场红。
//
// ── model.nodeParts（匿名网格的部件标签）────────────────────────────
//   3DAssets 这两台的网格叫 `<长前缀>_0.._6`，名字里不带部件词（前缀里那个
//   "tracked" 反而会让 /track/ 误匹配全部车体）。标签是按**每块网格的精确世界
//   包围盒**量出来后人工标的（哪块全宽贴地=履带、哪块偏一侧悬空=驾驶室…），
//   部件高亮和材质分级都只信标签、不信原名。
//
// 模型都在 frontend/assets/engineering/ 本地提供，许可与出处见同目录 ATTRIBUTION.txt。
// 三件模型都是米制、+Y 向上、脚底落在 y=0，所以能和远古生命馆共用同一把尺子。

// 站位：模型侧对镜头；团团的朝向固定用这个角度
import { CORE_MACHINES, EXTRA_MACHINES } from './engineering-catalog.js?v=20261005-observe-5';
export const MODEL_YAW = -0.38;
// 团团官方身高（用户 2026-09-30 定），和首页、远古生命馆一致
export const TUANTUAN_HEIGHT_M = 1.2;
export const TUANTUAN_URL = '/clay-safari/models/explorer.glb';

// 参照物阶梯 —— 与远古生命馆的尺寸卡完全同一套，孩子在两边读的是同一种尺子
export const SIZE_REFERENCES = [
  { short: '成年人', meters: 1.7 },
  { short: '轿车', meters: 4.6 },
  { short: '公交车', meters: 12 },
  { short: '篮球场', meters: 28 },
];

export const numberText = (value) => String(Number(value.toFixed(2)));

// 部件匹配用"可搜索名"：匿名网格只信人工标的标签（不信原名——原名的前缀里
// 带着机器名，会把 /track/ 这类pattern误匹配到整台车）；有名节点用原名。
export function searchNameOf(node, nodeParts) {
  const tags = nodeParts?.[node.name];
  if (Array.isArray(tags)) return tags.join(' ');
  return node.name || '';
}

export const MACHINES = [
  {
    id: 'excavator',
    icon: '🚜',
    name: '履带挖掘机',
    latin: 'Tracked excavator',
    group: '挖掘机械',
    tagline: '一条会挖土的铁手臂',
    ambience: ['🏗️', '⛰️', '🪨', '🧱', '🏗️'],
    intro: '挖掘机站在两条履带上，上半身能整个转圈。它用动臂、斗杆、铲斗三节「手臂」配合干活：铲斗压进土里，斗杆一收，土就进了斗；转过身，斗一松，土就倒出去。工地上的土方活儿，大半靠它。',
    facts: [
      ['它做什么', '挖沟、装车、清理场地'],
      ['关键部件', '动臂、斗杆、铲斗、履带'],
      ['力气从哪来', '发动机带动液压泵，高压油推动油缸'],
    ],
    size: {
      title: '它有多大 · HOW BIG',
      mainLabel: '全长',
      lengthM: 9.2,
      heightLabel: '车身高度',
      heightM: 3.1,
      weight: '约 22 吨',
      compare: '车身长 9.2 米，比一辆公交车短一点，比两辆轿车接起来还长；站着有 3.1 米高，成年人走到它旁边，头顶还够不到驾驶室的窗户。',
    },
    // 三步与动作一一对应：模型能做什么，按钮就说什么（range 见 model.rig）
    steps: [
      ['① 挖', '铲斗油缸收缩，斗口转上来，把泥土「舀」进斗里。这一步全靠液压油缸的力气。', { motion: 'dig' }],
      ['② 举', '动臂油缸把整条手臂连同满斗的土举起来，准备转运。真实机器这时候还会把上半身转半圈——这台模型没分件，转不动，所以演示到这里为止。', { motion: 'raise' }],
      ['③ 卸', '铲斗油缸一松，斗口翻回去朝下，土就落进渣土车，或者堆成土堆。然后转回来，开始下一斗。', { motion: 'dump' }],
    ],
    stepNote: '这台模型能演示「挖→举→卸」。真实挖掘机还有「转」——上半身带着手臂转半圈，模型里上半身和底盘是一体的，转不动；想看会挖会转的挖掘机，去下面的小小建造场。',
    parts: [
      ['cab', '驾驶室', /cab|cabin/i, '司机坐在里面，玻璃窗让他能同时看到铲斗和周围地面。挖掘机的驾驶室装在回转平台上，会跟着上半身一起转。'],
      ['arm', '动臂与斗杆', /boom|stick|dipper|arm/i, '两节铰接的长臂。油缸伸缩让它们抬高、放低，把铲斗送到想去的位置——一节管「抬多高」，一节管「够多远」。'],
      ['bucket', '铲斗', /bucket|shovel|teeth/i, '边缘带齿的「铁手掌」，负责切进土里、把土舀起来。铲斗越大，每一斗能搬的土越多，但也越费力气。'],
      ['track', '履带', /track|undercarriage|roller|sprocket|wheel/i, '两条宽履带把二十多吨的重量摊开，所以在松软的泥地上也不容易陷进去，还能原地转向。'],
    ],
    model: {
      url: '/assets/engineering/tracked-excavator.glb',
      // 量自 glb 自带动画（boom-open/close、bucket-open/close 的首末关键帧）
      rig: { boom: ['x', -32, 0], bucket: ['x', 0, 54] },
      motions: {
        dig: { keys: [
          [0, { boom: 0, bucket: 0 }],
          [0.5, { boom: -6, bucket: 0 }],
          [1.5, { boom: -6, bucket: 54 }],
          [2.1, { boom: -6, bucket: 54 }],
        ] },
        raise: { keys: [
          [0, { boom: 0, bucket: 54 }],
          [1.7, { boom: -32, bucket: 54 }],
          [2.2, { boom: -32, bucket: 54 }],
        ] },
        dump: { keys: [
          [0, { boom: -32, bucket: 54 }],
          [1.5, { boom: -32, bucket: 0 }],
          [2.1, { boom: -32, bucket: 0 }],
        ] },
      },
      // 匿名网格 _0.._6 → 部件标签（按精确世界包围盒人工标定）
      nodeParts: {
        'demolition-and-site-clearance-tracked-excavator_0': ['track', 'undercarriage', 'chassis'],
        'demolition-and-site-clearance-tracked-excavator_1': ['body', 'frame', 'deck'],
        'demolition-and-site-clearance-tracked-excavator_2': ['body', 'deck'],
        'demolition-and-site-clearance-tracked-excavator_3': ['counterweight', 'ballast'],
        'demolition-and-site-clearance-tracked-excavator_4': ['cab'],
        'demolition-and-site-clearance-tracked-excavator_5': ['beacon', 'lamp'],
        'demolition-and-site-clearance-tracked-excavator_6': ['plate', 'decal', 'sign'],
      },
      credit: {
        title: 'Tracked excavator with digging bucket',
        author: '3DAssets.dev',
        license: 'CC0 1.0',
        licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
        source: 'https://3dassets.dev/assets/demolition-and-site-clearance-demolition-and-site-clea-4c94ddeb',
        note: 'CC0 属于公共领域，免署名、可商用，这里仍然把来源标出来。',
      },
    },
  },
  {
    id: 'demolition',
    icon: '🏗️',
    name: '高空拆除机',
    latin: 'High reach demolition excavator',
    group: '拆除机械',
    tagline: '长到十四米的机械臂',
    ambience: ['🏢', '🏗️', '🧱', '🪜', '🏢'],
    intro: '它是一台「加长版」挖掘机：底盘特意加宽压重，手臂做成三节，一直伸到楼房高层。末端装的不是铲斗，而是一对液压钳。拆楼时它一层一层往下啃，比爆破安静得多，灰尘也少。',
    facts: [
      ['它做什么', '从高处拆楼、咬碎混凝土和钢筋'],
      ['关键部件', '三节臂、液压钳、加宽底盘'],
      ['为什么底盘那么宽', '手臂伸得越高，越需要配重把机器压住'],
    ],
    size: {
      title: '它有多大 · HOW BIG',
      mainLabel: '展开高度',
      lengthM: 13.6,
      heightLabel: '机身宽',
      heightM: 4.2,
      weight: '约 60 吨',
      compare: '手臂全部举起来有 13.6 米，比四层楼还高；整机约 60 吨，差不多是十头大象加起来的重量——不然手臂伸那么高，它会一头栽下去。',
    },
    steps: [
      ['① 举臂', '动臂油缸把三节臂慢慢举起来，对准要拆的那一层。手臂全部举起来有 13.6 米，比四层楼还高。', { motion: 'reach' }],
      ['② 往下啃', '液压钳咬住梁和墙板，一下一下把它掰断。模型里钳口是一整块、动不了，所以这里演示的是手臂一小截一小截往下退——真机就是这样一层一层往下啃的。', { motion: 'nibble' }],
      ['③ 落臂', '拆完这一层，手臂落回来，换个位置再举起来。碎块落到楼内或地面，再由挖掘机和渣土车运走。', { motion: 'lower' }],
    ],
    stepNote: '液压钳的开合这台模型做不了（钳口是一整块网格，没有分开的钳臂），所以「咬」的动作用手臂的进退来示意。',
    parts: [
      ['cab', '防护驾驶室', /cab|cabin/i, '这里的驾驶室加高了，顶上还有格栅护顶，防止碎块砸到司机。拆楼时，司机的位置要算得特别准。'],
      ['arm', '三节臂', /boom|stick|dipper|arm/i, '比普通挖掘机多一节，所以能举到十几米高。每一节都靠自己的液压油缸驱动；伸得越长，能搬的东西就越轻。'],
      ['bucket', '液压钳', /jaw|pulveris|shear|head/i, '末端不是铲斗，而是一对能开合的钳子，专门用来咬混凝土和钢筋。换一个头，它还能变成剪钢筋的剪刀。'],
      ['track', '加宽履带与支腿', /track|undercarriage|roller|sprocket|wheel|outrigger/i, '底盘比普通挖掘机宽得多，还多了支撑腿。手臂举高的时候，这些重量就是「压舱石」。'],
    ],
    model: {
      url: '/assets/engineering/high-reach-demolition-excavator.glb',
      // glb 里只有两段动画（open/close），而且**都只驱动 boom**——钳口没有动画
      rig: { boom: ['x', -32, 0] },
      motions: {
        reach: { keys: [
          [0, { boom: 0 }],
          [1.8, { boom: -32 }],
          [2.3, { boom: -32 }],
        ] },
        nibble: { loop: true, keys: [
          [0, { boom: -32 }],
          [0.9, { boom: -24 }],
          [1.8, { boom: -32 }],
          [2.1, { boom: -32 }],
        ] },
        lower: { keys: [
          [0, { boom: -32 }],
          [1.8, { boom: 0 }],
          [2.3, { boom: 0 }],
        ] },
      },
      nodeParts: {
        'demolition-and-site-clearance-high-reach-demolition-excavator_0': ['track', 'undercarriage', 'chassis'],
        'demolition-and-site-clearance-high-reach-demolition-excavator_1': ['body', 'frame', 'deck'],
        'demolition-and-site-clearance-high-reach-demolition-excavator_2': ['body', 'deck'],
        'demolition-and-site-clearance-high-reach-demolition-excavator_3': ['counterweight', 'ballast'],
        'demolition-and-site-clearance-high-reach-demolition-excavator_4': ['cab'],
        'demolition-and-site-clearance-high-reach-demolition-excavator_5': ['beacon', 'lamp'],
        'demolition-and-site-clearance-high-reach-demolition-excavator_6': ['plate', 'decal', 'sign'],
      },
      credit: {
        title: 'High reach demolition excavator',
        author: '3DAssets.dev',
        license: 'CC0 1.0',
        licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
        source: 'https://3dassets.dev/assets/demolition-and-site-clearance-demolition-and-site-clea-2f21f1bf',
        note: 'CC0 属于公共领域，免署名、可商用，这里仍然把来源标出来。',
      },
    },
  },
];

MACHINES.splice(0, 2, ...CORE_MACHINES);
MACHINES.push(...EXTRA_MACHINES);

// 「小小建造场」不是一台车，而是自己搭出来的微缩工地。
export const YARD = {
  id: '__yard',
  icon: '🏢',
  name: '小小建造场',
  latin: 'Construction sandbox',
  group: '自己搭的工地',
  tagline: '挖掘机、塔吊、渣土车一起干活',
  blurb: '微缩工地：挖掘机挖土、塔吊吊砖、渣土车来回运。',
  count: '4 台机械 · 3 位工人',
};
