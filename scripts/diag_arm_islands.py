# -*- coding: utf-8 -*-
"""Render wave pose with arm-flagged islands glowing white (diagnostic)."""
import bpy
from pathlib import Path
from mathutils import Matrix

ROOT = Path(r"d:\福福学堂")
SOURCE = ROOT / "artifacts/tuantuan-girl/tuantuan-girl-tripo-source.glb"
OUTDIR = ROOT / "artifacts/tuantuan-girl/face-work"
SCALE = 3.2

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
mesh = next(o for o in bpy.context.scene.objects if o.type == "MESH")
mesh.scale = (SCALE,) * 3
bpy.context.view_layer.objects.active = mesh
mesh.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
mod = mesh.modifiers.new("dec", "DECIMATE")
mod.ratio = min(1.0, 80_000 / len(mesh.data.polygons))
mod.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=mod.name)

parents = list(range(len(mesh.data.vertices)))


def find(i):
    while parents[i] != i:
        parents[i] = parents[parents[i]]
        i = parents[i]
    return i


for e in mesh.data.edges:
    a, b = e.vertices
    parents[find(a)] = find(b)
islands = {}
for v in mesh.data.vertices:
    c = islands.setdefault(find(v.index), [0.0, 0.0, 0.0, 0])
    c[0] += v.co.x; c[1] += v.co.y; c[2] += v.co.z; c[3] += 1
arm_islands = set()
for i, (sx, sy, sz, n) in islands.items():
    cx, cy, cz = sx / n, sy / n, sz / n
    if (1.08 < cz < 2.08 and cy < .23 and abs(cx) > .255) or (
            .90 < cz <= 1.08 and cy < .20 and abs(cx) > .35):
        arm_islands.add(i)
print("arm islands", len(arm_islands))

# armature (same as build script)
arm_data = bpy.data.armatures.new("rig")
arm = bpy.data.objects.new("rig", arm_data)
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

g = mesh.vertex_groups.new(name="Arm")
armv = [vi for vi in range(len(mesh.data.vertices)) if find(vi) in arm_islands]
g.add(armv, 1.0, "REPLACE")
g2 = mesh.vertex_groups.new(name="Rest")
g2.add([vi for vi in range(len(mesh.data.vertices)) if find(vi) not in arm_islands], 1.0, "REPLACE")
sk = mesh.modifiers.new("skin", "ARMATURE")
sk.object = arm

# pose: raise R arm sideways like the build script wave
rb = arm.pose.bones["UpperArm.R"]
rb.rotation_mode = "QUATERNION"
rb.rotation_quaternion = (rb.bone.matrix_local.to_3x3().inverted()
                          @ Matrix.Rotation(-1.25, 3, "Y")
                          @ rb.bone.matrix_local.to_3x3()).to_quaternion()

# emission-only material via vertex color: make 2 materials
mat_arm = bpy.data.materials.new("armflag")
mat_arm.use_nodes = True
nt = mat_arm.node_tree
nt.nodes.clear()
out = nt.nodes.new("ShaderNodeOutputMaterial")
em = nt.nodes.new("ShaderNodeEmission")
em.inputs["Color"].default_value = (0.95, 0.95, 1.0, 1)
em.inputs["Strength"].default_value = 1.6
nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
mat_rest = bpy.data.materials.new("restflag")
mat_rest.use_nodes = True
nt = mat_rest.node_tree
nt.nodes.clear()
out = nt.nodes.new("ShaderNodeOutputMaterial")
em = nt.nodes.new("ShaderNodeEmission")
em.inputs["Color"].default_value = (0.09, 0.07, 0.06, 1)
em.inputs["Strength"].default_value = 1.0
nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
mesh.data.materials.clear()
mesh.data.materials.append(mat_rest)
mesh.data.materials.append(mat_arm)
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="DESELECT")
bpy.ops.object.mode_set(mode="OBJECT")
for vi in armv:
    mesh.data.vertices[vi].select = True
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_more()
bpy.ops.object.mode_set(mode="OBJECT")
# assign by polygon island membership instead (reliable):
me = mesh.data
for p in me.polygons:
    p.material_index = 1 if find(p.vertices[0]) in arm_islands else 0

# camera & render
cam_data = bpy.data.cameras.new("c")
cam = bpy.data.objects.new("c", cam_data)
bpy.context.collection.objects.link(cam)
cam_data.type = "ORTHO"
cam_data.ortho_scale = 4.2
cam.location = (0, -6, 3.0)
cam.rotation_euler = (1.276, 0, 0)
bpy.context.scene.camera = cam
bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in dir(bpy.context.scene.render) else "BLENDER_EEVEE"
bpy.context.scene.render.resolution_x = 760
bpy.context.scene.render.resolution_y = 760
bpy.context.scene.render.filepath = str(OUTDIR / "diag_arm_flag.png")
bpy.ops.render.render(write_still=True)
print("RENDERED")
