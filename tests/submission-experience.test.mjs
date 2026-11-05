import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server.js";

const require = createRequire(import.meta.url);
function load(path, mocks = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } });
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", outputText)((name) => mocks[name] ?? require(name), compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const database = require("../src/types/database.ts");
const authConfig = require("../src/lib/auth/config.ts");
const waitingRules = require("../src/lib/waiting-products.ts");
const paths = load("../src/lib/submission-path.ts", { "@/types/database": database });
const now = Date.now();
const id = "20000000-0000-4000-8000-000000000001";
const product = (overrides = {}) => ({ id, name: "Test product", category: "Dev Tools", status: "active", pitch: "Useful tools for builders.",
  pool_entered_at: new Date(now - 1000).toISOString(), submitted_at: "2025-01-01T00:00:00Z", logo_url: null, x_handle: "test_founder", ...overrides });
const request = (url, body) => new NextRequest(`https://www.thearena.lol${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const Link = ({ children, ...props }) => React.createElement("a", props, children);

test("waiting products exclude live rivals, expired/inactive products and invalid pool dates", () => {
  const products = [product(), product({ id: "matched" }), product({ id: "expired", pool_entered_at: new Date(now - waitingRules.WAITING_WINDOW_MS).toISOString() }),
    ...["unique", "eliminated", "champion"].map((status) => product({ id: status, status })), product({ id: "invalid", pool_entered_at: "invalid" }), product({ id: "future", pool_entered_at: new Date(now + 1000).toISOString() })];
  const matches = [{ status: "active", product_a_id: "matched", product_b_id: "other" }];
  assert.deepEqual(waitingRules.getWaitingProducts(products, matches, now).map((p) => p.id), [id]);
  assert.equal(waitingRules.getWaitingProducts([product()], [{ status: "resolved", product_a_id: id, product_b_id: "other" }], now).length, 1);
});

test("waiting age uses the existing pool clock, including products re-entering after a duel", () => {
  assert.equal(waitingRules.getWaitingProducts([product()], [], now).length, 1);
  assert.equal(waitingRules.getWaitingProducts([product({ pool_entered_at: new Date(now - waitingRules.WAITING_WINDOW_MS + 1).toISOString() })], [], now).length, 1);
});

test("arena state applies waiting eligibility without adding database queries", async () => {
  const calls = [];
  const rows = [product(), product({ id: "stale", pool_entered_at: "2025-01-01T00:00:00Z" }), product({ id: "matched" })];
  const db = { from: (table) => {
    calls.push(table); const filters = [];
    const chain = { select: () => chain, order: () => chain, limit: () => chain, gt: () => chain, in: () => chain,
      eq: (key, value) => { filters.push([key, value]); return chain; },
      then: (resolve, reject) => Promise.resolve({ data: table === "products" && filters.some(([key, value]) => key === "status" && value === "active") ? rows
        : table === "matches" && filters.some(([key, value]) => key === "status" && value === "active") ? [{ status: "active", product_a_id: "matched", product_b_id: "other", product_a: product({ id: "matched" }), product_b: product({ id: "other" }) }] : [], count: 0 }).then(resolve, reject) };
    return chain;
  } };
  const { getArenaState } = load("../src/lib/arena-state.ts", { "server-only": {}, "./waiting-products": waitingRules,
    "./sponsorship": { getSponsorshipState: async () => ({ active: null, queue: [] }) }, "./founder-notifications": { getProductAnalyticsSummary: async () => ({}) } });
  const state = await getArenaState(db);
  assert.deepEqual(state.waiting.map((p) => p.id), [id]);
  assert.equal(state.waiting[0].owner_id, null);
  assert.equal(calls.length, 11);
});

test("submission category intent is allowlisted, encoded, and never reserves a rival", () => {
  assert.equal(paths.submissionCategory("AI Tools"), "AI Tools");
  for (const invalid of ["Invalid", ["AI Tools"], "//evil.example", undefined]) assert.equal(paths.submissionCategory(invalid), undefined);
  assert.equal(paths.submissionPath(), "/submit");
  assert.equal(paths.submissionPath("Dev Tools"), "/submit?category=Dev+Tools");
});

test("auth redirect sanitizer preserves submission intent and rejects external/backslash/control redirects", () => {
  const valid = paths.submissionPath("Dev Tools");
  assert.equal(authConfig.sanitizeNextPath(valid), valid);
  for (const authPage of ["/auth/sign-up", "/auth/verify-email", "/auth/sign-in"]) {
    assert.equal(authConfig.signInDestination(authPage, `?next=${encodeURIComponent(valid)}`), valid);
    assert.equal(authConfig.signInDestination(authPage, "?next=%2F%2Fevil.example"), "/");
  }
  assert.equal(authConfig.signInDestination("/submit", "?category=Dev+Tools"), valid);
  assert.equal(authConfig.signInDestination("/reviews", "?page=2"), "/reviews");
  assert.equal(authConfig.sanitizeNextPath("/product/test?review=id#review-id"), "/product/test?review=id#review-id");
  for (const invalid of ["https://evil.example", "//evil.example", "/\\evil.example", "/%5cevil.example", "/%2fevil.example", "/\n/evil.example", "javascript:alert(1)", "/%invalid"])
    assert.equal(authConfig.sanitizeNextPath(invalid), "/", JSON.stringify(invalid));
});

const { WaitingCard } = load("../src/components/WaitingCard.tsx", { "next/link": Link, "@/lib/submission-path": paths,
  "./ProductAvatar": { ProductAvatar: () => React.createElement("span", null, "Logo") }, "./XHandleLink": { XHandleLink: ({ handle }) => React.createElement("span", null, handle) }, "./EditProductButton": { EditProductButton: () => null } });
const { WaitingProducts } = load("../src/components/WaitingProducts.tsx", { "next/link": Link, "./WaitingCard": { WaitingCard } });
test("waiting cards expose product and authenticated challenge links while retaining invite controls", () => {
  const html = renderToStaticMarkup(React.createElement(WaitingProducts, { products: [product()] }));
  for (const text of ["Test product", "Dev Tools", "Useful tools", "test_founder", "View Product", "Challenge This Product", "Copy link", "Share on X"]) assert.ok(html.includes(text), text);
  assert.match(html, /href="\/submit\?category=Dev\+Tools"/);
  assert.match(html, new RegExp(`href="/product/${id}"`));
  assert.doesNotMatch(html, /<input/);
  assert.match(renderToStaticMarkup(React.createElement(WaitingProducts, { products: [] })), /No startups are waiting right now/);
});

test("homepage renders a single waiting section directly after the hero and no submission form", () => {
  const noOp = new Proxy({}, { get: () => () => null });
  const mocks = { "next/navigation": { useRouter: () => ({}) }, "@/types/database": database, "@/lib/waiting-products": waitingRules,
    "@/lib/submission-path": paths, "./WaitingProducts": { WaitingProducts }, "@/lib/useAuthUser": { useAuthUser: () => ({ user: null, loading: false }) }, "@/lib/vote-review-prompt": noOp };
  for (const name of ["CategoryTabs", "MatchCard", "HallOfFame", "EliminatedList", "ActivityFeed", "WaitingCard", "ArenaBackdrop", "DuelBackdrop", "SponsoredSection", "StatsRow", "HowItWorks", "Leaderboard", "WinStreakLeaderboard", "PowerMoves", "ScrollReveal", "BrandLogo", "ArenaReachStats", "VoteReviewPrompt"])
    mocks[`./${name}`] = { [name]: () => null };
  const { ArenaApp } = load("../src/components/ArenaApp.tsx", mocks);
  const html = renderToStaticMarkup(React.createElement(ArenaApp, { initialState: { waiting: [product()], matches: [], unique: [], eliminated: [], champions: [], topProducts: [], stats: {}, activity: [], sponsorship: {} }, publicMetrics: {} }));
  assert.equal((html.match(/id="waiting"/g) ?? []).length, 1);
  assert.ok(html.indexOf('id="waiting"') < html.indexOf('id="duels"'));
  assert.match(html, /href="\/submit"/);
  assert.doesNotMatch(html, /Product name|Choose how to submit|<input/);
});

function submissionPage(user) {
  return load("../src/app/submit/page.tsx", { "next/link": Link, "next/navigation": { redirect: (url) => { throw new Error(`REDIRECT:${url}`); } },
    "@/lib/supabase/server": { createServerComponentSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user }, error: null }) } }) },
    "@/lib/submission-path": paths, "@/components/SubmissionExperience": { SubmissionExperience: ({ initialCategory }) => React.createElement("div", null, `FORM:${initialCategory}`) } });
}
test("guest direct access redirects to signup with category intent preserved", async () => {
  await assert.rejects(submissionPage(null).default({ searchParams: Promise.resolve({ category: "Dev Tools" }) }), (error) => {
    const target = new URL(error.message.slice("REDIRECT:".length), "https://www.thearena.lol");
    assert.equal(target.pathname, "/auth/sign-up"); assert.equal(target.searchParams.get("next"), paths.submissionPath("Dev Tools")); return true;
  });
});
test("authenticated refresh renders the existing form with a validated category and private metadata", async () => {
  const page = submissionPage({ id: "owner" });
  const html = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({ category: "Dev Tools", paid: "submit" }) }));
  assert.match(html, /FORM:Dev Tools/); assert.match(html, /does not reserve a particular opponent/); assert.match(html, /Once payment is confirmed/);
  assert.equal(page.metadata.robots.index, false);
  assert.match(renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({ category: "//evil.example" }) })), /FORM:General/);
});

const fieldRules = load("../src/lib/product-fields.ts", { "./x-handle": require("../src/lib/x-handle.ts") });
const submissionRules = load("../src/lib/product-submission.ts", { "server-only": {}, "@/types/database": database, "./url": require("../src/lib/url.ts"), "./product-fields": fieldRules,
  "./edit-token": {}, "./founder-notifications": {}, "./favicon-service": {}, "./arena": {} });
const fields = { name: "Test product", url: "https://example.test", category: "Dev Tools", pitch: "Useful tools for builders.", battlePitch: "Built for practical work.", xHandle: "@test_founder", differentiators: ["Simple setup"], website: "", renderedAt: now - 5000, owner_id: "forged-owner" };
function checkout({ user = { id: "owner" }, duplicate = false, variantMissing = false } = {}) {
  const providerCalls = [], variants = []; let adminReads = 0;
  const route = load("../src/app/api/submit/checkout/route.ts", {
    "@/lib/supabase/admin": { createAdminSupabaseClient: () => { adminReads++; const chain = { select: () => chain, ilike: () => chain, limit: () => chain, maybeSingle: async () => ({ data: duplicate ? { id } : null }) }; return { from: () => chain }; } },
    "@/lib/supabase/server": { createRouteHandlerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
    "@/lib/lemonsqueezy": { getVariantId: (type) => { variants.push(type); if (variantMissing) throw Error(); return "existing-submit-variant"; }, createCheckout: async (input) => { providerCalls.push(input); return "https://checkout.example.test"; } },
    "@/lib/product-submission": submissionRules, "@/lib/rate-limit": { rateLimit: () => true }, "@/lib/fingerprint": { getClientIp: () => "fixture" }, "@/lib/security-log": { logSecurityEvent: () => {} },
  });
  return { call: (body = fields) => route.POST(request("/api/submit/checkout", body)), providerCalls, variants, adminReads: () => adminReads };
}
test("guest paid submission cannot query products or open a checkout", async () => {
  const h = checkout({ user: null }); assert.equal((await h.call()).status, 401); assert.equal(h.adminReads(), 0); assert.equal(h.providerCalls.length, 0);
});
test("paid submission uses the existing fixed-price variant and trusted owner without creating a product", async () => {
  const h = checkout(); assert.equal((await h.call()).status, 200);
  assert.deepEqual(h.variants, ["submit"]); const sent = h.providerCalls[0];
  assert.equal(sent.custom.owner_id, "owner"); assert.equal(sent.custom.category, "Dev Tools"); assert.equal(sent.custom.x_handle, "test_founder");
  assert.equal(sent.custom.battle_pitch, fields.battlePitch); assert.equal(sent.custom_price, undefined); assert.equal(sent.customPrice, undefined);
  assert.ok(sent.redirectUrl.endsWith("/submit?paid=submit"));
});
test("existing validation and duplicate-product protections still stop checkout", async () => {
  for (const [options, body, status] of [[{}, { ...fields, name: "" }, 400], [{ duplicate: true }, fields, 409], [{ variantMissing: true }, fields, 503]]) {
    const h = checkout(options); assert.equal((await h.call(body)).status, status); assert.equal(h.providerCalls.length, 0);
  }
});

function freeSubmission({ user = { id: "owner" }, claim = "claim", duplicate = false } = {}) {
  const calls = [], owners = [];
  const admin = { rpc: async (name, args) => { calls.push([name, args]); return { data: claim, error: null }; }, from: () => {
    const chain = { delete: () => { calls.push(["refund"]); return chain; }, update: () => chain, eq: async () => ({ error: null }) }; return chain;
  } };
  const route = load("../src/app/api/products/route.ts", { "@/lib/supabase/admin": { createAdminSupabaseClient: () => admin },
    "@/lib/supabase/server": { createRouteHandlerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
    "@/lib/arena-state": { getArenaState: async () => ({ waiting: [] }) }, "@/lib/arena": {}, "@/lib/fingerprint": { getClientIp: () => "fixture" }, "@/lib/rate-limit": { rateLimit: () => true },
    "@/lib/product-submission": { ...submissionRules, createArenaProduct: async (_, validated, owner) => { owners.push(owner); return duplicate ? { ok: false, error: "This product has already been submitted to the arena.", status: 409 } : { ok: true, product: product(validated), editToken: "one-time-token" }; } },
    "@/lib/free-submission": { isFreeSubmissionSchemaReady: async () => true }, "@/lib/search": {} });
  return { call: () => route.POST(request("/api/products", fields)), calls, owners };
}
test("earned-free path keeps authentication, authoritative eligibility and duplicate-claim refunds", async () => {
  const guest = freeSubmission({ user: null }); assert.equal((await guest.call()).status, 401); assert.equal(guest.calls.length, 0);
  const ineligible = freeSubmission({ claim: null }); assert.equal((await ineligible.call()).status, 403); assert.equal(ineligible.owners.length, 0);
  const duplicate = freeSubmission({ duplicate: true }); assert.equal((await duplicate.call()).status, 409); assert.ok(duplicate.calls.some(([name]) => name === "refund"));
  const earned = freeSubmission(); const response = await earned.call(); assert.equal(response.status, 201);
  assert.deepEqual(earned.owners, ["owner"]); assert.deepEqual(earned.calls[0], ["claim_free_submission", { p_user_id: "owner" }]);
  assert.equal((await response.json()).editToken, "one-time-token");
});

function confirmation(error = null) {
  return load("../src/app/auth/confirm/route.ts", { "@/lib/auth/config": authConfig,
    "@/lib/supabase/server": { createRouteHandlerSupabaseClient: async () => ({ auth: { exchangeCodeForSession: async () => ({ error }), verifyOtp: async () => ({ error }) } }) } });
}
test("signup confirmation and expired-link recovery preserve the validated submission destination", async () => {
  const next = paths.submissionPath("Dev Tools");
  for (const suffix of ["code=fixture", "token_hash=fixture&type=signup"]) {
    const response = await confirmation().GET(new NextRequest(`https://www.thearena.lol/auth/confirm?${suffix}&next=${encodeURIComponent(next)}`));
    const target = new URL(response.headers.get("location")); assert.equal(target.pathname, "/auth/sign-in"); assert.equal(target.searchParams.get("next"), next); assert.equal(target.searchParams.get("verified"), "1");
  }
  const failed = await confirmation(Error()).GET(new NextRequest(`https://www.thearena.lol/auth/confirm?code=fixture&next=${encodeURIComponent(next)}`));
  assert.equal(new URL(failed.headers.get("location")).searchParams.get("next"), next);
  const unsafe = await confirmation().GET(new NextRequest("https://www.thearena.lol/auth/confirm?code=fixture&next=%2F%5Cevil.example"));
  assert.equal(new URL(unsafe.headers.get("location")).searchParams.get("next"), "/");
});

