# -*- coding: utf-8 -*-
"""V3 rig: delete the broken detached arm/shoulder islands and rebuild clean
clay arms (sleeve + skin tubes + mitten hand) plus sage suspender straps.

blender --background --python scripts/build_tuantuan_rig_v3.py -- [render]
"""
import sys
from pathlib import Path
from math import exp, pi
import bmesh
import bpy
from mathutils import Vector, Matrix

ROOT = Path(r"d:\福福学堂")
ART = ROOT / "artifacts/tuantuan-girl"
SOURCE = ART / "tuantuan-girl-tripo-source.glb"
OUT_GLB = ROOT / "frontend/assets/characters/tuantuan-girl-rigged.glb"
SCALE = 3.2
RENDER_ONLY = "render" in sys.argv


def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


# --------------------------------------------------------------- pipeline
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
mesh = next(o for o in bpy.context.scene.objects if o.type == "MESH")
mesh.name = "Tuantuan Clay Character"
mesh.scale = (SCALE,) * 3
bpy.context.view_layer.objects.active = mesh
mesh.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
mod = mesh.modifiers.new("Tablet geometry", "DECIMATE")
mod.ratio = min(1.0, 80_000 / len(mesh.data.polygons))
mod.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=mod.name)

# -------------------------------------------------------------- islands
parents = list(range(len(mesh.data.vertices)))


def find(i):
    while parents[i] != i:
        parents[i] = parents[parents[i]]
        i = parents[i]
    return i


for e in mesh.data.edges:
    a, b = e.vertices
    parents[find(a)] = find(b)
island_of = {v.index: find(v.index) for v in mesh.data.vertices}
islands = {}
for vi, root in island_of.items():
    islands.setdefault(root, []).append(vi)

img = next(im for im in bpy.data.images if im.pixels)
IW, IH = img.size
_pixels = img.pixels[:]
uvl = mesh.data.uv_layers.active.data
poly_root = [find(p.vertices[0]) for p in mesh.data.polygons]
island_cols = {}
for p, root in zip(mesh.data.polygons, poly_root):
    bucket = island_cols.setdefault(root, [])
    if len(bucket) < 90:
        u, v = uvl[p.loop_start].uv
        x = int(min(IW - 1, max(0, u * IW))); y = int(min(IH - 1, max(0, v * IH)))
        k = (y * IW + x) * 4
        bucket.append((_pixels[k], _pixels[k + 1], _pixels[k + 2]))
colormean = {r: tuple(sum(c[k] for c in cs) / len(cs) for k in range(3))
             for r, cs in island_cols.items()}


def ctype(rgb):
    r, g, b = rgb
    if r > .72 and g > .60 and b > .50:
        return "white"
    if r > .60 and g < .40 and b < .32 and r - b > .24:
        return "red"
    if r > .66 and g > .44 and b > .27 and r - b > .17:
        return "skin"
    if r > .59 and g > .40 and b < .40 and r - b > .20:
        return "yellow"
    if abs(r - g) < .17 and g > .30 and b > .18 and r < .66:
        return "sage"
    return "dark"


is_centroid = {}
for root, ids in islands.items():
    s = Vector((0, 0, 0))
    for vi in ids:
        s += mesh.data.vertices[vi].co
    is_centroid[root] = s / len(ids)

# --------------------------------------------- delete broken arm islands
del_roots = set()
for root, ids in islands.items():
    cx, cy, cz = is_centroid[root]
    kind = ctype(colormean[root])
    if kind == "red":
        continue
    ax = abs(cx)
    # 手臂本体：宽范围
    if ax > .335 and abs(cy) < .32 and .95 < cz < 2.12:
        del_roots.add(root)
    # 腋下/肩内缘的破碎内衬片（不能碰到前胸背带和短裤）
    elif .255 < ax <= .335 and abs(cy) < .24 and cz > 1.50:
        del_roots.add(root)
    # 后背肩颈处的黑色内饰翘片
    elif .215 < ax < .335 and cy > -.02 and 1.92 < cz < 2.13 and kind == "dark":
        del_roots.add(root)
del_verts = sorted({vi for root in del_roots for vi in islands[root]})
print("delete islands", len(del_roots), "verts", len(del_verts))

bm = bmesh.new()
bm.from_mesh(mesh.data)
bm.verts.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[bm.verts[i] for i in del_verts], context="VERTS")
bm.to_mesh(mesh.data)
bm.free()
mesh.data.validate(verbose=False)

