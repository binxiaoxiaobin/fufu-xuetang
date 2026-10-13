"""Adapt original Little Spy, Taipo, SokoWorld and open-jigsaw releases."""
import hashlib, json, re, shutil, struct, subprocess, sys
from pathlib import Path
from godot_pck import read_pack, write_pack
from build_itch_ports import config_patch

ROOT=Path(__file__).resolve().parent.parent
ART=ROOT/'artifacts/arcade-next'
ADAPT=ROOT/'content/games/arcade-next'
ZH=json.loads((ADAPT/'zh.json').read_text(encoding='utf-8'))
OUT=ROOT/'frontend/assets/games'

def patch(path,old,new):
    s=path.read_text(encoding='utf-8');assert old in s, str(path)
    path.write_text(s.replace(old,new),encoding='utf-8')

def font():
    sys.path.insert(0,str(ROOT/'artifacts/itch-ports/python-lib'))
    from fontTools import subset
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont
    text=json.dumps(ZH,ensure_ascii=False)+'继续任务重开任务开始新任务会清除当前闯关进度确定吗关已完成请输入英语日语显示罗马音暂停确认'
    for p in (ART/'taipo-web/assets/data').rglob('*'):
        if p.is_file():text+=p.read_text(encoding='utf-8')
    chars=set(range(32,256))|set(range(0x2000,0x2800))|set(range(0x3000,0x3100))|set(map(ord,text))
    f=TTFont(str(ROOT/'artifacts/itch-ports/noto-sc.ttf'))
    options=subset.Options();options.name_IDs=['*'];options.name_languages=['*']
    sub=subset.Subsetter(options=options);sub.populate(unicodes=chars);sub.subset(f)
    f=instantiateVariableFont(f,{'wght':550},inplace=True)
    for n in f['name'].names:
        if n.nameID in (1,4,6,16,17):n.string=('FufuArcadeChinese' if n.nameID==6 else 'Fufu Arcade Chinese').encode(n.getEncoding())
    output=ADAPT/'fufu-sc.ttf';f.save(str(output));return output

def archive(slug,source):
    up=ROOT/'content/games'/slug/'upstream';up.mkdir(parents=True,exist_ok=True)
    shutil.copy2(ART/(source+'.zip'),up/(source+'.zip'))

def little(fontfile):
    output=OUT/'little-spy';output.mkdir(parents=True,exist_ok=True)
    version,files=read_pack(ART/'little-runtime/index.pck')
    for p in (ART/'little-spy-main').rglob('*'):
        if not p.is_file() or p.suffix not in ('.gd','.tscn'):continue
        name='res://'+p.relative_to(ART/'little-spy-main').as_posix()
        if name not in files and name+'.remap' not in files:continue
        s=p.read_text(encoding='utf-8')
        # Match complete literals rather than altering resource paths or identifiers.
        for old,new in ZH['little-spy'].items():
            before=json.dumps(old,ensure_ascii=False);after=json.dumps(new,ensure_ascii=False)
            if p.suffix=='.tscn':
                s=s.replace('text = '+before,'text = '+after)
                s=s.replace('level_name = '+before,'level_name = '+after)
            else:
                s=s.replace(before,after)
        if name=='res://code/MainScreen.gd':
            s=s.replace('func _on_StartGame_button_up():','func _on_StartGame_button_up():\n\tif get_node("/root/FufuBridge").has_progress():\n\t\tget_node("/root/FufuBridge").resume_progress()\n\t\treturn')
        if name=='res://code/autoload/PlayerData.gd':
            # Browser sizing/fullscreen belongs to the containing page.
            s=s.replace('func set_fullscreen():','func set_fullscreen():\n\tif OS.get_name() == "HTML5":\n\t\treturn')
        files[name]=s.encode('utf-8');files.pop(name+'.remap',None)
    files['res://project.binary']=config_patch(files['res://project.binary'])
    files['res://FufuBridge.gd']=(ADAPT/'LittleBridge.gd').read_bytes()
    files['res://fufu-sc.ttf']=fontfile.read_bytes()
    write_pack(output/'index.pck',version,files)
    for ext in ('js','wasm'):shutil.copy2(ART/'little-runtime'/('index.'+ext),output/('index.'+ext))
    shutil.copy2(ADAPT/'little-host.html',output/'index.html')
    html=(output/'index.html').read_text(encoding='utf-8').replace('__SIZES__',json.dumps({f'index.{e}':(output/f'index.{e}').stat().st_size for e in ('wasm','pck')}))
    (output/'index.html').write_text(html,encoding='utf-8')
    archive('little-spy','little-spy')
    shutil.copy2(ART/'little-runtime/index.pck',ROOT/'content/games/little-spy/upstream/original.pck')
    shutil.copy2(ART/'little-spy-main/LICENSE.md',output/'UPSTREAM-LICENSE.txt')
    print('Little Spy original engine',version)

