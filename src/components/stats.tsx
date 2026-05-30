import { Trans } from "@lingui/react/macro";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import {
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { Delta, DeltaIcon, DeltaValue } from "~/components/delta";
import { DashboardCard } from "~/components/dashboard-card";
import { formatCount, formatIDR } from "~/lib/formater";

export function DashboardStats() {
	const data = useQuery(api.dashboard.kpis, {});

	const tiles: { label: React.ReactNode; value: React.ReactNode; delta: number | undefined }[] = [
		{
			label: <Trans>Pendapatan hari ini</Trans>,
			value: data !== undefined ? formatIDR(data.revenueIDR) : undefined,
			delta: data?.revenueDeltaPct,
		},
		{
			label: <Trans>Transaksi</Trans>,
			value: data !== undefined ? formatCount(data.orders) : undefined,
			delta: data?.ordersDeltaPct,
		},
		{
			label: <Trans>Rata-rata transaksi</Trans>,
			value: data !== undefined ? formatIDR(data.avgOrderIDR) : undefined,
			delta: data?.avgOrderDeltaPct,
		},
		{
			label: <Trans>Item terjual</Trans>,
			value: data !== undefined ? formatCount(data.itemsSold) : undefined,
			delta: data?.itemsSoldDeltaPct,
		},
	];

	return (
		<>
			{tiles.map((tile, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static tile order never changes
				<DashboardCard className="" key={index}>
					<CardHeader className="flex flex-row items-center justify-between">
						<CardTitle className="font-normal text-xs tracking-wide">
							{tile.label}
						</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-row items-center gap-2">
						{tile.value !== undefined ? (
							<p className="font-semibold text-2xl tabular-nums">{tile.value}</p>
						) : (
							<Skeleton className="h-8 w-24" />
						)}
					</CardContent>
					<CardFooter className="gap-1 rounded-none bg-background text-xs">
						{tile.delta !== undefined ? (
							<Delta value={tile.delta}>
								<DeltaIcon />
								<DeltaValue />
							</Delta>
						) : (
							<Skeleton className="h-4 w-12" />
						)}
						<span className="text-muted-foreground">
							<Trans>vs kemarin</Trans>
						</span>
					</CardFooter>
				</DashboardCard>
			))}
		</>
	);
}
