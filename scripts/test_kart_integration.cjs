const fs = require('fs'), vm = require('vm'), assert = require('assert/strict'), path = require('path');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'frontend/assets/games/turbo-kart-rally');
// Exercise the actual controller, including simultaneous touch actions and item edges.
const context = vm.createContext({performance:{now:()=>time}, navigator:{}, window:{}, Set, Map, Math});
let time = 100;
vm.runInContext(fs.readFileSync(path.join(dir,'src/config.js'),'utf8').replaceAll('export const','const') + '\n' +
 fs.readFileSync(path.join(dir,'src/input.js'),'utf8').replace(/^import.*$/m,'').replace('export class InputController','globalThis.InputController = class InputController'), context);
const input = new context.InputController({target:{addEventListener(){},removeEventListener(){}}});
input.setTouchAction('accelerate',true); input.setTouchAction('right',true); input.setTouchAction('drift',true);
time += 50; let state = input.getInput();
assert.equal(state.throttle,1); assert(state.steer>0); assert.equal(state.drift,true);
input.setTouchAction('right',false); time+=100; state=input.getInput(); assert.equal(state.throttle,1); assert.equal(state.steer,0);
input.setTouchAction('item',true); assert.equal(input.getInput().item,true); assert.equal(input.getInput().item,false);
input.reset(); assert.equal(input.getInput().throttle,0); assert.equal(input.getInput().drift,false); assert.equal(input.touchHeld.size,0);
input.setTouchAction('brake',true); input._onBlur(); assert.equal(input.getInput().brake,0);

// Test the real launcher against a deferred fullscreen promise, including cancellation.
class Element {
 constructor(){this.hidden=false;this.disabled=false;this.dataset={};this.children=[];this.nodes={};this.classList={contains:()=>true};}
 querySelector(selector){return this.nodes[selector] ||= new Element();}
 querySelectorAll(selector){return this.nodes[selector] ||= [new Element(),new Element(),new Element()];}
 append(child){this.children.push(child);child.parent=this;}
 after(){} remove(){this.removed=true;this.parent.children=this.parent.children.filter(x=>x!==this);}
}
let pages=[], iframeCount=0, accept, fail;
const listeners={}, document={fullscreenElement:null,createElement(tag){const el=new Element(); if(tag==='main')pages.push(el); if(tag==='iframe')iframeCount++; return el;},
 querySelector(){return null;},addEventListener(name,fn){listeners[name]=fn;},exitFullscreen(){document.fullscreenElement=null;listeners.fullscreenchange?.();return Promise.resolve();}};
const window={navigate(){},addEventListener(){}};
const ctx=vm.createContext({document,window,location:{origin:'http://localhost:8000'},setTimeout,clearTimeout,console});
vm.runInContext(fs.readFileSync(path.join(root,'frontend/kart-fullscreen.js'),'utf8').replace('export function createKartLauncher','globalThis.createKartLauncher = function createKartLauncher'),ctx);
const launcher=ctx.createKartLauncher(new Element()), page=pages[0], button=page.querySelector('[data-kart-start]');
page.requestFullscreen=()=>new Promise((resolve,reject)=>{accept=()=>{document.fullscreenElement=page;listeners.fullscreenchange?.();resolve();};fail=reject;});
const game={title:'test',cover:'/cover.webp',entry:'/index.html',id:'turbo-kart-rally'};
(async()=>{
 launcher.open(game);assert.equal(iframeCount,0);
 let start=button.onclick();assert.equal(iframeCount,0,'no iframe while fullscreen permission is pending');accept();await start;
 assert.equal(iframeCount,1);assert.equal(page.querySelector('.kart-gate').hidden,true);
 await document.exitFullscreen();assert.equal(page.querySelector('.kart-stage').children.length,0,'exit unloads iframe');
 launcher.open(game);start=button.onclick();fail(new Error('denied'));await start;assert.equal(iframeCount,1,'denied permission never starts game');
 start=button.onclick();launcher.onNavigate('home');accept();await start;assert.equal(iframeCount,1,'navigation cancels pending startup');
 document.fullscreenElement=null;
 // Every static import in the shipped game and addon graph must resolve locally.
 function scan(folder){for(const item of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,item.name);if(item.isDirectory())scan(file);else if(item.name.endsWith('.js')){
 const text=fs.readFileSync(file,'utf8');for(const match of text.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)){
 const ref=match[1].split('?')[0];const target=ref==='three'?path.join(dir,'vendor/three.module.js'):ref.startsWith('three/addons/')?path.join(dir,'vendor/addons',ref.slice(13)):ref.startsWith('.')?path.resolve(path.dirname(file),ref):null;
 if(target)assert(fs.existsSync(target),`missing module ${target}`);else assert(!/^https?:/.test(ref),'remote runtime dependency');}
 }} }
 scan(path.join(dir,'src'));scan(path.join(dir,'vendor/addons'));
 assert(!fs.readFileSync(path.join(dir,'index.html'),'utf8').includes('https://'));
 console.log('PASS: multitouch input, release/reset, one-shot items, deferred fullscreen, exit cleanup, denial, navigation cancellation and local module graph.');
})().catch(error=>{console.error(error);process.exitCode=1;});
