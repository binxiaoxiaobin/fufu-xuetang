// World layout. Coordinates are Three.js world units: x right, z toward the
// default camera (the "bottom" of the reference poster), y up.
//
// 地图尺寸：120 × 88。中间是一条南北向的河，两座桥连接东西两岸。
//
// 这版的分工（很重要）：
//   ① **地形景观**：森林、沙滩、小河 + 本文件下面定义的 MEADOW / PADDY / POOL / ROAD。
//      它们是"地面本身"，写死在 world.js 里生成，**点不到、没有名字牌、也不在商店里**，
//      但可以走进去（水池是水，自然走不进去）。
//   ② **物品**：`ITEMS` 里的每一条**都需要用积分在商店解锁**。兑换后由 main.js 的
//      addItem() 当场接进场景，不需要刷新页面。
//
// 所以新账号进来是一片很完整的地形（有森林、花海、稻田、水池、马路、小河），
// 但一个可点的朋友都没有——要靠学习赚积分一点点把动物请回来。

export const MAP = { w: 120, h: 88 };        // x ∈ [-60, 60], z ∈ [-44, 44]
export const WALK = { x: 52, z: 38 };         // walkable extent

// 外圈抬起的山脊范围（按地图尺寸推算，改地图大小时会自动跟着变）
export const RIM = { x0: MAP.w / 2 * 0.78, x1: MAP.w / 2, z0: MAP.h / 2 * 0.78, z1: MAP.h / 2 };

// river centre line x = A·sin(B·z + C)  (kept as numbers so the water shader can share it)
export const RIVER = {
  A: 3, B: 0.11, C: 0.6,
  halfWidth: 3.4,
  level: -0.45,
  x: (z) => 3 * Math.sin(0.11 * z + 0.6),
};

// 两座木桥：南桥维持原来的位置，北桥让北岸区域可达（马路也从北桥过河）
export const BRIDGES = [
  { z: -2, halfLen: 5.4, halfW: 1.7, rise: 0.62, base: 0.12 },
  { z: 26, halfLen: 5.4, halfW: 1.7, rise: 0.62, base: 0.12 },
];
for (const bridge of BRIDGES) bridge.x = RIVER.x(bridge.z);

export const PLAYER_START = { x: -30, z: 8, rot: Math.PI };

export const TITLE = '黏土世界';
export const TITLE_COLORS = ['#ff6b6b', '#ff9f43', '#feca57', '#8ee68a', '#48dbfb', '#5f8bff', '#c58bff', '#ff6b9d'];
export const CLAY_TITLE_COLORS = ['#d48770', '#df9e5c', '#d9bd68', '#89ab7d', '#76a7a5', '#8495b2', '#a58ab4', '#c27f8f'];

// ------------------------------------------------------------------ 地形景观
// 由 world.js 生成：不注册进 ITEMS，所以点不到、没有名字牌、也不会进商店。
// 花海：东岸中部一大片开满花的草坡（原来的小径正好从花海里穿过去）
export const MEADOW = { x: 30, z: 12, rx: 13, rz: 10 };
// 稻田：西岸一片成排的稻田（泥土地 + 稻苗 + 田埂，不注水，可以走进去）
export const PADDY = { x: -33, z: 8, hx: 7, hz: 5.5 };
// 水池：东岸南侧一汪平静的池塘，比河床浅，岸边一圈湿沙
export const POOL = { x: 32, z: -9, r: 5.2, level: -0.42 };
// 马路：一条约 5 个单元宽的土路，从西边经**北桥**过河、一直到东边
export const ROAD_CURVES = [
  [[-46, 20], [-32, 24], [-18, 27], [BRIDGES[1].x, BRIDGES[1].z], [16, 25], [30, 22], [44, 17]],
];

