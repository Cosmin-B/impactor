import test from "node:test";
import assert from "node:assert/strict";
import { choosePlan, JevUnavailable } from "../server/ops/providers";
import { candidates } from "../shared/ops/engine";
import { DEFAULT_OPS, DEFAULT_GOAL } from "../shared/ops/types";
test("Jev billing failure produces an honestly labeled deterministic plan", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("{}", { status: 402 });
    const plans = candidates(DEFAULT_OPS, []);
    const decision = await choosePlan(
      "test",
      DEFAULT_GOAL,
      DEFAULT_OPS,
      plans,
      [],
      undefined,
    );
    assert.equal(decision.provider, "local");
    assert.equal(decision.confidence, null);
    assert.deepEqual(decision.probabilities, {});
    assert.match(decision.reason, /no API credits/);
    assert.equal(
      plans.find((p) => p.policy === decision.choice)!.score,
      Math.max(...plans.map((p) => p.score)),
    );
    globalThis.fetch = async () => new Response("{}", { status: 500 });
    await assert.rejects(
      choosePlan("test", DEFAULT_GOAL, DEFAULT_OPS, plans, [], undefined),
      JevUnavailable,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("a billing failure can complete a shift through River without mislabeling decisions", async () => {
  const { runOps } = await import("../server/ops/service");
  const original = globalThis.fetch;
  let jevCalls = 0,
    riverCalls = 0;
  try {
    globalThis.fetch = async (url, init) => {
      const u = String(url),
        body = JSON.parse(String(init?.body || "{}"));
      if (u.includes("typesafe.ai")) {
        jevCalls++;
        return new Response("{}", { status: 402 });
      }
      if (u.includes("relay.test")) {
        riverCalls++;
        return Response.json({
          action: "normal",
          provider: "river",
          latencyMs: 10,
        });
      }
      if (u.includes("gbrain.io"))
        return Response.json({
          jsonrpc: "2.0",
          id: body.id,
          result:
            body.method === "initialize"
              ? { protocolVersion: "2025-03-26" }
              : { structuredContent: { facts: [] } },
        });
      throw Error("Unexpected provider");
    };
    const state = {
      id: crypto.randomUUID(),
      world: DEFAULT_OPS,
      goal: DEFAULT_GOAL,
      history: [],
      relationships: [],
      variants: [],
      round: 0,
    };
    const result = await runOps(
      state,
      DEFAULT_OPS,
      DEFAULT_GOAL,
      {
        GBRAIN_TOKEN: "test",
        TYPESAFE_API_KEY: "test",
        RIVER_RELAY_URL: "https://relay.test",
        RIVER_RELAY_TOKEN: "test",
      },
      true,
      "jev",
    );
    const run = result.history.at(-1)!;
    assert.equal(jevCalls, 1);
    assert.equal(riverCalls, 6);
    assert.equal(run.controller, "river");
    assert.equal(run.decision.provider, "local");
    assert.equal(run.decisions?.length, 6);
    assert(run.decisions!.every((d) => d.provider === "river"));
    assert.match(run.warning!, /credits exhausted/);
  } finally {
    globalThis.fetch = original;
  }
});
