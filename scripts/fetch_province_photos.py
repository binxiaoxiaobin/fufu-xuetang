"""Curate three landmark photographs per provincial region, retaining attribution."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import html, io, json, re, time, urllib.request
import requests
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'frontend/assets/real-tours/provinces'
OUT.mkdir(parents=True, exist_ok=True)
SEED = ROOT / 'backend/seed_data/province_photos.json'
# Article lead photographs give each scene a precise, reviewable subject.
SCENES = {
110000: [('Forbidden City','故宫','看看红墙、金色屋顶和对称的宫殿。'),('Temple of Heaven','天坛','找找圆形屋顶，观察层层向上的轮廓。'),('Badaling','八达岭长城','城墙沿山脊延伸，把一座座烽火台连起来。')],
120000: [('Tianjin Eye','天津之眼','摩天轮横跨桥梁，海河从下面流过。'),('Porcelain House','瓷房子','靠近看建筑外墙上的瓷片装饰。'),('Five Great Avenues','五大道','观察天津历史街区的建筑与街道。')],
130000: [('Chengde Mountain Resort','承德避暑山庄','山庄把宫殿、湖泊和园林放在一起。'),('Shanhai Pass','山海关','看看关楼、城墙和长城的连接。'),('Baiyangdian','白洋淀','水道穿过芦苇荡，湖面像一片水乡。')],
140000: [('Pingyao','平遥古城','城墙和街巷保留着古城的格局。'),('Yungang Grottoes','云冈石窟','观察石壁中雕刻的佛像和洞窟。'),('Pagoda of Fogong Temple','应县木塔','看看木塔层层向外伸出的屋檐。')],
150000: [('Hulunbuir Grassland','呼伦贝尔草原','草原的地平线很远，找找牧场里的牛羊。'),('Xiangshawan','响沙湾','观察沙丘的曲线和风留下的纹路。'),('Dazhao Temple','大召寺','看看呼和浩特的历史建筑。')],
210000: [('Mukden Palace','沈阳故宫','观察清代宫殿的屋顶与院落。'),('Xinghai Square','大连星海广场','城市广场连接着海岸与开阔天空。'),('Benxi Water Cave','本溪水洞','看看流水和石灰岩洞穴的景观。')],
220000: [('Heaven Lake','长白山天池','火山口里的湖泊被高山环抱。'),('Rime','吉林雾凇','观察树枝上白色的冰晶。'),('Museum of the Imperial Palace of Manchukuo','长春伪满皇宫旧址','从建筑和庭院认识长春的一处历史遗址。')],
230000: [('Harbin International Ice and Snow Sculpture Festival','哈尔滨冰雪景观','冰块与灯光组成冬天的城堡。'),('Saint Sophia Cathedral, Harbin','哈尔滨圣索菲亚教堂','找找建筑醒目的穹顶。'),('Mohe City','漠河风光','看看中国北方的城市和自然风景。')],
310000: [('The Bund','上海外滩','黄浦江边排列着许多历史建筑。'),('Oriental Pearl Tower','东方明珠','辨认塔身上大小不同的球体。'),('Yu Garden','豫园','亭台、假山和池水组成江南园林。')],
320000: [('Humble Administrator\'s Garden','苏州拙政园','透过亭廊和窗框寻找园林里的景色。'),('Sun Yat-sen Mausoleum','南京中山陵','建筑沿着山坡中轴线层层展开。'),('Slender West Lake','扬州瘦西湖','看看湖面、桥梁和岸边的园林。')],
330000: [('West Lake','杭州西湖','湖水、堤岸和远山一起组成西湖风景。'),('Wuzhen','乌镇','白墙黛瓦的房屋沿水道排列。'),('Mount Putuo','普陀山','观察海岛上的山林与寺院。')],
340000: [('Huangshan','黄山','找找山峰间的云海和岩石上的松树。'),('Hongcun','宏村','徽派民居倒映在村落的水面上。'),('Xidi','西递','观察白墙黛瓦和古村街巷。')],
350000: [('Fujian tulou','福建土楼','围合的建筑里住着许多家庭。'),('Gulangyu','鼓浪屿','看看海岛上的街道与历史建筑。'),('Wuyi Mountains','武夷山','山峰与河水组成丹霞地貌景观。')],
360000: [('Mount Lu','庐山','观察山地的云雾和起伏。'),('Tengwang Pavilion','滕王阁','高大的楼阁面向赣江。'),('Jingdezhen','景德镇','认识以陶瓷闻名的城市风景。')],
370000: [('Mount Tai','泰山','看看登山石阶、山峰与古建筑。'),('Temple of Confucius, Qufu','曲阜孔庙','古建筑与院落记录着历史。'),('Zhan Qiao','青岛栈桥','长长的栈桥从海岸伸入海中。')],
410000: [('Longmen Grottoes','龙门石窟','山壁上的石窟与佛像面向河流。'),('Shaolin Monastery','少林寺','观察嵩山脚下的寺院建筑。'),('Yinxu','安阳殷墟','认识商代都城留下的遗址。')],
420000: [('Yellow Crane Tower','黄鹤楼','楼阁的屋檐层层展开。'),('Three Gorges Dam','三峡大坝','看看大坝如何横跨长江。'),('Wudang Mountains','武当山','山地与古建筑相互呼应。')],
430000: [('Wulingyuan','张家界武陵源','一根根石英砂岩峰柱从山谷中升起。'),('Yueyang Tower','岳阳楼','观察洞庭湖畔的历史楼阁。'),('Fenghuang County','凤凰古城','沿河的民居与桥梁构成古城景观。')],
440000: [('Canton Tower','广州塔','看看塔身收窄的轮廓。'),('Kaiping Diaolou','开平碉楼','高高的碉楼与村落相连。'),('Window of the World','深圳世界之窗','在微缩建筑中认识不同地方的地标。')],
450000: [('Li River','桂林漓江','山峰倒映在水里，像一幅山水画。'),('Longsheng Rice Terraces','龙脊梯田','梯田沿山坡一层层铺开。'),('Detian Falls','德天瀑布','观察水流怎样越过岩石台阶。')],
460000: [('Yalong Bay','三亚亚龙湾','看看热带海湾、沙滩和海水。'),('Wenchang Space Launch Site','文昌航天发射场','认识靠近海岸的航天设施。'),('Nanshan Temple','三亚南山','海岸与文化建筑形成独特景观。')],
500000: [('Hongya Cave','洪崖洞','层层叠叠的建筑顺着山势展开。'),('Dazu Rock Carvings','大足石刻','观察石壁上丰富的雕刻。'),('Chongqing Rail Transit Line 2','重庆轨道交通','看看轨道如何适应山城的地形。')],
510000: [('Jiuzhaigou','九寨沟','高山湖泊呈现蓝绿相间的颜色。'),('Leshan Giant Buddha','乐山大佛','巨大的石刻佛像临江而坐。'),('Dujiangyan','都江堰','观察河道与古老水利设施的配合。')],
520000: [('Huangguoshu Waterfall','黄果树瀑布','白色水流从宽阔的岩壁落下。'),('Fanjingshan','梵净山','看看山峰上独特的岩石和建筑。'),('Five-hundred-meter Aperture Spherical Telescope','中国天眼 FAST','巨大的接收面像一只山谷里的碗。')],
530000: [('Stone Forest','云南石林','石灰岩柱像一片石头森林。'),('Old Town of Lijiang','丽江古城','街巷、水道与传统建筑连成古城。'),('Erhai Lake','大理洱海','湖水与远处苍山相伴。')],
540000: [('Potala Palace','布达拉宫','红白相间的宫殿顺着山势铺开。'),('Namtso','纳木错','高原湖泊与雪山相映。'),('Jokhang','大昭寺','观察拉萨历史建筑的屋顶与细节。')],
610000: [('Terracotta Army','秦始皇兵马俑','看看陶俑排列成的军阵。'),('Giant Wild Goose Pagoda','大雁塔','辨认方形砖塔层层向上的结构。'),('Fortifications of Xi\'an','西安城墙','宽阔的城墙环绕古城。')],
620000: [('Mogao Caves','敦煌莫高窟','认识崖壁中的石窟建筑。'),('Zhangye National Geopark','张掖丹霞','山坡呈现层层相叠的色带。'),('Jiayu Pass','嘉峪关','关城与远山、荒漠相伴。')],
630000: [('Qinghai Lake','青海湖','辽阔的湖面与高原相连。'),('Chaka Salt Lake','茶卡盐湖','浅水与盐层映出天空的颜色。'),('Kumbum Monastery','塔尔寺','看看青海的历史寺院建筑。')],
640000: [('Shapotou','沙坡头','沙丘、黄河和绿洲在这里相遇。'),('Western Xia mausoleums','西夏陵','土筑陵台留在开阔的地面上。'),('Helan Mountains','贺兰山岩画','观察古人在岩石上留下的图案。')],
650000: [('Kanas Lake','喀纳斯湖','湖水与森林、山地形成丰富层次。'),('Tian Lake','天山天池','雪山下的湖泊被林木环抱。'),('Flaming Mountains','火焰山','红色山体在阳光下格外醒目。')],
710000: [('Sun Moon Lake','日月潭','湖水、山地和岸边建筑相伴。'),('Alishan National Scenic Area','阿里山','认识高山森林和山地景观。'),('Taipei 101','台北 101','看看高楼一节一节向上的轮廓。')],
810000: [('Victoria Harbour','维多利亚港','海湾两岸的高楼形成城市天际线。'),('Tian Tan Buddha','天坛大佛','大佛坐落在大屿山的山林间。'),('Star Ferry','天星小轮','渡轮把维多利亚港两岸连起来。')],
820000: [('Ruins of Saint Paul\'s','大三巴牌坊','观察教堂前壁留下的雕刻。'),('Senado Square','议事亭前地','广场铺地与历史建筑组成街景。'),('A-Ma Temple','妈阁庙','庙宇顺着山坡展开。')],
}

def session():
    s = requests.Session()
    s.trust_env = False
    # Windows Internet Options can incorrectly describe an HTTP tunnel as HTTPS.
    proxy = urllib.request.getproxies().get('https')
    if proxy:
        s.proxies = {'http': proxy.replace('https://', 'http://'), 'https': proxy.replace('https://', 'http://')}
    s.headers['User-Agent'] = 'FufuSchoolResearch/1.0 (educational local web project; contact: fu.school@example.com)'
    return s

def query(s, host, params):
    for attempt in range(3):
        try:
            r = s.get(f'https://{host}/w/api.php', params={'format':'json', **params}, timeout=25)
            r.raise_for_status()
            return r.json()['query']['pages']
        except Exception:
            if attempt == 2: raise
            time.sleep(attempt + 1)

def clean(value):
    return ' '.join(html.unescape(re.sub('<[^>]+>', ' ', value or '')).split())

CURATED_FILES = {
    (220000,2):'File:吉林雾凇 Frosty Pines in Jilin - panoramio.jpg',
    (430000,2):'File:Yueyang Tower, photographed from the side.jpg',
    (640000,3):'File:Helan Mountain’s rock paintings.jpg',
    (820000,2):'File:Senado Square Macao.jpg',
}

def fetch_scene(task):
    code, index, (article, label, caption) = task
    dest = OUT / f'{code}-{index}.jpg'
    previous = json.loads(SEED.read_text(encoding='utf-8')) if SEED.exists() else {}
    old = (previous.get(str(code)) or [None] * 3)[index-1]
    bad_subjects=['Railway Station','Rime-ice-found','Mohe Temple','Shenzhen','1957 map','AlshaaBaruun']
    curated=CURATED_FILES.get((code,index))
    if old and dest.exists() and (not curated or old['originalFile']==curated) and not any(word in old['originalFile'] for word in bad_subjects):
        old['file']=f'/assets/real-tours/provinces/{dest.name}'
        return code,old
    s = session()
    article_pages = query(s, 'en.wikipedia.org', {'action':'query','titles':article,'redirects':1,'prop':'pageimages','piprop':'name','pilicense':'free'})
    page = next(iter(article_pages.values()))
    candidates = []
    if page.get('pageimage'):
        candidates.extend(query(s, 'commons.wikimedia.org', {'action':'query','titles':'File:'+page['pageimage'],'prop':'imageinfo','iiprop':'url|extmetadata|size','iiurlwidth':960}).values())
    forced_queries={(130000,3):'Baiyangdian lake -railway',(220000,2):'Jilin rime -cross',(460000,3):'Nanshan Sanya temple -Shenzhen',(810000,1):'Victoria Harbour panorama -map'}
    if (code,index) in forced_queries:candidates=[]
    if curated:
        candidates=list(query(s,'commons.wikimedia.org',{'action':'query','titles':curated,'prop':'imageinfo','iiprop':'url|extmetadata|size','iiurlwidth':960}).values())
    def search_candidates():
        found=query(s, 'commons.wikimedia.org', {'action':'query','generator':'search','gsrsearch':forced_queries.get((code,index),article)+' -filetype:svg -filetype:pdf','gsrnamespace':6,'gsrlimit':10,'prop':'imageinfo','iiprop':'url|extmetadata|size','iiurlwidth':960})
        return sorted(found.values(),key=lambda p:p.get('index',99))
    # Search only when the precise article photograph cannot be used.
    searched=False
    if not candidates:candidates=search_candidates();searched=True
    candidate_index=0
    while candidate_index<len(candidates):
        candidate=candidates[candidate_index];candidate_index+=1
        if candidate_index==len(candidates) and not searched:
            candidates.extend(search_candidates());searched=True
        info = candidate.get('imageinfo',[{}])[0]
        meta = info.get('extmetadata',{})
        license_name = clean(meta.get('LicenseShortName',{}).get('value'))
        if not any(k in license_name for k in ['CC BY','CC0','Public domain','CC SA']): continue
        if not re.search(r'\.(jpe?g|png|webp)$',candidate['title'],re.I): continue
        if any(word.lower() in candidate['title'].lower() for word in ['map of','locator','coat of','flag of','Railway Station','Rime-ice-found','Mohe Temple','Shenzhen','AlshaaBaruun']):continue
        if info.get('width',0) < 500: continue
        url = info.get('thumburl') or info['url']
        response = s.get(url.split('?')[0],timeout=35)
        if not response.ok:
            for width in [640,1280,1024]:
                alternate=query(s,'commons.wikimedia.org',{'action':'query','titles':candidate['title'],'prop':'imageinfo','iiprop':'url','iiurlwidth':width})
                url=next(iter(alternate.values()))['imageinfo'][0].get('thumburl')
                if url:response=s.get(url.split('?')[0],timeout=35)
                if response.ok:break
        if not response.ok:continue
        image = Image.open(io.BytesIO(response.content)).convert('RGB')
        image.thumbnail((1200,1000))
        image.save(dest,quality=85,optimize=True)
        record = {'label':label,'caption':caption,'file':f'/assets/real-tours/provinces/{dest.name}',
                  'source':info['descriptionurl'],'author':clean(meta.get('Artist',{}).get('value')),
                  'license':license_name,'licenseUrl':clean(meta.get('LicenseUrl',{}).get('value')),
                  'article':article,'originalFile':candidate['title'],'width':image.width,'height':image.height}
        return code,record
    raise RuntimeError(f'{code}/{label}: no usable licensed photograph')

if __name__ == '__main__':
    manifest = {str(code):[None]*3 for code in SCENES}
    tasks = [(code,i,scene) for code,scenes in SCENES.items() for i,scene in enumerate(scenes,1)]
    failed=[]
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(fetch_scene,task):task for task in tasks}
        for future in as_completed(futures):
            task=futures[future]
            try:
                code,record=future.result(); manifest[str(code)][task[1]-1]=record
                print('OK',code,task[1],record['label'],record['license'],flush=True)
            except Exception as error:
                failed.append(task); print('FAIL',task[0],task[1],str(error),flush=True)
    SEED.parent.mkdir(parents=True, exist_ok=True)
    SEED.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    if failed: raise SystemExit(f'{len(failed)} photographs need review')