// 物品清单（**全部需要解锁**）
// kind: 'animal' 计入探险手册的贴纸；'prop' 只是认一个词；'scene' 是一整片可逛的场景
// y: 'ground' | 'water' | 'rock' | number ; viewFrom: where the tour stands to look at it.
// gate: true 表示这个场景带篱笆和可以打开的门（木门会随你走近而打开）
// 模型来源：frontend/clay-safari/models/<id>.glb 优先；没有 glb 的由 procedural.js / zones.js 现场捏。
export const ITEMS = [
  // ---------------- 小道具 ----------------
  { id: 'flower',    kind: 'prop',   lock: true, cn: '花朵',     py: 'huā duǒ',          en: 'Flower',      emoji: '🌸', pos: [-22, 15],   rot: 0.3,  scale: 1.5, y: 'ground', r: 0.9, viewFrom: [-20, 17.5] },
  { id: 'bone',      kind: 'prop',   lock: true, cn: '骨头',     py: 'gǔ tou',           en: 'Bone',        emoji: '🦴', pos: [-14, 4],    rot: 0.4,  scale: 1.5, y: 'ground', r: 0.8, viewFrom: [-12, 6] },
  { id: 'stump',     kind: 'prop',   lock: true, cn: '树桩',     py: 'shù zhuāng',       en: 'Tree Stump',  emoji: '🪵', pos: [19, 12],    rot: 0.2,  scale: 1.5, y: 'ground', r: 1.2, viewFrom: [17, 14.5] },
  { id: 'banana',    kind: 'prop',   lock: true, cn: '香蕉',     py: 'xiāng jiāo',       en: 'Banana',      emoji: '🍌', pos: [21, -6],    rot: 0.8,  scale: 1.6, y: 'ground', r: 0.8, viewFrom: [19, -3.5] },
  { id: 'truck',     kind: 'prop',   lock: true, cn: '探险车',   py: 'tàn xiǎn chē',     en: 'Safari Truck', emoji: '🚙', pos: [29, 3],    rot: -2.4, scale: 1.8, y: 'ground', r: 2.8, viewFrom: [24.5, 4.5] },
  { id: 'camera',    kind: 'prop',   lock: true, cn: '照相机',   py: 'zhào xiàng jī',    en: 'Camera',      emoji: '📷', pos: [14, 20],    rot: -0.4, scale: 1.3, y: 'ground', r: 0.8, viewFrom: [12, 17.5] },
  { id: 'binoculars', kind: 'prop',  lock: true, cn: '望远镜',   py: 'wàng yuǎn jìng',   en: 'Binoculars',  emoji: '🔭', pos: [24, 20],    rot: 0.5,  scale: 1.3, y: 'ground', r: 0.8, viewFrom: [22, 17.5] },
  { id: 'tent',      kind: 'prop',   lock: true, cn: '帐篷',     py: 'zhàng peng',       en: 'Tent',        emoji: '⛺', pos: [-34, -32],  rot: 0.4,  scale: 1.8, y: 'ground', r: 2.4, viewFrom: [-30.5, -28.5] },
  { id: 'campfire',  kind: 'prop',   lock: true, cn: '篝火',     py: 'gōu huǒ',          en: 'Campfire',    emoji: '🔥', pos: [-26, -28],  rot: 0,    scale: 1.5, y: 'ground', r: 1.3, viewFrom: [-23, -25] },
  { id: 'signpost',  kind: 'prop',   lock: true, cn: '路牌',     py: 'lù pái',           en: 'Signpost',    emoji: '🪧', pos: [-8, 28],    rot: 0.2,  scale: 1.5, y: 'ground', r: 0.9, viewFrom: [-8, 24.5] },
  { id: 'kite',      kind: 'prop',   lock: true, cn: '风筝',     py: 'fēng zheng',       en: 'Kite',        emoji: '🪁', pos: [-18, 34],   rot: 0.3,  scale: 1.5, y: 'ground', r: 1.0, viewFrom: [-15, 30.5] },
  { id: 'lantern',   kind: 'prop',   lock: true, cn: '灯笼',     py: 'dēng long',        en: 'Lantern',     emoji: '🏮', pos: [20, 34],    rot: 0,    scale: 1.4, y: 'ground', r: 1.0, viewFrom: [18, 30.5] },
  { id: 'balloon',   kind: 'prop',   lock: true, cn: '热气球',   py: 'rè qì qiú',        en: 'Balloon',     emoji: '🎈', pos: [44, 16],    rot: -0.5, scale: 1.6, y: 'ground', r: 2.0, viewFrom: [40.5, 19] },

  // ---------------- 地图场景 ----------------
  { id: 'cabin',       kind: 'scene',             lock: true, cn: '小木屋', py: 'xiǎo mù wū',     en: 'Cabin',            emoji: '🏠', pos: [-30, -14], rot: 1.0,  scale: 1.4, y: 'ground', r: 1.9, viewFrom: [-26, -11.5] },
  { id: 'dock',        kind: 'scene',             lock: true, cn: '小码头', py: 'xiǎo mǎ tóu',    en: 'Dock',             emoji: '🛶', pos: [2.4, -12], rot: 0,    scale: 1.5, y: 'ground', r: 1.7, viewFrom: [6, -12] },
  { id: 'pavilion',    kind: 'scene',             lock: true, cn: '凉亭',   py: 'liáng tíng',     en: 'Pavilion',         emoji: '🏛️', pos: [12, -28],  rot: 0,    scale: 1.4, y: 'ground', r: 1.9, viewFrom: [12, -24] },
  { id: 'sandpit',     kind: 'scene',             lock: true, cn: '沙坑',   py: 'shā kēng',       en: 'Sandpit',          emoji: '🏰', pos: [24, -26],  rot: -0.6, scale: 1.4, y: 'ground', r: 1.8, viewFrom: [21.5, -22.5] },
  { id: 'windmill',    kind: 'scene',             lock: true, cn: '风车',   py: 'fēng chē',       en: 'Windmill',         emoji: '🌬️', pos: [44, 30],   rot: -2.2, scale: 1.4, y: 'ground', r: 1.5, viewFrom: [40.5, 27.5] },
  { id: 'well',        kind: 'scene',             lock: true, cn: '小水井', py: 'xiǎo shuǐ jǐng', en: 'Well',             emoji: '🪣', pos: [33, 10],   rot: -0.9, scale: 1.3, y: 'ground', r: 1.3, viewFrom: [29, 13] },
  { id: 'swing',       kind: 'scene',             lock: true, cn: '小秋千', py: 'xiǎo qiū qiān',  en: 'Swing',            emoji: '🎠', pos: [-39, 15],  rot: 1.0,  scale: 1.3, y: 'ground', r: 2.0, viewFrom: [-34.5, 18] },
  { id: 'orchard',     kind: 'scene', gate: true, lock: true, cn: '小果园', py: 'xiǎo guǒ yuán',  en: 'Orchard',          emoji: '🍎', pos: [-39, -7],  rot: 1.2,  scale: 1.3, y: 'ground', r: 2.9, viewFrom: [-34, -3.5] },
  { id: 'garden',      kind: 'scene', gate: true, lock: true, cn: '小菜园', py: 'xiǎo cài yuán',  en: 'Vegetable Garden', emoji: '🥕', pos: [-16, 22],  rot: 2.35, scale: 1.4, y: 'ground', r: 2.4, viewFrom: [-13, 18.5] },
  { id: 'flowerfield', kind: 'scene', gate: true, lock: true, cn: '小花园', py: 'xiǎo huā yuán',  en: 'Flower Garden',    emoji: '🌷', pos: [-46, 20],  rot: 1.0,  scale: 1.4, y: 'ground', r: 2.4, viewFrom: [-41.5, 22.5] },

  // ---------------- 动物伙伴 ----------------
  { id: 'snake',     kind: 'animal', lock: true, cn: '蛇',       py: 'shé',              en: 'Snake',       emoji: '🐍', pos: [-31, 12],   rot: 0.9,  scale: 1.6, y: 'ground', r: 1.4, viewFrom: [-28, 15] },
  { id: 'lion',      kind: 'animal', lock: true, cn: '狮子',     py: 'shī zi',           en: 'Lion',        emoji: '🦁', pos: [-27, -2],   rot: 0.7,  scale: 1.6, y: 'rock',   r: 0,   viewFrom: [-22.5, 2] },
  { id: 'giraffe',   kind: 'animal', lock: true, cn: '长颈鹿',   py: 'cháng jǐng lù',    en: 'Giraffe',     emoji: '🦒', pos: [-13, -12],  rot: 0.5,  scale: 1.3, y: 'ground', r: 1.6, viewFrom: [-10.5, -8.5] },
  { id: 'bird',      kind: 'animal', lock: true, cn: '小鸟',     py: 'xiǎo niǎo',        en: 'Bird',        emoji: '🐦', pos: [-17.6, -6], rot: 0.6,  scale: 1.4, y: 3.05,     r: 0,   viewFrom: [-15.5, -3.5], perchTree: [-19.5, -6] },
  { id: 'zebra',     kind: 'animal', lock: true, cn: '斑马',     py: 'bān mǎ',           en: 'Zebra',       emoji: '🦓', pos: [-6, -4],    rot: 1.0,  scale: 1.5, y: 'ground', r: 1.5, viewFrom: [-3.2, -1] },
  { id: 'hippo',     kind: 'animal', lock: true, cn: '河马',     py: 'hé mǎ',            en: 'Hippo',       emoji: '🦛', pos: [3.0, 9],    rot: -0.6, scale: 1.7, y: 'water',  r: 0,   viewFrom: [8.2, 8] },
  { id: 'fish',      kind: 'animal', lock: true, cn: '鱼',       py: 'yú',               en: 'Fish',        emoji: '🐟', pos: [1.9, 17],   rot: 0,    scale: 1.6, y: 'water',  r: 0,   viewFrom: [7.2, 16], swim: [12, 22] },
  { id: 'crocodile', kind: 'animal', lock: true, cn: '鳄鱼',     py: 'è yú',             en: 'Crocodile',   emoji: '🐊', pos: [11, 13],    rot: -1.9, scale: 1.4, y: 'ground', r: 1.8, viewFrom: [11, 17.2] },
  { id: 'elephant',  kind: 'animal', lock: true, cn: '大象',     py: 'dà xiàng',         en: 'Elephant',    emoji: '🐘', pos: [15, -11],   rot: -0.7, scale: 1.6, y: 'ground', r: 2.2, viewFrom: [12, -7.5] },
  { id: 'monkey',    kind: 'animal', lock: true, cn: '猴子',     py: 'hóu zi',           en: 'Monkey',      emoji: '🐵', pos: [24.4, -16], rot: -0.9, scale: 1.2, y: 2.55,     r: 0,   viewFrom: [22, -12.5], perchTree: [27, -16] },
  { id: 'rabbit',    kind: 'animal', lock: true, cn: '兔子',     py: 'tù zi',            en: 'Rabbit',      emoji: '🐰', pos: [-38, 26],   rot: 0.9,  scale: 1.3, y: 'ground', r: 1.2, viewFrom: [-34.5, 29] },
  { id: 'deer',      kind: 'animal', lock: true, cn: '小鹿',     py: 'xiǎo lù',          en: 'Deer',        emoji: '🦌', pos: [-44, 6],    rot: 1.2,  scale: 1.5, y: 'ground', r: 1.6, viewFrom: [-40.5, 9.5] },
  { id: 'panda',     kind: 'animal', lock: true, cn: '熊猫',     py: 'xióng māo',        en: 'Panda',       emoji: '🐼', pos: [-40, -18],  rot: 0.5,  scale: 1.5, y: 'ground', r: 1.6, viewFrom: [-36.5, -14.5] },
  { id: 'turtle',    kind: 'animal', lock: true, cn: '乌龟',     py: 'wū guī',           en: 'Turtle',      emoji: '🐢', pos: [12, 30],    rot: -0.8, scale: 1.5, y: 'ground', r: 1.5, viewFrom: [12, 26] },
  { id: 'penguin',   kind: 'animal', lock: true, cn: '企鹅',     py: 'qǐ é',             en: 'Penguin',     emoji: '🐧', pos: [34, 30],    rot: -0.6, scale: 1.4, y: 'ground', r: 1.3, viewFrom: [31, 26.5] },
  { id: 'owl',       kind: 'animal', lock: true, cn: '猫头鹰',   py: 'māo tóu yīng',     en: 'Owl',         emoji: '🦉', pos: [40, 4],     rot: -1.1, scale: 1.3, y: 'ground', r: 1.1, viewFrom: [36.5, 7] },
  { id: 'fox',       kind: 'animal', lock: true, cn: '狐狸',     py: 'hú li',            en: 'Fox',         emoji: '🦊', pos: [42, -20],   rot: -1.4, scale: 1.4, y: 'ground', r: 1.4, viewFrom: [38.5, -16.5] },
  { id: 'koala',     kind: 'animal', lock: true, cn: '考拉',     py: 'kǎo lā',           en: 'Koala',       emoji: '🐨', pos: [30, -32],   rot: -0.9, scale: 1.3, y: 'ground', r: 1.1, viewFrom: [27, -28.5] },
];

