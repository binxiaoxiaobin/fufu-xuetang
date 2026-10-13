import re
p = r'D:\福福学堂\scripts\foreign_stories_data.py'
s = open(p, encoding='utf-8').read()
lines = s.split('\n')
out = []
for line in lines:
    new = re.sub(r'(?<=[\u4e00-\u9fff，。！？、；：])"([^"]+?)"(?=[\u4e00-\u9fff，。！？、；：])', r'「\1」', line)
    out.append(new)
open(p, 'w', encoding='utf-8').write('\n'.join(out))
print('done')
