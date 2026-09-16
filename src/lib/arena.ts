import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Category, Database, Match, Product } from "@/types/database";
import { resolveAndStoreProductFavicon } from "./favicon-service";

type AdminClient = SupabaseClient<Database>;

const WINS_TO_CHAMPION = 3;
const VOTES_TO_WIN = 100;
const UNIQUE_PRODUCT_MS = 7 * 24 * 60 * 60 * 1000;
const FAVICON_BACKFILL_BATCH = 4;

export async function logActivity(admin: AdminClient, text: string) {
  await admin.from("activity_log").insert({ text });
}

/**
 * Pairs up any currently-unmatched products within a category — both
 * regular "active" (still-waiting) products and "unique" ones (products
 * that already went uncontested past the 7-day window but remain
 * challengeable). Runs after every submission and after every match
 * resolution, so the pool never sits idle with 2+ waiting products.
 */
export async function pairUnmatchedProducts(admin: AdminClient, category: Category) {
  const [{ data: poolProducts }, { data: activeMatches }] = await Promise.all([
    admin
      .from("products")
      .select("*")
      .eq("category", category)
      .in("status", ["active", "unique"])
      .order("submitted_at", { ascending: true }),
    admin
      .from("matches")
      .select("product_a_id, product_b_id")
      .eq("category", category)
      .eq("status", "active"),
  ]);

  const matchedIds = new Set<string>();
  for (const m of activeMatches ?? []) {
    matchedIds.add(m.product_a_id);
    matchedIds.add(m.product_b_id);
  }

  const waiting = (poolProducts ?? []).filter((p) => !matchedIds.has(p.id));

  while (waiting.length >= 2) {
    const a = waiting.shift() as Product;
    const b = waiting.shift() as Product;

    const { error } = await admin.from("matches").insert({
      category,
      product_a_id: a.id,
      product_b_id: b.id,
      votes_a: 0,
      votes_b: 0,
      status: "active",
    });

    if (!error) {
      // A real duel is starting — neither side is "uncontested" anymore,
      // so any product coming out of the 'unique' bucket goes back to
      // 'active' the moment it's actually matched.
      await admin
        .from("products")
        .update({ status: "active" })
        .in("id", [a.id, b.id])
        .eq("status", "unique");
      await logActivity(admin, `⚔️ New duel in ${category}: ${a.name} vs ${b.name}`);
    }
  }
}

/**
 * Grants a win to `winner`: advances their streak, crowns them Champion at
 * 3 in a row, or — if not yet a champion — leaves them active and resets
 * their pool clock so they re-enter pairing for a fresh duel. This is the
 * ONLY function that increments `wins`, and it is only ever called from
 * `resolveMatchIfComplete` below, after one side has actually reached the
 * vote threshold in a real, completed duel — never for waiting, uncontested,
 * or currently-live-but-unresolved products.
 */
async function applyWin(
  admin: AdminClient,
  winner: Product,
  category: Category,
  opts: { loser: Product; votesLine: string },
) {
  const newWins = winner.wins + 1;
  const line = `beating ${opts.loser.name} ${opts.votesLine}`;

  if (newWins >= WINS_TO_CHAMPION) {
    await admin
      .from("products")
      .update({
        status: "champion",
        wins: newWins,
        is_defending: false,
      })
      .eq("id", winner.id);

    if (winner.is_defending) {
      // Extending an existing reign, not a fresh crowning.
      const { data: existing } = await admin
        .from("champions")
        .select("*")
        .eq("product_id", winner.id)
        .order("crowned_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing) {
        await admin
          .from("champions")
          .update({ times_defended: existing.times_defended + 1 })
          .eq("id", existing.id);
      }
      await logActivity(
        admin,
        `🛡️ ${winner.name} has successfully defended the throne in ${category}, ${line}!`,
      );
    } else {
      await admin.from("champions").insert({
        product_id: winner.id,
        category,
        times_defended: 0,
      });
      await logActivity(
        admin,
        `🏆 ${winner.name} has been crowned Champion of ${category}, ${line}!`,
      );
    }
  } else {
    await admin
      .from("products")
      .update({
        wins: newWins,
        pool_entered_at: new Date().toISOString(),
      })
      .eq("id", winner.id);
    await logActivity(
      admin,
      `${winner.name} beat ${opts.loser.name} ${opts.votesLine} in ${category} (win streak: ${newWins})`,
    );
  }
}

