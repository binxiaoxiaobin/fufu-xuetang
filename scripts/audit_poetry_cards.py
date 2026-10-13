"""Verify current local cards and public API without touching learning progress."""
import json
import hashlib
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import requests

ROOT=Path(__file__).resolve().parents[1]

def verify_card(card):
    session=requests.Session();session.trust_env=False
    response=session.get('http://127.0.0.1:8000/api/learning/reading-cards/'+str(card['id']),timeout=12)
    response.raise_for_status();detail=response.json()
    assert detail['explanation']['meaning'],detail['title']
    assert 'explanation_json' not in detail
    for key in ('image_path','audio_path'):
        head=session.head('http://127.0.0.1:8000'+detail[key],timeout=12)
        assert head.status_code==200,(detail['title'],key,head.status_code)
    return detail

def main():
    local=json.loads((ROOT/'content/learning/poetry-cards.json').read_text(encoding='utf-8'))
    assert len(local)==300
    assert len({c['slug'] for c in local})==300
    assert all(c['explanation']['meaning'] and len(c['explanation']['meaning'])>=35 for c in local)
    assert all('/individual/' in c['image_path'] for c in local)
    images=[ROOT/'frontend'/c['image_path'].lstrip('/') for c in local]
    assert all(p.is_file() for p in images)
    assert len({hashlib.sha256(p.read_bytes()).hexdigest() for p in images})==300
    session=requests.Session();session.trust_env=False;cards=[]
    for page in range(1,14):
        response=session.get('http://127.0.0.1:8000/api/learning/reading-cards',params={'page':page},timeout=12)
        response.raise_for_status();data=response.json();assert data['total']==300
        assert all('paragraphs' not in c and 'explanation' not in c and 'audio_path' not in c for c in data['cards'])
        cards+=data['cards']
    assert len(cards)==len({c['id'] for c in cards})==300
    with ThreadPoolExecutor(max_workers=6) as pool:details=list(pool.map(verify_card,cards))
    by_slug={c['slug']:c for c in local}
    for detail in details:
        expected=by_slug[detail['slug']]
        assert detail['paragraphs']==expected['paragraphs']
        assert detail['explanation']==expected['explanation']
        assert detail['image_path']==expected['image_path']
    assert session.get('http://127.0.0.1:8000/api/learning/reading-cards',params={'kind':'science'},timeout=12).json()['total']==12
    report={'poems':300,'original_explanations':300,'unique_images':300,'detail_and_media_checks':900,
            'pages':13,'science_cards':12,'total_image_bytes':sum(p.stat().st_size for p in images)}
    (ROOT/'artifacts/poetry-cards-verification.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report))

if __name__=='__main__':main()
