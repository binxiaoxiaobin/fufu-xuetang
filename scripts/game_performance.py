"""Maintained performance patches applied to local builds, never upstream files."""
def edit(root,name,old,new):
    p=root/name;s=p.read_text(encoding='utf-8');assert old in s,(name,old)
    p.write_text(s.replace(old,new),encoding='utf-8')

def budget(touch,typescript=False):
    annotation=':number' if typescript else ''
    return f'''\nlet fufuFrameAt=0;
const fufuInterval=1000/({touch}?30:60);
function fufuDrawDue(now{annotation}){{
  if(fufuFrameAt && now-fufuFrameAt<fufuInterval-.5)return false;
  fufuFrameAt=now-((now-fufuFrameAt)%fufuInterval);return true;
}}
'''

def kart(root):
    edit(root,'main.js','function frame() {',budget('lightweight')+'\nlet fufuSlowTime=0;\nfunction frame(now) {')
    edit(root,'main.js','  const rawDt = clock.getDelta();','  if (!fufuDrawDue(now)) return;\n  const rawDt = clock.getDelta();')
    edit(root,'main.js',"  const w = world;\n  if (w) {", "  if(state==='paused') return;\n  const w = world;\n  if (w) {")
    edit(root,'main.js','  const dt = Math.min(rawDt, 1 / 30);','''  const dt = Math.min(rawDt, .05);
  fufuSlowTime = rawDt > fufuInterval/1000*1.4 ? fufuSlowTime+rawDt : Math.max(0,fufuSlowTime-rawDt);
  if(fufuSlowTime>3 && renderer.getPixelRatio()>.75){
    const ratio=Math.max(.75,renderer.getPixelRatio()-.15);renderer.setPixelRatio(ratio);composer?.setPixelRatio(ratio);fufuSlowTime=0;
  }''')
    edit(root,'main.js','      if (o.geometry && !seen.has(o.geometry))', '      if (o.isInstancedMesh) o.dispose();\n      if (o.geometry && !seen.has(o.geometry))')

def sunbreak(root):
    edit(root,'main.ts','function frame(now:number){',budget('touchDevice',True)+'\nfunction frame(now:number){')
    edit(root,'main.ts','  const actualDt=lastTime?', "  if(!capture && race.phase==='paused'){lastTime=now;if(document.body.dataset.state!=='paused')hud.update({phase:race.phase,player:race.player,riders:race.riders,time:race.elapsed,countdown:race.countdown,world,best:race.best,split:race.split,fps,replay},0);return;}\n  if(!capture&&!fufuDrawDue(now))return;\n  const actualDt=lastTime?")
    # A stable ceiling prevents the previous slow/fast oscillation and touch DPR creeping to 2.
    edit(root,'main.ts','pixelRatio>1&&!race.player.airborne','pixelRatio>.75&&!race.player.airborne')
    edit(root,'main.ts','pixelRatio=Math.max(1,pixelRatio-.15)','pixelRatio=Math.max(.75,pixelRatio-.15)')
    edit(root,'main.ts',"else if(fps>59.5&&pixelRatio<Math.min(devicePixelRatio,pixelLimit)){pixelRatio=Math.min(devicePixelRatio,2,pixelRatio+.05);resize();}",'')
    edit(root,'main.ts','slowFrames=fps<54?', 'slowFrames=fps<(touchDevice?26:48)?')
    edit(root,'race.ts','  private recordClock = 0;','  private recordClock = 0;\n  private recordInterval = .1;')
    edit(root,'race.ts','this.recording = []; this.recordClock = 0;', 'this.recording = []; this.recordClock = 0; this.recordInterval = .1;')
    edit(root,'race.ts','if (this.recordClock >= .1)', 'if (this.recordClock >= this.recordInterval)')
    edit(root,'race.ts','this.recordClock -= .1;', 'this.recordClock %= this.recordInterval;')
    edit(root,'race.ts','this.recording.push({ s: this.player.s, lateral: this.player.lateral, time: this.elapsed });','''this.recording.push({ s: this.player.s, lateral: this.player.lateral, time: this.elapsed });
      if(this.recording.length>3600){this.recording=this.recording.filter((_,i)=>i%2===0);this.recordInterval*=2;}''')
    edit(root,'main.ts','airFrames.push(frame);','{airFrames.push(frame);if(airFrames.length>480)airFrames.shift();}')
    edit(root,'audio.ts','o.stop(c.currentTime+duration);','o.stop(c.currentTime+duration);o.onended=()=>{o.disconnect();g.disconnect();};')

def fish(root):
    edit(root,'main.ts','  let last = performance.now();',budget("matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints>0",True)+'\n  let last = performance.now();')
    edit(root,'main.ts','    const dt = Math.min((now - last)', '    if(!fufuDrawDue(now))return;\n    const dt = Math.min((now - last)')
    edit(root,'main.ts','    acc += dt;','    acc = Math.min(acc+dt,SIM.step*4);')
    edit(root,'render/world.ts','    else if (median < 1 / 58) next = Math.min(ceiling, this.pixelRatio + 0.1);','')
    # 30 Hz touch rendering is intentional, not evidence of overload.
    edit(root,'render/world.ts','if (median > 1 / 40)', "if (median > (navigator.maxTouchPoints>0 || matchMedia('(pointer: coarse)').matches ? 1/24 : 1/40))")
    edit(root,'audio/audio.ts','    o.stop(t + dur + 0.05);','    o.stop(t + dur + 0.05);\n    o.onended=()=>{o.disconnect();g.disconnect();};')
    edit(root,'audio/audio.ts','    o.stop(t + 4.4);','    o.stop(t + 4.4);\n    o.onended=()=>{o.disconnect();g.disconnect();};')
