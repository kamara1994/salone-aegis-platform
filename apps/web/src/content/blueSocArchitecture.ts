/**
 * P1 architecture transcribed from the user's original CIT security lab drawing.
 * This is a design inventory, not a live-discovered topology. Keep IPs and paths
 * here until reconciled against the real lab's authoritative configuration.
 */
export type SecurityZone = 'outside' | 'interconnect' | 'dmz' | 'inside' | 'secure';
export type AssetKind = 'cloud' | 'firewall' | 'workstation' | 'service' | 'server';
export interface BlueSocAsset {
  id: string;
  name: string;
  detail: string;
  address?: string;
  zone: SecurityZone;
  kind: AssetKind;
  x: number;
  y: number;
  responsibilities: string[];
}
export interface BlueSocConnection {
  id: string;
  from: string;
  to: string;
  label?: string;
  kind?: 'logical' | 'network';
  sourcePort?: 'left'|'right'|'top'|'bottom';
  targetPort?: 'left'|'right'|'top'|'bottom';
}
export const ZONE_STYLES: Record<SecurityZone, {title:string; color:string; fill:string}> = {
  outside: {title:'Outside · Untrusted',color:'#60a5fa',fill:'rgba(59,130,246,.08)'},
  interconnect: {title:'Interconnect · Transit',color:'#a78bfa',fill:'rgba(167,139,250,.08)'},
  dmz: {title:'DMZ · Semi-trusted',color:'#fbbf24',fill:'rgba(251,191,36,.06)'},
  inside: {title:'Inside · Ordinary trust',color:'#38bdf8',fill:'rgba(56,189,248,.07)'},
  secure: {title:'Secure · Highest trust',color:'#34d399',fill:'rgba(52,211,153,.065)'},
};

/** Coordinates reproduce the spatial relationships of the original drawing. */
export const BLUE_SOC_ASSETS: BlueSocAsset[] = [
  { id:'admin',name:'Admin Workstation',detail:'Remote administrator',address:'192.168.30.10',zone:'outside',kind:'workstation',x:0,y:45,responsibilities:['Administrative workstation outside the lab','Uses the school VPN path for approved remote access'] },
  { id:'school-vpn',name:'BYUI School VPN / CIT Lab',detail:'Campus lab access',address:'192.168.50.14',zone:'outside',kind:'cloud',x:190,y:158,responsibilities:['Campus lab connection','External management or VPN access path shown in the source drawing'] },
  { id:'internet',name:'Internet / Outside',detail:'VLAN 608',address:'157.201.22.58/29',zone:'outside',kind:'cloud',x:475,y:40,responsibilities:['Untrusted external network','WAN side of the Palo Alto firewall'] },
  { id:'palo',name:'Palo Alto NGFW',detail:'Internet-facing firewall',address:'192.168.10.1',zone:'interconnect',kind:'firewall',x:445,y:272,responsibilities:['WAN edge on VLAN 608','DMZ gateway on VLAN 708: 192.168.70.1','Interconnect VLAN 508: 192.168.10.1','NAT/PAT, static NAT, remote-access VPN and security rules','P8 firewall block action requires lab validation'] },
  { id:'dmz',name:'DMZ',detail:'VLAN 708 · 192.168.70.0/24',address:'192.168.70.1 gateway',zone:'dmz',kind:'cloud',x:730,y:285,responsibilities:['Public-facing web server segment','Services exposed only through narrow Palo Alto policies'] },
  { id:'dmz1',name:'DMZ-1 Web Server',detail:'Web/NLB target',address:'192.168.70.2',zone:'dmz',kind:'server',x:1050,y:245,responsibilities:['First load-balanced web-server target','Verify functionality while the other web server is stopped'] },
  { id:'dmz2',name:'DMZ-2 / Guacamole',detail:'Web access / zero-trust gateway',address:'192.168.70.3',zone:'dmz',kind:'server',x:1050,y:407,responsibilities:['Second DMZ host from original drawing','Guacamole access gateway','Validate Duo-protected access separately'] },
  { id:'inter',name:'Interconnect',detail:'VLAN 508 · 192.168.10.0/24',zone:'interconnect',kind:'cloud',x:447,y:429,responsibilities:['Transit link between Palo Alto and FortiGate','Interconnect endpoints: .1 / .2'] },
  { id:'forti',name:'FortiGate VDOM',detail:'Secure-facing firewall',address:'192.168.10.2',zone:'interconnect',kind:'firewall',x:445,y:572,responsibilities:['Interconnect IP 192.168.10.2','Inside VLAN 808 gateway 192.168.80.1','Secure VLAN 908 gateway 192.168.90.1','Enforce default deny from DMZ and inside to Secure, except explicitly required services'] },
  { id:'inside',name:'Inside',detail:'VLAN 808 · 192.168.80.0/24',address:'192.168.80.1 gateway',zone:'inside',kind:'cloud',x:96,y:583,responsibilities:['Ordinary-trust services and operating clients','Internet egress via Palo Alto PAT (subject to verified routes)'] },
  { id:'duo',name:'Duo',detail:'Multi-factor authentication',address:'192.168.80.13',zone:'inside',kind:'service',x:40,y:790,responsibilities:['Duo MFA system','VPN and Guacamole authentication workflow, to be verified'] },
  { id:'n8n',name:'n8n Docker',detail:'Security workflow automation',address:'192.168.80.20',zone:'inside',kind:'service',x:257,y:790,responsibilities:['Search Splunk for custom Rigby alerts','Coordinate AI-assisted lab triage','Request approved Palo Alto IP blocks and verify outcomes'] },
  { id:'secure',name:'Secure',detail:'VLAN 908 · 192.168.90.0/24',address:'192.168.90.1 gateway',zone:'secure',kind:'cloud',x:735,y:560,responsibilities:['Highest-trust network segment','Security monitoring and protected lab hosts','Secure-zone policy enforcement by FortiGate'] },
  { id:'s1',name:'S-1',detail:'Protected host',address:'192.168.90.4',zone:'secure',kind:'workstation',x:1050,y:565,responsibilities:['Secure-zone protected host'] },
  { id:'s2',name:'S-2',detail:'Protected host',address:'192.168.90.3',zone:'secure',kind:'workstation',x:1050,y:716,responsibilities:['Secure-zone protected host'] },
  { id:'s3',name:'S-3',detail:'Protected host',address:'192.168.90.9',zone:'secure',kind:'workstation',x:842,y:845,responsibilities:['Secure-zone protected host'] },
  { id:'radius',name:'S-4 / RADIUS',detail:'FreeRADIUS service',address:'192.168.90.15',zone:'secure',kind:'service',x:633,y:845,responsibilities:['FreeRADIUS authentication','Duo to RADIUS authentication chain in the VPN exercise'] },
  { id:'splunk',name:'Splunk SIEM',detail:'Security log analysis',address:'192.168.90.25',zone:'secure',kind:'service',x:1050,y:866,responsibilities:['Receive selected firewall and web-server logs','Find Security Onion Rigby alerts for P8 orchestration'] },
  { id:'onion',name:'Security Onion',detail:'Network IDS and monitoring',address:'192.168.90.20',zone:'secure',kind:'service',x:735,y:1010,responsibilities:['Monitor DMZ traffic through appropriately configured mirror/tap','Custom case- and whitespace-insensitive Rigby detection','Forward validated alert to Splunk'] },
];

