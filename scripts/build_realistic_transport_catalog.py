"""Build the reviewed replacement manifest; live rows are migrated separately."""
import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT/'backend/seed_data/transport_exhibits.json'
CACHE = ROOT/'artifacts/transport-sources/realistic'
mapping = json.loads((ROOT/'artifacts/transport-sources/selected.json').read_text())
sources = json.loads((CACHE/'candidates.json').read_text(encoding='utf8'))
backup = ROOT/'artifacts/transport-sources/catalog-before-realistic.json'
if not backup.exists(): shutil.copy2(SEED, backup)
old = {i['slug']:i for i in json.loads(backup.read_text(encoding='utf8'))}
# Labels refer to spatial observation regions, rather than pretending merged
# geometry is an independently animated engineering joint.
specs = {
 'airliner': ('A320 客机','Airbus A320','sky',37.57,11.76,'x',0,[('body','机身区域','长长的机身容纳驾驶舱和客舱。'),('wings','机翼区域','两侧机翼帮助飞机产生升力，翼下还安装着发动机。'),('upper','尾翼上部','尾翼帮助飞机保持方向和姿态。')]),
 'propeller-plane':('S-39 水上飞机','Sikorsky S-39','sky',9.46,3.75,'x',0,[('body','机身与支架','支架把机身和上方的机翼连接起来。'),('upper','机翼与动力区域','螺旋桨推动空气，机翼在前进时产生升力。'),('lower','下部船形机身','船形机身让这种飞机能在水面停泊。')]),
 'helicopter':('Wessex 救援直升机','Westland Wessex','sky',20.4,4.93,'z',0,[('body','机身与尾部','机舱运送人员，细长尾部连接尾旋翼。'),('upper','主旋翼区域','主旋翼转动时可以提供升力。'),('lower','起落架区域','起落架在降落时支撑机身。')]),
 'bullet-train':('TGV 高速列车','TGV power car','rail',22.15,4.1,'z',0,[('body','车身区域','流线形车头能减少高速行驶时的空气阻力。'),('upper','车顶与受电弓','受电弓从接触网取得电能。'),('lower','转向架区域','轮对沿钢轨滚动，转向架还承担支撑和导向的任务。')]),
 'subway':('R33 地铁车厢','NYCT R33 Redbird','rail',15.54,3.6,'z',0,[('body','车厢区域','多组车门方便乘客上下车。'),('upper','车顶区域','观察车顶的轮廓，再比较高速列车的车顶设备。'),('lower','底部结构','车厢下方安装了走行和供电等设备。')]),
 'steam-train':('611 蒸汽机车','Norfolk & Western 611','rail',33.16,4.9,'z',0,[('body','锅炉与车体区域','锅炉把水加热成蒸汽；后方煤水车携带燃料和水。'),('upper','上部结构','找找烟囱和驾驶室，想想司机从哪里观察线路。'),('lower','车轮与连杆区域','蒸汽推动活塞，连杆把运动传给车轮。')]),
 'taxi':('经典出租车','Checker-style taxicab','road',5.3,1.8,'x',3.141592653589793,[('body','车身区域','车门、车窗和座舱方便乘客乘坐。'),('upper','车顶区域','车顶的小标识让乘客容易认出出租车。'),('lower','车轮与底盘','轮胎与地面接触，让汽车前进、转向和制动。')]),
 'fire-engine':('云梯消防车','Aerial ladder fire engine','road',6.5,3.3,'z',0,[('body','车身与器材区域','车身存放救援器材，驾驶室位于车头。'),('upper','云梯区域','云梯可用于高处救援；这里展示它的收拢结构。'),('lower','车轮与底盘','底盘支撑整辆车，车轮负责行驶。')]),
 'sailboat':('古典帆船','Historical sailing vessel','water',24,15,'x',0,[('body','船体与甲板','船体提供浮力，甲板是船员工作的地方。'),('upper','桅杆与帆区域','风吹到船帆上，可以为船提供前进的动力。')]),
 'cargo-ship':('集装箱货船','Container cargo ship','water',85,32,'x',3.141592653589793,[('body','甲板与货物区域','标准尺寸的集装箱便于在船、火车和卡车之间转运。'),('upper','上层建筑区域','驾驶台位于较高位置，方便观察周围水域。'),('lower','船体下部','船体排开水并获得浮力，载货后吃水会加深。')]),
 'rocket':('探索者运载火箭','Explorer Jupiter-C Rocket','space',2.4,21.2,'y',0,[('body','箭体区域','箭体内部容纳推进剂和结构部件。'),('upper','顶部与载荷区域','运载火箭把有效载荷送到高空或轨道。'),('lower','尾部与稳定翼','稳定翼帮助早期火箭稳定飞行，尾部发动机向后喷出高速气体。')]),
}
items=[]
licenses=ROOT/'frontend/assets/transport/licenses';licenses.mkdir(exist_ok=True)
for slug,uid in mapping.items():
 name,english,category,length,height,axis,yaw,regions=specs[slug]
 item=old.get(slug,dict(slug=slug,icon='🚀',tagline='把探索带向更远的天空。',description='这是一枚早期运载火箭的三维模型。和飞机不同，火箭携带燃料和氧化剂，不依靠外界空气中的氧来工作。',principle='火箭向后喷出高速气体，获得向前的推力。'))
 item.update(name=name,english=english,category=category,model_path='/assets/transport/models/v3-'+slug+'.glb',cover_path='/assets/transport/covers/v3-'+slug+'.webp',cover_size=[640,400],lengthAxis=axis,yawFix=yaw,fitLengthM=length,size=dict(lengthM=length,heightM=height,note='结构观察模型；尺寸为展示参考值，不用于工程测量。'))
 if slug=='propeller-plane':item['fitLengthM']=15.85;item['size']['note']='按约15.85米翼展校准；用于结构观察。';item['description']='S-39 是一款早期水陆两用飞机。船形机身、高置机翼和螺旋桨让它的外形与普通客机很不一样。'
 if slug=='helicopter':item['description']='这架 Wessex 模型采用黄色救援涂装。观察上方的主旋翼、机身和尾部，认识直升机的典型结构。'
 if slug=='bullet-train':item['description']='这里展示 TGV 的动力车，流线形车头、车顶受电弓和底部转向架各有自己的作用。';item['tagline']='沿着钢轨，用电力奔向下一站。'
 if slug=='sailboat':item['description']='这是一艘古典帆船的结构模型。高高的桅杆支撑船帆，船体和甲板供船员航行与生活。'
 if slug=='rocket':item['fitHeightM']=21.2
 item['parts']=[dict(label=label,pattern='^observe_'+key+'(?:_|$)',description=text) for key,label,text in regions]
 item['actions']=[dict(label='观察'+label,text=text+' 高亮的是这一结构所在的区域，可拖动模型继续细看。',kind='focus',pattern=part['pattern']) for part,(_,label,text) in zip(item['parts'],regions)]
 item['task']='选一个结构区域，转动模型，找出它在'+name+'上的位置。'
 note='本地版本已做网格合并、贴图压缩、展示比例校准与结构区域划分；封面由本地模型渲染。'
 if slug=='sailboat':note+=' 船体与船帆材质重新着色。'
 if uid in sources:
  source=sources[uid]
  if source['license'] not in ('by','cc0'):raise ValueError('Unsupported source license')
  item['credit']=dict(author=source['user']['displayName'],source=source['viewerUrl'],title=source['name'],license='CC BY 4.0' if source['license']=='by' else 'CC0 1.0',licenseUrl='https://creativecommons.org/licenses/by/4.0/' if source['license']=='by' else 'https://creativecommons.org/publicdomain/zero/1.0/',note=note)
  (licenses/('v3-'+slug+'-source.json')).write_text(json.dumps(source,ensure_ascii=False,indent=2),encoding='utf8')
 elif slug=='airliner':item['credit']=dict(author='amvlab',source='https://github.com/amvlab/aircraft-models',title='A320_nologo.glb',license='CC BY 4.0',licenseUrl='https://creativecommons.org/licenses/by/4.0/',note=note)
 else:item['credit']=dict(author='NASA / Michael D. Carbajal',source='https://science.nasa.gov/3d-resources/explorer-jupiter-c-rocket/',title='Explorer Jupiter-C Rocket',license='NASA 3D Resources (public domain)',licenseUrl='https://www.nasa.gov/nasa-brand-center/images-and-media/',note=note+' NASA来源不代表NASA对本应用的认可。')
 item['credit']['sha256']=hashlib.sha256((CACHE/(uid+'.glb')).read_bytes()).hexdigest()
 items.append(item)
SEED.write_text(json.dumps(items,ensure_ascii=False,indent=2),encoding='utf8')
# Used only by the local review page, never by the production app.
(ROOT/'frontend/assets/transport/catalog-preview.json').write_text(json.dumps(items,ensure_ascii=False),encoding='utf8')
lines=['# 交通工具馆：写实模型来源','',note,'','| 展品 | 作者 | 原作品 | 许可 |','|---|---|---|---|']
for i in items:
 c=i['credit'];lines.append('| {} | {} | [{}]({}) | [{}]({}) |'.format(i['name'],c['author'],c['title'],c['source'],c['license'],c['licenseUrl']))
lines+=['','原始下载文件校验值见 seed 中 credit.sha256。Objaverse 分发路径及完整作者元数据保存在 licenses/v3-*-source.json。','旧版素材保留用于回滚。模型封面是对应修改版本的渲染图，沿用原作品许可与署名。']
(ROOT/'frontend/assets/transport/ATTRIBUTION-REALISTIC.md').write_text('\n'.join(lines),encoding='utf8')
print('Prepared {} reviewed exhibits; database not changed.'.format(len(items)))
