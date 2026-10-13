"""Read-only topology report for the source clay character."""

from pathlib import Path
import bpy

root = Path(__file__).resolve().parent.parent
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root / "artifacts/tuantuan-girl/tuantuan-girl-tripo-source.glb"))
mesh_obj = next(o for o in bpy.context.scene.objects if o.type == "MESH")
mesh_obj.scale = (3.2,) * 3
bpy.context.view_layer.objects.active = mesh_obj
mesh_obj.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

parents = list(range(len(mesh_obj.data.vertices)))


def find(i):
    while parents[i] != i:
        parents[i] = parents[parents[i]]
        i = parents[i]
    return i


for e in mesh_obj.data.edges:
    a, b = e.vertices
    parents[find(a)] = find(b)

islands = {}
for vert in mesh_obj.data.vertices:
    islands.setdefault(find(vert.index), []).append(vert)

image = next(im for im in bpy.data.images if im.pixels)
pixels = image.pixels[:]
iw, ih = image.size
uvs = mesh_obj.data.uv_layers.active.data
colors = {}
for poly in mesh_obj.data.polygons:
    root = find(poly.vertices[0])
    bucket = colors.setdefault(root, [])
    if len(bucket) >= 50:
        continue
    u, v = uvs[poly.loop_start].uv
    px = int(max(0, min(iw - 1, u * iw)))
    py = int(max(0, min(ih - 1, v * ih)))
    idx = (py * iw + px) * 4
    bucket.append(tuple(pixels[idx:idx+3]))

print("TOTAL", len(mesh_obj.data.vertices), len(islands))
for root_i, verts in sorted(islands.items(), key=lambda item: -len(item[1])):
    n = len(verts)
    xyz = [tuple(v.co) for v in verts]
    center = tuple(sum(v[k] for v in xyz) / n for k in range(3))
    low = tuple(min(v[k] for v in xyz) for k in range(3))
    high = tuple(max(v[k] for v in xyz) for k in range(3))
    face = 1.98 < center[2] < 2.72 and abs(center[0]) < .36 and center[1] < .03
    legs = .08 < center[2] < 1.30 and abs(center[0]) > .08
    if (face or legs) and n >= 35:
        cs = colors.get(root_i, [])
        color = tuple(sum(c[k] for c in cs) / len(cs) for k in range(3)) if cs else (0, 0, 0)
        print("ISLAND", root_i, n,
              "C", *(round(x, 3) for x in center),
              "MIN", *(round(x, 3) for x in low),
              "MAX", *(round(x, 3) for x in high),
              "RGB", *(round(x, 3) for x in color))

uv_by_vertex = {}
for loop in mesh_obj.data.loops:
    uv_by_vertex.setdefault(loop.vertex_index, tuple(uvs[loop.index].uv))
for point in [(-.17, -.55, 2.40), (-.17, -.50, 2.51),
              (-.17, -.50, 2.28), (.17, -.55, 2.40),
              (.17, -.50, 2.51), (.17, -.50, 2.28),
              (0, -.50, 2.20), (0, -.50, 2.29)]:
    vert = min(mesh_obj.data.vertices,
               key=lambda v: sum((v.co[k] - point[k]) ** 2 for k in range(3)))
    print("UV_POINT", point, "ACTUAL", tuple(round(x, 3) for x in vert.co),
          "UV", tuple(round(x, 4) for x in uv_by_vertex.get(vert.index, (0, 0))))
for u, v in [(0.8423, .7043), (.8291, .6924), (.836, .698),
             (.4951, .9038), (.5012, .9167), (.499, .911),
             (.8423, .73), (.4951, .88)]:
    x = int(u * iw); y = int(v * ih); i = (y * iw + x) * 4
    print("TEXEL", u, v, tuple(round(x, 3) for x in pixels[i:i+3]))
