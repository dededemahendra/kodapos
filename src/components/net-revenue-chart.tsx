"use client";

import type * as React from "react";
import { Bar, BarChart, XAxis } from "recharts";
import { useLingui } from "@lingui/react/macro";
import { Trans } from "@lingui/react/macro";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
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
import { formatDayKey, formatIDR } from "~/lib/formater";

function CustomGradientBar(
	props: React.SVGProps<SVGRectElement> & {
		index?: number;
		dataKey?: string | number;
	}
) {
	const {
		fill,
		x = 0,
		y = 0,
		width = 0,
		height = 0,
		dataKey = "revenue",
		index = 0,
	} = props;
	const gid = `gradient-bar-${String(dataKey)}-${index}`;

	return (
		<>
			<rect
				fill={`url(#${gid})`}
				height={height}
				stroke="none"
				width={width}
				x={x}
				y={y}
			/>
			<rect fill={fill} height={2} stroke="none" width={width} x={x} y={y} />
			<defs>
				<linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
					<stop offset="0%" stopColor={fill} stopOpacity={0.5} />
					<stop offset="100%" stopColor={fill} stopOpacity={0} />
				</linearGradient>
			</defs>
		</>
	);
}

export function NetRevenueChart() {
	const { t } = useLingui();
	const data = useQuery(api.dashboard.revenueDaily, {});

	const chartConfig = {
		revenue: {
			label: t`Pendapatan`,
			color: "var(--chart-2)",
		},
	} satisfies ChartConfig;

	const chartRows =
		data?.map((r) => ({
			label: formatDayKey(r.day),
			revenue: r.revenueIDR,
		})) ?? [];

	const firstRevenue = data?.[0]?.revenueIDR ?? 0;
	const lastRevenue = data?.at(-1)?.revenueIDR ?? 0;
	const growthPct =
		firstRevenue === 0
			? 0
			: Number((((lastRevenue - firstRevenue) / firstRevenue) * 100).toFixed(1));

	return (
		<DashboardCard className="gap-0 md:col-span-2">
			<CardHeader className="gap-2">
				<div className="flex flex-wrap items-center gap-2">
					<CardTitle>
						<Trans>Pendapatan</Trans>
					</CardTitle>
					<Delta value={growthPct} variant="badge">
						<DeltaIcon variant="trend" />
						<DeltaValue />
					</Delta>
				</div>
				<CardDescription>
					<Trans>Pendapatan harian, 7 hari terakhir.</Trans>
				</CardDescription>
			</CardHeader>
			<CardContent>
				{data === undefined ? (
					<Skeleton className="h-60 w-full" />
				) : (
					<ChartContainer
						className="aspect-auto h-60 w-full md:h-80"
						config={chartConfig}
					>
						<BarChart accessibilityLayer data={chartRows}>
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
							<Bar
								dataKey="revenue"
								fill="var(--color-revenue)"
								shape={<CustomGradientBar />}
							/>
						</BarChart>
					</ChartContainer>
				)}
			</CardContent>
		</DashboardCard>
	);
}
