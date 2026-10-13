# -*- coding: utf-8 -*-
"""Recreate the Chinese Fishslop adaptation from the preserved upstream source."""
import hashlib
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'content/games/fishslop'
BUILD = ROOT / 'artifacts/fishslop-build'
BUILD.mkdir(exist_ok=True)
for name in ('src', 'tests'):
    shutil.copytree(BASE/'source'/name, BUILD/name, dirs_exist_ok=True)

def edit(name, pairs):
    path = BUILD/name
    value = path.read_text(encoding='utf-8')
    for old, new in pairs:
        if old not in value:
            raise ValueError('Missing upstream text in '+name+': '+old)
        value = value.replace(old, new)
    path.write_text(value, encoding='utf-8')

shutil.copy2(BASE/'source/index.html', BUILD/'index.html')
edit('index.html', [
    ('lang="en"', 'lang="zh-CN"'), ('<title>Fishslop</title>', '<title>海底小鱼乐园 · 福福学堂</title>'),
    ('Pilot a bathyscaphe through a sunken reef, feed its fish, bank the coins they drop, and ping sonar for the Veilfin. A 3D game that runs in your browser.', '驾驶潜水艇探索海底，喂养小鱼、收集金币，用声呐寻找神秘的幻纱鱼。'),
    ('Underwater reef, rendered in 3D', '三维海底珊瑚世界'),
    ("Bathyscaphe FS-7 · Reef keeper's log", '团团的潜水艇 · 海底探索日志'),
    ('Fish<span>slop</span>', '海底<span>小鱼乐园</span>'),
    ('Pilot the sub. Feed the reef. Bank the coins it drops. Ping sonar when something pale circles the ruins.', '开着潜水艇，给小鱼喂食、收集金币，慢慢建成自己的海底乐园。用声呐寻找遗迹附近的神秘小鱼。'),
    ('Loading the reef…', '正在准备海底世界…'), ('Start a new reef', '新建海底世界'),
    ('Steer</dd>', '移动潜水艇</dd>'), ('Rise, dive', '上浮、下潜'), ('Drop food', '长按喂食'),
    ('Sonar ping', '声呐探测'), ('Boost</dd>', '加速</dd>'), ('<kbd>Drag</kbd>', '<kbd>拖动</kbd>'),
    ('Look around', '转动视角'), ('The dock', '补给商店'), ('Day, night', '白天、夜晚'),
    ("This browser can't start WebGL, so the reef can't be drawn. Turn on hardware acceleration in your browser settings, then reload.", '浏览器无法显示三维海底，请开启浏览器的硬件加速后重新加载，或换用支持 WebGL 2 的浏览器。'),
    ('>Coins<', '>金币<'), ('>Reef<', '>海底等级<'), ('>Tide pool<', '>潮汐小池<'),
    ('60 to Lagoon', '距浅海湾还差 60 繁荣值'), ('8 fish', '8 条小鱼'),
    ('Switch to night', '切换到夜晚'), ('Day / night (N)', '白天 / 夜晚（N）'),
    ('Mute sound', '关闭声音'), ('Sound (M)', '声音（M）'), ('Pause (Esc)', '暂停（P / Esc）'),
    ('aria-label="Pause"', 'aria-label="暂停"'), ('Sonar scope', '声呐雷达'),
    ('Depth <', '深度 <'), ('Hdg <', '朝向 <'), ('0 m', '0 米'),
    ('Food hopper', '鱼食仓'), ('Sonar <', '声呐 <'), ('>Ready<', '>已就绪<'),
    ('>Rise<', '>上浮<'), ('>Dive<', '>下潜<'), ('>Boost<', '>加速<'), ('>Ping<', '>声呐<'), ('>Feed<', '>喂食<'),
    ('Docked · Supply bay', '停靠补给站 · 小鱼与装备'), ('Close the dock', '关闭补给商店'),
    ('>Residents<', '>小鱼伙伴<'), ('>Sub parts<', '>潜水艇装备<'),
    ('Engines idle', '休息一下'), ('>Paused<', '>已暂停<'), ('Resume dive', '继续探索'),
    ('Progress saves in this browser every few seconds.', '进度按学习账号自动保存；显示“进度已保存”后即可放心返回。'),
    ('Source on GitHub', '查看原作'), ('/src/main.ts', '/src/fufu-entry.ts'),
])
p = BUILD/'index.html'
p.write_text(re.sub(r'    <link[^\n]*https://fonts\.[^\n]*\n', '', p.read_text(encoding='utf-8')), encoding='utf-8')

