import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

const stage = document.querySelector('#characterStage');
const fallback = stage.querySelector('.model-fallback');
const status = document.querySelector('#loadingStatus');
const info = document.querySelector('#modelInfo');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
let renderer, model, drag = null, spin = false;
let yaw = -0.48, targetYaw = yaw, elevation = 0.24, targetElevation = elevation, zoom = 8.1;
let last = performance.now();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function showFallback(message) {
  fallback.style.display = 'block';
  status.textContent = message;
  status.classList.add('fallback-status');
  info.textContent = '正面图片';
}

try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  stage.append(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xfffaec, 0x96ab99, 2.5));
  const key = new THREE.DirectionalLight(0xffedcd, 3.3);
  key.position.set(-3, 7, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xc8e0ff, 1.2);
  fill.position.set(4, 4, 1);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xfff5de, 2.6);
  rim.position.set(0, 5, -5);
  scene.add(rim);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(1.18, 64), new THREE.MeshBasicMaterial({ color: 0xd7dfce, transparent: true, opacity: 0.33, depthWrite: false }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.038;
  scene.add(ground);

  function resize() {
    const width = Math.max(stage.clientWidth, 1), height = Math.max(stage.clientHeight, 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  new GLTFLoader().load('/clay-safari/models/explorer.glb?v=20260930-tuantuan-3', gltf => {
    model = gltf.scene;
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    if (size.y > 0) model.scale.multiplyScalar(2.8 / size.y);
    model.updateMatrixWorld(true);
    const fitted = new THREE.Box3().setFromObject(model);
    const center = fitted.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= fitted.min.y;
    scene.add(model);
    fallback.style.display = 'none';
    status.remove();
    info.textContent = '团团乐园模型 · 可旋转';
  }, undefined, error => {
    console.error('团团模型加载失败', error);
    showFallback('3D 暂时无法显示，正在展示团团正面图');
  });

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (spin && !reducedMotion.matches) targetYaw += dt * 0.4;
    yaw = THREE.MathUtils.lerp(yaw, targetYaw, Math.min(1, dt * 6));
    elevation = THREE.MathUtils.lerp(elevation, targetElevation, Math.min(1, dt * 6));
    const focus = 1.68;
    camera.position.set(Math.sin(yaw) * Math.cos(elevation) * zoom, focus + Math.sin(elevation) * zoom, Math.cos(yaw) * Math.cos(elevation) * zoom);
    camera.lookAt(0, focus, 0);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
} catch (error) {
  console.error('3D 预览无法启动', error);
  showFallback('此设备无法显示 3D，正在展示团团正面图');
}

document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-view]').forEach(other => other.classList.toggle('selected', other === button));
  const view = button.dataset.view;
  spin = view === 'spin';
  if (view === 'three-quarter') targetYaw = -0.48;
  if (view === 'front') targetYaw = 0;
  if (view === 'side') targetYaw = Math.PI / 2;
  if (view === 'back') targetYaw = Math.PI;
  targetElevation = 0.24;
}));

stage.addEventListener('pointerdown', event => {
  drag = { x: event.clientX, y: event.clientY };
  stage.setPointerCapture(event.pointerId);
  spin = false;
});
stage.addEventListener('pointermove', event => {
  if (!drag) return;
  targetYaw += (event.clientX - drag.x) * 0.009;
  targetElevation = THREE.MathUtils.clamp(targetElevation + (event.clientY - drag.y) * 0.006, -0.32, 0.65);
  drag = { x: event.clientX, y: event.clientY };
  document.querySelectorAll('[data-view]').forEach(button => button.classList.remove('selected'));
});
stage.addEventListener('pointerup', () => { drag = null; });
stage.addEventListener('pointercancel', () => { drag = null; });
stage.addEventListener('wheel', event => {
  event.preventDefault();
  zoom = THREE.MathUtils.clamp(zoom + event.deltaY * 0.0045, 6, 10.5);
}, { passive: false });
