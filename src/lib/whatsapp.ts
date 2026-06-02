import { normalizePhone } from 'convex/lib/phone';

/** Plain-text Bahasa shopping list for a WhatsApp message. */
export function formatRestockText(
  cafeName: string,
  lines: Array<{ name: string; qty: number; unit: string }>
): string {
  const header = `Daftar Belanja — ${cafeName}`;
  const body = lines.map((l) => `- ${l.name}: ${l.qty} ${l.unit}`).join('\n');
  return body ? `${header}\n${body}` : header;
}

/** wa.me deep link with a normalized phone + url-encoded text. */
export function waUrl(phone: string, text: string): string {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`;
}
