# 团团原图与家长积分奖励

团团头像改为项目现有建模参考原图 `artifacts/tuantuan-girl/tuantuan-girl-tripo-input.png`，完整复制到 `frontend/assets/characters/tuantuan-original.png`。页面通过样式框选头部，无额外生成图、无低清模型截图。素材登记到 `media_assets`，`scene_media_links` 的 companion/avatar 指向原图，由外观接口加载。原始设定合集仍保留在 `frontend/assets/characters/tuantuan-girl-concept.png`。

家长中心新增奖励积分和必填原因。服务端只允许已登录家长为当前账号绑定的学习者操作，不能用客户端指定其他学习者。每次奖励在一笔事务内更新积分、写入 `ledger`、`parent_point_grants` 和 `admin_audit_logs`，记录操作账号、操作人、金额、原因、时间、前后余额。余额上限与现有后台一致，为 1000000。请求标识按账号唯一，相同请求重试返回原记录，不会重复加分。

流水在家长中心查看，可按记录编号向前分页，不限于原来的最近二十条。新增接口：POST `/api/parent/points/add`、GET `/api/parent/points/ledger?before=...`。奖励表单不改变兑换、学习和游戏积分规则。

验证：`scripts/test_parent_points.py` 在 MySQL 创建未提交的临时数据，检查余额、流水、日志、重复请求、非法数量、原因、账号归属、模拟日志写入失败回滚、历史分页。验证结束整体回滚，无改动已有学习者积分。浏览器检查原图展示、家长奖励表单和历史流水加载；未给真实账号提交测试奖励。
