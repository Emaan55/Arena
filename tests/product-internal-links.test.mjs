import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/components/MatchCard.tsx", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} });
// Isolate the real card from authentication/payment controls; effects do not run during SSR.
const dependencies = {
  "./PayButton": { PayButton: ({ label }) => React.createElement("button", null, label) },
  "./ProductAvatar": { ProductAvatar: ({ name }) => React.createElement("span", { "data-avatar": true }, name.slice(0, 1)) },
  "./ShareButtons": { ShareButtons: () => null },
  "./BattlePitch": { BattlePitch: () => null },
  "./XHandleLink": { XHandleLink: () => null },
  "./EditProductButton": { EditProductButton: () => null },
  "./reviews/ReviewCard": { ReviewAvatar: () => null },
};
const compiledModule = { exports: {} };
new Function("require", "module", "exports", outputText)(
  (name) => dependencies[name] ?? require(name), compiledModule, compiledModule.exports,
);
const { MatchCard } = compiledModule.exports;
const product = (id, name) => ({ id, name, category: "Dev Tools", wins: 0, logo_url: null,
  pitch: "A test product.", battle_pitch: null, why_us: null, differentiators: [], x_handle: null, submitted_at: "2026-10-21T00:00:00Z" });
const a = product("41f15891-f281-4d38-8e4d-94ef92096eb3", "Alpha Product");
const b = product("0444aa0f-20a5-480c-8c5d-7e85ba38ed80", "Beta Product");
const match = { id: "duel", category: "Dev Tools", product_a: a, product_b: b, votes_a: 30, votes_b: 40 };
const render = (props = {}) => renderToStaticMarkup(React.createElement(MatchCard, {
  match, onVote: () => {}, analytics: { [a.id]: { outbound_clicks: 12 }, [b.id]: { outbound_clicks: 9 } }, ...props,
}));
function anchors(html) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((match) => ({
    attributes: match[1], body: match[2], href: match[1].match(/href="([^"]+)"/)?.[1],
  }));
}

test("both product names and avatars render crawlable profile anchors in initial HTML", () => {
  const links = anchors(render());
  for (const item of [a, b]) {
    const profile = links.find((link) => link.href === `/product/${item.id}`);
    assert.ok(profile, item.name);
    assert.ok(profile.body.includes(item.name));
    assert.ok(profile.body.includes("data-avatar"));
    assert.doesNotMatch(profile.attributes, /nofollow|target=|onclick=/i);
    assert.doesNotMatch(profile.body, /Visit Website/);
  }
});

test("each product retains a separate labeled website link through the existing tracker", () => {
  const links = anchors(render());
  for (const item of [a, b]) {
    const outbound = links.find((link) => link.href === `/api/products/${item.id}/outbound`);
    assert.ok(outbound, item.name);
    assert.match(outbound.body, /Visit Website/);
    assert.match(outbound.attributes, /target="_blank"/);
    assert.match(outbound.attributes, /rel="noopener noreferrer nofollow"/);
    assert.ok(outbound.attributes.includes(`Visit ${item.name} website (opens in a new tab)`));
  }
  assert.equal(links.length, 4);
});

test("profile and website links remain available after voting, with existing vote and click counts", () => {
  const html = render({ votedSide: "a" });
  assert.equal(anchors(html).length, 4);
  assert.match(html, /✓ Voted/);
  assert.match(html, /Not selected/);
  assert.match(html, /12 website clicks/);
  assert.match(html, /9 website clicks/);
});
