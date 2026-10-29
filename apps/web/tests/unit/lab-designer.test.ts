// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import type { Topology } from '@/api/types';
import { buildDoc } from '@/lab/inventory';
import { simulatePacket, ping } from '@/lab/simulate';
import { cableStatus, checkConnection, suggestCableType } from '@/lab/validate';
import type { LabDoc } from '@/lab/types';
import { MockEngine } from '@/mock/engine';
import { initialLab, renewLease } from '@/mock/lab';

let topo: Topology;
beforeAll(async () => {
  window.localStorage.clear();
  topo = await new MockEngine().getTopology();
});

const id = (doc: LabDoc, name: string) => doc.devices.find((d) => d.name === name)!.id;
const cableTo = (doc: LabDoc, name: string) => doc.cables.find((c) => c.b.device === id(doc, name) || c.a.device === id(doc, name))!;

describe('baseline lab built from the simulated lab', () => {
  it('maps every reported link to a cable on real ports, all up', () => {
    const doc = buildDoc(topo, initialLab());
    expect(doc.cables.length).toBe(topo.links.length);
    for (const c of doc.cables) expect(cableStatus(doc, c).state, c.id + JSON.stringify(cableStatus(doc, c).issues)).toBe('up');
  });

  it('users reach SalonePay over HTTPS and file shares over SMB', () => {
    const doc = buildDoc(topo, initialLab());
    const t = simulatePacket(doc, { srcDevice: id(doc, 'WS-FIN-02'), dst: '10.10.30.20', proto: 'tcp', port: 443 });
    expect(t.status, t.reason).toBe('delivered');
    expect(t.hops.map((h) => h.deviceName)).toEqual(['WS-FIN-02', 'SW-ACC-01', 'FW01', 'SW-ACC-01', 'APP01']);
    expect(simulatePacket(doc, { srcDevice: id(doc, 'WS-FIN-02'), dst: id(doc, 'FS01'), proto: 'tcp', port: 445 }).status).toBe('delivered');
  });

  it('blocks users from the payments database with the default deny and says so', () => {
    const doc = buildDoc(topo, initialLab());
    const t = simulatePacket(doc, { srcDevice: id(doc, 'WS-FIN-02'), dst: '10.10.40.10', proto: 'tcp', port: 5432 });
    expect(t.status).toBe('blocked');
    expect(t.reason).toMatch(/FW01 on VLAN20: rule 99 "Default deny/);
    expect(t.hops.at(-1)?.acl?.rule).toBe(99);
    expect(simulatePacket(doc, { srcDevice: id(doc, 'APP01'), dst: '10.10.40.10', proto: 'tcp', port: 5432 }).status).toBe('delivered');
  });

  it('reports a refused connection when nothing listens', () => {
    const doc = buildDoc(topo, initialLab());
    const t = simulatePacket(doc, { srcDevice: id(doc, 'DC01'), dst: '10.10.30.20', proto: 'tcp', port: 8080 });
    expect(t.status).toBe('dropped');
    expect(t.reason).toMatch(/nothing listens on TCP 8080/);
  });

  it('switch SVI, firewall bridge and the internet path all work', () => {
    const doc = buildDoc(topo, initialLab());
    expect(simulatePacket(doc, { srcDevice: id(doc, 'SW-ACC-01'), dst: id(doc, 'DC01'), proto: 'icmp' }).status).toBe('delivered');
    expect(simulatePacket(doc, { srcDevice: id(doc, 'KL-WS-01'), dst: id(doc, 'KL-WS-02'), proto: 'icmp' }).status).toBe('delivered');
    const web = simulatePacket(doc, { srcDevice: id(doc, 'KL-WS-01'), dst: '52.96.0.10', proto: 'tcp', port: 443 });
    expect(web.status, web.reason).toBe('delivered');
  });
});

describe('injected faults show up exactly where they are', () => {
  it('wrong default gateway: ARP for the gateway fails', () => {
    const lab = initialLab();
    lab.nodes['WS-FIN-02'].staticIp = { ip: '10.10.20.45', mask: '255.255.255.0', gw: '10.10.20.254', dns: ['10.10.10.10'] };
    const doc = buildDoc(topo, lab);
    const t = simulatePacket(doc, { srcDevice: id(doc, 'WS-FIN-02'), dst: '10.10.30.20', proto: 'tcp', port: 443 });
    expect(t.status).toBe('dropped');
    expect(t.reason).toMatch(/ARP for 10\.10\.20\.254 got no reply: no device in this lab owns/);
  });

  it('access port in the wrong VLAN: the cable is flagged and DHCP fails', () => {
    const lab = initialLab();
    lab.switchPorts['Gi0/12'].vlan = 99;
    renewLease(lab, 'WS-OPS-03');
    const doc = buildDoc(topo, lab);
    const st = cableStatus(doc, cableTo(doc, 'WS-OPS-03'));
    expect(st.state).toBe('degraded');
    expect(st.issues.find((i) => i.code === 'vlan_mismatch')?.message).toMatch(/VLAN 20 .* VLAN 99/);
    expect(simulatePacket(doc, { srcDevice: id(doc, 'WS-OPS-03'), dst: '10.10.30.20', proto: 'tcp', port: 443 }).reason).toMatch(/self-assigned/);
  });

  it('duplex mismatch: delayed packets and an occasional CRC-corrupted frame', () => {
    const lab = initialLab();
    Object.assign(lab.switchPorts['Gi0/3'], { duplex: 'half', speed: '100', crc: 412, lateCollisions: 1290 });
    const doc = buildDoc(topo, lab);
    expect(cableStatus(doc, cableTo(doc, 'FS01')).issues.some((i) => i.code === 'duplex_mismatch' && i.severity === 'degraded')).toBe(true);
    const burst = ping(doc, id(doc, 'DC01'), '10.10.30.15');
    expect(burst.map((p) => p.status)).toEqual(['delayed', 'delayed', 'malformed', 'delayed']);
  });

  it('shutdown port: link down with the exact reason', () => {
    const lab = initialLab();
    lab.switchPorts['Gi0/4'].shutdown = true;
    const doc = buildDoc(topo, lab);
    const t = simulatePacket(doc, { srcDevice: id(doc, 'WS-FIN-02'), dst: '10.10.30.20', proto: 'tcp', port: 443 });
    expect(t.status).toBe('dropped');
    expect(t.reason).toMatch(/Gi0\/4/);
  });
});

describe('cable validation', () => {
  const doc = () => buildDoc(topo, initialLab());
  it('rejects fibre on copper ports, serial on copper, and occupied ports', () => {
    const d = doc();
    const sw = id(d, 'SW-ACC-01');
    const fw = id(d, 'FW01');
    expect(checkConnection(d, { device: sw, port: 'Gi0/9' }, { device: fw, port: 'igb2' }, 'fiber')[0].code).toBe('incompatible_port');
    expect(checkConnection(d, { device: sw, port: 'Gi0/9' }, { device: fw, port: 'igb2' }, 'serial')[0].code).toBe('incompatible_port');
    expect(checkConnection(d, { device: sw, port: 'Gi0/5' }, { device: fw, port: 'igb2' }, 'straight')[0].code).toBe('occupied');
    expect(checkConnection(d, { device: sw, port: 'Gi0/25' }, { device: fw, port: 'ix0' }, 'fiber').filter((i) => i.severity === 'error')).toEqual([]);
    expect(checkConnection(d, { device: sw, port: 'Console' }, { device: fw, port: 'igb2' }, 'console')[0].code).toBe('console_misuse');
  });
  it('suggests the cable an engineer would pick', () => {
    const d = doc();
    expect(suggestCableType(d, { device: id(d, 'SW-ACC-01'), port: 'Gi0/25' }, { device: id(d, 'FW01'), port: 'ix0' })).toBe('fiber');
    expect(suggestCableType(d, { device: id(d, 'SW-ACC-01'), port: 'Console' }, { device: id(d, 'WS-FIN-02'), port: 'RS232' })).toBe('console');
  });
});
