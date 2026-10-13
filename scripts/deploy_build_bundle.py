"""Package application source plus changed publication assets, excluding user data."""
import argparse
import gzip
import hashlib
import json
import tarfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SKIP_DIRS={'.git','node_modules','__pycache__','.venv','venv','backups','logs'}
SKIP_SUFFIX={'.pyc','.pyo','.sqlite','.sqlite3','.db','.log','.lock','.tmp'}

def safe_source(file):
    rel=file.relative_to(ROOT)
    return not any(p in SKIP_DIRS for p in rel.parts) and not str(rel).replace('\\','/').startswith('backend/data/') and not (rel.parts[:2]==('frontend','assets')) and not file.name.startswith('.env') and file.suffix not in SKIP_SUFFIX and '.tmp.' not in file.name

def sha(data):return hashlib.sha256(data).hexdigest()

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--tag',required=True);parser.add_argument('--directory',default='artifacts/cloud-deploy');args=parser.parse_args()
    directory=ROOT/args.directory;directory.mkdir(parents=True,exist_ok=True)
    with gzip.open(directory/'local-assets.json.gz','rt',encoding='utf-8') as f:local=json.load(f)
    with gzip.open(directory/'remote-assets.json.gz','rt',encoding='utf-8') as f:remote=json.load(f)
    with gzip.open(directory/'content-only.json.gz','rt',encoding='utf-8') as f:snapshot=json.load(f)
    public={row['public_path'][8:] for row in snapshot['tables']['media_assets']['rows'] if row['public_path'].startswith('/assets/')}
    delta={}
    for name,item in local.items():
        if name.startswith(('avatars/','uploads/','user-content/')):continue
        if name.startswith('audio/tts/') and name not in public and name!='audio/tts/manifest.json':continue
        if name.startswith('content/') and name not in public:continue
        if name in remote and item['sha256']==remote[name]['sha256']:continue
        if name.startswith('content/') and name in remote:
            raise ValueError('Existing production upload must be preserved: '+name)
        delta[name]=dict(item,mode='merge-json' if name.endswith('/manifest.json') else 'replace')
    files=[]
    for name in ('backend','frontend','content','scripts','docs','deploy','tools'):
        files.extend(p for p in (ROOT/name).rglob('*') if p.is_file() and safe_source(p))
    files.extend(ROOT/name for name in ('README.md','DESIGN.md','.gitignore'))
    code_manifest={}
    with tarfile.open(directory/'code.tar.gz','w:gz',compresslevel=5) as archive:
        for file in sorted(files):
            relative=file.relative_to(ROOT).as_posix();raw=file.read_bytes()
            if file.suffix in {'.py','.ps1','.js','.json','.md','.html'} and ((b'BEGIN OPENSSH '+b'PRIVATE KEY') in raw or (b'raoyi'+b'bin') in raw):
                raise ValueError('Secret-looking local source must not be packaged: '+relative)
            code_manifest[relative]={'bytes':len(raw),'sha256':sha(raw)}
            archive.add(file,arcname=relative,recursive=False)
    with tarfile.open(directory/'assets-delta.tar.gz','w:gz',compresslevel=5) as archive:
        for name,item in sorted(delta.items()):
            file=ROOT/'frontend/assets'/name
            if name=='audio/tts/manifest.json':
                value=json.loads(file.read_text(encoding='utf-8'))
                value={key:url for key,url in value.items() if (url[8:] if url.startswith('/assets/') else url) in public}
                raw=json.dumps(value,ensure_ascii=False,separators=(',',':')).encode()
                import io
                record=tarfile.TarInfo(name);record.size=len(raw);record.mode=0o644
                archive.addfile(record,io.BytesIO(raw));item.update(bytes=len(raw),sha256=sha(raw))
            else:archive.add(file,arcname=name,recursive=False)
    manifest={'tag':args.tag,'code_files':code_manifest,'assets':delta,'source_rows':{t:len(item['rows']) for t,item in snapshot['tables'].items()},'content_snapshot_sha256':sha((directory/'content-only.json.gz').read_bytes()),'bundle_sha256':{name:sha((directory/name).read_bytes()) for name in ('code.tar.gz','assets-delta.tar.gz')}}
    (directory/'release-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Code bundle:',len(code_manifest),'files;',round((directory/'code.tar.gz').stat().st_size/1024/1024,2),'MiB',flush=True)
    print('Asset delta:',len(delta),'files;',round((directory/'assets-delta.tar.gz').stat().st_size/1024/1024,2),'MiB',flush=True)
    print('Publication tables:',len(snapshot['tables']),'local user tables: 0',flush=True)

if __name__=='__main__':main()
