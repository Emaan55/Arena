import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Champion, Database, Match, Product } from "@/types/database";
import { getSponsorshipState, type SponsorshipState } from "./sponsorship";

export type MatchWithProducts = Match & { product_a: Product; product_b: Product };
export type ChampionWithProduct = Champion & { product: Product };

export interface HomeStats {
  productsSubmitted: number;
  duelsFought: number;
  championsCrowned: number;
  votesCastToday: number;
}

export interface ArenaState {
  matches: MatchWithProducts[];
  waiting: Product[];
  unique: Product[];
  eliminated: Product[];
  champions: ChampionWithProduct[];
  topProducts: Product[];
  activity: { id: string; text: string; created_at: string }[];
  stats: HomeStats;
  sponsorship: SponsorshipState;
}

export async function getArenaState(
  supabase: SupabaseClient<Database>,
): Promise<ArenaState> {
  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);

  const [
    matchesRes,
    activeProductsRes,
    uniqueProductsRes,
    eliminatedRes,
    championsRes,
    topProductsRes,
    activityRes,
    productsCountRes,
    duelsFoughtCountRes,
    votesTodayCountRes,
  ] = await Promise.all([
    supabase
      .from("matches")
      .select(
        "*, product_a:products!matches_product_a_id_fkey(*), product_b:products!matches_product_b_id_fkey(*)",
      )
      .eq("status", "active")
      .order("created_at", { ascending: true }),
    supabase.from("products").select("*").eq("status", "active"),
    supabase
      .from("products")
      .select("*")
      .eq("status", "unique")
      .order("pool_entered_at", { ascending: true }),
    supabase
      .from("products")
      .select("*")
      .eq("status", "eliminated")
      .order("submitted_at", { ascending: false })
      .limit(50),
    supabase
      .from("champions")
      .select("*, product:products!champions_product_id_fkey(*)")
      .order("crowned_at", { ascending: false }),
    // Win Streak Leaders: only products that have actually won at least one
    // completed, voted duel. Waiting/unique products always sit at wins = 0
    // and are excluded by the `.gt` filter below, and a product currently
    // mid-duel keeps whatever streak it earned from past *completed* duels
    // only — a live duel's vote tally never touches `wins` until it resolves
    // (see resolveMatchIfComplete/applyWin in lib/arena.ts).
    supabase
      .from("products")
      .select("*")
      .in("status", ["active", "champion"])
      .gt("wins", 0)
      .order("wins", { ascending: false })
      .limit(8),
    supabase
      .from("activity_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase.from("products").select("*", { count: "exact", head: true }),
    supabase
      .from("matches")
      .select("*", { count: "exact", head: true })
      .eq("status", "resolved"),
    supabase
      .from("votes")
      .select("*", { count: "exact", head: true })
      .gte("created_at", startOfDayUtc.toISOString()),
  ]);

  const sponsorship = await getSponsorshipState(supabase);

  const matches = (matchesRes.data ?? []) as unknown as MatchWithProducts[];

  const matchedIds = new Set<string>();
  for (const m of matches) {
    matchedIds.add(m.product_a_id);
    matchedIds.add(m.product_b_id);
  }
  const waiting = (activeProductsRes.data ?? []).filter((p) => !matchedIds.has(p.id));
  // Defensive: a 'unique' product is only ever matched for the instant
  // between pairUnmatchedProducts inserting the match and flipping its
  // status back to 'active', but never show it as both live and uncontested.
  const unique = (uniqueProductsRes.data ?? []).filter((p) => !matchedIds.has(p.id));
  const champions = (championsRes.data ?? []) as unknown as ChampionWithProduct[];

  return {
    matches,
    waiting,
    unique,
    eliminated: eliminatedRes.data ?? [],
    champions,
    topProducts: topProductsRes.data ?? [],
    activity: activityRes.data ?? [],
    stats: {
      productsSubmitted: productsCountRes.count ?? 0,
      duelsFought: duelsFoughtCountRes.count ?? 0,
      championsCrowned: champions.length,
      votesCastToday: votesTodayCountRes.count ?? 0,
    },
    sponsorship,
  };
}

export interface ProductHistoryEntry {
  opponentName: string;
  won: boolean;
  scoreFor: number;
  scoreAgainst: number;
  resolvedAt: string;
}

export interface ProductDetail {
  product: Product;
  champion: Champion | null;
  history: ProductHistoryEntry[];
  currentMatch: MatchWithProducts | null;
  isWaiting: boolean;
  isUnique: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getProductDetail(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<ProductDetail | null> {
  if (!UUID_RE.test(id)) return null;

  const { data: product } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
  if (!product) return null;

  const [{ data: champion }, { data: matches }, { data: activeMatch }] = await Promise.all([
    supabase
      .from("champions")
      .select("*")
      .eq("product_id", id)
      .order("crowned_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("matches")
      .select(
        "*, product_a:products!matches_product_a_id_fkey(name), product_b:products!matches_product_b_id_fkey(name)",
      )
      .or(`product_a_id.eq.${id},product_b_id.eq.${id}`)
      .eq("status", "resolved")
      .order("resolved_at", { ascending: false }),
    supabase
      .from("matches")
      .select(
        "*, product_a:products!matches_product_a_id_fkey(*), product_b:products!matches_product_b_id_fkey(*)",
      )
      .or(`product_a_id.eq.${id},product_b_id.eq.${id}`)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  const history: ProductHistoryEntry[] = ((matches ?? []) as unknown as (Match & {
    product_a: { name: string };
    product_b: { name: string };
  })[]).map((m) => {
    const isA = m.product_a_id === id;
    const scoreFor = isA ? m.votes_a : m.votes_b;
    const scoreAgainst = isA ? m.votes_b : m.votes_a;
    return {
      opponentName: isA ? m.product_b.name : m.product_a.name,
      won: scoreFor > scoreAgainst,
      scoreFor,
      scoreAgainst,
      resolvedAt: m.resolved_at ?? m.created_at,
    };
  });

  const currentMatch = (activeMatch as unknown as MatchWithProducts | null) ?? null;

  return {
    product,
    champion: champion ?? null,
    history,
    currentMatch,
    isWaiting: product.status === "active" && !currentMatch,
    isUnique: product.status === "unique" && !currentMatch,
  };
}
