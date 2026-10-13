"""Build an editable local armature and facial morphs for the Tripo character.

Tripo's free export excludes its auto-rig. Keep the untouched source asset and
create a portable, skinned GLB without depending on the service at runtime.
"""

from pathlib import Path
from math import exp
import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "artifacts" / "tuantuan-girl"
SOURCE = ART / "tuantuan-girl-tripo-source.glb"
OUT_GLB = ROOT / "frontend/assets/characters/tuantuan-girl-rigged.glb"
OUT_BLEND = ART / "tuantuan-girl-rigged.blend"
SCALE = 3.2
REPLACE_ARMS = False


def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3.0 - 2.0 * t)


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
mesh = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH")
mesh.name = "Tuantuan Clay Character"
mesh.scale = (SCALE,) * 3
bpy.context.view_layer.objects.active = mesh
mesh.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

# Decimate before making shape keys or weights, preserving the baked UV texture.
mod = mesh.modifiers.new("Tablet geometry", "DECIMATE")
mod.ratio = min(1.0, 80_000 / len(mesh.data.polygons))
mod.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=mod.name)
mesh.data.name = "Tuantuan · 80k textured triangles"

# Remove the many detached arm fragments from the generated sculpt. Their
# disconnected inner surfaces tear when bent; smooth clay arms are added below.
parents = list(range(len(mesh.data.vertices)))


def find(index):
    while parents[index] != index:
        parents[index] = parents[parents[index]]
        index = parents[index]
    return index


for edge in mesh.data.edges:
    a, b = edge.vertices
    parents[find(a)] = find(b)
islands = {}
for v in mesh.data.vertices:
    island = islands.setdefault(find(v.index), [0.0, 0.0, 0.0, 0])
    for axis in range(3):
        island[axis] += v.co[axis]
    island[3] += 1
arm_islands = set()
for island_id, (sx, sy, sz, count) in islands.items():
    cx, cy, cz = sx / count, sy / count, sz / count
    if (1.08 < cz < 2.08 and cy < .23 and abs(cx) > .255) or (
        .90 < cz <= 1.08 and cy < .20 and abs(cx) > .35
    ):
        arm_islands.add(island_id)
if REPLACE_ARMS:
    remove_vertices = {v.index for v in mesh.data.vertices if find(v.index) in arm_islands}
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for v in mesh.data.vertices:
        if v.index in remove_vertices:
            v.select = True
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.object.mode_set(mode="OBJECT")

basis = mesh.shape_key_add(name="Basis")
blink = mesh.shape_key_add(name="Blink")
happy = mesh.shape_key_add(name="Happy")
surprise = mesh.shape_key_add(name="Surprised")
for i, vert in enumerate(mesh.data.vertices):
    x, y, z = (v / SCALE for v in vert.co)
    front = 1.0 - smooth(-.12, -.07, y)
    eye = max(
        exp(-((x - side * .064) / .038) ** 2 - ((z - .744) / .039) ** 2)
        for side in (-1, 1)
    ) * front
    cheek = max(
        exp(-((x - side * .105) / .050) ** 2 - ((z - .681) / .035) ** 2)
        for side in (-1, 1)
    ) * front
    brow = max(
        exp(-((x - side * .065) / .044) ** 2 - ((z - .805) / .028) ** 2)
        for side in (-1, 1)
    ) * front
    blink.data[i].co.z -= SCALE * (z - .744) * .67 * eye
    happy.data[i].co.z += SCALE * (.011 * cheek - .004 * eye)
    surprise.data[i].co.z += SCALE * (.012 * brow + .006 * eye)


arm_data = bpy.data.armatures.new("Tuantuan deform skeleton")
arm = bpy.data.objects.new("TuantuanRig", arm_data)
bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")


def bone(name, head, tail, parent=None):
    item = arm_data.edit_bones.new(name)
    item.head = tuple(SCALE * v for v in head)
    item.tail = tuple(SCALE * v for v in tail)
    item.use_deform = True
    if parent:
        item.parent = arm_data.edit_bones[parent]
    return item


bone("Hips", (0, 0, .29), (0, 0, .37))
bone("Spine", (0, 0, .37), (0, 0, .52), "Hips")
bone("Chest", (0, 0, .52), (0, 0, .64), "Spine")
bone("Neck", (0, 0, .64), (0, 0, .69), "Chest")
bone("Head", (0, 0, .69), (0, 0, .90), "Neck")
for side, sign in (("L", -1), ("R", 1)):
    bone(f"UpperArm.{side}", (sign * .112, 0, .58), (sign * .185, 0, .43), "Chest")
    bone(f"Forearm.{side}", (sign * .185, 0, .43), (sign * .194, 0, .345), f"UpperArm.{side}")
    bone(f"Hand.{side}", (sign * .194, 0, .345), (sign * .197, 0, .31), f"Forearm.{side}")
    bone(f"Thigh.{side}", (sign * .068, 0, .31), (sign * .080, 0, .17), "Hips")
    bone(f"Shin.{side}", (sign * .080, 0, .17), (sign * .085, 0, .075), f"Thigh.{side}")
    bone(f"Foot.{side}", (sign * .085, 0, .075), (sign * .085, -.060, .035), f"Shin.{side}")
bpy.ops.object.mode_set(mode="OBJECT")
arm.display_type = "WIRE"
arm.show_in_front = True

