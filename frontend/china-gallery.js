// Province postcards: local photographs, keyboard navigation and a full-screen viewer.
(() => {
  const style = document.createElement('style');
  style.textContent = `
  .province-gallery{margin:16px 0 20px;min-width:0}
  .province-gallery-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:9px;color:#496357;font-size:12px;font-weight:800}
  .province-gallery-count{font-size:11px;font-weight:600;color:#7a877e}
  .province-photo-frame{position:relative;overflow:hidden;border-radius:16px;background:#e6ece6;aspect-ratio:4/3}
  .province-photo-open{display:block;width:100%;height:100%;border:0;padding:0;background:none;cursor:zoom-in}
  .province-photo-open img{display:block;width:100%;height:100%;object-fit:cover;transition:transform .3s}
  .province-photo-open:hover img{transform:scale(1.025)}
  .province-photo-hint{position:absolute;bottom:12px;right:12px;border-radius:20px;padding:5px 10px;color:white;background:#183e36a8;font-size:11px;pointer-events:none}
  .province-photo-arrow{position:absolute;top:calc(50% - 18px);width:36px;height:36px;border:1px solid #ffffff75;border-radius:50%;background:#ffffffe8;color:#264a3e;font-size:22px;cursor:pointer}
  .province-photo-arrow.prev{left:10px}.province-photo-arrow.next{right:10px}
  .province-photo-thumbs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:10px 0}
  .province-photo-thumb{padding:3px;border:2px solid transparent;border-radius:11px;background:#f3f5ef;color:#526958;font:inherit;font-size:10px;cursor:pointer;text-align:left}
  .province-photo-thumb img{display:block;width:100%;height:58px;object-fit:cover;border-radius:7px;margin-bottom:4px}
  .province-photo-thumb span{display:block;padding:0 3px 3px;line-height:1.4}
  .province-photo-thumb[aria-pressed=true]{border-color:#d7a440;background:#fff4d8}
  .province-photo-caption h4{margin:12px 0 5px;color:#294d40;font-size:16px}.province-photo-caption p{margin:0;font-size:12px;line-height:1.75;color:#69786c}
  .province-photo-credit{margin-top:10px;color:#889086;font-size:10px;line-height:1.7;overflow-wrap:anywhere}.province-photo-credit summary{cursor:pointer}.province-photo-credit a{color:#597566}
  .province-photo-dialog{width:min(1100px,94vw);max-width:94vw;max-height:94dvh;box-sizing:border-box;border:0;border-radius:22px;padding:18px;background:#fcfdf8;color:#294d40;box-shadow:0 30px 100px #0005}
  .province-photo-dialog::backdrop{background:#152c28d9;backdrop-filter:blur(5px)}
  .province-dialog-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;font-size:14px;font-weight:800}
  .province-dialog-head button,.province-dialog-actions button{border:1px solid #cdd9cf;border-radius:20px;padding:8px 14px;background:#eef3ec;color:#315747;font:inherit;font-size:12px;cursor:pointer}
  .province-photo-dialog img{display:block;width:100%;height:min(64dvh,680px);object-fit:contain;background:#e8eee7;border-radius:12px}
  .province-dialog-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px}.province-dialog-actions span{font-size:12px}
  .province-photo-dialog p{font-size:12px;margin:10px 0 0;line-height:1.7}
  @media(max-width:600px){.province-photo-dialog{padding:12px}.province-photo-dialog img{height:54dvh}.province-photo-thumb img{height:64px}}
  `;
  document.head.append(style);
  const el = (tag, className, text) => { const item=document.createElement(tag);if(className)item.className=className;if(text)item.textContent=text;return item; };
  function button(text, className, handler, label) {
    const item=el('button',className,text);item.type='button';if(label)item.setAttribute('aria-label',label);item.addEventListener('click',handler);return item;
  }
  function create(info, catalog) {
    const available=Array.isArray(catalog);
    const photos=(catalog || []).filter(Boolean);
    const section=el('section','province-gallery');section.setAttribute('aria-label',`${info.name}风景相册`);
    if(!photos.length){section.append(el('p','',available?'这个地方的实景照片还在整理中。':'正在读取实景照片…'));return section;}
    let index=0;
    const top=el('div','province-gallery-top');const count=el('span','province-gallery-count');top.append(el('span','','三张明信片 · 认识这里'),count);
    const frame=el('div','province-photo-frame');const photo=el('img');photo.decoding='async';
    const open=button('','province-photo-open',()=>{sync();dialog.showModal();},'放大查看风景照片');open.append(photo);
    frame.append(open,el('span','province-photo-hint','⤢ 放大看'),button('‹','province-photo-arrow prev',()=>show(index-1),'上一张照片'),button('›','province-photo-arrow next',()=>show(index+1),'下一张照片'));
    const thumbs=el('div','province-photo-thumbs');
    const thumbButtons=photos.map((item,i)=>{const thumb=button('','province-photo-thumb',()=>show(i),`查看${item.label}`);const image=el('img');image.src=item.file;image.alt='';image.loading='lazy';thumb.append(image,el('span','',item.label));thumbs.append(thumb);return thumb;});
    const caption=el('div','province-photo-caption');const title=el('h4');const description=el('p');caption.append(title,description);
    const credit=el('details','province-photo-credit');const creditBody=el('div');credit.append(el('summary','','照片来源与署名'),creditBody);
    const dialog=el('dialog','province-photo-dialog');dialog.setAttribute('aria-label',`${info.name}风景照片放大查看`);
    const dialogHead=el('div','province-dialog-head');const dialogTitle=el('span');dialogHead.append(dialogTitle,button('✕ 关闭','',()=>dialog.close(),'关闭照片查看'));
    const fullPhoto=el('img');const fullCaption=el('p');const dialogActions=el('div','province-dialog-actions');const fullCount=el('span');dialogActions.append(button('← 上一张','',()=>show(index-1),'上一张放大照片'),fullCount,button('下一张 →','',()=>show(index+1),'下一张放大照片'));dialog.append(dialogHead,fullPhoto,dialogActions,fullCaption);
    dialog.addEventListener('keydown',event=>{if(event.key==='ArrowRight'){event.preventDefault();show(index+1);}if(event.key==='ArrowLeft'){event.preventDefault();show(index-1);}});
    photo.addEventListener('error',()=>{description.textContent='这张照片暂时没有载入，可以切换到另一张。';});
    function sync(){const item=photos[index];dialogTitle.textContent=`${info.name} · ${item.label}`;fullPhoto.src=item.file;fullPhoto.alt=item.label;fullCount.textContent=`${index+1} / ${photos.length}`;fullCaption.textContent=item.caption;}
    function show(next){index=(next+photos.length)%photos.length;const item=photos[index];photo.src=item.file;photo.alt=`${info.name} · ${item.label}`;count.textContent=`${index+1} / ${photos.length}`;title.textContent=item.label;description.textContent=item.caption;thumbButtons.forEach((thumb,i)=>thumb.setAttribute('aria-pressed',String(i===index)));creditBody.replaceChildren();const source=el('a','','原始照片');source.href=item.source;source.target='_blank';source.rel='noopener noreferrer';creditBody.append(source,document.createTextNode(` · ${item.author} · `));const license=el('a','',item.license);license.href=item.licenseUrl||item.source;license.target='_blank';license.rel='noopener noreferrer';creditBody.append(license);sync();}
    section.append(top,frame,thumbs,caption,credit,dialog);show(0);return section;
  }
  window.FufuProvinceGallery={create};
})();
