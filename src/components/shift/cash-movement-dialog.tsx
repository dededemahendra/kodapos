import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';

export function CashMovementDialog({
  open, onOpenChange, shiftId,
}: { open: boolean; onOpenChange: (o: boolean) => void; shiftId: Id<'shifts'> }) {
  const { t } = useLingui();
  const record = useMutation(api.cashMovements.record);
  const movements = useQuery(api.cashMovements.listForShift, open ? { shiftId } : 'skip');
  const [direction, setDirection] = useState<'in' | 'out'>('out');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const amt = Number.parseInt(amount, 10);
    if (!Number.isInteger(amt) || amt <= 0) { setError(t`Jumlah harus lebih dari nol.`); return; }
    setSubmitting(true); setError(null);
    try {
      await record({ direction, amountIDR: amt, ...(note.trim() ? { note: note.trim() } : {}) });
      setAmount(''); setNote('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t`Gagal mencatat kas.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle><Trans>Kas masuk / keluar</Trans></DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={direction === 'in' ? 'default' : 'outline'} onClick={() => setDirection('in')}>
              <Trans>Kas masuk</Trans>
            </Button>
            <Button type="button" variant={direction === 'out' ? 'default' : 'outline'} onClick={() => setDirection('out')}>
              <Trans>Kas keluar</Trans>
            </Button>
          </div>
          <Input type="number" min="1" step="1000" inputMode="numeric" placeholder={t`Jumlah (Rp)`}
            value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Input placeholder={t`Catatan (opsional)`} value={note} onChange={(e) => setNote(e.target.value)} />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="button" onClick={submit} disabled={submitting} className="w-full">
            {submitting ? <Spinner data-icon="inline-start" /> : null}<Trans>Catat</Trans>
          </Button>
          {movements && movements.length > 0 ? (
            <ul className="text-xs divide-y divide-border border border-border rounded-md max-h-40 overflow-auto">
              {movements.map((m) => (
                <li key={m._id} className="flex justify-between p-2">
                  <span className="text-muted-foreground">
                    {m.direction === 'in' ? <Trans>Masuk</Trans> : <Trans>Keluar</Trans>}{m.note ? ` · ${m.note}` : ''}
                  </span>
                  <span className={`tabular-nums ${m.direction === 'in' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {m.direction === 'in' ? '+' : '−'}{formatIDR(m.amountIDR)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
