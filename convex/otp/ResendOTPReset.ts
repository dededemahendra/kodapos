import type { EmailConfig } from '@convex-dev/auth/server';
import { internal } from '../_generated/api';
import type { ActionCtx } from '../_generated/server';
import { sendEmail } from '../lib/resend';

/**
 * Build the password-reset email body. Pure (no I/O) so it is unit testable.
 * English content, off the i18n catalog. A reset only needs the code (no magic
 * link), so this just presents the 8-digit code prominently. No em-dash.
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

/**
 * Derive a zero-padded 8-digit numeric code from a cryptographically secure
 * source. The 10^8 space (vs 10^6) widens the brute-force surface against the
 * verify endpoint; platform throttling + single-use-after-success bound the rest.
 */
function generateCode(): string {
  const b = new Uint8Array(4);
  globalThis.crypto.getRandomValues(b);
  const n = new DataView(b.buffer).getUint32(0);
  return String(n % 100000000).padStart(8, '0').slice(0, 8);
}

/**
 * Password-reset verification provider passed to `Password({ reset })`. The
 * 8-digit code is server-generated via `crypto.getRandomValues`, short-lived,
 * and emailed (never logged, never returned). A reset cannot complete without
 * the emailed code, so an attacker who knows only the email cannot take over.
 *
 * `sendVerificationRequest` runs server-side in a Convex action ctx
 * (`@convex-dev/auth` passes ctx as the 2nd arg; the upstream EmailConfig type
 * omits it, hence the cast), so issuance is rate-limited via runMutation here.
 */
export const ResendOTPReset: EmailConfig = {
  id: 'resend-otp-password-reset',
  type: 'email',
  // `from` is display-only and not used by `sendEmail` (RESEND_FROM owns the
  // sender); kept because the upstream type wants an EmailConfig shape.
  name: 'Password reset code',
  maxAge: 60 * 15,
  async generateVerificationToken() {
    return generateCode();
  },
  // The upstream EmailConfig types sendVerificationRequest with a single param,
  // but `@convex-dev/auth` passes the action ctx as a 2nd arg (see signIn.js's
  // `@ts-expect-error`). We declare ctx here and cast the object below.
  async sendVerificationRequest(
    { identifier: email, token }: { identifier: string; token: string },
    ctx: ActionCtx,
  ) {
    // Server-side issuance rate limit (the client cooldown is bypassable).
    // Distinct bucket from the otp flow.
    await ctx.runMutation(internal.auth_rate.checkAndBump, { identifier: `reset:${email}` });

    await sendEmail({
      to: email,
      subject: 'Reset your kodapos password',
      ...buildResetEmail(token),
    });
  },
} as unknown as EmailConfig;
