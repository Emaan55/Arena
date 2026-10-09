import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const auth = await createRouteHandlerSupabaseClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to find a legacy product." }, { status: 401 });
  const query = (req.nextUrl.searchParams.get("q") ?? "").trim().replace(/[%_,]/g, " ").slice(0, 80);
  if (query.length < 2) return NextResponse.json({ products: [], claims: [] });
  const admin = createAdminSupabaseClient();
  const [products, claims] = await Promise.all([
    admin.from("products").select("id,name,url,category,status").is("owner_id", null).or(`name.ilike.%${query}%,url.ilike.%${query}%`).order("submitted_at", { ascending: false }).limit(20),
    admin.from("founder_product_claims").select("id,product_id,status,created_at").eq("user_id", user.id),
  ]);
  if (products.error || claims.error) return NextResponse.json({ error: "Could not search legacy products." }, { status: 500 });
  return NextResponse.json({ products: products.data ?? [], claims: claims.data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await createRouteHandlerSupabaseClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to request a product claim." }, { status: 401 });
  let payload: unknown;
  try { payload = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const record = (payload ?? {}) as Record<string, unknown>;
  if (typeof record.productId !== "string" || !UUID_RE.test(record.productId) || typeof record.proof !== "string" || record.proof.trim().length < 10 || record.proof.length > 2000) return NextResponse.json({ error: "Provide a short explanation of how you can verify ownership (10–2,000 characters)." }, { status: 400 });
  const admin = createAdminSupabaseClient();
  const { data: product } = await admin.from("products").select("id,owner_id").eq("id", record.productId).maybeSingle();
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
  if (product.owner_id) return NextResponse.json({ error: "This product is already linked to an account." }, { status: 409 });
  const { data: claim, error } = await admin.from("founder_product_claims").insert({ product_id: product.id, user_id: user.id, proof: record.proof.trim() }).select("id,status,created_at").single();
  if (error?.code === "23505") return NextResponse.json({ error: "A claim is already under review for this product." }, { status: 409 });
  if (error || !claim) return NextResponse.json({ error: "Could not submit this claim." }, { status: 500 });
  return NextResponse.json({ claim }, { status: 201 });
}
