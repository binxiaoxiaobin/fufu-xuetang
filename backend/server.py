import datetime
import email.utils
import gzip
import io
import os
import json
import hashlib
import hmac
import ipaddress
import re
import random
import secrets
import sqlite3
from http.cookies import SimpleCookie
from fractions import Fraction
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import pymysql
from mysql_learning_db import connect
import mysql_db
import content_catalog
import geography_catalog
import earth_culture
import action_cards
import english_songs
import pinyin_cards
import reading_cards
import history_cards
import history_wisdom
import transport_catalog
import solar_catalog
import farm
import toy_games
import parent_points
import game_access
import community
import story_reading
import picture_books
import curriculum
import daily_plan
from learning_rewards import QUIZ_CORRECT_POINTS
import reader_lessons
from static_cache import compressed_files
from content_routes import ContentRoutes
from pymysql.err import IntegrityError
import tts_on_demand
import logging
from logging.handlers import RotatingFileHandler

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"

# 访问日志落盘。局域网 / Tailscale 的访问发生在别人的平板和手机上，本机看不到，
# 出问题时"设备到底连上来没有、拿的是哪一版前端代码"只能靠这个文件回溯。
LOG_DIR = ROOT / "logs"
LOG_DIR.mkdir(exist_ok=True)
access_log = logging.getLogger("fufu.access")
if not access_log.handlers:
    _access_handler = RotatingFileHandler(LOG_DIR / "server.log", maxBytes=4 * 1024 * 1024,
                                          backupCount=2, encoding="utf-8")
    _access_handler.setFormatter(logging.Formatter("%(asctime)s %(message)s", "%Y-%m-%d %H:%M:%S"))
    access_log.addHandler(_access_handler)
    access_log.setLevel(logging.INFO)
    access_log.propagate = False

def profile_payload(db, learner_id=1):
    profile = dict(db.execute("SELECT * FROM profile WHERE id=?", (learner_id,)).fetchone())
    profile.pop("account_id", None)
    profile.pop("pet_xp", None)  # Retired growth meter; legacy storage is preserved.
    profile["ledger"] = [dict(x) for x in db.execute("SELECT * FROM ledger WHERE learner_id=? ORDER BY id DESC LIMIT 20", (learner_id,))]
    today = db.execute("""
        SELECT count(DISTINCT CASE WHEN correct=1 THEN question_id END) AS solved,
               count(*) AS attempts, sum(correct) AS correct_attempts
        FROM completions c JOIN questions q ON q.id=c.question_id
        WHERE c.created_at>=CURDATE() AND c.created_at<DATE_ADD(CURDATE(), INTERVAL 1 DAY)
          AND q.stage=(SELECT learning_stage FROM profile WHERE id=?) AND c.learner_id=?
    """, (learner_id, learner_id)).fetchone()
    profile["today"] = {"solved": today["solved"] or 0, "attempts": today["attempts"] or 0, "correct_attempts": today["correct_attempts"] or 0}
    profile['daily_plan'] = daily_plan.summary(db, learner_id, profile['today']['solved'])
    profile["learning_summary"] = [dict(x) for x in db.execute("""
        SELECT q.subject, count(*) AS attempts, sum(c.correct) AS correct
        FROM completions c JOIN questions q ON q.id=c.question_id
        WHERE c.created_at >= DATE_SUB(NOW(), INTERVAL 6 DAY) AND c.learner_id=?
        GROUP BY q.subject ORDER BY q.subject
    """, (learner_id,))]
    profile["recent_learning"] = [dict(x) for x in db.execute("""
        SELECT q.subject,q.title,c.correct,c.created_at
        FROM completions c JOIN questions q ON q.id=c.question_id WHERE c.learner_id=?
        ORDER BY c.id DESC LIMIT 10
    """, (learner_id,))]
    return profile

def pet_payload(db, learner_id=1):
    pet = dict(db.execute("SELECT * FROM pet_state WHERE id=?", (learner_id,)).fetchone())
    pet["accessory"] = pet["accessory"] or ""
    pet["equipment"] = {
        row["slot"]: row["emoji"] for row in db.execute("""SELECT e.slot,i.emoji FROM pet_equipment e
            JOIN store_items i ON i.id=e.item_id WHERE e.pet_id=?""", (learner_id,))
    }
    pet["owned"] = [dict(row) for row in db.execute("""SELECT i.id,i.name,i.emoji,i.kind,i.pet_model,o.purchased_at
        FROM owned_items o JOIN store_items i ON i.id=o.item_id WHERE o.learner_id=? ORDER BY o.id DESC""", (learner_id,))]
    return pet

