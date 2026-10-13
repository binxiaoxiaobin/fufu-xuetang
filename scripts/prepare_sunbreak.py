"""Prepare the local SUNBREAK adaptation without altering the source archive."""
import hashlib
import json
import shutil
from pathlib import Path
from PIL import Image,ImageOps
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'content/games/sunbreak/source'
build=ROOT/'artifacts/sunbreak-build'
shutil.copytree(source/'src',build/'src',dirs_exist_ok=True)
shutil.copytree(ROOT/'content/games/sunbreak/adaptation',build/'src',dirs_exist_ok=True)
def edit(name,replacements):
    p=build/'src'/name;s=p.read_text(encoding='utf-8')
    for old,new in replacements:
        if old not in s: raise ValueError('Missing patch '+name+': '+old)
        s=s.replace(old,new)
    p.write_text(s,encoding='utf-8')
edit('input.ts',[
 ('keys = new Set<string>(); enabled=true;', 'keys = new Set<string>(); touchKeys = new Set<string>(); enabled=true;\n  setTouch(code:string,down:boolean){if(down)this.touchKeys.add(code);else this.touchKeys.delete(code);}\n  reset(){this.keys.clear();this.touchKeys.clear();}'),
 ('this.keys.clear();onAction', 'this.reset();onAction'),
 ('const k=this.keys;', 'const k=new Set([...this.keys,...this.touchKeys]);')])
edit('main.ts',[
 ("import './style.css';", ''),
 ("const capture=new URLSearchParams", "const touchDevice=matchMedia('(pointer: coarse)').matches||navigator.maxTouchPoints>0;\nconst pixelLimit=touchDevice?1:1.5;\nlet suspended=false,disposed=false;\nconst capture=new URLSearchParams"),
 ("let enhancedEffects=true,", "let enhancedEffects=!touchDevice,"),
 ("try{enhancedEffects=localStorage", "try{if(!touchDevice)enhancedEffects=localStorage"),
 ('Math.min(devicePixelRatio,2)', 'Math.min(devicePixelRatio,pixelLimit)'),
 ("if(a==='pause'){", "if(a==='pause'){controls.reset();"),
 ("playerLabel.innerHTML='YOU <span>▼</span>'", "playerLabel.innerHTML='我 <span>▼</span>'"),
 ('THE MOUNTAIN IS YOURS','山路出发'),('LET IT RUN','向山下出发'),('CLEAN LANDING','平稳落地'),
 ('hud.ready();api.ready=true;', "hud.ready();api.ready=true;parent.postMessage({type:'fufu-toy-ready',gameId:'sunbreak-downhill'},location.origin);"),
 ('  requestAnimationFrame(frame);', '  if(disposed)return;\n  requestAnimationFrame(frame);\n  if(suspended||document.hidden){lastTime=now;return;}')])
with (build/'src/main.ts').open('a',encoding='utf-8') as p:
    p.write("\nexport {action,controls};\nexport function suspend(){suspended=true;controls.reset();action('blur');void audio.context?.suspend();}\nexport function wake(){suspended=false;lastTime=0;void audio.context?.resume();}\nexport function shutdown(){disposed=true;controls.reset();void audio.context?.close();pipeline.dispose();renderer.dispose();}\n")
