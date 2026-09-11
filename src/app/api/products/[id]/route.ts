import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hashEditToken } from "@/lib/edit-token";
import { isWithinEditWindow } from "@/lib/edit-window";
import { parseBattleFieldsPatch } from "@/lib/product-fields";
import { getClientIp } from "@/lib/fingerprint";
import { rateLimit } from "@/lib/rate-limit";
import type { Product } from "@/types/database";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PITCH_MAX = 140;

/**
 * Lets a submitter edit their product's Battle Pitch / Why Us /
 * Differentiators / X handle / one-line pitch after the fact, authenticated
 * by the one-time edit token they were handed at submission (see
 * POST /api/products) — the same hash-and-compare pattern used for vote
 * fingerprints, no account system required.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid product." }, { status: 400 });
  }

  const ip = getClientIp(req);
  if (!rateLimit(`edit:${ip}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many edits. Try again in a few minutes." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const record = (body ?? {}) as Record<string, unknown>;

  const { editToken } = record;
  if (typeof editToken !== "string" || !editToken) {
    return NextResponse.json({ error: "Missing edit token." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { data: product } = await admin.from("products").select("*").eq("id", id).maybeSingle();
  if (!product) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }
  if (!product.edit_token_hash || product.edit_token_hash !== hashEditToken(editToken)) {
    return NextResponse.json({ error: "Invalid edit token." }, { status: 403 });
  }

  // Enforced server-side, not just hinted at client-side: editing closes
  // 24h after submission so a live duel's Battle Pitch can't be rewritten
  // mid-battle in reaction to how voting is going.
  if (!isWithinEditWindow(product.submitted_at)) {
    return NextResponse.json(
      { error: "The 24-hour editing window for this product has closed." },
      { status: 403 },
    );
  }

  const battlePatch = parseBattleFieldsPatch(record);
  if (!battlePatch.ok) {
    return NextResponse.json({ error: battlePatch.error }, { status: 400 });
  }

  const update: Partial<Product> = { ...battlePatch.patch };

  if ("pitch" in record) {
    const pitch = record.pitch;
    if (typeof pitch !== "string" || !pitch.trim() || pitch.trim().length > PITCH_MAX) {
      return NextResponse.json(
        { error: `One-line pitch is required (max ${PITCH_MAX} characters).` },
        { status: 400 },
      );
    }
    update.pitch = pitch.trim();
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data: updated, error } = await admin
    .from("products")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: "Could not update product. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ product: updated });
}
