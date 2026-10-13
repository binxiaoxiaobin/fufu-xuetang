# -*- coding: utf-8 -*-
"""Build and publish the maintained Chinese Fishslop game."""
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT/'artifacts/fishslop-build'
OUTPUT = ROOT/'frontend/assets/games/fishslop'
subprocess.run([sys.executable, str(ROOT/'scripts/prepare_fishslop.py')], check=True)
node = shutil.which('node')
if not (BUILD/'node_modules/vite/bin/vite.js').is_file():
    raise RuntimeError('In artifacts/fishslop-build, run npm install first.')
subprocess.run([node, 'node_modules/typescript/bin/tsc'], cwd=str(BUILD), check=True)
subprocess.run([node, 'node_modules/vite/bin/vite.js', 'build'], cwd=str(BUILD), check=True)
OUTPUT.mkdir(exist_ok=True)
shutil.copytree(BUILD/'dist', OUTPUT, dirs_exist_ok=True)
shutil.copy2(ROOT/'content/games/fishslop/ATTRIBUTION.txt', OUTPUT/'ATTRIBUTION.txt')
shutil.copy2(BUILD/'node_modules/three/LICENSE', OUTPUT/'THREE-LICENSE.txt')
cover = ROOT/'content/games/fishslop/cover-zh.webp'
if cover.is_file(): shutil.copy2(cover, OUTPUT/'cover.webp')
print('Published Chinese Fishslop:', OUTPUT)
