// IOS command grammar for context help (?), Tab completion and ambiguity checks.
// The executor in cli.ts still runs the commands; this tree only describes what can be typed in each
// mode, the way IOS answers "show ?" or completes "conf<Tab>". Keep it in step with cli.ts.

export type IosMode = 'user' | 'priv' | 'config' | 'if' | 'router' | 'vlan' | 'line' | 'dhcp' | 'acl';

export interface GNode {
  kw: string;
  help: string;
  /** Placeholder for a value (WORD, <1-4094>, A.B.C.D…). Matches any token. */
  arg?: boolean;
  next?: GNode[];
  /** The command is complete here (IOS shows <cr>). */
  cr?: boolean;
}

const k = (kw: string, help: string, next?: GNode[], cr = !next): GNode => ({ kw, help, next, cr });
const a = (kw: string, help: string, next?: GNode[], cr = !next): GNode => ({ kw, help, arg: true, next, cr });
const IP = (help: string, next?: GNode[]) => a('A.B.C.D', help, next);
const VLANS = a('WORD', 'VLAN IDs of the allowed VLANs, e.g. 10,20,30-35');
const IFACE_TYPES = [
  k('GigabitEthernet', 'GigabitEthernet IEEE 802.3z', [a('<0-9>/<0-48>', 'Interface number')]),
  k('FastEthernet', 'FastEthernet IEEE 802.3', [a('<0-9>/<0-48>', 'Interface number')]),
  k('Serial', 'Serial', [a('<0-9>/<0-9>/<0-9>', 'Interface number')]),
  k('Vlan', 'Catalyst VLANs', [a('<1-4094>', 'Vlan interface number')]),
  k('Loopback', 'Loopback interface', [a('<0-2147483647>', 'Loopback interface number')]),
  k('Port-channel', 'Ethernet Channel of interfaces', [a('<1-128>', 'Port-channel interface number')]),
  k('Tunnel', 'Tunnel interface', [a('<0-2147483647>', 'Tunnel interface number')]),
  k('range', 'interface range command', [a('LINE', 'Interface range, e.g. g0/1 - 4')]),
];
const IFACE_ARG = [a('WORD', 'Interface, e.g. g0/1')];
const CR_ONLY = undefined;

const SHOW: GNode[] = [
  k('access-lists', 'List access lists', [a('WORD', 'ACL name or number')], true),
  k('arp', 'ARP table'),
  k('cdp', 'CDP information', [k('neighbors', 'CDP neighbor entries')]),
  k('clock', 'Display the system clock'),
  k('etherchannel', 'EtherChannel information', [k('summary', 'One-line summary per channel-group')]),
  k('history', 'Display the session command history'),
  k('interfaces', 'Interface status and configuration', [k('status', 'Show interface line status', [k('err-disabled', 'Show only err-disabled ports')], true), k('trunk', 'Show interface trunk information'), a('WORD', 'Interface name, e.g. g0/1', [k('switchport', 'Show interface switchport information')], true)], true),
  k('ip', 'IP information', [
    k('interface', 'IP interface status and configuration', [k('brief', 'Brief summary of IP status and configuration')]),
    k('route', 'IP routing table'),
    k('ospf', 'OSPF information', [k('neighbor', 'Neighbor list')]),
    k('eigrp', 'IP-EIGRP show commands', [k('neighbors', 'IP-EIGRP neighbors')]),
    k('protocols', 'IP routing protocol process parameters and statistics'),
    k('nat', 'IP NAT information', [k('translations', 'Translation entries')]),
    k('dhcp', 'Show items in the DHCP database', [k('pool', 'DHCP pools information'), k('snooping', 'DHCP snooping', [k('binding', 'DHCP snooping bindings')], true)]),
    k('arp', 'IP ARP table', [k('inspection', 'Show ARP inspection information')], true),
  ]),
  k('lldp', 'LLDP information', [k('neighbors', 'LLDP neighbor entries')]),
  k('logging', 'Show the contents of logging buffers'),
  k('mac', 'MAC configuration', [k('address-table', 'MAC forwarding table')]),
  k('monitor', 'SPAN information'),
  k('port-security', 'Show secure port information', [k('interface', 'Show secure interface', IFACE_ARG)], true),
  k('power', 'Power information', [k('inline', 'Inline power status')]),
  k('running-config', 'Current operating configuration'),
  k('spanning-tree', 'Spanning tree topology'),
  k('standby', 'HSRP information'),
  k('startup-config', 'Contents of startup configuration'),
  k('users', 'Display information about terminal lines'),
  k('version', 'System hardware and software status'),
  k('vlan', 'VTP VLAN status', [k('brief', 'VTP all VLAN status in brief')], true),
  k('vrrp', 'VRRP information'),
  k('glbp', 'GLBP information'),
  k('vtp', 'VTP information', [k('status', 'VTP domain status')]),
];
const PING = [a('WORD', 'Ping destination address or hostname', [k('repeat', 'Specify repeat count', [a('<1-2147483647>', 'Repeat count')])], true)];
const TRACE = [a('WORD', 'Trace route to destination address or hostname')];
const EXEC_COMMON = [k('exit', 'Exit from the EXEC'), k('ping', 'Send echo messages', PING), k('show', 'Show running system information', SHOW), k('traceroute', 'Trace route to destination', TRACE)];

