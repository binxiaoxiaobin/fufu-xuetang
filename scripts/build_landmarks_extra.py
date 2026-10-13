"""Build eight additional editable landmark studies with Blender.

Run with: blender --background --factory-startup --python-exit-code 1 --python scripts/build_landmarks_extra.py
Models are architectural teaching reconstructions, with exterior GLBs.
"""
from pathlib import Path
import math, json, random

# Reuse the materials and batched-mesh builder from the original Eiffel/Elizabeth project.
base = Path(__file__).with_name('build_landmarks.py').read_text(encoding='utf-8')
exec(base[:base.index('def eiffel():')], globals())

material('Imperial red',(.49,.047,.035),0,.61)
material('Imperial gold',(.77,.48,.085),.28,.39)
material('White plaster',(.83,.84,.76),0,.82)
material('Roof charcoal',(.105,.132,.16),.14,.57)
material('Marble white',(.85,.83,.74),0,.42)
material('Marble inlay',(.35,.27,.19),0,.54)
material('Porcelain cream',(.82,.73,.59),0,.46)
material('Porcelain blue',(.09,.28,.42),0,.41)
material('Porcelain green',(.19,.43,.32),0,.45)
material('Copper patina',(.18,.47,.39),.35,.51)
material('Torch gold',(.98,.64,.13),.73,.25)
material('Sandstone',(.57,.44,.30),0,.88,True)
material('Concrete',(.61,.60,.55),0,.82)
material('Opera tile',(.83,.84,.78),0,.37)
material('Opera dark',(.13,.20,.23),.18,.48)
material('Roman travertine',(.65,.55,.40),0,.83,True)
material('Roman dark',(.28,.22,.17),0,.89)
material('Soapstone',(.61,.67,.60),0,.86)

def lathe(b,profile,c=(0,0,0),mat='Marble white',part='Turned stone',steps=48):
    b.lathe(profile,c,mat,part,steps)

def sculpted_robe(b, profile, mat, part, width_bias=1.0):
    """An elliptical, folded silhouette with broad shoulders instead of a cone."""
    steps=96; verts=[]
    for row,(z,rx,ry) in enumerate(profile):
        for i in range(steps):
            a=i*math.tau/steps
            ripple=(.075+.012*row)*math.sin(a*13+row*.43)+.045*math.sin(a*7-row*.6)
            shoulder=.11*math.cos(a*2) if row>=len(profile)-3 else 0
            verts.append(((rx+ripple+shoulder)*math.cos(a)*width_bias,
                          (ry+ripple*.65)*math.sin(a),z))
    faces=[]
    for row in range(len(profile)-1):
        for i in range(steps):
            j=(i+1)%steps;a=row*steps+i;bb=row*steps+j
            faces.append((a,bb,bb+steps,a+steps))
    faces.append(tuple(reversed(range(steps))))
    faces.append(tuple((len(profile)-1)*steps+i for i in range(steps)))
    b.mesh(verts,faces,mat,part)
    for i in range(0,steps,6):
        for row in range(len(profile)-1):
            b.beam(verts[row*steps+i],verts[(row+1)*steps+i],.018,mat,part+' cloth folds',sides=5)

def dome(b,c,r,h,mat='Marble white',part='Dome',steps=48,rings=12):
    profile=[(h*i/rings, r*math.sqrt(max(0,1-(i/rings)**2))) for i in range(rings+1)]
    lathe(b,profile,c,mat,part,steps)
    for j in range(0,steps,4):
        a=j*math.tau/steps
        pts=[(c[0]+rr*math.cos(a),c[1]+rr*math.sin(a),c[2]+z) for z,rr in profile]
        for p,q in zip(pts,pts[1:]):b.beam(p,q,.025,'Limestone trim',part+' ribs')

def roof(b,c,w,d,z0,rise,mat,part):
    x,y=c
    verts=[(x-w/2,y-d/2,z0),(x+w/2,y-d/2,z0),(x+w/2,y+d/2,z0),(x-w/2,y+d/2,z0),
           (x-w/2,y,z0+rise),(x+w/2,y,z0+rise)]
    b.mesh(verts,[(0,1,5,4),(4,5,2,3),(0,4,3),(1,2,5)],mat,part)
    for j in range(23):
        xx=x-w/2+w*j/22
        for side in [-1,1]:
            b.beam((xx,y,z0+rise),(xx,y+side*d/2,z0),.019,'Imperial gold' if mat=='Imperial gold' else 'Limestone trim',part+' tile ribs')
    for yy in [-d/2,d/2]:b.beam((x-w/2,y+yy,z0),(x+w/2,y+yy,z0),.08,mat,part+' eaves')

