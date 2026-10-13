import { ROUTE } from './data.js';
import { speak, sfx } from './audio.js?v=20260929-fufutts-1';
import { wait } from './tween.js';

// Robot-led auto tour: walks the explorer to each item's viewpoint, faces it and
// triggers the same discover() flow a click would.
export class Tour {
  constructor({ player, creatures, discover, ui, robot }) {
    Object.assign(this, { player, creatures, discover, ui, robot });
    this.active = false; this.token = 0; this.current = null;
  }
  async start(fromId) {
    if (this.active) return;
    this.active = true; const token = ++this.token;
    this.ui.setTour(true); this.ui.toast('🤖 跟我来！Follow me!', 2200);
    sfx.whoosh();
    await speak("Let's go on a tour!", 'en-US');
    let route = ROUTE;
    if (fromId && ROUTE.includes(fromId)) route = ROUTE.slice(ROUTE.indexOf(fromId));
    for (const id of route) {
      if (!this.active || token !== this.token) return;
      const c = this.creatures[id]; if (!c || !c.def.viewFrom) continue;
      this.current = c;
      const [vx, vz] = c.def.viewFrom;
      this.player.locked = true;
      const ok = this.player.goTo(vx, vz);
      if (ok) { await new Promise(res => { this.player.onArrive = res; const chk = setInterval(() => { if (!this.active || token !== this.token || !this.player.path) { clearInterval(chk); res(); } }, 200); }); }
      if (!this.active || token !== this.token) return;
      // face the creature; camera swings behind the explorer and tilts up for perched friends
      const dx = c.group.position.x - this.player.pos.x, dz = c.group.position.z - this.player.pos.z;
      this.player.heading = Math.atan2(dx, dz);
      this.player.targetYaw = this.player.heading + Math.PI;
      this.player.targetPitch = typeof c.def.y === 'number' && c.def.y > 1 ? 0.08 : 0.38;
      this.player.targetDist = typeof c.def.y === 'number' && c.def.y > 1 ? 9 : 12;
      this.player.lastDragT = performance.now() / 1000;
      await wait(250);
      if (!this.active || token !== this.token) return;
      await this.discover(c, { fromTour: true });
      await wait(700);
    }
    if (this.active && token === this.token) {
      this.ui.toast('🎉 导览结束！Tour complete!', 3000);
      await speak('The tour is over. Great job, explorer!', 'en-US');
      this.stop();
    }
  }
  stop() {
    if (!this.active) return;
    this.active = false; this.token++; this.current = null;
    this.player.locked = false; this.player.path = null; this.player.onArrive = null;
    this.ui.setTour(false);
  }
  toggle() { this.active ? this.stop() : this.start(); }
}
