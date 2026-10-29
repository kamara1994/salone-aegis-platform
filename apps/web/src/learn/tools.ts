// Logic for the study tools in the dashboard toolbar. Pure functions, no network.

const ipToInt = (ip: string) => ip.split('.').reduce((a, o) => a * 256 + Number(o), 0);
const intToIp = (n: number) => [24, 16, 8, 0].map((s) => Math.floor(n / 2 ** s) % 256).join('.');
const isIp = (ip: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) && ip.split('.').every((o) => Number(o) <= 255);

export function subnet(input: string) {
  const m = input.trim().match(/^(\S+)\/(\d{1,2})$/);
  if (!m || !isIp(m[1]) || Number(m[2]) > 32) return null;
  const prefix = Number(m[2]);
  const size = 2 ** (32 - prefix);
  const network = Math.floor(ipToInt(m[1]) / size) * size;
  const broadcast = network + size - 1;
  const maskInt = 2 ** 32 - size;
  const hosts = prefix >= 31 ? (prefix === 31 ? 2 : 1) : size - 2;
  return {
    prefix,
    network: intToIp(network),
    broadcast: intToIp(broadcast),
    mask: intToIp(maskInt),
    wildcard: intToIp(size - 1),
    first: intToIp(prefix >= 31 ? network : network + 1),
    last: intToIp(prefix >= 31 ? broadcast : broadcast - 1),
    hosts,
  };
}

export function toBases(input: string): [string, string][] | null {
  const v = input.trim().toLowerCase();
  if (isIp(v)) {
    const octets = v.split('.').map(Number);
    return [
      ['Binary', octets.map((o) => o.toString(2).padStart(8, '0')).join('.')],
      ['Hex', octets.map((o) => o.toString(16).padStart(2, '0')).join('.')],
      ['As one number', ipToInt(v).toString()],
    ];
  }
  let n: number;
  if (/^0b[01]+$/.test(v)) n = parseInt(v.slice(2), 2);
  else if (/^0x[0-9a-f]+$/.test(v)) n = parseInt(v.slice(2), 16);
  else if (/^\d+$/.test(v)) n = parseInt(v, 10);
  else return null;
  if (!Number.isSafeInteger(n)) return null;
  return [
    ['Decimal', n.toString(10)],
    ['Binary', n.toString(2)],
    ['Hex', `0x${n.toString(16).toUpperCase()}`],
  ];
}

export type Codec = 'base64' | 'url' | 'hex';
const utf8 = (s: string) => new TextEncoder().encode(s);

