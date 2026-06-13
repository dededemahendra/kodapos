import { describe, expect, it } from 'vitest';
import { ResendOTP, buildOtpEmail } from '../../convex/otp/ResendOTP';
import { ResendOTPReset, buildResetEmail } from '../../convex/otp/ResendOTPReset';

const EM_DASH_RE = /—|--/;

describe('buildOtpEmail', () => {
  const link = 'https://x/signin#email=a%40b.com&code=12345678';
  const { text, html } = buildOtpEmail('12345678', link);

  it('shows the 8-digit code in both text and html', () => {
    expect(text).toContain('12345678');
    expect(html).toContain('12345678');
  });

  it('includes the magic link in both text and html when provided', () => {
    expect(text).toContain(link);
    expect(html).toContain(link);
  });

  it('omits the magic link when no link is provided', () => {
    const { text: t2, html: h2 } = buildOtpEmail('12345678');
    expect(t2).not.toContain('Tap to sign in');
    expect(h2).not.toContain('Tap to sign in');
    // The code is still present.
    expect(t2).toContain('12345678');
    expect(h2).toContain('12345678');
  });

  it('has no em-dash', () => {
    expect(text).not.toMatch(EM_DASH_RE);
    expect(html).not.toMatch(EM_DASH_RE);
  });
});

describe('buildResetEmail', () => {
  const { text, html } = buildResetEmail('87654321');

  it('shows the reset code in both text and html', () => {
    expect(text).toContain('87654321');
    expect(html).toContain('87654321');
  });

  it('has no em-dash', () => {
    expect(text).not.toMatch(EM_DASH_RE);
    expect(html).not.toMatch(EM_DASH_RE);
  });
});

describe('provider verification token', () => {
  it('resend-otp generates an 8-digit numeric code', async () => {
    const code = await ResendOTP.generateVerificationToken!();
    expect(code).toMatch(/^\d{8}$/);
  });

  it('resend-otp-password-reset generates an 8-digit numeric code', async () => {
    const code = await ResendOTPReset.generateVerificationToken!();
    expect(code).toMatch(/^\d{8}$/);
  });

  it('registers the expected provider ids', () => {
    expect(ResendOTP.id).toBe('resend-otp');
    expect(ResendOTPReset.id).toBe('resend-otp-password-reset');
  });
});
