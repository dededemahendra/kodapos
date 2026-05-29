import { useRouterState } from "@tanstack/react-router";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { DecorIcon } from "~/components/decor-icon";
import { AppBreadcrumbs } from "~/components/app-breadcrumbs";
import { navLinks } from "~/components/app-shared";
import { CustomSidebarTrigger } from "~/components/custom-sidebar-trigger";
import { NavUser } from "~/components/nav-user";
import { BellIcon } from "lucide-react";

export function AppHeader() {
	const path = useRouterState({ select: (s) => s.location.pathname });
	const activeItem = navLinks.find(
		(item) =>
			item.path && (path === item.path || path.startsWith(`${item.path}/`))
	);

	return (
		<header
			className={cn(
				"sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4 md:px-6",
				"bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/50"
			)}
		>
			<DecorIcon className="hidden md:block" position="bottom-left" />
			<div className="flex items-center gap-3">
				<CustomSidebarTrigger />
				<Separator
					className="mr-2 h-4 data-[orientation=vertical]:self-center"
					orientation="vertical"
				/>
				<AppBreadcrumbs page={activeItem ?? null} />
			</div>
			<div className="flex items-center gap-3">
				<Button aria-label="Notifikasi" size="icon-sm" variant="outline">
					<BellIcon />
				</Button>
				<Separator
					className="h-4 data-[orientation=vertical]:self-center"
					orientation="vertical"
				/>
				<NavUser />
			</div>
		</header>
	);
}
