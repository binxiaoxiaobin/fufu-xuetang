"""Make a lightweight, skinned Tuantuan for the clay safari.

Keeps the Meshy surface and clips, reduces geometry/texture size, and places
small clay underlays beneath the neck and sleeves where animation exposes gaps.
"""

import collections
import sys

import bpy


source, blend_path, glb_path = sys.argv[sys.argv.index("--") + 1 : sys.argv.index("--") + 4]
bpy.ops.import_scene.gltf(filepath=source)
mesh = max((obj for obj in bpy.context.scene.objects if obj.type == "MESH"), key=lambda obj: len(obj.data.vertices))
armature = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")

# Meshy assigned some detached hand fragments to leg bones. Keep their arm
# influences and renormalize without changing the torso or head weights.
parent = list(range(len(mesh.data.vertices)))


def root(index):
    while parent[index] != index:
        parent[index] = parent[parent[index]]
        index = parent[index]
    return index


for edge in mesh.data.edges:
    a, b = edge.vertices
    parent[root(a)] = root(b)
islands = collections.defaultdict(list)
for vertex in mesh.data.vertices:
    islands[root(vertex.index)].append(vertex)
groups = {group.name: group for group in mesh.vertex_groups}
reweighted = 0
for island in islands.values():
    center = [sum((mesh.matrix_world @ vertex.co)[axis] for vertex in island) / len(island) for axis in range(3)]
    x, y, z = center
    if not (0.25 < abs(x) < 0.44 and -0.14 < y < 0.12 and 0.53 < z < 0.88):
        continue
    side = "Left" if x > 0 else "Right"
    names = [f"mixamorig:{side}{part}" for part in ("Shoulder", "Arm", "ForeArm", "Hand")]
    for vertex in island:
        weights = {mesh.vertex_groups[item.group].name: item.weight for item in vertex.groups}
        kept = {names[-1]: 1.0} if z < 0.72 else {name: weights.get(name, 0) for name in names}
        total = sum(kept.values())
        if total < 0.05:
            kept = {names[-1 if z < 0.74 else 1]: 1.0}
            total = 1.0
        for item in list(vertex.groups):
            mesh.vertex_groups[item.group].remove([vertex.index])
        for name, weight in kept.items():
            if weight > 0.001:
                groups[name].add([vertex.index], weight / total, "REPLACE")
        reweighted += 1


def material(name, color):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1)
    result.use_nodes = True
    principled = result.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*color, 1)
    principled.inputs["Roughness"].default_value = 0.83
    return result


skin = material("Underlay · warm clay skin", (0.65, 0.40, 0.29))
shirt = material("Underlay · ochre shirt", (0.70, 0.50, 0.27))
underlays = []


def underlay(name, center, scale, bone_weights, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=10, radius=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    for bone_name, weight in bone_weights.items():
        obj.vertex_groups.new(name=bone_name).add(list(range(len(obj.data.vertices))), weight, "REPLACE")
    modifier = obj.modifiers.new("Follow skeleton", "ARMATURE")
    modifier.object = armature
    obj.parent = armature
    underlays.append(obj)


# Kept inside existing surfaces: visible only when the original mesh opens.
underlay("Neck inner clay", (-0.006, 0.015, 1.115), (0.062, 0.064, 0.090), {"mixamorig:Neck": 1}, skin)
for side, sign in (("Left", 1), ("Right", -1)):
    underlay(
        f"{side} sleeve inner clay",
        (sign * 0.140, 0.015, 0.990),
        (0.048, 0.055, 0.072),
        {f"mixamorig:{side}Shoulder": 0.72, f"mixamorig:{side}Arm": 0.28},
        shirt,
    )

before_faces = len(mesh.data.polygons)
modifier = mesh.modifiers.new("Pad geometry reduction", "DECIMATE")
modifier.ratio = 0.23
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.modifier_apply(modifier=modifier.name)
after_faces = len(mesh.data.polygons)

for image in bpy.data.images:
    if image.source == "FILE" and image.size[0] > 1024 and image.size[1] > 1024:
        image.scale(1024, 1024)
        image.pack()

for action in bpy.data.actions:
    action.use_fake_user = True
bpy.context.scene.frame_set(0)
bpy.ops.wm.save_as_mainfile(filepath=blend_path)

bpy.ops.object.select_all(action="DESELECT")
armature.select_set(True)
mesh.select_set(True)
for obj in underlays:
    obj.select_set(True)
bpy.context.view_layer.objects.active = armature
bpy.ops.export_scene.gltf(
    filepath=glb_path,
    export_format="GLB",
    use_selection=True,
    export_animations=True,
    export_animation_mode="ACTIONS",
    export_cameras=False,
    export_lights=False,
)
print("TUANTUAN_SAFARI faces", before_faces, after_faces)
print("TUANTUAN_SAFARI reweighted", reweighted)
print("TUANTUAN_SAFARI actions", [action.name for action in bpy.data.actions])
print("TUANTUAN_SAFARI output", glb_path)
