import base64
from .base import guard
from .live import LiveAdapter, request

class OPNsenseAdapter(LiveAdapter):
    def call(self, path, method='GET', data=None):
        config = self.vault.credentials('opnsense')
        auth = base64.b64encode((config['api_key'] + ':' + config['api_secret']).encode()).decode()
        return request(config['url'] + '/api/' + path, method, data, {'Authorization': 'Basic ' + auth})

    def read(self, node, tool):
        if tool == 'read.health':
            self.call('core/firmware/status')
            return {'power': 'running'}
        return super().read(node, tool)

    def action(self, node, action, operation_id, args):
        guard(node)
        if action == 'reboot':
            result = self.call('core/system/reboot', 'POST', {})
            return {'accepted': True, 'result': result, 'completion': 'command_accepted'}
        # Hypervisor start/stop and snapshot restore need a privileged lab runner.
        return super().action(node, action, operation_id, args)