def data_section(blob):
    def leb(pos):
        value=shift=0
        while True:
            byte=blob[pos];pos+=1;value|=(byte&127)<<shift
            if byte<128:return value,pos
            shift+=7
    pos=8
    while pos<len(blob):
        kind=blob[pos];length,start=leb(pos+1);end=start+length
        if kind==11:return start,end
        pos=end
    raise ValueError('WASM data section missing')

def patch_wasm(path,translations,anchor=None):
    blob=bytearray(path.read_bytes());start,end=data_section(blob);report=[]
    for old,new in translations.items():
        before=old.encode();after=new.encode();assert len(after)<=len(before),(old,new)
        candidates=[m.start() for m in re.finditer(re.escape(before),blob[start:end])]
        candidates=[start+n for n in candidates]
        if old=='Settings' and anchor is not None:
            base=blob.index(anchor.encode());candidates=[n for n in candidates if base-200<n<base]
        assert len(candidates)==1,(old,len(candidates))
        n=candidates[0];blob[n:n+len(before)]=after+b' '*(len(before)-len(after))
        report.append({'source':old,'chinese':new,'offset':n,'bytes':len(before)})
    path.write_bytes(blob);return report

def taipo(fontfile):
    output=OUT/'taipo';shutil.copytree(ART/'taipo-web',output,dirs_exist_ok=True)
    # Patch validated fixed-length data literals only; code, addresses and asset paths stay intact.
    translations={k:v for k,v in ZH['taipo'].items() if k not in ('Kana','N5 Kanji','Yamanote Stops','English')}
    translations['data/word_list/kana.jp.txt']='data/word_list/english.txt'
    report=patch_wasm(output/'build/taipo_bg.wasm',translations,'Select Word Lists')
    ron=output/'assets/data/game.ron'
    for key in ('Kana','N5 Kanji','Yamanote Stops','English'):
        patch(ron,'label: '+json.dumps(key),'label: '+json.dumps(ZH['taipo'][key],ensure_ascii=False))
    shutil.copy2(fontfile,output/'assets/fonts/NotoSansJP-Light.otf')
    patch(output/'build/taipo.js','const ret = arg0.localStorage;','const ret = window.FufuMemory;')
    # Freeze the simulation clock together with animation callbacks on pause.
    patch(output/'build/taipo.js','const ret = arg0.now();','const ret = window.FufuRuntime.now();')
    shutil.copy2(ADAPT/'taipo-native.html',output/'native.html')
    shutil.copy2(ADAPT/'native-bridge.js',output/'native-bridge.js')
    shutil.copy2(ADAPT/'native-host.html',output/'index.html')
    patch(output/'index.html','__SLUG__','taipo');patch(output/'index.html','__TITLE__','打字守卫')
    archive('taipo','taipo');shutil.copy2(ART/'taipo-web.zip',ROOT/'content/games/taipo/upstream/original-web.zip')
    shutil.copy2(ART/'taipo-main/LICENSE',output/'UPSTREAM-LICENSE.txt')
    (ADAPT/'taipo-patch-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')

