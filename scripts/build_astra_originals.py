"""Build reproducible localized ports from unchanged upstream snapshots.

All gameplay/render/audio code remains upstream. Adaptation changes are limited
to visible strings, localStorage access, launch/save hooks and asset URLs.
"""
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'content/games/astra-originals/source'
DEST = ROOT / 'frontend/assets/games/astra-originals'
REV = '20261012-astra-original-1'

def replace(text, before, after, minimum=1):
    if text.count(before) < minimum:
        raise ValueError('Upstream source changed: ' + before[:80])
    return text.replace(before, after)

def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8')

def bootstrap(game, keys):
    return f"import {{ initializeOriginal }} from '../bootstrap.js?v={REV}';\nconst fufuAdapter = await initializeOriginal('{game}-adapt', {json.dumps(keys)});\n"

def mosswing():
    folder = DEST / 'mosswing'
    folder.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(SOURCE / 'mosswing/src/three.min.js', folder / 'three.min.js')
    shutil.copyfile(SOURCE / 'mosswing/src/three-license.txt', folder / 'three-license.txt')
    shell = (SOURCE / 'mosswing/src/shell.html').read_text(encoding='utf-8')
    translations = {
        'lang="en"': 'lang="zh-CN"',
        'Mosswing — Small wings. Endless wonder.': 'Mosswing · 苔翼飞行',
        'Small wings. Endless wonder. A tiny one-tap flight through a floating garden. Plays offline.': '小小翅膀，飞向奇境。轻点振翅，穿越三维浮空花园。',
        'Mosswing. Tap, click, or press Space to flap through the gaps. One collision ends your flight.': '苔翼飞行：轻点、点击或按空格振翅，穿过浮岛间隙。碰撞后本局结束。',
        '>BEST<': '>最佳<', 'Pause game': '暂停飞行', 'Mute sound': '关闭声音',
        'Small wings. Endless wonder.': '小小翅膀，飞向奇境。', 'Take flight': '开始飞行',
        'Tap anywhere or press space': '轻点画面 / 按空格振翅',
        'ONE TAP. ONE MORE TRY.': '轻轻一跃，再飞远一点。',
        'Gaps passed': '已穿过的间隙', 'TAP TO KEEP YOUR WINGS UP': '轻点振翅，保持飞行',
        'A little further?': '再飞远一点？', 'Every flight starts with a little lift.': '每一次远行，都从轻轻振翅开始。',
        'THIS FLIGHT': '本次航程', 'PERSONAL BEST': '最佳航程', 'Fly again': '再飞一次',
        'A quiet moment.': '歇一会儿。', 'Your garden will wait.': '花园会在这里等你。', 'Keep flying': '继续飞行',
        'A moment on the ground.': '暂时停在地面。',
        'This garden needs WebGL. Try opening it in a current version of Safari or Chrome.': '三维花园需要 WebGL，请使用支持三维图形的浏览器。',
        'Try again': '重新加载', 'Enable JavaScript to take flight.': '请启用 JavaScript 后开始飞行。',
    }
    for before, after in translations.items():
        shell = replace(shell, before, after)
    shell = replace(shell, '<!-- THREE_LIBRARY -->', f'<script src="./three.min.js?v={REV}"></script>')
    shell = replace(shell, '<script>\n/* GAME_CODE */\n</script>', f'<script type="module" src="./game.js?v={REV}"></script>')
    # Use Chinese system fallbacks while retaining the upstream typography/layout.
    shell = shell.replace('Arial,Helvetica,sans-serif', 'Arial,Helvetica,"Microsoft YaHei",sans-serif')
    game = (SOURCE / 'mosswing/src/game.js').read_text(encoding='utf-8').replace('localStorage', 'window.FufuOriginalStorage')
    strings = {
        'Enable sound': '开启声音', 'Mute sound': '关闭声音', 'A new personal best': '刷新最佳航程',
        'Every flight starts with a little lift.': '每一次远行，都从轻轻振翅开始。',
        'The next gap is always an invitation.': '前方的间隙，正等着你再试一次。',
        'Somewhere between the leaves, you found your rhythm.': '穿过叶影，你找到了自己的飞行节奏。',
        'The garden lost its canvas. Reload to take flight again.': '三维画面暂时中断，请重新加载后继续飞行。',
    }
    for before, after in strings.items():
        game = replace(game, before, after)
    hooks = """
fufuAdapter.attach({pause,save(){best=Math.max(best,model.score);window.FufuOriginalStorage.setItem('mosswing.best',String(best));window.FufuOriginalStorage.setItem('mosswing.muted',String(muted));}});
window.FufuGameDebug={get state(){return state;},get score(){return model.score;},get best(){return best;}};
fufuAdapter.ready();
"""
    game = replace(game, 'requestAnimationFrame(now=>{previous=now;frame(now);});', 'requestAnimationFrame(now=>{previous=now;frame(now);});' + hooks)
    game = replace(game, "$('error').style.display='grid';$('reload').onclick=()=>location.reload();return;", "$('error').style.display='grid';$('reload').onclick=()=>location.reload();fufuAdapter.fail(new Error('浏览器暂时无法开启三维花园'));return;")
    write(folder / 'index.html', shell)
    write(folder / 'game.js', bootstrap('mosswing', ['mosswing.best', 'mosswing.muted']) + game)

