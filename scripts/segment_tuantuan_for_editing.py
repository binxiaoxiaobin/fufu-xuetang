# -*- coding: utf-8 -*-
"""Split the existing rigged sculpt into editable anatomical parts.

This works on disconnected islands in the downloaded Tripo mesh. It does not
replace the website GLB: the result is a Blender source for further sculpting.
"""
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "artifacts/tuantuan-girl/tuantuan-girl-original-rig.blend"
OUTPUT = ROOT / "artifacts/tuantuan-girl/tuantuan-girl-original-editable-parts.blend"
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
sculpt = bpy.data.objects["Tuantuan Clay Character"]


def islands_by_region(obj):
    mesh = obj.data
    parent = list(range(len(mesh.vertices)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for edge in mesh.edges:
        a, b = edge.vertices
        parent[find(a)] = find(b)
    islands = {}
    for vertex in mesh.vertices:
        islands.setdefault(find(vertex.index), []).append(vertex.index)

    regions = {key: [] for key in ("Head", "Backpack", "Leg.L", "Leg.R", "Torso")}
    for ids in islands.values():
        center = sum((mesh.vertices[i].co for i in ids), Vector()) / len(ids)
        x, y, z = center
        if z > 1.94:
            region = "Head"
        elif z > 1.08 and y > .19 and abs(x) < .66:
            region = "Backpack"
        elif z < 1.30 and abs(x) > .10 and y < .25:
            region = "Leg.L" if x < 0 else "Leg.R"
        else:
            region = "Torso"
        regions[region].extend(ids)
    return regions


def separate_region(obj, label):
    target = islands_by_region(obj)[label]
    if not target:
        raise RuntimeError(f"No vertices classified as {label}")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for index in target:
        obj.data.vertices[index].select = True
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")
    new = [item for item in bpy.context.selected_objects if item is not obj]
    if len(new) != 1:
        raise RuntimeError(f"Unexpected result separating {label}: {len(new)}")
    part = new[0]
    part.name = f"Source.{label}"
    print("PART", part.name, len(part.data.vertices), len(part.data.polygons))
    return part


for name in ("Head", "Backpack", "Leg.L", "Leg.R"):
    separate_region(sculpt, name)
sculpt.name = "Source.Torso"
print("PART", sculpt.name, len(sculpt.data.vertices), len(sculpt.data.polygons))

# Keep the rig and the replacement clay parts in the file. Each anatomical
# source piece still carries its armature modifier, weights, and shape keys.
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT))
