// Local content model for lessons, games and tracks. Content is plain data (no code), so it can be
// authored in TypeScript files in this folder or imported at runtime as a JSON content pack.

export type TrackId = 'ccna' | 'ccnp' | 'security-plus' | 'ejpt' | 'soc' | 'cloud-security' | 'linux' | 'windows-ad' | 'automation' | 'incident-response' | 'helpdesk';

export type Inline = string; // supports **bold**, `code` and [text](lab:workbook-id) links

export type Block =
  | { type: 'p'; text: Inline; level?: 'beginner' | 'advanced' }
  | { type: 'h'; text: string }
  | { type: 'list'; items: Inline[]; ordered?: boolean }
  | { type: 'code'; code: string; lang?: string; title?: string }
  | { type: 'cmd'; prompt: string; command: string; output?: string; explain?: Inline }
  | { type: 'callout'; tone: 'tip' | 'info' | 'warn' | 'danger'; title?: string; text: Inline }
  | { type: 'table'; head: string[]; rows: Inline[][]; caption?: string }
  | { type: 'device'; model: string; caption: Inline; points?: string[] }
  | { type: 'image'; src: string; alt: string; caption?: Inline }
  | { type: 'diagram'; name: DiagramName; caption?: Inline }
  | { type: 'compare'; before: { title: string; text?: Inline; code?: string }; after: { title: string; text?: Inline; code?: string } }
  | { type: 'reveal'; prompt: Inline; answer: Inline }
  | { type: 'predict'; question: Inline; options: string[]; answer: number; explain: Inline }
  | { type: 'quiz'; id: string; questions: { q: Inline; options: string[]; answer: number; explain: Inline }[] }
  | { type: 'trainer'; id: string; title: string; device: string; steps: { goal: Inline; expect: string; output?: string; hint: Inline }[] }
  | { type: 'lab'; text: Inline; workbook?: string; challenge?: string; graded?: boolean };

export type DiagramName = 'vlan-split' | 'access-trunk' | 'dot1q' | 'roas' | 'arp' | 'priority-matrix' | 'cable-trace' | 'siem-flow' | 'escalation' | 'mac-table';

export interface LessonSection {
  id: string;
  title: string;
  /** shown only in advanced mode */
  advanced?: boolean;
  blocks: Block[];
}

export interface Lesson {
  id: string;
  title: string;
  summary: string;
  tracks: TrackId[];
  minutes: number;
  difficulty: 1 | 2 | 3;
  tags?: string[];
  lab?: { workbook?: string; challenge?: string };
  sections: LessonSection[];
  /** set on lessons imported from a content pack */
  imported?: boolean;
}

// ---------------- games ----------------

export type Urgency = 'low' | 'medium' | 'high' | 'critical';
export type Impact = 'individual' | 'team' | 'department' | 'organization';

export interface GameCase {
  id: string;
  caller: { name: string; role: string; avatar: string; mood: 'calm' | 'stressed' | 'angry' | 'confused' };
  channel: 'phone' | 'walk-up' | 'chat' | 'email' | 'alert';
  opening: string;
  /** what a well-triaged ticket looks like */
  urgency: Urgency;
  impact: Impact;
  triageWhy: string;
  questions: { id: string; ask: string; answer: string; useful: boolean }[];
  evidence: { id: string; tool: 'terminal' | 'logs' | 'ticket-history' | 'device-panel' | 'packet' | 'siem' | 'email' | 'console'; title: string; content: string; key: boolean }[];
  diagnoses: { id: string; text: string; correct: boolean; why: string }[];
  fixes: { id: string; text: string; correct: boolean; why: string }[];
  escalation: { correct: 'none' | string; options: string[]; why: string };
  /** model answer for the resolution note */
  noteKeywords: string[];
  /** in-character responses from the senior engineer / manager when the player asks for a hint */
  hints: string[];
  lab?: { workbook?: string; challenge?: string };
  minutes: number;
}

export interface GameTemplate {
  id: string;
  title: string;
  role: string;
  summary: string;
  tracks: TrackId[];
  /** the persona that answers escalations and hints */
  mentor: string;
  cases: GameCase[];
  imported?: boolean;
}

export interface TrackDef {
  id: TrackId;
  title: string;
  summary: string;
  learnTrack?: string; // AI practice track key
}