def thunderfall():
    folder = DEST / 'thunderfall'
    folder.mkdir(parents=True, exist_ok=True)
    for file in ('data.js', 'engine.js', 'render.js', 'audio.js', 'airframes.js', 'style.css', 'icon.svg'):
        shutil.copyfile(SOURCE / 'thunderfall' / file, folder / file)
    html = (SOURCE / 'thunderfall/index.html').read_text(encoding='utf-8')
    strings = {
        '天穹远征 / FLIGHT COMMAND': '天穹远征 / 飞行指挥部', 'NO INSTALL': '即开即玩', 'VOL. 002': '第二飞行中队',
        'THE LAST SQUADRON': '最后的飞行中队', '5 SECTORS / 10 MIN+': '五大战区 / 约十分钟起',
        '本机战役最高分': '我的战役最高分', '仅保存在此浏览器 · 演练不计入': '随学习账号保存 · 演练不计入',
        'LIVE FLIGHT': '实时飞行', 'HANGAR 01': '一号机库', 'SCORE ': '得分 ',
        'MISSION 001 — THE SKY IS CALLING': '任务 001 — 天穹在呼唤', 'F-01 / INTERCEPTOR': 'F-01 / 拦截机',
        'READY TO DEPLOY': '准备出击', 'AUTO FIRE ON': '自动开火', 'SPACE ·': '空格 ·',
        'LOADOUT': '武器装载', 'BLUE / 蓝色': '蓝色 / 普通', '10s TO CLAIM': '十秒内拾取', 'FIELD NOTES': '战术笔记',
        'ORIGINAL ARCADE EXPERIMENT': '原创街机作品', 'Created with GPT-6 Astra': '由 GPT-6 Astra 创作',
        'A SMALL HITBOX. A VERY BIG SKY.': '小小的受击核心，辽阔的天空。',
        'FREE TO PLAY / NO LOGIN / NO ADS': '免费游玩 / 无广告', 'FLIGHT MANUAL': '飞行手册',
        '战役最高分仅存本机。': '战役最高分随当前学习账号保存。',
    }
    for before, after in strings.items(): html = replace(html, before, after)
    html = html.replace('./app.js', './app.js?v=' + REV).replace('./style.css', './style.css?v=' + REV)
    app = (SOURCE / 'thunderfall/app.js').read_text(encoding='utf-8').replace('localStorage', 'window.FufuOriginalStorage')
    strings = {
        'FLIGHT ON HOLD': '飞行暂停', ' / CLEAR': ' / 已通过', 'TRAINING REPORT': '演练报告',
        'MISSION ACCOMPLISHED': '远征完成', 'SIGNAL LOST': '信号中断', 'PHASE ': '阶段 ',
        'HANGAR 01': '一号机库', "'TRAINING' : 'SECTOR'": "'演练' : '战区'",
        'AUTO FIRE / DRAG TO FLY': '自动开火 / 拖动移动', 'BOSS ENGAGED': '首领交战中',
        'GRAZE +25 / MAX COMBO ×5': '擦弹 +25 / 连击最高 ×5', 'WARNING / HOSTILE FLAGSHIP': '警报 / 敌方旗舰',
        'FLAGSHIP DESTROYED': '旗舰已摧毁', 'Boss 第 ': '首领第 ',
    }
    for before, after in strings.items(): app = replace(app, before, after)
    app = app.replace('`SECTOR 0', '`战区 0').replace(' / ${STAGES[event.index].enName}', ' / ${STAGES[event.index].name}')
    app += """
fufuAdapter.attach({pause(){pause('游戏已暂停，准备返回游戏乐园。');},save(){if(!game.practice&&game.score>best){best=game.score;storage.set('best',best);}storage.set('sound',sound.enabled);storage.set('reducedMotion',reducedMotion);}});
window.FufuGameDebug={get game(){return game;},get best(){return best;}};
fufuAdapter.ready();
"""
    write(folder / 'index.html', html)
    write(folder / 'app.js', bootstrap('thunderfall', ['thunderfall:best', 'thunderfall:sound', 'thunderfall:reducedMotion']) + app)

