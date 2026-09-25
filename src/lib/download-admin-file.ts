/**
 * Admin routes authenticate via the `x-admin-secret` header, never a query
 * param (see lib/admin-auth.ts) — a plain `<a href>` download link can't
 * attach that header, so exports are fetched here instead and handed to
 * the browser as a Blob, keeping the secret out of the URL/history/logs
 * exactly like every other admin request in this app.
 */
export async function downloadAdminFile(url: string, secret: string, fallbackFilename: string): Promise<void> {
  const res = await fetch(url, { headers: { "x-admin-secret": secret } });
  if (!res.ok) throw new Error("Export failed.");
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] ?? fallbackFilename;

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
