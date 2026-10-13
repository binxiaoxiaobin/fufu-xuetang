"""Build editable exterior architectural studies with local Blender.
Exterior proportions reference official monument documentation; these are
architectural studies, not measured surveys of the monuments.
Run: blender --background --factory-startup --python-exit-code 1 --python this.py
"""
import bpy, math, json, random
from pathlib import Path
from mathutils import Vector
from collections import defaultdict
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'frontend/assets/landmarks-v2'
SOURCE = ROOT / 'artifacts/landmarks-v2'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
random.seed(41)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
MATS = {}

def material(name, color, metal=0, rough=.6, texture=False):
    m = bpy.data.materials.new(name); m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    if texture:
        n = 512
        rng = np.random.default_rng(21)
        y, x = np.mgrid[0:n,0:n]
        mortar = ((y % 64) < 2) | (((x + (y // 64 % 2) * 64) % 128) < 2)
        noise = rng.uniform(-.045, .045, (n,n)) + np.sin(x*.025+y*.038)*.018
        if name == 'Wood':
            mortar = (x % 128) < 2
            noise = rng.uniform(-.008,.008,(n,n)) + np.sin(x*.045 + np.sin(y*.012)*.4)*.008
        rgb = np.clip(np.array(color)[None,None,:] + noise[:,:,None], 0, 1)
        rgb[mortar] *= .73
        pixels = np.ones((n,n,4), dtype=np.float32); pixels[:,:,:3] = rgb
        image = bpy.data.images.new(name+'_surface', width=n,height=n)
        image.pixels.foreach_set(pixels.ravel()); image.pack()
        tex = m.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = image
        m.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    MATS[name]=m; return m

material('Iron - warm brown',(.24,.16,.095),.65,.43)
material('Iron edge',(.40,.28,.15),.58,.4)
material('Rivets',(.37,.25,.14),.65,.39)
material('Limestone',(.65,.58,.43),0,.78,True)
material('Limestone trim',(.79,.72,.55),0,.67)
material('Slate roof',(.065,.105,.125),.35,.46)
material('Clock blue',(.013,.09,.19),.42,.37)
material('Clock ivory',(.93,.91,.79),0,.45)
material('Gold detailing',(.68,.46,.12),.75,.32)
material('Shadow recess',(.022,.041,.05),0,.85)
material('Paving',(.33,.36,.35),0,.9,True)
material('Sandstone floor',(.53,.49,.39),0,.8,True)
material('Wood',(.24,.13,.065),0,.72,True)
material('Brass',(.29,.18,.075),.68,.46)
material('Steel',(.14,.19,.22),.75,.34)
material('Green',(.12,.24,.16),0,.85)
material('Glass',(.16,.28,.32),.3,.22)
material('Red',(.42,.065,.04),.2,.5)

class Build:
    def __init__(self,name):
        self.name=name; self.data=defaultdict(lambda:[[],[]]); self.collection=bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(self.collection)
    def mesh(self,verts,faces,mat='Iron - warm brown',part='Structure'):
        vs,fs=self.data[(part,mat)]; base=len(vs)
        vs.extend(tuple(v) for v in verts); fs.extend(tuple(base+i for i in f) for f in faces)
    def box(self,c,s,mat='Iron - warm brown',part='Structure'):
        x,y,z=c; a,b,h=[v/2 for v in s]
        vs=[(x+dx*a,y+dy*b,z+dz*h) for dx,dy,dz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
        self.mesh(vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat,part)
    def beam(self,a,b,r=.025,mat='Iron - warm brown',part='Structure',sides=6):
        a,b=Vector(a),Vector(b); direction=(b-a).normalized()
        normal=direction.cross(Vector((0,0,1)))
        if normal.length < .001: normal=direction.cross(Vector((0,1,0)))
        normal.normalize(); other=direction.cross(normal).normalized()
        verts=[p+r*(math.cos(i*2*math.pi/sides)*normal+math.sin(i*2*math.pi/sides)*other) for p in [a,b] for i in range(sides)]
        faces=[tuple(reversed(range(sides))),tuple(range(sides,sides*2))]+[(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
        self.mesh(verts,faces,mat,part)
    def ring(self,c,r,t=.025,mat='Iron edge',part='Details',axis='z',steps=48):
        points=[]
        for i in range(steps+1):
            a=i*math.tau/steps
            p=(r*math.cos(a),r*math.sin(a),0) if axis=='z' else (r*math.cos(a),0,r*math.sin(a))
            points.append(tuple(c[j]+p[j] for j in range(3)))
        for a,b in zip(points,points[1:]):self.beam(a,b,t,mat,part)
    def frustum(self,z0,z1,w0,w1,d0=None,d1=None,mat='Slate roof',part='Roof',cx=0,cy=0):
        d0=d0 if d0 is not None else w0; d1=d1 if d1 is not None else w1
        vs=[(cx+x*w/2,cy+y*d/2,z) for w,d,z in [(w0,d0,z0),(w1,d1,z1)] for x,y in [(-1,-1),(1,-1),(1,1),(-1,1)]]
        self.mesh(vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat,part)
    def lathe(self,profile,c=(0,0,0),mat='Brass',part='Bell',steps=72):
        vs=[(c[0]+r*math.cos(i*math.tau/steps),c[1]+r*math.sin(i*math.tau/steps),c[2]+z) for z,r in profile for i in range(steps)]
        fs=[(j*steps+i,j*steps+(i+1)%steps,(j+1)*steps+(i+1)%steps,(j+1)*steps+i) for j in range(len(profile)-1) for i in range(steps)]
        self.mesh(vs,fs,mat,part)
    def finish(self):
        for (part,mat),(verts,faces) in self.data.items():
            mesh=bpy.data.meshes.new(part); mesh.from_pydata(verts,[],faces); mesh.materials.append(MATS[mat]); mesh.update()
            if part in ['Bell','Clapper ball']:
                for polygon in mesh.polygons: polygon.use_smooth=True
            ob=bpy.data.objects.new(part+' / '+mat,mesh);self.collection.objects.link(ob)
            if mat in ['Limestone','Paving','Sandstone floor','Wood']:
                uv=mesh.uv_layers.new(name='Surface UV')
                for poly in mesh.polygons:
                    axes=(0,2) if abs(poly.normal.y)>.5 else ((1,2) if abs(poly.normal.x)>.5 else (0,1))
                    for li in poly.loop_indices:
                        co=mesh.vertices[mesh.loops[li].vertex_index].co
                        uv.data[li].uv=(co[axes[0]]*.33,co[axes[1]]*.33)
        return self.collection

def rail(b,a,c,height=.85,step=.23,mat='Iron - warm brown',part='Railings'):
    a,c=Vector(a),Vector(c); top=Vector((0,0,height))
    b.beam(a+top,c+top,.035,mat,part); b.beam(a+top*.2,c+top*.2,.024,mat,part)
    n=max(1,math.ceil((c-a).length/step))
    for i in range(n+1):
        p=a.lerp(c,i/n);b.beam(p,p+top,.014,mat,part)

def eiffel():
    b=Build('Eiffel exterior')
    samples=[(0,5.15,1.0),(1,4.92,.88),(3,3.94,.66),(5.7,2.75,.48),(8,2.11,.38),(11.5,1.36,.27),(15,1.02,.20),(20,.68,.15),(25,.47,.12),(27.6,.40,.10)]
    def section(z):
        for (a,r,w),(c,s,v) in zip(samples,samples[1:]):
            if a<=z<=c:
                t=(z-a)/(c-a);return r+(s-r)*t,w+(v-w)*t
        return .4,.1
    for sx in [-1,1]:
        for sy in [-1,1]:
            b.box((sx*5.15,sy*5.15,.05),(2.6,2.6,.45),'Limestone','Stone foundations')
            zs=[i*27.6/58 for i in range(59)]
            for z0,z1 in zip(zs,zs[1:]):
                r0,w0=section(z0);r1,w1=section(z1)
                p0=[(sx*r0+u*w0,sy*r0+v*w0,z0+.3) for u,v in [(-1,-1),(1,-1),(1,1),(-1,1)]]
                p1=[(sx*r1+u*w1,sy*r1+v*w1,z1+.3) for u,v in [(-1,-1),(1,-1),(1,1),(-1,1)]]
                for k in range(4):
                    j=(k+1)%4
                    b.beam(p0[k],p1[k],.054 if z0<12 else .033,part='Curved lattice piers')
                    b.beam(p0[k],p0[j],.028,part='Pier cross members')
                    b.beam(p0[k],p1[j],.021 if z0<12 else .016,part='Diagonal lattice')
                    b.beam(p0[j],p1[k],.021 if z0<12 else .016,part='Diagonal lattice')
            # Diagonal lift rails follow the inner face of each lower pier.
            for offset in [-.17,.17]:
                for z0,z1 in zip([0,1,3,5.7],[1,3,5.7,8]):
                    r0,w=section(z0);r1,w=section(z1)
                    b.beam((sx*r0+offset,sy*r0, z0+.4),(sx*r1+offset,sy*r1,z1+.4),.035,'Iron edge','Lift guides')
    # Arches between the four legs leave the central space open.
    for side in range(4):
        angle=side*math.pi/2
        def rot(x,y,z):return (x*math.cos(angle)-y*math.sin(angle),x*math.sin(angle)+y*math.cos(angle),z)
        for offset in [0,.19]:
            pts=[rot(-4.58+9.16*i/40,-4.48, .9+3.32*math.sin(math.pi*i/40)+offset) for i in range(41)]
            for a,c in zip(pts,pts[1:]):b.beam(a,c,.063,'Iron edge','Monumental arches')
        for i in range(1,40):
            x=-4.58+9.16*i/40; z=.9+3.32*math.sin(math.pi*i/40)
            b.beam(rot(x,-4.48,z+.2),rot(x,-3.58,5.75),.022,part='Arch spandrels')
    for height,half,opening in [(5.98,3.6,2.2),(11.79,2.04,1.0),(27.86,.79,.22)]:
        thickness=.22 if height<20 else .14
        # Walkable deck frames preserve the open centre.
        for sign in [-1,1]:
            b.box((0,sign*(half+opening)/2,height),(half*2,half-opening,thickness),'Iron edge','Observation decks')
            b.box((sign*(half+opening)/2,0,height),(half-opening,opening*2,thickness),'Iron edge','Observation decks')
        for side in range(4):
            corners=[(-half,-half,height+.12),(half,-half,height+.12),(half,half,height+.12),(-half,half,height+.12)]
            rail(b,corners[side],corners[(side+1)%4],.36 if height<20 else .29,.14,part='Deck balustrades')
            # Deep lattice fascia below the decks.
            a,c=Vector(corners[side]),Vector(corners[(side+1)%4]);n=24 if height<20 else 8
            for i in range(n):
                p=a.lerp(c,i/n)-Vector((0,0,.42));q=a.lerp(c,(i+1)/n)-Vector((0,0,.42))
                b.beam(p,q,.038,part='Deck fascia');b.beam(p,q+Vector((0,0,.35)),.025,part='Deck fascia')
    # Tall upper central lattice and summit pavilion.
    for z in np.linspace(12.2,27,27):
        r,w=section(float(z)); h=r+w
        for a,c in [((-h,-h,z),(h,-h,z+.52)),((h,-h,z),(h,h,z+.52)),((h,h,z),(-h,h,z+.52)),((-h,h,z),(-h,-h,z+.52))]:b.beam(a,c,.018,part='Upper tower bracing')
    b.box((0,0,28.27),(1.05,1.05,.58),'Glass','Summit pavilion')
    for x in [-.55,0,.55]:
        for y in [-.55,.55]:b.beam((x,y,27.99),(x,y,28.59),.03,'Iron edge','Summit mullions')
    b.frustum(28.6,29.05,1.4,.38,mat='Iron edge',part='Summit roof')
    for z,r in [(29.0,.17),(30.0,.12),(31,.065)]:b.beam((0,0,z),(0,0,z+1.06),r,'Iron edge','Antenna')
    for z in np.linspace(29.5,31.8,9):b.ring((0,0,float(z)),.19,.019,'Iron edge','Antenna hoops',steps=16)
    b.box((0,0,-.24),(17,17,.25),'Paving','Esplanade')
    return b.finish()

def gothic(b,x,depth,z,width,height,side=0,part='Gothic windows',mat='Limestone trim'):
    angle=side*math.pi/2
    def p(u,h,d=0):
        xx,yy=x+u,depth+d
        return (xx*math.cos(angle)-yy*math.sin(angle),xx*math.sin(angle)+yy*math.cos(angle),z+h)
    b.beam(p(-width/2,0),p(-width/2,height*.68),.043,mat,part)
    b.beam(p(width/2,0),p(width/2,height*.68),.043,mat,part)
    left=[p(-width/2+width/2*t,height*(.68+.32*math.sin(t*math.pi/2))) for t in np.linspace(0,1,12)]
    right=[p(width/2-width/2*t,height*(.68+.32*math.sin(t*math.pi/2))) for t in np.linspace(0,1,12)]
    for pts in [left,right]:
        for a,c in zip(pts,pts[1:]):b.beam(a,c,.043,mat,part)
    b.beam(p(0,0),p(0,height*.91),.024,mat,part)
    b.beam(p(-width/2,height*.4),p(width/2,height*.4),.024,mat,part)

def clock(b,side):
    angle=side*math.pi/2
    def p(x,z,d=0):return (x*math.cos(angle)-(-2.31-d)*math.sin(angle),x*math.sin(angle)+(-2.31-d)*math.cos(angle),19.5+z)
    n=96;verts=[p(0,0)]+[p(1.14*math.sin(i*math.tau/n),1.14*math.cos(i*math.tau/n)) for i in range(n)]
    b.mesh(verts,[(0,(i+1)%n+1,i+1) for i in range(n)],'Clock ivory','Opal glass dials')
    for r,thick in [(1.18,.07),(1.04,.026),(.73,.025),(.53,.013)]:
        points=[p(r*math.sin(i*math.tau/n),r*math.cos(i*math.tau/n),.025) for i in range(n+1)]
        for a,c in zip(points,points[1:]):b.beam(a,c,thick,'Gold detailing','Clock ornamental rings')
    for i in range(60):
        a=i*math.tau/60
        b.beam(p(math.sin(a)*1.035,math.cos(a)*1.035,.05),p(math.sin(a)*(.97 if i%5 else .93),math.cos(a)*(.97 if i%5 else .93),.05),.014,'Clock blue','Minute indices')
    # Glass tracery radiates from the centre.
    for i in range(24):
        a=i*math.tau/24
        b.beam(p(math.sin(a)*.10,math.cos(a)*.10,.01),p(math.sin(a)*.72,math.cos(a)*.72,.01),.007,'Gold detailing','Glass tracery')
    romans=['XII','I','II','III','IV','V','VI','VII','VIII','IX','X','XI']
    for i,text in enumerate(romans):
        a=i*math.tau/12
        cu=bpy.data.curves.new('Roman numeral','FONT');cu.body=text;cu.align_x='CENTER';cu.align_y='CENTER';cu.size=.19;cu.extrude=.005
        ob=bpy.data.objects.new('Clock '+text,cu);b.collection.objects.link(ob)
        ob.location=p(math.sin(a)*.855,math.cos(a)*.855,.055);ob.rotation_euler=(math.pi/2,0,angle)
        cu.materials.append(MATS['Clock blue'])
    for length,a,width in [(.62,-math.pi/3,.039),(.9,math.pi/3,.025)]:
        b.beam(p(-math.sin(a)*.12,-math.cos(a)*.12,.12),p(math.sin(a)*length,math.cos(a)*length,.12),width,'Clock blue','Clock hands')
        # Pointed finial at each hand tip.
        b.beam(p(math.sin(a)*(length-.18),math.cos(a)*(length-.18),.12),p(math.sin(a)*(length+.055),math.cos(a)*(length+.055),.12),width*.55,'Gold detailing','Clock hands')
    b.beam(p(0,0,.09),p(0,0,.17),.075,'Gold detailing','Clock hub',sides=24)

def bigben():
    b=Build('Elizabeth Tower exterior')
    b.box((0,0,-.12),(10,10,.22),'Paving','Forecourt')
    # Base front is assembled around a real doorway opening.
    b.box((0,.13,1.0),(4.1,3.75,2),'Limestone','Tower base')
    # Recessed entry cut into front slab, with a door behind it.
    for x in [-1.4,1.4]:b.box((x,-2.05,1.1),(1.32,.35,2.2),'Limestone','Entry piers')
    b.box((0,-2.05,2.25),(4.1,.35,.5),'Limestone trim','Entry lintel')
    b.box((0,-2.10,.72),(1.02,.05,1.43),'Wood','EntryDoor')
    for x in [-.46,0,.46]:b.box((x,-2.15,.7),(.04,.045,1.4),'Gold detailing','Door ironwork')
    gothic(b,0,-2.25,.03,1.17,2,part='Entrance stone arch')
    b.box((0,0,9.72),(4.06,4.06,15.0),'Limestone','Masonry shaft')
    for y in [-1,1]:
        for x in [-1,1]:
            b.box((x*2.0,y*2,9.0),(.39,.39,17.3),'Limestone trim','Corner buttresses')
            for z in np.arange(.55,17.5,.7):
                b.box((x*2.025,y*2.025,float(z)),(.43,.43,.09),'Limestone trim','Buttress courses')
    for z in [2.7,6.25,9.7,13.15,16.65,17.6]:
        b.box((0,0,z),(4.5,4.5,.16),'Limestone trim','String courses')
        b.box((0,0,z+.17),(4.26,4.26,.09),'Gold detailing','Course highlights')
    for side in range(4):
        angle=side*math.pi/2
        for z in [3.1,6.66,10.1,13.55]:
            for x in [-1.15,-.38,.38,1.15]:
                xx=x*math.cos(angle)+2.051*math.sin(angle);yy=x*math.sin(angle)-2.051*math.cos(angle)
                dims=(.48,.035,2.37) if side%2==0 else (.035,.48,2.37)
                b.box((xx,yy,z+1.15),dims,'Shadow recess','Window recesses')
                gothic(b,x,-2.09,z,.52,2.6,side)
                for step in range(6):
                    zz=z+.23+step*.33
                    p1=(x-.22,-2.075,zz);p2=(x+.22,-2.075,zz)
                    def rt(p):return (p[0]*math.cos(angle)-p[1]*math.sin(angle),p[0]*math.sin(angle)+p[1]*math.cos(angle),p[2])
                    b.beam(rt(p1),rt(p2),.012,'Gold detailing','Window bars')
    b.box((0,0,19.55),(4.48,4.48,3.66),'Limestone','Clock housing')
    for z,w in [(17.74,4.77),(17.96,4.6),(21.39,4.8),(21.62,4.92)]:b.box((0,0,z),(w,w,.14),'Limestone trim','Clock cornices')
    for side in range(4):clock(b,side)
    for sx in [-1,1]:
        for sy in [-1,1]:
            b.box((sx*2.17,sy*2.17,19.52),(.27,.27,3.8),'Limestone trim','Clock pilasters')
            b.frustum(21.45,22.18,.48,.015,mat='Gold detailing',part='Clock pinnacles',cx=sx*2.15,cy=sy*2.15)
    # Belfry, pierced tracery and the steep multi-stage roof.
    b.box((0,0,22.8),(3.9,3.9,2.24),'Shadow recess','Belfry backing')
    for side in range(4):
        for x in [-1.27,-.63,0,.63,1.27]:gothic(b,x,-2.02,21.85,.47,1.82,side,'Belfry tracery')
        a=side*math.pi/2
        for z in np.arange(22,23.5,.16):
            p=(-1.77,-2.0,z);q=(1.77,-2.0,z)
            rt=lambda p:(p[0]*math.cos(a)-p[1]*math.sin(a),p[0]*math.sin(a)+p[1]*math.cos(a),p[2])
            b.beam(rt(p),rt(q),.035,'Slate roof','Belfry louvers')
    b.box((0,0,24),(4.48,4.48,.2),'Limestone trim','Roof cornice')
    b.frustum(24.1,28.23,4.48,1.25)
    for i in range(18):
        z=24.18+i*.22;w=4.48-(z-24.1)/4.13*3.23
        for side in [-1,1]:
            b.beam((-w/2,side*w/2,z),(w/2,side*w/2,z),.021,'Gold detailing','Roof ribs')
            b.beam((side*w/2,-w/2,z),(side*w/2,w/2,z),.021,'Gold detailing','Roof ribs')
    for sx in [-1,1]:
        for sy in [-1,1]:
            b.beam((sx*2.24,sy*2.24,24.1),(sx*.625,sy*.625,28.23),.062,'Gold detailing','Roof hips')
            b.frustum(23.9,25.8,.38,.02,mat='Slate roof',part='Roof corner spires',cx=sx*2.12,cy=sy*2.12)
    b.box((0,0,28.32),(1.5,1.5,.2),'Gold detailing','Lantern base')
    b.box((0,0,28.85),(1.04,1.04,.88),'Shadow recess','Ayrton lantern')
    for x in [-.55,0,.55]:
        for y in [-.55,.55]:b.beam((x,y,28.4),(x,y,29.34),.034,'Gold detailing','Lantern columns')
    b.frustum(29.36,30.65,1.55,.15,mat='Slate roof')
    b.beam((0,0,30.6),(0,0,32),.042,'Gold detailing','Spire')
    b.ring((0,0,31.22),.13,.035,'Gold detailing','Spire ornament',steps=20)
    return b.finish()




collections=[eiffel(),bigben()]
filenames=['eiffel-exterior','elizabeth-exterior']
records=[]
for collection,filename in zip(collections,filenames):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in collection.objects:ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/(filename+'.glb')),export_format='GLB',use_selection=True,export_cameras=False,export_lights=False,export_apply=True,export_yup=True)
    records.append({'file':filename+'.glb','objects':len(collection.objects),'vertices':sum(len(o.data.vertices) for o in collection.objects if o.type=='MESH'),'bytes':(OUT/(filename+'.glb')).stat().st_size})
    collection.hide_render=True

# Keep each model in its own ready-to-open Blender scene, with a camera and lights.
preview_scenes=[]
for i,(collection,filename) in enumerate(zip(collections,filenames)):
    collection.hide_render=False;collection.hide_viewport=False
    scene=bpy.data.scenes.new(filename);scene.collection.children.link(collection)
    scene.world=bpy.data.worlds.new(filename+' sky');scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.32,.43,.5,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
    cam_data=bpy.data.cameras.new('Visitor camera');cam=bpy.data.objects.new('Visitor camera',cam_data);scene.collection.objects.link(cam)
    eye=(20,-46,20)
    target=Vector((0,0,14.7))
    cam.location=eye;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam_data.lens=45;scene.camera=cam
    light_data=bpy.data.lights.new('Afternoon sunlight','SUN');light_data.energy=2.5;light_data.angle=.12
    light=bpy.data.objects.new('Afternoon sunlight',light_data);light.rotation_euler=(.48,-.55,-.6);scene.collection.objects.link(light)
    scene.render.engine='CYCLES';scene.cycles.samples=24
    scene.render.resolution_x=800;scene.render.resolution_y=800;scene.render.resolution_percentage=100
    preview_scenes.append(scene)
bpy.context.window.scene=preview_scenes[0]
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'landmarks.blend'))
manifest={'generator':'Blender '+bpy.app.version_string,'script':'scripts/build_landmarks.py','coordinateSystem':'Blender Z-up exported as glTF Y-up','exteriorScale':'Architectural study based on published proportions, not a measured survey','sources':['https://www.toureiffel.paris/en/the-monument/history','https://www.toureiffel.paris/en/the-monument/key-figures','https://www.parliament.uk/about/living-heritage/building/palace/big-ben/facts-figures/'],'assets':records}
(SOURCE/'build-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print('LANDMARK_BUILD_COMPLETE',json.dumps(records))
