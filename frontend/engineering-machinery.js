// 可复用的工程机械教具。+X 为车头，+Y 为上方；零件和关节均有独立名称。
import * as THREE from './vendor/three.module.js';
const UP = new THREE.Vector3(0, 1, 0);
const rad = THREE.MathUtils.degToRad;

export function createMachinery(kind) {
  const root = new THREE.Group();
  root.name = `machine_${kind}`;
  const joints = {}, hydraulics = [];
  const m = {};
  for (const [key, color, metalness, roughness] of [
    ['paint', 0xe9ac24, 0.18, 0.48], ['accent', 0xc77a18, 0.2, 0.52],
    ['rubber', 0x27343a, 0.02, 0.95], ['steel', 0x647782, 0.65, 0.38],
    ['chrome', 0xcbd9dc, 0.82, 0.22], ['glass', 0x477780, 0.25, 0.25],
    ['blue', 0x397c84, 0.15, 0.45], ['white', 0xf1eee0, 0.1, 0.55],
    ['orange', 0xed7734, 0.1, 0.5], ['red', 0xc74937, 0.15, 0.5],
  ]) m[key] = new THREE.MeshStandardMaterial({color, metalness, roughness});
  m.lamp = new THREE.MeshStandardMaterial({color:0xffe8a7, emissive:0xffc965, emissiveIntensity:0.45});
  function add(parent, geometry, material, name, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name;
    mesh.position.set(x,y,z); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function box(parent, name, w,h,d,x,y,z, material = m.paint, bevel = false) {
    let geometry;
    if (bevel) {
      const s = new THREE.Shape(); const c = Math.min(w,h,d) * 0.08;
      s.moveTo(-w/2+c,-h/2); s.lineTo(w/2-c,-h/2); s.lineTo(w/2,-h/2+c);
      s.lineTo(w/2,h/2-c); s.lineTo(w/2-c,h/2); s.lineTo(-w/2+c,h/2);
      s.lineTo(-w/2,h/2-c); s.lineTo(-w/2,-h/2+c); s.closePath();
      geometry = new THREE.ExtrudeGeometry(s,{depth:d-c*2,bevelEnabled:true,bevelThickness:c,bevelSize:c/2,bevelSegments:1,steps:1});
      geometry.translate(0,0,-d/2+c);
    } else geometry = new THREE.BoxGeometry(w,h,d);
    return add(parent,geometry,material,name,x,y,z);
  }
  function cylinder(parent,name,r,h,x,y,z,material=m.steel) {
    return add(parent,new THREE.CylinderGeometry(r,r,h,20),material,name,x,y,z);
  }
  function group(parent,name,x=0,y=0,z=0,rotation=0) {
    const g=new THREE.Group(); g.name=name; g.position.set(x,y,z); g.rotation.z=rotation; parent.add(g); joints[name]=g; return g;
  }
  function bar(parent,name,a,b,r=0.035,material=m.steel) {
    const start=new THREE.Vector3(...a), end=new THREE.Vector3(...b), delta=end.clone().sub(start);
    const mesh=cylinder(parent,name,r,delta.length(),0,0,0,material);
    mesh.position.copy(start).add(end).multiplyScalar(0.5); mesh.quaternion.setFromUnitVectors(UP,delta.normalize()); return mesh;
  }
  function pin(parent,x,y,z,r=0.1) {
    const p=cylinder(parent,'arm_pin',r,0.25,x,y,z,m.chrome); p.rotation.x=Math.PI/2;
  }
  function ram(parentA,a,parentB,b) {
    const start=new THREE.Object3D(),end=new THREE.Object3D(); start.position.set(...a);end.position.set(...b);
    parentA.add(start);parentB.add(end);
    const barrel=cylinder(root,'hydraulic_barrel',0.075,1,0,0,0,m.accent);
    const rod=cylinder(root,'hydraulic_piston',0.039,1,0,0,0,m.chrome);
    hydraulics.push({start,end,barrel,rod});
  }
  function wheel(parent,x,z,r=0.5,width=0.35,name='wheel') {
    const pivot=group(parent,name+'_roll',x,r,z);
    const tire=cylinder(pivot,name+'_tire',r,width,0,0,0,m.rubber);tire.rotation.x=Math.PI/2;
    const hub=cylinder(pivot,name+'_hub',r*0.53,width+0.025,0,0,0,m.paint);hub.rotation.x=Math.PI/2;
    const cap=cylinder(pivot,name+'_axle',r*0.18,width+0.05,0,0,0,m.steel);cap.rotation.x=Math.PI/2;
    const lugs=new THREE.InstancedMesh(new THREE.BoxGeometry(r*0.16,r*0.065,width*1.03),m.rubber,24);
    const matrix=new THREE.Matrix4();
    for(let i=0;i<24;i++) {const a=i*Math.PI/12;matrix.makeRotationZ(a);matrix.setPosition(Math.sin(a)*r,Math.cos(a)*r,0);lugs.setMatrixAt(i,matrix);}
    lugs.name=name+'_tread';lugs.castShadow=true;pivot.add(lugs);return pivot;
  }
  function tracks(parent,length=3.7,width=2.7) {
    for(const side of [-1,1]) {
      const z=side*(width/2-0.3), track=group(parent,'track_'+(side<0?'left':'right'));
      const shape=new THREE.Shape();const r=0.42,half=length/2-r;
      shape.moveTo(-half,r);shape.lineTo(half,r);shape.absarc(half,0,r,Math.PI/2,-Math.PI/2,true);
      shape.lineTo(-half,-r);shape.absarc(-half,0,r,-Math.PI/2,-Math.PI*1.5,true);
      const geom=new THREE.ExtrudeGeometry(shape,{depth:0.54,bevelEnabled:false,steps:1,curveSegments:10});
      geom.translate(0,0.44,z-0.27);add(track,geom,m.rubber,'track_belt');
      for(let i=0;i<7;i++) {const x=-half+i*half/3; const roller=cylinder(track,'track_roller',i===0||i===6?0.3:0.22,0.59,x,0.44,z,m.steel);roller.rotation.x=Math.PI/2;
        const hub=cylinder(track,'track_hub',0.1,0.61,x,0.44,z,m.accent);hub.rotation.x=Math.PI/2;}
      const count=44, shoes=new THREE.InstancedMesh(new THREE.BoxGeometry(0.15,0.06,0.62),m.steel,count);
      const matrix=new THREE.Matrix4();const perimeter=4*half+2*Math.PI*r;
      for(let i=0;i<count;i++) {
        let distance=i/count*perimeter,x,y,a;
        if(distance<2*half){x=-half+distance;y=r;a=0;}
        else if(distance<2*half+Math.PI*r){a=(distance-2*half)/r;x=half+Math.sin(a)*r;y=Math.cos(a)*r;a=-a;}
        else if(distance<4*half+Math.PI*r){x=half-(distance-2*half-Math.PI*r);y=-r;a=0;}
        else {a=(distance-4*half-Math.PI*r)/r;x=-half-Math.sin(a)*r;y=-Math.cos(a)*r;a=-a;}
        matrix.makeRotationZ(a);matrix.setPosition(x,y+0.44,z);shoes.setMatrixAt(i,matrix);
      }
      shoes.name='track_shoes';shoes.castShadow=true;track.add(shoes);
    }
    box(parent,'track_chassis',length*0.68,0.28,width*0.66,0,0.86,0,m.steel,true);
  }
  function cab(parent,x,y,z,w=0.95,h=1.2,d=1.0) {
    box(parent,'cab_floor',w+0.08,0.12,d+0.08,x,y-h/2,z,m.steel);
    box(parent,'cab_glazing',w*0.93,h*0.8,d*0.93,x,y+0.04,z,m.glass,true);
    for(const dx of [-1,1])for(const dz of [-1,1])box(parent,'cab_pillar',0.055,h,0.055,x+dx*w/2,y,z+dz*d/2,m.rubber);
    box(parent,'cab_roof',w+0.12,0.12,d+0.12,x,y+h/2,z,m.paint,true);
    box(parent,'cab_door_frame',0.045,0.7,0.03,x-w/2,y+0.03,z+d/2+0.03,m.chrome);
    box(parent,'cab_door_handle',0.14,0.035,0.045,x,y-0.12,z+d/2+0.04,m.chrome);
    bar(parent,'cab_wiper',[x+w/2+0.025,y-h*0.2,z-0.2],[x+w/2+0.025,y+h*0.23,z+0.18],0.014,m.rubber);
    cylinder(parent,'cab_beacon_base',0.06,0.04,x,y+h/2+0.09,z,m.rubber);
    cylinder(parent,'cab_beacon',0.055,0.1,x,y+h/2+0.15,z,m.orange);
    for(const dz of [-1,1]){
      box(parent,'cab_headlight',0.055,0.12,0.15,x+w/2+0.06,y-h/2+0.08,z+dz*d*0.32,m.lamp);
      bar(parent,'cab_mirror_arm',[x+w/2,y+h*0.2,z+dz*d/2],[x+w/2+0.1,y+h*0.2,z+dz*(d/2+0.2)],0.019);
      box(parent,'cab_mirror',0.07,0.18,0.16,x+w/2+0.1,y+h*0.2,z+dz*(d/2+0.2),m.rubber);
    }
  }
  function vents(parent,x,y,z,w=0.7) {
    for(let i=0;i<7;i++)box(parent,'engine_vent',w,0.035,0.015,x,y+i*0.07,z,m.rubber);
  }
  function scoop(parent,width=1.0,depth=0.8,height=0.55,name='bucket') {
    box(parent,name+'_floor',depth,0.09,width,depth/2,-height,0,m.steel);
    const back=box(parent,name+'_back',0.1,height,width,0.04,-height/2,0,m.steel);back.rotation.z=0.15;
    for(const side of [-1,1]) {
      const shape=new THREE.Shape();shape.moveTo(0,0);shape.lineTo(depth,-height+0.06);shape.lineTo(0,-height);shape.closePath();
      const geometry=new THREE.ExtrudeGeometry(shape,{depth:0.06,bevelEnabled:false});
      add(parent,geometry,m.steel,name+'_side',0,0,side*width/2-0.03);
    }
    for(let i=0;i<5;i++)box(parent,name+'_tooth',0.22,0.08,0.09,depth+0.08,-height,(-0.4+i*0.2)*width,m.chrome);
  }
  function truckBase() {
    box(root,'chassis',4.6,0.23,1.65,0,0.73,0,m.rubber,true);
    for(const x of [-1.65,-0.8,1.4])for(const z of [-1,1])wheel(root,x,z*0.88,0.46,0.31,'wheel_'+x+'_'+z);
    box(root,'cab_body',1.1,0.82,1.75,1.65,1.35,0,m.blue,true);
    cab(root,1.65,2.0,0,1.02,0.85,1.68);
    box(root,'cab_bumper',0.16,0.19,1.92,2.24,0.85,0,m.chrome,true);
    box(root,'cab_grille',0.03,0.4,0.9,2.215,1.25,0,m.rubber);
    for(const z of [-0.94,0.94])box(root,'cab_step',0.7,0.07,0.2,1.5,0.75,z,m.steel);
  }
  let rig={},motions={};
  const action=(keys,loop=false,linear=false)=>({keys,loop,linear});
  if(kind==='excavator'||kind==='demolition') {
    tracks(root);
    cylinder(root,'slew_ring',0.64,0.2,0,1.04,0);
    const slew=group(root,'slew',0,1.17,0);
    box(slew,'engine_counterweight',2.35,0.78,1.88,-0.58,0.43,0,m.paint,true);
    box(slew,'engine_cover',1.5,0.1,1.5,-0.95,0.88,-0.13,m.accent,true);
    vents(slew,-0.98,0.3,-0.96,1.0);
    cab(slew,0.14,1.06,0.7,1.03,1.55,0.95);
    cylinder(slew,'engine_exhaust',0.05,0.52,-1.14,1.1,-0.56,m.rubber);
    for(const side of [-1,1])bar(slew,'engine_handrail',[-1.6,1.12,side*0.95],[-0.5,1.12,side*0.95],0.026);
    const boom=group(slew,'boom',0.55,0.55,-0.25,0.65);
    const boomLength=kind==='demolition'?4.5:2.9;
    box(boom,'boom_arm',boomLength,0.28,0.38,boomLength/2,0,0,m.paint,true); pin(boom,0,0,0);
    const stick=group(boom,'stick',boomLength,0,0,kind==='demolition'?-0.15:-1.4);
    const stickLength=kind==='demolition'?3.5:2.05;
    box(stick,'stick_arm',stickLength,0.2,0.3,stickLength/2,0,0,m.accent,true);pin(stick,0,0,0);
    const bucket=group(stick,'bucket',stickLength,0,0,-0.15);pin(bucket,0,0,0);
    if(kind==='demolition'){
      box(bucket,'jaw_head',0.4,0.4,0.55,0.2,-0.1,0,m.steel,true);
      const left=group(bucket,'jawLeft',0.32,0.10,0,0.3),right=group(bucket,'jawRight',0.32,-0.1,0,-0.3);
      box(left,'jaw_upper',0.7,0.15,0.30,0.35,0,0,m.steel,true);
      box(right,'jaw_lower',0.7,0.15,0.30,0.35,0,0,m.steel,true);
      rig={boom:['z',-10,25],stick:['z',-35,15],bucket:['z',-40,20],jawLeft:['z',-15,30],jawRight:['z',-30,15],slew:['y',0,80]};
      const p=(boom=0,jawLeft=0,jawRight=0)=>({boom,stick:0,bucket:0,jawLeft,jawRight,slew:0});
      motions={reach:action([[0,p()],[2,p(20)]]),nibble:action([[0,p(20,25,-25)],[1.4,p(20,-12,12)],[2,p(20,-12,12)],[3.2,p(20,25,-25)]]),lower:action([[0,p(20)],[2,p(0)]])};
    } else {
      scoop(bucket,1.13,0.76,0.6);
      rig={slew:['y',0,95],boom:['z',-18,26],stick:['z',-18,30],bucket:['z',-45,55]};
      motions={dig:action([[0,{slew:0,boom:-15,stick:10,bucket:-20}],[1.3,{slew:0,boom:-15,stick:25,bucket:50}],[2.5,{slew:0,boom:18,stick:0,bucket:50}]]),swing:action([[0,{slew:0,boom:18,stick:0,bucket:50}],[2.5,{slew:85,boom:18,stick:0,bucket:50}]]),dump:action([[0,{slew:85,boom:18,stick:0,bucket:50}],[1.6,{slew:85,boom:18,stick:0,bucket:-35}]])};
    }
    for(const side of [-1,1])ram(slew,[0.35,0.15,-0.25+side*0.28],boom,[boomLength*0.52,-0.1,side*0.28]);
    ram(boom,[0.7,0.27,0],stick,[0.65,0.22,0]);ram(stick,[0.65,0.21,0],bucket,[0.15,0.15,0]);
  } else if(kind==='loader') {
    for(const x of [-1.23,1.18])for(const side of [-1,1])wheel(root,x,side*1.03,0.68,0.48,'wheel_'+x+'_'+side);
    box(root,'engine_body',1.85,0.8,1.7,-1.03,1.0,0,m.paint,true);vents(root,-1.1,0.84,-0.86,1.15);
    box(root,'chassis',3.2,0.25,1.35,0,0.91,0,m.steel,true);
    cab(root,-0.5,1.97,0,1.08,1.52,1.22);
    const boom=group(root,'boom',0.16,1.18,0,-0.1);
    for(const side of [-1,1])box(boom,'boom_arm',1.85,0.19,0.18,0.925,0,side*0.46,m.paint,true);
    const bucket=group(boom,'bucket',1.85,0,0,0.07);scoop(bucket,2.32,1.05,0.77);
    for(const side of [-1,1])ram(root,[-0.1,0.85,side*0.5],boom,[1.1,-0.06,side*0.5]);
    ram(boom,[0.8,0.25,0],bucket,[0.2,0.1,0]);
    rig={boom:['z',-3,40],bucket:['z',-30,25]};
    motions={scoop:action([[0,{boom:-2,bucket:0}],[2,{boom:0,bucket:25}]]),lift:action([[0,{boom:0,bucket:25}],[2,{boom:36,bucket:20}]]),tip:action([[0,{boom:36,bucket:20}],[2,{boom:36,bucket:-30}]])};
  } else if(kind==='dump') {
    truckBase();
    const bed=group(root,'bed',-2.1,1.03,0);
    box(bed,'bed_floor',3.2,0.16,1.82,1.6,0,0,m.paint);
    for(const side of [-1,1]){
      box(bed,'bed_side',3.2,0.7,0.09,1.6,0.38,side*0.89,m.paint);
      for(let x=0.2;x<3.2;x+=0.46)box(bed,'bed_rib',0.06,0.7,0.055,x,0.38,side*0.96,m.accent);
    }
    box(bed,'bed_front',0.09,0.92,1.82,3.16,0.44,0,m.paint);
    const tail=group(bed,'tailgate',0,0.76,0);box(tail,'tailgate_panel',0.08,0.75,1.82,0,-0.37,0,m.accent);
    ram(root,[-0.1,0.85,0],bed,[2.2,-0.1,0]);
    rig={bed:['z',0,42],tailgate:['z',-45,0]};
    motions={tip:action([[0,{bed:0,tailgate:0}],[2.5,{bed:40,tailgate:-38}]]),return:action([[0,{bed:40,tailgate:-38}],[2.5,{bed:0,tailgate:0}]])};
  } else if(kind==='mixer') {
    truckBase();
    // 整个罐体绕自身长轴转，支座与溜槽保持固定。
    const support=group(root,'drum_support',-0.62,1.95,0,-0.15);
    const drum=group(support,'drum');
    const profile=[new THREE.Vector2(0.32,-1.47),new THREE.Vector2(0.63,-1.1),new THREE.Vector2(0.83,-0.42),new THREE.Vector2(0.8,0.7),new THREE.Vector2(0.43,1.32)];
    const geometry=new THREE.LatheGeometry(profile,32);geometry.rotateZ(-Math.PI/2);
    add(drum,geometry,m.white,'drum_shell');
    for(const x of [-0.68,0,0.68]){
      const hoop=add(drum,new THREE.TorusGeometry(x===0?0.82:0.72,0.035,6,32),m.blue,'drum_ring',x,0,0);hoop.rotation.y=Math.PI/2;
      box(drum,'drum_stripe',0.5,0.06,0.28,x,0.78,0,m.blue);
    }
    for(const x of [-1.5,0.2])box(root,'drum_cradle',0.16,0.36,1.15,x,1.23,0,m.steel);
    const chute=group(root,'chute',-2.1,1.46,0,-0.35);
    box(chute,'chute_floor',1.15,0.07,0.3,-0.58,0,0,m.steel);
    for(const side of [-1,1])box(chute,'chute_edge',1.15,0.14,0.04,-0.58,0.06,side*0.16,m.steel);
    cylinder(root,'water_tank',0.24,0.65,0.57,1.73,0,m.blue);
    rig={drum:['x',-360,360],chute:['y',-40,40]};
    motions={mix:action([[0,{drum:0,chute:0}],[5,{drum:360,chute:0}]],false,true),pour:action([[0,{drum:0,chute:0}],[1.5,{drum:-108,chute:35}],[5,{drum:-360,chute:35}]],false,true),stow:action([[0,{chute:35}],[2,{chute:0}]])};
  } else if(kind==='roller') {
    box(root,'engine_body',1.5,0.72,1.55,-0.85,0.94,0,m.paint,true);vents(root,-0.9,0.73,-0.79);
    for(const side of [-1,1])wheel(root,-1.08,side*0.75,0.53,0.3,'wheel_'+side);
    cab(root,-0.25,1.81,0,0.95,1.38,1.25);
    const steer=group(root,'steer',0.3,0,0);
    const drum=group(steer,'roller',1.08,0.6,0);
    const barrel=cylinder(drum,'roller_drum',0.6,1.78,0,0,0,m.steel);barrel.rotation.x=Math.PI/2;
    for(const side of [-1,1]){box(steer,'roller_fork',1.1,0.15,0.14,0.6,0.68,side*0.98,m.paint); const hub=cylinder(drum,'roller_hub',0.21,1.92,0,0,0,m.accent);hub.rotation.x=Math.PI/2;}
    rig={roller:['z',0,360],steer:['y',-25,25]};
    box(drum,'roller_observation_mark',0.15,0.055,0.65,0,0.6,0,m.accent);
    motions={roll:action([[0,{roller:0,steer:0}],[4,{roller:360,steer:0}]],false,true),steer:action([[0,{steer:0}],[2,{steer:22}]]),straight:action([[0,{steer:22}],[2,{steer:0}]])};
  } else if(kind==='bulldozer') {
    tracks(root,3.4,2.6);box(root,'engine_hood',1.55,0.7,1.35,0.45,1.28,0,m.paint,true);vents(root,0.45,1.08,-0.7);
    cab(root,-0.83,1.8,0,1.1,1.42,1.33);
    cylinder(root,'engine_exhaust',0.055,0.55,0.85,1.84,-0.39,m.rubber);
    const blade=group(root,'blade',-0.2,0.58,0,-0.04);
    for(const side of [-1,1])box(blade,'blade_pusharm',2.48,0.14,0.16,1.24,0,side*0.92,m.steel);
    box(blade,'blade_panel',0.18,0.94,3.03,2.47,0.27,0,m.paint,true);
    box(blade,'blade_cutting_edge',0.26,0.09,3.14,2.55,-0.19,0,m.chrome);
    for(const side of [-1,1])ram(root,[1.0,1.25,side*0.65],blade,[2.25,0.25,side*0.65]);
    rig={blade:['z',-5,18]};motions={push:action([[0,{blade:0}],[2,{blade:-4}]]),lift:action([[0,{blade:0}],[2,{blade:17}]]),level:action([[0,{blade:17}],[2,{blade:0}]])};
  }
  const a=new THREE.Vector3(),b=new THREE.Vector3(),dir=new THREE.Vector3(),mid=new THREE.Vector3();
  function updateVisuals() {
    root.updateWorldMatrix(true,true);
    for(const h of hydraulics){
      h.start.getWorldPosition(a);h.end.getWorldPosition(b);root.worldToLocal(a);root.worldToLocal(b);
      dir.subVectors(b,a);const length=dir.length();if(length<0.01)continue;dir.normalize();
      const barrelLength=length*0.57,rodLength=length*0.5;
      mid.copy(a).addScaledVector(dir,barrelLength/2);h.barrel.position.copy(mid);
      h.barrel.quaternion.setFromUnitVectors(UP,dir);h.barrel.scale.y=barrelLength;
      mid.copy(b).addScaledVector(dir,-rodLength/2);h.rod.position.copy(mid);
      h.rod.quaternion.setFromUnitVectors(UP,dir);h.rod.scale.y=rodLength;
    }
  }
  updateVisuals();
  return {group:root,rig,motions,updateVisuals};
}

// 使用一个临时渲染器生成目录缩略图；每张图直接来自它对应的三维模型。
export function renderMachineThumbnails(machines, buttons) {
  const renderer = new THREE.WebGLRenderer({antialias:true,alpha:true});
  renderer.setSize(248,156);renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xfff4de,0x607c74,2));
  const light=new THREE.DirectionalLight(0xffffff,2.4);light.position.set(-3,7,5);scene.add(light);
  const camera=new THREE.PerspectiveCamera(36,248/156,0.1,100);
  try {
    for(const machine of machines) {
      if(!machine.model.procedural)continue;
      const built=createMachinery(machine.model.procedural);scene.add(built.group);
      const bounds=new THREE.Box3().setFromObject(built.group),center=bounds.getCenter(new THREE.Vector3());
      const radius=bounds.getSize(new THREE.Vector3()).length()/2;
      camera.position.copy(center).add(new THREE.Vector3(0.55,0.35,0.86).normalize().multiplyScalar(radius*3.3));
      camera.lookAt(center);renderer.render(scene,camera);
      const canvas=document.createElement('canvas');canvas.width=248;canvas.height=156;canvas.className='eng-machine-thumb';
      canvas.setAttribute('aria-hidden','true');canvas.getContext('2d').drawImage(renderer.domElement,0,0);
      buttons.get(machine.id)?.querySelector('.eng-mark')?.replaceWith(canvas);
      scene.remove(built.group);
      const materials=new Set();built.group.traverse((node)=>{node.geometry?.dispose();if(node.material)materials.add(node.material);});
      for(const material of materials)material.dispose();
    }
  } finally { renderer.dispose();renderer.forceContextLoss(); }
}
