import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

const loader = new GLTFLoader();
const shared = { yaw: -0.34, elevation: 0.13, distance: 6.3, drag: null };
const views = [];
let mixer = null;
let clips = {};
let action = null;
const clock = new THREE.Clock();

function makeView(id, path, animated) {
  const stage = document.getElementById(id);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 40);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.7));
  stage.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xfff7df, 0x8b9d91, 2.6));
  const key = new THREE.DirectionalLight(0xffeccc, 3.1);
  key.position.set(-3, 7, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xd5e5ff, 1.8);
  rim.position.set(4, 5, -4);
  scene.add(rim);

  const resize = () => {
    const width = Math.max(1, stage.clientWidth), height = Math.max(1, stage.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(stage);
  resize();

  loader.load(path, gltf => {
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    if (size.y > 0) model.scale.multiplyScalar(2.8 / size.y);
    model.updateMatrixWorld(true);
    const scaled = new THREE.Box3().setFromObject(model);
    const center = scaled.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= scaled.min.y;
    scene.add(model);
    if (animated) {
      mixer = new THREE.AnimationMixer(model);
      clips = Object.fromEntries(gltf.animations.map(clip => [clip.name, clip]));
      document.querySelectorAll('[data-action]').forEach(button => {
        if (button.dataset.action !== 'idle' && !clips[button.dataset.action]) button.disabled = true;
      });
    }
    stage.querySelector('.loading')?.remove();
  }, undefined, error => {
    stage.querySelector('.loading').textContent = `模型加载失败：${error.message}`;
  });

  stage.addEventListener('pointerdown', event => {
    shared.drag = { id, x: event.clientX, y: event.clientY };
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener('pointermove', event => {
    if (!shared.drag || shared.drag.id !== id) return;
    shared.yaw += (event.clientX - shared.drag.x) * 0.008;
    shared.elevation = THREE.MathUtils.clamp(shared.elevation + (event.clientY - shared.drag.y) * 0.005, -0.24, 0.46);
    shared.drag.x = event.clientX;
    shared.drag.y = event.clientY;
  });
  stage.addEventListener('pointerup', () => { shared.drag = null; });
  stage.addEventListener('pointercancel', () => { shared.drag = null; });
  stage.addEventListener('wheel', event => {
    event.preventDefault();
    shared.distance = THREE.MathUtils.clamp(shared.distance + event.deltaY * 0.004, 4.6, 9);
  }, { passive: false });
  views.push({ scene, camera, renderer });
}

makeView('originalStage', '/assets/characters/tuantuan-girl-tripo.glb', false);
makeView('riggedStage', new URLSearchParams(location.search).get('model') === 'meshy'
  ? '/assets/characters/tuantuan-meshy-walk-run-review.glb'
  : '/clay-safari/models/explorer.glb?v=20260930-tuantuan-3', true);

document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => {
  if (!mixer) return;
  action?.fadeOut(0.16);
  const name = button.dataset.action;
  action = name === 'idle' ? null : mixer.clipAction(clips[name]);
  if (action) action.reset().fadeIn(0.16).play();
  else mixer.stopAllAction();
  document.querySelectorAll('[data-action]').forEach(item => item.classList.toggle('active', item === button));
}));

function draw() {
  requestAnimationFrame(draw);
  const delta = Math.min(clock.getDelta(), 0.05);
  mixer?.update(delta);
  const eye = new THREE.Vector3(
    Math.sin(shared.yaw) * Math.cos(shared.elevation) * shared.distance,
    1.42 + Math.sin(shared.elevation) * shared.distance,
    Math.cos(shared.yaw) * Math.cos(shared.elevation) * shared.distance,
  );
  for (const view of views) {
    view.camera.position.copy(eye);
    view.camera.lookAt(0, 1.42, 0);
    view.renderer.render(view.scene, view.camera);
  }
}
draw();
