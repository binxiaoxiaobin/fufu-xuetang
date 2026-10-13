"""Import selected CC0 transport models; keep source licences and embed Kenney textures."""
import io
import json
import re
import struct
import urllib.request
import zipfile
from pathlib import Path

import requests
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'artifacts/transport-sources'
OUT = ROOT / 'frontend/assets/transport'
SEED = ROOT / 'backend/seed_data/transport_exhibits.json'
CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/'


def embed_images(blob, archive):
    length = struct.unpack_from('<I', blob, 12)[0]
    doc = json.loads(blob[20:20 + length])
    offset = 20 + length
    bin_size = struct.unpack_from('<I', blob, offset)[0]
    binary = bytearray(blob[offset + 8:offset + 8 + bin_size])
    for image in doc.get('images', []):
        if 'uri' not in image:
            continue
        payload = archive.read('Models/GLB format/' + image.pop('uri'))
        binary.extend(b'\0' * (-len(binary) % 4))
        image['bufferView'] = len(doc.setdefault('bufferViews', []))
        image['mimeType'] = 'image/png'
        doc['bufferViews'].append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(payload)})
        binary.extend(payload)
    doc['buffers'][0]['byteLength'] = len(binary)
    encoded = json.dumps(doc, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    binary.extend(b'\0' * (-len(binary) % 4))
    return (struct.pack('<4sII', b'glTF', 2, 28 + len(encoded) + len(binary))
            + struct.pack('<I4s', len(encoded), b'JSON') + encoded
            + struct.pack('<I4s', len(binary), b'BIN\0') + binary)


def part(label, pattern, description):
    return {'label': label, 'pattern': pattern, 'description': description}


def action(label, text, motion, kind='clip', clips=None):
    return {'label': label, 'text': text, 'motion': motion, 'kind': kind, 'clips': clips or []}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'models').mkdir(exist_ok=True)
    (OUT / 'covers').mkdir(exist_ok=True)
    (OUT / 'licenses').mkdir(exist_ok=True)
    s = requests.Session()
    s.trust_env = False
    proxy = urllib.request.getproxies().get('https')
    if proxy:
        s.proxies = {'http': proxy.replace('https://', 'http://'), 'https': proxy.replace('https://', 'http://')}
    s.headers['User-Agent'] = 'FufuSchool/1.0'
    manifest = json.loads((CACHE / 'aircraft-manifest.json').read_text(encoding='utf-8'))['data']
    aircraft = {a['id']: a for a in manifest['assets']}
    records = []

    def add(slug, name, english, category, icon, tagline, description, principle, task, length, height, parts, actions,
            aircraft_id=None, pack=None, filename=None):
        model = OUT / 'models' / (slug + '.glb')
        if aircraft_id:
            source = aircraft[aircraft_id]
            if not model.exists():
                r = s.get(source['cdnUrl'], timeout=60); r.raise_for_status(); model.write_bytes(r.content)
            cover = OUT / 'covers' / (slug + '.webp')
            if not cover.exists():
                r = s.get(source['thumbnailUrl'], timeout=30); r.raise_for_status(); cover.write_bytes(r.content)
            author, url, title = '3D Assets', source['url'], source['title']
            source_note = '3DAssets 通用交通模型（来源标注 AI 辅助制作）；保留原始分件和动画。'
            (OUT / 'licenses' / (slug + '-source.json')).write_text(json.dumps(source, ensure_ascii=False, indent=2), encoding='utf-8')
        else:
            archive = zipfile.ZipFile(CACHE / (pack + '.zip'))
            model.write_bytes(embed_images(archive.read('Models/GLB format/' + filename + '.glb'), archive))
            cover = OUT / 'covers' / (slug + '.png')
            cover.write_bytes(archive.read('Previews/' + filename + '.png'))
            (OUT / 'licenses' / (pack + '-License.txt')).write_bytes(archive.read('License.txt'))
            author, url, title = 'Kenney', 'https://kenney.nl/assets/' + pack, filename
            source_note = 'Kenney 低多边形交通模型；已将配套纹理嵌入 GLB，展示比例经过调整。'
        with Image.open(cover) as image:
            cover_size = [image.width, image.height]
        record = {'slug': slug, 'name': name, 'english': english, 'category': category, 'icon': icon,
                  'tagline': tagline, 'description': description, 'principle': principle, 'task': task,
                  'size': {'lengthM': length, 'heightM': height, 'note': '通用教学模型，不对应某一厂商型号；尺寸用于展台比例比较。'},
                  'parts': parts, 'actions': actions, 'model_path': '/assets/transport/models/' + model.name,
                  'cover_path': '/assets/transport/covers/' + cover.name, 'cover_size': cover_size,
                  'credit': {'author': author, 'source': url, 'title': title, 'license': 'CC0 1.0', 'licenseUrl': CC0, 'note': source_note}}
        if slug == 'propeller-plane':
            record['fitLengthM'] = 11.16
        records.append(record)
        print('Prepared', slug, model.stat().st_size, flush=True)

    plane_parts = [part('机身与客舱', 'fuselage|cabin', '机身容纳驾驶舱、乘客和行李，把机翼、尾翼连接起来。'),
                   part('机翼与襟翼', 'wing|flap|aileron', '机翼是产生升力的主要结构；襟翼能改变机翼的形状，副翼帮助飞机滚转。'),
                   part('尾翼与方向舵', 'rudder|fin|elevator|tail', '尾翼帮助保持稳定。方向舵主要控制偏航，升降舵帮助控制俯仰。'),
                   part('起落架', 'gear|wheel|bay', '起落架承担地面滑行和着陆时的重量，一些飞机起飞后可将它收起。')]
    add('airliner', '喷气客机', 'Jet airliner', 'sky', '✈️', '长长的机翼，把旅程带向天空',
        '这是一架双发动机喷气客机的通用模型。两台涡扇发动机提供向前的推力，飞机向前运动时，机翼与气流相互作用产生升力。机身里的客舱用来运送乘客。',
        '发动机提供推力，机翼在运动的气流中产生升力；两者分工合作。', '找一找两台发动机，再比较机翼与尾翼的大小。', 39.39, 10.12,
        plane_parts + [part('涡扇发动机', 'engine|nacelle|fan', '发动机把气流向后加速，产生向前的推力；短舱包住发动机。')],
        [action('展开襟翼', '观察机翼后缘的襟翼改变角度。这里只演示部件动作，不是起飞仿真。', 'flaps', clips=['flap-tilt']),
         action('收起起落架', '观察起落架向轮舱收回；点击恢复姿态可把它放回。', 'gear', clips=['gear-close']),
         action('方向舵摆动', '找找尾部方向舵的左右摆动。', 'rudder', clips=['rudder-steer'])], aircraft_id='32591')
    add('propeller-plane', '螺旋桨飞机', 'Propeller plane', 'sky', '🛩️', '转动的螺旋桨，拉着飞机向前走',
        '螺旋桨飞机用旋转的桨叶把空气向后推，获得向前的推力。这架模型的机翼位于机身上方，两侧支撑杆把机翼与机身连接起来。',
        '螺旋桨像旋转的机翼，改变气流的运动方向，从而产生推力。', '观察桨叶转动，再找机翼下方的支撑杆。', 9.35, 2.57,
        plane_parts + [part('螺旋桨', '^prop|propeller|spinner', '桨叶旋转推动空气，桨帽位于螺旋桨中央。')],
        [action('螺旋桨转动', '观察机头的桨叶旋转。展台上的转速仅用于观察，不表示真实转速。', 'prop', clips=['prop-spin']),
         action('打开舱门', '观察两侧舱门绕铰点打开。', 'door', clips=['door-open']),
         action('襟翼变角', '找找机翼后缘的襟翼。', 'flaps', clips=['flap-tilt'])], aircraft_id='32563')
    add('helicopter', '直升机', 'Helicopter', 'sky', '🚁', '头顶的大旋翼，让它能够悬停',
        '直升机的主旋翼既能产生升力，也能通过倾斜旋翼系统改变运动方向。这架模型采用单主旋翼和尾桨；尾桨帮助抵消机身转动的趋势。',
        '主旋翼产生升力；尾桨帮助抵消反扭矩，并控制机头方向。', '找出主旋翼和尾桨，比较它们转轴的方向。', 11.8, 3.3,
        [part('主旋翼', 'rotor-main', '几片桨叶围绕头顶的旋翼轴转动，是主要的升力来源。'),
         part('尾桨', 'rotor-tail', '小小的尾桨朝侧面推动空气，帮助控制机身和机头方向。'),
         part('机身与舱门', 'cabin|door|fuselage', '座舱容纳驾驶员和乘员，舱门能滑动或转动打开。'),
         part('起落架', 'skid|gear|wheel', '起落架支撑停在地面上的直升机；不同直升机可能使用滑橇或轮式起落架。')],
        [action('双桨转动', '主旋翼与尾桨同时旋转；这里保留模型自带的部件动画。', 'rotors', clips=['rotor-spin', 'tail-rotor-spin']),
         action('打开舱门', '观察乘员舱门的打开方式。', 'door', clips=['door-open']),
         action('关上舱门', '舱门回到关闭位置。', 'close', clips=['door-close'])], aircraft_id='32802')
    rail_parts = [part('车头与车体', '^train-', '车头容纳驾驶空间，车体承载乘客或机械装置。模型中的车身作为整体网格展示。'),
                  part('前后轮组', 'wheel', '轮组沿钢轨运行；轮缘帮助约束轮对在轨道上的横向位置。')]
    for slug, name, english, file, length, height, description, task in [
        ('bullet-train', '高速列车车头', 'High-speed train', 'train-electric-bullet-a', 26, 3.8, '高速列车的流线型车头帮助减小空气阻力。电力驱动的牵引电机带动车轮转动，轨道引导列车前进。这件模型展示单个车头，实际列车通常由多节车辆组成。', '从侧面看看车头是怎样逐渐变窄的。'),
        ('subway', '地铁车辆', 'Metro train', 'train-electric-subway-a', 20, 3.8, '地铁在专用轨道上运行，可以在地下、地面或高架线路上运送乘客。较宽的车门和合理的站台组织，方便乘客快速上下车。', '数数这一侧的车窗，再找轮组与车体的连接位置。'),
        ('steam-train', '蒸汽机车', 'Steam locomotive', 'train-locomotive-a', 14, 4.2, '蒸汽机车把水加热成蒸汽，用蒸汽推动活塞，再通过机构把运动传给车轮。长长的锅炉、前部烟囱和较大的驱动轮，是它醒目的外形特点。', '比较前方的小轮与后方的大驱动轮。')]:
        add(slug, name, english, 'rail', '🚆', '沿着钢轨，把城市和远方连接起来', description,
            '轮对承受车辆重量，钢轨引导行驶；不同机车的动力来源有所不同。', task, length, height,
            rail_parts, [action('行进示意', '展台上演示一小段前进；轮组保持原模型结构，不模拟真实速度。', 'travel', kind='travel')],
            pack='train-kit', filename=file)
    road_parts = [part('车身', '^body$', '车身容纳乘员或货物，下面的底盘连接车轮与动力系统。'),
                  part('前轮', 'wheel-front', '前轮支撑车头，许多车辆由前轮转向。'),
                  part('后轮', 'wheel-back|wheel-rear', '后轮承担后部重量，驱动车轮的位置取决于车辆的动力布局。')]
    add('taxi', '出租车', 'Taxi', 'road', '🚕', '四只轮子，穿行在城市街道',
        '出租车是一种提供客运服务的汽车。这件模型用明亮的车身和车顶标志表现出租车；车轮负责在道路上滚动，车窗帮助驾驶员观察周围。',
        '动力系统让驱动车轮转动，轮胎与地面的作用推动汽车前进。', '找找车顶标志，观察四个轮胎和车身的连接。', 4.5, 1.6,
        road_parts, [action('车轮转动', '车身固定在展台上，单独观察四个轮子的转动；不是道路驾驶仿真。', 'wheels', kind='wheels')], pack='car-kit', filename='taxi')
    add('fire-engine', '消防车', 'Fire engine', 'road', '🚒', '带着器材，赶往需要帮助的地方',
        '消防车把消防人员和器材运送到现场。不同类型的消防车可能装备水罐、水泵、梯子或救援工具。这件通用模型用红色车身、警示灯和车顶梯子表现消防车辆。',
        '汽车底盘负责运输，专门装备支持灭火和救援工作。', '找找车顶的梯子和警示灯，再比较它与出租车的长度。', 8, 3,
        road_parts, [action('车轮转动', '观察车轮绕各自的轮轴转动；车辆停留在展台上。', 'wheels', kind='wheels')], pack='car-kit', filename='firetruck')
    add('sailboat', '帆船', 'Sailboat', 'water', '⛵', '张开船帆，让风帮助它前行',
        '帆船主要利用风与船帆的相互作用获得前进的力。船体浮在水上，桅杆支撑船帆；船帆、船体和水下结构共同影响航行方向。',
        '船体排开水获得浮力，风与船帆相互作用提供推进的力。', '找到桅杆和船帆，比较水上交通工具与飞机的外形。', 12, 15,
        [part('船体与船帆', 'boat-sail', '这件低多边形模型把船体、桅杆和船帆作为一个整体网格展示。')],
        [action('轻轻浮动', '小幅摇摆帮助观察船的立体外形，仅为水上浮动示意。', 'float', kind='float')], pack='watercraft-kit', filename='boat-sail-a')
    add('cargo-ship', '集装箱船', 'Container ship', 'water', '🚢', '把一个个货箱，送过辽阔的海洋',
        '集装箱船用统一规格的货箱运输货物，方便在港口与公路、铁路运输衔接。甲板上堆放的货箱、后部的上层建筑和长长的船体，是它的典型外形。',
        '船体利用浮力承载重量，动力系统通过推进装置推动船舶前进。', '找出甲板上的三组货箱，想想它们怎样从港口转到火车上。', 85, 18,
        [part('船体', '^ship-cargo', '船体承载重量，并把甲板、货舱和上层建筑连接在一起。'),
         part('集装箱', '^cargo-', '货箱有统一规格，适合使用吊机装卸并换乘其他运输方式。')],
        [action('轻轻浮动', '观察货箱和船体一起小幅浮动；这里没有模拟真实海况。', 'float', kind='float')], pack='watercraft-kit', filename='ship-cargo-a')
    SEED.parent.mkdir(parents=True, exist_ok=True)
    SEED.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')
    (OUT / 'ATTRIBUTION.md').write_text('# 交通工具馆素材\n\n'
        + '\n'.join('- **{}**：{}，{}；[来源]({})。{}'.format(r['name'], r['credit']['author'], r['credit']['license'], r['credit']['source'], r['credit']['note']) for r in records)
        + '\n\n许可：[CC0 1.0 Universal](' + CC0 + ')。所有模型与缩略图均由项目本地提供。\n', encoding='utf-8')


if __name__ == '__main__':
    main()
