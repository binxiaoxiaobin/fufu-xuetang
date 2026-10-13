/* Geometry/animation audit uses real local models; texture pixels are irrelevant. */
const fs = require('fs');
const path = require('path');
const {pathToFileURL} = require('url');
const root = path.resolve(__dirname,'..');
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({width:1,height:1});
async function libraries() {
  const base=pathToFileURL(path.join(root,'frontend')+'/').href;
  const THREE=await import(base+'vendor/three.module.js');
  const {GLTFLoader}=await import(base+'vendor/GLTFLoader.js');
  const {MeshoptDecoder}=await import(base+'vendor/meshopt_decoder.module.js');
  async function load(url) {
    const b=fs.readFileSync(path.join(root,'frontend',url));
    return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
  }
  return {base,THREE,load};
}
module.exports={libraries,root};
if(require.main===module) (async()=>{
  const {THREE,load}=await libraries();
  const items=JSON.parse(fs.readFileSync(path.join(root,'backend/seed_data/transport_exhibits.json'),'utf8'));
  for(const item of items) {
    const gltf=await load(item.model_path.slice(1));
    console.log(item.slug);
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(n=>{
      if(!n.isMesh || !n.name || /gear|wheel|rotor/.test(n.name))return;
      const b=new THREE.Box3().setFromObject(n,true),size=b.getSize(new THREE.Vector3());
      console.log(n.name,'center',b.getCenter(new THREE.Vector3()).toArray().map(v=>+v.toFixed(2)),'size',size.toArray().map(v=>+v.toFixed(2)));
    });
  }
})().catch(e=>{console.error(e);process.exitCode=1});
