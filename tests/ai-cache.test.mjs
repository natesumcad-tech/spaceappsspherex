import test from "node:test";
import assert from "node:assert/strict";
import {
  ResponseCache,
  buildChatCacheKey,
  isViewDependentPrompt,
} from "../lib/assistant/cache.ts";

test("global prompts share cache keys across different camera centers while view-dependent prompts stay distinct", () => {
  const ctxA = {
    view: "2d",
    timeline: "Today",
    imagery: "SPHEREx color",
    map_center: { ra_deg: 10.12, dec_deg: 41.27 },
    field_of_view_deg: 12.4,
    hovering: null,
    places_in_view: ["Andromeda Galaxy"],
  };
  const ctxB = {
    ...ctxA,
    map_center: { ra_deg: 210.88, dec_deg: -18.55 },
    field_of_view_deg: 24.0,
    places_in_view: ["Spica"],
  };

  const globalMsgs = [{ role: "user", text: "  Where does SPHEREx   look for ice? " }];
  assert.equal(isViewDependentPrompt(globalMsgs), false);
  assert.equal(
    buildChatCacheKey("gemini-3.5-flash-lite", globalMsgs, ctxA),
    buildChatCacheKey(
      "gemini-3.5-flash-lite",
      [{ role: "user", text: "where does spherex look for ice?" }],
      ctxB,
    ),
  );

  const viewMsgs = [{ role: "user", text: "What am I looking at right now?" }];
  assert.equal(isViewDependentPrompt(viewMsgs), true);
  assert.notEqual(
    buildChatCacheKey("gemini-3.5-flash-lite", viewMsgs, ctxA),
    buildChatCacheKey("gemini-3.5-flash-lite", viewMsgs, ctxB),
  );
});

test("ResponseCache enforces LRU capacity, TTL expiry, and concurrent in-flight deduplication", async () => {
  const cache = new ResponseCache(2, 1000);
  cache.set("a", "alpha", undefined, 100);
  cache.set("b", "beta", undefined, 100);
  assert.equal(cache.get("a", 200), "alpha"); // refreshes 'a' as most recent
  cache.set("c", "gamma", undefined, 200); // evicts 'b'
  assert.equal(cache.get("b", 250), undefined);
  assert.equal(cache.get("a", 250), "alpha");
  assert.equal(cache.get("a", 1200), undefined); // expired

  let calls = 0;
  const compute = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 20));
    return { value: { reply: "Orion" } };
  };

  const [r1, r2] = await Promise.all([
    cache.getOrCompute("orion", compute),
    cache.getOrCompute("orion", compute),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(r1.value, { reply: "Orion" });
  assert.deepEqual(r2.value, { reply: "Orion" });

  const r3 = await cache.getOrCompute("orion", compute);
  assert.equal(r3.hit, true);
  assert.equal(calls, 1);
});

test("ResponseCache does not persist failed or uncacheable upstream responses", async () => {
  const cache = new ResponseCache(10, 1000);
  let attempts = 0;

  await assert.rejects(() =>
    cache.getOrCompute("bad", async () => {
      attempts++;
      throw new Error("upstream 502");
    }),
  );
  assert.equal(cache.size, 0);

  const degraded = await cache.getOrCompute("uncacheable", async () => {
    attempts++;
    return { value: "fallback", cacheable: false };
  });
  assert.equal(degraded.value, "fallback");
  assert.equal(cache.get("uncacheable"), undefined);
  assert.equal(attempts, 2);
});
