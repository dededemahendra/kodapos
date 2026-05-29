"use client";

import { useId } from "react";
import { CartesianGrid, Line, LineChart, XAxis } from "recharts";
import { useLingui } from "@lingui/react/macro";
import { Trans } from "@lingui/react/macro";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { formatDate } from "~/lib/formater";
import {
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "~/components/ui/chart";
import { Delta, DeltaIcon, DeltaValue } from "~/components/delta";
import { DashboardCard } from "~/components/dashboard-card";
import { Skeleton } from "~/components/ui/skeleton";

export function ChannelSalesChart() {
	const chartUid = useId().replace(/:/g, "");
	const idLineGlow = `channel-sales-line-glow-${chartUid}`;
	const { t } = useLingui();

	const rawData = useQuery(api.dashboard.paymentMethods, {});

	const chartConfig = {
		cash: {
			label: t`Tunai`,
			color: "var(--chart-2)",
		},
		qris: {
			label: t`QRIS`,
			color: "var(--chart-1)",
		},
	} satisfies ChartConfig;

	if (rawData === undefined) {
		return (
			<DashboardCard className="gap-0 md:col-span-2">
				<CardHeader>
					<div className="min-w-0 space-y-2">
						<CardTitle>
							<Trans>Metode pembayaran</Trans>
						</CardTitle>
						<CardDescription>
							<Trans>Jumlah transaksi per metode, 7 hari terakhir.</Trans>
						</CardDescription>
					</div>
				</CardHeader>
				<CardContent>
					<Skeleton className="h-60 w-full" />
				</CardContent>
			</DashboardCard>
		);
	}

	const chartRows = rawData.map((r) => ({
		label: formatDate(new Date(r.dayStart).toISOString(), "day-month"),
		cash: r.cash,
		qris: r.qris,
	}));

	const first = chartRows[0];
	const last = chartRows.at(-1);
	const firstTotal = first ? first.cash + first.qris : 0;
	const lastTotal = last ? last.cash + last.qris : 0;
	const growthPctNum = firstTotal ? ((lastTotal - firstTotal) / firstTotal) * 100 : 0;

	return (
		<DashboardCard className="gap-0 md:col-span-2">
			<CardHeader>
				<div className="min-w-0 space-y-2">
					<div className="flex flex-wrap items-center gap-2">
						<CardTitle>
							<Trans>Metode pembayaran</Trans>
						</CardTitle>
						<Delta value={growthPctNum} variant="badge">
							<DeltaIcon variant="trend" />
							<DeltaValue />
						</Delta>
					</div>
					<CardDescription>
						<Trans>Jumlah transaksi per metode, 7 hari terakhir.</Trans>
					</CardDescription>
				</div>
			</CardHeader>
			<CardContent>
				<ChartContainer
					className="aspect-auto h-60 w-full p-0 md:h-80"
					config={chartConfig}
				>
					<LineChart
						accessibilityLayer
						data={chartRows}
						margin={{
							left: 12,
							right: 12,
							top: 8,
						}}
					>
						<CartesianGrid className="stroke-border" vertical={false} />
						<XAxis
							axisLine={false}
							dataKey="label"
							interval={0}
							tickLine={false}
							tickMargin={8}
						/>
						<ChartTooltip
							content={<ChartTooltipContent hideLabel />}
							cursor={false}
						/>
						<defs>
							<filter
								height="140%"
								id={idLineGlow}
								width="140%"
								x="-20%"
								y="-20%"
							>
								<feGaussianBlur result="blur" stdDeviation="10" />
								<feComposite in="SourceGraphic" in2="blur" operator="over" />
							</filter>
						</defs>
						<Line
							dataKey="qris"
							dot={false}
							filter={`url(#${idLineGlow})`}
							stroke="var(--color-qris)"
							strokeWidth={2}
							type="step"
						/>
						<Line
							dataKey="cash"
							dot={false}
							filter={`url(#${idLineGlow})`}
							stroke="var(--color-cash)"
							strokeWidth={2}
							type="step"
						/>
					</LineChart>
				</ChartContainer>
			</CardContent>
		</DashboardCard>
	);
}
