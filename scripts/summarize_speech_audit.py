"""Merge static narration coverage and produce a human-readable audit report."""
import ast
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILE = ROOT / 'artifacts/speech-audio-audit-20261009.json'
r = json.loads(FILE.read_text(encoding='utf-8'))
m = json.loads((ROOT / 'frontend/assets/audio/tts/manifest.json').read_text(encoding='utf-8'))
source = (ROOT / 'scripts/tts_build.py').read_text(encoding='utf-8')
ns = {'re': re}
for definition in ast.parse(source).body:
    if isinstance(definition, ast.FunctionDef) and definition.name == 'normalize':
        exec(ast.get_source_segment(source, definition), ns)
groups = {'china_province_narration', 'dinosaur_narration', 'engineering_narration'}
# Idempotent merge; the main audit may already have collected these groups.
r['uncached_speech'] = [s for s in r['uncached_speech'] if s['group'] not in groups]
for group in groups:
    r['groups'].pop(group, None)
for entry in json.loads((ROOT / 'artifacts/speech-catalog-templates.json').read_text(encoding='utf-8-sig')):
    norm = ns['normalize'](entry['text'], 'zh-CN')
    key = hashlib.sha1(norm.encode('utf-8')).hexdigest()[:12]
    g = r['groups'].setdefault(entry['group'], dict(utterances=0, cached=0, uncached=0, over_600_chars=0))
    g['utterances'] += 1
    g['cached' if key in m else 'uncached'] += 1
    g['over_600_chars'] += int(len(norm) > 600)
    if key not in m:
        r['uncached_speech'].append(dict(entry, key=key, lang='zh-CN', voice=''))
r.pop('extra_collector_error', None)
r['uncached_unique_text_voice_pairs'] = len({(s['key'], s['voice']) for s in r['uncached_speech']})
r['audit_scope'] = {'date': '2026-10-09', 'database': 'fufu_learning', 'read_only': True,
    'audio_root': 'frontend/assets/audio', 'note': 'MP3 metadata and HTTP checks do not verify spoken pronunciation or text by listening.'}
FILE.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf-8')
g = r['groups']
rows = [
    ('声母和韵母', '47 张 / 47 份录音', '齐全；已有专业示范音'),
    ('生活英语', '77 张 / 154 份录音', '齐全；每张单词、句子各一份'),
    ('唐诗宋词', '300 首 / 300 份录音', '齐全；合成朗诵，非真人录制'),
    ('英文字母', '26 条 / 26 条已缓存', '齐全'),
    ('九九乘法口诀', '45 条 / 45 条已缓存', '齐全；随机口算另按需合成'),
    ('科学卡片', '12 张无专属录音；24 段中 2 段已缓存', '22 段需首次合成'),
    ('故事', '57 篇：26 篇齐全、31 篇无逐段录音', '352 段中 156 段配音；196 段缺专属录音，其中 5 段已有通用缓存'),
    ('团团童声', '44 条中 19 条已缓存', '25 条需首次合成；歌词当前仍是朗读而非演唱'),
    ('幼儿园题干', '484 题中 4 题已缓存', '480 题需首次合成'),
    ('小学题干', '11731 题中 757 题已缓存', '10974 题需首次合成'),
    ('模型与地标旧采集清单', '72 条中 71 条已缓存', '1 条需首次合成'),
]
for key, title in [('china_province_narration', '中国省份介绍'), ('dinosaur_narration', '远古生命馆介绍'), ('engineering_narration', '工程机械讲解')]:
    item = g[key]
    rows.append((title, '{} 条中 {} 条已缓存'.format(item['utterances'], item['cached']), '{} 条需首次合成'.format(item['uncached'])))
