import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { RequirePermission } from '~/components/permission/require-permission';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Mail, Users } from 'lucide-react';
import { useState } from 'react';
import { SettingsPageHeader } from '~/components/settings/primitives';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty';
import { Input } from '~/components/ui/input';
import { RowActions } from '~/components/ui/row-actions';
import { Spinner } from '~/components/ui/spinner';
import { toast } from '~/lib/toast';

export const Route = createFileRoute('/_pos/settings/members')({
	component: MembersPage,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MemberRow = {
	memberId: Id<'businessMembers'>;
	userId: Id<'users'>;
	name: string | null;
	email: string | null;
	role: 'owner' | 'manager';
	cafeIds: Id<'cafes'>[];
};

type PendingInviteRow = {
	inviteId: Id<'businessInvites'>;
	email: string;
	cafeIds: Id<'cafes'>[];
};

type OutletItem = {
	cafeId: Id<'cafes'>;
	name: string;
	isActive: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function outletNames(cafeIds: Id<'cafes'>[], outlets: OutletItem[]): string {
	const names = cafeIds
		.map((id) => outlets.find((o) => o.cafeId === id)?.name)
		.filter((n): n is string => !!n);
	return names.length > 0 ? names.join(', ') : '–';
}

// ---------------------------------------------------------------------------
// OutletCheckboxList — reused in invite dialog and edit-outlets dialog
// ---------------------------------------------------------------------------

function OutletCheckboxList({
	outlets,
	checked,
	toggle,
}: {
	outlets: OutletItem[];
	checked: Set<Id<'cafes'>>;
	toggle: (cafeId: Id<'cafes'>) => void;
}) {
	return (
		<div className="grid gap-2">
			{outlets.map((o) => (
				<label key={o.cafeId} className="flex items-center gap-2 text-sm cursor-pointer select-none">
					<Checkbox
						checked={checked.has(o.cafeId)}
						onCheckedChange={() => toggle(o.cafeId)}
					/>
					<span className="truncate">{o.name}</span>
				</label>
			))}
		</div>
	);
}

// ---------------------------------------------------------------------------
// InviteDialog
// ---------------------------------------------------------------------------

function InviteDialog({
	open,
	onOpenChange,
	outlets,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	outlets: OutletItem[];
}) {
	const { t } = useLingui();
	const [email, setEmail] = useState('');
	const [checkedCafeIds, setCheckedCafeIds] = useState<Set<Id<'cafes'>>>(new Set());
	const [submitting, setSubmitting] = useState(false);

	const inviteManager = useMutation(api.invites.inviteManager);

	function toggle(cafeId: Id<'cafes'>) {
		setCheckedCafeIds((prev) => {
			const next = new Set(prev);
			if (next.has(cafeId)) {
				next.delete(cafeId);
			} else {
				next.add(cafeId);
			}
			return next;
		});
	}

	function handleClose(nextOpen: boolean) {
		if (!nextOpen) {
			setEmail('');
			setCheckedCafeIds(new Set());
		}
		onOpenChange(nextOpen);
	}

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		if (checkedCafeIds.size === 0) return;
		setSubmitting(true);
		try {
			await inviteManager({
				email: email.trim(),
				cafeIds: Array.from(checkedCafeIds),
			});
			toast.success(t`Undangan terkirim.`);
			handleClose(false);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : t`Gagal mengirim undangan.`);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						<Trans>Undang manajer</Trans>
					</DialogTitle>
				</DialogHeader>
				<form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
					<div className="space-y-1">
						<label className="text-sm text-muted-foreground" htmlFor="invite-email">
							<Trans>Email</Trans>
						</label>
						<Input
							id="invite-email"
							type="email"
							placeholder={t`nama@contoh.com`}
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							autoComplete="email"
						/>
					</div>
					<div className="space-y-2">
						<p className="text-sm text-muted-foreground">
							<Trans>Outlet yang dapat diakses</Trans>
						</p>
						{outlets.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								<Trans>Tidak ada outlet tersedia.</Trans>
							</p>
						) : (
							<OutletCheckboxList
								outlets={outlets}
								checked={checkedCafeIds}
								toggle={toggle}
							/>
						)}
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => handleClose(false)}
							disabled={submitting}
						>
							<Trans>Batal</Trans>
						</Button>
						<Button
							type="submit"
							disabled={submitting || checkedCafeIds.size === 0}
						>
							{submitting && <Spinner data-icon="inline-start" />}
							<Trans>Kirim undangan</Trans>
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// ---------------------------------------------------------------------------
// EditOutletsDialog
// ---------------------------------------------------------------------------

function EditOutletsDialog({
	member,
	outlets,
	onClose,
}: {
	member: MemberRow | null;
	outlets: OutletItem[];
	onClose: () => void;
}) {
	const { t } = useLingui();
	const [checkedCafeIds, setCheckedCafeIds] = useState<Set<Id<'cafes'>>>(
		() => new Set(member?.cafeIds ?? []),
	);
	const [submitting, setSubmitting] = useState(false);

	const setManagerOutlets = useMutation(api.invites.setManagerOutlets);

	// Sync initial checked state when member changes
	const memberName = member?.name ?? member?.email ?? '';

	function toggle(cafeId: Id<'cafes'>) {
		setCheckedCafeIds((prev) => {
			const next = new Set(prev);
			if (next.has(cafeId)) {
				next.delete(cafeId);
			} else {
				next.add(cafeId);
			}
			return next;
		});
	}

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		if (!member || checkedCafeIds.size === 0) return;
		setSubmitting(true);
		try {
			await setManagerOutlets({
				memberId: member.memberId,
				cafeIds: Array.from(checkedCafeIds),
			});
			toast.success(t`Outlet berhasil diperbarui.`);
			onClose();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : t`Gagal memperbarui outlet.`);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Dialog open={!!member} onOpenChange={(o) => !o && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{member ? t`Edit outlet untuk ${memberName}` : null}
					</DialogTitle>
				</DialogHeader>
				<form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
					<div className="space-y-2">
						<p className="text-sm text-muted-foreground">
							<Trans>Outlet yang dapat diakses</Trans>
						</p>
						{outlets.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								<Trans>Tidak ada outlet tersedia.</Trans>
							</p>
						) : (
							<OutletCheckboxList
								outlets={outlets}
								checked={checkedCafeIds}
								toggle={toggle}
							/>
						)}
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={onClose}
							disabled={submitting}
						>
							<Trans>Batal</Trans>
						</Button>
						<Button
							type="submit"
							disabled={submitting || checkedCafeIds.size === 0}
						>
							{submitting && <Spinner data-icon="inline-start" />}
							<Trans>Simpan</Trans>
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function MembersPage() {
	const { t } = useLingui();

	const members = useQuery(api.invites.listMembers, {});
	const pendingInvites = useQuery(api.invites.listPendingInvites, {});
	const outlets = useQuery(api.outlets.myOutlets, {});

	const revokeMember = useMutation(api.invites.revokeMember);
	const cancelInvite = useMutation(api.invites.cancelInvite);

	// Invite dialog
	const [inviteOpen, setInviteOpen] = useState(false);

	// Edit outlets dialog — holds the manager being edited
	const [editingMember, setEditingMember] = useState<MemberRow | null>(null);

	// Revoke confirm — holds the member to revoke
	const [revokingMember, setRevokingMember] = useState<MemberRow | null>(null);

	// Cancel invite confirm — holds the invite to cancel
	const [cancellingInvite, setCancellingInvite] = useState<PendingInviteRow | null>(null);

	const outletList: OutletItem[] = outlets ?? [];
	const managers = (members ?? []).filter((m) => m.role === 'manager');

	if (members === undefined || pendingInvites === undefined || outlets === undefined) {
		return <p className="text-muted-foreground"><Trans>Memuat…</Trans></p>;
	}

	return (
		<RequirePermission owner>
		<div className="space-y-6 max-w-2xl">
			<div className="flex items-start justify-between gap-4">
				<SettingsPageHeader
					title={<Trans>Tim</Trans>}
					description={<Trans>Kelola manajer outlet dan undangan yang tertunda.</Trans>}
				/>
				<Button type="button" onClick={() => setInviteOpen(true)} className="shrink-0">
					<Trans>Undang manajer</Trans>
				</Button>
			</div>

			{/* ── Members section ───────────────────────────────────────────── */}
			<section className="space-y-2">
				<h2 className="text-sm font-semibold uppercase text-muted-foreground tracking-wide">
					<Trans>Anggota</Trans>
				</h2>
				<div className="rounded-md border border-border overflow-hidden">
					<table className="w-full text-sm">
						<thead>
							<tr className="text-left text-xs uppercase text-muted-foreground bg-muted/40 border-b border-border">
								<th className="py-2 px-3"><Trans>Nama / Email</Trans></th>
								<th className="py-2 px-3 w-28"><Trans>Peran</Trans></th>
								<th className="py-2 px-3"><Trans>Outlet</Trans></th>
								<th className="py-2 px-3 w-10" />
							</tr>
						</thead>
						<tbody>
							{/* Owner row(s) */}
							{(members ?? [])
								.filter((m) => m.role === 'owner')
								.map((m) => (
									<tr key={m.memberId} className="border-b border-border/50">
										<td className="py-2 px-3">
											<div className="font-medium">{m.name ?? m.email ?? t`Pemilik`}</div>
											{m.name && m.email && (
												<div className="text-xs text-muted-foreground">{m.email}</div>
											)}
										</td>
										<td className="py-2 px-3">
											<Badge variant="secondary"><Trans>Pemilik</Trans></Badge>
										</td>
										<td className="py-2 px-3 text-muted-foreground text-xs">
											<Trans>Semua outlet</Trans>
										</td>
										<td className="py-2 px-3" />
									</tr>
								))}

							{/* Manager rows — or empty state */}
							{managers.length === 0 ? (
								<tr>
									<td colSpan={4} className="p-0">
										<Empty>
											<EmptyHeader>
												<EmptyMedia variant="icon"><Users /></EmptyMedia>
												<EmptyTitle><Trans>Belum ada manajer.</Trans></EmptyTitle>
												<EmptyDescription>
													<Trans>Undang manajer untuk memberi akses ke outlet tertentu.</Trans>
												</EmptyDescription>
											</EmptyHeader>
										</Empty>
									</td>
								</tr>
							) : (
								managers.map((m) => (
									<tr key={m.memberId} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
										<td className="py-2 px-3">
											<div className="font-medium">{m.name ?? m.email ?? '–'}</div>
											{m.name && m.email && (
												<div className="text-xs text-muted-foreground">{m.email}</div>
											)}
										</td>
										<td className="py-2 px-3">
											<Badge variant="outline"><Trans>Manajer</Trans></Badge>
										</td>
										<td className="py-2 px-3 text-xs text-muted-foreground">
											{outletNames(m.cafeIds, outletList)}
										</td>
										<td className="py-2 px-3 text-right">
											<RowActions
												label={t`Aksi baris`}
												items={[
													{
														label: t`Edit outlet`,
														onSelect: () => setEditingMember(m),
													},
													{
														label: t`Hapus`,
														onSelect: () => setRevokingMember(m),
														destructive: true,
														separatorBefore: true,
													},
												]}
											/>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</section>

			{/* ── Pending invites section ───────────────────────────────────── */}
			<section className="space-y-2">
				<h2 className="text-sm font-semibold uppercase text-muted-foreground tracking-wide">
					<Trans>Undangan tertunda</Trans>
				</h2>
				<div className="rounded-md border border-border overflow-hidden">
					<table className="w-full text-sm">
						<thead>
							<tr className="text-left text-xs uppercase text-muted-foreground bg-muted/40 border-b border-border">
								<th className="py-2 px-3"><Trans>Email</Trans></th>
								<th className="py-2 px-3"><Trans>Outlet</Trans></th>
								<th className="py-2 px-3 w-10" />
							</tr>
						</thead>
						<tbody>
							{pendingInvites.length === 0 ? (
								<tr>
									<td colSpan={3} className="p-0">
										<Empty>
											<EmptyHeader>
												<EmptyMedia variant="icon"><Mail /></EmptyMedia>
												<EmptyTitle><Trans>Tidak ada undangan tertunda.</Trans></EmptyTitle>
												<EmptyDescription>
													<Trans>Undangan yang dikirim akan muncul di sini sampai diterima.</Trans>
												</EmptyDescription>
											</EmptyHeader>
										</Empty>
									</td>
								</tr>
							) : (
								pendingInvites.map((inv) => (
									<tr key={inv.inviteId} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
										<td className="py-2 px-3 font-medium">{inv.email}</td>
										<td className="py-2 px-3 text-xs text-muted-foreground">
											{outletNames(inv.cafeIds, outletList)}
										</td>
										<td className="py-2 px-3 text-right">
											<RowActions
												label={t`Aksi baris`}
												items={[
													{
														label: t`Batalkan undangan`,
														onSelect: () => setCancellingInvite(inv),
														destructive: true,
													},
												]}
											/>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</section>

			{/* ── Invite dialog ─────────────────────────────────────────────── */}
			<InviteDialog
				open={inviteOpen}
				onOpenChange={setInviteOpen}
				outlets={outletList}
			/>

			{/* ── Edit outlets dialog ───────────────────────────────────────── */}
			<EditOutletsDialog
				key={editingMember?.memberId ?? 'none'}
				member={editingMember}
				outlets={outletList}
				onClose={() => setEditingMember(null)}
			/>

			{/* ── Revoke member confirm ─────────────────────────────────────── */}
			<ConfirmDialog
				open={!!revokingMember}
				onOpenChange={(o) => { if (!o) setRevokingMember(null); }}
				title={<Trans>Hapus anggota?</Trans>}
				description={
					revokingMember
						? t`${revokingMember.name ?? revokingMember.email ?? 'Anggota ini'} akan kehilangan akses ke semua outlet.`
						: undefined
				}
				confirmLabel={<Trans>Hapus</Trans>}
				destructive
				onConfirm={async () => {
					if (!revokingMember) return;
					await revokeMember({ memberId: revokingMember.memberId });
				}}
			/>

			{/* ── Cancel invite confirm ─────────────────────────────────────── */}
			<ConfirmDialog
				open={!!cancellingInvite}
				onOpenChange={(o) => { if (!o) setCancellingInvite(null); }}
				title={<Trans>Batalkan undangan?</Trans>}
				description={
					cancellingInvite
						? t`Undangan untuk ${cancellingInvite.email} akan dibatalkan.`
						: undefined
				}
				confirmLabel={<Trans>Batalkan undangan</Trans>}
				destructive
				onConfirm={async () => {
					if (!cancellingInvite) return;
					await cancelInvite({ inviteId: cancellingInvite.inviteId });
				}}
			/>
		</div>
		</RequirePermission>
	);
}
