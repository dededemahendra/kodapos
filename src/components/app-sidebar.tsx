"use client";

import { Link } from "@tanstack/react-router";
import { useLingui } from "@lingui/react";
import { BrandMark } from "~/components/brand-mark";
import { cn } from "~/lib/utils";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "~/components/ui/sidebar";
import { footerNavLinks, navGroups } from "~/components/app-shared";
import type { SidebarNavItem } from "~/components/app-shared";
import { LatestChange } from "~/components/latest-change";
import { NavGroup } from "~/components/nav-group";
import { usePermissions } from "~/lib/permissions";

export function AppSidebar() {
	const { i18n } = useLingui();
	const { can, isOwner, isLoading } = usePermissions();
	const { isMobile, setOpenMobile } = useSidebar();
	const closeMobile = () => { if (isMobile) setTimeout(() => setOpenMobile(false), 0); };
	const allowed = (req?: SidebarNavItem['requires']) =>
		!req || isLoading || (req === 'owner' ? isOwner : can(req));
	const visibleGroups = navGroups
		.map((g) => ({ ...g, items: g.items.filter((it) => allowed(it.requires)) }))
		.filter((g) => g.items.length > 0);

	return (
		<Sidebar
			className={cn(
				"*:data-[slot=sidebar-inner]:bg-background",
				"*:data-[slot=sidebar-inner]:dark:bg-[radial-gradient(60%_18%_at_10%_0%,--theme(--color-foreground/.08),transparent)]",
				"**:data-[slot=sidebar-menu-button]:[&>span]:text-foreground/75"
			)}
			collapsible="icon"
			variant="sidebar"
		>
			<SidebarHeader className="h-14 justify-center border-b px-2">
				<SidebarMenuButton asChild>
					<Link onClick={closeMobile} to="/dashboard">
						<BrandMark className="h-5! w-auto! text-primary" />
						<span className="font-medium text-foreground!">kodapos</span>
						<span className="text-[10px] font-normal text-muted-foreground">
							v{__APP_VERSION__}
						</span>
					</Link>
				</SidebarMenuButton>
			</SidebarHeader>
			<SidebarContent>
				{visibleGroups.map((group, index) => (
					<NavGroup key={`sidebar-group-${index}`} {...group} />
				))}
			</SidebarContent>
			<SidebarFooter className="gap-0 p-0">
				<LatestChange />
				<SidebarMenu className="border-t p-2">
					{footerNavLinks.map((item) => (
						<SidebarMenuItem key={item.path ?? item.title.id}>
							<SidebarMenuButton
								asChild
								className="text-muted-foreground"
								size="sm"
							>
								<Link onClick={closeMobile} to={item.path as string}>
									{item.icon}
									<span>{i18n._(item.title)}</span>
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					))}
				</SidebarMenu>
				<div className="px-4 pt-4 pb-2 transition-opacity group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0">
					<p className="text-nowrap text-[9px] text-muted-foreground">
						© {new Date().getFullYear()} kodapos
					</p>
				</div>
			</SidebarFooter>
		</Sidebar>
	);
}
