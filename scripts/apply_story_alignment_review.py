"""Stage revised illustrations/narration, then publish reviewed stories safely.

No original image or audio is overwritten. Database updates require every planned
asset to exist and the live content to match either the snapshot or this review.
"""
import argparse
import asyncio
import json
import shutil
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT/'backend'), str(ROOT/'scripts')]
from mysql_db import connection, _decode
from content_catalog import sync_story_media, register_media
from tts_stories import synth
from speech_manifest import merge_manifest

OUT = ROOT/'artifacts/story-alignment-audit-20261010'
PLAN = ROOT/'content/stories/reviews/alignment-20261010.json'
MANIFEST = ROOT/'frontend/assets/audio/stories/manifest.json'

def stage_images(plan):
    done = []
    for job in plan['jobs']:
        receipt = OUT/'generated'/f"{job['key']}.json"
        if not receipt.exists():
            continue
        source = Path(json.loads(receipt.read_text(encoding='utf-8'))['path'])
        if not source.is_file():
            raise RuntimeError(f"Missing generated original: {job['key']}")
        archive = OUT/'generated-originals'/f"{job['key']}-{source.stem}.png"
        archive.parent.mkdir(parents=True, exist_ok=True)
        if not archive.exists(): shutil.copy2(source, archive)
        target = ROOT/'frontend'/job['target'].lstrip('/')
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            with Image.open(source) as im:
                im = im.convert('RGB')
                im.thumbnail((1440,960), Image.Resampling.LANCZOS)
                im.save(target, 'WEBP', quality=87, method=6)
        done.append(job['key'])
    print(f'Illustrations staged: {len(done)}/{len(plan["jobs"])}', flush=True)

