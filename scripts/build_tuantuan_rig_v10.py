# -*- coding: utf-8 -*-
"""V10 rig: refine the scarf repair to match the original coral clay.

blender --background --python scripts/build_tuantuan_rig_v10.py -- [render]
"""
import sys
from pathlib import Path
from math import cos, exp, pi, sin
import bmesh
import bpy
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parent.parent
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
    # Only remove the arm's skin and yellow sleeve islands. Broad spatial
    # deletion also removed sage backpack panels and its rolled blanket.
    if ax > .335 and -.17 < cy < .15 and .95 < cz < 2.05 and kind in ("skin", "yellow"):
        del_roots.add(root)
    elif .26 < ax <= .335 and -.17 < cy < .13 and 1.52 < cz < 2.03 and kind == "yellow":
        del_roots.add(root)
    elif .23 < ax <= .335 and -.27 < cy <= -.17 and 1.60 < cz < 1.94 and kind == "skin":
        del_roots.add(root)
del_verts = sorted({vi for root in del_roots for vi in islands[root]})
print("delete islands", len(del_roots), "verts", len(del_verts))
for root in sorted(del_roots, key=lambda r: len(islands[r]), reverse=True)[:5]:
    print("deleted", len(islands[root]), tuple(round(c, 3) for c in is_centroid[root]),
          ctype(colormean[root]), tuple(round(c, 2) for c in colormean[root]))

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
    eye = max(exp(-((x - s * .060) / .055) ** 2 - ((z - .755) / .060) ** 2)
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
    bone(f"Thigh.{nm}", (sgn * .068, 0, .36), (sgn * .080, 0, .17), "Hips")
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
    if abs(c.x) > .10 and c.y < .25 and (c.z < .93 or (
        c.z < 1.11 and abs(c.x) > .25 and kind == "skin"
    )):
        side = "L" if c.x < 0 else "R"
        leg_island_verts[root] = ({f"Thigh.{side}": 1.0}, ids)
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
mat_sage = clay_mat("clay sage", (.24, .35, .23), rough=.66)
mat_scarf = clay_mat("clay scarf repair", (.72, .075, .028), rough=.62)
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
    # One continuous surface from the fabric shoulder to the closed mitten.
    # A sewn sleeve edge is represented by the radius step, not a loose cone.
    profile = [  # height, horizontal reach, depth, radius, material
        (1.925, .305, .005, .035, 0),
        (1.900, .322, .002, .086, 0),
        (1.855, .355, .000, .128, 0),
        (1.790, .405, -.002, .134, 0),
        (1.700, .467, -.004, .127, 0),
        (1.610, .520, -.005, .109, 0),
        (1.575, .532, -.005, .105, 0),
        (1.555, .537, -.005, .101, 0),
        (1.548, .540, -.005, .078, 1),
        (1.485, .561, -.004, .075, 1),
        (1.420, .581, -.003, .074, 1),
        (1.376, .592, -.002, .076, 1),
        (1.315, .599, -.003, .074, 1),
        (1.235, .608, -.006, .070, 1),
        (1.155, .617, -.010, .066, 1),
        (1.095, .623, -.018, .070, 1),
        (1.050, .626, -.025, .088, 1),
        (1.005, .629, -.030, .090, 1),
        (.967, .630, -.032, .075, 1),
        (.943, .630, -.032, .045, 1),
        (.934, .630, -.032, .008, 1),
    ]
    ring_sides = 32
    vertices, faces, face_mats, ring_heights = [], [], [], []
    for index, (height, reach, depth, radius, material) in enumerate(profile):
        ring_heights.append(height)
        for side_i in range(ring_sides):
            angle = side_i * 2 * pi / ring_sides
            vertices.append((sgn * reach + radius * cos(angle),
                             depth + radius * sin(angle), height))
        if index:
            for side_i in range(ring_sides):
                a = (index - 1) * ring_sides + side_i
                b = (index - 1) * ring_sides + (side_i + 1) % ring_sides
                c = index * ring_sides + (side_i + 1) % ring_sides
                d = index * ring_sides + side_i
                faces.append((a, b, c, d))
                face_mats.append(material)
    faces.append(tuple(reversed(range(ring_sides))))
    face_mats.append(0)
    last = (len(profile) - 1) * ring_sides
    faces.append(tuple(last + j for j in range(ring_sides)))
    face_mats.append(1)
    arm_mesh = bpy.data.meshes.new(f"Continuous clay arm mesh {nm}")
    arm_mesh.from_pydata(vertices, [], faces)
    arm_mesh.materials.append(mat_sleeve)
    arm_mesh.materials.append(mat_skin)
    arm_mesh.update()
    arm_obj = bpy.data.objects.new(f"continuousArm.{nm}", arm_mesh)
    bpy.context.collection.objects.link(arm_obj)
    arm_obj.parent = arm
    arm_groups = {name: arm_obj.vertex_groups.new(name=name) for name in ("Chest", ua, fa, hd)}
    for ring_i, height in enumerate(ring_heights):
        shoulder_blend = smooth(1.79, 1.91, height)
        elbow_blend = smooth(1.30, 1.45, height)
        wrist_blend = smooth(1.08, 1.15, height)
        weights = {
            "Chest": shoulder_blend,
            ua: (1 - shoulder_blend) * elbow_blend,
            fa: (1 - shoulder_blend) * (1 - elbow_blend) * wrist_blend,
            hd: (1 - shoulder_blend) * (1 - elbow_blend) * (1 - wrist_blend),
        }
        ids = list(range(ring_i * ring_sides, (ring_i + 1) * ring_sides))
        for name, weight in weights.items():
            if weight > 1e-5:
                arm_groups[name].add(ids, weight, "REPLACE")
    arm_obj.modifiers.new("Continuous clay skin", "ARMATURE").object = arm
    for polygon, material in zip(arm_mesh.polygons, face_mats):
        polygon.material_index = material
        polygon.use_smooth = True
    parts.append(arm_obj)
    # A small mitten thumb is sunk into the palm. It follows the hand bone.
    ball(f"thumb.{nm}", (sgn * .568, -.087, 1.015), (.041, .037, .046),
         mat_skin, [(hd, 1)], seg=20)
    # The shoulder socket remains under the sleeve while the arm is raised.
    ball(f"socket.{nm}", (sgn * .297, .013, 1.816), (.092, .098, .115),
         mat_sleeve, [("Chest", 1)])
    ball(f"underarmFill.{nm}", (sgn * .285, .105, 1.655), (.105, .140, .175),
         mat_sleeve, [("Chest", 1)])
    # The AI sculpt has no continuous shirt beneath the strap and sleeve.
    # Sink this volume into the chest so the side view stays closed in motion.
    ball(f"sideTorso.{nm}", (sgn * .235, -.055, 1.665), (.155, .155, .235),
         mat_sleeve, [("Chest", 1)])

# The source sculpt leaves a triangular opening high on the shirt.  The side
# patches stop short of the centre, so a raised arm exposes the scene behind
# the scarf.  Keep this volume under the original shirt, straps and scarf.
ball("upperChestFill", (0, .045, 1.805), (.325, .185, .235),
     mat_sleeve, [("Chest", 1)], seg=40)

# merge the two sockets into one static outfit-patch object
sockets = [o for o in bpy.data.objects if o.name.startswith(("socket.", "underarmFill.", "sideTorso.", "upperChestFill"))]
patches = join(sockets, "outfitPatches")

# Two flat sewn suspender straps sit in front of the shirt and fill.  The
# earlier round curves were inside the chest volume and disappeared in idle.
def strap_ribbon(name, points, width=.082, thickness=.022):
    verts, faces = [], []
    for x, y, z in points:
        verts.extend(((x-width/2, y-thickness/2, z),
                      (x+width/2, y-thickness/2, z),
                      (x+width/2, y+thickness/2, z),
                      (x-width/2, y+thickness/2, z)))
    for i in range(len(points)-1):
        a, b = i*4, (i+1)*4
        for j in range(4):
            faces.append((a+j, a+(j+1)%4, b+(j+1)%4, b+j))
    faces += [(3, 2, 1, 0), tuple((len(points)-1)*4+j for j in range(4))]
    data = bpy.data.meshes.new(name+" mesh")
    data.from_pydata(verts, [], faces); data.update()
    data.materials.append(mat_sage)
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True); bpy.context.view_layer.objects.active = obj
    bevel = obj.modifiers.new("soft sewn edge", "BEVEL")
    bevel.width = .010; bevel.segments = 3
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    bind(obj, [("Chest", 1)])
    return obj

