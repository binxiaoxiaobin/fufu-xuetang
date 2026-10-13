# 愚者宫殿（A Palace for Fools）

原作：Jani Nykänen，2019。[在线原版](https://jani-nykanen.itch.io/a-palace-for-fools)，[原始源码](https://github.com/jani-nykanen/a-palace-for-fools)。

## 本地适配

使用原版 JavaScript 引擎、三张年代地图、全部美术、音效与音乐，没有重写玩法。中文名为“愚者宫殿”，接入“游戏乐园 → 精品像素游戏”。完整翻译 88 段剧情、人物对话、道具说明、商店及存档提示，翻译标题和暂停菜单。原作品牌图片、作者署名保留，结尾补充中文文字。

保留 160×144 原始逻辑坐标，画布用两倍分辨率绘制中文字体，让汉字在放大的像素画面中保持可读。补充响应式画布、触屏按键、暂停、静音与全屏入口；暂停时冻结游戏和转场，清除按键，避免恢复时继续移动。修复原作阻止方向键滚动的索引错误，鼠标移动不再抢占工具栏焦点。

## 保存

复用学员存档接口，以学习账号 ID 与修订号隔离。原作 `apff_savedata` 改接账号内存缓存，浏览器全局 localStorage 不保存孩子的进度。每 15 秒、隐藏页面及返回时，按原作 SaveManager 序列化装备、收集物、机关与最近检查点，再同步到 MySQL。不是随时保存当前位置；重新打开后，在标题菜单选择“继续冒险”，从最近存档点出发。

进入新冒险前增加确认，避免覆盖已有进度。存档点仍可手动保存，服务器保存失败时保留游戏并允许重试返回。游戏不发放学习积分。

## 构建与许可

原始完整源码压缩包位于 `upstream/a-palace-for-fools.zip`；SHA256 与翻译数量记录在 `adaptation/build-report.json`。构建输入解压到 `artifacts/palace/a-palace-for-fools-master/`，运行 `scripts/build_palace_port.py` 生成运行目录，再运行 `scripts/build_itch_storage.cjs` 生成账号存档连接。汉化数据与主机页保存在 `adaptation/`。

原仓库没有声明代码或素材的授权许可，本项目保留原版权和署名，仅作当前项目本地适配，不授予原作新的许可。Howler.js 保留 MIT 标识；中文字体来自 Noto Sans SC（SIL OFL），静态子集改名为 Fufu Palace Chinese，保留完整 OFL。运行目录包含 `LICENSE.txt` 和 `FONT-OFL.txt`。

## 验证

`scripts/test_palace_port.cjs` 实际走过音频选择、标题、中文剧情、新游戏、移动跳跃、暂停菜单和触屏操作，检查真实原作检查点序列化、保存失败后重试、重开后继续存档。`scripts/test_itch_launcher.cjs` 检查游戏目录启动、全屏及启动前返回；`scripts/test_itch_database.py` 以回滚事务检查数据库存档、修订冲突、学员隔离、无积分奖励和已删除游戏拒绝访问。画面与结果位于 `artifacts/palace/tests/`。
