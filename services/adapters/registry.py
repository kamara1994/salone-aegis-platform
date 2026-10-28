from .fake import FakeAdapter
from .guacamole import GuacamoleAdapter
from .opnsense import OPNsenseAdapter
from .containerlab import ContainerlabAdapter
from .active_directory import ActiveDirectoryAdapter
from .live import LiveAdapter, ProxmoxAdapter, AWSAdapter, WazuhAdapter, CMLAdapter
from services.common.errors import DomainError

SYSTEMS = ('proxmox', 'opnsense', 'active_directory', 'wazuh', 'aws', 'cml', 'containerlab', 'guacamole')

class Registry:
    def __init__(self, mode='fake'):
        classes = {'guacamole': GuacamoleAdapter, 'opnsense': OPNsenseAdapter, 'containerlab': ContainerlabAdapter, 'active_directory': ActiveDirectoryAdapter, 'proxmox': ProxmoxAdapter, 'aws': AWSAdapter, 'wazuh': WazuhAdapter, 'cml': CMLAdapter}
        self.mode = mode
        self.adapters = {name: FakeAdapter(name) if mode == 'fake' else classes.get(name, LiveAdapter)(name)
                         for name in SYSTEMS}

    def get(self, node):
        try:
            return self.adapters[node['system']]
        except KeyError:
            raise DomainError('adapter_not_found', 'No adapter configured for this node', 503)
