from pathlib import Path
import re
p=Path(__file__).resolve().parent.parent/'frontend/engineering-yard.js'
s=p.read_text(encoding='utf-8')
if 'createSceneScope' not in s:
    s="import {createSceneScope} from './scene-scope.js?v=20261003-lifecycle-1';\n"+s
    s=s.replace('function mount(container) {','function mount(container, saved={}) {\n  const scope=createSceneScope();')
    s=s.replace('  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));', '  scope.own(scene,renderer);\n  renderer.setPixelRatio(window.FufuPerformance?.pixelRatio || Math.min(window.devicePixelRatio || 1,1.5));')
    s=re.sub(r'([A-Za-z_$][\w$.]*)\.addEventListener\(',r'scope.listen(\1, ',s)
    s=s.replace('new ResizeObserver(', 'new scope.ResizeObserver(').replace('requestAnimationFrame(', 'scope.frame(')
    start=s.index('    dispose() {\n      cancelAnimationFrame(frameHandle);')
    end=s.index('\n    },',start)
    s=s[:start]+"    snapshot:()=>({progress,azimuth,elevation,distance}),\n    dispose() {scope.dispose();container.replaceChildren();}"+s[end+7:]
    s=s.replace('pause() { running = false; }','pause() { running = false;scope.pause(); }').replace('resume() { running = true; last = performance.now(); }','resume() { running = true; last = performance.now();scope.resume(); }')
    s=s.replace('  applyProgress(progress);\n  updateWorkers', '  progress=saved.progress??progress;azimuth=saved.azimuth??azimuth;elevation=saved.elevation??elevation;distance=saved.distance??distance;\n  applyProgress(progress);\n  updateWorkers')
    p.write_text(s,encoding='utf-8')
p=p.parent/'engineering-explore.js';s=p.read_text(encoding='utf-8');s=s.replace("register('engineering-yard', ()=>{", "register('engineering-yard', saved=>{").replace('window.fufuYard.mount(yardStage);','window.fufuYard.mount(yardStage,saved);').replace('return {pause:instance.pause,resume:instance.resume,dispose(){instance.dispose();if(yardModule','return {pause:instance.pause,resume:instance.resume,snapshot:instance.snapshot,dispose(){instance.dispose();if(yardModule');p.write_text(s,encoding='utf-8')
