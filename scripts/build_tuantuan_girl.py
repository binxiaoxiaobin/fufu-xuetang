"""Build a hand-modeled clay-style girl explorer GLB and a studio render.

Run: D:\blender\blender.exe --background --factory-startup --python scripts/build_tuantuan_girl.py
"""
import math
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = ROOT / "frontend" / "assets" / "characters"
ART_DIR = ROOT / "artifacts" / "tuantuan-girl"
MODEL_DIR.mkdir(parents=True, exist_ok=True)
ART_DIR.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)


def material(name, color, roughness=0.88, subsurface=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0
    if subsurface:
        bsdf.inputs["Subsurface Weight"].default_value = subsurface
    return mat


skin = material("warm peach clay skin", (0.79, 0.37, 0.24), 0.91, 0.08)
cheek = material("soft blush", (0.83, 0.27, 0.22))
hair = material("chestnut hair", (0.105, 0.045, 0.021))
hair_light = material("chestnut hair edge", (0.16, 0.074, 0.034))
eye_white = material("warm eye white", (0.88, 0.78, 0.65), 0.55)
iris = material("warm brown iris", (0.15, 0.065, 0.027), 0.42)
pupil = material("deep pupil", (0.045, 0.026, 0.022), 0.22)
glint = material("eye glint", (1.0, 0.98, 0.88), 0.2)
mouth_dark = material("smile mouth", (0.26, 0.045, 0.045))
tongue = material("smile tongue", (0.87, 0.30, 0.31))
shirt = material("butter yellow cotton", (0.85, 0.55, 0.17))
overall = material("sage green overall", (0.21, 0.33, 0.17))
overall_edge = material("overall seams", (0.27, 0.36, 0.23))
scarf = material("coral neckerchief", (0.78, 0.24, 0.17))
backpack = material("moss green backpack", (0.22, 0.30, 0.16))
backpack_flap = material("light moss backpack flap", (0.41, 0.48, 0.34))
leather = material("cinnamon leather", (0.28, 0.11, 0.05))
leather_light = material("soft leather edge", (0.51, 0.28, 0.16))
boot_sole = material("sand boot soles", (0.60, 0.45, 0.28))
sock = material("cream knit socks", (0.90, 0.80, 0.60))
brass = material("brass hardware", (0.61, 0.42, 0.18), 0.48)
bedroll = material("rolled cream blanket", (0.83, 0.74, 0.57))


def empty(name, xyz, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_size = 0.09
    obj.empty_display_type = "SPHERE"
    obj.parent = parent
    obj.location = xyz
    return obj


root = empty("tuantuan-girl", (0, 0, 0))


def finish(obj, name, mat, xyz, parent, smooth=True):
    obj.name = name
    obj.parent = parent
    obj.location = xyz
    obj.data.materials.append(mat)
    if smooth and obj.type == "MESH":
        for face in obj.data.polygons:
            face.use_smooth = True
    return obj


def ellipsoid(name, xyz, scale, mat, parent=root, segments=32, rings=20, rotation=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings)
    obj = bpy.context.object
    obj.scale = scale
    if rotation:
        obj.rotation_euler = rotation
    return finish(obj, name, mat, xyz, parent)


def box(name, xyz, dims, radius, mat, parent=root, rotation=None):
    bpy.ops.mesh.primitive_cube_add()
    obj = bpy.context.object
    obj.scale = tuple(v / 2 for v in dims)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel = obj.modifiers.new("soft rounded edges", "BEVEL")
    bevel.width = radius
    bevel.segments = 3
    normal = obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    if rotation:
        obj.rotation_euler = rotation
    return finish(obj, name, mat, xyz, parent, smooth=False)


def cylinder(name, xyz, radius, depth, mat, parent=root, vertices=32, rotation=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth)
    obj = bpy.context.object
    if rotation:
        obj.rotation_euler = rotation
    bevel = obj.modifiers.new("rounded ends", "BEVEL")
    bevel.width = min(0.045, radius * 0.22)
    bevel.segments = 3
    return finish(obj, name, mat, xyz, parent)


def tube(name, points, radius, mat, parent=root):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 20
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, xyz in zip(spline.bezier_points, points):
        point.co = xyz
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    curve.materials.append(mat)
    return obj


def triangle(name, vertices, mat, parent=root, thickness=0.025):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], [tuple(range(len(vertices)))])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.data.materials.append(mat)
    solid = obj.modifiers.new("soft cloth thickness", "SOLIDIFY")
    solid.thickness = thickness
    bevel = obj.modifiers.new("soft cloth edge", "BEVEL")
    bevel.width = 0.018
    bevel.segments = 2
    return obj


