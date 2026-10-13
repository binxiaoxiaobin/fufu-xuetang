"""Combine Meshy exports that share an identical character mesh and skeleton."""

import copy
import json
import struct
import sys
from pathlib import Path


def read_glb(path):
    data = Path(path).read_bytes()
    magic, version, total = struct.unpack_from("<4sII", data)
    if magic != b"glTF" or version != 2 or total != len(data):
        raise ValueError(f"Invalid GLB: {path}")
    offset = 12
    chunks = {}
    while offset < len(data):
        length, kind = struct.unpack_from("<I4s", data, offset)
        offset += 8
        chunks[kind] = data[offset : offset + length]
        offset += length
    return json.loads(chunks[b"JSON"]), chunks[b"BIN\x00"]


def main(walking_path, running_path, output_path):
    base, base_bin = read_glb(walking_path)
    extra, extra_bin = read_glb(running_path)
    for key in ("nodes", "meshes", "skins", "materials", "textures", "images", "samplers"):
        if base.get(key) != extra.get(key):
            raise ValueError(f"Exports have different {key}; cannot combine safely")
    if len(base.get("buffers", [])) != 1 or len(extra.get("buffers", [])) != 1:
        raise ValueError("Expected one binary buffer in each Meshy export")

    merged_bin = bytearray(base_bin)
    view_map = {}
    accessor_map = {}

    def copy_accessor(index):
        if index in accessor_map:
            return accessor_map[index]
        accessor = copy.deepcopy(extra["accessors"][index])
        if "sparse" in accessor:
            raise ValueError("Sparse animation accessors are not supported")
        old_view = accessor["bufferView"]
        if old_view not in view_map:
            view = copy.deepcopy(extra["bufferViews"][old_view])
            if view.get("buffer", 0) != 0:
                raise ValueError("Unexpected source buffer")
            start = view.get("byteOffset", 0)
            end = start + view["byteLength"]
            if end > len(extra_bin):
                raise ValueError("Buffer view extends past BIN chunk")
            while len(merged_bin) % 4:
                merged_bin.append(0)
            view["byteOffset"] = len(merged_bin)
            view["buffer"] = 0
            merged_bin.extend(extra_bin[start:end])
            view_map[old_view] = len(base["bufferViews"])
            base["bufferViews"].append(view)
        accessor["bufferView"] = view_map[old_view]
        accessor_map[index] = len(base["accessors"])
        base["accessors"].append(accessor)
        return accessor_map[index]

    names = {item.get("name") for item in base.get("animations", [])}
    for source_animation in extra.get("animations", []):
        animation = copy.deepcopy(source_animation)
        if animation.get("name") in names:
            raise ValueError(f"Duplicate animation: {animation.get('name')}")
        for sampler in animation["samplers"]:
            sampler["input"] = copy_accessor(sampler["input"])
            sampler["output"] = copy_accessor(sampler["output"])
        base.setdefault("animations", []).append(animation)
        names.add(animation.get("name"))

    while len(merged_bin) % 4:
        merged_bin.append(0)
    base["buffers"][0]["byteLength"] = len(merged_bin)
    json_bytes = json.dumps(base, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    json_bytes += b" " * (-len(json_bytes) % 4)
    total_length = 12 + 8 + len(json_bytes) + 8 + len(merged_bin)
    result = (
        struct.pack("<4sII", b"glTF", 2, total_length)
        + struct.pack("<I4s", len(json_bytes), b"JSON")
        + json_bytes
        + struct.pack("<I4s", len(merged_bin), b"BIN\x00")
        + merged_bin
    )
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    Path(output_path).write_bytes(result)
    print(output_path)
    print("animations:", [item.get("name") for item in base["animations"]])
    print("bytes:", len(result))


if __name__ == "__main__":
    main(*sys.argv[1:4])