test("signup carries submission intent into the verification email and handles projects with immediate sessions", async () => {
  for (const session of [null, { access_token: "test-only" }]) {
    let signUpInput;
    const api = load("../src/app/api/auth/sign-up/route.ts", { "@/lib/auth/config": authConfig,
      "@/lib/supabase/server": { createRouteHandlerSupabaseClient: async () => ({ auth: { signUp: async (input) => { signUpInput = input; return { data: { user: { id: "new-user", identities: [{}] }, session }, error: null }; } } }) },
      "@/lib/supabase/admin": { createAdminSupabaseClient: () => ({ from: () => ({ insert: async () => ({ error: null }) }) }) },
      "@/lib/fingerprint": { getClientIp: () => "fixture" }, "@/lib/rate-limit": { rateLimit: () => true }, "@/lib/security-log": { logSecurityEvent: () => {} } });
    const next = paths.submissionPath("AI Tools");
    const response = await api.POST(request("/api/auth/sign-up", { email: "founder@example.test", fullName: "Test Founder", password: "TestPassword1", confirmPassword: "TestPassword1", termsAccepted: true, next }));
    assert.equal(response.status, 200); assert.equal((await response.json()).authenticated, Boolean(session));
    assert.equal(new URL(signUpInput.options.emailRedirectTo).searchParams.get("next"), next);
  }
});

