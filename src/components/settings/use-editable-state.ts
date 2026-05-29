import { useEffect, useRef, useState } from 'react';

/**
 * Keeps a local editable draft synced to a server value. When the server
 * value changes (e.g. the Convex query resolves or another device writes),
 * the draft re-syncs only if the user hasn't diverged. Exposes `dirty`
 * (draft differs from the last server snapshot) and `reset`.
 *
 * Equality uses JSON serialization — settings values are plain JSON.
 */
export function useEditableState<T>(serverValue: T | undefined) {
  const [draft, setDraft] = useState<T | undefined>(serverValue);
  const lastServer = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (serverValue === undefined) return;
    const key = JSON.stringify(serverValue);
    if (key !== lastServer.current) {
      lastServer.current = key;
      setDraft(serverValue);
    }
  }, [serverValue]);

  const dirty =
    draft !== undefined &&
    lastServer.current !== undefined &&
    JSON.stringify(draft) !== lastServer.current;

  const reset = () => {
    if (lastServer.current !== undefined) {
      setDraft(JSON.parse(lastServer.current) as T);
    }
  };

  return { draft, setDraft, dirty, reset };
}
