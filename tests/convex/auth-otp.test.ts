import { describe, expect, it } from 'vitest';
import { ResendOTP, buildOtpEmail } from '../../convex/otp/ResendOTP';
import { ResendOTPReset, buildResetEmail } from '../../convex/otp/ResendOTPReset';

const EM_DASH_RE = /—|--/;

describe('buildOtpEmail', () => {
  const link = 'https://x/signin?email=a%40b.com&code=123456';
  const { text, html } = buildOtpEmail('123456', link);

  it('shows the 6-digit code in both text and html', () => {
    expect(text).toContain('123456');
    expect(html).toContain('123456');
  });

  it('includes the magic link in both text and html', () => {
    expect(text).toContain(link);
    expect(html).toContain(link);
  });

  it('has no em-dash', () => {
    expect(text).not.toMatch(EM_DASH_RE);
    expect(html).not.toMatch(EM_DASH_RE);
  });
});

describe('buildResetEmail', () => {
  const { text, html } = buildResetEmail('654321');

  it('shows the reset code in both text and html', () => {
    expect(text).toContain('654321');
    expect(html).toContain('654321');
  });

  it('has no em-dash', () => {
    expect(text).not.toMatch(EM_DASH_RE);
    expect(html).not.toMatch(EM_DASH_RE);
  });
});

describe('provider verification token', () => {
  it('resend-otp generates a 6-digit numeric code', async () => {
    const code = await ResendOTP.generateVerificationToken!();
    expect(code).toMatch(/^\d{6}$/);
  });

  it('resend-otp-password-reset generates a 6-digit numeric code', async () => {
    const code = await ResendOTPReset.generateVerificationToken!();
    expect(code).toMatch(/^\d{6}$/);
  });

  it('registers the expected provider ids', () => {
    expect(ResendOTP.id).toBe('resend-otp');
    expect(ResendOTPReset.id).toBe('resend-otp-password-reset');
  });
});
