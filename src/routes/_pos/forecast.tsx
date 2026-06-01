import { Trans } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Button } from '~/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty';
import { PageHeader } from '~/components/ui/page-header';
import { Spinner } from '~/components/ui/spinner';
import { StatusBadge } from '~/components/ui/status-badge';
import { RenderDriver, type ForecastDriver } from '~/components/forecast/render-driver';

export const Route = createFileRoute('/_pos/forecast')({
  component: ForecastPage,
});

type Horizon = 'tomorrow' | 'week';

function ConfidenceBadge({ level }: { level: 'low' | 'med' | 'high' }) {
  if (level === 'high') return <StatusBadge variant="success"><Trans>Tinggi</Trans></StatusBadge>;
  if (level === 'med') return <StatusBadge variant="warn"><Trans>Sedang</Trans></StatusBadge>;
  return <StatusBadge variant="muted"><Trans>Rendah</Trans></StatusBadge>;
}

function ForecastPage() {
  const data = useQuery(api.forecast.demand, {});
  const [horizon, setHorizon] = useState<Horizon>('tomorrow');

  return (
    <main className="p-6">
      <PageHeader title={<Trans>Prediksi Permintaan</Trans>} />
      {data === undefined ? (
        <div className="mt-6 flex items-center justify-center py-12 text-muted-foreground"><Spinner /></div>
      ) : data.status === 'learning' ? (
        <Empty className="mt-6">
          <EmptyHeader>
            <EmptyMedia variant="icon"><TrendingUp /></EmptyMedia>
            <EmptyTitle><Trans>Kami sedang belajar</Trans></EmptyTitle>
            <EmptyDescription>
              <Trans>
                Memerlukan minimal {data.daysNeeded} hari data (terkumpul {data.daysCollected}). Perkiraan akan aktif sekitar {data.etaDateKey}.
              </Trans>
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={horizon === 'tomorrow' ? 'default' : 'outline'} onClick={() => setHorizon('tomorrow')}>
              <Trans>Besok</Trans>
            </Button>
            <Button type="button" size="sm" variant={horizon === 'week' ? 'default' : 'outline'} onClick={() => setHorizon('week')}>
              <Trans>7 hari</Trans>
            </Button>
          </div>
          <ul className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
            {data.lines.map((line) => (
              <li key={line.menuItemId} className="bg-background p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{line.name}</span>
                  <ConfidenceBadge level={line.confidence} />
                </div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">
                  ~{horizon === 'tomorrow' ? line.tomorrowQty : line.sevenDayQty}
                </div>
                {line.drivers.length > 0 ? (
                  <ul className="mt-1 text-xs text-muted-foreground">
                    {line.drivers.map((d, i) => (
                      <li key={i}><RenderDriver driver={d as ForecastDriver} /></li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