export function encode(c: Codec, s: string): string {
  if (c === 'url') return encodeURIComponent(s);
  if (c === 'hex') return [...utf8(s)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return btoa(String.fromCharCode(...utf8(s)));
}

export function decode(c: Codec, s: string): string | null {
  try {
    if (c === 'url') return decodeURIComponent(s);
    const bytes = c === 'hex' ? (/^([0-9a-f]{2})*$/i.test(s.replace(/\s/g, '')) ? s.replace(/\s/g, '').match(/../g) ?? [] : null)?.map((h) => parseInt(h, 16)) : [...atob(s.trim())].map((ch) => ch.charCodeAt(0));
    if (!bytes) return null;
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

export function describeHash(h: string): string {
  const v = h.trim();
  if (/^\$2[aby]\$\d{2}\$/.test(v)) return 'bcrypt (slow, salted password hash)';
  if (/^\$argon2(id|i|d)\$/.test(v)) return 'Argon2 (modern salted password hash)';
  if (v.startsWith('$6$')) return 'SHA-512 crypt (Linux /etc/shadow)';
  if (v.startsWith('$5$')) return 'SHA-256 crypt (Linux /etc/shadow)';
  if (v.startsWith('$1$')) return 'MD5 crypt (old Linux; weak)';
  if (/^[0-9a-f]+$/i.test(v)) {
    const byLen: Record<number, string> = { 32: 'MD5 or NTLM (32 hex characters)', 40: 'SHA-1 (40 hex characters)', 56: 'SHA-224 (56 hex characters)', 64: 'SHA-256 (64 hex characters)', 96: 'SHA-384 (96 hex characters)', 128: 'SHA-512 (128 hex characters)' };
    return byLen[v.length] ?? `Hex string of ${v.length} characters; no common hash has this length`;
  }
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(v) && v.length % 4 === 0) return 'Looks like Base64, possibly an encoded hash or data, not a raw hash';
  return 'Unknown format';
}

export function epochInfo(input: string): [string, string][] | null {
  const v = input.trim();
  let d: Date;
  if (/^\d{9,13}$/.test(v)) d = new Date(v.length > 10 ? Number(v) : Number(v) * 1000);
  else {
    if (!/\d{4}-\d{2}-\d{2}/.test(v)) return null;
    const t = Date.parse(v.includes('T') || !/\d{4}-\d{2}-\d{2} \d/.test(v) ? v : v.replace(' ', 'T'));
    if (Number.isNaN(t)) return null;
    d = new Date(t);
  }
  if (Number.isNaN(d.getTime())) return null;
  return [
    ['UTC', d.toISOString().replace('.000', '')],
    ['Your time', d.toLocaleString()],
    ['Epoch seconds', String(Math.floor(d.getTime() / 1000))],
    ['Epoch milliseconds', String(d.getTime())],
  ];
}

export const defang = (s: string) => s.replace(/https?:\/\//gi, (m) => m.replace(/t/gi, 'x')).replace(/\./g, '[.]').replace(/@/g, '[@]');
export const refang = (s: string) => s.replace(/\[\.\]/g, '.').replace(/\[@\]/g, '@').replace(/hxxp/gi, (m) => m.replace(/x/gi, 't'));

/** Well-known ports: number, protocol, service, what it is for. */
export const PORTS: [string, string, string, string][] = [
  ['20-21', 'TCP', 'FTP', 'File transfer (cleartext)'],
  ['22', 'TCP', 'SSH', 'Secure remote shell, SFTP, SCP'],
  ['23', 'TCP', 'Telnet', 'Remote shell (cleartext; avoid)'],
  ['25', 'TCP', 'SMTP', 'Mail between servers'],
  ['53', 'TCP/UDP', 'DNS', 'Name lookups (UDP), zone transfers (TCP)'],
  ['67-68', 'UDP', 'DHCP', 'Address leases (server 67, client 68)'],
  ['69', 'UDP', 'TFTP', 'Simple file transfer, device images'],
  ['80', 'TCP', 'HTTP', 'Web (cleartext)'],
  ['88', 'TCP/UDP', 'Kerberos', 'Active Directory authentication'],
  ['110', 'TCP', 'POP3', 'Mail download'],
  ['123', 'UDP', 'NTP', 'Time synchronisation'],
  ['135', 'TCP', 'MS RPC', 'Windows RPC endpoint mapper'],
  ['137-139', 'TCP/UDP', 'NetBIOS', 'Legacy Windows naming and sessions'],
  ['143', 'TCP', 'IMAP', 'Mail access'],
  ['161-162', 'UDP', 'SNMP', 'Device monitoring (162 for traps)'],
  ['389', 'TCP/UDP', 'LDAP', 'Directory queries'],
  ['443', 'TCP', 'HTTPS', 'Web over TLS'],
  ['445', 'TCP', 'SMB', 'Windows file sharing'],
  ['465', 'TCP', 'SMTPS', 'Mail submission over TLS'],
  ['500', 'UDP', 'IKE', 'IPsec VPN key exchange'],
  ['514', 'UDP', 'Syslog', 'Log forwarding'],
  ['587', 'TCP', 'Submission', 'Mail from clients (STARTTLS)'],
  ['636', 'TCP', 'LDAPS', 'LDAP over TLS'],
  ['993', 'TCP', 'IMAPS', 'IMAP over TLS'],
  ['995', 'TCP', 'POP3S', 'POP3 over TLS'],
  ['1433', 'TCP', 'MS SQL', 'Microsoft SQL Server'],
  ['1812-1813', 'UDP', 'RADIUS', 'Network login and accounting'],
  ['3306', 'TCP', 'MySQL', 'MySQL and MariaDB'],
  ['3389', 'TCP', 'RDP', 'Windows Remote Desktop'],
  ['4500', 'UDP', 'IPsec NAT-T', 'IPsec through NAT'],
  ['5060-5061', 'TCP/UDP', 'SIP', 'VoIP signalling (5061 over TLS)'],
  ['5432', 'TCP', 'PostgreSQL', 'PostgreSQL database'],
  ['5985-5986', 'TCP', 'WinRM', 'Windows remote management'],
  ['6379', 'TCP', 'Redis', 'Redis key-value store'],
  ['8080', 'TCP', 'HTTP-alt', 'Proxies and app servers'],
  ['9200', 'TCP', 'Elasticsearch', 'Search and log store API'],
];
