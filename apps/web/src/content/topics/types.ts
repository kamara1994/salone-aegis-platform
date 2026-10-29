// Topic catalog: hundreds of short topics grouped by course and unit. Each topic is taught at three
// levels (simple, technical, advanced), ends with a check-yourself exam, and points to a lab.
export type CourseId = 'networking' | 'advanced-networking' | 'security-plus' | 'soc' | 'pentest' | 'cloud-security' | 'linux' | 'windows-ad' | 'it-support' | 'incident-response' | 'automation';
export type TeachLevel = 'simple' | 'technical' | 'advanced';

export interface TopicQuestion {
  q: string;
  options: string[];
  answer: number;
  explain: string;
}

export interface Topic {
  id: string;
  course: CourseId;
  unit: string;
  title: string;
  /** Like explaining to a 10-year-old: everyday words and an analogy */
  simple: string;
  /** How it works, with the real terms */
  technical: string;
  /** Design choices, edge cases, commands, what professionals watch for */
  advanced: string;
  terms: [string, string][];
  example?: { title: string; code: string };
  mistakes?: string[];
  quiz: TopicQuestion[];
  /** Where to practise */
  lab?: { workbook?: string; challenge?: string; game?: string; text?: string };
  /** A full interactive lesson exists for this topic */
  lesson?: string;
}

export interface Course {
  id: CourseId;
  title: string;
  summary: string;
  units: string[];
}

/** Compact authoring helpers. */
export const q = (question: string, options: string[], answer: number, explain: string): TopicQuestion => ({ q: question, options, answer, explain });
export const topic = (course: CourseId, unit: string) => (id: string, title: string, simple: string, technical: string, advanced: string, terms: [string, string][], quiz: TopicQuestion[], extra: Partial<Topic> = {}): Topic => ({ id, course, unit, title, simple, technical, advanced, terms, quiz, ...extra });
