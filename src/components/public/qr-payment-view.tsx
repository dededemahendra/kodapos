import { Trans, useLingui } from '@lingui/react/macro';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle2, Clock, TimerOff, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';

/** mm:ss for a positive remaining-ms value (clamped to 0). */
function formatCountdown(remainingMs: number): string {
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  const mm = Math.floor(total / 60)
    .toString()
    .padStart(2, '0');
  const ss = (total % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

/**
 * Public QRIS pay-now view. Shows the QR + amount + a live countdown while the
 * charge is awaiting; on `paid` flips to a success state that then reflects the
 * staff accept/reject decision (a paid order is never rejected). When the charge
 * expires, offers a "Buat ulang QR" action that re-creates the charge.
 */
export function QrPaymentView({
  qrString,
  totalIDR,
  expiresAt,
  paymentStatus,
  orderStatus,
  regenerating,
  error,
  onRegenerate,
  onPayAtCounter,
}: {
  qrString: string;
  totalIDR: number;
  expiresAt: number;
  paymentStatus: 'unpaid' | 'awaiting' | 'paid';
  orderStatus: 'new' | 'accepted' | 'rejected';
  regenerating: boolean;
  error: string | null;
  onRegenerate: () => void;
  onPayAtCounter: () => void;
}) {
  const { t } = useLingui();
  const [now, setNow] = useState(() => Date.now());

  // 1s tick to drive the countdown. Stops once paid (no longer awaiting).
  useEffect(() => {
    if (paymentStatus === 'paid') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [paymentStatus]);

  // --- paid: success, then reflect the staff accept/reject decision ----------
  if (paymentStatus === 'paid') {
    const sub =
      orderStatus === 'accepted'
        ? { icon: CheckCircle2, tone: 'text-green-600', label: t`Pesanan diterima` }
        : orderStatus === 'rejected'
          ? { icon: XCircle, tone: 'text-destructive', label: t`Pesanan ditolak` }
          : { icon: Clock, tone: 'text-muted-foreground', label: t`Pesanan sedang diproses.` };
    const SubIcon = sub.icon;
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <CheckCircle2 className="size-12 text-green-600" aria-hidden />
            <h1 className="text-xl font-semibold">
              <Trans>Pembayaran diterima</Trans>
            </h1>
            <div className={`flex items-center gap-2 text-sm ${sub.tone}`}>
              <SubIcon className="size-4" aria-hidden />
              <span>{sub.label}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const expired = now >= expiresAt;

  // --- expired: offer regenerate ---------------------------------------------
  if (expired) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TimerOff />
            </EmptyMedia>
            <EmptyTitle>
              <Trans>QR kedaluwarsa</Trans>
            </EmptyTitle>
            <EmptyDescription>
              <Trans>Kode QR pembayaran sudah tidak berlaku. Buat ulang untuk membayar.</Trans>
            </EmptyDescription>
          </EmptyHeader>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex w-full max-w-xs flex-col gap-2">
            <Button type="button" size="lg" onClick={onRegenerate} disabled={regenerating}>
              {regenerating ? <Spinner className="mr-2" /> : null}
              <Trans>Buat ulang QR</Trans>
            </Button>
            <Button type="button" size="lg" variant="outline" onClick={onPayAtCounter}>
              <Trans>Bayar di kasir</Trans>
            </Button>
          </div>
        </Empty>
      </div>
    );
  }

  // --- awaiting: show the QR + amount + countdown ----------------------------
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
          <h1 className="text-xl font-semibold">
            <Trans>Tunjukkan QR ini untuk membayar</Trans>
          </h1>
          <div className="rounded-lg border border-border bg-white p-3">
            <QRCodeSVG value={qrString} size={240} marginSize={2} />
          </div>
          <div className="text-2xl font-semibold tabular-nums text-primary">
            {formatIDR(totalIDR)}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="size-4" aria-hidden />
            <Trans>
              Berlaku <span className="tabular-nums">{formatCountdown(expiresAt - now)}</span>
            </Trans>
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="mt-1 w-full"
            onClick={onPayAtCounter}
          >
            <Trans>Bayar di kasir</Trans>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
