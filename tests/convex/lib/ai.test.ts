import { describe, expect, it } from 'vitest';
import { buildLLMRequest, parseLLMResponse } from '../../../convex/lib/ai';

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

  it('throws on an empty response', () => {
    expect(() => parseLLMResponse('openai', {})).toThrow();
    expect(() => parseLLMResponse('anthropic', { content: [] })).toThrow();
  });
});
