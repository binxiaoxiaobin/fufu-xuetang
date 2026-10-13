# -*- coding: utf-8 -*-
"""生成温柔女声样音（edge-tts，免费）。
输出到 frontend/assets/audio/samples/<场景>_<音色>.mp3

两组：
1) 基础音色：讲题/鼓励/科普 × 晓伊、晓晓（及拟童声/拟讲故事变体）
2) 感情叙事版：故事/科普 × 4 种韵律风格（温柔故事/好奇探索/甜美故事/睡前耳语）
   注：真正的情绪风格（gentle/cheerful/story/whispering）需 Azure 接口，
   这里用 rate/pitch/volume + 标点停连做近似。
"""
import asyncio
import os

import edge_tts

OUT = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'assets', 'audio', 'samples')
os.makedirs(OUT, exist_ok=True)

# ---------- 基础组 ----------
SCENES = {
    'jiangti': '我们来听这道题。小兔子有三颗糖果，妈妈又给了它两颗，现在一共有几颗糖果呢？',
    'guli': '太棒啦，答对了！你真是个爱动脑筋的小朋友。',
    'kepu': '月亮自己不会发光哦，我们看到的月光，其实是太阳照在月亮上面，再反射回来的。',
}
BASE_VOICES = {
    'xiaoyi':         ('zh-CN-XiaoyiNeural',   '-4%',  '+0Hz',  '+0%'),
    'xiaoxiao':       ('zh-CN-XiaoxiaoNeural', '-4%',  '+0Hz',  '+0%'),
    'xiaoyi_kid':     ('zh-CN-XiaoyiNeural',   '+4%',  '+30Hz', '+0%'),
    'xiaoxiao_story': ('zh-CN-XiaoxiaoNeural', '-14%', '-8Hz',  '+0%'),
}

# ---------- 感情叙事组 ----------
# 文案里刻意使用省略号/破折号制造停顿，模拟讲故事的呼吸感
STORY = ('天黑了，小星星一颗、一颗地亮了起来。小兔子靠在妈妈怀里，轻轻地问：'
         '“妈妈，月亮今天怎么瘦啦？”妈妈笑着说：“因为它呀，正在悄悄地变魔术呢……”')
KEPU_EMO = ('你有没有发现？月亮有时候是圆圆的，有时候又变成了一条小船。'
            '原来呀，月亮自己不会发光，我们看到的月光，是太阳借给它的；'
            '而月亮绕着地球不停地转，我们看到的亮光不一样多，它就会——悄悄地变脸啦。')

EMO_VOICES = {
    'emo_gentle':  ('zh-CN-XiaoxiaoNeural', '-10%', '-4Hz',  '+0%'),    # 温柔讲故事
    'emo_curious': ('zh-CN-XiaoxiaoNeural', '+6%',  '+14Hz', '+0%'),    # 好奇探索（适合科普）
    'emo_sweet':   ('zh-CN-XiaoyiNeural',   '-8%',  '+2Hz',  '+0%'),    # 甜美故事
    'emo_whisper': ('zh-CN-XiaoxiaoNeural', '-12%', '-6Hz',  '-25%'),   # 睡前耳语
}
EMO_SCENES = {'gushi': STORY, 'kepu2': KEPU_EMO}


async def gen(out_name, text, voice_name, rate, pitch, volume):
    out = os.path.join(OUT, f'{out_name}.mp3')
    for attempt in range(4):
        try:
            tts = edge_tts.Communicate(text, voice=voice_name, rate=rate, pitch=pitch, volume=volume)
            await tts.save(out)
            print('OK  ', out_name, os.path.getsize(out))
            return True
        except Exception as e:
            print('retry', out_name, attempt, str(e)[:70])
            await asyncio.sleep(2 + attempt * 2)
    return False


async def main():
    # 逐条生成，避免并发 websocket 被限流
    for vk, params in BASE_VOICES.items():
        for sk, text in SCENES.items():
            await gen(f'{sk}_{vk}', text, *params)
            await asyncio.sleep(.5)
    for vk, params in EMO_VOICES.items():
        for sk, text in EMO_SCENES.items():
            await gen(f'{sk}_{vk}', text, *params)
            await asyncio.sleep(.5)


if __name__ == '__main__':
    asyncio.run(main())
