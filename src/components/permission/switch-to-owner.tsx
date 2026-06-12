import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { PinEntry } from '~/components/staff/pin-entry';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { useActiveCashier } from '~/lib/active-cashier';

/**
 * A manager-override action for the "Access denied" state: the signed-in
 * account is always the cafe owner, but the active register identity (the
 * PIN-selected cashier) may not be. This switches the active cashier to the
 * owner staff row — gated by the owner's PIN — which makes owner/permission
 * gates re-evaluate in place (no reload, via the active-cashier change event).
 */
export function SwitchToOwner() {
  const { t } = useLingui();
  const staff = useQuery(api.staff.list, {});
  const owner = staff?.find((s) => s.role === 'owner');
  const convex = useConvex();
  const record = useMutation(api.cashierSessions.record);
  const { cashierId, setCashier } = useActiveCashier();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!owner) return null;
  const ownerId = owner._id;

  async function activate(): Promise<void> {
    await record({ cashierId: ownerId, type: cashierId ? 'switch' : 'login' });
    setCashier(ownerId); // broadcasts → permission gates re-render unlocked
    setOpen(false);
  }

  async function submit(pin: string): Promise<void> {
    const ok = await convex.query(api.staff.verifyPin, { id: ownerId, pin });
    if (!ok) {
      setError(t`PIN salah.`);
      return;
    }
    await activate();
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => {
          setError(null);
          // Owner without a PIN set → switch directly (mirrors the /pin flow).
          if (!owner.pinHash) {
            void activate();
          } else {
            setOpen(true);
          }
        }}
      >
        <ShieldCheck />
        <Trans>Masuk sebagai pemilik</Trans>
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) {
            setOpen(false);
            setError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <Trans>PIN pemilik</Trans>
            </DialogTitle>
          </DialogHeader>
          <PinEntry
            onComplete={(pin) => void submit(pin)}
            {...(error ? { errorMessage: error } : {})}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
