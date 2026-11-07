/**
 * Simulated, narrated packet/event journeys.
 * Physical network forwarding, mirrored telemetry, authentication and API
 * automation are explicitly different layers here. Do not promote to "live"
 * until signed server-origin events can be mapped to actual lab inventory.
 */
export type BlueSocFlowLayer='network'|'authentication'|'mirror'|'telemetry'|'automation'|'control';
export type BlueSocFlowStatus='allow'|'inspect'|'deny'|'event'|'complete';
export interface BlueSocFlowStep {
  from:string; to:string; layer:BlueSocFlowLayer; protocol:string; port?:string;
  title:string; explanation:string; status:BlueSocFlowStatus;
  /** In this scenario the control plane is conceptual, not a physical cable. */
  note?:string;
}
export interface BlueSocFlow {
  id:string; name:string; subtitle:string; color:string;
  origin:string; destination:string; tag:string;
  steps:BlueSocFlowStep[];
}
export const BLUE_SOC_FLOWS:BlueSocFlow[]=[
  {
    id:'web',name:'Public HTTPS request',subtitle:'Outside user → perimeter NAT → DMZ web server → response',color:'#45e2c2',
    origin:'Internet / Outside',destination:'DMZ-1 192.168.70.2',tag:'P2 / WEB',
    steps:[
      {from:'internet',to:'palo',layer:'network',protocol:'TCP/TLS',port:'443',title:'Client enters the outside firewall',explanation:'An external lab client requests the approved public web VIP. Palo Alto evaluates the WAN zone, destination NAT and security rule.',status:'inspect'},
      {from:'palo',to:'dmz',layer:'network',protocol:'DNAT',port:'443',title:'Perimeter policy permits approved web traffic',explanation:'A permitted test request is translated to an allowed DMZ service. This is a design example, not evidence that static NAT exists.',status:'allow'},
      {from:'dmz',to:'dmz1',layer:'network',protocol:'HTTPS',port:'443',title:'Web tier receives the request',explanation:'The DMZ-1 server answers through the authorized web listener. The assignment also requires testing load-balanced failover.',status:'allow'},
      {from:'dmz1',to:'dmz',layer:'network',protocol:'HTTPS response',port:'443',title:'DMZ server returns its response',explanation:'The response retraces the established stateful flow toward the edge.',status:'allow'},
      {from:'dmz',to:'palo',layer:'network',protocol:'Session return',title:'Firewall tracks the established session',explanation:'Return traffic passes the stateful session boundary under the established policy.',status:'allow'},
      {from:'palo',to:'internet',layer:'network',protocol:'TLS response',title:'Client receives the web response',explanation:'The external client receives an HTTPS response. No actual remote connection is made by this demonstration.',status:'complete'},
    ],
  },
  {
    id:'failover',name:'DMZ web failover',subtitle:'Web-1 unavailable → approved request directed to Web-2',color:'#79d5ff',
    origin:'Internet / Outside',destination:'DMZ-2 192.168.70.3',tag:'P2 / FAILOVER',
    steps:[
      {from:'internet',to:'palo',layer:'network',protocol:'TLS',port:'443',title:'External client requests the public service',explanation:'The normal VIP is used; Web-1 is considered unavailable in this illustrated failover scenario.',status:'inspect'},
      {from:'palo',to:'dmz',layer:'network',protocol:'NAT / VIP',port:'443',title:'Traffic passes the perimeter',explanation:'Only the intended public web service is allowed. An actual load balancer and health checks must be configured separately.',status:'allow'},
      {from:'dmz',to:'dmz2',layer:'network',protocol:'HTTPS',port:'443',title:'Backup web-server target handles the request',explanation:'The planned secondary web node is DMZ-2 at 192.168.70.3. Verify that it really serves the same site, alongside Guacamole, before claiming failover.',status:'complete'},
    ],
  },
  {
    id:'vpn',name:'VPN + MFA authorization',subtitle:'Remote admin → Palo Alto → RADIUS / Duo → inside access',color:'#73b6ff',
    origin:'Admin 192.168.30.10',destination:'Inside VLAN 808',tag:'P3–P5 / IAM',
    steps:[
      {from:'admin',to:'school-vpn',layer:'network',protocol:'Remote access',title:'Remote administrator reaches the campus lab',explanation:'The source drawing routes the workstation through the BYUI school VPN. Its actual tunnel parameters and role still need confirmation.',status:'inspect'},
      {from:'school-vpn',to:'palo',layer:'network',protocol:'TLS/VPN',port:'443',title:'Palo Alto checks the remote-access session',explanation:'The Palo Alto portal/gateway must authenticate only authorized users and issue a restricted remote access route.',status:'inspect'},
      {from:'palo',to:'radius',layer:'authentication',protocol:'RADIUS request',title:'Authentication request goes to FreeRADIUS',explanation:'This line represents a logical authentication exchange, not a direct cable. Firewall and routing rules must allow the needed authentication service.',status:'event'},
      {from:'radius',to:'duo',layer:'authentication',protocol:'MFA verification',title:'Duo challenge is required',explanation:'Duo multi-factor authorization is a separate security decision. No credentials or push challenge are actually executed here.',status:'inspect'},
      {from:'duo',to:'palo',layer:'authentication',protocol:'MFA result',title:'Palo Alto receives the authentication decision',explanation:'A successful lab user receives an authorization result; a rejected MFA challenge must prevent VPN access.',status:'allow'},
      {from:'palo',to:'inside',layer:'network',protocol:'Authorized tunnel',title:'Restricted Inside access becomes available',explanation:'The authorized tunnel client can reach approved Inside resources only. Secure remains denied by default.',status:'complete'},
    ],
  },
  {
    id:'deny',name:'Inside → Secure denied',subtitle:'Inside host attempts unauthorized Secure-zone access',color:'#fb7185',
    origin:'Inside / n8n 192.168.80.20',destination:'FortiGate policy boundary',tag:'P2 / DENY',
    steps:[
      {from:'n8n',to:'inside',layer:'network',protocol:'TCP connection',port:'443',title:'An Inside workstation initiates a Secure-zone session',explanation:'Source 192.168.80.20 attempts access to a protected destination in 192.168.90.0/24.',status:'inspect'},
      {from:'inside',to:'forti',layer:'control',protocol:'Firewall deny',port:'443',title:'FortiGate denies unauthorized lateral access',explanation:'The packet stops at the FortiGate boundary. It is NOT delivered to the Secure-zone host. Verify this rule with real firewall logs before claiming it is enforced.',status:'deny'},
    ],
  },
  {
    id:'detect',name:'Rigby IDS detection',subtitle:'DMZ HTTP request → Security Onion mirror → Splunk alert',color:'#ffcb6d',
    origin:'Outside test client',destination:'Splunk 192.168.90.25',tag:'P6–P7 / DETECT',
    steps:[
      {from:'internet',to:'palo',layer:'network',protocol:'HTTP/TLS',title:'Authorized test web request approaches the firewall',explanation:'An authorized lab client submits a harmless URL containing Rigby (including case/spacing variations).',status:'inspect'},
      {from:'palo',to:'dmz',layer:'network',protocol:'DMZ web traffic',title:'Firewall passes the approved web request',explanation:'Only the intended web service can be reached through the DMZ security rule.',status:'allow'},
      {from:'dmz',to:'dmz1',layer:'network',protocol:'HTTP request',title:'Web service receives the URL',explanation:'Where HTTPS is used, the sensor requires visibility to a decrypted request or appropriate web logs to match URL content.',status:'inspect'},
      {from:'dmz1',to:'onion',layer:'mirror',protocol:'SPAN / IDS',title:'Security Onion inspects a copy of the traffic',explanation:'A mirror/tap delivers observation data to the Secure-zone IDS. This is a monitoring feed, not a routed web packet.',status:'event'},
      {from:'onion',to:'splunk',layer:'telemetry',protocol:'Alert event',title:'Splunk indexes the matching Rigby alert',explanation:'The indexed detection should include rule, timestamp, source IP, destination, and relevant request evidence.',status:'complete'},
    ],
  },
  {
    id:'respond',name:'Automated containment',subtitle:'Security Onion → Splunk → n8n → Palo Alto block',color:'#c9a2ff',
    origin:'Security Onion 192.168.90.20',destination:'Palo Alto NGFW',tag:'P8 / RESPONSE',
    steps:[
      {from:'onion',to:'splunk',layer:'telemetry',protocol:'IDS alert',title:'Security Onion provides a matching detection',explanation:'A validated Rigby-rule alert is available to the SIEM.',status:'event'},
      {from:'splunk',to:'n8n',layer:'automation',protocol:'SIEM query',title:'n8n retrieves the event from Splunk',explanation:'The workflow must extract the observed source IP, normalize it and reject malformed/allowlisted addresses.',status:'inspect'},
      {from:'n8n',to:'palo',layer:'automation',protocol:'Approved firewall API',title:'Approved automation requests a scoped block',explanation:'The expected action is a policy-controlled temporary containment request, not an unrestricted AI instruction. This screen never sends a real API call.',status:'event'},
      {from:'palo',to:'palo',layer:'control',protocol:'Policy verification',title:'Verify the block and rollback procedure',explanation:'In the real lab, query the firewall rule and prove the test source no longer reaches the service. Then remove the temporary rule safely.',status:'complete'},
    ],
  },
  {
    id:'outbound',name:'Inside outbound PAT',subtitle:'Internal client → FortiGate → Palo Alto → Internet',color:'#5eead4',
    origin:'Inside / n8n 192.168.80.20',destination:'Internet',tag:'P2 / NAT',
    steps:[
      {from:'n8n',to:'inside',layer:'network',protocol:'DNS/HTTPS',title:'Inside host sends an outbound request',explanation:'A private Inside-zone host initiates an approved internet-bound session.',status:'inspect'},
      {from:'inside',to:'forti',layer:'network',protocol:'Zone policy',title:'FortiGate evaluates the Inside egress policy',explanation:'Only permitted Inside egress should traverse the interconnect.',status:'allow'},
      {from:'forti',to:'palo',layer:'network',protocol:'Transit routing',title:'Palo Alto receives transit traffic',explanation:'The return route and NAT rule must be valid for the RFC1918 source address.',status:'inspect'},
      {from:'palo',to:'internet',layer:'network',protocol:'Source NAT / PAT',title:'Perimeter translates the outbound session',explanation:'Palo Alto PAT maps approved private source traffic to the public egress IP. Real mappings must be verified from the session and NAT logs.',status:'complete'},
    ],
  },
];
export const FLOW_LAYER_NAMES:Record<BlueSocFlowLayer,string>={
  network:'NETWORK / DATA PLANE',
  authentication:'IDENTITY / AUTHENTICATION',
  mirror:'SENSOR / TRAFFIC MIRROR',
  telemetry:'LOGGING / TELEMETRY',
  automation:'WORKFLOW / CONTROL PLANE',
  control:'SECURITY DECISION',
};
