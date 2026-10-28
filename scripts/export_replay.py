"""Export an allowlisted, disconnected recruiter replay; excludes raw chat and logs."""
import argparse
import json
from pathlib import Path
from services.common.config import Settings
from services.common.store import Store
from services.evidence.service import records

SAFE = {'ticket.status_changed', 'check.result', 'debrief.deferred', 'debrief.resumed'}

def sanitize(items):
    output = []
    for e in items:
        if e['kind'] not in SAFE:
            continue
        payload = e['payload']
        data = {k: payload[k] for k in ('from', 'to', 'passed') if k in payload}
        output.append({'kind': e['kind'], 'created_at': e['created_at'], 'data': data})
    return {'format_version': 1, 'sanitized': True, 'timeline': output}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('client_id')
    parser.add_argument('ticket_id')
    parser.add_argument('output')
    args = parser.parse_args()
    with Store(Settings().database_url).transaction() as tx:
        tx.get('ticket', args.ticket_id, args.client_id)
        result = sanitize(records(tx, args.client_id, args.ticket_id))
    Path(args.output).write_text(json.dumps(result, indent=2))
