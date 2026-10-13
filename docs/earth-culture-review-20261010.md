# 地球探索：外观观察与历史文化介绍

完成日期：2026-10-10。

本次覆盖地球探索中的 24 个国家卡片与 11 个地标模型。国家介绍围绕具体历史遗产、文化传统与不同社区的经历展开；地标介绍围绕建造背景、原有用途与文化意义展开。地图定位、筛选和模型外观保留。

## 已移除的参观流程

删除进入/退出建筑、模型上的入口热点、门扇点击检测与开门动画、室内空间切换、火山剖面入口、室内路线、现场照片切换、照片拖动缩放及相关样式、目录模块。删除只用于这些流程的旧照片研究/导入脚本，外观 Blender 构建脚本也不再生成室内模型。

外观仍可旋转、缩放、选择细节观察角度、恢复完整外观和全屏。模型署名与许可链接保留。原有素材文件未批量删除，以免影响其他内容；移除后的室内素材不会被地球探索加载。

## 内容与音频

24 个国家：中国、日本、印度、泰国、蒙古国、印度尼西亚、澳大利亚、新西兰、埃及、肯尼亚、南非、法国、英国、德国、意大利、西班牙、俄罗斯、美国、加拿大、墨西哥、巴西、阿根廷、智利、秘鲁。

11 个地标：长城烽火台、富士山、泰姬陵、胡夫大金字塔、曼谷大皇宫、埃菲尔铁塔、大本钟与伊丽莎白塔、自由女神像、悉尼歌剧院、罗马斗兽场、里约基督像。

正文、历史要点、资料链接和外观观察配置存入 MySQL 的 `earth_culture_entries`，配音通过 `audio_asset_id` 关联 `media_assets`。前端通过 `/api/geography/culture` 加载同一份数据，原来的国家/建筑介绍不再作为前端备用文案。

35 段新配音均已生成，存放在 `frontend/assets/audio/earth-culture/`。使用与项目现行中文配音一致的 Xiaoxiao 声线、-10% 语速、-4Hz 音调。文本和音频在同一数据库事务中发布，正文变化后需要重新生成音频并更新迁移版本。播放使用统一音频管理器；切换国家和离开页面会取消当前朗读。

`backend/seed_data/earth_culture.json` 是审核后的导入源；录音生成、数据库发布与检查分别使用 `scripts/generate_earth_culture_audio.py`、`scripts/publish_earth_culture.py`、`scripts/verify_earth_culture.py`。音频生成支持复用已有的内容哈希文件，并与全站语音生成共享清单锁。

## 资料核对

介绍为儿童改写的原创文案，不直接复制资料。每个国家与地标都有自己的官方资料链接，显示在相应介绍下方。主要资料：

- [UNESCO 各国世界遗产目录](https://whc.unesco.org/en/statesparties/)：核对国家的文化遗产线索。
- [长城](https://whc.unesco.org/en/list/438/)、[富士山](https://whc.unesco.org/en/list/1418/)、[泰姬陵](https://whc.unesco.org/en/list/252/)：历史、文化身份与建筑用途。
- [埃菲尔铁塔官方历史](https://www.toureiffel.paris/en/the-monument/history)：1889 年世界博览会与工程团队。
- [英国议会钟塔历史](https://www.parliament.uk/about/living-heritage/building/palace/big-ben/building-clock-tower/key-dates-/)：大本钟名称和哥特式复兴建筑背景。
- [曼谷大皇宫官方历史](https://www.royalgrandpalace.th/en/discover/history)：1782 年与曼谷新都的关系。
- [埃及古迹部门：胡夫大金字塔](https://egymonuments.gov.eg/monuments/the-great-pyramid/)：王室陵墓与古埃及历史。
- [美国国家公园管理局：自由女神像](https://www.nps.gov/stli/learn/statue-of-liberty-facts.htm)：法国赠礼、设计团队与揭幕时间。
- [悉尼歌剧院](https://whc.unesco.org/en/list/166/)、[罗马历史中心](https://whc.unesco.org/en/list/91/)、[里约文化景观](https://whc.unesco.org/en/list/1100/)：建筑历史与文化意义。
- [新西兰国家博物馆：毛利文化](https://www.tepapa.govt.nz/digital-museum/explore-digital-museum/maori)：文化传承与社区记忆。

## 验证结果

数据库返回的 35 项内容与导入源完全一致；35 个 MP3 均可解码并通过服务读取；11 个 GLB 均有有效的网格、场景及观察角度配置，且通过服务读取成功。

浏览器中逐个打开了 11 个模型，均能加载，页面无进入或照片切换按钮。验证了长城局部观察与完整外观、铁塔全屏进入/退出、朗读后返回地球仪。原有“离开页面取消语音”回归检查通过，包括延迟语音请求及 iPad 音频上下文恢复的情况。

外观构建脚本通过语法检查；未运行 Blender 重新构建，因为本次不修改外观模型几何。浏览器验证是在电脑上进行，不代表已在真实 iPad 上完成操作测试。

服务已重新加载，仍运行在 8000 端口。
