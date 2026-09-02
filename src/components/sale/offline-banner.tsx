import { Plural, Trans } from '@lingui/react/macro';
import { WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useConnectionState } from '~/lib/offline/connectivity';
import { size } from '~/lib/offline/outbox';

/** How often the pending count is re-read while offline. An IndexedDB count is
 *  cheap, and the cashier needs to see the number climb as sales are rung. */
const PENDING_POLL_MS = 3_000;

/**
 * Number of sales sitting in the outbox. Polled rather than pushed: the outbox
 * has no change notification, and a stale count on this banner is a cosmetic
 * problem, not a money one. A read that rejects (IndexedDB blocked by another
 * tab mid-upgrade) keeps the last known count instead of flashing 0, which
 * would read as "everything synced".
 */
function usePendingSaleCount(active: boolean): number {
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const read = () => {
      size()
        .then((n) => {
          if (!cancelled) setPending(n);
        })
        .catch(() => {});
    };
    read();
    const id = setInterval(read, PENDING_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active]);

  return pending;
}

/**
 * Persistent bar telling the cashier the till is running on cached data and
 * that the cash sales they ring are safe on this device. Renders nothing while
 * online, so it can sit unconditionally in the register chrome.
 */
export function OfflineBanner() {
  const connection = useConnectionState();
  const offline = connection === 'offline';
  const pending = usePendingSaleCount(offline);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-900"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden="true" />
      <span className="font-medium">
        <Trans>Mode offline</Trans>
      </span>
      <span>
        <Trans>
          Penjualan tunai disimpan di perangkat ini dan otomatis dikirim saat koneksi kembali.
        </Trans>
      </span>
      {pending > 0 ? (
        <span className="ml-auto rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold tabular-nums">
          {/* Indonesian has one form, so `one` and `other` read the same here;
              the split exists so translations with a plural (English: "1 sale",
              "2 sales") have somewhere to put it. */}
          <Plural
            value={pending}
            one="# penjualan menunggu sinkron"
            other="# penjualan menunggu sinkron"
          />
        </span>
      ) : null}
    </div>
  );
}