doc = '''# 项目语音与音频检查（2026-10-09）

结论：已有音频文件完整，但全站语音尚未全部预生成。缺口集中在新增题库、部分故事、科学卡片、团团新文案和部分模型讲解。

本次只读检查了运行中的 MySQL 内容、音频关联、清单、本地 MP3 和服务访问；没有修改题目、积分、故事或已有音频，也没有触发在线合成。

## 已有文件与引用

'''
doc += '- 本地 MP3：{} 份，约 {:.1f} MiB，合计约 {} 小时。所有文件均能解析有效 MP3 音频帧及正时长。\n'.format(r['local_mp3_files'], r['local_mp3_bytes']/1048576, r['mp3_integrity']['total_hours'])
doc += '- 数据库登记音频：{} 个；文件字节数与记录一致。\n'.format(r['database_audio_assets'])
doc += '- 清单及数据库等共引用 {} 个不同音频路径：全部存在、非空；全部 HTTP HEAD 返回 200，类型均为 audio/mpeg。\n'.format(r['unique_referenced_paths'])
doc += '- 通用语音清单：{} 个键；前后端文本规范化及 SHA-1 回归验证通过。\n'.format(r['manifest_entries'])
doc += '- {} 份本地 MP3 不在本次内容/数据库/语音清单引用中，多为旧版动作卡片、样音或备份；保留，没有擅自删除。\n'.format(len(r['unreferenced_local_mp3']))
doc += '\n## 分模块覆盖\n\n| 模块 | 当前覆盖 | 结果 |\n|---|---|---|\n'
doc += '\n'.join('| {} | {} | {} |'.format(*row) for row in rows)
doc += '\n\n## 题库的其他播放点\n\n| 阶段与播放内容 | 文案调用数 | 缓存命中 | 未缓存 |\n|---|---:|---:|---:|\n'
for key in ['preschool_options', 'preschool_hint', 'preschool_answer_explanation', 'preschool_success_feedback',
            'primary_hint', 'primary_answer_explanation', 'primary_success_feedback']:
    item = g[key]
    doc += '| {} | {} | {} | {} |\n'.format(key, item['utterances'], item['cached'], item['uncached'])
doc += '''
调用数按题目逐条统计，相同答案/提示可共用一份音频；因此不能把未缓存数直接相加当作文件缺口。成功反馈以首次答对奖励 10 分的文案检查，重复作答等动态奖励文案、随机口算及用户新增内容未枚举所有组合。

## 为什么没有文件仍可能有声音

通用流程是本地清单命中 → 后端 /api/tts 联网合成并落盘 → 部分页面回退设备朗读。当前固定语音已经够用，但新增内容首次播放依赖外部合成服务；合成串行排队，网络不通时可能延迟或失败。科学卡片只会提示失败，缺少主站那样的设备朗读回退。

拼音、英语卡片、诗词的专属音频已经关联到数据库；通用 TTS 缓存只登记在磁盘清单，题目的 prompt_audio、hint_audio、explanation_audio 三类专属字段当前全部为空。不能把“数据库字段为空”理解成已有缓存无法播放，也不能把设备朗读等同于已有可离线音频。

故事生成脚本按 slug 和段号命名，存在的文件会跳过，没有正文哈希。以后修改故事正文应重新生成并更新版本，否则文件存在不代表内容还是最新。已有文件是否逐字匹配、发音是否专业，本次未做全量听审；文件检查不能证明语音内容正确。

游戏音效多数由 Web Audio 实时产生，不需要对应 MP3；本次检查针对人声及学习朗读，未把游戏每种合成音效作为录音缺口。

## 建议补齐顺序

1. 先补团团剩余 25 条童声和科学卡片 22 段，再补本次清单缺少的模型介绍。
2. 给 31 篇故事生成逐段音频；加正文哈希，避免以后改了文字仍播放旧音频。
3. 按年级、学科分批生成题干、选项、提示及解析；先覆盖当前常用年级，去重后再合成，避免网页首次点播卡顿。
4. 固定教材音频写入数据库关联；临时文案保留按需缓存。导入内容时增加音频缺失检查，防止以后题量增长再次漏配。

详细缺口、引用来源、未缓存正文和统计保存在 artifacts/speech-audio-audit-20261009.json。该清单不含账户、学生记录或密码。
'''
docpath = ROOT / 'docs/speech-audio-audit-20261009.md'
docpath.write_text(doc, encoding='utf-8')
print(json.dumps({'catalog_groups': {k:g[k] for k in groups}, 'unique_uncached':r['uncached_unique_text_voice_pairs'], 'report': str(docpath)}, ensure_ascii=True))
