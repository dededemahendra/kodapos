import { Trans } from "@lingui/react/macro";
import { Button } from "~/components/ui/button";
import {
	CardContent,
	CardDescription,
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
import { DashboardCard } from "~/components/dashboard-card";
import { CircleCheckIcon, ArrowRightIcon } from "lucide-react";

export function BillingHealth() {
	return (
		<DashboardCard className="gap-0">
			<CardHeader className="border-b">
				<CardTitle className="text-balance text-base">
					<Trans>Billing health</Trans>
				</CardTitle>
				<CardDescription className="text-pretty">
					<Trans>Nothing urgent needs your attention.</Trans>
				</CardDescription>
			</CardHeader>
			<CardContent className="flex h-full items-center px-0">
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<CircleCheckIcon aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>
							<Trans>You're caught up.</Trans>
						</EmptyTitle>
						<EmptyDescription className="text-xs">
							<Trans>
								Balances and payouts look fine. nothing overdue in this snapshot.
							</Trans>
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button asChild variant="ghost">
							<a href="/#">
								<Trans>Review open invoices</Trans>
								<ArrowRightIcon aria-hidden="true" />
							</a>
						</Button>
					</EmptyContent>
				</Empty>
			</CardContent>
		</DashboardCard>
	);
}
