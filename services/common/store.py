"""DB-API persistence. PostgreSQL in deployment; SQLite for offline domain tests.
Writes and event allocation commit together. A transaction-wide advisory lock orders
commands across workers; replace with aggregate locks when scaling beyond one lab.
"""
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from uuid import uuid4
from .errors import DomainError


def now():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def uid():
    return str(uuid4())


DDL = '''
CREATE TABLE IF NOT EXISTS records (
 kind TEXT NOT NULL, id TEXT NOT NULL, client_id TEXT NOT NULL,
 data TEXT NOT NULL, PRIMARY KEY(kind,id));
CREATE INDEX IF NOT EXISTS records_tenant ON records(kind,client_id,id);
CREATE TABLE IF NOT EXISTS events (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, client_id TEXT NOT NULL, data TEXT NOT NULL,
 published INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS jobs (
 id TEXT PRIMARY KEY, client_id TEXT NOT NULL, actor TEXT NOT NULL,
 idem TEXT NOT NULL, digest TEXT NOT NULL, data TEXT NOT NULL,
 UNIQUE(actor,client_id,idem));
CREATE TABLE IF NOT EXISTS evidence (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
 client_id TEXT NOT NULL, ticket_id TEXT NOT NULL, data TEXT NOT NULL,
 previous_hash TEXT NOT NULL, hash TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS evidence_ticket ON evidence(client_id,ticket_id,seq);
CREATE TABLE IF NOT EXISTS consumed_tokens (nonce TEXT PRIMARY KEY, used_at TEXT NOT NULL);
'''


class Store:
    def __init__(self, url):
        self.url = url
        self.postgres = url.startswith('postgres')

    def connect(self):
        if self.postgres:
            import psycopg
            from psycopg.rows import dict_row
            return psycopg.connect(self.url, row_factory=dict_row)
        conn = sqlite3.connect(self.url.removeprefix('sqlite:///'), timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA journal_mode=WAL')
        return conn

    def initialize(self):
        with self.transaction() as tx:
            ddl = DDL.replace('INTEGER PRIMARY KEY AUTOINCREMENT', 'BIGSERIAL PRIMARY KEY') if self.postgres else DDL
            for statement in ddl.split(';'):
                if statement.strip():
                    tx.execute(statement)
            if not self.postgres:
                tx.execute("CREATE TRIGGER IF NOT EXISTS evidence_no_update BEFORE UPDATE ON evidence BEGIN SELECT RAISE(ABORT, 'Evidence is append-only'); END")
                tx.execute("CREATE TRIGGER IF NOT EXISTS evidence_no_delete BEFORE DELETE ON evidence BEGIN SELECT RAISE(ABORT, 'Evidence is append-only'); END")

    @contextmanager
    def transaction(self):
        conn = self.connect()
        try:
            if self.postgres:
                conn.execute('SELECT pg_advisory_xact_lock(724613)')
            else:
                conn.execute('BEGIN IMMEDIATE')
            yield Transaction(conn, self.postgres)
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
        finally:
            conn.close()


class Transaction:
    def __init__(self, conn, postgres):
        self.conn, self.postgres = conn, postgres

    def execute(self, sql, args=()):
        return self.conn.execute(sql.replace('?', '%s') if self.postgres else sql, args)

    def get(self, kind, identifier, client_id=None):
        row = self.execute('SELECT data FROM records WHERE kind=? AND id=?', (kind, identifier)).fetchone()
        if not row:
            raise DomainError('not_found', 'Record not found', 404)
        value = json.loads(row['data'])
        if client_id is not None and value['client_id'] != client_id:
            raise DomainError('not_found', 'Record not found', 404)
        return value

    def put(self, kind, value):
        existing = self.execute('SELECT client_id FROM records WHERE kind=? AND id=?', (kind, value['id'])).fetchone()
        if existing and existing['client_id'] != value['client_id']:
            raise DomainError('tenant_immutable', 'Existing record tenant cannot be changed', 409)
        self.execute('INSERT INTO records(kind,id,client_id,data) VALUES(?,?,?,?) '
                     'ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data',
                     (kind, value['id'], value['client_id'], json.dumps(value)))
        return value

    def list(self, kind, client_id=None):
        sql, args = 'SELECT data FROM records WHERE kind=?', [kind]
        if client_id:
            sql += ' AND client_id=?'
            args.append(client_id)
        return [json.loads(r['data']) for r in self.execute(sql + ' ORDER BY id', args).fetchall()]

    def event(self, kind, value, subject_kind, data):
        envelope = {'type': kind, 'occurred_at': now(), 'client_id': value['client_id'],
                    'subject': {'kind': subject_kind, 'id': value['id']}, 'data': data}
        row = self.execute('INSERT INTO events(client_id,data) VALUES(?,?) RETURNING seq',
                           (value['client_id'], json.dumps(envelope))).fetchone()
        envelope['seq'] = row['seq']
        self.execute('UPDATE events SET data=? WHERE seq=?', (json.dumps(envelope), row['seq']))
        return envelope

    def events(self, after, clients, topics=(), limit=200):
        # Scan ordered pages, including hidden events, to avoid leaking tenant events
        # or starving subscribers behind another tenant's busy stream.
        rows = self.execute('SELECT seq,client_id,data FROM events WHERE seq>? ORDER BY seq LIMIT ?',
                            (after, limit)).fetchall()
        visible = [json.loads(r['data']) for r in rows if r['client_id'] in clients]
        if topics and '*' not in topics:
            visible = [e for e in visible if e['type'] in topics or e['type'].split('.')[0] in topics]
        return visible, rows[-1]['seq'] if rows else after
