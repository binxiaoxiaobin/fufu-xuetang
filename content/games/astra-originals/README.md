# 原版游戏本地移植

这三款使用获取到的原版源码；不以简化重写版替代原作。

## 来源

- Mosswing：Ayi1337，https://github.com/Ayi1337/gpt6-astra-one-shot-games/tree/main/mosswing
- THUNDERFALL：jackroc，https://github.com/MartinDelophy/awesome-gpt-6-astra/tree/main/works/thunderfall
- IRON BASTION：bandaot 发布的原版公开构建，https://iron-bastion.zecoba.workers.dev/ 。该构建包含 strings、math、levels、renderer、audio、world、game、main 全部源代码。

`source/` 保留未修改的上游快照。`source/SNAPSHOT.json` 记录来源 URL、文件字节数与 SHA-256。
本地运行目录：`frontend/assets/games/astra-originals/`。

## 改动范围

- Mosswing 的英文操作说明和反馈文字改为中文，保留英文品牌字样。
- 雷霆战机和钢铁防线的原版中文玩法保留，补译英文提示。
- 原版引擎、三维场景、物理、关卡、武器、合成声音与触屏输入保留。
- 原作 localStorage 的访问指向独立账号存储适配器；通过既有 toy-games API 保存最高分、战区纪录与设置。不会读取浏览器其他账号或其他模块的 localStorage。
- 从项目返回时先暂停和保存，再销毁 iframe；切换账号时停止旧账号的新存档写入。
- Mosswing 和雷霆战机保存最高分与设置，不保存进行中的一整局；钢铁防线保留原作已完成战区和下一战区记录。
- 保留旧试玩版本的账号存档字段，但不会作为原作存档读取。

## 复现

1. `python scripts/fetch_astra_originals.py` 下载原始快照。
2. `python scripts/build_astra_originals.py` 应用中文文字和账号存储接入。
3. 初始化 `toy_games` 目录数据。

## 许可标注

游戏来源可公开读取，不代表网站目录许可自动适用于所有收录游戏。Mosswing 仓库和 IRON BASTION 构建未发现游戏专属许可证；保留原作者署名与来源，不标记为福福学堂原创或声称原作已获得商业授权。THUNDERFALL 归档来源及其许可以来源仓库声明为准。Mosswing 随附的 Three.js 保留 MIT 许可文件。
