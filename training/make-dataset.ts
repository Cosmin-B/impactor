import { writeFileSync } from "node:fs";
import { simulate } from "../shared/ops/engine";
import { DEFAULT_OPS } from "../shared/ops/types";
const buckets: Record<string, any[]> = { normal: [], charge: [], detour: [] };
for (const rain of [0, 20, 45, 65, 85])
  for (const payload of [0.6, 0.9, 1.2, 1.6, 1.9])
    for (const battery of [20, 35, 55, 75, 95])
      for (const bridgeLimit of [4, 6, 8, 12]) {
        const world = { ...DEFAULT_OPS, rain, payload, battery, bridgeLimit };
        const results = ["normal", "charge", "detour"].map((action) => ({
          action,
          v: simulate(world, "express", [], true, { groceries: action })
            .visits[0],
        }));
        const score = (v: (typeof results)[number]["v"]) =>
          (v.status === "delivered"
            ? 1000
            : v.status === "late"
              ? 500
              : -1000) - v.arrival;
        results.sort((a, b) => score(b.v) - score(a.v));
        const best = results[0];
        if (!["delivered", "late"].includes(best.v.status)) continue;
        const baseline = results.find((r) => r.action === "normal")!.v;
        const prompt = `Choose the next robot dispatch action: normal, charge, or detour. Deliver safely, then minimize arrival time. Charge adds 11 minutes. Detour avoids the bridge.\nState: ${JSON.stringify({ rain_pct: rain, parcel_kg: 4 * payload, battery_pct: battery, bridge_capacity_kg: bridgeLimit, planned_route: baseline.path, normal_outcome: baseline.status, normal_reason: baseline.reason })}\nAction:`;
        buckets[best.action].push({
          prompt,
          completion: best.action,
          world,
          source:
            "Computed outcomes for three interventions in the Impactor simulator",
        });
      }
const train: any[] = [],
  test: any[] = [];
for (const [action, items] of Object.entries(buckets)) {
  if (items.length < 12)
    throw Error(`Not enough ${action} examples: ${items.length}`);
  const selected = Array.from(
    { length: 12 },
    (_, i) => items[Math.floor((i * (items.length - 1)) / 11)],
  );
  train.push(...selected.slice(0, 9));
  test.push(...selected.slice(9));
}
writeFileSync(
  "training/dispatch-dataset.json",
  JSON.stringify({ train, test }, null, 2),
);
console.log({
  train: train.length,
  test: test.length,
  available: Object.fromEntries(
    Object.entries(buckets).map(([k, v]) => [k, v.length]),
  ),
});
