import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';
import type { ReactNode } from "react";
import {
	BadgePercent,
	BarChart3,
	BookOpen,
	Calculator,
	Clock,
	Gift,
	HelpCircle,
	History,
	LayoutDashboard,
	NotebookText,
	Package,
	Settings,
	TrendingUp,
	Truck,
	UtensilsCrossed,
	Users,
} from "lucide-react";

export type SidebarNavItem = {
	title: MessageDescriptor;
	path?: string;
	icon?: ReactNode;
	isActive?: boolean;
	subItems?: SidebarNavItem[];
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
			{ title: msg`Dasbor`, path: "/dashboard", icon: <LayoutDashboard /> },
			{ title: msg`Kasir`, path: "/sale", icon: <Calculator /> },
			{ title: msg`Riwayat`, path: "/history", icon: <History /> },
			{ title: msg`Shift`, path: "/shifts", icon: <Clock /> },
		],
	},
	{
		label: msg`Katalog`,
		items: [
			{
				title: msg`Menu`,
				icon: <UtensilsCrossed />,
				subItems: [
					{ title: msg`Item Menu`, path: "/menu" },
					{ title: msg`Kategori`, path: "/menu/categories" },
					{ title: msg`Modifier`, path: "/menu/modifiers" },
				],
			},
			{ title: msg`Resep`, path: "/recipes", icon: <NotebookText /> },
			{
				title: msg`Inventaris`,
				icon: <Package />,
				subItems: [
					{ title: msg`Stok`, path: "/inventory" },
					{ title: msg`Penyesuaian`, path: "/inventory/adjustments" },
					{ title: msg`Limbah`, path: "/inventory/waste" },
					{ title: msg`Pembelian`, path: "/inventory/purchases" },
					{ title: msg`Pemasok`, path: "/suppliers" },
				],
			},
			{ title: msg`Promo`, path: "/promos", icon: <BadgePercent /> },
		],
	},
	{
		label: msg`Laporan`,
		items: [
			{ title: msg`Prediksi`, path: "/forecast", icon: <TrendingUp /> },
			{
				title: msg`Laporan`,
				icon: <BarChart3 />,
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
				subItems: [
					{ title: msg`Umum`, path: "/settings/general" },
					{ title: msg`Profil`, path: "/settings/profile" },
					{ title: msg`Staf`, path: "/settings/staff" },
					{ title: msg`Pajak & Pembayaran`, path: "/settings/tax" },
					{ title: msg`Struk & Printer`, path: "/settings/receipt" },
					{ title: msg`Integrasi`, path: "/settings/integrations" },
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
