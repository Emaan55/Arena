// Isolated PostgreSQL RLS/trigger tests. Pass an installed @electric-sql/pglite/dist/index.js path.
// PGlite is a test tool only; the production app has no new dependency.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : "@electric-sql/pglite");
const db = new PGlite();
const owner = "10000000-0000-4000-8000-000000000001", rival = "10000000-0000-4000-8000-000000000002";
const reviewer = "10000000-0000-4000-8000-000000000003", claimer = "10000000-0000-4000-8000-000000000004";
const deleted = "10000000-0000-4000-8000-000000000005";
const product = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const review = (n) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const claim = "40000000-0000-4000-8000-000000000001";
let checks = 0;
async function asUser(id, role = "authenticated") { await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub', '${id ?? ""}', false);`); }
async function denied(sql, code = "42501") {
  await assert.rejects(db.exec(sql), (error) => error.code === code, sql);
  checks++;
}
async function scalar(sql, expected) { const result = await db.query(sql); assert.equal(Object.values(result.rows[0])[0], expected, sql); checks++; }
const insert = (r, p, author = owner, body = "Thanks for your useful feedback.") => `insert into public.product_review_replies(review_id,product_id,author_id,body) values ('${review(r)}','${product(p)}','${author}','${body}')`;
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; grant usage on schema auth to anon, authenticated;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table auth.users(id uuid primary key, deleted_at timestamptz);
    insert into auth.users values ('${owner}',null),('${rival}',null),('${reviewer}',null),('${claimer}',null),('${deleted}',now());
    create table public.products(id uuid primary key, owner_id uuid references auth.users(id), name text);
    insert into public.products values ('${product(1)}','${owner}','Owner Product'),('${product(2)}','${rival}','Rival Product'),('${product(3)}',null,'Legacy Product');
    create table public.matches(id uuid primary key, votes_a integer, votes_b integer);
    insert into public.matches values ('50000000-0000-4000-8000-000000000001', 7, 9);
    create table public.product_reviews(id uuid primary key, product_id uuid references public.products(id) on delete cascade, user_id uuid references auth.users(id) on delete cascade, match_id uuid, body text);
    insert into public.product_reviews select ('30000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
      case n when 2 then '${product(2)}'::uuid when 3 then '${product(3)}'::uuid else '${product(1)}'::uuid end,
      case n when 4 then '${owner}'::uuid when 5 then '${deleted}'::uuid else '${reviewer}'::uuid end,
      '50000000-0000-4000-8000-000000000001', 'Original review content' from generate_series(1,7) n;
    alter table public.products enable row level security; alter table public.product_reviews enable row level security;
    revoke all on public.products, public.product_reviews from anon, authenticated;
    create table public.founder_notification_preferences(user_id uuid primary key, important_duel_updates boolean default false,
      review_notifications boolean default false, daily_vote_digest boolean default false, product_announcements boolean default false, get_listed_updates boolean default false);
    insert into public.founder_notification_preferences(user_id) values ('${reviewer}');
    create table public.founder_notifications(id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id),
      event_key text, event_type text, title text, body text, href text, email_category text, email_status text, announcement_id uuid, unique(user_id,event_key));
    revoke all on public.founder_notifications, public.founder_notification_preferences from anon, authenticated;
    create table public.founder_product_claims(id uuid primary key, product_id uuid, user_id uuid, status text, reviewed_at timestamptz, reviewed_by text);
    insert into public.founder_product_claims values ('${claim}','${product(3)}','${claimer}','pending',null,null);
  `);
  const existing = await readFile(new URL("../supabase/migrations/0025_founder_analytics_notifications.sql", import.meta.url), "utf8");
  for (const [start, end] of [["create or replace function public.enqueue_founder_notification(", "create or replace function public.notify_product_submission()"],
    ["create or replace function public.review_founder_product_claim(", "create or replace function public.notify_founder_claim_review()"]]) {
    await db.exec(existing.slice(existing.indexOf(start), existing.indexOf(end)));
  }
  await db.exec(await readFile(new URL("../supabase/migrations/0030_product_review_replies.sql", import.meta.url), "utf8"));
  console.log("PASS migration applies to an isolated PostgreSQL database");

  await asUser(null, "anon"); await denied(insert(1,1));
  await asUser(reviewer); await denied(insert(1,1,reviewer));
  await asUser(rival); await denied(insert(1,1,rival)); await denied(insert(1,2,rival), "23503");
  await asUser(owner); await denied(insert(1,1,rival)); await denied(insert(1,1,owner,"short"), "23514");
  await db.exec(insert(1,1)); checks++;
  await denied(insert(1,1), "23505");
  await scalar(`select body from public.product_review_replies where review_id='${review(1)}'`, "Thanks for your useful feedback.");
  await db.exec(`update public.product_review_replies set body='Updated reply from the real owner.' where review_id='${review(1)}'`);
  await scalar(`select updated_at > created_at from public.product_review_replies where review_id='${review(1)}'`, true);
  await denied(`update public.product_review_replies set author_id='${rival}' where review_id='${review(1)}'`);

  await asUser(rival);
  await db.exec(`update public.product_review_replies set body='Unauthorized rival edit attempt.' where review_id='${review(1)}'; delete from public.product_review_replies where review_id='${review(1)}';`);
  await scalar(`select body from public.product_review_replies where review_id='${review(1)}'`, "Updated reply from the real owner.");
  await asUser(reviewer);
  await db.exec(`update public.product_review_replies set body='Unauthorized regular user edit.' where review_id='${review(1)}'; delete from public.product_review_replies where review_id='${review(1)}';`);
  await scalar(`select count(*)::integer from public.product_review_replies`, 1);
  await asUser(null, "anon");
  await scalar(`select body from public.product_review_replies where review_id='${review(1)}'`, "Updated reply from the real owner.");
  await denied("select author_id from public.product_review_replies");
  await denied("select * from public.founder_notifications");
  console.log("PASS public reads; owner-only CRUD; rival, anonymous, and regular-user rejection; unique reply constraint");

  await db.exec("reset role");
  await scalar(`select count(*)::integer from public.founder_notifications where user_id='${reviewer}' and event_type='review_reply' and email_status='skipped'`,1);
  await scalar(`select href like '%?review=${review(1)}#review-${review(1)}' from public.founder_notifications`,true);
  await asUser(owner); await db.exec(`delete from public.product_review_replies where review_id='${review(1)}'`);
  await scalar("select count(*)::integer from public.product_review_replies",0);
  await db.exec(insert(1,1));
  await db.exec(insert(4,1)); await db.exec(insert(5,1));
  await db.exec("reset role"); await scalar("select count(*)::integer from public.founder_notifications",1);
  await asUser(owner); await db.exec("begin"); await db.exec(insert(6,1)); await db.exec("rollback; reset role");
  await scalar("select count(*)::integer from public.founder_notifications",1);
  console.log("PASS reviewer-only in-app notification, no emails, no self/deleted-account notification, edit/repost deduplication and transaction rollback");

  await asUser(claimer); await denied(insert(3,3,claimer));
  await denied(`select public.review_founder_product_claim('${claim}', true, 'self-approval')`);
  await db.exec(`reset role; select public.review_founder_product_claim('${claim}',true,'test-admin')`);
  await asUser(claimer); await db.exec(insert(3,3,claimer));
  await scalar(`select count(*)::integer from public.product_review_replies where review_id='${review(3)}'`,1);
  await db.exec("reset role");
  await scalar("select count(*)::integer from public.product_reviews where body='Original review content'",7);
  await scalar("select votes_a + votes_b from public.matches",16);
  await db.exec(`update auth.users set deleted_at=now() where id='${owner}'`);
  await asUser(owner); await denied(insert(7,1));
  await db.exec(`delete from public.product_review_replies where review_id='${review(1)}'`);
  await scalar(`select count(*)::integer from public.product_review_replies where review_id='${review(1)}'`,1);
  await db.exec(`reset role; update auth.users set deleted_at=null where id='${owner}'`);
  // System FK cascades must not be blocked by owner-only delete guards.
  await db.exec(`delete from public.products where id='${product(3)}'`);
  await scalar(`select count(*)::integer from public.product_review_replies where product_id='${product(3)}'`,0);
  console.log(`PASS legacy claims, unchanged reviews/votes, cleanup cascades; ${checks} SQL security assertions passed`);
} finally { await db.close(); }
