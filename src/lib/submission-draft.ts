import { CATEGORIES, type Category } from "@/types/database";
import { normalizeUrl } from "./url";
import { parseBattleFields } from "./product-fields";

export interface SubmissionDraft {
  name: string; url: string; category: Category; pitch: string; xHandle: string;
  battlePitch: string; whyUs: string; differentiators: string[];
}
export interface SavedSubmissionDraft { fields: SubmissionDraft; step: 1 | 2; expanded: boolean }
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
export const draftKey = (userId: string) => `arena:submission-draft:v1:${userId}`;
export function emptySubmissionDraft(category: Category = "General"): SubmissionDraft {
  return { name: "", url: "", category, pitch: "", xHandle: "", battlePitch: "", whyUs: "", differentiators: ["", "", ""] };
}
export function productDetailsError(fields: SubmissionDraft): string | null {
  if (!fields.name.trim() || fields.name.trim().length > 80) return "Product name is required (max 80 characters).";
  if (!normalizeUrl(fields.url)) return "Please enter a valid URL.";
  if (!CATEGORIES.includes(fields.category)) return "Invalid category.";
  if (!fields.pitch.trim() || fields.pitch.trim().length > 140) return "One-line pitch is required (max 140 characters).";
  const optional = parseBattleFields({ ...fields });
  return optional.ok ? null : optional.error;
}
/** Only editable product fields are stored. Never persist auth, payment or eligibility state. */
export function decodeSubmissionDraft(raw: string | null, now = Date.now()): SavedSubmissionDraft | null {
  try {
    if (!raw || raw.length > 12000) return null;
    const saved = JSON.parse(raw);
    if (saved.version !== 1 || typeof saved.savedAt !== "number" || saved.savedAt > now || now - saved.savedAt >= DRAFT_TTL_MS) return null;
    const fields = emptySubmissionDraft();
    for (const [key, limit] of Object.entries({ name: 80, url: 2048, pitch: 140, xHandle: 200, battlePitch: 120, whyUs: 160 })) {
      if (typeof saved.fields?.[key] !== "string" || saved.fields[key].length > limit) return null;
      Object.assign(fields, { [key]: saved.fields[key] });
    }
    if (!CATEGORIES.includes(saved.fields?.category)) return null;
    fields.category = saved.fields.category;
    if (!Array.isArray(saved.fields?.differentiators) || saved.fields.differentiators.length !== 3 || saved.fields.differentiators.some((d: unknown) => typeof d !== "string" || d.length > 60)) return null;
    fields.differentiators = saved.fields.differentiators;
    return { fields, step: saved.step === 2 && !productDetailsError(fields) ? 2 : 1, expanded: saved.expanded === true };
  } catch { return null; }
}
export function encodeSubmissionDraft(draft: SavedSubmissionDraft, now = Date.now()): string {
  return JSON.stringify({ version: 1, savedAt: now, ...draft });
}