def arch(b,x,y,z,w,h,depth,mat='Marble white',part='Arches'):
    for side in [-1,1]:b.box((x+side*w/2,y,z+h*.45),(.18,depth,h*.9),mat,part+' piers')
    pts=[(x+w*.5*math.cos(a),y,z+h*.9+w*.5*math.sin(a)) for a in [math.pi-i*math.pi/20 for i in range(21)]]
    for p,q in zip(pts,pts[1:]):b.beam(p,q,.095,mat,part+' voussoirs',sides=8)

def stair_run(b,x,y,z,width=2.8,length=4,levels=12,mat='Marble white',part='Stairs'):
    for i in range(levels):
        b.box((x,y-length/2+(i+.5)*length/levels,z+(i+.5)*.16),(width,length/levels+.01,.16),mat,part)

def china_exterior():
    b=Build('Forbidden City - Hall of Supreme Harmony exterior')
    for z,w,d in [(.35,22,17),(.8,20.5,15.5),(1.25,19,14)]:b.box((0,0,z),(w,d,.55),'Marble white','Three-tier marble terrace')
    stair_run(b,0,-8.9,.1,3.6,4,12,'Marble white','Central ceremonial stairs')
    for x in [-10,10]:stair_run(b,x,-7.4,.1,2.2,3,10,'Marble white','Side stairs')
    b.box((0,0,2.0),(17.4,11.4,1.2),'Imperial red','Hall plinth')
    b.box((0,0,7.7),(15.9,10.1,10.3),'Imperial red','Hall wall body')
    for y in [-5.35,5.35]:
        for x in [-7.7,-5.5,-3.3,-1.1,1.1,3.3,5.5,7.7]:
            b.beam((x,y,2.5),(x,y,12.2),.28,'Imperial red','Red timber columns',sides=12)
            for z in [4.4,8.8,11.4]:b.box((x,y,z),(.72,.72,.16),'Imperial gold','Dougong bracket blocks')
            for side in [-1,1]:b.beam((x,y,11.1),(x+side*.5,y,11.9),.085,'Imperial gold','Dougong bracket arms')
    for x in range(-6,7,2):
        b.box((x,-5.08,6.0),(1.65,.18,6.4),'Wood','Entrance and carved doors')
        for zz in [3.5,4.8,6.1,7.4]:b.box((x,-5.22,zz),(1.45,.025,.045),'Imperial gold','Door lattice')
        for dx in [-.62,0,.62]:b.beam((x+dx,-5.22,3),(x+dx,-5.22,9),.022,'Imperial gold','Door lattice')
    for z,w,d,r in [(12.6,19.7,13.3,3.5),(16.7,17.1,11.5,3.0)]:
        b.box((0,0,z-.45),(w*.9,d*.9,.7),'Imperial red','Upper eave structure')
        roof(b,(0,0),w,d,z,r,'Imperial gold','Glazed golden roofs')
        b.beam((-w/2,0,z+r),(w/2,0,z+r),.09,'Imperial gold','Roof ridge')
    for x in [-8.5,8.5]:
        b.lathe([(16.8,.42),(17.4,.34),(17.8,.18),(18,.03)],(x,0,0),'Imperial gold','Ridge ornaments',20)
    for x in [-7.8,7.8]:
        for y in [-5.1,5.1]:b.box((x,y,2.7),(.9,.9,.55),'Marble white','Balustrade posts')
    return b.finish()