export const GRAMMAR: Record<IosMode, GNode[]> = {
  user: [k('enable', 'Turn on privileged commands'), ...EXEC_COMMON],
  priv: [
    k('clear', 'Reset functions', [k('port-security', 'Clear secure MAC addresses', [k('sticky', 'Clear sticky secure addresses', [k('interface', 'Interface', IFACE_ARG)], true)])]),
    k('configure', 'Enter configuration mode', [k('terminal', 'Configure from the terminal')]),
    k('copy', 'Copy from one file to another', [k('running-config', 'Copy from current system configuration', [k('startup-config', 'Copy to startup configuration')])]),
    k('disable', 'Turn off privileged commands'),
    k('enable', 'Turn on privileged commands'),
    k('reload', 'Halt and perform a cold restart'),
    k('terminal', 'Set terminal line parameters', [k('length', 'Set number of lines on a screen', [a('<0-512>', 'Number of lines')])]),
    k('write', 'Write running configuration to memory', [k('memory', 'Write to NV memory')], true),
    ...EXEC_COMMON,
  ],
  config: [
    k('access-list', 'Add an access list entry', [a('<1-199>', 'IP access list number', [k('permit', 'Specify packets to forward', [a('LINE', 'Source/destination and options')]), k('deny', 'Specify packets to reject', [a('LINE', 'Source/destination and options')]), k('remark', 'Access list entry comment', [a('LINE', 'Comment up to 100 characters')])])]),
    k('banner', 'Define a login banner', [k('motd', 'Set Message of the Day banner', [a('LINE', 'c banner-text c, where c is a delimiting character')])]),
    k('crypto', 'Encryption module', [k('key', 'Long term key operations', [k('generate', 'Generate new keys', [k('rsa', 'Generate RSA keys')])])]),
    k('do', 'To run exec commands in config mode', [a('LINE', 'Exec command')]),
    k('enable', 'Modify enable password parameters', [k('secret', 'Assign the privileged level secret', [a('LINE', 'The UNENCRYPTED (cleartext) enable secret')])]),
    k('end', 'Exit from configure mode'),
    k('exit', 'Exit from configure mode'),
    k('hostname', 'Set system\'s network name', [a('WORD', 'This system\'s network name')]),
    k('interface', 'Select an interface to configure', IFACE_TYPES),
    k('ip', 'Global IP configuration subcommands', [
      k('access-list', 'Named access list', [k('standard', 'Standard Access List', [a('WORD', 'Access-list name')]), k('extended', 'Extended Access List', [a('WORD', 'Access-list name')])]),
      k('default-gateway', 'Specify default gateway (if not routing IP)', [IP('IP address of default gateway')]),
      k('dhcp', 'Configure DHCP server and relay parameters', [k('pool', 'Configure DHCP address pools', [a('WORD', 'Pool name')]), k('excluded-address', 'Prevent DHCP from assigning certain addresses', [IP('Low IP address', [IP('High IP address')])]), k('snooping', 'DHCP Snooping', [k('vlan', 'DHCP Snooping vlan', [VLANS])], true)]),
      k('arp', 'IP ARP global configuration', [k('inspection', 'Arp Inspection configuration', [k('vlan', 'Enable/Disable ARP Inspection on vlans', [VLANS])])]),
      k('domain-name', 'Define the default domain name', [a('WORD', 'Default domain name')]),
      k('nat', 'NAT configuration commands', [k('inside', 'Inside address translation', [k('source', 'Source address translation', [a('LINE', 'list <acl> interface <if> overload | static <local> <global>')])])]),
      k('route', 'Establish static routes', [IP('Destination prefix', [IP('Destination prefix mask', [a('WORD', 'Forwarding router\'s address or interface')])])]),
      k('routing', 'Enable IP routing'),
    ]),
    k('line', 'Configure a terminal line', [k('console', 'Primary terminal line', [a('<0-0>', 'First Line number')]), k('vty', 'Virtual terminal', [a('<0-15>', 'First Line number', [a('<1-15>', 'Last Line number')], true)])]),
    k('monitor', 'Monitoring different system events', [k('session', 'Configure a SPAN session', [a('<1-66>', 'SPAN session number', [a('LINE', 'source | destination interface <if>')])])]),
    k('no', 'Negate a command or set its defaults', [a('LINE', 'Command to negate')]),
    k('router', 'Enable a routing process', [k('ospf', 'Open Shortest Path First (OSPF)', [a('<1-65535>', 'Process ID')]), k('eigrp', 'Enhanced Interior Gateway Routing Protocol (EIGRP)', [a('<1-65535>', 'Autonomous System')])]),
    k('service', 'Modify use of network based services', [k('password-encryption', 'Encrypt system passwords')]),
    k('spanning-tree', 'Spanning Tree Subsystem', [k('mode', 'Spanning tree operating mode', [k('pvst', 'Per-Vlan spanning tree mode'), k('rapid-pvst', 'Per-Vlan rapid spanning tree mode'), k('mst', 'Multiple spanning tree mode')]), k('portfast', 'Spanning tree portfast options', [k('default', 'Enable portfast by default on all access ports'), k('bpduguard', 'Enable portfast bpdu guard on this switch', [k('default', 'Enable bpdu guard by default on all portfast ports')])]), k('vlan', 'VLAN Switch Spanning Tree', [a('WORD', 'vlan range, example: 1,3-5,7,9-11', [k('priority', 'Set the bridge priority for the spanning tree', [a('<0-61440>', 'bridge priority in increments of 4096')]), k('root', 'Configure switch as root', [k('primary', 'Configure this switch as primary root for this spanning tree'), k('secondary', 'Configure switch as secondary root')])], true)])]),
    k('username', 'Establish User Name Authentication', [a('WORD', 'User name', [k('secret', 'Specify the secret for the user', [a('LINE', 'The UNENCRYPTED (cleartext) user secret')]), k('privilege', 'Set user privilege level', [a('<0-15>', 'User privilege level')], true)])]),
    k('vlan', 'Vlan commands', [a('WORD', 'ISL VLAN IDs 1-4094')]),
    k('vtp', 'Configure global VTP state', [k('mode', 'Set the mode for VTP', [k('server', 'Set the device to server mode'), k('client', 'Set the device to client mode'), k('transparent', 'Set the device to transparent mode'), k('off', 'Set the device to off mode')]), k('domain', 'Set the name of the VTP administrative domain', [a('WORD', 'The ascii name for the VTP administrative domain')]), k('password', 'Set the password for the VTP administrative domain', [a('WORD', 'The ascii password')])]),
  ],
  if: [
    k('channel-group', 'Etherchannel/port bundling configuration', [a('<1-128>', 'Channel group number', [k('mode', 'Etherchannel Mode of the interface', [k('active', 'Enable LACP unconditionally'), k('passive', 'Enable LACP only if a LACP device is detected'), k('on', 'Enable Etherchannel only'), k('desirable', 'Enable PAgP unconditionally'), k('auto', 'Enable PAgP only if a PAgP device is detected')])])]),
    k('description', 'Interface specific description', [a('LINE', 'Up to 240 characters describing this interface')]),
    k('do', 'To run exec commands in config mode', [a('LINE', 'Exec command')]),
    k('duplex', 'Configure duplex operation', [k('auto', 'Enable AUTO duplex configuration'), k('full', 'Force full duplex operation'), k('half', 'Force half-duplex operation')]),
    k('encapsulation', 'Set encapsulation type for an interface', [k('dot1Q', 'IEEE 802.1Q Virtual LAN', [a('<1-4094>', 'IEEE 802.1Q VLAN ID')])]),
    k('end', 'Exit from configure mode'),
    k('exit', 'Exit from interface configuration mode'),
    k('interface', 'Select an interface to configure', IFACE_TYPES),
    k('ip', 'Interface Internet Protocol config commands', [
      k('access-group', 'Specify access control for packets', [a('WORD', 'Access-list name or number', [k('in', 'inbound packets'), k('out', 'outbound packets')])]),
      k('address', 'Set the IP address of an interface', [IP('IP address', [IP('IP subnet mask')]), k('dhcp', 'IP Address negotiated via DHCP')]),
      k('helper-address', 'Specify a destination address for UDP broadcasts', [IP('IP destination address')]),
      k('nat', 'NAT interface commands', [k('inside', 'Inside interface for address translation'), k('outside', 'Outside interface for address translation')]),
      k('ospf', 'OSPF interface commands', [a('<1-65535>', 'Process ID', [k('area', 'Set the OSPF area ID', [a('<0-4294967295>', 'OSPF area ID')])]), k('cost', 'Interface cost', [a('<1-65535>', 'Cost')]), k('hello-interval', 'Time between HELLO packets', [a('<1-65535>', 'Seconds')]), k('dead-interval', 'Interval after which a neighbor is declared dead', [a('<1-65535>', 'Seconds')])]),
      k('dhcp', 'DHCP', [k('snooping', 'DHCP Snooping configuration', [k('trust', 'DHCP Snooping trust config')])]),
      k('arp', 'Configure ARP features', [k('inspection', 'Arp Inspection configuration', [k('trust', 'Configure Trust state')])]),
    ]),
    k('mtu', 'Set the interface Maximum Transmission Unit (MTU)', [a('<64-9216>', 'MTU size in bytes')]),
    k('no', 'Negate a command or set its defaults', [a('LINE', 'Command to negate')]),
    k('shutdown', 'Shutdown the selected interface'),
    k('spanning-tree', 'Spanning Tree Subsystem', [k('portfast', 'Portfast options for the interface'), k('bpduguard', 'Don\'t accept BPDUs on this interface', [k('enable', 'Enable BPDU guard for this interface')]), k('guard', 'Change an interface\'s spanning tree guard mode', [k('root', 'Set guard mode to root guard on interface')])]),
    k('speed', 'Configure speed operation', [k('10', 'Force 10 Mbps operation'), k('100', 'Force 100 Mbps operation'), k('1000', 'Force 1000 Mbps operation'), k('auto', 'Enable AUTO speed configuration')]),
    k('standby', 'HSRP interface configuration commands', [a('<0-255>', 'group number', [k('ip', 'Enable HSRP and set the virtual IP address', [IP('Virtual IP address')]), k('priority', 'Priority level', [a('<0-255>', 'Priority value')]), k('preempt', 'Overthrow lower priority Active routers')])]),
    k('switchport', 'Set switching mode characteristics', [
      k('access', 'Set access mode characteristics of the interface', [k('vlan', 'Set VLAN when interface is in access mode', [a('<1-4094>', 'VLAN ID of the VLAN when this port is in access mode')])]),
      k('mode', 'Set trunking mode of the interface', [k('access', 'Set trunking mode to ACCESS unconditionally'), k('trunk', 'Set trunking mode to TRUNK unconditionally'), k('dynamic', 'Set trunking mode to dynamically negotiate access or trunk mode', [k('auto', 'Set trunking mode dynamic negotiation parameter to AUTO'), k('desirable', 'Set trunking mode dynamic negotiation parameter to DESIRABLE')])]),
      k('nonegotiate', 'Device will not engage in negotiation protocol on this interface'),
      k('port-security', 'Security related command', [k('maximum', 'Max secure addresses', [a('<1-132>', 'Maximum addresses')]), k('violation', 'Security violation mode', [k('protect', 'Security violation protect mode'), k('restrict', 'Security violation restrict mode'), k('shutdown', 'Security violation shutdown mode')]), k('mac-address', 'Secure mac address', [k('sticky', 'Configure dynamic secure addresses as sticky'), a('H.H.H', '48 bit mac address')])], true),
      k('trunk', 'Set trunking characteristics of the interface', [k('allowed', 'Set allowed VLAN characteristics when interface is in trunking mode', [k('vlan', 'Set allowed VLANs when interface is in trunking mode', [k('add', 'add VLANs to the current list', [VLANS]), k('remove', 'remove VLANs from the current list', [VLANS]), k('all', 'all VLANs'), k('except', 'all VLANs except the following', [VLANS]), k('none', 'no VLANs'), VLANS])]), k('native', 'Set trunking native characteristics when interface is in trunking mode', [k('vlan', 'Set native VLAN when interface is in trunking mode', [a('<1-4094>', 'VLAN ID of the native VLAN when this port is in trunking mode')])])]),
      k('voice', 'Voice appliance attributes', [k('vlan', 'Vlan for voice traffic', [a('<1-4094>', 'Vlan for voice traffic')])]),
    ], true),
    k('vrrp', 'VRRP Interface configuration commands', [a('<1-255>', 'Group number', [k('ip', 'Enable Virtual Router Redundancy Protocol (VRRP) for IP', [IP('Virtual router IP address')]), k('priority', 'Priority of this VRRP group', [a('<1-254>', 'Priority value')]), k('preempt', 'Enable preemption of lower priority Master')])]),
  ],
  router: [
    k('default-information', 'Control distribution of default information', [k('originate', 'Distribute a default route')]),
    k('do', 'To run exec commands in config mode', [a('LINE', 'Exec command')]),
    k('end', 'Exit from configure mode'),
    k('exit', 'Exit from routing protocol configuration mode'),
    k('network', 'Enable routing on an IP network', [IP('Network number', [IP('OSPF wild card bits', [k('area', 'Set the OSPF area ID', [a('<0-4294967295>', 'OSPF area ID')])])], )]),
    k('no', 'Negate a command or set its defaults', [a('LINE', 'Command to negate')]),
    k('passive-interface', 'Suppress routing updates on an interface', IFACE_ARG),
    k('router-id', 'router-id for this OSPF process', [IP('OSPF router-id in IP address format')]),
  ],
  vlan: [k('end', 'Exit from configure mode'), k('exit', 'Apply changes, bump revision number, and exit mode'), k('name', 'Ascii name of the VLAN', [a('WORD', 'The ascii name for the VLAN')]), k('no', 'Negate a command or set its defaults', [a('LINE', 'Command to negate')])],
  line: [k('end', 'Exit from configure mode'), k('exec-timeout', 'Set the EXEC timeout', [a('<0-35791>', 'Timeout in minutes', [a('<0-2147483>', 'Timeout in seconds')], true)]), k('exit', 'Exit from line configuration mode'), k('logging', 'Modify message logging facilities', [k('synchronous', 'Synchronized message output')]), k('login', 'Enable password checking', [k('local', 'Local password checking')], true), k('password', 'Set a password', [a('LINE', 'The UNENCRYPTED (cleartext) line password')]), k('transport', 'Define transport protocols for line', [k('input', 'Define which protocols to use when connecting to the terminal server', [k('ssh', 'TCP/IP SSH protocol'), k('telnet', 'TCP/IP Telnet protocol'), k('all', 'All protocols'), k('none', 'No protocols')])])],
  dhcp: [k('default-router', 'Default routers', [IP('Router\'s IP address')]), k('dns-server', 'DNS servers', [IP('Server\'s IP address')]), k('end', 'Exit from configure mode'), k('exit', 'Exit from DHCP pool configuration mode'), k('network', 'Network number and mask', [IP('Network number in dotted-decimal notation', [IP('Network mask')])])],
  acl: [k('deny', 'Specify packets to reject', [a('LINE', 'Protocol, source and destination')]), k('end', 'Exit from configure mode'), k('exit', 'Exit from access-list configuration mode'), k('no', 'Negate a command or set its defaults', [a('<1-2147483647>', 'Sequence Number')]), k('permit', 'Specify packets to forward', [a('LINE', 'Protocol, source and destination')]), k('remark', 'Access list entry comment', [a('LINE', 'Comment up to 100 characters')])],
};
void CR_ONLY;

