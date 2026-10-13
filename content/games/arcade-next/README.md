# 四款游戏的本地适配

保留各原作玩法、图像、音乐和关卡，入口位于 `frontend/assets/games/`。原始源码包保存在 `content/games/<游戏名>/upstream/`，中文文本、宿主页面和桥接层集中在本目录。

| 游戏 | 原作 | 本地入口 | 进度范围 |
| --- | --- | --- | --- |
| 小间谍 | [Little Spy](https://github.com/wimpysworld/little-spy) | little-spy | 原版 6 关，从当前关卡起点继续 |
| 打字守卫 | [Taipo](https://github.com/rparrett/taipo) | taipo | 词表与音量；每次打开新的一局 |
| 推箱子世界 | [SokoWorld](https://github.com/brettchalupa/sokoworld) | sokoworld | 原版 3 个关卡包、73 关，保存当前棋盘、撤销记录及通关记录 |
| 风景拼图 | [open-jigsaw](https://github.com/code4fukui/open-jigsaw/tree/opendata_ver) | open-jigsaw | 16 张风景，各有 9/16/25 块；图片与难度分别保存，兼容旧版单图存档 |

存档使用学习账号对应的服务器接口和版本号；原生运行时的浏览器存储被替换为该游戏的内存缓存。不会复用其他账号或游戏的浏览器存档。返回前等待保存完成，失败时保留页面并允许重试。

Taipo 的英文、日语练习词以及罗马音输入规则保留原文，首次使用英语。SokoWorld 的游戏界面已汉化，Usagi 高级设置菜单暂保留英文。Little Spy 的关卡快照保留本关开始时的得分、生命与降落伞数量。

## 构建与验证

`scripts/build_arcade_next.py` 从已下载的原版资料构建四款；`scripts/build_itch_storage.cjs` 生成账号存储桥接。Taipo 只替换验证过的 WASM 数据段中定长界面文字，并记录字节位置，保持地址与代码不变。Little Spy 使用原版 Godot 运行时和资源包，替换中文脚本、界面文字并增加存档桥接。SokoWorld 使用原作 Lua 代码与 Usagi 1.3.3 网页运行时。

验证脚本包括 `test_arcade_next.cjs`、`test_arcade_next_play.cjs`、`test_arcade_next_mobile.cjs`，以及目录启动和数据库存档测试。实际游玩检查覆盖动作移动、推箱子通关与继续、拼图拖动完成及三档难度、打字塔防的行动输入与暂停。数据库检查使用回滚事务，不留测试账号。

## 来源与许可

各游戏网页目录保留 `UPSTREAM-LICENSE.txt`、`LICENSE.txt` 和相关运行时许可证；原始素材作者说明、关卡包许可证保留在源码包中。Little Spy 与 Taipo 代码采用 MIT；SokoWorld 代码采用 Unlicense，但原音效限非商业使用。Taipo 的 BrowserQuest 素材采用 CC-BY-SA 3.0。中文字体为 Noto Sans SC 的子集，保留 SIL OFL，并使用独立字体名称。

拼图代码采用 MIT。照片为 [FIND47「禅」· F_Photo](https://find47.jp/ja/i/NghAs)，采用 [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/)，进行了缩放、重新切块及 WebP 转换，页面保留摄影署名。使用源码包中的完整照片修正原切块素材的排列问题。

2026-10-10 新增 15 张项目省份图库中的风景照片，来源记录沿用 `backend/seed_data/province_photos.json`。完整选图表为 `jigsaw-pictures.json`；生成的 `PICTURE-CREDITS.json` 和 `PICTURE-LICENSES.txt` 逐张记录作者、原图链接与 CC 许可。照片的相同方式共享条款保留在各照片及切块上，不影响独立游戏代码的 MIT 许可。存档版本 2 使用 `boards[图片ID:难度]` 保存各个棋盘，旧版棋盘迁入雪中森林的对应难度。
