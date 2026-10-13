/* Verify real geometry, supported parts and meaningful finite motion. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {libraries,root}=require('./audit-model-interactions.cjs');
(async()=>{
  const {base,THREE,load}=await libraries();
  const {findPartMeshes}=await import(base+'model-parts.js?v=20261005-observe-1');
  const {createMotion}=await import(base+'engineering-motion.js?v=20261005-observe-1');
  const {createMachinery}=await import(base+'engineering-machinery.js?v=20261005-observe-1');
  const {CORE_MACHINES,EXTRA_MACHINES}=await import(base+'engineering-catalog.js?v=20261005-observe-1');
  const {createTransportMotion}=await import(base+'transport-motion.js?v=20261005-observe-1');
  const {boxViewDistance}=await import(base+'model-framing.js?v=20261005-observe-3');
  for(const aspect of [.65,.9,1.5,2.2])for(const size of [[2,3,6],[9,3,4],[3,8,2]]){
    const az=.42,el=.12,d=boxViewDistance(...size,36,aspect,az,el),tan=Math.tan(18*Math.PI/180);
    for(const x of [-size[0]/2,size[0]/2])for(const y of [-size[1]/2,size[1]/2])for(const z of [-size[2]/2,size[2]/2]){
      const along=x*Math.sin(az)*Math.cos(el)+y*Math.sin(el)+z*Math.cos(az)*Math.cos(el);
      const right=x*Math.cos(az)-z*Math.sin(az),up=-x*Math.sin(az)*Math.sin(el)+y*Math.cos(el)-z*Math.cos(az)*Math.sin(el);
      assert(Math.abs(right)/(d-along)/tan/aspect<1 && Math.abs(up)/(d-along)/tan<1,'all model corners remain inside the viewport');
    }
  }
  const pose=root=>{const result=[];root.traverse(n=>{if(!n.userData.teachingAid)result.push(...n.position.toArray(),...n.quaternion.toArray());});return result;};
  const different=(a,b)=>a.some((v,i)=>Math.abs(v-b[i])>1e-5);
  let parts=0,animations=0,observations=0;
  for(const machine of [...CORE_MACHINES,...EXTRA_MACHINES]) {
    const built=createMachinery(machine.id),wrapper=new THREE.Group();wrapper.add(built.group);
    const engine=createMotion(built.group,built);
    for(const part of machine.parts){assert(findPartMeshes(wrapper,part[2]).length,`${machine.id}: part ${part[1]}`);parts++;}
    for(const [label,,step] of machine.steps) {
      if(step.viewPattern)assert(findPartMeshes(wrapper,step.viewPattern).length,`${machine.id}: animated part ${label}`);
      if(step.focus){assert(findPartMeshes(wrapper,step.focus).length,`${machine.id}: ${label}`);observations++;continue;}
      engine.reset();const before=pose(built.group);assert(engine.canPlay(step.motion));assert(engine.play(step.motion,{loop:false}));
      let changes=false;
      for(const u of [.15,.35,.55,.75,1]) {engine.seek(u);built.updateVisuals();changes ||= different(before,pose(built.group));}
      assert(changes,`${machine.id}: no movement in ${label}`);assert.equal(engine.progress,1);assert.equal(engine.active,false);
      engine.seek(.3);const paused=pose(built.group);engine.tick(.08);assert.deepEqual(pose(built.group),paused,'paused pose must remain stable');
      assert(engine.resume());engine.tick(.08);assert(engine.progress>.3);engine.reset();animations++;
    }
    if(machine.id==='mixer'){engine.play('pour',{loop:false});engine.seek(.5);assert(engine.pose.drum<0);engine.play('stow',{loop:false});const angle=engine.pose.drum;engine.seek(.8);assert.equal(engine.pose.drum,angle);}
    if(machine.id==='roller'){engine.play('roll',{loop:false});engine.seek(.4);const angle=engine.pose.roller;engine.play('steer',{loop:false});engine.seek(1);assert.equal(engine.pose.roller,angle);assert.equal(engine.pose.steer,22);}
    if(machine.id==='demolition'){
      const upper=built.group.getObjectByName('jaw_upper'),lower=built.group.getObjectByName('jaw_lower');
      const gap=()=>{built.group.updateMatrixWorld(true);return upper.getWorldPosition(new THREE.Vector3()).distanceTo(lower.getWorldPosition(new THREE.Vector3()));};
      engine.play('nibble',{loop:false});engine.seek(.3/engine.duration);const open=gap();engine.seek(1.9/engine.duration);assert(gap()<open*.6,'jaws close in the same plane');
    }
    console.log('PASS engineering',machine.id);
  }
  const items=JSON.parse(fs.readFileSync(path.join(root,'backend/seed_data/transport_exhibits.json'),'utf8'));
  for(const item of items){
    const gltf=await load(item.model_path.slice(1)),wrapper=new THREE.Group();wrapper.add(gltf.scene);
    for(const part of item.parts){assert(findPartMeshes(wrapper,new RegExp(part.pattern,'i')).length,`${item.slug}: part ${part.label}`);parts++;}
    if(item.category==='rail')assert(!findPartMeshes(wrapper,new RegExp(item.parts[0].pattern,'i')).some(n=>/^wheel/.test(n.name)),'body highlighting must exclude nested wheel meshes');
    const engine=createTransportMotion(gltf.scene,gltf.animations,{transportActions:item.actions});
    const original=pose(gltf.scene);
    for(const action of item.actions){
      if(action.viewPattern)assert(findPartMeshes(wrapper,new RegExp(action.viewPattern,'i')).length,`${item.slug}: animated part ${action.label}`);
      if(action.kind==='focus'){assert(findPartMeshes(wrapper,new RegExp(action.pattern,'i')).length,`${item.slug}: focus ${action.label}`);observations++;continue;}
      assert(engine.canPlay(action.motion),`${item.slug}: unsupported ${action.label}`);assert(engine.play(action.motion));
      let changes=false;
      for(const u of [.1,.3,.5,.7,.9,1]){engine.seek(u);changes ||= different(original,pose(gltf.scene));}
      assert(changes,`${item.slug}: no movement ${action.label}`);
      if(action.segmentEnd)assert(different(original,pose(gltf.scene)),`${item.slug}: control surface must hold its changed angle`);
      if(item.slug==='airliner' && action.motion==='gear'){
        const gear=gltf.scene.getObjectByName('gear-main-right');engine.reset();const baseY=gear.position.y;
        engine.play('gear');engine.seek(1);assert(gear.position.y>baseY+.5,'retracting landing gear moves upward');
      }
      engine.seek(.35);const middle=pose(gltf.scene);engine.seek(.9);engine.seek(.35);assert.deepEqual(pose(gltf.scene),middle,`${item.slug}: seeking must be deterministic after finishing`);
      engine.stop();engine.tick(.08);assert.deepEqual(pose(gltf.scene),middle);assert(engine.resume());engine.tick(.08);assert(engine.progress>.35);
      engine.reset();assert(!different(original,pose(gltf.scene)),`${item.slug}: pose restored`);animations++;
    }
    engine.dispose();console.log('PASS transport',item.slug);
  }
  let prehistoric=0;
  for(const name of fs.readdirSync(path.join(root,'frontend/assets/jurassic')).filter(n=>n.endsWith('.glb'))){
    const gltf=await load('assets/jurassic/'+name);assert(gltf.animations.length);assert(gltf.animations.some(c=>c.name==='Idle'));prehistoric++;
  }
  console.log(JSON.stringify({models:CORE_MACHINES.length+EXTRA_MACHINES.length+items.length,parts,finiteAnimations:animations,structureObservations:observations,prehistoricModels:prehistoric}));
})().catch(error=>{console.error(error);process.exitCode=1;});
