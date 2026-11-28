"""Conversation search, private contact relay, and handoff acknowledgement."""
import json
import re
import time
from .core import Problem, require, scrub, dump, now, ident, CATEGORIES


def workflow(s, user, data):
    action = data['action']
    with s.db() as c:
        c.execute('CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,user_id TEXT,data TEXT)')
        c.execute('CREATE TABLE IF NOT EXISTS support(id TEXT PRIMARY KEY,user_id TEXT,post_id TEXT,data TEXT)')
    if action == 'jobs':
        with s.db() as c:
            return {'jobs': [dict(r) for r in c.execute('SELECT j.post_id,j.state,j.error,j.attempts FROM jobs j JOIN posts p ON p.id=j.post_id WHERE p.owner_id=? AND j.rowid=(SELECT MAX(x.rowid) FROM jobs x WHERE x.post_id=j.post_id) ORDER BY j.rowid DESC LIMIT 30', (user['id'],))]}
    if action == 'handoff':
        with s.db() as c:
            r = c.execute('SELECT * FROM claims WHERE id=?', (data.get('claimId'),)).fetchone()
            require(r and r['status'] == 'approved', '认领尚未通过或交接已完成')
            p = c.execute('SELECT owner_id FROM posts WHERE id=?', (r['post_id'],)).fetchone()
            require(user['id'] in (r['user_id'], p['owner_id']), '无权确认交接', 403)
            item = json.loads(r['data'])
            role = 'claimant' if user['id'] == r['user_id'] else 'finder'
            item.setdefault('handoff', {})[role] = now()
            c.execute('UPDATE claims SET data=? WHERE id=?', (dump(item), r['id']))
            s.audit(c, user, 'handoff:' + role, r['id'])
        return {'claim': item}
    if action == 'support_list':
        with s.db() as c:
            rows = c.execute('SELECT s.* FROM support s LEFT JOIN posts p ON p.id=s.post_id WHERE ?=? OR s.user_id=? OR p.owner_id=? ORDER BY s.rowid DESC LIMIT 100', (user['role'], 'admin', user['id'], user['id'])).fetchall()
        return {'tickets': [json.loads(r['data']) for r in rows]}
    if action == 'support_reply':
        with s.db() as c:
            r = c.execute('SELECT * FROM support WHERE id=?', (data.get('ticketId'),)).fetchone()
            require(r, '会话不存在', 404)
            p = c.execute('SELECT owner_id FROM posts WHERE id=?', (r['post_id'],)).fetchone()
            require(user['role'] == 'admin' or user['id'] == r['user_id'] or p and user['id'] == p['owner_id'], '无权查看会话', 403)
            text = scrub(data.get('message'), 500)
            require(text, '请填写消息')
            item = json.loads(r['data'])
            require(len(item['messages']) < 100, '会话消息已达上限，请转人工处理')
            item['messages'].append({'sender': user['id'], 'role': user['role'], 'name': user['name'], 'text': text, 'at': now()})
            if user['role'] == 'admin':
                item['status'] = 'replied'
            c.execute('UPDATE support SET data=? WHERE id=?', (dump(item), r['id']))
        return {'ticket': item}
    if action == 'support':
        text = scrub(data.get('message'), 500)
        require(text, '请填写需要协助或联系的内容')
        pid = data.get('postId') or ''
        if pid:
            s.post(user, pid)
        s.limit('support:' + user['id'] + ':' + now()[:10], 20)
        item = {'id': ident(), 'postId': pid, 'userId': user['id'], 'userName': user['name'], 'status': 'pending', 'createdAt': now(), 'messages': [{'sender': user['id'], 'role': user['role'], 'name': user['name'], 'text': text, 'at': now()}]}
        with s.db() as c:
            c.execute('INSERT INTO support VALUES(?,?,?,?)', (item['id'], user['id'], pid, dump(item)))
        return {'ticket': item}
    require(action == 'search' and user['role'] == 'user', '请使用用户账号', 403)
    sid = data.get('sessionId')
    if not sid:
        s.limit('search-start:' + user['id'] + ':' + now()[:10], 30)
    with s.db() as c:
        row = c.execute('SELECT data FROM conversations WHERE id=? AND user_id=?', (sid, user['id'])).fetchone() if sid else None
    require(not sid or row, '对话不存在或无权访问', 404)
    state = json.loads(row[0]) if row else {'id': ident(), 'kind': '', 'filters': {}, 'history': [], 'version': 0}
    old_version = state['version']
    if data.get('kind') in ('lost', 'found'):
        require(not state['kind'] or state['kind'] == data['kind'], '切换类型请开始新对话')
        state['kind'] = data['kind']
    require(state['kind'], '请先选择丢失物品或拾取物品')
    filters = state['filters']
    if data.get('category') in CATEGORIES:
        filters['category'] = data['category']
    message = scrub(data.get('message'), 500)
    require(len(state['history']) < 30, '本轮对话已达上限，请开始新对话')
    if message:
        parsed = s.ask(user['id'], 'search', {'message': message, 'currentFilters': filters})
        for key in ('category', 'color', 'brand', 'keyword', 'location'):
            if key not in parsed:
                continue
            value = parsed.get(key)
            if value is None:
                filters.pop(key, None)
            elif isinstance(value, str) and value.strip() and (key != 'category' or value in CATEGORIES):
                filters[key] = scrub(value, 80)
        state['history'].append({'role': 'user', 'text': message})
    candidates = []
    if filters.get('category'):
        with s.db() as c:
            rows = c.execute("SELECT p.data,f.data AS features FROM posts p LEFT JOIN features f ON f.post_id=p.id WHERE p.status='approved' AND p.kind!=? AND p.category=? AND p.owner_id!=? ORDER BY p.rowid DESC LIMIT 500", (state['kind'], filters['category'], user['id'])).fetchall()
        for row in rows:
            p = json.loads(row['data'])
            text = dump({k: p.get(k) for k in ('title', 'description', 'location')}) + (row['features'] or '')
            def normalize(v):
                return re.sub(r'[\s色]', '', v.lower()).replace('双肩包', '背包')
            if all(normalize(str(v)) in normalize(text) for k, v in filters.items() if k != 'category' and v):
                candidates.append(s.public_post(p, user))
    if not filters.get('category'):
        reply = '请先选择物品类别，再告诉我颜色、品牌或物品特征。我会逐轮筛选当前已审核的信息。'
    elif candidates:
        reply = f'当前筛选到 {len(candidates)} 条线索。可以继续补充或更正颜色、品牌、地点，或点开详情核验。'
    else:
        reply = '当前没有符合这些条件的已审核信息。可以更正或清除筛选条件，也可以发布信息或转人工。'
    state['history'].append({'role': 'assistant', 'text': reply})
    state['version'] += 1
    with s.db() as c:
        if sid:
            current = c.execute('SELECT data FROM conversations WHERE id=? AND user_id=?', (sid, user['id'])).fetchone()
            require(current and json.loads(current[0])['version'] == old_version, '上一轮已更新，请重新开始对话', 409)
        c.execute('INSERT OR REPLACE INTO conversations VALUES(?,?,?)', (state['id'], user['id'], dump(state)))
    return {'sessionId': state['id'], 'filters': filters, 'messages': state['history'], 'reply': reply, 'items': candidates[:20], 'total': len(candidates)}
