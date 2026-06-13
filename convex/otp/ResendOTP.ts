import type { EmailConfig } from '@convex-dev/auth/server';
import { sendEmail } from '../lib/resend';

/**
 * Build the passwordless sign-in email body. Pure (no I/O) so it is unit
 * testable. English content, off the i18n catalog. Shows the 6-digit code
 * prominently and offers a "Tap to sign in" magic link that carries the same
 * code. No em-dash anywhere.
 */
export function buildOtpEmail(code: string, link: string): { html: string; text: string } {
  const text = [
    'Your kodapos sign-in code is:',
    '',
    code,
    '',
    'This code expires in 15 minutes.',
    'Tap to sign in: ' + link,
    '',
    'If you did not request this, you can ignore this email.',
  ].join('\n');

  const html = `<!doctype html>
<html>
  <body style="font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; line-height: 1.5;">
    <h2 style="margin: 0 0 12px;">Sign in to kodapos</h2>
    <p style="margin: 0 0 8px;">Your sign-in code is:</p>
    <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px; margin: 0 0 16px;">${code}</p>
    <p style="margin: 0 0 16px;">This code expires in 15 minutes.</p>
    <p style="margin: 0 0 16px;">
      <a href="${link}" style="background: #16a34a; color: #ffffff; padding: 10px 18px; border-radius: 6px; text-decoration: none;">Tap to sign in</a>
    </p>
    <p style="color: #6b7280; font-size: 13px; margin: 0;">If you did not request this, you can ignore this email.</p>
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
 * Passwordless sign-in provider. The 6-digit code is server-generated via
 * `crypto.getRandomValues`, short-lived (15 min), and emailed (never logged,
 * never returned). The same code rides a `/signin?email=&code=` magic link so
 * the user can tap in or type the code.
 */
export const ResendOTP: EmailConfig = {
  id: 'resend-otp',
  type: 'email',
  name: 'Email code',
  from: 'kodapos <onboarding@resend.dev>',
  maxAge: 60 * 15,
  async generateVerificationToken() {
    return generateCode();
  },
  async sendVerificationRequest({ identifier: email, token }) {
    const origin = process.env.SITE_URL ?? process.env.CONVEX_SITE_URL ?? '';
    const link = `${origin}/signin?email=${encodeURIComponent(email)}&code=${token}`;
    await sendEmail({
      to: email,
      subject: 'Your kodapos sign-in code',
      ...buildOtpEmail(token, link),
    });
  },
};