edit('src/core/species.ts', [
    ('Glimmer tetra', '微光灯鱼'), ('Pocket-sized, schools tight, glows at night.', '小巧可爱，喜欢结伴游动，夜晚会发出微光。'),
    ('Clownfish', '小丑鱼'), ('Loyal to the sub. Drops bronze like it means it.', '喜欢跟着潜水艇，吃饱后会送你铜币。'),
    ('Sunburst tang', '阳光倒吊鱼'), ('Tall, lemon-bright, always on patrol.', '亮黄色的小鱼，总爱在海底四处巡游。'),
    ('Regal blue', '宝蓝倒吊鱼'), ('Electric blue with a black palette stroke.', '宝蓝色的身体上，有漂亮的黑色花纹。'),
    ('Crowned angelfish', '皇冠神仙鱼'), ('All sail. Glides instead of swims.', '鱼鳍像小船帆，游动起来十分优雅。'),
    ('Polka puffer', '斑点河豚'), ('Round, spotted, suspicious of everything.', '圆滚滚、满身斑点，是个好奇又谨慎的小伙伴。'),
    ('Mandarin dragonet', '七彩麒麟鱼'), ('Psychedelic swirl, pays in gold.', '身披七彩花纹，吃饱后会送你金币。'),
    ('The Slopfish', '传奇彩虹鱼'), ('Legendary. Oil-slick scales, pearls on schedule.', '传说中的小鱼！鱼鳞流光溢彩，还会送你珍珠。'),
    ('Veilfin', '幻纱鱼'), ('Only sonar can see it. Feed it once, get a pearl.', '用声呐才能找到它；喂它一次，就能得到珍珠。'),
])
edit('src/core/config.ts', [(a,b) for a,b in [
    ("label: 'Propeller'", "label: '螺旋桨'"), ("label: 'Food hopper'", "label: '鱼食仓'"),
    ("label: 'Coin magnet'", "label: '金币磁铁'"), ("label: 'Sonar array'", "label: '声呐装置'"),
    ('Tide pool', '潮汐小池'), ('Lagoon', '浅海湾'), ('Coral garden', '珊瑚花园'),
    ('Barrier reef', '缤纷珊瑚礁'), ('Atoll', '环礁乐园'), ('Abyssal wonder', '深海奇境'),
]])
edit('src/ui/hud.ts', [
    ("'en-US'", "'zh-CN'"), ('${fmt(Math.max(0, next.min - value))} reef value to ${next.name}', '距${next.name}还差 ${fmt(Math.max(0, next.min - value))} 繁荣值'),
    ('Top tier reached', '已达到最高等级'), ('${sim.fish.length} fish', '${sim.fish.length} 条小鱼'),
    (' · ${hungry} hungry', ' · ${hungry} 条饿了'), ('Recharging ${cd.toFixed(1)} s', '充能中 ${cd.toFixed(1)} 秒'),
    ("'Ready'", "'已就绪'"), ('} m`', '} 米`'),
])
edit('src/ui/shop.ts', [
    ('Cruise thrust +', '巡航动力 +'), (' pellets, refills ', ' 粒鱼食，每秒补充 '), ('}/s`', '} 粒`'),
    ('Pulls coins from ', '吸取范围 '), ('} m`', '} 米`'), ('} m range, ', '} 米范围，'), ('} s recharge', '} 秒充能'),
    ('Unlocks at ${TIERS[sp.tier].name}', '${TIERS[sp.tier].name}解锁'), ('Need ${fmt(short)} more', '还差 ${fmt(short)} 金币'),
    ('Buy · ${fmt(price)}', '购买 · ${fmt(price)}'), ('${owned} in reef · pays ~${sp.coinValue}c each ${sp.coinInterval}s', '已养 ${owned} 条 · 吃饱后约每 ${sp.coinInterval} 秒产出 ${sp.coinValue} 金币'),
    ('Maxed out', '已满级'), ('Upgrade · ${fmt(cost)}', '升级 · ${fmt(cost)}'),
])
edit('src/main.ts', [
    ("import './style.css';", "import './style.css';\nimport { learnerStorage, report } from './fufu-storage';"),
    ('function storage(): Storage | null', "function storage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null"),
    ('return window.localStorage;', 'return learnerStorage;'),
    ("  let mode: Mode = 'title';", "  let mode: Mode = 'title';\n  let exiting = false;"),
    ('return coarse && (navigator.hardwareConcurrency ?? 8) <= 4', 'return coarse || navigator.maxTouchPoints > 0'),
    ('WebGL unavailable', '无法显示三维场景'),
    ("console.error('[fishslop] E_WEBGL_UNAVAILABLE');", "report('fufu-toy-error', '浏览器无法显示三维海底，请开启硬件加速后重新加载。');\n    console.error('[fishslop] E_WEBGL_UNAVAILABLE');"),
    ('The reef is full.', '海底的小鱼已经满员啦。'), ('Not enough coins yet.', '金币还不够，再喂喂小鱼吧。'),
    ('Continue dive', '继续探索'), ('Dive in', '开始潜水'),
    ('${sim.fish.length} fish · ${fmt(sim.coins)} coins', '${sim.fish.length} 条小鱼 · ${fmt(sim.coins)} 金币'),
    ('Hold <b>Space</b> to drop food. Hungry fish come to you.', '长按<b>喂食按钮 / 空格</b>投放鱼食，饿了的小鱼会游过来。'),
    ('Drag to look around. <b>E</b> / <b>Q</b> to rise and dive.', '拖动屏幕转动视角，用<b>上浮 / 下潜</b>按钮或 <b>E / Q</b> 调整深度。'),
    ('Welcome back. ${sim.fish.length} fish are waiting.', '欢迎回来！${sim.fish.length} 条小鱼在等你。'),
    ('Coins banked', '累计金币'), ('Residents', '小鱼伙伴'), ('Pellets dropped', '投放鱼食'), ('Veilfins fed', '喂过幻纱鱼'),
    ("['Reef',", "['海底等级',"), ('Time underwater', '探索时长'), ('} min`', '} 分钟`'),
    ('Tap again to erase this reef', '再点一次，清空这个海底世界'), ('Start a new reef', '新建海底世界'),
    ('Fresh reef. Six tetras and two clownfish are yours.', '新的海底世界！六条灯鱼和两条小丑鱼陪你出发。'),
    ('Switch to day', '切换到白天'), ('Switch to night', '切换到夜晚'), ('Unmute sound', '开启声音'), ('Mute sound', '关闭声音'),
    ('A fed fish dropped a coin. Swim close to collect it.', '小鱼吃饱后送出了金币，开近一点就能收集。'),
    ('You can afford a new fish. Open <b>the dock</b> with <b>B</b>.', '可以买新小鱼啦！点击<b>补给商店</b>，或按 <b>B</b>。'),
    ('Your ${getSpecies(e.species).name.toLowerCase()} is growing. Bigger fish pay more.', '你的${getSpecies(e.species).name}长大啦！长大的小鱼会送出更多金币。'),
    ('Something pale is circling the reef. Ping sonar with <b>F</b> to see it.', '神秘小鱼在海底游动！点击<b>声呐</b>或按 <b>F</b> 寻找它。'),
    ('The Veilfin took the food and left a pearl worth <b>${VEILFIN.reward}</b>.', '幻纱鱼吃到了鱼食，送你一颗价值 <b>${VEILFIN.reward}</b> 金币的珍珠！'),
    ('${TIERS[e.index].name} reached. New residents at the dock.', '升级到${TIERS[e.index].name}！补给商店解锁了新伙伴。'),
    ('The Slopfish has arrived. The reef will never be the same.', '传奇彩虹鱼来啦！海底乐园更加缤纷。'),
    ("${e.what} ${e.upgrade ? 'upgraded' : 'joined the reef'}.", "${e.what}${e.upgrade ? '已升级' : '加入了海底乐园'}。"),
    ('The reef failed to load. Reload the page to try again.', '海底世界加载失败，请重新加载再试一次。'),
    ('if (mode === \'paused\') {\n      world.render(sim, 0, time, false);', "if (exiting || document.hidden) return;\n    if (mode === 'paused') {"),
    ('window.addEventListener(\'pagehide\', persist);', "window.addEventListener('pagehide', () => { if (!exiting) persist(); if (mode === 'playing') pause(); exiting = true; audio.suspend(); });\n  window.addEventListener('pageshow', () => { exiting = false; });\n  window.addEventListener('fufu-game-close', () => { persist(); if (mode === 'playing') pause(); exiting = true; audio.suspend(); });\n  window.addEventListener('fufu-game-reopen', () => { exiting = false; });"),
    ('  refreshTitle();\n', "  refreshTitle();\n  report('fufu-toy-ready', '海底世界已准备好');\n"),
    ("console.error('[fishslop] E_BOOT', err);", "report('fufu-toy-error', '海底世界加载失败，请重新加载。');\n  console.error('[fishslop] E_BOOT', err);"),
])
# Resetting from the title also needs two taps, like the existing pause reset.
edit('src/main.ts', [
    ("  newBtn.addEventListener('click', () => {\n    newReef();", "  let newArmed = false;\n  newBtn.addEventListener('click', () => {\n    if (!newArmed) { newArmed = true; newBtn.textContent = '再点一次，清空这个海底世界'; window.setTimeout(() => {newArmed = false; newBtn.textContent = '新建海底世界';}, 3500); return; }\n    newArmed = false;\n    newReef();"),
])
edit('src/input/input.ts', [("window.addEventListener('blur', () => this.keys.clear());", "window.addEventListener('blur', () => this.clear());"),
    ('    this.keys.clear();\n    this.sonarQueued', '    this.keys.clear();\n    this.dragging = false;\n    this.dragPointer = -1;\n    this.sonarQueued')])
