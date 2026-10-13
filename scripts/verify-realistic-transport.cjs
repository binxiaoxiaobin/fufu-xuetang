const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {libraries,root}=require('./audit-model-interactions.cjs');
(async()=>{
 const {base,THREE,load}=await libraries();
 const {modelScaleFactor,boxViewDistance}=await import(base+'model-framing.js');
 const items=JSON.parse(fs.readFileSync(path.join(root,'backend/seed_data/transport_exhibits.json'),'utf8'));
 assert.equal(items.length,11);const report=[];
 for(const item of items){
  const gltf=await load(item.model_path.slice(1)),model=gltf.scene;
  let box=new THREE.Box3().setFromObject(model,true);
  model.scale.multiplyScalar(modelScaleFactor(box.getSize(new THREE.Vector3()),item));
  model.rotation.y=item.yawFix||0;model.updateMatrixWorld(true);
  box=new THREE.Box3().setFromObject(model,true);model.position.y-=box.min.y;model.updateMatrixWorld(true);
  box=new THREE.Box3().setFromObject(model,true);assert(Math.abs(box.min.y)<1e-4,'model base meets the measurement plane');
  const size=box.getSize(new THREE.Vector3());assert(size.toArray().every(v=>Number.isFinite(v)&&v>0));
  for(const aspect of [0.65,1,1.8,2.3]){
   const az=.55,el=.34,d=boxViewDistance(size.x,size.y,size.z,38,aspect,az,el),tan=Math.tan(19*Math.PI/180);
   for(const x of [-size.x/2,size.x/2])for(const y of [-size.y/2,size.y/2])for(const z of [-size.z/2,size.z/2]){
    const near=x*Math.sin(az)*Math.cos(el)+y*Math.sin(el)+z*Math.cos(az)*Math.cos(el);
    const right=x*Math.cos(az)-z*Math.sin(az),up=-x*Math.sin(az)*Math.sin(el)+y*Math.cos(el)-z*Math.cos(az)*Math.sin(el);
    assert(Math.abs(right)/(d-near)/tan/aspect<1 && Math.abs(up)/(d-near)/tan<1,'all calibrated corners fit');
   }
  }
  let triangles=0,draws=0;model.traverse(n=>{if(n.isMesh){draws++;triangles+=(n.geometry.index?.count||n.geometry.attributes.position.count)/3;}});
  const bytes=fs.statSync(path.join(root,'frontend',item.model_path)).size;
  assert(bytes<8*1024*1024 && triangles<160000 && draws<90,'tablet asset budget');
  assert(fs.existsSync(path.join(root,'frontend',item.cover_path)));
  report.push({slug:item.slug,bytes,triangles,draws,size:size.toArray().map(v=>+v.toFixed(2))});
 }
 fs.writeFileSync(path.join(root,'artifacts/transport-realistic-validation.json'),JSON.stringify(report,null,2));
 console.log('PASS eleven models: calibrated framing at four aspect ratios, asset budgets and local covers.');
 console.log('Total model bytes:',report.reduce((n,r)=>n+r.bytes,0));
})().catch(e=>{console.error(e);process.exitCode=1});
