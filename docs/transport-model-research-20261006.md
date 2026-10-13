# 交通工具馆写实资源筛选（2026-10-06）

2026-10-07 更新：十件模型已全部替换，并新增火箭。实施、许可核查与验证记录见 [替换记录](transport-realistic-replacement-20261007.md)。下文保留替换前的筛选过程；文件体积不能证明平板帧率。

## 替换前实现（2026-10-06）

- 十件展品由 MySQL `transport_exhibits` 和 `media_assets` 加载。来源、许可在 `frontend/assets/transport/ATTRIBUTION.md`。
- 客机、螺旋桨飞机、直升机为 3DAssets 通用模型；列车、公路车辆和船为 Kenney 低多边形模型。当前资产不属于完整的写实展品库。
- `engineering-viewer.js` 用水平最长边匹配 `fitLengthM`，统一展示朝向，并根据整个模型包围盒接地、居中。飞机翼展可能成为缩放依据；竖直火箭应按高度缩放。
- 查看器支持 `yawFix`，交通工具适配器目前未向查看器传递独立朝向参数。这是摆放不合适的待验证原因，并非已经通过画面确认的唯一原因。

## 可试装候选

|资源|格式与体积|许可/来源|判断|
|---|---|---|---|
|[amvlab/aircraft-models](https://github.com/amvlab/aircraft-models)：A320、A350、A380、B737、B787|自包含 GLB；GitHub API 核实无标识 A320 为 244.6 KiB，A350 216.6 KiB，B737 170.0 KiB|作者声明 CC BY 4.0，需保留署名、许可链接与修改说明|优先试装真实机型外形；轻量不等于照片级材质，需检查机翼、起落架与近景细节|
|[NASA Explorer Jupiter-C Rocket](https://science.nasa.gov/3d-resources/explorer-jupiter-c-rocket/)|官方 GLB，页面标注 145.87 KB|NASA/Michael D. Carbajal；遵循 NASA 素材使用规则与具体资源说明|优先用于验证竖直火箭展示、接地和高度适配|
|[NASA Saturn V Rocket](https://science.nasa.gov/3d-resources/saturn-v-rocket/)|官方 ZIP，3.15 MB；包内格式尚未检查|NASA 官方资源，遵循素材使用规则|外形辨识度高，适合阿波罗/月球主题；需检查贴图、格式并转换为 GLB|
|[NASA X-57 Maxwell](https://science.nasa.gov/3d-resources/x-57-maxwell/)|官方 GLB，12.69 MB|NASA 官方资源，遵循素材使用规则|可扩展真实实验飞机；原始体积偏大，需优化后再放入平板版|
|[Andrew 的 High-speed train](https://sketchfab.com/3d-models/high-speed-train-7080f07056054b70b5a32cf065f4310c)|页面标注 701.5k 三角形、4K 纹理|作者页面标注 CC Attribution|作者明确说是概念列车，不是真实型号；不建议作为当前写实高铁替换件，也不能标成中国高铁|

NASA 的 [GitHub 资源库](https://github.com/nasa/NASA-3D-Resources) 提供原始资源索引。
SLS Block 1 官方页面当前提供 13.09 MB 的 STL，不能当作带写实材质的 GLB 直接使用。
本轮尚未确定满足真实型号、可再分发、可改造、平板预算的列车最终资产。

## 接入方案

1. 先试装 A320 和 NASA 火箭，保存真实画面对比，再决定是否批量替换。
2. 在展品数据库中记录机身长度轴、高度轴、朝向修正、接地偏移、默认镜头与近景镜头；保持展品按需加载。
3. 飞机按机身长度、列车按车身长度、火箭按高度缩放。静态姿态、动作包围盒和团团参照分开处理，避免动作预留空间使主体过小。
4. 保留模型原始材质，配低对比度环境反射与柔和接地阴影；检查透明玻璃和金属在 iPad 上的实际成本。
5. 素材继续存放 `frontend/assets/transport/models/`、`covers/`、`licenses/`，来源与元数据注册至 MySQL，避免线上热链。
6. 后端现有初始化只允许 CC0、只接受十件展品且已初始化时直接返回；新增 CC BY/NASA 资源和火箭必须使用明确迁移，不能只修改种子 JSON。
7. 为每个新模型重新核对部件和动作。现有名字匹配与动画不能原样承诺可用；只有合适的分件才做起落架、舵面、发动机或级间分离。
8. 建议优化目标为单展品约 1–5 MB、纹理优先 1K/2K、限制像素比；低帧率设备按实际帧率降级。以上是目标，不是已完成的性能测量。

验收应覆盖 1024×768、768×1024、窄屏，旋转后主体不裁切、轮子/喷口接地正确、切换展品释放旧资源，并在真实 iPad 上测试首次加载和持续操作。
