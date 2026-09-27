import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { DEFAULT_OPS, DEFAULT_GOAL } from "../shared/ops/types";
const base = process.env.BASE_URL || "http://127.0.0.1:4173",
  id = crypto.randomUUID(),
  world = {
    ...DEFAULT_OPS,
    rain: 65,
    payload: 1.6,
    battery: 45,
    bridgeLimit: 6,
  };
const result: any = { base, id };
async function call(action: string, extra: any = {}) {
  const t = Date.now();
  const r = await fetch(`${base}/api/ops/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, world, goal: DEFAULT_GOAL, ...extra }),
  });
  const d = await r.json();
  assert(r.ok, JSON.stringify(d));
  result[action] = d.state;
  console.log(action, Date.now() - t);
  writeFileSync("qa/ops-smoke.json", JSON.stringify(result, null, 2));
  return d.state;
}
await call("session");
const forecast = await call("forecast");
assert(forecast.forecast.decision.provider === "jev");
const run = await call("run");
const current = run.history.at(-1);
assert.equal(current.decisions.length, 6);
console.log({
  memorable: current.memory.memorable,
  delivered: current.plan.delivered,
  variants: run.variants.length,
  actions: current.decisions.map((d: any) => d.action),
});
const learned = await call("learn");
assert.equal(learned.relationships.length, 9);
const fresh = await call("session", { fresh: true });
assert.equal(fresh.relationships.length, 9);
assert(fresh.variants.length > 0);
console.log("Fresh agent recalled relationships and procedure variants.");
