// 工程探索 · 「它怎么干活」的动作演示引擎（2026-09-30 新增）
//
// 为什么不用模型自带的动画片段——先把量出来的事实摆在这：
//   · 三台模型都没有骨骼（glTF skins = 0），所谓动画全是"节点自身的旋转"；
//   · 履带挖掘机 4 段、高空拆除机 2 段，内容只是「动臂抬/落」「铲斗翻/收」的孤立片段；
//   · 两台的「上半身回转」都做不了——上半身和底盘焊在同一个节点上，没有回转关节；
//   · 拆除机连液压钳的开合都没有（钳口是一整块网格，没有分开的钳臂）；
//   · 分件模型（ik-excavator）干脆 0 段动画，零件几何中心就在零件正中，不是铰点。
// 旧做法是第①步播 boom-open、第②步播 boom-close……文字说"转"、画面在举臂，
// 这就是"动作对应不上"的根源。
//
// 所以改成**代码驱动**：每个关节的转轴和角度范围都取自 glb 自带动画的关键帧
// （那是作者摆好的安全范围，在这个范围内插值不会穿地、不会散架），
// 然后给每一步写关键帧——文字说什么，画面就动什么；
// 模型物理上做不到的动作，界面直接说明，绝不硬演。
//
// 数据约定（engineering-data.js 里 model.rig / model.motions）：
//   rig:     { boom: ['x', -32, 0], bucket: ['x', 0, 54] }   轴 + 最小/最大角度（度）
//   motions: { dig: { keys: [[秒, { boom: 度, bucket: 度 }], ...], loop?: true } }
//   ⚠️ 每个关键帧必须写全 rig 里的**所有**关节（漏写的会被当成 0 度）。
import * as THREE from './vendor/three.module.js';

const AXIS = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};
// 缓动：两端慢中间快，比线性自然
const smooth = (u) => u * u * (3 - 2 * u);
// 从"当前姿态"平滑并进脚本第一帧所用的时间（秒）
const ENTRY = 0.3;

export function createMotion(model, spec) {
  const rig = spec?.rig;
  const motions = spec?.motions;
  if (!rig || !motions) return null;

  const joints = new Map();
  for (const [name, jointSpec] of Object.entries(rig)) {
    const [axis, minDeg, maxDeg] = jointSpec;
    const node = model.getObjectByName(name);
    // 模型换了、关节没了：宁可整台不动，也不半边乱转
    if (!node) return null;
    joints.set(name, {
      node,
      axisVec: AXIS[axis] || AXIS.x,
      base: node.quaternion.clone(),
      min: minDeg,
      max: maxDeg,
      deg: 0,
    });
  }
  if (!joints.size) return null;

  const current = {};   // 关节名 -> 当前角度（度）
  joints.forEach((_, name) => { current[name] = 0; });

  let keys = null;      // [{t, pose}]
  let loop = false;
  let entryT = 0;       // 循环脚本的回绕起点（第一帧脚本关键帧的时刻）
  let duration = 0;
  let time = 0;
  let running = false;
  let linear = false;

  const scratch = new THREE.Quaternion();
  function apply() {
    joints.forEach((joint, name) => {
      const deg = THREE.MathUtils.clamp(current[name] ?? 0, joint.min, joint.max);
      joint.deg = deg;
      scratch.setFromAxisAngle(joint.axisVec, (deg * Math.PI) / 180);
      joint.node.quaternion.copy(joint.base).multiply(scratch);
    });
  }

  function play(id, options = {}) {
    const script = motions[id];
    const raw = script?.keys;
    if (!Array.isArray(raw) || raw.length < 2) return false;
    // Equivalent whole turns must not cause a fast reverse spin between lessons.
    joints.forEach((joint,name)=>{if(joint.max-joint.min>=360 && Math.abs(current[name])>=180)current[name]=THREE.MathUtils.euclideanModulo(current[name]+180,360)-180;});
    linear = Boolean(script.linear);
    // 从当前姿态先用 ENTRY 秒并进脚本第一帧，避免"上一动作的结尾"瞬间跳到新开头
    const entry = { t: 0, pose: { ...current } };
    keys = [entry, ...raw.map(([t, pose]) => ({ t: t + ENTRY, pose:{...current,...pose} }))];
    loop = options.loop ?? Boolean(script.loop);
    entryT = ENTRY;
    duration = keys[keys.length - 1].t;
    time = 0;
    running = true;
    return true;
  }

  function reset() {
    running = false;
    time=0;duration=0;
    keys = null;
    joints.forEach((joint, name) => {
      current[name] = 0;
      joint.deg = 0;
      joint.node.quaternion.copy(joint.base);
    });
  }

  function stop() {
    running = false;
  }

  // 返回是否仍在播放（调用方据此知道"刚刚播完"）
  function tick(dt) {
    if (!running || !keys) return false;
    time += dt;
    if (loop) {
      if (time >= duration) time = entryT + (time - duration);
    } else if (time >= duration) {
      time = duration;
      running = false;
    }
    let a = keys[0];
    let b = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) {
      if (time >= keys[i].t && time <= keys[i + 1].t) {
        a = keys[i];
        b = keys[i + 1];
        break;
      }
    }
    const span = Math.max(1e-6, b.t - a.t);
    const fraction = THREE.MathUtils.clamp((time - a.t) / span, 0, 1);
    const u = linear ? fraction : smooth(fraction);
    joints.forEach((joint, name) => {
      const va = a.pose[name] ?? 0;
      const vb = b.pose[name] ?? va;
      current[name] = va + (vb - va) * u;
    });
    apply();
    return running || time < duration;
  }

  apply();
  return {
    play,
    reset,
    stop,
    resume() { if(keys && time<duration) running=true; return running; },
    seek(fraction) {
      if(!keys) return false;
      time=THREE.MathUtils.clamp(fraction,0,1)*duration; running=true;
      tick(0); running=false; return true;
    },
    tick,
    get active() { return running; },
    get pose() { return { ...current }; },
    get duration() { return duration; },
    joints: [...joints.keys()],
    canPlay: id => Boolean(motions[id]?.keys?.length > 1),
    get progress() { return duration ? Math.min(1,time/duration) : 0; },
  };
}
