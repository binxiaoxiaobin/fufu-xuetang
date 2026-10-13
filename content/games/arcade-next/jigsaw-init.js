// Independent boards for each photograph and difficulty; migrate the original board.
window.FufuPuzzle={state,paused:false};
const saveKey='open-jigsaw.save.v1';
let boards={},loadingPuzzle=false,galleryWasPaused=false;
const difficulty=document.querySelector('#difficulty');
document.querySelector('header strong').insertAdjacentHTML('afterend','<button id="choose-picture">选择图片</button>');
document.body.insertAdjacentHTML('beforeend','<dialog id="picture-gallery" aria-labelledby="gallery-title"><div class="gallery-heading"><div><h2 id="gallery-title">选一张喜欢的图片</h2><p>16 张风景，每张都有三档难度，进度分别保存。</p></div><button id="close-gallery">返回拼图</button></div><div class="picture-grid"></div></dialog>');
const galleryDialog=document.querySelector('#picture-gallery');
for(const item of gallery){
 const button=document.createElement('button');button.className='picture-card';button.dataset.picture=item.id;
 const image=document.createElement('img');image.src=item.thumb;image.alt=item.title;image.loading='lazy';image.width=240;image.height=160;
 const label=document.createElement('b');label.textContent=item.title;
 const status=document.createElement('span');status.className='picture-progress';
 button.append(image,label,status);button.onclick=async()=>{galleryDialog.close();await switchPuzzle(item.id,Number(difficulty.value));};
 document.querySelector('.picture-grid').append(button);
}
function boardKey(pic){return pic.id+':'+pic.rows;}
function snapshot(){return {pictureId:state.picture.id,grid:state.picture.rows,phase:state.phase,pieces:state.pieces.map(p=>({id:p.id,x:p.current.x,y:p.current.y,correct:p.isCorrect}))};}
function savePuzzle(){
 if(!state.picture||loadingPuzzle)return;
 const saved=snapshot();boards[boardKey(state.picture)]=saved;
 learnerStorage.setItem(saveKey,JSON.stringify({...saved,version:2,boards}));
}
window.fufuBeforeClose=savePuzzle;
function title(){setTitle(`${state.picture.title} · ${state.picture.rows**2} 块 · `+(state.phase===Phase.completed?'拼图完成，做得好！':state.phase===Phase.initial?'点击开始拼图':`还剩 ${getIncorrectPieceCount()} 块，继续加油！`));}
function resize(){const area=document.querySelector('#stage');if(!cv.width)return;const scale=Math.min(area.clientWidth/cv.width,area.clientHeight/cv.height);cv.style.width=cv.width*scale+'px';cv.style.height=cv.height*scale+'px';}
new ResizeObserver(resize).observe(document.querySelector('#stage'));
function pause(value){window.FufuPuzzle.paused=value;state.draggingIndex=null;document.querySelector('#pause').textContent=value?'继续':'暂停';if(value)savePuzzle();}
function controls(value){for(const id of ['difficulty','choose-picture','start','preview'])document.getElementById(id).disabled=!value;}
function showPictureInfo(){
 difficulty.value=state.picture.rows;
 const img=document.querySelector('#reference img');img.src=state.picture.reference;img.alt='完整图片：'+state.picture.title;
 const footer=document.querySelector('#div_credit');footer.replaceChildren();
 footer.append('拖动图块拼出完整图片，每张图、每档难度分别保存进度。',document.createElement('br'));
 const source=document.createElement('a');source.href=state.picture.source;source.target='_blank';source.rel='noreferrer';source.textContent=state.picture.title+' · '+state.picture.author;
 const license=document.createElement('a');license.href=state.picture.licenseUrl;license.target='_blank';license.rel='noreferrer';license.textContent=state.picture.license;
 const credits=document.createElement('a');credits.href='PICTURE-CREDITS.json';credits.target='_blank';credits.textContent='全部图片来源';
 footer.append(source,' · ',license,' · ',credits);
}
function restore(saved,pic){
 if(!saved||!Array.isArray(saved.pieces)||saved.pieces.length!==pic.rows*pic.cols||new Set(saved.pieces.map(p=>p?.id)).size!==saved.pieces.length||!saved.pieces.every(p=>p&&Number.isInteger(p.id)&&p.id>=0&&p.id<saved.pieces.length&&Number.isFinite(p.x)&&Number.isFinite(p.y)))return;
 const original=new Map(state.pieces.map(p=>[p.id,p]));
 state.pieces=saved.pieces.map(row=>{const p=original.get(row.id);p.isCorrect=row.correct===true;p.current=p.isCorrect?{...p.correct}:{x:Math.max(0,Math.min(cv.width-p.w,row.x)),y:Math.max(0,Math.min(cv.height-p.h,row.y))};return p;});
 state.phase=state.pieces.every(p=>p.isCorrect)?Phase.completed:saved.phase===Phase.playing?Phase.playing:Phase.initial;
}
async function switchPuzzle(id,grid){
 if(loadingPuzzle)return;
 const pic=pictures.find(p=>p.id===id&&p.rows===grid)||pictures[0];
 savePuzzle();const previous={picture:state.picture,pieces:state.pieces,phase:state.phase},wasPaused=FufuPuzzle.paused;
 loadingPuzzle=true;controls(false);pause(true);setTitle('正在读取 '+pic.title+'…');
 try{
  resizeCanvasToPuzzle(pic);await loadPieces(pic);state.phase=Phase.initial;restore(boards[boardKey(pic)],pic);
  showPictureInfo();resize();title();loadingPuzzle=false;pause(false);savePuzzle();
 }catch(error){
  if(previous.picture){Object.assign(state,previous);resizeCanvasToPuzzle(previous.picture);showPictureInfo();resize();}
  loadingPuzzle=false;pause(wasPaused);setTitle('图片加载失败，请重新选择：'+error.message);
 }finally{loadingPuzzle=false;controls(true);}
}
document.querySelector('#choose-picture').onclick=()=>{
 galleryWasPaused=FufuPuzzle.paused;pause(true);
 for(const button of document.querySelectorAll('[data-picture]')){
  button.setAttribute('aria-pressed',String(button.dataset.picture===state.picture.id));
  button.querySelector('.picture-progress').textContent=[3,4,5].map(n=>{const b=boards[button.dataset.picture+':'+n];return n*n+' 块'+(b?.phase===Phase.completed?' ✓':b?.phase===Phase.playing?' · 进行中':'');}).join(' / ');
 }
 galleryDialog.showModal();
};
document.querySelector('#close-gallery').onclick=()=>{galleryDialog.close();pause(galleryWasPaused);};
galleryDialog.addEventListener('cancel',()=>pause(galleryWasPaused));
document.querySelector('#pause').onclick=()=>pause(!FufuPuzzle.paused);
document.querySelector('#preview').onclick=()=>{pause(true);document.querySelector('#reference').hidden=false;};
document.querySelector('#dismiss').onclick=()=>{document.querySelector('#reference').hidden=true;pause(false);};
document.querySelector('#exit').onclick=()=>closeGame();
window.addEventListener('fufu-game-close',()=>pause(true));window.addEventListener('fufu-game-reopen',()=>pause(false));document.addEventListener('visibilitychange',()=>{if(document.hidden)pause(true);});
for(const event of ['pointercancel','lostpointercapture'])cv.addEventListener(event,()=>{state.draggingIndex=null;savePuzzle();});
document.querySelector('#start').onclick=()=>{if(state.phase===Phase.playing&&!confirm('重新打乱会清除这张图在当前难度下的进度，确定吗？'))return;shufflePieces();state.phase=Phase.playing;pause(false);title();savePuzzle();};
difficulty.onchange=()=>switchPuzzle(state.picture.id,Number(difficulty.value));
controls(false);
(async()=>{
 try{
  await initialize();const saved=JSON.parse(learnerStorage.getItem(saveKey)||'{}');
  boards=saved.boards&&typeof saved.boards==='object'&&!Array.isArray(saved.boards)?saved.boards:{};
  const pic=pictures.find(p=>p.id===(saved.pictureId||'snow-forest')&&p.rows===saved.grid)||pictures[0];
  if(!saved.boards&&Array.isArray(saved.pieces))boards[boardKey(pic)]={...saved,pictureId:pic.id};
  resizeCanvasToPuzzle(pic);await loadPieces(pic);restore(boards[boardKey(pic)],pic);showPictureInfo();resize();title();controls(true);
  requestAnimationFrame(frame);report('fufu-toy-ready','拼图进度已读取');
 }catch(error){setTitle('拼图读取失败，请重新打开：'+error.message);report('fufu-toy-error',error.message);}
})();
