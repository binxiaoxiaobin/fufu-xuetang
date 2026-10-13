"""Normalize open-license landmark GLBs and make a web-sized exterior copy.

Run: blender --background --factory-startup --python-exit-code 1 --python scripts/optimize_landmark_sources.py
The source GLBs remain in artifacts/landmarks-v2/originals.
"""
from pathlib import Path
import json
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'artifacts/landmarks-v2/originals'
OUT=ROOT/'artifacts/landmarks-v2/optimized'
OUT.mkdir(parents=True,exist_ok=True)
SPECS={
    'wall':{'asset':'wall','max_span':32,'max_faces':180000},
    'fuji':{'asset':'fuji','max_span':34,'max_faces':160000},
    'taj':{'asset':'taj','max_span':25,'max_faces':180000},
    'liberty':{'asset':'liberty','height':32,'max_faces':90000},
    'opera':{'asset':'opera','max_span':30,'max_faces':100000},
    'colosseum':{'asset':'colosseum','max_span':28,'max_faces':170000},
    'cristo':{'asset':'cristo','height':28,'max_faces':90000},
    'pyramid':{'asset':'pyramid','max_span':32,'max_faces':180000},
    'giza-plateau':{'asset':'giza-plateau','max_span':38,'max_faces':220000},
}

results=[]
for name,spec in SPECS.items():
    file=SOURCE/f'{name}.glb'
    if not file.exists():
        print('MISSING',file)
        continue
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(file))
    meshes=[ob for ob in bpy.context.scene.objects if ob.type=='MESH']
    if not meshes:raise RuntimeError(f'No mesh in {file}')
    # Clear import hierarchies while retaining world transforms, then combine
    # the exterior into a small number of draw calls with all materials intact.
    bpy.ops.object.select_all(action='DESELECT')
    for ob in meshes:
        bpy.context.view_layer.objects.active=ob
        ob.select_set(True)
        bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.context.view_layer.objects.active=meshes[0]
    bpy.ops.object.join()
    obj=meshes[0]
    obj.name=name+' licensed exterior'
    bpy.context.view_layer.update()
    total_faces=len(obj.data.polygons)
    if total_faces>spec['max_faces']:
        modifier=obj.modifiers.new('Web mesh reduction','DECIMATE')
        modifier.ratio=spec['max_faces']/total_faces
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    # Some scans retain millions of vertices orphaned by decimation.
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.delete_loose()
    bpy.ops.object.mode_set(mode='OBJECT')
    world=[obj.matrix_world @ vert.co for vert in obj.data.vertices]
    lo=[min(v[i] for v in world) for i in range(3)]
    hi=[max(v[i] for v in world) for i in range(3)]
    center=Vector(((lo[0]+hi[0])/2,(lo[1]+hi[1])/2,lo[2]))
    size=[hi[i]-lo[i] for i in range(3)]
    scale=spec['height']/size[2] if 'height' in spec else spec['max_span']/max(size[0],size[1])
    for vert,point in zip(obj.data.vertices,world):
        vert.co=(point-center)*scale
    obj.matrix_world.identity()
    obj.data.update()
    for material in obj.data.materials:
        if material and material.use_nodes:
            material.diffuse_color[3]=1
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    dest=OUT/f'{spec["asset"]}-exterior.glb'
    bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',use_selection=True,
                              export_apply=True,export_image_format='AUTO',export_yup=True)
    entry={'name':name,'faces':len(obj.data.polygons),'vertices':len(obj.data.vertices),
           'size':[round(n*scale,2) for n in size],'bytes':dest.stat().st_size}
    print('OPTIMIZED',json.dumps(entry))
    results.append(entry)
(OUT/'manifest.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
