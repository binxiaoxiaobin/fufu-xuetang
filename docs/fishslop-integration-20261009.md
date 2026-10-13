# 海底小鱼乐园接入记录

已接入游戏乐园的“进阶大游戏”，目录标识为 `fishslop`，中文标题为“海底小鱼乐园”。保留原作喂鱼、成长、金币、商店、升级、声呐、幻纱鱼、昼夜及音效玩法，汉化静态页面和动态提示。使用实际中文游戏截图作封面，所有构建资源由本地服务提供。

原作：<https://github.com/vasu-devs/FishSlop_Opus5.5>，版本 `55de15091c789585a5d4ece952f841e6006af138`。上游未声明许可，当前为本地适配；完整来源和第三方说明随源码与输出保留。未进行外部发布或上传。

## 接入与修复

- 游戏目录在后台启动时幂等导入，已导入当前 MySQL；本项目后台已重启，`/api/health` 的服务和数据库检查均通过。
- 按学习账号保存海底进度与昼夜/声音设置，不读取共用 localStorage；保留版本校验和账号切换隔离，游戏不发放学习积分。
- 返回时暂停声音与绘制，等待保存；失败保留页面重试。关闭已保存的 iframe 不重复提交新快照，避免影响下一次打开的版本号。
- 暂停和离开时停止绘制；原作 HUD 的指针层会遮挡拖动视角，已修复。摇杆松手不会残留加速；取消指针、失焦时清除输入。
- 支持可选全屏，退出全屏继续探索。触屏默认低画质，横竖屏按钮可见；中文字体来自设备，移除字体联网请求。

## 验证

- 构建及 TypeScript 检查通过；原作 36 项核心规则测试通过。
- `test_fishslop_storage.cjs`：账号/版本绑定、字段白名单、重复抑制、删除、断网重试、冲突阻断、消息来源、退出快照、失败重试和浏览器返回生命周期通过。
- `test_fishslop_database.py`：真实 MySQL 的目录、保存恢复、两个学员隔离、账号/版本冲突、白名单及零学习奖励通过。测试事务全部回滚。
- `test_fishslop_browser.cjs`：真实生产构建在浏览器中通过中文标题、全屏进出、键盘移动、喂食、声呐、购买、升级、暂停、退出保存失败与重试、恢复和学员切换。该浏览器测试的 API 使用隔离测试数据，不写入用户记录。
- `capture_fishslop_preview.cjs`：模拟平板的喂食、声呐、默认低画质、横屏和竖屏布局通过，已人工检查截图。尚未进行真实 iPad Safari 测试。
- 原有 `test_sunbreak_integration.cjs` 与 `test_kart_integration.cjs` 回归通过。旧 `test_arcade_boot.cjs` 的“companion 控件在脚本后解析”前置断言不符合当前首页结构；该断言在本次没有修改的首页文件上失败，不计为通过。

中文标题和触屏截图保存在 `artifacts/fishslop-title-zh.png`、`artifacts/fishslop-tablet-zh.png`、`artifacts/fishslop-tablet-portrait-zh.png`。维护与重建说明见 `content/games/fishslop/README.md`。
