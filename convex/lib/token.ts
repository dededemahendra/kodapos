const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Opaque personal access token: `kpat_` + 43 base62 chars (~256 bits). */
export function generateToken(): string {
  const chars: string[] = [];
  while (chars.length < 43) {
    const buf = new Uint8Array(43 - chars.length);
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < 248) chars.push(ALPHABET.charAt(b % 62)); // 248 = 4*62: reject high bytes to remove modulo bias
    }
  }
  return `kpat_${chars.join('')}`;
}

/** sha-256 hex of the raw token. Store/compare only the hash. */
export async function hashToken(raw: string): Promise<string> {
  const data = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
