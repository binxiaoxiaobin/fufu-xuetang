import fs from 'node:fs';
import path from 'node:path';
import {NodeIO} from '../artifacts/transport-tools/node_modules/@gltf-transform/core/dist/index.js';
import {ALL_EXTENSIONS} from '../artifacts/transport-tools/node_modules/@gltf-transform/extensions/dist/index.js';
import {dedup,flatten,join,weld,simplify,prune,metalRough,textureCompress,clearNodeTransform,getBounds,compactPrimitive} from '../artifacts/transport-tools/node_modules/@gltf-transform/functions/dist/index.js';
import draco from '../artifacts/transport-tools/node_modules/draco3dgltf/draco3dgltf.js';
import {MeshoptSimplifier} from '../artifacts/transport-tools/node_modules/meshoptimizer/index.js';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../artifacts/transport-tools/package.json',import.meta.url));
const sharp=require('sharp');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco.createDecoderModule()});
await MeshoptSimplifier.ready;
const mapping=JSON.parse(fs.readFileSync('artifacts/transport-sources/selected.json'));
for(const [slug,uid] of Object.entries(mapping)){
 if(process.argv.length>2 && !process.argv.slice(2).includes(slug))continue;
 const doc=await io.read(path.resolve('artifacts/transport-sources/realistic',uid+'.glb'));
 for(const ext of doc.getRoot().listExtensionsUsed())if(ext.extensionName==='KHR_draco_mesh_compression')ext.dispose();
 for(const animation of doc.getRoot().listAnimations())animation.dispose();
 if(slug==='fire-engine')for(const n of doc.getRoot().listNodes()){
  if(n.getMesh()?.listPrimitives().every(p=>p.getMaterial()?.getName()==='Material.002'))n.setMesh(null);
 }
 if(slug==='steam-train')for(const n of doc.getRoot().listNodes())if(/^(Rails_|Bars_)/.test(n.getName()))n.traverse(child=>child.setMesh(null));
 if(slug==='bullet-train')for(const n of doc.getRoot().listNodes())if(/^(Body|Neck|SENIOR)/.test(n.getName()))n.traverse(child=>child.setMesh(null));
 if(slug==='bullet-train')for(const n of doc.getRoot().listNodes())if(/^Plane(?:_|$)/.test(n.getName()))n.traverse(child=>child.setMesh(null));
 await doc.transform(metalRough(),dedup(),flatten(),join(),weld());
 const count=doc.getRoot().listMeshes().reduce((a,m)=>a+m.listPrimitives().reduce((n,p)=>n+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0),0);
 const simplifier=slug==='bullet-train'?{...MeshoptSimplifier,simplify:(indices,positions,stride,target,error,flags)=>MeshoptSimplifier.simplify(indices,positions,stride,target,error,[...flags,'Permissive'])}:MeshoptSimplifier;
 if(count>100000)await doc.transform(simplify({simplifier,ratio:100000/count,error:0.01}));
 // Bake source transforms, then split observation regions using actual triangle positions.
 // No disconnected fake joints or invented animation are introduced.
 const scene=doc.getRoot().listScenes()[0];
 for(const n of [...scene.listChildren()])if(n.getMesh())clearNodeTransform(n);
 const bounds=getBounds(scene),range=bounds.max.map((v,i)=>v-bounds.min[i]);
 const axis=range[0]>range[2]?0:2;
 const parts=new Map();
 function region(p){
  const h=(p[1]-bounds.min[1])/range[1],l=(p[axis]-bounds.min[axis])/range[axis];
  if(slug==='rocket')return h>.80?'upper':h<.18?'lower':'body';
  if(slug==='airliner'){
   const w=Math.abs((p[2]-bounds.min[2])/range[2]-.5);
   return w>.20?'wings':h>.62?'upper':'body';
  }
  if(slug==='helicopter')return h>.77?'upper':h<.19?'lower':'body';
  if(slug==='propeller-plane')return h>.58?'upper':h<.25?'lower':'body';
  if(slug==='sailboat')return h>.43?'upper':'body';
  if(slug==='cargo-ship')return h>.63?'upper':h<.32?'lower':'body';
  return h>.76?'upper':h<.23?'lower':'body';
 }
 const source=[...scene.listChildren()];
 for(const node of source){const mesh=node.getMesh();if(!mesh)continue;
  for(const prim of mesh.listPrimitives()){
   if(prim.getMode()!==4)continue;
   const positions=prim.getAttribute('POSITION'),indices=prim.getIndices()?.getArray()||Uint32Array.from({length:positions.getCount()},(_,i)=>i),groups=new Map();
   for(let i=0;i<indices.length;i+=3){const point=[0,0,0];for(let v=0;v<3;v++){const a=positions.getElement(indices[i+v],[]);for(let k=0;k<3;k++)point[k]+=a[k]/3;}
    const key=region(point);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(indices[i],indices[i+1],indices[i+2]);
   }
   for(const [key,list] of groups){if(!parts.has(key)){const m=doc.createMesh(key);parts.set(key,m);scene.addChild(doc.createNode('observe_'+key).setMesh(m));}
    const clone=prim.clone();clone.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(list)).setBuffer(doc.getRoot().listBuffers()[0]));compactPrimitive(clone);parts.get(key).addPrimitive(clone);
   }
  }scene.removeChild(node);
 }
 if(slug==='sailboat')for(const [key,m] of parts){const mat=doc.createMaterial('sailboat_'+key).setBaseColorFactor(key==='upper'?[.88,.82,.65,1]:[.18,.075,.026,1]).setMetallicFactor(0).setRoughnessFactor(.75);for(const p of m.listPrimitives())p.setMaterial(mat);}
 await doc.transform(textureCompress({encoder:sharp,targetFormat:'webp',resize:[1024,1024],quality:88}),prune());
 await io.write(path.resolve('frontend/assets/transport/models','v3-'+slug+'.glb'),doc);
 console.log(slug,count,fs.statSync('frontend/assets/transport/models/v3-'+slug+'.glb').size);
}