def japan_exterior():
    b=Build('Himeji Castle exterior')
    for z,w,d in [(.4,17,15),(1.3,15,13),(2.3,13,11)]:b.frustum(z,z+.9,w,w-1.1,d,d-1.1,'Roman travertine','Sloped stone ramparts')
    for level,(z,w,d) in enumerate([(3.1,12.4,10.2),(7.8,10.8,9.1),(12.4,9.1,7.7),(16.8,7.2,6.2),(20.8,5.9,5.1)]):
        h=[4.7,4.6,4.4,4,3.7][level]
        b.box((0,0,z+h/2),(w,d,h),'White plaster',f'White plaster keep tier {level+1}')
        for side in [-1,1]:
            for x in np.arange(-w/2+1,w/2,1.45):
                b.box((float(x),side*d/2+.04,z+h*.57),(.52,.08,.7),'Shadow recess','Defensive windows')
                b.box((float(x),side*d/2+.11,z+h*.68),(.7,.07,.10),'Roof charcoal','Window lintels')
        roof(b,(0,0),w+2.2,d+2.2,z+h-.15,1.7,'Roof charcoal','Curved tiled castle roofs')
        for x in np.arange(-w/2,w/2,.48):b.beam((float(x),-d/2-1.1,z+h-.15),(float(x),0,z+h+1.55),.018,'Limestone trim','Roof tile seams')
        for side in [-1,1]:b.box((side*(w/2+.65),0,z+h+.24),(.18,d+2.2,.26),'White plaster','White parapet edges')
    for x in [-1.4,1.4]:
        b.beam((x,0,26.2),(x+math.copysign(.6,x),0,27.2),.14,'Imperial gold','Roof ridge fish ornaments')
    stair_run(b,0,-8,.05,3.4,4,15,'Roman travertine','Castle approach steps')
    b.box((0,-5.25,4.5),(2.35,.2,2.8),'Wood','Keep entrance')
    return b.finish()

def india_exterior():
    b=Build('Taj Mahal exterior')
    b.box((0,0,.55),(23,23,1.1),'Marble white','Raised marble plinth')
    b.box((0,0,6.0),(14,14,10),'Marble white','Symmetric mausoleum body')
    for side in range(4):
        angle=side*math.pi/2
        x,y=7.04*math.sin(angle),7.04*math.cos(angle)
        b.box((x,y,5.7),(8.0,.12,9.7),'Marble white','Monumental pishtaq facade')
        for offset in [-4.05,4.05]:b.beam((x+offset,y,1.1),(x+offset,y,11.7),.12,'Marble inlay','Dark inlay border')
        arch(b,x,y+.12,2.2,5.3,7.7,.16,'Marble inlay','Great central arches')
        for off in [-4.3,4.3]:
            for z in [3.4,6.8]:arch(b,x+off,y+.1,z,1.6,2.4,.14,'Marble inlay','Side niche arches')
    b.frustum(10.7,12.2,11.5,9.7,11.5,9.7,'Marble white','Roof cornice')
    lathe(b,[(0,5.4),(.55,4.7),(1.4,4.15),(3.3,3.5),(5.0,2.5),(6,1.2),(6.5,.35),(6.7,.01)],(0,0,12.2),'Marble white','Onion dome',72)
    for z,r in [(12.45,5.3),(13.1,4.55),(17.8,1.6)]:b.ring((0,0,z),r,.07,'Marble inlay','Dome bands',steps=64)
    b.beam((0,0,19),(0,0,21.3),.12,'Torch gold','Dome finial')
    for x in [-9.7,9.7]:
        for y in [-9.7,9.7]:
            lathe(b,[(0,.95),(1,.82),(12,.63),(13.1,.76),(13.45,.92),(13.6,.70)],(x,y,1.1),'Marble white','Four minarets',32)
            for z in [5,9.6,14.3]:b.ring((x,y,z),.86,.065,'Marble inlay','Minaret balconies',steps=36)
            dome(b,(x,y,14.6),.75,1,'Marble white','Minaret chhatri',24,8)
            b.beam((x,y,15.6),(x,y,16.5),.07,'Torch gold','Minaret finials')
    stair_run(b,0,-12.8,0,4.7,4,10,'Marble white','Garden approach')
    b.box((0,-20,.06),(2.1,13,.11),'Porcelain blue','Reflecting water channel')
    return b.finish()

def thailand_exterior():
    b=Build('Wat Arun exterior')
    for z,w in [(.4,20),(1.2,17.5),(2.1,15)]:b.box((0,0,z),(w,w,.8),'Porcelain cream','Temple terraces')
    stair_run(b,0,-10.5,.15,3.3,5,15,'Porcelain cream','Steep temple steps')
    def prang(x,y,base,height,width,label):
        b.frustum(base,base+height*.46,width,width*.69,mat='Porcelain cream',part=label+' tiered core',cx=x,cy=y)
        b.frustum(base+height*.46,base+height*.79,width*.72,width*.37,mat='Porcelain cream',part=label+' upper tier',cx=x,cy=y)
        lathe(b,[(0,width*.22),(height*.07,width*.20),(height*.15,width*.12),(height*.2,.02)],(x,y,base+height*.79),'Porcelain cream',label+' spire',32)
        for zz,ww in [(base+height*.13,width*.91),(base+height*.40,width*.73),(base+height*.48,width*.66),(base+height*.73,width*.41)]:
            for side in [-1,1]:
                b.box((x, y+side*ww/2,zz),(ww,.25,.3),'Porcelain blue',label+' glazed bands')
                b.box((x+side*ww/2,y,zz),(.25,ww,.3),'Porcelain green',label+' glazed bands')
            for j in range(12):
                a=j*math.tau/12;r=ww*.53
                b.box((x+r*math.cos(a),y+r*math.sin(a),zz+.25),(.2,.2,.38),'Imperial gold',label+' porcelain floral relief')
        for z0 in np.arange(base+1,base+height*.70,1.3):
            w=width*(1-.58*(z0-base)/height)
            for side in [-1,1]:
                b.box((x, y+side*w*.50,float(z0)),(.45,.11,.7),'Shadow recess',label+' recessed niches')
    prang(0,0,2.6,27,9.2,'Central prang')
    for x,y in [(-7,-7),(-7,7),(7,-7),(7,7)]:prang(x,y,1.6,13,4,'Corner prang')
    return b.finish()

