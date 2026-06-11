import { Trans } from '@lingui/react/macro';
import { DashboardCard } from '~/components/dashboard-card';
import { CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { formatIDR } from '~/lib/money';
import { cn } from '~/lib/utils';

export function StockSummary({
  lowCount,
  stockValueIDR,
}: {
  lowCount: number;
  stockValueIDR: number;
}) {
  const low = lowCount > 0;
  return (
    <div className="grid grid-cols-1 gap-px sm:grid-cols-2">
      <DashboardCard>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="font-normal text-xs tracking-wide">
            <Trans>Stok rendah</Trans>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-row items-center gap-2">
          <p
            className={cn(
              'font-semibold text-2xl tabular-nums',
              low && 'text-destructive'
            )}
          >
            {low ? (
              <span aria-hidden="true" className="mr-1">
                ⚠
              </span>
            ) : null}
            {lowCount}
          </p>
        </CardContent>
      </DashboardCard>

      <DashboardCard>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="font-normal text-xs tracking-wide">
            <Trans>Nilai stok total</Trans>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-row items-center gap-2">
          <p className="font-semibold text-2xl tabular-nums">
            {formatIDR(stockValueIDR)}
          </p>
        </CardContent>
      </DashboardCard>
    </div>
  );
}
