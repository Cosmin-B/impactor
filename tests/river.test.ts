import test from "node:test";
import assert from "node:assert/strict";
import { parseRiverAction, riverState } from "../server/ops/river";
import { simulate } from "../shared/ops/engine";
import { DEFAULT_OPS } from "../shared/ops/types";
test("River action is admitted without inventing confidence", () => {
  assert.deepEqual(
    parseRiverAction({ provider: "river", action: "detour", latencyMs: 15 }),
    {
      provider: "river",
      action: "detour",
      latencyMs: 15,
      confidence: null,
      checkpoint: "impactor-dispatch-v1",
    },
  );
  assert.throws(() =>
    parseRiverAction({ provider: "river", action: "go faster", latencyMs: 15 }),
  );
  assert.throws(() =>
    parseRiverAction({ provider: "jev", action: "charge", latencyMs: 15 }),
  );
});
test("River prompt uses this job mass and labels a simulated preflight", () => {
  const world = { ...DEFAULT_OPS, payload: 2, bridgeLimit: 6 };
  const plan = simulate(world, "express", []);
  const state = riverState(world, plan.visits[0]);
  assert.equal(state.parcel_kg, plan.visits[0].mass);
  assert.equal(state.normal_outcome, "overload");
  const action = parseRiverAction({
    provider: "river",
    action: "detour",
    latencyMs: 15,
  }).action;
  const revised = simulate(world, "express", [], true, {
    [plan.visits[0].jobId]: action,
  });
  assert.notEqual(revised.visits[0].status, "overload");
  assert.notDeepEqual(revised.visits[0].path, plan.visits[0].path);
});
