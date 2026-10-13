"""Render review images of optimized GLBs using Blender Eevee."""
from pathlib import Path
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'artifacts/landmarks-v2/optimized'
PREVIEWS=ROOT/'artifacts/landmarks-v2/previews'
PREVIEWS.mkdir(parents=True,exist_ok=True)

for file in SOURCE.glob('*-exterior.glb'):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(file))
    meshes=[ob for ob in bpy.context.scene.objects if ob.type=='MESH']
    corners=[ob.matrix_world@Vector(c) for ob in meshes for c in ob.bound_box]
    lo=Vector(tuple(min(v[i] for v in corners) for i in range(3)))
    hi=Vector(tuple(max(v[i] for v in corners) for i in range(3)))
    target=Vector((0,0,(hi.z+lo.z)/2))
    span=max(hi.x-lo.x,hi.y-lo.y,hi.z-lo.z)
    bpy.ops.object.camera_add(location=(span*1.6,-span*1.8,span*1.0+target.z))
    cam=bpy.context.object
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO';cam.data.ortho_scale=span*1.55
    bpy.context.scene.camera=cam
    bpy.ops.object.light_add(type='SUN',location=(-10,-12,25))
    bpy.context.object.data.energy=2.5
    bpy.context.scene.world.color=(.65,.72,.77)
    scene=bpy.context.scene
    scene.render.engine='BLENDER_EEVEE'
    scene.render.resolution_x=640;scene.render.resolution_y=480;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.render.filepath=str(PREVIEWS/(file.stem+'.png'))
    scene.view_settings.view_transform='Standard'
    scene.render.film_transparent=False
    bpy.ops.render.render(write_still=True)
    print('PREVIEW',file.stem,scene.render.filepath)
