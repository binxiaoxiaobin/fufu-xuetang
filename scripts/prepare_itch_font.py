"""Build a readable static Chinese game font from OFL Noto Sans SC."""
import hashlib,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
ADAPT=ROOT/'content/games/itch-ports';ART=ROOT/'artifacts/itch-ports'
def prepare_font():
    dictionaries=[(ADAPT/name).read_bytes() for name in ('zh.json',)]
    digest=hashlib.sha256(b''.join(dictionaries)+b'wght=550;latin-symbols-v1').hexdigest()
    output=ADAPT/'fufu-sc.ttf';stamp=ADAPT/'font-build.sha256'
    if output.exists() and stamp.exists() and stamp.read_text()==digest:return output
    sys.path.insert(0,str(ART/'python-lib'))
    from fontTools import subset
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont
    font=TTFont(str(ART/'noto-sc.ttf'))
    chars=set(range(0x20,0x250))|set(range(0x2000,0x2800))|set(range(0x3000,0x3040))
    for raw in dictionaries:
        for key,value in json.loads(raw.decode('utf-8')).items():chars.update(map(ord,key+value))
    options=subset.Options();options.name_IDs=['*'];options.name_legacy=True;options.name_languages=['*']
    sub=subset.Subsetter(options=options);sub.populate(unicodes=chars);sub.subset(font)
    font=instantiateVariableFont(font,{'wght':550},inplace=True)
    for record in font['name'].names:
        if record.nameID in (1,4,6,16,17):
            name='FufuGameChinese' if record.nameID==6 else 'Fufu Game Chinese'
            record.string=name.encode(record.getEncoding())
    font.save(str(output));stamp.write_text(digest)
    print('Static Chinese font:',output.stat().st_size,'bytes')
    return output
if __name__=='__main__':prepare_font()
