# 四学科卡片与诗词小花园

> 本文记录首次上线版本。诗词配图、释义和阅读窗已继续升级；当前维护流程以 [逐篇配图与释义说明](poetry-illustrations-and-meaning-20261009.md) 为准。下文的 8 张共享图及初始素材脚本属于历史记录，不应覆盖当前逐篇配图和释义。

## 已实现

首页知识卡片与卡片页面统一按“数学、语文、英语、科学”分类。数学保留乘法口诀和口算；语文包含拼音真人录音与诗词；英语保留 77 张分类词汇卡及字母；科学新增 12 张观察卡，包含解释和观察小任务。

诗词精选共 300 首：唐诗 200 首、宋词 100 首。优先《静夜思》《春晓》《登鹳雀楼》等短诗，以及《水调歌头》《如梦令》《一剪梅》等常见宋词。唐诗来自 chinese-poetry 的蒙学唐诗三百首、千家诗唐代篇目及全唐诗选本；宋词选本补入全宋词中常见篇目。不是两部“三百首”原书的全量复制。保留原作者与文本来源，以简体展示，去除括号中的版本注释；相同作者与同一开篇的宋词异文不重复展示，排除一项已发现的作者归属冲突。

小卡片显示配图、题名、作者和首句，尺寸与英语卡片接近。点击图片看全文，点击“听朗诵”直接打开阅读窗并播放。弹窗支持停止、关闭和 Escape，关闭、切页或切入后台会停止播放。科学卡片使用“听讲解”。

支持作者、诗题、首句搜索，以及唐诗/宋词筛选；每页 24 张，点击“再看一些”增量加载。首页不请求这 300 首的完整正文或音频。列表接口仅返回摘要，正文与音频地址在打开卡片时请求，配图懒加载。

共享 Web Audio 解码缓存同时限制 32 条和 16 MB，避免连续播放长篇诗词在平板上积累大量 PCM 缓冲。

## 数据和素材

- 数据清单：`content/learning/poetry-cards.json`、`science-cards.json`。
- 数据库：`learning_reading_cards`，图片、音频关联 `media_assets`；对类型/位置和类型/文集建立索引。变更选本时旧版本保留并从当前列表隐藏，不删除用户数据。
- 接口：`GET /api/learning/reading-cards?kind=poetry&page=1&q=&collection=`、`GET /api/learning/reading-cards/{id}`。
- 文字来源：https://github.com/chinese-poetry/chinese-poetry ，完整 MIT 声明位于 `content/learning/poetry-source-LICENSE.txt`。
- 朗诵：`frontend/assets/audio/learning-poetry/`。300 段本地 MP3，晓晓神经语音，语速 -18%、音高 -2Hz，保留句读停顿。是舒缓的合成朗诵，未冒充真人名家录音；没有背景音乐，避免影响听清诗句。发音没有经过专业教师逐条审音。
- 配图：`frontend/assets/learning/poetry/`，8 张 640×640 WebP。每首按意境选择一张，共用场景；不是 300 张逐篇定制的插画。
- 生成源路径：`artifacts/poetry-generated-images.json`；原始生成图片留在 Codex 图像目录，最终素材已复制并优化到项目目录。
- 图片制作方式：内置 image_gen，读取 imagegen 技能。提示词如下。

## 配图提示词

通用要求：Create a single square illustration for a child's Chinese classical poetry learning card. Warm picture-book gouache and watercolor with softly rounded clay-like forms, muted cream, forest green, sage, dusty blue, subtle paper texture. Beautiful composition at small thumbnail size. Full bleed square illustration. No text, letters, calligraphy, border or collage.

场景分别为：

1. moon：a quiet ancient Chinese courtyard at night, full moon above pine branches, soft moonlight on pale stone ground, no people.
2. spring：spring river beside a small ancient Chinese village, willow trees, swallows and peach blossoms, gentle fresh morning.
3. mountain：layered blue green Chinese mountains and a tiny pavilion, white clouds, warm distant sun, quiet landscape.
4. snow：snowy river with a very tiny fishing boat in the distance, bare willow branches, soft white snow, poetic calm.
5. autumn：an ancient Chinese village beside a river in autumn, amber maple leaves, reeds and mist, gentle sunset.
6. lotus：pink lotus flowers and round green lotus leaves on a quiet pond, a tiny dragonfly, pale summer sky.
7. field：ancient Chinese rice fields, a tiny straw hut and distant hills, golden grain, gentle morning sun.
8. journey：two very tiny ancient travelers beside a riverside pavilion waving goodbye to a small sailboat, vast peaceful river and distant green hills.

## 可复现流程

1. 在 `artifacts` 放入对应源 JSON，执行 `scripts/prepare_poetry_cards.py`（需 opencc）。
2. 执行 `scripts/finalize_poetry_assets.py`（需 Pillow），将生成图片优化并关联到选本。
3. 执行 `scripts/prepare_poetry_audio.py`（edge-tts），5 并发、超时重试、已有文件跳过。对外发送的只有公开诗词文本。
4. 执行 `scripts/import_reading_cards.py`，私密输入本地 MySQL 密码。
5. 服务启动时会初始化 `reading_cards`。现有正在编辑的游戏若阻止全量导入，可用已经初始化数据库的 HTTP 重载方式测试；完整部署仍应完成所有清单依赖素材。

## 验证记录

300 段录音可解码，全部当前条目的配图、音频文件存在；数据唯一性、分页、搜索、唐诗/宋词筛选、科学分类与阅读播放已检查。布局检查覆盖 768×1024、1024×768、390×844；真实 iPad 上的音色和听感仍以实际设备体验为准。
