// 首页团团（pet3d.js）渲染调度回归
//
// 背景：团团的渲染循环原来没有任何暂停条件 —— 切到别的页面、滚出视口、
// 甚至切到别的标签页，它都还在按 60fps 画。平板在首页待久了会持续发热被
// 降频，手感就"卡卡的"。
//
// 这个脚本不需要浏览器：用最小 stub 替掉 THREE / DOM / rAF，真跑 pet3d.js
// 的循环，然后数"到底发了几次 renderer.render"。三类状态各跑 60 帧：
//   切走 / 后台 / 滚出视口  -> 应当 0 次
//   安静地待在首页          -> 应当被压到 24fps 左右
//   手指按着拖动            -> 应当满帧，跟手
// 最后做一次负向对照：把降帧那行摘掉，安静状态必须重新变成满帧，
// 否则说明"通过"只是空过。

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'frontend', 'pet3d.js');
const source = fs.readFileSync(SRC, 'utf8');

let passed = 0, failed = 0;
function check(ok, label, extra) {
  if (ok) { passed++; console.log('  [OK]   ' + label); }
  else { failed++; console.log('  [FAIL] ' + label + (extra ? '  -> ' + extra : '')); }
}

// ------------------------------------------------------------------ 环境 stub

function makeEl(name) {
  const classes = new Set();
  return {
    name,
    clientWidth: 300,
    clientHeight: 300,
    listeners: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
    },
    append() {},
    setPointerCapture() {},
    releasePointerCapture() {},
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    dispatch(type, event) { (this.listeners[type] || []).forEach((fn) => fn(event)); },
  };
}

function buildSandbox() {
  const renders = { count: 0, sizes: 0 };

  const hostEl = makeEl('pet3dHost');
  const stageEl = makeEl('petScene');
  const homeEl = makeEl('page-home');
  const statusEl = {textContent:''};
  homeEl.classList.add('active');           // 默认停在首页

  class Vec3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { return this.set(v.x, v.y, v.z); }
  }
  class Euler { constructor() { this.x = 0; this.y = 0; this.z = 0; } }

  class Obj3D {
    constructor() {
      this.position = new Vec3();
      this.rotation = new Euler();
      this.scale = { set() {}, setScalar() {} };
      this.children = [];
      this.castShadow = false;
      this.visible = true;
    }
    add(child) { this.children.push(child); return this; }
    traverse(fn) { fn(this); this.children.forEach((c) => c.traverse && c.traverse(fn)); }
    getObjectByName() { return null; }
    updateMatrixWorld() {}
    localToWorld(v) { return v; }
    getWorldQuaternion() { return { invert() { return this; }, multiply() { return this; } }; }
    worldToLocal(v) { return v; }
    removeFromParent() {}
  }

  const THREE = {
    Scene: class extends Obj3D {},
    Group: class extends Obj3D {},
    Mesh: class extends Obj3D {},
    PerspectiveCamera: class extends Obj3D {
      constructor() { super(); this.aspect = 1; }
      lookAt() {}
      updateProjectionMatrix() {}
    },
    HemisphereLight: class extends Obj3D {},
    DirectionalLight: class extends Obj3D {},
    MeshStandardMaterial: class { constructor(o) { Object.assign(this, o); } },
    MeshBasicMaterial: class { constructor(o) { Object.assign(this, o); } },
    CanvasTexture: class {}, PlaneGeometry: class {},
    CylinderGeometry: class {}, TorusGeometry: class {}, ConeGeometry: class {}, SphereGeometry: class {},
    WebGLRenderer: class {
      constructor() {
        this.domElement = { style: {}, addEventListener() {}, setPointerCapture() {} };
        this.outputColorSpace = ''; this.toneMapping = ''; this.toneMappingExposure = 1;
      }
      setPixelRatio() {}
      setSize() { renders.sizes++; }
      render() { renders.count++; }        // ← 被测的那一下
    },
    SRGBColorSpace: 'srgb',
    ACESFilmicToneMapping: 4,
  };

  class GLTFLoader { load() { /* 不回调：模型保持未加载，门控逻辑照样每帧执行 */ } }

  let clock = 0;
  const rafQueue = [];
  const observers = [];

  const sandbox = {
    console: { warn() {}, log() {} },
    Math, Object, Array, JSON, Date, Number, String, Boolean, Error, isNaN, parseInt, parseFloat,
    THREE, GLTFLoader,
    setExplorerAccessories: () => {},
    fetch: () => Promise.resolve({ok:true,json:()=>Promise.resolve({})}),
    performance: { now: () => clock },
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: (cb) => { rafQueue.push(cb); return rafQueue.length; },
    IntersectionObserver: class {
      constructor(cb) { this.cb = cb; observers.push(this); }
      observe() {}
      disconnect() {}
      fire(isIntersecting) { this.cb([{ isIntersecting, target: hostEl }]); }
    },
    ResizeObserver: class { constructor(cb) { this.cb = cb; } observe() {} disconnect() {} },
    document: {
      createElement: () => ({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})}),
      querySelectorAll: () => [],
      hidden: false,
      listeners: {},
      querySelector: (sel) => ({
        '#pet3dHost': hostEl, '#petScene': stageEl, '#page-home': homeEl, '#petLastAction':statusEl,
      }[sel] || null),
      addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
      dispatch(type) { (this.listeners[type] || []).forEach((fn) => fn({})); },
    },
  };
  sandbox.window = sandbox;
  sandbox.devicePixelRatio = 2;

  return { sandbox, hostEl, homeEl, statusEl, renders, rafQueue, observers, clockOf: () => clock,
           setClock: (v) => { clock = v; } };
}

