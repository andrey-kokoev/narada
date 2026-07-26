type AnyRecord = Record<string, any>;

export function renderTable(headers: string[], rows: unknown[][]): string {
  const maxWidths = [24, 30, 72, 8, 8, 7, 72];
  const formattedRows = rows.map((row) => row.map((cell, index) => formatTableCell(cell, maxWidths[index])));
  const formattedHeaders = headers.map((header, index) => formatTableCell(header, maxWidths[index]));
  const widths = formattedHeaders.map((header, index) => Math.max(
    header.length,
    ...formattedRows.map((row) => String(row[index] ?? '').length),
  ));
  const renderRow = (row: unknown[]) => row.map((cell, index) => String(cell ?? '').padEnd(widths[index])).join('  ');
  return [
    renderRow(formattedHeaders),
    renderRow(widths.map((width) => '-'.repeat(width))),
    ...formattedRows.map(renderRow),
  ].join('\n');
}

export function formatTableCell(value: any, maxWidth: number = 80): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxWidth) return text;
  return `${text.slice(0, Math.max(0, maxWidth - 1))}…`;
}
