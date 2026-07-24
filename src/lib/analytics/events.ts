/**
 * The event registry. Every tracked event and its property shape lives here.
 *
 * With autocapture off, every event name is written by hand. Without a central
 * type, names drift (`sale_completed` versus `saleCompleted`) and PostHog
 * treats those as different events, so funnels break silently while the
 * dashboard still renders. Compile-time checking is the cheap defence.
 *
 * Every property value comes from a closed set. Never widen one of these to
 * `string` and never pass a raw error message: those can contain whatever the
 * user typed, including their email address.
 */

/** The six marketing components that actually link to /signin. */
export type CtaLocation = 'header' | 'hero' | 'ai_spotlight' | 'pricing' | 'cta_band' | 'footer';

/**
 * A stable identifier, NOT the rendered button text. The rendered text is
 * translated, so using it would split every funnel by locale.
 */
export type CtaLabel = 'start_free' | 'sign_in';

export type AuthMethod = 'otp' | 'password' | 'google';

export type AuthFailureReason = 'invalid_code' | 'invalid_password' | 'send_failed' | 'unknown';

export type EventMap = {
  marketing_cta_clicked: { location: CtaLocation; label: CtaLabel };
  auth_started: { method: AuthMethod };
  auth_code_sent: Record<string, never>;
  auth_completed: { method: AuthMethod; is_new_account: boolean };
  auth_failed: { method: AuthMethod; reason: AuthFailureReason };
};

export type EventName = keyof EventMap;
