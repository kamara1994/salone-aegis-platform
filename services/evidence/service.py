import hashlib
import json
from services.common.store import uid, now


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def append(tx, client_id, ticket_id, kind, payload, actor='system'):
    row = tx.execute('SELECT hash FROM evidence WHERE client_id=? ORDER BY seq DESC LIMIT 1',
                     (client_id,)).fetchone()
    previous = row['hash'] if row else '0' * 64
    record = {'id': uid(), 'client_id': client_id, 'ticket_id': ticket_id or '',
              'kind': kind, 'payload': payload, 'actor': actor, 'created_at': now()}
    digest = hashlib.sha256((previous + canonical(record)).encode()).hexdigest()
    tx.execute('INSERT INTO evidence(id,client_id,ticket_id,data,previous_hash,hash) VALUES(?,?,?,?,?,?)',
               (record['id'], client_id, ticket_id or '', canonical(record), previous, digest))
    return {**record, 'previous_hash': previous, 'hash': digest}


def records(tx, client_id, ticket_id=None):
    sql, args = 'SELECT * FROM evidence WHERE client_id=?', [client_id]
    if ticket_id is not None:
        sql += ' AND ticket_id=?'
        args.append(ticket_id)
    return [{**json.loads(r['data']), 'previous_hash': r['previous_hash'], 'hash': r['hash']}
            for r in tx.execute(sql + ' ORDER BY seq', args).fetchall()]


def verify_chain(items):
    previous = '0' * 64
    for item in items:
        record = {k: v for k, v in item.items() if k not in ('hash', 'previous_hash')}
        digest = hashlib.sha256((previous + canonical(record)).encode()).hexdigest()
        if item['previous_hash'] != previous or item['hash'] != digest:
            return False
        previous = digest
    return True


def scorecard(tx, client_id):
    debriefs = tx.list('debrief', client_id)
    scored = [d for d in debriefs if d['state'] == 'completed']
    return {'client_id': client_id, 'completed_debriefs': len(scored),
            'average_score': round(sum(d['overall_score'] for d in scored) / len(scored), 2) if scored else None,
            'skills': tx.list('skill', client_id),
            'controls': {'identity_failures': sum(e['kind'] == 'identity.failed' for e in records(tx, client_id))}}
