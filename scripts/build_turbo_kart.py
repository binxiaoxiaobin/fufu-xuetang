"""Build a local, attributed adaptation; keep downloaded upstream source intact."""
import hashlib
import json
import re
import shutil
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT/'content/games/turbo-kart-rally/source'
DEST = ROOT/'frontend/assets/games/turbo-kart-rally'
DEST.mkdir(parents=True, exist_ok=True)
shutil.copytree(SOURCE/'src', DEST/'src', dirs_exist_ok=True)
shutil.copy2(SOURCE/'LICENSE', DEST/'LICENSE.txt')
vendor = DEST/'vendor'; vendor.mkdir(exist_ok=True)
package = ROOT/'artifacts/three-0170/package'
shutil.copy2(package/'build/three.module.min.js', vendor/'three.module.js')
shutil.copy2(package/'LICENSE', vendor/'THREE-LICENSE.txt')
# Copy only the transitively used addon modules, instead of the whole examples library.
addon_root = package/'examples/jsm'
pending = ['postprocessing/EffectComposer.js', 'postprocessing/RenderPass.js',
           'postprocessing/UnrealBloomPass.js', 'postprocessing/OutputPass.js']
seen = set()
for source_file in (SOURCE/'src').glob('*.js'):
    pending.extend(re.findall(r"['\"]three/addons/([^'\"]+)['\"]", source_file.read_text(encoding='utf-8')))
while pending:
    relative = pending.pop()
    if relative in seen: continue
    seen.add(relative)
    path = (addon_root/relative).resolve()
    out = vendor/'addons'/relative; out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, out)
    for reference in re.findall(r"(?:from|import)\s*['\"]([^'\"]+)['\"]", path.read_text(encoding='utf-8')):
        if reference.startswith('.'):
            pending.append((path.parent/reference).resolve().relative_to(addon_root.resolve()).as_posix())

def edit(name, replacements):
    path = DEST/'src'/name
    text = path.read_text(encoding='utf-8')
    for before, after in replacements:
        if before not in text: raise ValueError('Missing patch: '+name+' '+before)
        text = text.replace(before, after)
    path.write_text(text, encoding='utf-8')

edit('main.js', [
    ("const canvas = document.getElementById('game-canvas');", "const lightweight = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;\nconst renderRatio = Math.min(devicePixelRatio || 1, lightweight ? 1 : 1.5);\nconst canvas = document.getElementById('game-canvas');"),
    ('antialias: true', 'antialias: !lightweight'),
    ('Math.min(window.devicePixelRatio || 1, 2)', 'renderRatio'),
    ('renderer.shadowMap.enabled = true;', 'renderer.shadowMap.enabled = !lightweight;'),
    ('const composer = new EffectComposer(renderer);', 'const composer = lightweight ? null : new EffectComposer(renderer);'),
    ('composer.setPixelRatio(', 'composer?.setPixelRatio('),
    ('composer.setSize(', 'composer?.setSize('),
    ('const renderPass = new RenderPass(fallbackScene, camera);', 'const renderPass = lightweight ? {scene:fallbackScene} : new RenderPass(fallbackScene, camera);'),
    ('composer.addPass(', 'composer?.addPass('),
    ('const bloom = new UnrealBloomPass(', 'const bloom = lightweight ? null : new UnrealBloomPass('),
    ('  bloom.setSize(w, h);', '  bloom?.setSize(w, h);'),
    ('try { composer.render(dt); }', 'try { if (lightweight) renderer.render(renderPass.scene, camera); else composer.render(dt); }'),
    ('  const rawDt = clock.getDelta();', '  if (document.hidden) { clock.getDelta(); return; }\n  const rawDt = clock.getDelta();'),
    ("menu.showLoading('LOADING');", "menu.showLoading('正在准备赛道');"),
    ('  setState(\'title\');\n  audio.playMusic(\'menu\');\n}', "  setState('title');\n  audio.playMusic('menu');\n  parent.postMessage({type:'fufu-toy-ready', gameId:'turbo-kart-rally'}, location.origin);\n}"),
    ('boot();', "boot().catch(error => { console.error(error); parent.postMessage({type:'fufu-toy-error',gameId:'turbo-kart-rally',text:'赛道准备失败，请重新开始。'},location.origin); });"),
    ('  await loadModules();', "  await loadModules();\n  if (!mods.track || !mods.kart || !mods.models || !mods.input) throw new Error('Required racing module unavailable');"),
    ('  buildAttract();\n  menu.showTitle();', "  buildAttract();\n  if (!world) throw new Error('Race world unavailable');\n  menu.showTitle();"),
    ('  audio, hud, menu, renderer, camera, bus,', '  audio, hud, menu, renderer, camera, bus, pause, resume,')
    ,("'GET READY!'", "'准备出发！'"), ('ENTER · SKIP','点击赛道，跳过介绍'),
    ("LAP${lastSettings.laps > 1 ? 'S' : ''}", '圈'),
    ("'SOUND OFF' : 'SOUND ON'", "'声音关闭' : '声音开启'")
])
with (DEST/'src/main.js').open('a',encoding='utf-8') as stream:
    stream.write('\nexport { pause, resume, audio };\n')
