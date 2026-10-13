/* Own a scene's listeners, observers, animation requests and GPU allocations. */
import './scene-manager.js?v=20261003-lifecycle-1';
export function disposeGraph(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
  root?.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    if (node.skeleton) skeletons.add(node.skeleton);
    for (const material of [].concat(node.material || [])) if (material) materials.add(material);
    node.shadow?.map?.dispose();
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    material.dispose();
  }
  if (root?.environment?.isTexture) textures.add(root.environment);
  if (root?.background?.isTexture) textures.add(root.background);
  geometries.forEach(value => value.dispose());
  textures.forEach(value => value.dispose());
  skeletons.forEach(value => value.dispose());
  root?.clear?.();
}

export function createSceneScope() {
  let disposed = false, paused = false, capture = () => ({});
  const cleanups = [], frames = new Map(), pending = new Set(), clocks = [];
  const scope = {
    get disposed() { return disposed; },
    cleanup(fn) { cleanups.push(fn); },
    capture(fn) { capture = fn; },
    clock(value) { clocks.push(value); return value; },
    image() {
      const image = new Image();
      cleanups.push(() => { image.onload = null; image.onerror = null; image.removeAttribute('src'); });
      return image;
    },
    snapshot() { return capture(); },
    listen(target, type, listener, options) {
      if (!target) return;
      target.addEventListener(type, listener, options);
      cleanups.push(() => target.removeEventListener(type, listener, options));
    },
    frame(callback) {
      if (disposed) return;
      if (paused) { pending.add(callback); return; }
      const id = requestAnimationFrame(now => {
        frames.delete(id);
        if (!disposed && !paused) callback(now);
      });
      frames.set(id, callback);
      return id;
    },
    pause() {
      if (disposed || paused) return;
      paused = true;
      for (const [id, callback] of frames) { cancelAnimationFrame(id); pending.add(callback); }
      frames.clear();
    },
    resume() {
      if (disposed || document.hidden) return;
      paused = false;
      clocks.forEach(clock => clock.getDelta());
      const callbacks = [...pending]; pending.clear(); callbacks.forEach(scope.frame);
    },
    own(scene, renderer) {
      cleanups.push(() => {
        disposeGraph(scene);
        renderer.renderLists?.dispose();
        renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
      });
    },
    hooks(names) {
      for (const name of names) {
        const value = window[name];
        cleanups.push(() => { if (window[name] === value) delete window[name]; });
      }
    },
    dispose() {
      if (disposed) return;
      scope.pause(); disposed = true;
      for (const fn of cleanups.reverse()) { try { fn(); } catch (error) { console.warn('Scene cleanup',error); } }
      cleanups.length = 0; pending.clear(); capture = () => ({});
    }
  };
  for (const name of ['ResizeObserver','IntersectionObserver','MutationObserver']) {
    scope[name] = class extends window[name] {
      constructor(callback, options) {
        super((...args) => { if (!disposed) callback(...args); }, options);
        cleanups.push(() => this.disconnect());
      }
    };
  }
  return scope;
}
