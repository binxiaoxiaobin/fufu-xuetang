# -*- coding: utf-8 -*-
"""Legacy local rig experiment; never publish its output directly to the preview.

The source GLB stays untouched. Decimation is applied only to the exported rig
copy, before adding armature, skin weights and optional expression shape keys.
The generated skinning is not production quality for shoulder/boot animation.
"""
import sys
from pathlib import Path
from math import exp, pi, sin, cos, radians
import bpy
from mathutils import Matrix, Vector

ROOT = Path(r"d:\福福学堂")
ART = ROOT / "artifacts/tuantuan-girl"
SOURCE = ART / "tuantuan-girl-tripo-source.glb"
OUT_GLB = ART / "tuantuan-girl-local-rig-experiment.glb"
OUT_BLEND = ART / "tuantuan-girl-local-rig-experiment.blend"
RENDER_ONLY = "render" in sys.argv
SCALE = 3.2

DO_RENDER = False


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
mesh.data.name = "Tuantuan original Tripo geometry"
source_vertices = len(mesh.data.vertices)
source_faces = len(mesh.data.polygons)
print("ORIGINAL_GEOMETRY", source_vertices, source_faces)

# Keep the original sculpt as the source of truth, but reduce the working copy
# enough to speed up deformation and make the preview lighter. UVs/materials
# remain attached to the decimated surface; no replacement geometry is added.
TARGET_FACES = 125_000
decimate = mesh.modifiers.new("Gentle decimation - preserve original sculpt", "DECIMATE")
decimate.ratio = min(1.0, TARGET_FACES / max(source_faces, 1))
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.modifier_apply(modifier=decimate.name)
working_vertices = len(mesh.data.vertices)
working_faces = len(mesh.data.polygons)
print("SIMPLIFIED_GEOMETRY", working_vertices, working_faces)

# Tripo exports a single object containing many disconnected surface islands.
# Label those components from texture color and position so clothing stays
# with the body while exposed limbs follow their own bones.
parents = list(range(working_vertices))
def find(i):
    while parents[i] != i:
        parents[i] = parents[parents[i]]
        i = parents[i]
    return i
for edge in mesh.data.edges:
    parents[find(edge.vertices[0])] = find(edge.vertices[1])
islands = {}
for vert in mesh.data.vertices:
    islands.setdefault(find(vert.index), []).append(vert.index)
img = next(im for im in bpy.data.images if im.pixels)
iw, ih = img.size
pixels = img.pixels[:]
uv = mesh.data.uv_layers.active.data
island_colors = {}
for poly in mesh.data.polygons:
    root = find(poly.vertices[0])
    sample = island_colors.setdefault(root, [])
    if len(sample) < 100:
        u, v = uv[poly.loop_start].uv
        px = min(iw - 1, max(0, int(u * iw)))
        py = min(ih - 1, max(0, int(v * ih)))
        k = (py * iw + px) * 4
        sample.append((pixels[k], pixels[k + 1], pixels[k + 2]))
island_color = {root: tuple(sum(c[i] for c in values) / len(values) for i in range(3))
                for root, values in island_colors.items()}
def ctype(rgb):
    r, g, b = rgb
    if r > .72 and g > .60 and b > .50: return "white"
    if r > .60 and g < .40 and b < .32 and r - b > .24: return "red"
    if r > .66 and g > .44 and b > .27 and r - b > .17: return "skin"
    if r > .59 and g > .40 and b < .40 and r - b > .20: return "yellow"
    if abs(r - g) < .17 and g > .30 and b > .18 and r < .66: return "sage"
    return "dark"
