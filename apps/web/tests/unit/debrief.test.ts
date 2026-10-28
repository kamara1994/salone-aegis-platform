import { describe, expect, it } from 'vitest';
import { initialLab } from '@/mock/lab';
import { buildQuestions, scoreAnswer } from '@/mock/interviewer';
import { personaRespond } from '@/mock/persona';
import { packById } from '@/mock/scenarios';

const pack = packById('net-gateway-wrong')!;

describe('interviewer', () => {
  const qs = buildQuestions(pack, { ticketNumber: 'SM-1001', hintsUsed: 0, long: false });

  it('asks at least one question per debrief, starting with a walkthrough', () => {
    expect(qs.length).toBeGreaterThanOrEqual(3);
    expect(qs[0].text).toMatch(/SM-1001/);
  });

  it('scores a specific, structured answer above a vague one', () => {
    const strong = scoreAnswer(pack, qs[0], 'First I ran ipconfig /all on WS-FIN-02: static IP 10.10.20.45 with gateway 10.10.20.254, which does not exist, so ARP for the gateway failed and only same-subnet traffic worked. I set the NIC back to DHCP so it took 10.10.20.1, then verified HTTPS to SalonePay on 10.10.30.20:443. To prevent it, user devices stay on DHCP and static addresses live in IPAM.');
    const vague = scoreAnswer(pack, qs[0], 'I fixed the network and it works now.');
    expect(strong.total).toBeGreaterThan(vague.total + 20);
  });
});

describe('client persona', () => {
  const base = { pack, status: 'client_explanation', lab: initialLab(), run: { startedAt: new Date().toISOString(), identityChecks: [] }, operator: 'adm-jkamara', explanationAttempts: 0, sensitiveRequestSeen: false };

  it('sends back an explanation full of jargon', () => {
    const r = personaRespond({ ...base, message: 'The DHCP scope was fine but your static IPv4 config had the wrong default gateway so ARP failed and the TCP SYN to the VIP never left the VLAN.' });
    expect(r.explanation?.accepted).toBe(false);
  });

  it('accepts a plain explanation that covers cause, fix and next time', () => {
    const r = personaRespond({ ...base, message: 'Your computer had a wrong setting that pointed it at a door that does not exist. I switched it back to automatic settings and it works now. If it happens again, restart and call us.' });
    expect(r.explanation?.accepted).toBe(true);
  });
});