def strand(name, points, widths, mat, parent):
    # A tapered, elliptical clay hair lock; each ring follows the strand axis.
    verts = []
    sides = 10
    for idx, point in enumerate(points):
        tangent = Vector(points[min(idx + 1, len(points) - 1)]) - Vector(points[max(idx - 1, 0)])
        tangent.normalize()
        u = tangent.cross(Vector((0, 1, 0)))
        if u.length < 0.05:
            u = tangent.cross(Vector((1, 0, 0)))
        u.normalize()
        v = tangent.cross(u).normalized()
        for side in range(sides):
            a = side * 2 * math.pi / sides
            p = Vector(point) + widths[idx] * (math.cos(a) * u + 0.34 * math.sin(a) * v)
            verts.append(tuple(p))
    faces = [tuple(range(sides - 1, -1, -1))]
    for idx in range(len(points) - 1):
        for side in range(sides):
            k = idx * sides + side
            faces.append((k, idx * sides + (side + 1) % sides,
                          (idx + 1) * sides + (side + 1) % sides,
                          (idx + 1) * sides + side))
    faces.append(tuple((len(points) - 1) * sides + j for j in range(sides)))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    mesh.materials.append(mat)
    sub = obj.modifiers.new("hand-shaped clay smoothing", "SUBSURF")
    sub.levels = 1
    sub.render_levels = 1
    for face in mesh.polygons:
        face.use_smooth = True
    return obj


# Rounded toddler silhouette: shirt, romper shorts, bib and small back seams.
ellipsoid("soft yellow shirt body", (0, 0.015, 1.78), (0.48, 0.35, 0.55), shirt)
ellipsoid("shorts body", (0, -0.005, 1.33), (0.47, 0.365, 0.35), overall)
box("front bib", (0, -0.354, 1.69), (0.58, 0.11, 0.58), 0.11, overall)
box("back bib", (0, 0.346, 1.57), (0.64, 0.10, 0.44), 0.095, overall)
box("front patch pocket", (0, -0.425, 1.59), (0.31, 0.035, 0.23), 0.055, overall)
tube("front pocket seam", [(-0.145,-0.448,1.66),(-0.13,-0.452,1.49),(0,-0.455,1.47),(0.13,-0.452,1.49),(0.145,-0.448,1.66)], 0.007, overall_edge)
for side in (-1, 1):
    x = side * 0.29
    tube(f"overall strap {side}", [(x*0.68,-0.39,1.96),(x,-0.35,2.12),(x*1.14,-0.06,2.22),(x*0.96,0.32,2.04)], 0.060, overall)
    ellipsoid(f"front bib wooden button {side}", (side*0.19,-0.44,1.95), (.058,.02,.058), leather_light)
    ellipsoid(f"button recess {side}", (side*0.19,-0.463,1.95), (.019,.009,.019), leather)
    box(f"short hem {side}", (side*0.238,-0.005,1.145), (.41,.64,.13), .055, overall)
    tube(f"short hem stitch {side}", [(side*0.40,-0.29,1.20),(side*0.25,-0.34,1.20),(side*0.10,-0.30,1.20)], .006, overall_edge)

# Backpack, bedroll, flap, straps and small hardware are complete on the back.
box("main explorer backpack", (0, 0.425, 1.73), (.64,.34,.69), .14, backpack)
box("backpack flap", (0, 0.625, 1.91), (.66,.09,.25), .07, backpack_flap)
box("backpack pocket", (0, 0.613, 1.54), (.39,.07,.25), .055, backpack_flap)
for side in (-1, 1):
    box(f"backpack leather vertical strap {side}", (side*.20,.684,1.76), (.064,.027,.49), .021, leather_light)
    box(f"backpack buckle {side}", (side*.20,.710,1.70), (.095,.02,.095), .015, brass)
    box(f"buckle dark center {side}", (side*.20,.724,1.70), (.048,.01,.048), .012, leather)
    tube(f"shoulder strap {side}", [(side*.32,.33,1.88),(side*.46,.23,2.15),(side*.37,-.06,2.15)], .056, leather_light)
cylinder("rolled cream bedroll", (0, 0.46, 2.14), .12, .76, bedroll, rotation=(0, math.pi/2, 0))
for side in (-1, 1):
    x = side*.397
    pts = [(x, .46+.025*math.cos(a), 2.14+.025*math.sin(a)) for a in [i*2*math.pi/18 for i in range(19)]]
    tube(f"bedroll spiral edge {side}", pts, .012, leather_light)

