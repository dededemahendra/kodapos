import { Bar, BarChart, XAxis } from 'recharts';
import { useLingui } from '@lingui/react/macro';
import { Trans } from '@lingui/react/macro';
import { CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '~/components/ui/chart';
import { DashboardCard } from '~/components/dashboard-card';
import { formatIDR } from '~/lib/formater';

export function OutletsRevenueChart({
  outlets,
}: {
  outlets: { cafeId: string; name: string; revenueIDR: number }[];
}) {
  const { t } = useLingui();
  const chartConfig = {
    revenue: { label: t`Pendapatan`, color: 'var(--chart-2)' },
  } satisfies ChartConfig;

  const rows = outlets.map((o) => ({ label: o.name, revenue: o.revenueIDR }));

  return (
    <DashboardCard className="mb-6 gap-0">
      <CardHeader className="gap-2">
        <CardTitle>
          <Trans>Pendapatan per outlet</Trans>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer className="aspect-auto h-60 w-full" config={chartConfig}>
          <BarChart accessibilityLayer data={rows}>
            <XAxis
              axisLine={false}
              dataKey="label"
              interval={0}
              tickFormatter={(value) => String(value)}
              tickLine={false}
              tickMargin={10}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(value) => formatIDR(Math.round(Number(value)))}
                />
              }
              cursor={false}
            />
            <Bar dataKey="revenue" fill="var(--color-revenue)" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </DashboardCard>
  );
}
