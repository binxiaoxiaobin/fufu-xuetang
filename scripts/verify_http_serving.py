"""HTTP 静态服务回归检查：keep-alive、gzip、304、目录跳转、API 是否都还正常。

为什么需要它：后端跑在 HTTP/1.0 时每条资源都要重新三次握手。经 Tailscale 穿透
（实测单程约 450ms）访问时，首页 18 个文件仅握手就要 8 秒以上，页面会"打不开"。
所以 server.py 里把 protocol_version 提到 HTTP/1.1 并加了 gzip 压缩，这个脚本用来
守住这几条不能被改回去的约定。

用法：先启动后端，然后
    python scripts/verify_http_serving.py
全部通过返回 0，有失败返回 1。
"""
import gzip
import json
import os
import socket
import sys

HOST, PORT = "127.0.0.1", 8000
ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")

passed = []
failed = []


def check(name, ok, detail=""):
    (passed if ok else failed).append(name)
    print(("  [OK]   " if ok else "  [FAIL] ") + name + ("  " + detail if detail else ""))


def connect():
    return socket.create_connection((HOST, PORT), timeout=15)


def request(sock, method, path, extra=""):
    sock.sendall(("%s %s HTTP/1.1\r\nHost: %s:%d\r\n%s\r\n" % (method, path, HOST, PORT, extra)).encode())


def read_response(sock):
    data = b""
    while b"\r\n\r\n" not in data:
        chunk = sock.recv(65536)
        if not chunk:
            break
        data += chunk
    head, _, rest = data.partition(b"\r\n\r\n")
    lines = head.split(b"\r\n")
    if not lines or not lines[0]:
        return None, {}, b""
    headers = {}
    for line in lines[1:]:
        if b":" in line:
            key, value = line.split(b":", 1)
            headers[key.strip().lower().decode()] = value.strip().decode()
    length = int(headers.get("content-length") or 0)
    body = rest
    while len(body) < length:
        chunk = sock.recv(65536)
        if not chunk:
            break
        body += chunk
    return lines[0].decode(), headers, body


print("=== 1. 协议版本 + 同一条连接连续取多个资源 ===")
sock = connect()
request(sock, "GET", "/index.html", "Accept-Encoding: gzip\r\n")
status, headers, body = read_response(sock)
check("状态行是 HTTP/1.1", status.startswith("HTTP/1.1"), status)
check("index.html 返回 200", status.endswith(" 200 OK"))
check("index.html 有 Content-Encoding: gzip", headers.get("content-encoding") == "gzip",
      headers.get("content-encoding", "(无)"))
check("响应带 Vary: Accept-Encoding", "accept-encoding" in (headers.get("vary") or "").lower())
check("没有被要求关闭连接", "close" not in (headers.get("connection") or "").lower())

ok_second = False
request(sock, "GET", "/app.js", "Accept-Encoding: gzip\r\n")
status2, headers2, body2 = read_response(sock)
if status2 and status2.endswith(" 200 OK"):
    ok_second = True
check("同一条连接上第二个请求也成功（keep-alive 生效）", ok_second, status2 or "(连接已被关闭)")

ok_third = False
request(sock, "GET", "/style.css", "Accept-Encoding: gzip\r\n")
status3, headers3, body3 = read_response(sock)
if status3 and status3.endswith(" 200 OK"):
    ok_third = True
check("同一条连接上第三个请求也成功", ok_third, status3 or "(连接已被关闭)")
sock.close()

print()
print("=== 2. gzip 内容正确性（解压后必须与磁盘文件逐字节一致） ===")
for path, name in (("/index.html", "index.html"), ("/app.js", "app.js"), ("/style.css", "style.css")):
    sock = connect()
    request(sock, "GET", path, "Accept-Encoding: gzip\r\n")
    status, headers, body = read_response(sock)
    sock.close()
    disk = open(os.path.join(ROOT, name), "rb").read()
    if headers.get("content-encoding") == "gzip":
        try:
            plain = gzip.decompress(body)
        except Exception as exc:  # noqa: BLE001
            plain = b""
            print("     解压失败:", exc)
    else:
        plain = body
    check("%s 解压后与磁盘一致" % name, plain == disk,
          "%d -> %d 字节 (省 %.0f%%)" % (len(disk), len(body),
                                        (1 - len(body) / max(len(disk), 1)) * 100))

print()
print("=== 2b. 目录首页也要压缩（/ 和 /clay-safari/） ===")
for path, name in (("/", "index.html"), ("/clay-safari/", "clay-safari/index.html")):
    sock = connect()
    request(sock, "GET", path, "Accept-Encoding: gzip\r\n")
    status, headers, body = read_response(sock)
    sock.close()
    disk = open(os.path.join(ROOT, name), "rb").read()
    check("%s 返回 200" % path, " 200 " in (status or ""), status or "(无响应)")
    check("%s 有 Content-Encoding: gzip" % path, headers.get("content-encoding") == "gzip",
          headers.get("content-encoding", "(无压缩)"))
    plain = gzip.decompress(body) if headers.get("content-encoding") == "gzip" else body
    check("%s 解压后与磁盘一致" % path, plain == disk, "%d -> %d 字节" % (len(disk), len(body)))

print()
print("=== 3. 客户端不声明 gzip 时不能压缩 ===")
sock = connect()
request(sock, "GET", "/style.css")
status, headers, body = read_response(sock)
sock.close()
disk_len = os.path.getsize(os.path.join(ROOT, "style.css"))
check("无 Accept-Encoding 时原样返回", headers.get("content-encoding") is None)
check("无 Accept-Encoding 时长度等于文件大小", len(body) == disk_len, "%d / %d" % (len(body), disk_len))

