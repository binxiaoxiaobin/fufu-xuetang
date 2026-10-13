"""Read-only report of large connected surfaces and their armature weights."""

from pathlib import Path
import bpy
from mathutils import Vector

root = Path(__file__).resolve().parent.parent
bpy.ops.wm.open_mainfile(filepath=str(root / "artifacts/tuantuan-girl/tuantuan-girl-original-rig.blend"))
mesh = next(o for o in bpy.data.objects if o.type == "MESH" and o.name == "Tuantuan Clay Character")
parents = list(range(len(mesh.data.vertices)))

def find(i):
    while parents[i] != i:
        parents[i] = parents[parents[i]]
        i = parents[i]
    return i

for e in mesh.data.edges:
    parents[find(e.vertices[0])] = find(e.vertices[1])
islands = {}
for v in mesh.data.vertices:
    islands.setdefault(find(v.index), []).append(v)
names = {vg.index: vg.name for vg in mesh.vertex_groups}
img = next(im for im in bpy.data.images if im.pixels)
iw, ih = img.size
pixels = img.pixels[:]
uv = mesh.data.uv_layers.active.data
colors = {}
for poly in mesh.data.polygons:
    root = find(poly.vertices[0])
    sample = colors.setdefault(root, [])
    if len(sample) < 80:
        u, v = uv[poly.loop_start].uv
        px = min(iw - 1, max(0, int(u * iw)))
        py = min(ih - 1, max(0, int(v * ih)))
        k = (py * iw + px) * 4
        sample.append((pixels[k], pixels[k + 1], pixels[k + 2]))
for ids in sorted(islands.values(), key=len, reverse=True):
    if len(ids) < 60:
        continue
    center = sum((v.co for v in ids), Vector()) / len(ids)
    if abs(center.x) < .12 or not .02 < center.z < 2.18:
        continue
    lo = [min(v.co[i] for v in ids) for i in range(3)]
    hi = [max(v.co[i] for v in ids) for i in range(3)]
    weights = {}
    for v in ids:
        for g in v.groups:
            name = names[g.group]
            weights[name] = weights.get(name, 0) + g.weight
    top = sorted(((name, round(value / len(ids), 2)) for name, value in weights.items()),
                 key=lambda item: -item[1])[:4]
    sample = colors.get(find(ids[0].index), [])
    rgb = tuple(round(sum(v[i] for v in sample) / max(len(sample), 1), 2) for i in range(3))
    fmt = lambda xyz: tuple(round(v, 3) for v in xyz)
    print("ISLAND", len(ids), "C", fmt(center), "LO", fmt(lo), "HI", fmt(hi), "RGB", rgb, "W", top)
