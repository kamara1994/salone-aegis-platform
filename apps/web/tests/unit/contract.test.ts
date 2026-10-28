// @vitest-environment jsdom
/**
 * Contract tests: the in-browser mock must speak exactly the contracts Codex's back end implements.
 * Every response is validated against contracts/openapi.yaml and every event against contracts/events.schema.json.
 * If this passes and the back end passes the same schemas, live mode works without front-end changes.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import type { AegisEvent } from '@/api/types';
import { MockEngine } from '@/mock/engine';

const root = resolve(__dirname, '../../../../contracts');
const openapi = parse(readFileSync(resolve(root, 'openapi.yaml'), 'utf8'));
const events = JSON.parse(readFileSync(resolve(root, 'events.schema.json'), 'utf8'));

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ $id: 'openapi', components: openapi.components });
ajv.addSchema(events);

function check(schemaName: string, value: unknown) {
  const v = ajv.getSchema(`openapi#/components/schemas/${schemaName}`);
  if (!v) throw new Error(`No schema ${schemaName}`);
  const ok = v(value);
  expect(ok, `${schemaName}: ${ajv.errorsText(v.errors, { separator: '\n' })}`).toBe(true);
}

let engine: MockEngine;
const seen: AegisEvent[] = [];

beforeAll(() => {
  window.localStorage.clear();
  engine = new MockEngine();
  engine.on((e) => seen.push(e));
  engine.connect();
});
afterAll(() => engine.close());

describe('REST responses match openapi.yaml', () => {
  it('the validator rejects a malformed payload (guards against a vacuous pass)', () => {
    const v = ajv.getSchema('openapi#/components/schemas/TicketDetail')!;
    expect(v({ id: 'not-a-uuid', status: 'fixed' })).toBe(false);
  });

  it('me, clients, topology, settings', async () => {
    check('Me', await engine.getMe());
    for (const c of await engine.listClients()) check('Client', c);
    check('Topology', await engine.getTopology());
    check('Settings', await engine.getSettings());
  });

  it('tickets, ticket detail, chat, evidence', async () => {
    const page = await engine.listTickets({});
    check('TicketPage', page);
    const t = await engine.getTicket(page.items[0].id);
    check('TicketDetail', t);
    for (const m of await engine.listChat(t.id)) check('ChatMessage', m);
    for (const r of await engine.listEvidence(t.id)) check('EvidenceRecord', r);
  });

  it('notifications, alerts, scenarios, scorecards, skills, controls', async () => {
    check('NotificationPage', await engine.listNotifications());
    for (const a of (await engine.listAlerts()).items) check('Alert', a);
    for (const s of await engine.listScenarios()) check('ScenarioSummary', s);
    check('Scorecards', await engine.getScorecards());
    for (const s of await engine.listSkills()) check('SkillScore', s);
    for (const c of await engine.listControlResults()) check('ControlResult', c);
  });

  it('node detail and replay', async () => {
    const topo = await engine.getTopology();
    check('NodeDetail', await engine.getNode(topo.nodes[0].id));
    const closed = (await engine.listTickets({ status: ['closed'] })).items[0];
    check('ReplayTimeline', await engine.getReplay(closed.id));
  });
});

describe('events match events.schema.json', () => {
  it('every event emitted in the first ticks is valid', async () => {
    await new Promise((r) => setTimeout(r, 4500));
    expect(seen.length).toBeGreaterThan(0);
    const v = ajv.getSchema(events.$id)!;
    for (const e of seen) expect(v(e), `${e.type}: ${ajv.errorsText(v.errors)}`).toBe(true);
  });
});
