"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "convex/_generated/api";
import { useMutation } from "convex/react";
import { useState } from "react";
import { Trans } from "@lingui/react/macro";
import { Button } from "~/components/ui/button";

export function NoAccess(): React.ReactElement {
	const { signOut } = useAuthActions();
	const navigate = useNavigate();
	const createForOwner = useMutation(api.cafes.createForOwner);
	const [creating, setCreating] = useState(false);

	async function handleCreate(): Promise<void> {
		setCreating(true);
		try {
			await createForOwner({ name: "Kafe Saya" });
			await navigate({ to: "/onboarding/profile" });
		} catch {
			setCreating(false);
		}
	}

	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
			<h1 className="font-semibold text-lg">
				<Trans>Belum ada akses</Trans>
			</h1>
			<p className="max-w-sm text-muted-foreground text-sm">
				<Trans>
					Hubungi pemilik bisnis Anda untuk mendapat akses ke outlet, atau buat
					bisnis Anda sendiri.
				</Trans>
			</p>
			<div className="flex flex-col gap-2">
				<Button onClick={handleCreate} disabled={creating}>
					<Trans>Buat bisnis sendiri</Trans>
				</Button>
				<Button
					variant="ghost"
					onClick={() => {
						void signOut().then(() => window.location.replace("/"));
					}}
				>
					<Trans>Keluar</Trans>
				</Button>
			</div>
		</div>
	);
}
