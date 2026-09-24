import { normalizeXHandle } from "./x-handle";

export const BATTLE_PITCH_MAX = 120;
export const WHY_US_MAX = 160;
export const DIFFERENTIATOR_MAX = 60;
export const MAX_DIFFERENTIATORS = 3;

export interface BattleFields {
  battle_pitch: string | null;
  why_us: string | null;
  differentiators: string[];
  x_handle: string | null;
}

/**
 * Validates the optional Battle Pitch / X handle fields shared by product
 * submission (POST /api/products) and editing (PATCH /api/products/[id]).
 * Every field is optional — omitting one leaves the product falling back to
 * its plain `pitch` in the UI. Returns `{ error }` on the first invalid
 * field, or the normalized values ready to write to the DB.
 */
export type BattleFieldsResult =
  | { ok: false; error: string }
  | { ok: true; fields: BattleFields };

export function parseBattleFields(body: Record<string, unknown>): BattleFieldsResult {
  let battle_pitch: string | null = null;
  if (typeof body.battlePitch === "string" && body.battlePitch.trim()) {
    const trimmed = body.battlePitch.trim();
    if (trimmed.length > BATTLE_PITCH_MAX) {
      return { ok: false, error: `Battle Pitch must be ${BATTLE_PITCH_MAX} characters or fewer.` };
    }
    battle_pitch = trimmed;
  }

  let why_us: string | null = null;
  if (typeof body.whyUs === "string" && body.whyUs.trim()) {
    const trimmed = body.whyUs.trim();
    if (trimmed.length > WHY_US_MAX) {
      return { ok: false, error: `Why Us must be ${WHY_US_MAX} characters or fewer.` };
    }
    why_us = trimmed;
  }

  let differentiators: string[] = [];
  if (body.differentiators !== undefined) {
    if (!Array.isArray(body.differentiators)) {
      return { ok: false, error: "Differentiators must be a list." };
    }
    const cleaned = body.differentiators
      .filter((d): d is string => typeof d === "string")
      .map((d) => d.trim())
      .filter(Boolean);
    if (cleaned.length > MAX_DIFFERENTIATORS) {
      return { ok: false, error: `Add at most ${MAX_DIFFERENTIATORS} differentiators.` };
    }
    if (cleaned.some((d) => d.length > DIFFERENTIATOR_MAX)) {
      return { ok: false, error: `Each differentiator must be ${DIFFERENTIATOR_MAX} characters or fewer.` };
    }
    differentiators = cleaned;
  }

  let x_handle: string | null = null;
  if (typeof body.xHandle === "string" && body.xHandle.trim()) {
    const normalized = normalizeXHandle(body.xHandle);
    if (!normalized) {
      return {
        ok: false,
        error: "Enter a valid X handle (letters, numbers, underscore, max 15 characters).",
      };
    }
    x_handle = normalized;
  }

  return { ok: true, fields: { battle_pitch, why_us, differentiators, x_handle } };
}

/**
 * Same validation as parseBattleFields, but for PATCH: only fields actually
 * present in the request body are included in the returned patch, so a
 * partial edit never clobbers fields the caller didn't touch. Sending a
 * field as an empty string/array explicitly clears it.
 */
export type BattleFieldsPatchResult =
  | { ok: false; error: string }
  | { ok: true; patch: Partial<BattleFields> };

export function parseBattleFieldsPatch(body: Record<string, unknown>): BattleFieldsPatchResult {
  const patch: Partial<BattleFields> = {};

  if ("battlePitch" in body) {
    const raw = body.battlePitch;
    if (raw !== null && typeof raw !== "string") return { ok: false, error: "Invalid Battle Pitch." };
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (trimmed.length > BATTLE_PITCH_MAX) {
      return { ok: false, error: `Battle Pitch must be ${BATTLE_PITCH_MAX} characters or fewer.` };
    }
    patch.battle_pitch = trimmed || null;
  }

  if ("whyUs" in body) {
    const raw = body.whyUs;
    if (raw !== null && typeof raw !== "string") return { ok: false, error: "Invalid Why Us." };
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (trimmed.length > WHY_US_MAX) {
      return { ok: false, error: `Why Us must be ${WHY_US_MAX} characters or fewer.` };
    }
    patch.why_us = trimmed || null;
  }

  if ("differentiators" in body) {
    if (!Array.isArray(body.differentiators)) {
      return { ok: false, error: "Differentiators must be a list." };
    }
    const cleaned = body.differentiators
      .filter((d): d is string => typeof d === "string")
      .map((d) => d.trim())
      .filter(Boolean);
    if (cleaned.length > MAX_DIFFERENTIATORS) {
      return { ok: false, error: `Add at most ${MAX_DIFFERENTIATORS} differentiators.` };
    }
    if (cleaned.some((d) => d.length > DIFFERENTIATOR_MAX)) {
      return { ok: false, error: `Each differentiator must be ${DIFFERENTIATOR_MAX} characters or fewer.` };
    }
    patch.differentiators = cleaned;
  }

  if ("xHandle" in body) {
    const raw = body.xHandle;
    if (raw !== null && typeof raw !== "string") return { ok: false, error: "Invalid X handle." };
    if (!raw || !raw.trim()) {
      patch.x_handle = null;
    } else {
      const normalized = normalizeXHandle(raw);
      if (!normalized) {
        return {
          ok: false,
          error: "Enter a valid X handle (letters, numbers, underscore, max 15 characters).",
        };
      }
      patch.x_handle = normalized;
    }
  }

  return { ok: true, patch };
}
