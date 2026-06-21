import { AiInsights } from "~/components/ai-insights";
import { BillingHealth } from "~/components/billing-health";
import { ChannelSalesChart } from "~/components/channel-sales-chart";
import { DashboardActivity } from "~/components/dashboard-activity";
import { DashboardInvoices } from "~/components/dashboard-invoices";
import { NetRevenueChart } from "~/components/net-revenue-chart";
import { DashboardStats } from "~/components/stats";

export function Dashboard() {
	return (
		<div>
			<div className="p-4">
				<AiInsights />
			</div>
			<div className="grid grid-cols-1 gap-px bg-border p-px md:grid-cols-2 lg:grid-cols-4">
				<DashboardStats />
				<NetRevenueChart />
				<ChannelSalesChart />
				<DashboardInvoices />
				<BillingHealth />
				<DashboardActivity />
			</div>
			<p className="px-4 py-3 text-right text-xs text-muted-foreground">
				kodapos v{__APP_VERSION__}
			</p>
		</div>
	);
}