/**
 * Applies the outcome of a match once one side has reached the vote
 * threshold: records the win/elimination, crowns a champion at a 3-win
 * streak, and re-opens the pool for pairing. Safe to call more than once
 * for the same match — only the first caller to flip its status to
 * "resolved" does anything.
 */
export async function resolveMatchIfComplete(admin: AdminClient, match: Match) {
  if (match.votes_a < VOTES_TO_WIN && match.votes_b < VOTES_TO_WIN) return;

  const winnerSide = match.votes_a >= VOTES_TO_WIN ? "a" : "b";
  const winnerId = winnerSide === "a" ? match.product_a_id : match.product_b_id;
  const loserId = winnerSide === "a" ? match.product_b_id : match.product_a_id;

  const { data: resolved } = await admin
    .from("matches")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", match.id)
    .eq("status", "active")
    .select()
    .maybeSingle();

  // Another concurrent request already resolved this match — nothing to do.
  if (!resolved) return;

  const [{ data: winner }, { data: loser }] = await Promise.all([
    admin.from("products").select("*").eq("id", winnerId).single(),
    admin.from("products").select("*").eq("id", loserId).single(),
  ]);
  if (!winner || !loser) return;

  await admin
    .from("products")
    .update({ status: "eliminated", wins: 0, is_defending: false })
    .eq("id", loser.id);
  await logActivity(admin, `${loser.name} has been eliminated`);

  const votesLine = `${Math.max(match.votes_a, match.votes_b)}-${Math.min(match.votes_a, match.votes_b)}`;
  await applyWin(admin, winner, match.category, { loser, votesLine });

  await pairUnmatchedProducts(admin, match.category);
}

/**
 * Marks any product that has sat alone in its category's pool for 7 days+
 * with no challenger as a "Unique Product" — NOT a win, NOT a streak
 * increment, NOT a leaderboard entry. It stays fully challengeable: the next
 * time `pairUnmatchedProducts` runs for its category (e.g. a new submission
 * arrives) it's eligible to be paired into a real duel again, at which point
 * it flips back to "active" and is no longer treated as uncontested.
 *
 * There's no cron here — this runs lazily on every arena state fetch (page
 * load + the client's poll), which is frequent enough that the 7-day mark is
 * crossed within seconds of the deadline in practice, without needing any
 * scheduled-job infra.
 */
export async function markStaleWaitingProductsUnique(admin: AdminClient) {
  const cutoff = new Date(Date.now() - UNIQUE_PRODUCT_MS).toISOString();

  const [{ data: staleActive }, { data: activeMatches }] = await Promise.all([
    admin
      .from("products")
      .select("*")
      .eq("status", "active")
      .lte("pool_entered_at", cutoff)
      .order("pool_entered_at", { ascending: true }),
    admin.from("matches").select("product_a_id, product_b_id").eq("status", "active"),
  ]);

  if (!staleActive || staleActive.length === 0) return;

  const matchedIds = new Set<string>();
  for (const m of activeMatches ?? []) {
    matchedIds.add(m.product_a_id);
    matchedIds.add(m.product_b_id);
  }

  for (const product of staleActive) {
    if (matchedIds.has(product.id)) continue; // shouldn't happen, but never touch a matched product
    await admin.from("products").update({ status: "unique" }).eq("id", product.id);
    await logActivity(
      admin,
      `🦄 ${product.name} found no challenger in ${product.category} after 7 days — marked as a Unique Product (still open to a challenge, no win awarded)`,
    );
  }
}

/**
 * Guards against breaking product submission (or wasting a query every
 * poll) while migration 0011 hasn't been run yet: `products.logo_url`
 * doesn't exist until then, and an insert/select naming a nonexistent
 * column fails outright — for submission that would mean failing the
 * *entire* product creation over an optional cosmetic field. Both
 * call sites below check this first and skip the favicon step entirely
 * (never touching `logo_url`) until it's ready, so submission and the
 * poll loop keep working exactly as before regardless of migration order.
 */
