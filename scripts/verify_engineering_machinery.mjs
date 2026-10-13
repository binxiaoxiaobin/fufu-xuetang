import assert from 'node:assert/strict';
import * as THREE from '../frontend/vendor/three.module.js';
import {createMachinery} from '../frontend/engineering-machinery.js';
import {createMotion} from '../frontend/engineering-motion.js';
const kinds=['excavator','demolition','loader','dump','mixer','roller','bulldozer'];
let failures=0;
for(const kind of kinds){
  const built=createMachinery(kind), motion=createMotion(built.group,{rig:built.rig,motions:built.motions});
  assert(motion,`${kind}: missing rig joint`);
  let worst=0;
  for(const action of Object.keys(built.motions)){
    motion.reset(); assert(motion.play(action,{loop:false}));
    for(let frame=0;frame<150;frame++){
      motion.tick(0.05);built.updateVisuals();built.group.updateMatrixWorld(true);
      const box=new THREE.Box3().setFromObject(built.group,true);
      assert([...box.min.toArray(),...box.max.toArray()].every(Number.isFinite),`${kind}/${action}: invalid bounds`);
      worst=Math.min(worst,box.min.y);
    }
  }
  if(worst < -0.08){failures++;console.error(`${kind}: penetrates ground ${worst.toFixed(3)} m`);}
  else console.log(`${kind}: motions and ground clearance OK (${worst.toFixed(3)} m)`);
}
assert.equal(failures,0,'Work devices must stay above the floor through their full motion range');
