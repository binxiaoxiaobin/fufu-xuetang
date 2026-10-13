import * as THREE from 'three';
import { measure } from './clay.js';
import { terrainHeight } from './world.js';
import { RIVER, TITLE_COLORS } from './data.js';
import { tween, tweenFn, Ease } from './tween.js';

const FONT = 'ui-rounded, "Yuanti SC", "Hiragino Maru Gothic ProN", "PingFang SC", "Microsoft YaHei", "Nunito", "Varela Round", system-ui, sans-serif';
const PART_NAMES = ['head', 'tail', 'trunk', 'jaw', 'wingL', 'wingR', 'tailfin', 'finL', 'finR', 'earL', 'earR', 'armR', 'armL', 'body'];

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// 名字牌：一张双语卡片 + 一个朝下的箭头。
// 箭头的尖端画在画布的 y = H-22 处，所以 Sprite 的锚点（center）要放在那个位置，
// 牌子才会"指"着物体，而不是飘在半空。
const ARROW_TIP_Y = (H => 1 - (H - 22) / H)(340);

export function makeLabel(def, index = 0) {
  const W = 560, H = 340, D = 2;
  const cv = document.createElement('canvas'); cv.width = W * D; cv.height = H * D;
  const ctx = cv.getContext('2d'); ctx.scale(D, D);
  // card
  ctx.shadowColor = 'rgba(80,50,20,0.25)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8;
  roundRect(ctx, 24, 20, W - 48, H - 100, 40); ctx.fillStyle = '#F3E6CB'; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 10; ctx.strokeStyle = '#F9EFDB'; ctx.stroke();
  ctx.lineWidth = 3; ctx.strokeStyle = '#A8865F'; roundRect(ctx, 17, 13, W - 34, H - 86, 45); ctx.stroke();
  // text
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#5B3A29'; ctx.font = `900 ${def.cn.length > 3 ? 66 : 78}px ${FONT}`;
  ctx.fillText(`[${def.cn}]`, W / 2, 96);
  ctx.fillStyle = '#8C6B4B'; ctx.font = `700 40px ${FONT}`;
  ctx.fillText(def.py, W / 2, 160);
  ctx.fillStyle = '#3B2F2A'; ctx.font = `900 ${def.en.length > 9 ? 46 : 54}px ${FONT}`;
  ctx.fillText(def.en, W / 2, 215);
  // arrow（尖端在画布底部上方一点点，锚点就落在这里）
  const col = TITLE_COLORS[index % TITLE_COLORS.length];
  ctx.fillStyle = col; ctx.strokeStyle = '#fff'; ctx.lineWidth = 8; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(W / 2 - 34, H - 104); ctx.lineTo(W / 2 + 34, H - 104); ctx.lineTo(W / 2, H - 22); ctx.closePath();
  ctx.stroke(); ctx.fill();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.92, depthTest: false, depthWrite: false }));
  sp.scale.set(2.7, 2.7 * H / W, 1);
  sp.center.set(0.5, ARROW_TIP_Y);
  sp.renderOrder = 1000;
  sp.name = 'label';
  return sp;
}

