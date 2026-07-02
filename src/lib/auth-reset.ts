/**
 * "Forgot password" send for a passwordless-first app.
 *
 * Registration here is passwordless (an emailed sign-in code), so most accounts
 * have no password to reset. `signIn('password', { flow: 'reset' })` then throws
 * `InvalidAccountId` *before any email is sent* (the reset provider looks up an
 * existing password account first). Surfacing that as "email not configured" is
 * misleading, so instead we fall back to emailing a passwordless sign-in code:
 * a code is exactly what a password-less account needs to get in.
 *
 * Returns 'reset' when the reset code was sent (the account has a password), or
 * 'fallback' when a sign-in code was sent instead. Rethrows only when BOTH sends
 * fail, i.e. a genuine email outage, so the caller can show the email error.
 */
export type ResetSendOutcome = 'reset' | 'fallback';

export async function sendResetOrSigninCode(opts: {
  sendReset: () => Promise<unknown>;
  sendSigninCode: () => Promise<unknown>;
}): Promise<ResetSendOutcome> {
  try {
    await opts.sendReset();
    return 'reset';
  } catch {
    // No password on this account (or reset unavailable). Send a passwordless
    // sign-in code instead; a real email outage rethrows here for the caller.
    await opts.sendSigninCode();
    return 'fallback';
  }
}
