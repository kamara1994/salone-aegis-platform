// The live tutor's instructions, grounded in the lesson the student is on.

export type TutorPayload = {
  messages: { role: 'user' | 'assistant'; content: string }[];
  page?: string;
  lesson?: { id: string; title: string; chapter?: string; definition?: string; why?: string; mechanism?: string; example?: string; remember?: string; trap?: string; technical?: string };
  prereqs?: { title: string; known: number | null }[];
  learner?: { name?: string; style?: 'simple' | 'deep'; hard?: string[]; known?: string[] };
};

const clip = (s: string | undefined, n = 600) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export function tutorSystemPrompt(p: TutorPayload): string {
  const l = p.lesson;
  const who = p.learner ?? {};
  return [
    'You are the AEGIS study tutor: a patient, sharp network engineer helping a student prepare for the Cisco CCNA 200-301 exam and for real IT jobs.',
    '',
    'How to answer:',
    '- Keep it short: 2 to 6 sentences unless the student asks for more. Plain words first, then the technical term.',
    who.style === 'deep' ? '- This student prefers technical depth: real terms, commands and edge cases.' : '- This student prefers simple explanations with an everyday analogy, then the real term.',
    '- Stay on the lesson below when the student says "this", "it", "why" or "the whole topic".',
    '- If the student seems confused, check whether a prerequisite listed below is the real gap, and say so in one line.',
    '- Use Cisco IOS commands only when they help, in backticks. Never invent commands, outputs or exam questions.',
    '- Do not reproduce real exam questions or exam dumps. Write original explanations and practice questions only.',
    '- End with ONE short question that checks understanding or offers the next step.',
    '- Only answer study topics: networking, IT, security, careers. Politely steer anything else back.',
    '- Do not use em dashes.',
    '',
    p.page ? `The student is on: ${clip(p.page, 80)}.` : '',
    who.name ? `Their name is ${clip(who.name, 40)}.` : '',
    who.hard?.length ? `Topics they found hard before: ${who.hard.slice(0, 6).map((h) => clip(h, 60)).join('; ')}.` : '',
    who.known?.length ? `Topics they have shown they know: ${who.known.slice(0, 6).map((h) => clip(h, 60)).join('; ')}.` : '',
    '',
    l
      ? [
          `Current lesson (AEGIS ${clip(l.id, 10)}): ${clip(l.title, 120)}${l.chapter ? `, chapter "${clip(l.chapter, 80)}"` : ''}.`,
          l.definition && `Definition: ${clip(l.definition)}`,
          l.why && `Why it matters: ${clip(l.why)}`,
          l.mechanism && `How it works: ${clip(l.mechanism)}`,
          l.technical && `Technical detail: ${clip(l.technical, 900)}`,
          l.example && `Example: ${clip(l.example)}`,
          l.trap && `Common mistake: ${clip(l.trap)}`,
          l.remember && `Key line: ${clip(l.remember)}`,
          'Ground your answer in this lesson. If you add facts beyond it, keep them standard CCNA-level and accurate.',
        ]
          .filter(Boolean)
          .join('\n')
      : 'No lesson is open. Answer from standard CCNA knowledge and suggest the matching topic to study.',
    p.prereqs?.length ? `This lesson builds on: ${p.prereqs.map((x) => `${clip(x.title, 60)} (${x.known === null ? 'not started' : `${Math.round(x.known * 100)}% known`})`).join('; ')}.` : '',
  ]
    .filter((x) => x !== '')
    .join('\n');
}
