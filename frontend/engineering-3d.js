import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

const host = document.querySelector('#engineeringCanvasHost');
if (host) {
  const stage = host.closest('.machine-scene');
  const labels = [...stage.querySelectorAll('[data-machine-part]')];
  const partNames = { cab: 'Cab', boom: 'Boom', arm: 'Arm', bucket: 'Bucket', track: 'CrawlerBelts' };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#b9d1cb');
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label', '可拖动旋转和滚轮缩放的三维挖掘机');
  renderer.domElement.style.touchAction = 'none';
  host.append(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xe6f5ee, 0x596157, 2.1));
  const keyLight = new THREE.DirectionalLight(0xfff1cf, 3.4);
  keyLight.position.set(-8, 13, 10);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xd1e7ff, 1.2);
  fillLight.position.set(9, 6, -8);
  scene.add(fillLight);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: '#c7d4bc', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -4.8;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(80, 40, '#829887', '#9dac9a');
  grid.position.y = -4.78;
  grid.material.transparent = true;
  grid.material.opacity = 0.25;
  scene.add(grid);

  const root = new THREE.Group();
  scene.add(root);
  const loader = new GLTFLoader();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  const originalMaterials = new Map();
  let model;
  let selectedPart = null;
  let azimuth = 0.62;
  let elevation = 0.28;
  let distance = 17;
  let target = new THREE.Vector3(0, -0.8, 0);
  let drag = null;
  let modelReady = false;

  const loading = document.createElement('div');
  loading.className = 'machine-model-loading';
  loading.setAttribute('role', 'status');
  loading.textContent = '正在载入挖掘机模型…';
  stage.append(loading);

  function cameraPosition() {
    const horizontal = Math.cos(elevation) * distance;
    camera.position.set(target.x + Math.sin(azimuth) * horizontal, target.y + Math.sin(elevation) * distance, target.z + Math.cos(azimuth) * horizontal);
    camera.lookAt(target);
  }
  function resize() {
    const rect = host.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height, false);
  }
  function groupFor(key) {
    return model?.getObjectByName(partNames[key]) || null;
  }
  function storeOriginalMaterial(mesh) {
    if (originalMaterials.has(mesh)) return;
    const copyMaterial = (material) => {
      const clone = material.clone();
      originalMaterials.set(mesh, originalMaterials.get(mesh) || []);
      originalMaterials.get(mesh).push({ source: material, clone });
      return clone;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(copyMaterial) : copyMaterial(mesh.material);
  }
  function setHighlight(key) {
    originalMaterials.forEach((materials, mesh) => {
      mesh.material = Array.isArray(mesh.material) ? materials.map((entry) => entry.source) : materials[0].source;
    });
    originalMaterials.clear();
    selectedPart = key;
    const selected = key && groupFor(key);
    if (selected) selected.traverse((item) => {
      if (!item.isMesh) return;
      storeOriginalMaterial(item);
      const mats = Array.isArray(item.material) ? item.material : [item.material];
      mats.forEach((material) => {
        if (material.emissive) {
          material.emissive.set('#ffd15a');
          material.emissiveIntensity = 0.65;
        }
      });
    });
    labels.forEach((label) => label.classList.toggle('active', label.dataset.machinePart === key));
  }
  function selectPart(key, focus = false) {
    const group = groupFor(key);
    if (!group) return;
    setHighlight(key);
    window.dispatchEvent(new CustomEvent('engineering-part-select', { detail: { key } }));
    if (focus) {
      box.setFromObject(group);
      box.getCenter(target);
      distance = Math.max(7, Math.min(distance, box.getSize(new THREE.Vector3()).length() * 2.4));
      cameraPosition();
    }
  }
  function positionLabels() {
    if (!modelReady) return;
    const rect = host.getBoundingClientRect();
    labels.forEach((label) => {
      const group = groupFor(label.dataset.machinePart);
      if (!group) { label.hidden = true; return; }
      box.setFromObject(group);
      box.getCenter(point).project(camera);
      const visible = point.z > -1 && point.z < 1 && Math.abs(point.x) < 1.1 && Math.abs(point.y) < 1.1;
      label.hidden = !visible;
      if (visible) {
        label.style.left = `${(point.x + 1) * rect.width / 2}px`;
        label.style.top = `${(1 - point.y) * rect.height / 2}px`;
      }
    });
  }
  function animate() {
    requestAnimationFrame(animate);
    if (!host.clientWidth || !host.clientHeight) return;
    cameraPosition();
    positionLabels();
    renderer.render(scene, camera);
  }
  function resetView() {
    azimuth = 0.62; elevation = 0.28; distance = 17; target.set(0, -0.8, 0);
    setHighlight(null);
    cameraPosition();
  }
  labels.forEach((label) => label.addEventListener('click', () => selectPart(label.dataset.machinePart, true)));
  document.querySelector('#engineeringReset').addEventListener('click', resetView);

  renderer.domElement.addEventListener('pointerdown', (event) => {
    drag = { x: event.clientX, y: event.clientY, moved: false };
    renderer.domElement.setPointerCapture(event.pointerId);
  });
  renderer.domElement.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    azimuth -= dx * 0.008;
    elevation = THREE.MathUtils.clamp(elevation + dy * 0.006, -0.2, 1.05);
    drag.x = event.clientX; drag.y = event.clientY;
  });
  renderer.domElement.addEventListener('pointerup', (event) => {
    if (!drag) return;
    if (!drag.moved && modelReady) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(model, true)[0]?.object;
      let node = hit;
      while (node && node !== model) {
        const key = Object.keys(partNames).find((part) => node.name === partNames[part]);
        if (key) { selectPart(key); break; }
        node = node.parent;
      }
    }
    drag = null;
  });
  renderer.domElement.addEventListener('pointercancel', () => { drag = null; });
  renderer.domElement.addEventListener('wheel', (event) => {
    event.preventDefault();
    distance = THREE.MathUtils.clamp(distance * (event.deltaY > 0 ? 1.08 : 0.92), 9, 32);
  }, { passive: false });

  new ResizeObserver(resize).observe(host);
  window.addEventListener('resize', resize);
  loader.load('/assets/engineering/cet200.glb', (gltf) => {
    model = gltf.scene;
    model.traverse((item) => {
      if (!item.isMesh) return;
      item.castShadow = true;
      item.receiveShadow = true;
      if (item.material) {
        const materials = Array.isArray(item.material) ? item.material : [item.material];
        materials.forEach((material) => { material.side = THREE.DoubleSide; material.needsUpdate = true; });
      }
    });
    const bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const scale = 10 / Math.max(size.x, size.y, size.z);
    model.position.sub(center);
    model.scale.setScalar(scale);
    ground.position.y = (bounds.min.y - center.y) * scale - 0.04;
    grid.position.y = ground.position.y + 0.01;
    root.add(model);
    modelReady = true;
    loading.remove();
    cameraPosition();
    resize();
  }, (event) => {
    if (event.total) loading.textContent = `正在载入挖掘机模型… ${Math.round(event.loaded / event.total * 100)}%`;
  }, () => {
    loading.textContent = '模型载入失败，请刷新页面重试。';
    loading.classList.add('is-error');
  });
  animate();
}
