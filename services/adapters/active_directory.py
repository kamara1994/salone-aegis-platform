"""WinRM read tools and hash-allowlisted PowerShell lifecycle scripts."""
import hashlib
from pathlib import Path
from services.common.errors import DomainError
from .base import guard
from .live import LiveAdapter


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


class ActiveDirectoryAdapter(LiveAdapter):
    def session(self, node):
        import winrm
        config = self.vault.credentials('active_directory')
        target = config['targets'].get(node['platform_ref'])
        if not target or not target['endpoint'].startswith('https://'):
            raise DomainError('adapter_config', 'WinRM target must be allowlisted and use HTTPS', 503)
        session = winrm.Session(target['endpoint'], auth=(config['username'], config['password']),
                                transport='ntlm', server_cert_validation='validate',
                                read_timeout_sec=35, operation_timeout_sec=30)
        return session, target, config

    def execute(self, node, script):
        session, _, _ = self.session(node)
        result = session.run_ps(script)
        output = result.std_out.decode(errors='replace')[:8000]
        if result.status_code:
            raise DomainError('winrm_failed', 'Approved PowerShell operation failed; inspect the runner logs', 502)
        return output

    def read(self, node, tool):
        if tool == 'read.ipconfig':
            script = 'Get-NetIPConfiguration | Select-Object InterfaceAlias,IPv4Address,IPv4DefaultGateway | ConvertTo-Json -Depth 5'
        elif tool == 'read.health':
            self.execute(node, "Write-Output 'ready'")
            return {'power': 'running'}
        elif tool == 'read.logs':
            script = 'Get-WinEvent -LogName System -MaxEvents 10 | Select-Object TimeCreated,Id,LevelDisplayName,Message | ConvertTo-Json'
        elif tool == 'read.http':
            _, target, _ = self.session(node)
            script = '(Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 -Uri ' + quote(target['application_url']) + ').StatusCode'
        else:
            raise DomainError('tool_denied', 'Read tool is not allowlisted', 403)
        return {'output': self.execute(node, script)}

    def action(self, node, action, operation_id, args):
        guard(node)
        # Power, snapshots and rollback belong to the hypervisor, not domain credentials.
        return super().action(node, action, operation_id, args)

    def lifecycle(self, node, phase, script, operation_id):
        guard(node)
        if phase not in ('setup', 'check', 'solve', 'cleanup'):
            raise DomainError('invalid_phase', 'Invalid phase')
        _, target, config = self.session(node)
        root = Path('scenarios').resolve()
        path = (root / script).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            raise DomainError('script_denied', 'Script is outside the scenario repository', 403)
        source = path.read_bytes()
        if config.get('approved_scripts', {}).get(script) != hashlib.sha256(source).hexdigest():
            raise DomainError('script_denied', 'Script hash has not been approved for live execution', 403)
        if path.name == 'check_http.ps1':
            arguments = '-TargetUrl ' + quote(target['application_url'])
        elif path.name == 'check_gateway.ps1':
            arguments = '-InterfaceAlias ' + quote(target['interface_alias']) + ' -ExpectedGateway ' + quote(target['gateway'])
        else:
            arguments = '-InterfaceAlias ' + quote(target['interface_alias']) + ' -BaselineFile ' + quote(target['baseline_file'])
        # Only script files and hashes provisioned by the administrator can execute.
        command = '& {\n' + source.decode('utf-8') + '\n} ' + arguments
        try:
            output = self.execute(node, command)
            return {'passed': True, 'output': output} if phase == 'check' else {'applied': True, 'operation_id': operation_id}
        except DomainError as exc:
            if phase == 'check' and exc.code == 'winrm_failed':
                return {'passed': False, 'output': 'Approved verification check failed'}
            raise