test("server-component auth reads cookies without writing them; existing route auth still persists refreshes", async () => {
  const configs = [], writes = [];
  const clients = load("../src/lib/supabase/server.ts", { "server-only": {}, "next/headers": { cookies: async () => ({ getAll: () => [{ name: "session", value: "fixture" }], set: (...args) => writes.push(args) }) },
    "@supabase/ssr": { createServerClient: (_, __, config) => { configs.push(config); return { auth: {} }; } } });
  await clients.createServerComponentSupabaseClient(); configs[0].cookies.setAll([{ name: "session", value: "refreshed", options: {} }]); assert.equal(writes.length, 0);
  assert.equal(configs[0].cookies.getAll()[0].value, "fixture");
  await clients.createRouteHandlerSupabaseClient(); configs[1].cookies.setAll([{ name: "session", value: "refreshed", options: {} }]); assert.equal(writes.length, 1);
});

test("all existing submit CTAs use the dedicated route and legacy fragments still have a bridge", () => {
  for (const path of ["../src/components/SiteHeader.tsx", "../src/components/SiteFooter.tsx", "../src/components/dashboard/DashboardShell.tsx", "../src/app/dashboard/page.tsx"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8"); assert.doesNotMatch(source, /\/#submit/); assert.match(source, /\/submit/);
  }
  const source = readFileSync(new URL("../src/components/ArenaApp.tsx", import.meta.url), "utf8");
  assert.match(source, /window\.location\.hash === "#submit"/); assert.doesNotMatch(source, /<SubmitForm/);
});

test("submission-only proxy forwards refreshed cookies to the page and browser without public caching", async () => {
  let verified = 0;
  const code = load("../src/proxy.ts", { "@supabase/ssr": { createServerClient: (_, __, options) => ({ auth: { getUser: async () => {
    verified++;
    assert.equal(options.cookies.getAll()[0].value, "old");
    options.cookies.setAll([{ name: "session", value: "fresh", options: { path: "/", sameSite: "lax" } }], { Expires: "0" });
    return { data: { user: { id: "owner" } } };
  } } }) } });
  const req = new NextRequest("https://www.thearena.lol/submit", { headers: { cookie: "session=old" } });
  const response = await code.proxy(req);
  assert.equal(verified, 1); assert.equal(req.cookies.get("session").value, "fresh");
  assert.equal(response.cookies.get("session").value, "fresh");
  assert.match(response.headers.get("x-middleware-request-cookie"), /session=fresh/);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store"); assert.equal(response.headers.get("Expires"), "0");
  assert.deepEqual(code.config.matcher, ["/submit/:path*"]);
});
