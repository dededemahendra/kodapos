"use client";

import { useRouterState } from "@tanstack/react-router";
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "~/components/ui/sidebar";
import type { SidebarNavGroup } from "~/components/app-shared";

export function NavGroup({ label, items }: SidebarNavGroup) {
	const path = useRouterState({ select: (s) => s.location.pathname });
	const isActive = (p?: string) =>
		!!p && (path === p || path.startsWith(`${p}/`));

	return (
		<SidebarGroup>
			{label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
			<SidebarMenu>
				{items.map((item) => (
					<SidebarMenuItem key={item.title}>
						<SidebarMenuButton
							asChild
							isActive={isActive(item.path)}
							tooltip={item.title}
						>
							<a href={item.path}>
								{item.icon}
								<span>{item.title}</span>
							</a>
						</SidebarMenuButton>
					</SidebarMenuItem>
				))}
			</SidebarMenu>
		</SidebarGroup>
	);
}
