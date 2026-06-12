"use client";

import { Trans } from "@lingui/react/macro";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon, Receipt } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "~/components/ui/empty";
import { Skeleton } from "~/components/ui/skeleton";
import {
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import {
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { DashboardCard } from "~/components/dashboard-card";
import { formatIDR, formatRelative } from "~/lib/formater";

type OrderStatus = "pending" | "paid" | "void";

function StatusBadge({ status }: { status: OrderStatus }) {
	if (status === "paid") {
		return (
			<Badge variant="secondary">
				<Trans>Lunas</Trans>
			</Badge>
		);
	}
	if (status === "pending") {
		return (
			<Badge variant="outline">
				<Trans>Menunggu</Trans>
			</Badge>
		);
	}
	return (
		<Badge variant="destructive">
			<Trans context="order status">Batal</Trans>
		</Badge>
	);
}

export function DashboardInvoices() {
	const data = useQuery(api.dashboard.recentOrders, {});

	return (
		<DashboardCard className="relative gap-0 md:col-span-2">
			<CardHeader className="border-b">
				<CardTitle className="text-base">
					<Trans>Transaksi terbaru</Trans>
				</CardTitle>
				<CardDescription>
					<Trans>Pesanan terakhir dan statusnya.</Trans>
				</CardDescription>
			</CardHeader>
			<CardContent className="mask-b-from-50% mask-b-to-100% px-0">
				<Table>
					<TableCaption className="sr-only">
						<Trans>Transaksi terbaru dengan kasir, waktu, dan total.</Trans>
					</TableCaption>
					<TableHeader>
						<TableRow>
							<TableHead className="ps-6">
								<Trans>Kasir</Trans>
							</TableHead>
							<TableHead>
								<Trans>Waktu</Trans>
							</TableHead>
							<TableHead className="pe-6 text-right tabular-nums">
								<Trans>Total</Trans>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{data === undefined ? (
							Array.from({ length: 4 }).map((_, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders have no stable id
								<TableRow className="h-12" key={i}>
									<TableCell className="ps-6">
										<Skeleton className="h-4 w-28" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-4 w-20" />
									</TableCell>
									<TableCell className="pe-6 text-right">
										<Skeleton className="ms-auto h-4 w-24" />
									</TableCell>
								</TableRow>
							))
						) : data.length === 0 ? (
							<TableRow>
								<TableCell colSpan={3} className="py-8">
									<Empty>
										<EmptyHeader>
											<EmptyMedia variant="icon">
												<Receipt />
											</EmptyMedia>
											<EmptyTitle>
												<Trans>Belum ada transaksi.</Trans>
											</EmptyTitle>
											<EmptyDescription>
												<Trans>Pesanan yang dibuat akan muncul di sini.</Trans>
											</EmptyDescription>
										</EmptyHeader>
									</Empty>
								</TableCell>
							</TableRow>
						) : (
							data.map((o) => (
								<TableRow className="h-12" key={o.id}>
									<TableCell className="max-w-44 truncate ps-6 font-medium">
										<span className="flex items-center gap-2">
											{o.cashier}
											<StatusBadge status={o.status} />
										</span>
									</TableCell>
									<TableCell className="text-muted-foreground tabular-nums">
										{formatRelative(o.at)}
									</TableCell>
									<TableCell className="pe-6 text-right tabular-nums">
										{formatIDR(o.totalIDR)}
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</CardContent>
			<div className="mask-t-from-30% absolute inset-x-0 bottom-0 flex h-1/5 items-center justify-center bg-background">
				<Button asChild className="relative" variant="ghost">
					<Link to="/history">
						<Trans>Lihat semua</Trans>
						<ArrowRightIcon aria-hidden="true" />
					</Link>
				</Button>
			</div>
		</DashboardCard>
	);
}
