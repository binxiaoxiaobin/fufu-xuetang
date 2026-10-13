/* Live museum-style history cards; linked works reuse the existing readers. */
(() => {
  'use strict';
  let host=null,data=null,requestVersion=0,selected=null,lastFocus=null,storyOwned=false;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const api=async path=>{const r=await fetch(`${window.FUFU_API_BASE||''}/api${path}`,{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'内容暂时无法读取');return d;};
  let query='',group='',listScroll=0;
  function leave(){requestVersion++;host=null;selected=null;if(storyOwned){window.FufuStoryReader?.close();storyOwned=false;}}
  function lanes(p){
    if(!p.lanes?.length)return '';
    const start=Math.min(...p.lanes.map(x=>x.start_year)),end=Math.max(...p.lanes.map(x=>x.end_year)),span=end-start;
    return `<section class="history-section"><div class="history-section-title"><span>01</span><h3>把时间放在一起看</h3></div><p class="history-caption">上下位置只为便于阅读；横向位置按年代排列，重叠表示同时存在。</p><div class="history-lanes">${p.lanes.map(x=>`<div class="history-lane"><div><b>${esc(x.name)}</b><small>${esc(x.dates)}</small></div><div class="history-lane-track"><span style="margin-left:${((x.start_year-start)/span*100).toFixed(2)}%;width:${Math.max(1,(x.end_year-x.start_year)/span*100).toFixed(2)}%"></span></div></div>`).join('')}</div></section>`;
  }
  function timeline(){
    if(!data.periods.length)return ''; 
    const colors=['#587a69','#ad8254','#7386a0','#957369','#73865e','#9b7755','#647c87'];
    const groups=[...new Set(data.periods.map(p=>p.group))];
    const draw=cols=>{
      const step=188,pad=76,rows=Math.ceil(data.periods.length/cols),height=pad*2+(rows-1)*step+50;
      const xs=Array.from({length:cols},(_,i)=>(cols===2?250:150)+i*(cols===2?500:700)/(cols-1));
      const points=data.periods.map((p,i)=>{const row=Math.floor(i/cols),col=i%cols;return {p,i,x:xs[row%2?cols-1-col:col],y:pad+row*step};});
      let path=`M ${points[0].x} ${points[0].y}`;
      for(let i=1;i<points.length;i++){
        const a=points[i-1],b=points[i];
        path+=a.y===b.y?` L ${b.x} ${b.y}`:` C ${a.x+(a.x>500?145:-145)} ${a.y}, ${b.x+(b.x>500?145:-145)} ${b.y}, ${b.x} ${b.y}`;
      }
      return `<div class="history-ribbon history-ribbon-${cols}" style="--ribbon-height:${height}px"><svg viewBox="0 0 1000 ${height}" preserveAspectRatio="none" aria-hidden="true"><path d="${path}" class="history-ribbon-shadow"/><path d="${path}" class="history-ribbon-line"/>${points.filter(x=>x.i%cols!==cols-1&&x.i<points.length-1).map(a=>`<path d="M ${a.x+(Math.floor(a.i/cols)%2?-(cols===2?250:115):(cols===2?250:115))} ${a.y-5} l ${Math.floor(a.i/cols)%2?-8:8} 5 l ${Math.floor(a.i/cols)%2?8:-8} 5" class="history-ribbon-arrow"/>`).join('')}</svg><ol aria-label="按时间顺序排列的朝代">${points.map(({p,i,x,y})=>{
        const year=p.start_year<0?`公元前${Math.abs(p.start_year)}年`:`公元${p.start_year}年`;
        return `<li style="left:${x/10}%;top:${y}px;--era-color:${colors[groups.indexOf(p.group)%colors.length]}"><button data-history-open="${esc(p.slug)}" aria-label="${esc(p.title)}，${esc(p.dates)}，打开朝代卡片"><span class="history-ribbon-year">${i<2?'约 ':''}${year}</span><span class="history-ribbon-dot"><span>${String(i+1).padStart(2,'0')}</span></span><span class="history-ribbon-label"><strong>${esc(p.title)}</strong><small>${esc(p.dates)}</small></span></button></li>`;
      }).join('')}</ol></div>`;
    };
    return `<section class="history-journey" aria-label="中华历史时间长线"><header><div><span class="history-eyebrow">中华文明 · 时间长卷</span><h3>沿着年份，走过千年</h3></div><span class="history-journey-tip">从左上出发，沿线向前 ↝</span></header><p class="history-journey-note">节点标记时代起始年份，曲线按顺序展开，间距不代表时长。并存时期合并成一个入口，点开可看各政权时间条。</p>${draw(4)}${draw(2)}<footer><span>本卷从夏代走到清末</span><b>1912年 · 清朝结束</b></footer></section>`;
  }
  function renderList(){
    if(!host||!data)return;
    selected=null;
    const groups=[...new Set(data.periods.map(p=>p.group))];
    host.innerHTML=`<div class="history-hub"><header class="history-intro"><div><span class="history-eyebrow">读懂时间 · 认识中国</span><h2>把朝代，串成一段旅程</h2><p>从一个时代，走向它的人物、诗词与故事。</p><div class="history-stats"><span><b>${data.periods.length}</b> 个时代</span><span><b>${data.periods.reduce((n,p)=>n+p.people_count,0)}</b> 位人物</span><span>朝代 · 事件 · 人物 · 作品</span></div></div><div class="history-intro-art" aria-hidden="true"><span>古</span><i>今</i><b>时间有顺序<br>文明有回响</b></div></header>${timeline()}<form class="history-search"><label class="sr-only" for="historySearch">搜索朝代、人物或事件</label><input id="historySearch" type="search" maxlength="80" placeholder="寻找朝代、人物或事件，比如：唐、李白、造纸" value="${esc(query)}"><button type="submit">寻找</button></form><nav class="history-filters" aria-label="历史主题分组"><button data-history-group="" aria-pressed="${!group}">全部时代</button>${groups.map(g=>`<button data-history-group="${esc(g)}" aria-pressed="${group===g}">${esc(g)}</button>`).join('')}</nav><details class="history-guide"><summary>先看顺序，再看并存</summary><p>夏 → 商 → 西周 → 东周（春秋战国）→ 秦 → 西汉 → 新 → 东汉 → 三国 → 两晋与南北朝 → 隋 → 唐 → 五代十国 → 宋辽夏金 → 元 → 明 → 清。</p><p>这是学习的主线，不是每个政权都依次替代的名单。打开三国、南北朝或宋辽夏金，可以看到并存时间条。</p></details><p class="history-results" role="status"></p><div class="history-grid"></div><footer class="history-library-note"><details><summary>这套卡片怎样整理</summary><p>${esc(data.scope)}</p><p>年份有不同口径时会注明；人物故事区分小传、史书轶事与后世传说。封面以朝代名称为主，参考书体风格；现代字体题名与古代原迹会区分说明。</p><ul>${data.sources.map(s=>`<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a> · ${esc(s.note)}</li>`).join('')}</ul></details></footer></div>`;
    const paint=()=>{
      const words=query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
      const rows=data.periods.filter(p=>(!group||p.group===group)&&words.every(w=>[p.title,p.tagline,p.summary,...p.people_names,...(p.event_titles||[])].join(' ').toLocaleLowerCase().includes(w)));
      host.querySelector('.history-results').textContent=`${rows.length===data.periods.length?'沿着时间，慢慢往前走':`找到 ${rows.length} 个时代`} · 点击卡片开始阅读`;
      host.querySelector('.history-grid').innerHTML=rows.length?rows.map(p=>`<article class="history-tile"><button data-history-open="${esc(p.slug)}"><div class="history-tile-art"><img src="${esc(p.image_path)}" alt="${esc(p.title)}的文字封面" width="720" height="480" loading="lazy"><span>${esc(p.group)}</span></div><div class="history-tile-copy"><small>${esc(p.dates)}</small><h3>${esc(p.title)}</h3><p>${esc(p.tagline)}</p><div class="history-tile-people">${p.people_names.map(n=>`<span>${esc(n)}</span>`).join('')}</div><footer>${p.event_count} 件代表事件 <b>走进这个时代 →</b></footer></div></button></article>`).join(''):'<div class="history-empty"><h3>还没找到这个词</h3><p>试试人物姓名或更短的关键词，也可以切换到全部时代。</p></div>';
      host.querySelectorAll('.history-grid [data-history-open]').forEach(b=>b.onclick=()=>{lastFocus=b;listScroll=window.scrollY;open(b.dataset.historyOpen);});
    };
    host.querySelector('form').onsubmit=e=>{e.preventDefault();query=host.querySelector('input').value.trim();paint();};
    host.querySelector('input').oninput=e=>{query=e.target.value;paint();};
    host.querySelectorAll('[data-history-group]').forEach(b=>b.onclick=()=>{group=b.dataset.historyGroup;host.querySelectorAll('[data-history-group]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));paint();});
    host.querySelectorAll('.history-journey [data-history-open]').forEach(b=>b.onclick=()=>{lastFocus=b;listScroll=window.scrollY;open(b.dataset.historyOpen);});
    paint();
  }
  async function open(slug){
    const version=++requestVersion,container=host;
    container.setAttribute('aria-busy','true');
    try{
      const p=await api('/learning/history/'+slug);
      if(version!==requestVersion||container!==host)return;
      selected=slug;
      const position=data.periods.findIndex(x=>x.slug===slug),prev=data.periods[position-1],next=data.periods[position+1];
      const linksFor=person=>p.links.filter(x=>x.person_slug===person.slug);
      container.innerHTML=`<div class="history-detail"><nav class="history-breadcrumb"><button data-history-back>← 返回时光轴</button><span>语文 / 朝代时光轴 / ${esc(p.title)}</span></nav><header class="history-era-hero"><img src="${esc(p.image_path)}" alt="${esc(p.title)}文字封面" width="720" height="480"><div><span class="history-eyebrow">${esc(p.group)}</span><h2 tabindex="-1">${esc(p.title)}</h2><p class="history-era-dates">${esc(p.dates)}</p><h3>${esc(p.tagline)}</h3><p>${esc(p.summary)}</p></div></header>${p.cover_note?`<details class="history-cover-note"><summary>封面书体 · ${esc(p.cover_script)}</summary><p>${esc(p.cover_note)}</p></details>`:''}<aside class="history-date-note"><b>年代小提示</b><p>${esc(p.note)}</p></aside>${lanes(p)}${p.related_cards?.length?`<section class="history-section"><h3>这个时代的战役与谋略</h3><p class="history-caption">计策按战例或阅读主题关联，不表示它们在这个时代成书。</p><div class="wisdom-associated">${p.related_cards.map(x=>`<button data-era-wisdom="${esc(x.slug)}" data-wisdom-kind="${esc(x.kind)}">${esc(x.title)}<span>${esc(x.dates)}</span> ↗</button>`).join('')}</div></section>`:''}<section class="history-section"><div class="history-section-title"><span>${p.lanes.length?'02':'01'}</span><h3>这个时代，发生了什么</h3></div><div class="history-events">${p.events.map(e=>`<article><small>${esc(e.date)}</small><h4>${esc(e.title)}</h4><p>${esc(e.description)}</p></article>`).join('')}</div></section><section class="history-section"><div class="history-section-title"><span>${p.lanes.length?'03':'02'}</span><h3>认识人物，再读他的故事</h3></div><div class="history-people">${p.people.map(x=>`<article class="history-person"><header><div class="history-person-seal" aria-hidden="true">${esc(x.name.slice(0,1))}</div><div><small>${esc(x.role)}</small><h4>${esc(x.name)}</h4></div><span class="history-evidence">${esc(x.evidence_kind)}</span></header><p>${esc(x.bio)}</p><p class="history-person-insight">${esc(x.contribution)}</p>${x.caution?`<p class="history-person-caution">${esc(x.caution)}</p>`:''}<div class="history-related">${linksFor(x).map(l=>`<button data-history-work="${l.content_kind}" data-work-id="${l.content_id}"><span class="history-work-symbol" aria-hidden="true">${l.content_kind==='poetry'?'诗':'读'}</span><span><small>${esc(l.relation_label)}${l.author&&!l.relation_label.includes(l.author)?' · '+esc(l.author):''}</small><b>${esc(l.title)}</b></span><i aria-hidden="true">↗</i></button>`).join('')}</div><details><summary>多想一想 · 资料线索</summary><p>${esc(x.reading)}</p><p class="history-person-source">${esc(x.source_note)}</p></details></article>`).join('')}</div></section><aside class="history-question"><small>把历史讲给朋友听</small><p>${esc(p.question)}</p></aside><details class="history-era-sources"><summary>本卡参考资料与内容说明</summary><p>知识介绍为原创白话内容；古典作品与后世故事在各自入口中区分标识。</p><ul>${data.sources.filter(s=>p.sources.includes(s.id)).map(s=>`<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a> · ${esc(s.note)}</li>`).join('')}</ul></details><nav class="history-next" aria-label="相邻时代"><button data-era="${esc(prev?.slug||'')}" ${prev?'':'disabled'}>← ${esc(prev?.title||'旅程起点')}</button><button data-history-back>回到全部时代</button><button data-era="${esc(next?.slug||'')}" ${next?'':'disabled'}>${esc(next?.title||'本册终点')} →</button></nav></div>`;
      container.querySelectorAll('[data-era-wisdom]').forEach(b=>b.onclick=()=>window.dispatchEvent(new CustomEvent('fufu-open-wisdom',{detail:{kind:b.dataset.wisdomKind,slug:b.dataset.eraWisdom}})));
      container.querySelectorAll('[data-history-back]').forEach(b=>b.onclick=()=>{renderList();window.scrollTo({top:listScroll});[...host.querySelectorAll(`[data-history-open="${slug}"]`)].find(b=>b.getClientRects().length)?.focus({preventScroll:true});});
      container.querySelectorAll('[data-era]').forEach(b=>b.onclick=()=>b.dataset.era&&open(b.dataset.era));
      container.querySelectorAll('[data-history-work]').forEach(b=>b.onclick=async()=>{
        lastFocus=b;b.disabled=true;
        try{
          if(b.dataset.historyWork==='poetry')await window.FufuReadingCards.open(b.dataset.workId);
          else{const story=await api('/stories/'+b.dataset.workId);if(version!==requestVersion)return;storyOwned=true;await window.FufuStoryReader.open(story);}
        }catch(error){window.toast?.(error.message);}
        finally{b.disabled=false;}
      });
      container.querySelector('h2').focus({preventScroll:true});container.scrollIntoView({block:'start',behavior:'auto'});
    }catch(error){if(version===requestVersion){window.toast?.(error.message);}}
    finally{if(container===host)container.removeAttribute('aria-busy');}
  }
  async function render(container,targetSlug=null){
    leave();host=container;query='';group='';const version=++requestVersion;
    host.innerHTML='<p class="history-loading" role="status">正在打开朝代时光轴…</p>';
    try{data=await api('/learning/history');if(version===requestVersion&&host===container){renderList();if(targetSlug)await open(targetSlug);}}
    catch(error){if(version===requestVersion){container.innerHTML=`<p role="status">${esc(error.message)}</p><button data-history-retry>重新打开</button>`;container.querySelector('button').onclick=()=>render(container);}}
  }
  window.addEventListener('fufu-story-closed',()=>{if(storyOwned){storyOwned=false;lastFocus?.focus({preventScroll:true});}});
  window.addEventListener('fufu-auth-changed',leave);
  window.FufuHistoryCards={render,leave,onNavigate:page=>{if(page==='cards'&&!host){const container=document.getElementById('historyCardsContent');if(container)render(container);}}};
})();
