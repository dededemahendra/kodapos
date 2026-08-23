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

/**
 * The six marketing components that actually link to /signin, plus
 * `feature_page`, shared by all `/fitur/*` feature pages rather than minting
 * a permanent per-page literal for each — pageview events already carry the
 * pathname, so that's what separates them in analytics.
 *
 * These string literals are permanent once shipped: PostHog has no concept of
 * renaming a value, so changing one splits the funnel into "everything before"
 * and "everything after" instead of one continuous series. Add new members;
 * never rename or repurpose an existing one.
 */
export type CtaLocation =
  | 'header'
  | 'hero'
  | 'ai_spotlight'
  | 'pricing'
  | 'cta_band'
  | 'footer'
  | 'feature_page';

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
