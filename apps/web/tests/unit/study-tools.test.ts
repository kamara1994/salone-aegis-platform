import { describe, expect, it } from 'vitest';
import { decode, defang, describeHash, encode, epochInfo, refang, subnet, toBases } from '@/learn/tools';

describe('study tools', () => {
  it('subnet calculator', () => {
    expect(subnet('192.168.10.37/26')).toMatchObject({ network: '192.168.10.0', broadcast: '192.168.10.63', mask: '255.255.255.192', wildcard: '0.0.0.63', first: '192.168.10.1', last: '192.168.10.62', hosts: 62 });
    expect(subnet('10.0.0.5/31')?.hosts).toBe(2);
    expect(subnet('300.1.1.1/24')).toBeNull();
  });
  it('base converter', () => {
    expect(toBases('0xFF')).toContainEqual(['Decimal', '255']);
    expect(toBases('192.168.1.10')?.[0][1]).toBe('11000000.10101000.00000001.00001010');
    expect(toBases('nope')).toBeNull();
  });
  it('codecs round trip', () => {
    for (const c of ['base64', 'url', 'hex'] as const) expect(decode(c, encode(c, 'Salone é /?'))).toBe('Salone é /?');
    expect(decode('hex', 'zz')).toBeNull();
  });
  it('hash identifier and epoch', () => {
    expect(describeHash('5f4dcc3b5aa765d61d8327deb882cf99')).toMatch(/MD5/);
    expect(describeHash('$2b$12$abc')).toMatch(/bcrypt/);
    expect(epochInfo('0')).toBeNull();
    expect(epochInfo('1700000000')?.[0][1]).toBe('2023-11-14T22:13:20Z');
  });
  it('defang and refang', () => {
    const d = defang('http://bad.example.com 203.0.113.9');
    expect(d).toBe('hxxp://bad[.]example[.]com 203[.]0[.]113[.]9');
    expect(refang(d)).toBe('http://bad.example.com 203.0.113.9');
  });
});
