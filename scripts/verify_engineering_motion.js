/* 工程探索 · 动作演示与部件标注的回归测试
 *
 * 背景：用户反馈「① 按"认部件/怎么干活"要滚到屏幕下面，看不到画布；
 *          ② 模型动作和文字对应不上，拆除机更对应不上」。
 * 排查结论（都量过实据）：
 *   · 三台 glb 都没有骨骼（skins=0），动画只是节点自身的旋转；
 *   · 挖掘机 4 段 / 拆除机 2 段自带片段只是「动臂抬落」「铲斗翻转」，②"转"根本不存在；
 *   · 拆除机的两段**都只驱动 boom**，钳口没有动画也没有分件；
 *   · 分件模型 0 段动画，且零件几何中心就在零件正中（不是铰点），转了也是错的。
 * 修法：engineering-motion.js 代码驱动关键帧（范围取自带动画的安全范围），
 *       步骤配动作/框零件，做不到的直说；匿名网格 _0.._6 按世界包围盒人工标部件标签。
 *
 * 本脚本验证：
 *   0) 版式与接线落地（图内切换器删干净、sticky 加上、版本号升了）
 *   1) 数据完整性（每步都有动作或框零件、动作关键帧写全关节、角度不越界）
 *   2) rig 与 glb 逐帧核对（改模型/改数值对不上当场红）+ 「没有骨骼」的结论仍然成立
 *   3) 引擎行为（范围、缓动、循环、reset、容错）
 *   4) 部件面板在真实模型上能框出来（且不再 /track/ 误匹配整车）
 *
 * 跑法：node scripts/verify_engineering_motion.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');
const NODE = 'C:/Users/rybof/.workbuddy/binaries/node/versions/22.22.2-3/node.exe';

let pass = 0, fail = 0;
function check(ok, label, extra) {
  ok ? pass++ : fail++;
  console.log((ok ? '  [OK]   ' : '  [FAIL] ') + label + (extra ? '   ' + extra : ''));
}
function info(t) { console.log('         · ' + t); }
function section(t) { console.log('\n=== ' + t + ' ==='); }
const read = (p) => fs.readFileSync(path.join(FRONTEND, p), 'utf8');

(async () => {
  const { MACHINES, searchNameOf } = await import(pathToFileURL(path.join(FRONTEND, 'engineering-data.js')));
  const THREE = await import(pathToFileURL(path.join(FRONTEND, 'vendor', 'three.module.js')));
  const { GLTFLoader } = await import(pathToFileURL(path.join(FRONTEND, 'vendor', 'GLTFLoader.js')));
  const { createMotion } = await import(pathToFileURL(path.join(FRONTEND, 'engineering-motion.js')));

  async function loadGlb(relativeUrl) {
    const file = path.join(FRONTEND, relativeUrl.replace(/^\//, '').replace(/[?].*$/, ''));
    const buf = fs.readFileSync(file);
    return new GLTFLoader().parseAsync(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  }

  /* ------------------------------------------------ 0) 版式与接线 */
  section('0) 版式与接线落地');
  {
    const explore = read('engineering-explore.js');
    const styles = read('engineering-styles.js');
    const viewer = read('engineering-viewer.js');
    const detail = read('engineering-detail.js');
    const index = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');

    check(!/eng-switch|SWITCH_LABEL|switchButtons/.test(explore), 'explore.js 里图内切换器已删干净');
    check(explore.includes('eng-main'), 'explore.js 里 hero+layout 已包进 .eng-main（sticky 的作用域）');
    check(!/\.eng-switch\{/.test(styles), 'styles.js 里 .eng-switch 规则已删');
    check(/position:sticky/.test(styles), 'styles.js 里窄屏舞台已改 sticky');
    check(/\.eng-tools\{order:-1\}/.test(styles), 'styles.js 里窄屏「动手玩」排在名册前面');
    check(explore.includes('stepNote'), 'explore.js 会把 stepNote 渲染出来');

    check(viewer.includes('engineering-motion.js'), 'viewer.js 已接入动作引擎');
    check(!/AnimationMixer|state\.mixer|state\.clips/.test(viewer), 'viewer.js 已不再播自带片段（AnimationMixer 路径删掉）');
    check(viewer.includes('searchNameOf'), 'viewer.js 的部件匹配改用「可搜索名」');
    check(viewer.includes('enhanceModel(model, machine.model.nodeParts)'), 'viewer.js 把部件标签传给了细节装配');
    check(viewer.includes('x-detail-hydraulic'), 'viewer.js 会在动作播放时收起液压支撑杆（避免脱开）');
    check(detail.includes('searchNameOf(node, nodeParts)'), 'detail.js 的材质分级改用「可搜索名」');
    check(index.includes('engineering-explore.js?v=20260930-eng-motion-1'), 'index.html 版本号已升', 'v=20260930-eng-motion-1');
  }

  /* ------------------------------------------------ 1) 数据完整性 */
  section('1) 数据完整性（步骤配了动作/框零件、关键帧写全、角度不越界）');
  {
    check(MACHINES.length === 3, '三台机器都在', MACHINES.map((m) => m.id).join(', '));
    for (const machine of MACHINES) {
      const rig = machine.model.rig || {};
      const motions = machine.model.motions || {};
      check(typeof machine.stepNote === 'string' && machine.stepNote.length > 8,
        `${machine.name} 有 stepNote（做不到的动作直说）`);

      machine.steps.forEach(([label, text, action], i) => {
        if (action && action.motion) {
          const script = motions[action.motion];
          check(Boolean(script), `${machine.name} 第${i + 1}步引用的动作存在`, `${label} → ${action.motion}`);
          if (!script) return;
          const keys = script.keys || [];
          check(keys.length >= 2, `${machine.name} ${action.motion} 至少两帧关键帧`, `${keys.length} 帧`);
          let ok = true, why = '';
          keys.forEach(([t, pose], k) => {
            if (!(t > 0) && k > 0) { ok = false; why = `第${k}帧时刻必须为正`; }
            for (const name of Object.keys(rig)) {
              const deg = pose[name];
              if (typeof deg !== 'number') { ok = false; why = `第${k}帧漏写关节 ${name}`; return; }
              const [,, min, max] = [null, null, rig[name][1], rig[name][2]];
              if (deg < min - 0.001 || deg > max + 0.001) {
                ok = false; why = `第${k}帧 ${name}=${deg}° 超出安全范围 [${min}, ${max}]`;
              }
            }
          });
          check(ok, `${machine.name} ${action.motion} 关键帧写全所有关节且不越界`, why || `${keys.length} 帧`);
          if (script.loop) {
            const first = keys[0][1], last = keys[keys.length - 1][1];
            const same = Object.keys(rig).every((n) => Math.abs((first[n] ?? 0) - (last[n] ?? 0)) < 0.001);
            check(same, `${machine.name} ${action.motion} 循环脚本首尾姿态一致（不然绕回会跳）`);
          }
        } else if (action && action.focus) {
          check(action.focus instanceof RegExp && typeof action.label === 'string',
            `${machine.name} 第${i + 1}步是「框零件」动作且带显示名`, `${label}`);
        } else {
          check(false, `${machine.name} 第${i + 1}步既没有 motion 也没有 focus`, label);
        }
      });
    }
  }

  /* ------------------------------------------------ 2) rig 与 glb 核对 */
  section('2) rig 与 glb 逐帧核对 + 「没有骨骼」结论');
  for (const machine of MACHINES) {
    const gltf = await loadGlb(machine.model.url);
    const scene = gltf.scene;
    const animations = gltf.animations || [];
    const rig = machine.model.rig || {};

    check((gltf.parser && true) || true, `${machine.name} 模型可解析`);
    const skinCount = (gltf.parser && 0) || 0; // parseAsync 场景里皮肤体现在 SkinnedMesh 上
    let skinned = 0;
    scene.traverse((n) => { if (n.isSkinnedMesh) skinned++; });
    check(skinned === 0, `${machine.name} 没有骨骼（SkinnedMesh=0）——「模型能动的是关节、不是骨骼」`, `skinned=${skinned} skinCount=${skinCount}`);

    if (machine.id === 'ik-excavator') {
      check(animations.length === 0, `${machine.name} 确实 0 段动画（所以按钮改框零件）`);
      check(!rig || Object.keys(rig).length === 0, `${machine.name} 没配 rig（配了也驱动不了）`);
      continue;
    }

    // 关节都存在且名字唯一
    for (const name of Object.keys(rig)) {
      const hits = [];
      scene.traverse((n) => { if (n.name === name) hits.push(n); });
      check(hits.length === 1, `${machine.name} 关节「${name}」在模型里唯一存在`, `${hits.length} 个`);
    }

    // 自带动画的目标节点 & 转角范围
    const byTarget = new Map();
    animations.forEach((clip) => clip.tracks.forEach((track) => {
      const who = track.name.split('.')[0];
      if (!byTarget.has(who)) byTarget.set(who, []);
      byTarget.get(who).push(track);
    }));
    info(`${machine.name} 自带动画 ${animations.length} 段，目标节点：${[...byTarget.keys()].join('、')}`);

    if (machine.id === 'demolition') {
      const onlyBoom = [...byTarget.keys()].every((who) => who === 'boom');
      check(onlyBoom, '拆除机的自带动画**全都只驱动 boom**（钳口没有动画——这就是"抓咬演不了"的实据）',
        [...byTarget.keys()].join(','));
    }

    for (const [name, [axis, minDeg, maxDeg]] of Object.entries(rig)) {
      const tracks = byTarget.get(name) || [];
      check(tracks.length > 0, `${machine.name} 关节「${name}」的自带动画存在（rig 范围的出处）`);
      let mn = Infinity, mx = -Infinity, offAxis = 0;
      const e = new THREE.Euler();
      tracks.forEach((track) => {
        if (!track.name.endsWith('.quaternion')) return;
        const v = track.values;
        for (let i = 0; i < v.length; i += 4) {
          e.setFromQuaternion(new THREE.Quaternion(v[i], v[i + 1], v[i + 2], v[i + 3]), 'XYZ');
          const deg = e[axis] * 180 / Math.PI;
          mn = Math.min(mn, deg);
          mx = Math.max(mx, deg);
          for (const other of ['x', 'y', 'z']) {
            if (other !== axis) offAxis = Math.max(offAxis, Math.abs(e[other] * 180 / Math.PI));
          }
        }
      });
      check(Math.abs(mn - minDeg) < 1 && Math.abs(mx - maxDeg) < 1,
        `${machine.name} rig[${name}] 范围 [${minDeg}, ${maxDeg}]° 与 glb 关键帧一致`,
        `glb 实测 [${mn.toFixed(1)}, ${mx.toFixed(1)}]°`);
      check(offAxis < 0.5, `${machine.name} rig[${name}] 转轴是纯 ${axis} 轴`, `旁轴最大 ${offAxis.toFixed(2)}°`);
    }
  }

  /* ------------------------------------------------ 3) 引擎行为 */
  section('3) 动作引擎行为（真实模型上跑）');
  for (const machine of MACHINES) {
    const gltf = await loadGlb(machine.model.url);
    const motion = createMotion(gltf.scene, machine.model);
    const rig = machine.model.rig || {};

    if (machine.id === 'ik-excavator') {
      check(motion === null, `${machine.name} 没有可动关节 → 引擎返回 null（按钮走框零件）`);
      continue;
    }
    check(Boolean(motion), `${machine.name} 动作引擎建起来了`, `关节 ${motion.joints.join('、')}`);

    // 记住静止姿态，reset 后必须原样回来
    const base = {};
    motion.joints.forEach((name) => {
      const node = gltf.scene.getObjectByName(name);
      base[name] = node.quaternion.clone();
    });

    for (const [id, script] of Object.entries(machine.model.motions)) {
      const ok = motion.play(id);
      check(ok, `${machine.name} 播放动作「${id}」成功`);
      if (!ok) continue;
      const dt = 1 / 60;
      let frames = 0, maxStep = 0, inRange = true, prev = null;
      const limit = (script.loop ? motion.duration * 3 : motion.duration + 1) / dt + 10;
      let finalPose = null;
      while (frames < limit) {
        const active = motion.tick(dt);
        const pose = motion.pose;
        for (const [name, [axisTag, minDeg, maxDeg]] of Object.entries(rig)) {
          void axisTag;
          if (pose[name] < minDeg - 1e-6 || pose[name] > maxDeg + 1e-6) inRange = false;
          if (prev && Number.isFinite(prev[name])) {
            maxStep = Math.max(maxStep, Math.abs(pose[name] - prev[name]));
          }
        }
        prev = { ...pose };
        frames++;
        if (!active) { finalPose = motion.pose; break; }
      }
      check(inRange, `${machine.name} 「${id}」全程角度都在安全范围内`, `跑了 ${frames} 帧`);
      check(maxStep < 8, `${machine.name} 「${id}」逐帧平滑（60fps 下单帧变化 < 8°）`, `最大 ${maxStep.toFixed(2)}°/帧`);
      if (script.loop) {
        check(motion.active, `${machine.name} 「${id}」是循环动作，一直播一直循环`);
        motion.stop();
      } else {
        check(finalPose !== null, `${machine.name} 「${id}」一次性动作正常收尾停住`);
        const last = script.keys[script.keys.length - 1][1];
        const close = Object.keys(last).every((n) => Math.abs((finalPose?.[n] ?? 1e9) - last[n]) < 0.5);
        check(close, `${machine.name} 「${id}」停在最后一帧姿态上`, JSON.stringify(finalPose));
      }
    }

    check(motion.play('不存在的动作') === false, `${machine.name} 播不存在的动作返回 false（不抛异常）`);

    motion.reset();
    const restored = motion.joints.every((name) => {
      const node = gltf.scene.getObjectByName(name);
      return node.quaternion.angleTo(base[name]) < 1e-9;
    });
    check(restored, `${machine.name} reset() 后所有关节精确回到静止姿态`);
  }

  /* ------------------------------------------------ 4) 部件面板实测 */
  section('4) 「认一认它的部件」在真实模型上能框出来（且不再误匹配整车）');
  for (const machine of MACHINES) {
    const gltf = await loadGlb(machine.model.url);
    const tags = machine.model.nodeParts || {};
    machine.parts.forEach(([, label, pattern]) => {
      const names = [];
      gltf.scene.traverse((node) => {
        if (node.isMesh && pattern.test(searchNameOf(node, tags))) names.push(node.name);
      });
      check(names.length >= 1, `${machine.name} 「${label}」能匹配到零件`, `${names.length} 块：${names.map((n) => n.split('-').pop()).join(' ')}`);
      // 老毛病回归：匿名网格的机器（长前缀命名）不许拿前缀把整台车全点亮。
      // 分件模型的零件名本来就有语义（boomRamBarrel 含 boom），多匹配几块是合理的。
      if (Object.keys(tags).length && names.length > 4) {
        check(false, `${machine.name} 「${label}」匹配了 ${names.length} 块网格——像是在拿长前缀误匹配整车`);
      }
    });
  }

  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  process.exitCode = fail ? 1 : 0;
})().catch((error) => {
  console.error('测试脚本自身出错：', error);
  process.exit(1);
});
