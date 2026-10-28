import { describe, expect, it } from 'vitest';
import { duplexMismatch, evalFirewall, initialLab, ipConfig, reach, renewLease, resolveName } from '@/mock/lab';

describe('simulated lab baseline', () => {
  it('gives finance workstations a DHCP lease on VLAN 20 with the right gateway', () => {
    const lab = initialLab();
    const c = ipConfig(lab, 'WS-FIN-02');
    expect(c.ip).toMatch(/^10\.10\.20\./);
    expect(c.gw).toBe('10.10.20.1');
    expect(c.dns[0]).toBe('10.10.10.10');
  });

  it('lets the app tier reach the payments database and blocks users from it', () => {
    const lab = initialLab();
    expect(reach(lab, 'APP01', '10.10.40.10', 5432).ok).toBe(true);
    const user = reach(lab, 'WS-FIN-02', '10.10.40.10', 5432);
    expect(user.ok).toBe(false);
    expect(evalFirewall(lab, ipConfig(lab, 'WS-FIN-02').ip, '10.10.40.10', 5432).action).toBe('block');
  });

  it('resolves internal names and has no duplex mismatch', () => {
    const lab = initialLab();
    expect(resolveName(lab, 'WS-FIN-02', 'salonepay.corp.salonemutual.lab').ok).toBe(true);
    expect(duplexMismatch(lab, 'Gi0/3')).toBe(false);
  });
});

describe('fault effects', () => {
  it('a wrong default gateway breaks off-subnet traffic only', () => {
    const lab = initialLab();
    lab.nodes['WS-FIN-02'].staticIp = { ip: '10.10.20.45', mask: '255.255.255.0', gw: '10.10.20.254', dns: ['10.10.10.10'] };
    expect(reach(lab, 'WS-FIN-02', '10.10.30.20', 443).ok).toBe(false);
    lab.nodes['WS-FIN-02'].staticIp = undefined;
    renewLease(lab, 'WS-FIN-02');
    expect(reach(lab, 'WS-FIN-02', '10.10.30.20', 443).ok).toBe(true);
  });

  it('a hard-set half duplex port is detected as a mismatch', () => {
    const lab = initialLab();
    lab.switchPorts['Gi0/3'].duplex = 'half';
    lab.switchPorts['Gi0/3'].speed = '100';
    expect(duplexMismatch(lab, 'Gi0/3')).toBe(true);
  });
});
