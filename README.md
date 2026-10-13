# 福福学堂（fufu-xuetang）

一款面向幼儿园与小学低年级的浏览器学习应用。前端为原生 HTML/CSS/JS，通过 REST API 连接 Python 后端。故事内容、题库、学习档案、答题记录、积分流水、商店库存和宠物状态统一保存在 MySQL。

## 启动

需要 Python 3.9 或更新版本，以及已启动并允许本机连接的 MySQL。

### 一键启动（推荐）

在项目目录执行，把密码换成你本机 MySQL 的密码：

```powershell
.\start-fufu.ps1 -Password "你的 MySQL 密码"
```

这个脚本会依次完成：检查 Python 与 PyMySQL（缺了就自动装 `backend/requirements.txt`）→ 建库建表并导入内容 →
补齐黏土动物园的动物目录 → 启动服务并占用当前窗口（Ctrl+C 停止）。
若只是想准备好数据库而不启动，加 `-InitOnly`。

如果提示脚本被禁止运行，用这个等价命令临时放行：

```powershell
powershell -ExecutionPolicy Bypass -File .\start-fufu.ps1 -Password "你的 MySQL 密码"
```

### 手动启动

```powershell
pip install -r backend/requirements.txt
$env:FUFU_MYSQL_PASSWORD = "你的 MySQL 密码"
python scripts/init_backend_db.py      # 建库建表 + 导入内容（幂等）
python scripts/seed_zoo_animals.py     # 补齐动物园动物目录（幂等）
python backend/server.py               # 启动服务
```

`python backend/server.py` 自己也会在建库后导入内容，所以首次直接启动也可以；只是动物园的新动物需要
`seed_zoo_animals.py` 才会出现在积分商店里。

浏览器访问 http://localhost:8000 。同一局域网平板可访问 `http://电脑局域网IP:8000`。MySQL 主机、端口、用户名和数据库名可通过 `FUFU_MYSQL_HOST`、`FUFU_MYSQL_PORT`、`FUFU_MYSQL_USER`、`FUFU_MYSQL_DATABASE` 配置；默认值见 `backend/.env.example`。密码不要写入源代码或提交到版本库。

内容与学习数据管理后台可在服务启动后访问 http://localhost:8000/admin。首次打开时先创建超级管理员账号；管理员登录后可管理账号列表，并为管理员分配内容管理员、学习者管理员或只读角色。学习端开放家长注册，每个账号绑定一份学习者档案，登录后直接进入学习，不需要选择孩子。首次创建家长账号时，系统会将现有未绑定学习档案归到该账号名下，保留已有资料和记录。后台管理接口仍仅允许从运行服务的本机打开。

小学数学已导入 CMATH `cmath_dev` 公开集的 600 道题（每个年级 100 题）。来源 JSONL、CC BY 4.0 许可文本和署名信息保存在 `content/questions/sources/cmath/`；记录在 MySQL 中带有来源标识，重复运行 `python scripts/import_cmath.py` 不会重复导入。该数据集提供题目、标准答案和解题步数标签，不提供选项或详细解析，因此以数字/分数简答题形式练习；没有生成原数据中不存在的选项或解析。

另有 120 道福福学堂原创小学数学补充题，覆盖一年级至六年级，每个年级 20 道，包含知识点、难度、提示和解析，并混合数字简答与单项选择。题目源文件为 `content/questions/original/primary-math-full.json`，生成脚本为 `scripts/build_primary_math_full.py`，可用 `python scripts/import_primary_math_full.py --dry-run` 检查是否会重复导入。新题默认直接发布并进入孩子的练习；如需先审核，可使用 `--status draft` 导入为草稿。重复导入不会修改现有记录的状态。

## 功能

