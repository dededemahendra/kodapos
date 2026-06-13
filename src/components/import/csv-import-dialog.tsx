import { Trans, useLingui } from '@lingui/react/macro';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { downloadCSV, parseCSV, toCSV } from '~/lib/csv';
import { toast } from '~/lib/toast';

type Kind = 'items' | 'ingredients';

type ImportRow = Record<string, string | number | undefined>;

type ImportResult = {
  created: number;
  skipped: number;
  errors: Array<{ row: number; name: string; reason: string }>;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: Kind;
  onImport: (rows: ImportRow[]) => Promise<ImportResult>;
};

// Header aliases per kind. The first entry of each tuple is the canonical
// field; the rest are case-insensitive aliases accepted in the CSV header.
const ITEM_HEADERS = {
  name: ['name', 'nama'],
  category: ['category', 'kategori'],
  price: ['price', 'priceidr', 'harga'],
  barcode: ['barcode'],
} as const;

const INGREDIENT_HEADERS = {
  name: ['name', 'nama'],
  unit: ['unit', 'satuan'],
  reorder: ['reorder', 'reorderthreshold', 'ambang'],
  cost: ['cost', 'lastcostperunitidr', 'biaya'],
} as const;

/** Build a map from canonical field key -> column index, matching the parsed
 *  header row against the alias lists (case-insensitive, trimmed). */
function buildHeaderMap(
  header: string[],
  aliases: Record<string, readonly string[]>
): Record<string, number> {
  const normalized = header.map((h) => h.trim().toLowerCase());
  const map: Record<string, number> = {};
  for (const [key, names] of Object.entries(aliases)) {
    const idx = normalized.findIndex((h) => names.includes(h));
    if (idx !== -1) map[key] = idx;
  }
  return map;
}

function cell(row: string[], idx: number | undefined): string {
  if (idx === undefined) return '';
  return (row[idx] ?? '').trim();
}

