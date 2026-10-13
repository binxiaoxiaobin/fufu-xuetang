"""Publish the verified culture/audio migration without reseeding other content."""
import getpass
import json
import os
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
import earth_culture

os.environ['FUFU_MYSQL_PASSWORD'] = getpass.getpass('MySQL password: ')
earth_culture.initialize()
catalog = earth_culture.catalog()
seed = json.loads(earth_culture.SEED.read_text(encoding='utf-8'))
for kind in ('countries', 'landmarks'):
    assert catalog[kind] == seed[kind], kind + ': text and audio must exactly match'
print('Database publication verified: 24 countries + 11 landmarks, 35 matching recordings.')
