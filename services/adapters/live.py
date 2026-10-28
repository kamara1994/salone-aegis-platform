"""Live integrations. No raw commands supplied by API clients are executed.
All credentials are retrieved from Vault; scenario scripts go through a separately
administered runner which must enforce script hashes, scopes and idempotency.
"""
import json
import os
import ssl
import urllib.parse
import urllib.request
from .base import ACTIONS, READ_TOOLS, guard
from services.common.errors import DomainError


def request(url, method='GET', data=None, headers=None, form=False):
    if not url.startswith('https://'):
        raise DomainError('adapter_config', 'Live integration URLs must use HTTPS', 503)
    body = (urllib.parse.urlencode(data).encode() if form else json.dumps(data).encode()) if data is not None else None
    req = urllib.request.Request(url, body, {'Content-Type': 'application/x-www-form-urlencoded' if form else 'application/json', **(headers or {})}, method=method)
    # Redirects are forbidden: never forward bearer credentials to another host.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args):
            return None
    opener = urllib.request.build_opener(NoRedirect, urllib.request.HTTPSHandler(context=ssl.create_default_context()))
    with opener.open(req, timeout=20) as response:
        raw = response.read(2_000_001)
        if len(raw) > 2_000_000:
            raise DomainError('adapter_response', 'Adapter response exceeded size limit', 502)
        return json.loads(raw) if raw else {}


class Vault:
    def credentials(self, system):
        address = os.environ.get('VAULT_ADDR', '')
        token_file = os.environ.get('VAULT_TOKEN_FILE', '/run/secrets/vault_token')
        with open(token_file) as f:
            token = f.read().strip()
        mount = os.environ.get('VAULT_KV_MOUNT', 'secret')
        result = request(f'{address}/v1/{mount}/data/aegis/{system}', headers={'X-Vault-Token': token})
        return result['data']['data']


class LiveAdapter:
    def __init__(self, system, vault=None):
        self.system, self.vault = system, vault or Vault()

    def bridge(self, node, operation, payload, operation_id=''):
        """Narrow trusted agent protocol for AD, OPNsense and lab lifecycle scripts.
        See docs/live-integrations.md for the required agent deployment contract.
        """
        config = self.vault.credentials(self.system)
        if not config.get('runner_url'):
            raise DomainError('adapter_not_configured', f'{self.system} runner is not configured', 503)
        return request(config['runner_url'] + '/v1/operations', 'POST',
                       {'node_ref': node['platform_ref'], 'operation': operation, **payload},
                       {'Authorization': 'Bearer ' + config['runner_token'], 'Idempotency-Key': operation_id})

    def action(self, node, action, operation_id, args):
        guard(node)
        if action not in ACTIONS:
            raise DomainError('unsupported_action', 'Unsupported action')
        return self.bridge(node, 'node.' + action, {'arguments': args}, operation_id)

    def read(self, node, tool):
        if tool not in READ_TOOLS:
            raise DomainError('tool_denied', 'Read tool is not allowlisted', 403)
        return self.bridge(node, tool, {})

    def lifecycle(self, node, phase, script, operation_id):
        guard(node)
        if phase not in {'setup', 'check', 'solve', 'cleanup'}:
            raise DomainError('invalid_phase', 'Unknown phase')
        # Script is an identifier from a validated pack, never arbitrary shell input.
        return self.bridge(node, 'scenario.' + phase, {'script': script}, operation_id)


class ProxmoxAdapter(LiveAdapter):
    def action(self, node, action, operation_id, args):
        guard(node)
        if action not in ACTIONS:
            raise DomainError('unsupported_action', 'Unsupported action')
        if action in ('snapshot', 'revert'):
            return super().action(node, action, operation_id, args)
        config = self.vault.credentials('proxmox')
        host, vmid = node['platform_ref'].split('/')
        if not host.replace('-', '').isalnum() or not vmid.isdigit():
            raise DomainError('adapter_config', 'Invalid Proxmox reference')
        return request(f"{config['url']}/api2/json/nodes/{host}/qemu/{vmid}/status/{action}",
                       'POST', {}, {'Authorization': 'PVEAPIToken=' + config['api_token']})


class AWSAdapter(LiveAdapter):
    def action(self, node, action, operation_id, args):
        guard(node)
        if action in ('snapshot', 'revert'):
            return super().action(node, action, operation_id, args)
        if action not in {'start', 'stop', 'reboot'}:
            raise DomainError('unsupported_action', 'Unsupported action')
        import boto3
        config = self.vault.credentials('aws')
        ec2 = boto3.client('ec2', region_name=config['region'],
                          aws_access_key_id=config['access_key_id'],
                          aws_secret_access_key=config['secret_access_key'],
                          aws_session_token=config.get('session_token'))
        result = getattr(ec2, action + '_instances')(InstanceIds=[node['platform_ref']])
        return {'request_id': result['ResponseMetadata']['RequestId'], 'submitted': True}


class WazuhAdapter(LiveAdapter):
    def read(self, node, tool):
        if tool not in {'read.health', 'read.logs'}:
            return super().read(node, tool)
        config = self.vault.credentials('wazuh')
        ref = urllib.parse.quote(node['platform_ref'], safe='')
        return request(f"{config['url']}/agents?agents_list={ref}",
                       headers={'Authorization': 'Bearer ' + config['access_token']})


class CMLAdapter(LiveAdapter):
    def action(self, node, action, operation_id, args):
        guard(node)
        if action not in {'start', 'stop'}:
            return super().action(node, action, operation_id, args)
        config = self.vault.credentials('cml')
        lab, target = node['platform_ref'].split('/')
        path = '/'.join(urllib.parse.quote(x, safe='') for x in (lab, 'nodes', target, action))
        return request(f"{config['url']}/api/v0/labs/{path}", 'PUT', {},
                       {'Authorization': 'Bearer ' + config['access_token']})
