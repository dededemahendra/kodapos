import { describe, expect, it } from 'vitest';
import { createSSEDecoder } from '../../../convex/lib/aiSse';

describe('createSSEDecoder — openai', () => {
  it('extracts content deltas', () => {
    const d = createSSEDecoder('openai');
    const events = d.push(
      'data: {"choices":[{"delta":{"content":"Hal"}}]}\n' +
        'data: {"choices":[{"delta":{"content":"o"}}]}\n'
    );
    expect(events).toEqual([
      { type: 'delta', text: 'Hal' },
      { type: 'delta', text: 'o' },
    ]);
  });

  it('buffers a line split across chunks', () => {
    const d = createSSEDecoder('openai');
    expect(d.push('data: {"choices":[{"delta":{"co')).toEqual([]);
    expect(d.push('ntent":"Hai"}}]}\n')).toEqual([{ type: 'delta', text: 'Hai' }]);
  });

  it('emits done on [DONE] and ignores it as text', () => {
    const d = createSSEDecoder('openai');
    expect(d.push('data: [DONE]\n')).toEqual([{ type: 'done' }]);
  });

  it('skips comment keepalives such as OpenRouter processing pings', () => {
    const d = createSSEDecoder('openrouter');
    expect(d.push(': OPENROUTER PROCESSING\n\n')).toEqual([]);
  });

  it('surfaces an in-band provider error', () => {
    const d = createSSEDecoder('openai');
    expect(d.push('data: {"error":{"message":"rate limited"}}\n')).toEqual([
      { type: 'error', message: 'rate limited' },
    ]);
  });

  it('ignores malformed JSON rather than throwing', () => {
    const d = createSSEDecoder('openai');
    expect(d.push('data: {not json\n')).toEqual([]);
  });
});

describe('createSSEDecoder — anthropic', () => {
  it('extracts text_delta and ignores other block types', () => {
    const d = createSSEDecoder('anthropic');
    const events = d.push(
      'event: message_start\ndata: {"type":"message_start"}\n\n' +
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"hmm"}}\n\n' +
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hai"}}\n\n'
    );
    expect(events).toEqual([{ type: 'delta', text: 'Hai' }]);
  });

  it('emits done on message_stop', () => {
    const d = createSSEDecoder('anthropic');
    expect(d.push('data: {"type":"message_stop"}\n')).toEqual([{ type: 'done' }]);
  });

  it('surfaces an in-band error event', () => {
    const d = createSSEDecoder('anthropic');
    expect(d.push('data: {"type":"error","error":{"message":"overloaded"}}\n')).toEqual([
      { type: 'error', message: 'overloaded' },
    ]);
  });

  it('handles CRLF line endings', () => {
    const d = createSSEDecoder('anthropic');
    expect(
      d.push('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"A"}}\r\n')
    ).toEqual([{ type: 'delta', text: 'A' }]);
  });
});

describe('createSSEDecoder — flush', () => {
  it('emits a trailing line that never got its newline', () => {
    const d = createSSEDecoder('openai');
    expect(d.push('data: {"choices":[{"delta":{"content":"end"}}]}')).toEqual([]);
    expect(d.flush()).toEqual([{ type: 'delta', text: 'end' }]);
  });
});
