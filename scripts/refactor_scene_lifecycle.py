"""One-time source migration: keep imports cached but make scene instances disposable."""
from pathlib import Path
import re
root=Path(__file__).resolve().parent.parent/'frontend'
def scoped(source):
    source=re.sub(r'([A-Za-z_$][\w$.]*(?:\.querySelector\([^)]*\))?)\??\.addEventListener\(',r'scope.listen(\1, ',source)
    source=source.replace('new ResizeObserver(', 'new scope.ResizeObserver(').replace('new IntersectionObserver(', 'new scope.IntersectionObserver(')
    source=source.replace('requestAnimationFrame(', 'scope.frame(').replace('new THREE.Clock()', 'scope.clock(new THREE.Clock())')
    source=source.replace('new Image()', 'scope.image()')
    return source
for name,page in [('solar.js','solar'),('moon.js','moon'),('lunar.js','lunar'),('dino-model.js','jurassic')]:
    p=root/name;s=p.read_text(encoding='utf-8')
    if 'createSceneScope' in s: continue
    imports=re.match(r'(?:import[^\n]+\n)+',s).group()
    body=scoped(s[len(imports):])
    body=body.replace('renderer.setPixelRatio(', 'scope.own(scene, renderer);\n  renderer.setPixelRatio(',1)
    if page=='solar':
        body=body.replace("select('earth'); resize();", "if(saved.selected)select(saved.selected);else select('earth'); Object.assign(document.querySelector('#solarPlay'), {textContent: saved.playing===false?'▶ 继续':'⏸ 暂停'}); yaw=saved.yaw??yaw;pitch=saved.pitch??pitch;distance=saved.distance??distance;playing=saved.playing??playing;speed=saved.speed??speed;resize();\n  scope.capture(()=>({selected,yaw,pitch,distance,playing,speed}));\n  scope.hooks(['pauseSolarForTransition','zoomSolarForTransition']);")
    if page=='moon':
        body=body.replace("const state = { angle: 90, playing: false, mode: 'phase' };", "const state = { angle: 90, playing: false, mode: 'phase', ...saved };\n  scope.capture(()=>({...state}));")
        body=body.replace('image.onload=()=>{','image.onload=()=>{\n      if(scope.disposed)return;')
        body=body.replace('canvas.width=2048;canvas.height=1024;', 'canvas.width=Math.min(image.naturalWidth,1536);canvas.height=Math.round(canvas.width/2);')
        body=body.replace('  updateExplanation();\n}', "  scope.hooks(['pauseMoonForTransition','zoomMoonForTransition']);\n  updateExplanation();syncPlay();\n}")
    if page=='lunar':
        body=body.replace("texture=>{texture.colorSpace", "texture=>{if(scope.disposed){texture.dispose();return;}texture.colorSpace")
        body=body.replace('    animate();', "    if(saved.selectedId)choose(places.find(p=>p.id===saved.selectedId));targetYaw=saved.targetYaw??targetYaw;targetPitch=saved.targetPitch??targetPitch;targetDistance=saved.targetDistance??targetDistance;\n    scope.capture(()=>({selectedId,targetYaw,targetPitch,targetDistance}));\n    animate();")
    if page=='jurassic':
        body=body.replace('(gltf) => {','(gltf) => {\n      if(scope.disposed){disposeGraph(gltf.scene);return;}')
        body=body.replace('  window.setDinoModelActive = setActive;', "  window.setDinoModelActive = setActive;\n  scope.hooks(['setDinoModelActive']);\n  scope.cleanup(()=>{requestId++;mixer?.stopAllAction();});")
    s=imports+"import { createSceneScope, disposeGraph } from './scene-scope.js?v=20261003-lifecycle-1';\nwindow.FufuScenes.register('"+page+"', saved => {\nconst scope=createSceneScope();\n"+body+"\nreturn scope;\n});\n"
    p.write_text(s,encoding='utf-8')
    leftovers=re.findall(r'.{0,50}\.addEventListener\(',s)
    print(name,'unscoped listeners:',leftovers)
p=root/'index.html';s=p.read_text(encoding='utf-8')
if '/scene-manager.js' not in s:
    s=s.replace('<script src="/page-loader.js', '<script src="/scene-manager.js?v=20261003-lifecycle-1"></script><script src="/page-loader.js')
s=s.replace('/page-loader.js?v=20261003-performance-1','/page-loader.js?v=20261003-lifecycle-1')
p.write_text(s,encoding='utf-8')
