"""Validate real HTTP responses captured by integration tests, never just fixtures."""
import json
import re
from pathlib import Path
import yaml
from scripts.contract_gate import validate_schema


def verify_response(method, path, status, body):
    spec = yaml.safe_load(Path('contracts/openapi.yaml').read_text())
    candidate = path.split('?', 1)[0]
    for route, methods in spec['paths'].items():
        full = route if route.startswith('/api/v1') else '/api/v1' + route
        pattern = re.sub(r'\{[^}]+\}', '[^/]+', full)
        if re.fullmatch(pattern, candidate) and method.lower() in methods:
            responses = methods[method.lower()]['responses']
            response = responses.get(str(status), responses.get('default'))
            if response is None:
                raise AssertionError('Undocumented response status')
            schema = response['content']['application/json']['schema']
            validate_schema(body, schema, spec)
            return
    raise AssertionError('Undocumented endpoint')


def verify_event(event):
    schema = json.loads(Path('contracts/events.schema.json').read_text())
    validate_schema(event, schema, schema)
