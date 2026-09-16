import { useConvexConnectionState } from 'convex/react';
import { useEffect, useState } from 'react';

export type ConnectionState = 'online' | 'offline';

/**
 * Pure decision so it can be tested without a Convex client or a browser.
 *
 * The Convex websocket is the authority: it is what actually determines
 * whether a mutation can land. `navigator.onLine` only ever contributes a
 * fast negative — it reports `true` on a captive portal or a dead uplink,
 * so it can never on its own justify calling us online.
 */
export function deriveState(input: {
  convexConnected: boolean;
  browserOnline: boolean;
}): ConnectionState {
  return input.convexConnected && input.browserOnline ? 'online' : 'offline';
}

/**
 * Tracks whether a mutation can currently land: the Convex socket state,
 * combined with the browser's fast-negative `navigator.onLine` signal.
 *
 * Convex 1.39 exposes `useConvexConnectionState()` from `convex/react`,
 * which already subscribes to `ConnectionState` changes and rerenders on
 * every change (see `subscribeToConnectionState` in
 * `convex/dist/esm-types/browser/sync/client.d.ts`), so there is no need to
 * poll `connectionState()` on an interval — that hook is used here instead
 * of the raw `useConvex()` client. Its `isWebSocketConnected` field is the
 * exact property name to read.
 */
export function useConnectionState(): ConnectionState {
  const { isWebSocketConnected } = useConvexConnectionState();
  const [browserOnline, setBrowserOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    const update = () => setBrowserOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return deriveState({ convexConnected: isWebSocketConnected, browserOnline });
}
