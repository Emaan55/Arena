import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server.js";
const require = createRequire(import.meta.url);
const rules = require("../src/lib/founder-reply.ts");
const reviewId = "30000000-0000-4000-8000-000000000001";
const productId = "20000000-0000-4000-8000-000000000001";
const timestamp = "2026-10-21T10:00:00Z";
const publicAuthor = { authorName: "Public Founder", authorAvatarUrl: null };
const reply = { id: "reply", body: "Thanks for the useful feedback.", createdAt: timestamp, updatedAt: timestamp, ...publicAuthor, canManage: true };
function load(path, mocks) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } });
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", outputText)((name) => mocks[name] ?? require(name), compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
function harness({ user = "owner", owner = "owner", error = null, found = true, limited = false, missingReplies = false, authUnavailable = false } = {}) {
  const writes = [], filters = [];
  let authReads = 0;
  function builder(result, table) {
    const chain = { select: () => chain, order: () => chain, limit: () => chain, in: () => chain,
      eq: (column, value) => { filters.push([table,column,value]); return chain; }, maybeSingle: async () => result,
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    };
    return chain;
  }
  const row = { id: "reply", review_id: reviewId, author_id: "owner", body: reply.body, created_at: timestamp, updated_at: timestamp };
  const admin = { from: (table) => {
    if (table === "products") return builder({ data: { owner_id: owner }, error: null }, table);
    if (table === "product_review_replies") return builder({ data: missingReplies ? null : [row], error: missingReplies ? {code:"42P01"} : null }, table);
    return builder({ data: [{ id: reviewId, product_id: productId, user_id: "reviewer", body: "Existing review unchanged.", created_at: timestamp }], count: 1, error: null }, table);
  } };
  // The write handler uses maybeSingle, while the read handler awaits the list query.
  const writeAdmin = { from: (table) => table === "products" ? admin.from(table)
    : builder({data: {id:reviewId,product_id:productId},error:null}, table) };
  const auth = { auth: { getUser: async () => { authReads++; if(authUnavailable)throw Error("Auth unavailable"); return { data: { user: user ? { id: user } : null } }; } }, from: (table) => {
    assert.equal(table, "product_review_replies");
    const operation = (method, payload) => { writes.push({method,payload}); return builder({ data: found ? row : null, error }, table); };
    return { insert: (payload) => operation("insert",payload), update: (payload) => operation("update",payload), delete: () => operation("delete") };
  } };
  const mocks = {
    "@/lib/supabase/admin": { createAdminSupabaseClient: () => writeAdmin },
    "@/lib/supabase/server": { createRouteHandlerSupabaseClient: async () => auth },
    "@/lib/review-authors": { getReviewAuthors: async (_admin, ids) => new Map(ids.map(id => [id,publicAuthor])) },
    "@/lib/reviewer-profile": { resolveReviewAuthor: () => publicAuthor },
    "@/lib/founder-reply": rules,
    "@/lib/fingerprint": { getClientIp: () => "127.0.0.1" },
    "@/lib/rate-limit": { rateLimit: () => !limited },
    "@/lib/reviews": { isProductReviewsReady: async () => true, REVIEW_BODY_MIN:20,REVIEW_BODY_MAX:500 },
    "@/lib/security-log": { logSecurityEvent: () => {} },
    "@/lib/founder-notifications": { scheduleFounderNotificationDelivery: () => {} },
  };
  const route = load("../src/app/api/reviews/[reviewId]/reply/route.ts", mocks);
  const readRoute = load("../src/app/api/reviews/route.ts", { ...mocks,"@/lib/supabase/admin": {createAdminSupabaseClient:()=>admin} });
  async function request(method = "POST", body = {body:reply.body}, origin = "https://www.thearena.lol") {
    const req = new NextRequest(`https://www.thearena.lol/api/reviews/${reviewId}/reply`, { method,
      headers: { host:"www.thearena.lol", origin,"Content-Type":"application/json" }, body:method==="DELETE"?undefined:JSON.stringify(body) });
    return route[method](req,{params:Promise.resolve({reviewId})});
  }
  return {request,writes,filters,authReads:()=>authReads,read:async(query=`productId=${productId}`)=>readRoute.GET(new NextRequest(`https://www.thearena.lol/api/reviews?${query}`))};
}

