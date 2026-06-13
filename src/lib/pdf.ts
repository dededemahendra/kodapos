export type PdfColumn = { key: string; header: string };

/** Client-only, formatted PDF table export. Pairs with `toCSV(rows, columns)`
 *  so a report page can reuse its existing `columns`/`rows`. jspdf +
 *  jspdf-autotable are imported DYNAMICALLY so SSR/Workers never load them. */
export async function exportTablePdf(opts: {
  filename: string;
  title: string;
  subtitle?: string;
  columns: PdfColumn[];
  rows: Array<Record<string, string | number | undefined>>;
  footRows?: Array<Array<string | number>>;
  numericKeys?: string[];
}): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const autoTableMod = await import('jspdf-autotable');
  const autoTable = autoTableMod.default;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const marginX = 40;
  let headerBottom = 48;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(20, 20, 20);
  doc.text(opts.title, marginX, headerBottom);

  if (opts.subtitle) {
    headerBottom += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text(opts.subtitle, marginX, headerBottom);
  }

  // Right-align the numeric columns by their index in `columns`.
  const numericKeys = opts.numericKeys ?? [];
  const columnStyles: Record<number, { halign: 'right' }> = {};
  opts.columns.forEach((c, i) => {
    if (numericKeys.includes(c.key)) columnStyles[i] = { halign: 'right' };
  });

  autoTable(doc, {
    startY: headerBottom + 16,
    head: [opts.columns.map((c) => c.header)],
    body: opts.rows.map((r) => opts.columns.map((c) => String(r[c.key] ?? ''))),
    ...(opts.footRows && opts.footRows.length
      ? { foot: opts.footRows.map((fr) => fr.map(String)) }
      : {}),
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [33, 33, 33] },
    footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
    columnStyles,
  });

  doc.save(opts.filename);
}