export const ANIMAL_IDS = ITEMS.filter(i => i.kind === 'animal').map(i => i.id);

// Auto-tour order (the exploration route)。沿地理顺序走一圈：西岸 → 北桥 → 东岸。
// 未解锁的对象不会被收进场景，导览会自动跳过它们。
const ROUTE_ORDER = [
  // 西岸（从西北角往南）
  'swing', 'rabbit', 'kite', 'flowerfield', 'deer', 'orchard', 'cabin', 'panda', 'tent', 'campfire',
  'snake', 'flower', 'lion', 'bird', 'giraffe', 'zebra', 'bone', 'garden', 'signpost',
  // 过北桥 → 东岸北部
  'turtle', 'lantern', 'penguin', 'windmill', 'balloon', 'camera', 'binoculars', 'well', 'owl', 'truck',
  'stump', 'crocodile', 'hippo', 'fish',
  // 东岸南部
  'dock', 'elephant', 'monkey', 'banana', 'sandpit', 'pavilion', 'fox', 'koala',
];
// 去重：任何 id 只走一次，写重了也不会让导览绕回头路
export const ROUTE = ROUTE_ORDER.filter((id, index) => ROUTE_ORDER.indexOf(id) === index);

// 画在地面上的浅色小径（比马路窄、颜色更浅）。所有场景都落在这条线之外的空档里，
// 不会出现"小路从房子中间穿过去"这种违和画面。马路见上面的 ROAD_CURVES。
export const PATH_CURVES = [
  [
    [-24, 21], [-28, 15], [-26, 6], [-23, 1], [-21, -3], [-16, -8], [-11, -8], [-10, -2], [-9, 5], [-6, 2], [-3, -2],
    [BRIDGES[0].x, BRIDGES[0].z], [7, -2], [8, 4], [7.5, 9], [8, 15], [12, 18], [17, 15], [18, 8], [14, 1], [12, -6],
    [17, -10], [22, -13], [24.5, -9], [20, -4], [24, 1], [27, 7], [24, 13], [20, 17], [23, 18],
  ],
];

// Trees that carry a perch (bird / monkey) are placed exactly; everything else is scattered.
export const SPECIAL_TREES = [
  { pos: [-19.5, -6], type: 'perch', branchDir: 1, branchH: 3.0, branchLen: 2.4, scale: 1.25 },
  { pos: [27, -16],   type: 'perch', branchDir: -1, branchH: 2.5, branchLen: 3.2, scale: 1.7 },
];
