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
	UtensilsCrossed,
	Users,
} from "lucide-react";

export type SidebarNavItem = {
	title: string;
	path?: string;
	icon?: ReactNode;
	isActive?: boolean;
	subItems?: SidebarNavItem[];
};

export type SidebarNavGroup = {
	label?: string;
	items: SidebarNavItem[];
};

// kodapos POS navigation. Paths map to real /_pos routes; sub-pages still in
// progress render a ComingSoon placeholder (see the stub route files).
export const navGroups: SidebarNavGroup[] = [
	{
		label: "Operasional",
		items: [
			{ title: "Dasbor", path: "/dashboard", icon: <LayoutDashboard /> },
			{ title: "Kasir", path: "/sale", icon: <Calculator /> },
			{ title: "Riwayat", path: "/history", icon: <History /> },
			{ title: "Shift", path: "/shifts", icon: <Clock /> },
		],
	},
	{
		label: "Katalog",
		items: [
			{
				title: "Menu",
				icon: <UtensilsCrossed />,
				subItems: [
					{ title: "Item Menu", path: "/menu" },
					{ title: "Kategori", path: "/menu/categories" },
					{ title: "Modifier", path: "/menu/modifiers" },
				],
			},
			{ title: "Resep", path: "/recipes", icon: <NotebookText /> },
			{
				title: "Inventaris",
				icon: <Package />,
				subItems: [
					{ title: "Stok", path: "/inventory" },
					{ title: "Penyesuaian", path: "/inventory/adjustments" },
					{ title: "Limbah", path: "/inventory/waste" },
					{ title: "Pembelian", path: "/inventory/purchases" },
				],
			},
			{ title: "Promo", path: "/promos", icon: <BadgePercent /> },
		],
	},
	{
		label: "Laporan",
		items: [
			{
				title: "Laporan",
				icon: <BarChart3 />,
				subItems: [
					{ title: "Ringkasan", path: "/reports" },
					{ title: "Penjualan", path: "/reports/sales" },
					{ title: "Produk", path: "/reports/products" },
					{ title: "Kasir", path: "/reports/cashiers" },
					{ title: "Pembayaran", path: "/reports/payments" },
				],
			},
		],
	},
	{
		label: "Pelanggan",
		items: [
			{ title: "Pelanggan", path: "/customers", icon: <Users /> },
			{ title: "Loyalitas", path: "/loyalty", icon: <Gift /> },
		],
	},
	{
		label: "Akun",
		items: [
			{
				title: "Pengaturan",
				icon: <Settings />,
				subItems: [
					{ title: "Profil", path: "/settings/profile" },
					{ title: "Staf", path: "/settings/staff" },
					{ title: "Pajak & Pembayaran", path: "/settings/tax" },
					{ title: "Struk & Printer", path: "/settings/receipt" },
					{ title: "Integrasi", path: "/settings/integrations" },
				],
			},
		],
	},
];

// Footer help links shown above the copyright in the sidebar footer.
export const footerNavLinks: SidebarNavItem[] = [
	{ title: "Pusat Bantuan", path: "/help", icon: <HelpCircle /> },
	{ title: "Dokumentasi", path: "/docs", icon: <BookOpen /> },
];

export const navLinks: SidebarNavItem[] = [
	...navGroups.flatMap((group) =>
		group.items.flatMap((item) =>
			item.subItems?.length ? [item, ...item.subItems] : [item]
		)
	),
	...footerNavLinks,
];