def usa_exterior():
    b=Build('Statue of Liberty exterior')
    for z,w in [(.5,11),(1.5,9),(3,7.8),(10,6.5)]:b.box((0,0,z),(w,w,1.0 if z<3 else 1.8),'Roman travertine','Fort and pedestal terraces')
    b.frustum(3,11.7,7.2,5.5,mat='Roman travertine',part='Stone pedestal')
    for side in [-1,1]:
        b.box((side*3.2,-3.66,6.5),(.46,.15,4),'Limestone trim','Pedestal pilasters')
        b.box((side*3.2,3.66,6.5),(.46,.15,4),'Limestone trim','Pedestal pilasters')
    b.box((0,-3.68,4.3),(1.5,.13,2.9),'Shadow recess','Pedestal entrance')
    for z in [3.2,8.9,11.4]:b.box((0,0,z),(7.4,7.4,.32),'Limestone trim','Pedestal cornice')
    sculpted_robe(b,[(11.9,2.5,1.75),(13.4,2.85,1.88),(15.5,2.35,1.55),
                    (18,2.05,1.37),(20.5,1.75,1.25),(22.2,2.05,1.15),
                    (23.3,2.45,1.18),(24.1,1.15,.85),(24.7,.65,.55)],
                 'Copper patina','Draped copper robe')
    for j in range(32):
        a=j*math.tau/32;r=2.5
        b.beam((r*math.cos(a),r*math.sin(a),12.2),(.9*math.cos(a),.9*math.sin(a),24),.045,'Copper patina','Robe folds')
    lathe(b,[(0,.55),(.35,.75),(1.6,.77),(2.25,.6),(2.65,.25)],(0,0,24.5),'Copper patina','Head and face',48)
    b.box((0,-.74,26.15),(.22,.22,.48),'Copper patina','Sculpted nose')
    for x in [-.32,.32]:
        b.box((x,-.72,26.45),(.19,.07,.08),'Roman dark','Eyes under crown')
        b.box((x,-.65,25.9),(.36,.09,.11),'Copper patina','Cheeks')
    b.box((0,-.72,25.64),(.45,.07,.055),'Roman dark','Mouth')
    for x in [-.88,.88]:b.box((x,0,26.1),(.18,.36,.62),'Copper patina','Hair beside face')
    b.ring((0,0,27),1.1,.09,'Copper patina','Seven-ray crown',steps=32)
    for j in range(7):
        a=j*math.tau/7;b.beam((1.0*math.cos(a),1.0*math.sin(a),27),(1.9*math.cos(a),1.9*math.sin(a),28.3),.11,'Copper patina','Crown rays')
    b.beam((-1.75,0,23.15),(-3.1,-.2,22.0),.68,'Copper patina','Tablet sleeve',sides=16)
    b.beam((-3.1,-.2,22.0),(-4.2,-.2,21.3),.35,'Copper patina','Tablet forearm',sides=12)
    b.box((-4.35,-.18,21.5),(1.55,.36,3.8),'Copper patina','Declaration tablet')
    for z in [20.3,21,21.7,22.4]:b.beam((-5.02,-.4,z),(-3.7,-.4,z),.026,'Limestone trim','Tablet inscription lines')
    b.beam((1.8,0,23.3),(2.55,0,25.5),.72,'Copper patina','Raised sleeve',sides=16)
    b.beam((2.55,0,25.5),(4.1,0,29.8),.41,'Copper patina','Raised torch arm',sides=16)
    b.beam((4.1,0,29.8),(4.7,0,31),.21,'Copper patina','Torch handle')
    lathe(b,[(0,.5),(.35,.75),(.8,.7),(1,.35)],(4.7,0,31),'Torch gold','Torch bowl',24)
    lathe(b,[(0,.20),(.5,.52),(1.35,.12),(1.65,0)],(4.7,0,32),'Torch gold','Golden flame',24)
    stair_run(b,0,-7,0,2.3,4,12,'Roman travertine','Pedestal entrance stairs')
    return b.finish()

