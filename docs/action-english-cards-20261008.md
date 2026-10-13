# 动作英语：黏土动图卡片

入口：首页 → 学习小工具 → 动作英语。

根据用户提供的参考，改为手部与物品的近景演示，共 35 个动作，按小手动作、推拉开关、手工、生活本领、亲切动作分成七组。每张包含循环动图、英文、中文、单词录音与例句录音。原来的整个人物 SVG 方案已退出页面。

## 素材与来源

使用内置 imagegen 生成原创黏土风格四帧素材，模式为参考图风格生成；没有复制参考海报中的图片和文字。每个动作生成一张 2×2 四帧图，再裁切、缩放、编码为 320×320 循环 WebP。这里是简短逐帧动图，并非视频或连续三维动画。挥手使用两个有效姿态交替，排除了生成图中镜像的手势。

- 动图与静态封面：frontend/assets/learning/actions-clay/，70 个 WebP。
- 单词与例句：frontend/assets/audio/learning-actions-clay/，70 个 MP3；Jenny 英语发音，适当减速。
- 原始图与逐帧检查：artifacts/actions-clay-originals/。
- 每个动作的完整生成提示词和来源路径：artifacts/action-clay-generation-manifest.json。
- 导入内容：content/learning/action-words.json。
- 转换工具：scripts/prepare_clay_action_sprite.py；录音工具：scripts/prepare_action_audio.py。

## 数据与运行

页面通过 /api/learning/action-cards 从 MySQL 加载内容。learning_action_cards 存储文案、分组、排序和发布状态，并通过外键关联 media_assets 中的封面、动画及录音。新增字段 animation_asset_id；迁移键为 learning_clay_action_cards_v1。

首次迁移更新原型中的同名单词，并归档旧的八张整个人物动作卡，不删除旧记录。随后启动只补充缺失内容和空音频链接，保留数据库已修改的文案、排序和状态。

可见卡片自动无声循环，每次最多 15 张；滚出视野切回封面。点击卡片播放单词，点击“听例句”播放句子，每次只有一条语音。离开页面、切换卡片或进入后台时停止语音；后台暂停动画。系统设置减少动态效果时使用静态封面。首页不预取全部素材，不增加三维渲染器。

## 验证与部署

已验证 35 张卡片、单词与例句播放、切换播放停止、滚动暂停、卡片页切换，以及 768×1024、1024×768、390×844 的布局，无横向溢出，卡片按钮至少 44px。桌面平板尺寸预览不等于真实 iPad Safari 现场测试。

部署需携带两个素材目录、action-cards-clay.js/css、后端 action_cards.py 和 action_cards_clay.py、内容 JSON。数据库备份包含 learning_action_cards、media_assets 和 content_migrations。原始生成 PNG 与检查图归档在 artifacts 中，无需作为前端素材发布。

## 2026-10-09 扩展

新增 pour、stir、scoop、spread、peel、wash、wipe、brush、zip、stack 共十个动作；厨房小帮手、照顾自己两个新分组。35 张卡片都直接展示英文例句和中文翻译，句子区域可点读，播放时边框和状态文字反馈。平板每行三张、手机两张，大屏每行五张，句子自动换行。新增完整提示词与素材来源见 artifacts/action-clay-expansion-20261009.json，使用内置 imagegen；原始图与动图仍按既有目录归档。

本次校验：35 对句子与翻译、140 个本地素材完整；40 个新增素材 HTTP 加载及 MIME 正确。新增录音播放、单次仅一条语音、离开清理通过。校验记录：artifacts/action-clay-verification-20261009.json；平板预览：artifacts/action-sentences-ipad-20261009.png。
