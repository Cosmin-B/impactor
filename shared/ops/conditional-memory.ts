import type { OpsWorld, Relationship, OpsRun } from "./types";
export interface ProcedureVariant {
  id: string;
  procedureTitle: string;
  goal: string;
  context: OpsWorld;
  actions: Array<{ job: string; action: string }>;
  outcome: { delivered: number; onTime: number; failed: number };
  sourceRun: string;
  createdAt: string;
}
export function scopeMatches(
  context: OpsWorld,
  current: OpsWorld,
  except?: keyof OpsWorld,
) {
  return (Object.keys(context) as Array<keyof OpsWorld>).every(
    (key) => key === "paint" || key === except || context[key] === current[key],
  );
}
export function memoryContracts(
  relationships: Relationship[],
  world: OpsWorld,
) {
  return relationships.map((r) => ({
    ...r,
    applicability: scopeMatches(r.context, world, r.factor)
      ? ("supported_here" as const)
      : ("needs_retest" as const),
    falsifier:
      "Repeating this controlled intervention in the same context produces a different measured effect.",
  }));
}
export function eligibleFactors(
  relationships: Relationship[],
  world: OpsWorld,
) {
  return memoryContracts(relationships, world)
    .filter((r) => r.applicability === "supported_here" && r.affects.length)
    .map((r) => r.factor);
}
export function selectVariants(
  variants: ProcedureVariant[],
  world: OpsWorld,
  goal: string,
) {
  return variants
    .map((v) => ({
      ...v,
      applicable: scopeMatches(v.context, world) && v.goal === goal,
    }))
    .sort(
      (a, b) =>
        Number(b.applicable) - Number(a.applicable) ||
        b.outcome.onTime - a.outcome.onTime,
    )
    .slice(0, 5);
}
export function makeVariant(run: OpsRun): ProcedureVariant | null {
  if (!run.procedure || !run.decisions?.length) return null;
  return {
    id: crypto.randomUUID(),
    procedureTitle: run.procedure.title,
    goal: run.goal,
    context: run.world,
    actions: run.decisions.map(({ job, action }) => ({ job, action })),
    outcome: {
      delivered: run.plan.delivered,
      onTime: run.plan.onTime,
      failed: run.plan.failed,
    },
    sourceRun: run.id,
    createdAt: run.createdAt,
  };
}
