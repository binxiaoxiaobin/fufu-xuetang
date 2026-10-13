import * as THREE from './vendor/three.module.js';

// The converted clay mesh has stray hip/head weights along its forearms.
// Repair only the limb tubes, leaving the body, clothing and source GLB intact.
export function repairCompanionArms(model){
  model.updateMatrixWorld(true);
  model.traverse(mesh=>{
    if(!mesh.isSkinnedMesh||!mesh.name.includes('Tuantuan')||!mesh.skeleton)return;
    const geo=mesh.geometry,pos=geo.attributes.position,weights=geo.attributes.skinWeight,indices=geo.attributes.skinIndex;
    if(!weights||!indices)return;
    const inverse=mesh.matrixWorld.clone().invert(),point=new THREE.Vector3(),closest=new THREE.Vector3(),offset=new THREE.Vector3();
    const smooth=value=>{const t=THREE.MathUtils.clamp(value,0,1);return t*t*(3-2*t);};
    for(const side of ['Right','Left']){
      const ids=['Arm','ForeArm','Hand'].map(part=>mesh.skeleton.bones.findIndex(b=>b.name.replace(':','')===`mixamorig${side}${part}`));
      if(ids.some(id=>id<0))continue;
      const [shoulder,elbow,wrist]=ids.map(id=>mesh.skeleton.bones[id].getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse));
      const upper=elbow.clone().sub(shoulder),lower=wrist.clone().sub(elbow),upperLength=upper.length(),lowerLength=lower.length();
      for(let i=0;i<pos.count;i++){
        point.fromBufferAttribute(pos,i);
        if(point.y<wrist.y-.08||point.y>shoulder.y-.025||(side==='Right'?point.x>shoulder.x-.025:point.x<shoulder.x+.025))continue;
        const t1=THREE.MathUtils.clamp(offset.copy(point).sub(shoulder).dot(upper)/upper.lengthSq(),0,1);
        closest.copy(shoulder).addScaledVector(upper,t1);const d1=point.distanceTo(closest);
        const t2=THREE.MathUtils.clamp(offset.copy(point).sub(elbow).dot(lower)/lower.lengthSq(),0,1);
        closest.copy(elbow).addScaledVector(lower,t2);const d2=point.distanceTo(closest);
        if(Math.min(d1,d2)>.062)continue;
        const distance=d1<d2?t1*upperLength:upperLength+t2*lowerLength;
        const fore=smooth((distance-upperLength+.055)/.11),palm=smooth((distance-upperLength-lowerLength+.035)/.07);
        indices.setXYZW(i,ids[0],ids[1],ids[2],0);weights.setXYZW(i,(1-fore)*(1-palm),fore*(1-palm),palm,0);
      }
    }
    weights.needsUpdate=true;indices.needsUpdate=true;
  });
}

