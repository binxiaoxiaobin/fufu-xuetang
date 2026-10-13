# 福福学堂 · Toy2Game 改编

原作：https://github.com/asmoyou/toy2game

采用源码快照：39078515a13331a748e63bc75424ed83c773a72a。改编日期：2026-10-06。

六款游戏作为福福学堂游戏乐园的独立入口，沿用原作规则与模型；原有五款小游戏收进“经典小游戏”。默认小兔、太空人、翻棋、青蛙与企鹅均可与电脑游玩。移车出库提供 120 个关卡。

## 资源与数据

- `frontend/assets/games/toy2game/`：本地构建、封面、许可证和依赖声明；进入游戏才加载相应资源。
- `source/`：保留完整改编源码、原作署名、每款游戏 README 和锁定依赖文件。
- `backend/seed_data/toy_games.json`：游戏目录的导入源，正式目录从 MySQL 加载。
- `parking-levels.json`：关卡导入源；游戏初始化从 MySQL 接口读取关卡。
- MySQL `toy_games`、`toy_game_levels`、`toy_game_saves`、`toy_game_rewards`：目录、关卡、按学员保存的存档、每天的积分奖励。

移车、翻棋、小兔支持进度恢复；企鹅、太空人、青蛙保存设置，重新打开开始新的一局。退出会先保存，再卸载游戏 iframe；切换学员会关闭旧游戏。采用存档版本锁，避免多个页面相互覆盖。保存失败有提示，不能伪装为已保存。

移车通关由后端核对完整的合法移动路径，每天最多奖励 5 积分，积分流水和存档同事务写入。其余游戏暂不奖励积分。

系统字体替代额外字体下载；降低移动设备渲染分辨率与阴影分辨率，适配嵌入区域高度。平台动作与物理规则未改变。

## 重新构建与部署

安装 Node >=22 与 npm、Python >=3.8，项目根目录运行 `python scripts/build_toy_games.py`。该脚本安装锁定依赖、构建六个工作区、运行规则测试、发布静态资源和依赖声明。

部署时保留 `frontend/assets/games/toy2game/`、`backend/seed_data/toy_games.json`、`content/games/toy2game/parking-levels.json`。设置 MySQL 环境变量后启动 `backend/server.py`，启动时会创建新增表并导入目录与关卡。无需独立游戏端口或 Node 常驻服务。

## 许可

原作为 Toy2Game Noncommercial License 1.0。个人、家庭和非商业教学按原许可使用；收费、广告或其他商业场景需要作者另行书面授权。完整许可位于发布目录 `LICENSE.txt`，依赖许可位于 `THIRD_PARTY_NOTICES.txt`。改编不代表原作者官方发布。

## 验证

六款生产构建与 247 项上游目录、规则及物理测试通过。`scripts/test_toy_games_database.py` 在回滚事务中验证存档隔离、冲突保护、关卡读取及通关奖励；不留下测试档案。浏览器使用真实页面操作检查画面和入口；桌面浏览器的平板尺寸验证不能替代真实 iPad 硬件验证。
