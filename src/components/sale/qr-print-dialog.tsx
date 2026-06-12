import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation } from 'convex/react';
import { Printer } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Spinner } from '~/components/ui/spinner';
import { toast } from '~/lib/toast';

export function QrPrintDialog({
  tableId,
  tableName,
  open,
  onOpenChange,
}: {
  tableId: Id<'tables'> | null;
  tableName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const ensureQrToken = useMutation(api.tables.ensureQrToken);
  const [token, setToken] = useState<string | null>(null);
  // Fetch the table's QR token once per opened table; ensureQrToken is idempotent.
  const requestedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !tableId) return;
    if (requestedRef.current === tableId) return;
    requestedRef.current = tableId;
    void (async () => {
      try {
        const result = await ensureQrToken({ id: tableId });
        setToken(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : t`Gagal membuat QR.`;
        toast.error(message);
      }
    })();
  }, [open, tableId, ensureQrToken, t]);

  // Reset cached token when the dialog closes so reopening a new table refetches.
  useEffect(() => {
    if (!open) {
      requestedRef.current = null;
      setToken(null);
    }
  }, [open]);

  const orderUrl =
    token && typeof window !== 'undefined'
      ? `${window.location.origin}/order/${token}`
      : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>QR pesan mandiri</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Cetak dan tempel di meja. Tamu pindai untuk memesan sendiri.</Trans>
          </DialogDescription>
        </DialogHeader>

        {token === null ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <>
            {/* Print-only block. The global @media print rule (globals.css
                [data-print-qr]) hides app chrome so only this is printed. */}
            <div
              data-print-qr
              className="flex flex-col items-center gap-3 rounded-lg border bg-white p-6 text-center text-black"
            >
              <div className="text-lg font-semibold">{tableName}</div>
              <QRCodeSVG value={orderUrl} size={220} />
              <div className="break-all text-xs text-muted-foreground print:text-black">
                {orderUrl}
              </div>
            </div>

            <Button type="button" onClick={() => window.print()}>
              <Printer />
              <Trans>Cetak QR</Trans>
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