def soko(fontfile):
    source=ART/'sokoworld-main';working=ART/'sokoworld-zh';shutil.copytree(source,working,dirs_exist_ok=True)
    for p in working.rglob('*.lua'):
        if 'meta' in p.parts:continue
        s=p.read_text(encoding='utf-8')
        for old,new in ZH['sokoworld'].items():s=s.replace(json.dumps(old,ensure_ascii=False),json.dumps(new,ensure_ascii=False))
        s=re.sub(r'title = "Level (\d+)"',r'title = "第 \1 关"',s)
        p.write_text(s,encoding='utf-8')
    # Persist active board and undo history alongside the original completion records.
    patch(working/'main.lua','  SwitchScene("main_menu")','''  local session=State.save.session
  local pack=session and Packs[session.pack_key]
  if pack and session.pl and pack.levels[session.level_index] then
    SwitchScene("gameplay",{pack_key=session.pack_key,level_index=session.level_index})
  else
    SwitchScene("main_menu")
  end''')
    patch(working/'scenes/gameplay.lua','''  usagi.clear_menu_items()
  usagi.menu_item''','''  local session=State.save.session
  if session and session.pack_key==pack_key and session.level_index==level_index then
    State.gameplay.pl=session.pl
  end
  usagi.clear_menu_items()
  usagi.menu_item''')
    patch(working/'scenes/gameplay.lua','''  playable_level.update(g.pl, dt)''','''  playable_level.update(g.pl, dt)
  local fingerprint=usagi.to_json({g.pl.steps,g.pl.pushes,g.pl.player.x,g.pl.player.y,g.pl.complete})
  if fingerprint~=g.last_saved then
    State.save.session={pack_key=g.pack_key,level_index=g.level_index,pl=g.pl}
    usagi.save(State.save)
    g.last_saved=fingerprint
  end''')
    # Keep stable IDs even though visible level names are translated.
    exe=ART/'usagi-windows/usagi.exe'
    subprocess.run([str(exe),'font','bake',str(fontfile),'10','--out',str(working/'font.png')],check=True)
    output=OUT/'sokoworld';output.mkdir(parents=True,exist_ok=True)
    subprocess.run([str(exe),'export',str(working),'--target','bundle','-o',str(output/'game.usagi')],check=True)
    for name in ('usagi.js','usagi.wasm','UNLICENSE','THIRD_PARTY_LICENSES.md'):shutil.copy2(ART/'usagi-wasm'/name,output/name)
    patch(output/'usagi.js','localStorage.', 'window.FufuMemory.')
    # Engine settings retain their original wording; game menus and help are Chinese.
    shutil.copy2(ADAPT/'soko-native.html',output/'native.html')
    shutil.copy2(ADAPT/'native-bridge.js',output/'native-bridge.js')
    shutil.copy2(ADAPT/'native-host.html',output/'index.html')
    patch(output/'index.html','__SLUG__','sokoworld');patch(output/'index.html','__TITLE__','推箱子世界')
    archive('sokoworld','sokoworld');shutil.copy2(source/'LICENSE',output/'UPSTREAM-LICENSE.txt')
    count=sum(len(re.findall(r'title = "Level ',p.read_text(encoding='utf-8'))) for p in (source/'packs').glob('*.lua'))
    print('SokoWorld original levels:',count)

