"""Disposable PostgreSQL integration test; requires a dedicated empty test database."""
import os
import subprocess
import sys
from uuid import uuid4
from services.common.store import Store
from services.common.security import Principal
from services.lab.domain import Topology
from services.evidence.service import records, verify_chain


def main():
    url = os.environ['DATABASE_URL']
    subprocess.run([sys.executable, '-m', 'alembic', '-c', 'infra/alembic.ini', 'upgrade', 'head'], check=True)
    subprocess.run([sys.executable, '-m', 'alembic', '-c', 'infra/alembic.ini', 'current'], check=True)
    store = Store(url)
    cid = str(uuid4())
    actor = Principal(str(uuid4()), ['admin'], [cid])
    engine = Topology(store)
    payload = {'kind': 'sites', 'data': {'name': 'Integration site'}}
    job = engine.execute(actor, cid, 'create-site', 0, 'create', payload)
    assert engine.execute(actor, cid, 'create-site', 0, 'create', payload) == job
    with store.transaction() as tx:
        assert verify_chain(records(tx, cid))
        assert len(tx.events(0, [cid])[0]) == 1
    try:
        with store.transaction() as tx:
            tx.execute('UPDATE evidence SET hash=? WHERE client_id=?', ('tampered', cid))
    except Exception as exc:
        import psycopg
        if not isinstance(exc, psycopg.errors.RaiseException):
            raise
    else:
        raise AssertionError('PostgreSQL evidence trigger allowed an update')
    subprocess.run([sys.executable, '-m', 'pytest', '-q'], check=True)
    subprocess.run([sys.executable, '-m', 'ruff', 'check', 'services', 'infra', 'scripts', 'tests'], check=True)
    print('PostgreSQL migrations, lab transaction, evidence trigger, pytest, and Ruff passed')


if __name__ == '__main__':
    main()
