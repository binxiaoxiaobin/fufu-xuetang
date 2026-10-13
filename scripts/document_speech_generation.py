"""Record the rollout settings and preserve the pre-generation cache mapping."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
audit=json.loads((ROOT/'artifacts/speech-audio-audit-20261009.json').read_text(encoding='utf-8'))
backup=ROOT/'artifacts/tts-manifest-before-consistent-20261009.json'
if not backup.exists():
    original={origin.split(':',1)[1]:path for path,origins in audit['references'].items()
              for origin in origins if origin.startswith('tts_manifest:')}
    backup.write_text(json.dumps(original,ensure_ascii=False,indent=2),encoding='utf-8')
progress=json.loads((ROOT/'artifacts/speech-generation-progress.json').read_text(encoding='utf-8'))
doc='''# 统一语音生成与入库（2026-10-09）

新增及这次重新生成的普通中文讲解、团团和题库语音统一使用 zh-CN-XiaoxiaoNeural，语速 -10%，音高 -4Hz。英文统一使用 en-US-JennyNeural，语速 -12%，音高 +0Hz，与现有生活英语卡片一致。团团不再单独升高音调。已有专业拼音示范录音保留；已有完整诗词保留同一晓晓音色的抒情朗诵节奏，已有完整故事也保留。

## 自动执行范围

先完成团团 44 条、科学卡片 12 份完整讲解及逐段内容、乘法口诀、英文字母、黏土动物园、中国省份、恐龙及工程机械等介绍，并补齐 31 篇缺音频的故事。随后按照幼儿园、小学年级顺序处理题干、选项、提示、解析与首次答对反馈。已经有通用缓存的题库文案也使用统一配置重新生成，逐步替换旧音色。

同一文字和音色共用一份音频。文件以正文及音色配置的哈希命名，不覆盖旧文件，避免修改文字后仍播放旧音频。完成后写入 media_assets 并关联团团、科学卡片、故事、题目字段；通用播放入口同时更新音频清单。故事只有全部段落准备完成才发布，避免段落音频错位。当前页面需要刷新才能读取更新后的清单。

## 运行与恢复

后台任务为 scripts/generate_speech_library.py；进度位于 artifacts/speech-generation-progress.json，日志位于 artifacts/speech-generation.log。进程环境中保存数据库连接信息，日志和进度文件不包含密码。

再次运行 scripts/generate_speech_library.py --launch 可以续传。已经在运行时会阻止重复启动；校验已有完整音频后跳过，重新恢复数据库与清单关联。失败文件不发布，可重新运行补齐。电脑休眠或关机时生成会停止推进，恢复后可续传。

后台合成和网页实时合成共用文件锁与原子合并，避免覆盖彼此的清单。中文音色参数集中于 backend/speech_config.py，未来按需生成也使用同一配置。旧缓存映射备份位于 artifacts/tts-manifest-before-consistent-20261009.json，旧音频仍保留。

## 验证

统一音色配置检查与两进程同时写清单的回归验证通过。新 MP3 使用有效音频帧及时长检查，并检查 HTTP 服务可访问；数据库关联单独验证。具体结果位于 artifacts/new-speech-file-verification.json 及 artifacts/speech-generation-links.json。此检查不等于逐条人工听审。

'''
doc+='记录时进度：{completed}/{total}，阶段 {phase}，已完成常用内容关联 {published}。这是记录时快照，实时结果请查看进度文件。\n'.format(**progress)
(ROOT/'docs/unified-speech-generation-20261009.md').write_text(doc,encoding='utf-8')
print(json.dumps({'state':progress['state'],'phase':progress['phase'],'completed':progress['completed'],'total':progress['total'],
                  'published':progress['published'],'failures':len(progress['failed'])},ensure_ascii=True))