def australia_exterior():
    b=Build('Sydney Opera House exterior')
    b.box((0,0,.75),(24,18,1.5),'Concrete','Harbour podium')
    for x in [-9,-6,-3,0,3,6,9]:b.box((x,-8.4,3.3),(.09,.08,3.4),'Opera dark','Glass wall mullions')
    b.box((0,-8.45,3.2),(20,.08,3.2),'Glass','Harbour-facing glazing')
    stair_run(b,0,-12,.05,12,7,25,'Concrete','Monumental steps')
    def shell(cx,cy,base,width,length,height,flip,name):
        verts=[];rows=20;cols=18
        for i in range(rows+1):
            u=i/rows
            for j in range(cols+1):
                v=j/cols
                x=cx+(v-.5)*width*(1-.65*u)
                y=cy+(u-.5)*length
                z=base+height*math.sin(math.pi*u*.92)*(1-.18*(2*v-1)**2)+.18*math.sin(v*math.pi)
                verts.append((x,y,z))
        faces=[]
        for i in range(rows):
            for j in range(cols):
                a=i*(cols+1)+j;faces.append((a,a+1,a+cols+2,a+cols+1))
        b.mesh(verts,faces,'Opera tile',name+' ceramic shell')
        for j in range(0,cols+1,2):
            path=[verts[i*(cols+1)+j] for i in range(rows+1)]
            for p,q in zip(path,path[1:]):b.beam(p,q,.026,'Limestone trim',name+' precast ribs')
        for i in range(0,rows+1,3):
            path=[verts[i*(cols+1)+j] for j in range(cols+1)]
            for p,q in zip(path,path[1:]):b.beam(p,q,.019,'Limestone trim',name+' tile joints')
        b.box((cx,cy+length*.5,base+.6),(width*.4,.16,1.2),'Opera dark',name+' shell edge')
    shell(-5,-1,4,10,13,11,1,'Western concert hall')
    shell(5,1,4,9,12,10,-1,'Eastern theatre')
    shell(0,5,4,7,8,8,1,'Central overlapping shell')
    for x in [-8,8]:b.box((x,-5,3.6),(.15,5.2,3.4),'Opera dark','Glazed foyer mullions')
    return b.finish()

def italy_exterior():
    b=Build('Colosseum exterior')
    rx,ry=12,9
    b.box((0,0,.28),(27,21,.55),'Roman travertine','Amphitheatre foundation')
    for tier,z0,h in [(1,.55,5),(2,5.6,4.8),(3,10.45,4.1)]:
        count=36
        for i in range(count):
            a=i*math.tau/count;ca,sa=math.cos(a),math.sin(a)
            # Leave a characteristic damaged sector open in the upper levels.
            if tier>1 and 2.1<a<2.75:continue
            x,y=rx*ca,ry*sa
            b.box((x,y,z0+h*.48),(.57,.65,h*.96),'Roman travertine',f'Tier {tier} arcade piers')
            nexta=(i+1)*math.tau/count
            nx,ny=rx*math.cos(nexta),ry*math.sin(nexta)
            for j in range(13):
                t=j/12;arc_z=z0+h*.69+math.sin(t*math.pi)*h*.22
                aa=a+(nexta-a)*t;bb=a+(nexta-a)*(t+1/12)
                x0,y0=rx*math.cos(aa),ry*math.sin(aa);x1,y1=rx*math.cos(bb),ry*math.sin(bb)
                b.beam((x0,y0,arc_z),(x1,y1,z0+h*.69+math.sin((t+1/12)*math.pi)*h*.22),.10,'Roman travertine',f'Tier {tier} curved arches')
            b.beam((x,y,z0+h),(nx,ny,z0+h),.15,'Roman travertine',f'Tier {tier} architraves')
        for j in range(count):
            a=j*math.tau/count;bb=(j+1)*math.tau/count
            b.beam((rx*math.cos(a),ry*math.sin(a),z0+h),(rx*math.cos(bb),ry*math.sin(bb),z0+h),.17,'Roman travertine',f'Tier {tier} cornice')
    for row in range(8):
        r=row/8
        for i in range(64):
            a=i*math.tau/64;bb=(i+1)*math.tau/64
            xx,yy=(rx-1.8-4*r)*math.cos(a),(ry-1.3-3*r)*math.sin(a)
            x1,y1=(rx-1.8-4*r)*math.cos(bb),(ry-1.3-3*r)*math.sin(bb)
            b.beam((xx,yy,2.2+row*.79),(x1,y1,2.2+row*.79),.19,'Roman travertine','Concentric seating tiers')
    b.box((0,0,.25),(13,7,.45),'Roman dark','Arena and hypogeum')
    for x in [-5,-2.5,0,2.5,5]:b.box((x,0,.8),(.35,6,1.1),'Roman travertine','Hypogeum stone passages')
    return b.finish()

