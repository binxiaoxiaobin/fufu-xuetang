"""Import local English cards without reimporting unrelated content catalogs."""
import getpass
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.environ['FUFU_MYSQL_PASSWORD'] = getpass.getpass('Local MySQL password: ')
sys.path.insert(0,str(ROOT/'backend'))
import action_cards
action_cards.initialize()
cards = action_cards.list_english_cards()['cards']
counts = {}
for card in cards:
    counts[card['category_key']] = counts.get(card['category_key'],0)+1
print('Imported English cards:',len(cards),counts)
