"""Fail closed if approved shared contracts/examples are missing or incompatible.
No files under contracts/ are generated or modified by backend code.
"""
import json
import os
import re
from pathlib import Path
import yaml

REQUIRED = ('openapi.yaml', 'events.schema.json', 'scenario.schema.json')
# These endpoints are additive implementation capabilities intentionally kept out of
# the original shared contract until their response examples are promoted.
APPROVED_ADDITIVE = {
    ('post', '/api/v1/console-sessions/connect'),
    ('post', '/api/v1/lab/baseline/confirmation'),
    ('get', '/api/v1/jobs/{}'),
}


def validate_schema(value, schema, root):
    import jsonschema
    # Local references only: contracts must not trigger arbitrary network retrieval.
    def refs(node):
        if isinstance(node, dict):
            if '$ref' in node and not node['$ref'].startswith('#/'):
                raise ValueError('Only document-local schema references are supported')
            for child in node.values():
                refs(child)
        elif isinstance(node, list):
            for child in node:
                refs(child)
    refs(root)
    jsonschema.Draft202012Validator(schema, resolver=jsonschema.RefResolver.from_schema(root),
                                   format_checker=jsonschema.FormatChecker()).validate(value)


def main():
    root = Path(os.environ.get('CONTRACT_DIR', 'contracts'))
    missing = [str(root / f) for f in REQUIRED if not (root / f).is_file()]
    if missing:
        raise SystemExit('CONTRACT GATE BLOCKED: approved files are missing: ' + ', '.join(missing))
    spec = yaml.safe_load((root / 'openapi.yaml').read_text())
    event_schema = json.loads((root / 'events.schema.json').read_text())
    scenario_schema = json.loads((root / 'scenario.schema.json').read_text())
    from services.api.app import create_app
    from services.common.config import Settings
    app = create_app(Settings(auth_mode='dev', dev_token='contract-test-' * 4,
                              confirmation_secret='contract-test-secret-' * 3))
    actual = app.openapi()
    def normalize(path):
        return re.sub(r'\{[^}]+\}', '{}', path)
    implementation = {(method, normalize(path)) for path, value in actual['paths'].items()
                      for method in value if method in ('get', 'post', 'patch') and path.startswith('/api/v1')}
    contract = {(method, normalize(path if path.startswith('/api/v1') else '/api/v1' + path))
                for path, value in spec['paths'].items() for method in value if method in ('get', 'post', 'patch')}
    missing = contract - implementation
    unapproved = (implementation - contract) - APPROVED_ADDITIVE
    if missing or unapproved:
        raise SystemExit(f'Contract route mismatch: missing={missing}, unapproved={unapproved}')
    response_examples = list((root / 'examples' / 'responses').glob('*.json'))
    event_examples = list((root / 'examples' / 'events').glob('*.json'))
    if not response_examples or not event_examples:
        raise SystemExit('Approved response and event examples are required; see docs/contracts.md for format')
    covered = set()
    for file in response_examples:
        fixture = json.loads(file.read_text())
        path, method = fixture['path'], fixture['method'].lower()
        operation = spec['paths'][path][method]
        schema = operation['responses'][str(fixture['status'])]['content']['application/json']['schema']
        validate_schema(fixture['body'], schema, spec)
        covered.add((method, normalize(path if path.startswith('/api/v1') else '/api/v1' + path)))
    if covered != contract:
        raise SystemExit('Every endpoint must have at least one approved response example')
    for file in event_examples:
        validate_schema(json.loads(file.read_text()), event_schema, event_schema)
    for file in Path('apps/web/scenarios').glob('*/scenario.yaml'):
        validate_schema(yaml.safe_load(file.read_text()), scenario_schema, scenario_schema)
    print('Approved contracts and examples validated. Run integration capture validation before merging.')

if __name__ == '__main__':
    main()