export async function isProductFaviconColumnReady(admin: AdminClient): Promise<boolean> {
  const { error } = await admin.from("products").select("logo_url").limit(1);
  return !error;
}

/**
 * Products submitted before the favicon column existed (or whose
 * discovery genuinely failed at submission time — a down site, a
 * transient network error) get resolved lazily, a small batch at a time,
 * through the exact same discoverFavicon() pipeline every other favicon
 * call site uses (lib/favicon-service.ts) — never a second implementation.
 * Batched (not "all missing at once") so this never turns one page load
 * into a dozen outbound favicon fetches. A row is only ever updated when
 * discovery actually succeeds: a still-failing product is left
 * `logo_url = null` and is simply reconsidered next batch — genuine
 * failures are never permanently cached, they're retried indefinitely in
 * the background. Called from GET /api/state, same lazy-on-every-poll
 * pattern as markStaleWaitingProductsUnique above.
 */
export async function backfillMissingProductFavicons(admin: AdminClient) {
  if (!(await isProductFaviconColumnReady(admin))) return;

  const { data: missing } = await admin
    .from("products")
    .select("id, url")
    .is("logo_url", null)
    .limit(FAVICON_BACKFILL_BATCH);

  if (!missing || missing.length === 0) return;

  await Promise.all(
    missing.map(async (product) => {
      const logoUrl = await resolveAndStoreProductFavicon(admin, product.id, product.url);
      if (!logoUrl) return; // still unresolved — retried again next batch, never cached as a failure
      await admin.from("products").update({ logo_url: logoUrl }).eq("id", product.id).is("logo_url", null);
    }),
  );
}

/**
 * Paid action effects. Each is only ever invoked from the LemonSqueezy
 * webhook handler after payment is confirmed — never directly from a
 * client request.
 */

export async function applyRevive(admin: AdminClient, product: Product) {
  // Conditional on still being eliminated: guards against a delayed/retried
  // webhook re-applying after the product's state has already moved on.
  const { data: updated } = await admin
    .from("products")
    .update({
      status: "active",
      wins: 0,
      is_defending: false,
      pool_entered_at: new Date().toISOString(),
    })
    .eq("id", product.id)
    .eq("status", "eliminated")
    .select()
    .maybeSingle();
  if (!updated) return;

  await logActivity(
    admin,
    `💊 ${product.name} has been revived and re-enters the arena in ${product.category}`,
  );
  await pairUnmatchedProducts(admin, product.category);
}

export async function applyDefend(admin: AdminClient, product: Product) {
  // Conditional on still being a non-defending champion: same delayed-
  // webhook guard as applyRevive.
  const { data: updated } = await admin
    .from("products")
    .update({
      status: "active",
      wins: 0,
      is_defending: true,
      pool_entered_at: new Date().toISOString(),
    })
    .eq("id", product.id)
    .eq("status", "champion")
    .eq("is_defending", false)
    .select()
    .maybeSingle();
  if (!updated) return;

  await logActivity(
    admin,
    `🛡️ ${product.name} steps back into the arena to defend the throne in ${product.category}`,
  );
  await pairUnmatchedProducts(admin, product.category);
}

const BOOST_VOTES = 2;

export async function applyBoost(admin: AdminClient, matchId: string, productId: string) {
  const { data: match } = await admin
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .eq("status", "active")
    .maybeSingle();
  if (!match) return; // the duel already ended before payment confirmed — nothing to apply

  const side = match.product_a_id === productId ? "a" : match.product_b_id === productId ? "b" : null;
  if (!side) return;

  const { data: boosted } = await admin.rpc("boost_votes", {
    p_match_id: matchId,
    p_side: side,
    p_amount: BOOST_VOTES,
  });

  const { data: product } = await admin.from("products").select("*").eq("id", productId).maybeSingle();
  if (product) {
    await logActivity(admin, `⚡ ${product.name} got boosted +${BOOST_VOTES} votes in ${match.category}`);
  }

  if (boosted) await resolveMatchIfComplete(admin, boosted);
}
