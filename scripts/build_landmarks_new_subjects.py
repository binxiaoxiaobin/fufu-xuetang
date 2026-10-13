"""Build a Bangkok Grand Palace exterior study in Blender.

The Grand Palace exterior is a labeled educational study of the Dusit Maha
Prasat roof and surrounding court, not a survey or exact digital twin.
"""
from pathlib import Path
import math
import bpy

root=Path(__file__).resolve().parents[1]
out=root/'frontend/assets/landmarks-v2'
out.mkdir(parents=True,exist_ok=True)
source=Path(__file__).with_name('build_landmarks_extra.py').read_text(encoding='utf-8')
exec(source[:source.index('def china_exterior():')], globals())

material('Thai white',(.78,.76,.66),0,.72)
material('Thai vermilion',(.57,.11,.055),0,.57)
material('Thai emerald',(.10,.30,.23),.12,.47)
material('Thai emerald light',(.20,.43,.32),.08,.48)
material('Thai gold',(.84,.54,.12),.44,.31)
material('Thai blue tile',(.07,.28,.37),.08,.48)
material('Earth layers',(.36,.30,.25),0,.85)
material('Volcanic ash',(.47,.44,.42),0,.87)
material('Snow white',(.88,.92,.91),0,.7)

def thai_roof(b,c,w,d,z,rise,part):
    x,y=c
    for level,(spread,offset) in enumerate([(1.0,0),(.76,1.35)]):
        ww=w*spread;dd=d*spread
        b.box((x,y,z+offset-.17),(ww+.65,dd+.65,.34),'Thai gold',part+' gilded eaves')
        peak=rise*(.9 if level else 1)
        for side in [-1,1]:
            for row in range(12):
                for col in range(32):
                    xx0=x-ww/2+ww*col/32;xx1=x-ww/2+ww*(col+1)/32
                    t0=row/12;t1=(row+1)/12
                    def point(xx,t):
                        return (xx,y+side*dd*t/2,z+offset+peak*(1-t)+.58*t**6+.12*(abs((xx-x)/(ww/2)))**5)
                    b.mesh([point(xx0,t0),point(xx1,t0),point(xx1,t1),point(xx0,t1)],
                           [(0,1,2,3)],'Thai emerald light' if (col+row)%5==0 else 'Thai emerald',part+' glazed roof tiles')
            for col in range(33):
                xx=x-ww/2+ww*col/32
                pts=[(xx,y+side*dd*t/2,z+offset+peak*(1-t)+.58*t**6+.12*(abs((xx-x)/(ww/2)))**5) for t in (i/24 for i in range(25))]
                for aa,bb in zip(pts,pts[1:]):b.beam(aa,bb,.019,'Thai gold',part+' tile ribs',5)
            b.beam((x-ww/2,y+side*dd/2,z+offset+.58),(x+ww/2,y+side*dd/2,z+offset+.58),.08,'Thai gold',part+' gilded fascia')
        b.beam((x-ww/2,y,z+offset+peak),(x+ww/2,y,z+offset+peak),.12,'Thai gold',part+' roof ridge',8)
        for xx in [x-ww/2,x+ww/2]:
            b.mesh([(xx,y-dd/2,z+offset+.58),(xx,y+dd/2,z+offset+.58),(xx,y,z+offset+peak)],[(0,1,2)],'Thai vermilion',part+' gable')
            for t in [.2,.4,.6,.8]:
                yy=y-dd/2+dd*t
                zz=z+offset+.58+(peak-.58)*(1-abs(2*t-1))
                b.beam((xx-.06,yy,zz),(xx+.06,yy,zz),.052,'Thai gold',part+' gable ornament',8)
        for side in [-1,1]:
            edge=y+side*dd/2
            for i in range(28):
                xx=x-ww/2+(i+.5)*ww/28
                b.box((xx,edge,z+offset+.63),(.08,.08,.10),'Thai gold',part+' roof edge tiles')
        for sign in [-1,1]:
            a=(x+sign*ww/2,y,z+offset+.2)
            tip=(x+sign*(ww/2+.75),y,z+offset+rise*.72)
            b.beam(a,tip,.08,'Thai gold',part+' chofa finial',8)
            b.beam(tip,(tip[0]+sign*.18,y,z+offset+rise*.86),.04,'Thai gold',part+' chofa tip',8)