print()
print("=== 4. 304 缓存协商仍然有效 ===")
sock = connect()
request(sock, "GET", "/style.css", "Accept-Encoding: gzip\r\n")
status, headers, _ = read_response(sock)
sock.close()
last_modified = headers.get("last-modified", "")
sock = connect()
request(sock, "GET", "/style.css",
        "Accept-Encoding: gzip\r\nIf-Modified-Since: %s\r\n" % last_modified)
status, headers, body = read_response(sock)
sock.close()
check("带 If-Modified-Since 返回 304", status.endswith(" 304 Not Modified"), status)
check("304 不带响应体", len(body) == 0)

print()
print("=== 5. 二进制资源不压缩 ===")
sock = connect()
request(sock, "GET", "/assets/moon-nasa.jpg", "Accept-Encoding: gzip\r\n")
status, headers, body = read_response(sock)
sock.close()
check("jpg 不被 gzip", headers.get("content-encoding") is None, status)

print()
print("=== 6. API 仍然正常 ===")
sock = connect()
request(sock, "GET", "/api/health", "Accept-Encoding: gzip\r\n")
status, headers, body = read_response(sock)
if not body and status:
    line = b""
else:
    line = body
check("/api/health 返回 200", status.endswith(" 200 OK"), status)
try:
    payload = json.loads(line or b"{}")
    check("/api/health database_ok 为真", payload.get("database_ok") is True, str(payload)[:80])
except Exception as exc:  # noqa: BLE001
    check("/api/health 返回 JSON", False, str(exc))

sock = connect()
request(sock, "GET", "/api/stories?page_size=2", "Accept-Encoding: gzip\r\n")
status, headers, body = read_response(sock)
check("/api/stories 返回 200", status.endswith(" 200 OK"), status)
try:
    payload = json.loads(body or b"{}")
    check("/api/stories 有数据", bool(payload.get("items")), "共 %s 条" % payload.get("total"))
except Exception as exc:  # noqa: BLE001
    check("/api/stories 返回 JSON", False, str(exc))

sock = connect()
request(sock, "GET", "/api/zoo", "Accept-Encoding: gzip\r\n")
status, headers, body = read_response(sock)
check("/api/zoo 未登录返回 401", status.endswith(" 401 Unauthorized"), status)
sock.close()

print()
print("=== 7. POST 仍能正确读取请求体（登录接口） ===")
sock = connect()
payload = json.dumps({"username": "__probe__", "password": "__nope__"}).encode()
request(sock, "POST", "/api/auth/login",
        "Content-Type: application/json\r\nContent-Length: %d\r\n" % len(payload))
sock.sendall(payload)
status, headers, body = read_response(sock)
sock.close()
check("POST 被正确处理（非 500）", bool(status) and " 500 " not in status, status or "(无响应)")
check("POST 返回 JSON", body.strip().startswith(b"{"), body[:120].decode("utf-8", "replace"))

print()
print("=== 7b. 请求体没读完时必须关闭连接（防 keep-alive 串包） ===")
sock = connect()
request(sock, "POST", "/api/stories", "Content-Type: application/json\r\nContent-Length: 2000000\r\n")
status, headers, body = read_response(sock)
check("超大请求体返回 413", " 413 " in (status or ""), status or "(无响应)")
check("413 明确要求关闭连接", (headers.get("connection") or "").lower() == "close",
      headers.get("connection", "(无 Connection 头)"))
sock.close()

print()
print("=== 8. 404 仍然正常 ===")
sock = connect()
request(sock, "GET", "/__definitely_missing__.js", "Accept-Encoding: gzip\r\n")
status, headers, body = read_response(sock)
sock.close()
check("不存在的路径返回 404", " 404 " in (status or ""), status or "(无响应)")

print()
print("=== 9. 目录跳转与 index 解析 ===")
sock = connect()
request(sock, "GET", "/clay-safari/", "Accept-Encoding: gzip\r\n")
status, headers, body = read_response(sock)
sock.close()
check("/clay-safari/ 正常返回", status.endswith(" 200 OK"), status)

sock = connect()
request(sock, "GET", "/clay-safari", "Accept-Encoding: gzip\r\n")
status, headers, body = read_response(sock)
sock.close()
check("/clay-safari 返回 301 跳转", status.endswith(" 301 Moved Permanently"), status)

print()
print("=== 10. 首页 18 个资源压缩收益 ===")
total_raw = total_gz = 0
for name in ("index.html", "style.css", "app.js", "exploration-modules.js", "extras.js",
             "landmark-tour.js", "dino-model.js", "moon.js", "engineering-explore.js",
             "puzzles.js", "globe.js", "solar.js", "lunar.js", "auth-client.js",
             "tts.js", "pet3d.js", "quiz-polish.css", "runtime-config.js",
             "vendor/three.core.js", "vendor/GLTFLoader.js"):
    full = os.path.join(ROOT, name)
    if not os.path.exists(full):
        continue
    raw = open(full, "rb").read()
    total_raw += len(raw)
    total_gz += len(gzip.compress(raw, 6))
print("  首页+3D: %d KB -> %d KB  节省 %.0f%%" % (
    total_raw // 1024, total_gz // 1024, (1 - total_gz / max(total_raw, 1)) * 100))

print()
print("=" * 52)
print("通过 %d 项，失败 %d 项" % (len(passed), len(failed)))
if failed:
    print("失败项:")
    for item in failed:
        print("  -", item)
sys.exit(1 if failed else 0)
