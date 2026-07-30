import { describe, expect, it } from 'vitest';
import {
  buildSuperProperties,
  isCustomerSurface,
  isNewAccount,
  isTrackedHost,
  NEW_ACCOUNT_WINDOW_MS,
  scrubExceptionProperties,
  scrubExceptionText,
  shouldTrackPath,
} from '../../src/lib/analytics/policy';

describe('isTrackedHost', () => {
  // The key now lives in the Cloudflare dashboard, so every build that ships
  // carries it: local dev, branch previews and production all become live
  // trackers unless the host itself is checked. Real product data must not be
  // polluted by developer sessions, and a preview URL must never write to the
  // production project.
  it('tracks the production domain', () => {
    expect(isTrackedHost('kodapos.app')).toBe(true);
    expect(isTrackedHost('www.kodapos.app')).toBe(true);
  });

  it('does not track local development', () => {
    expect(isTrackedHost('localhost')).toBe(false);
    expect(isTrackedHost('127.0.0.1')).toBe(false);
    expect(isTrackedHost('0.0.0.0')).toBe(false);
  });

  it('does not track Cloudflare preview deployments', () => {
    expect(isTrackedHost('kodapos.workers.dev')).toBe(false);
    expect(isTrackedHost('a1b2c3-kodapos.dede.workers.dev')).toBe(false);
  });

  // Exact match, never a suffix or prefix test. `endsWith('kodapos.app')` would
  // accept an attacker-controlled `kodapos.app.example.com`, and
  // `includes('kodapos.app')` is worse still.
  it('does not track lookalike hosts', () => {
    expect(isTrackedHost('kodapos.app.example.com')).toBe(false);
    expect(isTrackedHost('notkodapos.app')).toBe(false);
    expect(isTrackedHost('staging.kodapos.app')).toBe(false);
    expect(isTrackedHost('')).toBe(false);
  });
});

describe('shouldTrackPath', () => {
  it('tracks the marketing pages', () => {
    for (const path of ['/', '/signin', '/signup', '/changelog', '/privacy', '/terms']) {
      expect(shouldTrackPath(path)).toBe(true);
    }
  });

  it('ignores a trailing slash', () => {
    expect(shouldTrackPath('/signin/')).toBe(true);
    expect(shouldTrackPath('/')).toBe(true);
  });

  // These three are the privacy-critical exclusions from the design doc.
  it('never tracks the cafe customer self-order page', () => {
    expect(shouldTrackPath('/order/477289968ce6e4948622c74c87048c94')).toBe(false);
    expect(shouldTrackPath('/order')).toBe(false);
  });

  it('never tracks the unattended customer screens', () => {
    expect(shouldTrackPath('/menu-board')).toBe(false);
    expect(shouldTrackPath('/display')).toBe(false);
  });

  it('does not track authenticated surfaces in this slice', () => {
    for (const path of ['/dashboard', '/cashier', '/reservations', '/kitchen', '/admin/users']) {
      expect(shouldTrackPath(path)).toBe(false);
    }
  });

  it('default-denies an unknown route', () => {
    expect(shouldTrackPath('/some-route-added-next-week')).toBe(false);
  });
});

describe('isNewAccount', () => {
  it('treats a just-created account as new', () => {
    expect(isNewAccount(0)).toBe(true);
    expect(isNewAccount(NEW_ACCOUNT_WINDOW_MS - 1)).toBe(true);
  });

  it('treats an older account as returning', () => {
    expect(isNewAccount(NEW_ACCOUNT_WINDOW_MS)).toBe(false);
    expect(isNewAccount(86_400_000)).toBe(false);
  });

  it('treats clock skew as returning rather than new', () => {
    expect(isNewAccount(-5_000)).toBe(false);
  });
});

describe('isCustomerSurface', () => {
  // Gates whether the SDK even initialises, independent of shouldTrackPath's
  // pageview allowlist: cafe end-customers must never load posthog-js at
  // all, not just be excluded from pageview events.
  it('flags the cafe customer self-order page, with or without a token', () => {
    expect(isCustomerSurface('/order/477289968ce6e4948622c74c87048c94')).toBe(true);
    expect(isCustomerSurface('/order')).toBe(true);
  });

  it('flags the unattended customer screens', () => {
    expect(isCustomerSurface('/menu-board')).toBe(true);
    expect(isCustomerSurface('/display')).toBe(true);
  });

  it('does not flag ordinary marketing or authenticated paths', () => {
    for (const path of ['/', '/signin', '/signup', '/dashboard', '/cashier']) {
      expect(isCustomerSurface(path)).toBe(false);
    }
  });
});

