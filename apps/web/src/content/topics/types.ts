// Topic catalog: hundreds of short topics grouped by course and unit. Each topic has a beginner
// explanation and a technical explanation with professional depth, plus a level-aware question bank.
export type CourseId = 'networking' | 'advanced-networking' | 'security-plus' | 'soc' | 'pentest' | 'cloud-security' | 'linux' | 'windows-ad' | 'it-support' | 'incident-response' | 'automation';
export type TeachLevel = 'simple' | 'technical';
export type ExamDifficulty = 'beginner' | 'intermediate' | 'advanced';

export interface TopicQuestion {
  q: string;
  options: string[];
  answer: number;
  explain: string;
  /** Question-bank difficulty; inferred from the task and wording unless the author overrides it. */
  difficulty?: ExamDifficulty;
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
export function inferQuestionDifficulty(question: string, options: string[], explain: string): ExamDifficulty {
  const text = `${question} ${options.join(' ')} ${explain}`.toLowerCase();
  const advanced = /\b(scenario|given that|based on the (?:log|output|evidence)|most likely|best next|first action|root cause|calculate|subnet|troubleshoot|design a|what should you|which action|incident response|preserve evidence|multiple (?:hosts|users|sites|failures)|trade-?off|lateral movement|compromised|containment|investigate)\b/.test(text);
  if (advanced) return 'advanced';
  const technical = /\b(command|configure|configuration|protocol|port|subnet|mask|event id|log|output|rule|header|route|vlan|acl|dns|dhcp|mac address|arp|tcp|udp|tls|iam|kerberos|ospf|bgp|stp|lacp|sql|query|packet|firewall|permission|hash|certificate|encryption|authentication|authorization|script|api|json|yaml|linux|windows|active directory|powershell|wireshark|suricata|zeek)\b|\b(?:explain|compare|difference between|identify the field|interpret|where would you)\b/.test(text);
  return technical ? 'intermediate' : 'beginner';
}

export const q = (question: string, options: string[], answer: number, explain: string, difficulty?: ExamDifficulty): TopicQuestion => ({
  q: question,
  options,
  answer,
  explain,
  difficulty: difficulty ?? inferQuestionDifficulty(question, options, explain),
});
export const topic = (course: CourseId, unit: string) => (id: string, title: string, simple: string, technical: string, advanced: string, terms: [string, string][], quiz: TopicQuestion[], extra: Partial<Topic> = {}): Topic => ({ id, course, unit, title, simple, technical, advanced, terms, quiz, ...extra });