def jigsaw():
    from PIL import Image, ImageOps
    source=ART/'open-jigsaw-opendata_ver';output=OUT/'open-jigsaw';output.mkdir(parents=True,exist_ok=True)
    shutil.copytree(source/'assets',output/'assets',dirs_exist_ok=True)
    # The upstream precut tiles include a mixed arrangement. Cut from its full photo.
    image=Image.open(source/'assets/images/find47_3849.jpg').convert('RGB').resize((720,405),Image.Resampling.LANCZOS)
    image.save(output/'reference.webp',quality=92)
    gallery=[dict(id='snow-forest',title='雪中森林',file=str(source/'assets/images/find47_3849.jpg'),source='https://find47.jp/ja/i/NghAs',author='F_Photo / FIND47',license='CC BY 4.0',licenseUrl='https://creativecommons.org/licenses/by/4.0/')]
    provinces=json.loads((ROOT/'backend/seed_data/province_photos.json').read_text(encoding='utf-8'))
    for key in json.loads((ADAPT/'jigsaw-pictures.json').read_text(encoding='utf-8'))['provincePhotos']:
        region,index=key.split('-');row=provinces[region][int(index)-1]
        gallery.append(dict(id=key,title=row['label'],file=str(ROOT/'frontend'/row['file'].lstrip('/')),source=row['source'],author=row['author'],license=row['license'],licenseUrl=row['licenseUrl']))
    for item in gallery:
        im=Image.open(item.pop('file')).convert('RGB')
        ratio=im.height/im.width
        item['pieceHeight']=max(60,min(180,round(144*ratio)))
        folder=output/'assets/images'/item['id'];folder.mkdir(parents=True,exist_ok=True)
        im.resize((720,5*item['pieceHeight']),Image.Resampling.LANCZOS).save(folder/'reference.webp',quality=92)
        ImageOps.fit(im,(240,160),method=Image.Resampling.LANCZOS).save(folder/'thumb.webp',quality=85)
        item['reference']=f"assets/images/{item['id']}/reference.webp";item['thumb']=f"assets/images/{item['id']}/thumb.webp"
        for n in (3,4,5):
            tiles=folder/f'grid{n}';tiles.mkdir(parents=True,exist_ok=True)
            resized=im.resize((n*144,n*item['pieceHeight']),Image.Resampling.LANCZOS)
            for r in range(n):
                for c in range(n):resized.crop((c*144,r*item['pieceHeight'],(c+1)*144,(r+1)*item['pieceHeight'])).save(tiles/f'r{r:02d}_c{c:02d}.webp',quality=90)
    code=source.joinpath('index.html').read_text(encoding='utf-8').split('<script type="module">')[1].split('</script>')[0]
    original=code[code.index('const pictures = ['):code.index('const margin =')]
    code=code.replace(original,'const gallery = '+json.dumps(gallery,ensure_ascii=False)+';\nconst pictures = gallery.flatMap(item=>[3,4,5].map(n=>({...item,name:`assets/images/${item.id}/grid${n}`,rows:n,cols:n,pieceWidth:144,ext:"webp"})));\n')
    code=code.replace('"open-jigsaw: "','""').replace('ピースをドラッグしてパズルを完成させよう！','拖动图块，拼出完整图片。').replace('完成おめでとう！','拼图完成，做得好！').replace('完成まで残り ${remain} 枚！','还剩 ${remain} 块，继续加油！').replace('クリックでゲームを開始します','点击开始拼图').replace('画像が読み込めませんでした（コンソールを見てね）','图片加载失败，请重新打开。')
    code=code.replace('      img,\n      current:', '      img,\n      id:r*pic.cols+c,\n      current:')
    code=code.replace('  const pos = pointerPos(e);','  if(window.FufuPuzzle.paused)return;\n  const pos = pointerPos(e);')
    code=code.replace('  if (state.phase === Phase.initial || state.phase === Phase.completed) {','  if (state.phase === Phase.completed)return;\n  if (state.phase === Phase.initial) {')
    code=code.replace('    x: pos.x - state.difPos.x,','    x:Math.max(0,Math.min(cv.width-p.w,pos.x-state.difPos.x)),').replace('    y: pos.y - state.difPos.y,','    y:Math.max(0,Math.min(cv.height-p.h,pos.y-state.difPos.y)),')
    code=code.replace('  state.draggingIndex = null;\n});','  state.draggingIndex = null;\n  savePuzzle();\n});')
    start=code.index('// ---- init ----');code=code[:start]+(ADAPT/'jigsaw-init.js').read_text(encoding='utf-8')
    (output/'game.js').write_text("import {initialize,learnerStorage,closeGame,report} from './fufu-storage.js';\n"+code,encoding='utf-8')
    shutil.copy2(ADAPT/'jigsaw-host.html',output/'index.html')
    patch(output/'index.html','</head>','<link rel="stylesheet" href="gallery.css?v=20261010-jigsaw-gallery-1"></head>')
    patch(output/'index.html','src="game.js"','src="game.js?v=20261010-jigsaw-gallery-1"')
    shutil.copy2(ADAPT/'jigsaw-gallery.css',output/'gallery.css')
    (output/'PICTURE-CREDITS.json').write_text(json.dumps(gallery,ensure_ascii=False,indent=2),encoding='utf-8')
    credits='Photographs retain their individual CC licenses (separate from the MIT game code).\nChanges: resized, cropped thumbnails, recut puzzle tiles, converted to WebP.\n\n'
    for item in gallery:
        credits+=f"{item['title']}\nAuthor: {item['author']}\nSource: {item['source']}\nLicense: {item['license']} {item['licenseUrl']}\n\n"
    (output/'PICTURE-LICENSES.txt').write_text(credits,encoding='utf-8')
    license_file=output/'LICENSE.txt'
    if license_file.exists() and 'PICTURE-LICENSES.txt' not in license_file.read_text(encoding='utf-8'):
        with license_file.open('a',encoding='utf-8') as f:f.write('All puzzle photographs: individual CC licenses and authors in PICTURE-LICENSES.txt and PICTURE-CREDITS.json.\n')
    print('Jigsaw pictures:',len(gallery))
    shutil.copy2(source/'LICENSE',output/'UPSTREAM-LICENSE.txt');archive('open-jigsaw','open-jigsaw')

