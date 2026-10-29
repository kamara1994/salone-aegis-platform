import { describe, expect, it } from 'vitest';
import { normalizeDoc } from '@/lab/normalize';
import { WORKBOOKS } from '@/lab/workbooks';

describe('saved lab documents from older versions are repaired', () => {
  const good = WORKBOOKS[0].build();
  it('fills missing arrays and device fields', () => {
    const old = JSON.parse(JSON.stringify(good));
    for (const k of ['sites', 'racks', 'vlans', 'subnets', 'groups', 'annotations', 'goals']) delete old[k];
    for (const d of old.devices) {
      delete d.firewall;
      delete d.routes;
      delete d.vlans;
      for (const i of d.interfaces) delete i.speeds;
    }
    const doc = normalizeDoc(old)!;
    expect(doc.sites).toEqual([]);
    expect(doc.devices.every((d) => Array.isArray(d.firewall) && Array.isArray(d.routes) && typeof d.vlans === 'object')).toBe(true);
    expect(doc.devices.every((d) => d.interfaces.every((i) => i.speeds.length > 0))).toBe(true);
  });
  it('drops dangling cables and fixes unknown annotation kinds', () => {
    const doc = normalizeDoc({ ...good, cables: [...good.cables, { id: 'x', a: { device: 'gone', port: 'a' }, b: { device: good.devices[0].id, port: 'b' }, type: 'straight', disabled: false }], annotations: [{ id: 'n', kind: 'star', color: 'pink', text: 1 }] })!;
    expect(doc.cables).toHaveLength(good.cables.length);
    expect(doc.annotations![0]).toMatchObject({ kind: 'text', color: 'grey', text: '' });
  });
  it('rejects things that are not lab documents', () => {
    expect(normalizeDoc(null)).toBeNull();
    expect(normalizeDoc('text')).toBeNull();
    expect(normalizeDoc({ version: 1 })).toBeNull();
  });
});
