import { PerspectiveCamera, Vector3 } from 'three';
import { RENDER, WORLD } from '../core/config';
import type { Sub } from '../core/sim';
import type { Terrain } from '../core/terrain';

/**
 * Orbiting chase camera. The player drags to orbit; after a short idle it
 * swings back behind the sub while the sub is moving.
 */
export class ChaseCamera {
  readonly camera: PerspectiveCamera;
  yaw = 0;
  pitch = 0.28;
  distance: number = RENDER.cameraDistance;
  private idle = 10;
  private readonly target = new Vector3();
  private readonly desired = new Vector3();

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(RENDER.fov, aspect, 0.1, 900);
  }

  orbit(dx: number, dy: number): void {
    this.yaw -= dx * 0.0055;
    this.pitch = Math.max(-0.35, Math.min(1.25, this.pitch + dy * 0.0045));
    this.idle = 0;
  }

  zoom(delta: number): void {
    this.distance = Math.max(RENDER.cameraMinDistance, Math.min(RENDER.cameraMaxDistance, this.distance * (1 + delta * 0.001)));
  }

  update(sub: Sub, terrain: Terrain, dt: number, snap = false): void {
    this.idle += dt;
    const moving = Math.hypot(sub.vel.x, sub.vel.z) > 1.2;
    if (this.idle > 1.6 && moving) {
      let d = sub.heading - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 1.2);
    }
    this.target.copy(sub.pos).add({ x: 0, y: 0.9, z: 0 } as Vector3);
    const cp = Math.cos(this.pitch);
    this.desired.set(
      this.target.x + Math.sin(this.yaw) * cp * this.distance,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * cp * this.distance,
    );
    const floor = terrain.heightAt(this.desired.x, this.desired.z) + 1;
    if (this.desired.y < floor) this.desired.y = floor;
    this.desired.y = Math.min(this.desired.y, WORLD.surfaceY - 0.8);
    if (snap) this.camera.position.copy(this.desired);
    else this.camera.position.lerp(this.desired, 1 - Math.exp(-dt * 7));
    this.camera.lookAt(this.target);
  }

  /** Slow cinematic orbit for the title screen. */
  attract(time: number, center: Vector3): void {
    const a = time * 0.05;
    this.camera.position.set(center.x + Math.sin(a) * 26, center.y + 9 + Math.sin(time * 0.1) * 2, center.z + Math.cos(a) * 26);
    this.camera.lookAt(center.x, center.y - 2, center.z);
    this.yaw = a;
  }
}
