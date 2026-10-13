"""Create local catalogue covers from verified Chinese gameplay screenshots."""
from pathlib import Path
from PIL import Image, ImageOps
ROOT=Path(__file__).resolve().parents[1]
for game, shot in [('turbo-kart-rally','kart-chinese.png'),('sunbreak','sunbreak-chinese.png')]:
    image=Image.open(ROOT/'artifacts'/shot).convert('RGB')
    # Keep the scene and rider, omit outer app toolbar and most touch controls.
    width,height=image.size
    image=image.crop((int(width*.18),int(height*.14),int(width*.84),int(height*.81)))
    cover=ImageOps.fit(image,(600,400))
    cover.save(ROOT/'content/games'/game/'cover-zh.webp',quality=88)
    cover.save(ROOT/'frontend/assets/games'/game/'cover.webp',quality=88)
print('Local Chinese scene covers saved')
