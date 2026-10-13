import * as THREE from 'three';
import { surfaceHeight, terrainHeight, inBridge } from './world.js?v=20261003-paddy-1';
import { PLAYER_START, MAP } from './data.js';
import { clamp, lerp } from './noise.js';
import { sfx } from './audio.js?v=20260929-fufutts-1';

const UP = new THREE.Vector3(0, 1, 0);
const WALK_SPEED = 6.6;      // 地图变大了，步速相应提高一点
const RUN_SPEED = 11.4;

export class Player {
  constructor(model, world, camera, dom) {
    this.model = model; this.world = world; this.camera = camera; this.dom = dom;
    this.group = new THREE.Group();
    this.rigged = !!model.userData.claySafariRigged;
    this.modelScale = this.rigged ? 1.05 : 1.15;
    model.scale.setScalar(this.modelScale);
    this.group.add(model);
    if (this.rigged) {
      this.mixer = new THREE.AnimationMixer(model);
      this.actions = Object.fromEntries((model.userData.animationClips || [])
        .map(clip => [clip.name.toLowerCase(), this.mixer.clipAction(clip)]));
      this.activeAction = null;
    }
    this.pos = new THREE.Vector3(PLAYER_START.x, 0, PLAYER_START.z);
    this.heading = PLAYER_START.rot;
    this.speed = 0; this.walkT = 0; this.stepAcc = 0;
    this.parts = { legL: model.getObjectByName('leg-1'), legR: model.getObjectByName('leg1'), armL: model.getObjectByName('arm-1'), armR: model.getObjectByName('arm1'), head: model.getObjectByName('head') };
    this.base = {}; for (const k in this.parts) if (this.parts[k]) this.base[k] = this.parts[k].rotation.clone();
    this.keys = new Set();
    this.joy = new THREE.Vector2();
    this.path = null; this.pathIdx = 0; this.autoTarget = null;
    this.locked = false;           // tour drives movement
    this.farmGesture = null;
    // camera orbit
    this.yaw = 0; this.pitch = 0.42; this.dist = 13;
    this.targetYaw = 0; this.targetPitch = 0.42; this.targetDist = 13;
    this.lastDragT = -10;
    this.overview = false; this.overviewT = 0;
    this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3();
    this.blockedT = 0;
    this.bindKeys();
    this.updateTransform(0);
    this.snapCamera();
  }
  bindKeys() {
    window.addEventListener('keydown', (e) => { if (e.target && (e.target.tagName === 'INPUT')) return; this.keys.add(e.code); if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault(); this.onInput?.(); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }
  get position() { return this.group.position; }

  // ---- movement
  goTo(x, z) {
    const nav = this.world.nav;
    const path = nav.findPath({ x: this.pos.x, z: this.pos.z }, { x, z });
    if (!path || path.length < 2) { this.path = null; return false; }
    this.path = path; this.pathIdx = 1;
    return true;
  }
  stop() { this.path = null; }
  moveDir() {
    const d = new THREE.Vector2();
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) d.y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) d.y += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) d.x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) d.x += 1;
    if (d.lengthSq() === 0 && this.joy.lengthSq() > 0.02) d.copy(this.joy);
    if (d.lengthSq() === 0) { this.rawInput = null; return null; }
    if (d.lengthSq() > 1) d.normalize();
    this.rawInput = d.clone();
    // camera-relative
    const cy = this.yaw;
    const fx = -Math.sin(cy), fz = -Math.cos(cy);           // forward = away from camera
    const rx = Math.cos(cy), rz = -Math.sin(cy);
    return new THREE.Vector2(fx * -d.y + rx * d.x, fz * -d.y + rz * d.x);
  }
  tryMove(dx, dz) {
    const nav = this.world.nav;
    const nx = this.pos.x + dx, nz = this.pos.z + dz;
    if (nav.isWalkable(nx, nz)) { this.pos.x = nx; this.pos.z = nz; return true; }
    if (nav.isWalkable(nx, this.pos.z)) { this.pos.x = nx; return true; }
    if (nav.isWalkable(this.pos.x, nz)) { this.pos.z = nz; return true; }
    return false;
  }
  update(dt, t) {
    const run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const maxSpeed = (run ? RUN_SPEED : WALK_SPEED) * (this.locked ? 1.15 : 1);
    let dir = this.locked ? null : this.moveDir();
    if (dir) {this.path = null;this.clearFarmFocus();}
    if (!dir && this.path) {
      const wp = this.path[this.pathIdx];
      const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.35) { this.pathIdx++; if (this.pathIdx >= this.path.length) { this.path = null; this.onArrive?.(); } }
      else dir = new THREE.Vector2(dx / d, dz / d);
    }
    const target = dir ? maxSpeed : 0;
    this.speed = lerp(this.speed, target, 1 - Math.exp(-dt * (dir ? 9 : 14)));
    if (dir && this.speed > 0.05) {
      const want = Math.atan2(dir.x, dir.y);
      let dh = want - this.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      this.heading += dh * (1 - Math.exp(-dt * 12));
      const moved = this.tryMove(dir.x * this.speed * dt, dir.y * this.speed * dt);
      if (!moved) { this.blockedT += dt; if (this.path && this.blockedT > 0.6) { this.goTo(this.path[this.path.length - 1].x, this.path[this.path.length - 1].z); this.blockedT = 0; } }
      else this.blockedT = 0;
      this.stepAcc += this.speed * dt;
      if (this.stepAcc > 1.4) { this.stepAcc = 0; sfx.step(); }
    }
    this.walkT += dt * this.speed * 2.2;
    this.updateTransform(dt);
    if (this.mixer) this.mixer.update(dt);
    this.updateFarmGesture(dt);
    this.updateCamera(dt, t);
  }
  updateTransform(dt) {
    const y = surfaceHeight(this.pos.x, this.pos.z);
    this.group.position.set(this.pos.x, y, this.pos.z);
    this.group.rotation.y = this.heading;
    if (this.rigged) {
      const next = this.speed < 0.25 ? null : this.speed > (WALK_SPEED + RUN_SPEED) * 0.5
        ? this.actions.running : this.actions.walking;
      if (next !== this.activeAction) {
        this.activeAction?.fadeOut(0.2);
        if (next) next.reset().fadeIn(0.2).play();
        this.activeAction = next;
      }
      if (next) next.timeScale = Math.max(0.55, Math.min(1.25,
        this.speed / (next === this.actions.running ? RUN_SPEED : WALK_SPEED)));
      this.model.position.y = 0;
      this.model.rotation.z = 0;
      this.model.scale.setScalar(this.modelScale);
      return;
    }
    const w = Math.min(1, this.speed / WALK_SPEED), P = this.parts, B = this.base, T = this.walkT;
    const swing = Math.sin(T) * 0.75 * w;
    if (P.legL) P.legL.rotation.x = B.legL.x + swing;
    if (P.legR) P.legR.rotation.x = B.legR.x - swing;
    if (P.armL) { P.armL.rotation.x = B.armL.x - swing * 0.8; P.armL.rotation.z = B.armL.z + Math.sin(T * 0.5) * 0.04; }
    if (P.armR) { P.armR.rotation.x = B.armR.x + swing * 0.8; P.armR.rotation.z = B.armR.z - Math.sin(T * 0.5) * 0.04; }
    if (P.head) { P.head.rotation.z = Math.sin(T * 0.5) * 0.06 * w; P.head.rotation.y = Math.sin(T * 0.25) * 0.08; }
    this.model.position.y = Math.abs(Math.sin(T)) * 0.08 * w + (1 - w) * Math.sin(performance.now() * 0.002) * 0.01;
    const bob = 1 + Math.sin(T * 2) * 0.03 * w;
    this.model.scale.set(1.15 / Math.sqrt(bob), 1.15 * bob, 1.15 / Math.sqrt(bob));
    this.model.rotation.z = Math.sin(T) * 0.04 * w;
  }
  // ---- camera
  focusFarmTarget(point,distance,panelWidth){this.farmFocus={point:point.clone(),panelWidth};this.overview=false;this.targetDist=distance;this.targetPitch=.68;this.targetYaw=.35;}
  clearFarmFocus(){this.farmFocus=null;}
  playFarmGesture(kind, position) {
    if (position) this.heading = Math.atan2(position.x-this.pos.x, position.z-this.pos.z);
    const nodes = ['mixamorig:RightArm','mixamorig:RightForeArm','mixamorig:Spine','mixamorig:Head']
      .map(name=>this.model.getObjectByName(name)||this.model.getObjectByName(name.replace(':',''))).filter(Boolean);
    if (this.farmGesture) for (const pose of this.farmGesture.poses) pose.node.quaternion.copy(pose.base);
    this.farmGesture = {kind,elapsed:0,poses:nodes.map(node=>({node,base:node.quaternion.clone()}))};
  }
  updateFarmGesture(dt) {
    const gesture=this.farmGesture;if(!gesture)return;
    gesture.elapsed+=dt;const phase=Math.sin(Math.min(1,gesture.elapsed/1.5)*Math.PI);
    for(const pose of gesture.poses){
      pose.node.quaternion.copy(pose.base);
      const arm=/Arm/.test(pose.node.name),angle=arm?.35*phase:.12*phase;
      pose.node.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),angle));
    }
    if(gesture.elapsed>=1.5){for(const pose of gesture.poses)pose.node.quaternion.copy(pose.base);this.farmGesture=null;}
  }
  orbit(dx, dy) { this.targetYaw -= dx * 0.005; this.targetPitch = clamp(this.targetPitch + dy * 0.004, 0.12, 1.25); this.lastDragT = performance.now() / 1000; }
  zoom(f) { this.targetDist = clamp(this.targetDist * f, 5, 34); }
  snapCamera() { this.yaw = this.targetYaw; this.pitch = this.targetPitch; this.dist = this.targetDist; this.updateCamera(1, 0, true); }
  setOverview(on) { this.overview = on; }
  updateCamera(dt, t, snap = false) {
    const k = snap ? 1 : 1 - Math.exp(-dt * 6);
    // gentle auto-follow behind the player when walking and the user isn't dragging
    // (only while walking forward or along a path — sideways input must not rotate the input frame)
    const forwardish = !this.rawInput || (this.rawInput.y < -0.6 && Math.abs(this.rawInput.x) < 0.5);
    if (this.speed > 1 && forwardish && t - this.lastDragT > 2.5 && !this.overview && !this.farmFocus) {
      const behind = this.heading + Math.PI;
      let dy = behind - this.targetYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.targetYaw += dy * (1 - Math.exp(-dt * 0.9));
    }
    this.yaw += (this.targetYaw - this.yaw) * k;
    this.pitch += (this.targetPitch - this.pitch) * k;
    this.dist += (this.targetDist - this.dist) * k;
    this.overviewT += ((this.overview ? 1 : 0) - this.overviewT) * (snap ? 1 : 1 - Math.exp(-dt * 2.2));
    const desiredLook=this.farmFocus?this.farmFocus.point.clone():this.group.position.clone().add(new THREE.Vector3(0,1.4,0));
    if(this.farmFocus){
      const shift=this.dist*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2))*this.camera.aspect*Math.min(.6,this.farmFocus.panelWidth/this.dom.clientWidth);
      desiredLook.add(new THREE.Vector3(Math.cos(this.yaw),0,-Math.sin(this.yaw)).multiplyScalar(shift));
    }
    const look=snap?desiredLook:this.camLook.clone().lerp(desiredLook,k);
    const off = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)).multiplyScalar(this.dist);
    let cam = look.clone().add(off);
    // keep camera above terrain
    const ground = terrainHeight(cam.x, cam.z) + 0.8;
    if (cam.y < ground) cam.y = ground;
    // overview blend (poster view) — 按地图尺寸放大，保证整张地图进画面
    const ovLook = new THREE.Vector3(0, 0, 0), ovCam = new THREE.Vector3(0, MAP.h * 0.92, MAP.h * 0.92);
    const e = this.overviewT * this.overviewT * (3 - 2 * this.overviewT);
    cam.lerp(ovCam, e); look.lerp(ovLook, e);
    this.camPos.copy(cam); this.camLook.copy(look);
    this.camera.position.copy(cam);
    this.camera.lookAt(look);
  }
}
