"""Temporary visual study of Blender's automatic armature weights."""

from pathlib import Path
import bpy
from mathutils import Matrix, Vector

root = Path(__file__).resolve().parent.parent
source = root / "artifacts/tuantuan-girl/tuantuan-girl-tripo-source.glb"
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))
mesh = next(o for o in bpy.context.scene.objects if o.type == "MESH")
mesh.scale = (3.2,) * 3
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
mod = mesh.modifiers.new("reduce", "DECIMATE")
mod.ratio = 80000 / len(mesh.data.polygons)
bpy.ops.object.modifier_apply(modifier=mod.name)
mesh.data.remesh_voxel_size = .012
bpy.ops.object.voxel_remesh()
print("VOXEL_FACES", len(mesh.data.polygons))
mat = bpy.data.materials.new("Clay study")
mat.diffuse_color = (.75, .68, .57, 1)
mesh.data.materials.clear()
mesh.data.materials.append(mat)
arm_data = bpy.data.armatures.new("auto armature")
arm = bpy.data.objects.new("Rig", arm_data)
bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")


def bone(name, head, tail, parent=None):
    o = arm_data.edit_bones.new(name)
    o.head = Vector(head) * 3.2
    o.tail = Vector(tail) * 3.2
    if parent:
        o.parent = arm_data.edit_bones[parent]


bone("Hips", (0, 0, .30), (0, 0, .38))
bone("Spine", (0, 0, .38), (0, 0, .63), "Hips")
bone("Head", (0, 0, .63), (0, 0, .9), "Spine")
for side, sign in (("L", -1), ("R", 1)):
    bone(f"Arm.{side}", (sign * .125, 0, .58), (sign * .20, 0, .32), "Spine")
    bone(f"Leg.{side}", (sign * .08, 0, .31), (sign * .08, 0, .04), "Hips")
bpy.ops.object.mode_set(mode="OBJECT")
bpy.ops.object.select_all(action="DESELECT")
mesh.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
print("GROUPS", [v.name for v in mesh.vertex_groups])

right = arm.pose.bones["Arm.R"]
basis = right.bone.matrix_local.to_3x3()
right.rotation_mode = "QUATERNION"
right.rotation_quaternion = (basis.inverted() @ Matrix.Rotation(-1.15, 3, "Y") @ basis).to_quaternion()

bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.02))
camera_data = bpy.data.cameras.new("camera")
camera = bpy.data.objects.new("camera", camera_data)
bpy.context.collection.objects.link(camera)
camera_data.type, camera_data.ortho_scale = "ORTHO", 4.0
camera.location = (0, -6, 3.3)
camera.rotation_euler = (Vector((0, 0, 1.62)) - camera.location).to_track_quat("-Z", "Y").to_euler()
bpy.context.scene.camera = camera
for pos, power in (((-4, -5, 6), 500), ((4, -3, 4), 300)):
    data = bpy.data.lights.new("soft", "AREA")
    data.energy, data.shape, data.size = power, "DISK", 5
    obj = bpy.data.objects.new("soft", data)
    bpy.context.collection.objects.link(obj)
    obj.location = pos
    obj.rotation_euler = (Vector((0, 0, 1.6)) - obj.location).to_track_quat("-Z", "Y").to_euler()
bpy.context.scene.render.engine = "CYCLES"
bpy.context.scene.cycles.samples = 12
bpy.context.scene.render.resolution_x = bpy.context.scene.render.resolution_y = 850
bpy.context.scene.render.filepath = str(root / "artifacts/tuantuan-girl/tuantuan-voxel-weights.png")
bpy.ops.render.render(write_still=True)
