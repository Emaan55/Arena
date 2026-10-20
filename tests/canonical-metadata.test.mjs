import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { accumulateMetadata } from "next/dist/lib/metadata/resolve-metadata.js";

// Run with: node --conditions=react-server --test tests/canonical-metadata.test.mjs
// Read the real metadata exports without importing page UI or database clients.
async function metadataFrom(path, siteUrl) {
  const source = await readFile(new URL(`../src/app/${path}`, import.meta.url), "utf8");
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = new Set(["metadata", "SITE_URL", "SITE_TITLE", "SITE_DESCRIPTION"]);
  const declarations = file.statements.filter((statement) => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some((declaration) => names.has(declaration.name.getText(file))));
  const { outputText } = ts.transpileModule(declarations.map((statement) => statement.getText(file)).join("\n"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const exports = {};
  // A fixture process object leaves all real environment variables unchanged.
  new Function("exports", "process", outputText)(exports, { env: siteUrl ? { NEXT_PUBLIC_SITE_URL: siteUrl } : {} });
  return exports.metadata ?? null;
}

const productId = "41f15891-f281-4d38-8e4d-94ef92096eb3";
const routes = [
  ["/", "page.tsx"],
  [`/product/${productId}`, "product/[id]/page.tsx"],
  ["/product/0444aa0f-20a5-480c-8c5d-7e85ba38ed80", "product/[id]/page.tsx"],
  ["/duel/11111111-1111-4111-8111-111111111111", "duel/[id]/page.tsx"],
  ["/announcements/22222222-2222-4222-8222-222222222222", "announcements/[id]/page.tsx"],
  ["/live-battles", "live-battles/page.tsx"],
  ["/get-listed", "get-listed/page.tsx"],
  ["/get-listed/discount-drop", "get-listed/discount-drop/page.tsx"],
  ["/reviews", "reviews/page.tsx"],
  ["/privacy", "privacy/page.tsx"],
  ["/terms", "terms/page.tsx"],
];

async function resolve(pathname, leaf, siteUrl) {
  const root = await metadataFrom("layout.tsx", siteUrl);
  const page = await metadataFrom(leaf, siteUrl);
  // Exercise Next.js's actual inheritance and canonical URL resolution.
  return accumulateMetadata(pathname, [[root, null], [page, null]], Promise.resolve(pathname), {
    trailingSlash: false, isStaticMetadataRouteFile: false,
  });
}

for (const [pathname, leaf] of routes) {
  test(`declares an absolute self canonical for ${pathname}`, async () => {
    const metadata = await resolve(pathname, leaf);
    assert.equal(new URL(metadata.alternates.canonical.url).href, new URL(pathname, "https://www.thearena.lol").href);
  });
}

test("query parameters and fragments do not enter product or review canonicals", async () => {
  for (const [url, leaf] of [
    [`https://www.thearena.lol/product/${productId}?edit=1&utm_source=x#reviews`, "product/[id]/page.tsx"],
    ["https://www.thearena.lol/reviews?add=1#review-form", "reviews/page.tsx"],
  ]) {
    const pathname = new URL(url).pathname;
    const metadata = await resolve(pathname, leaf);
    assert.equal(new URL(metadata.alternates.canonical.url).href, new URL(pathname, "https://www.thearena.lol").href);
  }
});

test("uses the configured metadataBase consistently without changing environment variables", async () => {
  const metadata = await resolve(`/product/${productId}`, "product/[id]/page.tsx", "https://canonical.example.test/");
  assert.equal(metadata.alternates.canonical.url, `https://canonical.example.test/product/${productId}`);
});
