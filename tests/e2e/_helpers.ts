import type { Page } from '@playwright/test';

/**
 * Navigate to a path and wait for the SPA to finish hydrating before
 * interacting with controlled UI.
 *
 * Playwright's default `goto` waits for `load` (window.onload), but React's
 * event listeners attach AFTER hydration finishes. If a test clicks a
 * submit button before that, the form submits natively (page navigates to
 * `?name=...&email=...` instead of being intercepted by the React
 * `onSubmit` handler). `networkidle` lines up well with hydration completing
 * for this Vite + TanStack Start setup.
 */
export async function gotoHydrated(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

/**
 * Wait for `waitForURL` to settle AND for the freshly-loaded page to hydrate.
 * Use after any in-app redirect that crosses a hard-navigation boundary —
 * the `OnboardingGate` and `SignedOutRedirect` components in `_pos.tsx`
 * trigger `window.location.replace`, which restarts the hydration cycle.
 */
export async function waitForUrlHydrated(
  page: Page,
  url: RegExp | string,
  options?: { timeout?: number }
): Promise<void> {
  await page.waitForURL(url, options);
  await page.waitForLoadState('networkidle');
}
