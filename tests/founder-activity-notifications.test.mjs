import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analyticsClickEventId, analyticsPageViewEventId, isAnalyticsBot, visitorDayHash } from "../src/lib/product-analytics.ts";
import { createUnsubscribeToken, escapeEmailHtml, isEmailAllowed, verifyUnsubscribeToken } from "../src/lib/founder-notification-core.ts";

process.env.FINGERPRINT_SIGNING_SECRET = "test-analytics-secret";
process.env.NOTIFICATION_UNSUBSCRIBE_SECRET = "test-notification-secret";

test("bots are excluded and analytics identifiers dedupe short retries without storing IPs", () => {
  assert.equal(isAnalyticsBot("Googlebot/2.1"), true);
  assert.equal(isAnalyticsBot("Mozilla/5.0 Chrome/124"), false);
  assert.equal(isAnalyticsBot(null), true);
  assert.equal(analyticsClickEventId("visitor", "product", 42), analyticsClickEventId("visitor", "product", 42));
  assert.notEqual(analyticsClickEventId("visitor", "product", 42), analyticsClickEventId("visitor", "product", 43));
  assert.equal(analyticsPageViewEventId("visitor", "product", 42), analyticsPageViewEventId("visitor", "product", 42));
  assert.notEqual(visitorDayHash("visitor", "2026-10-09"), visitorDayHash("visitor", "2026-10-10"));
});

test("optional email preferences default safely and essential transactional updates remain enabled", () => {
  assert.equal(isEmailAllowed("transactional", null), true);
  assert.equal(isEmailAllowed("announcement", null), false);
  assert.equal(isEmailAllowed("duel", null), false);
  assert.equal(isEmailAllowed("digest", null), false);
  assert.equal(isEmailAllowed("announcement", { product_announcements: true }), true);
  assert.equal(isEmailAllowed("duel", { important_duel_updates: false }), false);
  assert.equal(isEmailAllowed("digest", { daily_vote_digest: true }), true);
});

test("unsubscribe tokens are category scoped and tamper evident", () => {
  const token = createUnsubscribeToken("user-1", "announcement");
  assert.deepEqual(verifyUnsubscribeToken(token), { userId: "user-1", category: "announcement" });
  assert.equal(verifyUnsubscribeToken(`${token.slice(0, -1)}x`), null);
  assert.equal(verifyUnsubscribeToken(`${Buffer.from("user-1:transactional").toString("base64url")}.not-a-valid-signature`), null);
  assert.throws(() => createUnsubscribeToken("user-1", "transactional"), /Invalid optional email category/);
});

test("email HTML escapes user supplied content", () => {
  assert.equal(escapeEmailHtml(`<script a="x">'&</script>`), "&lt;script a=&quot;x&quot;&gt;&#39;&amp;&lt;/script&gt;");
});

test("database migration makes event fanout and approval idempotent and keeps analytics private", async () => {
  const sql = await readFile(new URL("../supabase/migrations/0025_founder_analytics_notifications.sql", import.meta.url), "utf8");
  assert.match(sql, /unique\(user_id, event_key\)/i);
  assert.match(sql, /on conflict\(user_id, event_key\) do nothing/i);
  assert.match(sql, /matches_founder_rival_notification after insert on public\.matches/i);
  assert.match(sql, /where id = v_claim\.product_id and owner_id is null/i);
  assert.match(sql, /revoke all on public\.product_analytics_events, public\.product_analytics_daily, public\.product_analytics_uniques, public\.arena_announcements from anon, authenticated/i);
  assert.match(sql, /daily-digest:' \|\| p_day::text/i);
  assert.match(sql, /event_type text not null check \(event_type in \('view', 'click'\)\)/i);
  const analyticsRoute = await readFile(new URL("../src/app/api/analytics/route.ts", import.meta.url), "utf8");
  const outboundRoute = await readFile(new URL("../src/app/api/products/[id]/outbound/route.ts", import.meta.url), "utf8");
  const votesRoute = await readFile(new URL("../src/app/api/votes/route.ts", import.meta.url), "utf8");
  assert.match(analyticsRoute, /p_event_type: "view"/);
  assert.match(outboundRoute, /p_event_type: "click"/);
  assert.match(votesRoute, /cast_vote_authenticated/);
  assert.match(sql, /daily_vote_digest boolean not null default false/i);
  assert.match(sql, /revoke select on public\.products from anon, authenticated/i);
  assert.match(sql, /grant select \(\s*id, name, url/i);
  const dashboard = await readFile(new URL("../src/app/api/dashboard/route.ts", import.meta.url), "utf8");
  assert.match(dashboard, /eq\("owner_id", user\.id\)/);
});
