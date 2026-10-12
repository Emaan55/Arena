import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("a successful vote opens a review prompt outside the disappearing duel card", async () => {
  const [arenaApp, productDuel, prompt] = await Promise.all([
    read("../src/components/ArenaApp.tsx"),
    read("../src/components/ProductLiveDuel.tsx"),
    read("../src/components/VoteReviewPrompt.tsx"),
  ]);

  for (const source of [arenaApp, productDuel]) {
    assert.match(source, /savePendingVoteReview\(review\)/);
    assert.match(source, /<VoteReviewPrompt/);
  }
  assert.match(prompt, /role="dialog"/);
  assert.match(prompt, /Your vote is in/);
  assert.match(prompt, /fetch\("\/api\/reviews"/);
});

test("published reviews immediately update and open the matching product review list", async () => {
  const [prompt, card] = await Promise.all([
    read("../src/components/VoteReviewPrompt.tsx"),
    read("../src/components/MatchCard.tsx"),
  ]);

  assert.match(prompt, /new CustomEvent\("arena:review-created"/);
  assert.match(card, /addEventListener\("arena:review-created"/);
  assert.match(card, /detail\.productId !== productId/);
  assert.match(card, /setReviewsOpen\(true\)/);
});

test("review eligibility remains enforced by the authenticated vote on the server", async () => {
  const route = await read("../src/app/api/reviews/route.ts");
  assert.match(route, /await supabaseAuth\.auth\.getUser\(\)/);
  assert.match(route, /\.from\("votes"\)/);
  assert.match(route, /\.eq\("user_id", user\.id\)/);
  assert.match(route, /votedProductId !== productId/);
});

