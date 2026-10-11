import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("new promotion packages use distinct keys while legacy packages remain intact", async () => {
  const source = await read("../src/lib/get-listed/packages.ts");
  assert.match(source, /starter:[\s\S]*?target: 30,[\s\S]*?priceUsd: 60,[\s\S]*?legacy: true/);
  assert.match(source, /growth:[\s\S]*?target: 60,[\s\S]*?priceUsd: 120,[\s\S]*?legacy: true/);
  assert.match(source, /scale:[\s\S]*?target: 120,[\s\S]*?priceUsd: 180,[\s\S]*?legacy: true/);
  assert.match(source, /launch_starter:[\s\S]*?target: 15,[\s\S]*?priceUsd: 49,[\s\S]*?durationDays: 7/);
  assert.match(source, /growth_campaign:[\s\S]*?target: 30,[\s\S]*?priceUsd: 120,[\s\S]*?durationDays: 14/);
  assert.match(source, /launch_accelerator:[\s\S]*?target: 45,[\s\S]*?priceUsd: 199,[\s\S]*?durationDays: 30/);
});

test("checkout remains server priced and webhook redemption remains payment confirmed", async () => {
  const [pricing, checkout, webhook, migration] = await Promise.all([
    read("../src/lib/get-listed/pricing.ts"),
    read("../src/app/api/get-listed/checkout/route.ts"),
    read("../src/app/api/webhooks/lemonsqueezy/route.ts"),
    read("../supabase/migrations/0018_get_listed_orders.sql"),
  ]);
  assert.match(pricing, /GET_LISTED_PACKAGES\[packageKey\]\.priceUsd \* 100/);
  assert.match(checkout, /customPriceCents: order\.final_amount/);
  assert.match(checkout, /\.eq\("owner_id", user\.id\)/);
  assert.match(webhook, /eventName !== "order_created" \|\| status !== "paid"/);
  assert.match(migration, /where id = p_order_id and payment_status = 'pending'/i);
  assert.match(migration, /set status = 'redeemed', redeemed_at = now\(\)/i);
});

test("promotion migration snapshots packages and protects fulfillment records", async () => {
  const migration = await read("../supabase/migrations/0027_get_listed_promotion_campaigns.sql");
  assert.match(migration, /'launch_starter', 'growth_campaign', 'launch_accelerator'/);
  assert.match(migration, /create table public\.campaign_deliverables/i);
  assert.match(migration, /unique \(campaign_id, deliverable_key\)/i);
  assert.match(migration, /alter table public\.campaign_deliverables enable row level security/i);
  assert.match(migration, /revoke all on public\.campaign_deliverables from anon, authenticated/i);
});

test("admin completion requires directory and deliverable evidence", async () => {
  const [route, deliverableRoute] = await Promise.all([
    read("../src/app/api/admin/get-listed/campaigns/[id]/route.ts"),
    read("../src/app/api/admin/get-listed/campaigns/[id]/deliverables/[deliverableId]/route.ts"),
  ]);
  assert.match(route, /Cannot mark complete:[\s\S]*submissions recorded/);
  assert.match(route, /promotion deliverable[\s\S]*still open/);
  assert.match(route, /\.not\("status", "in", "\(completed,not_applicable\)"\)/);
  assert.match(deliverableRoute, /Add a published link, asset link, or customer-visible completion note/);
  assert.match(deliverableRoute, /Record all \$\{campaign\.submission_target\} directory submissions/);
});


