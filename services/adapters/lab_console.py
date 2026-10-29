"""Narrow HTTPS console-broker adapter for Guacamole/noVNC and device consoles.

Vault's console-broker document owns the endpoint, credential, public origin and
UUID target bindings. Browser-authored device properties never become live targets.
The broker must authenticate browser WebSocket connections independently and implement
idempotent connect/terminate by session UUID; connection IDs are not bearer secrets.
"""
from urllib.parse import urlparse
from uuid import UUID
from services.common.errors import DomainError
from .live import Vault, request


class BrokerConsoleTransport:
    def __init__(self, vault=None, sender=request):
        self.vault, self.sender = vault or Vault(), sender

    def _binding(self, cid, target_id, protocol):
        UUID(cid)
        UUID(target_id)
        config = self.vault.credentials('console-broker')
        binding = config.get('targets', {}).get(cid + ':' + target_id)
        if (not binding or binding.get('platform_host') is not False or 'lab' not in binding.get('tags', [])
                or protocol not in binding.get('protocols', [])):
            raise DomainError('console_target_denied', 'Console target is not approved for this tenant and protocol', 403)
        if binding.get('platform') not in ('linux', 'windows', 'ios', 'opnsense'):
            raise DomainError('console_target_denied', 'Device platform is not approved', 403)
        for key in ('url', 'public_url'):
            parsed = urlparse(config.get(key, ''))
            if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
                raise DomainError('adapter_config', 'Console broker requires trusted HTTPS origins', 503)
        return config, binding

    def validate(self, cid, target_id, protocol):
        self._binding(cid, target_id, protocol)

    def operate(self, session, action, command=None):
        from services.lab.sessions import COMMANDS
        if action not in ('connect', 'command', 'terminate') or (action == 'command' and command not in COMMANDS):
            raise DomainError('command_forbidden', 'Only structured console operations are allowed', 403)
        config, binding = self._binding(session['client_id'], session['device_id'], session['protocol'])
        payload = {'session_id': session['id'], 'tenant_id': session['client_id'], 'actor_id': session['actor'],
                   'target_ref': binding['target_ref'], 'protocol': session['protocol'], 'operation': action}
        if command:
            payload['command'] = command
        response = self.sender(config['url'].rstrip('/') + '/v1/sessions/operations', 'POST', payload,
                               {'Authorization': 'Bearer ' + config['token'],
                                'Idempotency-Key': session['id'] + ':' + str(session['version']) + ':' + action})
        if response.get('completed') is not True:
            raise DomainError('console_unconfirmed', 'Console broker did not confirm the operation', 502)
        # Never forward broker output/credentials or arbitrary URLs into evidence/browser.
        return {'completed': True, 'connection_url': config['public_url'].rstrip('/') + '/sessions/' + session['id']}
