import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WORK,
  buildTasks,
  scheduleWork,
  rememberWork,
  validateWork,
} from "../shared/workplace/engine";
test("workplace executes every task after its prerequisites", () => {
  const r = scheduleWork(DEFAULT_WORK);
  const rows = new Map(r.tasks.map((t) => [t.id, t]));
  assert.equal(r.tasks.length, 121);
  for (const t of r.tasks)
    for (const dep of t.deps) assert(t.start >= rows.get(dep)!.finish);
});
test("agents and shared build slots never execute overlapping work", () => {
  const r = scheduleWork({ ...DEFAULT_WORK, agents: 100 });
  for (const key of ["agent", "resourceSlot"] as const) {
    const groups = new Map<string, typeof r.tasks>();
    for (const t of r.tasks) {
      if (key === "resourceSlot" && !t.resource) continue;
      const id =
        key === "agent" ? String(t.agent) : `${t.resource}:${t.resourceSlot}`;
      groups.set(id, [...(groups.get(id) || []), t]);
    }
    for (const rows of groups.values()) {
      rows.sort((a, b) => a.start - b.start);
      for (let i = 1; i < rows.length; i++)
        assert(rows[i].start >= rows[i - 1].finish);
    }
  }
});
test("memory reuses only matching task conditions and their dependency closure", () => {
  const first = scheduleWork(DEFAULT_WORK);
  const memory = rememberWork(first);
  const same = scheduleWork({ ...DEFAULT_WORK, useMemory: true }, memory);
  assert.equal(same.reused, 121);
  const changed = scheduleWork(
    { ...DEFAULT_WORK, useMemory: true, codeRevision: 2 },
    memory,
  );
  assert(changed.reused > 0 && changed.reused < 121);
  assert(changed.tasks.filter((t) => t.stage === 1).every((t) => t.reused));
  assert(
    changed.tasks
      .filter((t) => t.stage === 4 || t.stage === 7)
      .every((t) => !t.reused),
  );
});
test("100 agents do not manufacture savings in actual work tokens", () => {
  const small = scheduleWork({ ...DEFAULT_WORK, agents: 3 });
  const big = scheduleWork({ ...DEFAULT_WORK, agents: 100 });
  assert.equal(small.tokens, big.tokens);
  assert(big.busyAgents <= big.tasks.length);
  assert(big.minutes > 0);
});
test("one-owner handoffs reduce estimated broadcast cost at the same fleet size", () => {
  const s = { ...DEFAULT_WORK, agents: 100 };
  const baseline = scheduleWork(s, undefined, "baseline"),
    planned = scheduleWork(s);
  assert(planned.handoffMessages < baseline.handoffMessages);
  assert(planned.apiCost < baseline.apiCost);
});
test("different goals cannot reuse each others memories", () => {
  const r = scheduleWork(DEFAULT_WORK);
  assert.equal(
    scheduleWork(
      { ...DEFAULT_WORK, mission: "incident", useMemory: true },
      rememberWork(r),
    ).reused,
    0,
  );
});
test("workplace rejects fractional or excessive agent allocations", () => {
  assert.throws(() => validateWork({ ...DEFAULT_WORK, agents: 101 }));
  assert.throws(() => validateWork({ ...DEFAULT_WORK, agents: 3.5 }));
});