// 用 vm 跑源码：把 3 条 import 换成从沙箱全局取（Node 不支持 import map）
function loadModule(env, mutation) {
  let code = source;
  const importLines = code.match(/^import[^;]*;$/gm) || [];
  if (importLines.length !== 4) throw new Error('pet3d.js 的 import 行数变了（' + importLines.length + '），本测试需要同步更新');
  code = code.replace(/^import[^;]*;$/gm, '');
  const prelude =
    'const THREE = __env.THREE;\n' +
    'const GLTFLoader = __env.GLTFLoader;\n' +
    'const setExplorerAccessories = __env.setExplorerAccessories;\n';
  if (mutation) code = mutation(code);

  env.sandbox.__env = env.sandbox;
  const context = vm.createContext(env.sandbox);
  new vm.Script(prelude + code, { filename: 'pet3d.js' }).runInContext(context);
}

// 手动驱动 rAF：每帧推进 16.667ms，跑 n 帧
function pump(env, frames) {
  const step = 1000 / 60;
  for (let i = 0; i < frames; i++) {
    env.setClock(env.clockOf() + step);
    const batch = env.rafQueue.splice(0);
    const now = env.clockOf();
    for (const cb of batch) cb(now);
  }
}

// ---------------------------------------------------------------------- 跑测

console.log('== 首页团团渲染调度回归 ==\n');

console.log('-- 场景 1：正常打开首页（应被压到 24fps 左右）');
{
  const env = buildSandbox();
  loadModule(env);
  check(env.observers.length === 1, '已注册 IntersectionObserver 监听可见性');
  const before = env.renders.count;
  pump(env, 60);
  const drawn = env.renders.count - before;
  check(drawn > 0, '首页上团团确实在画', '实际 ' + drawn + ' 次');
  check(drawn <= 28, '安静状态被节流到约 24fps（60 帧内最多画 28 次）', '实际 ' + drawn + ' 次');
  console.log('        实测：60 帧里画了 ' + drawn + ' 次（旧代码是 60 次）');
}

console.log('\n-- 场景 2：切到别的页面（应当一次都不画）');
{
  const env = buildSandbox();
  loadModule(env);
  pump(env, 10);
  env.homeEl.classList.remove('active');          // app.js 的 navigate 会这样做
  const before = env.renders.count;
  pump(env, 60);
  const drawn = env.renders.count - before;
  check(drawn === 0, '★ 离开首页后完全停止绘制（省掉整块 GPU 负载）', '实际 ' + drawn + ' 次');
  env.homeEl.classList.add('active');
  pump(env, 60);
  check(env.renders.count - before > 0, '切回首页后重新开始绘制');
}

