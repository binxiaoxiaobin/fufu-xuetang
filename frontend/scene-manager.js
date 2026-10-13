/* Keep one recent scene warm; release colder GPU scenes and idle instances. */
(() => {
  if (window.FufuScenes) return;
  const factories = new Map(), instances = new Map(), saved = new Map();
  let active = '', serial = 0;
  const idleMs = 30000;
  function release(name) {
    const entry = instances.get(name);
    if (!entry || name === active) return;
    clearTimeout(entry.timer);
    saved.set(name, entry.instance.snapshot?.() || {});
    entry.instance.dispose();
    instances.delete(name);
    document.getElementById(`page-${name}`)?.setAttribute('data-scene-resident', 'false');
  }
  function trim() {
    const cold = [...instances.entries()].filter(([name]) => name !== active).sort((a,b) => b[1].used-a[1].used);
    cold.slice(1).forEach(([name]) => release(name));
  }
  function mount(name) {
    if (!factories.has(name)) return;
    let entry = instances.get(name);
    if (!entry) {
      const instance = factories.get(name)(saved.get(name) || {});
      if (!instance) return;
      entry = { instance, used: ++serial, timer: null };
      instances.set(name, entry);
    }
    clearTimeout(entry.timer); entry.timer = null; entry.used = ++serial;
    entry.instance.resume?.();
    document.getElementById(`page-${name}`)?.setAttribute('data-scene-resident', 'true');
    trim();
  }
  window.FufuScenes = {
    register(name, factory) {
      factories.set(name, factory);
      if (active === name || (!active && document.getElementById(`page-${name}`)?.classList.contains('active'))) {
        active = name; mount(name);
      }
    },
    enter(name) {
      active = name;
      for (const [key, entry] of instances) {
        if (key === name) continue;
        entry.instance.pause?.();
        if (!entry.timer) entry.timer = setTimeout(() => release(key), idleMs);
      }
      mount(name);
      trim();
    }
  };
  document.addEventListener('visibilitychange', () => {
    const entry = instances.get(active);
    if (document.hidden) entry?.instance.pause?.(); else entry?.instance.resume?.();
  });
})();