def brazil_exterior():
    b=Build('Christ the Redeemer exterior')
    b.frustum(.2,2,15,11,mat='Roman travertine',part='Corcovado summit base')
    b.frustum(2,8.1,9,6.5,mat='Soapstone',part='Statue pedestal')
    b.box((0,-3.3,4.3),(2.4,.2,3.0),'Shadow recess','Chapel doorway')
    for z in [2.1,7.8]:b.box((0,0,z),(9.2,7.7,.30),'Limestone trim','Pedestal cornice')
    sculpted_robe(b,[(8,2.5,1.6),(10.5,2.65,1.66),(13,2.3,1.48),
                    (16,1.95,1.34),(19,1.78,1.30),(21.4,2.5,1.42),
                    (22.6,2.8,1.35),(23.5,1.2,.88),(24,.72,.55)],
                 'Soapstone','Art Deco robe')
    for j in range(28):
        a=j*math.tau/28;b.beam((2.4*math.cos(a),2.4*math.sin(a),8.3),(1.5*math.cos(a),1.5*math.sin(a),23.8),.05,'Limestone trim','Robe vertical facets')
    for side in [-1,1]:
        b.beam((side*2.0,0,22.2),(side*5.2,0,22.45),.90,'Soapstone','Broad sleeves',sides=16)
        b.beam((side*5.2,0,22.45),(side*9.6,0,22.6),.72,'Soapstone','Outstretched forearms',sides=16)
        b.beam((side*9.6,0,22.6),(side*11.8,0,22.6),.48,'Soapstone','Open wrists',sides=12)
    for side in [-1,1]:
        b.box((side*12.05,0,22.6),(1.1,.64,.54),'Soapstone','Open hands')
        for j in range(4):b.beam((side*12.3,(j-1.5)*.13,22.55),(side*12.75,(j-1.5)*.13,22.55),.055,'Soapstone','Hand fingers')
    lathe(b,[(0,.55),(.3,.72),(1.45,.77),(2.15,.59),(2.4,.2)],(0,0,24),'Soapstone','Head',48)
    for x in [-.3,.3]:
        b.box((x,-.72,25.6),(.19,.07,.055),'Roman dark','Carved eyes')
        b.box((x,-.65,25.15),(.3,.09,.12),'Soapstone','Face cheeks')
    b.box((0,-.76,25.3),(.24,.22,.4),'Soapstone','Sculpted nose')
    b.box((0,-.72,24.8),(.5,.1,.16),'Soapstone','Beard and mouth')
    for x in [-.83,.83]:b.box((x,0,25.1),(.23,.43,.75),'Soapstone','Art Deco hair')
    b.box((0,-.70,25.15),(1.26,.16,.07),'Roman dark','Face brows')
    b.box((0,-.81,24.56),(.24,.12,.28),'Soapstone','Nose')
    b.box((0,-.72,24.24),(.55,.05,.045),'Roman dark','Mouth')
    stair_run(b,0,-9,.15,3.8,5,16,'Roman travertine','Summit stairs')
    return b.finish()


