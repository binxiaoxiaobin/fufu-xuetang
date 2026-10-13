# 海底小鱼乐园

原作：[Fishslop / vasu-devs](https://github.com/vasu-devs/FishSlop_Opus5.5)。本地适配名为“海底小鱼乐园”，位于团团游戏乐园的“进阶大游戏”。

界面、鱼种介绍、补给商店、装备、等级、教学提示与暂停统计均已汉化；使用系统中文字体，运行时不请求 Google Fonts。三维场景、鱼、纹理和声音由程序生成。保留原作的喂食、成长、收集金币、装备升级、昼夜与声呐玩法。

触屏左手摇杆移动，右手上浮、下潜、加速、声呐和喂食；拖动空白处转动视角。键盘使用 WASD、E/Q、Space、F、Shift、B 和 P。支持可选全屏，退出全屏继续当前探索。触屏默认轻量画质。修复原作 HUD 遮挡拖动、摇杆松手持续加速和失焦残留输入的问题。

## 存档与账号

游戏不直接读写浏览器 localStorage。通过 `/api/toy-games/fishslop/save` 连接现有 MySQL 存档表，按学习账号隔离保存 `fishslop.save.v1` 与 `fishslop.settings.v1`。每五秒、购买、暂停、离开时保存；页面“返回”等待保存成功才销毁游戏。失败保留游戏供重试，409 冲突停止写入，账号切换丢弃旧账号的未提交写入。

游戏内金币不计入学习积分，奖励为 0。存档字段限制与体积限制沿用现有后端；加载时继续使用原作的数值、鱼种和数量校验。

## 源码与构建

- `source/`：保留下载的原始源码及说明。
- `adaptation/`：学员存档桥接与启动入口。
- `chinese.css`：中文排版、触屏与指针层修复。
- `scripts/prepare_fishslop.py`：重建汉化与适配源码到 `artifacts/fishslop-build/`。
- `scripts/build_fishslop.py`：类型检查、构建、发布到 `frontend/assets/games/fishslop/`。
- `backend/seed_data/fishslop_game.json`：游戏目录配置，由后台启动时导入。

首次构建：运行 `python scripts/prepare_fishslop.py`，在生成的构建目录中安装其 `package.json` 声明的依赖，然后运行 `python scripts/build_fishslop.py`。本机复用已有构建依赖；声明的固定版本与本次验证一致。上游 package.json 使用了本机未安装的较新依赖，原文件原样保留，适配构建使用 Three.js 0.185.1、TypeScript 5.9.3、Vite 7.3.7。

## 校验

原作 36 项核心测试通过。新增 `scripts/test_fishslop_storage.cjs` 检查账号/版本绑定、白名单、删除、重复抑制、断网重试、冲突及消息来源。`scripts/test_fishslop_database.py` 在真实 MySQL 的回滚事务内验证保存恢复、学员隔离、冲突与零奖励；密码从环境读取，不写入文件。`scripts/test_fishslop_browser.cjs` 使用真实构建、浏览器渲染与输入，API 测试数据不会写入用户记录。

上游没有声明授权许可，本地适配不代表取得分发或商业授权。来源、改动与第三方许可见 `ATTRIBUTION.txt`、`provenance.json` 和构建输出的 `THREE-LICENSE.txt`。