def iron_bastion():
    folder = DEST / 'iron-bastion'
    html = (SOURCE / 'iron-bastion/index.html').read_text(encoding='utf-8')
    strings = {
        '3D tank battlefield': '三维坦克战场', 'TACTICAL DEFENSE SYSTEM': '战术防御系统',
        'EST. 1985 &mdash; REBUILT IN 3D': '经典坦克大战 · 三维重现', 'EST. 1985 - REBUILT IN 3D': '经典坦克大战 · 三维重现',
        'ONE SIGNAL. ONE LAST STAND.': '一座信标，最后一道防线。', 'LIVE BATTLEFIELD PREVIEW': '实时战场预览',
        'NO DOWNLOADS. NO DISTRACTIONS. JUST DEFEND.': '即开即玩，专心守住防线。', 'SIGNAL INTEGRITY': '信标完整度',
        'TACTICAL RADAR': '战术雷达', '>LIVE<': '>实时<', '>ALLIED<': '>友军<', '>HOSTILE<': '>敌军<',
        '>MOVE<': '>移动<', '>FIRE<': '>开火<', 'MISSION BRIEFING': '任务简报', 'HOSTILES INBOUND': '敌军正在接近',
        'AWAITING YOUR COMMAND': '等待你的指令', 'RESUME OPERATION': '继续作战', 'SECTOR SECURED': '战区已守住',
        'FIELD UPGRADE /': '战场强化 /', '01 / FIREPOWER': '01 / 火力', '02 / PROTECTION': '02 / 防护', '03 / SUPPORT': '03 / 支援',
        'FIELD MANUAL / REV. 01': '战地手册 / 第一版', 'SYSTEM CONFIGURATION': '系统设置',
        'IRON BASTION &middot; ORIGINAL WEBGL ENGINE': 'IRON BASTION · 原创 WebGL 引擎',
        'PROCEDURAL ASSETS / SYNTHESIZED AUDIO / ZERO DEPENDENCIES': '程序生成场景 / 合成音效 / 无外部依赖',
        'BUILDING THE BATTLEFIELD': '正在构建战场', 'JavaScript is required to run IRON BASTION.': '钢铁防线需要启用 JavaScript。',
        'SIGNAL LINK ESTABLISHED': '信标连接已建立', 'OPERATION ': '行动 ', 'SECTOR ': '战区 ', 'WAVE ': '波次 ',
        'COMMAND UNIT / HEAVY ARMOR': '指挥单位 / 重装装甲', 'Toggle sound': '切换声音', 'aria-label="Help"': 'aria-label="帮助"',
        'aria-label="Settings"': 'aria-label="设置"', 'Fullscreen [F]': '全屏 [F]', 'aria-label="Fullscreen"': 'aria-label="全屏"',
        'Pause [Esc]': '暂停 [Esc]', 'aria-label="Pause"': 'aria-label="暂停"', 'aria-label="Close"': 'aria-label="关闭"',
        'Toggle music': '切换音乐', 'Toggle camera shake': '切换镜头震动',
        'The graphics context was lost. Reload the page to restart.': '三维画面已中断，请重新加载后继续。',
    }
    for before, after in strings.items(): html = replace(html, before, after)
    html = html.replace('localStorage', 'window.FufuOriginalStorage')
    # Keep original full scene/layout and all engine classes in their original order.
    html = replace(html, '<script>\n// ===== SOURCE: strings.js =====', '<script type="module">\n' + bootstrap('iron-bastion', ['iron-bastion-v1']) + '// ===== SOURCE: strings.js =====')
    html = replace(html, "function reportError(error){show('loading',false);", "function reportError(error){fufuAdapter.fail(error);show('loading',false);")
    html = replace(html, 'requestAnimationFrame(now=>{frame(now);', "fufuAdapter.attach({pause(){resetInput();if(game.state==='playing'||game.state==='intro')game.pause();audio.ctx?.suspend().catch(()=>{});},save(){saved.best=Math.max(saved.best,game.score);persist();}});fufuAdapter.ready();requestAnimationFrame(now=>{frame(now);")
    write(folder / 'index.html', html)

