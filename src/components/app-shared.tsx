import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';
import type { ReactNode } from "react";
import type { Permission } from '~/lib/permissions';
import {
	BadgePercent,
	BarChart3,
	BookOpen,
	Calculator,
	CalendarClock,
	CalendarDays,
	ChefHat,
	ClipboardList,
	Clock,
	ConciergeBell,
	Gift,
	Grid3x3,
	HelpCircle,
	History,
	LayoutDashboard,
	NotebookText,
	Package,
	Settings,
	Sparkles,
	TrendingUp,
	UtensilsCrossed,
	Users,
} from "lucide-react";

export type SidebarNavItem = {
	title: MessageDescriptor;
	path?: string;
	icon?: ReactNode;
	isActive?: boolean;
	subItems?: SidebarNavItem[];
	requires?: Permission | 'owner';
};

export type SidebarNavGroup = {
	label?: MessageDescriptor;
	items: SidebarNavItem[];
};

// kodapos POS navigation. Paths map to real /_pos routes; sub-pages still in
// progress render a ComingSoon placeholder (see the stub route files).
export const navGroups: SidebarNavGroup[] = [
	{
		label: msg`Operasional`,
		items: [
			{ title: msg`Dasbor`, path: "/dashboard", icon: <LayoutDashboard />, requires: 'canViewReports' },
			{ title: msg`Kasir`, path: "/sale", icon: <Calculator /> },
			{ title: msg`Meja`, path: "/tables", icon: <Grid3x3 /> },
			{ title: msg`Pesanan Masuk`, path: "/self-orders", icon: <ConciergeBell /> },
			{ title: msg`Reservasi`, path: "/reservations", icon: <CalendarClock /> },
			{ title: msg`Dapur`, path: "/kitchen", icon: <ChefHat /> },
			{ title: msg`Jam Kerja`, path: "/time-clock", icon: <Clock /> },
			{ title: msg`Riwayat`, path: "/history", icon: <History /> },
			{ title: msg`Shift`, path: "/shifts", icon: <Clock />, requires: 'canViewReports' },
		],
	},
	{
		label: msg`Katalog`,
		items: [
			{
				title: msg`Menu`,
				icon: <UtensilsCrossed />,
				requires: 'canEditMenu',
				subItems: [
					{ title: msg`Item Menu`, path: "/menu" },
					{ title: msg`Kategori`, path: "/menu/categories" },
					{ title: msg`Modifier`, path: "/menu/modifiers" },
				],
			},
			{ title: msg`Resep`, path: "/recipes", icon: <NotebookText />, requires: 'canEditMenu' },
			{
				title: msg`Inventaris`,
				icon: <Package />,
				requires: 'canEditMenu',
				subItems: [
					{ title: msg`Stok`, path: "/inventory" },
					{ title: msg`Penyesuaian`, path: "/inventory/adjustments" },
					{ title: msg`Limbah`, path: "/inventory/waste" },
					{ title: msg`Pembelian`, path: "/inventory/purchases" },
					{ title: msg`Pesanan Beli`, path: "/inventory/purchase-orders", icon: <ClipboardList />, requires: 'canEditMenu' },
					{ title: msg`Pemasok`, path: "/suppliers" },
				],
			},
			{ title: msg`Promo`, path: "/promos", icon: <BadgePercent />, requires: 'canEditMenu' },
			{ title: msg`Kartu Hadiah`, path: "/gift-cards", icon: <Gift />, requires: 'canEditMenu' },
		],
	},
	{
		label: msg`Laporan`,
		items: [
			{ title: msg`Asisten AI`, path: "/ai", icon: <Sparkles />, requires: 'canViewReports' },
			{ title: msg`Prediksi`, path: "/forecast", icon: <TrendingUp />, requires: 'canViewReports' },
			{
				title: msg`Laporan`,
				icon: <BarChart3 />,
				requires: 'canViewReports',
				subItems: [
					{ title: msg`Ringkasan`, path: "/reports" },
					{ title: msg`Penjualan`, path: "/reports/sales" },
					{ title: msg`Produk`, path: "/reports/products" },
					{ title: msg`Kasir`, path: "/reports/cashiers" },
					{ title: msg`Pembayaran`, path: "/reports/payments" },
				],
			},
		],
	},
	{
		label: msg`Pelanggan`,
		items: [
			{ title: msg`Pelanggan`, path: "/customers", icon: <Users /> },
			{ title: msg`Loyalitas`, path: "/loyalty", icon: <Gift /> },
		],
	},
	{
		label: msg`Akun`,
		items: [
			{
				title: msg`Pengaturan`,
				icon: <Settings />,
				// (no `requires` here — managers reach per-outlet settings; owner-only
				// sub-items are gated individually below)
				subItems: [
					{ title: msg`Umum`, path: "/settings/general" },
					{ title: msg`Profil`, path: "/settings/profile" },
					{ title: msg`Staf`, path: "/settings/staff" },
					{ title: msg`Tim`, path: "/settings/members", requires: 'owner' },
					{ title: msg`Pajak & Pembayaran`, path: "/settings/tax" },
					{ title: msg`Struk & Printer`, path: "/settings/receipt" },
					{ title: msg`Integrasi`, path: "/settings/integrations", requires: 'owner' },
				],
			},
		],
	},
];

// Footer help links shown above the copyright in the sidebar footer.
export const footerNavLinks: SidebarNavItem[] = [
	{ title: msg`Pusat Bantuan`, path: "/help", icon: <HelpCircle /> },
	{ title: msg`Dokumentasi`, path: "/docs", icon: <BookOpen /> },
];

export const navLinks: SidebarNavItem[] = [
	...navGroups.flatMap((group) =>
		group.items.flatMap((item) =>
			item.subItems?.length ? [item, ...item.subItems] : [item]
		)
	),
	...footerNavLinks,
];
