import { useRouterState } from "@tanstack/react-router";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { DecorIcon } from "~/components/decor-icon";
import { AppBreadcrumbs } from "~/components/app-breadcrumbs";
import { navLinks } from "~/components/app-shared";
import { CustomSidebarTrigger } from "~/components/custom-sidebar-trigger";
import { NavUser } from "~/components/nav-user";
import { NotificationsMenu } from "~/components/notifications-menu";
import { applyTheme, storeTheme } from "~/lib/preferences";
import { Kbd } from "~/components/ui/kbd";
import { MoonIcon, Search, SunIcon } from "lucide-react";

export function AppHeader() {
	const { t } = useLingui();
	const path = useRouterState({ select: (s) => s.location.pathname });
	const activeItem = navLinks.find(
		(item) =>
			item.path && (path === item.path || path.startsWith(`${item.path}/`))
	);

	// Resolved dark state, synced from the documentElement class on mount (the
	// no-flash head script already set it before paint).
	const [isDark, setIsDark] = useState(false);
	useEffect(() => {
		setIsDark(document.documentElement.classList.contains("dark"));
	}, []);

	function toggleTheme() {
		const next = isDark ? "light" : "dark";
		storeTheme(next);
		applyTheme(next);
		setIsDark(next === "dark");
	}

	function openCommandPalette() {
		document.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
		);
	}

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
				<Button
					aria-label={t`Cari`}
					size="sm"
					variant="ghost"
					className="hidden md:flex items-center gap-2 text-muted-foreground hover:text-foreground"
					onClick={openCommandPalette}
				>
					<Search className="size-4" />
					<span className="text-sm"><Trans>Cari</Trans></span>
					<Kbd>⌘K</Kbd>
				</Button>
				<Button
					aria-label={t`Cari`}
					size="icon-sm"
					variant="ghost"
					className="flex md:hidden"
					onClick={openCommandPalette}
				>
					<Search />
				</Button>
				<Button
					aria-label={t`Ganti tema`}
					size="icon-sm"
					variant="ghost"
					onClick={toggleTheme}
				>
					{isDark ? <SunIcon /> : <MoonIcon />}
				</Button>
				<NotificationsMenu />
				<Separator
					className="h-4 data-[orientation=vertical]:self-center"
					orientation="vertical"
				/>
				<NavUser />
			</div>
		</header>
	);
}
