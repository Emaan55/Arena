import "server-only";

/**
 * Minimal RFC 4180-ish CSV builder — quotes a field only when it actually
 * contains a comma, quote, or newline, doubling any embedded quotes.
 * There's no CSV library already in this codebase, and admin exports here
 * are small enough (a founder's own campaign/submission counts) that
 * pulling one in isn't worth it.
 */
export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const escape = (v: string | number | null | undefined): string => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) lines.push(row.map(escape).join(","));
  return lines.join("\r\n");
}

export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
