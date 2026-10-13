import * as THREE from './vendor/three.module.js';

// Finite demonstrations; merged bogies are observed, never rotated as one wheel.
export function createTransportMotion(model, clips, spec) {
  const mixer=new THREE.AnimationMixer(model), poses=[], markers=[];
  model.traverse(node=>poses.push({node,position:node.position.clone(),quaternion:node.quaternion.clone(),scale:node.scale.clone()}));
  const axis=new THREE.Vector3(), rotation=new THREE.Quaternion();
  let current=null, elapsed=0, duration=0, active=false;
  const targets=pattern=>poses.filter(p=>new RegExp(pattern).test(p.node.name));
  function available(action) {
    if(action.kind==='clip') return action.clips?.length && action.clips.every(name=>clips.some(c=>c.name===name));
    return ['wheels','trim','separate'].includes(action.kind) && targets(action.pattern || '^wheel-').length>0;
  }
  function restore() {
    poses.forEach(p=>{p.node.position.copy(p.position);p.node.quaternion.copy(p.quaternion);p.node.scale.copy(p.scale);});
  }
  function reset() {
    mixer.stopAllAction();if(current?.clip)mixer.uncacheClip(current.clip);restore();elapsed=0;duration=0;active=false;current=null;
    markers.forEach(m=>m.visible=false);model.updateMatrixWorld(true);
  }
  function clipFor(action) {
    const selected=action.clips.map(name=>{
      const source=clips.find(c=>c.name===name);
      if(!action.segmentEnd)return source;
      const clip=source.clone(),end=source.duration*action.segmentEnd,target=action.duration || 3;
      clip.tracks.forEach(track=>track.trim(0,end).scale(target/end));clip.duration=target;return clip;
    });
    const length=action.sequence?selected.reduce((sum,c)=>sum+c.duration,0):Math.max(...selected.map(c=>c.duration));
    const groups=new Map();let offset=0;
    selected.forEach(clip=>{
      clip.tracks.forEach(track=>{
        const size=track.getValueSize();let entry=groups.get(track.name);
        if(!entry){entry={track,times:[],values:[]};groups.set(track.name,entry);}
        if(offset>0 && !entry.times.length){entry.times.push(0,Math.max(0,offset-.001));entry.values.push(...track.values.slice(0,size),...track.values.slice(0,size));}
        for(let i=0;i<track.times.length;i++){
          const time=offset+track.times[i];
          if(entry.times.length && time===entry.times[entry.times.length-1]){entry.values.splice(-size,size,...track.values.slice(i*size,(i+1)*size));continue;}
          entry.times.push(time);entry.values.push(...track.values.slice(i*size,(i+1)*size));
        }
      });
      if(action.sequence) offset+=clip.duration;
    });
    const tracks=[...groups.values()].map(({track,times,values})=>{
      const size=track.getValueSize();if(times[times.length-1]<length){times.push(length);values.push(...values.slice(-size));}
      return new track.constructor(track.name,times,values,track.getInterpolation());
    });
    return new THREE.AnimationClip(action.motion,length,tracks);
  }
  function evaluate() {
    const u=Math.min(1,elapsed/duration), eased=u*u*(3-2*u);
    if(current.kind==='clip') {current.animation.reset().play();mixer.setTime(elapsed);}
    else for(const pose of current.targets){
      if(current.kind==='wheels') {
        axis.set(1,0,0);rotation.setFromAxisAngle(axis,-u*Math.PI*3);
        pose.node.quaternion.copy(pose.quaternion).multiply(rotation);
      } else if(current.kind==='trim') {
        axis.set(0,1,0);rotation.setFromAxisAngle(axis,THREE.MathUtils.degToRad(current.degrees || 25)*eased);
        pose.node.quaternion.copy(pose.quaternion).multiply(rotation);
      } else if(current.kind==='separate') {
        pose.node.position.copy(pose.position);pose.node.position.y+=(current.lift || 1.2)*eased;
      }
    }
    model.updateMatrixWorld(true);
  }
  function play(id) {
    const action=spec.transportActions.find(a=>a.motion===id);
    if(!action || !available(action)) return false;
    reset();current={...action,targets:targets(action.pattern || '^wheel-')};duration=action.duration || 4;
    if(action.kind==='clip') {
      const clip=clipFor(action);current.clip=clip;
      const repeats=action.repeats || 1;duration=clip.duration*repeats;
      const animation=mixer.clipAction(clip);
      current.animation=animation;
      animation.setLoop(repeats>1?THREE.LoopRepeat:THREE.LoopOnce,repeats);
      animation.clampWhenFinished=true;animation.reset().play();
    }
    if(action.kind==='wheels') for(const pose of current.targets){
      if(!pose.node.isMesh) continue;
      let marker=pose.node.userData.motionMarker;
      if(!marker){
        pose.node.geometry.computeBoundingBox();const bounds=pose.node.geometry.boundingBox;
        const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
        marker=new THREE.Mesh(new THREE.SphereGeometry(Math.max(size.y,size.z)*.06,8,6),new THREE.MeshBasicMaterial({color:0xe6b34c}));
        const outer=pose.node.position.x<0?bounds.min.x-.012:bounds.max.x+.012;
        marker.position.set(outer,center.y+size.y*.32,center.z);
        marker.userData.teachingAid=true;pose.node.add(marker);pose.node.userData.motionMarker=marker;markers.push(marker);
      }
      marker.visible=true;
    }
    active=true;evaluate();return true;
  }
  return {
    play,reset,canPlay:id=>spec.transportActions.some(a=>a.motion===id && available(a)),
    stop(){active=false;},resume(){active=!!current && elapsed<duration;return active;},
    seek(fraction){if(!current)return false;elapsed=THREE.MathUtils.clamp(fraction,0,1)*duration;active=false;evaluate();return true;},
    tick(delta){if(!active || !current)return false;elapsed=Math.min(duration,elapsed+Math.min(delta,.08));evaluate();active=elapsed<duration;return active;},
    get progress(){return duration?elapsed/duration:0;},
    dispose(){reset();mixer.uncacheRoot(model);}
  };
}
