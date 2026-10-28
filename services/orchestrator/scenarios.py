import re
from pathlib import Path
from uuid import UUID
from services.adapters.base import READ_TOOLS


def validate(pack, folder):
    required = {'id', 'slug', 'version', 'title', 'difficulty', 'tags', 'sla', 'notification',
                'setup', 'cleanup', 'solve', 'checks', 'hints', 'client_facts', 'debrief'}
    if not required <= pack.keys():
        raise ValueError('Scenario is missing required fields')
    UUID(pack['id'])
    if not isinstance(pack['slug'], str) or not re.fullmatch(r'[a-z0-9][a-z0-9-]*', pack['slug']) or pack['slug'] != folder.name:
        raise ValueError('Scenario slug must match its containing folder')
    if not 1 <= pack['difficulty'] <= 9 or pack['version'] < 1:
        raise ValueError('Invalid difficulty or version')
    if not pack['checks'] or not pack['setup'] or not pack['cleanup']:
        raise ValueError('Scenarios require setup, checks and cleanup')
    if not re.fullmatch(r'\d+[mh]', pack['sla']['resolve_within']):
        raise ValueError('Invalid SLA duration')
    targets = {step['target'] for step in pack['setup']}
    if not targets <= {step['target'] for step in pack['cleanup']}:
        raise ValueError('Every injected target requires cleanup')
    for fact in pack['client_facts']:
        if 'tool' in fact and (fact['tool'] not in READ_TOOLS or fact.get('target') not in targets):
            raise ValueError('Client tool and target must be allowlisted within the scenario')
    check_ids = [c['id'] for c in pack['checks']]
    if len(check_ids) != len(set(check_ids)):
        raise ValueError('Check IDs must be unique')
    for phase in ('setup', 'cleanup', 'solve', 'checks'):
        for step in pack[phase]:
            if step['target'] not in targets:
                raise ValueError('Lifecycle targets must be declared by setup')
            file = (folder / step['run']).resolve()
            if not file.is_relative_to(folder.resolve()) or not file.is_file():
                raise ValueError('Script must exist inside the scenario pack')
    if sum(pack['debrief']['rubric'].values()) != 100:
        raise ValueError('Debrief rubric must total 100')
    return pack


def load(directory):
    import yaml
    result = []
    for file in sorted(Path(directory).glob('*/scenario.yaml')):
        result.append(validate(yaml.safe_load(file.read_text()), file.parent))
    if len({p['id'] for p in result}) != len(result):
        raise ValueError('Scenario IDs must be unique across packs')
    return result


def public(pack):
    # Never disclose root cause, fault scripts, identity answers or full hint ladder.
    return {k: pack[k] for k in ('id', 'slug', 'version', 'title', 'tags', 'difficulty')}
