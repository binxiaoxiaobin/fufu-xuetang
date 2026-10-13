import {
  AdditiveBlending, BoxGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide, Group, LatheGeometry, Mesh,
  MeshPhysicalMaterial, MeshStandardMaterial, Object3D, PointLight, ShaderMaterial, SphereGeometry, SpotLight,
  TorusGeometry, Vector2,
} from 'three';
import type { Sub } from '../core/sim';
import { applyWorldFx, globalUniforms } from './shared';

/**
 * The player's bathyscaphe, modelled from primitives. Nose points -Z so
 * rotation.y = heading matches the simulation's convention.
 */
export class Submarine {
  readonly root = new Group();
  private readonly body = new Group();
  private readonly prop = new Group();
  private readonly sideProps: Group[] = [];
  private readonly beam: Mesh;
  private readonly beamMat: ShaderMaterial;
  readonly headlight: SpotLight;
  private readonly glow: PointLight;
  private readonly navRed: MeshStandardMaterial;
  private readonly navGreen: MeshStandardMaterial;
  private readonly headlightMat: MeshStandardMaterial;

  constructor(shadows: boolean) {
    const paint = applyWorldFx(new MeshPhysicalMaterial({ color: '#ff6b4a', roughness: 0.32, metalness: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.2 }));
    const cream = applyWorldFx(new MeshStandardMaterial({ color: '#efe6d2', roughness: 0.45, metalness: 0.1 }));
    const brass = new MeshStandardMaterial({ color: '#d9a441', roughness: 0.28, metalness: 0.95 });
    const steel = new MeshStandardMaterial({ color: '#2b3a40', roughness: 0.55, metalness: 0.7 });
    const glass = new MeshPhysicalMaterial({
      color: '#bfefff', roughness: 0.04, metalness: 0, transmission: 0, transparent: true, opacity: 0.32,
      clearcoat: 1, clearcoatRoughness: 0.02, side: DoubleSide, depthWrite: false,
    });
    const darkGlass = new MeshStandardMaterial({ color: '#0b2a33', roughness: 0.1, metalness: 0.6, emissive: new Color('#0a3a44'), emissiveIntensity: 0.6 });

    // Hull: lathe profile around Y, then laid along Z.
    const pts: Vector2[] = [];
    const len = 3.9;
    for (let i = 0; i <= 28; i++) {
      const t = i / 28;
      const nose = Math.sin(Math.min(1, t / 0.28) * Math.PI / 2);
      const tail = 1 - Math.pow(Math.max(0, (t - 0.55) / 0.45), 1.6) * 0.72;
      pts.push(new Vector2(Math.max(0.001, 1.05 * nose * tail), t * len - len * 0.5));
    }
    const hullGeo = new LatheGeometry(pts, 40);
    hullGeo.rotateX(Math.PI / 2); // lathe axis Y → Z, nose (t=0) lands at -Z
    hullGeo.scale(1, 0.92, 1);
    const hull = new Mesh(hullGeo, paint);
    this.body.add(hull);

    // Cream belly stripe and brass bands.
    for (const [z, r, mat] of [[-0.55, 1.02, cream], [0.55, 0.97, cream], [1.2, 0.78, brass]] as const) {
      const band = new Mesh(new TorusGeometry(r, 0.05, 10, 48), mat);
      band.position.z = z;
      band.scale.y = 0.92;
      this.body.add(band);
    }

    // Glass canopy up front with a tiny pilot inside.
    const dome = new Mesh(new SphereGeometry(0.72, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.55), glass);
    dome.position.set(0, 0.5, -0.95);
    dome.rotation.x = -0.35;
    this.body.add(dome);
    const domeRim = new Mesh(new TorusGeometry(0.66, 0.06, 10, 40), brass);
    domeRim.position.set(0, 0.62, -0.98);
    domeRim.rotation.x = Math.PI / 2 - 0.35;
    this.body.add(domeRim);
    const pilot = new Group();
    const suit = new Mesh(new SphereGeometry(0.26, 16, 12), cream);
    suit.scale.set(1, 1.1, 0.9);
    const helmet = new Mesh(new SphereGeometry(0.2, 16, 12), new MeshStandardMaterial({ color: '#ffd166', roughness: 0.3, metalness: 0.2 }));
    helmet.position.y = 0.3;
    const visor = new Mesh(new SphereGeometry(0.15, 16, 12, 0, Math.PI, 0, Math.PI * 0.6), darkGlass);
    visor.position.set(0, 0.32, -0.08);
    visor.rotation.y = Math.PI;
    pilot.add(suit, helmet, visor);
    pilot.position.set(0, 0.55, -0.8);
    this.body.add(pilot);

    // Conning tower with antenna and nav lights.
    const tower = new Mesh(new CylinderGeometry(0.34, 0.46, 0.55, 20), paint);
    tower.position.set(0, 1.0, 0.35);
    tower.scale.z = 1.6;
    this.body.add(tower);
    const hatch = new Mesh(new CylinderGeometry(0.28, 0.28, 0.08, 20), brass);
    hatch.position.set(0, 1.3, 0.35);
    this.body.add(hatch);
    const antenna = new Mesh(new CylinderGeometry(0.018, 0.018, 0.9, 6), steel);
    antenna.position.set(0.12, 1.75, 0.6);
    this.body.add(antenna);
    this.navRed = new MeshStandardMaterial({ color: '#ff3b3b', emissive: new Color('#ff2020'), emissiveIntensity: 3 });
    this.navGreen = new MeshStandardMaterial({ color: '#46ff8a', emissive: new Color('#20ff60'), emissiveIntensity: 3 });
    const tip = new Mesh(new SphereGeometry(0.06, 8, 6), this.navRed);
    tip.position.set(0.12, 2.22, 0.6);
    this.body.add(tip);

    // Portholes.
    for (const side of [-1, 1]) {
      for (const z of [-0.1, 0.55]) {
        const ring = new Mesh(new TorusGeometry(0.2, 0.05, 8, 24), brass);
        ring.position.set(side * 1.0, 0.1, z);
        ring.rotation.y = Math.PI / 2;
        const pane = new Mesh(new CylinderGeometry(0.19, 0.19, 0.05, 20), darkGlass);
        pane.position.copy(ring.position);
        pane.rotation.z = Math.PI / 2;
        this.body.add(ring, pane);
      }
      const nav = new Mesh(new SphereGeometry(0.07, 8, 6), side < 0 ? this.navRed : this.navGreen);
      nav.position.set(side * 0.98, 0.45, -0.6);
      this.body.add(nav);
    }

    // Tail cross-fins.
    for (let k = 0; k < 4; k++) {
      const fin = new Mesh(new BoxGeometry(0.06, 0.62, 0.7), paint);
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      fin.position.set(Math.cos(a) * 0.42, Math.sin(a) * 0.42, 1.55);
      fin.rotation.z = a - Math.PI / 2;
      this.body.add(fin);
    }

    // Ducted main propeller.
    const duct = new Mesh(new CylinderGeometry(0.52, 0.46, 0.42, 32, 1, true), brass);
    duct.rotation.x = Math.PI / 2;
    duct.position.z = 2.05;
    const ductMat = duct.material as MeshStandardMaterial;
    ductMat.side = DoubleSide;
    this.body.add(duct);
    const hub = new Mesh(new ConeGeometry(0.12, 0.35, 12), steel);
    hub.rotation.x = Math.PI / 2;
    hub.position.z = 2.15;
    this.body.add(hub);
    for (let b = 0; b < 5; b++) {
      const blade = new Mesh(new BoxGeometry(0.1, 0.42, 0.03), brass);
      blade.position.y = 0.23;
      blade.rotation.y = 0.5;
      const holder = new Object3D();
      holder.rotation.z = (b / 5) * Math.PI * 2;
      holder.add(blade);
      this.prop.add(holder);
    }
    this.prop.position.z = 2.05;
    this.body.add(this.prop);

    // Side thruster pods.
    for (const side of [-1, 1]) {
      const pod = new Group();
      const shell = new Mesh(new CylinderGeometry(0.2, 0.2, 0.7, 16, 1, true), paint);
      shell.rotation.x = Math.PI / 2;
      (shell.material as MeshStandardMaterial).side = DoubleSide;
      const strut = new Mesh(new BoxGeometry(0.4, 0.07, 0.25), steel);
      strut.position.x = -side * 0.3;
      const mini = new Group();
      for (let b = 0; b < 3; b++) {
        const blade = new Mesh(new BoxGeometry(0.06, 0.17, 0.02), brass);
        blade.position.y = 0.09;
        const h = new Object3D();
        h.rotation.z = (b / 3) * Math.PI * 2;
        h.add(blade);
        mini.add(h);
      }
      mini.position.z = 0.2;
      pod.add(shell, strut, mini);
      pod.position.set(side * 1.35, -0.35, 0.5);
      this.sideProps.push(mini);
      this.body.add(pod);
    }

    // Landing skids.
    for (const side of [-1, 1]) {
      const rail = new Mesh(new CylinderGeometry(0.05, 0.05, 2.6, 8), steel);
      rail.rotation.x = Math.PI / 2;
      rail.position.set(side * 0.55, -1.05, 0);
      this.body.add(rail);
      for (const z of [-0.7, 0.7]) {
        const leg = new Mesh(new CylinderGeometry(0.04, 0.04, 0.4, 6), steel);
        leg.position.set(side * 0.5, -0.85, z);
        leg.rotation.z = side * 0.3;
        this.body.add(leg);
      }
    }

    // Twin headlamps and their visible beam.
    this.headlightMat = new MeshStandardMaterial({ color: '#fff7d6', emissive: new Color('#fff1b8'), emissiveIntensity: 4 });
    for (const side of [-1, 1]) {
      const lamp = new Mesh(new CylinderGeometry(0.13, 0.16, 0.12, 16), this.headlightMat);
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set(side * 0.45, -0.35, -1.78);
      const bezel = new Mesh(new TorusGeometry(0.15, 0.035, 8, 20), brass);
      bezel.position.copy(lamp.position);
      this.body.add(lamp, bezel);
    }
    this.beamMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      uniforms: { uStrength: { value: 0.3 }, uTime: globalUniforms.uTime },
      vertexShader: /* glsl */ `
        varying float vH; varying vec3 vN; varying vec3 vV;
        void main() {
          vH = uv.y;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vV = normalize(-mv.xyz);
          vN = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uStrength;
        varying float vH; varying vec3 vN; varying vec3 vV;
        void main() {
          float edge = pow(clamp(abs(dot(vN, vV)), 0.0, 1.0), 2.0);
          float a = edge * pow(clamp(vH, 0.0, 1.0), 1.6) * uStrength;
          gl_FragColor = vec4(vec3(1.0, 0.95, 0.8) * a, a);
        }`,
    });
    const beamGeo = new CylinderGeometry(0.2, 3.2, 14, 24, 1, true);
    beamGeo.translate(0, -7, 0);
    this.beam = new Mesh(beamGeo, this.beamMat);
    this.beam.rotation.x = Math.PI / 2 - 0.12; // cone points down -Z, tipped slightly down
    this.beam.position.set(0, -0.35, -1.85);
    this.beam.renderOrder = 8;
    this.body.add(this.beam);

    this.headlight = new SpotLight('#fff3d1', 120, 42, 0.55, 0.55, 1.4);
    this.headlight.position.set(0, -0.3, -1.9);
    this.headlight.target.position.set(0, -2.2, -12);
    this.body.add(this.headlight, this.headlight.target);
    this.glow = new PointLight('#ffd9a8', 0.6, 2.5, 2); // cabin light for the pilot
    this.glow.position.set(0, 0.7, -0.8);
    this.body.add(this.glow);

    this.body.traverse((o) => {
      if ((o as Mesh).isMesh && o !== this.beam && (o as Mesh).material !== glass) {
        o.castShadow = shadows;
        o.receiveShadow = shadows;
      }
    });
    this.root.add(this.body);
    this.root.scale.setScalar(0.85);
  }

  update(sub: Sub, time: number, night: number): void {
    this.root.position.copy(sub.pos);
    this.root.rotation.set(0, sub.heading, 0);
    this.body.rotation.set(sub.pitch, 0, sub.bank, 'YXZ');
    // Idle bob.
    this.body.position.y = Math.sin(time * 1.4) * 0.06;
    this.prop.rotation.z = sub.prop;
    for (const p of this.sideProps) p.rotation.z = -sub.prop * 1.4;
    const blink = Math.sin(time * 3) > 0.6 ? 1 : 0.15;
    this.navRed.emissiveIntensity = 1 + 3 * blink;
    this.navGreen.emissiveIntensity = 1 + 3 * blink;
    this.headlight.intensity = 60 + night * 260;
    this.beamMat.uniforms.uStrength.value = 0.1 + night * 0.35;
    this.headlightMat.emissiveIntensity = 2.5 + night * 3;
    this.glow.intensity = 0.4 + night * 1.2;
  }
}