# Pivoted limbs can be animated in Three.js without re-rigging the GLB.
for side in (-1, 1):
    x = side*.235
    leg = empty("leg-1" if side == -1 else "leg1", (x, 0, 1.28), root)
    ellipsoid(f"short leg skin {side}", (0,-.005,-.33), (.165,.17,.42), skin, leg)
    cylinder(f"ribbed sock {side}", (0,-.006,-.72), .145, .21, sock, leg)
    for z in (-.63,-.68,-.73):
        tube(f"sock rib {side} {z}", [(-.12,-.10,z),(0,-.15,z-.009),(.12,-.10,z)], .008, bedroll, leg)
    box(f"boot ankle {side}", (0,-.025,-.83), (.34,.35,.35), .10, leather, leg)
    ellipsoid(f"boot rounded toe {side}", (0,-.18,-1.035), (.21,.30,.17), leather, leg)
    box(f"boot sole {side}", (0,-.15,-1.09), (.44,.65,.09), .041, boot_sole, leg)
    for n in range(3):
        z = -.79-n*.062
        tube(f"boot lace {side} {n}", [(-.085,-.22,z),(.085,-.22,z-.03)], .014, bedroll, leg)
        tube(f"boot lace cross {side} {n}", [(.085,-.228,z),(-.085,-.228,z-.03)], .014, bedroll, leg)

for side in (-1, 1):
    arm = empty("arm-1" if side == -1 else "arm1", (side*.49, 0, 2.055), root)
    arm.rotation_euler[1] = side*.15
    ellipsoid(f"puffy yellow sleeve {side}", (side*.075,0,-.07), (.22,.225,.23), shirt, arm)
    cylinder(f"sleeve fold {side}", (side*.095,0,-.22), .18, .055, shirt, arm)
    ellipsoid(f"arm skin {side}", (side*.12,-.015,-.395), (.145,.14,.24), skin, arm)
    ellipsoid(f"soft little hand {side}", (side*.15,-.025,-.60), (.14,.12,.145), skin, arm)
    ellipsoid(f"thumb {side}", (side*.04,-.138,-.565), (.055,.06,.09), skin, arm)

# Scarf wrap with a knot and two cloth tails.
ellipsoid("neck", (0,-.015,2.21), (.17,.16,.19), skin)
ellipsoid("scarf around neck", (0,-.025,2.20), (.27,.23,.12), scarf)
ellipsoid("scarf knot", (0,-.255,2.19), (.11,.065,.095), scarf)
triangle("short scarf tail left", [(-.07,-.275,2.16),(-.20,-.265,1.93),(.005,-.265,2.04)], scarf)
triangle("short scarf tail right", [(.04,-.278,2.16),(.19,-.267,1.94),(-.015,-.265,2.04)], scarf)

head = empty("head", (0,0,2.25), root)
face = ellipsoid("round child head", (0,-.01,.49), (.60,.51,.62), skin, head, segments=64, rings=40)
# Soft cheek color is painted on the skin mesh so it follows the head surface.
skin_tint = material("skin with painted blush", (0.79,0.37,0.24), .91, .08)
face.data.materials.clear()
face.data.materials.append(skin_tint)
colors = face.data.color_attributes.new(name="SoftCheeks", type="FLOAT_COLOR", domain="CORNER")
for polygon in face.data.polygons:
    for loop_index in polygon.loop_indices:
        p = face.data.vertices[face.data.loops[loop_index].vertex_index].co
        blush = max(math.exp(-(((p.x-side*.64)/.28)**2 + ((p.y+.76)/.31)**2 + ((p.z+.27)/.20)**2)) for side in (-1,1))
        mix = .48*blush
        colors.data[loop_index].color = ((.79*(1-mix)+.88*mix),(.37*(1-mix)+.23*mix),(.24*(1-mix)+.22*mix),1)