centroids = {}
for root, ids in islands.items():
    centroids[root] = sum((mesh.data.vertices[i].co for i in ids), Vector()) / len(ids)

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
# Find arm surface islands, then blend weights across each island at the real
# shoulder and elbow positions. Some Tripo islands include both shirt and arm;
# moving an entire island with one bone tears the shirt away from the torso.
for root, ids in islands.items():
    c = centroids[root]
    cx, cy, cz = c.x, c.y, c.z
    kind = ctype(island_color[root])
    side = "L" if cx < 0 else "R"
    ax = abs(cx)
    assigned = False
    arm_bones = [arm_data.bones[f"{part}.{side}"] for part in ("UpperArm", "Forearm", "Hand")]
    def segment_distance(point, bone):
        a, b = Vector(bone.head_local), Vector(bone.tail_local)
        ab = b - a
        t = max(0.0, min(1.0, (point - a).dot(ab) / max(ab.length_squared, 1e-8)))
        return (point - (a + t * ab)).length
    arm_distance = min(segment_distance(c, bone) for bone in arm_bones)
    arm_material = kind in ("skin", "yellow", "white") and arm_distance < .29
    shaded_arm = kind in ("sage", "dark") and ax > .30 and cz < 1.72 and arm_distance < .38
    # Rear straps and backpack fragments are behind the shoulder, even when
    # their color and distance resemble a sleeve.
    near_hand = cz < 1.16 and ax > .48
    if 0.92 < cz < 2.08 and ax > .19 and cy < .16 and (cz >= 1.16 or near_hand) and (arm_material or shaded_arm):
        for vi in ids:
            vx, vy, vz = mesh.data.vertices[vi].co
            shoulder = smooth(.25, .48, abs(vx))
            lower = smooth(.25, .35, abs(vx))
            arm_weight = lower * (1.0 - smooth(1.52, 1.66, vz)) + shoulder * smooth(1.52, 1.66, vz)
            if vz > 1.58:
                arm_weight *= 1.0 - .75 * smooth(.12, .25, vy)
            arm_weight = max(0.0, min(1.0, arm_weight))
            hand_weight = 1.0 - smooth(1.05, 1.16, vz)
            upper_weight = smooth(1.32, 1.56, vz)
            fore_weight = max(0.0, 1.0 - hand_weight - upper_weight)
            for name, value in ((f"UpperArm.{side}", upper_weight * arm_weight),
                                (f"Forearm.{side}", fore_weight * arm_weight),
                                (f"Hand.{side}", hand_weight * arm_weight),
                                ("Chest" if vz > 1.58 else "Spine", 1.0 - arm_weight)):
                if value > .001:
                    groups[name].add([vi], value, "REPLACE")
        assigned = True
    elif cz < .85 and ax > .12 and max(mesh.data.vertices[i].co.z for i in ids) < .96:
        # Boots, socks and calves can share one Tripo island. Giving the whole
        # island to its centroid's bone leaves a detached boot during a step.
        for vi in ids:
            vz = mesh.data.vertices[vi].co.z
            foot_weight = 1.0 - smooth(.20, .33, vz)
            thigh_weight = smooth(.58, .78, vz)
            shin_weight = max(0.0, 1.0 - foot_weight - thigh_weight)
            for name, value in ((f"Foot.{side}", foot_weight),
                                (f"Shin.{side}", shin_weight),
                                (f"Thigh.{side}", thigh_weight)):
                if value > .001:
                    groups[name].add([vi], value, "REPLACE")
        assigned = True
    if not assigned:
        continue

# The rest of the sculpt stays on the trunk. This keeps straps, scarf, shorts
# and backpack from being pulled toward a nearby arm or leg bone.
assigned = [bool(v.groups) for v in mesh.data.vertices]
pending = [i for i, value in enumerate(assigned) if not value]
weights_by_group = {name: [] for name in groups}
for vi in pending:
    x, y, z = (mesh.data.vertices[vi].co[k] / SCALE for k in range(3))
    head = smooth(.61, .69, z)
    neck = max(0.0, smooth(.59, .65, z) - head)
    chest = smooth(.49, .59, z)
    hips = 1.0 - smooth(.31, .43, z)
    spine = max(0.0, 1.0 - chest - hips)
    torso = max(0.0, 1.0 - head)
    values = {"Head": head, "Neck": neck, "Chest": torso * chest,
              "Spine": torso * spine, "Hips": torso * hips}
    total = sum(values.values())
    if total <= 1e-8:
        values = {"Hips": 1.0}; total = 1.0
    for name, value in values.items():
        normalized = value / total
        if normalized > .01:
            weights_by_group[name].append((vi, normalized))
for name, items in weights_by_group.items():
    for vi, weight in items:
        groups[name].add([vi], weight, "REPLACE")
print("COMPONENT_SKINNING", len(islands), "source islands")

mesh.parent = arm
mesh.modifiers.new("Tuantuan skin", "ARMATURE").object = arm

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
    if len(mesh.data.vertices) != working_vertices or len(mesh.data.polygons) != working_faces:
        raise RuntimeError("Simplified working geometry changed during rigging")
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND))
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True); mesh.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=str(OUT_GLB), export_format="GLB", use_selection=True,
        export_animations=False, export_cameras=False, export_lights=False)
    print("EXPORTED_SIMPLIFIED_COPY", OUT_GLB, working_vertices, working_faces,
          "from", source_vertices, source_faces)
