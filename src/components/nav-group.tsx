"use client";

import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
} from "~/components/ui/sidebar";
import type { SidebarNavGroup, SidebarNavItem } from "~/components/app-shared";

export function NavGroup({ label, items }: SidebarNavGroup) {
	const path = useRouterState({ select: (s) => s.location.pathname });
	// `matches` = on this page or a nested page; `exact` = this page only.
	const matches = (p?: string) =>
		!!p && (path === p || path.startsWith(`${p}/`));
	const exact = (p?: string) => !!p && path === p;

	return (
		<SidebarGroup>
			{label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
			<SidebarMenu>
				{items.map((item) =>
					item.subItems?.length ? (
						<CollapsibleNavItem
							exact={exact}
							item={item}
							key={item.title}
							matches={matches}
						/>
					) : (
						<SidebarMenuItem key={item.title}>
							<SidebarMenuButton
								asChild
								isActive={matches(item.path)}
								tooltip={item.title}
							>
								<Link to={item.path as string}>
									{item.icon}
									<span>{item.title}</span>
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					)
				)}
			</SidebarMenu>
		</SidebarGroup>
	);
}

function CollapsibleNavItem({
	item,
	matches,
	exact,
}: {
	item: SidebarNavItem;
	matches: (p?: string) => boolean;
	exact: (p?: string) => boolean;
}) {
	const subItems = item.subItems ?? [];
	const sectionActive = subItems.some((s) => matches(s.path));
	const [open, setOpen] = useState(sectionActive);

	// Auto-open when navigating into this section (SPA nav doesn't remount).
	useEffect(() => {
		if (sectionActive) setOpen(true);
	}, [sectionActive]);

	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				aria-expanded={open}
				isActive={sectionActive}
				onClick={() => setOpen((o) => !o)}
				tooltip={item.title}
			>
				{item.icon}
				<span>{item.title}</span>
				<motion.span
					animate={{ rotate: open ? 90 : 0 }}
					className="ml-auto inline-flex shrink-0"
					transition={{ duration: 0.2, ease: "easeInOut" }}
				>
					<ChevronRight className="size-4" />
				</motion.span>
			</SidebarMenuButton>
			<AnimatePresence initial={false}>
				{open && (
					<motion.div
						animate={{ height: "auto", opacity: 1 }}
						className="overflow-hidden"
						exit={{ height: 0, opacity: 0 }}
						initial={{ height: 0, opacity: 0 }}
						key="content"
						transition={{ duration: 0.22, ease: "easeInOut" }}
					>
						<SidebarMenuSub>
							{subItems.map((sub) => (
								<SidebarMenuSubItem key={sub.title}>
									<SidebarMenuSubButton asChild isActive={exact(sub.path)}>
										<Link to={sub.path as string}>
											<span>{sub.title}</span>
										</Link>
									</SidebarMenuSubButton>
								</SidebarMenuSubItem>
							))}
						</SidebarMenuSub>
					</motion.div>
				)}
			</AnimatePresence>
		</SidebarMenuItem>
	);
}