def grand_exterior():
    b=Build('Grand Palace Bangkok - Dusit Maha Prasat interpretive exterior')
    b.box((0,0,.22),(35,28,.44),'Thai white','Court paving')
    for z,w,d in [(.53,25,18),(.88,23,16.5),(1.22,21,15)]:
        b.box((0,0,z),(w,d,.35),'Thai white','Stepped palace terrace')
    stair_run(b,0,-9.1,.13,4.8,4.3,13,'Thai white','Ceremonial approach')
    b.box((0,0,5.1),(19.5,12.5,7.7),'Thai white','Dusit Maha Prasat hall massing')
    for y in [-6.38,6.38]:
        for x in range(-9,10,2):
            b.beam((x,y,1.4),(x,y,9.2),.20,'Thai vermilion','Palace colonnade',12)
            b.box((x,y,8.85),(.6,.55,.28),'Thai gold','Column capitals')
    for x in [-9.6,9.6]:
        for y in range(-5,6,2):b.beam((x,y,1.4),(x,y,9.2),.16,'Thai vermilion','Side colonnade',10)
    for x in range(-8,9,2):
        b.box((x,-6.48,4.65),(1.45,.10,5.7),'Wood','Carved front doors')
        for zz in [2.7,3.5,4.3,5.1,5.9,6.7]:
            b.box((x,-6.55,zz),(1.22,.055,.045),'Thai gold','Door gilded lattice')
    thai_roof(b,(0,0),23,17,9.05,4.1,'Cross wing')
    thai_roof(b,(0,0),15,22,11.2,4.8,'Central wing')
    for z,r0,r1 in [(14.0,2.45,1.85),(17.0,1.85,1.22),(20.0,1.22,.62)]:
        b.lathe([(0,r0),(.8,r0*.88),(2.4,r1),(2.8,r1*.82)],(0,0,z),'Thai gold','Multistage palace spire',32)
        b.ring((0,0,z+.8),r0*.88,.09,'Thai emerald','Spire enamel bands',steps=32)
    b.lathe([(0,.65),(1,.35),(2,.08)],(0,0,22.8),'Thai gold','Spire finial',32)
    for x in [-14.5,14.5]:
        b.box((x,1,3.9),(5.3,9,5.4),'Thai white','Flanking court pavilion')
        for xx in [x-2,x,x+2]:b.beam((xx,-3.6,1.3),(xx,-3.6,7),.11,'Thai vermilion','Pavilion columns')
        thai_roof(b,(x,1),6.9,10.6,6.75,2.4,'Pavilion')
    for x in [-16.8,16.8]:
        for y in [-11,11]:
            b.box((x,y,1.3),(.55,.55,2.15),'Thai white','Court balustrade posts')
            b.lathe([(0,.48),(.16,.46),(.46,.26),(.65,.12)],(x,y,2.4),'Thai gold','Balustrade finials',16)
    for y in [-11,11]:
        for x in range(-16,17,2):b.box((x,y,1.45),(1.7,.19,.35),'Thai white','Court balustrade')
    return b.finish()


for code,kind,fn in [('grand','exterior',grand_exterior)]:
    coll=fn();bpy.ops.object.select_all(action='DESELECT')
    for ob in coll.objects:ob.select_set(True)
    dest=out/f'{code}-{kind}.glb'
    bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',use_selection=True,
                              export_cameras=False,export_lights=False,export_apply=True,export_yup=True)
    print('EXPORTED',dest,dest.stat().st_size)
    coll.hide_render=True

bpy.ops.wm.save_as_mainfile(filepath=str(root/'artifacts/landmarks-v2/grand-palace-study.blend'))