# -------------------------------------------------------------- shape keys
mesh.shape_key_add(name="Basis")
blink = mesh.shape_key_add(name="Blink")
happy = mesh.shape_key_add(name="Happy")
surprise = mesh.shape_key_add(name="Surprised")
for i, vert in enumerate(mesh.data.vertices):
    x, y, z = (v / SCALE for v in vert.co)
    front = 1.0 - smooth(-.12, -.07, y)
    eye = max(exp(-((x - s * .064) / .038) ** 2 - ((z - .744) / .039) ** 2)
              for s in (-1, 1)) * front
    cheek = max(exp(-((x - s * .105) / .050) ** 2 - ((z - .681) / .035) ** 2)
                for s in (-1, 1)) * front
    brow = max(exp(-((x - s * .065) / .044) ** 2 - ((z - .805) / .028) ** 2)
               for s in (-1, 1)) * front
    blink.data[i].co.z -= SCALE * (z - .744) * .67 * eye
    happy.data[i].co.z += SCALE * (.011 * cheek - .004 * eye)
    surprise.data[i].co.z += SCALE * (.012 * brow + .006 * eye)

# -------------------------------------------------------------- armature
arm_data = bpy.data.armatures.new("Tuantuan deform skeleton")
arm = bpy.data.objects.new("TuantuanRig", arm_data)
bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")


def bone(name, head, tail, parent=None):
    b = arm_data.edit_bones.new(name)
    b.head = tuple(SCALE * v for v in head)
    b.tail = tuple(SCALE * v for v in tail)
    b.use_deform = True
    if parent:
        b.parent = arm_data.edit_bones[parent]


bone("Hips", (0, 0, .29), (0, 0, .37))
bone("Spine", (0, 0, .37), (0, 0, .52), "Hips")
bone("Chest", (0, 0, .52), (0, 0, .64), "Spine")
bone("Neck", (0, 0, .64), (0, 0, .69), "Chest")
bone("Head", (0, 0, .69), (0, 0, .90), "Chest")
for sgn, nm in ((-1, "L"), (1, "R")):
    bone(f"UpperArm.{nm}", (sgn * .112, 0, .58), (sgn * .185, 0, .43), "Chest")
    bone(f"Forearm.{nm}", (sgn * .185, 0, .43), (sgn * .194, 0, .345), f"UpperArm.{nm}")
    bone(f"Hand.{nm}", (sgn * .194, 0, .345), (sgn * .197, 0, .31), f"Forearm.{nm}")
    bone(f"Thigh.{nm}", (sgn * .068, 0, .31), (sgn * .080, 0, .17), "Hips")
    bone(f"Shin.{nm}", (sgn * .080, 0, .17), (sgn * .085, 0, .075), f"Thigh.{nm}")
    bone(f"Foot.{nm}", (sgn * .085, 0, .075), (sgn * .085, -.060, .035), f"Shin.{nm}")
bpy.ops.object.mode_set(mode="OBJECT")

groups = {b.name: mesh.vertex_groups.new(name=b.name) for b in arm_data.bones}

# ------------------------------------------------------------- weighting
# recompute islands of the (now smaller) mesh for color-based leg rules
parents = list(range(len(mesh.data.vertices)))


def find2(i):
    while parents[i] != i:
        parents[i] = parents[parents[i]]
        i = parents[i]
    return i


for e in mesh.data.edges:
    a, b = e.vertices
    parents[find2(a)] = find2(b)
islands2 = {}
for vi in range(len(mesh.data.vertices)):
    islands2.setdefault(find2(vi), []).append(vi)
# recollect after deletion
poly_root2 = [find2(p.vertices[0]) for p in mesh.data.polygons]
cols2 = {}
for p, root in zip(mesh.data.polygons, poly_root2):
    bucket = cols2.setdefault(root, [])
    if len(bucket) < 60:
        u, v = uvl[p.loop_start].uv
        x = int(min(IW - 1, max(0, u * IW))); y = int(min(IH - 1, max(0, v * IH)))
        k = (y * IW + x) * 4
        bucket.append((_pixels[k], _pixels[k + 1], _pixels[k + 2]))
