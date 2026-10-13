"""Render a few frames of a Meshy rig export for visual diagnosis."""

import math
import os
import sys

import bpy
from mathutils import Vector


source = sys.argv[sys.argv.index("--") + 1]
output = sys.argv[sys.argv.index("--") + 2]
os.makedirs(output, exist_ok=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=source)

meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and len(obj.data.vertices) > 1000]
armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
print("MESHY_INSPECT meshes", [(obj.name, len(obj.data.vertices), len(obj.data.polygons)) for obj in meshes])
print("MESHY_INSPECT armatures", [(obj.name, len(obj.data.bones)) for obj in armatures])
print("MESHY_INSPECT actions", [(action.name, tuple(action.frame_range)) for action in bpy.data.actions])

corners = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
low = Vector(tuple(min(point[axis] for point in corners) for axis in range(3)))
high = Vector(tuple(max(point[axis] for point in corners) for axis in range(3)))
center = (low + high) / 2
height = high.z - low.z
print("MESHY_INSPECT bounds", tuple(low), tuple(high))

camera_data = bpy.data.cameras.new("Inspection camera")
camera = bpy.data.objects.new("Inspection camera", camera_data)
bpy.context.collection.objects.link(camera)
bpy.context.scene.camera = camera
camera.location = center + Vector((0, (1 if "--rear" in sys.argv else -1) * max(height * 2.2, 3), height * 0.08))
direction = center - camera.location
camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
camera_data.type = "ORTHO"
camera_data.ortho_scale = height * 1.45

world = bpy.data.worlds.new("Inspection ambient")
bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes.get("Background").inputs["Color"].default_value = (0.28, 0.3, 0.34, 1)
world.node_tree.nodes.get("Background").inputs["Strength"].default_value = 1

for name, location, energy, size in [
    ("Key", center + Vector((-2, -3, 4)), 700, 4),
    ("Fill", center + Vector((3, -1, 2)), 400, 3),
]:
    lamp_data = bpy.data.lights.new(name, "AREA")
    lamp_data.energy = energy
    lamp_data.shape = "DISK"
    lamp_data.size = size
    lamp = bpy.data.objects.new(name, lamp_data)
    bpy.context.collection.objects.link(lamp)
    lamp.location = location
    lamp.rotation_euler = (center - lamp.location).to_track_quat("-Z", "Y").to_euler()

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 640
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"

action = next(iter(bpy.data.actions), None)
if action:
    start, end = action.frame_range
    frames = [round(start), round(start + (end - start) * 0.25), round(start + (end - start) * 0.5), round(start + (end - start) * 0.75)]
else:
    frames = [0]
for frame in frames:
    scene.frame_set(frame)
    scene.render.filepath = os.path.join(output, f"frame-{frame:03d}.png")
    bpy.ops.render.render(write_still=True)
    print("MESHY_INSPECT rendered", scene.render.filepath)