edit('src/ui/touch.ts', [
    ('    input.touch.boost = l > radius * 1.25 || input.touch.boost;', ''),
    ('    e.stopPropagation();\n    id = e.pointerId;', '    e.stopPropagation();\n    if (!input.enabled || id !== -1) return;\n    id = e.pointerId;'),
    ("  stick.addEventListener('pointercancel', end);", "  stick.addEventListener('pointercancel', end);\n  stick.addEventListener('lostpointercapture', end);"),
    ('      e.stopPropagation();\n      try', '      e.stopPropagation();\n      if (!input.enabled) return;\n      try'),
    ("    b.addEventListener('pointercancel', () => set(false));", "    b.addEventListener('pointercancel', () => set(false));\n    b.addEventListener('lostpointercapture', () => set(false));"),
])
shutil.copytree(BASE/'adaptation', BUILD/'src', dirs_exist_ok=True)
with (BUILD/'src/style.css').open('a', encoding='utf-8') as f:
    f.write('\n'+(BASE/'chinese.css').read_text(encoding='utf-8'))
package = {'name':'fufu-fishslop','private':True,'version':'1.0.0','type':'module',
    'scripts':{'build':'tsc --noEmit && vite build', 'test':'vitest run'},
    'dependencies':{'three':'0.185.1'},'devDependencies':{'@types/three':'0.185.0','typescript':'5.9.3','vite':'7.3.7','vitest':'3.2.7'}}