describe('scrubExceptionText', () => {
  // The privacy policy commits to not sending emails or phone numbers to
  // PostHog. Exception autocapture is the only path that ships text nobody on
  // this team wrote, so these two patterns are what makes that commitment true
  // rather than aspirational.
  it('redacts email addresses', () => {
    expect(scrubExceptionText('no customer for budi.santoso@gmail.com')).toBe(
      'no customer for [email]'
    );
  });

  it('redacts Indonesian phone numbers in the formats they are written in', () => {
    expect(scrubExceptionText('lookup failed for 081234567890')).toBe('lookup failed for [number]');
    expect(scrubExceptionText('lookup failed for +62 812-3456-7890')).toBe(
      'lookup failed for [number]'
    );
    expect(scrubExceptionText('lookup failed for (0361) 123456')).toBe(
      'lookup failed for [number]'
    );
  });

  // Order matters: emails are redacted first so an address with digits in it is
  // already gone. Scrubbing digits first would leave `user[number]@x.com` and
  // the email pattern would then only half-match the debris.
  it('redacts an email containing a long digit run without leaving debris', () => {
    expect(scrubExceptionText('failed for budi123456789@gmail.com')).toBe('failed for [email]');
  });

  it('leaves ordinary error text and short numbers intact', () => {
    expect(scrubExceptionText('Cannot read properties of undefined (reading id)')).toBe(
      'Cannot read properties of undefined (reading id)'
    );
    expect(scrubExceptionText('expected 3 items, got 12')).toBe('expected 3 items, got 12');
  });
});

describe('scrubExceptionProperties', () => {
  // $exception_list[].value is where posthog-js puts the message, and PostHog
  // derives the issue title and fingerprint from it server side. Scrubbing this
  // field is what actually changes what gets stored; anything else is theatre.
  it('redacts the message on every entry of $exception_list', () => {
    const scrubbed = scrubExceptionProperties({
      $exception_list: [
        { type: 'Error', value: 'no customer for 081234567890' },
        { type: 'TypeError', value: 'bad address rina@cafe.id' },
      ],
    });

    expect(scrubbed.$exception_list).toEqual([
      { type: 'Error', value: 'no customer for [number]' },
      { type: 'TypeError', value: 'bad address [email]' },
    ]);
  });

  // Only the Sentry bridge sets this field, and nothing here uses that bridge.
  // Covered anyway so turning it on later cannot silently bypass the scrub.
  it('redacts $exception_message when present', () => {
    const scrubbed = scrubExceptionProperties({ $exception_message: 'sent to a@b.com' });
    expect(scrubbed.$exception_message).toBe('sent to [email]');
  });

  // Frames are our own code and are the reason source maps get uploaded.
  // Redacting digits there would mangle line and column numbers.
  it('leaves stack frames and other properties untouched', () => {
    const frames = [{ filename: 'https://kodapos.app/assets/app-a1b2.js', lineno: 12345678 }];
    const scrubbed = scrubExceptionProperties({
      $exception_list: [{ type: 'Error', value: 'boom', stacktrace: { type: 'raw', frames } }],
      $current_url: 'https://kodapos.app/dashboard',
    });

    expect(scrubbed.$current_url).toBe('https://kodapos.app/dashboard');
    const [entry] = scrubbed.$exception_list as Array<{ stacktrace: { frames: unknown } }>;
    expect(entry?.stacktrace.frames).toEqual(frames);
  });

  // before_send runs on every event, and a malformed or absent list must not
  // throw there: an exception inside the scrubber would take out the SDK's
  // send path for all events, not just this one.
  it('tolerates a missing or malformed $exception_list', () => {
    expect(() => scrubExceptionProperties({})).not.toThrow();
    expect(scrubExceptionProperties({ $exception_list: 'nope' }).$exception_list).toBe('nope');
    expect(
      scrubExceptionProperties({ $exception_list: [null, 7, { type: 'Error' }] }).$exception_list
    ).toEqual([null, 7, { type: 'Error' }]);
  });

  it('does not mutate the properties object it is given', () => {
    const original = { $exception_list: [{ value: 'a@b.com' }] };
    scrubExceptionProperties(original);
    expect(original.$exception_list[0]?.value).toBe('a@b.com');
  });
});

describe('buildSuperProperties', () => {
  it('emits snake_case keys and the public surface', () => {
    expect(buildSuperProperties({ locale: 'id', appVersion: '1.4.0' })).toEqual({
      locale: 'id',
      app_version: '1.4.0',
      surface: 'public',
    });
  });
});
