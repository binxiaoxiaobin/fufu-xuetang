# 太阳系观察台 · 2026-10-06

参考 [ORBIT](https://github.com/ryh842487118-bot/orbit) 的点选飞近、日夜光照与行星层次，
在现有 Three.js 场景生命周期中独立实现。没有引入它的完整宇宙、天气请求、8K 贴图、
全屏后期处理或新的渲染引擎。

- 十个天体（太阳、八大行星、月球）的中文介绍、教学尺寸和纹理关系：MySQL `solar_bodies`。
- 云层、城市夜景、土星环等素材关系：`scene_media_links`，关联共享 `media_assets`。
- 前端读取 `/api/solar/catalog`，不在首页加载这些贴图。切页暂停，冷场景释放 GPU。
- 原始图保存在 `originals/`；应用使用 `frontend/assets/solar/` 的 1024px WebP 变体，
  13 张合计 718,916 字节。来源、原始 SHA-256、尺寸见 manifest.json；署名见 CREDITS.md。
- `backend/seed_data/solar_catalog.json` 是首次数据库初始化的数据源。迁移标记
  `solar_catalog_v1` 防止后续重启覆盖数据库内的介绍。
- 太阳系大小、距离、时间均为教学示意。公转周期用来控制相对快慢，非实时天文历表。

团团头像复用现有角色，压缩变体存放在 `frontend/assets/characters/tuantuan-avatar.webp`，
通过 `/api/companion/appearance` 读取路径。首页关节动作兼容 GLTFLoader 规范化后的骨骼
名称，笑脸 / 眨眼使用小幅局部形变；原始模型和牧场养成数据不作替换。

验证：`scripts/test_companion_motion.mjs` 使用实际 GLB 的骨骼和面部顶点，检查抬手、
点头、表情、恢复姿态与减少动态设置。`scripts/verify_pet3d_throttle.js` 检查不可见暂停
与空闲降帧，`scripts/test_scene_lifecycle.cjs` 检查资源释放与重入。