_plain_finish=Build.finish
def detailed_finish(b):
    """Add the visible surface details that distinguish each monument up close."""
    name=b.name
    if 'Forbidden City' in name:
        for z,w,d,rise in [(12.6,19.7,13.3,3.5),(16.7,17.1,11.5,3.0)]:
            for side in [-1,1]:
                for row in range(19):
                    y=side*(row+.45)*d/38
                    roofz=z+rise*(1-2*abs(y)/d)+.035
                    for col in range(72):
                        x=-w/2+(col+.5)*w/72
                        b.box((x,y,roofz),(.14,.045,.035),'Imperial gold','Glazed roof tiles')
        for yy in [-7.8,7.8]:
            for x in np.arange(-10,10,.42):
                b.beam((float(x),yy,1.55),(float(x),yy,2.1),.027,'Marble white','Carved terrace balusters')
        for xx in [-10.1,10.1]:
            for y in np.arange(-7.4,7.4,.42):b.beam((xx,float(y),1.55),(xx,float(y),2.1),.027,'Marble white','Carved terrace balusters')
        for x in np.arange(-7.5,8,1.1):
            for y in [-5.3,5.3]:
                for i in range(8):
                    zz=11.1+i*.12
                    b.beam((float(x),y,zz),(float(x)+.45,y,zz+.24),.03,'Imperial gold','Layered dougong brackets')
    elif 'Himeji Castle' in name:
        for z,w,d in [(7.65,14.6,12.4),(12.25,13,11.3),(16.65,11.3,9.9),(20.65,9.4,8.4),(24.35,8.1,7.3)]:
            for side in [-1,1]:
                for row in range(15):
                    yy=side*(row+.5)*d/30
                    zz=z+1.7*(1-2*abs(yy)/d)+.055
                    for col in range(52):
                        xx=-w/2+(col+.5)*w/52
                        b.box((xx,yy,zz),(.13,.055,.035),'Roof charcoal','Overlapping roof tiles')
            for x in np.arange(-w/2,w/2,.8):
                for y in [-d/2,d/2]:b.box((float(x),y,z+.12),(.34,.15,.17),'Limestone trim','Eave endcaps')
        for side in [-1,1]:
            for level,z,w,d in [(0,3.6,12.4,10.2),(1,8.4,10.8,9.1),(2,13,9.1,7.7),(3,17.5,7.2,6.2)]:
                for x in np.arange(-w/2+.5,w/2,.8):
                    b.box((float(x),side*d/2+.065,z),(.07,.06,1.15),'Wood','Keep timber frames')
    elif 'Taj Mahal' in name:
        for i in range(72):
            a=i*math.tau/72
            for j in range(28):
                t=j/28
                r=5.4*math.sqrt(max(0,1-t*t))
                z=12.2+t*6.65
                b.box((r*math.cos(a),r*math.sin(a),z),(.055,.055,.11),'Marble inlay' if i%6==0 else 'Marble white','Dome petal inlay')
        for side in [-1,1]:
            for x in np.arange(-6.6,6.6,.37):
                for z in [2.6,4.3,6,7.7,9.4]:
                    b.box((float(x),side*7.08,z),(.1,.045,.18),'Marble inlay','Facade floral bands')
        for x in [-9.7,9.7]:
            for y in [-9.7,9.7]:
                for z in np.arange(2.1,14,.34):
                    r=.86-(z-1.1)*.012
                    b.ring((x,y,float(z)),r,.014,'Limestone trim','Minaret carved courses',steps=24)
    elif 'Wat Arun' in name:
        for cx,cy,base,height,width in [(0,0,2.6,27,9.2)]+[(x,y,1.6,13,4) for x,y in [(-7,-7),(-7,7),(7,-7),(7,7)]]:
            for row in range(40):
                t=(row+.5)/40
                if t>.79:continue
                z=base+t*height
                w=width*(1-.58*t) if t<.46 else width*(.72-.35*(t-.46)/.33)
                for side in range(4):
                    for col in range(22):
                        p=(col+.5)/22-.5
                        mat=['Porcelain blue','Porcelain green','Imperial gold','Porcelain cream'][(row+col+side)%4]
                        if side==0:b.box((cx+p*w,cy-w/2-.035,z),(.13,.055,.14),mat,'Porcelain mosaic petals')
                        elif side==1:b.box((cx+p*w,cy+w/2+.035,z),(.13,.055,.14),mat,'Porcelain mosaic petals')
                        elif side==2:b.box((cx-w/2-.035,cy+p*w,z),(.055,.13,.14),mat,'Porcelain mosaic petals')
                        else:b.box((cx+w/2+.035,cy+p*w,z),(.055,.13,.14),mat,'Porcelain mosaic petals')
    elif 'Statue of Liberty' in name:
        for j in range(72):
            a=j*math.tau/72
            for k in range(28):
                z=12+k*.42
                rr=2.5-(z-12)*.11+.13*math.sin(a*9+z*.44)
                rr2=2.5-(z+.42-12)*.11+.13*math.sin(a*9+(z+.42)*.44)
                b.beam((rr*math.cos(a),rr*math.sin(a),z),(rr2*math.cos(a),rr2*math.sin(a),z+.42),.025,'Limestone trim','Copper robe fold edges')
        for z in [4,5,6,7,8,9,10]:
            for side in [-1,1]:
                for x in np.arange(-3.0,3.1,.52):
                    b.box((float(x),side*3.55,z),(.18,.07,.07),'Limestone trim','Pedestal stone joints')
    elif 'Sydney Opera House' in name:
        for cx,cy,base,w,l,h in [(-5,-1,4,10,13,11),(5,1,4,9,12,10),(0,5,4,7,8,8)]:
            for row in range(65):
                u=(row+.5)/65
                for col in range(45):
                    v=(col+.5)/45
                    x=cx+(v-.5)*w*(1-.65*u)
                    y=cy+(u-.5)*l
                    z=base+h*math.sin(math.pi*u*.92)*(1-.18*(2*v-1)**2)+.18*math.sin(v*math.pi)+.03
                    if row%4==0 or col%5==0:
                        b.box((x,y,z),(.07,.06,.025),'Limestone trim','Ceramic tile grid and ribs')
        for x in np.arange(-10,10,.45):b.box((float(x),-8.5,3.2),(.035,.08,3.15),'Opera dark','Foyer glazing mullions')
    elif 'Colosseum' in name:
        for tier,z0,h in [(1,.55,5),(2,5.6,4.8),(3,10.45,4.1)]:
            for i in range(36):
                a=i*math.tau/36
                if tier>1 and 2.1<a<2.75:continue
                x,y=12*math.cos(a),9*math.sin(a)
                for zz in np.arange(z0+.5,z0+h-.2,.52):
                    b.box((x,y,float(zz)),(.62,.04,.035),'Limestone trim','Travertine block courses')
                for side in [-1,1]:b.beam((x+side*.13,y,z0),(x+side*.13,y,z0+h*.69),.05,'Roman dark','Arcade column fluting')
        for row in range(9):
            r=row/9
            for i in range(64):
                a=i*math.tau/64
                x,y=(10-4*r)*math.cos(a),(7.7-3*r)*math.sin(a)
                b.box((x,y,2.1+row*.79),(.18,.18,.26),'Roman dark','Seating aisle joints')
    elif 'Christ the Redeemer' in name:
        for j in range(64):
            a=j*math.tau/64
            for k in range(29):
                z=8+k*.52
                rr=2.5-(z-8)*.07+.08*math.sin(a*8+z*.6)
                r2=2.5-(z+.52-8)*.07+.08*math.sin(a*8+(z+.52)*.6)
                b.beam((rr*math.cos(a),rr*math.sin(a),z),(r2*math.cos(a),r2*math.sin(a),z+.52),.027,'Limestone trim','Soapstone robe facets')
        for z in np.arange(2.4,7.8,.38):
            for x in np.arange(-3.5,3.6,.58):b.box((float(x),-3.32,float(z)),(.22,.05,.035),'Limestone trim','Pedestal stone block seams')
    return _plain_finish(b)

