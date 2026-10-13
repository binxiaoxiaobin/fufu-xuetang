// Sheep body/head proportions adapted from Little Flock (MIT).
// Copyright Little Flock contributors; license in assets/clay-farm/upstream/LICENSE.
import * as THREE from 'three';
import {clayMaterial} from './clay.js';
const sphere = new THREE.SphereGeometry(1,12,8), box = new THREE.BoxGeometry(1,1,1), cylinder = new THREE.CylinderGeometry(1,1,1,10);
const materials = new Map();
function material(color) { if (!materials.has(color)) materials.set(color,clayMaterial(color)); return materials.get(color); }
export function piece(parent, kind, color, position, scale) {
  const mesh = new THREE.Mesh(kind==='box'?box:kind==='cylinder'?cylinder:sphere,material(color));
  mesh.position.set(...position); mesh.scale.set(...scale); mesh.castShadow=true; mesh.receiveShadow=true; parent.add(mesh); return mesh;
}
export function makeSheep(breed) {
  const root=new THREE.Group(), body=new THREE.Group(), head=new THREE.Group(), legs=[];
  root.add(body,head); head.position.set(0,1.06,.78);
  piece(body,'sphere',breed.color,[0,1.04,-.06],[.65,.6,.85]);
  for (let i=0;i<29;i++) {
    const a=i*2.39996,y=1-i/28*2,r=Math.sqrt(1-y*y),s=.245+Math.sin(i*17)*.035;
    piece(body,'sphere',breed.color,[Math.cos(a)*r*.61,1.06+y*.52,Math.sin(a)*r*.76-.05],[s,s*.96,s]);
  }
  piece(head,'sphere',breed.face,[0,0,0],[.35,.39,.32]);
  piece(head,'sphere',breed.face,[0,-.12,.15],[.29,.24,.29]);
  for (const side of [-1,1]) {
    const ear=piece(head,'sphere',breed.face,[side*.36,.12,-.055],[.25,.09,.15]);ear.rotation.z=side*-.3;
    piece(head,'sphere','#d1a195',[side*.4,.14,-.035],[.13,.032,.087]);
    piece(head,'sphere','#fff8e1',[side*.158,.055,.275],[.087,.108,.04]);
    piece(head,'sphere','#292f2d',[side*.156,.048,.309],[.043,.063,.024]);
    piece(head,'sphere','#fff8e1',[side*.145,.078,.329],[.015,.019,.013]);
    piece(head,'sphere','#332e29',[side*.072,-.18,.399],[.023,.016,.014]);
  }
  for(let i=0;i<5;i++)piece(head,'sphere',breed.color,[(i-2)*.125,.305+Math.sin(i/4*Math.PI)*.045,.12],[.12,.125,.12]);
  for(const z of [-.47,.47]) for(const x of [-.39,.39])legs.push(piece(root,'cylinder',breed.face,[x,.32,z],[.105,.47,.11]));
  if(breed.id!=='cloud') {
    const accent=piece(head,'sphere',breed.id==='mint'?'#73a26d':'#e88d9f',[.32,.43,.1],[.16,.09,.16]);accent.rotation.z=.35;
  }
  const feed=new THREE.Group();root.add(feed);feed.position.set(0,.18,1.3);feed.visible=false;
  for(let i=0;i<7;i++){const leaf=piece(feed,'sphere',i%2?'#669e45':'#96be67',[(i-3)*.07,.1,0],[.05,.3,.06]);leaf.rotation.z=(i-3)*.2;}
  return {root,body,head,legs,feed};
}
export function makePasture(capacity,decorations) {
  // Keep the fence aligned with the reserved navigation footprint, including before expansion.
  const root=new THREE.Group(), w=10, d=7;
  piece(root,'box','#a8bd83',[0,-.08,0],[w,.12,d]);
  const wood='#bc946e';
  for(let x=-w/2;x<=w/2;x+=1.3)for(const z of [-d/2,d/2]) {
    if(z===d/2&&Math.abs(x)<1.6)continue;
    piece(root,'cylinder',wood,[x,.55,z],[.14,1.2,.14]);
  }
  for(const x of [-w/2,w/2])for(let z=-d/2;z<=d/2;z+=1.2)piece(root,'cylinder',wood,[x,.55,z],[.14,1.2,.14]);
  for(const y of [.4,.8]) {
    piece(root,'box',wood,[0,y,-d/2],[w,.13,.13]);
    for(const side of [-1,1])piece(root,'box',wood,[side*(w/4+.7),y,d/2],[w/2-1.4,.13,.13]);
    for(const x of [-w/2,w/2])piece(root,'box',wood,[x,y,0],[.13,.13,d]);
  }
  const shelter=new THREE.Group();root.add(shelter);shelter.position.set(-w/2+1.5,0,-2);
  piece(shelter,'box','#ead6af',[0,.75,0],[2.5,1.5,1.6]);piece(shelter,'box','#6d6049',[0,.52,.82],[.85,1,.06]);
  for(const side of [-1,1]){const roof=piece(shelter,'box','#ba795f',[side*.65,1.8,0],[1.65,.15,2]);roof.rotation.z=side*-.42;}
  piece(root,'box','#eee0bb',[w/2-1.3,.18,-2],[1.6,.35,1]);
  if(decorations.includes('flowers'))for(const side of [-1,1]){
    piece(root,'cylinder','#bb805f',[side*2,.24,d/2+.4],[.33,.48,.33]);
    for(let i=0;i<4;i++){const x=side*2+Math.sin(i*2)*.2,z=d/2+.4+Math.cos(i*2)*.2;piece(root,'cylinder','#77a768',[x,.6,z],[.035,.6,.035]);piece(root,'sphere',i%2?'#efc680':'#e7a6a2',[x,.95,z],[.15,.09,.15]);}
  }
  if(decorations.includes('rug'))piece(root,'box','#e7b58a',[0,.03,2],[2.2,.08,1.35]);
  if(decorations.includes('garland'))for(let i=0;i<9;i++)piece(root,'sphere',i%2?'#e4c674':'#81aa72',[Math.cos(i/9*Math.PI*2)*.45,1.1+Math.sin(i/9*Math.PI*2)*.45,d/2],[.13,.13,.08]);
  if(decorations.includes('windvane')){piece(root,'cylinder',wood,[w/2-.3,1.8,-d/2],[.07,3.6,.07]);const flag=piece(root,'box','#d49286',[w/2+.1,3.4,-d/2],[.8,.35,.08]);flag.name='farm-windvane';}
  return root;
}
export function makePlot(crop,stage) {
  const root=new THREE.Group();piece(root,'box','#936e50',[0,.04,0],[1.5,.12,1.5]);
  for(const x of [-.8,.8])piece(root,'box','#c5a578',[x,.1,0],[.1,.2,1.7]);
  for(const z of [-.8,.8])piece(root,'box','#c5a578',[0,.1,z],[1.7,.2,.1]);
  if(crop)for(const x of [-.42,.42])for(const z of [-.42,.42]){
    const h=stage===2?.55:stage===1?.28:.12;
    piece(root,'cylinder','#7ea25c',[x,h/2+.12,z],[.035,h,.035]);
    for(const side of [-1,1])piece(root,'sphere','#92b76a',[x+side*.13,h+.12,z],[.18,.05,.11]);
    if(stage===2&&crop==='carrot')piece(root,'sphere','#e69a4b',[x,.17,z],[.16,.19,.16]);
    if(stage===2&&crop==='clover')piece(root,'sphere','#b3c67b',[x,h+.16,z],[.15,.08,.15]);
  }
  return root;
}
export function makeGardenFrame(){
  const root=new THREE.Group(),wood='#c5a578';
  piece(root,'box','#ab8965',[0,.03,0],[3,.1,3]);
  for(const x of [-1.6,1.6])for(const z of [-1.6,0,1.6])piece(root,'cylinder',wood,[x,.4,z],[.09,.9,.09]);
  for(const y of [.25,.6]){for(const x of [-1.6,1.6])piece(root,'box',wood,[x,y,0],[.08,.09,3.2]);piece(root,'box',wood,[0,y,-1.6],[3.2,.09,.08]);for(const x of [-1.2,1.2])piece(root,'box',wood,[x,y,1.6],[.8,.09,.08]);}
  return root;
}
