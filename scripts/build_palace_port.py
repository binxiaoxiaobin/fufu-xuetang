"""Build the original A Palace for Fools with Chinese text and learner saves."""
import hashlib, json, shutil, sys, xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT/'artifacts/palace/a-palace-for-fools-master'
ADAPT = ROOT/'content/games/palace-for-fools/adaptation'
OUTPUT = ROOT/'frontend/assets/games/palace-for-fools'
ZH = json.loads((ADAPT/'zh.json').read_text(encoding='utf-8'))

def patch(name, old, new):
    path = OUTPUT/name
    text = path.read_text(encoding='utf-8')
    assert old in text, name
    path.write_text(text.replace(old, new), encoding='utf-8')

def build_font():
    sys.path.insert(0, str(ROOT/'artifacts/itch-ports/python-lib'))
    from fontTools import subset
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont
    font = TTFont(str(ROOT/'artifacts/itch-ports/noto-sc.ttf'))
    chars = set(range(32, 256)) | set(map(ord, json.dumps(ZH, ensure_ascii=False)+ '重新开始会覆盖当前进度。确定开始新的冒险吗？旅程结束'))
    options = subset.Options(); options.name_IDs=['*']; options.name_languages=['*']
    sub = subset.Subsetter(options=options); sub.populate(unicodes=chars); sub.subset(font)
    font = instantiateVariableFont(font, {'wght':550}, inplace=True)
    for record in font['name'].names:
        if record.nameID in (1,4,6,16,17):
            record.string=('FufuPalaceChinese' if record.nameID==6 else 'Fufu Palace Chinese').encode(record.getEncoding())
    font.save(str(OUTPUT/'fufu-sc.ttf'))
    shutil.copy2(ROOT/'artifacts/itch-ports/noto-OFL.txt', OUTPUT/'FONT-OFL.txt')

