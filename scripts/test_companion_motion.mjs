import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from '../frontend/vendor/three.module.js';
import {createCompanionMotion} from '../frontend/companion-motion.js';

// Read the shipped rig / mesh, including the names GLTFLoader sanitizes.
const buffer=fs.readFileSync(new URL('../frontend/clay-safari/models/explorer.glb',import.meta.url));
const length=buffer.readUInt32LE(12),gltf=JSON.parse(buffer.subarray(20,20+length)),bin=buffer.subarray(28+length);
const model=new THREE.Group(),nodes=gltf.nodes.map(node=>{
  const object=new THREE.Bone();object.name=THREE.PropertyBinding.sanitizeNodeName(node.name||'');
  if(node.translation)object.position.fromArray(node.translation);
  if(node.rotation)object.quaternion.fromArray(node.rotation);
  if(node.scale)object.scale.fromArray(node.scale);return object;
});
gltf.nodes.forEach((node,i)=>(node.children||[]).forEach(child=>nodes[i].add(nodes[child])));
for(const node of gltf.scenes[gltf.scene||0].nodes)model.add(nodes[node]);
function attribute(index){const accessor=gltf.accessors[index],view=gltf.bufferViews[accessor.bufferView],count=accessor.count*3,offset=(view.byteOffset||0)+(accessor.byteOffset||0);return new THREE.BufferAttribute(new Float32Array(bin.buffer,bin.byteOffset+offset,count).slice(),3);}
const geometry=new THREE.BufferGeometry(),primitive=gltf.meshes[3].primitives[0];
geometry.setAttribute('position',attribute(primitive.attributes.POSITION));geometry.setAttribute('normal',attribute(primitive.attributes.NORMAL));
const face=new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial());face.name='TuantuanGirl';model.add(face);
model.updateMatrixWorld(true);
function skinAttribute(index){const accessor=gltf.accessors[index],view=gltf.bufferViews[accessor.bufferView],offset=bin.byteOffset+(view.byteOffset||0)+(accessor.byteOffset||0);const ArrayType=accessor.componentType===5121?Uint8Array:Float32Array;return new THREE.BufferAttribute(new ArrayType(bin.buffer,offset,accessor.count*4).slice(),4);}
geometry.setAttribute('skinIndex',skinAttribute(primitive.attributes.JOINTS_0));geometry.setAttribute('skinWeight',skinAttribute(primitive.attributes.WEIGHTS_0));
face.skeleton=new THREE.Skeleton(gltf.skins[0].joints.map(i=>nodes[i]));
const originalWeights=geometry.attributes.skinWeight.array.slice(),originalIndices=geometry.attributes.skinIndex.array.slice();
const hand=model.getObjectByName('mixamorigRightHand'),head=model.getObjectByName('mixamorigHead');
assert.ok(hand&&head,'Resolve actual sanitized bone names');
const bases=nodes.map(node=>node.quaternion.clone()),restHand=hand.getWorldPosition(new THREE.Vector3());
const motion=createCompanionMotion(model);assert.ok(motion.hasFace);
let repaired=0;
for(let i=0;i<geometry.attributes.position.count;i++){
  const weights=geometry.attributes.skinWeight,indices=geometry.attributes.skinIndex;
  assert.ok(Math.abs(weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i)-1)<1e-5,'Repaired weights stay normalized');
  if(weights.getX(i)!==originalWeights[i*4])repaired++;
  const y=geometry.attributes.position.getY(i);
  if(y<.6||y>1.10)for(let c=0;c<4;c++){
    assert.equal(weights.array[i*4+c],originalWeights[i*4+c],'Legs, body and face binding remains intact');
    assert.equal(indices.array[i*4+c],originalIndices[i*4+c],'Unaffected joint references remain intact');
  }
}
assert.ok(repaired>100,'Repair real stray weights along the forearms');
motion.play('wave');for(let i=0;i<75;i++)motion.update(1/60);
const raised=hand.getWorldPosition(new THREE.Vector3());
assert.ok(raised.y>restHand.y+.25,`Wave must raise the hand: ${restHand.y} -> ${raised.y}`);
assert.ok(raised.distanceTo(head.getWorldPosition(new THREE.Vector3()))<.7,'Hand must remain beside the face, not behind it');
const elbow=model.getObjectByName('mixamorigRightForeArm'),shoulder=model.getObjectByName('mixamorigRightArm');
const bentElbow=elbow.getWorldPosition(new THREE.Vector3());
assert.ok(bentElbow.y<raised.y-.06,'Greeting bends the elbow with the forearm upright');
assert.ok(bentElbow.y<shoulder.getWorldPosition(new THREE.Vector3()).y+.04,'Shoulder stays relaxed instead of lifting the whole arm');
const finger=model.getObjectByName('mixamorigRightHandMiddle4').getWorldPosition(new THREE.Vector3());
assert.ok(finger.y>raised.y+.10,'Fingers point upwards instead of twisting towards the body');
for(let i=0;i<40;i++)motion.update(1/60);
assert.ok(elbow.getWorldPosition(new THREE.Vector3()).distanceTo(bentElbow)<.025,'Wrist waves while the elbow stays steady');
for(let i=0;i<350;i++)motion.update(1/60);
assert.equal(motion.active,false);
nodes.forEach((node,i)=>assert.ok(node.quaternion.angleTo(bases[i])<.001,'Return to original rig pose'));
motion.play('smile');for(let i=0;i<45;i++)motion.update(1/60);
assert.ok(face.morphTargetInfluences[0]>.8,'Smile reaches visible strength');
const smile=geometry.morphAttributes.position[0],pos=geometry.attributes.position;
let affected=0;for(let i=0;i<pos.count;i++){
  if(smile.getY(i)>1e-5)affected++;
  if(pos.getY(i)<1.12||pos.getY(i)>1.4)assert.equal(smile.getY(i),0,'Body and hair excluded from expression');
}
assert.ok(affected>30,'Facial target affects real mesh vertices');
motion.play('nod');const first=head.quaternion.clone();for(let i=0;i<55;i++)motion.update(1/60);assert.ok(head.quaternion.angleTo(first)>.05,'Nod changes the actual head bone');
for(const action of ['wave','smile','nod','sing','play','companion']){
  motion.play(action);for(let i=0;i<360;i++)motion.update(1/60,true);
  assert.equal(motion.active,false,'Reduced motion still ends each action');
}
console.log('Actual rig: raised waving hand, expression vertices, head nod, smooth pose recovery and reduced-motion completion verified.');
