"""HTTP boundary for media, comics and reusable 3D exhibits."""
import base64
import binascii
import hashlib
import re
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import content_catalog
import geography_catalog
import earth_culture
import transport_catalog
import action_cards
import pinyin_cards
import reading_cards
import history_cards
import history_wisdom
import reader_lessons
import learning_cards_admin
import english_songs
from mysql_learning_db import connect
from pymysql.err import IntegrityError

ROOT = Path(__file__).resolve().parent.parent
ASSET_DIR = ROOT / "frontend" / "assets" / "content"
EXTENSIONS = {"png": ("image", "image/png"), "jpg": ("image", "image/jpeg"),
              "webp": ("image", "image/webp"), "mp3": ("audio", "audio/mpeg"),
              "glb": ("model", "model/gltf-binary")}


def _valid_magic(data, extension):
    return {"png": data.startswith(b"\x89PNG\r\n\x1a\n"),
            "jpg": data.startswith(b"\xff\xd8\xff"),
            "webp": data.startswith(b"RIFF") and data[8:12] == b"WEBP",
            "mp3": data.startswith(b"ID3") or data[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"),
            "glb": data.startswith(b"glTF")}[extension]


class ContentRoutes:
    def content_api(self, method, path, body=None):
        if path == '/api/learning/reader-progress':
            import reader_progress
            try:
                with connect() as db:
                    learner_id=self.require_parent_learner(db)
                    if not learner_id:return True
                    if method=='GET':self.send_json(reader_progress.list_progress(db,learner_id))
                    elif method=='POST':self.send_json(reader_progress.save_progress(db,learner_id,body or {}))
                    else:self.send_json({'error':'不支持的请求方式'},405)
            except (ValueError,TypeError) as exc:self.send_json({'error':str(exc)},400)
            return True
        public = (path.startswith('/api/learning/history-wisdom') or (path.startswith("/api/content") and not path.startswith("/api/admin/"))
                  or path == "/api/pet/lines" or path in ("/api/geography/province-photos", "/api/geography/culture")
                  or path.startswith('/api/learning/history') or path == "/api/learning/reader-lessons" or path == "/api/transport/exhibits" or path.startswith('/api/learning/reading-cards') or path in ("/api/learning/action-cards", "/api/learning/english-cards", "/api/learning/english-songs", "/api/learning/pinyin-cards"))
        admin = (path.startswith("/api/admin/content") or path.startswith("/api/admin/media")
                 or path.startswith('/api/admin/history') or path.startswith("/api/admin/learning-cards") or path.startswith("/api/admin/reader-lessons"))
        if not public and not admin:
            return False
        account = None
        if admin:
            with connect() as db:
                account = self.require_admin(db, write=method != "GET",
                    roles={"superadmin", "content_admin", "viewer"} if method == "GET" else {"superadmin", "content_admin"})
                if not account:
                    return True
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        try:
            if path in ('/api/learning/history-wisdom','/api/admin/history-wisdom') and method=='GET':
                self.send_json(history_wisdom.catalog(query.get('kind',[None])[0],admin=admin));return True
            wisdom_match=re.fullmatch(r'/api/(learning|admin)/history-wisdom/([a-z0-9-]+)',path)
            if wisdom_match and method=='GET' and not admin:
                item=history_wisdom.detail(wisdom_match[2])
                self.send_json(item) if item else self.send_json({'error':'卡片不存在或已下架'},404)
                return True
            if wisdom_match and admin and method=='PUT':
                try:result=history_wisdom.save(wisdom_match[2],body or {})
                except history_wisdom.Conflict as exc:
                    self.send_json({'error':str(exc)},409);return True
                self._audit_content(account,'修改战役或计策','history-wisdom',wisdom_match[2],result['title'])
                self.send_json(result);return True
            if path in ('/api/learning/history','/api/admin/history') and method=='GET':
                self.send_json(history_cards.catalog(admin=admin));return True
            if path=='/api/admin/history/choices' and method=='GET':
                self.send_json(history_cards.choices());return True
            history_match=re.fullmatch(r'/api/(learning|admin)/history/([a-z0-9-]+)',path)
            if history_match and method=='GET' and not admin:
                item=history_cards.detail(history_match[2])
                self.send_json(item) if item else self.send_json({'error':'朝代不存在或已下架'},404)
                return True
            if history_match and admin and method=='PUT':
                try:
                    result=history_cards.save(history_match[2],body or {})
                except history_cards.Conflict as exc:
                    self.send_json({'error':str(exc)},409);return True
                self._audit_content(account,'修改朝代卡片','history',history_match[2],(body or {}).get('document',{}).get('title',''))
                self.send_json(result);return True
            if path == '/api/learning/reader-lessons' and method == 'GET':
                self.send_json(reader_lessons.summary() if query.get('summary',[''])[0]=='1' else reader_lessons.list_lessons(query.get('subject',['语文'])[0]))
                return True
            if path == '/api/geography/culture' and method == 'GET':
                self.send_json(earth_culture.catalog())
                return True
            if path == '/api/learning/reading-cards' and method == 'GET':
                self.send_json(reading_cards.list_cards(query.get('kind',['poetry'])[0],query.get('page',[1])[0],query.get('q',[''])[0],query.get('collection',[''])[0]))
                return True
            if re.fullmatch(r'/api/learning/reading-cards/\d+',path) and method == 'GET':
                self.send_json(reading_cards.get_card(path.rsplit('/',1)[1]))
                return True
            if path == "/api/learning/pinyin-cards" and method == "GET":
                self.send_json(pinyin_cards.list_cards())
                return True
            if path == "/api/learning/english-cards" and method == "GET":
                self.send_json(action_cards.list_english_cards())
                return True
            if path == "/api/learning/english-songs" and method == "GET":
                self.send_json(english_songs.list_songs())
                return True
            if path == "/api/learning/action-cards" and method == "GET":
                self.send_json(action_cards.list_cards())
                return True
            if path == "/api/pet/lines" and method == "GET":
                self.send_json(content_catalog.list_pet_speech())
                return True
            if path == "/api/transport/exhibits" and method == "GET":
                self.send_json(transport_catalog.list_exhibits())
                return True
            if path == "/api/geography/province-photos" and method == "GET":
                self.send_json(geography_catalog.list_province_photos())
                return True
            page = query.get("page", [1])[0]
            size = query.get("page_size", [12])[0]
            kind = query.get("kind", [""])[0]
            if path in ("/api/content", "/api/admin/content") and method == "GET":
                return self.send_json(content_catalog.list_items(page, size, kind, public=public)) or True
            match = re.fullmatch(r"/api/(?:admin/)?content/(\d+)", path)
            if match and method == "GET":
                item = content_catalog.get_item(int(match.group(1)), public=public)
                self.send_json(item) if item else self.send_json({"error": "内容不存在"}, 404)
                return True
            if admin and path == "/api/admin/content" and method == "POST":
                item = content_catalog.save_item(body or {})
                self._audit_content(account, "创建内容", "content", item["id"], item["title"])
                self.send_json(item, 201)
                return True
            if admin and match and method == "PUT":
                item = content_catalog.save_item(body or {}, int(match.group(1)))
                self._audit_content(account, "修改内容", "content", item["id"], item["title"])
                self.send_json(item)
                return True
            if admin and match and method == "DELETE":
                changed = content_catalog.archive_item(int(match.group(1)))
                if changed:
                    self._audit_content(account, "下架内容", "content", int(match.group(1)), "")
                self.send_json({"ok": changed})
                return True
            if admin and path == "/api/admin/media" and method == "GET":
                self.send_json(content_catalog.list_media(page, size, query.get("kind", [""])[0]))
                return True
            if admin and path == '/api/admin/learning-cards' and method == 'GET':
                kind=query.get('kind',['words'])[0]
                if kind not in ('words','pinyin'):
                    raise ValueError('卡片类型无效')
                self.send_json({'items':learning_cards_admin.list_cards(kind)})
                return True
            if admin and path == '/api/admin/learning-cards' and method == 'POST':
                values=body or {};kind=values.get('kind','words')
                if kind not in ('words','pinyin'): raise ValueError('卡片类型无效')
                item=learning_cards_admin.save_card(kind,values)
                self._audit_content(account,'新增学习卡片',kind,item['id'],values.get('slug',''))
                self.send_json(item,201)
                return True
            if admin and path == '/api/admin/reader-lessons' and method == 'GET':
                self.send_json({'items':reader_lessons.admin_list()})
                return True
            if admin and path == '/api/admin/reader-lessons' and method == 'POST':
                item=reader_lessons.admin_save(body or {})
                self._audit_content(account,'新增闯关字词','reader_lesson',item['id'],item.get('word',''))
                self.send_json(item,201)
                return True
            lesson_match=re.fullmatch(r'/api/admin/reader-lessons/(\d+)',path)
            if admin and lesson_match and method == 'PUT':
                item=reader_lessons.admin_save(body or {},int(lesson_match.group(1)))
                self._audit_content(account,'修改闯关字词','reader_lesson',item['id'],item.get('word',''))
                self.send_json(item)
                return True
            if admin and lesson_match and method == 'DELETE':
                lesson_id=int(lesson_match.group(1));changed=reader_lessons.admin_archive(lesson_id)
                if changed:self._audit_content(account,'下架闯关字词','reader_lesson',lesson_id,'')
                self.send_json({'ok':changed})
                return True
            card_match=re.fullmatch(r'/api/admin/learning-cards/(words|pinyin)/(\d+)',path)
            if admin and card_match and method == 'PUT':
                kind,card_id=card_match.group(1),int(card_match.group(2))
                item=learning_cards_admin.save_card(kind,body or {},card_id)
                self._audit_content(account,'修改学习卡片',kind,item['id'],item.get('slug',''))
                self.send_json(item)
                return True
            if admin and card_match and method == 'DELETE':
                kind,card_id=card_match.group(1),int(card_match.group(2))
                changed=learning_cards_admin.archive_card(kind,card_id)
                if changed:self._audit_content(account,'下架学习卡片',kind,card_id,'')
                self.send_json({'ok':changed})
                return True
            media_match = re.fullmatch(r"/api/admin/media/(\d+)", path)
            if admin and media_match and method == "PUT":
                asset = content_catalog.update_media(int(media_match.group(1)), body or {})
                if not asset:
                    self.send_json({"error": "素材不存在"}, 404)
                else:
                    self._audit_content(account, "修改素材信息", "media", asset["id"], asset["public_path"])
                    self.send_json(asset)
                return True
            if admin and path == "/api/admin/media/upload" and method == "POST":
                values = body or {}
                extension = str(values.get("extension", "")).lower().strip(".")
                if extension not in EXTENSIONS:
                    raise ValueError("仅支持 PNG、JPG、WebP、MP3、GLB")
                encoded = str(values.get("base64", ""))
                if len(encoded) > 28_000_000:
                    raise ValueError("文件超过 20 MB，请先压缩")
                try:
                    data = base64.b64decode(encoded, validate=True)
                except binascii.Error:
                    raise ValueError("文件数据无效")
                if not 1 <= len(data) <= 20_000_000 or not _valid_magic(data, extension):
                    raise ValueError("文件类型与内容不匹配，或文件超过 20 MB")
                digest = hashlib.sha256(data).hexdigest()
                name = f"{digest}.{extension}"
                ASSET_DIR.mkdir(parents=True, exist_ok=True)
                target = ASSET_DIR / name
                if not target.exists():
                    target.write_bytes(data)
                asset_id = content_catalog.register_media({
                    "public_path": f"/assets/content/{name}", "media_kind": EXTENSIONS[extension][0],
                    "mime_type": EXTENSIONS[extension][1], "file_bytes": len(data),
                    "title": values.get("title", ""), "alt_text": values.get("alt_text", ""),
                    "source_name": values.get("source_name", ""), "source_url": values.get("source_url", ""),
                    "license_name": values.get("license_name", "")})
                self._audit_content(account, "上传素材", "media", asset_id, name)
                self.send_json({"id": asset_id, "public_path": f"/assets/content/{name}"}, 201)
                return True
            self.send_json({"error": "内容接口不存在"}, 404)
        except (ValueError, TypeError) as exc:
            self.send_json({"error": str(exc)}, 400)
        except LookupError as exc:
            self.send_json({"error": str(exc)}, 404)
        except IntegrityError:
            self.send_json({"error": "编号已存在或关联素材无效"}, 409)
        except Exception as exc:
            print(f"Content API failed: {type(exc).__name__}: {exc}")
            self.send_json({"error": "内容服务暂时不可用"}, 500)
        return True

    def _audit_content(self, account, action, target_type, target_id, detail):
        with connect() as db:
            self.audit_admin_action(db, account, action, target_type, target_id, detail)
