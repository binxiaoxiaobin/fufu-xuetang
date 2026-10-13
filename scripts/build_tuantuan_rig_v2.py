# -*- coding: utf-8 -*-
"""V2 rig: color-aware island weighting + joint filler blobs so big poses
(wave / cheer / walk / read) do not tear the hollow sculpt.

Run with Blender:
  blender --background --python scripts/build_tuantuan_rig_v2.py -- [render]
"""
import sys
from pathlib import Path
from math import exp, pi, sin, cos, radians
import bpy
from mathutils import Matrix, Vector

ROOT = Path(r"d:\福福学堂")
ART = ROOT / "artifacts/tuantuan-girl"
SOURCE = ART / "tuantuan-girl-tripo-source.glb"
OUT_GLB = ROOT / "frontend/assets/characters/tuantuan-girl-rigged.glb"
OUT_BLEND = ART / "tuantuan-girl-rigged-v2.blend"
RENDER_ONLY = "render" in sys.argv
SCALE = 3.2

DO_RENDER = True  # contact sheet before export


def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- pipeline
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
mesh.data.name = "Tuantuan · 80k textured triangles"

# --------------------------------------------------------------- islands
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

# mean texture color per island
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
colormean = {}
for root, cs in island_cols.items():
    colormean[root] = tuple(sum(c[k] for c in cs) / len(cs) for k in range(3))


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


# -------------------------------------------------------------- shape keys
basis = mesh.shape_key_add(name="Basis")
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


def add(names_weights, verts):
    for nm, w in names_weights:
        groups[nm].add(verts, w, "REPLACE")


# island centroids
is_centroid = {}
for root, ids in islands.items():
    s = Vector((0, 0, 0))
    for vi in ids:
        s += mesh.data.vertices[vi].co
    is_centroid[root] = s / len(ids)

# ------------------------------------------------------------- weighting
for root, ids in islands.items():
    c = is_centroid[root]
    cx, cy, cz = c.x, c.y, c.z
    kind = ctype(colormean[root])
    side = "L" if cx < 0 else "R"
    ax = abs(cx)
    weights = {}

    if 0.95 < cz < 2.05 and ax > .235 and abs(cy) < .40 and kind in ("skin", "yellow", "white"):
        # real arm surface chips
        if cz > 1.66:
            weights[f"UpperArm.{side}"] = 1.0
        elif cz > 1.28:
            # blend upper/forearm near elbow
            t = smooth(1.66, 1.28, cz)
            weights[f"UpperArm.{side}"] = 1 - t
            weights[f"Forearm.{side}"] = t
        else:
            weights[f"Forearm.{side}"] = .4
            weights[f"Hand.{side}"] = .6
    elif cz < 1.02 and ax > .175 and kind in ("skin", "white", "dark", "yellow", "sage"):
        if kind == "sage" and cz > .72:
            weights["Hips"] = 1.0                      # loose shorts stay with body
        elif kind == "white":
            weights[f"Shin.{side}"] = 1.0
        elif kind == "dark":
            if cz < .28:
                weights[f"Foot.{side}"] = 1.0
            else:
                weights[f"Shin.{side}"] = 1.0
        elif kind == "skin":
            if cz > .60:
                t = smooth(.78, .55, cz)
                weights[f"Thigh.{side}"] = 1 - t
                weights[f"Shin.{side}"] = t
            else:
                weights[f"Shin.{side}"] = 1.0
        else:  # yellow socks? rare
            weights[f"Shin.{side}"] = 1.0
    else:
        # leave unassigned; handled by the per-vertex generic rule below
        continue
    if weights:
        total = sum(weights.values())
        for nm, w in weights.items():
            if w > 1e-5:
                groups[nm].add(ids, w / total, "REPLACE")

# every vertex without any group yet -> generic smooth body rule
assigned = [bool(v.groups) for v in mesh.data.vertices]
gen = [vi for vi, a in enumerate(assigned) if not a]
buckets = {}
for vi in gen:
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
    for vi, w in items:
        groups[nm].add([vi], w, "REPLACE")

mesh.parent = arm
mesh.modifiers.new("Tuantuan skin", "ARMATURE").object = arm

# --------------------------------------------------------- filler blobs
SKIN = (.83, .54, .36, 1)
YELLOW = (.80, .59, .30, 1)


def clay_mat(name, color, rough=.62):
    m = bpy.data.materials.new(name)
    m.diffuse_color = color
    m.use_nodes = True
    sh = m.node_tree.nodes.get("Principled BSDF")
    sh.inputs["Base Color"].default_value = color
    sh.inputs["Roughness"].default_value = rough
    sh.inputs["Specular IOR Level"].default_value = .35 if "Specular IOR Level" in sh.inputs else .5
    return m


