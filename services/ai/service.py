import hmac
from services.common.errors import DomainError
from services.common.store import uid, now
from services.evidence.service import append, records

SENSITIVE = ('password reset', 'reset my password', 'reset password', 'mfa change', 'disable mfa', 'change mfa')


def identity(tx, ticket, answers, actor):
    persona = tx.get('persona', ticket['reporter_persona_id'], ticket['client_id'])
    expected = persona['verify_identity_answers']
    passed = bool(expected) and not persona.get('impostor', False) and set(answers) == set(expected) and all(
        hmac.compare_digest(str(answers[k]).strip().casefold().encode('utf-8'), str(v).strip().casefold().encode('utf-8')) for k, v in expected.items())
    ticket['identity_verified'] = passed
    tx.put('ticket', ticket)
    # Never persist the answers, even in audit records.
    append(tx, ticket['client_id'], ticket['id'], 'identity.passed' if passed else 'identity.failed', {'passed': passed}, actor)
    return {'verified': passed}


def message(tx, ticket, body, author, channel='chat'):
    record = {'id': uid(), 'client_id': ticket['client_id'], 'ticket_id': ticket['id'],
              'body': body, 'author': author, 'channel': channel, 'created_at': now()}
    tx.put('chat', record)
    tx.event('chat.message', record, 'chat_message', record)
    append(tx, ticket['client_id'], ticket['id'], 'chat.message', record, author)
    return record


def reply(tx, ticket, body, registry, provider):
    run = tx.get('run', ticket['scenario_run_id'], ticket['client_id'])
    pack = run['definition']
    if any(term in body.casefold() for term in SENSITIVE) and not ticket.get('identity_verified'):
        append(tx, ticket['client_id'], ticket['id'], 'identity.failed', {'reason': 'Sensitive request before verification'})
        return 'Please complete identity verification before discussing account changes.'
    # Tool selection is application-owned; model output cannot add tools or targets.
    facts = []
    for fact in pack['client_facts']:
        if any(word.casefold() in body.casefold() for word in fact['ask']):
            if 'tool' in fact:
                node_id = run['targets'].get(fact['target'])
                if not node_id:
                    raise DomainError('tool_denied', 'Tool target outside scenario', 403)
                node = tx.get('node', node_id, ticket['client_id'])
                result = registry.get(node).read(node, fact['tool'])
                append(tx, ticket['client_id'], ticket['id'], 'tool.read',
                       {'tool': fact['tool'], 'node_id': node_id, 'result': result})
                facts.append(result)
            else:
                facts.append(fact['answer'])
    if provider.mode == 'deterministic':
        return 'Here is what I can see: ' + str(facts) if facts else pack['notification']['opening']
    # Root cause, setup/cleanup scripts and expected identity answers never enter context.
    result = provider.complete('client', {'symptoms': pack['notification']['opening'], 'observations': facts,
                                         'message': body[:8000]})
    if not isinstance(result.get('body'), str):
        raise DomainError('model_response', 'Missing client response', 502)
    return result['body'][:8000]


def explanation(tx, ticket, body, provider):
    if provider.mode == 'deterministic':
        clear = len(body.split()) >= 12 and not any(x in body.lower() for x in ('arp', 'bgp', 'ospf', 'cidr'))
        result = {'clear': clear, 'body': 'Thank you, I understand the fix.' if clear else 'Please explain what was wrong, what changed and whether it works, in plain language.'}
    else:
        result = provider.complete('client', {'task': 'assess_explanation', 'explanation': body[:8000]})
        if not isinstance(result.get('clear'), bool) or not isinstance(result.get('body'), str):
            raise DomainError('model_response', 'Invalid explanation assessment', 502)
    append(tx, ticket['client_id'], ticket['id'], 'client.explanation', result)
    return result


def start_debrief(tx, ticket, pack):
    existing = [d for d in tx.list('debrief', ticket['client_id']) if d['ticket_id'] == ticket['id']]
    if existing:
        return existing[0]
    questions = ['What caused the fault, and what evidence supports your diagnosis?',
                 'Explain your safe fix and the checks that proved it worked.',
                 *pack['debrief']['what_ifs']]
    debrief = {'id': uid(), 'client_id': ticket['client_id'], 'ticket_id': ticket['id'],
               'persona': pack['debrief']['interviewer'], 'state': 'waiting_explanation',
               'questions': questions, 'answers': [], 'overall_score': None, 'deferred': False}
    tx.put('debrief', debrief)
    tx.event('debrief.started', debrief, 'debrief', {'ticket_id': ticket['id'], 'state': debrief['state']})
    return debrief


def answer(tx, debrief, text, run, provider, actor):
    if debrief['state'] != 'active':
        raise DomainError('invalid_state', 'Debrief must be active before answering', 409)
    rubric = run['definition']['debrief']
    if provider.mode == 'deterministic':
        # Demonstration evaluator only, explicitly labelled in scores.
        terms = ('gateway', 'route', 'test', 'verify', 'baseline', 'dhcp', 'arp', 'evidence')
        hits = sum(term in text.lower() for term in terms)
        score = min(100, hits * 12 + (10 if len(text.split()) >= 25 else 0))
        result = {'score': score, 'feedback': 'Deterministic demonstration assessment; requires human review.',
                  'weak_skills': rubric['must_cover'] if score < 70 else []}
    else:
        evidence = records(tx, run['client_id'], debrief['ticket_id'])
        result = provider.complete('interviewer', {'rubric': rubric,
                   'question': debrief['questions'][len(debrief['answers'])], 'answer': text[:8000],
                   'evidence': evidence[-40:]})
        if type(result.get('score')) is not int or not 0 <= result['score'] <= 100 or not isinstance(result.get('feedback'), str):
            raise DomainError('model_response', 'Invalid interview score', 502)
        weak = result.get('weak_skills')
        if not isinstance(weak, list) or any(x not in rubric['must_cover'] for x in weak):
            raise DomainError('model_response', 'Invalid weak skills', 502)
    record = append(tx, run['client_id'], debrief['ticket_id'], 'debrief.answer',
                    {'answer': text, **result, 'evaluator': provider.mode}, actor)
    debrief['answers'].append({'body': text, **result, 'evidence_id': record['id']})
    if len(debrief['answers']) == len(debrief['questions']):
        penalty = run['hints_used'] * 5
        debrief['overall_score'] = max(0, round(sum(a['score'] for a in debrief['answers']) / len(debrief['answers'])) - penalty)
        debrief['state'] = 'completed'
        debrief['evaluator'] = provider.mode
        for skill in rubric['must_cover']:
            skill_record = {'id': run['client_id'] + ':' + actor + ':' + skill,
                            'client_id': run['client_id'], 'operator_id': actor, 'skill': skill,
                            'level': debrief['overall_score'], 'evidence_ids': [a['evidence_id'] for a in debrief['answers']],
                            'updated_at': now()}
            # Public IDs remain UUIDs.
            from uuid import uuid5, NAMESPACE_DNS
            skill_record['id'] = str(uuid5(NAMESPACE_DNS, skill_record['id']))
            tx.put('skill', skill_record)
        tx.event('debrief.scored', debrief, 'debrief', {'overall_score': debrief['overall_score'], 'evaluator': provider.mode})
    else:
        tx.event('debrief.question', debrief, 'debrief', {'index': len(debrief['answers']),
                 'question': debrief['questions'][len(debrief['answers'])]})
    tx.put('debrief', debrief)
    return debrief