for sgn, nm in ((-1, "L"), (1, "R")):
    strap_ribbon(f"strap.{nm}", [
        (sgn*.245, -.382, 1.565), (sgn*.253, -.424, 1.665),
        (sgn*.286, -.402, 1.775), (sgn*.320, -.338, 1.875),
        (sgn*.336, -.145, 1.944), (sgn*.319, .083, 1.917),
        (sgn*.275, .226, 1.775)])

# The original collar is full on the character's right but almost absent on
# the left. A soft tapered-looking arc reconnects the left neck to the knot.
collar = bpy.data.curves.new("left scarf collar curve", "CURVE")
collar.dimensions = "3D"
collar.resolution_u = 18
collar.bevel_depth = .030
collar.bevel_resolution = 6
arc = collar.splines.new("BEZIER")
scarf_points = [(-.170, -.365, 1.927), (-.130, -.411, 1.869),
                (-.056, -.445, 1.824), (-.018, -.445, 1.814)]
arc.bezier_points.add(len(scarf_points)-1)
for bp, co in zip(arc.bezier_points, scarf_points):
    bp.co = co
    bp.handle_left_type = bp.handle_right_type = "AUTO"
scarf_obj = bpy.data.objects.new("scarfRepair.leftCollar", collar)
bpy.context.collection.objects.link(scarf_obj)
scarf_obj.data.materials.append(mat_scarf)
bpy.ops.object.select_all(action="DESELECT")
scarf_obj.select_set(True); bpy.context.view_layer.objects.active = scarf_obj
bpy.ops.object.convert(target="MESH")
bind(bpy.context.object, [("Chest", 1)])

# merge all Chest-weighted patches
static_objs = [o for o in bpy.data.objects
               if o.name.startswith(("outfitPatches", "strap.", "buckle.", "scarfRepair."))]
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
if RENDER_ONLY:
    for vi, place in enumerate(views):
        for nm, fn in poses:
            reset_pose()
            fn()
            bpy.context.view_layer.update()
            cam.location = place
            look_at(cam, (0, 0, 1.55))
            fp = ART / "face-work" / f"v4_{nm}_{vi}.png"
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
    bpy.ops.wm.save_as_mainfile(filepath=str(ART / "tuantuan-girl-rigged-v10.blend"))
print("RIG_V10_DONE tris=", len(mesh.data.polygons))
