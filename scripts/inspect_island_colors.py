# -*- coding: utf-8 -*-
"""Per-island mean texture color + pose diagnostics for island classification."""
import bpy, json
from pathlib import Path
from mathutils import Vector

ROOT = Path(r"d:\福福学堂")
SOURCE = ROOT / "artifacts/tuantuan-girl/tuantuan-girl-tripo-source.glb"
OUT = ROOT / "artifacts/tuantuan-girl/face-work/islands_color.json"
SCALE = 3.2

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
mesh = next(o for o in bpy.context.scene.objects if o.type == "MESH")
mesh.scale = (SCALE,) * 3
bpy.context.view_layer.objects.active = mesh
mesh.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
mod = mesh.modifiers.new("dec", "DECIMATE")
mod.ratio = min(1.0, 80_000 / len(mesh.data.polygons))
mod.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=mod.name)

img = next(im for im in bpy.data.images if im.pixels)
W, H = img.size
px = img.pixels[:]
print("IMG", img.name, W, H, "srgb", img.colorspace_settings.name)

me = mesh.data
uvl = me.uv_layers.active.data


def sample(u, v):
    x = int(min(W - 1, max(0, u * W)))
    y = int(min(H - 1, max(0, v * H)))
    i = (y * W + x) * 4
    return px[i], px[i + 1], px[i + 2]


parents = list(range(len(me.vertices)))


def find(i):
    while parents[i] != i:
        parents[i] = parents[parents[i]]
        i = parents[i]
    return i


for e in me.edges:
    a, b = e.vertices
    parents[find(a)] = find(b)
groups = {}
for v in me.vertices:
    groups.setdefault(find(v.index), []).append(v.index)

poly_island = {}
for p in me.polygons:
    r = find(p.vertices[0])
    poly_island[p.index] = r
island_polys = {}
for pi, r in poly_island.items():
    island_polys.setdefault(r, []).append(pi)

rows = []
for ri, (root, ids) in enumerate(sorted(groups.items(), key=lambda kv: -len(kv[1]))):
    ps = island_polys.get(root, [])
    cols = []
    for pi in ps[:140]:
        u, v = uvl[me.polygons[pi].loop_start].uv
        cols.append(sample(u, v))
    mean = [sum(c[k] for c in cols) / max(1, len(cols)) for k in range(3)]
    xs = [me.vertices[i].co for i in ids]
    mn = Vector((min(p.x for p in xs), min(p.y for p in xs), min(p.z for p in xs)))
    mx = Vector((max(p.x for p in xs), max(p.y for p in xs), max(p.z for p in xs)))
    ct = (mn + mx) / 2
    rows.append(dict(i=ri, n=len(ids), tris=len(ps),
                     ctr=[round(ct.x, 3), round(ct.y, 3), round(ct.z, 3)],
                     min=[round(mn.x, 3), round(mn.y, 3), round(mn.z, 3)],
                     max=[round(mx.x, 3), round(mx.y, 3), round(mx.z, 3)],
                     rgb=[round(mean[0], 2), round(mean[1], 2), round(mean[2], 2)]))
OUT.write_text(json.dumps(rows))
for r in rows[:80]:
    print(r["i"], r["n"], r["ctr"], r["rgb"])
