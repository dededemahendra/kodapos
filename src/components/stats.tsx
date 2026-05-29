import {
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Delta, DeltaIcon, DeltaValue } from "~/components/delta";
import { DashboardCard } from "~/components/dashboard-card";

type Stat = {
	label: string;
	value: string;
	delta: number;
};

const stats: Stat[] = [
	{
		label: "Active users",
		value: "847",
		delta: 3.1,
	},
	{
		label: "Revenue",
		value: "$18,290",
		delta: 12.4,
	},
	{
		label: "Conversion Rate",
		value: "3.28%",
		delta: -0.4,
	},
	{
		label: "New signups",
		value: "142",
		delta: 8.7,
	},
] as const;

export function DashboardStats() {
	return (
		<>
			{stats.map((s) => (
				<DashboardCard className="" key={s.label}>
					<CardHeader className="flex flex-row items-center justify-between">
						<CardTitle className="font-normal text-xs tracking-wide">
							{s.label}
						</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-row items-center gap-2">
						<p className="font-semibold text-2xl tabular-nums">{s.value}</p>
					</CardContent>
					<CardFooter className="gap-1 rounded-none bg-background text-xs">
						<Delta value={s.delta}>
							<DeltaIcon />
							<DeltaValue />
						</Delta>
						<span className="text-muted-foreground">vs last week</span>{" "}
					</CardFooter>
				</DashboardCard>
			))}
		</>
	);
}