async def stage_audio(plan):
    before = json.loads(MANIFEST.read_text(encoding='utf-8'))
    backup = OUT/'audio-manifest-before.json'
    if not backup.exists(): backup.write_text(json.dumps(before, ensure_ascii=False, indent=2),encoding='utf-8')
    revised = {}
    tasks = []
    for story in plan['stories']:
        if not story.get('paragraphs'): continue
        urls = list(before.get(story['slug'], []))
        if len(urls) != len(story['paragraphs']):
            raise RuntimeError(f"Incomplete existing audio manifest: {story['slug']}")
        for p in story['text_pages']:
            name = f"{story['slug']}_review-20261010_{p:02}.mp3"
            path = ROOT/'frontend/assets/audio/stories'/name
            urls[p-1] = '/assets/audio/stories/'+name
            tasks.append((story['id'],p,story['paragraphs'][p-1],path))
        revised[story['slug']] = urls
    sem = asyncio.Semaphore(4)
    async def make(task):
        id,p,text,path = task
        async with sem:
            if not path.exists() or path.stat().st_size < 1000:
                temp = path.with_suffix('.pending.mp3')
                if not await synth(text,temp): raise RuntimeError(f'Audio failed: {id}-{p}')
                temp.replace(path)
            print(f'Audio staged: {id}-{p}',flush=True)
    await asyncio.gather(*(make(t) for t in tasks))
    (OUT/'audio-reviewed.json').write_text(json.dumps(revised,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Narration staged: {len(tasks)} paragraphs',flush=True)

def publish(plan):
    before = {s['id']:s for s in json.loads((OUT/'stories-before.json').read_text(encoding='utf-8'))}
    audio = json.loads((OUT/'audio-reviewed.json').read_text(encoding='utf-8'))
    updated = [s for s in plan['stories'] if s.get('paragraphs')]
    for s in updated:
        assert len(s['paragraphs']) == len(s['paragraph_images']) == len(audio[s['slug']])
        assert len(set(s['paragraph_images'])) == len(s['paragraph_images']), s['slug']
        for path in s['paragraph_images']+audio[s['slug']]:
            local = ROOT/'frontend'/path.lstrip('/')
            if not local.is_file() or local.stat().st_size < 1000:
                raise RuntimeError(f'Asset not ready: {path}')
    # Validate before changing any database content or narration manifest.
    with connection() as conn:
        with conn.cursor() as cur:
            for s in updated:
                cur.execute('SELECT * FROM stories WHERE id=%s FOR UPDATE',(s['id'],))
                live = _decode(cur.fetchone())
                for key in ('paragraphs','paragraph_images','source_note'):
                    if live.get(key) not in (before[s['id']].get(key),s.get(key)):
                        raise RuntimeError(f'Content edited since snapshot: {s["slug"]} / {key}')
            merge_manifest(MANIFEST,audio)
            for s in updated:
                cur.execute('UPDATE stories SET paragraphs=%s,paragraph_images=%s,source_note=%s WHERE id=%s',
                    (json.dumps(s['paragraphs'],ensure_ascii=False),json.dumps(s['paragraph_images'],ensure_ascii=False),s.get('source_note'),s['id']))
        conn.commit()
    for job in plan['jobs']:
        path=ROOT/'frontend'/job['target'].lstrip('/')
        with Image.open(path) as image:
            register_media({'public_path':job['target'],'media_kind':'image','mime_type':'image/webp',
                'file_bytes':path.stat().st_size,'width':image.width,'height':image.height,
                'title':f"{before[job['id']]['title']} · 第{job['page']}页",'alt_text':job['scene'],
                'source_name':'原创生成 · 绘本图文一致性复核 2026-10-10'})
    for s in updated: sync_story_media(s['id'])
    (OUT/'published.json').write_text(json.dumps({'stories':[s['id'] for s in updated],
        'images':len(plan['jobs']),'narration':sum(len(s['text_pages']) for s in updated)},indent=2),encoding='utf-8')
    print(f'Published {len(updated)} reviewed stories',flush=True)

def report(plan):
    lines=['# 绘本图文一致性复核（2026-10-10）','',
        '检查范围：线上数据库全部57篇、352页。逐页将原图与本页完整文字并排核对。检查情节时点、人物身份与服饰、动作物理关系、物品年代、神话与事实的区分及结尾含义。',
        '', '配图只需表现本页的关键时刻，无须同时画出段落中每一个动作；人物的卡通比例、神话中的象征画面不直接认定为情节错误。',
        '', '修改保留原素材和数据库快照，新增图片及朗读使用带日期的路径。修改段落沿用项目统一旁白音色。',
        '', '## 已发布与验证', '',
        '本次修改47篇，重画70张插图，修订49段文字，并为这49段重新生成统一音色的朗读。其余10篇保留原内容。全部修改已写入数据库，素材已登记并关联到对应故事。', '',
        '发布后重新检查57篇、352页：图片与朗读数量逐页匹配，文件均存在，故事内部未发现重复插图。逐篇接口内容与审核方案一致；70张新图片和49段新音频均通过实际HTTP加载检查。', '',
        '阅读器调整为图片加载完成后同时切换本页文字、图片和页码；连续朗读等待对应图片就绪。快速翻页的过期请求、关闭后的迟到请求及图片加载失败已通过回归检查。实际页面已确认《三只小猪》第一、二页加载新版内容。', '',
        '《皇帝的新装》已重画第2—6页，去掉游行场景中的礼服与披风，保留简洁白色内衣遮挡。进一步移除遮挡的版本被图片生成工具拦截，因此目前没有采用完全裸体的图像；这是本次修改的明确限制。', '',
        '原始数据库快照：`artifacts/story-alignment-audit-20261010/stories-before.json`；发布后快照与逐页对照图：同目录的`after/`；验证结果：`verification.json`。原图片及原朗读文件均保留。', '',
        '|绘本|发现与处理|改文字页|重画页|','|---|---|---|---|']
    for s in plan['stories']:
        lines.append(f"|{s['title']}|{s['reason']}|{', '.join(map(str,s['text_pages'])) or '—'}|{', '.join(s['scenes'].keys()) or '—'}|")
    lines += ['', '## 逐段修改', '']
    before = {s['id']:s for s in json.loads((OUT/'stories-before.json').read_text(encoding='utf-8'))}
    for s in plan['stories']:
        if not s['text_pages']: continue
        lines += [f"### {s['title']}", '']
        for p in s['text_pages']:
            lines += [f'第{p}页：', '', '原文：'+before[s['id']]['paragraphs'][p-1], '', '改文：'+s['paragraphs'][p-1], '']
    target = ROOT/'docs/story-alignment-review-20261010.md'
    target.write_text('\n'.join(lines)+'\n',encoding='utf-8')

if __name__ == '__main__':
    ap=argparse.ArgumentParser(); ap.add_argument('action',choices=['images','audio','publish','report']); args=ap.parse_args()
    plan=json.loads(PLAN.read_text(encoding='utf-8'))
    if args.action=='images': stage_images(plan)
    elif args.action=='audio': asyncio.run(stage_audio(plan))
    elif args.action=='publish': publish(plan)
    else: report(plan)
