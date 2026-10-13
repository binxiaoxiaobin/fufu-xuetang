# Starcatcher 本地汉化移植

本目录记录 Starcatcher（追星小旅人），使用作者原版程序与素材。汉化关卡提示和外层界面，保留 24 个挑战关卡及结尾场景。支持键盘、触屏、全屏、暂停及按学员保存；继续时从当前关卡起点开始，不发放学习积分。

原作来自 Escada Games，代码 GPL-2.0。公开源码未包含美术、音频，资源使用作者 itch.io 发布包，原始发布包与源码归档保存在 `content/games/starcatcher/upstream/`。来源及许可保存在游戏目录的 `LICENSE.txt`。中文字体基于 SIL OFL 的 Noto Sans SC，改名为 Fufu Game Chinese，保留 `FONT-OFL.txt`。

构建输入位于 `artifacts/itch-ports/`。运行 `scripts/build_itch_ports.py` 重打 Godot PCK，保留原 JS/WASM 与游戏素材；运行 `scripts/build_itch_storage.cjs` 生成学员存档连接代码。汉化数据、主机页面、保存桥接和字库位于本目录。

存档写入 MySQL `toy_game_saves`，使用学员 ID 与修订号保护账号隔离。返回前等待服务器保存，失败时保留游戏供重试。实际浏览器检查覆盖启动、游玩、暂停、全屏及保存返回；数据库事务测试覆盖存档修订、学员隔离和已删除游戏的拒绝访问。

原 Astra 跳跃冒险、坦克大战及经典跳跃已删除。Butano Fighter 和 YKnytt 按用户要求移除，包括入口、运行资源、源码归档、专用构建工具与存档记录。
