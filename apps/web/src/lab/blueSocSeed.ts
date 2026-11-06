/**
 * Editable BLUE SOC P1 starter project based on the original CIT project diagram.
 *
 * This models device placement, host IPs and network connections in the Aegis
 * designer. It does NOT deploy Cisco/Palo Alto/FortiGate hardware, create a
 * functioning VPN, load balancer, IDS or SIEM, or prove firewall rules.
 *
 * The designer currently ships only an OPNsense firewall model. Until vendor
 * models are available, these devices use generic firewall simulation ports,
 * clearly marked as abstractions, never branded hardware port specifications.
 */
import { ifaceFromTemplate, MODEL_BY_KEY } from './catalog';
import type { Cable, CableType, Device, DeviceKind, LabDoc, Route } from './types';

const LAB_NAME = 'BLUE SOC Enterprise Security Lab';
export const BLUE_SOC_PROJECT_NAME = LAB_NAME;

export function createBlueSocProject(): LabDoc {
  const doc: LabDoc = {
    version: 1, devices: [], cables: [], sites: [], racks: [],
    vlans: [
      { id: 608, name: 'OUTSIDE', subnet: '157.201.22.56/29' },
      { id: 508, name: 'INTERCONNECT', subnet: '192.168.10.0/24', gateway: '192.168.10.1' },
      { id: 708, name: 'DMZ', subnet: '192.168.70.0/24', gateway: '192.168.70.1' },
      { id: 808, name: 'INSIDE', subnet: '192.168.80.0/24', gateway: '192.168.80.1' },
      { id: 908, name: 'SECURE', subnet: '192.168.90.0/24', gateway: '192.168.90.1' },
    ],
    subnets: [
      { cidr: '157.201.22.56/29', name: 'Outside WAN / VLAN 608', vlan: 608 },
      { cidr: '192.168.10.0/24', name: 'Interconnect / VLAN 508', vlan: 508 },
      { cidr: '192.168.70.0/24', name: 'DMZ / VLAN 708', vlan: 708 },
      { cidr: '192.168.80.0/24', name: 'Inside / VLAN 808', vlan: 808 },
      { cidr: '192.168.90.0/24', name: 'Secure / VLAN 908', vlan: 908 },
    ],
    groups: [
      { id: 'outside', name: 'OUTSIDE · VLAN 608' },
      { id: 'interconnect', name: 'INTERCONNECT · VLAN 508' },
      { id: 'dmz', name: 'DMZ · VLAN 708' },
      { id: 'inside', name: 'INSIDE · VLAN 808' },
      { id: 'secure', name: 'SECURE · VLAN 908' },
    ],
    annotations: [
      { id: 'note-overview', kind: 'text', x: -20, y: -160, w: 630, h: 80, color: 'blue',
        text: 'BLUE SOC P1–P8 • Editable training topology from original project diagram. SIMULATION ONLY. Palo Alto/FortiGate use generic virtual firewall models; NAT, VPN, MFA, WAF, SIEM and AI response need configuration and verification.' },
      { id: 'note-dmz', kind: 'text', x: 690, y: 30, w: 305, h: 65, color: 'amber',
        text: 'DMZ • VLAN 708 • 192.168.70.0/24\nWeb 1: .2  |  Web 2 + Guacamole: .3' },
      { id: 'note-inside', kind: 'text', x: -90, y: 435, w: 310, h: 72, color: 'blue',
        text: 'INSIDE • VLAN 808 • 192.168.80.0/24\nDuo .13  |  n8n Docker .20' },
      { id: 'note-secure', kind: 'text', x: 710, y: 485, w: 390, h: 72, color: 'green',
        text: 'SECURE • VLAN 908 • 192.168.90.0/24\nSecurity Onion .20  |  Splunk .25  |  FreeRADIUS .15' },
      { id: 'note-campus', kind: 'text', x: -10, y: 160, w: 300, h: 56, color: 'grey',
        text: 'Admin 192.168.30.10 → BYUI VPN 192.168.50.14. Gateway/VPN tunnel configuration not provided; connectivity NOT validated.' },
    ],
    goals: [
      { id: 'goal-dmz-secure', src: 'dmz-1', dst: '192.168.90.25', proto: 'tcp', port: 8000, expect: 'blocked', note: 'DMZ must not access Secure zone unless expressly authorized' },
      { id: 'goal-inside-secure', src: 'n8n', dst: '192.168.90.4', proto: 'icmp', expect: 'blocked', note: 'Default deny from Inside to Secure' },
      { id: 'goal-web-failover', src: 'admin', dst: '192.168.70.2', proto: 'tcp', port: 80, expect: 'reach', note: 'P2 external access requires verified static NAT / public VIP before this can pass' },
    ],
    source: 'blank', generatedAt: new Date().toISOString(),
  };
  const dev = (id: string, model: string, name: string, x: number, y: number, role: string, groupId: string, notes = '') => {
    const m = MODEL_BY_KEY[model];
    if (!m) throw new Error(`Lab catalog is missing model ${model}`);
    const kind: DeviceKind = m.kind;
    const d: Device = {
      id, origin:'design', name, kind, model, role, groupId, x, y,
      power:'running', health:'unknown',
      interfaces:m.ports().map(t=>ifaceFromTemplate(t,id,m.macPrefix)),
      routes:[], vlans:kind==='switch'?{1:'default'}:{}, firewall:[],
      listening:[...m.listening], consoles:[...m.consoles],
      notes: notes || 'P1 design device. No real device is connected or verified.',
      ...(kind==='switch'?{stp:{enabled:true,priority:32768,mode:'rapid-pvst' as const}}:{}),
    };
    doc.devices.push(d);
    return d;
  };
  const addr=(id:string,iface:string,ip:string,prefix:number,gateway?:string)=>{
    const d=doc.devices.find(x=>x.id===id);
    const port=d?.interfaces.find(x=>x.name===iface);
    if(!port)throw new Error(`Missing interface ${id}/${iface}`);
    Object.assign(port,{ip,prefix,...(gateway?{gateway}:{})});
  };
  const routes=(id:string,rs:Route[])=>{const d=doc.devices.find(x=>x.id===id);if(d)d.routes=rs;};
  const wire=(a:string,pa:string,b:string,pb:string,type:CableType='straight')=>{
    const n=doc.cables.length+1;
    const c:Cable={id:'blue-soc-c'+n,a:{device:a,port:pa},b:{device:b,port:pb},type,disabled:false};
    doc.cables.push(c);
  };
  dev('internet','internet','INTERNET / OUTSIDE',470,-50,'Untrusted WAN','outside','WAN gateway not supplied. VLAN 608 outside addressing shown on PA.');
  dev('campus-vpn','internet','BYUI CIT LAB VPN',210,30,'School VPN access','outside','Original diagram labels this endpoint 192.168.50.14. VPN connectivity not yet modeled.');
  dev('admin','optiplex','Admin Workstation',-30,10,'Remote admin 192.168.30.10','outside');
  dev('palo','dec2750','Palo Alto NGFW (emulated)',480,155,'Internet-facing firewall · vendor model not yet available','interconnect','Uses generic OPNsense port placeholders (igb0–3) in the design simulator, NOT Palo Alto configuration or status.');
  dev('forti','dec2750','FortiGate VDOM (emulated)',480,490,'Secure-facing firewall · vendor model not yet available','interconnect','Uses generic OPNsense port placeholders (igb0–3) in the design simulator, NOT a FortiGate VDOM implementation.');
  dev('dmz-sw','c2960x24','DMZ SWITCH',800,170,'DMZ access switch','dmz');
  dev('dmz-1','r650','DMZ-1 Web Server',1090,105,'Web server 1 / NLB member','dmz');
  dev('dmz-2','r650','DMZ-2 / Guacamole',1090,315,'Web server 2 / remote access','dmz');
  dev('inside-sw','c2960x24','INSIDE SWITCH',155,520,'Inside zone access switch','inside');
  dev('duo','r650','Duo MFA',-70,730,'MFA service','inside');
  dev('n8n','r650','n8n Docker',250,730,'Splunk → AI → Palo Alto automation','inside');
  dev('secure-sw','c2960x24','SECURE SWITCH',805,540,'Protected network access','secure');
  dev('s1','optiplex','S-1 Secure Host',1090,490,'Protected host','secure');
  dev('s2','optiplex','S-2 Secure Host',1090,625,'Protected host','secure');
  dev('s3','optiplex','S-3 Secure Host',1090,760,'Protected host','secure');
  dev('radius','r650','S-4 / FreeRADIUS',695,760,'RADIUS authentication service','secure');
  dev('splunk','r650','Splunk SIEM',1070,925,'SIEM collecting firewall/web logs','secure');
  dev('onion','r650','Security Onion',660,930,'IDS and network monitoring','secure','P6: mirror DMZ traffic and detect case/space-insensitive Rigby web requests. Physical SPAN/tap is not modeled yet.');
  addr('admin','Ethernet','192.168.30.10',24);
  addr('campus-vpn','pe0','192.168.50.14',24);
  addr('palo','igb0','157.201.22.58',29);
  addr('palo','igb1','192.168.70.1',24);
  addr('palo','igb2','192.168.10.1',24);
  addr('forti','igb0','192.168.10.2',24);
  addr('forti','igb1','192.168.80.1',24);
  addr('forti','igb2','192.168.90.1',24);
  const dmzHosts:[string,string][]=[['dmz-1','192.168.70.2'],['dmz-2','192.168.70.3']];
  for(const [id,ip] of dmzHosts)addr(id,'eno1',ip,24,'192.168.70.1');
  for(const [id,ip] of [['duo','192.168.80.13'],['n8n','192.168.80.20']] as const)addr(id,'eno1',ip,24,'192.168.80.1');
  for(const [id,ip,iface] of [
    ['s1','192.168.90.4','Ethernet'],['s2','192.168.90.3','Ethernet'],['s3','192.168.90.9','Ethernet'],
    ['radius','192.168.90.15','eno1'],['splunk','192.168.90.25','eno1'],['onion','192.168.90.20','eno1']
  ] as const)addr(id,iface,ip,24,'192.168.90.1');
  routes('palo',[
    {prefix:'192.168.80.0/24',via:'192.168.10.2',kind:'static'},
    {prefix:'192.168.90.0/24',via:'192.168.10.2',kind:'static'},
  ]);
  routes('forti',[
    {prefix:'0.0.0.0/0',via:'192.168.10.1',kind:'default'},
  ]);
  wire('internet','pe0','palo','igb0','wan');
  wire('campus-vpn','pe1','palo','igb3','wan');
  wire('palo','igb1','dmz-sw','Gi0/24');
  wire('palo','igb2','forti','igb0','crossover');
  wire('forti','igb1','inside-sw','Gi0/24');
  wire('forti','igb2','secure-sw','Gi0/24');
  wire('dmz-sw','Gi0/1','dmz-1','eno1');
  wire('dmz-sw','Gi0/2','dmz-2','eno1');
  wire('inside-sw','Gi0/1','duo','eno1');
  wire('inside-sw','Gi0/2','n8n','eno1');
  wire('secure-sw','Gi0/1','s1','Ethernet');
  wire('secure-sw','Gi0/2','s2','Ethernet');
  wire('secure-sw','Gi0/3','s3','Ethernet');
  wire('secure-sw','Gi0/4','radius','eno1');
  wire('secure-sw','Gi0/5','splunk','eno1');
  wire('secure-sw','Gi0/6','onion','eno1');
  return doc;
}
