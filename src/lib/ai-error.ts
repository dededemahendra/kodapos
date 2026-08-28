import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import type { AiErrorCode } from 'convex/lib/ai';

/**
 * Maps a `/ai/stream` failure code to localized copy for a toast.
 *
 * The route sends a machine-readable code and never user-facing prose, so this
 * is a lookup rather than the string-matching it replaced (which parsed
 * Indonesian out of Convex's error wrapper, and so returned Indonesian even
 * with the UI in English).
 */
export function aiErrorMessage(code: AiErrorCode | null): MessageDescriptor {
  switch (code) {
    case 'not_configured':
      return msg`AI belum terhubung. Hubungkan kunci API di Pengaturan, Integrasi.`;
    case 'rate_limited':
      return msg`Batas penggunaan AI tercapai. Coba lagi sebentar.`;
    case 'network':
      return msg`Permintaan AI gagal karena masalah jaringan. Coba lagi.`;
    case 'unauthorized':
      return msg`Sesi Anda berakhir. Masuk lagi untuk memakai AI.`;
    case 'empty':
      return msg`AI tidak memberi jawaban. Coba lagi.`;
    default:
      return msg`Fitur AI sedang tidak tersedia. Periksa pengaturan AI Anda atau coba lagi nanti.`;
  }
}
