import './style.css';
import { Audio } from './audio/audio';
import { SIM, STORAGE_KEYS, TIERS, VEILFIN, type UpgradeId } from './core/config';
import { generateLayout } from './core/layout';
import { createLocalStore } from './core/save';
import { idleInput, Sim, type GameEvent } from './core/sim';
import { getSpecies } from './core/species';
import { Terrain } from './core/terrain';
import { Input, type Action } from './input/input';
import { World, type Quality } from './render/world';
import { fmt, Hud } from './ui/hud';
import { Shop } from './ui/shop';
import { bindTouch } from './ui/touch';

type Mode = 'title' | 'playing' | 'paused';

interface Settings { night: boolean; muted: boolean }

const el = <T extends HTMLElement>(id: string): T => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`E_DOM_MISSING: #${id}`);
  return e as T;
};

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function loadSettings(): Settings {
  try {
    const raw = storage()?.getItem(STORAGE_KEYS.settings);
    const s = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
    return { night: s.night === true, muted: s.muted === true };
  } catch {
    return { night: false, muted: false };
  }
}

function saveSettings(s: Settings): void {
  try {
    storage()?.setItem(STORAGE_KEYS.settings, JSON.stringify(s));
  } catch (err) {
    console.error('[fishslop] E_SETTINGS_WRITE', (err as Error).name);
  }
}

function webglAvailable(): { ok: boolean; software: boolean } {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return { ok: false, software: false };
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const name = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { ok: true, software: /swiftshader|llvmpipe|software/i.test(name) };
  } catch {
    return { ok: false, software: false };
  }
}

function pickQuality(software: boolean): Quality {
  const q = new URLSearchParams(location.search).get('quality');
  if (q === 'low' || q === 'high') return q;
  if (software) return 'low';
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  return coarse && (navigator.hardwareConcurrency ?? 8) <= 4 ? 'low' : 'high';
}

