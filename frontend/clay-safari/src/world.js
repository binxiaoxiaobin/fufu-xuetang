import * as THREE from 'three';
import { fbm, vnoise, rng, smoothstep, lerp, clamp } from './noise.js';
import {
  MAP, WALK, RIVER, RIM, BRIDGES, ITEMS, PATH_CURVES, SPECIAL_TREES, PLAYER_START,
  MEADOW, PADDY, POOL, ROAD_CURVES,
} from './data.js';
import { clayMaterial, clayBump } from './clay.js';
import { NavGrid } from './nav.js';
import {FARM_AREA,FARM_PLOTS} from './farm-layout.js';

// ------------------------------------------------------------------ heights
// 现在有两座桥，判定要遍历所有桥
export function inBridge(x, z) {
  for (const bridge of BRIDGES) {
    if (Math.abs(z - bridge.z) < bridge.halfW && Math.abs(x - bridge.x) < bridge.halfLen) return true;
  }
  return false;
}
export function bridgeY(x, z) {
  let best = -Infinity;
  for (const bridge of BRIDGES) {
    if (Math.abs(z - bridge.z) >= bridge.halfW || Math.abs(x - bridge.x) >= bridge.halfLen) continue;
    const t = clamp((x - bridge.x) / bridge.halfLen, -1, 1);
    best = Math.max(best, bridge.base + bridge.rise * Math.cos(t * Math.PI / 2));
  }
  return best === -Infinity ? 0 : best;
}

export function terrainHeight(x, z) {
  let h = (fbm(x * 0.05 + 10, z * 0.05 + 10, 3) - 0.5) * 1.4 + (fbm(x * 0.2 + 5, z * 0.2 + 5, 2) - 0.5) * 0.22 + 0.15;
  if (h < -0.05) h = -0.05 + (h + 0.05) * 0.25;      // soft floor: dry land never sinks toward the water level
  // bridge apron: flat landing on both banks
  for (const bridge of BRIDGES) {
    const ap = (1 - smoothstep(2.0, 3.6, Math.abs(z - bridge.z))) * (1 - smoothstep(5.0, 8.5, Math.abs(x - bridge.x)));
    h = lerp(h, 0.05, ap);
  }
  const d = Math.abs(x - RIVER.x(z));
  const carve = 1 - smoothstep(RIVER.halfWidth - 0.6, RIVER.halfWidth + 1.5, d);
  const bed = -1.6 + 0.12 * Math.sin(x * 0.9) * Math.sin(z * 0.7);
  h = lerp(h, bed, carve);
  // 水池：比河床浅的碗形凹地。水面在 POOL.level，凹地里面比水面低，
  // 于是导航里那条"低于水面就走不过去"的规则会自动把水面挡住。
  const pd = Math.hypot(x - POOL.x, z - POOL.z);
  const pcarve = 1 - smoothstep(POOL.r - 1.4, POOL.r + 1.7, pd);
  const pbed = POOL.level - 1.0 + 0.10 * Math.sin(x * 0.8) * Math.sin(z * 0.7);
  h = lerp(h, pbed, pcarve);
  const rim = Math.max(smoothstep(RIM.x0, RIM.x1, Math.abs(x)), smoothstep(RIM.z0, RIM.z1, Math.abs(z)));
  h += rim * (2.2 + 3.4 * vnoise(x * 0.11 + 3, z * 0.11 + 7));
  return h;
}
export function surfaceHeight(x, z) {
  if (inBridge(x, z)) return Math.max(bridgeY(x, z) + 0.1, terrainHeight(x, z));
  return terrainHeight(x, z);
}

// ------------------------------------------------------------------ helpers
const C = (h) => new THREE.Color(h);
const PAL = {
  sand: C('#F2D6A0'), sand2: C('#E7C48A'), grass: C('#8FCB4E'), grass2: C('#6FB63C'), grass3: C('#A7DA62'),
  beach: C('#F8E6BC'), bed: C('#C6B892'), path: C('#FCEFCF'), hill: C('#9ED063'), hillSand: C('#EFD9A4'),
  road: C('#DCC49B'), meadow: C('#86D451'), soil: C('#9A7550'), soilWet: C('#7E5F41'), wetSand: C('#EBD9AE'),
  trunk: ['#8B5E3C', '#9C6B45', '#7A5033'], canopy: ['#7CC24A', '#63B03A', '#93CF5A', '#55A83B', '#A6D95E'],
  bush: ['#86C94F', '#6DBB44', '#9AD25A'], rock: ['#D9B98C', '#CDB28A', '#E0C49A', '#BFAF95'],
  flowers: ['#F48FB1', '#FFB74D', '#FFF176', '#81D4FA', '#B39DDB', '#F06292', '#FF8A65', '#FFFFFF'],
  rice: ['#9BD84F', '#7FC045', '#B4E063'], reed: '#7DBE52', cattail: '#6A4728', lily: '#4C8636',
};

// 小径 / 马路采样 + 空间索引：地图变大后顶点也要逐个查距离，两两比较会明显变慢
function curveSamples(curves, per = 320) {
  const out = [];
  for (const points of curves) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], 0, p[1])), false, 'catmullrom', 0.5);
    out.push(...curve.getSpacedPoints(per));
  }
  return out;
}
function buildPathIndex(samples, cell = 6) {
  const buckets = new Map();
  for (const p of samples) {
    const key = (Math.floor(p.x / cell) + 200) * 1000 + (Math.floor(p.z / cell) + 200);
    let bucket = buckets.get(key);
    if (!bucket) buckets.set(key, bucket = []);
    bucket.push(p);
  }
  return { cell, buckets };
}
function distToPath(index, x, z) {
  const ci = Math.floor(x / index.cell) + 200, cj = Math.floor(z / index.cell) + 200;
  let best = Infinity;
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    const bucket = index.buckets.get((ci + di) * 1000 + (cj + dj));
    if (!bucket) continue;
    for (const p of bucket) { const dx = p.x - x, dz = p.z - z; const d = dx * dx + dz * dz; if (d < best) best = d; }
  }
  return best === Infinity ? Infinity : Math.sqrt(best);
}

