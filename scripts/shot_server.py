import base64, io, os
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

OUT = os.path.join(os.path.dirname(__file__), '..', 'artifacts', 'shots')
os.makedirs(OUT, exist_ok=True)

class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')

    def do_GET(self):
        with open(os.path.join(OUT, 'beacons.log'), 'a', encoding='utf-8') as f:
            f.write(self.path + '\n')
        self.send_response(204); self._cors(); self.end_headers()

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_POST(self):
        q = parse_qs(urlparse(self.path).query)
        name = q.get('name', ['shot'])[0]
        n = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(n)
        if body.startswith(b'data:'):
            body = base64.b64decode(body.split(b',', 1)[1])
        path = os.path.join(OUT, name + '.png')
        with open(path, 'wb') as f:
            f.write(body)
        with open(os.path.join(OUT, 'beacons.log'), 'a', encoding='utf-8') as f:
            f.write('POST ' + name + ' ' + str(len(body)) + '\n')
        self.send_response(200); self._cors()
        self.send_header('Content-Type', 'text/plain'); self.end_headers()
        self.wfile.write(path.encode())

    def log_message(self, *a):
        pass

HTTPServer(('127.0.0.1', 8765), H).serve_forever()
