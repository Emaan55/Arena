import type { SubmissionStatus } from "@/types/database";

// Same limits as the single-add route (src/app/api/admin/get-listed/campaigns/[id]/submissions/route.ts)
// — kept in sync by hand since this module has no server-only imports and
// is shared by both the client preview and the server-side import route.
const NAME_MAX = 120;
const URL_MAX = 300;
export const MAX_IMPORT_ROWS = 500;

const HEADER_NAME_TOKENS = new Set(["directory", "directory name", "name", "product", "site"]);

const STATUS_ALIASES: Record<string, SubmissionStatus> = {
  pending: "pending",
  submitted: "submitted",
  applied: "submitted",
  accepted: "accepted",
  approved: "accepted",
  live: "accepted",
  listed: "accepted",
  published: "accepted",
  rejected: "rejected",
  declined: "rejected",
  denied: "rejected",
};

export interface ParsedImportRow {
  lineNumber: number;
  raw: string;
  directoryName: string;
  directoryUrl: string | null;
  status: SubmissionStatus;
  listingUrl: string | null;
  valid: boolean;
  error?: string;
  warning?: string;
}

function stripQuotes(field: string): string {
  if (field.length >= 2 && field.startsWith('"') && field.endsWith('"')) {
    return field.slice(1, -1).replace(/""/g, '"');
  }
  return field;
}

// Comma-separated is the only one of the three formats where the delimiter
// can plausibly appear inside a quoted field (a directory description with
// a comma in it) — tab and pipe are treated as literal splits since they
// virtually never appear inside a pasted directory name or URL.
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function splitLine(line: string): string[] {
  if (line.includes("\t")) return line.split("\t");
  if (line.includes("|")) return line.split("|");
  if (line.includes(",")) return splitCsvLine(line);
  // "Reasonably structured plain text" with no recognizable delimiter —
  // treat the whole line as just a directory name.
  return [line];
}

function normalizeStatus(raw: string): { status: SubmissionStatus; recognized: boolean } {
  const key = raw.trim().toLowerCase();
  if (!key) return { status: "pending", recognized: true };
  const mapped = STATUS_ALIASES[key];
  if (mapped) return { status: mapped, recognized: true };
  return { status: "pending", recognized: false };
}

/**
 * Parses pasted raw directory data (CSV / tab-separated / pipe-separated /
 * plain text, one directory per line) into rows shaped like the
 * `submissions` table already expects. Pure and side-effect free so it can
 * run identically in the browser (for a live preview as the admin types)
 * and on the server (as the single source of truth before insert) — same
 * "one calculation, many consumers" pattern as getAnnotatedCampaigns and
 * getCustomerCampaignReport elsewhere in this codebase.
 *
 * Blank lines are silently dropped. A first row that looks like a header
 * (e.g. "Directory, URL, Status") is skipped. Every other non-blank line
 * becomes a row, valid or not — invalid rows are returned (not thrown)
 * so the caller can show exactly why a given line didn't import.
 */
export function parseRawSubmissions(text: string): ParsedImportRow[] {
  const lines = text.split(/\r?\n/);
  const rows: ParsedImportRow[] = [];
  let sawFirstNonBlank = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmedLine = lines[i].trim();
    if (!trimmedLine) continue;

    const fields = splitLine(trimmedLine).map((f) => stripQuotes(f.trim()));

    if (!sawFirstNonBlank) {
      sawFirstNonBlank = true;
      if (HEADER_NAME_TOKENS.has((fields[0] ?? "").toLowerCase())) continue;
    }

    const [nameRaw, urlRaw, statusRaw, listingRaw] = fields;
    const directoryName = (nameRaw ?? "").trim();

    if (!directoryName) {
      rows.push({
        lineNumber: i + 1,
        raw: trimmedLine,
        directoryName: "",
        directoryUrl: null,
        status: "pending",
        listingUrl: null,
        valid: false,
        error: "Missing directory name.",
      });
      continue;
    }
    if (directoryName.length > NAME_MAX) {
      rows.push({
        lineNumber: i + 1,
        raw: trimmedLine,
        directoryName,
        directoryUrl: null,
        status: "pending",
        listingUrl: null,
        valid: false,
        error: `Directory name too long (max ${NAME_MAX}).`,
      });
      continue;
    }

    let directoryUrl: string | null = (urlRaw ?? "").trim() || null;
    let warning: string | undefined;
    if (directoryUrl && directoryUrl.length > URL_MAX) {
      warning = "Directory URL too long, dropped.";
      directoryUrl = null;
    }

    let listingUrl: string | null = (listingRaw ?? "").trim() || null;
    if (listingUrl && listingUrl.length > URL_MAX) {
      warning = warning ? `${warning} Listing URL too long, dropped.` : "Listing URL too long, dropped.";
      listingUrl = null;
    }

    const { status, recognized } = normalizeStatus(statusRaw ?? "");
    if (!recognized && statusRaw?.trim()) {
      const note = `Unrecognized status "${statusRaw.trim()}", defaulted to pending.`;
      warning = warning ? `${warning} ${note}` : note;
    }

    rows.push({ lineNumber: i + 1, raw: trimmedLine, directoryName, directoryUrl, status, listingUrl, valid: true, warning });
  }

  return rows;
}