cm2 = {r: tuple(sum(c[k] for c in cs) / len(cs) for k in range(3)) for r, cs in cols2.items()}
cent2 = {}
for root, ids in islands2.items():
    s = Vector((0, 0, 0))
    for vi in ids:
        s += mesh.data.vertices[vi].co
    cent2[root] = s / len(ids)

leg_island_verts = {}
for root, ids in islands2.items():
    c = cent2[root]
    kind = ctype(cm2.get(root, (.5, .5, .5)))
    if c.z < 1.02 and abs(c.x) > .175 and kind in ("skin", "white", "dark", "yellow", "sage"):
        side = "L" if c.x < 0 else "R"
        if kind == "sage" and c.z > .72:
            leg_island_verts[root] = ({"Hips": 1.0}, ids)
        elif kind == "white":
            leg_island_verts[root] = ({f"Shin.{side}": 1.0}, ids)
        elif kind == "dark":
            leg_island_verts[root] = ({(f"Foot.{side}" if c.z < .28 else f"Shin.{side}"): 1.0}, ids)
        elif kind == "skin":
            if c.z > .60:
                t = smooth(.78, .55, c.z)
                leg_island_verts[root] = ({f"Thigh.{side}": 1 - t, f"Shin.{side}": t}, ids)
            else:
                leg_island_verts[root] = ({f"Shin.{side}": 1.0}, ids)
        else:
            leg_island_verts[root] = ({f"Shin.{side}": 1.0}, ids)
for w, ids in leg_island_verts.values():
    for nm, val in w.items():
        groups[nm].add(ids, val, "REPLACE")

# every other vertex: generic smooth rule
assigned = [bool(v.groups) for v in mesh.data.vertices]
buckets = {}
for vi, done in enumerate(assigned):
    if done:
        continue
    x, y, z = (mesh.data.vertices[vi].co[k] / SCALE for k in range(3))
    side = "L" if x < 0 else "R"
    head = smooth(.61, .69, z)
    if z > .61 and abs(x) > .16:
        head = max(head, smooth(.61, .67, z))
    leg_part = (1 - smooth(.27, .345, z)) * smooth(.012, .065, abs(x))
    torso = max(0.0, 1 - head - leg_part)
    w = {}
    if head:
        w["Head"] = head
    if leg_part:
        foot = 1 - smooth(.065, .10, z)
        thigh = smooth(.135, .19, z)
        shin = max(0.0, 1 - foot - thigh)
        w[f"Thigh.{side}"] = leg_part * thigh
        w[f"Shin.{side}"] = leg_part * shin
        w[f"Foot.{side}"] = leg_part * foot
    if torso:
        chest = smooth(.49, .58, z)
        hips = 1 - smooth(.31, .39, z)
        spine = max(0.0, 1 - chest - hips)
        w["Chest"] = torso * chest
        w["Spine"] = torso * spine
        w["Hips"] = torso * hips
    total = sum(w.values())
    if total < 1e-6:
        w = {"Hips": 1.0}
    for nm, val in w.items():
        if val > 1e-5:
            buckets.setdefault(nm, []).append((vi, val / total))
for nm, items in buckets.items():
    for vi, wgt in items:
        groups[nm].add([vi], wgt, "REPLACE")

mesh.parent = arm
mesh.modifiers.new("Tuantuan skin", "ARMATURE").object = arm

# ------------------------------------------------------- rebuilt clay parts
def clay_mat(name, color, rough=.58):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    sh = m.node_tree.nodes.get("Principled BSDF")
    sh.inputs["Base Color"].default_value = (*color, 1)
    sh.inputs["Roughness"].default_value = rough
    return m


mat_skin = clay_mat("clay skin", (.66, .40, .26))
mat_sleeve = clay_mat("clay sleeve", (.62, .42, .19))
mat_sage = clay_mat("clay sage", (.53, .51, .33), rough=.66)
mat_buckle = clay_mat("clay buckle", (.36, .24, .15), rough=.5)
parts = []


def bind(obj, weights):
    obj.parent = arm
    for nm, w in weights:
        vg = obj.vertex_groups.new(name=nm)
        vg.add(list(range(len(obj.data.vertices))), w, "REPLACE")
    obj.modifiers.new("skin", "ARMATURE").object = arm
    for poly in obj.data.polygons:
        poly.use_smooth = True
    parts.append(obj)


