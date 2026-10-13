"""Read-only geometry report for placing the character's local animation rig."""

from pathlib import Path
import bpy

source = Path(__file__).resolve().parent.parent / "artifacts/tuantuan-girl/tuantuan-girl-tripo-source.glb"
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))
mesh = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH")
print("VERTICES", len(mesh.data.vertices), "FACES", len(mesh.data.polygons))
for low in [i / 20 for i in range(20)]:
    high = low + .05
    points = [v.co for v in mesh.data.vertices if low <= v.co.z < high]
    if points:
        xs = sorted(p.x for p in points)
        ys = sorted(p.y for p in points)
        print(f"Z {low:.2f}-{high:.2f} N {len(points)} X {xs[0]:.3f}..{xs[-1]:.3f} Y {ys[0]:.3f}..{ys[-1]:.3f}")
for low, high in ((.65,.70),(.70,.75),(.75,.80),(.80,.85)):
    points = [v.co for v in mesh.data.vertices if low <= v.co.z < high and abs(v.co.x)<.14 and v.co.y < 0]
    if points:
        ys = sorted(p.y for p in points)
        print(f"FACE Z {low:.2f}-{high:.2f} FRONT_Y {ys[0]:.3f} P10 {ys[len(ys)//10]:.3f}")