const matches = (nodes: GNode[], token: string) => {
  const t = token.toLowerCase();
  const exact = nodes.find((n) => !n.arg && n.kw.toLowerCase() === t);
  if (exact) return [exact];
  const kws = nodes.filter((n) => !n.arg && n.kw.toLowerCase().startsWith(t));
  return kws.length ? kws : nodes.filter((n) => n.arg);
};

/** Walks the tokens; returns the nodes available after them, or why the walk stopped. */
function walk(mode: IosMode, tokens: string[]): { nodes: GNode[]; at?: GNode; error?: 'ambiguous' | 'invalid'; bad?: string } {
  let nodes = GRAMMAR[mode];
  let at: GNode | undefined;
  for (const t of tokens) {
    const m = matches(nodes, t);
    if (!m.length) return { nodes: [], error: 'invalid', bad: t };
    if (m.length > 1 && !m[0].arg) return { nodes: [], error: 'ambiguous', bad: t };
    at = m[0];
    if (at.kw === 'LINE') return { nodes: [], at }; // free text eats the rest
    nodes = at.next ?? [];
  }
  return { nodes, at };
}

const pad = (s: string, n: number) => (s.length >= n ? s + ' ' : s + ' '.repeat(n - s.length));

/** IOS "?" help for the text typed so far (without the "?"). */
export function contextHelp(mode: IosMode, typed: string): string {
  const endsWithSpace = typed === '' || /\s$/.test(typed);
  const tokens = typed.trim() ? typed.trim().split(/\s+/) : [];
  if (endsWithSpace) {
    const r = walk(mode, tokens);
    if (r.error === 'ambiguous') return `% Ambiguous command: "${typed.trim()}"`;
    if (r.error) return '% Unrecognized command';
    if (r.at?.kw === 'LINE') return `  ${r.at.kw}  ${r.at.help}`;
    const rows = r.nodes.map((n) => `  ${pad(n.kw, 22)}${n.help}`);
    if (!tokens.length || r.at?.cr || !r.nodes.length) rows.push('  <cr>');
    return rows.join('\n');
  }
  // Partial word: list the keywords it could become (IOS: "sh?" -> "show").
  const last = tokens.pop()!;
  const r = walk(mode, tokens);
  if (r.error) return '% Unrecognized command';
  const list = r.nodes.filter((n) => n.arg || n.kw.toLowerCase().startsWith(last.toLowerCase())).map((n) => n.kw);
  return list.length ? list.join('  ') : '% Unrecognized command';
}

