# 诗词卡片：完整配图与释义

## 阅读方式

卡片目录仍按数学、语文、英语、科学组织。语文里的诗词保留小卡片，点开阅读窗后默认显示原文；“查看释义”切换到通俗解读，常见篇目另有词语提示。“听朗诵”始终播放诗词原文，切换释义不打断朗诵。

原文、释义和朗诵在正文上方同排显示；阅读较长宋词时控制栏随滚动保持可见，不必翻到文末才能切换内容或停止播放。关闭按钮保留独立空间。

插图采用完整比例，不再用 `object-fit: cover` 裁切。图片底部渐渐融入米白色卡片，不设生硬的横向分界。每首诗单独生成一幅贴合全文情境的水彩绘本配图，不继续共享八张通用风景。

## 数据与素材

- 原文与完整卡片记录：`content/learning/poetry-cards.json`，200 首唐诗、100 首宋词。
- 原创通俗解读：`content/learning/poetry-explanations-1.json` 至 `-6.json`，共 300 首；45 首附词语提示。
- 最终图片：`frontend/assets/learning/poetry/individual/poem-*.webp`。保留原构图，等比缩小到 720×480 范围内，不裁切。
- 朗诵：`frontend/assets/audio/learning-poetry/`，舒缓合成朗诵，非真人录音。
- 每首配图提示词与生成来源：`artifacts/poetry-individual/poem-*.json`。使用内置 imagegen，逐首独立生成。原始 PNG 位于默认生成目录，线上运行使用项目内 WebP，不依赖该目录。
- MySQL：`learning_reading_cards.explanation_json` 保存释义；图片、音频关联 `media_assets`。新增字段采用幂等迁移，不删除历史内容。

古典原文来自 [chinese-poetry](https://github.com/chinese-poetry/chinese-poetry)，保留 MIT 许可说明。此次去除了近似重复版本、纠正部分作者和朝代标注，并校正《一剪梅》《清平乐·村居》等常见篇目的明显文字错误。释义为项目通俗解读，不复制现代译注。

## 性能

目录每页只返回 24 张卡片的摘要；正文、释义与音频地址在点开阅读窗时查询。图片懒加载并预留比例。使用系统字体，不增加三维渲染器。关闭阅读窗或离开页面时停止朗诵，沿用现有音频缓存上限。

## 维护流程

`scripts/finalize_individual_poetry.py` 合并解释与已完成的图片，并原子更新卡片 JSON；随后运行 `scripts/import_reading_cards.py` 导入本地 MySQL。不要直接重新运行最初的选集脚本覆盖已经整理的释义及独立图片。

`scripts/audit_poetry_cards.py` 验证 300 张独立图片的路径与哈希、全部详情与媒体地址、分页完整性和数据库内容一致性。`scripts/poetry_contact_sheets.py` 生成完整构图的带标题预览表，供人工核对诗意。

## 验证记录

- 已验证：释义切换、原文隐藏与恢复、播放和停止反馈、图片自然比例与 contain 展示。
- 已验证：768×1024、1024×768、390×844 页面没有横向溢出。
- 独立图片完成数和最终接口审计结果分别记录在 `artifacts/poetry-illustration-progress.json`、`artifacts/poetry-cards-verification.json`。
- 最终完成：300 首、300 张不同内容哈希的逐篇图片、300 条释义；图片合计 22,499,714 字节。全部已导入 MySQL。
- 完整审计通过：13 页无遗漏或重复，300 个详情与 600 个图片/音频地址均正常，数据库正文、释义、图片路径与本地清单一致；科学 12 张卡片保留。
- 已通过带题名预览表核对全部配图；真实 iPad 的 Safari 音频和触控体验仍需在设备上确认，响应式检查不等同于实机测试。