# Keep the seeded terrain identical on all devices so saved ghosts remain valid.
translations={
 'SUNBREAK<span>DOWNHILL CLUB':'晴山飞驰<span>山地骑行', 'THE MOUNTAIN IS YOURS':'山路出发',
 'CHASE<br>THE <em>DAYLIGHT.</em>':'迎着晨光<br><em>骑向山下</em>', 'Four riders. One mountain. No second thoughts.':'和三位电脑骑手一起，沿山路驶向河谷。',
 'THE SUNBREAK DESCENT':'晴山下坡路线', 'SUMMIT → RIVER VALLEY':'山顶 → 河谷',
 'KM OF FREEDOM':'公里山路','METERS DOWN':'米落差','RIDERS. ONE LINE.':'位骑手同行',
 'DROP IN':'开始骑行','BUILT FOR THE DESCENT.':'从山顶出发。','MADE OF SUNSHINE & DIRT.':'在晨光中探索山路。',
 'ALPINE FREERIDE SERIES':'山地骑行体验','VOL. 001 / DAWN PATROL':'第一站 · 晨光山路', '100% PROCEDURAL':'代码生成场景',
 'POSITION':'排名','SUMMIT RIDGE':'山顶山脊','CHASE THE DAYLIGHT':'迎着晨光前进','NEXT UP':'前方路况','FIND YOUR FLOW':'稳稳前进',
 'LET IT RUN':'当前速度','HOLD SHIFT':'长按冲刺','BOOST':'冲刺能量','SUMMIT <':'山顶 <','VALLEY <':'河谷 <',
 'STYLE POINTS':'动作得分','TAKE A BREATH':'休息一下','MOUNTAIN<br>ON HOLD.':'骑行已暂停', 'KEEP RIDING':'继续骑行','RESTART DESCENT':'重新开始',
 'THE VALLEY REMEMBERS':'骑行完成','WHAT A<br>DESCENT.':'完成山地骑行！','FIRST TO<br>THE SUN.':'率先到达终点！',
 'YOUR TIME':'用时','PERSONAL BEST':'最佳成绩','>STYLE<':'>动作得分<','ONE MORE RUN':'再骑一次',
 'REPLAY BIGGEST AIR':'回放精彩跳跃','YOUR BIGGEST AIR':'精彩跳跃','CINEMATIC REPLAY':'慢动作回放',
 'CARVING THE MOUNTAIN…':'正在生成山地赛道…','CHECKPOINT':'检查点','GET READY TO FLY':'前方跳台','BRAKE · LEAN · RELEASE':'减速 · 转向 · 出弯',
 'SHAKE IT OFF':'调整一下','BACK ON THE BIKE':'重新上车','HOLD YOUR LINE':'保持方向','ON COURSE':'仍在骑行',
 "'FULL':'REDUCED'":"'完整':'轻量'", "'RAIN':'DAWN'":"'雨天':'晨光'", "'OFF':'ON'":"'关':'开'",
 '>SOUND <':'>声音 <',">ON<":">开<", '>FX <':'>画质 <', '>FULL<':'>完整<','>WEATHER <':'>天气 <','>DAWN<':'>晨光<',
 "'YOU'":"'我'", "' / YOU'":"' / 我'"
}
edit('hud.ts',list(translations.items()))
edit('hud.ts', [('const title=s.phase', "if(document.body.dataset.state!==s.phase)document.body.dataset.state=s.phase;\n    const title=s.phase")])
edit('hud.ts', [('sort((a,b)=>b.s-a.s)', 'sort((a,b)=>a.finished&&b.finished?a.finishTime-b.finishTime:a.finished?-1:b.finished?1:b.s-a.s)')])
edit('hud.ts', [('W / ↑ pedal · A D / ← → steer · S / ↓ brake<br>Space hold to preload, release to hop · Shift boost<br>C manual · 1 tabletop · 2 x-up · 3 superman<br>4 tailwhip · 5 360 · 6 backflip · 7 frontflip', '左手转向，右手踩踏或刹车。<br>按住蓄力、松开跳跃；腾空时点击技巧。<br>冲刺需要能量，落地时尽量保持车身稳定。')])
(ROOT/'content/games/sunbreak/provenance.json').write_text(json.dumps({'source':'https://github.com/Imirushik/sunbreak-downhill-3D-game','archive_sha256':hashlib.sha256((ROOT/'artifacts/sunbreak-main.zip').read_bytes()).hexdigest(),'license':'未声明授权许可；保留原作者来源，仅本地适配，发布前需确认授权','downloaded_on':'2026-10-08'},ensure_ascii=False,indent=2),encoding='utf-8')
from game_localization import sunbreak
sunbreak(build/'src')
from game_performance import sunbreak as optimize_sunbreak
optimize_sunbreak(build/'src')
(build/'vite.config.ts').write_text("export default {base:'/assets/games/sunbreak/',build:{target:'es2022',chunkSizeWarningLimit:1000}};\n",encoding='utf-8')
assets=ROOT/'frontend/assets/games/sunbreak';assets.mkdir(exist_ok=True)
cover=ROOT/'content/games/sunbreak/cover-zh.webp'
ImageOps.fit(Image.open(cover if cover.exists() else source/'media/SUNBREAK-showcase-poster.jpg').convert('RGB'),(600,400)).save(assets/'cover.webp',quality=85)
index=source.joinpath('index.html').read_text(encoding='utf-8').replace('lang="en"','lang="zh-CN"').replace('SUNBREAK — Downhill Club','晴山飞驰 · 福福学堂').replace('<div id="app"></div>','<div id="app"></div><section id="fullscreen-notice" role="status">正在准备全屏入口…</section>').replace('/src/main.ts','/src/fufu-entry.ts')
(build/'index.html').write_text(index,encoding='utf-8')
print('SUNBREAK adaptation prepared')
