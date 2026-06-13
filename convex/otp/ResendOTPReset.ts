import type { EmailConfig } from '@convex-dev/auth/server';
import { sendEmail } from '../lib/resend';

/**
 * Build the password-reset email body. Pure (no I/O) so it is unit testable.
 * English content, off the i18n catalog. A reset only needs the code (no magic
 * link), so this just presents the 6-digit code prominently. No em-dash.
 */
export function buildResetEmail(code: string): { html: string; text: string } {
  const text = [
    'Use this code to reset your kodapos password:',
    '',
    code,
    '',
    'This code expires in 15 minutes.',
    '',
    'If you did not request a password reset, you can ignore this email.',
  ].join('\n');

  const html = `<!doctype html>
<html>
  <body style="font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; line-height: 1.5;">
    <h2 style="margin: 0 0 12px;">Reset your kodapos password</h2>
    <p style="margin: 0 0 8px;">Use this code to reset your password:</p>
    <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px; margin: 0 0 16px;">${code}</p>
    <p style="margin: 0 0 16px;">This code expires in 15 minutes.</p>
    <p style="color: #6b7280; font-size: 13px; margin: 0;">If you did not request a password reset, you can ignore this email.</p>
  </body>
</html>`;

  return { html, text };
}

/** Derive a zero-padded 6-digit numeric code from a cryptographically secure source. */
function generateCode(): string {
  const b = new Uint8Array(4);
  globalThis.crypto.getRandomValues(b);
  const n = new DataView(b.buffer).getUint32(0);
  return String(n % 1000000).padStart(6, '0').slice(0, 6);
}

/**
 * Password-reset verification provider passed to `Password({ reset })`. The
 * 6-digit code is server-generated via `crypto.getRandomValues`, short-lived,
 * and emailed (never logged, never returned). A reset cannot complete without
 * the emailed code, so an attacker who knows only the email cannot take over.
 */
export const ResendOTPReset: EmailConfig = {
  id: 'resend-otp-password-reset',
  type: 'email',
  name: 'Password reset code',
  from: 'kodapos <onboarding@resend.dev>',
  maxAge: 60 * 15,
  async generateVerificationToken() {
    return generateCode();
  },
  async sendVerificationRequest({ identifier: email, token }) {
    await sendEmail({
      to: email,
      subject: 'Reset your kodapos password',
      ...buildResetEmail(token),
    });
  },
};
