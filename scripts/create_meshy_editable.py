"""Import the combined Meshy character and preserve both actions in Blender."""

import sys

import bpy


source = sys.argv[sys.argv.index("--") + 1]
destination = sys.argv[sys.argv.index("--") + 2]

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=source)

character = max(
    (obj for obj in bpy.context.scene.objects if obj.type == "MESH"),
    key=lambda obj: len(obj.data.vertices),
)
armature = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
character.name = "Tuantuan — Meshy skin (review only)"
armature.name = "Tuantuan — Mixamo skeleton"
for action in bpy.data.actions:
    action.use_fake_user = True
    print("MESHY_EDITABLE action", action.name, tuple(action.frame_range))

bpy.context.scene.frame_set(0)
for obj in bpy.context.selected_objects:
    obj.select_set(False)
armature.select_set(True)
bpy.context.view_layer.objects.active = armature
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=destination)
print("MESHY_EDITABLE saved", destination)
