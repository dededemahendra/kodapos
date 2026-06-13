import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { Scale } from 'lucide-react';
import {
  EXPENSE_CATEGORY_OPTIONS,
  type ExpenseCategory,
} from '~/components/expenses/expense-categories';
import { useReportRange } from '~/components/reports/use-report-range';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { Spinner } from '~/components/ui/spinner';
import { downloadCSV, toCSV } from '~/lib/csv';
import { formatIDR } from '~/lib/money';
import { exportTablePdf } from '~/lib/pdf';
import { toast } from '~/lib/toast';

export const Route = createFileRoute('/_pos/reports/profit-loss')({
  component: ProfitLossReport,
});

function catLabel(c: ExpenseCategory) {
  return EXPENSE_CATEGORY_OPTIONS.find((o) => o.value === c)?.label ?? c;
}

function ProfitLossReport() {
  const { t } = useLingui();
  const { range } = useReportRange();
  const data = useQuery(api.reports.profitLoss, { range });

  // Raw category labels keyed by the DB value for CSV export (off-screen, so
  // the translated ReactNode labels above can't be reused).
  const catText: Record<ExpenseCategory, string> = {
    rent: t`Sewa`,
    utilities: t`Utilitas`,
    supplies: t`Perlengkapan`,
    salary: t`Gaji`,
    other: t`Lainnya`,
  };

  function exportCSV() {
    if (!data) return;
    const rows: { label: string; amountIDR: number }[] = [
      { label: t`Pendapatan`, amountIDR: data.revenueIDR },
      { label: t`Pengembalian`, amountIDR: -data.refundsIDR },
      { label: t`HPP`, amountIDR: -data.cogsIDR },
      { label: t`Laba kotor`, amountIDR: data.grossProfitIDR },
      { label: t`Pengeluaran`, amountIDR: -data.expensesIDR },
      ...data.expensesByCategory.map((c) => ({
        label: catText[c.category],
        amountIDR: -c.amountIDR,
      })),
      { label: t`Pendapatan lain`, amountIDR: data.otherIncomeIDR },
      { label: t`Laba bersih`, amountIDR: data.netProfitIDR },
    ];
    const csv = toCSV(rows, [
      { key: 'label', header: t`Keterangan` },
      { key: 'amountIDR', header: t`Jumlah (Rp)` },
    ]);
    downloadCSV('laba-rugi.csv', csv);
  }

  // English category labels for the off-catalog PDF document.
  const catEnglish: Record<ExpenseCategory, string> = {
    rent: 'Rent',
    utilities: 'Utilities',
    supplies: 'Supplies',
    salary: 'Salary',
    other: 'Other',
  };

  async function exportPDF() {
    if (!data) return;
    try {
      const rows = [
        { label: 'Revenue', amountIDR: formatIDR(data.revenueIDR) },
        { label: 'Refunds', amountIDR: formatIDR(-data.refundsIDR) },
        { label: 'COGS', amountIDR: formatIDR(-data.cogsIDR) },
        { label: 'Gross profit', amountIDR: formatIDR(data.grossProfitIDR) },
        { label: 'Expenses', amountIDR: formatIDR(-data.expensesIDR) },
        ...data.expensesByCategory.map((c) => ({
          label: catEnglish[c.category],
          amountIDR: formatIDR(-c.amountIDR),
        })),
        { label: 'Other income', amountIDR: formatIDR(data.otherIncomeIDR) },
      ];
      await exportTablePdf({
        filename: 'laba-rugi.pdf',
        title: 'Profit and Loss',
        subtitle: `${data.fromKey} to ${data.toKey}`,
        columns: [
          { key: 'label', header: 'Item' },
          { key: 'amountIDR', header: 'Amount' },
        ],
        rows,
        numericKeys: ['amountIDR'],
        footRows: [['Net profit', formatIDR(data.netProfitIDR)]],
      });
    } catch {
      toast.error(t`Gagal mengunduh PDF.`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={exportCSV}
          disabled={!data}
        >
          <Trans>Unduh CSV</Trans>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={exportPDF}
          disabled={!data}
        >
          <Trans>Unduh PDF</Trans>
        </Button>
      </div>

      {data === undefined ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : data.revenueIDR === 0 &&
        data.refundsIDR === 0 &&
        data.expensesIDR === 0 &&
        data.otherIncomeIDR === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Scale />
            </EmptyMedia>
            <EmptyTitle>
              <Trans>Belum ada data pada rentang ini.</Trans>
            </EmptyTitle>
            <EmptyDescription>
              <Trans>Coba ubah rentang tanggal di atas.</Trans>
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card className="mx-auto max-w-md p-4">
          <dl className="space-y-2">
            <div className="flex items-baseline justify-between gap-4">
              <dt>
                <Trans>Pendapatan</Trans>
              </dt>
              <dd className="tabular-nums">{formatIDR(data.revenueIDR)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 text-muted-foreground">
              <dt>
                <Trans>− Pengembalian</Trans>
              </dt>
              <dd className="tabular-nums">−{formatIDR(data.refundsIDR)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 text-muted-foreground">
              <dt>
                <Trans>− HPP</Trans>
              </dt>
              <dd className="tabular-nums">−{formatIDR(data.cogsIDR)}</dd>
            </div>

            <div className="flex items-baseline justify-between gap-4 border-t border-border pt-2 font-semibold">
              <dt className="flex items-center gap-2">
                <Trans>= Laba kotor</Trans>
                <Badge variant="secondary">{`${data.grossMarginPct}%`}</Badge>
              </dt>
              <dd className="tabular-nums">{formatIDR(data.grossProfitIDR)}</dd>
            </div>

            <div className="flex items-baseline justify-between gap-4 text-muted-foreground pt-2">
              <dt>
                <Trans>− Pengeluaran</Trans>
              </dt>
              <dd className="tabular-nums">−{formatIDR(data.expensesIDR)}</dd>
            </div>
            {data.expensesByCategory.length > 0 ? (
              <div className="space-y-1 pl-4">
                {data.expensesByCategory.map((c) => (
                  <div
                    key={c.category}
                    className="flex items-baseline justify-between gap-4 text-muted-foreground text-sm"
                  >
                    <dt>{catLabel(c.category)}</dt>
                    <dd className="tabular-nums">−{formatIDR(c.amountIDR)}</dd>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex items-baseline justify-between gap-4 text-muted-foreground pt-2">
              <dt>
                <Trans>+ Pendapatan lain</Trans>
              </dt>
              <dd className="tabular-nums">
                +{formatIDR(data.otherIncomeIDR)}
              </dd>
            </div>

            <div className="flex items-baseline justify-between gap-4 border-t border-border pt-2 text-lg font-bold">
              <dt className="flex items-center gap-2">
                <Trans>= Laba bersih</Trans>
                <Badge
                  variant={data.netProfitIDR < 0 ? 'destructive' : 'secondary'}
                >
                  {`${data.netMarginPct}%`}
                </Badge>
              </dt>
              <dd
                className={`tabular-nums${
                  data.netProfitIDR < 0 ? ' text-destructive' : ''
                }`}
              >
                {formatIDR(data.netProfitIDR)}
              </dd>
            </div>
          </dl>
        </Card>
      )}

      <p className="text-muted-foreground text-xs mt-3">
        <Trans>
          HPP memakai biaya bahan terkini; pengeluaran di luar inventaris.
        </Trans>
      </p>
    </div>
  );
}
