"""CRUD for learning cards used by the live learning-card APIs."""
import re

from mysql_db import connection


def list_cards(kind):
    with connection() as conn:
        with conn.cursor() as cur:
            if kind == 'pinyin':
                cur.execute("""SELECT c.id,c.slug,c.symbol,c.group_key,c.group_name,c.position,
                    c.status,c.audio_asset_id,m.public_path AS audio_path
                    FROM learning_pinyin_cards c LEFT JOIN media_assets m ON m.id=c.audio_asset_id
                    ORDER BY c.position,c.id""")
            else:
                cur.execute("""SELECT c.id,c.slug,c.word,c.meaning,c.sentence,c.translation,c.hint,
                    c.group_name AS `group`,c.color,c.position,c.status,c.category_key,c.category_name,
                    c.display_kind,c.image_asset_id,c.word_audio_asset_id,c.sentence_audio_asset_id,
                    i.public_path AS image_path
                    FROM learning_action_cards c JOIN media_assets i ON i.id=c.image_asset_id
                    ORDER BY c.category_name,c.position,c.id""")
            return cur.fetchall()


def save_card(kind, values, card_id=None):
    slug = str(values.get('slug', '')).strip().lower()
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', slug) or len(slug) > (16 if kind == 'pinyin' else 50):
        raise ValueError('编号只用小写英文、数字和连字符')
    status = str(values.get('status', 'published'))
    if status not in ('published', 'archived'):
        raise ValueError('状态无效')
    position = max(0, min(65535, int(values.get('position') or 0)))
    with connection() as conn:
        with conn.cursor() as cur:
            if kind == 'pinyin':
                symbol = str(values.get('symbol', '')).strip()
                group_key = str(values.get('group_key', '')).strip().lower()
                group_name = str(values.get('group_name', '')).strip()
                if not symbol or len(symbol) > 16 or not re.fullmatch(r'[a-z0-9-]{1,24}', group_key) or not group_name:
                    raise ValueError('请填写拼音、分组编号和分组名称')
                audio_id = values.get('audio_asset_id') or None
                if audio_id:
                    cur.execute("SELECT id FROM media_assets WHERE id=%s AND media_kind='audio'", (int(audio_id),))
                    if not cur.fetchone():
                        raise ValueError('所选录音素材不存在')
                params = (slug,symbol,group_key,group_name,position,audio_id,status)
                if card_id:
                    cur.execute("""UPDATE learning_pinyin_cards SET slug=%s,symbol=%s,group_key=%s,
                        group_name=%s,position=%s,audio_asset_id=%s,status=%s WHERE id=%s""",params+(card_id,))
                    if not cur.rowcount:
                        cur.execute("SELECT id FROM learning_pinyin_cards WHERE id=%s", (card_id,))
                        if not cur.fetchone(): raise LookupError('卡片不存在')
                else:
                    cur.execute("""INSERT INTO learning_pinyin_cards
                        (slug,symbol,group_key,group_name,position,audio_asset_id,status)
                        VALUES (%s,%s,%s,%s,%s,%s,%s)""",params)
                    card_id = cur.lastrowid
            else:
                word = str(values.get('word', '')).strip()
                meaning = str(values.get('meaning', '')).strip()
                sentence = str(values.get('sentence', '')).strip()
                translation = str(values.get('translation', '')).strip()
                group_name = str(values.get('group', '')).strip()
                category_key = str(values.get('category_key', '')).strip().lower()
                category_name = str(values.get('category_name', '')).strip()
                image_id = int(values.get('image_asset_id') or 0)
                if not all((word, meaning, sentence, translation, group_name, category_key, category_name, image_id)):
                    raise ValueError('请填写单词、释义、例句、翻译、分类和图片')
                if not re.fullmatch(r'[a-z0-9-]{1,40}', category_key): raise ValueError('分类编号只用小写英文、数字和连字符')
                cur.execute("SELECT id FROM media_assets WHERE id=%s AND media_kind='image'", (image_id,))
                if not cur.fetchone(): raise ValueError('所选图片素材不存在')
                audio_ids=[]
                for field in ('word_audio_asset_id','sentence_audio_asset_id'):
                    asset_id=values.get(field) or None
                    if asset_id:
                        cur.execute("SELECT id FROM media_assets WHERE id=%s AND media_kind='audio'", (int(asset_id),))
                        if not cur.fetchone(): raise ValueError('所选录音素材不存在')
                    audio_ids.append(int(asset_id) if asset_id else None)
                color=str(values.get('color') or '#68a87d')
                if not re.fullmatch(r'#[0-9a-fA-F]{6}',color): raise ValueError('卡片颜色格式无效')
                params=(word[:80],meaning[:120],sentence[:200],translation[:200],
                    str(values.get('hint') or meaning)[:300],group_name[:80],color,position,
                    image_id,image_id,audio_ids[0],audio_ids[1],category_key,category_name[:80],
                    str(values.get('display_kind') or 'illustration'),status,slug)
                if card_id:
                    cur.execute("""UPDATE learning_action_cards SET word=%s,meaning=%s,sentence=%s,translation=%s,
                        hint=%s,group_name=%s,color=%s,position=%s,image_asset_id=%s,animation_asset_id=%s,
                        word_audio_asset_id=%s,sentence_audio_asset_id=%s,category_key=%s,category_name=%s,
                        display_kind=%s,status=%s,slug=%s WHERE id=%s""",params+(card_id,))
                    if not cur.rowcount:
                        cur.execute("SELECT id FROM learning_action_cards WHERE id=%s", (card_id,))
                        if not cur.fetchone(): raise LookupError('卡片不存在')
                else:
                    cur.execute("""INSERT INTO learning_action_cards
                        (word,meaning,sentence,translation,hint,group_name,color,position,image_asset_id,
                         animation_asset_id,word_audio_asset_id,sentence_audio_asset_id,category_key,
                         category_name,display_kind,status,slug)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",params)
                    card_id=cur.lastrowid
        conn.commit()
    return next((row for row in list_cards(kind) if row['id']==card_id), {'id':card_id})


def archive_card(kind, card_id):
    table = 'learning_pinyin_cards' if kind == 'pinyin' else 'learning_action_cards'
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"UPDATE {table} SET status='archived' WHERE id=%s", (card_id,))
            changed=cur.rowcount > 0
        conn.commit()
    return changed
