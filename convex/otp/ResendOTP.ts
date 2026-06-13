import type { EmailConfig } from '@convex-dev/auth/server';
import { internal } from '../_generated/api';
import type { ActionCtx } from '../_generated/server';
import { sendEmail } from '../lib/resend';

/**
 * Build the passwordless sign-in email body. Pure (no I/O) so it is unit
 * testable. English content, off the i18n catalog. Shows the 8-digit code
 * prominently and, when a real frontend origin is configured, offers a
 * "Tap to sign in" magic link that carries the same code. No em-dash anywhere.
 */
export function buildOtpEmail(code: string, link?: string): { html: string; text: string } {
  const text = [
    'Your kodapos sign-in code is:',
    '',
    code,
    '',
    'This code expires in 15 minutes.',
    ...(link ? ['Tap to sign in: ' + link] : []),
    '',
    'If you did not request this, you can ignore this email.',
  ].join('\n');

  const linkBlock = link
    ? `<p style="margin: 0 0 16px;">
      <a href="${link}" style="background: #16a34a; color: #ffffff; padding: 10px 18px; border-radius: 6px; text-decoration: none;">Tap to sign in</a>
    </p>`
    : '';

  const html = `<!doctype html>
<html>
  <body style="font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; line-height: 1.5;">
    <h2 style="margin: 0 0 12px;">Sign in to kodapos</h2>
    <p style="margin: 0 0 8px;">Your sign-in code is:</p>
    <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px; margin: 0 0 16px;">${code}</p>
    <p style="margin: 0 0 16px;">This code expires in 15 minutes.</p>
    ${linkBlock}
    <p style="color: #6b7280; font-size: 13px; margin: 0;">If you did not request this, you can ignore this email.</p>
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
 * Passwordless sign-in provider. The 8-digit code is server-generated via
 * `crypto.getRandomValues`, short-lived (15 min), and emailed (never logged,
 * never returned). When SITE_URL (a real frontend origin) is set, the same code
 * also rides a `/signin#email=&code=` magic link (code in the URL FRAGMENT so it
 * never reaches a server log / Referer); otherwise the email carries the code only.
 *
 * `sendVerificationRequest` runs server-side in a Convex action ctx
 * (`@convex-dev/auth` passes ctx as the 2nd arg; the upstream EmailConfig type
 * omits it, hence the cast), so issuance is rate-limited via runMutation here.
 */
export const ResendOTP: EmailConfig = {
  id: 'resend-otp',
  type: 'email',
  // `from` is display-only and not used by `sendEmail` (RESEND_FROM owns the
  // sender); kept because the upstream type wants an EmailConfig shape.
  name: 'Email code',
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
    await ctx.runMutation(internal.auth_rate.checkAndBump, { identifier: `otp:${email}` });

    // Only build a magic link when a REAL frontend origin is configured.
    // CONVEX_SITE_URL is the backend host (a link there is broken), so never
    // fall back to it: emit the code-only email instead.
    const origin = process.env.SITE_URL;
    let link: string | undefined;
    if (origin) {
      // Code in the URL FRAGMENT (#), never the query string: fragments are not
      // sent to servers and never leak via Referer / access logs.
      link = `${origin}/signin#email=${encodeURIComponent(email)}&code=${token}`;
    } else {
      console.warn('SITE_URL not set; magic link omitted');
    }

    await sendEmail({
      to: email,
      subject: 'Your kodapos sign-in code',
      ...buildOtpEmail(token, link),
    });
  },
} as unknown as EmailConfig;
