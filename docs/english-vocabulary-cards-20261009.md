# 分类生活英语卡片

入口：首页 → 学习小工具 → 生活英语卡片。

分类为日常动作（35 张）、日常用品（14 张）、水果（14 张）、蔬菜（14 张），共 77 张。每张都有黏土插图或动作动图、英文单词、中文词义、完整英文句子和中文翻译。图片和句子分别播放本地录音。分类栏显示数量和选中状态，切换后显示该分类的第一组卡片并停止上一条录音。

## 素材

新增插图使用内置 imagegen，按参考素材匹配黏土材质与光照，每个物品独立生成，不复制参考海报。原始图归档在 `artifacts/vocabulary-clay-originals/`，压缩成 320×320 WebP 放在 `frontend/assets/learning/vocabulary-clay/`。完整提示词与原始路径保存在 `artifacts/vocabulary-generation-20261009.json`。处理工具为 `scripts/prepare_vocabulary_illustration.py`。

物品图以轻微上下浮动展示，只有可见卡片运行动效，后台和减少动态效果设置下停止；无需生成多帧物品图片或启动三维渲染器。原动作卡保留四帧 WebP 动图。

词汇卡共有 84 条 Jenny 英语录音位于 `frontend/assets/audio/learning-vocabulary-clay/`，播放时不请求外部服务。录音准备工具为 `scripts/prepare_action_audio.py --vocabulary`；可用 `--proxy` 指定准备过程使用的 HTTP 代理，不改变浏览器或系统代理配置。

## 数据与部署

导入源为 `content/learning/vocabulary-words.json`，客户端从 MySQL 接口 `/api/learning/english-cards` 获取内容；旧 `/api/learning/action-cards` 继续仅返回 35 张动作卡。

复用 `learning_action_cards` 内容表，新增 `category_key`、`category_name`、`display_kind`，分别表达分类键、显示名称和动图/插图类型。已有记录默认属于日常动作。封面、动图和录音通过外键关联现有 `media_assets`。普通插图的封面与展示图使用同一个素材 ID，避免复制文件。按类别及分组渲染，其他分类的图片不进入页面、不提前加载。

启动时 `vocabulary_cards.initialize()` 只补充缺失记录，保留数据库内已有文案、排序、状态。部署时包含新增 JSON、后端模块、前端脚本与样式、插图和录音目录。备份继续包含内容表和素材表；原始 PNG 和检查图无需公开发布。

## 首批分类卡验证

确认数据库总计 59 张，旧动作接口保持 35 张。24 张插图和 48 条录音共 803,284 字节，72 个素材均可通过服务加载，格式正确。已检查分类切换、单词和句子播放、切换停止、视野外暂停，以及 768×1024、1024×768、390×844 排版，无横向溢出、触控按钮至少 44px。这里是桌面浏览器的平板尺寸检查，真实 iPad Safari 仍需现场使用确认。

验证记录：artifacts/english-vocabulary-verification-20261009.json；页面预览：artifacts/english-category-overview-ipad-20261009.png。

## 第二批扩展

三类各新增六张，共 18 张，覆盖水瓶、叉子、肥皂、梳子、枕头、时钟；桃子、芒果、柠檬、樱桃、猕猴桃、蓝莓；洋葱、大蒜、茄子、甜椒、生菜、蘑菇。每张带单词、句子、中文和两条本地录音。水果分组改为“多彩的水果”，包含酸甜不同的水果。导入源为 content/learning/vocabulary-expansion-20261009.json，已合并到主词汇文件。完整新增提示词和来源见 artifacts/vocabulary-expansion-generation-20261009.json，使用内置 imagegen 生成；插图与录音继续存入上述指定目录。

第二批校验：77 张卡片分类数量为 35/14/14/14；18 张新插图与 36 条录音共 594,728 字节，54 个 HTTP 素材可正常加载。新增单词、句子发音、分类切换停止以及手机 390×844 触控排版通过。校验记录：artifacts/vocabulary-expansion-verification-20261009.json；已打开前端的预览：artifacts/vocabulary-expanded-frontend-20261009.png。