(BUILD/'package.json').write_text(json.dumps(package, indent=2), encoding='utf-8')
config = json.loads((BASE/'source/tsconfig.json').read_text(encoding='utf-8')); config['include']=['src']
(BUILD/'tsconfig.json').write_text(json.dumps(config, indent=2), encoding='utf-8')
(BUILD/'vite.config.ts').write_text("export default {base:'/assets/games/fishslop/', build:{target:'es2022',chunkSizeWarningLimit:1200}, test:{include:['tests/unit/**/*.test.ts'],environment:'node'}};\n", encoding='utf-8')
(BASE/'provenance.json').write_text(json.dumps({'source':'https://github.com/vasu-devs/FishSlop_Opus5.5', 'commit':'55de15091c789585a5d4ece952f841e6006af138', 'downloaded_on':'2026-10-09','archive_sha256':hashlib.sha256((ROOT/'artifacts/fishslop-upstream.zip').read_bytes()).hexdigest(), 'license':'上游未声明授权许可；本地适配，发布或分发前需取得作者许可', 'changes':['中文界面与鱼种说明','按学员保存进度','触屏默认低画质','输入取消修复','可选全屏与退出保存','本地字体，移除字体联网请求'], 'dependency_versions':package},ensure_ascii=False,indent=2),encoding='utf-8')
print('Chinese Fishslop adaptation prepared:', BUILD)
from game_performance import fish as optimize_fish
optimize_fish(BUILD/'src')
