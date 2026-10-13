// 沙盘复用机械馆的分件模型，并以施工阶段调度工作动作。
import { createMachinery } from './engineering-machinery.js?v=20261001-machinery';
import { createMotion } from './engineering-motion.js?v=20261001-machinery';
export function createYardMachine(kind, options = {}) {
  const built = createMachinery(kind), group = built.group;
  group.scale.setScalar(options.scale ?? 0.28);
  const motion = createMotion(group,{rig:built.rig,motions:built.motions});
  let lastTime=0,lastAction='',wheelAngle=0,lastX=options.start??0;
  const sequences={excavator:['dig','swing','dump'],loader:['scoop','lift','tip'],bulldozer:['push','lift','level'],roller:['roll'],mixer:['mix']};
  const wheels=[];group.traverse((node)=>{if(node.name.startsWith('wheel_')&&node.name.endsWith('_roll'))wheels.push(node);});
  return {group,update(t,dt,ctx){
    const delta=Math.max(0,Math.min(0.2,t-lastTime));lastTime=t;
    let action='';
    if(kind==='dump'){
      const cycle=(t/22+(options.phase??0))%1,start=options.start??-4.1,end=options.end??4.1;
      const going=cycle<0.5;
      const progress=cycle<0.4?cycle/0.4:cycle<0.5?1:cycle<0.9?1-(cycle-0.5)/0.4:0;
      group.position.x=start+(end-start)*progress;
      group.rotation.y=going?0:Math.PI;
      wheelAngle+=(group.position.x-lastX)/(0.46*(options.scale??0.28))*(going?1:-1);lastX=group.position.x;
      wheels.forEach((wheel)=>{wheel.rotation.z=-wheelAngle;});
      action=cycle>=0.4&&cycle<0.46?'tip':cycle>=0.46&&cycle<0.5?'return':'load';
    } else {
      const working=kind==='excavator'?ctx.stageIndex<=1:kind==='bulldozer'?ctx.stageIndex<=1:kind==='roller'?ctx.stageIndex===0||ctx.stageIndex===5:true;
      const sequence=sequences[kind];
      action=working?sequence[Math.floor(t/3.4)%sequence.length]:'';
    }
    if(action!==lastAction){lastAction=action;if(action)motion.play(action);else motion.reset();}
    // 路端停留较短，卸料动作加快到能完整举斗、复位。
    motion.tick(kind==='dump' ? delta*3.5 : delta);built.updateVisuals();
  }};
}