groups = {name: mesh.vertex_groups.new(name=name) for name in arm_data.bones.keys()}
for v in mesh.data.vertices:
    x, y, z = (coord / SCALE for coord in v.co)
    side = "L" if x < 0 else "R"
    ax = abs(x)
    if not REPLACE_ARMS and find(v.index) in arm_islands:
        groups[f"UpperArm.{side}"].add([v.index], 1.0, "REPLACE")
        continue
    weights = {}

    head = smooth(.61, .69, z)
    if z > .61 and ax > .16:
        head = max(head, smooth(.61, .67, z))
    leg_part = (1.0 - smooth(.27, .345, z)) * smooth(.012, .065, ax)
    torso = max(0.0, 1.0 - head - leg_part)

    if head:
        weights["Head"] = head
    if leg_part:
        foot = 1.0 - smooth(.065, .10, z)
        thigh = smooth(.135, .19, z)
        shin = max(0.0, 1.0 - foot - thigh)
        weights[f"Thigh.{side}"] = leg_part * thigh
        weights[f"Shin.{side}"] = leg_part * shin
        weights[f"Foot.{side}"] = leg_part * foot
    if torso:
        chest = smooth(.49, .58, z)
        hips = 1.0 - smooth(.31, .39, z)
        spine = max(0.0, 1.0 - chest - hips)
        weights["Chest"] = torso * chest
        weights["Spine"] = torso * spine
        weights["Hips"] = torso * hips
    total = sum(weights.values())
    if total < 1e-6:
        weights = {"Hips": 1.0}
        total = 1.0
    for name, weight in weights.items():
        if weight > 1e-5:
            groups[name].add([v.index], weight / total, "REPLACE")

mesh.parent = arm
skin = mesh.modifiers.new("Tuantuan skin", "ARMATURE")
skin.object = arm


def clay_material(name, color):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = .76
    return mat


skin_mat = clay_material("warm peach clay · arms", (.80, .52, .37))
shirt_mat = clay_material("soft ochre clay · sleeves", (.72, .57, .34))
added_arms = []


def clay_capsule(name, start, end, radius, mat, bone_name):
    a, b = Vector(start) * SCALE, Vector(end) * SCALE
    direction = b - a
    bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=18, location=(a + b) / 2)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    obj.scale = (radius * SCALE, radius * SCALE, direction.length / 2 + radius * SCALE)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    obj.parent = arm
    group = obj.vertex_groups.new(name=bone_name)
    group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    obj.modifiers.new("Tuantuan skin", "ARMATURE").object = arm
    added_arms.append(obj)


if REPLACE_ARMS:
    for side, sign in (("L", -1), ("R", 1)):
        bind = f"UpperArm.{side}"
        clay_capsule(f"Sleeve.{side}", (sign * .120, -.006, .568), (sign * .169, -.015, .510), .056, shirt_mat, bind)
        clay_capsule(f"Arm.{side}", (sign * .171, -.016, .488), (sign * .205, -.019, .363), .034, skin_mat, bind)
        clay_capsule(f"HandClay.{side}", (sign * .205, -.019, .365), (sign * .207, -.027, .327), .040, skin_mat, bind)

bpy.ops.object.select_all(action="DESELECT")
arm.select_set(True)
mesh.select_set(True)
for part in added_arms:
    part.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.gltf(
    filepath=str(OUT_GLB), export_format="GLB", use_selection=True,
    export_animations=False, export_cameras=False, export_lights=False,
)

# Add a simple studio to the editable .blend. The exported GLB stays clean.
floor_mat = bpy.data.materials.new("warm clay studio")
floor_mat.diffuse_color = (.79, .82, .73, 1)
floor_mat.use_nodes = True
floor_mat.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = (.79, .82, .73, 1)
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.02))
bpy.context.object.name = "Preview floor"
bpy.context.object.data.materials.append(floor_mat)


def aim(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


def light(name, place, power, size):
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.shape, data.size = power, "DISK", size
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = place
    aim(obj, (0, 0, 1.6))


light("soft key", (-4, -5, 6), 500, 5)
light("soft fill", (4, -3, 4), 300, 5)
light("hair rim", (0, 4, 5), 500, 4)
camera_data = bpy.data.cameras.new("review camera")
camera = bpy.data.objects.new("review camera", camera_data)
bpy.context.collection.objects.link(camera)
camera_data.type, camera_data.ortho_scale = "ORTHO", 4.0
camera.location = (0, -6, 3.3)
aim(camera, (0, 0, 1.62))
bpy.context.scene.camera = camera
bpy.context.scene.render.engine = "CYCLES"
bpy.context.scene.cycles.samples = 24
bpy.context.scene.render.resolution_x = 900
bpy.context.scene.render.resolution_y = 900
bpy.context.scene.render.image_settings.file_format = "PNG"
bpy.context.scene.view_settings.view_transform = "AgX"
bpy.context.scene.world.color = (.7, .7, .7)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND))

# Review one clearly posed frame without changing the saved rest pose.
right = arm.pose.bones["UpperArm.R"]
rest_basis = right.bone.matrix_local.to_3x3()
right.rotation_mode = "QUATERNION"
right.rotation_quaternion = (rest_basis.inverted() @ Matrix.Rotation(-1.25, 3, "Y") @ rest_basis).to_quaternion()
happy.value = .65
bpy.context.scene.render.filepath = str(ART / "tuantuan-girl-rig-wave.png")
bpy.ops.render.render(write_still=True)

print("RIGGED_FACES", len(mesh.data.polygons))
print("BONES", [item.name for item in arm_data.bones])
print("SHAPE_KEYS", [item.name for item in mesh.data.shape_keys.key_blocks])
print("OUT_GLB", OUT_GLB)
print("OUT_BLEND", OUT_BLEND)