/** Tab completion: the line with its last word completed, or null when it is not unique. */
export function completeLine(mode: IosMode, typed: string): string | null {
  if (!typed.trim() || /\s$/.test(typed)) return null;
  const tokens = typed.trim().split(/\s+/);
  const last = tokens.pop()!;
  const r = walk(mode, tokens);
  if (r.error) return null;
  const kws = r.nodes.filter((n) => !n.arg && n.kw.toLowerCase().startsWith(last.toLowerCase()));
  if (kws.length !== 1) return null;
  return [...tokens, kws[0].kw].join(' ') + ' ';
}

/** IOS refuses a first word that could mean two commands ("e" in user mode, "s" in config). */
export function ambiguousFirstWord(mode: IosMode, line: string): string | null {
  const first = line.trim().split(/\s+/)[0];
  if (!first) return null;
  const kws = GRAMMAR[mode].filter((n) => !n.arg && n.kw.toLowerCase().startsWith(first.toLowerCase()));
  if (kws.length > 1 && !kws.some((n) => n.kw.toLowerCase() === first.toLowerCase())) return `% Ambiguous command:  "${line.trim()}"`;
  return null;
}

/** Output filters after a pipe: include, exclude, begin, section (regular expressions, like IOS). */
export function applyPipe(out: string, filter: string): string {
  const m = /^\s*(include|exclude|begin|section|i|in|inc|e|ex|exc|b|be|beg|s|se|sec)\w*\s+(.+)$/i.exec(filter);
  if (!m) return '% Invalid input detected after "|". Use include, exclude, begin or section.';
  const kind = m[1].toLowerCase()[0] === 's' ? 'section' : m[1].toLowerCase()[0] === 'b' ? 'begin' : m[1].toLowerCase().startsWith('e') ? 'exclude' : 'include';
  let re: RegExp;
  try {
    re = new RegExp(m[2].trim());
  } catch {
    re = new RegExp(m[2].trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  }
  const lines = out.split(/\r?\n/);
  if (kind === 'include') return lines.filter((l) => re.test(l)).join('\r\n');
  if (kind === 'exclude') return lines.filter((l) => !re.test(l)).join('\r\n');
  if (kind === 'begin') {
    const i = lines.findIndex((l) => re.test(l));
    return i < 0 ? '' : lines.slice(i).join('\r\n');
  }
  const res: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s/.test(lines[i]) && re.test(lines[i])) {
      res.push(lines[i]);
      while (i + 1 < lines.length && /^\s/.test(lines[i + 1])) res.push(lines[++i]);
    } else if (/^\s/.test(lines[i]) && re.test(lines[i])) {
      let h = i;
      while (h > 0 && /^\s/.test(lines[h])) h--;
      if (!res.includes(lines[h])) res.push(lines[h]);
      res.push(lines[i]);
    }
  }
  return res.join('\r\n');
}