def cone_between(name, p1, p2, r1, r2, mat, weights, seg=20):
    p1, p2 = Vector(p1), Vector(p2)
    d = p2 - p1
    depth = d.length
    bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r1, radius2=r2, depth=depth,
                                   location=(p1 + p2) / 2)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(mat)
    o.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    bind(o, weights)
    return o


def ball(name, center, radii, mat, weights, seg=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=max(10, seg // 2),
                                         location=center)
    o = bpy.context.object
    o.name = name
    o.scale = radii
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat)
    bind(o, weights)
    return o


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    return o


for sgn, nm in ((-1, "L"), (1, "R")):
    ua, fa, hd = f"UpperArm.{nm}", f"Forearm.{nm}", f"Hand.{nm}"
    shoulder = (sgn * .358, 0, 1.856)
    sleeve_end = (sgn * .525, -.005, 1.60)
    elbow = (sgn * .592, -.002, 1.376)
    wrist = (sgn * .621, -.012, 1.115)
    # ---- sleeve (upper arm bone): slim tapered tube + small cap + thin cuff
    s1 = cone_between(f"sleeveTube.{nm}", shoulder, sleeve_end, .112, .104, mat_sleeve, [(ua, 1)])
    s2 = ball(f"sleeveCap.{nm}", shoulder, (.118, .118, .118), mat_sleeve, [(ua, 1)])
    c1 = cone_between(f"cuff.{nm}", (sgn * .512, -.005, 1.575), (sgn * .538, -.005, 1.625),
                      .110, .110, mat_sleeve, [(ua, 1)], seg=20)
    sleeve = join([s1, s2, c1], f"sleeve.{nm}")
    # ---- upper arm
    u1 = cone_between(f"upperArm.{nm}", (sgn * .530, -.005, 1.575), elbow, .074, .074,
                      mat_skin, [(ua, 1)])
    # ---- elbow cushion
    e1 = ball(f"elbow.{nm}", elbow, (.076, .073, .076), mat_skin, [(ua, .5), (fa, .5)])
    # ---- forearm
    f1 = cone_between(f"forearm.{nm}", elbow, wrist, .070, .062, mat_skin, [(fa, 1)])
    # ---- mitten hand
    h1 = ball(f"fist.{nm}", (sgn * .628, -.032, 1.020), (.086, .074, .100), mat_skin, [(hd, 1)])
    h2 = ball(f"thumb.{nm}", (sgn * .578, -.085, 1.030), (.038, .036, .042), mat_skin, [(hd, 1)], seg=16)
    join([h1, h2], f"hand.{nm}")
    # ---- static shoulder socket (seals torso when arm raises)
    ball(f"socket.{nm}", (sgn * .282, 0, 1.785), (.118, .108, .165), mat_sleeve, [("Chest", 1)])

# merge the two sockets into one static outfit-patch object
sockets = [o for o in bpy.data.objects if o.name.startswith("socket.")]
patches = join(sockets, "outfitPatches")

