"use client";

import { useNavigate } from "@tanstack/react-router";
import { api } from "convex/_generated/api";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

export function AddOutletDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (value: boolean) => void;
}): React.ReactElement {
	const { t } = useLingui();
	const navigate = useNavigate();
	const createOutlet = useMutation(api.outlets.createOutlet);
	const [name, setName] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Reset the form each time the dialog opens. It stays mounted in the
	// sidebar across navigation, so resetting on open (rather than on close)
	// avoids a blank-input flash during the close animation and uniformly
	// covers every close path (cancel, escape, backdrop, success).
	useEffect(() => {
		if (open) {
			setName("");
			setError(null);
		}
	}, [open]);

	async function handleSubmit(e: React.FormEvent): Promise<void> {
		e.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) {
			setError(t`Nama outlet wajib diisi.`);
			return;
		}
		setSubmitting(true);
		setError(null);
		try {
			await createOutlet({ name: trimmed });
			onOpenChange(false);
			await navigate({ to: "/settings/profile" });
		} catch (err) {
			setError(err instanceof Error ? err.message : t`Gagal membuat outlet.`);
			setSubmitting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>
							<Trans>Tambah outlet</Trans>
						</DialogTitle>
						<DialogDescription>
							<Trans>
								Buat outlet baru. Anda bisa mengatur menu, pajak, dan jam buka
								setelahnya.
							</Trans>
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-2 py-4">
						<Label htmlFor="outlet-name">
							<Trans>Nama outlet</Trans>
						</Label>
						<Input
							id="outlet-name"
							autoFocus
							maxLength={80}
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder={t`Misalnya: Kopi Senja Cabang 2`}
						/>
						{error ? (
							<p className="text-destructive text-sm">{error}</p>
						) : null}
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							<Trans>Batal</Trans>
						</Button>
						<Button type="submit" disabled={submitting}>
							<Trans>Buat outlet</Trans>
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
