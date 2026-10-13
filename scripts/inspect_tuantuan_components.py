"""Report mesh islands to guide clean deformation regions (read only)."""

from pathlib import Path
import bpy

root = Path(__file__).resolve().parent.parent
bpy.ops.import_scene.gltf(filepath=str(root / "frontend/assets/characters/tuantuan-girl-rigged.glb"))
for mesh in [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]:
    vertices = mesh.data.vertices
    parent = list(range(len(vertices)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for edge in mesh.data.edges:
        a, b = edge.vertices
        parent[find(a)] = find(b)
    components = {}
    for vertex in vertices:
        components.setdefault(find(vertex.index), []).append(vertex.co)
    print("MESH", mesh.name, "COMPONENTS", len(components))
    for points in sorted(components.values(), key=len, reverse=True)[:80]:
        xyz = [tuple(point[i] for point in points) for i in range(3)]
        center = [sum(v) / len(v) for v in xyz]
        if mesh.name == "Tuantuan Clay Character" and .85 < center[2] < 2.1:
            print("ISLAND", len(points), "CENTER", [round(v, 3) for v in center], "BOUNDS", [(round(min(v), 3), round(max(v), 3)) for v in xyz])
