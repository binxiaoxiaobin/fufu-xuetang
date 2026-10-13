const SUDOKU_ALL = 0x3fe;
let sudokuDifficulty = 'medium';
let sudokuGame = null;
let sudokuClock = null;
let mazeStage = Number(localStorage.getItem('fufu-maze-stage') || 1);
let mazeSession = null;
let mineGame = null;
let mineFlagMode = false;
const DIFFICULTY_LABELS = {easy:'低难度',medium:'中难度',hard:'高难度'};

function shuffled(values) {
  const result=values.slice();
  for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
  return result;
}
function sudokuSolution() {
  const bands=shuffled([0,1,2]);
  const rows=bands.flatMap(b=>shuffled([0,1,2]).map(r=>b*3+r));
  const stacks=shuffled([0,1,2]);
  const cols=stacks.flatMap(b=>shuffled([0,1,2]).map(c=>b*3+c));
  const digits=shuffled([1,2,3,4,5,6,7,8,9]);
  return rows.flatMap(r=>cols.map(c=>digits[(r*3+Math.floor(r/3)+c)%9]));
}
function sudokuSolutionCount(values, stopAt=2) {
  const cells=values.slice(),rowMask=Array(9).fill(0),colMask=Array(9).fill(0),boxMask=Array(9).fill(0);
  for(let i=0;i<81;i++)if(cells[i]){const r=Math.floor(i/9),c=i%9,b=Math.floor(r/3)*3+Math.floor(c/3),bit=1<<cells[i];if((rowMask[r]&bit)||(colMask[c]&bit)||(boxMask[b]&bit))return 0;rowMask[r]|=bit;colMask[c]|=bit;boxMask[b]|=bit;}
  function count(){
    let best=-1,bestOptions=0,bestCount=10;
    for(let i=0;i<81;i++)if(cells[i]===0){const r=Math.floor(i/9),c=i%9,b=Math.floor(r/3)*3+Math.floor(c/3),options=SUDOKU_ALL&~(rowMask[r]|colMask[c]|boxMask[b]);let n=0;for(let m=options;m;m&=m-1)n++;if(n===0)return 0;if(n<bestCount){best=i;bestOptions=options;bestCount=n;if(n===1)break;}}
    if(best<0)return 1;
    let total=0;const r=Math.floor(best/9),c=best%9,b=Math.floor(r/3)*3+Math.floor(c/3);
    for(let d=1;d<=9;d++){const bit=1<<d;if(bestOptions&bit){cells[best]=d;rowMask[r]|=bit;colMask[c]|=bit;boxMask[b]|=bit;total+=count();cells[best]=0;rowMask[r]^=bit;colMask[c]^=bit;boxMask[b]^=bit;if(total>=stopAt)return total;}}
    return total;
  }
  return count();
}
function generateSudoku() {
  const solution=sudokuSolution(),puzzle=solution.slice(),target={easy:40,medium:34,hard:29}[sudokuDifficulty];let clues=81;
  for(const i of shuffled(Array.from({length:81},(_,n)=>n))){if(clues<=target)break;const value=puzzle[i];puzzle[i]=0;if(sudokuSolutionCount(puzzle,2)===1)clues--;else puzzle[i]=value;}
  sudokuGame={solution,puzzle,values:puzzle.slice(),selected:puzzle.findIndex(value=>value===0),incorrect:new Set(),startedAt:Date.now(),complete:false};
  $('#sudokuClues').textContent=`${DIFFICULTY_LABELS[sudokuDifficulty]} · ${clues} 个提示数字`;
  $('#sudokuMessage').textContent='选择空格，再点数字填入。';
  renderSudoku();startSudokuClock();
}
function renderSudoku() {
  if(!sudokuGame)return;
  $('#sudokuBoard').innerHTML=sudokuGame.values.map((value,i)=>{
    const row=Math.floor(i/9),col=i%9,selected=sudokuGame.selected===i;
    const peers=sudokuGame.selected>=0&&(row===Math.floor(sudokuGame.selected/9)||col===sudokuGame.selected%9||((Math.floor(row/3)===Math.floor(sudokuGame.selected/9/3))&&(Math.floor(col/3)===Math.floor((sudokuGame.selected%9)/3))));
    const same=value&&sudokuGame.values[sudokuGame.selected]===value;
    const cls=['sudoku-cell',sudokuGame.puzzle[i]?'given':'',peers?'peer':'',selected?'selected':'',same?'same-number':'',sudokuGame.incorrect.has(i)?'conflict':''].filter(Boolean).join(' ');
    return `<button class="${cls}" data-cell="${i}" role="gridcell" aria-label="第 ${row+1} 行第 ${col+1} 列${value?`，${value}`:'，空格'}">${value||''}</button>`;
  }).join('');
}
function selectSudokuCell(i) {if(!sudokuGame||sudokuGame.complete)return;sudokuGame.selected=i;renderSudoku();}
function enterSudokuValue(value) {
  if(!sudokuGame||sudokuGame.complete||sudokuGame.selected<0||sudokuGame.puzzle[sudokuGame.selected])return;
  sudokuGame.values[sudokuGame.selected]=value;
  sudokuGame.incorrect.delete(sudokuGame.selected);
  if(sudokuGame.values.every((n,i)=>n===sudokuGame.solution[i]))finishSudoku();else renderSudoku();
}
function checkSudoku() {
  if(!sudokuGame||sudokuGame.complete)return;
  sudokuGame.incorrect.clear();let first=-1;
  for(let i=0;i<81;i++)if(sudokuGame.values[i]&&sudokuGame.values[i]!==sudokuGame.solution[i]){sudokuGame.incorrect.add(i);if(first<0)first=i;}
  if(first<0&&sudokuGame.values.every(Boolean)){finishSudoku();return;}
  $('#sudokuMessage').textContent=first>=0?'有几个数字需要再检查一下。':'继续填空格，快完成了。';
  renderSudoku();
}
function startSudokuClock() {
  clearInterval(sudokuClock);
  sudokuClock=setInterval(()=>{if(sudokuGame&&!sudokuGame.complete&&activeGame==='sudoku'){$('#sudokuTimer').textContent=formatClock(Date.now()-sudokuGame.startedAt);}},1000);
}
function pauseSudokuClock(){clearInterval(sudokuClock);}
function formatClock(ms) {const seconds=Math.floor(ms/1000);return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
async function finishSudoku() {
  if(sudokuGame.complete)return;sudokuGame.complete=true;clearInterval(sudokuClock);
  $('#sudokuMessage').textContent=`完成！用时 ${formatClock(Date.now()-sudokuGame.startedAt)}。新题会重新随机生成。`;
  $('#sudokuClues').textContent=`${DIFFICULTY_LABELS[sudokuDifficulty]} · 已完成`;
  await awardPuzzle('sudoku');
}
async function awardPuzzle(kind) {
  try{const result=await api('/game/reward',{method:'POST',body:JSON.stringify({game:kind})});if(result.profile){state.profile={...state.profile,...result.profile};renderProfile();toast(`闯关完成，获得 ${result.reward} 积分！`);}else toast(result.message||'完成啦！');}
  catch(e){toast('成绩已完成，积分同步失败。');}
}

function configureArcadeAddon(kind) {
  document.querySelectorAll('.game-tab').forEach(button=>button.classList.toggle('active',button.dataset.game===kind));
  const panel=$('.game-console');panel.classList.remove('mode-sudoku','mode-maze','mode-mines');panel.classList.add(`mode-${kind}`);
  $('#gameName').textContent={sudoku:'数独挑战',maze:'暗夜迷宫',mines:'扫雷行动'}[kind];
  $('#gameStart').textContent=kind==='sudoku'?'新开一题':kind==='maze'?'开始迷宫':'新开一局';
  $('#gameAction').style.display=kind==='mines'?'inline-block':'none';
  $('#mazeFullscreen').style.display=kind==='maze'?'inline-block':'none';
  $('#gameInfoText').textContent=kind==='sudoku'?'随机生成唯一解数独。选难度，填满 9×9 棋盘。':kind==='maze'?'在黑暗迷宫中探索，手电光随团团移动。抵达绿色出口即可过关。':'经典扫雷规则：10 × 10 雷区共 15 颗地雷，数字表示周围地雷数，右键或触屏切换插旗。';
  $('#gameMission').innerHTML=kind==='sudoku'?'<b>玩法 · 数独挑战</b><span>每题随机生成且保证唯一解。选择空格后输入 1–9，完成棋盘即可通关。</span>':kind==='maze'?`<b>任务目标 · 暗夜迷宫 ${mazeStage} / 3</b><span>仅能看见手电照亮的区域。找到绿色出口，迷宫会逐关扩大。</span>`:'<b>玩法 · 扫雷行动</b><span>10 × 10 雷区有 15 颗地雷。标记全部地雷并翻开安全格；首次点击保证安全。</span>';
  $('#gameBest').textContent=kind==='sudoku'?`最近难度：${DIFFICULTY_LABELS[sudokuDifficulty]}`:kind==='maze'?`迷宫进度：第 ${mazeStage} / 3 关`:'雷区：10 × 10 · 15 颗地雷';
  if(kind==='sudoku')generateSudoku();
  if(kind==='maze'){drawMazePreview();$('#gameHints').textContent='方向键 / WASD 点按走一格，按住连续移动 · 触屏方向键 · 找到出口';$('#gameScore').textContent=`第 ${mazeStage} 关 · 找到出口`;}
  if(kind==='mines'){mineFlagMode=false;$('#gameAction').textContent='🚩 插旗模式：关';$('#gameHints').textContent='点击翻格 · 右键插旗 · 触屏可切换插旗模式';startMines();}
  if(kind==='sudoku'){$('#gameScore').textContent='9 × 9 · 每题唯一解';}
}
function startArcadeAddon(kind) {
  if(kind==='sudoku'){generateSudoku();return;}
  if(kind==='mines'){startMines();return;}
  if(kind==='maze')startMaze();
}

const MAZE_UNIT=16;
let lastMazeSignature='';
function buildMaze(level) {
  const cols=[15,19,23][level-1],rows=[7,9,11][level-1],width=cols*2+1,height=rows*2+1;
  const grid=Array.from({length:height},()=>Array(width).fill(1)),visited=Array.from({length:rows},()=>Array(cols).fill(false)),stack=[[0,0]];
  visited[0][0]=true;grid[1][1]=0;
  while(stack.length){const [r,c]=stack[stack.length-1],neighbors=shuffled([[r-1,c],[r+1,c],[r,c-1],[r,c+1]]).filter(([nr,nc])=>nr>=0&&nr<rows&&nc>=0&&nc<cols&&!visited[nr][nc]);if(!neighbors.length){stack.pop();continue;}const [nr,nc]=neighbors[0];visited[nr][nc]=true;grid[nr*2+1][nc*2+1]=0;grid[r+nr+1][c+nc+1]=0;stack.push([nr,nc]);}
  return {grid,cols,rows,width,height,offsetX:(800-width*MAZE_UNIT)/2,offsetY:(420-height*MAZE_UNIT)/2,start:{x:(1.5)*MAZE_UNIT,y:(1.5)*MAZE_UNIT},exit:{x:(width-1.5)*MAZE_UNIT,y:(height-1.5)*MAZE_UNIT}};
}
function generateMaze(level){let maze,signature;do{maze=buildMaze(level);signature=maze.grid.map(row=>row.join('')).join('');}while(signature===lastMazeSignature);lastMazeSignature=signature;return maze;}
function mazeLevelOffset(){return {x:(800-mazeSession.width*MAZE_UNIT)/2,y:(420-mazeSession.height*MAZE_UNIT)/2};}
function mazeWallAt(x,y){const c=Math.floor(x/MAZE_UNIT),r=Math.floor(y/MAZE_UNIT);return r<0||c<0||r>=mazeSession.height||c>=mazeSession.width||mazeSession.grid[r][c]===1;}
function stepMaze(direction){if(activeGame!=='maze'||!gameRunning||!mazeSession)return;const delta={ArrowUp:[0,-MAZE_UNIT],ArrowDown:[0,MAZE_UNIT],ArrowLeft:[-MAZE_UNIT,0],ArrowRight:[MAZE_UNIT,0]}[direction];if(!delta)return;const x=game.x+delta[0],y=game.y+delta[1];if([[x-5,y-5],[x+5,y-5],[x-5,y+5],[x+5,y+5]].every(([px,py])=>!mazeWallAt(px,py))){game.x=x;game.y=y;game.moves++;drawMazeScene(true);}}
function drawMazeScene(lit=true) {
  const maze=mazeSession,o=mazeLevelOffset();ctx.fillStyle='#03060b';ctx.fillRect(0,0,800,420);
  for(let r=0;r<maze.height;r++)for(let c=0;c<maze.width;c++){const wall=maze.grid[r][c]===1,x=o.x+c*MAZE_UNIT,y=o.y+r*MAZE_UNIT;ctx.fillStyle=wall?'#46515e':'#111b27';ctx.fillRect(x,y,MAZE_UNIT,MAZE_UNIT);if(wall){ctx.fillStyle='#55616e';ctx.fillRect(x,y,MAZE_UNIT,2);ctx.fillStyle='#35404b';ctx.fillRect(x,y+MAZE_UNIT-2,MAZE_UNIT,2);}}
  const ex=o.x+maze.exit.x,ey=o.y+maze.exit.y,pulse=.7+Math.sin(gameFrame*.1)*.15;
  ctx.fillStyle=`rgba(92,236,168,${pulse})`;ctx.beginPath();ctx.arc(ex,ey,7,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#88ffbd';ctx.lineWidth=2;ctx.beginPath();ctx.arc(ex,ey,12+Math.sin(gameFrame*.08)*2,0,Math.PI*2);ctx.stroke();
  const px=o.x+game.x,py=o.y+game.y;
  ctx.fillStyle='#ffdc87';ctx.beginPath();ctx.arc(px,py,7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff5d7';ctx.beginPath();ctx.arc(px-2,py-2,2,0,Math.PI*2);ctx.fill();
  if(lit){const radius=142+Math.sin(gameFrame*.06)*4;ctx.save();ctx.fillStyle='rgba(0,0,0,.965)';ctx.beginPath();ctx.rect(0,0,800,420);ctx.arc(px,py,radius,0,Math.PI*2);ctx.fill('evenodd');ctx.restore();const glow=ctx.createRadialGradient(px,py,0,px,py,radius*.78);glow.addColorStop(0,'rgba(255,225,156,.30)');glow.addColorStop(.72,'rgba(255,225,156,.12)');glow.addColorStop(1,'rgba(255,225,156,0)');ctx.save();ctx.globalCompositeOperation='screen';ctx.fillStyle=glow;ctx.beginPath();ctx.arc(px,py,radius*.78,0,Math.PI*2);ctx.fill();ctx.restore();}
}
function drawMazePreview() {
  mazeStage=Math.max(1,Math.min(3,mazeStage));mazeSession=generateMaze(mazeStage);game={x:mazeSession.start.x,y:mazeSession.start.y};gameFrame=0;drawMazeScene(true);ctx.fillStyle='#f2e9d2';ctx.font='16px sans-serif';ctx.textAlign='center';ctx.fillText(`第 ${mazeStage} 关 · 点击“开始迷宫”点亮手电`,400,22);ctx.textAlign='left';
}
function startMaze() {
  cancelAnimationFrame(animationId);
  mazeStage=Math.max(1,Math.min(3,mazeStage));if(!mazeSession)mazeSession=generateMaze(mazeStage);game={x:mazeSession.start.x,y:mazeSession.start.y,mazeLevel:mazeStage,tick:0,moves:0,bumpCooldown:0};gameRunning=true;gameFrame=0;lastFrameAt=0;updateAccumulator=0;keysDown.clear();
  $('#gameResult').textContent='';$('#gameStart').textContent='重新开始';$('#gameScore').textContent=`第 ${mazeStage} 关 · 0:00 · 找到出口`;animationId=requestAnimationFrame(tickGame);
}
function updateMaze() {
  game.tick++;let dx=0,dy=0;if(keysDown.has('ArrowUp'))dy=-1.5;if(keysDown.has('ArrowDown'))dy=1.5;if(keysDown.has('ArrowLeft'))dx=-1.5;if(keysDown.has('ArrowRight'))dx=1.5;
  const o=mazeLevelOffset();let moved=false;
  if(dx&&!mazeWallAt(game.x+dx+Math.sign(dx)*5,game.y-5)&&!mazeWallAt(game.x+dx+Math.sign(dx)*5,game.y+5)){game.x+=dx;moved=true;}
  if(dy&&!mazeWallAt(game.x-5,game.y+dy+Math.sign(dy)*5)&&!mazeWallAt(game.x+5,game.y+dy+Math.sign(dy)*5)){game.y+=dy;moved=true;}
  if(moved)game.moves++;if(game.bumpCooldown>0)game.bumpCooldown--;
  else if((dx||dy)&&!moved){game.bumpCooldown=12;gameSound(150,.03);}
  drawMazeScene(true);$('#gameScore').textContent=`第 ${game.mazeLevel} 关 · ${formatClock(game.tick*1000/60)} · ${game.moves} 步`;
  const ex=mazeSession.exit.x,ey=mazeSession.exit.y;if(Math.hypot(game.x-ex,game.y-ey)<9){mazeStage=game.mazeLevel>=3?1:game.mazeLevel+1;localStorage.setItem('fufu-maze-stage',String(mazeStage));$('#gameMission').innerHTML=`<b>迷宫完成</b><span>${game.mazeLevel>=3?'三关全部通过！':'出口找到了，下一关会更大。'} ${game.moves} 步，用时 ${formatClock(game.tick*1000/60)}。</span>`;endGame(true);mazeSession=generateMaze(mazeStage);game={x:mazeSession.start.x,y:mazeSession.start.y};gameFrame=0;drawMazeScene(true);$('#gameScore').textContent=`下一关：第 ${mazeStage} / 3 关 · 新地图已生成`;$('#gameStart').textContent=`进入第 ${mazeStage} 关`;}
}

const MINE_COLS=10,MINE_ROWS=10,MINE_COUNT=15;
function startMines() {
  mineFlagMode=false;mineGame={cells:Array.from({length:MINE_ROWS*MINE_COLS},()=>({mine:false,open:false,flag:false,count:0})),first:true,over:false,won:false,opened:0,startedAt:Date.now(),flags:0};
  for(const i of shuffled(Array.from({length:mineGame.cells.length},(_,n)=>n)).slice(0,MINE_COUNT))mineGame.cells[i].mine=true;
  countMineNeighbors();$('#gameAction').textContent='🚩 插旗模式：关';$('#gameStart').textContent='重新开始';$('#gameScore').textContent=`地雷 ${MINE_COUNT} · 已插旗 0`;$('#gameResult').textContent='先点一个格子，第一次点击保证安全。';drawMines();
}
function countMineNeighbors(){for(let r=0;r<MINE_ROWS;r++)for(let c=0;c<MINE_COLS;c++){const cell=mineGame.cells[r*MINE_COLS+c];cell.count=0;for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){const nr=r+dr,nc=c+dc;if(nr>=0&&nr<MINE_ROWS&&nc>=0&&nc<MINE_COLS&&mineGame.cells[nr*MINE_COLS+nc].mine)cell.count++;}}}
function fitMinesBoard(){const board=$('#minesBoard'),size=board?.getBoundingClientRect().width;if(size>0)board.style.height=`${size}px`;}
function drawMinesPreview(){$('#minesBoard').innerHTML=Array.from({length:MINE_COLS*MINE_ROWS},()=>'<button class="mine-cell covered" tabindex="-1"></button>').join('');fitMinesBoard();}
function drawMines(){
  if(!mineGame)return;const colors=['','#3972a1','#438363','#c25f50','#775da1','#ac713d','#348a8a','#45545b','#30373d'];
  $('#minesBoard').innerHTML=mineGame.cells.map((cell,i)=>`<button class="mine-cell ${cell.open?'open':'covered'} ${cell.mine&&cell.open?'exploded':''} ${cell.flag?'flagged':''}" data-mine="${i}" aria-label="格子 ${i+1}${cell.open?cell.mine?'，地雷':`，${cell.count||'空白'}`:cell.flag?'，已插旗':'，未翻开'}">${cell.flag?'⚑':cell.open?cell.mine?'✹':cell.count?`<span style="color:${colors[cell.count]}">${cell.count}</span>`:'' :''}</button>`).join('');
  fitMinesBoard();
  $('#gameScore').textContent=`地雷 ${MINE_COUNT} · 已插旗 ${mineGame.flags} · 安全格 ${mineGame.opened}/${MINE_COLS*MINE_ROWS-MINE_COUNT}`;
}
function toggleMineFlag(r,c){if(!mineGame||mineGame.over)return;const cell=mineGame.cells[r*MINE_COLS+c];if(cell.open)return;cell.flag=!cell.flag;mineGame.flags+=cell.flag?1:-1;gameSound(cell.flag?460:300,.04);drawMines();}
function revealMine(r,c){
  if(!mineGame||mineGame.over)return;
  let i=r*MINE_COLS+c,cell=mineGame.cells[i];if(cell.open||cell.flag)return;
  if(mineGame.first){mineGame.first=false;if(cell.mine){cell.mine=false;const safe=mineGame.cells.findIndex(x=>!x.mine&&x!==cell);if(safe>=0)mineGame.cells[safe].mine=true;countMineNeighbors();}}
  const queue=[i];while(queue.length){const current=queue.pop(),tile=mineGame.cells[current];if(tile.open||tile.flag||tile.mine)continue;tile.open=true;mineGame.opened++;if(tile.count===0){const rr=Math.floor(current/MINE_COLS),cc=current%MINE_COLS;for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){const nr=rr+dr,nc=cc+dc;if(nr>=0&&nr<MINE_ROWS&&nc>=0&&nc<MINE_COLS){const next=nr*MINE_COLS+nc;if(!mineGame.cells[next].open&&!mineGame.cells[next].mine)queue.push(next);}}}}
  if(cell.mine){mineGame.over=true;mineGame.cells.forEach(x=>{if(x.mine)x.open=true;});$('#gameResult').textContent='踩到地雷了！记住数字提示，再来一局。';gameSound(120,.24);drawMines();return;}
  gameSound(520,.035);drawMines();if(mineGame.opened>=MINE_COLS*MINE_ROWS-MINE_COUNT){mineGame.over=true;mineGame.won=true;$('#gameResult').textContent='雷区已安全清理！';awardPuzzle('mines');}
}

function initArcadePuzzles(){
  document.querySelectorAll('[data-difficulty]').forEach(button=>button.addEventListener('click',()=>{sudokuDifficulty=button.dataset.difficulty;document.querySelectorAll('[data-difficulty]').forEach(b=>b.classList.toggle('active',b===button));if(activeGame==='sudoku')generateSudoku();}));
  document.querySelector('#sudokuBoard').addEventListener('click',e=>{const cell=e.target.closest('[data-cell]');if(cell)selectSudokuCell(Number(cell.dataset.cell));});
  document.querySelector('#sudokuPad').innerHTML=Array.from({length:9},(_,i)=>`<button data-digit="${i+1}">${i+1}</button>`).join('');
  document.querySelectorAll('[data-digit]').forEach(button=>button.addEventListener('click',()=>enterSudokuValue(Number(button.dataset.digit))));
  $('#sudokuErase').addEventListener('click',()=>enterSudokuValue(0));$('#sudokuCheck').addEventListener('click',checkSudoku);$('#sudokuNew').addEventListener('click',generateSudoku);
  document.querySelector('#sudokuBoard').addEventListener('keydown',e=>{if(e.key>='1'&&e.key<='9')enterSudokuValue(Number(e.key));if(e.key==='Backspace'||e.key==='Delete')enterSudokuValue(0);});
  document.addEventListener('keydown',e=>{if(activeGame!=='sudoku'||!$('#page-arcade').classList.contains('active'))return;if(e.key>='1'&&e.key<='9'){e.preventDefault();enterSudokuValue(Number(e.key));}else if(e.key==='Backspace'||e.key==='Delete'){e.preventDefault();enterSudokuValue(0);}else if(e.key.startsWith('Arrow')&&sudokuGame){e.preventDefault();const delta=e.key==='ArrowUp'?-9:e.key==='ArrowDown'?9:e.key==='ArrowLeft'?-1:1;const next=Math.max(0,Math.min(80,sudokuGame.selected+delta));selectSudokuCell(next);}});
  $('#mazeFullscreen').addEventListener('click',async()=>{const target=$('.game-console');try{if(document.fullscreenElement)await document.exitFullscreen();else await target.requestFullscreen();}catch(_){toast('当前浏览器暂不支持全屏');}});
  document.addEventListener('fullscreenchange',()=>{$('#mazeFullscreen').textContent=document.fullscreenElement?'⤢ 退出全屏':'⛶ 全屏';});
  $('#minesBoard').addEventListener('pointerdown',e=>{const cell=e.target.closest('[data-mine]');if(!cell||activeGame!=='mines')return;e.preventDefault();const i=Number(cell.dataset.mine),r=Math.floor(i/MINE_COLS),c=i%MINE_COLS;if(e.button===2||mineFlagMode)toggleMineFlag(r,c);else revealMine(r,c);});
  $('#minesBoard').addEventListener('contextmenu',e=>e.preventDefault());
  window.addEventListener('resize',fitMinesBoard);
  $('#gameAction').addEventListener('pointerdown',e=>{if(activeGame==='mines'){e.preventDefault();mineFlagMode=!mineFlagMode;$('#gameAction').textContent=`🚩 插旗模式：${mineFlagMode?'开':'关'}`;}});
  document.querySelectorAll('[data-difficulty]').forEach(button=>button.classList.toggle('active',button.dataset.difficulty===sudokuDifficulty));
}
initArcadePuzzles();

setGame('sudoku');
