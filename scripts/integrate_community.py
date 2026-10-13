"""Attach public garden and parent links without reformatting existing compact HTML."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / 'frontend/index.html'
source = path.read_text(encoding='utf-8')
if 'community.html' not in source:
    source = source.replace('<footer class="footer">', '<footer class="footer"><a href="/community.html">✿ 共创交流</a>', 1)
    marker = '<form id="parentGameAccessForm"'
    card = '<section class="parent-community-entry" style="padding:18px;border:1px solid #ead2db;border-radius:16px;background:#fff4f5;margin:18px 0"><b style="color:#a64d6b">✿ 支持者共创花园</b><p style="font-size:12px;color:#967d87">公开浏览建议与分享，设置独立社区昵称，给学堂一点甜。</p><a href="/community.html" class="primary-btn" style="display:inline-block;text-decoration:none;background:#b5486c">进入共创交流 →</a> <a href="/community.html#support" style="font-size:12px;color:#a64d6b">🍬 支持一下</a></section>'
    source = source.replace(marker, card + marker, 1)
path.write_text(source, encoding='utf-8')
# Community administration is embedded in admin.html; do not add a separate entry.
path = root / 'frontend/community.css'
source = path.read_text(encoding='utf-8').replace("@import url('');\n", '')
path.write_text(source, encoding='utf-8')
