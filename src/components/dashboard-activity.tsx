import { Trans } from "@lingui/react/macro";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { Activity, CreditCard, DoorOpen, DoorClosed } from "lucide-react";
import {
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import {
	Empty,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "~/components/ui/empty";
import { DashboardCard } from "~/components/dashboard-card";
import { Skeleton } from "~/components/ui/skeleton";
import { formatRelative, formatIDRCompact } from "~/lib/formater";

type ActivityItem = {
	type: "sale" | "shift-open" | "shift-close";
	at: number;
	amountIDR?: number;
};

function ActivityIcon({ type }: { type: ActivityItem["type"] }) {
	if (type === "sale") return <CreditCard />;
	if (type === "shift-open") return <DoorOpen />;
	return <DoorClosed />;
}

function ActivityTitle({ item }: { item: ActivityItem }) {
	if (item.type === "sale") {
		return (
			<span>
				<Trans>Pembayaran diterima</Trans>
				{item.amountIDR != null && (
					<span className="ml-1 text-muted-foreground">
						{formatIDRCompact(item.amountIDR)}
					</span>
				)}
			</span>
		);
	}
	if (item.type === "shift-open") {
		return <Trans>Shift dibuka</Trans>;
	}
	return <Trans>Shift ditutup</Trans>;
}

export function DashboardActivity() {
	const data = useQuery(api.dashboard.recentActivity, {});

	return (
		<DashboardCard className="gap-0">
			<CardHeader className="border-b">
				<CardTitle>
					<Trans>Aktivitas</Trans>
				</CardTitle>
				<CardDescription>
					<Trans>Aktivitas terbaru di kafe Anda.</Trans>
				</CardDescription>
			</CardHeader>
			<CardContent className="px-0">
				{data === undefined ? (
					<ul className="flex flex-col divide-y divide-border">
						{Array.from({ length: 3 }).map((_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder
							<li className="flex h-16 items-center gap-3 px-6" key={i}>
								<Skeleton className="size-10 shrink-0 rounded-md" />
								<div className="min-w-0 flex-1 space-y-2">
									<Skeleton className="h-3.5 w-2/3 rounded" />
									<Skeleton className="h-3 w-1/3 rounded" />
								</div>
							</li>
						))}
					</ul>
				) : data.length === 0 ? (
					<Empty>
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<Activity />
							</EmptyMedia>
							<EmptyTitle>
								<Trans>Belum ada aktivitas.</Trans>
							</EmptyTitle>
						</EmptyHeader>
					</Empty>
				) : (
					<ul className="flex flex-col divide-y divide-border">
						{data.map((item) => (
							<li
								className="flex h-16 items-center gap-3 px-6"
								key={`${item.type}-${item.at}`}
							>
								<span
									aria-hidden="true"
									className="flex size-10 shrink-0 items-center justify-center [&_svg]:size-4"
								>
									<ActivityIcon type={item.type} />
								</span>
								<div className="min-w-0 flex-1 space-y-1">
									<p className="line-clamp-1 text-pretty text-foreground text-sm leading-snug">
										<ActivityTitle item={item} />
									</p>
									<p className="text-muted-foreground text-xs">
										{formatRelative(item.at)}
									</p>
								</div>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</DashboardCard>
	);
}
