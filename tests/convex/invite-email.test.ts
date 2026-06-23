import { describe, expect, it } from 'vitest';
import { buildInviteEmail } from '../../convex/lib/inviteEmail';

describe('buildInviteEmail', () => {
  it('includes the business name and sign-in URL', () => {
    const { subject, html, text } = buildInviteEmail({
      businessName: 'Kopi Senja',
      signInUrl: 'https://app.example/signin',
    });
    expect(subject).toContain('Kopi Senja');
    expect(html).toContain('Kopi Senja');
    expect(html).toContain('https://app.example/signin');
    expect(text).toContain('https://app.example/signin');
  });

  it('omits the link line when no sign-in URL is provided', () => {
    const { text } = buildInviteEmail({ businessName: 'Kopi Senja', signInUrl: null });
    expect(text).not.toContain('http');
  });
});
