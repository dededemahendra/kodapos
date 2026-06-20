import { Trans } from "@lingui/react/macro";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { Link } from "@tanstack/react-router";
import {
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "~/components/ui/empty";
import { Skeleton } from "~/components/ui/skeleton";
import { DashboardCard } from "~/components/dashboard-card";
import { CircleCheck } from "lucide-react";

export function BillingHealth() {
	const data = useQuery(api.dashboard.lowStock, {});

	return (
		<DashboardCard className="gap-0 self-start">
			<CardHeader className="border-b">
				<CardTitle className="text-balance text-base">
					<Trans>Kesehatan stok</Trans>
				</CardTitle>
				<CardDescription className="text-pretty">
					<Trans>Bahan yang perlu diisi ulang.</Trans>
				</CardDescription>
			</CardHeader>

			<CardContent className="px-0">
				{data === undefined ? (
					<div className="flex w-full flex-col gap-3 px-6 py-4">
						<div className="flex items-center justify-between">
							<Skeleton className="h-4 w-1/3" />
							<Skeleton className="h-4 w-1/4" />
						</div>
						<div className="flex items-center justify-between">
							<Skeleton className="h-4 w-2/5" />
							<Skeleton className="h-4 w-1/4" />
						</div>
					</div>
				) : data.count === 0 ? (
					<Empty>
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<CircleCheck aria-hidden="true" />
							</EmptyMedia>
							<EmptyTitle>
								<Trans>Stok aman.</Trans>
							</EmptyTitle>
							<EmptyDescription className="text-xs">
								<Trans>Tidak ada bahan di bawah ambang.</Trans>
							</EmptyDescription>
						</EmptyHeader>
						<EmptyContent />
					</Empty>
				) : (
					<ul className="w-full divide-y">
						{data.items.map((item) => (
							<li
								key={item.id}
								className="flex items-center justify-between px-6 py-2"
							>
								<span className="truncate text-sm">{item.name}</span>
								<span className="ml-4 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
									{item.currentStockQty}/{item.reorderThreshold}{" "}
									{item.unit}
								</span>
							</li>
						))}
						{data.count > data.items.length && (
							<li className="px-6 py-2 text-xs text-muted-foreground">
								<Trans>+{data.count - data.items.length} lainnya</Trans>
							</li>
						)}
					</ul>
				)}
			</CardContent>

			{data !== undefined && data.count > 0 && (
				<CardFooter className="border-t pt-4">
					<Link
						to="/inventory"
						className="text-sm text-primary underline-offset-4 hover:underline"
					>
						<Trans>Tinjau inventaris</Trans>
					</Link>
				</CardFooter>
			)}
		</DashboardCard>
	);
}