def build():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for folder in ('src','assets','lib','localization'):
        shutil.copytree(SOURCE/folder, OUTPUT/folder, dirs_exist_ok=True)
    xml = ET.parse(SOURCE/'localization/en.xml').getroot()
    xml.set('lang','zh-CN')
    count=0
    for dialogue in xml.findall('dialogue'):
        rows=ZH[dialogue.attrib['id']]; chunks=dialogue.findall('chunk')
        assert len(rows)==len(chunks), dialogue.attrib['id']
        for chunk,text in zip(chunks,rows):
            assert all(len(line.replace('%d','99'))<=18 for line in text.split('\n')), text
            chunk.text='\n'+text+'\n';count+=1
    ET.ElementTree(xml).write(OUTPUT/'localization/zh.xml',encoding='utf-8',xml_declaration=True)
    patch('src/main.js','window.onload = () => {','export function boot() {')
    patch('src/main.js','c.setLocalization("en")','c.setLocalization("zh")')
    patch('src/main.js','{name: "en", src: "localization/en.xml"}','{name: "zh", src: "localization/zh.xml"}')
    patch('src/main.js','    c.run();','    window.FufuPalace.core = c;\n    c.run();')
    for name in ('src/title.js','src/savemanager.js'):
        patch(name,'localStorage.', 'window.FufuPalace.storage.')
    for name in ('src/title.js','src/game.js'):
        for old,new in ZH['menus'].items():
            path=OUTPUT/name;s=path.read_text(encoding='utf-8')
            path.write_text(s.replace(json.dumps(old),json.dumps(new,ensure_ascii=False)),encoding='utf-8')
    # Keep gameplay coordinates/pixels unchanged, render Chinese at twice the resolution.
    patch('src/engine/canvas.js','this.canvas.width = w;','this.canvas.width = w * 2;')
    patch('src/engine/canvas.js','this.canvas.height = h;','this.canvas.height = h * 2;')
    patch('src/engine/canvas.js','this.ctx.imageSmoothingEnabled = false;','this.ctx.imageSmoothingEnabled = false;\n        this.ctx.scale(2, 2);')
    patch('src/engine/canvas.js','document.body.appendChild(cdiv);',"document.querySelector('#stage').appendChild(cdiv);\n        cdiv.style.zIndex='0';\n        this.canvas.style.zIndex='0';\n        this.canvas.tabIndex=0;\n        this.canvas.setAttribute('aria-label','愚者宫殿游戏画面');")
    start='''        let c = this.canvas;
        let x, y;
        let width, height;'''
    patch('src/engine/canvas.js',start,start+"\n        const area=document.querySelector('#stage');w=area.clientWidth;h=area.clientHeight;")
    patch('src/engine/canvas.js','(w / c.width) | 0','(w / this.w) | 0')
    patch('src/engine/canvas.js','(h / c.height) | 0','(h / this.h) | 0')
    patch('src/engine/canvas.js','width = c.width * mul;','if (mul < 1) mul=Math.min(w/this.w,h/this.h);\n        width = this.w * mul;')
    patch('src/engine/canvas.js','height = c.height * mul;','height = this.h * mul;')
    patch('src/engine/canvas.js','''        let cw = font.w / 16;''','''        if (/[\u3400-\u9fff]/u.test(str)) {
            const ctx=this.ctx;ctx.save();ctx.font='550 8px FufuPalaceChinese';ctx.textBaseline='top';ctx.fillStyle='#fff';
            const lines=str.split('\\n');let y=dy+this.tr.y;
            for(const line of lines){let x=dx+this.tr.x-(center?line.length*(8+xoff)/2:0);
                for(const ch of line){if(ch==='@')this.drawBitmapRegion(font,0,32,8,8,x-this.tr.x,y-this.tr.y);
                    else ctx.fillText(ch,Math.round(x),Math.round(y));x+=8+xoff;}
                y+=8+yoff;
            }ctx.restore();return;
        }
        let cw = font.w / 16;''')
    # Pause both simulation and transitions. Drop held keys to avoid movement on resume.
    patch('src/engine/core.js','''        const MAX_REFRESH = 5;''','''        const MAX_REFRESH = 5;
        if(window.FufuPalace.paused){this.oldTime=ts;this.timeSum=0;
            window.requestAnimationFrame(ts=>this.loop(ts));return;}''')
    patch('src/engine/input.js','this.prevent.push(key);','this.prevent[key] = true;')
    patch('src/engine/audio.js','this.enabled = state;','this.enabled = state;\n        window.FufuPalace?.audioChanged?.();')
    patch('src/game.js','''            new MenuButton("返回标题", (ev) => {

                ev.tr.activate''','''            new MenuButton("返回标题", (ev) => {
                window.fufuBeforeClose();
                ev.tr.activate''')
    patch('src/engine/input.js','''        window.addEventListener("mousemove", (e) => {

            window.focus();
        });''','''        // Focus is acquired on click, without stealing focus from the toolbar.''')
    patch('src/ending.js','''        // Draw textbox
        this.textbox.draw(c, true);''','''        if(this.phase>0)c.drawText(c.bitmaps.font,"旅程结束",c.w/2,c.h/2+22,0,0,true);
        // Draw textbox
        this.textbox.draw(c, true);''')
    patch('src/title.js','''                this.menu.disable();
                ev.tr.activate(true, TransitionMode.Empty, 2.0,
                    (ev) => {
                        
                        ev.changeScene("storyintro");
                    });''','''                const begin=()=>{this.menu.disable();ev.tr.activate(true,TransitionMode.Empty,2.0,
                    ev=>ev.changeScene("storyintro"));};
                if(window.FufuPalace.storage.getItem("apff_savedata")!==null){
                    this.textbox.addMessage("重新开始会覆盖当前进度。\\n确定开始新的冒险吗？");
                    this.textbox.activate((ev,yes)=>{if(yes)begin();});
                }else begin();''')
    shutil.copy2(ADAPT/'index.html', OUTPUT/'index.html')
    shutil.copy2(ADAPT/'host.js', OUTPUT/'host.js')
    build_font()
    upstream=ROOT/'content/games/palace-for-fools/upstream';upstream.mkdir(parents=True,exist_ok=True)
    shutil.copy2(ROOT/'artifacts/palace/source.zip',upstream/'a-palace-for-fools.zip')
    license_text='''A Palace for Fools — Jani Nykänen, © 2019
Original game: https://jani-nykanen.itch.io/a-palace-for-fools
Source: https://github.com/jani-nykanen/a-palace-for-fools
The public repository does not declare a redistribution license for game code or assets.
This project keeps the original attribution and provides a local Chinese adaptation.
No additional license is granted for the author's code, artwork or audio.
Complete original source is archived under content/games/palace-for-fools/upstream/.
Howler.js: © 2013-2019 James Simpson and GoldFire Studios; MIT (see lib/howler.core.min.js).
Chinese font: Noto Sans SC, SIL OFL; derivative renamed Fufu Palace Chinese (FONT-OFL.txt).
Changes: Chinese dialogue/menus, high-resolution Chinese text, touch controls, learner-bound saves,
responsive canvas, pause/focus/input handling. Original maps, gameplay, art and audio preserved.
'''
    (OUTPUT/'LICENSE.txt').write_text(license_text,encoding='utf-8')
    report={'translatedChunks':count,'sourceArchiveSHA256':hashlib.sha256((upstream/'a-palace-for-fools.zip').read_bytes()).hexdigest()}
    (ADAPT/'build-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print('Palace built:',count,'Chinese dialogue chunks')

if __name__=='__main__':build()
