"""Inspect downloaded GLBs in Blender without changing them."""
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
for file in sorted((ROOT / 'artifacts/landmarks-v2/originals').glob('*.glb')):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(file))
    bpy.context.view_layer.update()
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    verts=sum(len(o.data.vertices) for o in meshes)
    faces=sum(len(o.data.polygons) for o in meshes)
    corners=[]
    for obj in meshes:
        corners.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    if corners:
        lo=[min(v[i] for v in corners) for i in range(3)]
        hi=[max(v[i] for v in corners) for i in range(3)]
    else:lo=hi=[0,0,0]
    print('ASSET',file.stem,'objects',len(meshes),'vertices',verts,'faces',faces,
          'bounds',*[round(x,3) for x in lo],*[round(x,3) for x in hi],
          'materials',len(bpy.data.materials),'images',len(bpy.data.images))
