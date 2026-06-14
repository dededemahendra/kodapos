import { describe, expect, it } from 'vitest';
import {
  assertValidTemplate,
  buildWhatsappBody,
  DEFAULT_WHATSAPP_TEMPLATE,
  normalizePhone,
} from '../../../convex/lib/whatsapp';

describe('normalizePhone', () => {
  it('converts a leading 0 to the 62 country code', () => {
    expect(normalizePhone('0812-3456-7890')).toBe('6281234567890');
  });

  it('strips spaces, dashes, parens and a leading +', () => {
    expect(normalizePhone('+62 (812) 3456 7890')).toBe('6281234567890');
  });

  it('keeps an already country-coded number', () => {
    expect(normalizePhone('6281234567890')).toBe('6281234567890');
  });

  it('throws on an implausibly short number', () => {
    expect(() => normalizePhone('123')).toThrow();
  });
});

describe('buildWhatsappBody', () => {
  it('substitutes phone and message into the template', () => {
    const body = buildWhatsappBody(DEFAULT_WHATSAPP_TEMPLATE, '6281234567890', 'Hello');
    expect(JSON.parse(body)).toEqual({ target: '6281234567890', message: 'Hello' });
  });

  it('keeps a multi-line message correctly escaped (valid JSON)', () => {
    const message = 'Line 1\nLine 2 "quoted"';
    const body = buildWhatsappBody(DEFAULT_WHATSAPP_TEMPLATE, '628', message);
    expect(JSON.parse(body).message).toBe(message);
  });

  it('replaces placeholders nested in objects and arrays', () => {
    const tpl = '{"to":"{{phone}}","msgs":[{"text":"{{message}}"}]}';
    const body = buildWhatsappBody(tpl, '628', 'Hi');
    expect(JSON.parse(body)).toEqual({ to: '628', msgs: [{ text: 'Hi' }] });
  });

  it('throws on an invalid template', () => {
    expect(() => buildWhatsappBody('{not json', '628', 'x')).toThrow();
  });
});

describe('assertValidTemplate', () => {
  it('accepts the default template', () => {
    expect(() => assertValidTemplate(DEFAULT_WHATSAPP_TEMPLATE)).not.toThrow();
  });

  it('rejects invalid JSON', () => {
    expect(() => assertValidTemplate('{bad')).toThrow();
  });

  it('rejects a template without the message placeholder', () => {
    expect(() => assertValidTemplate('{"target":"{{phone}}"}')).toThrow();
  });
});
