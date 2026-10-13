import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as THREE from '../frontend/vendor/three.module.js';
import {farmRequestId} from '../frontend/clay-safari/src/farm-request-id.js';
import {PointerGesture} from '../frontend/clay-safari/src/pointer-gesture.js';
import {paddyStage,paddyProgress,beijingDay,PADDY_STAGES} from '../frontend/clay-safari/src/paddy-cycle.js';
import {FARM_AREA,FARM_PLOTS} from '../frontend/clay-safari/src/farm-layout.js';
import {PADDY} from '../frontend/clay-safari/src/data.js';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
// Emulate plain LAN HTTP: getRandomValues exists but randomUUID does not.
const insecure={getRandomValues:array=>globalThis.crypto.getRandomValues(array)};
const ids=new Set(Array.from({length:2000},()=>farmRequestId(insecure)));
assert.equal(ids.size,2000);
for(const id of ids)assert.match(id,uuid);
assert.match(farmRequestId(null),uuid); // Older browser without either method.
assert.equal(farmRequestId({randomUUID:()=> 'native-id'}),'native-id');

const event=(pointerId,x,y,type='touch')=>({pointerId,clientX:x,clientY:y,pointerType:type});
let gesture=new PointerGesture();
gesture.down(event(1,50,50));assert.deepEqual(gesture.move(event(1,58,54)),{});assert.equal(gesture.end(event(1,59,54)),true);
gesture.down(event(1,50,50));assert.ok(gesture.move(event(1,80,50)).orbit);assert.equal(gesture.end(event(1,80,50)),false);
gesture.down(event(1,50,50));assert.equal(gesture.end(event(1,50,50),true),false);assert.equal(gesture.end(event(1,50,50)),false);
gesture.down(event(1,50,50));gesture.down(event(2,100,50));assert.equal(gesture.end(event(2,100,50)),false);assert.equal(gesture.end(event(1,50,50)),false);
gesture.down(event(1,50,50));gesture.down(event(2,100,50));assert.equal(gesture.move(event(2,150,50)).zoom,.5);gesture.end(event(1,50,50),true);assert.equal(gesture.end(event(2,150,50)),false);
gesture.down(event(1,50,50,'mouse'));assert.ok(gesture.move(event(1,58,50,'mouse')).orbit);assert.equal(gesture.end(event(1,58,50,'mouse')),false);
gesture.down(event(1,50,50));assert.equal(gesture.end(event(1,80,50)),false); // Coalesced pointerup.

// Execute the actual Farm methods, with renderer/world dependencies isolated.
const source=(await readFile(new URL('../frontend/clay-safari/src/farm.js',import.meta.url),'utf8'))
  .replace(/^import .*;\r?$/gm,'').replace('export class Farm','globalThis.Farm = class Farm');
const context={THREE,farmRequestId:()=>farmRequestId(insecure),paddyStage,paddyProgress,beijingDay,PADDY_STAGES,FARM_AREA,FARM_PLOTS,PADDY,Date,performance,parent:{postMessage(){}},window:{},location:{origin:'http://192.168.3.106:8000'}};
vm.runInNewContext(source,context);
const farm=Object.create(context.Farm.prototype);
let finish,calls=0;const requests=[],renders=[];
Object.assign(farm,{busy:false,journey:{x:1,z:1},player:{pos:{x:1000,z:1000},group:{position:new THREE.Vector3()},playFarmGesture(){throw new Error('Cannot gesture across map');}},
  world:{nav:{nearest(){throw new Error('A route must not gate care');}}},sheep:[],effects:{},message:{textContent:'',setAttribute(){}},focusTarget(){},render(){renders.push(this.busy);},
  accept(data){this.data=data;},api(path,body){calls++;requests.push(body);return new Promise(resolve=>finish=resolve);}});
const first=farm.act({type:'feed',target:'cloud'});
assert.equal(calls,1);assert.equal(farm.busy,true);assert.equal(farm.journey,null);assert.match(requests[0].requestId,uuid);
await farm.act({type:'feed',target:'cloud'});assert.equal(calls,1); // Double taps cannot create a second in-flight request.
finish({message:'已经喂草',state:{}});await first;assert.equal(farm.busy,false);assert.equal(farm.message.textContent,'✓ 已经喂草');assert.equal(farm.actionFeedback.phase,'success');assert.equal(renders.at(-1),false);
farm.api=async()=>{throw new Error('离线，请重试');};await farm.act({type:'feed',target:'cloud'});assert.equal(farm.busy,false);assert.equal(farm.message.textContent,'离线，请重试');

context.AbortController=AbortController;context.TypeError=TypeError;context.setTimeout=setTimeout;context.clearTimeout=clearTimeout;
context.fetch=async()=>({ok:false,json:async()=>({error:'今天已经浇过水'})});
await assert.rejects(()=>context.Farm.prototype.api('/api/farm/actions',{type:'paddy-water'}),/今天已经浇过水/);
context.fetch=async()=>{throw new TypeError('Failed to fetch');};
await assert.rejects(()=>context.Farm.prototype.api('/api/farm'),/收起再打开牧场/);
context.setTimeout=callback=>setTimeout(callback,0);
context.fetch=async(path,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('timeout','AbortError'))));
await assert.rejects(()=>context.Farm.prototype.api('/api/farm'),/确认操作结果/);

