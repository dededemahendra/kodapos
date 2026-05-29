"use client";

import { Trans } from "@lingui/react/macro";
import { Button } from "~/components/ui/button";
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
import { ArrowRightIcon } from "lucide-react";

const invoices = [
	{
		id: "1045",
		customer: "Northwind Labs",
		amount: "$2,400.00",
		status: "Paid",
	},
	{
		id: "1044",
		customer: "Blue River Co.",
		amount: "$890.00",
		status: "Pending",
	},
	{
		id: "1043",
		customer: "Oak Street Studio",
		amount: "$5,120.00",
		status: "Paid",
	},
	{
		id: "1042",
		customer: "Harbor Freight LLC",
		amount: "$310.50",
		status: "Overdue",
	},
] as const;

export function DashboardInvoices() {
	return (
		<DashboardCard className="relative gap-0 md:col-span-2">
			<CardHeader className="border-b">
				<CardTitle className="text-base">
					<Trans>Recent invoices</Trans>
				</CardTitle>
				<CardDescription>
					<Trans>Open amounts and payment status.</Trans>
				</CardDescription>
			</CardHeader>
			<CardContent className="mask-b-from-50% mask-b-to-100% px-0">
				<Table>
					<TableCaption className="sr-only">
						<Trans>Recent invoices with customer, amount, and status.</Trans>
					</TableCaption>
					<TableHeader>
						<TableRow>
							<TableHead className="ps-6">
								<Trans>Customer</Trans>
							</TableHead>
							<TableHead>
								<Trans>Invoice</Trans>
							</TableHead>
							<TableHead className="pe-6 text-right tabular-nums">
								<Trans>Amount</Trans>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{invoices.map((inv) => (
							<TableRow className="h-12" key={inv.id}>
								<TableCell className="max-w-40 truncate ps-6 font-medium">
									{inv.customer}
								</TableCell>
								<TableCell className="text-muted-foreground tabular-nums">
									#{inv.id}
								</TableCell>
								<TableCell className="pe-6 text-right tabular-nums">
									{inv.amount}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>
			<div className="mask-t-from-30% absolute inset-x-0 bottom-0 flex h-1/5 items-center justify-center bg-background">
				<Button asChild className="relative" variant="ghost">
					<a href="/#">
						<Trans>View All</Trans>
						<ArrowRightIcon aria-hidden="true" />
					</a>
				</Button>
			</div>
		</DashboardCard>
	);
}
