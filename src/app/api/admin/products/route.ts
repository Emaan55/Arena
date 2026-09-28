import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAuthorizedAdmin } from "@/lib/admin-auth";
import { getArenaState } from "@/lib/arena-state";
import { validateProductSubmission, createArenaProduct } from "@/lib/product-submission";

/**
 * Admin-only free submission: no $1 payment, no vote/review requirement.
 * Still runs through the exact same validation and createArenaProduct()
 * every other submission path uses (same category/pairing/favicon/
 * activity logic) — the only thing skipped is the payment-or-earn gate,
 * and that skip only ever happens after isAuthorizedAdmin verifies the
 * shared admin secret server-side. No honeypot/fill-time check either:
 * those exist to filter anonymous bot traffic, which doesn't apply to an
 * authenticated admin request.
 */
export async function POST(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const record = (body ?? {}) as Record<string, unknown>;

  const validation = validateProductSubmission(record);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }

  const admin = createAdminSupabaseClient();
  const result = await createArenaProduct(admin, validation.fields);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const state = await getArenaState(admin);
  return NextResponse.json({ product: result.product, state, editToken: result.editToken }, { status: 201 });
}