// Finger-friendly screen picking uses the actual Three.js camera and world projection.
const camera=new THREE.PerspectiveCamera(50,1,.1,100);camera.position.z=10;camera.lookAt(0,0,0);camera.updateMatrixWorld();
const tag=new THREE.Object3D();tag.userData.farm={type:'sheep',id:'cloud'};
const picking=Object.create(context.Farm.prototype);const opened=[];
Object.assign(picking,{root:new THREE.Group(),pickTargets:[tag],projected:new THREE.Vector3(),open(tab){opened.push(tab);}});
const canvas={getBoundingClientRect:()=>({left:0,top:0,width:200,height:200})},ray={intersectObject:()=>[]};
assert.equal(picking.pick(ray,event(1,131,100),camera,canvas),true);assert.equal(picking.selected,'cloud');assert.equal(opened.at(-1),'sheep');
assert.equal(picking.pick(ray,event(1,131,100,'mouse'),camera,canvas),false);
assert.equal(picking.pick(ray,event(1,140,100),camera,canvas),false);
tag.position.z=12;tag.updateMatrixWorld();assert.equal(picking.pick(ray,event(1,100,100),camera,canvas),false);

// Rendering must preserve scroll/help state and never re-enable exhausted actions.
const catalog=JSON.parse(await readFile(new URL('../backend/seed_data/farm_catalog.json',import.meta.url),'utf8'));
const now=Date.parse('2026-10-05T04:00:00Z');
let writes=0,help=null,buttons=[];
const content={scrollTop:0,setAttribute(){},querySelector(){return help;},set innerHTML(html){this.html=html;writes++;help=html.includes('farm-help')?{open:false}:null;buttons=[...html.matchAll(/<button\b([^>]*)>/g)].filter(m=>/data-action/.test(m[1])).map(m=>({disabled:/\bdisabled\b/.test(m[1]),textContent:'原始按钮',dataset:Object.fromEntries([...m[1].matchAll(/data-([a-z]+)="([^"]*)"/g)].map(a=>[a[1],a[2]])),classList:{toggle(){}},setAttribute(){}}));},get innerHTML(){return this.html;}};
const rendering=Object.create(context.Farm.prototype);
Object.assign(rendering,{busy:false,selected:'cloud',tab:'paddy',content,now:()=>now,panel:{querySelector:()=>({textContent:''}),querySelectorAll:selector=>selector==='[data-tab]'?[]:buttons},data:{points:115,catalog,state:{capacity:1,sheep:[{id:'cloud',breed:'cloud',name:'棉花糖',careCount:3,careDay:'',woolReadyAt:now}],inventory:{wool:0,clover:0,carrot:0},decorations:[],plots:[{id:'plot-1',crop:null}],paddy:{plantedAt:now,wateredAt:now,readyAt:now+30*86400000,growthStartedAt:now,baseDurationMs:30*86400000,boostPerWaterMs:21600000,waterDay:beijingDay(now),waterCount:1,boostMs:0,harvests:0,totalReward:0,rewardPoints:12}}}});
context.Farm.prototype.render.call(rendering);assert.equal(buttons[0].disabled,true);assert.match(content.html,/今日已浇水/);
content.scrollTop=85;help.open=true;context.Farm.prototype.render.call(rendering);assert.equal(writes,1);assert.equal(content.scrollTop,85);assert.equal(help.open,true);
rendering.busy=true;context.Farm.prototype.render.call(rendering);assert.equal(writes,1);assert.equal(content.scrollTop,85);assert.equal(help.open,true);
rendering.busy=false;context.Farm.prototype.render.call(rendering);assert.equal(buttons[0].disabled,true);
rendering.tab='sheep';context.Farm.prototype.render.call(rendering);assert.equal(content.scrollTop,0);assert.equal(buttons.every(b=>!b.disabled),true);assert.ok(!content.html.includes('farm-friends'));
rendering.busy=true;context.Farm.prototype.render.call(rendering);assert.equal(buttons.every(b=>b.disabled),true);
rendering.actionFeedback={body:{type:'feed',target:'cloud'},phase:'pending'};context.Farm.prototype.render.call(rendering);assert.equal(buttons[0].textContent,'喂草中…');const sameButton=buttons[0];rendering.busy=false;rendering.actionFeedback.phase='success';context.Farm.prototype.render.call(rendering);assert.equal(buttons[0],sameButton);assert.equal(buttons[0].textContent,'✓ 已喂草');assert.equal(buttons.every(b=>!b.disabled),true);

// Rebuild real Three.js farm models with an older canvas lacking roundRect.
let roundedFallbacks=0;
context.document={createElement:()=>({getContext:()=>({beginPath(){},moveTo(){},arcTo(){roundedFallbacks++;},closePath(){},fill(){},fillText(){}})})};
context.clayMaterial=color=>new THREE.MeshStandardMaterial({color});context.terrainHeight=()=>0;
vm.runInNewContext((await readFile(new URL('../frontend/clay-safari/src/farm-models.js',import.meta.url),'utf8')).replace(/^import .*;\r?$/gm,'').replace(/^export /gm,''),context);
const built=Object.create(context.Farm.prototype);
const modelState=structuredClone(rendering.data);modelState.state.plots.push({id:'plot-2',crop:null});
Object.assign(built,{root:new THREE.Group(),world:{setPaddyStage(){},addObstacle(){}},data:modelState,now:()=>now});
built.rebuild();assert.ok(roundedFallbacks>0);assert.equal(built.pickTargets.length,3);
assert.deepEqual(Array.from(built.pickTargets,tag=>tag.userData.farm.type),['paddy','home','sheep']);
assert.equal(built.sheep[0].tag.userData.farm.id,'cloud');built.rebuild();assert.equal(built.pickTargets.length,3); // Refresh must not duplicate labels.
console.log('Farm interaction passed: LAN UUID, touch/pinch/cancel, immediate care, double-tap guard, timeout/failure recovery, label picking, legacy canvas, stable scroll/help, daily-water disabled state.');
