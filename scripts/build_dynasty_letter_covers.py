# -*- coding: utf-8 -*-
"""Readable letter covers: actual font outlines, never invented pseudo-writing."""
import json,html
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
ROOT=Path(__file__).resolve().parents[1]
FONT_DIR=ROOT/'tools/history-typefaces'
fonts={
 'seal':TTFont(str(FONT_DIR/'LXGWSeal-Regular.ttf')),
 'li':TTFont('C:/Windows/Fonts/simli.ttf'),
 'kai':TTFont('C:/Windows/Fonts/simkai.ttf'),
 'xing':TTFont(str(FONT_DIR/'ZhiMangXing-Regular.ttf')),
 'print':TTFont('C:/Windows/Fonts/simsun.ttc',fontNumber=0)
}
specs={
 'xia':('夏','kai','现代楷书题名','夏代尚无可据以复原的完整文字体系，封面用现代楷书写名称，不称作夏代字体。'),
 'shang':('商','seal','篆书题名','商代的代表文字是甲骨文。封面暂以现代小篆字体写朝代名称，不作为商代甲骨字形展示。'),
 'western-zhou':('周','seal','篆书题名','西周以青铜铭文为重要文字资料。封面用现代小篆字体题写周字，不作为西周金文原迹。'),
 'eastern-zhou':('周','seal','篆书风格参考','东周各国文字并不完全相同；封面选取篆书风格题名，不把一种字形当作所有诸侯共同标准。'),
 'qin':('秦','seal','小篆风格','以《说文》小篆为依归的现代字体演绎，用于认识小篆风格，不称为秦代某件原刻的复原。'),
 'western-han':('漢','li','隶书风格','两汉隶书是重要书写传统，封面使用现代隶书字体演绎，漢对应今天的汉。'),
 'xin':('新','li','隶书风格','参考秦汉间的隶书传统，采用现代字体题名，不意味着新朝只有一种书体。'),
 'eastern-han':('漢','li','隶书风格','东汉碑刻是汉隶的重要资料；这里用现代隶书字体题名，漢对应今天的汉。'),
 'three-kingdoms':('魏蜀吳','li','隶书风格 · 并存时期','魏、蜀、吴并列呈现。书体承接汉末传统，使用现代隶书字体参考，不代表三国书体完全相同。'),
 'western-jin':('晉','kai','楷书风格参考','魏晋之际隶、楷、行、草等书体并存；封面选取较易读的现代楷书，晉对应今天的晋。'),
 'eastern-jin-sixteen':('晋','xing','行书风格参考','东晋有著名行书传统。封面用现代行书字体题名，不是王羲之原笔，也不代替十六国各自的文字面貌。'),
 'southern-northern':('南北','kai','楷书风格 · 并存时期','南北朝有碑刻、写经等不同书写传统，封面以现代楷书写南北，保留完整时期名称。'),
 'sui':('隋','kai','楷书风格参考','参考隋代楷书传统，使用现代楷体题名，不复原某一件碑刻。'),
 'tang':('唐','kai','楷书风格参考','唐代楷书成就突出，也存在其他书体。封面用现代楷体呈现唐字，不署为某位书家的原作。'),
 'five-ten':('五代','xing','行书风格 · 多政权时期','五代十国书写传统延续隋唐，封面用现代行书题名，保留完整时期名称。'),
 'song-liao-xia-jin':('宋辽夏金','xing','汉字题名 · 并存时期','使用现代汉字并列题名，夏在这里指西夏。辽、西夏、金还使用不同文字，不把汉字字体说成其唯一文字。'),
 'yuan':('元','xing','行书风格参考','元代延续多种汉字书法传统，也使用其他文字。封面采用现代行书题名。'),
 'ming':('明','print','刻本风格参考','明代雕版印刷字形是重要视觉线索，封面参考刻本风格，使用现代宋体；不把现代宋体误作宋代原字体。'),
 'qing':('清','kai','楷书风格参考','清代楷、行、篆、隶等传统均有发展，封面选取易读的现代楷体，不设所谓清代专属字体。')
}
def glyphs(text,font,cx,cy,width,height,color):
    gs=font.getGlyphSet();cmap=font.getBestCmap();parts=[];n=len(text)
    for i,char in enumerate(text):
        if char.isspace():continue
        name=cmap.get(ord(char));assert name and name!='.notdef',(char,name)
        g=gs[name];pen=BoundsPen(gs);g.draw(pen);assert pen.bounds
        x0,y0,x1,y1=pen.bounds
        if x1==x0 or y1==y0:continue
        target_height=height*.15 if char in '·、，' else height
        scale=min(width/n*.87/(x1-x0),target_height/(y1-y0))
        center=cx-width/2+width/n*(i+.5);tx=center-scale*(x0+x1)/2;ty=cy+scale*(y0+y1)/2
        p=SVGPathPen(gs);g.draw(p)
        parts.append('<path fill="%s" transform="translate(%.3f %.3f) scale(%.5f %.5f)" d="%s"/>'%(color,tx,ty,scale,-scale,p.getCommands()))
    return ''.join(parts)

catalog=json.loads((ROOT/'content/learning/history-cards.json').read_text(encoding='utf-8'))
out=ROOT/'frontend/assets/learning/history/letters';out.mkdir(parents=True,exist_ok=True)
manifest=[]
palette=['#5e7160','#8c6352','#627668','#827356','#715d48','#4c695a','#617187']
for i,p in enumerate(catalog['periods']):
    text,family,label,note=specs[p['slug']];color=palette[i%len(palette)]
    main=glyphs(text,fonts[family],360,232,410,245,color)
    if len(text)==4:
        main=glyphs(text[:2],fonts[family],360,166,300,115,color)+glyphs(text[2:],fonts[family],360,296,300,115,color)
    title=p['title'].replace(' · ',' · ')
    readable=glyphs(title,fonts['print'],360,402,min(610,len(title)*40),32,'#354f46')
    sub=glyphs(label,fonts['print'],360,55,min(570,len(label)*22),18,'#887858')
    svg='<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480" viewBox="0 0 720 480"><title>%s：文字封面</title><desc>%s</desc><rect width="720" height="480" fill="#f8f3e8"/><rect x="24" y="24" width="672" height="432" rx="8" fill="none" stroke="#d9cdb6"/><path d="M62 84H658M170 369H550" stroke="#ded3bb"/>'+sub+main+readable+'</svg>'
    svg=svg%(html.escape(p['title']),html.escape(note))
    (out/(p['slug']+'-letter-v1.svg')).write_text(svg,encoding='utf-8')
    manifest.append(dict(slug=p['slug'],title=p['title'],image_path='/assets/learning/history/letters/'+p['slug']+'-letter-v1.svg',cover_script=label,cover_note=note,cover_characters=text))
(ROOT/'content/learning/dynasty-letter-covers.json').write_text(json.dumps({'items':manifest},ensure_ascii=False,indent=2),encoding='utf-8')
print('19 readable letter covers generated from checked font glyphs')
