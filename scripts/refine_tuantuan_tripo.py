"""Prepare the Tripo character for the tablet preview and save a Blender source.

The downloaded GLB remains untouched in artifacts/tuantuan-girl. This script
normalizes scale, reduces the dense generated mesh, and renders review angles.
"""

from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "artifacts" / "tuantuan-girl"
SOURCE = ART / "tuantuan-girl-tripo-source.glb"
OUT_GLB = ROOT / "frontend" / "assets" / "characters" / "tuantuan-girl-tripo.glb"
OUT_BLEND = ART / "tuantuan-girl-tripo-refined.blend"

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))

meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
if len(meshes) != 1:
    raise RuntimeError(f"Expected one character mesh; found {len(meshes)}")
girl = meshes[0]
girl.name = "Tuantuan Girl · Tripo H2.5"
girl.data.name = "Tuantuan Girl · optimized mesh"
girl.scale = (3.2, 3.2, 3.2)
bpy.context.view_layer.objects.active = girl
girl.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

# The source is 458,500 triangles. Keep a generous budget for the face, hair,
# laces and backpack while making the GLB less costly on a tablet.
original_faces = len(girl.data.polygons)
modifier = girl.modifiers.new("Tablet mesh reduction", "DECIMATE")
modifier.ratio = min(1.0, 160_000 / original_faces)
modifier.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=modifier.name)

root = bpy.data.objects.new("tuantuan-girl-tripo-root", None)
bpy.context.collection.objects.link(root)
girl.parent = root
root["source"] = "Tripo Studio H2.5, generated 2026-09-28"
root["source_file"] = SOURCE.name

# Export only the character, without Blender studio lights, floor or camera.
bpy.ops.object.select_all(action="DESELECT")
root.select_set(True)
girl.select_set(True)
bpy.context.view_layer.objects.active = root
bpy.ops.export_scene.gltf(
    filepath=str(OUT_GLB),
    export_format="GLB",
    use_selection=True,
    export_cameras=False,
    export_lights=False,
    export_yup=True,
)


def material(name, color, roughness=1.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    principled = mat.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*color, 1)
    principled.inputs["Roughness"].default_value = roughness
    return mat


floor_mat = material("warm cream studio floor", (0.84, 0.81, 0.73))
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.015))
floor = bpy.context.object
floor.name = "Studio floor · render only"
floor.data.materials.append(floor_mat)

world = bpy.context.scene.world
world.use_nodes = True
background = world.node_tree.nodes.get("Background")
background.inputs["Color"].default_value = (0.77, 0.77, 0.72, 1)
background.inputs["Strength"].default_value = 0.65


def aim(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


def light(name, location, energy, size):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    aim(obj, (0, 0, 1.6))


light("large soft key", (-4, -5, 6), 500, 5)
light("front fill", (4, -3, 4), 300, 5)
light("hair rim", (0, 4, 5), 500, 4)

camera_data = bpy.data.cameras.new("review camera")
camera = bpy.data.objects.new("review camera", camera_data)
bpy.context.collection.objects.link(camera)
camera_data.type = "ORTHO"
camera_data.ortho_scale = 4.0
camera.location = (0, -6, 3.3)
aim(camera, (0, 0, 1.62))
bpy.context.scene.camera = camera

bpy.context.scene.render.engine = "CYCLES"
bpy.context.scene.cycles.samples = 24
bpy.context.scene.render.resolution_x = 1000
bpy.context.scene.render.resolution_y = 1000
bpy.context.scene.render.resolution_percentage = 100
bpy.context.scene.render.image_settings.file_format = "PNG"
bpy.context.scene.view_settings.view_transform = "AgX"

bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND))

for angle, location in (
    ("front", (0, -6, 3.3)),
    ("side", (6, 0, 3.3)),
    ("back", (0, 6, 3.3)),
):
    camera.location = location
    aim(camera, (0, 0, 1.62))
    bpy.context.scene.render.filepath = str(ART / f"tuantuan-girl-tripo-{angle}.png")
    bpy.ops.render.render(write_still=True)

print(f"Source faces: {original_faces}")
print(f"Preview faces: {len(girl.data.polygons)}")
print(f"Blender source: {OUT_BLEND}")
print(f"GLB preview: {OUT_GLB}")
