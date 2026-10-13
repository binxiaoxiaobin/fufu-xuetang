from pathlib import Path

root = Path(__file__).resolve().parent
shell = (root / 'shell.html').read_text()
library = (root / 'three.min.js').read_text()
license_text = (root / 'three-license.txt').read_text()
code = (root / 'game.js').read_text()
html = shell.replace('<!-- THREE_LIBRARY -->', '<!--\nThree.js r160\n' + license_text + '\n-->\n<script>\n' + library + '\n</script>').replace('/* GAME_CODE */', code)
target = root.parent / 'mosswing.html'
target.write_text(html)
print(f'Built {target.name}: {len(html.encode()):,} bytes')
