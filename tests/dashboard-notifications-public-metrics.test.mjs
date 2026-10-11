import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("founder reviews are owner scoped and dashboard navigation does not open the Arena review wall", async () => {
  const [shell, route] = await Promise.all([
    read("../src/components/dashboard/DashboardShell.tsx"),
    read("../src/app/api/dashboard/reviews/route.ts"),
  ]);
  assert.match(shell, /href: "\/dashboard\/reviews", label: "Product reviews"/);
  assert.doesNotMatch(shell, /href: "\/reviews", label: "Reviews"/);
  assert.match(route, /\.eq\("owner_id", user\.id\)/);
  assert.match(route, /\.from\("product_reviews"\)/);
  assert.match(route, /\.in\("product_id", productIds\)/);
});

test("notification deletion is user scoped and dashboard renders one notification list", async () => {
  const [route, dashboard] = await Promise.all([
    read("../src/app/api/notifications/route.ts"),
    read("../src/app/dashboard/page.tsx"),
  ]);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /\.eq\("user_id", user\.id\)/);
  assert.match(route, /update\(\{ in_app_visible: false/);
  assert.doesNotMatch(dashboard, /title="Recent activity"/);
  assert.match(dashboard, /title="Notifications"/);
});

test("homepage metrics use private rolling visitor data and a verified admin rating", async () => {
  const [migration, home, tracker] = await Promise.all([
    read("../supabase/migrations/0028_arena_public_metrics.sql"),
    read("../src/app/page.tsx"),
    read("../src/app/api/analytics/site/route.ts"),
  ]);
  assert.match(migration, /visitor_hash text primary key/);
  assert.match(migration, /last_seen_at >= now\(\) - interval '30 days'/);
  assert.match(migration, /revoke all on public\.arena_site_visitors, public\.arena_public_metrics from anon, authenticated/);
  assert.match(home, /getArenaPublicMetrics/);
  assert.match(tracker, /isAnalyticsBot/);
  assert.match(tracker, /analyticsVisitorHash/);
  assert.doesNotMatch(migration, /ip_address|user_agent/i);
});