attribute = skin_tint.node_tree.nodes.new("ShaderNodeVertexColor")
attribute.layer_name = "SoftCheeks"
skin_tint.node_tree.links.new(attribute.outputs["Color"], skin_tint.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
for side in (-1,1):
    ellipsoid(f"ear {side}", (side*.604,-.005,.48), (.12,.105,.175), skin, head)
    ellipsoid(f"ear inner shade {side}", (side*.700,-.055,.47), (.014,.040,.066), cheek, head)
    ellipsoid(f"eye white {side}", (side*.225,-.481,.57), (.127,.021,.149), eye_white, head)
    ellipsoid(f"iris {side}", (side*.232,-.503,.562), (.100,.014,.112), iris, head)
    ellipsoid(f"pupil {side}", (side*.230,-.516,.555), (.072,.009,.087), pupil, head)
    ellipsoid(f"main eye glint {side}", (side*.203-.022,-.525,.608), (.023,.006,.026), glint, head)
    ellipsoid(f"tiny eye glint {side}", (side*.203+.043,-.525,.520), (.010,.004,.011), glint, head)
    tube(f"gentle eyebrow {side}", [(side*.13,-.425,.85),(side*.22,-.441,.875),(side*.34,-.421,.83)], .016, hair, head)
ellipsoid("little peach nose", (0,-.516,.37), (.055,.033,.041), skin, head)
tube("gentle smiling mouth", [(-.155,-.464,.23),(-.085,-.476,.18),(0,-.481,.17),(.085,-.476,.18),(.155,-.464,.23)], .010, mouth_dark, head)

# Hand-shaped bob: smooth sculpted crown, side swept front fringe and short locks.
ellipsoid("main top hair crown", (0,.145,1.02), (.635,.53,.45), hair, head)
ellipsoid("rounded back bob volume", (0,.338,.55), (.60,.28,.41), hair, head)
for side in (-1,1):
    ellipsoid(f"side bob volume {side}", (side*.535,.12,.51), (.16,.275,.35), hair, head, rotation=(0,side*.10,side*.08))
for n in range(11):
    x = -.47+n*.094
    strand(f"soft crown hair sweep {n}",
           [(x*.53,.08,1.465),(x*.77,-.19,1.37),(x,-.36,1.19),(x+.045,-.41,1.035)],
           [.025,.075,.077,.008], hair_light if n%5==0 else hair, head)
for side in (-1,1):
    for n in range(4):
        x = side*(.38+n*.055)
        strand(f"bob side strand {side} {n}",
               [(x*.80,.02,.93),(x*.94,-.015,.69),(x,-.025,.38),(x*.95,.01,.23+n*.02)],
               [.105,.13,.095,.012], hair_light if n % 3 == 0 else hair, head)
for n in range(9):
    a = -1.13+n*2.26/8
    x = .51*math.sin(a)
    y = .30 + .25*math.cos(a)
    strand(f"back bob sculpted strand {n}",
           [(x*.65,y*.63,.91),(x,y,.69),(x*1.05,y+.075,.42),(x,y+.025,.29)],
           [.08,.10,.075,.009], hair_light if n%4==0 else hair, head)
for n,(x0,x1,zend) in enumerate([(-.47,-.31,.82),(-.33,-.13,.83),(-.15,.075,.84),(.08,.24,.88),(.28,.36,.93)]):
    strand(f"side swept front bang {n}",
           [(x0*.70,-.23,1.23),(x0,-.40,1.10),(x1-.03,-.50,zend+.06),(x1,-.51,zend)],
           [.055,.125,.098,.007], hair_light if n == 1 else hair, head)
box("coral hair clip", (-.49,-.49,1.05), (.18,.07,.075), .026, scarf, head, rotation=(.16,-.12,.28))

root.location.z = -.15

# Export only the connected character tree; the studio is never packaged in the GLB.
bpy.ops.object.select_all(action="DESELECT")
for obj in bpy.context.scene.objects:
    node = obj
    while node.parent:
        node = node.parent
    if node == root:
        obj.select_set(True)
bpy.context.view_layer.objects.active = root
bpy.ops.export_scene.gltf(filepath=str(MODEL_DIR / "tuantuan-girl.glb"), export_format="GLB",
                          use_selection=True, export_cameras=False, export_lights=False,
                          export_apply=True, export_yup=True)

# Preview render with a warm, simple studio setup.
bpy.ops.object.select_all(action="DESELECT")
stage_mat = material("warm ivory studio", (0.91, 0.88, 0.80))
box("studio floor", (0,0,-.11), (200,200,.16), .02, stage_mat)
world = bpy.context.scene.world
world.color = (0.8,0.8,0.8)
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (.82,.75,.63,1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = .55


def aim(obj, point):
    obj.rotation_euler = (Vector(point)-obj.location).to_track_quat("-Z","Y").to_euler()


def area(name, loc, power, size):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = power
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    aim(obj,(0,0,1.65))


area("large soft key", (4,-5,7), 620, 6)
area("warm fill", (-4,-3,4), 380, 5)
area("hair rim light", (0,4,6), 730, 4)
cam_data = bpy.data.cameras.new("three-quarter camera")
camera = bpy.data.objects.new("three-quarter camera",cam_data)
bpy.context.collection.objects.link(camera)
camera.location = (-5,-8,4.0)
aim(camera,(0,0,1.70))
camera.data.type = "ORTHO"
camera.data.ortho_scale = 4.75
bpy.context.scene.camera = camera
bpy.context.scene.render.engine = "CYCLES"
bpy.context.scene.cycles.samples = 32
bpy.context.scene.render.resolution_x = 1400
bpy.context.scene.render.resolution_y = 1400
bpy.context.scene.render.resolution_percentage = 100
bpy.context.scene.render.image_settings.file_format = "PNG"
bpy.context.scene.render.filepath = str(ART_DIR / "tuantuan-girl-render.png")
bpy.context.scene.view_settings.view_transform = "AgX"
bpy.ops.wm.save_as_mainfile(filepath=str(ART_DIR / "tuantuan-girl.blend"))
bpy.ops.render.render(write_still=True)
print("Created:", MODEL_DIR / "tuantuan-girl.glb")
print("Created:", ART_DIR / "tuantuan-girl.blend")
print("Created:", ART_DIR / "tuantuan-girl-render.png")