- 儿童首页：语文、数学、英语、科学学习入口，学习卡片和故事科普。
- 学习账号：用户使用用户名和密码注册；注册时创建一份学习者档案，登录后直接进入该档案。每个账号对应一位学习者。管理员支持首次本机初始化及角色管理。手机号登录暂未接入，后续可在账号体系中扩展。
- 首次使用可设置幼儿园/小学阶段及年级；首页按当前阶段显示今日练习进度。学习档案与进度保存在 MySQL。
- 固定卡片：声母韵母、九九乘法口诀、英文字母，支持点按语音。
- 认字与单词快练：首页提供一题一答、答对接着练的入口，题目从 MySQL 题库按孩子年级抽取；“语文”与“英语”常规闯关也会抽到这些题。源文件为 `content/questions/original/primary-recognition-quick-practice.json`，生成脚本为 `scripts/build_primary_recognition_questions.py`，导入脚本 `scripts/import_primary_recognition_questions.py` 默认为草稿，确认内容后可用 `--status published` 发布。
- 闯关练习：每次开练由后端按当前年级与学科随机抽题，优先安排较少练过的题；幼儿园题目与选项支持语音朗读。支持选择题、数字/分数简答和英文补字母；答案在后端判定，答错可继续尝试，两次错误后可听提示或答案；每题每轮只发放一次积分。
- 黏土小伙伴：首页展示可旋转的探险家，支持陪伴、玩耍、唱歌、挥手；开心值和装扮保存在 MySQL。
- 积分商店：兑换黏土风格配件与动物；帽子、鞋子、围巾、眼镜等配件可按穿戴位置搭配，装扮会同步到首页小伙伴和动物园。动物兑换后会立刻出现在首页动物园中（无需刷新），交易记入积分流水。
- 黏土动物园：放在小伙伴卡片下方，可直接漫步参观。地图为 120 × 88 的黏土沙盘，有河流和两座木桥；包含 18 种动物与 13 件场景物品（共 31 个可互动对象）。场景与角色基于 [clay-safari](https://github.com/cclank/clay-safari) 的 MIT 许可资源。
- 游戏乐园：包含每局随机且唯一解的高中低数独、手电照明的全屏迷宫和触屏扫雷。支持键盘和平板触控，每款游戏每日最多领取一次积分奖励。
- 海底小鱼乐园：游戏乐园“进阶大游戏”中的三维海底养成游戏，可驾驶潜水艇喂鱼、收集金币、购买小鱼与装备、切换昼夜并用声呐寻找神秘小鱼。界面与玩法提示已汉化，支持键盘、触屏和可选全屏；进度按学员保存至 MySQL，返回时等待保存完成。游戏金币不计入学习积分。原作来源、构建与许可说明见 `content/games/fishslop/README.md`。
- 精品像素游戏：已接入 Starcatcher（追星小旅人）和 A Palace for Fools（愚者宫殿），保留原版玩法并汉化界面与关卡提示。支持触屏、可选全屏与按学员保存。来源与构建说明见 `content/games/itch-ports/README.md`。
- 我的信息：修改孩子昵称、学习阶段和年级；家长中心提供近 7 天学科答题概览、最近答题、积分流水和实物兑换登记。
- 故事与科普：封面卡片、逐段语音伴读。
- 地球探索：拖动和缩放地球，从地图或国家列表选择 23 个国家；支持搜索、大洲筛选、浮起的国家高亮、扩展知识卡片和连贯语音讲解。手机和平板可用手指操作。
- 太阳系：本地 Three.js 绘制的 3D 星空、太阳与八大行星；可拖动视角、缩放、点选星球、暂停及调整公转速度，并阅读和收听星球介绍。星球大小和轨道距离为便于观察而调整，不代表真实比例。
- 地月实验室：3D 地月轨道、八种月相、时间滑杆与自动演示；可切换潮汐力示意，观察地球面向和背向月球的两处海水隆起，并听月相或潮汐讲解。
- 工程探索：在四个子标签间切换，旋转缩放本地保存的履带挖掘机、高空拆除机和分件挖掘机模型，点选部件查看讲解；前两种车型可以播放模型自带动作。“小小建造场”提供微缩施工沙盘、机械动画、暂停与速度控制、昼夜切换和自由视角。工程车模型来源与许可署名记录位于 `frontend/assets/engineering/ATTRIBUTION.txt`。
- 远古生命馆：按陆地、海洋和天空浏览仓库中的 24 种史前动物；每种均可旋转、缩放并播放 3D 模型，切换时按需载入。模型来源、逐项 CC BY 4.0 许可与改动记录见 `frontend/assets/jurassic/`。

## 架构与扩展

### 内容与大题库扩展（2026-09）

- 学习端故事目录 `GET /api/stories?page=1&page_size=12` 只返回封面和摘要；点开故事再访问 `GET /api/stories/{id}` 获取正文与配图。后台原有 `/api/admin/stories` 编辑方式保留。
- 新增 `media_assets`、`story_media_links`、`content_items`、`content_segments`。旧故事的封面、分段插图和音频文件仍保留原路径，并登记到素材表；故事详情 API 返回伴读地址。新媒体文件保存在 `frontend/assets/content/`，数据库保存文件路径、类型、体积、说明和来源。漫画按章节与有序分镜保存；恐龙、工程车专题按条目、GLB 模型和知识热点保存。新内容默认草稿，发布后才通过 `GET /api/content?kind=comic|dinosaur|machine&page=1` 出现在学习端。
- 后台“图文与 3D”页面可上传 PNG/JPG/WebP、MP3、GLB 素材（单文件最多 20 MB），编辑章节、图文、讲解和热点坐标，也可在素材库中补充原有文件的来源、授权和替代文字。保存后调用 `/api/admin/content`，上传通过 `/api/admin/media/upload`，不需要改学习端页面代码。正式发布前应核对每项素材的来源和授权。
- 学习端 `/content-explorer.html` 共用一个 3D 查看器，进入详情才加载模型；离开时释放渲染资源。旧有工程探索、侏罗纪页面暂时保留，便于逐步迁移其专题内容。浏览器不支持 WebGL 或没有模型时仍能阅读文字资料。
- 题库后台 `GET /api/admin/questions` 现在按筛选条件分页返回摘要，`GET /api/admin/questions/{id}` 才返回选项与答案。后台可下载 `frontend/question-import-template.json` 作为格式样例，一次导入最多 200 道题；`POST /api/admin/questions/import` 会检查来源标识并保存为草稿，审核后才进入练习。练习抽题限制候选窗口并按当前学习者的答题历史排序，避免每次对整个题库进行随机排序。原有题目和答题记录不迁移也不丢失。
- 快练复用现有 `questions` / `question_options` 题库、年级筛选和答题会话；知识点 `识字快练` / `单词快练` 供首页连续单题挑战筛选。后台题库编辑器可按学科、年级与知识点维护题目，无需新增词库表或把单词数据写入前端。
- `scripts/init_backend_db.py` 与服务启动时会以可重复执行的方式创建新表和必要索引。上线前保留数据库备份，发布新代码后重启 Python 服务，再查看 `/api/health`。新旧数据库均以 MySQL 为准。

前端在 `frontend/`，通过 `/api` 请求后端。故事内容表和学习数据表分别由 `backend/mysql_db.py`、`backend/mysql_learning_db.py` 管理；后者负责将旧 SQLite 数据幂等迁移至 MySQL，并创建账号会话、孩子档案归属、题目选项、练习轮次、轮次题目和答题记录表。`user_accounts` 存储用户名、PBKDF2-SHA256 密码摘要、账号类型与角色，`user_sessions` 只存会话令牌的 SHA-256 摘要；学习记录、积分、游戏奖励和宠物收藏按 `profile.id` 对应的孩子编号归属。`questions` 保存题干和教学元数据，`question_options` 保存选择题选项与正确标记；简答题答案保存在题目记录中。学习端练习 API 不下发答案，后台题库 API 才可读取答案。管理接口和其他 REST API 在 `backend/server.py`。前后端通过 REST API 解耦；分开部署静态前端时，可在 `frontend/runtime-config.js` 设置 `window.FUFU_API_BASE` 为后端地址。`content/` 保存供导入和迁移的素材文件；导入后以 MySQL 中的内容为准。

`mysql_learning_db.py` 的 `Store.execute()` 会把查询里字面写成 `id=1` / `pet_id=1` / `VALUES(1,` 的部分
重写成当前学习者变量（兼容早期的单学习者 SQL），所以这些写法是按学习者隔离的。写新 SQL 时请勿用它们表达"1 号行"。

语音使用浏览器内置 Web Speech API；设备或浏览器未提供中文语音时会显示提示。示例内容用于体验，正式教学内容建议由老师审核后维护。

### 黏土动物园的代码位置与扩展方式

黏土动物园的源码在 `frontend/clay-safari/src/`，**不需要构建步骤**：`index.html` 用 import map 把 `three` 指到 `frontend/vendor/three.module.js`，直接以 ES 模块运行。改完源码刷新页面即可生效。（此前 `frontend/clay-safari/assets/index-*.js` 是 Vite 打包产物，现已不再被引用，可安全删除；样式仍复用 `assets/index-J0lB1Z5o.css`。）

页面底部带启动自检：模块语法错误、依赖 404、设备不支持 WebGL 都会直接显示出错原文，便于排查。

要新增一位动物或一件物品，只需要三步：

1. 在 `frontend/clay-safari/src/data.js` 的 `ITEMS` 里加一条（`id / kind / cn / py / en / emoji / pos / rot / scale / y / r / viewFrom`）。
2. 在 `frontend/clay-safari/src/procedural.js` 里写一个用黏土几何体拼装的 build 函数并登记到 `PROCEDURAL`；如果把 Blender 导出的 `glb` 放进 `frontend/clay-safari/models/`，则跳过这一步，直接按 `id` 命名即可。
3. 如果是可兑换的动物，把 `id` 加进 `scripts/seed_zoo_animals.py` 的 `ZOO_CATALOG` 并运行脚本。

`procedural.js` 里的模型按原项目约定给部件命名（`head` / `tail` / `earL` / `wingL` / `armL` / `body`），因此 `animals.js` 的待机动画和点击反应可以直接复用。

地球探索可从“探索实验室”或首页进入。地图边界数据保存在 `frontend/assets/world.geojson`，来源为 [D3 Graph Gallery 的世界 GeoJSON](https://github.com/holtzy/D3-graph-gallery/blob/master/DATA/world.geojson)。国家知识卡片与地标入口在 `frontend/globe.js`。法国、英国、中国、日本、印度、埃及、泰国、美国、澳大利亚、意大利、巴西提供可旋转的 3D 地标、局部观察点、中文讲解和可进入的教学空间；新地标的讲解配置在 `frontend/landmark-catalog-extra.js`。

地标 GLB 位于 `frontend/assets/landmarks-v2/`。中国展示长城烽火台扫描，日本展示富士山地形；泰国的大皇宫模型为以兜率大殿屋顶和庭院为主题的教学示意。印度、埃及、美国、澳大利亚、意大利和巴西的外观采用经 Blender 调整尺寸与面数的开放许可模型，作者、原址和许可见 `artifacts/landmarks-v2/source-credits.json`，网页中也可打开来源。法国、英国原有模型仍为 Blender 自建。

开放模型的原件保存在 `artifacts/landmarks-v2/originals/`，网页版本在 `frontend/assets/landmarks-v2/`。埃及入口使用胡夫大金字塔的开放模型，室内通道、大走廊和国王墓室为压缩布局的教学示意。`scripts/optimize_landmark_sources.py` 可从原件重新生成减面模型，`scripts/build_landmarks_new_subjects.py` 可重新生成大皇宫、长城、富士山与金字塔教学空间，`scripts/enhance_liberty_pedestal.py` 添加自由女神像的教学示意底座。旧版程序建模外观保存在 `artifacts/landmarks-v2/procedural-backup/`。`scripts/build_landmarks_extra.py` 仅用于早期程序模型，重新运行会覆盖部分已替换的外观文件。室内均为教学示意，不是可实际参观的测绘复原。

太阳系页面可从“探索实验室”或首页进入。渲染依赖放在 `frontend/vendor/` 的 Three.js 0.186.0，许可证见 `frontend/vendor/THREE-LICENSE.txt`。3D 场景需要浏览器支持 WebGL。语音质量取决于设备安装的中文语音；页面会优先选择可用的自然语音，并以一段完整讲解朗读。

地月实验室可从“探索实验室”或首页进入。月相约 29.5 天的循环与八种月相参考 [NASA 月相说明](https://science.nasa.gov/moon/moon-phases/)；潮汐两侧隆起的概念参考 [NOAA 潮汐教学资料](https://oceanservice.noaa.gov/education/tutorial_tides/tides03_gravity.html)。模型是教学示意，实际海岸潮位还受到海岸形状、水深和天气等因素影响。

地月模型使用本地保存的 NASA 图片：地球表面来自 [NASA Earth Observatory Blue Marble: Next Generation](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/)；月球表面来自 [NASA Scientific Visualization Studio CGI Moon Kit](https://svs.gsfc.nasa.gov/4720)。图片在页面中按显示尺寸缩小后用作 3D 贴图，无需运行时访问外部服务。
