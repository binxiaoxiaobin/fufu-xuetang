"""Keep the home shortcuts in the same subject order as the card browser."""
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'frontend/index.html';html=path.read_text(encoding='utf-8')
cards=[
    ('times','数学卡片','乘法口诀 · 口算','三三得九 · 四五二十','✖️'),
    ('poetry','语文卡片','拼音 · 诗词朗诵','300 首唐诗宋词','📖'),
    ('actions','英语卡片','字母 · 动作 · 果蔬','单词与句子一起学','🔠'),
    ('science','科学卡片','天空 · 自然 · 小实验','从观察开始发现','🌿'),
]
index=0
def replace(match):
    global index
    deck,title,hint,preview,icon=cards[index];index+=1
    return '<button class="quick-card" data-deck="'+deck+'"><span class="quick-emoji">'+icon+'</span><b>'+title+'</b><small>'+hint+'</small><span class="quick-preview">'+preview+'</span><span class="card-arrow">↗</span></button>'
html=re.sub(r'<button class="quick-card"[^>]*>.*?</button>',replace,html)
assert index==4
html=html.replace("renderDeck('pinyin')","renderDeck('poetry')")
path.write_text(html,encoding='utf-8')