export class Creature {
  static camera = null;
  static labelsVisible = false;  // 默认不显示名字牌，让小朋友自己去点、去找
  static labelsSuppressed = false;
  constructor(def, model, world, index) {
    this.def = def; this.id = def.id; this.kind = def.kind;
    this.group = new THREE.Group();
    this.group.name = 'creature_' + def.id;
    this.model = model;
    model.scale.setScalar(def.scale);
    const m = measure(model);
    this.height = m.top;
    model.rotation.y = def.rot;
    this.group.add(model);
    const [x, z] = def.pos;
    let y;
    if (def.y === 'ground') y = terrainHeight(x, z);
    else if (def.y === 'water') y = RIVER.level - (def.id === 'hippo' ? 0.55 : 0.28);
    else if (def.y === 'rock') y = world.rockTop - 0.05;
    else y = def.y;
    this.baseY = y;
    this.group.position.set(x, y, z);
    this.parts = {};
    for (const n of PART_NAMES) { const p = model.getObjectByName(n); if (p) this.parts[n] = p; }
    this.wheels = []; model.traverse(o => { if (o.name.startsWith('wheel')) this.wheels.push(o); });
    this.base = {}; for (const k in this.parts) this.base[k] = this.parts[k].rotation.clone();
    this.fx = { root: { x: 0, y: 0, z: 0 } }; for (const k in this.parts) this.fx[k] = { x: 0, y: 0, z: 0 };
    this.hopY = 0; this.squash = 1; this.off = new THREE.Vector3();
    this.t = Math.random() * 10;
    this.hover = false; this.reacting = false; this.found = false;
    this.pulseT = 0;                 // 点开它之后，名字牌亮一小会儿
    this.events = {};
    // label：贴在模型顶上一点点，箭头正好指着它
    this.label = makeLabel(def, index);
    this.label.position.set(0, Math.max(this.height, 0.55) + 0.32, 0);
    this.labelScale = this.label.scale.clone();
    this.group.add(this.label);
    // hover ring
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.0, 40), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
    const rs = Math.max(1.2, Math.min(3.2, def.r || 1.2));
    ring.scale.setScalar(rs); ring.renderOrder = 5;
    this.ring = ring; this.group.add(ring);
    this.meshes = []; model.traverse(o => { if (o.isMesh) { o.userData.creature = this; this.meshes.push(o); } });
  }

  get position() { return this.group.position; }

  setHover(on) {
    if (this.hover === on) return;
    this.hover = on;
    tween(this.ring.material, 'opacity', on ? 0.75 : 0, 0.25, { id: 'ring' });
  }

  // 点开一个朋友时，让它的名字牌亮几秒再淡下去（默认是不显示的）
  pulse(seconds = 8) { this.pulseT = Math.max(this.pulseT, seconds); }

  update(dt, t) {
    this.t += dt;
    if (this.pulseT > 0) this.pulseT = Math.max(0, this.pulseT - dt);
    const T = this.t, P = this.parts, B = this.base, F = this.fx;
    const idle = {}; for (const k in P) idle[k] = { x: 0, y: 0, z: 0 };
    const s = (k, axis, amp, freq, phase = 0) => { if (idle[k]) idle[k][axis] += Math.sin(T * freq + phase) * amp; };
    let idleY = 0, breathe = 0;
    switch (this.id) {
      case 'lion': s('tail', 'y', 0.35, 2.2); s('head', 'y', 0.12, 0.7); s('head', 'x', 0.05, 1.3); breathe = Math.sin(T * 1.5) * 0.02; break;
      case 'giraffe': s('head', 'x', 0.08, 0.9); s('head', 'z', 0.06, 0.6); s('tail', 'y', 0.45, 3.0); break;
      case 'zebra': s('tail', 'y', 0.5, 2.6); s('head', 'x', 0.1, 1.1); s('head', 'y', 0.08, 0.5); breathe = Math.sin(T * 1.8) * 0.015; break;
      case 'elephant': s('trunk', 'x', 0.18, 1.2); s('trunk', 'z', 0.1, 0.9); s('earL', 'y', 0.22, 1.6); s('earR', 'y', -0.22, 1.6, 0.3); s('tail', 'y', 0.3, 2.0); s('head', 'y', 0.08, 0.5); break;
      case 'monkey': s('tail', 'z', 0.35, 1.8); s('tail', 'x', 0.2, 1.3); s('head', 'z', 0.12, 1.0); s('armR', 'x', 0.25, 2.4); break;
      case 'hippo': idleY = Math.sin(T * 1.1) * 0.12; s('head', 'x', 0.06, 1.0); s('tail', 'y', 0.4, 3); if (Math.floor(T * 0.6) !== Math.floor((T - dt) * 0.6)) this.events.ripple?.(this.group.position, 2.2); break;
      case 'crocodile': s('tail', 'y', 0.35, 1.4); if (idle.jaw) idle.jaw.x += 0.05 + Math.max(0, Math.sin(T * 0.7)) * 0.08; s('head', 'y', 0.06, 0.8); break;
      case 'snake': s('head', 'y', 0.3, 1.1); s('head', 'x', 0.1, 1.7); s('head', 'z', 0.08, 0.8); break;
      case 'bird': {
        const burst = Math.sin(T * 1.1) > 0.75 ? Math.abs(Math.sin(T * 26)) * 0.8 : 0;
        if (idle.wingL) idle.wingL.z -= burst; if (idle.wingR) idle.wingR.z += burst;
        s('head', 'y', 0.5, 0.9); s('head', 'x', 0.1, 2.3);
        idleY = burst > 0 ? Math.abs(Math.sin(T * 13)) * 0.08 : 0;
        break;
      }
      case 'fish': {
        const [z0, z1] = this.def.swim, mid = (z0 + z1) / 2, amp = (z1 - z0) / 2;
        const z = mid + amp * Math.sin(T * 0.35), x = RIVER.x(z) + Math.sin(T * 0.9) * 0.8;
        const dz = amp * 0.35 * Math.cos(T * 0.35), dx = 3 * 0.11 * Math.cos(0.11 * z + 0.6) * dz + 0.9 * 0.8 * Math.cos(T * 0.9);
        this.group.position.x = x; this.group.position.z = z;
        this.model.rotation.y = Math.atan2(dx, dz);
        idleY = Math.sin(T * 2) * 0.05;
        s('tailfin', 'y', 0.5, 9); s('finL', 'y', 0.3, 7); s('finR', 'y', -0.3, 7);
        if (Math.floor(T * 0.5) !== Math.floor((T - dt) * 0.5)) this.events.ripple?.(this.group.position, 1.0);
        break;
      }
      case 'truck': idleY = Math.sin(T * 6) * 0.01; break;
      case 'flower': s('head', 'z', 0.12, 1.4); s('head', 'x', 0.06, 0.9); break;
      case 'robot': idleY = Math.sin(T * 2.2) * 0.12 + 0.35; s('body', 'z', 0.06, 1.3); s('armL', 'x', 0.3, 2.2); s('armR', 'x', -0.3, 2.2); break;
      // ---- 新增伙伴：用程序化模型里的 head / tail / ear / wing / arm 做待机动作 ----
      case 'rabbit': s('earL', 'x', 0.12, 1.6); s('earR', 'x', 0.12, 1.6, 0.4); s('head', 'z', 0.08, 1.1); s('tail', 'z', 0.25, 5); break;
      case 'deer': s('head', 'x', 0.09, 0.8); s('head', 'y', 0.06, 0.5); s('tail', 'y', 0.4, 3.4); s('earL', 'y', 0.18, 1.9); s('earR', 'y', -0.18, 1.9, 0.3); break;
      case 'panda': s('head', 'y', 0.10, 0.8); s('head', 'z', 0.06, 1.2); s('armL', 'x', 0.12, 1.1); s('armR', 'x', 0.12, 1.1, 0.5); breathe = Math.sin(T * 1.6) * 0.02; break;
      case 'turtle': s('head', 'y', 0.14, 1.0); s('head', 'x', 0.10, 1.5); s('tail', 'y', 0.22, 1.2); break;
      case 'penguin': s('head', 'z', 0.07, 1.3); s('wingL', 'z', 0.14, 1.6); s('wingR', 'z', -0.14, 1.6, 0.4); break;
      case 'owl': s('head', 'y', 0.42, 0.55); s('head', 'x', 0.07, 1.2); s('wingL', 'z', 0.1, 1.4); s('wingR', 'z', -0.1, 1.4, 0.3); break;
      case 'fox': s('head', 'y', 0.16, 1.0); s('head', 'z', 0.09, 1.4); s('tail', 'y', 0.45, 1.9); s('earL', 'x', 0.10, 2.2); s('earR', 'x', 0.10, 2.2, 0.5); break;
      case 'koala': s('head', 'z', 0.08, 0.9); s('head', 'y', 0.12, 0.6); s('earL', 'z', 0.10, 1.4); s('earR', 'z', -0.10, 1.4, 0.4); break;
      case 'campfire': breathe = Math.sin(T * 7) * 0.05; break;
      case 'lantern': s('body', 'z', 0.10, 1.1); s('body', 'x', 0.06, 0.7, 0.6); break;
      case 'balloon': s('body', 'z', 0.035, 0.8); idleY = Math.sin(T * 0.9) * 0.10; break;
      case 'kite': s('body', 'z', 0.07, 1.3); idleY = Math.sin(T * 1.1) * 0.08; break;
      case 'tent': break;
      case 'signpost': breathe = Math.sin(T * 2.2) * 0.012; break;
      default: break;
    }
    for (const k in P) {
      P[k].rotation.x = B[k].x + idle[k].x + F[k].x;
      P[k].rotation.y = B[k].y + idle[k].y + F[k].y;
      P[k].rotation.z = B[k].z + idle[k].z + F[k].z;
    }
    for (const w of this.wheels) w.rotation.x += this.wheelSpin || 0;
    this.group.position.y = this.baseY + idleY + this.hopY + this.off.y;
    const sc = this.def.scale, sq = this.squash * (1 + breathe);
    this.model.scale.set(sc / Math.sqrt(sq), sc * sq, sc / Math.sqrt(sq));
    this.model.rotation.set(F.root.x, this.def.rot + F.root.y, F.root.z);
    this.model.position.set(this.off.x, 0, this.off.z);
    // label: constant screen size when close, natural perspective beyond 12 units, larger in the far poster view
    let f = this.hover ? 1.12 : 1;
    const cam = Creature.camera;
    if (cam) {
      const d = cam.position.distanceTo(this.group.position);
      f *= d < 12 ? Math.max(0.25, d / 12) : 1 + (d - 12) / 70;
      f *= Math.min(1, Math.max(0.5, cam.aspect / 1.4));   // narrower screens get smaller cards
    }
    if (!Number.isFinite(f)) f = 1;
    this.label.scale.lerp(this.labelScale.clone().multiplyScalar(f), 0.2);
    // 默认不显示；悬停、或被点开的那几秒才亮
    const wantAlpha = (!Creature.labelsSuppressed && (Creature.labelsVisible || this.hover || this.pulseT > 0)) ? 0.92 : 0;
    const lm = this.label.material; lm.opacity += (wantAlpha - lm.opacity) * 0.18; this.label.visible = lm.opacity > 0.02;
    if (this.ring.material.opacity > 0.01) { const p = 1 + Math.sin(T * 5) * 0.06; this.ring.scale.setScalar(Math.max(1.2, Math.min(3.2, this.def.r || 1.2)) * p); }
  }

  // ---- click reaction: a hop + something characteristic
  react() {
    if (this.reacting) return;
    this.reacting = true;
    const F = this.fx;
    const done = () => { this.reacting = false; };
    const hop = (h = 0.6, dur = 0.7, onDone) => {
      tweenFn((e, k) => { this.hopY = Math.sin(k * Math.PI) * h; }, dur, { onDone: () => { this.hopY = 0; onDone && onDone(); } });
      tweenFn((e, k) => { this.squash = 1 + Math.sin(k * Math.PI * 2) * 0.14; }, dur, { onDone: () => { this.squash = 1; } });
    };
    const wobble = (dur = 1.2, amp = 0.12) => tweenFn((e, k) => { F.root.z = Math.sin(k * Math.PI * 6) * amp * (1 - k); }, dur, { onDone: () => { F.root.z = 0; } });
    const spin = (axis = 'y', dur = 0.8, turns = 1) => tweenFn((e, k) => { F.root[axis] = e * Math.PI * 2 * turns; }, dur, { ease: Ease.inOutQuad, onDone: () => { F.root[axis] = 0; } });
    const shake = (dur = 1.2, amp = 0.3) => tweenFn((e, k) => { F.root.y = Math.sin(k * Math.PI * 8) * amp * (1 - k); }, dur, { onDone: () => { F.root.y = 0; } });
    switch (this.id) {
      case 'lion':
        hop(0.6, 0.7);
        tween(F.head, 'x', -0.55, 1.1, { yoyo: true, ease: Ease.inOutQuad });
        tweenFn((e, k) => { F.head.z = Math.sin(k * Math.PI * 8) * 0.12 * (1 - k); F.tail.y = Math.sin(k * Math.PI * 10) * 0.5; }, 1.4, { onDone: () => { F.head.z = 0; F.tail.y = 0; done(); } });
        break;
      case 'giraffe':
        hop(0.45, 0.7);
        tween(F.head, 'x', 0.35, 0.5, { yoyo: true, ease: Ease.inOutQuad });
        tween(F.head, 'x', 0.35, 0.5, { yoyo: true, ease: Ease.inOutQuad, delay: 0.55 });
        tweenFn((e, k) => { F.tail.y = Math.sin(k * Math.PI * 10) * 0.6; }, 1.3, { onDone: () => { F.tail.y = 0; done(); } });
        break;
      case 'zebra':
        tween(F.root, 'x', -0.4, 0.9, { yoyo: true, ease: Ease.inOutQuad });
        hop(0.5, 0.9);
        tweenFn((e, k) => { F.head.y = Math.sin(k * Math.PI * 6) * 0.3 * (1 - k); }, 1.2, { onDone: () => { F.head.y = 0; done(); } });
        break;
      case 'elephant':
        hop(0.3, 0.8);
        tween(F.trunk, 'x', -1.35, 0.5, { ease: Ease.outBack });
        tween(F.trunk, 'x', 0, 0.6, { delay: 1.4, ease: Ease.inOutQuad });
        tween(F.head, 'x', -0.2, 0.5, { ease: Ease.outQuad }); tween(F.head, 'x', 0, 0.6, { delay: 1.4 });
        tweenFn((e, k) => { const f = Math.sin(k * Math.PI * 8) * 0.6; F.earL.y = f; F.earR.y = -f; }, 2.0, { onDone: () => { F.earL.y = F.earR.y = 0; done(); } });
        break;
      case 'monkey':
        hop(1.1, 0.9); spin('y', 0.9, 1);
        tweenFn((e, k) => { F.armR.x = Math.sin(k * Math.PI * 6) * 0.6; F.tail.z = Math.sin(k * Math.PI * 4) * 0.6; }, 1.6, { onDone: () => { F.armR.x = F.tail.z = 0; done(); } });
        break;
      case 'hippo':
        this.events.splash?.(this.group.position, 3.2);
        hop(0.7, 0.9, () => { this.events.splash?.(this.group.position, 3.6); });
        tween(F.head, 'x', -0.45, 1.2, { yoyo: true, ease: Ease.inOutQuad, onDone: done });
        break;
      case 'crocodile':
        tween(F.jaw, 'x', 0.6, 0.35, { ease: Ease.outBack }); tween(F.jaw, 'x', 0, 0.3, { delay: 1.2 });
        tween(F.head, 'x', -0.18, 0.35); tween(F.head, 'x', 0, 0.3, { delay: 1.2 });
        hop(0.25, 0.6);
        tweenFn((e, k) => { F.tail.y = Math.sin(k * Math.PI * 4) * 0.5; }, 1.6, { onDone: () => { F.tail.y = 0; done(); } });
        break;
      case 'snake':
        tween(F.head, 'x', -0.55, 1.4, { yoyo: true, ease: Ease.inOutQuad });
        tweenFn((e, k) => { F.root.y = Math.sin(k * Math.PI * 5) * 0.2 * (1 - k); F.head.y = Math.sin(k * Math.PI * 7) * 0.3; }, 1.6, { onDone: () => { F.root.y = 0; F.head.y = 0; done(); } });
        break;
      case 'bird': {
        const R = 2.6, dur = 3.2;
        tweenFn((e, k) => {
          const a = k * Math.PI * 2;
          this.off.set(Math.sin(a) * R, Math.sin(k * Math.PI) * 2.2, (1 - Math.cos(a)) * R * 0.8);
          const vx = Math.cos(a), vz = Math.sin(a) * 0.8;
          F.root.y = Math.atan2(vx, vz) - this.def.rot;
          const flap = Math.abs(Math.sin(k * Math.PI * 22)) * 0.9;
          F.wingL.z = -flap; F.wingR.z = flap;
        }, dur, { ease: Ease.inOutQuad, onDone: () => { this.off.set(0, 0, 0); F.root.y = 0; F.wingL.z = F.wingR.z = 0; done(); } });
        break;
      }
      case 'fish':
        this.events.splash?.(this.group.position, 1.6);
        hop(1.5, 0.95, () => { this.events.splash?.(this.group.position, 2.0); done(); });
        tweenFn((e, k) => { F.root.x = -e * Math.PI * 2; }, 0.95, { ease: Ease.inOutQuad, onDone: () => { F.root.x = 0; } });
        break;
      case 'truck':
        hop(0.4, 0.5); wobble(1.0, 0.06);
        tweenFn((e, k) => { this.wheelSpin = (1 - k) * 0.5; }, 1.5, { onDone: () => { this.wheelSpin = 0; done(); } });
        break;
      case 'camera':
        this.events.flash?.(this.group.position);
        hop(0.35, 0.5); tween(F.root, 'y', 0.5, 0.6, { yoyo: true, onDone: done });
        break;
      case 'flower':
        spin('y', 1.0, 1); tweenFn((e, k) => { F.head.z = Math.sin(k * Math.PI * 6) * 0.3 * (1 - k); }, 1.2, { onDone: () => { F.head.z = 0; done(); } });
        break;
      case 'stump': wobble(1.3, 0.14); hop(0.2, 0.5, done); break;
      case 'bone': hop(0.9, 0.8); spin('y', 0.8, 1); setTimeout(done, 900); break;
      case 'banana': hop(0.8, 0.8); spin('z', 0.8, 1); setTimeout(done, 900); break;
      case 'binoculars': hop(0.5, 0.6); tweenFn((e, k) => { this.squash = 1 + Math.sin(k * Math.PI * 4) * 0.12; }, 1.0, { onDone: () => { this.squash = 1; done(); } }); break;
      // ---- 新增伙伴：点头 / 抖耳朵 / 转圈，最后都回到原地 ----
      case 'rabbit': hop(0.85, 0.8); tweenFn((e, k) => { F.earL.x = Math.sin(k * Math.PI * 6) * 0.5; F.earR.x = Math.sin(k * Math.PI * 6) * 0.5; F.tail.z = Math.sin(k * Math.PI * 12) * 0.5; }, 1.2, { onDone: () => { F.earL.x = F.earR.x = F.tail.z = 0; done(); } }); break;
      case 'deer': hop(0.45, 0.7); tween(F.head, 'x', -0.4, 1.0, { yoyo: true, ease: Ease.inOutQuad }); tweenFn((e, k) => { F.tail.y = Math.sin(k * Math.PI * 8) * 0.5; }, 1.3, { onDone: () => { F.tail.y = 0; done(); } }); break;
      case 'panda': hop(0.55, 0.8); spin('y', 1.1, 1); tweenFn((e, k) => { F.armL.x = Math.sin(k * Math.PI * 6) * 0.5; F.armR.x = -Math.sin(k * Math.PI * 6) * 0.5; }, 1.4, { onDone: () => { F.armL.x = F.armR.x = 0; done(); } }); break;
      case 'turtle': hop(0.25, 0.9); tweenFn((e, k) => { F.head.y = Math.sin(k * Math.PI * 3) * 0.5; F.tail.y = Math.sin(k * Math.PI * 4) * 0.5; }, 1.4, { onDone: () => { F.head.y = F.tail.y = 0; done(); } }); break;
      case 'penguin': hop(0.35, 0.6); spin('y', 0.9, 1); tweenFn((e, k) => { const f = Math.sin(k * Math.PI * 8) * 0.7; F.wingL.z = -f; F.wingR.z = f; }, 1.2, { onDone: () => { F.wingL.z = F.wingR.z = 0; done(); } }); break;
      case 'owl': hop(0.5, 0.7); tweenFn((e, k) => { F.head.y = Math.sin(k * Math.PI * 2) * Math.PI * 0.85; }, 1.4, { onDone: () => { F.head.y = 0; done(); } }); break;
      case 'fox': hop(0.6, 0.75); tweenFn((e, k) => { F.tail.y = Math.sin(k * Math.PI * 12) * 0.8; F.head.z = Math.sin(k * Math.PI * 6) * 0.2 * (1 - k); }, 1.3, { onDone: () => { F.tail.y = 0; F.head.z = 0; done(); } }); break;
      case 'koala': hop(0.5, 0.8); tweenFn((e, k) => { F.head.z = Math.sin(k * Math.PI * 5) * 0.25 * (1 - k); F.earL.z = Math.sin(k * Math.PI * 7) * 0.3; F.earR.z = -Math.sin(k * Math.PI * 7) * 0.3; }, 1.4, { onDone: () => { F.head.z = 0; F.earL.z = F.earR.z = 0; done(); } }); break;
      case 'campfire': tweenFn((e, k) => { this.squash = 1 + Math.sin(k * Math.PI * 8) * 0.12; }, 1.6, { onDone: () => { this.squash = 1; done(); } }); break;
      case 'lantern': shake(1.4, 0.35); setTimeout(done, 1400); break;
      case 'balloon': hop(0.9, 1.3, done); shake(1.3, 0.18); break;
      case 'kite': hop(0.6, 1.1, done); spin('z', 1.1, 0.5); break;
      case 'tent': tweenFn((e, k) => { this.squash = 1 + Math.sin(k * Math.PI * 3) * 0.10; }, 1.2, { onDone: () => { this.squash = 1; done(); } }); break;
      case 'signpost': shake(1.1, 0.22); setTimeout(done, 1100); break;
      default: hop(0.5, 0.6, done);
    }
  }
}
