import { Trans } from '@lingui/react/macro';
import { Link, Outlet, createFileRoute } from '@tanstack/react-router';
import { RequirePermission } from '~/components/permission/require-permission';
import { PageHeader } from '~/components/ui/page-header';
import { RangePicker } from '~/components/reports/range-picker';
import { type ReportSearch, parseReportSearch } from '~/components/reports/use-report-range';

export const Route = createFileRoute('/_pos/reports')({
  validateSearch: parseReportSearch,
  component: ReportsLayout,
});

const TABS = [
  { to: '/reports', label: <Trans>Ringkasan</Trans> },
  { to: '/reports/sales', label: <Trans>Penjualan</Trans> },
  { to: '/reports/products', label: <Trans>Produk</Trans> },
  { to: '/reports/margin', label: <Trans>Margin</Trans> },
  { to: '/reports/profit-loss', label: <Trans>Laba/Rugi</Trans> },
  { to: '/reports/payments', label: <Trans>Pembayaran</Trans> },
  { to: '/reports/cashiers', label: <Trans>Kasir</Trans> },
  { to: '/reports/orders', label: <Trans>Pesanan</Trans> },
  { to: '/reports/expenses', label: <Trans>Pengeluaran</Trans> },
  { to: '/reports/other-income', label: <Trans>Pendapatan Lain</Trans> },
] as const;

function ReportsLayout() {
  return (
    <RequirePermission perm="canViewReports">
    <main className="p-6">
      <PageHeader title={<Trans>Laporan</Trans>} />
      <div className="mt-2"><RangePicker /></div>
      <nav className="mt-4 flex gap-4 border-b border-border text-sm">
        {TABS.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            // TanStack merges sibling-route search into an all-optional type;
            // validateSearch guarantees prev is already a valid ReportSearch.
            search={(prev) => prev as ReportSearch}
            activeOptions={{ exact: t.to === '/reports' }}
            className="py-2 px-1 -mb-px border-b-2 border-transparent hover:border-ring"
            activeProps={{ className: 'border-ring font-semibold' }}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="mt-4">
        <Outlet />
      </div>
    </main>
    </RequirePermission>
  );
}
