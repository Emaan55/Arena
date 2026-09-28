import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CATEGORIES, type Category, type Database, type Product } from "@/types/database";
import { generateEditToken, hashEditToken } from "./edit-token";
import { parseBattleFields, type BattleFields } from "./product-fields";
import { normalizeUrl } from "./url";
import { resolveAndStoreProductFavicon } from "./favicon-service";
import { isFaviconTrackingReady, pairUnmatchedProducts, logActivity, markStaleWaitingProductsUnique } from "./arena";

type AdminClient = SupabaseClient<Database>;

const MIN_FILL_TIME_MS = 1200;

export interface ProductSubmissionFields extends BattleFields {
  name: string;
  url: string;
  category: Category;
  pitch: string;
}

export type SubmissionValidationResult =
  | { ok: true; fields: ProductSubmissionFields }
  | { ok: false; error: string; status: number };

/**
 * The single validation path for every way a product can enter the arena
 * (free-earned submission, paid $1 checkout, admin panel) — each caller
 * decides which raw request body to hand in and whether the honeypot/
 * fill-time bot checks apply (they don't for the paid or admin path,
 * which have their own much stronger gates: a real payment, or admin
 * auth). Returns normalized, DB-ready fields on success.
 */
export function validateProductSubmission(
  record: Record<string, unknown>,
  opts: { checkHoneypot?: boolean } = {},
): SubmissionValidationResult {
  const { name, url, category, pitch, website, renderedAt } = record;

  if (opts.checkHoneypot) {
    // Honeypot: a real user never sees or fills this field.
    if (typeof website === "string" && website.trim() !== "") {
      return { ok: false, error: "Could not submit product. Please try again.", status: 400 };
    }
    // A form submitted faster than a human could plausibly fill it out.
    if (typeof renderedAt !== "number" || Date.now() - renderedAt < MIN_FILL_TIME_MS) {
      return { ok: false, error: "Could not submit product. Please try again.", status: 400 };
    }
  }

  if (typeof name !== "string" || !name.trim() || name.trim().length > 80) {
    return { ok: false, error: "Product name is required (max 80 characters).", status: 400 };
  }
  if (typeof pitch !== "string" || !pitch.trim() || pitch.trim().length > 140) {
    return { ok: false, error: "One-line pitch is required (max 140 characters).", status: 400 };
  }
  if (typeof category !== "string" || !CATEGORIES.includes(category as Category)) {
    return { ok: false, error: "Invalid category.", status: 400 };
  }
  if (typeof url !== "string") {
    return { ok: false, error: "URL is required.", status: 400 };
  }
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) {
    return { ok: false, error: "Please enter a valid URL.", status: 400 };
  }

  const battleFields = parseBattleFields(record);
  if (!battleFields.ok) {
    return { ok: false, error: battleFields.error, status: 400 };
  }

  return {
    ok: true,
    fields: {
      name: name.trim(),
      url: normalizedUrl,
      category: category as Category,
      pitch: pitch.trim(),
      ...battleFields.fields,
    },
  };
}

export type CreateProductResult =
  | { ok: true; product: Product; editToken: string }
  | { ok: false; error: string; status: number };

/**
 * The single product-creation path — same insert, favicon discovery,
 * activity log, pairing, and stale-uncontested sweep every submission has
 * always gone through, now shared by all three ways a product can enter
 * the arena (earned-free, paid $1, admin panel) instead of being
 * duplicated per caller.
 */
export async function createArenaProduct(
  admin: AdminClient,
  fields: ProductSubmissionFields,
): Promise<CreateProductResult> {
  const { data: existing } = await admin
    .from("products")
    .select("id")
    .ilike("url", fields.url)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return { ok: false, error: "This product has already been submitted to the arena.", status: 409 };
  }

  const editToken = generateEditToken();

  const { data: product, error } = await admin
    .from("products")
    .insert({
      name: fields.name,
      url: fields.url,
      pitch: fields.pitch,
      category: fields.category,
      status: "active",
      wins: 0,
      is_defending: false,
      battle_pitch: fields.battle_pitch,
      why_us: fields.why_us,
      differentiators: fields.differentiators,
      x_handle: fields.x_handle,
      edit_token_hash: hashEditToken(editToken),
    })
    .select()
    .single();

  if (error || !product) {
    return { ok: false, error: "Could not submit product. Please try again.", status: 500 };
  }

  // Auto favicon discovery — see the identical comment in the previous
  // version of POST /api/products; guarded so a submission still succeeds
  // normally if migration 0012 hasn't been run yet.
  if (await isFaviconTrackingReady(admin)) {
    const result = await resolveAndStoreProductFavicon(admin, product.id, fields.url);
    const nowIso = new Date().toISOString();
    if (result.status === "success" && result.logoUrl) {
      await admin
        .from("products")
        .update({ logo_url: result.logoUrl, logo_status: "success", logo_source: result.source, logo_checked_at: nowIso, logo_attempts: 1 })
        .eq("id", product.id);
      product.logo_url = result.logoUrl;
    } else {
      await admin
        .from("products")
        .update({
          logo_status: result.status,
          logo_checked_at: nowIso,
          logo_attempts: 1,
          logo_next_attempt_at: new Date(Date.now() + 30_000).toISOString(),
        })
        .eq("id", product.id);
    }
  }

  await logActivity(admin, `🆕 ${product.name} just entered the arena in ${fields.category}`);
  await pairUnmatchedProducts(admin, fields.category);
  await markStaleWaitingProductsUnique(admin);

  return { ok: true, product, editToken };
}