export function CsvImportDialog({ open, onOpenChange, kind, onImport }: Props) {
  const { t } = useLingui();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [parsedAny, setParsedAny] = useState(false);
  const [missingColumns, setMissingColumns] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const aliases = kind === 'items' ? ITEM_HEADERS : INGREDIENT_HEADERS;
  const required =
    kind === 'items'
      ? ['name', 'category', 'price']
      : ['name', 'unit', 'reorder'];

  const previewColumns =
    kind === 'items'
      ? ([t`Nama`, t`Kategori`, t`Harga`, t`Barcode`] as const)
      : ([t`Nama`, t`Satuan`, t`Ambang`, t`Biaya`] as const);

  function reset() {
    setFileName('');
    setRows([]);
    setParsedAny(false);
    setMissingColumns([]);
    setResult(null);
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleClose(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleFile(file: File) {
    setResult(null);
    setMissingColumns([]);
    setFileName(file.name);
    let text: string;
    try {
      text = await file.text();
    } catch {
      toast.error(t`Gagal membaca file.`);
      return;
    }
    const parsed = parseCSV(text);
    setParsedAny(true);
    if (parsed.length === 0) {
      setRows([]);
      return;
    }
    const header = parsed[0] ?? [];
    const dataRows = parsed.slice(1);
    const map = buildHeaderMap(header, aliases);
    const missing = required.filter((key) => map[key] === undefined);
    if (missing.length > 0) {
      setRows([]);
      setMissingColumns(missing);
      return;
    }

    const mapped: ImportRow[] = [];
    for (const dataRow of dataRows) {
      const isEmpty = dataRow.every((c) => c.trim() === '');
      if (isEmpty) continue;
      if (kind === 'items') {
        const name = cell(dataRow, map.name);
        const category = cell(dataRow, map.category);
        const price = cell(dataRow, map.price);
        const barcode = cell(dataRow, map.barcode);
        mapped.push({
          name,
          category,
          priceIDR: Number(price),
          ...(barcode ? { barcode } : {}),
        });
      } else {
        const name = cell(dataRow, map.name);
        const unit = cell(dataRow, map.unit);
        const reorder = cell(dataRow, map.reorder);
        const cost = cell(dataRow, map.cost);
        mapped.push({
          name,
          unit,
          reorderThreshold: Number(reorder),
          ...(cost !== '' ? { lastCostPerUnitIDR: Number(cost) } : {}),
        });
      }
    }
    setRows(mapped);
  }

  async function handleImport() {
    setImporting(true);
    try {
      const res = await onImport(rows);
      setResult(res);
      toast.success(
        t`${res.created} dibuat, ${res.skipped} dilewati, ${res.errors.length} gagal`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t`Gagal mengimpor.`);
    } finally {
      setImporting(false);
    }
  }

  function handleDownloadTemplate() {
    if (kind === 'items') {
      const csv = toCSV(
        [{ name: 'Kopi Susu', category: 'Minuman', price: 18000, barcode: '' }],
        [
          { key: 'name', header: 'name' },
          { key: 'category', header: 'category' },
          { key: 'price', header: 'price' },
          { key: 'barcode', header: 'barcode' },
        ]
      );
      downloadCSV('template-item-menu.csv', csv);
    } else {
      const csv = toCSV(
        [{ name: 'Susu', unit: 'ml', reorder: 1000, cost: 25 }],
        [
          { key: 'name', header: 'name' },
          { key: 'unit', header: 'unit' },
          { key: 'reorder', header: 'reorder' },
          { key: 'cost', header: 'cost' },
        ]
      );
      downloadCSV('template-bahan.csv', csv);
    }
  }

  const previewRows = rows.slice(0, 8);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {kind === 'items' ? (
              <Trans>Impor item menu</Trans>
            ) : (
              <Trans>Impor bahan</Trans>
            )}
          </DialogTitle>
          <DialogDescription>
            {kind === 'items' ? (
              <Trans>
                Unggah file CSV dengan kolom name, category, price, dan barcode
                (opsional).
              </Trans>
            ) : (
              <Trans>
                Unggah file CSV dengan kolom name, unit, reorder, dan cost
                (opsional).
              </Trans>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload />
              <Trans>Pilih file CSV</Trans>
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleDownloadTemplate}
            >
              <FileSpreadsheet />
              <Trans>Unduh template</Trans>
            </Button>
            {fileName ? (
              <span className="text-sm text-muted-foreground truncate">
                {fileName}
              </span>
            ) : null}
          </div>

          {/* Result summary takes precedence once an import has run. */}
          {result ? (
            <div className="flex flex-col gap-2 rounded-md border p-4">
              <p className="text-sm font-medium">
                <Trans>
                  {result.created} dibuat, {result.skipped} dilewati,{' '}
                  {result.errors.length} gagal
                </Trans>
              </p>
              {result.errors.length > 0 ? (
                <ul className="text-sm text-muted-foreground space-y-1">
                  {result.errors.slice(0, 5).map((e) => (
                    <li key={`${e.row}-${e.name}`}>
                      <Trans>
                        Baris {e.row + 1} · {e.name}: {e.reason}
                      </Trans>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : missingColumns.length > 0 ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm">
              <Trans>
                Kolom wajib tidak ditemukan: {missingColumns.join(', ')}
              </Trans>
            </div>
          ) : parsedAny && rows.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileSpreadsheet />
                </EmptyMedia>
                <EmptyTitle>
                  <Trans>Tidak ada baris untuk diimpor.</Trans>
                </EmptyTitle>
                <EmptyDescription>
                  <Trans>
                    File kosong atau hanya berisi baris header. Periksa lalu coba
                    lagi.
                  </Trans>
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : rows.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                <Trans>{rows.length} baris siap diimpor</Trans>
              </p>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {previewColumns.map((col) => (
                        <TableHead key={col}>{col}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row, i) => (
                      <TableRow key={i}>
                        {kind === 'items' ? (
                          <>
                            <TableCell>{String(row.name ?? '')}</TableCell>
                            <TableCell>{String(row.category ?? '')}</TableCell>
                            <TableCell className="tabular-nums">
                              {String(row.priceIDR ?? '')}
                            </TableCell>
                            <TableCell>{String(row.barcode ?? '')}</TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell>{String(row.name ?? '')}</TableCell>
                            <TableCell>{String(row.unit ?? '')}</TableCell>
                            <TableCell className="tabular-nums">
                              {String(row.reorderThreshold ?? '')}
                            </TableCell>
                            <TableCell className="tabular-nums">
                              {String(row.lastCostPerUnitIDR ?? '')}
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          {result ? (
            <Button type="button" onClick={() => handleClose(false)}>
              <Trans>Selesai</Trans>
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
              >
                <Trans>Batal</Trans>
              </Button>
              <Button
                type="button"
                disabled={rows.length === 0 || importing}
                onClick={handleImport}
              >
                <Trans>Impor</Trans>
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
