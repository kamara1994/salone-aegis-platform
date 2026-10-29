import hashlib
import json
import os
from datetime import datetime, timedelta, timezone
from services.common.errors import DomainError
from services.common.store import uid, now
from services.evidence.service import append, canonical
from services.adapters.base import guard
from services.ai import service as ai

TRANSITIONS = {'new': {'acknowledged'}, 'acknowledged': {'investigating'},
               'investigating': {'pending_verification'}, 'pending_verification': {'verified', 'investigating'},
               'verified': {'client_explanation'}, 'client_explanation': {'debrief'}, 'debrief': {'closed'}, 'closed': set()}


def transition(tx, ticket, target):
    current = ticket['status']
    if target not in TRANSITIONS[current]:
        raise DomainError('invalid_transition', f'Cannot move from {current} to {target}', 409)
    ticket['status'] = target
    ticket['updated_at'] = now()
    tx.put('ticket', ticket)
    tx.event('ticket.status_changed', ticket, 'ticket', {'from': current, 'to': target})
    append(tx, ticket['client_id'], ticket['id'], 'ticket.status_changed', {'from': current, 'to': target})


class Orchestrator:
    def __init__(self, store, registry, provider, tokens):
        self.store, self.registry, self.provider, self.tokens = store, registry, provider, tokens

    def patch_ticket(self, tx, ticket, changes, actor):
        if ticket['status'] == 'closed':
            raise DomainError('invalid_state', 'Closed tickets cannot be edited', 409)
        if changes.get('status'):
            # Verification, client acceptance and debrief completion are server-owned gates.
            if changes['status'] not in ('acknowledged', 'investigating', 'client_explanation'):
                raise DomainError('protected_transition', 'Use the workflow endpoint for this transition', 409)
            if ticket['status'] == 'pending_verification':
                raise DomainError('protected_transition', 'Verification results are controlled by the worker', 409)
            transition(tx, ticket, changes['status'])
        for field in ('assignee', 'work_notes'):
            if field in changes:
                ticket[field] = changes[field]
        tx.put('ticket', ticket)
        tx.event('ticket.updated', ticket, 'ticket', changes)
        append(tx, ticket['client_id'], ticket['id'], 'ticket.updated', changes, actor)
        return ticket

    def submit(self, tx, kind, client_id, actor, payload, idem):
        if not idem or len(idem) > 128:
            raise DomainError('idempotency_required', 'Idempotency-Key (1..128 characters) is required')
        digest = hashlib.sha256(canonical({'kind': kind, 'payload': payload}).encode()).hexdigest()
        old = tx.execute('SELECT data,digest FROM jobs WHERE actor=? AND client_id=? AND idem=?',
                         (actor, client_id, idem)).fetchone()
        if old:
            if old['digest'] != digest:
                raise DomainError('idempotency_conflict', 'Key was already used for a different operation', 409)
            return json.loads(old['data'])
        lab_kinds = {'baseline.restore', 'scenario.launch', 'scenario.abort', 'node.action', 'ticket.resolve'}
        maintenance = tx.list('maintenance', client_id)
        if kind in lab_kinds and kind != 'baseline.restore' and any(m['active'] for m in maintenance):
            raise DomainError('maintenance_active', 'Tenant baseline restoration is in progress or requires recovery', 409)
        if kind == 'baseline.restore':
            pending = [json.loads(row['data']) for row in tx.execute('SELECT data FROM jobs WHERE client_id=?', (client_id,)).fetchall()]
            if any(j['state'] in ('queued', 'running', 'needs_reconciliation') and j['kind'] in lab_kinds for j in pending):
                raise DomainError('target_busy', 'Drain or reconcile pending lab jobs before restoring the baseline', 409)
            self.tokens.consume(tx, payload['confirmation_token'], actor, client_id, 'baseline.restore')
            tx.put('maintenance', {'id': client_id, 'client_id': client_id, 'active': True})
        if kind == 'scenario.launch':
            pack = tx.get('scenario', payload['scenario_id'])
            targets = self.targets(tx, client_id, pack)
            for node in targets.values():
                guard(tx.get('node', node, client_id))
            for run in tx.list('run', client_id):
                if run['state'] not in ('aborted', 'resolved', 'failed') and set(run['targets'].values()) & set(targets.values()):
                    raise DomainError('target_busy', 'A scenario already owns one of these targets', 409)
            run = {'id': uid(), 'client_id': client_id, 'scenario_id': pack['id'], 'definition': pack,
                   'state': 'queued', 'targets': targets, 'hints_used': 0, 'injected_at': None,
                   'resolved_at': None, 'operator_id': actor}
            tx.put('run', run)
            payload = {**payload, 'run_id': run['id']}
        if kind == 'ticket.resolve':
            ticket = tx.get('ticket', payload['ticket_id'], client_id)
            run = tx.get('run', ticket['scenario_run_id'], client_id)
            if run['state'] != 'running':
                raise DomainError('invalid_state', 'Only a running scenario can be verified', 409)
            transition(tx, ticket, 'pending_verification')
        if kind == 'scenario.abort':
            run = tx.get('run', payload['run_id'], client_id)
            if run['state'] not in ('running', 'failed', 'cleanup_failed'):
                raise DomainError('invalid_state', 'Run cannot be aborted in this state', 409)
            run['state'] = 'aborting'
            tx.put('run', run)
        if kind == 'node.action':
            node = tx.get('node', payload['node_id'], client_id)
            guard(node)
            for run in tx.list('run', client_id):
                if run['state'] == 'running' and node['id'] in run['targets'].values():
                    payload = {**payload, 'ticket_id': run.get('ticket_id')}
                    break
        job = {'id': uid(), 'client_id': client_id, 'actor': actor, 'kind': kind, 'payload': payload,
               'state': 'queued', 'attempts': 0, 'created_at': now(), 'updated_at': now()}
        tx.execute('INSERT INTO jobs(id,client_id,actor,idem,digest,data) VALUES(?,?,?,?,?,?)',
                   (job['id'], client_id, actor, idem, digest, json.dumps(job)))
        append(tx, client_id, payload.get('ticket_id'), 'job.queued',
               {'job_id': job['id'], 'kind': kind}, actor)
        # Never persist bearer confirmation tokens beyond their one-time consumption.
        job['payload'].pop('confirmation_token', None)
        self.save_job(tx, job)
        return job

    @staticmethod
    def save_job(tx, job):
        job['updated_at'] = now()
        tx.execute('UPDATE jobs SET data=? WHERE id=?', (json.dumps(job), job['id']))

    @staticmethod
    def targets(tx, client_id, pack):
        nodes = {n['name']: n for n in tx.list('node', client_id)}
        targets = {}
        for step in pack['setup']:
            if step['target'] not in nodes:
                raise DomainError('missing_target', 'Scenario target is unavailable', 409)
            targets[step['target']] = nodes[step['target']]['id']
        return targets

    def perform(self, tx, node, action, job, args=None):
        guard(node)
        append(tx, node['client_id'], job['payload'].get('ticket_id'), 'adapter.request',
               {'node_id': node['id'], 'action': action, 'job_id': job['id']}, job['actor'])
        operation_id = f"{job['id']}:{node['id']}:{action}"
        result = self.registry.get(node).action(node, action, operation_id, args or {})
        if 'lab_state' in result:
            node['lab_state'] = result['lab_state']
            tx.put('node', node)
        append(tx, node['client_id'], job['payload'].get('ticket_id'), 'adapter.result',
               {'node_id': node['id'], 'action': action, 'result': result}, job['actor'])
        if not (isinstance(result.get('lab_state'), dict) or result.get('completed') is True):
            raise DomainError('completion_unconfirmed', 'Adapter submitted an action without confirming completion; reconcile the target', 502)
        return result

    def lifecycle(self, tx, run, phase, job):
        results = []
        steps = run['definition'].get('checks' if phase == 'check' else phase)
        if steps is None and phase == 'solve' and self.registry.mode == 'fake':
            steps = run['definition']['cleanup']
        if steps is None:
            raise DomainError('unsupported_phase', 'Scenario does not define this lifecycle phase', 422)
        failures = []
        for index, step in enumerate(steps):
            try:
                node = tx.get('node', run['targets'][step['target']], run['client_id'])
                guard(node, set(run['targets'].values()))
                op = f"{job['id']}:{run['id']}:{phase}:{index}"
                append(tx, run['client_id'], run.get('ticket_id'), 'adapter.request',
                       {'node_id': node['id'], 'phase': phase, 'script': step['run'], 'operation_id': op}, job['actor'])
                result = self.registry.get(node).lifecycle(node, phase, run['definition']['slug'] + '/' + step['run'], op)
                if phase != 'check' and not (isinstance(result.get('lab_state'), dict) or result.get('applied') is True or result.get('completed') is True):
                    raise DomainError('adapter_response', 'Lifecycle operation did not confirm completion', 502)
                if 'lab_state' in result:
                    node['lab_state'] = result['lab_state']
                    tx.put('node', node)
                append(tx, run['client_id'], run.get('ticket_id'), 'adapter.result',
                       {'node_id': node['id'], 'phase': phase, 'result': result}, job['actor'])
                if phase == 'check':
                    if type(result.get('passed')) is not bool:
                        raise DomainError('adapter_response', 'Check must return an explicit boolean result', 502)
                    check = {'id': uid(), 'client_id': run['client_id'], 'scenario_run_id': run['id'],
                             'check_id': step['id'], 'passed': result['passed'], 'output': str(result.get('output', ''))[:8000], 'ran_at': now()}
                    tx.put('check', check)
                    tx.event('check.result', check, 'check_result', check)
                    append(tx, run['client_id'], run.get('ticket_id'), 'check.result', check)
                results.append(result)
            except Exception as exc:
                failure = {'target': step['target'], 'phase': phase,
                           'code': exc.code if isinstance(exc, DomainError) else 'adapter_error'}
                append(tx, run['client_id'], run.get('ticket_id'), 'adapter.failed', failure, job['actor'])
                if phase != 'cleanup':
                    raise
                failures.append(failure)
        if failures:
            raise DomainError('cleanup_failed', 'One or more targets could not be restored', 502, {'failures': failures})
        return results

    def execute(self, tx, job):
        payload, cid = job['payload'], job['client_id']
        if job['kind'] in ('chat.reply', 'debrief.answer') and self.provider.mode != 'deterministic':
            from uuid import uuid5, NAMESPACE_DNS
            budget_id = str(uuid5(NAMESPACE_DNS, cid + ':' + now()[:10]))
            existing = [b for b in tx.list('ai_budget', cid) if b['id'] == budget_id]
            budget = existing[0] if existing else {'id': budget_id, 'client_id': cid, 'calls': 0, 'date': now()[:10]}
            if budget['calls'] >= int(os.getenv('LLM_DAILY_CALL_LIMIT', '100')):
                raise DomainError('ai_budget_exceeded', 'Daily model call budget reached', 429)
            budget['calls'] += 1
            tx.put('ai_budget', budget)
        if job['kind'] == 'node.action':
            return self.perform(tx, tx.get('node', payload['node_id'], cid), payload['action'], job, payload.get('arguments'))
        if job['kind'] == 'scenario.launch':
            run = tx.get('run', payload['run_id'], cid)
            pack = run['definition']
            self.lifecycle(tx, run, 'setup', job)
            duration = pack['sla']['resolve_within']
            seconds = int(duration[:-1]) * (3600 if duration[-1] == 'h' else 60)
            tid = uid()
            ticket = {'id': tid, 'client_id': cid, 'number': 'AEG-' + tid[:8].upper(),
                      'title': pack['title'], 'priority': pack['sla']['priority'], 'status': 'new',
                      'sla_due_at': (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat().replace('+00:00', 'Z'),
                      'reporter_persona_id': tx.list('persona', cid)[0]['id'], 'scenario_run_id': run['id'],
                      'assignee': job['actor'], 'work_notes': '', 'identity_verified': False,
                      'created_at': now(), 'updated_at': now()}
            tx.put('ticket', ticket)
            run.update(state='running', injected_at=now(), ticket_id=tid)
            tx.put('run', run)
            tx.event('ticket.created', ticket, 'ticket', ticket)
            append(tx, cid, tid, 'ticket.created', ticket, job['actor'])
            tx.event('scenario.state_changed', run, 'scenario_run', {'state': 'running'})
            notification = {'id': uid(), 'client_id': cid, 'kind': 'ticket', 'severity': ticket['priority'],
                            'title': pack['title'], 'body': pack['notification']['opening'], 'source': 'scenario',
                            'ticket_id': tid, 'acknowledged': False, 'created_at': now()}
            tx.put('notification', notification)
            tx.event('notification.created', notification, 'notification', notification)
            ai.message(tx, ticket, notification['body'], 'client', pack['notification']['channel'])
            return {'scenario_run_id': run['id'], 'ticket_id': tid}
        if job['kind'] == 'ticket.resolve':
            ticket = tx.get('ticket', payload['ticket_id'], cid)
            run = tx.get('run', ticket['scenario_run_id'], cid)
            if run['state'] != 'running':
                raise DomainError('invalid_state', 'Scenario is not running', 409)
            results = self.lifecycle(tx, run, 'check', job)
            passed = bool(results) and all(r['passed'] for r in results)
            transition(tx, ticket, 'verified' if passed else 'investigating')
            if passed:
                run.update(state='resolved', resolved_at=now())
                tx.put('run', run)
                tx.event('scenario.state_changed', run, 'scenario_run', {'state': 'resolved'})
                ai.start_debrief(tx, ticket, run['definition'])
            return {'passed': passed}
        if job['kind'] == 'scenario.abort':
            run = tx.get('run', payload['run_id'], cid)
            self.lifecycle(tx, run, 'cleanup', job)
            run['state'] = 'aborted'
            tx.put('run', run)
            tx.event('scenario.state_changed', run, 'scenario_run', {'state': 'aborted'})
            return {'restored': True}
        if job['kind'] == 'baseline.restore':
            failures = []
            for run in tx.list('run', cid):
                if run['state'] in ('running', 'failed', 'cleanup_failed', 'aborting'):
                    try:
                        self.lifecycle(tx, run, 'cleanup', job)
                        run['state'] = 'aborted'
                    except Exception as exc:
                        run['state'] = 'cleanup_failed'
                        failures.append({'run_id': run['id'], 'code': exc.code if isinstance(exc, DomainError) else 'adapter_error'})
                    tx.put('run', run)
                    tx.event('scenario.state_changed', run, 'scenario_run', {'state': run['state']})
            for node in tx.list('node', cid):
                try:
                    self.perform(tx, node, 'revert', job, {'baseline': True} if self.registry.mode == 'fake' else {})
                except Exception as exc:
                    failure = {'node_id': node['id'], 'code': exc.code if isinstance(exc, DomainError) else 'adapter_error'}
                    failures.append(failure)
                    append(tx, cid, None, 'adapter.failed', failure, job['actor'])
            if failures:
                raise DomainError('restore_incomplete', 'Some baseline operations failed; maintenance remains active', 502, {'failures': failures})
            return {'restored': True}
        if job['kind'] == 'chat.reply':
            ticket = tx.get('ticket', payload['ticket_id'], cid)
            tx.event('chat.typing', ticket, 'ticket', {'typing': True})
            if ticket['status'] == 'client_explanation':
                result = ai.explanation(tx, ticket, payload['body'], self.provider)
                if result['clear']:
                    transition(tx, ticket, 'debrief')
                    debrief = next(d for d in tx.list('debrief', cid) if d['ticket_id'] == ticket['id'])
                    debrief['state'] = 'active'
                    tx.put('debrief', debrief)
                    tx.event('debrief.question', debrief, 'debrief', {'index': 0, 'question': debrief['questions'][0]})
                body = result['body']
            else:
                body = ai.reply(tx, ticket, payload['body'], self.registry, self.provider)
            ai.message(tx, ticket, body, 'client', payload['channel'])
            tx.event('chat.typing', ticket, 'ticket', {'typing': False})
            return {'replied': True}
        if job['kind'] == 'debrief.answer':
            debrief = tx.get('debrief', payload['debrief_id'], cid)
            ticket = tx.get('ticket', debrief['ticket_id'], cid)
            run = tx.get('run', ticket['scenario_run_id'], cid)
            result = ai.answer(tx, debrief, payload['body'], run, self.provider, job['actor'])
            if result['state'] == 'completed':
                transition(tx, ticket, 'closed')
                if result['overall_score'] < 70:
                    # Scheduler waits for target availability before launching remediation.
                    tx.put('schedule', {'id': uid(), 'client_id': cid, 'scenario_id': run['scenario_id'],
                                       'operator_id': job['actor'], 'due_at': now(), 'state': 'pending',
                                       'reason': 'weak_skills', 'source_debrief_id': debrief['id']})
            return {'debrief_id': result['id'], 'state': result['state']}
        raise DomainError('unknown_job', 'Unknown job kind')

    def run_once(self, kinds=None):
        with self.store.transaction() as tx:
            jobs = [json.loads(row['data']) for row in tx.execute('SELECT data FROM jobs').fetchall()]
            queued = sorted((j for j in jobs if j['state'] == 'queued' and (kinds is None or j['kind'] in kinds)), key=lambda j: j['created_at'])
            if not queued:
                return False
            job = queued[0]
            job.update(state='running', attempts=job['attempts'] + 1)
            self.save_job(tx, job)
        with self.store.transaction() as tx:
            try:
                job['result'] = self.execute(tx, job)
                job['state'] = 'completed'
                tx.event('job.completed', job, 'job', {'job_id': job['id'], 'result': job['result']})
            except Exception as exc:
                job['state'] = 'needs_reconciliation' if isinstance(exc, DomainError) and exc.code == 'completion_unconfirmed' else 'failed'
                job['error'] = {'code': exc.code if isinstance(exc, DomainError) else 'adapter_error',
                                'message': 'Operation failed. Review evidence and reconcile the target before retrying.'}
                if job['kind'] in ('scenario.launch', 'scenario.abort'):
                    run = tx.get('run', job['payload']['run_id'], job['client_id'])
                    try:
                        self.lifecycle(tx, run, 'cleanup', job)
                        run['state'] = 'failed' if job['kind'] == 'scenario.launch' else 'aborted'
                    except Exception:
                        run['state'] = 'cleanup_failed'
                    tx.put('run', run)
                    tx.event('scenario.state_changed', run, 'scenario_run', {'state': run['state']})
                if job['kind'] == 'ticket.resolve':
                    ticket = tx.get('ticket', job['payload']['ticket_id'], job['client_id'])
                    if ticket['status'] == 'pending_verification':
                        transition(tx, ticket, 'investigating')
                tx.event('job.failed', job, 'job', {'job_id': job['id'], 'error': job['error']})
            if job['kind'] == 'baseline.restore' and job['state'] == 'completed':
                tx.put('maintenance', {'id': job['client_id'], 'client_id': job['client_id'], 'active': False})
            append(tx, job['client_id'], job['payload'].get('ticket_id'), 'job.' + job['state'],
                   {'job_id': job['id'], 'kind': job['kind'], 'result': job.get('result'), 'error': job.get('error')}, job['actor'])
            self.save_job(tx, job)
        return True

    def recover(self):
        # After a worker crash, do not repeat an ambiguous live mutation automatically.
        with self.store.transaction() as tx:
            for row in tx.execute('SELECT data FROM jobs').fetchall():
                job = json.loads(row['data'])
                age = datetime.now(timezone.utc) - datetime.fromisoformat(job['updated_at'].replace('Z', '+00:00'))
                if job['state'] == 'running' and age.total_seconds() > 600:
                    job['state'] = 'queued' if self.registry.mode == 'fake' else 'needs_reconciliation'
                    self.save_job(tx, job)
                    if job['state'] == 'needs_reconciliation':
                        tx.event('job.failed', job, 'job', {'job_id': job['id'], 'error': {'code': 'needs_reconciliation'}})

    def tick(self):
        self.recover()
        with self.store.transaction() as tx:
            for ticket in tx.list('ticket'):
                if ticket['status'] != 'closed' and ticket['sla_due_at'] < now() and not ticket.get('sla_breached'):
                    ticket['sla_breached'] = True
                    tx.put('ticket', ticket)
                    notice = {'id': uid(), 'client_id': ticket['client_id'], 'ticket_id': ticket['id'],
                              'kind': 'sla', 'severity': ticket['priority'], 'title': 'SLA breached',
                              'body': ticket['title'], 'source': 'monitor', 'acknowledged': False, 'created_at': now()}
                    tx.put('notification', notice)
                    tx.event('notification.created', notice, 'notification', notice)
            for schedule in tx.list('schedule'):
                if schedule['state'] != 'pending' or schedule['due_at'] > now():
                    continue
                try:
                    job = self.submit(tx, 'scenario.launch', schedule['client_id'], schedule['operator_id'],
                                      {'scenario_id': schedule['scenario_id']}, 'schedule:' + schedule['id'])
                except DomainError as exc:
                    if exc.code in ('target_busy', 'maintenance_active'):
                        continue
                    raise
                schedule.update(state='launched', job_id=job['id'])
                tx.put('schedule', schedule)
