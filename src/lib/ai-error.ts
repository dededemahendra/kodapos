import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';

/**
 * Map an AI action error into a friendly, localized message for a toast.
 *
 * Convex surfaces a thrown server error to the client as a raw wrapper that
 * includes the function name, a request ID, and a stack trace, e.g.
 * "[CONVEX A(ai:insights)] [Request ID: ...] Server Error Uncaught Error:
 * Gagal memanggil AI (404). at callAi (../convex/ai.ts:137:2) Called by client".
 * Showing that verbatim in a toast confuses users, so we classify the error by
 * the underlying message and return a clean, actionable summary, hiding the
 * status code and stack detail.
 */
export function aiErrorMessage(err: unknown): MessageDescriptor {
  const raw = err instanceof Error ? err.message : String(err);

  // The owner has not connected an AI key yet.
  if (/belum dikonfigurasi/i.test(raw)) {
    return msg`AI belum terhubung. Hubungkan kunci API di Pengaturan, Integrasi.`;
  }

  // Timed out or the network dropped.
  if (/waktu habis|jaringan/i.test(raw)) {
    return msg`Permintaan AI gagal karena masalah jaringan. Coba lagi.`;
  }

  // Anything else (provider error such as 404/401/500, empty response, etc.):
  // a generic, reassuring fallback that points to the likely fix.
  return msg`Fitur AI sedang tidak tersedia. Periksa pengaturan AI Anda atau coba lagi nanti.`;
}