class Handler(community.CommunityRoutes, game_access.GameAccessRoutes, daily_plan.DailyPlanRoutes, toy_games.ToyGameRoutes, farm.FarmRoutes, ContentRoutes, SimpleHTTPRequestHandler):
    # Windows registry entries can resolve .webp to an empty media type.
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.webp': 'image/webp'}
    # 这个服务会走局域网和 Tailscale 穿透链路，实测穿透单程延迟约 450ms。
    # HTTP/1.0 下每条资源都要重新三次握手，首页有 18 个文件，握手就够把页面拖死；
    # 换成 HTTP/1.1 keep-alive 后同一条连接可以连续取多个资源。
    protocol_version = "HTTP/1.1"
    # 文本类资源传输前 gzip；png/jpg/glb/mp3 本身已压缩，压了反而更大，保持原样。
    compressible_types = {".html", ".htm", ".css", ".js", ".mjs", ".json",
                          ".svg", ".txt", ".xml", ".map", ".md", ".csv", ".geojson"}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(FRONTEND), **kwargs)

    def request_body_read(self):
        """请求体是否已被完整读走。keep-alive 下没读干净，残留字节会被当成下一个请求。"""
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except (TypeError, ValueError):
            return True
        return length <= 0 or getattr(self, "_request_body_read", False)

    def send_response(self, code, message=None):
        # 请求体没读完就回响应（例如 413）时，本次响应后必须关闭连接，否则会串包。
        if not self.request_body_read():
            self.close_connection = True
        super().send_response(code, message)

    def send_head(self):
        """静态资源：能压缩就压缩，其余交给标准库（它负责 304、目录跳转和 404）。"""
        path = self.translate_path(self.path)
        self._game_private = self.game_file_protected(path)
        if self._game_private and not self.require_game_access():
            return None
        if os.path.isdir(path) and urlparse(self.path).path.endswith("/"):
            # 目录请求要自己解析出首页文件，否则访问“/”时首页拿不到压缩。
            # 没有结尾斜杠的情况留给标准库，让它发 301，别把页面里的相对路径弄坏。
            for index in ("index.html", "index.htm"):
                candidate = os.path.join(path, index)
                if os.path.exists(candidate):
                    path = candidate
                    break
        # 只有 HTML 强制回源校验。平板会让首页长时间开着，首页一旦被启发式缓存住，
        # 它引用的 JS 版本号也跟着是旧的 —— 改了代码用户却永远拿不到新版。
        # 其余资源仍走 304 + URL 版本号，不额外增加往返。
        self._html_no_cache = (not os.path.isdir(path)) and \
            os.path.splitext(path)[1].lower() in (".html", ".htm")
        # ⚠️ 压缩的对象是"所有文本资源"，不只是 HTML。
        # 这里曾经写成 `if self._html_no_cache and ...`，结果 js/css/json 全退回原文传输，
        # 首页 18 个文件一下又变成几百 KB —— 中继链路上是致命的。两者是独立条件，别合并。
        if (not os.path.isdir(path)
                and os.path.splitext(path)[1].lower() in self.compressible_types
                and "gzip" in (self.headers.get("Accept-Encoding") or "").lower()):
            head = self.gzip_head(path)
            if head is not False:
                return head
        return super().send_head()

    def end_headers(self):
        if getattr(self, '_game_private', False):
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Vary', 'Cookie')
        if getattr(self, "_html_no_cache", False):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def gzip_head(self, path):
        """返回文件对象=响应已发出；返回 None=响应已完成（304）；返回 False=不适用，交给标准库。"""
        try:
            stat = os.stat(path)
        except OSError:
            return False
        if self.headers.get("If-Modified-Since") and "If-None-Match" not in self.headers:
            try:
                since = email.utils.parsedate_to_datetime(self.headers["If-Modified-Since"])
            except (TypeError, IndexError, OverflowError, ValueError):
                since = None
            if since is not None:
                if since.tzinfo is None:
                    since = since.replace(tzinfo=datetime.timezone.utc)
                if since.tzinfo is datetime.timezone.utc:
                    modified = datetime.datetime.fromtimestamp(stat.st_mtime, datetime.timezone.utc).replace(microsecond=0)
                    if modified <= since:
                        self.send_response(304)
                        self.end_headers()
                        return None
        try:
            body = compressed_files.get(path, stat)
        except OSError:
            return False
        if body is None:
            return False
        self.send_response(200)
        self.send_header("Content-type", self.guess_type(path))
        self.send_header("Content-Encoding", "gzip")
        self.send_header("Vary", "Accept-Encoding")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Last-Modified", self.date_time_string(stat.st_mtime))
        self.end_headers()
        return io.BytesIO(body)

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False, default=str).encode("utf-8")
        compressed = len(body) >= 1024 and "gzip" in (self.headers.get("Accept-Encoding") or "").lower()
        if compressed:
            body = gzip.compress(body, 4)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Vary", "Accept-Encoding")
        if compressed:
            self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        if self.close_connection:
            self.send_header("Connection", "close")
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    @staticmethod
    def audit_admin_action(db, account, action, target_type, target_id, detail):
        actor_name = account.get("display_name") or account.get("username") or "管理员"
        db.execute("""INSERT INTO admin_audit_logs(actor_account_id,actor_name,action,target_type,target_id,detail)
            VALUES(?,?,?,?,?,?)""", (account["id"], actor_name, action, target_type, str(target_id), str(detail)[:4000]))

    def read_body(self):
        self._request_body_read = True
        return json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")

    @staticmethod
    def password_hash(password, salt=None):
        salt = salt or secrets.token_hex(16)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("ascii"), 310000).hex()
        return f"pbkdf2_sha256$310000${salt}${digest}"

    @staticmethod
    def password_matches(password, encoded):
        try:
            scheme, rounds, salt, expected = encoded.split("$", 3)
            if scheme != "pbkdf2_sha256":
                return False
            actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("ascii"), int(rounds)).hex()
            return hmac.compare_digest(actual, expected)
        except (ValueError, TypeError):
            return False

    def session_account(self, db):
        cookies = SimpleCookie(self.headers.get("Cookie", ""))
        request = urlparse(self.path)
        query = parse_qs(request.query)
        admin_context = request.path.startswith("/api/admin/") or (
            request.path in {"/api/auth/status", "/api/auth/logout"}
            and query.get("account_type") == ["admin"]
        )
        cookie_name = "fufu_admin_session" if admin_context else "fufu_session"
        morsel = cookies.get(cookie_name)
        # Continue to accept pre-split administrator sessions until they expire,
        # but never treat a parent session as an administrator session.
        if not morsel and admin_context:
            morsel = cookies.get("fufu_session")
        if not morsel:
            return None
        token_hash = hashlib.sha256(morsel.value.encode("ascii", "ignore")).hexdigest()
        row = db.execute("SELECT a.id,a.username,a.account_type,a.role,a.display_name,a.status,s.id AS session_id FROM user_sessions s JOIN user_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>NOW() AND a.status='active'", (token_hash,)).fetchone()
        if not row:
            return None
        account = dict(row)
        if admin_context:
            return account if account["account_type"] == "admin" else None
        if account["account_type"] == "admin":
            return None
        return account

    def current_learner(self, db, account=None):
        account = account or self.session_account(db)
        if not account or account["account_type"] != "parent":
            return None
        learner = db.execute("SELECT p.id FROM user_sessions s JOIN profile p ON p.id=s.learner_id AND p.account_id=s.account_id WHERE s.id=?", (account["session_id"],)).fetchone()
        return int(learner["id"]) if learner else None

    def require_parent_learner(self, db):
        account = self.session_account(db)
        learner_id = self.current_learner(db, account)
        if not learner_id:
            self.send_json({"error": "请先登录学习账号"}, 401)
            return None
        return learner_id

    def parent_points_api(self, method, path, body=None):
        if path not in {'/api/parent/points/add', '/api/parent/points/ledger'}:
            return False
        if (path.endswith('/add') and method != 'POST') or (path.endswith('/ledger') and method != 'GET'):
            self.send_json({'error': '不支持此操作'}, 405)
            return True
        try:
            with connect() as db:
                account = self.session_account(db)
                learner_id = self.current_learner(db, account)
                if not learner_id:
                    self.send_json({'error': '请先登录学习账号'}, 401)
                    return True
                if method == 'POST':
                    if not isinstance(body, dict):
                        raise parent_points.PointsError('提交内容无效')
                    result = parent_points.grant_points(db, account, learner_id, body)
                    db.connection.commit()
                else:
                    query = parse_qs(urlparse(self.path).query)
                    result = parent_points.ledger_page(db, learner_id, query.get('before', [None])[0])
            self.send_json(result)
        except parent_points.PointsError as exc:
            self.send_json({'error': str(exc)}, exc.status)
        except Exception:
            logging.exception('Parent points operation failed')
            self.send_json({'error': '积分操作未完成，请重试；相同提交不会重复加分'}, 500)
        return True

    def story_reading_api(self, method, path, body=None):
        match = re.fullmatch(r'/api/stories/(\d+)/(reading|complete)', path)
        if not match:
            return False
        if method not in {'GET', 'POST'} or (match[2] == 'complete' and method != 'POST'):
            self.send_json({'error': '不支持此操作'}, 405)
            return True
        try:
            with connect() as db:
                learner_id = self.current_learner(db)
                if not learner_id:
                    self.send_json({'error': '请先登录学习账号'}, 401)
                    return True
                page = None
                if method == 'POST' and match[2] == 'reading':
                    if not isinstance(body, dict) or 'page' not in body:
                        raise story_reading.ReadingError('阅读页码无效')
                    page = body['page']
                result = story_reading.reading(db, learner_id, int(match[1]), page,
                                               match[2] == 'complete')
            self.send_json(result)
        except story_reading.ReadingError as exc:
            self.send_json({'error': str(exc)}, exc.status)
        except Exception:
            logging.exception('Story reading failed')
            self.send_json({'error': '阅读进度未保存，请稍后重试；奖励不会重复发放'}, 500)
        return True

    def require_admin(self, db, write=False, account=None, roles=None):
        if not self.local_admin_allowed():
            self.send_json({"error": "后台管理仅允许从本机打开"}, 403)
            return None
        account = account or self.session_account(db)
        if not account or account["account_type"] != "admin":
            self.send_json({"error": "请先登录管理员账号"}, 401)
            return None
        read_roles = {"superadmin", "content_admin", "learner_manager", "viewer"}
        write_roles = {"superadmin", "content_admin", "learner_manager"}
        allowed = set(roles) if roles else (write_roles if write else read_roles)
        if account["role"] not in allowed:
            self.send_json({"error": "当前管理员角色没有执行此操作的权限"}, 403)
            return None
        return account

    def auth_api(self, method, path, body=None):
        if path not in {"/api/auth/status", "/api/auth/bootstrap", "/api/auth/register", "/api/auth/login", "/api/auth/logout", "/api/auth/select-learner"}:
            return False
        try:
            with connect() as db:
                count = db.execute("SELECT COUNT(*) AS total FROM user_accounts WHERE account_type='admin'").fetchone()["total"]
                if path == "/api/auth/status" and method == "GET":
                    account = self.session_account(db)
                    learners = []
                    selected = None
                    if account and account["account_type"] == "parent":
                        learners = [dict(row) for row in db.execute("SELECT id,child_name,learning_stage,grade FROM profile WHERE account_id=? ORDER BY id", (account["id"],))]
                        selected = self.current_learner(db, account)
                    if account:
                        account = {key: account[key] for key in ("id", "username", "account_type", "role", "display_name", "status")}
                    return self.send_json({"bootstrap_required": count == 0, "account": account, "learners": learners, "learner_id": selected})
                if path == "/api/auth/bootstrap" and method == "POST":
                    if not self.local_admin_allowed():
                        return self.send_json({"error": "首次设置仅允许从本机完成"}, 403)
                    if count:
                        return self.send_json({"error": "管理员账号已经初始化"}, 409)
                    values = body or {}
                    username = str(values.get("username", "")).strip()
                    password = str(values.get("password", ""))
                    display = str(values.get("display_name", "系统管理员")).strip()[:80]
                    if not re.fullmatch(r"[A-Za-z0-9_.-]{3,40}", username) or len(password) < 10:
                        return self.send_json({"error": "用户名需为 3–40 位英文、数字或 ._-，密码至少 10 位"}, 400)
                    cur = db.execute("INSERT INTO user_accounts(username,password_hash,account_type,role,display_name) VALUES(?,?,'admin','superadmin',?)", (username,self.password_hash(password),display))
                    account_id = cur.lastrowid
                    return self.send_json({"ok": True, "account_id": account_id, "next": "请使用刚创建的管理员账号登录"}, 201)
                if path == "/api/auth/register" and method == "POST":
                    values = body or {}
                    username = str(values.get("username", "")).strip()
                    password = str(values.get("password", ""))
                    child_name = str(values.get("child_name", "")).strip()[:20]
                    stage = str(values.get("learning_stage", "未设置")).strip()
                    grade = str(values.get("grade", "")).strip()[:40]
                    if not re.fullmatch(r"[A-Za-z0-9_.-]{3,40}", username):
                        raise ValueError("用户名需为 3–40 位英文、数字或 ._-")
                    if len(password) < 10 or len(password) > 200:
                        raise ValueError("密码需为 10–200 位")
                    if not child_name:
                        raise ValueError("请填写孩子昵称")
                    if stage not in {"未设置", "幼儿园", "小学"}:
                        raise ValueError("请选择有效的学习阶段")
                    account_cursor = db.execute(
                        "INSERT INTO user_accounts(username,password_hash,account_type,role,display_name) VALUES(?,?,'parent','parent','')",
                        (username, self.password_hash(password)),
                    )
                    account_id = account_cursor.lastrowid
                    inviter = community.referral_inviter(db, values.get('share_code'))
                    current = self.session_account(db)
                    if inviter is not None and current and current['id'] == inviter:
                        raise ValueError('不能通过自己的已登录账号邀请自己注册')
                    community.register_referral(db, account_id, inviter)
                    learner_cursor = db.execute(
                        "INSERT INTO profile(child_name,points,pet_name,pet_xp,learning_stage,grade,account_id) VALUES(?,120,'团团',0,?,?,?)",
                        (child_name, stage, grade, account_id),
                    )
                    learner_id = learner_cursor.lastrowid
                    db.execute("INSERT INTO pet_state(id) VALUES(?)", (learner_id,))
                    starter = db.execute("SELECT id FROM store_items WHERE kind='pet' AND pet_model='clay_explorer' ORDER BY id LIMIT 1").fetchone()
                    if starter:
                        db.execute("INSERT IGNORE INTO owned_items(learner_id,item_id) VALUES(?,?)", (learner_id, starter["id"]))
                    lion = db.execute("SELECT id FROM store_items WHERE kind='zoo_animal' AND zoo_animal_id='lion' LIMIT 1").fetchone()
                    if lion:
                        db.execute("INSERT IGNORE INTO owned_items(learner_id,item_id) VALUES(?,?)", (learner_id, lion["id"]))
                    return self.send_json({"ok": True, "account_id": account_id, "learner_id": learner_id}, 201)
                if path == "/api/auth/login" and method == "POST":
                    values = body or {}
                    username = str(values.get("username", "")).strip()
                    password = str(values.get("password", ""))
                    account = db.execute("SELECT id,username,password_hash,account_type,role,display_name,status FROM user_accounts WHERE username=?", (username,)).fetchone()
                    if not account or account["status"] != "active" or not self.password_matches(password, account["password_hash"]):
                        return self.send_json({"error": "用户名或密码不正确"}, 401)
                    token = secrets.token_urlsafe(32)
                    learner = db.execute("SELECT id FROM profile WHERE account_id=? ORDER BY id LIMIT 1", (account["id"],)).fetchone() if account["account_type"] == "parent" else None
                    learner_id = int(learner["id"]) if learner else None
                    db.execute("INSERT INTO user_sessions(account_id,learner_id,token_hash,expires_at) VALUES(?,?,?,DATE_ADD(NOW(),INTERVAL 14 DAY))", (account["id"],learner_id,hashlib.sha256(token.encode()).hexdigest()))
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    cookie_name = "fufu_admin_session" if account["account_type"] == "admin" else "fufu_session"
                    self.send_header("Set-Cookie", f"{cookie_name}={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=1209600")
                    self.send_header("Content-Length", "11")
                    self.end_headers()
                    self.wfile.write(b'{"ok":true}')
                    return True
                if path == "/api/auth/select-learner" and method == "POST":
                    account = self.session_account(db)
                    if not account or account["account_type"] != "parent":
                        return self.send_json({"error": "请先登录家长账号"}, 401)
                    learner_id = int((body or {}).get("learner_id", 0))
                    row = db.execute("SELECT id FROM profile WHERE id=? AND account_id=?", (learner_id,account["id"])).fetchone()
                    if not row:
                        return self.send_json({"error": "孩子档案不存在或不属于当前家长账号"}, 404)
                    db.execute("UPDATE user_sessions SET learner_id=? WHERE id=?", (learner_id,account["session_id"]))
                    db.execute('DELETE FROM game_access_grants WHERE session_id=?',(account['session_id'],))
                    return self.send_json({"ok": True, "learner_id": learner_id})
                if path == "/api/auth/logout" and method == "POST":
                    account = self.session_account(db)
                    if account:
                        db.execute("DELETE FROM user_sessions WHERE id=?", (account["session_id"],))
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    cookie_name = "fufu_admin_session" if parse_qs(urlparse(self.path).query).get("account_type") == ["admin"] else "fufu_session"
                    self.send_header("Set-Cookie", f"{cookie_name}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0")
                    self.send_header("Content-Length", "11")
                    self.end_headers()
                    self.wfile.write(b'{"ok":true}')
                    return True
        except ValueError as exc:
            return self.send_json({"error": str(exc)}, 400)
        except IntegrityError:
            return self.send_json({"error": "这个用户名已被注册，请换一个用户名"}, 409)
        except Exception as exc:
            print(f"Authentication request failed: {type(exc).__name__}: {exc}")
            return self.send_json({"error": "账号服务暂不可用，请检查 MySQL 连接"}, 503)
        return self.send_json({"error": "不支持该账号操作"}, 405)

    def admin_operations(self, method, path, body=None):
        if not path.startswith("/api/admin/redemptions") and path != "/api/admin/audit-logs":
            return False
        values = body or {}
        match = re.fullmatch(r"/api/admin/redemptions(?:/(\d+))?", path)
        if path.startswith("/api/admin/redemptions") and not match:
            return self.send_json({"error": "兑换管理接口路径无效"}, 404)
        order_id = int(match.group(1)) if match and match.group(1) else None
        try:
            with connect() as db:
                read_roles = {"superadmin", "learner_manager", "viewer"}
                actor = self.require_admin(db, write=method != "GET", roles=read_roles if method == "GET" else {"superadmin", "learner_manager"})
                if not actor:
                    return True
                if path == "/api/admin/audit-logs":
                    if method != "GET":
                        return self.send_json({"error": "操作日志仅支持读取"}, 405)
                    rows = db.execute("""SELECT id,actor_account_id,actor_name,action,target_type,target_id,detail,created_at
                        FROM admin_audit_logs ORDER BY id DESC LIMIT 300""").fetchall()
                    return self.send_json([dict(row) for row in rows])
                if method == "GET" and order_id is None:
                    rows = db.execute("""SELECT r.id,r.account_id,r.learner_id,r.item_name,r.points,r.status,r.note,r.created_at,r.processed_at,
                        a.username,p.child_name,creator.display_name AS created_by_name,processor.display_name AS processed_by_name
                        FROM redemption_orders r JOIN user_accounts a ON a.id=r.account_id
                        JOIN profile p ON p.id=r.learner_id
                        LEFT JOIN user_accounts creator ON creator.id=r.created_by
                        LEFT JOIN user_accounts processor ON processor.id=r.processed_by
                        ORDER BY r.id DESC LIMIT 500""").fetchall()
                    return self.send_json([dict(row) for row in rows])
                if method == "POST" and order_id is None:
                    try:
                        account_id = int(values.get("account_id", 0))
                        learner_id = int(values.get("learner_id", 0))
                        points = int(values.get("points", 0))
                    except (TypeError, ValueError):
                        raise ValueError("请选择学习账号和有效的积分数量")
                    item_name = str(values.get("item_name", "")).strip()[:160]
                    note = str(values.get("note", "")).strip()[:500]
                    if not item_name or points < 1 or points > 1000000:
                        raise ValueError("请填写实物名称和 1 到 1000000 的抵扣积分")
                    profile = db.execute("SELECT id,points FROM profile WHERE id=? AND account_id=? FOR UPDATE", (learner_id,account_id)).fetchone()
                    if not profile:
                        return self.send_json({"error": "该学习者不属于所选账号"}, 404)
                    balance = int(profile["points"])
                    if balance < points:
                        return self.send_json({"error": f"积分不足，当前只有 {balance} 分"}, 400)
                    new_balance = balance - points
                    db.execute("UPDATE profile SET points=? WHERE id=?", (new_balance,learner_id))
                    description = f"实物兑换：{item_name}；管理员 {actor.get('display_name') or actor['username']}；{note or '未填写备注'}"
                    db.execute("INSERT INTO ledger(kind,amount,description,learner_id) VALUES('实物兑换',?,?,?)", (-points,description,learner_id))
                    cursor = db.execute("""INSERT INTO redemption_orders(account_id,learner_id,item_name,points,status,note,created_by)
                        VALUES(?,?,?,?,'pending',?,?)""", (account_id,learner_id,item_name,points,note,actor["id"]))
                    redemption_id = cursor.lastrowid
                    self.audit_admin_action(db,actor,"登记实物兑换","redemption",redemption_id,f"{item_name}；-{points} 分；学习者编号 {learner_id}；{note}")
                    return self.send_json({"ok": True,"id": redemption_id,"points": new_balance},201)
                if method == "PUT" and order_id:
                    target = db.execute("SELECT id,account_id,learner_id,item_name,points,status FROM redemption_orders WHERE id=? FOR UPDATE", (order_id,)).fetchone()
                    if not target:
                        return self.send_json({"error": "兑换记录不存在"},404)
                    next_status = str(values.get("status", ""))
                    if target["status"] != "pending" or next_status not in {"fulfilled","cancelled"}:
                        return self.send_json({"error": "只有待处理的兑换记录可以完成或撤销"},409)
                    if next_status == "cancelled":
                        profile = db.execute("SELECT points FROM profile WHERE id=? AND account_id=? FOR UPDATE", (target["learner_id"],target["account_id"])).fetchone()
                        if not profile:
                            return self.send_json({"error": "找不到兑换记录关联的学习者"},404)
                        refund_points = int(target["points"])
                        new_balance = int(profile["points"]) + refund_points
                        db.execute("UPDATE profile SET points=? WHERE id=?", (new_balance,target["learner_id"]))
                        description = f"撤销实物兑换：{target['item_name']}；管理员 {actor.get('display_name') or actor['username']}"
                        db.execute("INSERT INTO ledger(kind,amount,description,learner_id) VALUES('兑换撤销',?,?,?)", (refund_points,description,target["learner_id"]))
                    else:
                        new_balance = None
                    db.execute("UPDATE redemption_orders SET status=?,processed_by=?,processed_at=NOW() WHERE id=?", (next_status,actor["id"],order_id))
                    self.audit_admin_action(db,actor,"处理实物兑换","redemption",order_id,f"{target['item_name']}；状态：{'已撤销并退回积分' if next_status=='cancelled' else '已发放'}")
                    return self.send_json({"ok": True,"status": next_status,"points": new_balance})
                return self.send_json({"error": "不支持该兑换管理操作"},405)
        except (ValueError, TypeError) as exc:
            return self.send_json({"error": str(exc)},400)
        except Exception as exc:
            print(f"Admin operations failed: {type(exc).__name__}: {exc}")
            return self.send_json({"error": "操作失败，请检查数据库连接后重试"},500)

    def admin_accounts(self, method, path, body=None):
        if not path.startswith("/api/admin/accounts"):
            return False
        match = re.fullmatch(r"/api/admin/accounts(?:/(\d+))?(?:/learners(?:/(\d+))?|/points)?", path)
        if not match:
            return self.send_json({"error": "账号管理接口路径无效"}, 404)
        account_id = int(match.group(1)) if match.group(1) else None
        managing_learners = "/learners" in path
        adjusting_points = path.endswith("/points")
        values = body or {}
        try:
            with connect() as db:
                account = self.require_admin(db, write=method != "GET")
                if not account:
                    return True
                allowed_roles = {"superadmin", "learner_manager", "viewer"} if method == "GET" else {"superadmin", "learner_manager"}
                if account["role"] not in allowed_roles:
                    return self.send_json({"error": "当前管理员角色无权管理账号"}, 403)
                if adjusting_points:
                    if method != "POST" or account_id is None:
                        return self.send_json({"error": "积分调整接口仅支持指定账号的 POST 请求"}, 405)
                    target = db.execute("SELECT id,account_type FROM user_accounts WHERE id=?", (account_id,)).fetchone()
                    if not target or target["account_type"] != "parent":
                        return self.send_json({"error": "学习账号不存在"}, 404)
                    try:
                        amount = int(values.get("amount", 0))
                        learner_id = int(values.get("learner_id", 0))
                    except (TypeError, ValueError):
                        raise ValueError("请填写有效的积分数量")
                    direction = str(values.get("direction", ""))
                    reason = str(values.get("reason", "")).strip()[:200]
                    if direction not in {"add", "deduct"} or amount < 1 or amount > 1000000 or not reason:
                        raise ValueError("请选择增加或扣除，填写 1 到 1000000 的积分和操作原因")
                    profile = db.execute("SELECT id,points FROM profile WHERE account_id=? AND id=? FOR UPDATE", (account_id, learner_id)).fetchone()
                    if not profile:
                        return self.send_json({"error": "该学习者不属于此账号"}, 404)
                    delta = amount if direction == "add" else -amount
                    new_balance = int(profile["points"]) + delta
                    if new_balance < 0:
                        return self.send_json({"error": "当前积分不足，无法扣除"}, 400)
                    if new_balance > 1000000:
                        return self.send_json({"error": "积分余额不能超过 1000000"}, 400)
                    db.execute("UPDATE profile SET points=? WHERE id=?", (new_balance, learner_id))
                    operator = account.get("display_name") or account["username"]
                    description = f"管理员 {operator}：{reason}"
                    db.execute("INSERT INTO ledger(kind,amount,description,learner_id) VALUES('管理员积分调整',?,?,?)", (delta, description, learner_id))
                    self.audit_admin_action(db, account, "积分调整", "learner", learner_id, f"{delta:+d} 分；余额 {new_balance} 分；原因：{reason}")
                    return self.send_json({"ok": True, "learner_id": learner_id, "points": new_balance, "delta": delta})
                if managing_learners:
                    parent = db.execute("SELECT id,account_type FROM user_accounts WHERE id=?", (account_id,)).fetchone()
                    if not parent or parent["account_type"] != "parent":
                        return self.send_json({"error": "家长账号不存在"}, 404)
                    if method == "GET":
                        if match.group(2):
                            learner_id = int(match.group(2))
                            row = db.execute("SELECT id,child_name,pet_name,learning_stage,grade,points,updated_at FROM profile WHERE account_id=? AND id=?", (account_id,learner_id)).fetchone()
                            if not row:
                                return self.send_json({"error": "该学习者不属于此账号"}, 404)
                            profile = dict(row)
                            profile["summary"] = dict(db.execute("SELECT COUNT(*) AS attempts,COALESCE(SUM(correct),0) AS correct FROM completions WHERE learner_id=?", (learner_id,)).fetchone())
                            profile["recent"] = [dict(item) for item in db.execute("SELECT q.subject,q.title,c.correct,c.points_delta,c.created_at FROM completions c JOIN questions q ON q.id=c.question_id WHERE c.learner_id=? ORDER BY c.id DESC LIMIT 10", (learner_id,))]
                            profile["ledger"] = [dict(item) for item in db.execute("SELECT kind,amount,description,created_at FROM ledger WHERE learner_id=? ORDER BY id DESC LIMIT 20", (learner_id,))]
                            profile["pet"] = dict(db.execute("SELECT hunger,happiness,last_action FROM pet_state WHERE id=?", (learner_id,)).fetchone() or {})
                            return self.send_json(profile)
                        return self.send_json([dict(row) for row in db.execute("SELECT id,child_name,pet_name,learning_stage,grade,points FROM profile WHERE account_id=? ORDER BY id", (account_id,))])
                    if method == "POST" and not match.group(2):
                        learner_count = db.execute("SELECT COUNT(*) AS total FROM profile WHERE account_id=?", (account_id,)).fetchone()["total"]
                        if learner_count:
                            return self.send_json({"error": "每个账号只关联一位学习者，请为其他学习者单独注册账号"}, 409)
                        name = str(values.get("child_name", "")).strip()[:20]
                        pet_name = str(values.get("pet_name", "团团")).strip()[:20] or "团团"
                        stage = str(values.get("learning_stage", "未设置")).strip()
                        grade = str(values.get("grade", "")).strip()[:40]
                        if not name or stage not in {"未设置", "幼儿园", "小学"}:
                            raise ValueError("请填写孩子昵称和有效的学习阶段")
                        cur = db.execute("INSERT INTO profile(child_name,points,pet_name,pet_xp,learning_stage,grade,account_id) VALUES(?,120,?,0,?,?,?)", (name,pet_name,stage,grade,account_id))
                        learner_id = cur.lastrowid
                        db.execute("INSERT INTO pet_state(id) VALUES(?)", (learner_id,))
                        for item in db.execute("SELECT id FROM store_items WHERE (kind='pet' AND pet_model='clay_explorer') OR (kind='zoo_animal' AND zoo_animal_id='lion')").fetchall():
                            db.execute("INSERT IGNORE INTO owned_items(learner_id,item_id) VALUES(?,?)", (learner_id,item["id"]))
                        return self.send_json({"ok": True, "id": learner_id}, 201)
                    return self.send_json({"error": "不支持该孩子档案操作"}, 405)
                if method == "GET":
                    rows = db.execute("""SELECT a.id,a.username,a.account_type,a.role,a.display_name,a.status,a.created_at,
                        COUNT(p.id) AS learner_count FROM user_accounts a LEFT JOIN profile p ON p.account_id=a.id
                        GROUP BY a.id ORDER BY a.account_type,a.id""").fetchall()
                    items = [dict(row) for row in rows]
                    if account['role'] == 'superadmin':
                        summaries = community.admin_account_support(db)
                        shares = community.admin_account_sharing(db)
                        for item in items:
                            if item['account_type'] == 'parent':
                                item['support'] = summaries.get(item['id'], {
                                    'nickname': None, 'received_fen': 0, 'refunded_fen': 0,
                                    'total_fen': 0, 'paid_count': 0, 'last_paid_at': None,
                                    'expires_at': None, 'active': False, 'banned': False})
                                item['sharing'] = shares.get(item['id'], {'count': 0, 'active': False, 'expires_at': None})
                                state = item['support']
                                state['expires_at'] = str(state['expires_at']) if state['expires_at'] else None
                                item['participation'] = community.participation(state, item['sharing'], state['banned'] or item['status'] != 'active')
                    return self.send_json(items)
                if method == "POST" and account_id is None:
                    username = str(values.get("username", "")).strip()
                    password = str(values.get("password", ""))
                    account_type = str(values.get("account_type", "parent"))
                    role = str(values.get("role", "parent"))
                    display_name = str(values.get("display_name", "")).strip()[:80]
                    if not re.fullmatch(r"[A-Za-z0-9_.-]{3,40}", username):
                        raise ValueError("用户名需为 3–40 位英文、数字或 ._-")
                    if len(password) < 10:
                        raise ValueError("初始密码至少 10 位")
                    if account_type not in {"parent", "admin"}:
                        raise ValueError("账号类型无效")
                    if account_type == "admin" and account["role"] != "superadmin":
                        return self.send_json({"error": "只有超级管理员可以创建管理员账号"}, 403)
                    if account_type == "parent":
                        role = "parent"
                    elif role not in {"content_admin", "learner_manager", "viewer"}:
                        raise ValueError("管理员角色无效，超级管理员需由首次初始化创建")
                    cur = db.execute("INSERT INTO user_accounts(username,password_hash,account_type,role,display_name) VALUES(?,?,?,?,?)", (username,self.password_hash(password),account_type,role,display_name))
                    new_account_id = cur.lastrowid
                    if account_type == "parent":
                        name = str(values.get("child_name", "福福")).strip()[:20] or "福福"
                        pet_name = str(values.get("pet_name", "团团")).strip()[:20] or "团团"
                        stage = str(values.get("learning_stage", "未设置")).strip()
                        grade = str(values.get("grade", "")).strip()[:40]
                        if stage not in {"未设置", "幼儿园", "小学"}:
                            raise ValueError("学习阶段无效")
                        legacy = db.execute("SELECT id FROM profile WHERE account_id IS NULL ORDER BY id LIMIT 1").fetchone()
                        if legacy:
                            learner_id = legacy["id"]
                            db.execute("UPDATE profile SET account_id=? WHERE id=?", (new_account_id,learner_id))
                        else:
                            cur = db.execute("INSERT INTO profile(child_name,points,pet_name,pet_xp,learning_stage,grade,account_id) VALUES(?,120,?,0,?,?,?)", (name,pet_name,stage,grade,new_account_id))
                            learner_id = cur.lastrowid
                            db.execute("INSERT INTO pet_state(id) VALUES(?)", (learner_id,))
                            starter = db.execute("SELECT id FROM store_items WHERE kind='pet' AND pet_model='clay_explorer' ORDER BY id LIMIT 1").fetchone()
                            if starter:
                                db.execute("INSERT INTO owned_items(learner_id,item_id) VALUES(?,?)", (learner_id,starter["id"]))
                            lion = db.execute("SELECT id FROM store_items WHERE kind='zoo_animal' AND zoo_animal_id='lion' LIMIT 1").fetchone()
                            if lion:
                                db.execute("INSERT IGNORE INTO owned_items(learner_id,item_id) VALUES(?,?)", (learner_id,lion["id"]))
                    self.audit_admin_action(db, account, "创建账号", "account", new_account_id, f"创建{ '学习账号' if account_type == 'parent' else '管理员账号' } {username}")
                    return self.send_json({"ok": True, "id": new_account_id}, 201)
                if method == "PUT" and account_id:
                    target = db.execute("SELECT id,account_type,role,status,display_name FROM user_accounts WHERE id=? FOR UPDATE", (account_id,)).fetchone()
                    if not target:
                        return self.send_json({"error": "账号不存在"}, 404)
                    if account_id == account["id"] and (values.get("status") == "disabled" or (target["role"] == "superadmin" and values.get("role", target["role"]) != "superadmin")):
                        return self.send_json({"error": "不能停用当前登录账号或移除自己的超级管理员权限"}, 400)
                    if target["account_type"] == "admin" and account["role"] != "superadmin":
                        return self.send_json({"error": "只有超级管理员可以修改管理员账号与角色"}, 403)
                    status = str(values.get("status", target["status"]))
                    if status not in {"active", "disabled"}:
                        raise ValueError("账号状态无效")
                    new_role = str(values.get("role", target["role"]))
                    if target["account_type"] == "admin" and new_role not in {"superadmin", "content_admin", "learner_manager", "viewer"}:
                        raise ValueError("管理员角色无效")
                    if target["account_type"] == "parent":
                        new_role = "parent"
                    if target["role"] == "superadmin" and (new_role != "superadmin" or status == "disabled"):
                        count = db.execute("SELECT COUNT(*) AS n FROM user_accounts WHERE account_type='admin' AND role='superadmin' AND status='active'").fetchone()["n"]
                        if count <= 1:
                            raise ValueError("至少保留一个启用状态的超级管理员")
                    password = str(values.get("password", ""))
                    if password and len(password) < 10:
                        raise ValueError("新密码至少 10 位")
                    display_name = str(values.get("display_name", target["display_name"])).strip()[:80]
                    if password:
                        db.execute("UPDATE user_accounts SET role=?,status=?,display_name=?,password_hash=? WHERE id=?", (new_role,status,display_name,self.password_hash(password),account_id))
                        db.execute("DELETE FROM user_sessions WHERE account_id=?", (account_id,))
                    else:
                        db.execute("UPDATE user_accounts SET role=?,status=?,display_name=? WHERE id=?", (new_role,status,display_name,account_id))
                    if status == "disabled":
                        db.execute("DELETE FROM user_sessions WHERE account_id=?", (account_id,))
                    changes = []
                    if status != target["status"]:
                        changes.append("停用账号" if status == "disabled" else "启用账号")
                    if new_role != target["role"]:
                        changes.append(f"角色改为 {new_role}")
                    if display_name != target["display_name"]:
                        changes.append("修改显示名称")
                    if password:
                        changes.append("重置密码")
                    if changes:
                        self.audit_admin_action(db, account, "修改账号", "account", account_id, "；".join(changes))
                    return self.send_json({"ok": True})
                return self.send_json({"error": "不支持该账号操作"}, 405)
        except ValueError as exc:
            return self.send_json({"error": str(exc)}, 400)
        except IntegrityError:
            return self.send_json({"error": "用户名已存在，请换一个用户名"}, 409)
        except Exception as exc:
            print(f"Account management request failed: {type(exc).__name__}: {exc}")
            return self.send_json({"error": "账号操作失败，请检查 MySQL 连接"}, 500)
        return True

    def public_question(self, db, question_id):
        return self.public_questions(db, [question_id]).get(question_id)

    def public_questions(self, db, question_ids):
        if not question_ids:
            return {}
        placeholders = ','.join('?' for _ in question_ids)
        rows = db.execute(f"SELECT id,subject,stage,grade,title,prompt,question_type,difficulty,knowledge_point,prompt_audio,source_name,source_metadata FROM questions WHERE id IN ({placeholders})", question_ids).fetchall()
        items = {row['id']:dict(row, options=[]) for row in rows}
        for item in items.values():
            metadata=item.pop('source_metadata',None)
            if item.pop('source_name','') == reader_lessons.SOURCE and metadata:
                item['reader_lesson']=reader_lessons.decode(metadata)
        options = db.execute(f"SELECT question_id,option_key AS `key`,option_text AS text,image_url,audio_url FROM question_options WHERE question_id IN ({placeholders}) ORDER BY question_id,sort_order,id", question_ids).fetchall()
        for option in options:
            item = dict(option)
            question_id = item.pop('question_id')
            if question_id in items:
                items[question_id]['options'].append(item)
        return items

    def admin_questions(self, method, path, body=None):
        if not path.startswith("/api/admin/questions"):
            return False
        with connect() as auth_db:
            if not self.require_admin(auth_db, write=method != "GET", roles={"superadmin", "content_admin", "viewer"} if method == "GET" else {"superadmin", "content_admin"}):
                return True
        if path == "/api/admin/questions/import":
            if method != "POST":
                return self.send_json({"error": "不支持该管理操作"}, 405) or True
            try:
                records = (body or {}).get("questions")
                if not isinstance(records, list) or not 1 <= len(records) <= 200:
                    raise ValueError("一次请导入 1 到 200 道题")
                prepared = []
                for number, item in enumerate(records, 1):
                    if not isinstance(item, dict):
                        raise ValueError(f"第 {number} 道题格式无效")
                    subject = str(item.get("subject", "")).strip()
                    stage = str(item.get("stage", "")).strip()
                    grade = str(item.get("grade", "")).strip()
                    prompt = str(item.get("prompt", "")).strip()
                    answer = str(item.get("answer", "")).strip()
                    qtype = str(item.get("question_type", "single_choice"))
                    source_name = str(item.get("source_name", "")).strip()
                    source_license = str(item.get("source_license", "")).strip()
                    source_record_id = str(item.get("source_record_id", "")).strip()
                    options = item.get("options", [])
                    valid_grades = {"幼儿园": {"小班", "中班", "大班"}, "小学": {"一年级", "二年级", "三年级", "四年级", "五年级", "六年级"}}
                    if (subject not in {"语文", "数学", "英语", "科学"} or grade not in valid_grades.get(stage, set())
                            or not prompt or len(prompt) > 4000 or not answer
                            or qtype not in {"single_choice", "short_answer"}
                            or not source_name or not source_license or not source_record_id or len(source_record_id)>160
                            or str(item.get("difficulty", "medium")) not in {"easy", "medium", "hard"}):
                        raise ValueError(f"第 {number} 道题缺少学科、年级、题干、答案或来源标识")
                    if qtype == "single_choice":
                        if not isinstance(options, list) or not 2 <= len(options) <= 6:
                            raise ValueError(f"第 {number} 道选择题需要 2–6 个选项")
                        keys = [str(o.get("key", "")) for o in options if isinstance(o, dict)]
                        if (len(keys) != len(options) or len(set(keys)) != len(keys) or answer not in keys
                                or any(not str(o.get("text", "")).strip() for o in options)):
                            raise ValueError(f"第 {number} 道题选项或答案无效")
                    elif options:
                        raise ValueError(f"第 {number} 道简答题不需要选项")
                    prepared.append((item, subject, stage, grade, prompt, answer, qtype,
                                     source_name, source_license, source_record_id, options))
                if len({entry[9] for entry in prepared}) != len(prepared):
                    raise ValueError("导入文件中的来源标识重复")
                with connect() as db:
                    next_id = int(db.execute("SELECT COALESCE(MAX(id),0)+1 AS next_id FROM questions").fetchone()["next_id"])
                    inserted, skipped = 0, 0
                    for item, subject, stage, grade, prompt, answer, qtype, source_name, source_license, record_id, options in prepared:
                        if db.execute("SELECT id FROM questions WHERE source_record_id=?", (record_id,)).fetchone():
                            skipped += 1
                            continue
                        db.execute("""INSERT INTO questions(id,subject,stage,grade,title,prompt,options,answer,explanation,
                            knowledge_point,difficulty,question_type,status,source_record_id,source_name,source_license,
                            source_url,source_attribution,hint,prompt_audio,hint_audio,explanation_audio)
                            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                            (next_id, subject, stage, grade, str(item.get("title") or prompt[:80])[:200], prompt,
                             json.dumps([str(o.get("text", "")) for o in options], ensure_ascii=False), answer,
                             str(item.get("explanation", ""))[:4000], str(item.get("knowledge_point", ""))[:160],
                             str(item.get("difficulty", "medium"))[:20], qtype, "draft", record_id,
                             source_name[:120], source_license[:80], str(item.get("source_url", ""))[:1000],
                             str(item.get("source_attribution", "")), str(item.get("hint", ""))[:2000],
                             str(item.get("prompt_audio", ""))[:1000], str(item.get("hint_audio", ""))[:1000],
                             str(item.get("explanation_audio", ""))[:1000]))
                        for position, option in enumerate(options):
                            db.execute("""INSERT INTO question_options(question_id,option_key,option_text,image_url,audio_url,is_correct,sort_order)
                                VALUES(?,?,?,?,?,?,?)""", (next_id,str(option["key"])[:20],str(option.get("text", ""))[:1000],
                                str(option.get("image_url", ""))[:1000],str(option.get("audio_url", ""))[:1000],
                                int(str(option["key"]) == answer),position))
                        inserted += 1
                        next_id += 1
                    if inserted:
                        account = self.session_account(db)
                        self.audit_admin_action(db, account, "批量导入题目", "questions", "batch", f"草稿 {inserted} 道，跳过重复 {skipped} 道")
                return self.send_json({"ok": True, "inserted": inserted, "skipped": skipped, "status": "draft"}) or True
            except (ValueError, TypeError) as exc:
                return self.send_json({"error": str(exc)}, 400) or True
            except IntegrityError:
                return self.send_json({"error": "来源标识或题目编号发生冲突，请重试"}, 409) or True
            except Exception as exc:
                print(f"Question import failed: {type(exc).__name__}: {exc}")
                return self.send_json({"error": "导入失败，未写入任何题目"}, 500) or True
        if path == "/api/admin/questions/bulk-status":
            if method != "POST":
                self.send_json({"error": "不支持该管理操作"}, 405)
                return True
            try:
                values = body or {}
                raw_ids = values.get("ids")
                if not isinstance(raw_ids, list) or not 1 <= len(raw_ids) <= 200 or any(isinstance(value, bool) or not isinstance(value, int) or value < 1 for value in raw_ids):
                    raise ValueError("请先选择 1 到 200 道题目")
                ids = list(dict.fromkeys(raw_ids))
                if len(ids) != len(raw_ids):
                    raise ValueError("所选题目编号重复，请重新选择")
                target_status = str(values.get("status", ""))
                if target_status != "published":
                    raise ValueError("批量审核目前只支持发布草稿")
                placeholders = ",".join("?" for _ in ids)
                with connect() as db:
                    drafts = db.execute(f"SELECT id FROM questions WHERE status='draft' AND id IN ({placeholders})", ids).fetchall()
                    if len(drafts) != len(ids):
                        self.send_json({"error": "部分题目已不是草稿，请刷新列表后重试"}, 409)
                        return True
                    db.execute(f"UPDATE questions SET status='published' WHERE status='draft' AND id IN ({placeholders})", ids)
                return self.send_json({"ok": True, "updated": len(ids)})
            except (ValueError, TypeError) as exc:
                return self.send_json({"error": str(exc)}, 400)
            except Exception as exc:
                print(f"Question bulk review failed: {type(exc).__name__}: {exc}")
                return self.send_json({"error": "批量发布失败，请检查 MySQL 连接后重试"}, 500)
        match = re.fullmatch(r"/api/admin/questions(?:/(\d+))?", path)
        if not match:
            self.send_json({"error": "题库管理接口路径无效"}, 404)
            return True
        question_id = int(match.group(1)) if match.group(1) else None
        try:
            with connect() as db:
                if method == "GET":
                    if question_id:
                        row = db.execute("SELECT id,subject,stage,grade,title,prompt,question_type,difficulty,knowledge_point,prompt_audio,hint,hint_audio,answer,explanation,explanation_audio,status,source_name,source_url,source_license,source_attribution FROM questions WHERE id=?", (question_id,)).fetchone()
                        if not row:
                            return self.send_json({"error": "题目不存在"}, 404)
                        question = dict(row)
                        question["options"] = [dict(option) for option in db.execute("SELECT option_key AS `key`,option_text AS text,image_url,audio_url,is_correct FROM question_options WHERE question_id=? ORDER BY sort_order,id", (question_id,)).fetchall()]
                        if question["question_type"] == "single_choice":
                            question["answer"] = next((o["key"] for o in question["options"] if o["is_correct"]), "")
                        return self.send_json(question)
                    filters = parse_qs(urlparse(self.path).query)
                    page = max(1, int(filters.get("page", [1])[0]))
                    size = max(1, min(100, int(filters.get("page_size", [50])[0])))
                    clauses, params = [], []
                    for field in ("stage", "grade", "subject"):
                        value = str(filters.get(field, [""])[0]).strip()
                        if value:
                            clauses.append(f"{field}=?")
                            params.append(value)
                    query = str(filters.get("search", [""])[0]).strip()[:100]
                    if query:
                        clauses.append("(title LIKE ? OR prompt LIKE ? OR knowledge_point LIKE ? OR source_name LIKE ? OR CAST(id AS CHAR)=?)")
                        params.extend([f"%{query}%"] * 4 + [query])
                    base_where = " WHERE " + " AND ".join(clauses) if clauses else ""
                    status_rows = db.execute("SELECT status,COUNT(*) AS count FROM questions" + base_where + " GROUP BY status", params).fetchall()
                    counts = {row["status"]: row["count"] for row in status_rows}
                    selected_status = str(filters.get("status", [""])[0]).strip()
                    if selected_status and selected_status != "all":
                        if selected_status not in {"draft", "published", "archived"}:
                            raise ValueError("题目状态无效")
                        clauses.append("status=?")
                        params.append(selected_status)
                    where = " WHERE " + " AND ".join(clauses) if clauses else ""
                    total = db.execute("SELECT COUNT(*) AS total FROM questions" + where, params).fetchone()["total"]
                    rows = db.execute("SELECT id,subject,stage,grade,title,prompt,question_type,difficulty,knowledge_point,status,source_name,source_license FROM questions" + where + " ORDER BY id DESC LIMIT ? OFFSET ?", params + [size, (page - 1) * size]).fetchall()
                    return self.send_json({"items": [dict(row) for row in rows], "total": total,
                        "page": page, "page_size": size, "counts": counts})
                if method not in {"POST", "PUT", "DELETE"}:
                    return self.send_json({"error": "不支持该管理操作"}, 405)
                if method == "DELETE" and question_id:
                    db.execute("DELETE FROM question_options WHERE question_id=?", (question_id,))
                    db.execute("UPDATE questions SET status='archived' WHERE id=?", (question_id,))
                    return self.send_json({"ok": True})
                values = body or {}
                text = lambda key, default="", limit=1000: str(values.get(key, default) or "").strip()[:limit]
                options = values.get("options")
                question_type = text("question_type", "single_choice", 30)
                if question_type not in {"single_choice", "short_answer"}:
                    raise ValueError("暂不支持该题型")
                if not isinstance(options, list) or (question_type == "single_choice" and not 2 <= len(options) <= 6):
                    raise ValueError("选择题需要 2 到 6 个选项")
                subject, stage, grade = text("subject", limit=80), text("stage", limit=40), text("grade", limit=40)
                prompt, title = text("prompt", limit=4000), text("title", limit=200)
                if not subject or stage not in {"幼儿园", "小学"} or not grade or not prompt:
                    raise ValueError("科目、阶段、年级和题干均为必填项")
                answer = str(values.get("answer", ""))
                keys = [str(item.get("key", "")) for item in options if isinstance(item, dict)]
                if question_type == "single_choice":
                    if len(keys) != len(options) or len(set(keys)) != len(keys) or answer not in keys:
                        raise ValueError("选项编号无效，且必须指定一个正确答案")
                    if any(not str(item.get("text", "")).strip() for item in options):
                        raise ValueError("选项内容不能为空")
                elif not answer:
                    raise ValueError("简答题必须填写标准答案")
                status = text("status", "published", 20)
                if status not in {"draft", "published", "archived"}:
                    raise ValueError("题目状态无效")
                if method == "POST":
                    question_id = int(db.execute("SELECT COALESCE(MAX(id),0)+1 AS next_id FROM questions").fetchone()["next_id"])
                    db.execute("INSERT INTO questions(id,subject,stage,title,prompt,options,answer,explanation,grade,knowledge_point,difficulty,question_type,prompt_audio,hint,hint_audio,explanation_audio,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (question_id,subject,stage,title or prompt[:80],prompt,json.dumps([str(x.get("text", "")) for x in options],ensure_ascii=False),answer,text("explanation",limit=4000),grade,text("knowledge_point",limit=160),text("difficulty","medium",20),question_type,text("prompt_audio",limit=1000),text("hint",limit=2000),text("hint_audio",limit=1000),text("explanation_audio",limit=1000),status))
                else:
                    if not question_id:
                        return self.send_json({"error": "题目编号无效"}, 404)
                    cur = db.execute("UPDATE questions SET subject=?,stage=?,title=?,prompt=?,options=?,answer=?,explanation=?,grade=?,knowledge_point=?,difficulty=?,question_type=?,prompt_audio=?,hint=?,hint_audio=?,explanation_audio=?,status=? WHERE id=?", (subject,stage,title or prompt[:80],prompt,json.dumps([str(x.get("text", "")) for x in options],ensure_ascii=False),answer,text("explanation",limit=4000),grade,text("knowledge_point",limit=160),text("difficulty","medium",20),question_type,text("prompt_audio",limit=1000),text("hint",limit=2000),text("hint_audio",limit=1000),text("explanation_audio",limit=1000),status,question_id))
                    if cur.rowcount == 0 and not db.execute("SELECT id FROM questions WHERE id=?", (question_id,)).fetchone():
                        return self.send_json({"error": "题目不存在"}, 404)
                    db.execute("DELETE FROM question_options WHERE question_id=?", (question_id,))
                for index, option in enumerate(options):
                    db.execute("INSERT INTO question_options(question_id,option_key,option_text,image_url,audio_url,is_correct,sort_order) VALUES(?,?,?,?,?,?,?)", (question_id,str(option["key"]),str(option["text"]).strip(),str(option.get("image_url", ""))[:1000],str(option.get("audio_url", ""))[:1000],int(str(option["key"])==answer),index))
                return self.send_json({"ok": True, "id": question_id}, 201 if method == "POST" else 200)
        except (ValueError, TypeError, KeyError) as exc:
            return self.send_json({"error": str(exc)}, 400)
        except Exception as exc:
            print(f"Question management request failed: {type(exc).__name__}: {exc}")
            return self.send_json({"error": "保存失败，请检查 MySQL 连接后重试"}, 500)
        return True

    def create_quiz(self, db, body, learner_id=1):
        if body.get('practice_mode') == 'reader':
            return reader_lessons.create_quiz(self,db,body,learner_id)
        profile = db.execute("SELECT learning_stage,grade FROM profile WHERE id=?", (learner_id,)).fetchone()
        if not profile or profile["learning_stage"] not in {"幼儿园", "小学"} or not profile["grade"]:
            return self.send_json({"error": "请先在“我的”中设置学习阶段和年级"}, 400)
        subject = str(body.get("subject", "数学")).strip()[:80]
        knowledge_point = str(body.get("knowledge_point", "")).strip()[:160]
        count = max(1, min(20, int(body.get("count", 5))))
        query = """SELECT q.id FROM questions q WHERE q.status='published' AND q.subject=?
            AND q.stage=? AND (q.grade=? OR q.grade='*') AND COALESCE(q.source_name,'')!='福福学堂情境拼读'"""
        params = [subject, profile["learning_stage"], profile["grade"]]
        try:
            curriculum_clause, curriculum_params, practice_grade = curriculum.quiz_filter(db, body, subject, profile['learning_stage'], profile['grade'])
        except ValueError as exc:
            return self.send_json({'error': str(exc)}, 400)
        query += curriculum_clause
        params.extend(curriculum_params)
        practice_grade = practice_grade or profile['grade']
        practice_stage = curriculum.PRACTICE_STAGE if curriculum_clause else profile['learning_stage']
        params[1] = practice_stage
        params[2] = practice_grade
        if knowledge_point:
            query += " AND q.knowledge_point=?"
            params.append(knowledge_point)
        # Sample a bounded indexed window, then rank this learner's own history in one query.
        # The new independent reader catalog must not distort ordinary quiz sampling.
        bounds = db.execute("SELECT COALESCE(MIN(candidate.id),1) AS minimum,COALESCE(MAX(candidate.id),0) AS maximum FROM (" + query + ") candidate", params).fetchone()
        pivot = random.randint(bounds['minimum'], max(bounds['minimum'], bounds['maximum']))
        pool_size = max(120, count * 12)
        rows = list(db.execute(query + " AND q.id>=? ORDER BY q.id LIMIT ?", params + [pivot, pool_size]).fetchall())
        if len(rows) < pool_size:
            rows.extend(db.execute(query + " AND q.id<? ORDER BY q.id LIMIT ?", params + [pivot, pool_size - len(rows)]).fetchall())
        if not rows:
            return self.send_json({"error": "这个年级和科目的题目还在准备中"}, 404)
        candidate_ids = [row["id"] for row in rows]
        placeholders = ",".join("?" for _ in candidate_ids)
        history = db.execute(f"""SELECT sq.question_id,MAX(qa.created_at) AS last_attempt
            FROM quiz_session_questions sq JOIN quiz_sessions qs ON qs.id=sq.session_id
            JOIN question_attempts qa ON qa.session_question_id=sq.id
            WHERE qs.learner_id=? AND sq.question_id IN ({placeholders}) GROUP BY sq.question_id""",
            [learner_id] + candidate_ids).fetchall()
        last_seen = {row["question_id"]: row["last_attempt"] for row in history}
        random.shuffle(candidate_ids)
        candidate_ids.sort(key=lambda item: (item in last_seen, last_seen.get(item) or ""))
        selected = candidate_ids[:count]
        cursor = db.execute("INSERT INTO quiz_sessions(subject,stage,grade,learner_id) VALUES(?,?,?,?)", (subject,practice_stage,practice_grade,learner_id))
        session_id = cursor.lastrowid
        public_items = self.public_questions(db, selected)
        items = []
        for index, question_id in enumerate(selected):
            db.execute("INSERT INTO quiz_session_questions(session_id,question_id,position) VALUES(?,?,?)", (session_id,question_id,index))
            items.append(public_items[question_id])
        return self.send_json({"id": session_id,"subject": subject,"stage": practice_stage,"grade": practice_grade,"questions": items})

    def answer_quiz(self, db, session_id, body, learner_id=1):
        question_id = int(body.get("question_id", 0))
        option_key = str(body.get("option_key", ""))[:20]
        answer_text = str(body.get("answer_text", "")).strip()[:500]
        item = db.execute("SELECT sq.id,sq.status,sq.wrong_attempts,q.answer,q.explanation,q.hint,q.explanation_audio,q.stage,q.question_type FROM quiz_session_questions sq JOIN questions q ON q.id=sq.question_id JOIN quiz_sessions s ON s.id=sq.session_id WHERE sq.session_id=? AND sq.question_id=? AND s.learner_id=? FOR UPDATE", (session_id,question_id,learner_id)).fetchone()
        if not item:
            return self.send_json({"error": "题目不属于当前练习"}, 404)
        if item["status"] != "pending":
            return self.send_json({"error": "这道题已经完成"}, 409)
        if item["question_type"] == "short_answer":
            if not answer_text:
                return self.send_json({"error": "请先填写答案"}, 400)
            normalize = lambda value: re.sub(r"\s+", "", str(value)).replace("，", ",").replace(",", "")
            parse_number = lambda value: Fraction(normalize(value)[:-1]) / 100 if normalize(value).endswith("%") else Fraction(normalize(value))
            try:
                expected = parse_number(item["answer"])
                submitted = parse_number(answer_text)
                correct = submitted == expected or (item["answer"].strip().endswith("%") and not answer_text.endswith("%") and submitted / 100 == expected)
            except (ValueError, ZeroDivisionError):
                correct = normalize(answer_text).casefold() == normalize(item["answer"]).casefold()
        else:
            option = db.execute("SELECT is_correct,option_text FROM question_options WHERE question_id=? AND option_key=?", (question_id,option_key)).fetchone()
            if not option:
                return self.send_json({"error": "请选择一个有效选项"}, 400)
            correct = bool(option["is_correct"])
        db.execute("INSERT INTO question_attempts(session_question_id,selected_option,answer_text,is_correct) VALUES(?,?,?,?)", (item["id"],option_key,answer_text or None,int(correct)))
        wrong = item["wrong_attempts"] + (0 if correct else 1)
        if correct:
            db.execute("UPDATE quiz_session_questions SET status='correct' WHERE id=?", (item["id"],))
            db.execute("INSERT INTO completions(question_id,correct,points_delta,learner_id) VALUES(?,1,?,?)", (question_id,QUIZ_CORRECT_POINTS,learner_id))
            db.execute("UPDATE profile SET points=points+? WHERE id=?", (QUIZ_CORRECT_POINTS,learner_id))
            db.execute("INSERT INTO ledger(kind,amount,description,learner_id) VALUES('学习奖励',?,?,?)", (QUIZ_CORRECT_POINTS,str(db.execute("SELECT title FROM questions WHERE id=?", (question_id,)).fetchone()["title"]),learner_id))
        else:
            db.execute("UPDATE quiz_session_questions SET wrong_attempts=? WHERE id=?", (wrong,item["id"]))
            db.execute("INSERT INTO completions(question_id,correct,points_delta,learner_id) VALUES(?,0,0,?)", (question_id,learner_id))
        response = {"correct": correct,"reward": QUIZ_CORRECT_POINTS if correct else 0,"wrong_attempts": wrong}
        if not correct and wrong >= 2:
            response.update({"hint": item["hint"] or "再仔细听一遍题目，想想哪个选项更合适。", "answer": item["answer"],"explanation": item["explanation"],"explanation_audio": item["explanation_audio"],"can_reveal": True})
        if correct:
            response.update({"answer": item["answer"],"explanation": item["explanation"],"explanation_audio": item["explanation_audio"]})
        response["profile"] = profile_payload(db, learner_id)
        return self.send_json(response)

    def local_admin_allowed(self):
        try:
            remote = ipaddress.ip_address(self.client_address[0])
            if getattr(remote, "ipv4_mapped", None):
                remote = remote.ipv4_mapped
            if not remote.is_loopback:
                return False
        except ValueError:
            return False
        origin = self.headers.get("Origin")
        if origin:
            host = urlparse(origin).hostname
            if host not in {"localhost", "127.0.0.1", "::1"}:
                return False
        return True

    def admin_story_payload(self, body):
        text = lambda key, default="", limit=500: str(body.get(key, default) or "").strip()[:limit]
        slug = text("slug", limit=120).lower()
        title = text("title", limit=160)
        summary = text("summary", limit=500)
        story_type = text("story_type", "chengyu", 40)
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
            raise ValueError("素材 ID 请使用小写英文、数字和连字符")
        if not title or not summary:
            raise ValueError("标题和摘要不能为空")
        if story_type not in {"story", "chengyu", "traditional-tale", "traditional-myth", "science", "history"}:
            raise ValueError("请选择有效的内容类型")
        paragraphs = body.get("paragraphs")
        if not isinstance(paragraphs, list) or not paragraphs or len(paragraphs) > 30:
            raise ValueError("正文至少需要一段，最多支持 30 段")
        paragraphs = [str(p).strip() for p in paragraphs]
        if any(not p or len(p) > 5000 for p in paragraphs):
            raise ValueError("正文段落不能为空，每段最多 5000 个字符")
        tags = body.get("tags", [])
        if isinstance(tags, str):
            tags = [tag.strip() for tag in tags.split(",") if tag.strip()]
        if not isinstance(tags, list) or len(tags) > 30:
            raise ValueError("标签格式不正确，最多支持 30 个标签")
        color = text("color", "#e6d8ba", 7)
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
            raise ValueError("封面底色请使用 #RRGGBB 格式")
        cover_status = text("cover_status", "ready", 20)
        if cover_status not in {"ready", "pending"}:
            raise ValueError("封面状态无效")
        cover = text("cover", limit=255)
        if cover and not cover.startswith("/assets/"):
            raise ValueError("封面路径请使用应用内 /assets/ 路径")
        try:
            reading_minutes = max(1, min(120, int(body.get("reading_minutes", 3))))
        except (TypeError, ValueError):
            raise ValueError("阅读时长必须是数字")
        category = text("category", 80) or {"chengyu": "成语故事", "traditional-tale": "传统故事", "traditional-myth": "中国神话", "science": "科普", "story": "故事"}.get(story_type, "故事")
        return {
            "slug": slug, "story_type": story_type, "title": title, "category": category,
            "age": text("age", limit=40), "color": color, "emoji": text("emoji", "📖", 32),
            "summary": summary, "paragraphs": paragraphs, "moral": text("moral", limit=4000),
            "tags": [str(tag).strip()[:60] for tag in tags], "reading_minutes": reading_minutes,
            "cover": cover, "cover_status": cover_status, "source_note": text("source_note", limit=4000),
            "cover_prompt": text("cover_prompt", limit=5000),
        }

    def admin_stories(self, method, path, body=None):
        if not path.startswith("/api/admin/stories"):
            return False
        with connect() as auth_db:
            if not self.require_admin(auth_db, write=method != "GET", roles={"superadmin", "content_admin", "viewer"} if method == "GET" else {"superadmin", "content_admin"}):
                return True
        match = re.fullmatch(r"/api/admin/stories(?:/(\d+))?", path)
        if not match:
            self.send_json({"error": "管理接口路径无效"}, 404)
            return True
        story_id = int(match.group(1)) if match.group(1) else None
        try:
            if method == "GET":
                if story_id:
                    story = mysql_db.get_story(story_id)
                    if not story:
                        self.send_json({"error": "故事不存在"}, 404)
                    else:
                        self.send_json(story)
                else:
                    self.send_json(mysql_db.list_stories())
            elif method == "POST" and story_id is None:
                story = mysql_db.create_story(self.admin_story_payload(body or {}))
                content_catalog.sync_story_media(story["id"])
                self.send_json(story, 201)
            elif method == "PUT" and story_id:
                story = mysql_db.update_story(story_id, self.admin_story_payload(body or {}))
                if story:
                    content_catalog.sync_story_media(story_id)
                    self.send_json(story)
                else:
                    self.send_json({"error": "故事不存在"}, 404)
            elif method == "DELETE" and story_id:
                if mysql_db.delete_story(story_id):
                    content_catalog.sync_story_media(story_id)
                    self.send_json({"ok": True})
                else:
                    self.send_json({"error": "故事不存在"}, 404)
            else:
                self.send_json({"error": "不支持该管理操作"}, 405)
        except ValueError as exc:
            self.send_json({"error": str(exc)}, 400)
        except IntegrityError:
            self.send_json({"error": "素材 ID 已存在，请换一个 ID"}, 409)
        except Exception:
            print("Story content management request failed")
            self.send_json({"error": "保存失败，请检查 MySQL 连接后重试"}, 500)
        return True

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if self.community_api('GET', path):
            return
        if self.game_access_api('GET', path):
            return
        if path.startswith('/api/toy-games') and not self.require_game_access():
            return
        if self.parent_points_api('GET', path):
            return
        if self.story_reading_api('GET', path):
            return
        if self.daily_plan_api('GET', path):
            return
        if path in {'/api/solar/catalog', '/api/companion/appearance'}:
            try:
                return self.send_json(solar_catalog.catalog() if path == '/api/solar/catalog' else solar_catalog.appearance())
            except Exception as exc:
                print('Scene catalog unavailable:', exc)
                return self.send_json({'error': '场景资料暂时无法读取，请稍后重试'}, 503)
        if self.toy_game_api('GET',path):
            return
        if self.content_api("GET", path):
            return
        if path in {"/api/auth/status", "/api/auth/bootstrap", "/api/auth/register", "/api/auth/login", "/api/auth/logout", "/api/auth/select-learner"}:
            self.auth_api("GET", path)
            return
        if path in {"/admin", "/admin/"}:
            self.path = "/admin.html"
            return super().do_GET()
        if self.admin_stories("GET", path):
            return
        if path.startswith("/api/admin/accounts"):
            return self.admin_accounts("GET", path)
        if path.startswith("/api/admin/redemptions") or path=="/api/admin/audit-logs":
            return self.admin_operations("GET", path)
        if path.startswith("/api/admin/questions"):
            self.admin_questions("GET", path)
            return
        if path == '/api/stories/recommendations':
            try:
                query = parse_qs(urlparse(self.path).query)
                excluded = [int(value) for value in query.get('exclude', [''])[0].split(',') if value][:3]
                result = mysql_db.story_recommendations(excluded, exclude_types=('history',))
                result['items'] = [item for item in result.get('items', []) if item.get('story_type') != 'history']
                return self.send_json(result)
            except ValueError:
                return self.send_json({'error': '推荐参数无效'}, 400)
            except Exception:
                logging.exception('Story recommendations failed')
                return self.send_json({'error': '故事推荐暂时无法加载'}, 503)
        if path == "/api/stories":
            try:
                query = parse_qs(urlparse(self.path).query)
                return self.send_json(mysql_db.list_story_summaries(
                    query.get("page", [1])[0], query.get("page_size", [12])[0],
                    query.get("type", [""])[0]))
            except ValueError:
                return self.send_json({"error": "分页参数无效"}, 400)
            except Exception as exc:
                print(f"Story database read failed: {type(exc).__name__}: {exc}")
                return self.send_json({"error": "故事数据库暂时无法连接"}, 503)
        story_match = re.fullmatch(r"/api/stories/(\d+)", path)
        if story_match:
            try:
                story = mysql_db.get_story(int(story_match.group(1)))
                return self.send_json(story) if story else self.send_json({"error": "内容不存在"}, 404)
            except Exception as exc:
                print(f"Story database read failed: {type(exc).__name__}: {exc}")
                return self.send_json({"error": "故事数据库暂时无法连接"}, 503)
        with connect() as db:
            if path == "/api/tts":
                # 按需语音合成：需要有效登录态，防止接口被外部滥用
                if not self.session_account(db):
                    return self.send_json({"error": "请先登录"}, 401)
                query = parse_qs(urlparse(self.path).query)
                text = (query.get("text", [""])[0] or "").strip()
                lang = query.get("lang", ["zh-CN"])[0] or "zh-CN"
                voice = query.get("voice", [""])[0] or ""
                if not text:
                    return self.send_json({"error": "缺少 text 参数"}, 400)
                try:
                    url, cached = tts_on_demand.synthesize_on_demand(text, lang, voice)
                except ValueError as exc:
                    return self.send_json({"error": str(exc)}, 400)
                except Exception as exc:
                    print(f"[tts-on-demand] {type(exc).__name__}: {exc}")
                    return self.send_json({"error": "语音合成失败，请稍后再试"}, 502)
                resp = self.send_json({"url": url, "cached": cached})
                return resp
            if path == "/api/health":
                row = db.execute("SELECT 1 AS database_ok, NOW() AS checked_at").fetchone()
                return self.send_json({"ok": True, "database_ok": bool(row["database_ok"]), "checked_at": row["checked_at"]})
            if path.startswith('/api/curriculum/'):
                learner_id = self.require_parent_learner(db)
                if not learner_id:
                    return
                profile = db.execute('SELECT learning_stage,grade FROM profile WHERE id=?', (learner_id,)).fetchone()
                try:
                    result = curriculum.catalog(db, path, parse_qs(urlparse(self.path).query), profile)
                    return self.send_json(result) if result is not None else self.send_json({'error':'目录不存在'}, 404)
                except ValueError as exc:
                    return self.send_json({'error':str(exc)}, 400)
            if self.farm_api("GET", path):
                return
            learner_id = None
            if path in {"/api/profile", "/api/pet", "/api/store", "/api/zoo"}:
                learner_id = self.require_parent_learner(db)
                if not learner_id:
                    return
            if path == "/api/profile":
                return self.send_json(profile_payload(db, learner_id))
            if path == "/api/pet":
                return self.send_json(pet_payload(db, learner_id))
            if path == "/api/store":
                return self.send_json([dict(x) for x in db.execute("SELECT i.*,CASE WHEN o.id IS NULL THEN 0 ELSE 1 END AS owned FROM store_items i LEFT JOIN owned_items o ON o.item_id=i.id AND o.learner_id=? WHERE (i.kind<>'pet' OR i.pet_model='clay_explorer') AND i.kind<>'snack' ORDER BY CASE WHEN i.kind='pet' THEN 0 ELSE 1 END,i.id", (learner_id,))])
            if path == "/api/zoo":
                rows = db.execute("SELECT i.zoo_animal_id,i.name,i.emoji,i.price,CASE WHEN o.id IS NULL THEN 0 ELSE 1 END AS owned FROM store_items i LEFT JOIN owned_items o ON o.item_id=i.id AND o.learner_id=? WHERE i.kind='zoo_animal' ORDER BY i.id", (learner_id,)).fetchall()
                return self.send_json([dict(row) for row in rows])
            if path == "/api/questions":
                # Only public catalog metadata is returned; answer keys stay server-side.
                where = "status='published'"
                params = []
                if parse_qs(urlparse(self.path).query).get('scope') == ['learner']:
                    learner_id = self.require_parent_learner(db)
                    if not learner_id:
                        return
                    profile = db.execute('SELECT learning_stage,grade FROM profile WHERE id=?', (learner_id,)).fetchone()
                    where += " AND stage=? AND (grade=? OR grade='*')"
                    params = [profile['learning_stage'], profile['grade']]
                rows = db.execute("SELECT subject,stage,grade,difficulty,knowledge_point,COUNT(*) AS count FROM questions WHERE " + where + " GROUP BY subject,stage,grade,difficulty,knowledge_point ORDER BY stage,grade,subject", params).fetchall()
                return self.send_json([dict(row) for row in rows])
            return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if int(self.headers.get("Content-Length", "0")) > (28_000_000 if path == "/api/admin/media/upload" else 1_000_000):
            return self.send_json({"error": "请求内容过大"}, 413)
        try:
            body = self.read_body()
        except (ValueError, UnicodeDecodeError):
            return self.send_json({'error': '提交内容格式无效'}, 400)
        if self.community_api('POST', path, body):
            return
        if self.game_access_api('POST', path, body):
            return
        if path == '/api/game/reward' and not self.require_game_access():
            return
        if self.parent_points_api('POST', path, body):
            return
        if self.story_reading_api('POST', path, body):
            return
        if self.daily_plan_api('POST', path, body):
            return
        if self.toy_game_api('POST',path,body):
            return
        if self.farm_api("POST", path, body):
            return
        if self.content_api("POST", path, body):
            return
        if path in {"/api/auth/status", "/api/auth/bootstrap", "/api/auth/register", "/api/auth/login", "/api/auth/logout", "/api/auth/select-learner"}:
            self.auth_api("POST", path, body)
            return
        if self.admin_stories("POST", path, body):
            return
        if path.startswith("/api/admin/accounts"):
            return self.admin_accounts("POST", path, body)
        if path.startswith("/api/admin/redemptions") or path=="/api/admin/audit-logs":
            return self.admin_operations("POST", path, body)
        if path.startswith("/api/admin/questions"):
            self.admin_questions("POST", path, body)
            return
        with connect() as db:
            parent_paths = {"/api/quiz-sessions", "/api/profile/learning-stage", "/api/profile/child-name", "/api/redeem", "/api/feed", "/api/pet/action", "/api/pet/equip", "/api/pet/switch", "/api/store/buy", "/api/game/reward"}
            is_quiz_action = bool(re.fullmatch(r"/api/quiz-sessions/\d+/(?:finish|answer)", path))
            learner_id = None
            if path in parent_paths or is_quiz_action:
                learner_id = self.require_parent_learner(db)
                if not learner_id:
                    return
                db.set_learner_id(learner_id)
            if path == "/api/quiz-sessions":
                try:
                    return self.create_quiz(db, body, learner_id)
                except (ValueError, TypeError) as exc:
                    return self.send_json({"error": str(exc)}, 400)
            finish_match = re.fullmatch(r"/api/quiz-sessions/(\d+)/finish", path)
            if finish_match:
                session_id = int(finish_match.group(1))
                db.execute("UPDATE quiz_sessions SET status='completed',finished_at=NOW() WHERE id=? AND learner_id=? AND status='active'", (session_id,learner_id))
                return self.send_json({"ok": True})
            match = re.fullmatch(r"/api/quiz-sessions/(\d+)/answer", path)
            if match:
                return self.answer_quiz(db, int(match.group(1)), body, learner_id)
            if path == "/api/profile/learning-stage":
                stage = str(body.get("learning_stage", "")).strip()
                grade = str(body.get("grade", "")).strip()
                allowed = {"幼儿园": {"小班", "中班", "大班"}, "小学": {"一年级", "二年级", "三年级", "四年级", "五年级", "六年级"}}
                if stage not in allowed or grade not in allowed[stage]:
                    return self.send_json({"error": "请选择有效的年龄阶段和年级"}, 400)
                db.execute("UPDATE profile SET learning_stage=?,grade=? WHERE id=1", (stage, grade))
                return self.send_json({"ok": True, "profile": profile_payload(db,learner_id)})
            if path == "/api/profile/child-name":
                child_name = str(body.get("child_name", "")).strip()
                if not child_name or len(child_name) > 20:
                    return self.send_json({"error": "昵称请填写 1 到 20 个字符"}, 400)
                db.execute("UPDATE profile SET child_name=? WHERE id=1", (child_name,))
                return self.send_json({"ok": True, "profile": profile_payload(db,learner_id)})
            if path == "/api/redeem":
                amount = int(body.get("amount", 0))
                description = str(body.get("description", "实物兑换")).strip()[:100]
                profile = db.execute("SELECT points FROM profile WHERE id=1 FOR UPDATE").fetchone()
                if amount <= 0 or not description:
                    return self.send_json({"error": "请填写兑换内容和有效积分"}, 400)
                if amount > profile["points"]:
                    return self.send_json({"error": "积分不足，无法抵扣"}, 400)
                db.execute("UPDATE profile SET points=points-? WHERE id=1", (amount,))
                db.execute("INSERT INTO ledger(kind,amount,description,learner_id) VALUES('实物兑换',?,?,?)", (-amount, description,learner_id))
                return self.send_json({"ok": True, "profile": profile_payload(db,learner_id)})
            if path == "/api/feed":
                cost = int(body.get("cost", 20))
                row = db.execute("SELECT points FROM profile WHERE id=1").fetchone()
                if cost <= 0 or row["points"] < cost:
                    return self.send_json({"error": "积分不够，继续闯关赚积分吧！"}, 400)
                db.execute("UPDATE profile SET points=points-? WHERE id=1", (cost,))
                db.execute("INSERT INTO ledger(kind,amount,description,learner_id) VALUES('宠物喂养',?,'给团团买了一份点心',?)", (-cost,learner_id))
                db.execute("UPDATE pet_state SET hunger=max(0,hunger-35), happiness=min(100,happiness+4),last_action='刚刚吃了一份香香点心' WHERE id=1")
                return self.send_json({"ok": True, "profile": profile_payload(db,learner_id), "pet": pet_payload(db,learner_id)})
            if path == "/api/pet/action":
                action = body.get("action")
                actions = {"companion": ("UPDATE pet_state SET happiness=min(100,happiness+12),last_action='你陪团团说了悄悄话' WHERE id=1", "团团好开心呀，谢谢你陪我！"), "play": ("UPDATE pet_state SET happiness=min(100,happiness+15),last_action='刚刚和你玩了游戏' WHERE id=1", "和你玩游戏真开心！"), "sing": ("UPDATE pet_state SET happiness=min(100,happiness+8),last_action='刚刚为你唱了首歌' WHERE id=1", ""), "wave": ("UPDATE pet_state SET happiness=min(100,happiness+3),last_action='刚刚向你挥了挥手' WHERE id=1", "团团在向你挥手！")}
                if action not in actions:
                    return self.send_json({"error": "这个互动暂时还没有"}, 400)
                db.execute(actions[action][0])
                return self.send_json({"message": actions[action][1], "pet": pet_payload(db,learner_id)})
            if path == "/api/pet/equip":
                item_id = body.get("item_id")
                if item_id is None:
                    slot = body.get("slot")
                    if slot is None:
                        db.execute("DELETE FROM pet_equipment WHERE pet_id=1")
                    elif slot in {"head", "face", "neck", "chest", "outer", "feet"}:
                        db.execute("DELETE FROM pet_equipment WHERE pet_id=1 AND slot=?", (slot,))
                    else:
                        return self.send_json({"error": "装扮位置无效"}, 400)
                    remaining = db.execute("""SELECT i.emoji FROM pet_equipment e JOIN store_items i ON i.id=e.item_id
                        WHERE e.pet_id=1 ORDER BY e.slot LIMIT 1""").fetchone()
                    db.execute("UPDATE pet_state SET accessory=?,last_action='团团换下了装扮' WHERE id=1", (remaining["emoji"] if remaining else "",))
                else:
                    item = db.execute("SELECT i.* FROM store_items i JOIN owned_items o ON o.item_id=i.id AND o.learner_id=? WHERE i.id=?", (learner_id,item_id)).fetchone()
                    if not item or item["kind"] != "wearable" or not item["equip_slot"]:
                        return self.send_json({"error": "这件收藏品还不能穿戴"}, 400)
                    db.execute("""INSERT INTO pet_equipment(pet_id,slot,item_id) VALUES(1,?,?)
                        ON DUPLICATE KEY UPDATE item_id=VALUES(item_id)""", (item["equip_slot"], item["id"]))
                    db.execute("UPDATE pet_state SET accessory=?,last_action=? WHERE id=1", (item["emoji"], "团团穿上了" + item["name"]))
                return self.send_json({"ok": True, "pet": pet_payload(db,learner_id)})
            if path == "/api/pet/switch":
                item = db.execute("SELECT i.* FROM store_items i JOIN owned_items o ON o.item_id=i.id AND o.learner_id=? WHERE i.id=? AND i.kind='pet' AND i.pet_model='clay_explorer'", (learner_id,body.get("item_id"))).fetchone()
                if not item:
                    return self.send_json({"error": "先在宠物商店兑换这位伙伴吧"}, 400)
                db.execute("UPDATE pet_state SET pet_model=?,last_action=? WHERE id=1", (item["pet_model"], "现在和" + item["name"] + "一起玩"))
                return self.send_json({"ok": True, "pet": pet_payload(db,learner_id)})
            if path == "/api/store/buy":
                item = db.execute("SELECT * FROM store_items WHERE id=?", (body.get("item_id"),)).fetchone()
                if not item:
                    return self.send_json({"error": "商品不存在"}, 404)
                profile = db.execute("SELECT points FROM profile WHERE id=1 FOR UPDATE").fetchone()
                if db.execute("SELECT id FROM owned_items WHERE item_id=? AND learner_id=?", (item["id"],learner_id)).fetchone():
                    return self.send_json({"error": "已经拥有这件商品啦"}, 400)
                if profile["points"] < item["price"]:
                    return self.send_json({"error": "积分不够，去学习或闯关赚一些吧"}, 400)
                if item["kind"] == "wearable" and not item["equip_slot"]:
                    return self.send_json({"error": "这件配件还没有穿戴位置"}, 400)
                if item["kind"] == "farm":
                    try:
                        farm.fulfill_product(db, learner_id, item)
                    except ValueError as exc:
                        return self.send_json({"error": str(exc)}, 400)
                db.execute("UPDATE profile SET points=points-? WHERE id=1", (item["price"],))
                db.execute("INSERT INTO ledger(kind,amount,description,learner_id) VALUES('积分商店',?,?,?)", (-item["price"], "兑换：" + item["name"],learner_id))
                if item["kind"] == "snack":
                    db.execute("UPDATE pet_state SET hunger=max(0,hunger-45),happiness=min(100,happiness+8),last_action='刚刚吃了一份积分商店兑换的蛋糕' WHERE id=1")
                else:
                    db.execute("INSERT INTO owned_items(learner_id,item_id) VALUES(?,?)", (learner_id,item["id"]))
                if item["kind"] == "wearable":
                    db.execute("""INSERT INTO pet_equipment(pet_id,slot,item_id) VALUES(1,?,?)
                        ON DUPLICATE KEY UPDATE item_id=VALUES(item_id)""", (item["equip_slot"], item["id"]))
                    db.execute("UPDATE pet_state SET accessory=?,last_action=? WHERE id=1", (item["emoji"], "团团穿上了" + item["name"]))
                elif item["kind"] != "snack":
                    db.execute("UPDATE pet_state SET last_action=? WHERE id=1", ("刚刚收到礼物：" + item["name"],))
                return self.send_json({"ok": True, "profile": profile_payload(db,learner_id), "item": dict(item)})
            if path == "/api/game/reward":
                game = str(body.get("game", ""))[:30]
                if game not in ("maze", "sudoku", "mines"):
                    return self.send_json({"error": "游戏记录无效"}, 400)
                try:
                    db.execute("INSERT INTO game_rewards(game,played_on,learner_id) VALUES(?,CURDATE(),?)", (game,learner_id))
                except (sqlite3.IntegrityError, pymysql.err.IntegrityError):
                    return self.send_json({"reward": 0, "message": "今天这款游戏的奖励已经领过啦"})
                db.execute("UPDATE profile SET points=points+5 WHERE id=1")
                db.execute("UPDATE pet_state SET happiness=min(100,happiness+5),last_action='和你完成了一场游戏' WHERE id=1")
                game_names = {"maze": "暗夜迷宫", "sudoku": "数独挑战", "mines": "扫雷行动"}
                db.execute("INSERT INTO ledger(kind,amount,description,learner_id) VALUES('游戏奖励',5,?,?)", ("完成" + game_names[game],learner_id))
                return self.send_json({"reward": 5, "profile": profile_payload(db,learner_id)})
            return self.send_json({"error": "接口不存在"}, 404)

    def do_PUT(self):
        path = urlparse(self.path).path
        if int(self.headers.get("Content-Length", "0")) > 1_000_000:
            return self.send_json({"error": "请求内容过大"}, 413)
        body = self.read_body()
        if self.content_api("PUT", path, body):
            return
        if self.admin_stories("PUT", path, body):
            return
        if path.startswith("/api/admin/accounts"):
            return self.admin_accounts("PUT", path, body)
        if path.startswith("/api/admin/redemptions") or path=="/api/admin/audit-logs":
            return self.admin_operations("PUT", path, body)
        if path.startswith("/api/admin/questions"):
            self.admin_questions("PUT", path, body)
            return
        self.send_json({"error": "接口不存在"}, 404)

    def do_DELETE(self):
        path = urlparse(self.path).path
        if self.content_api("DELETE", path):
            return
        if self.admin_stories("DELETE", path):
            return
        if path.startswith("/api/admin/questions"):
            self.admin_questions("DELETE", path)
            return
        self.send_json({"error": "接口不存在"}, 404)

    def log_message(self, fmt, *args):
        """访问日志同时落盘 —— 平板和手机上的请求发生在本机之外，出问题时
        “哪台设备连上来了、拿的是哪一版前端代码”只能靠这个文件回溯。"""
        try:
            access_log.info("%s %s", self.address_string(), fmt % args)
        except Exception:
            pass
        try:
            print("%s - %s" % (self.address_string(), fmt % args))
        except Exception:
            pass

if __name__ == "__main__":
    from startup import initialize_application
    initialize_application()
    print("福福学堂已启动：http://localhost:8000")
    ThreadingHTTPServer((os.getenv("FUFU_BIND_HOST", "0.0.0.0"), 8000), Handler).serve_forever()
