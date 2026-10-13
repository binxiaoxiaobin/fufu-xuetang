# -*- coding: utf-8 -*-
"""Enumerate disconnected mesh islands of the decimated character."""
import bpy, json
from pathlib import Path
from mathutils import Vector

ROOT = Path(r"d:\福福学堂")
SOURCE = ROOT / "artifacts/tuantuan-girl/tuantuan-girl-tripo-source.glb"
OUT = ROOT / "artifacts/tuantuan-girl/face-work/islands.json"
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

parents = list(range(len(mesh.data.vertices)))


def find(i):
    while parents[i] != i:
        parents[i] = parents[parents[i]]
        i = parents[i]
    return i


for e in mesh.data.edges:
    a, b = e.vertices
    parents[find(a)] = find(b)
groups = {}
for v in mesh.data.vertices:
    groups.setdefault(find(v.index), []).append(v.index)

islands = []
me = mesh.data
for root, ids in groups.items():
    xs = [me.vertices[i].co for i in ids]
    mn = Vector((min(p.x for p in xs), min(p.y for p in xs), min(p.z for p in xs)))
    mx = Vector((max(p.x for p in xs), max(p.y for p in xs), max(p.z for p in xs)))
    ct = (mn + mx) / 2
    # area of this island
    vset = set(ids)
    area = sum(p.area for p in me.polygons if p.vertices[0] in vset)
    islands.append(dict(n=len(ids), tris=sum(1 for p in me.polygons if p.vertices[0] in vset),
                        area=round(area, 4),
                        ctr=[round(ct.x, 3), round(ct.y, 3), round(ct.z, 3)],
                        min=[round(mn.x, 3), round(mn.y, 3), round(mn.z, 3)],
                        max=[round(mx.x, 3), round(mx.y, 3), round(mx.z, 3)]))
islands.sort(key=lambda d: -d["n"])
OUT.write_text(json.dumps(islands, ensure_ascii=False, indent=1))
print("ISLANDS", len(islands))
for i, d in enumerate(islands):
    print(i, d["n"], "tris", d["tris"], "ctr", d["ctr"], "z[%.2f,%.2f]" % (d["min"][2], d["max"][2]))