# sage suspender straps arching over shoulders (static, Chest)
for sgn, nm in ((-1, "L"), (1, "R")):
    curve = bpy.data.curves.new(f"strapCurve.{nm}", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 12
    curve.bevel_depth = .042
    curve.bevel_resolution = 6
    sp = curve.splines.new("BEZIER")
    pts = [(sgn * .245, -.150, 1.56), (sgn * .300, -.060, 1.74),
           (sgn * .360, .020, 1.90), (sgn * .335, .165, 1.84),
           (sgn * .270, .250, 1.66)]
    sp.bezier_points.add(len(pts) - 1)
    for bp, co in zip(sp.bezier_points, pts):
        bp.co = co
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    o = bpy.data.objects.new(f"strap.{nm}", curve)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(mat_sage)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.convert(target="MESH")
    o = bpy.context.object
    bind(o, [("Chest", 1)])
    o.select_set(False)
    # buckle adjuster on the front
    bpy.ops.mesh.primitive_cube_add(size=1, location=(sgn * .250, -.160, 1.595))
    bk = bpy.context.object
    bk.name = f"buckle.{nm}"
    bk.scale = (.062, .030, .075)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bk.data.materials.append(mat_buckle)
    bind(bk, [("Chest", 1)])

# merge all Chest-weighted patches
static_objs = [o for o in bpy.data.objects
               if o.name.startswith(("outfitPatches", "strap.", "buckle."))]
patches = join(static_objs, "outfitPatches")

# ---------------------------------------------------------------- render
def look_at(o, point):
    o.rotation_euler = (Vector(point) - o.location).to_track_quat("-Z", "Y").to_euler()


cam_data = bpy.data.cameras.new("review")
cam = bpy.data.objects.new("review", cam_data)
bpy.context.collection.objects.link(cam)
cam_data.type = "ORTHO"
cam_data.ortho_scale = 4.0
bpy.context.scene.camera = cam
bpy.context.scene.render.engine = "CYCLES"
bpy.context.scene.cycles.samples = 18
bpy.context.scene.render.resolution_x = 620
bpy.context.scene.render.resolution_y = 620
bpy.context.scene.view_settings.view_transform = "AgX"
world = bpy.data.worlds.new("w"); bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (.72, .74, .68, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = .9
for o in list(bpy.context.scene.objects):
    if o.type == "LIGHT":
        bpy.data.objects.remove(o)
bpy.ops.object.light_add(type="AREA", location=(-3, -4, 5))
bpy.context.object.data.energy = 700
bpy.ops.object.light_add(type="AREA", location=(3, -2, 3))
bpy.context.object.data.energy = 300


def rest_basis(nm):
    return arm.pose.bones[nm].bone.matrix_local.to_3x3()


def setq(nm, mat):
    pb = arm.pose.bones[nm]
    pb.rotation_mode = "QUATERNION"
    pb.rotation_quaternion = (rest_basis(nm).inverted() @ mat @ rest_basis(nm)).to_quaternion()


def reset_pose():
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = (1, 0, 0, 0)
    bpy.context.view_layer.update()


def p_idle(): pass
def p_wave():
    setq("UpperArm.R", Matrix.Rotation(-2.0, 3, "Y"))
    setq("Forearm.R", Matrix.Rotation(-.35, 3, "Y"))
def p_cheer():
    setq("UpperArm.R", Matrix.Rotation(-2.5, 3, "Y"))
    setq("UpperArm.L", Matrix.Rotation(2.5, 3, "Y"))
    setq("Forearm.R", Matrix.Rotation(.25, 3, "Y"))
    setq("Forearm.L", Matrix.Rotation(-.25, 3, "Y"))
def p_read():
    setq("UpperArm.R", Matrix.Rotation(1.15, 3, "X") @ Matrix.Rotation(-.30, 3, "Y"))
    setq("UpperArm.L", Matrix.Rotation(1.15, 3, "X") @ Matrix.Rotation(.30, 3, "Y"))
    setq("Forearm.R", Matrix.Rotation(-1.35, 3, "X") @ Matrix.Rotation(.25, 3, "Y"))
    setq("Forearm.L", Matrix.Rotation(-1.35, 3, "X") @ Matrix.Rotation(-.25, 3, "Y"))
def p_walk():
    setq("Thigh.R", Matrix.Rotation(.45, 3, "X"))
    setq("Shin.R", Matrix.Rotation(-.55, 3, "X"))
    setq("Thigh.L", Matrix.Rotation(-.45, 3, "X"))
    setq("Shin.L", Matrix.Rotation(.20, 3, "X"))
    setq("UpperArm.R", Matrix.Rotation(-.4, 3, "X"))
    setq("UpperArm.L", Matrix.Rotation(.4, 3, "X"))

poses = [("idle", p_idle), ("wave", p_wave), ("cheer", p_cheer), ("read", p_read), ("walk", p_walk)]
views = [(0, -6, 3.0), (2.6, -5.2, 2.9), (0, 6, 3.0)]
for vi, place in enumerate(views):
    for nm, fn in poses:
        reset_pose()
        fn()
        bpy.context.view_layer.update()
        cam.location = place
        look_at(cam, (0, 0, 1.55))
        fp = ART / "face-work" / f"v3_{nm}_{vi}.png"
        bpy.context.scene.render.filepath = str(fp)
        bpy.ops.render.render(write_still=True)
reset_pose()

if not RENDER_ONLY:
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True); mesh.select_set(True)
    for o in bpy.data.objects:
        if o.type == "MESH" and o is not mesh:
            o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=str(OUT_GLB), export_format="GLB", use_selection=True,
        export_animations=False, export_cameras=False, export_lights=False)
    print("EXPORTED", OUT_GLB)
print("RIG_V3_DONE tris=", len(mesh.data.polygons))