def catalogue():
    for name in ('mosswing', 'thunderfall', 'iron-bastion'):
        shutil.copyfile(SOURCE / name / 'gameplay.jpg', DEST / name / 'cover.jpg')
    changes = {
        'mosswing_adaptation_game.json': {
            'title': 'Mosswing · 苔翼飞行', 'description': '轻点振翅，穿过暖色三维浮空花园。保留原版小鸟、浮岛、叶影、音乐与飞行节奏。',
            'duration': '每局约 1–5 分钟', 'tags': ['原版三维场景', '单键飞行', '中文界面'],
            'rules': ['点击或按空格振翅，穿过浮岛间的空隙。', '每穿过一道间隙增加一分，碰撞或飞出边界后本局结束。', '最高分和声音设置随当前学习账号保存，每次打开开始新的一局。'],
            'controls': ['点击画面、空格、↑ 或 W：振翅。', 'P / Esc：暂停；M：切换声音。'],
            'resume': False, 'saveLabel': '最高分随账号保存',
            'storage_keys': ['mosswing.best', 'mosswing.muted'],
            'source': 'https://github.com/Ayi1337/gpt6-astra-one-shot-games/tree/main/mosswing', 'author': 'Ayi1337',
            'license': '原版源码本地移植；原作未单独声明许可。Three.js 保留 MIT 许可。', 'entry': '/assets/games/astra-originals/mosswing/index.html', 'cover': '/assets/games/astra-originals/mosswing/cover.jpg',
        },
        'thunderfall_adaptation_game.json': {
            'title': '雷霆战机 · 天穹远征', 'description': '原版五大空域、三种战机、四色武器和多阶段首领。擦弹充能，选择关间强化，完成十分钟以上的远征。',
            'duration': '完整战役约 10–20 分钟', 'tags': ['原版五关战役', '四色武器', '触屏拖动'],
            'rules': ['战机自动开火，移动躲开弹幕，拾取四类武器模块。', '每关至少两分钟，击败首领后选择强化；可单独演练五个战区。', '最多三次续战。最高分和设置随学习账号保存，战役本身每次重新开始。'],
            'controls': ['WASD / 方向键移动；Shift 精密移动；空格炸弹；E 雷霆爆发；P / Esc 暂停。', '手机或鼠标在战场按住拖动，使用原版屏幕技能按钮。'],
            'resume': False, 'saveLabel': '最高分随账号保存',
            'storage_keys': ['thunderfall:best', 'thunderfall:sound', 'thunderfall:reducedMotion'],
            'source': 'https://github.com/MartinDelophy/awesome-gpt-6-astra/tree/main/works/thunderfall', 'author': 'jackroc',
            'license': '原版源码本地移植；保留 jackroc 署名，来源归档许可见上游仓库。', 'entry': '/assets/games/astra-originals/thunderfall/index.html', 'cover': '/assets/games/astra-originals/thunderfall/cover.jpg',
        },
        'iron_bastion_adaptation_game.json': {
            'title': 'IRON BASTION · 钢铁防线', 'description': '原版三维坦克守卫战，六个战区、五类敌军、可破坏地形与关间强化。用冲刺和电磁脉冲守住信标。',
            'duration': '约 15–30 分钟，可分战区游玩', 'tags': ['原版 WebGL2 场景', '六大战区', '触屏摇杆'],
            'rules': ['保护基地信标，击退每一波敌军，保留原版坦克、地形、补给与首领。', '可选择六个战区练习，也可依次闯关，每关结束选择强化。', '已完成战区纪录、下一战区和声音设置随当前学习账号保存。'],
            'controls': ['WASD / 方向键移动；鼠标瞄准；左键 / 空格 / J 开火；Shift 冲刺；Q 电磁脉冲。', 'P / Esc 暂停；V 切换视角；触屏用原版摇杆和开火按钮。'],
            'resume': True, 'saveLabel': '战区纪录随账号保存',
            'storage_keys': ['iron-bastion-v1'], 'source': 'https://iron-bastion.zecoba.workers.dev/', 'author': '原作发布者 bandaot / chat01.ai',
            'license': '原版公开 HTML 本地移植；原作者未单独声明再分发许可，保留来源与署名。', 'entry': '/assets/games/astra-originals/iron-bastion/index.html', 'cover': '/assets/games/astra-originals/iron-bastion/cover.jpg',
        },
    }
    for filename, updates in changes.items():
        path = ROOT / 'backend/seed_data' / filename
        current = json.loads(path.read_text(encoding='utf-8'))
        # Preserve previous trial scores in storage without feeding them to the
        # original games, whose storage formats differ.
        old_keys = [key for key in current['storage_keys'] if '.save.v1' in key]
        current.update(updates)
        current['storage_keys'] += old_keys
        write(path, json.dumps(current, ensure_ascii=False, indent=2) + '\n')

if __name__ == '__main__':
    mosswing(); thunderfall(); iron_bastion(); catalogue()
    write(DEST / 'ATTRIBUTION.txt', (ROOT / 'content/games/astra-originals/README.md').read_text(encoding='utf-8'))
    print('Built original Mosswing, THUNDERFALL and IRON BASTION; gameplay/render/audio preserved.')
