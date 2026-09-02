import { describe, expect, it } from 'vitest';
import { deriveState } from '~/lib/offline/connectivity';

describe('deriveState', () => {
  it('is online only when the Convex socket is connected', () => {
    expect(deriveState({ convexConnected: true, browserOnline: true })).toBe('online');
  });

  it('is offline when the socket is down even if the browser claims online', () => {
    // The captive-portal case: the OS reports a network, but nothing reaches Convex.
    expect(deriveState({ convexConnected: false, browserOnline: true })).toBe('offline');
  });

  it('is offline when the browser reports no network', () => {
    expect(deriveState({ convexConnected: true, browserOnline: false })).toBe('offline');
  });
});
