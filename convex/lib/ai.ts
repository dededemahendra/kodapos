// Provider-specific request/response shaping for the bring-your-own-key AI
// integration. Pure and side-effect free so it can be unit tested without a
// network. The caller (an action) does the fetch.

export type AiProvider = 'openai' | 'anthropic';

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

const MAX_TOKENS = 1024;

/**
 * Normalizes a chat history into a strictly user/assistant-alternating list
 * starting with a user turn. Trims empties, coalesces consecutive same-role
 * turns (joining their text), and drops a leading assistant turn. The Anthropic
 * Messages API rejects non-alternating roles, so this keeps any client history
 * valid regardless of how it was assembled (e.g. after a failed send).
 */
export function normalizeHistory(messages: ChatMsg[]): ChatMsg[] {
  const out: ChatMsg[] = [];
  for (const m of messages) {
    const content = m.content.trim();
    if (!content) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) {
      last.content = `${last.content}\n\n${content}`;
    } else {
      out.push({ role: m.role, content });
    }
  }
  while (out.length > 0 && out[0]!.role === 'assistant') out.shift();
  return out;
}

/** Builds the HTTP request for a chat completion on the given provider. The
 * `system` instruction is sent separately (Anthropic) or as the leading system
 * message (OpenAI); `messages` is the user/assistant turn history. */
export function buildLLMRequest(
  provider: AiProvider,
  model: string,
  apiKey: string,
  system: string,
  messages: ChatMsg[]
): LLMRequest {
  if (provider === 'anthropic') {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: MAX_TOKENS, system, messages }),
    };
  }
  // openai (and OpenAI-compatible)
  return {
    url: 'https://api.openai.com/v1/chat/completions',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      temperature: 0.3,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
  };
}

/** Extracts the assistant text from a provider's JSON response. Throws if absent. */
export function parseLLMResponse(provider: AiProvider, json: unknown): string {
  if (provider === 'anthropic') {
    // content is an array of typed blocks; concatenate every text block (skips
    // non-text blocks like thinking/tool_use that some models emit first).
    const blocks = (json as { content?: Array<{ text?: string }> })?.content;
    const text = Array.isArray(blocks)
      ? blocks
          .map((b) => (typeof b.text === 'string' ? b.text : ''))
          .join('')
          .trim()
      : '';
    if (!text) throw new Error('Respons AI kosong.');
    return text;
  }
  const text = (json as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]
    ?.message?.content;
  if (!text) throw new Error('Respons AI kosong.');
  return text.trim();
}

export const INSIGHTS_SYSTEM_PROMPT =
  'You are a concise analytics assistant for a small Indonesian cafe POS. ' +
  'Given the cafe data as JSON, reply in plain text (no markdown headings): ' +
  '3 to 5 short insight bullets starting with "- ", then 2 to 3 actionable ' +
  'recommendations under a "Saran:" line. Money is Indonesian rupiah. Reply in ' +
  'the same language as the question if one is given, otherwise in Indonesian. ' +
  'Be specific and use the numbers; do not invent data.';

export const ASK_SYSTEM_PROMPT =
  'You are a helpful analytics assistant for a small Indonesian cafe POS. ' +
  'Answer the owner question using ONLY the provided cafe data (JSON). Be ' +
  'concise and plain text. If the data does not contain the answer, say so. ' +
  'Money is Indonesian rupiah. Answer in the same language as the question.';

export const RESTOCK_SYSTEM_PROMPT =
  'You are a concise restock advisor for a small Indonesian cafe POS. You are ' +
  'given JSON with the cafe name, a "restock" list (ingredients the planner ' +
  'suggests buying, each with the suggested quantity, unit, and current stock), ' +
  'and a "demand" forecast (per menu item, expected quantity for tomorrow and ' +
  'the next 7 days, with drivers explaining the trend). Reply in Indonesian, ' +
  'plain text, no markdown headings. Start with one short summary sentence, then ' +
  'a "- " bullet per ingredient to order: the ingredient name, the quantity to ' +
  'buy with its unit, and a brief reason grounded in the data (low stock versus ' +
  'demand, weekend or weather drivers, fast-selling items that use it). Order the ' +
  'bullets by urgency, lowest stock relative to demand first. End with one short ' +
  'line on what to prioritize. Use only the numbers provided; do not invent data. ' +
  'Money is Indonesian rupiah.';