edit('input.js', [
    ('    this.keys = new Set();', '    this.keys = new Set();\n    this.touchHeld = new Set();'),
    ('  _keyHeld(action) {', "  setTouchAction(action, down) {\n    if (down && !this.touchHeld.has(action)) { this.latch[action] = true; if (action === 'item') this.itemEdge = true; }\n    if (down) this.touchHeld.add(action); else this.touchHeld.delete(action);\n    this.lastDevice = 'touch';\n  }\n\n  _keyHeld(action) {\n    if (this.touchHeld.has(action)) return true;"),
    ('this.keys.clear();', 'this.keys.clear(); this.touchHeld.clear();')
])
menu_translations = {
 '50cc · EASY':'50cc · 简单','100cc · NORMAL':'100cc · 标准','150cc · HARD':'150cc · 挑战',
 "this.diffIndex = 1;":"this.diffIndex = 0;", "this.lapsIndex = 1;":"this.lapsIndex = 0;",
 'PRESS ENTER / CLICK TO START':'点击画面，选择赛车', 'CHOOSE YOUR RACER':'选择你的赛车',
 'ESC · BACK':'返回', '>CLASS<':'>难度<', '>LAPS<':'>圈数<', 'RACE!':'开始比赛',
 '>PAUSED<':'>休息一下<', '>RESUME<':'>继续比赛<', '>RESTART<':'>重新开始<', '>QUIT TO MENU<':'>返回选车<',
 'Accelerate':'加速', 'Brake / Reverse':'刹车 / 倒车', 'Steer':'转向', 'Hop / Drift':'跳跃 / 漂移',
 'Use item':'使用道具', 'Look back':'回头看', 'Pause</div>':'暂停</div>', 'Mute</div>':'静音</div>',
 "LAP${LAPS[this.lapsIndex] > 1 ? 'S' : ''}":'圈',
 "'SPEED'":"'速度'", "'ACCEL'":"'加速'", "'HANDLING'":"'转向'", "'WEIGHT'":"'重量'",
 "'SPD'":"'速'", "'ACC'":"'加'", "'HDL'":"'转'", "'WGT'":"'重'"
}
edit('menu.js', list(menu_translations.items()))
edit('hud.js', [('>LAP<','>圈数<'), ('WRONG WAY','方向反了'),
 ('VICTORY!','冠军！'),('PODIUM FINISH!','登上领奖台！'),('FINISH!','冲线啦！'),('RACE COMPLETE','比赛完成'),("'RESULTS'","'成绩'"),
 ('LAP RACE · FINAL STANDINGS','圈比赛 · 最终排名'),('RACE AGAIN','再跑一场'),('MAIN MENU','返回选车'),
 ("'E / SHIFT'", "'道具 / E'"),('DRIFT','漂移')])
edit('config.js', [("'Turbo Kart Rally'", "'海岛 卡丁车'")])
edit('track.js', [("'Palm Cove Circuit'", "'棕榈湾赛道'")])
edit('styles.css', [("'Lilita One'", "'PingFang SC'"), ("'Nunito'", "'Microsoft YaHei'")])
from game_localization import kart
kart(DEST/'src')
from game_performance import kart as optimize_kart
optimize_kart(DEST/'src')
# Local module URLs also need revisions: the iframe query alone does not refresh imports.
for path in (DEST/'src').glob('*.js'):
    text = path.read_text(encoding='utf-8')
    text = re.sub(r"(['\"])(\./[^'\"]+\.js)\1", r"\1\2?v=20261010-game-perf-1\1", text)
    path.write_text(text, encoding='utf-8')
cover = ROOT/'content/games/turbo-kart-rally/cover-zh.webp'
ImageOps.fit(Image.open(cover if cover.exists() else SOURCE/'docs/screenshots/race.jpg').convert('RGB'), (600,400)).save(DEST/'cover.webp',quality=85)
archive = ROOT/'artifacts/turbo-kart-rally-main.zip'
(ROOT/'content/games/turbo-kart-rally/provenance.json').write_text(json.dumps({
    'source':'https://github.com/bridge-mind/turbo-kart-rally','license':'MIT',
    'downloaded_on':'2026-10-08','archive_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),
    'three':'0.170.0','modifications':['native fullscreen gate','Chinese UI','multitouch controls','tablet rendering budget','hidden tab suspension'],
},ensure_ascii=False,indent=2),encoding='utf-8')
print('Local kart build prepared; addon dependencies:',len(seen))
