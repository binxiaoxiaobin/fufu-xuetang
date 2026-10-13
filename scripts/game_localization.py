"""Display-only Chinese patches. Internal action IDs and save keys stay stable."""
from pathlib import Path


def patch(root, name, pairs):
    path = Path(root) / name
    text = path.read_text(encoding='utf-8')
    for before, after in pairs:
        if before not in text:
            raise ValueError('Missing localization: ' + name + ' ' + before)
        text = text.replace(before, after)
    path.write_text(text, encoding='utf-8')


def kart(root):
    patch(root, 'config.js', [("name: '" + a + "'", "name: '" + b + "'") for a, b in zip(
        ['Blaze','Zippy','Bella','Toadly','Rex','Grumbo','Koopz','Dotty'],
        ['小焰','飞飞','贝拉','蘑菇仔','雷克','壮壮','小龟','朵朵'])])
    patch(root, 'menu.js', [
        ('© Turbo Kart Rally · original procedural game','海岛卡丁车 · 原作来源见游戏乐园'),
        ('</span> mute','</span> 静音'),('>SPACE<','>空格<'),('>L-SHIFT<','>左换挡键<'),('>ESC<','>退出键<'),
        ('50cc · 简单','简单 · 慢速'),('100cc · 标准','标准 · 中速'),('150cc · 挑战','挑战 · 高速'),
        ("`${ch.hat.toUpperCase()} · KART`", "`${({cap:'棒球帽',crown:'皇冠',mushroom:'蘑菇帽',horns:'角盔',shell:'龟壳',bow:'蝴蝶结'})[ch.hat] || '赛车'} · 卡丁车`"),
        ('LOADING','正在准备赛道')])
    patch(root, 'hud.js', [
        ("const s = ['th', 'st', 'nd', 'rd'];\n  const v = n % 100;\n  return s[(v - 20) % 10] || s[v] || s[0];", "return '名';"),
        ('>st<','>名<'),('km/h','公里/时'),('GO!','出发！'),('FINAL LAP!','最后一圈！'),
        ('<span>L${i + 1}</span>','<span>第${i + 1}圈</span>'),
        ("'ULTRA'", "'极限漂移'"),("'SUPER'", "'强力漂移'"),("'MINI'", "'小漂移'"),
        ('>YOU<','>我<'),("'BEST '","'最快圈 ' ")])
    patch(root, 'main.js', [('RACE FAILED TO LOAD — SEE CONSOLE','赛道加载失败，请重新开始'),('Grand Circuit','海岛赛道'),("easy: '50cc', normal: '100cc', hard: '150cc'", "easy: '简单', normal: '标准', hard: '挑战'")])
    patch(root, 'track.js', [('TURBO KART RALLY','海岛卡丁车')])
    patch(root, 'track-textures.js', [("'TURBO'","'极速'"),("'KART'","'赛车'"),("'RALLY'","'挑战'"),("'★ GO! ★'","'★ 加油 ★'")])
    for file in ['models.js','kart.js','race.js']:
        patch(root, file, [("'Racer'","'车手'")] if file != 'race.js' else [('`Racer ${i + 1}`','`车手 ${i + 1}`')])


def sunbreak(root):
    trick_map = "const trickLabel=(name:string)=>({TABLETOP:'侧摆车身','X-UP':'交叉把手',SUPERMAN:'伸展飞跃',TAILWHIP:'甩尾','360':'转体一圈',BACKFLIP:'后空翻',FRONTFLIP:'前空翻',WIPEOUT:'落地失误'} as Record<string,string>)[name]||name;\n"
    patch(root, 'hud.ts', [
        ('export class HUD', trick_map + 'export class HUD'),
        ('Sunbreak home','晴山飞驰首页'),('MT. KOMOREBI','晨光山'),('35° 21′ N','北纬 35° 21′'),('138° 43′ E','东经 138° 43′'),
        ('Toggle synthesized audio (M)','开关声音（M 键）'),('Toggle full/reduced motion effects (F)','切换画质（F 键）'),('Toggle dawn rain (V)','切换天气（V 键）'),
        ('<span class="wordmark">SUNBREAK</span>','<span class="wordmark">晴山飞驰</span>'),
        ('>ENTER<','>回车开始<'),('>R</small>','>R 键重开</small>'),('KM/H','公里/时'),(' KM',' 公里'),("toFixed(1)}s`", "toFixed(1)}秒`"),
        ("'GO!'","'出发！'"),('p.trick.toUpperCase()','trickLabel(p.trick)'),
        ('W <span>PEDAL</span> A D <span>STEER</span> S <span>BRAKE</span> SPACE <span>PUMP / HOP</span> 1–7 <span>AIR TRICKS</span> ESC <span>PAUSE</span>',
         'W <span>踩踏</span> A D <span>转向</span> S <span>刹车</span> 空格 <span>蓄力跳跃</span> 1–7 <span>空中特技</span> 退出键 <span>暂停</span>')])
    patch(root, 'main.ts', [('const hud=new HUD',trick_map+'const hud=new HUD'),('${e.name}', '${trickLabel(e.name || "")}')])
    patch(root, 'race.ts', [("'"+a+"'","'"+b+"'") for a,b in zip(['RIN','JUN','KAI','NIKO'],['小林','小俊','阿凯','妮可'])] + [('SPLIT ${','分段 ${')])
    patch(root, 'terrain.ts', [("'"+a+"'","'"+b+"'") for a,b in zip(
        ['NEEDLE POINT','THE FALL LINE','CEDAR SWITCHBACKS','ROCK GARDEN','SKY TABLE','RAZOR RIDGE','THE DIVIDE','RIVER RUN','HOME STRAIGHT','SUNBREAK','SUMMIT / 2,410 M','FINISH','THE VALLEY IS YOURS'],
        ['尖峰起点','直下坡道','杉林回头弯','碎石坡','云端跳台','刀锋山脊','峡谷飞跃','沿河小路','终点直道','晴山飞驰','山顶 / 海拔 2410 米','终点','抵达晨光河谷'])])
