// @vitest-environment jsdom
/**
 * Writes contracts/examples/*.json from the simulated lab, so the back end has a concrete payload
 * for every endpoint and event type. Runs only when EXPORT_EXAMPLES=1 (npm run contracts:examples).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { it } from 'vitest';
import type { AegisEvent } from '@/api/types';
import { MockEngine } from '@/mock/engine';

const out = resolve(__dirname, '../../../../contracts/examples');

it.runIf(process.env.EXPORT_EXAMPLES === '1')('export contract examples', async () => {
  window.localStorage.clear();
  const e = new MockEngine();
  const events: Record<string, AegisEvent> = {};
  e.on((ev) => (events[ev.type] ??= ev));
  e.connect();
  const write = (name: string, body: unknown) => writeFileSync(resolve(out, `${name}.json`), JSON.stringify(body, null, 2) + '\n');
  mkdirSync(resolve(out, 'events'), { recursive: true });

  const tickets = await e.listTickets({});
  const open = tickets.items.find((t) => t.status !== 'closed')!;
  const closed = (await e.listTickets({ status: ['closed'] })).items[0];
  const topo = await e.getTopology();
  write('GET_me', await e.getMe());
  write('GET_clients', await e.listClients());
  write('GET_topology', topo);
  write('GET_nodes_id', await e.getNode(topo.nodes.find((n) => n.name === 'FW01')!.id));
  write('GET_notifications', await e.listNotifications());
  write('GET_tickets', tickets);
  write('GET_tickets_id', await e.getTicket(open.id));
  write('GET_tickets_id_chat', await e.listChat(open.id));
  write('GET_scenarios', await e.listScenarios());
  write('GET_alerts', await e.listAlerts());
  write('GET_evidence', await e.listEvidence(closed.id));
  write('GET_scorecards', await e.getScorecards());
  write('GET_skills', await e.listSkills());
  write('GET_controls', await e.listControlResults());
  write('GET_replay_ticket_id', await e.getReplay(closed.id));
  write('GET_settings', await e.getSettings());
  write('GET_tickets_id_debrief', await e.getDebrief(closed.id));

  // Drive one ticket through the loop to capture the live events.
  await e.updateTicket(open.id, { status: 'acknowledged' });
  await e.updateTicket(open.id, { status: 'investigating' });
  await e.postChat(open.id, { body: 'What happens when you open SalonePay?', channel: 'chat', intent: 'question' });
  await e.createScenarioRun({ scenario_id: 'net-duplex-mismatch', mode: 'practice' });
  const alerts = await e.listAlerts();
  const a = alerts.items.find((x) => x.state === 'new');
  if (a) await e.claimAlert(a.id);
  await new Promise((r) => setTimeout(r, 6000));
  e.close();
  for (const [type, ev] of Object.entries(events)) writeFileSync(resolve(out, 'events', `${type}.json`), JSON.stringify(ev, null, 2) + '\n');
}, 30_000);
