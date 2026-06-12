import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Printer, Tags } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BarcodeSVG } from '~/components/menu/barcode-svg';
import { RequirePermission } from '~/components/permission/require-permission';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';
import { toast } from '~/lib/toast';

export const Route = createFileRoute('/_pos/menu/labels')({
  component: LabelsPage,
});

type Selection = { checked: boolean; qty: number };
type LabelSize = 'kecil' | 'sedang' | 'besar';

const SIZE_COLUMNS: Record<LabelSize, number> = {
  kecil: 4,
  sedang: 3,
  besar: 2,
};

function LabelsPage() {
  return (
    <RequirePermission perm="canEditMenu">
      <LabelsContent />
    </RequirePermission>
  );
}

function LabelsContent() {
  const { t } = useLingui();
  const items = useQuery(api.menu.items.listForSale);
  const assignBarcode = useMutation(api.menu.items.assignBarcode);
  const assignMissing = useMutation(api.menu.items.assignMissingBarcodes);

  const [selection, setSelection] = useState<Record<string, Selection>>({});
  const [size, setSize] = useState<LabelSize>('sedang');

  function selectionFor(id: string): Selection {
    return selection[id] ?? { checked: false, qty: 1 };
  }

  function setChecked(id: string, checked: boolean) {
    setSelection((prev) => ({
      ...prev,
      [id]: { ...selectionFor(id), checked },
    }));
  }

  function setQty(id: string, qty: number) {
    setSelection((prev) => ({
      ...prev,
      [id]: { ...selectionFor(id), qty: Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1 },
    }));
  }

  async function onAssign(id: Id<'menuItems'>) {
    try {
      await assignBarcode({ id });
      toast.success(t`Barcode dibuat.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t`Gagal membuat barcode.`);
    }
  }

  async function onAssignAll() {
    try {
      const { assigned } = await assignMissing({});
      toast.success(t`${assigned} barcode dibuat.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t`Gagal membuat barcode.`);
    }
  }

  // Items that are checked AND already have a barcode, expanded by qty for the
  // print grid.
  const printItems = useMemo(() => {
    if (!items) return [];
    const out: Array<{ key: string; name: string; priceIDR: number; barcode: string }> = [];
    for (const { item } of items) {
      const sel = selection[item._id];
      if (!sel?.checked || !item.barcode) continue;
      for (let i = 0; i < sel.qty; i++) {
        out.push({
          key: `${item._id}-${i}`,
          name: item.name,
          priceIDR: item.priceIDR,
          barcode: item.barcode,
        });
      }
    }
    return out;
  }, [items, selection]);

  if (items === undefined) {
    return (
      <div className="grid place-items-center py-12">
        <Spinner />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Tags />
          </EmptyMedia>
          <EmptyTitle>
            <Trans>Belum ada item.</Trans>
          </EmptyTitle>
          <EmptyDescription>
            <Trans>Tambah item menu untuk mencetak label barcode.</Trans>
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const columns = SIZE_COLUMNS[size];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">
          <Trans>Label Barcode</Trans>
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={onAssignAll}>
            <Trans>Buat semua</Trans>
          </Button>
          <Select value={size} onValueChange={(v) => setSize(v as LabelSize)}>
            <SelectTrigger className="w-40" aria-label={t`Ukuran label`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="kecil">{t`Kecil`}</SelectItem>
              <SelectItem value="sedang">{t`Sedang`}</SelectItem>
              <SelectItem value="besar">{t`Besar`}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            onClick={() => window.print()}
            disabled={printItems.length === 0}
          >
            <Printer />
            <Trans>Cetak label</Trans>
          </Button>
        </div>
      </div>

      <ul className="divide-y divide-border rounded-md border border-border">
        {items.map(({ item }) => {
          const sel = selectionFor(item._id);
          return (
            <li key={item._id} className="flex items-center gap-3 p-3">
              <Checkbox
                checked={sel.checked}
                onCheckedChange={(c) => setChecked(item._id, c === true)}
                aria-label={t`Pilih ${item.name}`}
              />
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{item.name}</div>
                <div className="text-sm text-muted-foreground tabular-nums">
                  {formatIDR(item.priceIDR)}
                </div>
              </div>
              <Input
                type="number"
                min={1}
                value={sel.qty}
                onChange={(e) => setQty(item._id, Number.parseInt(e.target.value, 10))}
                className="w-20"
                aria-label={t`Jumlah`}
              />
              <div className="w-44 text-right">
                {item.barcode ? (
                  <span className="font-mono text-sm">{item.barcode}</span>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onAssign(item._id)}
                  >
                    <Trans>Buat barcode</Trans>
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Items checked but lacking a barcode are skipped from print. */}
      {items.some(({ item }) => selection[item._id]?.checked && !item.barcode) ? (
        <p className="text-sm text-muted-foreground">
          <Trans>Buat barcode dulu untuk item terpilih yang belum punya barcode.</Trans>
        </p>
      ) : null}

      {/* Print-only label grid. Hidden on screen; the global @media print rule
          (see globals.css [data-print-labels]) hides the app chrome so only
          this grid is sent to the printer. */}
      <div
        data-print-labels
        className="hidden print:grid gap-2"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {printItems.map((label) => (
          <div
            key={label.key}
            className="flex flex-col items-center gap-1 border border-black p-2 break-inside-avoid text-center"
          >
            <div className="text-sm font-semibold">{label.name}</div>
            <div className="text-sm tabular-nums">{formatIDR(label.priceIDR)}</div>
            <BarcodeSVG value={label.barcode} />
          </div>
        ))}
      </div>
    </div>
  );
}
