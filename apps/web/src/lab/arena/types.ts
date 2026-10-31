// Lab Arena: Packet Tracer style assessed activities, organised by CCNA topic.
// Each lab ships an initial network, a weighted assessment tree, connectivity tests and a debrief.
// Grading reads the live design (configuration, control plane and simulated packets), never typed answers.
import type { Ctx, TaskResult } from '../workbooks';
import type { LabDoc } from '../types';

/** guided: live ticks and hints. skills: build to spec, results on Check. troubleshoot: hidden faults. challenge: timed, no hints.
 * simlet: live network, show and ping only, answer questions about what you find (Cisco exam simlet / TSHOOT ticket). */
export type ArenaKind = 'guided' | 'skills' | 'troubleshoot' | 'challenge' | 'simlet';

/** A simlet question. Answers are chosen from the options; multi-answer questions are all or nothing, like the exam. */
export interface SimletQuestion {
  id: string;
  /** Ticket-style label, e.g. "Device", "Technology", "Fix" */
  tag?: string;
  prompt: string;
  options: { id: string; text: string }[];
  answer: string[];
  points: number;
  /** Which command to run (costs half the points) */
  hint: string;
  /** Shown after submitting: why the answer is right and why the traps are wrong. */
  explain: string;
}

export interface AssessmentItem {
  id: string;
  /** Tree path shown in Check Results, e.g. "ACC1 › Ports › Gi0/1" */
  group: string;
  text: string;
  points: number;
  hint: string;
  check: (c: Ctx) => TaskResult | boolean;
}

export interface ConnectivityTest {
  id: string;
  label: string;
  src: string; // device id
  dst: string; // IP address
  proto: 'icmp' | 'tcp';
  port?: number;
  expect: 'reach' | 'blocked';
  points: number;
}

export interface AddressRow {
  device: string;
  iface: string;
  ip: string;
  mask: string;
  gateway?: string;
  vlan?: string;
}

export interface ArenaLab {
  id: string;
  /** CCNA-TOC chapter and topic id, e.g. 'ch8-vlans' */
  topicId: string;
  title: string;
  kind: ArenaKind;
  difficulty: 1 | 2 | 3;
  minutes: number;
  /** Hard time limit in minutes (challenge labs). The attempt is submitted when it runs out. */
  timeLimit?: number;
  /** The ticket or brief, written as the customer or lead would say it. */
  brief: string;
  objectives: string[];
  addressing?: AddressRow[];
  /** CCNA v2.0 objectives this lab exercises */
  exam: string[];
  build: () => LabDoc;
  items: AssessmentItem[];
  tests: ConnectivityTest[];
  /** Simlets: the questions, and the network is read-only (show, ping, traceroute). */
  questions?: SimletQuestion[];
  /** Troubleshooting labs: what was broken (revealed after submitting). */
  faults?: string[];
  /** Shown after submitting: what a strong answer looked like and why. */
  debrief: string;
  /** Commands that verify the work, for the debrief. */
  verify: string[];
}

export interface ArenaTopic {
  id: string;
  chapter: number;
  title: string;
  /** v2.0 objectives covered */
  exam: string[];
  status: 'ready' | 'soon';
  blurb: string;
}

export interface ItemResult {
  id: string;
  group: string;
  text: string;
  points: number;
  earned: number;
  ok: boolean;
  detail?: string;
  hinted: boolean;
}
export interface TestResult {
  id: string;
  label: string;
  points: number;
  earned: number;
  ok: boolean;
  detail?: string;
}
export interface QuestionResult {
  id: string;
  prompt: string;
  points: number;
  earned: number;
  ok: boolean;
  answered: boolean;
  chosen: string[];
  hinted: boolean;
}
export interface Grade {
  items: ItemResult[];
  tests: TestResult[];
  questions: QuestionResult[];
  score: number;
  max: number;
  pct: number;
  /** Share of items and tests currently correct, ignoring hint penalties (Packet Tracer "Completion").
   * Simlet questions count when answered, not when correct, so the bar never leaks the answer key. */
  completion: number;
}

export interface Attempt {
  labId: string;
  startedAt: string;
  finishedAt: string;
  seconds: number;
  score: number;
  max: number;
  pct: number;
  hints: number;
  timedOut: boolean;
  missed: string[];
}
