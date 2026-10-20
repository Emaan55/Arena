import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
function loadModule(path, mocks = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } });
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", outputText)(
    (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name), compiledModule, compiledModule.exports,
  );
  return compiledModule.exports;
}
const validation = require("../src/lib/arena-review-validation.ts");
const profile = loadModule("../src/lib/reviewer-profile.ts", { "./arena-review-validation": validation });
const { resolveReviewAuthor } = profile;
const { getReviewAuthors } = loadModule("../src/lib/review-authors.ts", { "server-only": {}, "./reviewer-profile": profile });
const { ReviewAvatar } = loadModule("../src/components/reviews/ReviewCard.tsx", { "@/lib/arena-review-validation": validation });
const user = (id = "one", metadata = {}) => ({ id, email: "private@example.com", user_metadata: metadata });
const stored = { author_name: "Public Builder", profile_image_url: "https://project.supabase.co/storage/v1/object/public/arena-review-avatars/photo.webp", avatar_url: null };

test("resolves common OAuth names, pictures, and identity avatars", () => {
  for (const field of ["avatar_url", "picture", "profile_image_url"]) {
    assert.deepEqual(resolveReviewAuthor(user("one", { display_name: "Ada Builder", [field]: "https://images.example/avatar.png" })), {
      authorName: "Ada Builder", authorAvatarUrl: "https://images.example/avatar.png",
    });
  }
  assert.equal(resolveReviewAuthor({ ...user(), identities: [{ identity_data: { name: "OAuth Name", picture: "https://images.example/identity.png" } }] }).authorAvatarUrl, "https://images.example/identity.png");
});

test("reuses public stored names and photos, with OAuth image precedence", () => {
  assert.deepEqual(resolveReviewAuthor(user(), stored), { authorName: "Public Builder", authorAvatarUrl: stored.profile_image_url });
  assert.equal(resolveReviewAuthor(user("one", { avatar_url: "https://images.example/oauth.png" }), stored).authorAvatarUrl, "https://images.example/oauth.png");
});

test("deleted or unavailable accounts have a neutral identity and no stale photo", () => {
  for (const account of [null, { ...user(), deleted_at: "2026-10-20T00:00:00Z" }]) {
    assert.deepEqual(resolveReviewAuthor(account, stored), { authorName: "Arena member", authorAvatarUrl: null });
  }
});

test("never returns email fallbacks or private metadata", () => {
  const result = resolveReviewAuthor({ ...user("one", { full_name: "private@example.com", role: "admin", token: "secret", name: "Public Name" }), app_metadata: { role: "admin" } });
  assert.deepEqual(result, { authorName: "Public Name", authorAvatarUrl: null });
  assert.deepEqual(resolveReviewAuthor(user()), { authorName: "Arena member", authorAvatarUrl: null });
});

test("unsafe photo URLs fall back to an existing public image or initials", () => {
  for (const avatar_url of ["javascript:alert(1)", "data:image/png;base64,aaa", "http://example.com/image.png", "https://user:pass@example.com/image.png"]) {
    assert.equal(resolveReviewAuthor(user("one", { avatar_url }), stored).authorAvatarUrl, stored.profile_image_url);
    assert.equal(resolveReviewAuthor(user("one", { avatar_url })).authorAvatarUrl, null);
  }
});

test("looks up only requested authors, deduplicates IDs, and limits concurrent Auth calls", async () => {
  let active = 0, peak = 0;
  const lookedUp = [];
  const admin = {
    from(table) {
      assert.equal(table, "arena_reviews");
      return { select(columns) {
        assert.equal(columns, "user_id,author_name,profile_image_url,avatar_url");
        return { async in(column, ids) { assert.equal(column, "user_id"); return { data: ids.map((id) => ({ ...stored, user_id: id })) }; } };
      } };
    },
    auth: { admin: { async getUserById(id) {
      lookedUp.push(id); active++; peak = Math.max(peak, active);
      await Promise.resolve(); active--;
      return { data: { user: user(id) } };
    } } },
  };
  const ids = Array.from({ length: 23 }, (_, i) => `reviewer-${1001 + i}`);
  const result = await getReviewAuthors(admin, [...ids, ids[0]]);
  assert.equal(result.size, 23);
  assert.deepEqual(lookedUp, ids);
  assert.ok(peak <= 8);
  assert.equal(result.get(ids[0]).authorAvatarUrl, stored.profile_image_url);
});

test("lookup failures preserve reviews and known publishing users avoid another Auth request", async () => {
  const admin = {
    from() { throw new Error("Optional stored photos unavailable"); },
    auth: { admin: { async getUserById() { throw new Error("Account unavailable"); } } },
  };
  const known = user("known", { full_name: "Existing Reviewer" });
  const result = await getReviewAuthors(admin, ["known", "missing"], [known]);
  assert.equal(result.get("known").authorName, "Existing Reviewer");
  assert.deepEqual(result.get("missing"), { authorName: "Arena member", authorAvatarUrl: null });
  assert.equal((await getReviewAuthors(admin, [])).size, 0);
});

test("existing shared avatar renders a photo or circular initials without a lookup API", () => {
  const fallback = renderToStaticMarkup(React.createElement(ReviewAvatar, { name: "Ada Builder", url: null, small: true }));
  assert.match(fallback, /review-avatar-small/);
  assert.match(fallback, />AB</);
  const image = renderToStaticMarkup(React.createElement(ReviewAvatar, { name: "Ada Builder", url: "https://images.example/ada.png", small: true }));
  assert.match(image, /src="https:\/\/images.example\/ada.png"/);
  assert.match(image, /referrerPolicy="no-referrer"/i);
});

test("broken image errors activate the existing initials fallback", () => {
  let failed = [];
  const avatars = loadModule("../src/components/reviews/ReviewCard.tsx", {
    "@/lib/arena-review-validation": validation,
    react: { ...React, useState: () => [failed, (update) => { failed = update(failed); }] },
  });
  const props = { name: "Arena Member", url: "https://images.example/broken.png" };
  avatars.ReviewAvatar(props).props.children.props.onError();
  const fallback = avatars.ReviewAvatar(props);
  assert.equal(fallback.props.children.props.children, "AM");
});

