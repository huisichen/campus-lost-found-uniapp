"""Run with python -m backend.server; expose publicly only behind nginx."""
import json
import logging
import mimetypes
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs, unquote
from .core import Service, Problem, require

LOG = logging.getLogger('campus')


def load_env(path):
    if Path(path).is_file():
        for line in Path(path).read_text(encoding='utf-8-sig').splitlines():
            if line.strip() and not line.lstrip().startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def handler(service, static_dir=None):
    origins = {x.strip() for x in os.getenv('ALLOWED_ORIGINS', '').split(',') if x.strip()}

    class Handler(BaseHTTPRequestHandler):
        server_version = 'CampusAPI'

        def setup(self):
            super().setup()
            self.connection.settimeout(20)

        def log_message(self, fmt, *args):
            LOG.info('HTTP %s %s', self.command, urlsplit(self.path).path)

        def send(self, status, value=None):
            body = json.dumps(value, ensure_ascii=False).encode() if value is not None else b''
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            origin = self.headers.get('Origin')
            if origin in origins:
                self.send_header('Access-Control-Allow-Origin', origin)
                self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
            self.end_headers()
            self.wfile.write(body)

        def body(self):
            require(not self.headers.get('Transfer-Encoding'), '不支持分块请求')
            try:
                length = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                raise Problem('请求长度无效') from None
            require(0 <= length <= 6 * 1024 * 1024, '请求体过大', 413)
            require(self.headers.get('Content-Type', '').split(';')[0] == 'application/json', '仅接受 JSON', 415)
            try:
                result = json.loads(self.rfile.read(length))
            except (ValueError, TimeoutError):
                raise Problem('JSON 请求无效') from None
            require(isinstance(result, dict), '请求须为 JSON 对象')
            return result

        def route(self):
            path = urlsplit(self.path).path
            require(not self.headers.get('Origin') or self.headers['Origin'] in origins, '该来源未获授权', 403)
            if self.command == 'OPTIONS':
                return self.send(204)
            if path == '/api/health' and self.command == 'GET':
                return self.send(200, {'ok': True, 'version': '2026-11-28-workflow.1'})
            if path.startswith('/api/media/') and self.command == 'GET':
                q = parse_qs(urlsplit(self.path).query)
                mime, content = service.media(path.removeprefix('/api/media/'), q.get('user', [''])[0],
                    q.get('expires', [''])[0], q.get('signature', [''])[0])
                self.send_response(200)
                self.send_header('Content-Type', mime)
                self.send_header('Content-Length', str(len(content)))
                self.send_header('Cache-Control', 'private, no-store')
                self.send_header('Referrer-Policy', 'no-referrer')
                self.send_header('X-Content-Type-Options', 'nosniff')
                self.end_headers()
                self.wfile.write(content)
                return
            if self.command == 'GET' and not path.startswith('/api/'):
                require(static_dir, '页面不存在', 404)
                root = Path(static_dir).resolve()
                relative = unquote(path).removeprefix('/campus-lost-found-uniapp/').lstrip('/') or 'index.html'
                target = (root / relative).resolve()
                require(target.is_relative_to(root) and target.is_file() and not any(x.startswith('.') for x in Path(relative).parts), '文件不存在', 404)
                content = target.read_bytes()
                self.send_response(200)
                self.send_header('Content-Type', mimetypes.guess_type(target)[0] or 'application/octet-stream')
                self.send_header('Content-Length', str(len(content)))
                self.send_header('X-Content-Type-Options', 'nosniff')
                self.end_headers()
                self.wfile.write(content)
                return
            data = self.body() if self.command in ('POST', 'PATCH') else {}
            if path == '/api/auth/code' and self.command == 'POST':
                ip = self.headers.get('X-Real-IP') if os.getenv('TRUST_PROXY') == 'true' else self.client_address[0]
                return self.send(200, service.send_code(data.get('studentNo'), ip or self.client_address[0]))
            if path == '/api/auth/verify' and self.command == 'POST':
                service.limit('verify-ip:' + service.digest(self.client_address[0]) + ':' + str(int(time.time() // 3600)), 100)
                return self.send(200, service.verify_code(data.get('studentNo'), data.get('code')))
            token = self.headers.get('Authorization', '').removeprefix('Bearer ')
            user = service.authenticate(token)
            service.limit('api:' + user['id'] + ':' + str(int(time.time() // 60)), 180)
            if path == '/api/auth/me' and self.command == 'GET':
                return self.send(200, user)
            if path == '/api/auth/logout' and self.command == 'POST':
                service.logout(token)
                return self.send(200, {'ok': True})
            if path == '/api/admin/operations' and self.command == 'GET':
                return self.send(200, service.operations(user))
            if path == '/api/assistant' and self.command == 'POST':
                return self.send(200, service.assistant(user, data))
            if path == '/api/match/recheck' and self.command == 'POST':
                p = service.post(user, data.get('postId'))
                require(p['owner_id'] == user['id'] or user['role'] == 'admin', '无权触发此任务', 403)
                with service.db() as c:
                    revision = c.execute('SELECT revision FROM posts WHERE id=?', (p['id'],)).fetchone()[0]
                    service.enqueue(c, p['id'], revision)
                return self.send(202, {'queued': True})
            if path.startswith('/api/data/'):
                name = path.removeprefix('/api/data/')
                require('/' not in name, '资源不存在', 404)
                if self.command == 'GET':
                    return self.send(200, service.read_table(user, name))
                query = parse_qs(urlsplit(self.path).query)
                row_id = query.get('id', [''])[0].removeprefix('eq.')
                require(self.command in ('POST', 'PATCH', 'DELETE'), '不支持此请求', 405)
                require(self.command == 'POST' or row_id, '缺少记录编号')
                return self.send(200, service.write_table(user, name, self.command, data, row_id))
            raise Problem('接口不存在', 404)

        def dispatch(self):
            try:
                self.route()
            except Problem as e:
                self.send(e.status, {'error': e.message, 'ok': False})
            except (BrokenPipeError, ConnectionResetError, TimeoutError):
                pass
            except Exception as e:
                LOG.error('request failed: %s', type(e).__name__)
                self.send(500, {'error': '服务暂不可用，请稍后再试', 'ok': False})

        do_GET = do_POST = do_PATCH = do_DELETE = do_OPTIONS = dispatch

    return Handler


class Server(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 64

    def __init__(self, address, route):
        self.slots = threading.BoundedSemaphore(32)
        super().__init__(address, route)

    def process_request(self, request, address):
        if not self.slots.acquire(blocking=False):
            request.sendall(b'HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.slots.release()


def main():
    load_env(Path(__file__).parent / '.env')
    path = Path(os.getenv('DATABASE_PATH', 'backend/data/campus.sqlite3'))
    path.parent.mkdir(parents=True, exist_ok=True)
    service = Service(path, os.getenv('APP_SECRET', ''))
    service.start_workers(int(os.getenv('WORKER_COUNT', '2')))
    server = Server((os.getenv('BIND_HOST', '127.0.0.1'), int(os.getenv('PORT', '8000'))), handler(service))
    logging.basicConfig(level=logging.INFO)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        service.close()


if __name__ == '__main__':
    main()
