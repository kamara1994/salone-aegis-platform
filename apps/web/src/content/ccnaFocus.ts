/** Original CCNA-aligned written lab briefs. These are prompts only; no topology or answer key. */
export type CCNAFocusFormat = 'Guided & Basic Labs' | 'Scenario Labs' | 'Troubleshooting Labs' | 'Simlet Labs' | 'Automation Labs' | 'Challenge Mode';

export interface CCNAFocusBrief {
  id: string;
  domain: string;
  topic: string;
  title: string;
  format: CCNAFocusFormat;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  objectives: string[];
  scenario: string;
  tasks: string[];
  questions: string[];
  evidence: string[];
}

export const CCNA_FOCUS_FORMATS: CCNAFocusFormat[] = [
  'Guided & Basic Labs',
  'Scenario Labs',
  'Troubleshooting Labs',
  'Simlet Labs',
  'Automation Labs',
  'Challenge Mode',
];

export const CCNA_FOCUS_BRIEFS: CCNAFocusBrief[] = [
  {
    id: 'nf-components-topology', domain: '1 · Network Fundamentals', topic: 'Components and topology',
    title: 'Plan connectivity for a two-floor branch', format: 'Guided & Basic Labs', level: 'Beginner', objectives: ['1.1', '1.2', '1.12'],
    scenario: 'A company is opening a two-floor branch with employee workstations, Wi-Fi, a shared printer, a local server, and an internet connection. The site manager has a list of needs but no network design.',
    tasks: ['Match each requirement to a router, Layer 2/Layer 3 switch, firewall/IPS, access point/controller, endpoint, or server role.', 'Compare two-tier, three-tier, spine-leaf, WAN, and SOHO patterns; choose a suitable pattern for the branch and explain how cloud or on-premises services affect the design.', 'Explain the difference between server virtualization, containers, and VRFs, and identify where PoE is useful.'],
    questions: ['Which components forward frames locally, route between IP networks, and enforce security policy?', 'What factors make one topology a better fit than another?', 'What does PoE power, and how is a VRF different from a virtual machine?'],
    evidence: ['Component roles are mapped to the correct requirement.', 'Topology choices are compared by scale, resiliency, and traffic pattern.', 'Virtualization types and PoE are described without conflating their functions.'],
  },
  {
    id: 'nf-cable-interface', domain: '1 · Network Fundamentals', topic: 'Interfaces and cabling',
    title: 'Find the cause of a slow, error-prone uplink', format: 'Troubleshooting Labs', level: 'Beginner', objectives: ['1.3', '1.4'],
    scenario: 'A floor switch uplink is physically up, but file transfers are slow and interface errors increase during busy periods. A recent change replaced part of the cable run.',
    tasks: ['Compare copper, single-mode fiber, and multimode fiber against the distance and endpoint requirements; identify whether each link is shared media or point-to-point.', 'Inspect speed, duplex, collisions, errors, and physical-link evidence before changing settings.', 'Recommend a corrective action and a controlled way to verify it.'],
    questions: ['Which evidence points to a cable or transceiver issue?', 'How can a speed or duplex mismatch affect traffic?', 'What observation would show that the repair improved the link rather than merely resetting counters?'],
    evidence: ['The fault is tied to specific interface evidence.', 'The proposed medium matches distance and endpoint capability.', 'Verification includes before-and-after link state and error behavior.'],
  },
  {
    id: 'nf-ipv4-client', domain: '1 · Network Fundamentals', topic: 'IPv4, subnetting, and client parameters',
    title: 'Validate addressing after a workstation subnet change', format: 'Guided & Basic Labs', level: 'Beginner', objectives: ['1.6', '1.7', '1.10'],
    scenario: 'An office moved several workstations to a new subnet. One Windows client can reach nearby devices but not its default gateway; a Linux client on the same floor works normally.',
    tasks: ['Compare the clients’ IPv4 address, mask, default gateway, and DNS settings on Windows, macOS, and Linux.', 'Determine whether the affected address is inside the intended subnet and whether it is private IPv4 space.', 'Write a short finding that identifies the incorrect parameter and the evidence needed before correcting it.'],
    questions: ['What network and host portions result from the mask?', 'Is the configured gateway reachable on the local subnet?', 'Which client command or operating-system view would confirm each parameter?'],
    evidence: ['Subnet membership and private addressing are calculated correctly.', 'Client settings are read from appropriate Windows and Linux views.', 'The diagnosis distinguishes a local addressing error from a remote routing issue.'],
  },
  {
    id: 'nf-ipv6', domain: '1 · Network Fundamentals', topic: 'IPv6 addressing and address types',
    title: 'Identify why one IPv6 path is missing', format: 'Troubleshooting Labs', level: 'Intermediate', objectives: ['1.8', '1.9'],
    scenario: 'A dual-stack server is reachable over IPv4, but one workstation cannot open it over IPv6. The workstation shows more than one IPv6 address and a link-local next hop.',
    tasks: ['Check the IPv6 address and prefix on the client and server.', 'Classify supplied global unicast, unique-local, link-local, multicast, and anycast addresses.', 'Inspect an interface identifier and explain when modified EUI-64 formation is relevant.', 'Determine whether the client has the address and next-hop information required for the intended IPv6 path.'],
    questions: ['Which address is usable beyond the local link?', 'What is the role of a link-local address?', 'Does the prefix place the communicating endpoints on the intended network?', 'What does an anycast destination mean for delivery?'],
    evidence: ['IPv6 prefixes and address types are interpreted accurately.', 'Modified EUI-64 is explained as an address-formation method, not an address scope.', 'The next diagnostic step follows from the observed client parameters.'],
  },
  {
    id: 'nf-transport', domain: '1 · Network Fundamentals', topic: 'TCP and UDP',
    title: 'Choose the right transport behavior for two services', format: 'Simlet Labs', level: 'Intermediate', objectives: ['1.5'],
    scenario: 'A branch uses a transactional inventory application and a real-time voice stream. A capture summary shows retransmissions on one flow and occasional lost datagrams on the other.',
    tasks: ['Classify each flow by transport protocol using the supplied evidence.', 'Explain how connection setup, sequencing, acknowledgements, and retransmission affect each service.', 'Recommend what should be investigated at the application layer before blaming the network.'],
    questions: ['Which flow prioritizes reliable ordered delivery?', 'What does UDP itself do when a datagram is lost?', 'How can transport behavior influence perceived delay?'],
    evidence: ['TCP and UDP properties are compared accurately.', 'The protocol is not treated as a guarantee of application success.', 'The response connects observed behavior to the service requirement.'],
  },
  {
    id: 'nf-switching', domain: '1 · Network Fundamentals', topic: 'Ethernet switching concepts',
    title: 'Explain why a switch floods one frame but forwards another', format: 'Simlet Labs', level: 'Beginner', objectives: ['1.13'],
    scenario: 'A user reports that traffic reaches the correct device even though the switch has not learned its MAC address yet. A short event log and MAC table snapshot are provided.',
    tasks: ['Trace source MAC learning and destination lookup for each supplied frame.', 'Determine whether the switch forwards to one port or floods within the VLAN.', 'Explain what changes when a learned MAC entry ages out.'],
    questions: ['What information does the switch add to its MAC address table?', 'How does it handle a known unicast destination?', 'When is flooding expected, and what limits its scope?'],
    evidence: ['Learning, aging, forwarding, and flooding are applied in the correct order.', 'The answer accounts for VLAN scope.', 'The explanation follows the provided table and frame evidence.'],
  },
  {
    id: 'nf-wireless', domain: '1 · Network Fundamentals', topic: 'Wireless principles',
    title: 'Explain why two nearby clients have different Wi-Fi results', format: 'Simlet Labs', level: 'Beginner', objectives: ['1.11'],
    scenario: 'Two users sit in the same office. One has a stable wireless connection; the other sees retries and intermittent drops. Both can see the same SSID, but their channel and signal observations differ.',
    tasks: ['Interpret the supplied SSID, channel, RF, and encryption details.', 'Identify whether the evidence points to interference, coverage, or a security mismatch.', 'Recommend one measurement that would narrow the cause before changing the WLAN.'],
    questions: ['Are the channels overlapping or otherwise congested?', 'Does signal strength alone prove that the client can authenticate and pass traffic?', 'Which encryption setting must match between client and WLAN?'],
    evidence: ['SSID, nonoverlapping channel, RF, and encryption concepts are applied accurately.', 'The learner separates radio association from authentication and IP connectivity.', 'The recommended measurement tests the suspected cause.'],
  },
  {
    id: 'na-vlans-trunks', domain: '2 · Network Access', topic: 'VLANs and trunks',
    title: 'Restore staff and guest connectivity across two switches', format: 'Guided & Basic Labs', level: 'Beginner', objectives: ['2.1', '2.2'],
    scenario: 'Staff and guests share access switches on two floors. Staff devices must communicate with staff services across floors; guest devices must remain separated. After a switch replacement, one group loses cross-floor connectivity.',
    tasks: ['Define the data, voice, and guest access-port behavior, including the role of the default VLAN.', 'Compare VLAN membership and 802.1Q trunk operation at both ends, including the native VLAN.', 'State positive and negative connectivity tests that prove the requirements.'],
    questions: ['Which endpoint ports should carry one VLAN, and which link must carry multiple VLANs?', 'Do both ends agree on trunk operation, native VLAN, and required VLANs?', 'How will you prove staff reachability, voice separation, and guest isolation independently?'],
    evidence: ['The VLAN plan matches the stated separation requirements and accounts for a voice VLAN.', 'Trunk state and native VLAN are checked operationally on both sides.', 'Verification proves both permitted and prohibited paths.'],
  },
  {
    id: 'na-discovery', domain: '2 · Network Access', topic: 'Layer 2 discovery',
    title: 'Identify an undocumented switch connection', format: 'Simlet Labs', level: 'Beginner', objectives: ['2.3'],
    scenario: 'A technician finds an unlabeled cable in a rack. The link is active, but the inventory does not say which neighbor is connected or which remote interface it uses.',
    tasks: ['Use the available CDP or LLDP neighbor information to identify the remote device and port.', 'Compare the discovered neighbor with the expected rack inventory.', 'Record the connection and flag any mismatch for follow-up.'],
    questions: ['Which fields identify the neighbor, local interface, and remote interface?', 'What can discovery information confirm, and what does it not prove about authorization or physical cabling?'],
    evidence: ['The local and remote endpoints are transcribed without swapping their port labels.', 'The learner distinguishes discovery evidence from a security validation.'],
  },
  {
    id: 'na-stp-channel', domain: '2 · Network Access', topic: 'Spanning tree and EtherChannel',
    title: 'Explain a blocked link and an incomplete channel', format: 'Troubleshooting Labs', level: 'Advanced', objectives: ['2.4', '2.5'],
    scenario: 'A campus access layer has redundant switch links. One path is blocked by spanning tree as expected, while a proposed LACP bundle has fewer active members than the change record predicts.',
    tasks: ['Identify the root bridge, root/designated/alternate port roles, and forwarding or blocking states in the Rapid PVST+ evidence.', 'Determine whether the intended LACP EtherChannel is a Layer 2 or Layer 3 bundle, then compare member-link state at both ends.', 'Review PortFast, BPDU Guard, BPDU Filter, Root Guard, and Loop Guard for the stated port roles.'],
    questions: ['Which bridge is root and why?', 'Do the channel members and negotiation state agree at both endpoints?', 'What loop risk would increase if spanning tree or its protections were disabled?'],
    evidence: ['Rapid PVST+ roles and states are interpreted from evidence.', 'The EtherChannel diagnosis uses both endpoints and member state.', 'The prevention plan applies protections to the correct port roles.'],
  },
  {
    id: 'na-wireless-client', domain: '2 · Network Access', topic: 'Wireless architecture and WLAN GUI',
    title: 'A wireless client joins but receives the wrong access', format: 'Scenario Labs', level: 'Intermediate', objectives: ['2.6', '2.7', '2.9', '5.9', '5.10'],
    scenario: 'A staff client associates to the corporate SSID but receives guest access. Another client cannot join after a security-profile change. The wireless controller GUI and switch connection details are available for review.',
    tasks: ['Identify the wireless architecture and AP mode from the supplied controller and access-point details.', 'Trace the AP’s physical connection, including access/trunk and LAG roles, then follow the client from SSID through network mapping.', 'Review WLAN security, QoS profile, and advanced settings; separate association, authentication, address assignment, and authorization failures.'],
    questions: ['Which setting identifies the WLAN and its security policy?', 'Which mapping determines the client’s network?', 'What evidence distinguishes a credential failure from a VLAN or DHCP failure?'],
    evidence: ['The diagnosis follows the client path across controller, AP, and wired network.', 'WPA2-PSK behavior and the relevant GUI settings are identified.', 'Association, QoS, and end-to-end access are treated as distinct checks.'],
  },
  {
    id: 'ic-route-lookup', domain: '3 · IP Connectivity', topic: 'Routing table and forwarding',
    title: 'Choose the route the router will actually use', format: 'Simlet Labs', level: 'Intermediate', objectives: ['3.1', '3.2'],
    scenario: 'A router has several routes that could match a destination, including a learned route, a static route, and a default route. A user asks why traffic takes a path different from the one shown in the change note.',
    tasks: ['Read the route code, prefix, mask, next hop, administrative distance, and metric.', 'Determine the installed route and the forwarding decision for each supplied destination.', 'Explain when a default route is selected.'],
    questions: ['Which matching prefix is longest?', 'If prefixes tie, what route-selection factors matter next?', 'Does the route point to a reachable next hop?'],
    evidence: ['The selected route is justified in the correct order.', 'Prefix and mask are interpreted accurately.', 'The explanation distinguishes route presence from successful end-to-end delivery.'],
  },
  {
    id: 'ic-static-failover', domain: '3 · IP Connectivity', topic: 'IPv4 and IPv6 static routes',
    title: 'Design a primary route with a verified backup', format: 'Scenario Labs', level: 'Intermediate', objectives: ['3.3'],
    scenario: 'A branch has a primary WAN path and a lower-capacity backup. The current route configuration sends traffic over the backup even while the primary circuit is healthy.',
    tasks: ['Review the IPv4 and IPv6 route entries and next-hop reachability.', 'Explain the role of network, host, default, and floating static routes in this requirement.', 'Write a verification and rollback checklist for a proposed correction.'],
    questions: ['Which route is installed for each destination and why?', 'What makes the backup less preferred?', 'How will the backup be tested without leaving it as the normal path?'],
    evidence: ['The route choice follows prefix and route preference rules.', 'The failover condition is explicit and testable.', 'The change includes a safe rollback trigger.'],
  },
  {
    id: 'ic-ospf-fhrp', domain: '3 · IP Connectivity', topic: 'Single-area OSPF and first-hop redundancy',
    title: 'A router neighbor is down and gateway failover is unproven', format: 'Troubleshooting Labs', level: 'Advanced', objectives: ['3.4', '3.5'],
    scenario: 'After maintenance, a single-area OSPF neighbor does not return. A static route hides part of the outage, and the operations team has not verified the redundant default gateway.',
    tasks: ['Compare OSPF interface participation, area, timers, network type, and router ID.', 'Determine the observed neighbor state and the first condition preventing adjacency; for a broadcast segment, identify the DR/BDR evidence.', 'Review the first-hop redundancy role and state the failover test needed after routing is restored.'],
    questions: ['Which OSPF parameters must align for the expected adjacency?', 'Which routes depend on this neighbor?', 'What proves the standby gateway can take over and still reach upstream networks?'],
    evidence: ['The first adjacency fault is identified from evidence, not guessed.', 'The learner distinguishes routing-protocol adjacency from gateway redundancy.', 'Verification covers both route learning and client gateway continuity.'],
  },
  {
    id: 'is-dhcp-dns-relay', domain: '4 · IP Services', topic: 'DHCP, DNS, and relay',
    title: 'New clients get leases but cannot find the application', format: 'Troubleshooting Labs', level: 'Beginner', objectives: ['4.3', '4.6'],
    scenario: 'New clients receive IP addresses, but users cannot reach an internal service by name. Manually configured clients still work. The DHCP server is on a different subnet from the affected clients.',
    tasks: ['Inspect the client lease, including address, gateway, and resolver settings.', 'Trace whether the DHCP request can reach its server across the routed boundary.', 'Compare name-based access with direct-IP access to isolate DNS from routing.'],
    questions: ['Is the lease in the correct subnet and are its options appropriate?', 'Is a DHCP relay required on the client gateway?', 'Does the DNS response point to the expected service address?'],
    evidence: ['Lease, relay, and resolver findings are kept distinct.', 'The learner identifies the failing service boundary.', 'Both client-side and network-side verification are proposed.'],
  },
  {
    id: 'is-nat', domain: '4 · IP Services', topic: 'NAT and address translation',
    title: 'Trace a failed outbound translation', format: 'Troubleshooting Labs', level: 'Intermediate', objectives: ['4.1'],
    scenario: 'After an edge-router change, one inside subnet reaches the internet while another does not. The routing table appears complete, and the team suspects an address-pool or translation rule issue.',
    tasks: ['Compare static inside-source translation and pool-based translation against the working and failing source addresses.', 'Inspect whether translation state is created and whether the selected outside address is usable.', 'Trace the expected response path and identify what evidence would confirm successful return traffic.'],
    questions: ['Which inside sources match the translation policy?', 'Is the correct interface treated as inside or outside?', 'Does the translated source have a valid return path?'],
    evidence: ['Translation behavior is distinguished from route selection.', 'The explanation accounts for both outbound and return traffic.', 'The proposed verification checks an actual flow, not only configuration presence.'],
  },
  {
    id: 'is-ntp', domain: '4 · IP Services', topic: 'NTP',
    title: 'Correct clock drift before investigating an incident timeline', format: 'Guided & Basic Labs', level: 'Beginner', objectives: ['4.2'],
    scenario: 'Switch and router logs differ by several minutes, making it difficult to correlate a user report with a network change. All devices are expected to synchronize to the organization’s approved time source.',
    tasks: ['Identify which device is the intended NTP server and which devices act as clients.', 'Review synchronization state and measured offset.', 'Distinguish incorrect clock time from a display-timezone difference and define a post-change check.'],
    questions: ['Which source is authoritative for this network?', 'What proves a device is synchronized rather than merely configured?', 'How will corrected time improve cross-device event correlation?'],
    evidence: ['Client and server roles are identified correctly.', 'Synchronization status is checked directly.', 'The verification compares timestamps from more than one device.'],
  },
  {
    id: 'is-monitoring', domain: '4 · IP Services', topic: 'SNMP and syslog',
    title: 'Restore useful monitoring without drowning the collector', format: 'Troubleshooting Labs', level: 'Intermediate', objectives: ['4.4', '4.5'],
    scenario: 'A central operations team sees gaps in interface monitoring and a surge of low-value messages after a maintenance change. The network devices remain reachable.',
    tasks: ['Explain what SNMP polling or notifications contribute to network operations.', 'Interpret the supplied syslog facility, severity, timestamp, and message.', 'Recommend a monitoring adjustment that preserves high-value events and avoids hiding faults.'],
    questions: ['Which event level requires immediate attention?', 'Is the missing information an SNMP visibility issue or a syslog delivery issue?', 'What evidence would show the collector receives useful events after the change?'],
    evidence: ['SNMP and syslog roles are differentiated.', 'Severity and facility are interpreted in context.', 'The proposed change retains actionable events and includes a verification method.'],
  },
  {
    id: 'is-qos-transfer', domain: '4 · IP Services', topic: 'QoS and file services',
    title: 'Protect voice during congestion and verify a device-file transfer', format: 'Scenario Labs', level: 'Advanced', objectives: ['4.7', '4.9'],
    scenario: 'A remote site experiences choppy voice during large file transfers. The network team must explain where congestion is handled and safely retrieve a device file for maintenance.',
    tasks: ['Follow the voice flow through classification, marking, queuing, and the congested link.', 'Distinguish policing from shaping for the stated traffic behavior.', 'Select the appropriate TFTP or FTP use for the file transfer and state how the retrieved file will be validated.'],
    questions: ['At what hop does the traffic encounter congestion?', 'Which QoS action drops or delays traffic, and which buffers it?', 'What does the chosen file-transfer service provide or omit?'],
    evidence: ['QoS actions are matched to the described behavior.', 'The file-transfer choice is technically appropriate.', 'The procedure checks file identity or integrity before further use.'],
  },
  {
    id: 'sf-secure-management', domain: '5 · Security Fundamentals', topic: 'Device access and secure management',
    title: 'Harden remote administration without losing recovery access', format: 'Guided & Basic Labs', level: 'Beginner', objectives: ['2.8', '4.8', '5.1', '5.3', '5.4', '5.8'],
    scenario: 'A security review finds shared credentials and unencrypted remote management on an access device. Administrators must secure access while preserving a tested emergency recovery method.',
    tasks: ['Identify threats, exposed services, and the impact of shared credentials.', 'Compare console, SSH/HTTPS, centralized TACACS+/RADIUS, and cloud-managed access for the stated administrative need.', 'Specify local password controls and encrypted remote administration; preserve a tested console recovery path.', 'Describe how authentication, authorization, and accounting differ, and when a centralized identity service may be used.'],
    questions: ['How will an administrator verify the device identity?', 'Which password policy, MFA, certificate, or biometric alternative fits the stated risk?', 'What evidence proves SSH works and the unencrypted management method is no longer available?'],
    evidence: ['The plan limits management exposure and preserves recovery.', 'AAA and password-policy elements are used correctly.', 'Verification confirms secure access and removal of the insecure path.'],
  },
  {
    id: 'sf-people-physical', domain: '5 · Security Fundamentals', topic: 'Security awareness and physical access',
    title: 'Respond to an unknown visitor in a network room', format: 'Scenario Labs', level: 'Beginner', objectives: ['5.1', '5.2'],
    scenario: 'A visitor is found near an unlocked network closet during a busy office move. A staff member says the visitor claimed to be a contractor, but no work order is available.',
    tasks: ['Identify the threat, vulnerable condition, potential impact, and immediate mitigation.', 'Choose how to verify authorization without confronting the person unsafely or destroying evidence.', 'State what staff awareness guidance and physical access controls would reduce recurrence.'],
    questions: ['Which facts are confirmed and which are assumptions?', 'What should be documented and escalated?', 'How do training and physical controls complement technical network security?'],
    evidence: ['The response prioritizes safety and evidence preservation.', 'Threat, vulnerability, exploit opportunity, and mitigation are distinguished.', 'The prevention plan includes both user awareness and physical access control.'],
  },
  {
    id: 'sf-acl-vpn', domain: '5 · Security Fundamentals', topic: 'ACLs and VPNs',
    title: 'Permit a business service while keeping other traffic blocked', format: 'Scenario Labs', level: 'Intermediate', objectives: ['5.5', '5.6'],
    scenario: 'A remote office needs access to one application at headquarters. The security team requires the traffic to use an approved VPN path and prohibits broad access to unrelated internal networks.',
    tasks: ['Translate the business requirement into source, destination, protocol, and service boundaries.', 'Review the ACL order and identify which rule matches the intended flow.', 'Explain how IPsec site-to-site VPN differs from IPsec remote-access VPN for this scenario.'],
    questions: ['Which direction and interface should be evaluated?', 'Could an earlier rule shadow the intended permit?', 'What tests prove the application is reachable while unrelated traffic remains denied?'],
    evidence: ['The least-privilege policy is clear and testable.', 'Rule order and implicit behavior are considered.', 'VPN use is tied to the stated site-to-site requirement.'],
  },
  {
    id: 'sf-layer2-wireless', domain: '5 · Security Fundamentals', topic: 'Layer 2 and wireless security',
    title: 'Contain an untrusted DHCP offer and review WLAN protection', format: 'Troubleshooting Labs', level: 'Advanced', objectives: ['5.7', '5.9', '5.10'],
    scenario: 'Clients on one access switch receive an unexpected gateway. Separately, a wireless profile is being reviewed before staff move to a stronger approved security configuration.',
    tasks: ['Trace the unexpected DHCP offer and inspect the relevant trust boundary and learned binding evidence.', 'Explain how DHCP snooping, Dynamic ARP Inspection, and port security address different risks.', 'Review the WLAN security choice and identify the client test needed after the profile change.'],
    questions: ['Which port supplied the offer, and should it be trusted?', 'What evidence supports or contradicts an ARP spoofing concern?', 'Which WPA, WPA2, or WPA3 mode is configured, and does the client support it?', 'Does the WLAN use the intended security mode and shared key policy?'],
    evidence: ['Each Layer 2 control is matched to its purpose.', 'Containment preserves the approved DHCP path.', 'Wireless authentication is verified separately from client network access and the selected protocol is appropriate.'],
  },
  {
    id: 'ap-api-json', domain: '6 · Automation and Programmability', topic: 'Controllers, APIs, JSON, and automation',
    title: 'Review a controller change before it reaches production', format: 'Automation Labs', level: 'Intermediate', objectives: ['6.1', '6.2', '6.3', '6.4', '6.5', '6.6', '6.7'],
    scenario: 'An automation job reads device inventory from a controller, proposes a policy update, and reports success even though the network state did not change. The team needs a safe review before rerunning it.',
    tasks: ['Compare traditional device-by-device management with controller-based management; identify underlay, overlay, fabric, and control/data-plane roles.', 'Inspect JSON structure, encoding, field types, and missing or null values.', 'Review API authentication type, resource path, HTTP method, request body, response, CRUD operation, and northbound/southbound API direction.', 'Describe how Ansible or Terraform plans should be reviewed before changes are applied, and where predictive or generative AI suggestions still require human validation.'],
    questions: ['Was the operation read, create, update, or delete, and which HTTP verb expresses it?', 'Did the response mean accepted, completed, or merely received?', 'What read-after-write check proves the intended state?', 'Where could predictive or generative AI help, and what must remain validated by an operator?'],
    evidence: ['The API exchange is evaluated from request and response evidence.', 'JSON structure and types are interpreted correctly.', 'A safe plan, explicit verification, and human review are included.'],
  },
  {
    id: 'ccna-cross-domain-outage', domain: 'CCNA · Integrated skills', topic: 'Cross-domain troubleshooting',
    title: 'Restore the branch application and prove guest isolation', format: 'Challenge Mode', level: 'Advanced', objectives: ['2.1', '2.2', '3.1', '3.2', '4.3', '4.6', '5.6'],
    scenario: 'A branch reports that staff cannot reach a hosted application, newly connected clients receive inconsistent network settings, and a guest device can reach more internal resources than policy allows. The change window is nearly over; the operations lead needs an evidence-backed recovery plan.',
    tasks: ['Rank the three symptoms by user impact and identify which evidence you need before making changes.', 'Trace one staff flow from client addressing through switching and routing to the application.', 'Investigate the DHCP path and verify the client’s address, gateway, and DNS settings.', 'Review the guest access policy and state how to test both allowed and denied traffic.', 'Present the smallest safe correction sequence and a rollback trigger for each change.'],
    questions: ['Which observation most quickly separates a client configuration issue from a routed-path issue?', 'What evidence proves the application path is restored end to end?', 'How will you show guest isolation is enforced without blocking legitimate guest internet access?', 'What conditions require escalation instead of another change?'],
    evidence: ['The investigation is prioritized by impact and uses evidence before changes.', 'Client settings, VLAN/trunk behavior, route selection, DHCP relay, and ACL policy are treated as separate checkpoints.', 'Both service restoration and the required security boundary are verified.', 'The plan includes rollback and escalation criteria.'],
  },
];
