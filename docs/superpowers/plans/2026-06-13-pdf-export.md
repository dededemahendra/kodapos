# PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). Read-only export, low risk.

**Goal:** Downloadable, formatted PDF export for the reports (alongside the existing CSV) and for a purchase order (to send a supplier). A reusable `exportTablePdf` helper that pairs with the existing `toCSV` `(rows, columns)` shape.

**Copy rules (project):** UI Bahasa via the catalog; **no em-dash `—`/`--`**; PDF document content English (mirrors the receipt convention — a generated document, off-catalog). Empty states unaffected.

**Dependency:** `jspdf` + `jspdf-autotable`, imported DYNAMICALLY inside the click handler so SSR/Workers never load them.

---

## File Structure
- **Create:** `src/lib/pdf.ts` (the helper).
- **Modify:** `package.json` (deps), the report pages that have a CSV button (`src/routes/_pos/reports/{profit-loss,export,sales,products,margin,expenses,other-income,payments,cashiers}.tsx`), `src/components/inventory/purchase-order-detail.tsx`.
- **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: PDF helper + dependency
**Files:** create `src/lib/pdf.ts`; modify `package.json`.

READ: `src/lib/csv.ts` (`CSVColumn` = `{ key, header }`, `toCSV(rows, columns)`) — match this shape so each report can reuse its existing `columns`/`rows`. The jsPDF + jspdf-autotable API (`new jsPDF()`, `autoTable(doc, { head, body, foot })`, `doc.save(name)`); in v3 autotable is `import autoTable from 'jspdf-autotable'; autoTable(doc, {...})`.

- [ ] **Step 1: deps** — `pnpm add jspdf jspdf-autotable`. Confirm they install + are importable.
- [ ] **Step 2: `src/lib/pdf.ts`** — `export type PdfColumn = { key: string; header: string }` and:
  ```ts
  export async function exportTablePdf(opts: {
    filename: string;
    title: string;            // document title (English)
    subtitle?: string;        // e.g. cafe name + date range
    columns: PdfColumn[];
    rows: Array<Record<string, string | number | undefined>>;
    footRows?: Array<Array<string | number>>;  // e.g. totals row(s)
    numericKeys?: string[];   // right-align these columns
  }): Promise<void>
  ```
  Implement with a DYNAMIC import: `const { jsPDF } = await import('jspdf'); const { default: autoTable } = await import('jspdf-autotable');`. Build an A4 doc; print `title` (bold, ~16pt) + `subtitle` (grey, ~10pt) at the top; `autoTable(doc, { startY, head: [columns.map(c=>c.header)], body: rows.map(r => columns.map(c => String(r[c.key] ?? ''))), foot: footRows, styles, headStyles, columnStyles for numericKeys halign:'right' })`; `doc.save(filename)`. Pure formatting; no app imports. Keep it small.
- [ ] **Step 3:** `pnpm typecheck` PASS (a render test is not feasible for binary PDF output; rely on typecheck). Commit:
  `git add src/lib/pdf.ts package.json pnpm-lock.yaml && git commit -m "feat(export): reusable exportTablePdf helper (jsPDF, dynamic import)"`

---

### Task 2: Wire "Unduh PDF" on reports + the purchase order
**Files:** modify the report pages with a CSV button + `src/components/inventory/purchase-order-detail.tsx`.

READ: one report page's existing CSV button (e.g. `profit-loss.tsx` ~line 60-78, `export.tsx`) to see the `columns`/`rows` already built for CSV — reuse them for PDF. `src/lib/money` `formatIDR`. `purchase-order-detail.tsx` (the `api.purchaseOrders.get` detail: supplier, status, lines `{ ingredientName, unit, orderedQty, receivedQty, unitCostIDR, remainingQty }`, totals).

- [ ] **Step 1: reports** — for each report page that has a "Unduh CSV" button, add a sibling "Unduh PDF" `Button` (outline) that calls `exportTablePdf` with the SAME `columns`/`rows` already built for the CSV, a `title` (English report name, e.g. "Profit and Loss", "Ledger", "Sales", "Products", "Margin", "Expenses", "Other income", "Payments", "Cashiers"), a `subtitle` = cafe name + the date range (`fromKey` to `toKey`, use the word "to" not a dash), `numericKeys` = the IDR/qty columns, and `footRows` for the totals where the page shows one. Pages: profit-loss, export (ledger), sales, products, margin, expenses, other-income, payments, cashiers. (For profit-loss/statement style, build the rows from the same `lines` array used for the CSV.)
- [ ] **Step 2: purchase order** — `purchase-order-detail.tsx`: add an "Unduh PDF" button in the detail header → `exportTablePdf({ filename: 'pesanan-beli.pdf', title: 'Purchase order', subtitle: '{supplierName} · {date}', columns: [Ingredient, Ordered, Received, Remaining, Unit cost, Line total], rows: lines mapped (qty + unit, formatIDR(unitCostIDR), formatIDR(orderedQty*unitCostIDR)), footRows: [['', '', '', '', 'Total', formatIDR(orderedTotal)]], numericKeys: [...] })`. English document content.
- [ ] **Step 3:** `pnpm typecheck` + `pnpm test` PASS. Commit:
  `git add src/routes/_pos/reports/*.tsx src/components/inventory/purchase-order-detail.tsx && git commit -m "feat(export): Unduh PDF on reports + purchase order"`

UI button label Bahasa (`Unduh PDF`); the PDF document text itself is English. No em-dash/`--` (use "to" / "·" in the subtitle, formatIDR for money).

---

### Task 3: i18n
New BI: `Unduh PDF` (+ any other new UI empties). The PDF document strings are English/off-catalog (built in the page via literals passed to `exportTablePdf`).
- [ ] `pnpm lingui:extract`; fill `en` (`Download PDF`) for every new empty (no em-dash); `pnpm lingui:compile` → en 0 missing. Commit `src/locales`.

---

### Task 4: Final verification
- [ ] `pnpm typecheck` PASS; `pnpm test` PASS; `pnpm lingui:compile` en 0 missing; clean tree.
- [ ] **Manual sanity:** on the P&L report, "Unduh PDF" downloads a formatted PDF with the title, cafe + range subtitle, the statement rows, and the net line; the accounting ledger + a couple other reports export; the purchase order detail downloads a supplier-ready PDF with the line table + total. CSV still works.

---

## Self-Review
**Spec coverage:** jsPDF dep + reusable `exportTablePdf` (T1); PDF buttons on all CSV reports + the PO detail (T2); i18n (T3). ✓
**Placeholder scan:** "reuse the page's existing CSV columns/rows". Else spec code.
**Type consistency:** `exportTablePdf({ filename, title, subtitle?, columns: PdfColumn[], rows, footRows?, numericKeys? })` reuses the `toCSV` `(rows, columns)` shape; dynamic import keeps it client-only. Document English, button Bahasa, no em-dash. ✓
