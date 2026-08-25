import { describe, expect, it } from 'vitest';
import {
  buildLLMRequest,
  normalizeHistory,
  parseLLMResponse,
  parseProvider,
  languageInstruction,
} from '../../../convex/lib/ai';

describe('buildLLMRequest', () => {
  const msgs = [
    { role: 'user' as const, content: 'q1' },
    { role: 'assistant' as const, content: 'a1' },
    { role: 'user' as const, content: 'q2' },
  ];

  it('builds an OpenAI chat-completions request with a Bearer key + system first', () => {
    const req = buildLLMRequest('openai', 'gpt-4o-mini', 'sk-test', 'sys', msgs);
    expect(req.url).toContain('openai.com');
    expect(req.headers.authorization).toBe('Bearer sk-test');
    const body = JSON.parse(req.body);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.messages[0]).toEqual({ role: 'system', content: 'sys' });
    expect(body.messages.slice(1)).toEqual(msgs);
  });

  it('builds an OpenRouter request at openrouter.ai with a Bearer key', () => {
    const req = buildLLMRequest('openrouter', 'openai/gpt-4o-mini', 'sk-or-v1-test', 'sys', msgs);
    expect(req.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(req.headers.authorization).toBe('Bearer sk-or-v1-test');
    // Never the OpenAI endpoint: an OpenRouter key must not reach api.openai.com.
    expect(req.url).not.toContain('api.openai.com');
  });

  it('sends OpenRouter the attribution headers it ranks apps by', () => {
    const req = buildLLMRequest('openrouter', 'openai/gpt-4o-mini', 'k', 'sys', msgs);
    expect(req.headers['HTTP-Referer']).toBeTruthy();
    expect(req.headers['X-Title']).toBe('kodapos');
  });

  it('shapes the OpenRouter body like OpenAI, system message first', () => {
    const req = buildLLMRequest('openrouter', 'anthropic/claude-haiku-4.5', 'k', 'sys', msgs);
    const body = JSON.parse(req.body);
    expect(body.model).toBe('anthropic/claude-haiku-4.5');
    expect(body.messages[0]).toEqual({ role: 'system', content: 'sys' });
    expect(body.messages.slice(1)).toEqual(msgs);
  });

  it('builds an Anthropic messages request with x-api-key + version', () => {
    const req = buildLLMRequest('anthropic', 'claude-x', 'sk-ant', 'sys', msgs);
    expect(req.url).toContain('anthropic.com');
    expect(req.headers['x-api-key']).toBe('sk-ant');
    expect(req.headers['anthropic-version']).toBeTruthy();
    const body = JSON.parse(req.body);
    expect(body.system).toBe('sys');
    expect(body.messages).toEqual(msgs);
  });
});

describe('parseLLMResponse', () => {
  it('reads OpenAI choices[0].message.content', () => {
    expect(parseLLMResponse('openai', { choices: [{ message: { content: ' hi ' } }] })).toBe('hi');
  });

  it('reads Anthropic content[0].text', () => {
    expect(parseLLMResponse('anthropic', { content: [{ text: 'yo' }] })).toBe('yo');
  });

  it('concatenates Anthropic text blocks and skips non-text leading blocks', () => {
    const json = { content: [{ type: 'thinking' }, { type: 'text', text: 'a' }, { type: 'text', text: 'b' }] };
    expect(parseLLMResponse('anthropic', json)).toBe('ab');
  });

  it('reads OpenRouter through the OpenAI choices shape', () => {
    expect(parseLLMResponse('openrouter', { choices: [{ message: { content: ' ok ' } }] })).toBe('ok');
  });

  it('throws on an empty response', () => {
    expect(() => parseLLMResponse('openai', {})).toThrow();
    expect(() => parseLLMResponse('anthropic', { content: [] })).toThrow();
  });
});

describe('normalizeHistory', () => {
  it('coalesces consecutive same-role turns into alternating roles', () => {
    expect(
      normalizeHistory([
        { role: 'user', content: 'a' },
        { role: 'user', content: 'b' },
        { role: 'assistant', content: 'c' },
        { role: 'user', content: 'd' },
      ])
    ).toEqual([
      { role: 'user', content: 'a\n\nb' },
      { role: 'assistant', content: 'c' },
      { role: 'user', content: 'd' },
    ]);
  });

  it('drops a leading assistant turn and empty messages', () => {
    expect(
      normalizeHistory([
        { role: 'assistant', content: 'hi' },
        { role: 'user', content: '  ' },
        { role: 'user', content: 'q' },
      ])
    ).toEqual([{ role: 'user', content: 'q' }]);
  });
});


describe('parseProvider', () => {
  it('recognizes each supported provider', () => {
    expect(parseProvider('openai')).toBe('openai');
    expect(parseProvider('anthropic')).toBe('anthropic');
    expect(parseProvider('openrouter')).toBe('openrouter');
  });

  it("defaults a missing provider to openai, for configs saved before the field existed", () => {
    expect(parseProvider(undefined)).toBe('openai');
    expect(parseProvider(null)).toBe('openai');
  });

  it('rejects an unrecognized provider instead of falling back to openai', () => {
    // The whole point: silently resolving an unknown provider to openai would
    // send that provider's API key to api.openai.com. Fail closed.
    expect(parseProvider('groq')).toBeNull();
    expect(parseProvider('openai-compatible')).toBeNull();
    expect(parseProvider(42)).toBeNull();
  });
});


describe('languageInstruction', () => {
  it("pins the reply language when there is no question to infer from", () => {
    // The insights card and restock advisor send no question, so the app's
    // language toggle is the only signal. Before this, they always answered
    // in Indonesian even with the UI in English.
    expect(languageInstruction('en', 'fixed')).toMatch(/English/);
    expect(languageInstruction('en', 'fixed')).not.toMatch(/same language/i);
    expect(languageInstruction('id', 'fixed')).toMatch(/Indonesian/);
  });

  it('lets the question win in chat, with the toggle only breaking ties', () => {
    for (const locale of ['id', 'en'] as const) {
      const out = languageInstruction(locale, 'mirror');
      expect(out).toMatch(/same language/i);
      expect(out).toMatch(locale === 'en' ? /English/ : /Indonesian/);
    }
  });
});
