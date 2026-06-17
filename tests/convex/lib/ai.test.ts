import { describe, expect, it } from 'vitest';
import {
  buildLLMRequest,
  normalizeHistory,
  parseLLMResponse,
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
