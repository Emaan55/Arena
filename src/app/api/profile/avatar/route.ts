import { NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await createRouteHandlerSupabaseClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to view your profile image." }, { status: 401 });

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("arena_reviews")
    .select("profile_image_url,avatar_url")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ avatarUrl: null });
  return NextResponse.json({ avatarUrl: data?.profile_image_url ?? data?.avatar_url ?? null });
}

