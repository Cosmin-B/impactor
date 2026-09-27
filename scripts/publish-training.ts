import { readFileSync, writeFileSync } from "node:fs";
const r = JSON.parse(readFileSync("training/result.json", "utf8"));
const report = {
  status: r.status,
  baseModel: r.base_model,
  trainCount: r.train_count,
  heldoutCount: r.heldout_count,
  steps: r.steps.map((s: any) => ({ step: s.step, loss: s.loss })),
  before: r.before,
  after: r.after,
  elapsedSeconds: r.finished_at
    ? Math.round(r.finished_at - r.started_at)
    : null,
  method:
    "Greedy decoding, 12-token limit, newline stop. Exact action match on nine held-out synthetic cases.",
  task: "Choose a corrective dispatch action after seeing the simulator outcome for the normal route.",
  limitations:
    "The baseline produced empty replies under this completion format. This measures adaptation to a narrow response protocol, not a general reasoning gain. With a 32-token limit and no newline stop on the same nine held-out prompts, the saved checkpoint returned 9/9 exact actions. The base began reasoning or explanatory text within that limit. Jev remains the live controller.",
};
writeFileSync(
  "shared/ops/river-training.json",
  JSON.stringify(report, null, 2),
);
