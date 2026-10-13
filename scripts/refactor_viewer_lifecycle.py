from pathlib import Path
import re
root=Path(__file__).resolve().parent.parent/'frontend'
def scoped(s):
    s=re.sub(r'([A-Za-z_$][\w$.]*(?:\.querySelector\([^)]*\))?)\??\.addEventListener\(',r'scope.listen(\1, ',s)
    s=s.replace('requestAnimationFrame(', 'scope.frame(').replace('new THREE.Clock()', 'scope.clock(new THREE.Clock())')
    return s
p=root/'engineering-viewer.js';s=p.read_text(encoding='utf-8')
if 'createSceneScope' not in s:
    start=s.index('export function createViewer(')
    s=s[:start]+scoped(s[start:])
    s="import { createSceneScope, disposeGraph } from './scene-scope.js?v=20261003-lifecycle-1';\n"+s
    s=s.replace('export function createViewer({ host, onLegend, onStatus, motionFactory }) {','export function createViewer({ host, onLegend, onStatus, motionFactory }) {\n  const scope=createSceneScope();')
    s=s.replace('  renderer.setPixelRatio(', '  scope.own(scene,renderer);\n  renderer.setPixelRatio(',1)
    s=s.replace('  let loadToken = 0;', '  let loadToken = 0;\n  scope.cleanup(()=>{loadToken++;state.motion?.dispose?.();clearHighlight();});')
    s=s.replace('(gltf) => {\n    const person', '(gltf) => {\n    if(scope.disposed){disposeGraph(gltf.scene);return;}\n    const person')
    s=s.replace('    load,\n    focusPart,', '    pause:scope.pause, resume:scope.resume, dispose:scope.dispose,\n    load,\n    focusPart,')
    p.write_text(s,encoding='utf-8')
p=root/'engineering-explore.js';s=p.read_text(encoding='utf-8')
if "FufuScenes.register('engineering'" not in s:
    s=s.replace('  viewer = createViewer({', "  window.FufuScenes.register('engineering', saved=>{\n  viewer = createViewer({",1)
    s=s.replace('  selectMachine(MACHINES[0].id);', "  selectMachine(saved.machineId || currentId || MACHINES[0].id);\n  const instance=viewer;\n  return {pause:instance.pause,resume:instance.resume,snapshot:()=>({machineId:currentId}),dispose(){instance.dispose();if(viewer===instance)viewer=null;}};\n  });",1)
    s=s.replace('    yardStage.replaceChildren();\n    yardModule = window.fufuYard.mount(yardStage);', "    window.FufuScenes.register('engineering-yard', ()=>{\n      yardStage.replaceChildren();\n      yardModule=window.fufuYard.mount(yardStage);\n      const instance=yardModule;\n      return {pause:instance.pause,resume:instance.resume,dispose(){instance.dispose();if(yardModule===instance)yardModule=null;}};\n    });")
    s=s.replace('/engineering-yard.js?v=20261001-machinery','/engineering-yard.js?v=20261003-lifecycle-1')
    # The factory remains registered after eviction; do not insert the same module a second time.
    s=s.replace('  if (yardLoading) return;', "  if(window.fufuYard){window.FufuScenes.enter('engineering-yard');return;}\n  if (yardLoading) return;")
    p.write_text(s,encoding='utf-8')
p=root/'transport-explore.js';s=p.read_text(encoding='utf-8')
if "FufuScenes.register('transport'" not in s:
    s=s.replace('    viewer = createViewer({', "    window.FufuScenes.register('transport', saved=>{\n    viewer = createViewer({",1)
    s=s.replace('    select(items[0]);', "    select(items.find(item=>item.id===(saved.itemId || selected?.id)) || items[0]);\n    const instance=viewer;\n    return {pause:instance.pause,resume:instance.resume,snapshot:()=>({itemId:selected?.id}),dispose(){instance.dispose();if(viewer===instance)viewer=null;}};\n    });",1)
    p.write_text(s,encoding='utf-8')
for name in ['engineering-explore.js','transport-explore.js']:
    p=root/name;s=p.read_text(encoding='utf-8').replace('engineering-viewer.js?v=20261003-performance-1','engineering-viewer.js?v=20261003-lifecycle-1');p.write_text(s,encoding='utf-8')
print('Engineering, transport and yard registered with scene lifecycle.')
