"""Consistent SQLite online backup, including data still in WAL."""
import argparse
import sqlite3
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('database')
p.add_argument('destination')
args = p.parse_args()
if Path(args.destination).exists():
    p.error('Destination already exists; choose a new backup name')
with sqlite3.connect(f'file:{Path(args.database).resolve().as_posix()}?mode=ro', uri=True) as source:
    with sqlite3.connect(args.destination) as target:
        source.backup(target)
print('Backup completed')
