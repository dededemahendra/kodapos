import { describe, expect, it, vi } from 'vitest';
import { sendResetOrSigninCode } from './auth-reset';

describe('sendResetOrSigninCode', () => {
  it("returns 'reset' and never falls back when the reset send succeeds", async () => {
    const sendReset = vi.fn().mockResolvedValue(undefined);
    const sendSigninCode = vi.fn().mockResolvedValue(undefined);

    const outcome = await sendResetOrSigninCode({ sendReset, sendSigninCode });

    expect(outcome).toBe('reset');
    expect(sendReset).toHaveBeenCalledTimes(1);
    expect(sendSigninCode).not.toHaveBeenCalled();
  });

  it("falls back to a sign-in code and returns 'fallback' when the reset send fails", async () => {
    // The passwordless-first case: no password account, so reset throws
    // InvalidAccountId before any email is sent.
    const sendReset = vi.fn().mockRejectedValue(new Error('InvalidAccountId'));
    const sendSigninCode = vi.fn().mockResolvedValue(undefined);

    const outcome = await sendResetOrSigninCode({ sendReset, sendSigninCode });

    expect(outcome).toBe('fallback');
    expect(sendReset).toHaveBeenCalledTimes(1);
    expect(sendSigninCode).toHaveBeenCalledTimes(1);
  });

  it('rethrows when both the reset and the sign-in code sends fail (real email outage)', async () => {
    const sendReset = vi.fn().mockRejectedValue(new Error('InvalidAccountId'));
    const sendSigninCode = vi.fn().mockRejectedValue(new Error('Gagal mengirim email.'));

    await expect(sendResetOrSigninCode({ sendReset, sendSigninCode })).rejects.toThrow(
      'Gagal mengirim email.',
    );
    expect(sendSigninCode).toHaveBeenCalledTimes(1);
  });
});
