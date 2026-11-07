/**
 * Complete, human-readable P1–P8 requirements from the supplied project brief,
 * plus E1–E3 and above-and-beyond deliverables.
 * These are assignment goals, not claims of implementation.
 */
export interface Requirement {
  id: string;
  title: string;
  goal: string;
  tasks: string[];
  evidence: string[];
}
export const BLUE_SOC_REQUIREMENTS: Requirement[] = [
  {
    id:'P1',
    title:'Professional enterprise security architecture',
    goal:'Build and maintain a professionally labeled IPv4 architecture showing all five security regions, boundaries, network devices and required services.',
    tasks:[
      'Show the Outside (untrusted), DMZ (semi-trusted), Inside, Interconnect and Secure (highest-trust) regions.',
      'Position the Internet-facing Palo Alto NGFW as the outside gateway and FortiGate VDOM as the secure-zone-facing gateway.',
      'Document the VLANs, subnets, gateway IPs, interconnections and firewall interfaces. Use private RFC1918 addressing for hosts in DMZ, Inside and Secure.',
      'Include public web/NLB, WAF, remote-access VPN, Duo, FreeRADIUS, Guacamole, IDS, Splunk, n8n, administration and Inside test workstations.',
      'Update and annotate the diagram as changes are made. Explain permitted traffic paths and default-deny security boundaries.',
    ],
    evidence:['Versioned architecture drawing','IP/VLAN/interface inventory','Traffic and trust-boundary explanation','P1 report'],
  },
  {
    id:'P2',
    title:'Palo Alto NGFW, DMZ web tier and security policies',
    goal:'Configure the Palo Alto perimeter firewall and publish a resilient external web service without exposing the Secure network.',
    tasks:[
      'Configure the Palo Alto firewall, at least two Linux or Windows DMZ web servers, OS updates and approved administrator accounts.',
      'Configure VLAN subinterfaces, routing and applicable NAT/PAT, static NAT and policy rules. Verify connectivity and remote administration between authorized zones.',
      'Deploy a public-facing website through load balancing/NLB and document the public IP or VIP and service mapping.',
      'Prove that the website remains accessible when either DMZ web server is taken out of service.',
      'Prove DMZ-to-Secure and Inside-to-Secure access is blocked by default, except specifically authorized services.',
      'Record firewall version and rule/route/NAT evidence. Test only authorized infrastructure.',
    ],
    evidence:['Firewall interface and zone configuration','NAT and security-policy screenshots','Two DMZ web servers and VIP/NLB','Failover test before/after stopping one server','Denied-cross-zone tests','P2 report'],
  },
  {
    id:'P3',
    title:'Palo Alto remote-access VPN',
    goal:'Provide encrypted SSL/TLS remote access for approved users to required Inside-zone hosts.',
    tasks:[
      'Configure the Palo Alto remote-access VPN with an authorized user group and appropriate address pool, gateway and security policies.',
      'Verify an external authorized client connects through the encrypted VPN tunnel.',
      'Verify the client can reach only the intended private Inside services and that unauthorized resources remain denied.',
      'Document the connection, assigned tunnel address, routes, policies and authentication result.',
    ],
    evidence:['VPN gateway/portal settings','Connected user and tunnel evidence','Permitted/denied reachability tests','P3 report'],
  },
  {
    id:'P4',
    title:'VPN MFA with Duo and FreeRADIUS',
    goal:'Require an additional authentication factor for remote-access VPN users.',
    tasks:[
      'Integrate Duo MFA with the Palo Alto remote-access VPN.',
      'Add the FreeRADIUS authentication service according to the assignment sequence and verify the intended Duo/RADIUS flow.',
      'Test a successful MFA challenge and an intentionally denied or failed MFA attempt using lab accounts.',
      'Document which component enforces each step and preserve evidence without exposing MFA secrets.',
    ],
    evidence:['Duo policy and challenge','FreeRADIUS authentication logs','Successful and failed VPN sign-ins','P4 report'],
  },
  {
    id:'P5',
    title:'Guacamole Zero Trust access',
    goal:'Provide brokered access from a DMZ Guacamole gateway to approved internal applications while still requiring Duo authentication.',
    tasks:[
      'Deploy Apache Guacamole on an approved DMZ host and configure protected HTTPS access.',
      'Limit connections to the authorized Inside hosts/applications and verify least-privilege firewall policy.',
      'Require Duo MFA in the access workflow and test allowed versus denied sessions.',
      'Show the full connection path and demonstrate that a DMZ Guacamole server cannot freely access the Secure zone.',
    ],
    evidence:['Guacamole gateway and target configuration','MFA-protected session capture','Authorization and boundary test','P5 report'],
  },
  {
    id:'P6',
    title:'Security Onion monitoring and custom Rigby alert',
    goal:'Use a Security Onion sensor in the Secure region to inspect DMZ web traffic and alert on matching URLs.',
    tasks:[
      'Install and configure Security Onion in Secure, with visibility into DMZ traffic through an approved SPAN, tap or equivalent sensor feed.',
      'Build and test a custom detection regex that finds the word “rigby” in a web request regardless of capitalization or inserted whitespace.',
      'Generate harmless authorized requests with example patterns (Rigby, RIGBY, ri g by) and show their alerts.',
      'Document timestamps, source/destination, rule ID, event records and any limitations from TLS encryption.',
    ],
    evidence:['Sensor monitoring path','Detection rule and test strings','Security Onion matching alert','P6 report'],
  },
  {
    id:'P7',
    title:'Splunk SIEM log collection',
    goal:'Centralize logs from both firewalls and the first DMZ web server and make them searchable in Splunk.',
    tasks:[
      'Configure and verify firewall log forwarding from Palo Alto and FortiGate.',
      'Forward DMZ-1 web server logs to Splunk with appropriate timestamps, indexes and source metadata.',
      'Search for security events and the Rigby detection output, correlating events with the network origin and times.',
      'Document data sources, ingestion checks and searches without publishing credentials or sensitive logs.',
    ],
    evidence:['Both firewall log sources','DMZ-1 web logs in Splunk','Saved searches and sample results','P7 report'],
  },
  {
    id:'P8',
    title:'n8n, AI-assisted detection and Palo Alto blocking',
    goal:'Automatically identify a Rigby alert in Splunk and request a controlled containment action on the Palo Alto firewall.',
    tasks:[
      'Deploy n8n using Docker on the assigned lab host and protect its management credentials.',
      'Query Splunk for the P6 Rigby alert and extract the correct offending source IP.',
      'Add an AI-assisted assessment step with clear boundaries. Use a deterministic policy and allowlist before any firewall action.',
      'Use an approved Palo Alto integration to apply a scoped IP block. Avoid blocking trusted administrators, internal services or the lab gateway.',
      'Verify the new policy exists and the test source is blocked. Prove recovery/rollback of the temporary containment rule.',
      'Capture a real end-to-end test: harmless web request → Security Onion → Splunk → n8n → firewall verification.',
    ],
    evidence:['Docker n8n deployment','Workflow and Splunk query','Source-IP validation decision','Palo Alto block and rollback proof','Full P8 demo and project report'],
  },
];
export const BLUE_SOC_TEAM_REQUIREMENTS = [
  {id:'E1',title:'Team and soft-skills evaluation 1',tasks:['Complete the scheduled peer/team relationship evaluation.','Record participation, communication and constructive improvement actions.']},
  {id:'E2',title:'Team and soft-skills evaluation 2',tasks:['Complete the next peer/team evaluation.','Document contribution, teamwork and any issues resolved.']},
  {id:'E3',title:'Team and soft-skills evaluation 3',tasks:['Complete the final team/soft-skills evaluation.','Reflect on collaboration and project handoff.']},
  {id:'AB',title:'Above-and-beyond projects',tasks:['Propose an optional security improvement beyond the base rubric.','Submit the required illustrated memo, demonstration and evidence for pass/fail review.']},
  {id:'RT',title:'Authorized red-team testing',tasks:['Run approved vulnerability scans and penetration-test tools only against lab systems in scope.','Document findings, defensive changes and post-fix verification.']},
];
export const BLUE_SOC_TRAFFIC_SCENARIOS = [
  {id:'web',title:'Public web request',detail:'Outside user → Palo Alto NAT → DMZ-1 web server',nodes:['internet','palo','dmz','dmz1'],color:'#5eead4',outcome:'Expected: allow only approved HTTPS web access; public VIP/NAT still requires a verified configuration.'},
  {id:'vpn',title:'VPN and MFA',detail:'Admin → School VPN → Palo Alto → Duo / FreeRADIUS → Inside',nodes:['admin','school-vpn','palo','inside','duo','radius'],color:'#60a5fa',outcome:'Authentication path illustration only; actual authentication steps are not physical network hops.'},
  {id:'deny',title:'Blocked Secure access',detail:'Inside → FortiGate → Secure, deny by default',nodes:['n8n','inside','forti'],color:'#fb7185',outcome:'Expected: block Inside/DMZ attempts into Secure unless specifically authorized; verify with firewall logs.'},
  {id:'detect',title:'Security Onion detection',detail:'DMZ web request → IDS sensor → Splunk',nodes:['dmz1','onion','splunk'],color:'#fbbf24',outcome:'Logical mirror/alert path, not routed production traffic. Sensor visibility requires SPAN/tap setup.'},
  {id:'respond',title:'P8 automated response',detail:'Security Onion → Splunk → n8n → Palo Alto',nodes:['onion','splunk','n8n','palo'],color:'#c084fc',outcome:'Illustrative orchestration only. Live SIEM query and firewall change require authenticated back-end integration.'},
] as const;
