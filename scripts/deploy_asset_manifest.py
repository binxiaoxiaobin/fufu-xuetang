"""Generate SHA-256 manifests of local/remote asset files, without their contents."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

def main():
    parser=argparse.ArgumentParser();parser.add_argument('root');parser.add_argument('output');args=parser.parse_args()
    root=Path(args.root);manifest={}
    for file in root.rglob('*'):
        if not file.is_file() or any(part in {'__pycache__','node_modules','.git'} for part in file.relative_to(root).parts):continue
        relative=file.relative_to(root).as_posix()
        if file.suffix in {'.tmp','.lock','.pyc'} or '.tmp.' in file.name:continue
        digest=hashlib.sha256()
        with file.open('rb') as f:
            for block in iter(lambda:f.read(1024*1024),b''):digest.update(block)
        manifest[relative]={'bytes':file.stat().st_size,'sha256':digest.hexdigest()}
    with gzip.open(args.output,'wt',encoding='utf-8') as f:json.dump(manifest,f,separators=(',',':'))
    print('Asset manifest:',len(manifest),'files;',round(sum(v['bytes'] for v in manifest.values())/1024/1024,1),'MiB',flush=True)

if __name__=='__main__':main()
