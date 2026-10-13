"""Read/write Godot 3 PCK archives while retaining untouched exported resources."""
import hashlib
import struct
from pathlib import Path

def read_pack(path):
    blob=Path(path).read_bytes()
    magic,version,major,minor,patch=struct.unpack_from('<5I',blob)
    if magic!=0x43504447 or version!=1:raise ValueError('Expected Godot 3 PCK v1')
    pos=84
    count,=struct.unpack_from('<I',blob,pos);pos+=4
    files={}
    for _ in range(count):
        length,=struct.unpack_from('<I',blob,pos);pos+=4
        name=blob[pos:pos+length].rstrip(b'\0').decode('utf-8');pos+=length
        offset,size=struct.unpack_from('<QQ',blob,pos);pos+=16
        digest=blob[pos:pos+16];pos+=16
        value=blob[offset:offset+size]
        if hashlib.md5(value).digest()!=digest:raise ValueError('Invalid checksum: '+name)
        files[name]=value
    return (major,minor,patch),files

def write_pack(path,engine,files):
    rows=[];index_size=88
    for name,value in sorted(files.items()):
        encoded=name.encode('utf-8')+b'\0';encoded+=b'\0'*((-len(encoded))%4)
        rows.append((encoded,value));index_size+=4+len(encoded)+32
    offset=(index_size+15)&~15
    index=bytearray(struct.pack('<5I',0x43504447,1,*engine)+b'\0'*64+struct.pack('<I',len(rows)))
    data=bytearray(b'\0'*(offset-index_size))
    for name,value in rows:
        index.extend(struct.pack('<I',len(name))+name+struct.pack('<QQ',offset,len(value))+hashlib.md5(value).digest())
        data.extend(value);padding=(-len(value))%16;data.extend(b'\0'*padding);offset+=len(value)+padding
    Path(path).write_bytes(index+data)
