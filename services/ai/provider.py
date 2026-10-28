import json
import os
from pathlib import Path
from services.adapters.live import request
from services.common.errors import DomainError

PROMPTS = Path(__file__).parent / 'prompts'

class Provider:
    def __init__(self, mode='deterministic'):
        self.mode = mode

    def complete(self, role, context):
        if self.mode != 'openai-compatible':
            raise DomainError('provider_unavailable', 'A live model provider is not configured', 503)
        endpoint = os.environ.get('LLM_BASE_URL', '')
        key_file = os.environ.get('LLM_API_KEY_FILE', '/run/secrets/llm_api_key')
        with open(key_file) as file:
            key = file.read().strip()
        result = request(endpoint.rstrip('/') + '/chat/completions', 'POST', {
            'model': os.environ['LLM_MODEL'], 'temperature': 0, 'max_tokens': 800,
            'response_format': {'type': 'json_object'},
            'messages': [{'role': 'system', 'content': (PROMPTS / (role + '.txt')).read_text()},
                         {'role': 'user', 'content': json.dumps(context)}]},
                         {'Authorization': 'Bearer ' + key})
        content = result['choices'][0]['message']['content']
        if len(content) > 12000:
            raise DomainError('model_response', 'Model response is too large', 502)
        try:
            return json.loads(content)
        except (ValueError, KeyError):
            raise DomainError('model_response', 'Model did not return valid structured output', 502)
