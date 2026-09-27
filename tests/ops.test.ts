import test from "node:test";
import assert from "node:assert/strict";
import {
  simulate,
  discover,
  validateWorld,
  completedBeforeDispatch,
} from "../shared/ops/engine";
import { DEFAULT_OPS } from "../shared/ops/types";
import {
  eligibleFactors,
  memoryContracts,
  selectVariants,
  scopeMatches,
} from "../shared/ops/conditional-memory";
test("ops runs all six deliveries with bounded robot assignments", () => {
  const p = simulate(DEFAULT_OPS, "deadline", []);
  assert.equal(p.visits.length, 6);
  assert(p.visits.every((v) => v.robot < 3));
  assert(Number.isFinite(p.energy));
});
test("negative control paint has zero impact", () => {
  const r = discover(DEFAULT_OPS, "deadline", []).find(
    (r) => r.factor === "paint",
  )!;
  assert.deepEqual(r.affects, []);
  assert.deepEqual(r.delta, { delivered: 0, onTime: 0, energy: 0, minutes: 0 });
});
test("heavy payload unknown to planner causes actual overload", () => {
  const world = { ...DEFAULT_OPS, payload: 2, bridgeLimit: 6 };
  const p = simulate(world, "express", []);
  assert(p.visits.some((v) => v.status === "overload"));
  const q = simulate(world, "express", [
    "payload",
    "battery",
    "rain",
    "traffic",
  ]);
  assert(!q.visits.some((v) => v.status === "overload"));
});
test("forecast does not silently read unlearned rain or battery", () => {
  const a = simulate(DEFAULT_OPS, "express", [], false);
  const b = simulate(
    { ...DEFAULT_OPS, rain: 90, battery: 20 },
    "express",
    [],
    false,
  );
  assert.equal(a.energy, b.energy);
  assert.equal(a.onTime, b.onTime);
});
test("world conditions invalidate scoped relationships", () => {
  const records = discover(DEFAULT_OPS, "deadline", []);
  assert(eligibleFactors(records, DEFAULT_OPS).includes("rain"));
  assert.equal(
    memoryContracts(records, { ...DEFAULT_OPS, payload: 2 }).find(
      (r) => r.factor === "rain",
    )!.applicability,
    "needs_retest",
  );
});
test("paint does not invalidate physical context", () =>
  assert(scopeMatches(DEFAULT_OPS, { ...DEFAULT_OPS, paint: "teal" })));
test("Jev action overrides actually change execution", () => {
  const w = { ...DEFAULT_OPS, battery: 20 };
  const p = simulate(w, "express", []);
  const q = simulate(w, "express", [], true, { groceries: "charge" });
  assert(q.visits.find((v) => v.jobId === "groceries")!.charged);
  assert(
    q.visits.find((v) => v.jobId === "groceries")!.departure >
      p.visits.find((v) => v.jobId === "groceries")!.departure,
  );
});
test("robot count is an integer, not an allocation accident", () =>
  assert.throws(() => validateWorld({ ...DEFAULT_OPS, agents: 1.2 })));
test("more robots do not execute more than the six jobs", () =>
  assert.equal(
    simulate({ ...DEFAULT_OPS, agents: 8 }, "deadline", []).visits.length,
    6,
  ));

test("concurrent dispatches cannot observe another robots future result", () => {
  const plan = simulate(DEFAULT_OPS, "express", []);
  assert.equal(completedBeforeDispatch(plan, 1).length, 0);
  assert.equal(completedBeforeDispatch(plan, 2).length, 0);
  for (let i = 3; i < plan.visits.length; i++)
    assert(
      completedBeforeDispatch(plan, i).every(
        (v) => v.finish <= plan.visits[i].departure,
      ),
    );
});
