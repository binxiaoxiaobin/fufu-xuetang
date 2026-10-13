/* Match named joint groups as well as meshes, without inheriting the model root. */
function partNames(mesh, tags, boundary) {
  const names=[];
  let modelRoot=mesh;while(modelRoot.parent && modelRoot.parent!==boundary)modelRoot=modelRoot.parent;
  const rootName=modelRoot.name;
  for(let node=mesh;node && node!==boundary;node=node.parent) {
    if(node!==mesh && (!node.parent || node.parent===boundary)) break;
    if(node!==mesh && rootName && (node.name===rootName || node.name.startsWith(rootName+'_')))break;
    names.push(...(tags?.[node.name] || [node.name || '']));
  }
  return names;
}
export const partName=(mesh,tags,boundary)=>partNames(mesh,tags,boundary).join(' ');
export function findPartMeshes(root, pattern, tags) {
  const found=[];
  root.traverse(node=>{
    if(!node.isMesh || node.userData.teachingAid) return;
    if(partNames(node,tags,root).some(name=>{pattern.lastIndex=0;return pattern.test(name);})) found.push(node);
  });
  return found;
}