def main():
    fontfile=font();little(fontfile);taipo(fontfile);soko(fontfile);jigsaw()
    for slug,title,source in [('little-spy','Little Spy','wimpysworld/little-spy'),('taipo','Taipo','rparrett/taipo'),('sokoworld','SokoWorld','brettchalupa/sokoworld'),('open-jigsaw','open-jigsaw','code4fukui/open-jigsaw')]:
        folder=OUT/slug
        shutil.copy2(ROOT/'artifacts/itch-ports/noto-OFL.txt',folder/'FONT-OFL.txt')
        text=f'{title}\nOriginal source: https://github.com/{source}\nOriginal license: UPSTREAM-LICENSE.txt\nOriginal source archived in content/games/{slug}/upstream/.\nChinese local adaptation: interface/help, learner storage, pause and touch controls.\nNoto Sans SC derivative: Fufu Arcade Chinese, SIL OFL (FONT-OFL.txt).\n'
        if slug=='sokoworld':text+='Art: Chrysalis (CC-BY 4.0), Brett Chalupa. Sound: Melos Han-Tani (non-commercial). Levels: original per-pack licenses preserved in source. Usagi runtime: UNLICENSE and THIRD_PARTY_LICENSES.md.\n'
        if slug=='taipo':text+='Temporary BrowserQuest sprites: CC-BY-SA 3.0, Mozilla/BrowserQuest. Japanese/English exercise prompts retain original wording.\n'
        if slug=='open-jigsaw':text+='Photo: FIND47, Fukui Zen by F_Photo, https://find47.jp/ja/i/NghAs. CC-BY 4.0 https://creativecommons.org/licenses/by/4.0/. Adaptation: resized, recut and converted to WebP. Original photo credit remains visible.\n'
        if slug=='open-jigsaw':text+='All puzzle photographs: individual CC licenses and authors in PICTURE-LICENSES.txt and PICTURE-CREDITS.json.\n'
        (folder/'LICENSE.txt').write_text(text,encoding='utf-8')
    print('Four original games built')

if __name__=='__main__':main()