// ------------------------------------------------------------------ world
// options.activeIds：当前真正在场的对象 id 集合（= 已解锁的对象）。
// 障碍只按它来建——锁着的东西虽然看不见，也不该留下看不见的碰撞圈。
// 但植被散布必须继续避开**全量** ITEMS 的位置，否则以后解锁的对象会和树叠在一起。
export function buildWorld(scene, { isMobile, activeIds = null } = {}) {
  const r = rng(2026);
  const samples = curveSamples(PATH_CURVES);
  const pathIndex = buildPathIndex(samples);
  const roadSamples = curveSamples(ROAD_CURVES, 260);
  const roadIndex = buildPathIndex(roadSamples);
  const world = { obstacles: [], updaters: [], samples, pathIndex, roadSamples };
  const bump = clayBump();

  // ---- lights & sky
  const hemi = new THREE.HemisphereLight(0xcfe9ff, 0xe8c99a, 0.9);
  scene.add(hemi);
  scene.add(new THREE.AmbientLight(0xfff4e0, 0.25));
  const sun = new THREE.DirectionalLight(0xfff1d8, 2.4);
  sun.position.set(40, 66, 32);
  sun.castShadow = true;
  const S = isMobile ? 2048 : 4096;
  sun.shadow.mapSize.set(S, S);
  const shadowSpan = isMobile ? 62 : 76;
  sun.shadow.camera.left = -shadowSpan; sun.shadow.camera.right = shadowSpan; sun.shadow.camera.top = shadowSpan; sun.shadow.camera.bottom = -shadowSpan;
  sun.shadow.camera.near = 5; sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);
  world.sun = sun;
  world.sunDir = sun.position.clone().normalize();

  scene.fog = new THREE.Fog(0xdff3ff, 115, 285);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: C('#4fb0ee') }, mid: { value: C('#9bdcf8') }, hor: { value: C('#eaf8ff') } },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top, mid, hor; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = h < 0.18 ? mix(hor, mid, smoothstep(-0.05, 0.18, h)) : mix(mid, top, smoothstep(0.18, 0.75, h)); gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(640, 32, 16), skyMat);
  scene.add(sky);

  // ---- smiling sun
  const sunG = new THREE.Group();
  sunG.position.set(136, 112, -272);
  const sunBasic = (color) => new THREE.MeshBasicMaterial({ color, fog: false });
  sunG.add(new THREE.Mesh(new THREE.SphereGeometry(15, 32, 24), sunBasic('#FFD34D')));
  const rays = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const ray = new THREE.Mesh(new THREE.BoxGeometry(3.6, 9.5, 1.9), sunBasic('#FFC63A'));
    const a = i / 12 * Math.PI * 2;
    ray.position.set(Math.cos(a) * 21, Math.sin(a) * 21, 0);
    ray.rotation.z = a - Math.PI / 2;
    rays.add(ray);
  }
  sunG.add(rays);
  const faceMat = sunBasic('#8A5A2B');
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 8), faceMat); e.position.set(s * 5.4, 3.0, 14.1); sunG.add(e); }
  const cheekMat = sunBasic('#FFA8A0');
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(1.8, 12, 8), cheekMat); e.position.set(s * 8.4, -0.8, 12.7); e.scale.set(1, 0.7, 0.5); sunG.add(e); }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(3.5, 0.6, 8, 20, Math.PI), faceMat);
  smile.rotation.z = Math.PI; smile.position.set(0, -1.6, 14.3); sunG.add(smile);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('#FFE9A0'), color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(95, 95, 1); glow.position.z = -2; sunG.add(glow);
  sunG.lookAt(0, 14, 0);
  scene.add(sunG);
  world.updaters.push((dt, t) => { rays.rotation.z = t * 0.12; sunG.children[0].scale.setScalar(1 + Math.sin(t * 1.4) * 0.03); });

  // ---- 地块判定（花海 / 稻田 / 水池 / 马路）
  const insidePaddy = (x, z, m = 0) => Math.abs(x - PADDY.x) < PADDY.hx + m && Math.abs(z - PADDY.z) < PADDY.hz + m;
  const insidePool = (x, z, m = 0) => Math.hypot(x - POOL.x, z - POOL.z) < POOL.r + m;
  const insideMeadow = (x, z, m = 0) => Math.hypot((x - MEADOW.x) / (MEADOW.rx + m), (z - MEADOW.z) / (MEADOW.rz + m)) < 1;
  const nearRoad = (x, z, m) => distToPath(roadIndex, x, z) < m;

  // ---- terrain
  const nx = MAP.w * 2, nz = MAP.h * 2;
  const geo = new THREE.PlaneGeometry(MAP.w, MAP.h, nx, nz);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  const paddyTint = PAL.soil.clone();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = -pos.getY(i);
    const h = terrainHeight(x, z);
    pos.setXYZ(i, x, h, z);
    // colour
    const d = Math.abs(x - RIVER.x(z));
    const side = smoothstep(-3, 3, x - RIVER.x(z));
    const n1 = fbm(x * 0.15, z * 0.15, 2), n2 = fbm(x * 0.4 + 9, z * 0.4 + 9, 2);
    const sand = tmp.copy(PAL.sand).lerp(PAL.sand2, n1).clone();
    const grass = tmp.copy(PAL.grass).lerp(PAL.grass2, n2).lerp(PAL.grass3, smoothstep(0.55, 0.8, n1) * 0.7).clone();
    let c = sand.lerp(grass, side);
    const shore = 1 - smoothstep(RIVER.halfWidth + 0.5, RIVER.halfWidth + 1.7, d);
    c.lerp(PAL.beach, shore);
    if (h < RIVER.level + 0.05) c.lerp(PAL.bed, smoothstep(RIVER.level + 0.05, RIVER.level - 0.6, h));
    const dp = distToPath(pathIndex, x, z);
    const pathT = (1 - smoothstep(0.9, 1.7, dp + (n2 - 0.5) * 0.6)) * (h > RIVER.level + 0.1 ? 1 : 0);
    c.lerp(PAL.path, pathT * 0.85);
    // 马路：比小径宽一倍，颜色偏土黄，边缘用噪声打散
    const dr = distToPath(roadIndex, x, z);
    const roadT = (1 - smoothstep(2.2, 3.5, dr + (n2 - 0.5) * 0.7)) * (h > RIVER.level + 0.1 ? 1 : 0);
    c.lerp(PAL.road, roadT * 0.92);
    // 稻田：深一点的泥土地
    const pIn = 1 - smoothstep(0.84, 1.10, Math.max(Math.abs(x - PADDY.x) / PADDY.hx, Math.abs(z - PADDY.z) / PADDY.hz));
    if (pIn > 0) { paddyTint.copy(PAL.soil).lerp(PAL.soilWet, n1); c.lerp(paddyTint, pIn * 0.9); }
    // 花海：更鲜亮的花田绿
    const md = Math.hypot((x - MEADOW.x) / MEADOW.rx, (z - MEADOW.z) / MEADOW.rz);
    c.lerp(PAL.meadow, (1 - smoothstep(0.70, 1.04, md)) * 0.72);
    // 水池岸边：湿沙
    const pd = Math.hypot(x - POOL.x, z - POOL.z);
    c.lerp(PAL.wetSand, (1 - smoothstep(POOL.r, POOL.r + 3.2, pd)) * 0.85);
    const rim = Math.max(smoothstep(RIM.x0, RIM.x1, Math.abs(x)), smoothstep(RIM.z0, RIM.z1, Math.abs(z)));
    c.lerp(x - RIVER.x(z) < 0 ? PAL.hillSand.clone().lerp(PAL.hill, 0.5) : PAL.hill, rim * 0.85);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrainBump = bump.clone(); terrainBump.repeat.set(56, 42); terrainBump.needsUpdate = true;
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, bumpMap: terrainBump, bumpScale: 0.35 });
  const terrain = new THREE.Mesh(geo, terrainMat);
  terrain.receiveShadow = true; terrain.castShadow = false;
  terrain.name = 'terrain';
  scene.add(terrain);
  world.terrain = terrain;

  // diorama skirt: a clay slab wall hanging from the terrain edge so the world reads as a tabletop model
  {
    const hw = MAP.w / 2, hh = MAP.h / 2, step = 0.5, bottom = -7;
    const loop = [];
    for (let x = -hw; x < hw; x += step) loop.push([x, -hh]);
    for (let z = -hh; z < hh; z += step) loop.push([hw, z]);
    for (let x = hw; x > -hw; x -= step) loop.push([x, hh]);
    for (let z = hh; z > -hh; z -= step) loop.push([-hw, z]);
    const n = loop.length, v = new Float32Array(n * 2 * 3), col = new Float32Array(n * 2 * 3), idx = [];
    const topC = C('#E9CFA5'), botC = C('#C79E72');
    loop.forEach(([x, z], i) => {
      const h = terrainHeight(x, z) - 0.02;
      v.set([x, h, z], i * 6); v.set([x, bottom, z], i * 6 + 3);
      col.set([topC.r, topC.g, topC.b], i * 6); col.set([botC.r, botC.g, botC.b], i * 6 + 3);
      const j = (i + 1) % n;
      idx.push(i * 2, j * 2, i * 2 + 1, j * 2, j * 2 + 1, i * 2 + 1);
    });
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(v, 3)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3)); sg.setIndex(idx);
    sg.computeVertexNormals();
    const skirt = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }));
    skirt.receiveShadow = true; scene.add(skirt);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(MAP.w + 0.02, 1.2, MAP.h + 0.02), clayMaterial(0xc79e72, { roughness: 0.95 }));
    slab.position.y = bottom - 0.6; scene.add(slab);
  }

  // ---- water（河水）
  const uTime = { value: 0 };
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x66c4ee, roughness: 0.28, metalness: 0.0, transparent: true, opacity: 0.92 });
  waterMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.uniforms.uRiver = { value: new THREE.Vector3(RIVER.A, RIVER.B, RIVER.C) };
    sh.uniforms.uHalf = { value: RIVER.halfWidth };
    // 平面绕 x 转 -90°，几何体的局部 z 轴就是世界的高度方向 → 起伏加在 transformed.z 上
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp0 = modelMatrix * vec4(position, 1.0);
        transformed.z += sin(wp0.x * 1.4 + uTime * 1.6) * 0.04 + sin(wp0.z * 1.1 - uTime * 1.2) * 0.04;
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform vec3 uRiver; uniform float uHalf; varying vec3 vWPos;
        float hashw(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noisew(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(hashw(i), hashw(i+vec2(1,0)), f.x), mix(hashw(i+vec2(0,1)), hashw(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float xc = uRiver.x * sin(uRiver.y * vWPos.z + uRiver.z);
        float d = abs(vWPos.x - xc);
        float deep = 1.0 - smoothstep(uHalf - 1.8, uHalf + 0.6, d);
        vec3 col = mix(vec3(0.50, 0.84, 0.95), vec3(0.18, 0.55, 0.90), deep);
        vec2 p = vec2(vWPos.x * 0.8, vWPos.z * 0.3 - uTime * 0.25);
        float n = noisew(p * 2.0) * 0.6 + noisew(p * 4.3 + 3.1) * 0.4;
        col += smoothstep(0.52, 0.74, n) * 0.30;
        float fn = noisew(vec2(vWPos.x * 1.6, vWPos.z * 1.6 - uTime * 0.5));
        float foam = smoothstep(uHalf + 0.15, uHalf + 0.95, d + (fn - 0.5) * 0.9);
        col = mix(col, vec3(1.0), foam * 0.9);
        diffuseColor.rgb = col;`);
  };
  const water = new THREE.Mesh(new THREE.PlaneGeometry(MAP.w, MAP.h, 110, 80), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.y = RIVER.level;
  water.receiveShadow = true; water.name = 'water';
  scene.add(water);
  world.water = water;

  // ---- water（水池）：只有涟漪，没有河水的泡沫
  const poolMat = new THREE.MeshStandardMaterial({ color: 0x63c3ea, roughness: 0.16, metalness: 0, transparent: true, opacity: 0.9 });
  poolMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 pw = modelMatrix * vec4(position, 1.0);
        transformed.z += sin(pw.x * 1.7 + uTime * 1.3) * 0.035 + sin(pw.z * 2.1 - uTime * 1.1) * 0.035;`);
  };
  const pool = new THREE.Mesh(new THREE.CircleGeometry(POOL.r + 0.35, 56), poolMat);
  pool.rotation.x = -Math.PI / 2; pool.position.set(POOL.x, POOL.level, POOL.z);
  pool.receiveShadow = true; pool.name = 'pool';
  scene.add(pool);
  world.pool = pool;

  world.updaters.push((dt, t) => { uTime.value = t; });

  // ---- placement helpers
  const items = ITEMS;                                                              // 全量：散布时要为"将来会出现"的对象留位置
  const liveItems = activeIds ? ITEMS.filter(it => activeIds.has(it.id)) : ITEMS;    // 在场：只给它建障碍
  const placed = []; // {x,z,r}
  const nearPath = (x, z, m) => distToPath(pathIndex, x, z) < m;
  const nearRiver = (x, z, m) => Math.abs(x - RIVER.x(z)) < RIVER.halfWidth + m;
  const isRim = (x, z) => Math.abs(x) > RIM.x0 - 12 || Math.abs(z) > RIM.z0 - 8;
  const free = (x, z, rad, opts = {}) => {
    if (Math.abs(x-FARM_AREA.x)<FARM_AREA.width/2+rad+1 && Math.abs(z-FARM_AREA.z)<FARM_AREA.depth/2+rad+1) return false;
    if (FARM_PLOTS.some(p=>Math.hypot(x-p.x,z-p.z)<rad+2)) return false;
    if (nearRiver(x, z, opts.river ?? 2.4)) return false;
    if (nearRoad(x, z, 3.4)) return false;                        // 马路上不长树
    if (insidePaddy(x, z, 1.2)) return false;                     // 稻田里不长野树
    if (insidePool(x, z, 1.8)) return false;                      // 水池里更不行
    if (opts.noMeadow && insideMeadow(x, z, 0.6)) return false;   // 花海里只留花，不留大树
    if (!opts.allowPath && nearPath(x, z, rad + 1.6)) return false;
    if (Math.hypot(x - PLAYER_START.x, z - PLAYER_START.z) < rad + 3) return false;
    for (const bridge of BRIDGES) if (Math.hypot(x - bridge.x, z - bridge.z) < rad + 8) return false;
    for (const it of items) if (Math.hypot(x - it.pos[0], z - it.pos[1]) < rad + Math.max(it.r, 1.6) + 0.6) return false;
    for (const it of items) if (it.viewFrom && Math.hypot(x - it.viewFrom[0], z - it.viewFrom[1]) < rad + 1.4) return false;
    for (const t of SPECIAL_TREES) if (Math.hypot(x - t.pos[0], z - t.pos[1]) < rad + 5) return false;
    for (const p of placed) if (Math.hypot(x - p.x, z - p.z) < rad + p.r) return false;
    return true;
  };
  // 小草小花用的"这里不许长"判定（比 free() 宽松，但同样避开马路 / 稻田 / 水池）
  const keepClear = (x, z, m) => (Math.abs(x-FARM_AREA.x)<FARM_AREA.width/2+m && Math.abs(z-FARM_AREA.z)<FARM_AREA.depth/2+m) || nearRiver(x, z, m) || nearRoad(x, z, m + 2.0) || insidePaddy(x, z, 0.8) || insidePool(x, z, m + 0.4);
  const scatterX = MAP.w / 2 - 2, scatterZ = MAP.h / 2 - 2;

  // ---- instanced clay vegetation
  const blobs = [], trunks = [], rocks = [], grass = [], petals = [], centers = [];
  const addBlob = (x, y, z, sx, sy, sz, col) => blobs.push({ x, y, z, sx, sy, sz, col });
  const addTuft = (x, z, s, col, tilt = 0.4) => grass.push({ x, y: terrainHeight(x, z), z, s, tilt: r.range(-tilt, tilt), rot: r() * Math.PI * 2, col });

  function addTree(x, z, type, s) {
    const h0 = terrainHeight(x, z);
    const trunkCol = r.pick(PAL.trunk);
    if (type === 'blob') {
      trunks.push({ x, y: h0 - 0.2, z, r: 0.32 * s, h: 2.4 * s, col: trunkCol });
      const base = r.pick(PAL.canopy);
      addBlob(x, h0 + 3.0 * s, z, 1.7 * s, 1.5 * s, 1.7 * s, base);
      for (let i = 0; i < 3; i++) {
        const a = r() * Math.PI * 2, rr = r.range(0.7, 1.2) * s;
        addBlob(x + Math.cos(a) * rr, h0 + (2.4 + r.range(0, 1.2)) * s, z + Math.sin(a) * rr, 1.1 * s, 1.0 * s, 1.1 * s, r.pick(PAL.canopy));
      }
      placed.push({ x, z, r: 1.0 * s, tree: true });
    } else if (type === 'acacia') {
      trunks.push({ x, y: h0 - 0.2, z, r: 0.26 * s, h: 3.4 * s, col: trunkCol });
      addBlob(x, h0 + 3.6 * s, z, 2.7 * s, 0.9 * s, 2.7 * s, r.pick(PAL.canopy));
      addBlob(x + 0.8 * s, h0 + 4.0 * s, z - 0.4 * s, 1.4 * s, 0.7 * s, 1.4 * s, r.pick(PAL.canopy));
      addBlob(x - 0.9 * s, h0 + 3.9 * s, z + 0.6 * s, 1.2 * s, 0.6 * s, 1.2 * s, r.pick(PAL.canopy));
      placed.push({ x, z, r: 0.9 * s, tree: true });
    } else { // baobab
      trunks.push({ x, y: h0 - 0.2, z, r: 1.0 * s, h: 3.2 * s, col: trunkCol, fat: true });
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * Math.PI * 2 + r() * 0.5, rr = 0.9 * s;
        addBlob(x + Math.cos(a) * rr, h0 + (3.3 + r.range(0, 0.5)) * s, z + Math.sin(a) * rr, 0.95 * s, 0.85 * s, 0.95 * s, r.pick(PAL.canopy));
      }
      addBlob(x, h0 + 3.9 * s, z, 1.1 * s, 0.9 * s, 1.1 * s, r.pick(PAL.canopy));
      placed.push({ x, z, r: 1.4 * s, tree: true });
    }
  }
  // scattered trees（花海里只留矮花，不长树）
  let tries = 0, made = 0;
  while (made < 86 && tries++ < 14000) {
    const x = r.range(-scatterX, scatterX), z = r.range(-scatterZ, scatterZ);
    const rim = isRim(x, z);
    if (!free(x, z, 2.6, { river: rim ? 0 : 2.4, noMeadow: true })) continue;
    const side = x - RIVER.x(z);
    const type = rim ? (r() < 0.6 ? 'blob' : 'acacia') : side < -2 ? (r() < 0.55 ? 'acacia' : 'baobab') : (r() < 0.78 ? 'blob' : 'acacia');
    addTree(x, z, type, rim ? r.range(0.9, 1.5) : r.range(0.85, 1.3));
    made++;
  }
  // bushes
  tries = 0; made = 0;
  while (made < 140 && tries++ < 14000) {
    const x = r.range(-scatterX + 1, scatterX - 1), z = r.range(-scatterZ + 1, scatterZ - 1);
    if (!free(x, z, 1.0)) continue;
    const s = r.range(0.6, 1.3), h0 = terrainHeight(x, z);
    addBlob(x, h0 + 0.5 * s, z, 1.0 * s, 0.85 * s, 1.0 * s, r.pick(PAL.bush));
    if (r() < 0.6) addBlob(x + 0.7 * s, h0 + 0.35 * s, z + 0.3 * s, 0.7 * s, 0.6 * s, 0.7 * s, r.pick(PAL.bush));
    placed.push({ x, z, r: 0.9 * s });
    made++;
  }
  // rocks
  tries = 0; made = 0;
  while (made < 60 && tries++ < 10000) {
    const x = r.range(-scatterX + 2, scatterX - 2), z = r.range(-scatterZ + 2, scatterZ - 2);
    if (!free(x, z, 1.0, { river: 1.2, noMeadow: true })) continue;
    if (x - RIVER.x(z) > 4 && r() < 0.6) continue; // rocks mostly on the sand side
    const s = r.range(0.5, 1.4), h0 = terrainHeight(x, z);
    rocks.push({ x, y: h0 - 0.15 * s, z, sx: 1.0 * s, sy: 0.6 * s, sz: 0.8 * s, rot: r() * Math.PI, col: r.pick(PAL.rock) });
    placed.push({ x, z, r: 0.9 * s });
    made++;
  }
  // grass tufts & flowers（野生的，花海里另外单独种）
  for (let i = 0; i < 1500; i++) {
    const x = r.range(-scatterX, scatterX), z = r.range(-scatterZ, scatterZ);
    if (keepClear(x, z, 1.0) || nearPath(x, z, 1.3) || insideMeadow(x, z, 0)) continue;
    const side = smoothstep(-3, 3, x - RIVER.x(z));
    if (r() > 0.25 + side * 0.7) continue;
    for (let k = 0; k < 3; k++) addTuft(x + r.range(-0.25, 0.25), z + r.range(-0.25, 0.25), r.range(0.6, 1.3), r.pick(PAL.canopy));
  }
  for (let i = 0; i < 800; i++) {
    const x = r.range(-scatterX, scatterX), z = r.range(-scatterZ, scatterZ);
    if (keepClear(x, z, 1.4) || nearPath(x, z, 1.4) || insideMeadow(x, z, -1)) continue;
    const side = smoothstep(-3, 3, x - RIVER.x(z));
    if (r() > 0.2 + side * 0.6) continue;
    const h0 = terrainHeight(x, z), s = r.range(0.7, 1.2);
    petals.push({ x, y: h0 + 0.36 * s, z, s, col: r.pick(PAL.flowers) });
    centers.push({ x, y: h0 + 0.4 * s, z, s });
  }

  // ---- 花海：比野外密得多的花，边缘稀、中间稠
  for (let i = 0; i < 3200; i++) {
    const x = r.range(MEADOW.x - MEADOW.rx, MEADOW.x + MEADOW.rx);
    const z = r.range(MEADOW.z - MEADOW.rz, MEADOW.z + MEADOW.rz);
    const md = Math.hypot((x - MEADOW.x) / MEADOW.rx, (z - MEADOW.z) / MEADOW.rz);
    if (md > 1 || r() > 1.12 - md * 0.5) continue;
    if (keepClear(x, z, 1.0) || nearPath(x, z, 1.5)) continue;
    const h0 = terrainHeight(x, z), s = r.range(0.85, 1.45);
    petals.push({ x, y: h0 + 0.36 * s, z, s, col: r.pick(PAL.flowers) });
    centers.push({ x, y: h0 + 0.4 * s, z, s });
    if (r() < 0.45) addTuft(x + r.range(-0.3, 0.3), z + r.range(-0.3, 0.3), r.range(0.7, 1.35), r.pick(PAL.canopy), 0.5);
  }

  // Paddy instances are separate from wild grass so each learner's crop can change independently.
  const rice = [];
  {
    const cols = 26, rows = 22;
    for (let iz = 0; iz < rows; iz++) {
      for (let ix = 0; ix < cols; ix++) {
        const x = PADDY.x - PADDY.hx + 0.6 + ix * (PADDY.hx * 2 - 1.2) / (cols - 1) + r.range(-0.14, 0.14);
        const z = PADDY.z - PADDY.hz + 0.6 + iz * (PADDY.hz * 2 - 1.2) / (rows - 1) + r.range(-0.14, 0.14);
        const h0 = terrainHeight(x, z), col = r.pick(PAL.rice);
        for (let k = 0; k < 3; k++) {
          rice.push({ x: x + r.range(-0.16, 0.16), y: h0, z: z + r.range(-0.16, 0.16), s: r.range(1.0, 1.45), tilt: r.range(-0.14, 0.14), rot: r() * Math.PI * 2, col });
        }
      }
    }
    const edges = [[-1, 0, PADDY.hz + 0.35], [1, 0, PADDY.hz + 0.35], [0, -1, PADDY.hx + 0.35], [0, 1, PADDY.hx + 0.35]];
    for (const [sx, sz, len] of edges) {
      for (let t = -len; t <= len; t += 1.1) {
        const x = PADDY.x + sx * (sz ? 0 : len) + (sx ? 0 : t);
        const z = PADDY.z + sz * (sx ? 0 : len) + (sz ? 0 : t);
        const h0 = terrainHeight(x, z), s = r.range(0.8, 1.05);
        addBlob(x, h0 + 0.05 * s, z, 0.66 * s, 0.17 * s, 0.66 * s, '#7E5F41');
      }
    }
  }

  // ---- 水池：岸边的石头、香蒲和睡莲
  {
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2 + r.range(-0.12, 0.12), rr = POOL.r + r.range(1.0, 2.2);
      const x = POOL.x + Math.cos(a) * rr, z = POOL.z + Math.sin(a) * rr;
      const s = r.range(0.5, 1.1), h0 = terrainHeight(x, z);
      rocks.push({ x, y: h0 - 0.1, z, sx: 1.0 * s, sy: 0.55 * s, sz: 0.85 * s, rot: r() * Math.PI, col: r.pick(PAL.rock) });
    }
    for (let i = 0; i < 22; i++) {
      const a = r() * Math.PI * 2, rr = POOL.r + r.range(-0.4, 1.6);
      const x = POOL.x + Math.cos(a) * rr, z = POOL.z + Math.sin(a) * rr;
      const h0 = Math.max(terrainHeight(x, z), POOL.level - 0.15), s = r.range(0.9, 1.5);
      grass.push({ x, y: h0, z, s, tilt: r.range(-0.2, 0.2), rot: r() * Math.PI * 2, col: PAL.reed });
      if (r() < 0.45) addBlob(x, h0 + 1.05 * s, z, 0.075 * s, 0.17 * s, 0.075 * s, PAL.cattail);
    }
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2, rr = r.range(0.6, POOL.r - 1.1);
      const x = POOL.x + Math.cos(a) * rr, z = POOL.z + Math.sin(a) * rr, s = r.range(0.28, 0.42);
      addBlob(x, POOL.level + 0.03, z, s, 0.03, s, PAL.lily);
      if (r() < 0.3) addBlob(x + s * 0.5, POOL.level + 0.09, z, 0.1, 0.07, 0.1, '#F2A3B3');
    }
  }

  const inst = (geoI, list, fill, { shadow = true, mat } = {}) => {
    const mesh = new THREE.InstancedMesh(geoI, mat || clayMaterial(0xffffff, { roughness: 0.8 }), list.length);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), e = new THREE.Euler();
    list.forEach((it, i) => { fill(it, p, e, sc); q.setFromEuler(e); M.compose(p, q, sc); mesh.setMatrixAt(i, M); mesh.setColorAt(i, C(it.col || '#ffffff')); });
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
    return mesh;
  };
  inst(new THREE.SphereGeometry(1, 22, 16), blobs, (it, p, e, sc) => { p.set(it.x, it.y, it.z); e.set(0, 0, 0); sc.set(it.sx, it.sy, it.sz); });
  const trunkGeo = new THREE.CylinderGeometry(0.72, 1, 1, 14); trunkGeo.translate(0, 0.5, 0);
  inst(trunkGeo, trunks, (it, p, e, sc) => { p.set(it.x, it.y, it.z); e.set(0, 0, 0); sc.set(it.r, it.h, it.r); });
  inst(new THREE.SphereGeometry(1, 16, 12), rocks, (it, p, e, sc) => { p.set(it.x, it.y, it.z); e.set(0, it.rot, 0); sc.set(it.sx, it.sy, it.sz); });
  const grassGeo = new THREE.ConeGeometry(0.11, 0.7, 6); grassGeo.translate(0, 0.3, 0);
  inst(grassGeo, grass, (it, p, e, sc) => { p.set(it.x, it.y, it.z); e.set(it.tilt, it.rot, it.tilt * 0.5); sc.set(it.s, it.s, it.s); }, { shadow: false });
  const riceMesh=inst(grassGeo,rice,(it,p,e,sc)=>{p.set(it.x,it.y,it.z);e.set(it.tilt,it.rot,0);sc.setScalar(it.s);},{shadow:false});
  const ears=rice.filter((_,i)=>i%3===0);
  const earMesh=inst(new THREE.SphereGeometry(1,6,4),ears,(it,p,e,sc)=>{p.set(it.x,it.y+.9*it.s,it.z);e.set(0,it.rot,-.3);sc.set(.08,.2,.07);},{shadow:false});
  const riceMatrix=new THREE.Matrix4(), ricePose=new THREE.Object3D(), riceColor=new THREE.Color();
  world.setPaddyStage=stage=>{
    riceMesh.visible=stage>0;earMesh.visible=stage>=5;
    const heights=[0,.17,.35,.6,.95,1.15,1.25], colors=['#936e50','#a9bc75','#a4cf74','#86bb50','#6c9a3c','#bdbe5e','#deb452'];
    rice.forEach((it,i)=>{
      ricePose.position.set(it.x,it.y,it.z);ricePose.rotation.set(it.tilt,it.rot,it.tilt*.5);
      ricePose.scale.set(it.s,it.s*heights[stage],it.s);ricePose.updateMatrix();riceMatrix.copy(ricePose.matrix);
      riceMesh.setMatrixAt(i,riceMatrix);riceMesh.setColorAt(i,riceColor.set(colors[stage]).multiplyScalar(.94+(i%7)*.015));
    });
    ears.forEach((it,i)=>{
      ricePose.position.set(it.x,it.y+.66*it.s*heights[stage],it.z);ricePose.rotation.set(.1,it.rot,-.35);
      ricePose.scale.set(.075*it.s,.2*it.s,.07*it.s);ricePose.updateMatrix();earMesh.setMatrixAt(i,ricePose.matrix);
      earMesh.setColorAt(i,riceColor.set(stage===6?'#efc66b':'#cfb664'));
    });
    riceMesh.instanceMatrix.needsUpdate=true;riceMesh.instanceColor.needsUpdate=true;
    earMesh.instanceMatrix.needsUpdate=true;earMesh.instanceColor.needsUpdate=true;
    // Growth changes the bounds; recompute after each stage to avoid stale culling.
    riceMesh.computeBoundingSphere();earMesh.computeBoundingSphere();
  };
  world.setPaddyStage(0);
  inst(new THREE.SphereGeometry(1, 14, 10), petals, (it, p, e, sc) => { p.set(it.x, it.y, it.z); e.set(0, 0, 0); sc.set(0.24 * it.s, 0.09 * it.s, 0.24 * it.s); }, { shadow: false });
  inst(new THREE.SphereGeometry(1, 10, 8), centers, (it, p, e, sc) => { p.set(it.x, it.y, it.z); e.set(0, 0, 0); sc.set(0.1 * it.s, 0.09 * it.s, 0.1 * it.s); }, { shadow: false, mat: clayMaterial(0xffd54f, { roughness: 0.6 }) });
  const stemGeo = new THREE.CylinderGeometry(0.03, 0.035, 1, 5); stemGeo.translate(0, 0.5, 0);
  inst(stemGeo, centers, (it, p, e, sc) => { p.set(it.x, it.y - 0.4 * it.s, it.z); e.set(0, 0, 0); sc.set(1, 0.38 * it.s, 1); }, { shadow: false, mat: clayMaterial(0x6dbe5b, { roughness: 0.8 }) });

  // ---- perch trees (bird / monkey)
  world.perches = {};
  for (const t of SPECIAL_TREES) {
    const [x, z] = t.pos, s = t.scale, h0 = terrainHeight(x, z);
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.42 * s, 0.62 * s, 5.0 * s, 16), clayMaterial(0x8b5e3c, { roughness: 0.85 }));
    trunk.position.set(x, h0 + 2.3 * s, z); g.add(trunk);
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * s, 0.22 * s, t.branchLen + 0.8, 12), trunk.material);
    branch.rotation.z = t.branchDir * Math.PI / 2 - t.branchDir * 0.1;
    branch.position.set(x + t.branchDir * (t.branchLen / 2 + 0.2), h0 + t.branchH - 0.22, z); g.add(branch);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.42 * s, 14, 10), clayMaterial(r.pick(PAL.canopy)));
    knob.position.set(x + t.branchDir * (t.branchLen + 0.9), h0 + t.branchH + 0.45 * s, z); g.add(knob);
    for (let i = 0; i < 6; i++) {
      const a = (i - 1) / 5 * Math.PI * 2, rr = i === 0 ? 0 : 1.25 * s;
      const c = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 16), clayMaterial(PAL.canopy[i % PAL.canopy.length]));
      c.position.set(x + Math.cos(a) * rr, h0 + (5.2 + (i === 0 ? 0.9 : 0)) * s, z + Math.sin(a) * rr);
      c.scale.setScalar((i === 0 ? 1.9 : 1.3) * s); g.add(c);
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(g);
    placed.push({ x, z, r: 0.8 * s, tree: true });
  }

  // ---- lion rock
  // 这块岩石是常驻风景（狮子没解锁时它也是一块岩石），所以始终存在、始终挡路
  const lion = items.find(i => i.id === 'lion');
  const rockMat = clayMaterial(0xd9b98c, { roughness: 0.9 });
  const rock = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), rockMat);
  const lh = terrainHeight(lion.pos[0], lion.pos[1]);
  rock.position.set(lion.pos[0], lh - 0.35, lion.pos[1]); rock.scale.set(3.3, 1.45, 2.7); rock.rotation.y = 0.4;
  rock.castShadow = rock.receiveShadow = true; scene.add(rock);
  world.rockTop = lh - 0.35 + 1.45;
  for (const [dx, dz, s] of [[-3.4, 1.4, 1.0], [2.9, 2.0, 0.8], [-1.5, 3.2, 0.6]]) {
    const rk = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), clayMaterial(0xcdb28a, { roughness: 0.9 }));
    rk.position.set(lion.pos[0] + dx, terrainHeight(lion.pos[0] + dx, lion.pos[1] + dz) - 0.2 * s, lion.pos[1] + dz); rk.scale.set(s, 0.6 * s, 0.8 * s);
    rk.castShadow = rk.receiveShadow = true; scene.add(rk);
  }
  placed.push({ x: lion.pos[0], z: lion.pos[1], r: 3.5 });

  // ---- bridges
  const bridges = new THREE.Group();
  const wood = clayMaterial(0xc98f5e, { roughness: 0.8 }), wood2 = clayMaterial(0xa8714b, { roughness: 0.8 });
  for (const bridge of BRIDGES) {
    const nPl = 13;
    for (let i = 0; i < nPl; i++) {
      const x = bridge.x - bridge.halfLen + (i + 0.5) * (2 * bridge.halfLen / nPl);
      const y = bridgeY(x, bridge.z);
      const slope = (bridgeY(x + 0.05, bridge.z) - bridgeY(x - 0.05, bridge.z)) / 0.1;
      const pl = new THREE.Mesh(new THREE.BoxGeometry(2 * bridge.halfLen / nPl - 0.08, 0.16, bridge.halfW * 2 - 0.2), i % 2 ? wood : wood2);
      pl.position.set(x, y, bridge.z); pl.rotation.z = Math.atan(slope);
      bridges.add(pl);
    }
    for (const s of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 12; i++) { const x = bridge.x - bridge.halfLen + i * (2 * bridge.halfLen / 12); pts.push(new THREE.Vector3(x, bridgeY(x, bridge.z) + 0.95, bridge.z + s * (bridge.halfW - 0.1))); }
      const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.07, 8), wood2);
      bridges.add(rail);
      for (let i = 0; i <= 4; i++) {
        const x = bridge.x - bridge.halfLen + 0.3 + i * ((2 * bridge.halfLen - 0.6) / 4);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 1.0, 10), wood2);
        post.position.set(x, bridgeY(x, bridge.z) + 0.5, bridge.z + s * (bridge.halfW - 0.1)); bridges.add(post);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), wood); cap.position.set(x, bridgeY(x, bridge.z) + 1.02, bridge.z + s * (bridge.halfW - 0.1)); bridges.add(cap);
      }
    }
  }
  bridges.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(bridges);

  // ---- clouds
  const cloudList = [];
  for (let i = 0; i < 16; i++) {
    const cx = r.range(-105, 105), cz = r.range(-120, 30), cy = r.range(20, 34), s = r.range(1.4, 2.8);
    const g = new THREE.Group();
    const n = 3 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), clayMaterial(0xffffff, { roughness: 0.9, sheen: 0.6 }));
      mesh.position.set((k - (n - 1) / 2) * 1.3 * s + r.range(-0.3, 0.3), r.range(-0.2, 0.5) * s, r.range(-0.5, 0.5) * s);
      mesh.scale.setScalar((k === Math.floor(n / 2) ? 1.5 : r.range(0.9, 1.25)) * s);
      mesh.castShadow = true;
      g.add(mesh);
    }
    g.position.set(cx, cy, cz);
    scene.add(g);
    cloudList.push({ g, speed: r.range(0.25, 0.6), cy });
  }
  world.updaters.push((dt, t) => { for (const c of cloudList) { c.g.position.x += c.speed * dt; if (c.g.position.x > 130) c.g.position.x = -130; c.g.position.y = c.cy + Math.sin(t * 0.3 + c.cy) * 0.3; } });

  // ---- navigation grid
  const nav = new NavGrid({ minX: -MAP.w / 2, minZ: -MAP.h / 2, w: MAP.w, h: MAP.h, cell: 0.5 });
  const obstacles = placed.map(p => ({ x: p.x, z: p.z, r: p.r + 0.35 }));
  for (const it of liveItems) if (it.r > 0) obstacles.push({ x: it.pos[0], z: it.pos[1], r: it.r + 0.35 });
  nav.build((x, z) => {
    if (Math.abs(x) > WALK.x || Math.abs(z) > WALK.z) return false;
    if (!inBridge(x, z)) {
      const h = terrainHeight(x, z);
      if (h < RIVER.level + 0.18 || h > 1.6) return false;
    }
    for (const o of obstacles) if ((x - o.x) ** 2 + (z - o.z) ** 2 < o.r * o.r) return false;
    return true;
  });
  world.nav = nav;
  world.obstacles = obstacles;

  // 运行时解锁的对象：把它的碰撞圈直接补进导航网格。
  // 只把格子标成"不可走"（1 → 0），永远不反向解锁，所以不会破坏地形/河流/桥梁的既有判定。
  world.addObstacle = (x, z, radius) => {
    obstacles.push({ x, z, r: radius });
    const [i0, j0] = nav.toCell(x - radius, z - radius);
    const [i1, j1] = nav.toCell(x + radius, z + radius);
    const iA = Math.max(0, i0), jA = Math.max(0, j0);
    const iB = Math.min(nav.nx - 1, i1), jB = Math.min(nav.nz - 1, j1);
    for (let j = jA; j <= jB; j++) for (let i = iA; i <= iB; i++) {
      const index = j * nav.nx + i;
      if (nav.walk[index] === 0) continue;
      const cell = nav.toWorld(i, j);
      if ((cell.x - x) ** 2 + (cell.z - z) ** 2 < radius * radius) nav.walk[index] = 0;
    }
    return obstacles[obstacles.length - 1];
  };

  world.update = (dt, t) => { for (const u of world.updaters) u(dt, t); };
  return world;
}

export function radialTexture(color = '#ffffff') {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, color); g.addColorStop(0.35, color + 'aa'); g.addColorStop(1, color + '00');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv); return t;
}
