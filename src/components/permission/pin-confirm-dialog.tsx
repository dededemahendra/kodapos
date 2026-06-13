import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useConvex, useQuery } from 'convex/react';
import { type ReactNode, useState } from 'react';
import { PinEntry } from '~/components/staff/pin-entry';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';

/**
 * Resolves the cafe owner's staff row and whether a PIN is set on it. The owner
 * is always the signed-in account; sensitive register actions (void/refund) can
 * be gated behind re-entering this PIN (Settings → Keamanan → "Wajib PIN untuk
 * void/refund"). When no PIN is set there's nothing to verify, so callers skip
 * the gate.
 */
export function useOwnerPin(): {
  ownerId: Id<'cafeStaff'> | undefined;
  hasPin: boolean;
  loaded: boolean;
} {
  const staff = useQuery(api.staff.list, {});
  const owner = staff?.find((s) => s.role === 'owner');
  return {
    ownerId: owner?._id,
    hasPin: !!owner?.pinHash,
    loaded: staff !== undefined,
  };
}

/**
 * Confirms a sensitive action by requiring the owner's PIN. Calls `onConfirmed`
 * only after the PIN verifies. Callers should open this only when a PIN is
 * actually set (see `useOwnerPin`).
 */
export function PinConfirmDialog({
  open,
  onOpenChange,
  onConfirmed,
  ownerId,
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmed: () => void;
  ownerId: Id<'cafeStaff'> | undefined;
  description?: ReactNode;
}) {
  const { t } = useLingui();
  const convex = useConvex();
  const [error, setError] = useState<string | null>(null);

  async function submit(pin: string): Promise<void> {
    if (!ownerId) return;
    const ok = await convex.query(api.staff.verifyPin, { id: ownerId, pin });
    if (!ok) {
      setError(t`PIN salah.`);
      return;
    }
    setError(null);
    onOpenChange(false);
    onConfirmed();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setError(null);
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>PIN pemilik</Trans>
          </DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <PinEntry
          onComplete={(pin) => void submit(pin)}
          {...(error ? { errorMessage: error } : {})}
        />
      </DialogContent>
    </Dialog>
  );
}
