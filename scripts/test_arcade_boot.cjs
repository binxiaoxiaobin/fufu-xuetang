/* Exercise actual game scripts with controls parsed after their script tags. */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '../frontend');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const extrasAt = html.indexOf('<script src="/extras.js');
assert.ok(extrasAt > 0);
// Also exercise initialization before the controls are parsed.
const ids = new Map(), events = new Map(), frames = new Map(), intervals = new Map();
let parsed = false, nextFrame = 0, nextInterval = 0, timestamp = 1, drawingCalls = 0;
const paint = new Proxy({}, {get(target, name) {
  if(name in target)return target[name];
  if(name === 'createLinearGradient' || name === 'createRadialGradient')return () => ({addColorStop(){}});
  return () => {drawingCalls++;};
}});
function node(id, dataset = {}) {
  const handlers = new Map(), classes = new Set();
  return {id, dataset, handlers, style:{}, innerHTML:'', textContent:'',
    classList:{add(...items){items.forEach(x=>classes.add(x));},remove(...items){items.forEach(x=>classes.delete(x));},
      contains(x){return classes.has(x);},toggle(x,on){const show=on===undefined?!classes.has(x):on;if(show)classes.add(x);else classes.delete(x);}},
    addEventListener(type, fn){if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push(fn);},
    getContext(){return paint;}, getBoundingClientRect(){return {width:440,height:440};},
    setPointerCapture(){}, closest(){return this;}, getAttribute(){return 'about:blank';},
    emit(type, extra={}){for(const fn of handlers.get(type)||[])fn({preventDefault(){},pointerId:1,button:0,target:this,...extra});},
  };
}
for(const match of html.matchAll(/\bid="([^"]+)"/g))ids.set(match[1], {element:node(match[1]), late:['gameStart','companionDialog','petCompanion'].includes(match[1])});
const panel = node('console');
const tabs = ['sudoku','maze','mines'].map(game=>node(game,{game}));
const controls = ['up','down','left','right'].map(control=>node(control,{control}));
const difficulties = ['easy','medium','hard'].map(difficulty=>node(difficulty,{difficulty}));
const digits = Array.from({length:9},(_,i)=>node('digit-'+(i+1),{digit:String(i+1)}));
const nav = ['shop','arcade'].map(page=>node('nav-'+page,{page}));
const selectors = {'.game-tab':tabs,'[data-control]':controls,'[data-difficulty]':difficulties,'[data-digit]':digits,'.nav-link':nav};
function select(selector){
  if(selector === '.game-console')return panel;
  if(selector.startsWith('#')){const found=ids.get(selector.slice(1));return found&&(!found.late||parsed)?found.element:null;}
  return null;
}
const document = {readyState:'loading',hidden:false,querySelector:select,
  querySelectorAll:selector=>selectors[selector]||[],
  addEventListener(type,fn,options={}){if(!events.has(type))events.set(type,[]);events.get(type).push({fn,once:options.once});},
};
function emitDocument(type, detail={}){
  for(const {fn} of events.get(type)||[])fn(detail);
  events.set(type,(events.get(type)||[]).filter(e=>!e.once));
}
const storage = new Map();
const context = vm.createContext({document,window:{addEventListener(){}},console,
  location:{origin:'http://localhost:8000'}, $:select, $$:s=>document.querySelectorAll(s),
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))},
  requestAnimationFrame(fn){frames.set(++nextFrame,fn);return nextFrame;},cancelAnimationFrame(id){frames.delete(id);},
  setInterval(fn){intervals.set(++nextInterval,fn);return nextInterval;},clearInterval(id){intervals.delete(id);},
  setTimeout(){},api(){throw new Error('test must not award points');},escapeHtml:x=>String(x),toast(){},
});
const run = expression=>vm.runInContext(expression,context);
function frame(){const callbacks=[...frames.values()];frames.clear();timestamp+=20;callbacks.forEach(fn=>fn(timestamp));}
const get = id=>ids.get(id).element;
const tab = kind=>tabs.find(n=>n.dataset.game===kind).emit('click');

vm.runInContext(fs.readFileSync(path.join(root,'extras.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(root,'puzzles.js'),'utf8'),context);
assert.equal(select('#petCompanion'),null);
assert.equal(get('gameStart').handlers.get('click'),undefined,'wait for trailing controls');
parsed=true;document.readyState='interactive';emitDocument('DOMContentLoaded');
assert.equal(get('gameStart').handlers.get('click').length,1);
assert.ok(tabs.every(t=>t.handlers.get('click').length===1));
emitDocument('DOMContentLoaded');
assert.equal(get('gameStart').handlers.get('click').length,1,'bind once');
get('page-arcade').classList.add('active');

tab('sudoku');assert.equal(frames.size,0,'switching game cancels action loop');
assert.equal(run('sudokuGame.values.length'),81);assert.equal(run('sudokuSolutionCount(sudokuGame.puzzle,2)'),1);
const selected=run('sudokuGame.selected');digits[0].emit('click');
assert.equal(run('sudokuGame.values['+selected+']'),1);get('sudokuErase').emit('click');
assert.equal(run('sudokuGame.values['+selected+']'),0,'erase restores blank');

tab('mines');assert.equal(intervals.size,0,'switching away stops sudoku clock');
const tile=node('mine-0',{mine:'0'});
get('minesBoard').emit('pointerdown',{target:tile});
assert.equal(run('mineGame.cells[0].open'),true);assert.equal(run('mineGame.cells[0].mine'),false,'first reveal safe');
const covered=run('mineGame.cells.findIndex(c=>!c.open)');
get('gameAction').emit('pointerdown');get('minesBoard').emit('pointerdown',{target:node('flag',{mine:String(covered)})});
assert.equal(run('mineGame.cells['+covered+'].flag'),true,'touch flag mode marks cell');

tab('maze');get('gameStart').emit('click');frame();frame();
const possible=run(`[[0,16,'down'],[16,0,'right']].find(([dx,dy])=>!mazeWallAt(game.x+dx,game.y+dy))[2]`);
const before=run('game.x+game.y');controls.find(c=>c.dataset.control===possible).emit('pointerdown');
controls.find(c=>c.dataset.control===possible).emit('pointerup');
assert.ok(run('game.x+game.y')>before,'maze touch step moves through corridor');
get('gameStart').emit('click');assert.equal(frames.size,1,'maze restart keeps one animation loop');
get('page-arcade').classList.remove('active');frame();
assert.equal(frames.size,0,'leaving arcade stops animation');
console.log('Arcade checks passed: late DOM controls, single bindings, three games, touch actions, puzzle input, restart and page exit.');
