"""Reproducible adaptation of the authors' Godot web exports; no game recreation."""
import json, re, shutil, struct, sys
from pathlib import Path
from godot_pck import read_pack, write_pack
from prepare_itch_font import prepare_font

ROOT=Path(__file__).resolve().parent.parent
ART=ROOT/'artifacts/itch-ports'
ADAPT=ROOT/'content/games/itch-ports'
ZH=json.loads((ADAPT/'zh.json').read_text(encoding='utf-8'))

def config_patch(blob):
    count,=struct.unpack_from('<I',blob,4);pos=8;rows=[]
    for _ in range(count):
        start=pos;n,=struct.unpack_from('<I',blob,pos);pos+=4
        key=blob[pos:pos+n].decode();pos+=n
        n,=struct.unpack_from('<I',blob,pos);pos+=4+n
        rows.append((key,blob[start:pos]))
    assert pos==len(blob)
    key=b'autoload/FufuBridge';value=b'*res://FufuBridge.gd'
    variant=struct.pack('<II',4,len(value))+value+b'\0'*((-len(value))%4)
    record=struct.pack('<I',len(key))+key+struct.pack('<I',len(variant))+variant
    # The restoring bridge enters the tree before the native settings autoload.
    first=next((i for i,(key,_) in enumerate(rows) if key.startswith('autoload/')),len(rows))
    records=[row for _,row in rows];records.insert(first,record)
    return b'ECFG'+struct.pack('<I',count+1)+b''.join(records)

def build(slug,source,export,prefix,title):
    output=ROOT/'frontend/assets/games'/slug;output.mkdir(parents=True,exist_ok=True)
    version,files=read_pack(ART/export/(prefix+'.pck'))
    changed=0
    for scene in (ART/source).rglob('*.tscn'):
        path='res://'+scene.relative_to(ART/source).as_posix()
        if path not in files and path+'.remap' not in files:continue
        text=scene.read_text(encoding='utf-8')
        def tr(match):
            old=match.group(1);value=ZH.get(old,old)
            return 'text = "'+value.replace('"','\\"')+'"'
        translated=re.sub(r'^text = "((?:[^"\\]|\\.)*)"',tr,text,flags=re.M)
        if translated!=text:
            files[path]=translated.encode('utf-8');files.pop(path+'.remap',None);changed+=1
    files['res://project.binary']=config_patch(files['res://project.binary'])
    files['res://FufuBridge.gd']=(ADAPT/'FufuBridge.gd').read_bytes()
    files['res://fufu-zh.json']=(ADAPT/'zh.json').read_bytes()
    files['res://fufu-sc.ttf']=prepare_font().read_bytes()
    write_pack(output/(prefix+'.pck'),version,files)
    for ext in ('js','wasm'):
        shutil.copy2(ART/export/(prefix+'.'+ext),output/(prefix+'.'+ext))
    shutil.copy2(ADAPT/'godot-host.html',output/'index.html')
    html=(output/'index.html').read_text(encoding='utf-8').replace('__TITLE__',title).replace('__SLUG__',slug).replace('__PREFIX__',prefix)
    sizes={prefix+'.'+ext:(output/(prefix+'.'+ext)).stat().st_size for ext in ('wasm','pck')}
    html=html.replace('__SIZES__',json.dumps(sizes))
    (output/'index.html').write_text(html,encoding='utf-8')
    shutil.copy2(ART/'noto-OFL.txt',output/'FONT-OFL.txt')
    print(slug,'translated scenes',changed,'pack',sizes[prefix+'.pck'])

if __name__=='__main__':
    build('starcatcher','starcatcher-jam-master','star-web','index','追星小旅人')