function boot(): void {
  const gl = webglAvailable();
  if (!gl.ok) {
    el('webgl-error').hidden = false;
    el<HTMLButtonElement>('btn-dive').textContent = 'WebGL unavailable';
    console.error('[fishslop] E_WEBGL_UNAVAILABLE');
    return;
  }

  const terrain = new Terrain();
  const layout = generateLayout(terrain);
  const store = createLocalStore(STORAGE_KEYS.save, storage());
  const saved = store.load();
  let sim = saved ? Sim.fromSave(terrain, layout.colliders, saved) : Sim.newGame(terrain, layout.colliders);
  const settings = loadSettings();

  const canvas = el<HTMLCanvasElement>('scene');
  const scale = Number(new URLSearchParams(location.search).get('scale'));
  const world = new World(canvas, terrain, layout, pickQuality(gl.software), scale >= 0.2 && scale <= 2 ? scale : undefined);
  world.setNight(settings.night);
  const audio = new Audio();
  audio.setMuted(settings.muted);
  const hud = new Hud();

  let mode: Mode = 'title';
  let time = 0;
  let acc = 0;
  let autosave: number = SIM.autosaveInterval;
  const tips = { coinSeen: false, shopHinted: false };
  let returning = saved !== null;
  const growToastAt = new Map<string, number>();

  const persist = () => {
    if (mode === 'title' && !saved) return;
    store.save(sim.toSave());
  };

  // ---------------------------------------------------------------- shop
  const shop = new Shop(
    (id) => {
      const r = sim.buySpecies(id);
      if (r.ok) persist();
      else hud.toast(r.reason === 'full' ? 'The reef is full.' : 'Not enough coins yet.');
    },
    (id: UpgradeId) => {
      const r = sim.buyUpgrade(id);
      if (r.ok) persist();
    },
    () => closeShop(),
  );

  function openShop(): void {
    if (mode !== 'playing') return;
    audio.click();
    input.enabled = false;
    input.clear();
    shop.open(sim);
  }

  function closeShop(): void {
    if (!shop.isOpen) return;
    shop.close();
    if (mode === 'playing') input.enabled = true;
    canvas.focus?.();
  }

  // ---------------------------------------------------------------- modes
  const title = el('title');
  const pauseScreen = el('pause');
  const diveBtn = el<HTMLButtonElement>('btn-dive');
  const newBtn = el<HTMLButtonElement>('btn-new');

  function refreshTitle(): void {
    const hasSave = returning;
    diveBtn.disabled = false;
    diveBtn.textContent = hasSave ? 'Continue dive' : 'Dive in';
    newBtn.hidden = !hasSave;
    const note = el('save-note');
    note.hidden = !hasSave;
    note.textContent = hasSave ? `${sim.fish.length} fish · ${fmt(sim.coins)} coins · ${TIERS[sim.tier].name}` : '';
  }

  function dive(): void {
    if (mode !== 'title') return;
    audio.start();
    audio.click();
    title.classList.add('leaving');
    window.setTimeout(() => { title.hidden = true; }, 700);
    hud.root.hidden = false;
    mode = 'playing';
    input.enabled = true;
    if (!returning) {
      hud.toast('Hold <b>Space</b> to drop food. Hungry fish come to you.', '', 6000);
      window.setTimeout(() => hud.toast('Drag to look around. <b>E</b> / <b>Q</b> to rise and dive.', '', 5000), 2500);
    } else {
      hud.toast(`Welcome back. ${sim.fish.length} fish are waiting.`);
    }
  }

  function newReef(): void {
    store.clear();
    returning = false;
    sim = Sim.newGame(terrain, layout.colliders);
    tips.coinSeen = false;
    tips.shopHinted = false;
  }

  function pause(): void {
    if (mode !== 'playing') return;
    closeShop();
    mode = 'paused';
    input.enabled = false;
    input.clear();
    persist();
    audio.suspend();
    const s = sim.stats;
    el('stats').innerHTML = [
      ['Coins banked', fmt(sim.totalEarned)],
      ['Residents', String(sim.fish.length)],
      ['Pellets dropped', fmt(s.pelletsDropped)],
      ['Veilfins fed', String(s.veilfinsFed)],
      ['Reef', TIERS[sim.tier].name],
      ['Time underwater', `${Math.floor(s.playTime / 60)} min`],
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    pauseScreen.hidden = false;
    el('btn-resume').focus();
  }

  function resume(): void {
    if (mode !== 'paused') return;
    pauseScreen.hidden = true;
    mode = 'playing';
    input.enabled = true;
    audio.resume();
  }

  const resetBtn = el<HTMLButtonElement>('btn-reset');
  let resetArmed = false;
  resetBtn.addEventListener('click', () => {
    if (!resetArmed) {
      resetArmed = true;
      resetBtn.textContent = 'Tap again to erase this reef';
      window.setTimeout(() => { resetArmed = false; resetBtn.textContent = 'Start a new reef'; }, 3500);
      return;
    }
    resetArmed = false;
    resetBtn.textContent = 'Start a new reef';
    newReef();
    resume();
    hud.toast('Fresh reef. Six tetras and two clownfish are yours.');
  });

  diveBtn.addEventListener('click', dive);
  newBtn.addEventListener('click', () => {
    newReef();
    refreshTitle();
    dive();
  });
  el('btn-resume').addEventListener('click', resume);
  el('btn-dock').addEventListener('click', () => (shop.isOpen ? closeShop() : openShop()));
  el('btn-pause').addEventListener('click', pause);

  const nightBtn = el('btn-night');
  const soundBtn = el('btn-sound');
  const syncToggles = () => {
    nightBtn.setAttribute('aria-pressed', String(settings.night));
    nightBtn.setAttribute('aria-label', settings.night ? 'Switch to day' : 'Switch to night');
    soundBtn.classList.toggle('muted', settings.muted);
    soundBtn.setAttribute('aria-label', settings.muted ? 'Unmute sound' : 'Mute sound');
  };
  const toggleNight = () => {
    settings.night = !settings.night;
    world.setNight(settings.night);
    saveSettings(settings);
    syncToggles();
  };
  const toggleMute = () => {
    settings.muted = !settings.muted;
    audio.setMuted(settings.muted);
    saveSettings(settings);
    syncToggles();
  };
  nightBtn.addEventListener('click', toggleNight);
  soundBtn.addEventListener('click', toggleMute);
  syncToggles();

  // ---------------------------------------------------------------- input
  const onAction = (a: Action) => {
    switch (a) {
      case 'shop':
        if (shop.isOpen) closeShop();
        else openShop();
        break;
      case 'pause':
        if (shop.isOpen) closeShop();
        else if (mode === 'playing') pause();
        else if (mode === 'paused') resume();
        break;
      case 'night': if (mode !== 'title') toggleNight(); break;
      case 'mute': toggleMute(); break;
      case 'sonar': input.queueSonar(); break;
    }
  };
  const input = new Input(canvas, onAction, (dx, dy) => world.cam.orbit(dx, dy), (d) => world.cam.zoom(d));
  bindTouch(input, () => input.queueSonar());

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      persist();
      if (mode === 'playing') pause();
    }
  });
  window.addEventListener('pagehide', persist);

  // ---------------------------------------------------------------- events → feedback
  const handle = (e: GameEvent) => {
    switch (e.type) {
      case 'feed': audio.feed(); break;
      case 'eat': audio.eat(); break;
      case 'drop':
        if (!tips.coinSeen) {
          tips.coinSeen = true;
          hud.toast('A fed fish dropped a coin. Swim close to collect it.');
        }
        break;
      case 'coin': {
        audio.coin(e.tier);
        const p = world.project(sim.sub.pos);
        if (p.visible) hud.floater(`+${e.value}`, p.x, p.y, e.tier >= 3);
        world.burstAt(sim.sub.pos, 6);
        if (!tips.shopHinted && sim.coins >= sim.priceOf('clown')) {
          tips.shopHinted = true;
          hud.toast('You can afford a new fish. Open <b>the dock</b> with <b>B</b>.', '', 5000);
        }
        break;
      }
      case 'grow': {
        const last = growToastAt.get(e.species) ?? -99;
        if (time - last > 25) {
          growToastAt.set(e.species, time);
          hud.toast(`Your ${getSpecies(e.species).name.toLowerCase()} is growing. Bigger fish pay more.`);
        }
        break;
      }
      case 'sonar': audio.sonar(); break;
      case 'veilfin-appear':
        audio.veilfin();
        hud.toast('Something pale is circling the reef. Ping sonar with <b>F</b> to see it.', 'phosphor', 6000);
        break;
      case 'veilfin-fed':
        hud.toast(`The Veilfin took the food and left a pearl worth <b>${VEILFIN.reward}</b>.`, 'legend', 6000);
        break;
      case 'tier':
        audio.tierUp();
        hud.toast(`${TIERS[e.index].name} reached. New residents at the dock.`, 'legend', 5500);
        break;
      case 'purchase':
        audio.purchase(e.legendary);
        hud.toast(e.legendary ? 'The Slopfish has arrived. The reef will never be the same.' : `${e.what} ${e.upgrade ? 'upgraded' : 'joined the reef'}.`, e.legendary ? 'legend' : '');
        break;
      case 'hopper-empty':
        audio.empty();
        hud.flashEmptyHopper();
        break;
    }
  };

  // ---------------------------------------------------------------- loop
  const resize = () => world.resize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', resize);
  resize();
  world.compile();

  let last = performance.now();
  let hudTimer = 0;
  const idle = idleInput();
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, SIM.maxFrameDelta);
    last = now;
    if (mode === 'paused') {
      world.render(sim, 0, time, false);
      return;
    }
    time += dt;
    acc += dt;
    while (acc >= SIM.step) {
      const inp = mode === 'playing' ? input.poll(world.cam.yaw, (x, y) => world.cam.orbit(x, y), SIM.step) : idle;
      sim.step(inp, SIM.step, mode !== 'playing');
      acc -= SIM.step;
    }
    const events = sim.drainEvents();
    if (mode === 'playing') for (const e of events) handle(e);
    world.render(sim, dt, time, mode === 'title');

    if (mode === 'playing') {
      audio.tick(dt, sim.sub.vel.length(), sim.sub.boosting);
      hud.drawScope(sim, time);
      hudTimer -= dt;
      if (hudTimer <= 0) {
        hudTimer = 1 / 15;
        hud.update(sim);
        shop.render(sim);
      }
      autosave -= dt;
      if (autosave <= 0) {
        autosave = SIM.autosaveInterval;
        persist();
      }
    }
  };
  requestAnimationFrame(frame);
  refreshTitle();

  // Test/debug hook: read-only views plus the same actions the UI performs.
  (window as unknown as { __fishslop: unknown }).__fishslop = {
    get sim() { return sim; },
    get mode() { return mode; },
    get shopOpen() { return shop.isOpen; },
    get quality() { return world.quality; },
    get render() { return world.stats; },
    get night() { return world.isNight; },
    get world() { return world; },
  };
}

try {
  boot();
} catch (err) {
  console.error('[fishslop] E_BOOT', err);
  const e = document.getElementById('webgl-error');
  if (e) {
    e.hidden = false;
    e.textContent = 'The reef failed to load. Reload the page to try again.';
  }
}
