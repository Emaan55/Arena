import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("campaign results use an independent, published-only RLS model", async () => {
  const migration = await read("../supabase/migrations/0029_campaign_results.sql");
  assert.match(migration, /create table public\.campaign_results/i);
  assert.match(migration, /campaign_id uuid not null unique references public\.campaigns/i);
  assert.match(migration, /create table public\.campaign_result_platforms/i);
  assert.match(migration, /platform in \('youtube', 'linkedin', 'x'\)/i);
  assert.match(migration, /Published campaign results are public/);
  assert.match(migration, /using \(is_published = true\)/i);
  assert.match(migration, /revoke all on public\.campaign_results from anon, authenticated/i);
  assert.match(migration, /grant select on public\.campaign_results to anon, authenticated/i);
});

test("public results show only published rows and preserve nullable metrics", async () => {
  const [route, card, section] = await Promise.all([
    read("../src/app/api/get-listed/results/route.ts"),
    read("../src/components/get-listed/CampaignResultCard.tsx"),
    read("../src/components/get-listed/CampaignResultsSection.tsx"),
  ]);
  assert.match(route, /\.eq\("is_published", true\)/);
  assert.match(route, /createPublicSupabaseClient/);
  assert.doesNotMatch(route, /createAdminSupabaseClient/);
  assert.match(card, /entry\.views !== null/);
  assert.match(card, /result\.platforms\.map/);
  assert.match(card, /Combined Reported Views/);
  assert.match(card, /result\.domain_rating !== null/);
  assert.match(section, /if \(results\.length === 0\) return null/);
});

test("admin validation accepts only supported official platform post URLs", async () => {
  const [validation, route] = await Promise.all([
    read("../src/lib/get-listed/campaign-results.ts"),
    read("../src/app/api/admin/get-listed/results/[campaignId]/route.ts"),
  ]);
  assert.match(validation, /youtube\.com/);
  assert.match(validation, /youtu\.be/);
  assert.match(validation, /linkedin\.com/);
  assert.match(validation, /x\.com/);
  assert.match(validation, /twitter\.com/);
  assert.match(validation, /url\.protocol !== "https:" && url\.protocol !== "http:"/);
  assert.match(route, /isValidPlatformUrl\(platform, publishedUrl\)/);
  assert.match(route, /The same published link cannot be added twice/);
  assert.match(route, /save_campaign_result/);
});

test("result publishing remains independent from checkout and fulfillment", async () => {
  const route = await read("../src/app/api/admin/get-listed/results/[campaignId]/route.ts");
  assert.doesNotMatch(route, /orders/);
  assert.doesNotMatch(route, /payment_status/);
  assert.doesNotMatch(route, /campaign_deliverables/);
  assert.doesNotMatch(route, /update\(\{\s*status/);
});
