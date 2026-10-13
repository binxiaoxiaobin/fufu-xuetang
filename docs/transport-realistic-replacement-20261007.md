# 交通工具馆模型替换记录

已将原十件模型全部替换，并新增探索者运载火箭，共十一件展品。模型采用真实机型/车辆结构或真实比例的游戏展示资产；保留适合平板的几何简化，并非每件都是照片级扫描模型。

## 接入与来源

- 文件位于 `frontend/assets/transport/models/v3-*.glb`，对应封面位于 `covers/v3-*.webp`。
- 展品、尺寸、结构区域、观察任务和许可信息由 MySQL 的 `transport_exhibits` 与 `media_assets` 加载。前端不内置第二份展品目录。
- A320 来自 [amvlab/aircraft-models](https://github.com/amvlab/aircraft-models)，CC BY 4.0。
- 九件模型经 [Objaverse](https://objaverse.allenai.org/docs/objaverse-1.0/) 的公开分发下载，原作者及作品链接见 `frontend/assets/transport/ATTRIBUTION-REALISTIC.md`。已逐一通过 Sketchfab 官方模型 API 再核实 CC BY 4.0；核查结果保存在 `licenses/current-*.json`。
- 火箭来自 [NASA 官方模型页面](https://science.nasa.gov/3d-resources/explorer-jupiter-c-rocket/)，作者 NASA/Michael D. Carbajal。NASA 3D Resources 声明资源免费、无版权限制，仍保留署名和 NASA 素材使用说明。
- 缩减贴图到最多 1024px；合并重复网格，移除源文件中的人物、地面和多余轨道，简化过密几何，移除不用于教学的动画。古典帆船材质重新着色。

## 展示与交互

支持独立长度轴、朝向及高度校准，火箭按高度缩放。镜头根据实际包围盒适应横竖屏，大模型不再被固定的最大取景距离裁掉。修正高分辨率屏幕的画布 CSS 尺寸。

32 个结构观察区域都来自模型真实三角面，区域名称不等同于工程分件。点击可以高亮并定位镜头；没有可验证的关节动画时，使用“找一找”的观察任务，不模拟错误的拆解动作。放大/缩小按钮方便平板操作。选择另一件展品会回到展台，离开后再进入记住选中展品。

## 验证

- 十一件实际 GLB 均载入；32 个结构按钮可用，32 个观察任务能匹配真实区域。
- `verify-realistic-transport.cjs` 校验四种长宽比下取景、底部位置、本地封面与资产预算。每件模型小于 8 MiB、三角面小于 160000、绘制对象小于 90。
- 十一件 GLB 总计 23175908 字节（约 22.1 MiB），只加载当前展品；当前模型的明细见 `artifacts/transport-realistic-validation.json`。
- `verify-model-interactions.cjs` 通过：七件工程模型的结构与20段有限动作、十一件交通模型的32个观察任务，以及24件远古生命模型的内置动画均完成回归检查。
- MySQL 迁移重复执行不会覆盖后续编辑。旧目录与旧数据库记录有本地备份。
- 浏览器验证了横屏 1024×768、竖屏 768×1024；真实 iPad 的 GPU 帧率仍需在设备上验证。

## 维护与回滚

`backend/transport_catalog.py` 的一次性迁移键为 `transport_exhibits_realistic_v3`。旧展品整行备份保存在 `artifacts/transport-catalog-backup-*.json`，旧模型与封面保留。恢复旧行中的描述与媒体 ID 可回滚展品，不删除新素材。

新的资产制作入口为 `scripts/optimize_transport_models.mjs` 和 `scripts/build_realistic_transport_catalog.py`，原始下载记录在 `artifacts/transport-sources/selected.json`。旧 `prepare_transport_assets.py` 生成卡通版目录，不应再次用于生产种子。换新素材后需创建新版本路径/迁移键，重新生成封面、验证许可与预算，再切换数据库。
