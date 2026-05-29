import { Trans } from "@lingui/react/macro";
import { BillingHealth } from "~/components/billing-health";
import { ChannelSalesChart } from "~/components/channel-sales-chart";
import { DashboardActivity } from "~/components/dashboard-activity";
import { DashboardInvoices } from "~/components/dashboard-invoices";
import { NetRevenueChart } from "~/components/net-revenue-chart";
import { DashboardStats } from "~/components/stats";

export function Dashboard() {
	return (
		<div className="flex flex-col">
			<div className="border-b bg-muted/40 px-4 py-2 text-muted-foreground text-xs">
				<Trans>Data contoh: dasbor belum terhubung ke data kafe.</Trans>
			</div>
			<div className="grid grid-cols-1 gap-px bg-border p-px pt-0 md:grid-cols-2 lg:grid-cols-4">
				<DashboardStats />
				<NetRevenueChart />
				<ChannelSalesChart />
				<DashboardInvoices />
				<BillingHealth />
				<DashboardActivity />
			</div>
		</div>
	);
}