test("reply validation trims copy and enforces 10–2000 Unicode characters", () => {
  assert.deepEqual(rules.validateFounderReply("  Thanks for the feedback.  "),{body:"Thanks for the feedback."});
  for (const value of [null,"short"," ","x".repeat(2001),"😀".repeat(2001),"bad\u0000reply text"]) assert.ok(rules.validateFounderReply(value).error);
  assert.equal(rules.validateFounderReply("😀".repeat(2000)).body.length,4000);
});
test("logged-out users cannot create, edit, or delete replies", async () => {
  for (const method of ["POST","PATCH","DELETE"]) { const h=harness({user:null}); assert.equal((await h.request(method)).status,401); assert.equal(h.writes.length,0); }
});
test("rivals, regular users, and unclaimed founders fail the server ownership check", async () => {
  for (const options of [{user:"rival"},{user:"reviewer"},{owner:null}]) {
    for (const method of ["POST","PATCH","DELETE"]) { const h=harness(options); assert.equal((await h.request(method)).status,403); assert.equal(h.writes.length,0); }
  }
});
test("verified owner publishes through the JWT client; forged identity and product fields are ignored", async () => {
  const h=harness(); const response=await h.request("POST",{body:"  Thanks for the useful feedback.  ",author_id:"rival",product_id:"rival-product",review_id:"other"});
  assert.equal(response.status,201);
  assert.deepEqual(h.writes,[{method:"insert",payload:{review_id:reviewId,product_id:productId,author_id:"owner",body:reply.body}}]);
  const json=await response.json(); assert.equal(json.reply.authorName,publicAuthor.authorName); assert.equal(json.reply.canManage,true);
  assert.equal(json.reply.author_id,undefined);
});
test("owner edits only reply content and can delete their reply", async () => {
  const h=harness(); assert.equal((await h.request("PATCH")).status,200); assert.deepEqual(h.writes[0],{method:"update",payload:{body:reply.body}});
  assert.equal((await h.request("DELETE")).status,200); assert.equal(h.writes[1].method,"delete");
  assert.ok(h.filters.some(([,column,value])=>column==="review_id"&&value===reviewId));
});
test("duplicate, RLS, missing reply, and missing migration errors return useful HTTP statuses", async () => {
  for (const [error,status] of [[{code:"23505"},409],[{code:"42501"},403],[{code:"42P01"},503]]) assert.equal((await harness({error}).request()).status,status);
  assert.equal((await harness({found:false}).request("PATCH")).status,404);
});
test("invalid input, cross-origin requests, and excessive attempts never write", async () => {
  const h=harness(); assert.equal((await h.request("POST",{body:"short"})).status,400);
  assert.equal((await h.request("DELETE",undefined,"https://evil.example")).status,403); assert.equal(h.writes.length,0);
  assert.equal((await harness({limited:true}).request()).status,429);
});
test("public readers see replies, without author IDs or edit permissions, and responses cannot be publicly cached", async () => {
  const response=await harness({user:null}).read(); const json=await response.json();
  assert.equal(response.status,200); assert.match(response.headers.get("cache-control"),/private, no-store/);
  assert.equal(json.canReply,false); assert.equal(json.reviews[0].reply.body,reply.body); assert.equal(json.reviews[0].reply.canManage,false);
  assert.equal(json.reviews[0].reply.author_id,undefined); assert.equal(json.reviews[0].user_id,undefined);
});
test("owner permissions are scoped to the current product and missing migration preserves existing reviews", async () => {
  const owner=await (await harness().read()).json(); assert.equal(owner.canReply,true); assert.equal(owner.reviews[0].reply.canManage,true);
  const rival=await (await harness({user:"rival"}).read()).json(); assert.equal(rival.canReply,false);
  const pending=await (await harness({missingReplies:true}).read()).json(); assert.equal(pending.reviews[0].body,"Existing review unchanged."); assert.equal(pending.canReply,false);
});
test("public review and reply reads survive session verification failure", async () => {
  const response=await harness({authUnavailable:true}).read();
  const json=await response.json(); assert.equal(response.status,200); assert.equal(json.canReply,false); assert.equal(json.reviews[0].reply.body,reply.body);
});
test("notification targets are constrained to the product and count-only requests do not fetch auth", async () => {
  const h=harness(); await h.read(`productId=${productId}&reviewId=${reviewId}`);
  assert.ok(h.filters.some(([,column,value])=>column==="product_id"&&value===productId));
  assert.ok(h.filters.some(([,column,value])=>column==="id"&&value===reviewId));
  const counts=harness(); await counts.read(`productIds=${productId}`); assert.equal(counts.authReads(),0);
});

const { FounderReviewReply }=load("../src/components/FounderReviewReply.tsx",{
  "./reviews/ReviewCard": {ReviewAvatar:({name})=>React.createElement("span",null,name.slice(0,1))},"@/lib/founder-reply":rules,
});
const render=(canReply,value)=>renderToStaticMarkup(React.createElement(FounderReviewReply,{reviewId,reply:value,canReply,onChange:()=>{}}));
test("only the verified owner sees create, edit, and delete controls", () => {
  assert.doesNotMatch(render(false,null),/Reply as Founder/); assert.match(render(true,null),/Reply as Founder/);
  assert.match(render(true,reply),/Edit reply/); assert.match(render(true,reply),/Delete reply/);
  assert.doesNotMatch(render(false,{...reply,canManage:false}),/Edit reply|Delete reply/);
});
test("public founder reply renders nested attribution and date, escaping user content", () => {
  const html=render(false,{...reply,body:"<script>alert('x')</script>",updatedAt:"2026-10-22T10:00:00Z"});
  assert.match(html,/Product Owner/); assert.match(html,/Public Founder/); assert.match(html,/Edited/); assert.match(html,/&lt;script&gt;/);
  assert.doesNotMatch(html,/<script>/);
});
