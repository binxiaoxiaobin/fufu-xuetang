/* Battle narratives and classical stratagem reading, served live from MySQL. */
(()=>{'use strict';
 let host=null,items=[],periods=[],kind='battles',version=0,query='',group='',scroll=0;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const api=async p=>{const r=await fetch(`${window.FUFU_API_BASE||''}/api${p}`,{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'暂时无法读取');return d;};
 const name=k=>k==='battles'?'著名战役':'三十六计';
 function leave(){version++;host=null;}
 function bindLinks(){
   host.querySelectorAll('.wisdom-chapter-nav a').forEach(a=>a.onclick=e=>{e.preventDefault();const section=host.querySelector(a.getAttribute('href'));if(!section)return;section.scrollIntoView({block:'start'});const heading=section.querySelector('h3');if(heading){heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});}});
   host.querySelectorAll('[data-wisdom-open]').forEach(b=>b.onclick=()=>{scroll=window.scrollY;open(b.dataset.wisdomOpen);});
   host.querySelectorAll('[data-wisdom-era]').forEach(b=>b.onclick=()=>window.dispatchEvent(new CustomEvent('fufu-open-era',{detail:b.dataset.wisdomEra})));
 }
 function list(){
   const rows=items.filter(p=>p.kind===kind),groups=[...new Set(rows.map(p=>p.group))];
   host.innerHTML=`<div class="wisdom-hub"><header class="wisdom-hero"><img src="${kind==='battles'?'/assets/learning/history/battle-epic.png':'/assets/learning/history/strategy-epic.png'}" alt="${name(kind)}史诗风格主题想象图"><div><small>历史 · 人物 · 古文</small><h2>${kind==='battles'?'读一场战役，看一个时代':'三十六计，读懂古人的谋与势'}</h2><p>${kind==='battles'?'从战争的背景、过程与影响，认识人物的选择。':'六套谋略，三十六个名字。读原文、解字词，也思考条件与边界。'}</p><span>${rows.length} 张卡片 · 关联朝代时间线</span></div></header><p class="wisdom-art-note">主题图为AI生成的历史想象画面，不是战场复原或历史证据。适合8岁以上亲子共读。</p>${kind==='strategies'?'<aside class="wisdom-context">《三十六计》是后世汇集的谋略读物，成书与作者归属存在争议，本栏不把它署为孙武或檀道济的确定作品。计策名称与早期战例的关联，是帮助理解的后人分析。</aside>':''}<form class="wisdom-search"><label class="sr-only" for="wisdomSearch">搜索${name(kind)}、人物或年份</label><input id="wisdomSearch" type="search" value="${esc(query)}" placeholder="搜索名称、人物、年份或关键词"><button>寻找</button></form><nav class="history-filters" aria-label="${name(kind)}分类"><button data-wisdom-group="" aria-pressed="${!group}">全部</button>${groups.map(g=>`<button data-wisdom-group="${esc(g)}" aria-pressed="${g===group}">${esc(g)}</button>`).join('')}</nav><p data-wisdom-count role="status"></p><div class="wisdom-grid"></div></div>`;
   const paint=()=>{
     const matches=rows.filter(p=>(!group||p.group===group)&&[p.title,p.dates,p.summary,...p.people.map(x=>x.name)].join(' ').includes(query.trim()));
     host.querySelector('[data-wisdom-count]').textContent=`${matches.length} 张卡片 · 点开细读`;
     host.querySelector('.wisdom-grid').innerHTML=matches.length?matches.map(p=>`<button class="wisdom-tile${p.kind==='battles'?' wisdom-tile-illustrated':''}" data-wisdom-open="${esc(p.slug)}">${p.kind==='battles'?`<img class="wisdom-tile-image" src="${esc(p.image_path)}" alt="" loading="lazy" decoding="async" width="960" height="540">`:''}<small>${esc(p.dates)}</small><h3>${esc(p.title)}</h3><p>${esc(p.summary)}</p><span>${esc(p.people.map(x=>x.name).join(' · ')||p.group)}</span><b>读讲解与关联 →</b></button>`).join(''):'<p class="history-empty">没有找到，试试更短的关键词。</p>';
     bindLinks();
   };
   host.querySelector('form').onsubmit=e=>{e.preventDefault();paint();};
   host.querySelector('input').oninput=e=>{query=e.target.value;paint();};
   host.querySelectorAll('[data-wisdom-group]').forEach(b=>b.onclick=()=>{group=b.dataset.wisdomGroup;host.querySelectorAll('[data-wisdom-group]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));paint();});paint();
 }
 async function open(slug){
   const v=++version,container=host;
   try{
     const p=await api('/learning/history-wisdom/'+slug);if(v!==version||container!==host)return;
     const era=periods.filter(x=>p.period_slugs.includes(x.slug));
     // Include backlinks dynamically so administrator edits need no duplicate updates.
     const related=items.filter(x=>x.slug!==p.slug&&(p.related_slugs.includes(x.slug)||x.related_slugs.includes(p.slug)));
     const titles=p.kind==='battles'?(p.paragraphs.length===6?['时代背景','战前局势','关键进程','战局转折','结果与影响','怎样读懂这场战役']:['为什么会发生','战局怎样转变','影响留在了哪里']):['把计意说清楚','实例与阅读辨析'];
     host.innerHTML=`<article class="wisdom-detail"><nav class="history-breadcrumb"><button data-wisdom-back>← 返回${name(kind)}</button><span>语文 / ${name(p.kind)}</span></nav><header class="wisdom-detail-head"><small>${esc(p.dates)}${p.location?' · '+esc(p.location):''}</small><h2 tabindex="-1">${esc(p.title)}</h2><div class="wisdom-era-links">${era.map(e=>`<button data-wisdom-era="${esc(e.slug)}">时间线 · ${esc(e.title)} ↗</button>`).join('')}</div></header>${p.kind==='battles'?`<figure class="wisdom-battle-figure"><img src="${esc(p.image_path)}" alt="${esc(p.title)}主题插画" width="1600" height="900" fetchpriority="high" decoding="async"><figcaption>${esc(p.image_caption||'观察地形、队伍与行动路线。')}<span>AI史诗风格主题插画</span></figcaption></figure><p class="wisdom-art-note">画面是历史想象，用于辅助阅读，不是战场复原。</p><nav class="wisdom-chapter-nav" aria-label="战役阅读目录">${p.paragraphs.map((_,i)=>`<a href="#battle-section-${i}">${esc(titles[i]||'继续读一读')}</a>`).join('')}<a href="#battle-people">相关人物</a></nav>`:''}<div class="wisdom-reading">${p.paragraphs.map((text,i)=>`<section id="battle-section-${i}"><small>${String(i+1).padStart(2,'0')}</small><h3>${esc(titles[i]||'继续读一读')}</h3><p>${esc(text)}</p></section>`).join('')}${p.people.length?`<section id="battle-people"><small>人物档案</small><h3>战局中的人物</h3><div class="wisdom-persons">${p.people.map(person=>`<article><h4>${esc(person.name)}</h4><p>${esc(person.bio)}</p>${era.filter(e=>e.people_names.includes(person.name)).map(e=>`<button data-wisdom-era="${esc(e.slug)}">读人物关联故事与诗词 ↗</button>`).join('')}</article>`).join('')}</div></section>`:''}${p.quote?`<section class="wisdom-classical"><small>古文慢慢读</small><h3>原文、字词与白话</h3><blockquote>${esc(p.quote)}</blockquote><cite>${esc(p.quote_source)}</cite><h4>字词解释</h4><p>${esc(p.gloss)}</p><h4>白话理解</h4><p>${esc(p.translation)}</p></section>`:''}<aside class="wisdom-caution"><b>史实与阅读边界</b><p>${esc(p.caution)}</p></aside>${related.length?`<section><h3>${p.kind==='battles'?'再读相关计策':'把计意放进战役里'}</h3><p class="wisdom-link-note">这些关联用于比较理解，不表示当时人物已经使用这部书或以此计名下令。</p><div class="wisdom-associated">${related.map(x=>`<button data-wisdom-open="${esc(x.slug)}">${esc(x.title)} <span>${esc(x.dates)}</span> ↗</button>`).join('')}</div></section>`:''}<aside class="history-question"><small>一起想一想</small><p>${esc(p.question)}</p></aside><details class="history-era-sources"><summary>资料出处与内容说明</summary><p>白话解说、字词解释与明确标注的假设实例为项目原创。古典原文节选为公有领域文本，现代标点和字形已作阅读整理。</p><a href="${esc(p.source_url)}" target="_blank" rel="noopener noreferrer">查阅原典或博物馆资料 ↗</a></details><button class="wisdom-return" data-wisdom-back>回到${name(kind)}</button></div></article>`;
     bindLinks();host.querySelectorAll('[data-wisdom-back]').forEach(b=>b.onclick=()=>{list();window.scrollTo({top:scroll});[...host.querySelectorAll(`[data-wisdom-open="${slug}"]`)].find(x=>x.getClientRects().length)?.focus({preventScroll:true});});
     host.querySelector('h2').focus({preventScroll:true});host.scrollIntoView({block:'start'});
   }catch(e){if(v===version)window.toast?.(e.message);}
 }
 async function render(container,category,target){leave();host=container;kind=category;query='';group='';const v=++version;host.innerHTML='<p role="status">正在翻开历史读本…</p>';try{const [a,b]=await Promise.all([api('/learning/history-wisdom'),api('/learning/history')]);if(v!==version)return;items=a.items;periods=b.periods;list();if(target)await open(target);}catch(e){if(v===version)host.innerHTML=`<p role="status">${esc(e.message)}</p><button data-wisdom-retry>重新读取</button>`;host?.querySelector('[data-wisdom-retry]')?.addEventListener('click',()=>render(container,category,target));}}
 window.FufuHistoryWisdom={render,leave,onNavigate:page=>{if(page==='cards'&&!host){let e=document.getElementById('historyWisdomContent');if(e)render(e,e.dataset.kind);}}};
})();
