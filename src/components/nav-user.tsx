"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "convex/_generated/api";
import { useQuery } from "convex/react";
import { LogOut, Settings } from "lucide-react";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useActiveCashier } from "~/lib/active-cashier";

export function NavUser() {
	const { signOut } = useAuthActions();
	const { clearCashier } = useActiveCashier();
	const cafe = useQuery(api.cafes.myCafe, {});
	const name = cafe?.name ?? "kodapos";
	const initial = name.charAt(0).toUpperCase();

	async function handleSignOut(): Promise<void> {
		clearCashier();
		await signOut();
		window.location.replace("/");
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Avatar className="size-8 cursor-pointer">
					<AvatarFallback>{initial}</AvatarFallback>
				</Avatar>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-60">
				<DropdownMenuLabel className="flex items-center gap-3">
					<Avatar className="size-10">
						<AvatarFallback>{initial}</AvatarFallback>
					</Avatar>
					<div className="min-w-0">
						<p className="truncate font-medium text-foreground">{name}</p>
						<p className="truncate text-muted-foreground text-xs">Pemilik</p>
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem asChild>
						<a href="/settings/profile">
							<Settings />
							Pengaturan
						</a>
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					className="cursor-pointer"
					onClick={handleSignOut}
					variant="destructive"
				>
					<LogOut />
					Keluar
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
