// Pure helpers for the generic (provider-agnostic) WhatsApp integration. The
// owner configures an endpoint, an auth header + token, and a JSON body template
// with {{phone}} and {{message}} placeholders; the server fills the template and
// POSTs it. Kept side-effect free so it can be unit tested without a network.

export const PHONE_PLACEHOLDER = '{{phone}}';
export const MESSAGE_PLACEHOLDER = '{{message}}';

/**
 * Normalizes a phone number to digits in international form, defaulting to
 * Indonesia. Strips spaces, dashes, parentheses and a leading '+'; converts a
 * leading '0' to the 62 country code. Throws on an implausibly short number.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '').replace(/^\+/, '');
  let n = digits.replace(/\D/g, '');
  if (n.startsWith('0')) n = `62${n.slice(1)}`;
  if (n.length < 8) throw new Error('Nomor telepon tidak valid.');
  return n;
}

/** Recursively replaces the placeholders in every string leaf of a parsed JSON value. */
function fill(value: unknown, phone: string, message: string): unknown {
  if (typeof value === 'string') {
    return value.split(PHONE_PLACEHOLDER).join(phone).split(MESSAGE_PLACEHOLDER).join(message);
  }
  if (Array.isArray(value)) return value.map((v) => fill(v, phone, message));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, fill(v, phone, message)])
    );
  }
  return value;
}

/**
 * Parses the JSON body template and substitutes {{phone}} / {{message}} into its
 * string values, returning a JSON string ready to POST. Replacing inside parsed
 * values (then re-stringifying) keeps the message correctly escaped even with
 * newlines or quotes. Throws if the template is not valid JSON.
 */
export function buildWhatsappBody(template: string, phone: string, message: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(template);
  } catch {
    throw new Error('Template body WhatsApp bukan JSON yang valid.');
  }
  return JSON.stringify(fill(parsed, phone, message));
}

/** Validates a body template at connect time: must be valid JSON and reference {{message}}. */
export function assertValidTemplate(template: string): void {
  try {
    JSON.parse(template);
  } catch {
    throw new Error('Template body WhatsApp bukan JSON yang valid.');
  }
  if (!template.includes(MESSAGE_PLACEHOLDER)) {
    throw new Error('Template body harus memuat placeholder {{message}}.');
  }
}

/** The default body template (Fonnte-style); a sensible starting point for the owner. */
export const DEFAULT_WHATSAPP_TEMPLATE = '{"target":"{{phone}}","message":"{{message}}"}';
