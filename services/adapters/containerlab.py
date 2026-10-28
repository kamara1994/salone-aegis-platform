import urllib.parse
from .base import guard
from .live import LiveAdapter, request
from services.common.errors import DomainError

class ContainerlabAdapter(LiveAdapter):
    def call(self, node, suffix, method='GET'):
        config = self.vault.credentials('containerlab')
        allowed = config.get('container_ids', {})
        container_id = allowed.get(node['platform_ref'])
        if not container_id:
            raise DomainError('adapter_config', 'Container is not allowlisted', 403)
        path = '/containers/' + urllib.parse.quote(container_id, safe='') + suffix
        # This URL is a TLS-authenticated, narrowly scoped Docker API proxy, never a mounted socket.
        return request(config['docker_proxy_url'] + path, method,
                       headers={'Authorization': 'Bearer ' + config['proxy_token']})

    def read(self, node, tool):
        if tool == 'read.health':
            info = self.call(node, '/json')
            return {'power': 'running' if info['State']['Running'] else 'stopped'}
        return super().read(node, tool)

    def action(self, node, action, operation_id, args):
        guard(node)
        if action in ('start', 'stop', 'reboot'):
            self.call(node, '/' + ('restart' if action == 'reboot' else action), 'POST')
            return {'operation_id': operation_id, 'completed': True}
        return super().action(node, action, operation_id, args)
