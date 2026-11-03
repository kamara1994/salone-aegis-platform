// Server-only AI layer. Talks to whichever AI provider has a key configured.
// Keys live in environment variables on the server (apps/web/.env.local) and never reach the browser.
//
// Supported: Anthropic (Claude), OpenAI, Google Gemini, Azure OpenAI, and every OpenAI-compatible API:
// Groq, Mistral, DeepSeek, xAI (Grok), OpenRouter, Together, Fireworks, Perplexity, Cerebras,
// plus local models through Ollama or LM Studio.
//
// Simplest setup: put ONE key in AI_API_KEY and the provider is detected from the key's format.
// Or set provider-specific keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, ...). When several
// are set, they are tried in order, so if one is down or out of credit the next one answers.

export type ProviderId =
  | 'anthropic'
  | 'openai'
  | 'gemini'
  | 'azure'
  | 'groq'
  | 'mistral'
  | 'deepseek'
  | 'xai'
  | 'openrouter'
  | 'together'
  | 'fireworks'
  | 'perplexity'
  | 'cerebras'
  | 'ollama'
  | 'lmstudio'
  | 'custom';

type Spec = { label: string; kind: 'anthropic' | 'gemini' | 'openai'; base: string; model: string; env: string[] };

/** Defaults. Model names change over time: override any of them with AI_MODEL or <PROVIDER>_MODEL. */
export const PROVIDERS: Record<ProviderId, Spec> = {
  anthropic: { label: 'Anthropic Claude', kind: 'anthropic', base: 'https://api.anthropic.com/v1', model: 'claude-sonnet-5-5', env: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'] },
  openai: { label: 'OpenAI', kind: 'openai', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini', env: ['OPENAI_API_KEY'] },
  gemini: { label: 'Google Gemini', kind: 'gemini', base: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.0-flash', env: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'] },
  azure: { label: 'Azure OpenAI', kind: 'openai', base: '', model: 'gpt-4o-mini', env: ['AZURE_OPENAI_API_KEY'] },
  groq: { label: 'Groq', kind: 'openai', base: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', env: ['GROQ_API_KEY'] },
  mistral: { label: 'Mistral', kind: 'openai', base: 'https://api.mistral.ai/v1', model: 'mistral-small-latest', env: ['MISTRAL_API_KEY'] },
  deepseek: { label: 'DeepSeek', kind: 'openai', base: 'https://api.deepseek.com/v1', model: 'deepseek-chat', env: ['DEEPSEEK_API_KEY'] },
  xai: { label: 'xAI Grok', kind: 'openai', base: 'https://api.x.ai/v1', model: 'grok-2-latest', env: ['XAI_API_KEY', 'GROK_API_KEY'] },
  openrouter: { label: 'OpenRouter', kind: 'openai', base: 'https://openrouter.ai/api/v1', model: 'openrouter/auto', env: ['OPENROUTER_API_KEY'] },
  together: { label: 'Together AI', kind: 'openai', base: 'https://api.together.xyz/v1', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', env: ['TOGETHER_API_KEY'] },
  fireworks: { label: 'Fireworks AI', kind: 'openai', base: 'https://api.fireworks.ai/inference/v1', model: 'accounts/fireworks/models/llama-v3p3-70b-instruct', env: ['FIREWORKS_API_KEY'] },
  perplexity: { label: 'Perplexity', kind: 'openai', base: 'https://api.perplexity.ai', model: 'sonar', env: ['PERPLEXITY_API_KEY'] },
  cerebras: { label: 'Cerebras', kind: 'openai', base: 'https://api.cerebras.ai/v1', model: 'llama-3.3-70b', env: ['CEREBRAS_API_KEY'] },
  ollama: { label: 'Ollama (local)', kind: 'openai', base: 'http://localhost:11434/v1', model: 'llama3.1', env: ['OLLAMA_BASE_URL'] },
  lmstudio: { label: 'LM Studio (local)', kind: 'openai', base: 'http://localhost:1234/v1', model: 'local-model', env: ['LMSTUDIO_BASE_URL'] },
  custom: { label: 'Custom OpenAI-compatible', kind: 'openai', base: '', model: '', env: [] },
};

/** Guess the provider from the shape of a key. Order matters: the most specific prefixes first. */
export function detectProvider(key: string): ProviderId | null {
  const k = key.trim();
  if (k.startsWith('sk-ant-')) return 'anthropic';
  if (k.startsWith('sk-or-')) return 'openrouter';
  if (k.startsWith('gsk_')) return 'groq';
  if (k.startsWith('xai-')) return 'xai';
  if (k.startsWith('pplx-')) return 'perplexity';
  if (k.startsWith('fw_')) return 'fireworks';
  if (k.startsWith('csk-')) return 'cerebras';
  if (k.startsWith('AIza')) return 'gemini';
  if (k.startsWith('sk-proj-') || k.startsWith('sk-svcacct-') || k.startsWith('sk-')) return 'openai';
  if (/^[a-f0-9]{64}$/.test(k)) return 'together';
  if (/^[A-Za-z0-9]{32}$/.test(k)) return 'mistral';
  return null;
}

export type Endpoint = { id: ProviderId; label: string; kind: Spec['kind']; base: string; model: string; key: string };
type Env = Record<string, string | undefined>;

/** Every provider that has what it needs in the environment, in the order they will be tried. */
export function configured(env: Env = process.env): Endpoint[] {
  const out: Endpoint[] = [];
  const add = (id: ProviderId, key: string, base?: string, model?: string) => {
    const s = PROVIDERS[id];
    const upper = id.toUpperCase();
    const b = (base ?? env[`${upper}_BASE_URL`] ?? s.base).replace(/\/+$/, '');
    const m = model ?? env[`${upper}_MODEL`] ?? s.model;
    if (!b || !m) return;
    if (out.some((e) => e.id === id && e.key === key)) return;
    out.push({ id, label: s.label, kind: s.kind, base: b, model: m, key });
  };

  // 1. One key for everything, provider detected (or forced with AI_PROVIDER).
  const generic = env.AI_API_KEY?.trim();
  const forced = env.AI_PROVIDER?.trim().toLowerCase() as ProviderId | undefined;
  if (forced === 'custom' || (env.AI_BASE_URL && !forced)) {
    if (env.AI_BASE_URL) add('custom', generic ?? '', env.AI_BASE_URL, env.AI_MODEL ?? '');
  } else if (generic || (forced && (forced === 'ollama' || forced === 'lmstudio'))) {
    const id = forced && forced in PROVIDERS ? forced : detectProvider(generic ?? '');
    if (id) add(id, generic ?? '', env.AI_BASE_URL, env.AI_MODEL);
  }

  // 2. Provider-specific keys, in a sensible order (best tutoring quality first).
  const order: ProviderId[] = ['anthropic', 'openai', 'gemini', 'azure', 'openrouter', 'groq', 'mistral', 'deepseek', 'xai', 'together', 'fireworks', 'cerebras', 'perplexity'];
  for (const id of order) {
    const key = PROVIDERS[id].env.map((n) => env[n]?.trim()).find(Boolean);
    if (!key) continue;
    if (id === 'azure') {
      const base = env.AZURE_OPENAI_ENDPOINT?.replace(/\/+$/, '');
      const dep = env.AZURE_OPENAI_DEPLOYMENT;
      if (base && dep) add('azure', key, `${base}/openai/deployments/${dep}`, dep);
      continue;
    }
    add(id, key);
  }
  // 3. Local models need no key, only a base URL.
  if (env.OLLAMA_BASE_URL) add('ollama', '', env.OLLAMA_BASE_URL);
  if (env.LMSTUDIO_BASE_URL) add('lmstudio', '', env.LMSTUDIO_BASE_URL);
  return out;
}

export type ChatMsg = { role: 'user' | 'assistant'; content: string };
export type HttpReq = { url: string; init: { method: 'POST'; headers: Record<string, string>; body: string } };

/** Build the HTTP request for one provider. Pure, so it can be tested without the network. */
export function buildRequest(e: Endpoint, system: string, messages: ChatMsg[], maxTokens = 700): HttpReq {
  if (e.kind === 'anthropic')
    return {
      url: `${e.base}/messages`,
      init: { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': e.key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: e.model, max_tokens: maxTokens, system, messages }) },
    };
  if (e.kind === 'gemini')
    return {
      url: `${e.base}/models/${encodeURIComponent(e.model)}:generateContent`,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': e.key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.4 },
        }),
      },
    };
  // OpenAI and every OpenAI-compatible API.
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (e.id === 'azure') headers['api-key'] = e.key;
  else if (e.key) headers.authorization = `Bearer ${e.key}`;
  if (e.id === 'openrouter') {
    headers['HTTP-Referer'] = 'https://aegis.local';
    headers['X-Title'] = 'AEGIS Study Tutor';
  }
  const url = e.id === 'azure' ? `${e.base}/chat/completions?api-version=2024-10-21` : `${e.base}/chat/completions`;
  return { url, init: { method: 'POST', headers, body: JSON.stringify({ model: e.model, max_tokens: maxTokens, temperature: 0.4, messages: [{ role: 'system', content: system }, ...messages] }) } };
}

/** Pull the reply text out of any provider's response. */
export function parseReply(e: Endpoint, json: unknown): string {
  const j = json as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (e.kind === 'anthropic') return (j.content ?? []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('').trim();
  if (e.kind === 'gemini') return (j.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('').trim();
  return String(j.choices?.[0]?.message?.content ?? '').trim();
}

/** Ask the first provider that works. Errors never include the key. */
export async function complete(system: string, messages: ChatMsg[], opts: { env?: Env; fetcher?: typeof fetch; timeoutMs?: number } = {}): Promise<{ text: string; provider: string; model: string }> {
  const list = configured(opts.env);
  if (!list.length) throw new Error('no_provider');
  const f = opts.fetcher ?? fetch;
  const errors: string[] = [];
  for (const e of list) {
    const { url, init } = buildRequest(e, system, messages);
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 30_000);
    try {
      const res = await f(url, { ...init, signal: ctl.signal });
      if (!res.ok) {
        errors.push(`${e.label}: HTTP ${res.status}`);
        continue;
      }
      const text = parseReply(e, await res.json());
      if (text) return { text, provider: e.label, model: e.model };
      errors.push(`${e.label}: empty reply`);
    } catch (err) {
      errors.push(`${e.label}: ${(err as Error).name === 'AbortError' ? 'timed out' : 'unreachable'}`);
    } finally {
      clearTimeout(t);
    }
  }
  throw new Error(`all_failed: ${errors.join('; ')}`);
}
