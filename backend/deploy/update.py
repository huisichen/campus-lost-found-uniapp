"""Apply a verified release archive on the existing single-server deployment.
Run as root; preserves .env and uploads, backs up SQLite consistently.
"""
import argparse
import json
import os
import shutil
import sqlite3
import subprocess
import tarfile
import time
import urllib.request
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('archive')
p.add_argument('--root', default='/opt/campus')
p.add_argument('--database', default='/var/lib/campus/campus.sqlite3')
a = p.parse_args()
root = Path(a.root).resolve()
stamp = time.strftime('%Y%m%d-%H%M%S')
backup = root.parent / ('campus-backup-' + stamp)
backup.mkdir(mode=0o700)
stage = backup / 'incoming'
stage.mkdir()
with tarfile.open(a.archive) as package:
    for member in package.getmembers():
        parts = Path(member.name).parts
        if (not parts or parts[0] not in ('backend', 'docs') or
                any(x in ('..', '.env', '__pycache__') for x in parts) or
                member.issym() or member.islnk()):
            raise RuntimeError('Unexpected archive entry')
    package.extractall(stage, filter='data')
if not (stage / 'backend/core.py').is_file() or not (stage / 'docs/index.html').is_file():
    raise RuntimeError('Release is incomplete')
# The private configuration never enters the public release.
shutil.copy2(root / 'backend/.env', stage / 'backend/.env')
os.chmod(stage / 'backend/.env', 0o600)
if (root / 'docs/downloads').is_dir():
    shutil.copytree(root / 'docs/downloads', stage / 'docs/downloads', dirs_exist_ok=True)
subprocess.run(['chown', '-R', 'campus:campus', str(stage)], check=True)
subprocess.run(['systemctl', 'stop', 'campus'], check=True)
moved = []
try:
    with sqlite3.connect(a.database) as source:
        with sqlite3.connect(backup / 'campus.sqlite3') as destination:
            source.backup(destination)
    for name in ('backend', 'docs'):
        os.rename(root / name, backup / name)
        moved.append(name)
        os.rename(stage / name, root / name)
    subprocess.run(['systemctl', 'start', 'campus'], check=True)
    for attempt in range(20):
        try:
            with urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3) as response:
                health = json.load(response)
            if health.get('version') == '2026-11-28-workflow':
                break
        except Exception:
            pass
        time.sleep(1)
    else:
        raise RuntimeError('Updated health check failed')
except Exception:
    subprocess.run(['systemctl', 'stop', 'campus'], check=False)
    for name in reversed(moved):
        if (root / name).exists():
            os.rename(root / name, backup / ('failed-' + name))
        os.rename(backup / name, root / name)
    subprocess.run(['systemctl', 'start', 'campus'], check=False)
    raise
print(json.dumps({'deployed': True, 'backup': str(backup), 'health': health}))
