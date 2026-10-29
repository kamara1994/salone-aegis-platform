// Client for the Learn endpoints (/learn/*). The questions, grading and interviews come from the
// back end's AI provider; the model key never reaches the browser. In mock mode, or when the back
// end has no model configured, every call fails with a clear reason and the page says so.
import { API_MODE, getToken } from '@/api/auth';

export type Track = 'ccna' | 'ccnp' | 'security-plus' | 'aws-security' | 'interview-network' | 'interview-soc' | 'interview-helpdesk' | 'interview-cloud';
export type QuizMode = 'quiz' | 'exam' | 'flashcard';

export const TRACKS: { key: Track; label: string; group: 'Certifications' | 'Interviews' }[] = [
  { key: 'ccna', label: 'Cisco CCNA (200-301)', group: 'Certifications' },
  { key: 'ccnp', label: 'Cisco CCNP Enterprise', group: 'Certifications' },
  { key: 'security-plus', label: 'CompTIA Security+', group: 'Certifications' },
  { key: 'aws-security', label: 'AWS Security Specialty', group: 'Certifications' },
  { key: 'interview-network', label: 'Network engineer interview', group: 'Interviews' },
  { key: 'interview-soc', label: 'SOC analyst interview', group: 'Interviews' },
  { key: 'interview-helpdesk', label: 'Help desk / IT support interview', group: 'Interviews' },
  { key: 'interview-cloud', label: 'Cloud security interview', group: 'Interviews' },
];

export interface Question {
  id: string;
  type: 'single' | 'multi' | 'order' | 'free';
  prompt: string;
  options?: string[];
  topic?: string;
  objective?: string;
}
export interface QuestionRequest {
  track: Track;
  topic?: string;
  difficulty: number;
  count: number;
  mode: QuizMode;
  /** Short description of the operator's own lab, so questions can be about their network. */
  lab_summary?: string;
}
export interface AnswerResult {
  correct: boolean;
  score: number; // 0..1
  explanation: string;
  correct_answer?: string;
  references_to_objectives?: string[];
}
export interface InterviewTurn {
  question: string;
  answer?: string;
  feedback?: { strengths: string[]; missing: string[]; score: number };
}
export interface InterviewSession {
  id: string;
  role: string;
  level: string;
  turns: InterviewTurn[];
  next_question?: string;
}
export interface Progress {
  tracks: { track: Track; answered: number; accuracy: number; weak_objectives: string[] }[];
}

export class LearnError extends Error {
  constructor(
    public kind: 'mock' | 'not-configured' | 'not-built' | 'failed',
    message: string,
  ) {
    super(message);
  }
}

async function req<R>(method: string, path: string, body?: unknown): Promise<R> {
  if (API_MODE === 'mock') throw new LearnError('mock', 'This cockpit is running the simulated lab, which has no AI model. Connect the live back end with a model configured to get AI questions and interviews.');
  const t = await getToken();
  let res: Response;
  try {
    res = await fetch(`/api/v1/learn${path}`, {
      method,
      headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new LearnError('failed', 'The back end could not be reached.');
  }
  if (res.ok) return (await res.json()) as R;
  let code = '';
  let message = `${method} /learn${path} failed with ${res.status}`;
  try {
    const e = (await res.json()) as { error?: { code?: string; message?: string } };
    code = e.error?.code ?? '';
    message = e.error?.message ?? message;
  } catch {
    /* non-JSON */
  }
  if (res.status === 404 || res.status === 405) throw new LearnError('not-built', 'The back end does not have the Learn endpoints yet (see the Codex brief, task 4).');
  if (res.status === 503 || code === 'provider_unavailable') throw new LearnError('not-configured', `AI model not configured on the back end: ${message}. Set LLM_MODE=openai-compatible, LLM_BASE_URL, LLM_MODEL and the key secret.`);
  throw new LearnError('failed', message);
}

export const learnApi = {
  questions: (q: QuestionRequest) => req<{ questions: Question[] }>('POST', '/questions', q),
  answer: (question_id: string, answer: string | string[] | null) => req<AnswerResult>('POST', '/answers', { question_id, answer }),
  startInterview: (role: string, level: string) => req<InterviewSession>('POST', '/interviews', { role, level }),
  interviewTurn: (id: string, answer: string) => req<{ feedback: InterviewTurn['feedback']; next_question?: string }>('POST', `/interviews/${id}/turns`, { answer }),
  progress: () => req<Progress>('GET', '/progress'),
};
