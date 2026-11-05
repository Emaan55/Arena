import { CATEGORIES, type Category } from "@/types/database";

export interface AutofillDetails { name: string; url: string; category: Category; pitch: string; xHandle: string; battlePitch: string }
export interface AutofillEvidence { url: string; names: string[]; descriptions: string[]; text: string; xHandle: string }
export interface AutofillResult { fields: AutofillDetails; source: "metadata" | "ai"; notice: string }
export const AI_DETAILS_SCHEMA = {
  type: "object", additionalProperties: false, required: ["name", "pitch", "category", "battlePitch"],
  properties: { name: { type: "string", maxLength: 80 }, pitch: { type: "string", maxLength: 140 },
    category: { type: "string", enum: [...CATEGORIES] }, battlePitch: { type: "string", maxLength: 120 } },
};
/** AI may select source phrases, but cannot add unsupported product claims or social handles. */
export function validateAutofillAI(value: unknown, evidence: AutofillEvidence): Omit<AutofillDetails, "url" | "xHandle"> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== "battlePitch,category,name,pitch") return null;
  for (const [key, limit] of Object.entries({ name: 80, pitch: 140, battlePitch: 120 })) {
    if (typeof record[key] !== "string" || (record[key] as string).length > limit || /[\u0000-\u001f<>]/.test(record[key] as string)) return null;
  }
  if (!CATEGORIES.includes(record.category as Category)) return null;
  const source = [...evidence.names, ...evidence.descriptions, evidence.text].join(" ").replace(/\s+/g, " ").toLowerCase();
  for (const key of ["name", "pitch", "battlePitch"]) {
    const phrase = (record[key] as string).trim();
    if (phrase && !source.includes(phrase.toLowerCase())) return null;
  }
  return { name: (record.name as string).trim(), pitch: (record.pitch as string).trim(), category: record.category as Category, battlePitch: (record.battlePitch as string).trim() };
}