// Bind-pose relative world rotations avoid the rig's non-XYZ bone orientations.
export function createCompanionMotion(model) {
  repairCompanionArms(model);
  const names={armR:'RightArm',elbowR:'RightForeArm',handR:'RightHand',armL:'LeftArm',elbowL:'LeftForeArm',head:'Head',spine:'Spine2'};
  const joints={};
  for(const [key,name] of Object.entries(names)){
    const node=model.getObjectByName('mixamorig:'+name) || model.getObjectByName('mixamorig'+name);
    if(node)joints[key]={node,base:node.quaternion.clone(),target:new THREE.Quaternion()};
  }
  const parentQ=new THREE.Quaternion(),worldQ=new THREE.Quaternion(),euler=new THREE.Euler();
  const smooth=value=>{const x=Math.max(0,Math.min(1,value));return x*x*(3-2*x);};
  const facial=[];
  // Small additive facial targets on the existing mesh: no duplicate face model,
  // texture download or extra renderer. The original GLB remains unchanged.
  model.traverse(node=>{
    if(!node.isSkinnedMesh||!node.name.includes('Tuantuan'))return;
    const geo=node.geometry,pos=geo.attributes.position,norm=geo.attributes.normal;
    const smile=new Float32Array(pos.count*3),blink=new Float32Array(pos.count*3);
    const gauss=(x,y,cx,cy,sx,sy)=>Math.exp(-(((x-cx)/sx)**2+((y-cy)/sy)**2));
    for(let i=0;i<pos.count;i++){
      const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
      if(z<.20||norm.getZ(i)<.1||y<1.12||y>1.40||Math.abs(x)>.22)continue;
      const mouth=gauss(Math.abs(x),y,.078,1.18,.055,.035);
      const cheek=gauss(Math.abs(x),y,.13,1.23,.045,.055);
      smile[i*3]=Math.sign(x)*mouth*.005;smile[i*3+1]=mouth*.017+cheek*.005;
      const eye=gauss(Math.abs(x),y,.10,1.325,.057,.046);
      blink[i*3+1]=(1.325-y)*eye*.93;
    }
    geo.morphTargetsRelative=true;
    geo.morphAttributes.position=[new THREE.BufferAttribute(smile,3),new THREE.BufferAttribute(blink,3)];
    node.updateMorphTargets();facial.push(node);
  });
  let mode='idle',elapsed=0,duration=0,smiling=0,blinkClock=0;
  const state={mode:'idle',bounce:0};
  function play(action){mode=['wave','smile','nod','companion','sing','play'].includes(action)?action:'wave';elapsed=0;duration=mode==='sing'?4.2:mode==='wave'?3.2:mode==='play'?2.6:2.8;}
  function rotate(key,x=0,y=0,z=0,blend=1){const joint=joints[key];if(!joint)return;
    joint.node.parent.getWorldQuaternion(parentQ);euler.set(x*blend,y*blend,z*blend);worldQ.setFromEuler(euler);
    joint.target.copy(parentQ).invert().multiply(worldQ).multiply(parentQ).multiply(joint.base);
    joint.node.quaternion.slerp(joint.target,.24);
  }
  function update(dt,reduced=false){
    elapsed+=dt;blinkClock+=dt;if(elapsed>=duration)mode='idle';
    const active=mode!=='idle';
    const envelope=active?Math.min(1,elapsed/.4,(duration-elapsed)/.45):0;
    const e=reduced?envelope*.7:envelope;
    let rx=0,rz=0,ex=0,ez=0,hw=0,hx=0,hz=0,lx=0,lz=0,sx=0;
    if(mode==='wave'){hz=.035;hx=.025;}
    if(mode==='nod'||mode==='companion'){hx=reduced?.1:Math.sin(elapsed*5)*.13;rz=-.35;rx=-.35;lx=-.25;lz=.12;}
    if(mode==='smile'){hz=-.09;hx=.035;rz=-.12;lz=.12;}
    if(mode==='sing'){hz=reduced?0:Math.sin(elapsed*3)*.065;rx=-.28;lx=-.28;rz=-.22;lz=.22;}
    if(mode==='play'){rz=-.65;lz=.65;rx=-.15;lx=-.15;sx=-.035;}
    rotate('spine',sx,0,0,e);rotate('head',hx,0,hz,e);
    if(mode==='wave'){
      // A shared world-plane bend preserves the forearm twist inherited from
      // the shoulder. Keep the wrist swing small and the shoulder relaxed.
      const lift=smooth(elapsed/.65)*smooth((duration-elapsed)/.75)*(reduced?.65:1);
      const sway=reduced?0:Math.sin(Math.max(0,Math.min(1,(elapsed-.8)/1.5))*Math.PI*4)*.10*smooth((elapsed-.65)/.2)*smooth((2.5-elapsed)/.25);
      rotate('armR',0,0,-.78,lift);rotate('elbowR',0,0,-1.25,lift);rotate('handR',0,0,-.65+sway,lift);
    }else{rotate('armR',rx,0,rz,e);rotate('elbowR',ex,0,ez,e);rotate('handR',0,hw,0,e);}
    rotate('armL',lx,0,lz,e);rotate('elbowL',0,0,mode==='play'?.3:0,e);
    smiling+=( (active?envelope:0)-smiling)*Math.min(1,dt*9);
    const blinkPhase=blinkClock%5.3,blinkValue=!reduced&&blinkPhase<.18?Math.sin(blinkPhase/.18*Math.PI):0;
    for(const mesh of facial){mesh.morphTargetInfluences[0]=smiling;mesh.morphTargetInfluences[1]=blinkValue;}
    state.mode=mode;state.bounce=mode==='play'&&!reduced?Math.max(0,Math.sin(elapsed*7))*.065*envelope:0;return state;
  }
  return {play,update,get active(){return mode!=='idle';},get hasFace(){return facial.length>0;}};
}
