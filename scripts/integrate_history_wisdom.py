# -*- coding: utf-8 -*-
from pathlib import Path
def edit(name,changes):
    p=Path(name);s=p.read_text(encoding='utf-8')
    for before,after in changes:
        assert before in s,(name,before[:80]);s=s.replace(before,after,1)
    p.write_text(s,encoding='utf-8')
edit('frontend/app.js',[
 ("  history: { subject:'语文'", "  battles: {subject:'语文',title:'著名战役',hint:'读战役、认识人物，沿着朝代时间线理解历史。'},\n  strategies: {subject:'语文',title:'三十六计',hint:'读文言原文与白话讲解，辨析古今语义和故事。'},\n  history: { subject:'语文'"),
 ("window.FufuHistoryCards?.leave();}","window.FufuHistoryCards?.leave();window.FufuHistoryWisdom?.leave();}"),
 ("window.FufuHistoryCards?.onNavigate(page);","window.FufuHistoryCards?.onNavigate(page);window.FufuHistoryWisdom?.onNavigate(page);"),
 ("function renderDeck(id) {","function renderDeck(id,targetSlug=null) {"),
 ("  window.FufuHistoryCards?.leave();\n", "  window.FufuHistoryCards?.leave();\n  window.FufuHistoryWisdom?.leave();\n"),
 ("  if(id==='history'){", "  if(id==='battles'||id==='strategies'){\n    $('#deckContent').innerHTML=`${cardTabs(id)}<div id=\"historyWisdomContent\" data-kind=\"${id}\"></div>`;\n    bindCardTabs();window.FufuHistoryWisdom?.render($('#historyWisdomContent'),id,targetSlug);return;\n  }\n  if(id==='history'){"),
 ("render($('#historyCardsContent'));return;","render($('#historyCardsContent'),targetSlug);return;"),
 ("  if(location.hash==='#history')", "  if(['#battles','#strategies'].includes(location.hash)){renderDeck(location.hash.slice(1));navigate('cards');}\n  if(location.hash==='#history')"),
 ("init();", "window.addEventListener('fufu-open-era',e=>{renderDeck('history',e.detail);navigate('cards');});\nwindow.addEventListener('fufu-open-wisdom',e=>{renderDeck(e.detail.kind,e.detail.slug);navigate('cards');});\ninit();")])
edit('frontend/history-cards.js',[
 ("async function render(container){","async function render(container,targetSlug=null){"),
 ("if(version===requestVersion&&host===container)renderList();", "if(version===requestVersion&&host===container){renderList();if(targetSlug)await open(targetSlug);}"),
 ("${lanes(p)}<section", "${lanes(p)}${p.related_cards?.length?`<section class=\"history-section\"><h3>这个时代的战役与谋略</h3><div class=\"wisdom-associated\">${p.related_cards.map(x=>`<button data-era-wisdom=\"${esc(x.slug)}\" data-wisdom-kind=\"${esc(x.kind)}\">${esc(x.title)}<span>${esc(x.dates)}</span> ↗</button>`).join('')}</div></section>`:''}<section"),
 ("      container.querySelectorAll('[data-history-back]')", "      container.querySelectorAll('[data-era-wisdom]').forEach(b=>b.onclick=()=>window.dispatchEvent(new CustomEvent('fufu-open-wisdom',{detail:{kind:b.dataset.wisdomKind,slug:b.dataset.eraWisdom}})));\n      container.querySelectorAll('[data-history-back]')")])
edit('frontend/index.html',[
 ('</head>', '<link rel="stylesheet" href="/history-wisdom.css?v=20261011-wisdom-1"></head>'),
 ('<script src="/history-cards.js?', '<script src="/history-wisdom.js?v=20261011-wisdom-1"></script><script src="/history-cards.js?'),
 ('history-cards.js?v=20261011-history-s-2','history-cards.js?v=20261011-wisdom-1'),
 ('app.js?v=20261011-history-1','app.js?v=20261011-wisdom-1')])
