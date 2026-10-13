"""Initialize subject reading cards without importing unrelated work in progress."""
import getpass
import os
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
os.environ['FUFU_MYSQL_PASSWORD']=getpass.getpass('Local MySQL password: ')
sys.path.insert(0,str(ROOT/'backend'))
import reading_cards
reading_cards.initialize()
print('Poetry:',reading_cards.list_cards()['total'],'Science:',reading_cards.list_cards('science')['total'])