skin_mat = clay_mat("clay filler skin", SKIN)
sleeve_mat = clay_mat("clay filler sleeve", YELLOW)
fillers = []


def ellipsoid(name, center, radii, mat, weights):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, location=center)
    o = bpy.context.object
    o.name = name
    o.scale = radii
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.shade_smooth()
    o.data.materials.append(mat)
    o.parent = arm
    allv = [v.index for v in o.data.vertices]
    for nm, w in weights:
        vg = o.vertex_groups.new(name=nm)
        vg.add(allv, w, "REPLACE")
    o.modifiers.new("skin", "ARMATURE").object = arm
    fillers.append(o)


for sgn, nm in ((-1, "L"), (1, "R")):
    # shoulder sleeve cap (hides gap between sleeve chips and torso)
    ellipsoid(f"shoulderSleeve.{nm}", (sgn * .30, 0, 1.80),
              (.15, .14, .17), sleeve_mat,
              [("Chest", .55), (f"UpperArm.{nm}", .45)])
    # upper arm liner, inside the skin arm chips
    ellipsoid(f"upperArmLiner.{nm}", (sgn * .47, -.01, 1.55),
              (.062, .058, .26), skin_mat,
              [(f"UpperArm.{nm}", .8), ("Chest", .2)])
    # elbow cushion
    ellipsoid(f"elbow.{nm}", (sgn * .595, -.01, 1.30),
              (.075, .07, .075), skin_mat,
              [(f"UpperArm.{nm}", .5), (f"Forearm.{nm}", .5)])
    # hip cushion so thigh swing stays inside the loose shorts
    ellipsoid(f"hip.{nm}", (sgn * .175, -.01, .93),
              (.13, .12, .13), skin_mat,
              [("Hips", .55), (f"Thigh.{nm}", .45)])

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
bpy.context.scene.cycles.samples = 20
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


def pose(name, fn):
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = (1, 0, 0, 0)
    fn()
    bpy.context.view_layer.update()


def rest_basis(nm):
    return arm.pose.bones[nm].bone.matrix_local.to_3x3()


def setq(nm, mat):
    pb = arm.pose.bones[nm]
    pb.rotation_quaternion = (rest_basis(nm).inverted() @ mat @ rest_basis(nm)).to_quaternion()


from mathutils import Matrix as M

def p_idle(): pass
def p_wave():
    setq("UpperArm.R", M.Rotation(-2.0, 3, "Y"))
    setq("Forearm.R", M.Rotation(.5, 3, "Y"))
def p_cheer():
    setq("UpperArm.R", M.Rotation(-2.5, 3, "Y"))
    setq("UpperArm.L", M.Rotation(2.5, 3, "Y"))
def p_read():
    setq("UpperArm.R", M.Rotation(1.25, 3, "X") @ M.Rotation(-.35, 3, "Y"))
    setq("UpperArm.L", M.Rotation(1.25, 3, "X") @ M.Rotation(.35, 3, "Y"))
    setq("Forearm.R", M.Rotation(-.9, 3, "X"))
    setq("Forearm.L", M.Rotation(-.9, 3, "X"))
def p_walk():
    setq("Thigh.R", M.Rotation(.45, 3, "X"))
    setq("Shin.R", M.Rotation(-.5, 3, "X"))
    setq("Thigh.L", M.Rotation(-.45, 3, "X"))
    setq("Shin.L", M.Rotation(.25, 3, "X"))
    setq("UpperArm.R", M.Rotation(-.4, 3, "X"))
    setq("UpperArm.L", M.Rotation(.4, 3, "X"))

poses = [("idle", p_idle), ("wave", p_wave), ("cheer", p_cheer), ("read", p_read), ("walk", p_walk)]
if DO_RENDER:
    sheets = []
    views = [(0, -6, 3.0), (2.6, -5.2, 2.9)]
    for vi, place in enumerate(views):
        tiles = []
        for nm, fn in poses:
            pose(nm, fn)
            cam.location = place
            look_at(cam, (0, 0, 1.55))
            fp = ART / "face-work" / f"v2_{nm}_{vi}.png"
            bpy.context.scene.render.filepath = str(fp)
            bpy.ops.render.render(write_still=True)
            tiles.append(fp)
    # reset pose before export
    pose("idle", p_idle)

if not RENDER_ONLY:
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True); mesh.select_set(True)
    for f in fillers:
        f.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=str(OUT_GLB), export_format="GLB", use_selection=True,
        export_animations=False, export_cameras=False, export_lights=False)
    print("EXPORTED", OUT_GLB)
print("RIG_V2_DONE", len(mesh.data.polygons))
