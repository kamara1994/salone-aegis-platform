"""Administrative recovery of interrupted live jobs, after inspecting the real target."""
import argparse
import json
from services.common.store import Store, now
from services.common.config import Settings
from services.evidence.service import append

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('job_id')
    parser.add_argument('--actor', required=True)
    parser.add_argument('--decision', choices=['retry', 'failed'], required=True)
    parser.add_argument('--reason', required=True)
    parser.add_argument('--target-inspected', action='store_true', required=True)
    args = parser.parse_args()
    with Store(Settings().database_url).transaction() as tx:
        row = tx.execute('SELECT data FROM jobs WHERE id=?', (args.job_id,)).fetchone()
        if not row:
            raise SystemExit('Job not found')
        job = json.loads(row['data'])
        if job['state'] != 'needs_reconciliation':
            raise SystemExit('Only interrupted live jobs may be reconciled here')
        job['state'] = 'queued' if args.decision == 'retry' else 'failed'
        job['updated_at'] = now()
        tx.execute('UPDATE jobs SET data=? WHERE id=?', (json.dumps(job), job['id']))
        append(tx, job['client_id'], job['payload'].get('ticket_id'), 'job.reconciled',
               {'job_id': job['id'], 'decision': args.decision, 'reason': args.reason}, args.actor)
        print('Reconciliation recorded')