Build.finish=detailed_finish

specs=[
    ('forbidden',china_exterior),('himeji',japan_exterior),('taj',india_exterior),('watarun',thailand_exterior),
    ('liberty',usa_exterior),('opera',australia_exterior),('colosseum',italy_exterior),('cristo',brazil_exterior)]
records=[]
for code,build in specs:
    for kind,fn in [('exterior',build)]:
        collection=fn();filename=f'{code}-{kind}'
        bpy.ops.object.select_all(action='DESELECT')
        for ob in collection.objects:ob.select_set(True)
        bpy.ops.export_scene.gltf(filepath=str(OUT/(filename+'.glb')),export_format='GLB',use_selection=True,export_cameras=False,export_lights=False,export_apply=True,export_yup=True)
        records.append({'file':filename+'.glb','objects':len(collection.objects),'vertices':sum(len(o.data.vertices) for o in collection.objects if o.type=='MESH'),'bytes':(OUT/(filename+'.glb')).stat().st_size})
        collection.hide_render=True
        print('EXPORTED',filename,records[-1]['vertices'])

# Save editable source with one collection per exterior landmark.
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'landmarks-extra.blend'))
(SOURCE/'build-manifest-extra.json').write_text(json.dumps({'script':'scripts/build_landmarks_extra.py','generator':'Blender '+bpy.app.version_string,'notes':'Exterior architectural studies; dimensions are illustrative.','assets':records},ensure_ascii=False,indent=2),encoding='utf-8')
print('EXTRA_LANDMARK_BUILD_COMPLETE',json.dumps(records))
