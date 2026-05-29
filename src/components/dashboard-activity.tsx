import { useLingui } from "@lingui/react/macro";
import { Trans } from "@lingui/react/macro";
import {
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { DashboardCard } from "~/components/dashboard-card";
import { CreditCardIcon, UserPlusIcon, FileTextIcon, RocketIcon } from "lucide-react";

export function DashboardActivity() {
	const { t } = useLingui();

	const items = [
		{
			title: t`Invoice #1045 marked paid`,
			time: t`About 2 hours ago`,
			icon: (
				<CreditCardIcon
				/>
			),
		},
		{
			title: t`Jordan joined the team`,
			time: t`This morning`,
			icon: (
				<UserPlusIcon
				/>
			),
		},
		{
			title: t`Weekly summary exported`,
			time: t`Yesterday`,
			icon: (
				<FileTextIcon
				/>
			),
		},
		{
			title: t`Dashboard v2 shipped to prod`,
			time: t`2 days ago`,
			icon: (
				<RocketIcon
				/>
			),
		},
	];

	return (
		<DashboardCard className="gap-0">
			<CardHeader className="border-b">
				<CardTitle>
					<Trans>Activity</Trans>
				</CardTitle>
				<CardDescription>
					<Trans>Latest updates in your workspace.</Trans>
				</CardDescription>
			</CardHeader>
			<CardContent className="px-0">
				<ul className="flex flex-col divide-y divide-border">
					{items.map((item) => (
						<li className="flex h-16 items-center gap-3 px-6" key={item.title}>
							<span
								aria-hidden="true"
								className="flex size-10 shrink-0 items-center justify-center [&_svg]:size-4"
							>
								{item.icon}
							</span>
							<div className="min-w-0 flex-1 space-y-1">
								<p className="line-clamp-1 text-pretty text-foreground text-sm leading-snug">
									{item.title}
								</p>
								<p className="text-muted-foreground text-xs">{item.time}</p>
							</div>
						</li>
					))}
				</ul>
			</CardContent>
		</DashboardCard>
	);
}
