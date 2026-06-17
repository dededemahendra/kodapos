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

const MAX_TOKENS = 700;

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
    const text = (json as { content?: Array<{ text?: string }> })?.content?.[0]?.text;
    if (!text) throw new Error('Respons AI kosong.');
    return text.trim();
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
