"""Refresh entry versions after enabling direct science recordings and uniform fallback."""
import re
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
path = ROOT/'frontend/index.html'
text = path.read_text(encoding='utf-8')
for file in ['reading-cards.js', 'app.js']:
    text, count = re.subn(re.escape(file)+r'\?v=[^"\s<>]+', file+'?v=20261009-consistent-speech-1', text)
    assert count == 1, (file, count)
path.write_text(text, encoding='utf-8')
print('Entry versions updated')