export const BLUE_SOC_CONNECTIONS: BlueSocConnection[] = [
  {id:'admin-vpn',from:'admin',to:'school-vpn',kind:'logical',sourcePort:'bottom',targetPort:'left'},
  {id:'vpn-pa',from:'school-vpn',to:'palo',label:'CIT LAB · 192.168.50.14',sourcePort:'right',targetPort:'left'},
  {id:'wan-pa',from:'internet',to:'palo',label:'VLAN 608 · 157.201.22.58/29',sourcePort:'bottom',targetPort:'top'},
  {id:'pa-dmz',from:'palo',to:'dmz',label:'VLAN 708 · GW .70.1',sourcePort:'right',targetPort:'left'},
  {id:'dmz-web1',from:'dmz',to:'dmz1',sourcePort:'right',targetPort:'left'},
  {id:'dmz-web2',from:'dmz',to:'dmz2',sourcePort:'right',targetPort:'left'},
  {id:'pa-inter',from:'palo',to:'inter',label:'VLAN 508',sourcePort:'bottom',targetPort:'top'},
  {id:'inter-forti',from:'inter',to:'forti',label:'192.168.10.2',sourcePort:'bottom',targetPort:'top'},
  {id:'forti-inside',from:'forti',to:'inside',label:'VLAN 808 · GW .80.1',sourcePort:'left',targetPort:'right'},
  {id:'forti-secure',from:'forti',to:'secure',label:'VLAN 908 · GW .90.1',sourcePort:'right',targetPort:'left'},
  {id:'inside-duo',from:'inside',to:'duo',sourcePort:'bottom',targetPort:'top'},
  {id:'inside-n8n',from:'inside',to:'n8n',sourcePort:'bottom',targetPort:'top'},
  {id:'secure-s1',from:'secure',to:'s1',sourcePort:'right',targetPort:'left'},
  {id:'secure-s2',from:'secure',to:'s2',sourcePort:'right',targetPort:'left'},
  {id:'secure-s3',from:'secure',to:'s3',sourcePort:'bottom',targetPort:'top'},
  {id:'secure-radius',from:'secure',to:'radius',sourcePort:'bottom',targetPort:'top'},
  {id:'secure-splunk',from:'secure',to:'splunk',sourcePort:'right',targetPort:'left'},
  {id:'secure-onion',from:'secure',to:'onion',sourcePort:'bottom',targetPort:'top'},
];
export const BLUE_SOC_MILESTONES = [
  {code:'P1',title:'Architecture',test:'Reconcile every VLAN, address, route and diagram edge with the deployed inventory.'},
  {code:'P2',title:'Palo Alto, DMZ and NLB',test:'Verify NAT/PAT, static NAT, server failover and Secure-zone denies.'},
  {code:'P3',title:'Remote-access VPN',test:'Demonstrate authorized remote access to inside hosts.'},
  {code:'P4',title:'Duo + FreeRADIUS',test:'Demonstrate an MFA challenge and authenticated VPN session.'},
  {code:'P5',title:'Guacamole access',test:'Demonstrate MFA-protected access to an approved internal app.'},
  {code:'P6',title:'Security Onion',test:'Generate a safe Rigby-pattern alert and show the corresponding IDS record.'},
  {code:'P7',title:'Splunk',test:'Find the alert and show firewall/web server log ingestion.'},
  {code:'P8',title:'n8n + AI response',test:'Run an approved test IP containment, and verify firewall policy and blocked traffic.'},
];
