import { BillingHealth } from "~/components/billing-health";
import { ChannelSalesChart } from "~/components/channel-sales-chart";
import { DashboardActivity } from "~/components/dashboard-activity";
import { DashboardInvoices } from "~/components/dashboard-invoices";
import { NetRevenueChart } from "~/components/net-revenue-chart";
import { DashboardStats } from "~/components/stats";

export function Dashboard() {
	return (
		<div className="grid grid-cols-1 gap-px bg-border p-px pt-0 md:grid-cols-2 lg:grid-cols-4">
			<DashboardStats />
			<NetRevenueChart />
			<ChannelSalesChart />
			<DashboardInvoices />
			<BillingHealth />
			<DashboardActivity />
		</div>
	);
}
