"""List the largest connected pieces and their dominant Meshy skin weights."""

import collections
import sys

import bpy


source = sys.argv[sys.argv.index("--") + 1]
bpy.ops.import_scene.gltf(filepath=source)
mesh = max((obj for obj in bpy.context.scene.objects if obj.type == "MESH"), key=lambda obj: len(obj.data.vertices))
vertices = mesh.data.vertices
parent = list(range(len(vertices)))


def root(index):
    while parent[index] != index:
        parent[index] = parent[parent[index]]
        index = parent[index]
    return index


for edge in mesh.data.edges:
    a, b = edge.vertices
    parent[root(a)] = root(b)

islands = collections.defaultdict(list)
for vertex in vertices:
    islands[root(vertex.index)].append(vertex)

print("ISLAND_COUNT", len(islands))
for rank, island in enumerate(sorted(islands.values(), key=len, reverse=True)[:100], 1):
    if len(island) < 100:
        break
    points = [mesh.matrix_world @ vertex.co for vertex in island]
    center = tuple(round(sum(point[i] for point in points) / len(points), 3) for i in range(3))
    bounds = tuple((round(min(point[i] for point in points), 3), round(max(point[i] for point in points), 3)) for i in range(3))
    weights = collections.defaultdict(float)
    for vertex in island:
        for group in vertex.groups:
            weights[mesh.vertex_groups[group.group].name] += group.weight
    total = sum(weights.values()) or 1
    dominant = [(name, round(value / total, 2)) for name, value in sorted(weights.items(), key=lambda item: item[1], reverse=True)[:4]]
    print("ISLAND", rank, "VERTICES", len(island), "CENTER", center, "BOUNDS", bounds, "BONES", dominant)
