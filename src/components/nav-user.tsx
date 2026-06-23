"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { api } from "convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Languages, LifeBuoy, LineChart, LogOut, RefreshCw, Settings, Users } from "lucide-react";
import { Trans } from "@lingui/react/macro";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useLocale } from "~/components/locale-provider";
import { defaultAvatarUrl } from "~/lib/avatar";
import { useActiveCashier } from "~/lib/active-cashier";
import { LOCALES, type Locale } from "~/lib/locale";

export function NavUser() {
	const { signOut } = useAuthActions();
	const navigate = useNavigate();
	const record = useMutation(api.cashierSessions.record);
	const { cashierId, clearCashier } = useActiveCashier();
	const { locale, setLocale } = useLocale();
	const cafe = useQuery(api.cafes.myCafe, {});
	const name = cafe?.name ?? "kodapos";
	const initial = name.charAt(0).toUpperCase();
	// Default to an illustrated DiceBear avatar (seeded by the stable cafe id)
	// when no logo is uploaded, instead of a plain initial.
	const avatarUrl = cafe?.logoUrl ?? (cafe ? defaultAvatarUrl(cafe._id) : undefined);

	async function handleSignOut(): Promise<void> {
		if (cashierId) { try { await record({ cashierId, type: 'logout' }); } catch { /* best effort */ } }
		clearCashier();
		await signOut();
		window.location.replace("/");
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Avatar className="size-8 cursor-pointer">
					{avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
					<AvatarFallback>{initial}</AvatarFallback>
				</Avatar>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-60">
				<DropdownMenuLabel className="flex items-center gap-3">
					<Avatar className="size-10">
						{avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
						<AvatarFallback>{initial}</AvatarFallback>
					</Avatar>
					<div className="min-w-0">
						<p className="truncate font-medium text-foreground">{name}</p>
						<p className="truncate text-muted-foreground text-xs"><Trans>Pemilik</Trans></p>
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem asChild>
						<Link to="/settings/profile">
							<Settings />
							<Trans>Pengaturan</Trans>
						</Link>
					</DropdownMenuItem>
					<DropdownMenuItem asChild>
						<Link to="/settings/staff">
							<Users />
							<Trans>Kelola staf</Trans>
						</Link>
					</DropdownMenuItem>
					<DropdownMenuItem asChild>
						<Link to="/reports" search={{ preset: "today" }}>
							<LineChart />
							<Trans>Laporan</Trans>
						</Link>
					</DropdownMenuItem>
					<DropdownMenuItem asChild>
						<Link to="/help">
							<LifeBuoy />
							<Trans>Bantuan</Trans>
						</Link>
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					className="cursor-pointer"
					onClick={() => void navigate({ to: "/pin" })}
				>
					<RefreshCw />
					<Trans>Ganti kasir</Trans>
				</DropdownMenuItem>
				<DropdownMenuSub>
					<DropdownMenuSubTrigger>
						<Languages />
						<Trans>Bahasa</Trans>
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent>
						<DropdownMenuRadioGroup
							value={locale}
							onValueChange={(v) => setLocale(v as Locale)}
						>
							{LOCALES.map((l) => (
								<DropdownMenuRadioItem key={l.value} value={l.value}>
									{l.label}
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuRadioGroup>
					</DropdownMenuSubContent>
				</DropdownMenuSub>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					className="cursor-pointer"
					onClick={handleSignOut}
					variant="destructive"
				>
					<LogOut />
					<Trans>Keluar</Trans>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