console.log('\n-- 场景 3：滚出视口 / 切到别的标签页');
{
  const env = buildSandbox();
  loadModule(env);
  pump(env, 5);
  const before = env.renders.count;
  env.observers[0].fire(false);                   // 首页很长，团团滚出去了
  pump(env, 60);
  check(env.renders.count - before === 0, '滚出视口后停止绘制', '实际 ' + (env.renders.count - before) + ' 次');
  env.observers[0].fire(true);
  pump(env, 60);
  check(env.renders.count - before > 0, '滚回视口后恢复绘制');

  const before2 = env.renders.count;
  env.sandbox.document.hidden = true;
  env.sandbox.document.dispatch('visibilitychange');
  pump(env, 60);
  check(env.renders.count - before2 === 0, '切到其他标签页后停止绘制', '实际 ' + (env.renders.count - before2) + ' 次');
  env.sandbox.document.hidden = false;
  env.sandbox.document.dispatch('visibilitychange');
  pump(env, 60);
  check(env.renders.count - before2 > 0, '切回标签页后恢复绘制');
}

console.log('\n-- 场景 4：手指按着拖动（必须满帧，不能因为省电变卡）');
{
  const env = buildSandbox();
  loadModule(env);
  pump(env, 5);
  const before = env.renders.count;
  env.hostEl.dispatch('pointerdown', { clientX: 100, clientY: 100, pointerId: 1, pointerType: 'touch' });
  pump(env, 60);
  const drawn = env.renders.count - before;
  check(drawn >= 58, '★ 拖动中保持满帧 60fps（跟手不受节流影响）', '实际 ' + drawn + ' 次');
  env.hostEl.dispatch('pointerup', { pointerId: 1 });
  pump(env, 150);                                  // 先让它把视角归位（归位期间本来就该满帧）
  const afterSettle = env.renders.count;
  pump(env, 60);
  const idleDrawn = env.renders.count - afterSettle;
  check(idleDrawn <= 28, '松手归位之后自动回到省电帧率', '实际 ' + idleDrawn + ' 次');
}

console.log('\n-- 场景 5：点击回应与拖动互不干扰');
{
  const env=buildSandbox();loadModule(env);
  const down={clientX:100,clientY:100,pointerId:1,pointerType:'touch'};
  env.hostEl.dispatch('pointerdown',down);
  for(let x=104;x<=140;x+=4)env.hostEl.dispatch('pointermove',{...down,clientX:x});
  env.hostEl.dispatch('pointerup',{pointerId:1});
  check(env.statusEl.textContent==='','连续小步拖动不会误触发随机动作');
  env.hostEl.dispatch('pointerdown',down);env.hostEl.dispatch('pointercancel',{});env.hostEl.dispatch('pointerup',{pointerId:1});
  check(env.statusEl.textContent==='','取消手势后抬手不会触发动作');
  env.hostEl.dispatch('pointerdown',down);env.hostEl.dispatch('pointerup',{pointerId:1});
  const first=env.statusEl.textContent;
  env.hostEl.dispatch('pointerdown',down);env.hostEl.dispatch('pointerup',{pointerId:1});
  check(first!==''&&env.statusEl.textContent!==first,'每次点击有回应，连续两次不会重复同一动作');
  let prevented=false;const before=env.statusEl.textContent;
  env.hostEl.dispatch('keydown',{key:'Enter',preventDefault(){prevented=true;}});
  check(prevented&&env.statusEl.textContent!==before,'键盘也能激活团团互动');
}

console.log('\n-- 负向对照：把"降帧"那行摘掉，安静状态必须变回满帧');
{
  const env = buildSandbox();
  loadModule(env, (code) => {
    const line = 'if(!isBusy()&&now-lastDrawn<1000/IDLE_FPS)return;';
    if (!code.includes(line)) throw new Error('找不到降帧那一行，负向对照失效');
    return code.replace(line, '');
  });
  const before = env.renders.count;
  pump(env, 60);
  const drawn = env.renders.count - before;
  check(drawn >= 58, '★ 摘掉降帧后确实恢复满帧（证明本测试能抓到这个行为）', '实际 ' + drawn + ' 次');
}

console.log('\n通过 ' + passed + ' 项，失败 ' + failed + ' 项');
process.exit(failed ? 1 : 0);
