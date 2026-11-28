"""Shared SQLite data, verified email identities, durable matching jobs.

Small-trial deployment: one Python service, SQLite WAL on a persistent volume.
No default administrator, no inline OTP and no client-supplied roles.
"""
import base64
import hashlib
import hmac
import json
import logging
import math
import os
import re
import secrets
import smtplib
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid

from .model import Model

LOG = logging.getLogger('campus.mail')

CATEGORIES = ['证件卡类', '电子数码', '包袋衣物', '生活用品', '学习用品', '钥匙卡类', '其他']
QUESTIONS = {'lining': '物品内侧或内衬是什么颜色、材质？', 'zipper': '拉链头、扣件有什么特别之处？',
             'contents': '物品里面有哪些未公开的内容物？', 'mark': '隐蔽位置有什么特别标记？',
             'wear': '物品哪处有特别的磨损或划痕？', 'accessory': '隐蔽附件有什么特点？'}


class Problem(Exception):
    def __init__(self, message, status=400):
        self.message, self.status = message, status


def require(condition, message='操作不允许', status=400):
    if not condition:
        raise Problem(message, status)


def now():
    return datetime.now(timezone.utc).isoformat()


def ident():
    return uuid.uuid4().hex


def dump(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def scrub(value, length=500):
    s = str(value or '').strip()[:length]
    return re.sub(r'\b(?:1[3-9]\d{9}|\d{15}(?:\d{2}[0-9Xx])?)\b', '[隐私已省略]', s)


def picture(value):
    if not value:
        return ''
    require(isinstance(value, str) and len(value) <= 4_200_000, '照片不得超过 3 MB')
    match = re.fullmatch(r'data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=\r\n]+)', value)
    require(match, '照片须为 JPEG、PNG 或 WebP')
    try:
        raw = base64.b64decode(match[2], validate=True)
    except ValueError:
        raise Problem('照片编码无效') from None
    valid = {'jpeg': raw.startswith(b'\xff\xd8\xff'), 'png': raw.startswith(b'\x89PNG\r\n\x1a\n'),
             'webp': raw.startswith(b'RIFF') and raw[8:12] == b'WEBP'}
    require(len(raw) <= 3 * 1024 * 1024 and valid[match[1]], '照片格式或大小无效')
    return value


def smtp_send(email, code):
    host, user, password = (os.getenv(k, '') for k in ('SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'))
    if not all((host, user, password)):
        raise Problem('管理员尚未配置发信邮箱，请稍后再试', 503)
    msg = EmailMessage()
    msg['Subject'] = '珞珈失物招领：登录验证码'
    msg['From'] = formataddr((os.getenv('SMTP_FROM_NAME', '珞珈失物招领'), os.getenv('SMTP_FROM') or user))
    msg['To'] = email
    msg['Date'] = formatdate(localtime=True)
    msg['Message-ID'] = make_msgid(domain=(os.getenv('SMTP_FROM') or user).split('@')[-1])
    msg.set_content(
        f'你的登录验证码是 {code}，5 分钟内有效。\n\n'
        '如果这不是你本人的操作，忽略本邮件即可，你的账号不会被登录。\n'
        '没在收件箱看到这封邮件时，请顺便看一下垃圾邮件目录。\n')
    # Only encrypted SMTP; authorization code never reaches the browser or logs.
    with smtplib.SMTP_SSL(host, int(os.getenv('SMTP_PORT', '465')), timeout=15) as client:
        client.login(user, password)
        client.send_message(msg)


def debug_send(email, code):
    """本机联调用的发信替身：不联网，把验证码打到终端并追加到 backend/data/mail-debug.log。

    只有显式设置 MAIL_DEBUG=1 才会启用，用于还没拿到 163 授权码时跑通整条登录链路。
    公网部署必须保持 MAIL_DEBUG=0，否则验证码会留在日志里。
    """
    LOG.warning('MAIL_DEBUG=1，未真实发信：%s 的验证码是 %s', email, code)
    print(f'[MAIL_DEBUG] {time.strftime("%Y-%m-%d %H:%M:%S")} {email} {code}', flush=True)
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'mail-debug.log')
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'a', encoding='utf-8') as f:
            f.write(f'{time.strftime("%Y-%m-%d %H:%M:%S")}\t{email}\t{code}\n')
    except OSError:
        pass


def default_mailer():
    return debug_send if os.getenv('MAIL_DEBUG') == '1' else smtp_send


