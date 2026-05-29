import type { ReactNode } from "react";
import {
	BookOpen,
	Calculator,
	HelpCircle,
	History,
	LayoutDashboard,
	Package,
	Settings,
	UtensilsCrossed,
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

// kodapos POS navigation. Paths map to the real /_pos routes.
export const navGroups: SidebarNavGroup[] = [
	{
		label: "Operasional",
		items: [
			{ title: "Dasbor", path: "/dashboard", icon: <LayoutDashboard /> },
			{ title: "Kasir", path: "/sale", icon: <Calculator /> },
			{ title: "Riwayat", path: "/history", icon: <History /> },
		],
	},
	{
		label: "Manajemen",
		items: [
			{ title: "Menu", path: "/menu", icon: <UtensilsCrossed /> },
			{ title: "Inventaris", path: "/inventory", icon: <Package /> },
		],
	},
	{
		label: "Akun",
		items: [
			{ title: "Pengaturan", path: "/settings/profile", icon: <Settings /> },
		],
	},
];

// Footer help links shown above the copyright in the sidebar footer.
export const footerNavLinks: SidebarNavItem[] = [
	{ title: "Pusat Bantuan", path: "#", icon: <HelpCircle /> },
	{ title: "Dokumentasi", path: "#", icon: <BookOpen /> },
];

export const navLinks: SidebarNavItem[] = [
	...navGroups.flatMap((group) =>
		group.items.flatMap((item) =>
			item.subItems?.length ? [item, ...item.subItems] : [item]
		)
	),
	...footerNavLinks,
];
