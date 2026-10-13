"""Add an interpretive pedestal below the licensed Liberty statue model."""
from pathlib import Path
import bpy

root=Path(__file__).resolve().parents[1]
source=root/'artifacts/landmarks-v2/optimized/liberty-exterior.glb'
dest=root/'frontend/assets/landmarks-v2/liberty-exterior.glb'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))
for ob in bpy.context.scene.objects:
    if ob.type=='MESH':ob.location.z+=7.5

stone=bpy.data.materials.new('Pedestal sandstone study');stone.diffuse_color=(.56,.52,.44,1)
stone.use_nodes=True;stone.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.56,.52,.44,1)
trim=bpy.data.materials.new('Pedestal molding study');trim.diffuse_color=(.75,.71,.61,1)
trim.use_nodes=True;trim.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.75,.71,.61,1)

def block(name,loc,scale,mat):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    ob=bpy.context.object;ob.name=name
    ob.dimensions=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    ob.data.materials.append(mat)
    bevel=ob.modifiers.new('Stone edge','BEVEL');bevel.width=.10;bevel.segments=2
    ob.modifiers.new('Weighted normals','WEIGHTED_NORMAL')

for z,w,h,mat in [(.18,8.2,.36,trim),(.48,7.8,.24,stone),(.9,7.2,.5,trim),
                    (3.8,6.3,5.2,stone),(6.55,7.0,.32,trim),(7.06,6.8,.6,stone)]:
    block('Liberty pedestal — educational reconstruction',(0,0,z),(w,w,h),mat)
for side in [-1,1]:
    for x in [-2.3,0,2.3]:
        block('Recessed pedestal panel',(x,side*3.18,3.9),(1.45,.05,3.55),trim)
        block('Recessed pedestal panel',(side*3.18,x,3.9),(.05,1.45,3.55),trim)
for i in range(8):
    block('Visitor approach steps',(0,-5.2+i*.34,.12+i*.10),(3.5,2.8-i*.16,.20),stone)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',export_apply=True,export_yup=True,
                          export_cameras=False,export_lights=False)
print('ENHANCED',dest,dest.stat().st_size)
