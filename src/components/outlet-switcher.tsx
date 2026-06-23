"use client";

import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Check, ChevronsUpDown, LayoutGrid, Plus, Store } from "lucide-react";
import { useState } from "react";
import { Trans } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { SidebarMenuButton } from "~/components/ui/sidebar";
import { usePermissions } from "~/lib/permissions";
import { AddOutletDialog } from "~/components/add-outlet-dialog";

export function OutletSwitcher() {
	const outlets = useQuery(api.outlets.myOutlets, {});
	const setActive = useMutation(api.outlets.setActiveOutlet);
	const active = outlets?.find((o) => o.isActive) ?? outlets?.[0];
	const activeName = active?.name ?? "kodapos";
	const initial = activeName.charAt(0).toUpperCase();
	const { isOwner } = usePermissions();
	const [addOpen, setAddOpen] = useState(false);
	const navigate = useNavigate();

	async function handleSelect(cafeId: Id<"cafes">): Promise<void> {
		if (!active || cafeId === active.cafeId) return;
		await setActive({ cafeId });
	}

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<SidebarMenuButton
						size="lg"
						className="data-[state=open]:bg-sidebar-accent"
					>
						<div className="flex aspect-square size-7 items-center justify-center rounded-md bg-primary/10 font-semibold text-primary text-xs">
							{initial}
						</div>
						<span className="truncate font-medium text-foreground!">
							{activeName}
						</span>
						<ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
					</SidebarMenuButton>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="start"
					className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
				>
					<DropdownMenuLabel className="text-muted-foreground text-xs">
						<Trans>Outlet</Trans>
					</DropdownMenuLabel>
					{outlets?.map((o) => (
						<DropdownMenuItem
							key={o.cafeId}
							className="gap-2"
							onSelect={() => handleSelect(o.cafeId)}
						>
							<Store className="size-4 text-muted-foreground" />
							<span className="truncate">{o.name}</span>
							{o.isActive ? <Check className="ml-auto size-4" /> : null}
						</DropdownMenuItem>
					))}
					{outlets && outlets.length > 1 ? (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								className="gap-2"
								onSelect={() => navigate({ to: '/all-outlets', search: { preset: 'today' as const } })}
							>
								<LayoutGrid className="size-4 text-muted-foreground" />
								<Trans>Semua outlet</Trans>
							</DropdownMenuItem>
						</>
					) : null}
					{isOwner ? (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								className="gap-2"
								onSelect={(e) => {
									e.preventDefault();
									setAddOpen(true);
								}}
							>
								<Plus className="size-4" />
								<Trans>Tambah outlet</Trans>
							</DropdownMenuItem>
						</>
					) : null}
					{outlets && outlets.length > 0 ? <DropdownMenuSeparator /> : null}
					<DropdownMenuLabel className="font-normal text-[10px] text-muted-foreground">
						kodapos v{__APP_VERSION__}
					</DropdownMenuLabel>
				</DropdownMenuContent>
			</DropdownMenu>
			<AddOutletDialog open={addOpen} onOpenChange={setAddOpen} />
		</>
	);
}
