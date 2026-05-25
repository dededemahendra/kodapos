import { useAuthActions } from '@convex-dev/auth/react';
import { Link, useRouterState } from '@tanstack/react-router';
import {
  Calculator,
  Coffee,
  History,
  LogOut,
  Package,
  Settings,
  UtensilsCrossed,
} from 'lucide-react';
import type { ComponentType } from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '~/components/ui/sidebar';
import { useActiveCashier } from '~/lib/active-cashier';

type IconComponent = ComponentType<{ className?: string }>;

const LINKS: Array<{ to: string; label: string; icon: IconComponent }> = [
  { to: '/sale', label: 'Kasir', icon: Calculator },
  { to: '/history', label: 'Riwayat', icon: History },
  { to: '/menu', label: 'Menu', icon: UtensilsCrossed },
  { to: '/inventory', label: 'Inventaris', icon: Package },
  { to: '/settings/profile', label: 'Pengaturan', icon: Settings },
];

export function AppSidebar() {
  const { signOut } = useAuthActions();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { clearCashier } = useActiveCashier();

  async function handleSignOut(): Promise<void> {
    clearCashier();
    await signOut();
    window.location.replace('/');
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <Link to="/menu" className="flex items-center gap-2 px-2 py-1.5 text-primary">
          <Coffee className="size-5" />
          <span className="font-semibold text-base">kodapos</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {LINKS.map((link) => {
                const active =
                  link.to === '/settings/profile'
                    ? path.startsWith('/settings')
                    : path === link.to || path.startsWith(`${link.to}/`);
                const Icon = link.icon;
                return (
                  <SidebarMenuItem key={link.to}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link to={link.to}>
                        <Icon />
                        <span>{link.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSignOut} className="text-muted-foreground">
              <LogOut />
              <span>Keluar</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
