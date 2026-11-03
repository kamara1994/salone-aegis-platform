import { describe, expect, it } from 'vitest';
import { buildRequest, complete, configured, detectProvider, parseReply } from '@/server/ai';
import { tutorSystemPrompt } from '@/server/tutorPrompt';

describe('AI provider detection', () => {
  it('recognises keys by their prefix', () => {
    expect(detectProvider('sk-ant-api03-abc')).toBe('anthropic');
    expect(detectProvider('sk-proj-abc')).toBe('openai');
    expect(detectProvider('sk-or-v1-abc')).toBe('openrouter');
    expect(detectProvider('gsk_abc')).toBe('groq');
    expect(detectProvider('AIzaSyabc')).toBe('gemini');
    expect(detectProvider('xai-abc')).toBe('xai');
    expect(detectProvider('pplx-abc')).toBe('perplexity');
    expect(detectProvider('nonsense')).toBeNull();
  });

  it('builds a fallback chain from every key it finds', () => {
    const list = configured({ AI_API_KEY: 'gsk_x', ANTHROPIC_API_KEY: 'sk-ant-y', GEMINI_API_KEY: 'AIza' });
    expect(list.map((e) => e.id)).toEqual(['groq', 'anthropic', 'gemini']);
  });

  it('honours model and base URL overrides, and local models without a key', () => {
    const list = configured({ AI_API_KEY: 'sk-ant-y', AI_MODEL: 'claude-haiku-5-5', OLLAMA_BASE_URL: 'http://127.0.0.1:11434/v1/' });
    expect(list[0].model).toBe('claude-haiku-5-5');
    expect(list[1]).toMatchObject({ id: 'ollama', base: 'http://127.0.0.1:11434/v1', key: '' });
  });

  it('supports any OpenAI-compatible server with AI_BASE_URL', () => {
    const [e] = configured({ AI_BASE_URL: 'https://llm.example.com/v1', AI_API_KEY: 'k', AI_MODEL: 'm' });
    expect(e).toMatchObject({ id: 'custom', base: 'https://llm.example.com/v1', model: 'm' });
  });

  it('returns nothing when no key is set', () => {
    expect(configured({})).toEqual([]);
  });
});

describe('AI requests', () => {
  const msgs = [{ role: 'user' as const, content: 'What is a VLAN?' }];
  it('speaks each provider dialect', () => {
    const [a, o, g] = configured({ ANTHROPIC_API_KEY: 'sk-ant-y', OPENAI_API_KEY: 'sk-proj-z', GEMINI_API_KEY: 'AIza' });
    const ra = buildRequest(a, 'sys', msgs);
    expect(ra.url).toBe('https://api.anthropic.com/v1/messages');
    expect(ra.init.headers['x-api-key']).toBe('sk-ant-y');
    expect(JSON.parse(ra.init.body).system).toBe('sys');
    const ro = buildRequest(o, 'sys', msgs);
    expect(ro.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(ro.init.headers.authorization).toBe('Bearer sk-proj-z');
    expect(JSON.parse(ro.init.body).messages[0]).toEqual({ role: 'system', content: 'sys' });
    const rg = buildRequest(g, 'sys', msgs);
    expect(rg.url).toContain(':generateContent');
    expect(JSON.parse(rg.init.body).contents[0].role).toBe('user');
  });

  it('reads replies from each provider', () => {
    const [a, o, g] = configured({ ANTHROPIC_API_KEY: 'sk-ant-y', OPENAI_API_KEY: 'sk-proj-z', GEMINI_API_KEY: 'AIza' });
    expect(parseReply(a, { content: [{ type: 'text', text: 'hi' }] })).toBe('hi');
    expect(parseReply(o, { choices: [{ message: { content: 'hi' } }] })).toBe('hi');
    expect(parseReply(g, { candidates: [{ content: { parts: [{ text: 'hi' }] } }] })).toBe('hi');
  });

  it('falls through to the next provider when one fails, and never leaks keys', async () => {
    const calls: string[] = [];
    const fetcher = (async (url: string) => {
      calls.push(url);
      if (url.includes('anthropic')) return new Response('down', { status: 529 });
      return new Response(JSON.stringify({ choices: [{ message: { content: 'from openai' } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await complete('sys', msgs, { env: { ANTHROPIC_API_KEY: 'sk-ant-secret', OPENAI_API_KEY: 'sk-proj-secret' }, fetcher });
    expect(r).toMatchObject({ text: 'from openai', provider: 'OpenAI' });
    expect(calls).toHaveLength(2);
    await expect(complete('sys', msgs, { env: { ANTHROPIC_API_KEY: 'sk-ant-secret' }, fetcher })).rejects.not.toThrow(/secret/);
  });
});

describe('tutor prompt', () => {
  it('grounds the model in the lesson and the learner', () => {
    const p = tutorSystemPrompt({ messages: [], lesson: { id: '8.01', title: 'What Is a VLAN?', definition: 'A VLAN groups devices…' }, learner: { name: 'Joe', style: 'simple', hard: ['How a Switch Learns MAC Addresses'] } });
    expect(p).toContain('What Is a VLAN?');
    expect(p).toContain('Joe');
    expect(p).toContain('How a Switch Learns MAC Addresses');
    expect(p).toMatch(/exam dumps/);
  });
});