class Service:
    def __init__(self, db_path, secret, mailer=None, model=None, admins=None):
        require(len(secret) >= 32, 'APP_SECRET 至少 32 个字符，必须在服务端设置', 503)
        self.path, self.secret = str(db_path), secret.encode()
        self.mailer, self.model = mailer or default_mailer(), model or Model()
        self.admins = set(admins if admins is not None else os.getenv('ADMIN_STUDENT_NOS', '').split(','))
        self.domain = os.getenv('SCHOOL_EMAIL_DOMAIN', 'whu.edu.cn')
        # 试点白名单：学号前缀（年级），如 PILOT_STUDENT_PREFIXES=2025,2024。
        # 留空表示不限制，任何 13 位学号都能申请验证码。
        self.prefixes = tuple(p.strip() for p in os.getenv('PILOT_STUDENT_PREFIXES', '').split(',') if p.strip())
        self.lock = threading.RLock()
        self.stop = threading.Event()
        self.workers = []
        with self.db() as c:
            c.executescript('''
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, student_no TEXT UNIQUE, name TEXT,
              role TEXT, department TEXT, status TEXT, created_at TEXT, login_at REAL);
            CREATE TABLE IF NOT EXISTS codes(student_no TEXT PRIMARY KEY, hash TEXT, expires REAL,
              attempts INTEGER, sent REAL, ready INTEGER);
            CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, user_id TEXT, expires REAL);
            CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY, owner_id TEXT, kind TEXT, category TEXT,
              status TEXT, data TEXT, revision INTEGER DEFAULT 1);
            CREATE INDEX IF NOT EXISTS posts_candidates ON posts(status,category,kind);
            CREATE TABLE IF NOT EXISTS images(post_id TEXT PRIMARY KEY, data TEXT);
            CREATE TABLE IF NOT EXISTS claims(id TEXT PRIMARY KEY, post_id TEXT, user_id TEXT, status TEXT, data TEXT);
            CREATE INDEX IF NOT EXISTS claims_owner ON claims(user_id,post_id);
            CREATE TABLE IF NOT EXISTS points(id TEXT PRIMARY KEY, data TEXT);
            CREATE TABLE IF NOT EXISTS features(post_id TEXT PRIMARY KEY, signature TEXT, data TEXT, checks TEXT);
            CREATE TABLE IF NOT EXISTS verifications(id TEXT PRIMARY KEY, user_id TEXT, post_id TEXT,
              expires REAL, revision TEXT, checks TEXT, answers TEXT, consumed INTEGER DEFAULT 0);
            CREATE TABLE IF NOT EXISTS matches(pair TEXT PRIMARY KEY, lost_id TEXT, found_id TEXT,
              lost_user TEXT, found_user TEXT, score INTEGER, reason TEXT, created_at TEXT);
            CREATE INDEX IF NOT EXISTS match_lost_owner ON matches(lost_user);
            CREATE INDEX IF NOT EXISTS match_found_owner ON matches(found_user);
            CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, post_id TEXT, revision INTEGER,
              state TEXT, attempts INTEGER DEFAULT 0, available REAL, error TEXT,
              UNIQUE(post_id,revision));
            CREATE TABLE IF NOT EXISTS usage(id TEXT PRIMARY KEY, user_id TEXT, task TEXT, day TEXT,
              prompt_tokens INTEGER DEFAULT 0, completion_tokens INTEGER DEFAULT 0,
              total_tokens INTEGER DEFAULT 0, reserved INTEGER, state TEXT, created_at TEXT);
            CREATE INDEX IF NOT EXISTS usage_day ON usage(day,user_id);
            CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY, count INTEGER);
            CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY, actor TEXT, action TEXT, target TEXT, created_at TEXT);
            ''')
            c.execute("UPDATE jobs SET state='pending' WHERE state='running'")
            c.execute("UPDATE usage SET state='failed', reserved=0 WHERE state='running'")

    @contextmanager
    def db(self):
        with self.lock:
            c = sqlite3.connect(self.path, timeout=15)
            c.row_factory = sqlite3.Row
            try:
                c.execute('PRAGMA foreign_keys=ON')
                c.execute('BEGIN IMMEDIATE')
                yield c
                c.commit()
            except Exception:
                c.rollback()
                raise
            finally:
                c.close()

    def digest(self, value):
        return hmac.new(self.secret, value.encode(), hashlib.sha256).hexdigest()

    def limit(self, key, maximum):
        with self.db() as c:
            c.execute('INSERT INTO limits VALUES(?,1) ON CONFLICT(key) DO UPDATE SET count=count+1', (key,))
            count = c.execute('SELECT count FROM limits WHERE key=?', (key,)).fetchone()[0]
            # Commit exceeded counts too: repeated rejected attempts stay rate limited.
        require(count <= maximum, '请求过于频繁，请稍后再试', 429)

    def send_code(self, no, ip):
        require(bool(re.fullmatch(r'\d{13}', str(no))), '请输入 13 位学号')
        require(not self.prefixes or any(str(no).startswith(p) for p in self.prefixes),
                '该学号暂未开通试用（当前仅限 ' + '/'.join(self.prefixes) + ' 开头），请联系管理员', 403)
        hour = int(time.time() // 3600)
        self.limit(f'otp-ip:{self.digest(ip)}:{hour}', 20)
        self.limit(f'otp-user:{no}:{hour}', 5)
        code = f'{secrets.randbelow(1000000):06}'
        with self.db() as c:
            old = c.execute('SELECT sent FROM codes WHERE student_no=?', (no,)).fetchone()
            require(not old or time.time() - old[0] >= 60, '请 60 秒后再获取验证码', 429)
            c.execute('INSERT OR REPLACE INTO codes VALUES(?,?,?,?,?,0)',
                      (no, self.digest(no + ':' + code), time.time() + 300, 0, time.time()))
        try:
            self.mailer(no + '@' + self.domain, code)
        except Exception:
            with self.db() as c:
                c.execute('DELETE FROM codes WHERE student_no=? AND hash=?', (no, self.digest(no + ':' + code)))
            raise Problem('验证码发送失败，请联系管理员检查发信配置', 503) from None
        with self.db() as c:
            c.execute('UPDATE codes SET ready=1 WHERE student_no=? AND hash=?', (no, self.digest(no + ':' + code)))
        return {'ok': True, 'mode': 'server', 'email': no[:4] + '*****' + no[-4:] + '@' + self.domain}

    def verify_code(self, no, code):
        require(re.fullmatch(r'\d{13}', str(no)) and re.fullmatch(r'\d{6}', str(code)), '学号或验证码格式不正确')
        error = None
        with self.db() as c:
            r = c.execute('SELECT * FROM codes WHERE student_no=?', (no,)).fetchone()
            if not r or not r['ready'] or r['expires'] <= time.time() or r['attempts'] >= 5:
                error = '验证码已失效，请重新获取'
            elif not hmac.compare_digest(r['hash'], self.digest(no + ':' + code)):
                c.execute('UPDATE codes SET attempts=attempts+1 WHERE student_no=?', (no,))
                error = '验证码不正确'
            else:
                c.execute('DELETE FROM codes WHERE student_no=?', (no,))
                u = c.execute('SELECT * FROM users WHERE student_no=?', (no,)).fetchone()
                if not u:
                    uid = ident()
                    c.execute('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)', (uid, no, '同学' + no[-4:],
                              'admin' if no in self.admins else 'user', '校园用户', 'active', now(), time.time()))
                    u = c.execute('SELECT * FROM users WHERE id=?', (uid,)).fetchone()
                if u['status'] != 'active':
                    error = '该账号已停用，请联系管理员'
                else:
                    c.execute('UPDATE users SET login_at=? WHERE id=?', (time.time(), u['id']))
                    token = secrets.token_urlsafe(32)
                    c.execute('INSERT INTO sessions VALUES(?,?,?)', (self.digest(token), u['id'], time.time() + 7 * 86400))
                    result = {'ok': True, 'access_token': token, 'expires_in': 7 * 86400, 'user': self.identity(u)}
        require(not error, error or '登录失败', 401)
        return result

    def identity(self, row):
        return {'id': row['id'], 'studentNo': row['student_no'], 'name': row['name'],
                'email': row['student_no'] + '@' + self.domain, 'role': row['role'],
                'department': row['department'], 'status': row['status'],
                'lastLoginAt': row['login_at'] * 1000, 'verifiedAt': row['login_at'] * 1000}

    def authenticate(self, token):
        with self.db() as c:
            row = c.execute('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id '
                            'WHERE s.hash=? AND s.expires>? AND u.status=?',
                            (self.digest(token), time.time(), 'active')).fetchone()
        require(row, '登录已失效，请重新登录', 401)
        return self.identity(row)

    def logout(self, token):
        with self.db() as c:
            c.execute('DELETE FROM sessions WHERE hash=?', (self.digest(token),))

    def public_post(self, p, user=None):
        result = {k: v for k, v in p.items() if k not in ('privateDetails', 'privateChecks', 'checks')}
        if result.get('image') == 'stored' and user:
            expires = int(time.time()) + 900
            signature = self.digest(f'media:{p["id"]}:{user["id"]}:{expires}')
            result['image'] = f'/api/media/{p["id"]}?user={user["id"]}&expires={expires}&signature={signature}'
        return result

    def media(self, pid, user_id, expires, signature):
        try:
            expires = int(expires)
        except (ValueError, TypeError):
            raise Problem('照片链接无效', 404) from None
        require(time.time() < expires <= time.time() + 901 and hmac.compare_digest(
            str(signature), self.digest(f'media:{pid}:{user_id}:{expires}')), '照片链接已失效，请刷新', 404)
        with self.db() as c:
            u = c.execute("SELECT * FROM users WHERE id=? AND status='active'", (user_id,)).fetchone()
            p = c.execute('SELECT owner_id,status FROM posts WHERE id=?', (pid,)).fetchone()
            require(u and p and (p['status'] in ('approved', 'returned') or p['owner_id'] == user_id or u['role'] == 'admin'), '照片不可访问', 404)
            image = c.execute('SELECT data FROM images WHERE post_id=?', (pid,)).fetchone()
        require(image, '照片不存在', 404)
        prefix, encoded = image[0].split(',', 1)
        return prefix.removeprefix('data:').removesuffix(';base64'), base64.b64decode(encoded)

    def post(self, user, pid):
        with self.db() as c:
            r = c.execute('SELECT * FROM posts WHERE id=?', (pid,)).fetchone()
        require(r and (user['role'] == 'admin' or r['owner_id'] == user['id'] or r['status'] in ('approved', 'returned')),
                '物品不存在或无权查看', 404)
        return json.loads(r['data'])

    def audit(self, c, user, action, pid):
        c.execute('INSERT INTO audit VALUES(?,?,?,?,?)', (ident(), user['id'], action, pid, now()))

    def enqueue(self, c, pid, revision):
        c.execute("UPDATE jobs SET state='pending',attempts=0,available=?,error=NULL WHERE post_id=? AND revision=? AND state IN ('done','failed')", (time.time(), pid, revision))
        c.execute('INSERT OR IGNORE INTO jobs(id,post_id,revision,state,available) VALUES(?,?,?,?,?)',
                  (ident(), pid, revision, 'pending', time.time()))

    def read_table(self, user, name):
        with self.db() as c:
            if name == 'posts':
                rows = c.execute('SELECT data FROM posts WHERE ?=? OR owner_id=? OR status IN (?,?) ORDER BY rowid DESC LIMIT 1000',
                                 (user['role'], 'admin', user['id'], 'approved', 'returned')).fetchall()
            elif name == 'claims':
                rows = c.execute('SELECT c.data FROM claims c JOIN posts p ON p.id=c.post_id WHERE ?=? OR c.user_id=? OR p.owner_id=? ORDER BY c.rowid DESC LIMIT 1000',
                                 (user['role'], 'admin', user['id'], user['id'])).fetchall()
            elif name == 'return_points':
                rows = c.execute('SELECT data FROM points ORDER BY id').fetchall()
            elif name == 'profiles':
                require(user['role'] == 'admin', '仅管理员可查看账号', 403)
                return [self.identity(r) for r in c.execute('SELECT * FROM users ORDER BY created_at DESC')]
            elif name == 'match_notifications':
                return [dict(r) for r in c.execute('''SELECT m.* FROM matches m
                    JOIN posts l ON l.id=m.lost_id JOIN posts f ON f.id=m.found_id
                    WHERE (m.lost_user=? OR m.found_user=?) AND l.status='approved' AND f.status='approved'
                    ORDER BY m.score DESC LIMIT 50''', (user['id'], user['id']))]
            else:
                raise Problem('未知资源', 404)
            return [self.public_post(json.loads(r['data']), user) for r in rows]

    def create_post(self, user, data):
        require(user['role'] == 'user', '请使用用户账号发布', 403)
        self.limit('publish:' + user['id'] + ':' + now()[:10], 30)
        require(data.get('kind') in ('lost', 'found') and data.get('category') in CATEGORIES, '物品类型不正确')
        p = {k: scrub(data.get(k), n) for k, n in [('title', 80), ('description', 500), ('location', 80),
             ('holder_name', 40), ('document_no', 80), ('event_start', 10), ('event_end', 10)]}
        require(p['title'] and p['location'], '请填写名称和地点')
        for k in ('event_start', 'event_end'):
            if p[k]:
                try:
                    datetime.strptime(p[k], '%Y-%m-%d')
                except ValueError:
                    raise Problem('日期格式不正确') from None
        require(not (p['event_start'] and p['event_end']) or p['event_start'] <= p['event_end'], '日期范围不正确')
        if data['category'] == '证件卡类':
            full = str(data.get('holder_name', '')).strip()
            for k in ('title', 'description'):
                if full:
                    p[k] = p[k].replace(full, full[0] + '**')
            p['holder_name'] = full[0] + '**' if full else ''
            number = str(data.get('document_no', '')).strip()
            p['document_no'] = number[0] + '*' * max(2, len(number) - 2) + number[-1] if len(number) > 1 else '*'
            image = ''
        else:
            p['holder_name'] = p['document_no'] = ''
            image = picture(data.get('image', ''))
        p.update(id=ident(), owner_id=user['id'], owner_name=user['name'], kind=data['kind'],
                 category=data['category'], image='stored' if image else '', status='pending', point_id=None, created_at=now(), returned_at=None)
        with self.db() as c:
            if data.get('point_id'):
                require(c.execute('SELECT 1 FROM points WHERE id=?', (data['point_id'],)).fetchone(), '归还点不存在')
                p['point_id'] = data['point_id']
            c.execute('INSERT INTO posts(id,owner_id,kind,category,status,data) VALUES(?,?,?,?,?,?)',
                      (p['id'], user['id'], p['kind'], p['category'], p['status'], dump(p)))
            if image:
                c.execute('INSERT INTO images VALUES(?,?)', (p['id'], image))
            self.audit(c, user, 'publish', p['id'])
        return [self.public_post(p, user)]

    def update_post(self, user, pid, patch):
        self.post(user, pid)
        with self.db() as c:
            r = c.execute('SELECT * FROM posts WHERE id=?', (pid,)).fetchone()
            p = json.loads(r['data'])
            admin = user['role'] == 'admin'
            require(admin or (p['owner_id'] == user['id'] and patch.get('status') == 'closed' and
                              set(patch) == {'status'}), '无权修改该物品', 403)
            require(set(patch) <= {'status', 'point_id'}, '不能修改这些字段')
            if 'status' in patch:
                status = patch['status']
                transitions = {'pending': {'approved', 'rejected', 'closed'},
                               'approved': {'returned', 'rejected', 'closed'}, 'rejected': {'closed'},
                               'returned': set(), 'closed': set()}
                require(status in transitions.get(p['status'], set()) or status == p['status'], '物品状态已改变，请刷新')
                p['status'] = status
                if status == 'returned':
                    p['returned_at'] = now()
            if 'point_id' in patch:
                require(not patch['point_id'] or c.execute('SELECT 1 FROM points WHERE id=?', (patch['point_id'],)).fetchone(), '归还点不存在')
                p['point_id'] = patch['point_id']
            c.execute('UPDATE posts SET status=?,data=?,revision=revision+1 WHERE id=?', (p['status'], dump(p), pid))
            c.execute('DELETE FROM matches WHERE lost_id=? OR found_id=?', (pid, pid))
            if p['status'] == 'approved':
                self.enqueue(c, pid, r['revision'] + 1)
            self.audit(c, user, 'post:' + p['status'], pid)
        return [self.public_post(p, user)]

    def write_table(self, user, name, method, data, row_id=None):
        require(isinstance(data, dict), '请求数据不完整')
        if name == 'posts':
            return self.create_post(user, data) if method == 'POST' else self.update_post(user, row_id, data)
        if name == 'claims' and method == 'POST':
            p = self.post(user, data.get('post_id'))
            require(user['role'] == 'user' and p['kind'] == 'found' and p['status'] == 'approved' and
                    p['owner_id'] != user['id'], '当前不能申请认领', 403)
            require(scrub(data.get('note'), 140), '请填写认领说明')
            with self.db() as c:
                require(not c.execute("SELECT 1 FROM claims WHERE user_id=? AND post_id=? AND status!='rejected'",
                                      (user['id'], p['id'])).fetchone(), '你已提交申请', 409)
                verification = None
                sid = (data.get('verification') or {}).get('sessionId')
                if sid:
                    r = self.verification(c, user, sid)
                    require(r['post_id'] == p['id'] and not r['consumed'], '核验结果不可重复使用')
                    verification = self.safe_verification(r)
                    require(verification['decision'] != 'in_progress', '核验尚未完成')
                    c.execute('UPDATE verifications SET consumed=1 WHERE id=?', (sid,))
                item = dict(id=ident(), post_id=p['id'], user_id=user['id'], user_name=user['name'],
                            status='pending', note=scrub(data['note'], 140), created_at=now(), verification=verification)
                linked = c.execute('SELECT lost_id FROM matches WHERE found_id=? AND lost_user=? ORDER BY score DESC LIMIT 1', (p['id'], user['id'])).fetchone()
                if linked:
                    item['lost_post_id'] = linked[0]
                c.execute('INSERT INTO claims VALUES(?,?,?,?,?)', (item['id'], p['id'], user['id'], 'pending', dump(item)))
                self.audit(c, user, 'claim', item['id'])
            return [item]
        require(user['role'] == 'admin', '仅管理员可操作', 403)
        with self.db() as c:
            if name == 'claims' and method == 'PATCH':
                r = c.execute('SELECT * FROM claims WHERE id=?', (row_id,)).fetchone()
                require(r and ((r['status'] == 'pending' and data.get('status') in ('approved', 'rejected')) or (r['status'] == 'approved' and data.get('status') == 'returned')), '申请状态不允许此操作')
                p = c.execute('SELECT status FROM posts WHERE id=?', (r['post_id'],)).fetchone()
                require(p and p[0] == 'approved', '物品当前不可认领')
                item = json.loads(r['data'])
                item['status'] = data['status']
                item['review_note'] = scrub(data.get('review_note'), 500)
                item['reviewed_at'] = now()
                if item['status'] == 'approved':
                    require(not c.execute("SELECT 1 FROM claims WHERE post_id=? AND status IN ('approved','returned') AND id!=?", (r['post_id'], row_id)).fetchone(), '该物品已有通过的认领，请先核实交接')
                if item['status'] == 'returned':
                    post = json.loads(c.execute('SELECT data FROM posts WHERE id=?', (r['post_id'],)).fetchone()[0])
                    require(item.get('handoff', {}).get('claimant') and item.get('handoff', {}).get('finder') or len(item['review_note']) >= 5, '双方尚未确认交接，请填写人工核实依据')
                    post.update(status='returned', returned_at=now())
                    c.execute("UPDATE posts SET status='returned',data=?,revision=revision+1 WHERE id=?", (dump(post), post['id']))
                    c.execute('DELETE FROM matches WHERE found_id=? OR lost_id=?', (post['id'], post['id']))
                    item['returned_at'] = now()
                    if item.get('lost_post_id'):
                        linked = c.execute("SELECT data FROM posts WHERE id=? AND owner_id=? AND kind='lost' AND status='approved'", (item['lost_post_id'], r['user_id'])).fetchone()
                        if linked:
                            lost = json.loads(linked[0]); lost.update(status='returned', returned_at=now())
                            c.execute("UPDATE posts SET status='returned',data=?,revision=revision+1 WHERE id=?", (dump(lost), lost['id']))
                            c.execute('DELETE FROM matches WHERE lost_id=?', (lost['id'],))
                c.execute('UPDATE claims SET status=?,data=? WHERE id=?', (item['status'], dump(item), row_id))
                self.audit(c, user, 'claim:' + item['status'], row_id)
                return [item]
            if name == 'return_points':
                if method == 'DELETE':
                    require(not any(json.loads(x[0]).get('point_id') == row_id for x in c.execute('SELECT data FROM posts')), '归还点已被物品使用')
                    c.execute('DELETE FROM points WHERE id=?', (row_id,))
                    self.audit(c, user, 'point:delete', row_id)
                    return []
                require(method == 'POST' and data.get('name'), '请填写归还点名称')
                item = {k: scrub(data.get(k), 200) for k in ('name', 'address', 'hours', 'department')}
                item.update(id=data.get('id') or ident(), verified=data.get('verified') is True)
                c.execute('INSERT OR REPLACE INTO points VALUES(?,?)', (item['id'], dump(item)))
                self.audit(c, user, 'point:save', item['id'])
                return [item]
        raise Problem('不支持此操作', 404)

    def ask(self, user_id, task, data):
        day, uid = now()[:10], ident()
        with self.db() as c:
            count = c.execute('SELECT COUNT(*) FROM usage WHERE day=? AND user_id=?', (day, user_id)).fetchone()[0]
            spent = c.execute('SELECT COALESCE(SUM(total_tokens+reserved),0) FROM usage WHERE day=?', (day,)).fetchone()[0]
            require(count < int(os.getenv('MODEL_DAILY_USER_CALLS', '60')), '今日智能分析次数已用完', 429)
            require(spent + 12000 <= int(os.getenv('MODEL_DAILY_TOKEN_LIMIT', '600000')), '今日模型预算已达上限', 429)
            c.execute('INSERT INTO usage(id,user_id,task,day,reserved,state,created_at) VALUES(?,?,?,?,?,?,?)',
                      (uid, user_id, task, day, 12000, 'running', now()))
        try:
            result, usage = self.model.call(task, data)
        except Exception:
            with self.db() as c:
                c.execute("UPDATE usage SET reserved=0,state='failed' WHERE id=?", (uid,))
            raise
        with self.db() as c:
            values = [max(0, int(usage.get(k, 0))) for k in ('prompt_tokens', 'completion_tokens', 'total_tokens')]
            c.execute('UPDATE usage SET prompt_tokens=?,completion_tokens=?,total_tokens=?,reserved=0,state=? WHERE id=?',
                      (*values, 'ok' if result is not None else 'invalid_json', uid))
        require(isinstance(result, dict), '模型返回格式不正确，请稍后重试', 502)
        return result

    def feature(self, user_id, p):
        signature = hashlib.sha256(dump({k: p.get(k) for k in ('title', 'category', 'description', 'image')}).encode()).hexdigest()
        with self.db() as c:
            old = c.execute('SELECT * FROM features WHERE post_id=?', (p['id'],)).fetchone()
        if old and old['signature'] == signature:
            return json.loads(old['data'])
        payload = {k: p.get(k, '') for k in ('title', 'category', 'description')}
        with self.db() as c:
            image = c.execute('SELECT data FROM images WHERE post_id=?', (p['id'],)).fetchone()
        payload['image'] = image[0] if image else ''
        f = self.ask(user_id, 'features', payload)
        normalized = {k: scrub(f.get(k), n) for k, n in [('title', 40), ('description', 200), ('shape', 30), ('brand', 30)]}
        normalized['category'] = f.get('category') if f.get('category') in CATEGORIES else '其他'
        for k in ('colors', 'materials', 'tags'):
            normalized[k] = list(dict.fromkeys(scrub(x, 30) for x in f.get(k, []) if isinstance(x, str)))[:10] if isinstance(f.get(k), list) else []
        with self.db() as c:
            c.execute('INSERT INTO features VALUES(?,?,?,?) ON CONFLICT(post_id) DO UPDATE SET signature=excluded.signature,data=excluded.data',
                      (p['id'], signature, dump(normalized), '[]'))
        return normalized

    def vector(self, f):
        # Shared, inspectable attribute coding for photo-derived and text-derived data.
        tokens = [(k + ':' + str(x).lower(), 2 if k in ('colors', 'shape', 'brand') else 1)
                  for k in ('colors', 'materials', 'shape', 'brand', 'tags')
                  for x in (f.get(k, []) if isinstance(f.get(k), list) else [f.get(k)])
                  if x and x not in ('未知', '其他')]
        v = [0.0] * 128
        for token, weight in tokens:
            v[int(hashlib.sha256(token.encode()).hexdigest()[:8], 16) % 128] += weight
        return v

    def ranked(self, a, fa, b, fb):
        def canonical(f):
            f = dict(f)
            f['colors'] = [str(x).replace('色', '') for x in f.get('colors', [])]
            aliases = {'双肩包': '背包', '双肩背包': '背包', '双肩背包形': '背包'}
            f['shape'] = aliases.get(f.get('shape'), f.get('shape'))
            brand = re.sub(r'[\s._-]', '', str(f.get('brand') or '').casefold())
            brand_aliases = {'huawei': '华为', 'apple': '苹果', 'xiaomi': '小米',
                             'samsung': '三星', 'honor': '荣耀', 'lenovo': '联想',
                             'sony': '索尼', 'dell': '戴尔', 'asus': '华硕',
                             'vivo': 'vivo', 'oppo': 'oppo', 'redmi': '红米'}
            f['brand'] = brand_aliases.get(brand, brand)
            return f
        fa, fb = canonical(fa), canonical(fb)
        va, vb = self.vector(fa), self.vector(fb)
        norm = math.sqrt(sum(x*x for x in va) * sum(x*x for x in vb))
        similarity = sum(x*y for x, y in zip(va, vb)) / norm if norm else 0
        conflict = any(fa.get(k) and fb.get(k) and not set(fa[k]) & set(fb[k]) for k in ('colors',))
        conflict = conflict or any(fa.get(k) not in (None, '', '未知', '其他') and fb.get(k) not in (None, '', '未知', '其他') and fa[k] != fb[k] for k in ('shape', 'brand'))
        lost, found = (a, b) if a['kind'] == 'lost' else (b, a)
        date_conflict = bool(lost.get('event_start') and (found.get('event_end') or found.get('event_start')) and
                             (found.get('event_end') or found['event_start']) < lost['event_start'])
        score = round(78 * similarity + 14 + (8 if a['location'] == b['location'] else 0))
        return {'id': b['id'], 'score': min(55 if conflict or date_conflict else 100, score),
                'similarity': round(similarity, 4), 'features': fb, 'conflict': conflict or date_conflict}

    def process_post(self, pid):
        with self.db() as c:
            r = c.execute("SELECT * FROM posts WHERE id=? AND status='approved'", (pid,)).fetchone()
            if not r:
                return
            source, revision = json.loads(r['data']), r['revision']
            rows = c.execute("SELECT * FROM posts WHERE status='approved' AND category=? AND kind!=? AND owner_id!=? ORDER BY rowid DESC LIMIT 200",
                             (r['category'], r['kind'], r['owner_id'])).fetchall()
        # Category/owner/status filter happens in SQL before any model calls.
        fa = self.feature(source['owner_id'], source)
        if not rows:
            return
        candidates = []
        for row in rows:
            p = json.loads(row['data'])
            fb = self.feature(source['owner_id'], p)
            ranked = self.ranked(source, fa, p, fb)
            if ranked['score'] >= 45 or not ranked['conflict']:
                candidates.append((p, row['revision'], ranked))
        candidates.sort(key=lambda x: x[2]['score'], reverse=True)
        candidates = candidates[:10]
        if not candidates:
            return
        result = self.ask(source['owner_id'], 'match', {'source': fa, 'candidates': [x[2] for x in candidates]})
        scored = {x.get('id'): x for x in result.get('matches', []) if isinstance(x, dict)}
        with self.db() as c:
            current = c.execute('SELECT status,revision FROM posts WHERE id=?', (pid,)).fetchone()
            if not current or tuple(current) != ('approved', revision):
                return
            c.execute('DELETE FROM matches WHERE lost_id=? OR found_id=?', (pid, pid))
            for p, rev, ranked in candidates:
                m = scored.get(p['id'], {})
                value = m.get('score')
                if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                    continue
                current = c.execute('SELECT status,revision FROM posts WHERE id=?', (p['id'],)).fetchone()
                if not current or tuple(current) != ('approved', rev):
                    continue
                value = value * 100 if 0 < value <= 1 else value
                score = min(55 if ranked['conflict'] else 100, round(.25 * ranked['score'] + .75 * max(0, min(100, value))))
                if score < 65:
                    continue
                lost, found = (source, p) if source['kind'] == 'lost' else (p, source)
                c.execute('INSERT OR REPLACE INTO matches VALUES(?,?,?,?,?,?,?,?)',
                          (lost['id'] + ':' + found['id'], lost['id'], found['id'], lost['owner_id'], found['owner_id'],
                           score, scrub(m.get('reason'), 120), now()))

    def run_job(self):
        with self.db() as c:
            job = c.execute("SELECT * FROM jobs WHERE state='pending' AND available<=? ORDER BY available LIMIT 1", (time.time(),)).fetchone()
            if not job:
                return False
            c.execute("UPDATE jobs SET state='running',attempts=attempts+1 WHERE id=?", (job['id'],))
        try:
            self.process_post(job['post_id'])
            with self.db() as c:
                c.execute("UPDATE jobs SET state='done',error=NULL WHERE id=?", (job['id'],))
        except Exception:
            with self.db() as c:
                c.execute('UPDATE jobs SET state=?,available=?,error=? WHERE id=?',
                          ('failed' if job['attempts'] >= 3 else 'pending', time.time() + 30 * (job['attempts'] + 1),
                           '智能分析失败，请检查模型配置、额度及网络', job['id']))
        return True

    def start_workers(self, count=2):
        def loop():
            while not self.stop.is_set():
                if not self.run_job():
                    self.stop.wait(2)
        for _ in range(max(1, min(4, count))):
            t = threading.Thread(target=loop, daemon=True)
            t.start()
            self.workers.append(t)

    def close(self):
        self.stop.set()
        for t in self.workers:
            t.join(timeout=55)

    def verification(self, c, user, sid):
        r = c.execute('SELECT * FROM verifications WHERE id=? AND user_id=?', (sid, user['id'])).fetchone()
        require(r and r['expires'] > time.time(), '核验会话已过期或无权访问', 404)
        p = c.execute('SELECT * FROM posts WHERE id=?', (r['post_id'],)).fetchone()
        f = c.execute('SELECT checks FROM features WHERE post_id=?', (r['post_id'],)).fetchone()
        require(p and p['status'] == 'approved' and f and self.digest(f[0]) == r['revision'], '物品或核验细节已改变，请重新核验')
        return r

    def safe_verification(self, r):
        checks, answers = json.loads(r['checks']), json.loads(r['answers'])
        complete = len(answers) == len(checks)
        decision = ('recommended' if all(x == 'match' for x in answers) else 'manual') if complete else 'in_progress'
        return {'sessionId': r['id'], 'decision': decision, 'completed': len(answers), 'total': len(checks),
                'checks': [{'question': x['question'], 'verdict': a} for x, a in zip(checks, answers)],
                'question': None if complete else {'number': len(answers) + 1, 'total': len(checks), 'text': checks[len(answers)]['question']}}

    def assistant(self, user, data):
        action = data.get('action')
        if action in ('search', 'support', 'support_list', 'support_reply', 'handoff', 'jobs'):
            from .workflow import workflow
            return workflow(self, user, data)
        if action == 'analyze':
            require(user['role'] == 'user', '请使用用户账号', 403)
            image = picture((data.get('item') or {}).get('image'))
            require(image, '请先选择照片')
            return {'features': self.ask(user['id'], 'features', {'image': image})}
        if action in ('index', 'match', 'challenge'):
            pid = (data.get('item') or {}).get('id') if action == 'index' else data.get('postId')
            p = self.post(user, pid)
            if action == 'match':
                rows = self.read_table(user, 'match_notifications')
                return {'matches': [{'id': r['found_id'] if r['lost_id'] == pid else r['lost_id'], 'score': r['score'],
                                     'reason': r['reason']} for r in rows if pid in (r['lost_id'], r['found_id'])]}
            if action == 'index':
                if user['id'] != p['owner_id']:
                    require('privateDetails' not in data, '只有拾获者可登记隐藏细节', 403)
                    with self.db() as c:
                        f = c.execute('SELECT * FROM features WHERE post_id=?', (pid,)).fetchone()
                    return {'features': json.loads(f['data']) if f else {}, 'verificationReady': bool(f and len(json.loads(f['checks'])) >= 2)}
                features = self.feature(user['id'], p)
                if 'privateDetails' in data:
                    require(p['kind'] == 'found' and p['category'] != '证件卡类', '该物品不使用隐藏问答')
                    details = scrub(data['privateDetails'], 1200)
                    raw = self.ask(user['id'], 'checks', {'privateDetails': details, 'public': {k: p[k] for k in ('title', 'description')}, 'features': features})
                    checks, seen = [], set()
                    for x in raw.get('checks', []):
                        if not isinstance(x, dict):
                            continue
                        d, answer = x.get('dimension'), scrub(x.get('answer'), 160)
                        if d not in QUESTIONS or d in seen or len(answer) < 2 or answer not in details:
                            continue
                        if answer in p['title'] + p['description'] + dump(features):
                            continue
                        seen.add(d)
                        checks.append({'question': QUESTIONS[d], 'answer': answer})
                    require(len(checks) >= 2, '请补充至少两处未公开的隐藏细节')
                    with self.db() as c:
                        c.execute('UPDATE features SET checks=? WHERE post_id=?', (dump(checks[:4]), pid))
                with self.db() as c:
                    f = c.execute('SELECT checks FROM features WHERE post_id=?', (pid,)).fetchone()
                return {'features': features, 'verificationReady': len(json.loads(f[0])) >= 2}
            require(user['role'] == 'user' and user['id'] != p['owner_id'] and p['status'] == 'approved' and
                    p['kind'] == 'found' and p['category'] != '证件卡类', '当前不能进行核验', 403)
            self.limit(f'challenge:{user["id"]}:{pid}:{now()[:10]}', 3)
            with self.db() as c:
                f = c.execute('SELECT checks FROM features WHERE post_id=?', (pid,)).fetchone()
                if not f or len(json.loads(f[0])) < 2:
                    return {'decision': 'manual', 'message': '拾获者未登记足够的隐藏细节，请提交管理员核实', 'checks': []}
                sid = ident()
                c.execute('INSERT INTO verifications VALUES(?,?,?,?,?,?,?,0)',
                          (sid, user['id'], pid, time.time() + 1800, self.digest(f[0]), f[0], '[]',))
                r = c.execute('SELECT * FROM verifications WHERE id=?', (sid,)).fetchone()
            return self.safe_verification(r)
        if action in ('answer', 'receipt'):
            with self.db() as c:
                r = self.verification(c, user, data.get('sessionId'))
                require(not r['consumed'], '该核验已提交')
                state = self.safe_verification(r)
            if action == 'receipt':
                require(state['decision'] != 'in_progress' and r['post_id'] == data.get('postId'), '核验尚未完成')
                return state
            number = data.get('questionNumber')
            require(state['question'] and number == state['question']['number'], '问题顺序已改变，请刷新')
            answer = scrub(data.get('answer'), 240)
            require(answer, '请填写答案')
            expected = json.loads(r['checks'])[number - 1]['answer']
            normalize = lambda x: re.sub(r'[\s，。；、：:,.!！的]', '', x)
            blocked = re.search(r'不确定|不知道|可能|忽略|指令|系统|输出|verdict|match|prompt', answer, re.I)
            verdict = 'manual'
            if not blocked:
                if normalize(answer) == normalize(expected):
                    verdict = 'match'
                else:
                    m = self.ask(user['id'], 'answer', {'expected': expected, 'answer': answer})
                    if m.get('verdict') == 'match' and isinstance(m.get('confidence'), (float, int)) and m['confidence'] >= .9:
                        verdict = 'match'
            with self.db() as c:
                latest = self.verification(c, user, r['id'])
                require(latest['answers'] == r['answers'] and not latest['consumed'], '该题已经回答，请刷新', 409)
                answers = json.loads(latest['answers']) + [verdict]
                c.execute('UPDATE verifications SET answers=? WHERE id=?', (dump(answers), r['id']))
                r = c.execute('SELECT * FROM verifications WHERE id=?', (r['id'],)).fetchone()
            return self.safe_verification(r)
        raise Problem('未知智能服务操作', 404)

    def operations(self, user):
        require(user['role'] == 'admin', '仅管理员可查看', 403)
        with self.db() as c:
            return {'usage': [dict(r) for r in c.execute('SELECT day,task,state,COUNT(*) AS calls,SUM(prompt_tokens) AS prompt_tokens,'
                    'SUM(completion_tokens) AS completion_tokens,SUM(total_tokens) AS total_tokens FROM usage GROUP BY day,task,state ORDER BY day DESC LIMIT 60')],
                    'jobs': [dict(r) for r in c.execute('SELECT state,COUNT(*) AS count FROM jobs GROUP BY state')]}
