"""Build audited lessons from model-supported parts, retaining licensed media."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
manifest = ROOT / 'backend/seed_data/transport_exhibits.json'
items = json.loads(manifest.read_text(encoding='utf-8'))
def part(label, pattern, text):
    return dict(label=label, pattern=pattern, description=text)
def action(label, motion, kind, text, **kwargs):
    return dict(label=label, motion=motion, kind=kind, text=text, **kwargs)
for item in items:
    slug = item['slug']
    if slug == 'airliner':
        item['parts'] = [part('襟翼与副翼','flap|aileron','它们位于机翼后缘。襟翼改变机翼形状，副翼左右配合帮助飞机滚转。'),
            part('方向舵与升降舵','rudder|elevator','方向舵竖着，升降舵横着。比较它们的位置和运动方向。'),
            part('起落架','gear|bay','轮子、支柱与轮舱门配合；观察向上收起的方向和轮舱门的开合。'),
            part('登机舱门','door-front|door-rear','两处登机门连接客舱；本展品能独立定位这些舱门。')]
        item['actions'] = [action('看襟翼放下','flaps','clip','盯住机翼后缘：襟翼放下后，机翼形状发生变化。模型保持在变化后的姿态，方便比较。',clips=['flap-tilt']),
            action('起落架收起过程','gear','clip','依次观察：轮舱门打开 → 起落架向上收起 → 轮舱门关闭。教具简化了收放轨迹，可以暂停或拖动进度细看。',clips=['bay-open','gear-open','bay-close'],sequence=True),
            action('看方向舵转动','rudder','clip','看竖直尾翼后缘的方向舵改变角度。它帮助控制偏航，这里只观察舵面，不让整架飞机乱晃。',clips=['rudder-steer'])]
    elif slug == 'propeller-plane':
        item['parts'] = [part('螺旋桨','^prop(?:_1)?$','螺旋桨在机头，沿自己的轴旋转，与空气相互作用产生推力。'),
            part('襟翼与副翼','flap|aileron','位于机翼后缘，可以和固定翼面作比较。'),
            part('尾部操纵面','rudder|elevator','横向和竖向的操纵面承担不同的姿态控制任务。'),
            part('固定起落架','wheel-main|wheel-nose','这架飞机的轮子不会收起。前轮和左右主轮共同支撑飞机。'),
            part('发动机罩','cowl-top','发动机位于机头罩内；机头罩是可独立观察的部件。')]
        item['actions'] = [action('螺旋桨慢转','propeller','clip','看螺旋桨绕机头轴线转动。机身保持不动，展示转轴方向；演示速度经过放慢。',clips=['prop-spin'],repeats=4),
            action('看襟翼放下','flaps','clip','从后缘观察襟翼相对机翼的角度改变。',clips=['flap-tilt']),
            action('看升降舵变化','elevator','clip','盯住尾部横向操纵面的角度变化，它帮助控制俯仰。',clips=['elevator-tilt'])]
    elif slug == 'helicopter':
        item['parts'] = [part('主旋翼','rotor-main','主旋翼位于机顶，是直升机产生升力的主要部件。'),
            part('尾旋翼','rotor-tail','尾旋翼位于尾端，帮助抵消机身受到的反扭矩并控制机头方向。'),
            part('座舱门与滑门','door-|slide-','前部座舱门与后部滑门采用不同的开合方式。'),
            part('滑橇起落架','^light-turbine-helicopter_11$','低处的两条滑橇支撑机身；它们不是车轮。')]
        item['actions'] = [action('只看主旋翼','main','clip','观察机顶的大旋翼绕竖直轴旋转，尾旋翼暂时保持静止，方便辨认。',clips=['rotor-spin'],repeats=4),
            action('只看尾旋翼','tail','clip','观察尾端的小旋翼绕横向轴旋转，注意它与主旋翼的转轴方向不同。',clips=['tail-rotor-spin'],repeats=4),
            action('看双旋翼配合','both','clip','主旋翼与尾旋翼一起转动。前两个按钮用于分开观察，这一步再看它们怎样配合。',clips=['rotor-spin','tail-rotor-spin'],repeats=4)]
    elif item['category'] == 'rail':
        body = '^train-(?:electric-bullet-a|electric-subway-a|locomotive-a)(?:_1)?$'
        item['parts'] = [part('车体',body,'车体承载乘客或设备，底部的车轮与转向架负责支撑。'),
            part('转向架与车轮','^wheels?(?:-|$)','观察车体下方的支撑结构。合并在转向架里的轮子不能独立滚动，展台保留结构观察。')]
        item['actions'] = [action('近看转向架','bogie','focus','镜头移到车体下方，对比前后两组支撑结构。车体保持静止，方便观察。',pattern='^wheels?(?:-|$)'),
            action('回看车体','body','focus','镜头回到车体，比较车体与下方支撑结构的大小。',pattern=body)]
        if slug == 'steam-train':
            item['actions'].insert(0,action('慢看驱动轮','wheels','wheels','较大的独立驱动轮绕车轴转动。黄色观察点帮助看清方向；前部合并转向架保持静止。',pattern='^wheel$',duration=5))
    elif item['category'] == 'road':
        item['actions'] = [action('慢看车轮转动','wheels','wheels','轮子沿车轴转动，黄色观察点让转动看得更清楚。车辆保持静止，用来观察轮轴。',pattern='^wheel-',duration=5),
            action('近看前轮','front','focus','比较左右前轮与车身的位置。恢复姿态可以回到完整车辆。',pattern='wheel-front')]
    elif slug == 'sailboat':
        item['parts'] = [part('船帆','^sail$','帆沿桅杆方向调整角度，实际航行还需要配合风向与航向。'),
            part('船体与桅杆','^boat-sail-a(?:_1)?$','船体支撑桅杆与帆；这部分在素材中合并展示。')]
        item['actions'] = [action('调整船帆角度','trim','trim','观察帆相对船体转过约 25°。这是调帆结构演示，不是无目的地晃动整条船。',pattern='^sail$',degrees=25),
            action('观察船体支撑','hull','focus','看船体与桅杆的连接位置，再对比帆的尺寸。',pattern='^boat-sail-a(?:_1)?$')]
    elif slug == 'cargo-ship':
        item['parts'] = [part('船体与上层建筑','^ship-cargo-a(?:_1)?$','船体承担浮力，上层建筑中有航行和生活空间。'),
            part('甲板上的货箱','^cargo-','货箱分成三组放在甲板上，方便装卸和组织货物。')]
        item['actions'] = [action('分层观察货箱','separate','separate','把三组货箱轻轻抬起，露出下面的甲板。分层观察用于认识结构，实际装卸需要港口起重机。',pattern='^cargo-',lift=1.2),
            action('近看船体','hull','focus','货箱恢复原位，再观察船体和上层建筑。',pattern='^ship-cargo-a(?:_1)?$')]
views = {'airliner': {'flaps':'flap','gear':'gear|bay','rudder':'rudder'},
    'propeller-plane': {'propeller':'^prop(?:_1)?$','flaps':'flap','elevator':'elevator'},
    'helicopter': {'main':'rotor-main','tail':'rotor-tail'},
    'steam-train': {'wheels':'^wheel$'}, 'taxi': {'wheels':'^wheel-'},
    'fire-engine': {'wheels':'^wheel-'}, 'sailboat': {'trim':'^sail$'},
    'cargo-ship': {'separate':'^cargo-'}}
tasks = {'airliner':'比较襟翼与副翼的位置，再看看起落架怎样收进轮舱。',
    'propeller-plane':'比较机头螺旋桨的转轴与尾部升降舵的转轴。',
    'helicopter':'分开观察主旋翼与尾旋翼，它们的转轴方向一样吗？',
    'bullet-train':'找找前后两组转向架，比较车体与车轮的大小。',
    'subway':'观察车体下方的转向架，它们怎样支撑车体？',
    'steam-train':'找找较大的驱动轮，比较它们与前部小轮的大小。',
    'taxi':'比较左右前轮的位置，看看车轮围绕什么轴转动。',
    'fire-engine':'找出四个车轮，再看看车身上运载了哪些设备。',
    'sailboat':'调整帆的角度，对比船帆与桅杆的位置。',
    'cargo-ship':'抬起货箱后，看看甲板与货箱怎样安排。'}
for item in items:
    item['task']=tasks[item['slug']]
    for demo in item['actions']:
        pattern=views.get(item['slug'],{}).get(demo['motion'])
        if pattern:demo['viewPattern']=pattern
        if demo['kind']=='clip' and demo['motion'] in ('flaps','elevator','rudder'):
            demo['segmentEnd']=.25
            demo['duration']=3
        demo['text']=demo['text'].replace('这里只观察舵面，不让整架飞机乱晃','镜头靠近舵面，方便观察它的转轴和角度').replace('这是调帆结构演示，不是无目的地晃动整条船','镜头靠近船帆，方便比较调帆前后的角度')
manifest.write_text(json.dumps(items,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Updated lessons:',len(items),'parts:',sum(len(i['parts']) for i in items),'demonstrations:',sum(len(i['actions']) for i in items))
