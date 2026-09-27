import { riverDispatch } from "./river";
import {
  eligibleFactors,
  makeVariant,
  selectVariants,
} from "../../shared/ops/conditional-memory";
import {
  candidates,
  simulate,
  discover,
  JOBS,
  completedBeforeDispatch,
} from "../../shared/ops/engine";
import {
  DEFAULT_OPS,
  DEFAULT_GOAL,
  type OpsState,
  type OpsWorld,
  type OpsRun,
  type Relationship,
  type Plan,
} from "../../shared/ops/types";
import {
  choosePlan,
  dispatchDecision,
  recallRelationships,
  rememberRelationships,
  type ProviderKeys,
  recallVariants,
  saveVariant,
} from "./providers";
import library from "../../shared/ops/memorable-library.json";
export async function recallProcedure(key?: string) {
  if (!key) return undefined;
  try {
    const response = await fetch(
      "https://memorable-extraction-api.memorable.workers.dev/v1/embed",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "x-memorable-client": "memorable-cli/0.5.30",
        },
        body: JSON.stringify({
          text: "Recheck a simulated delivery route after load inputs change, verify the result and choose a safe route.",
          input_type: "query",
        }),
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) return undefined;
    const value = (await response.json()) as { embedding?: number[] };
    if (!Array.isArray(value.embedding)) return undefined;
    const dot = (a: number[], b: number[]) =>
      a.length !== b.length
        ? -1
        : a.reduce((s, n, i) => s + n * b[i], 0) /
          Math.sqrt(
            a.reduce((s, n) => s + n * n, 0) * b.reduce((s, n) => s + n * n, 0),
          );
    const ranked = library
      .map((p) => ({ p, score: dot(value.embedding!, p.embedding) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best || best.score < 0.28) return undefined;
    return {
      title: best.p.title,
      steps: best.p.steps.map((s) => s.command || s.action),
      source: "Memorable semantic recall over this app’s verified procedures",
    };
  } catch {
    return undefined;
  }
}
export async function createOps(
  id: string,
  keys: ProviderKeys,
): Promise<OpsState> {
  if (!keys.GBRAIN_TOKEN) throw new Error("GBrain is not configured.");
  return {
    id,
    world: { ...DEFAULT_OPS },
    goal: DEFAULT_GOAL,
    history: [],
    relationships: await recallRelationships(keys.GBRAIN_TOKEN, id),
    variants: await recallVariants(keys.GBRAIN_TOKEN, id),
    round: 0,
  };
}
export async function forecastOps(
  state: OpsState,
  world: OpsWorld,
  goal: string,
  keys: ProviderKeys,
): Promise<OpsState> {
  if (!keys.GBRAIN_TOKEN || !keys.TYPESAFE_API_KEY)
    throw new Error("GBrain and Jev must be configured.");
  const relationships = await recallRelationships(keys.GBRAIN_TOKEN, state.id),
    known = eligibleFactors(relationships, world);
  const plans = candidates(world, known),
    recalled = await recallProcedure(keys.MEMORABLE_API_KEY),
    variants = await recallVariants(keys.GBRAIN_TOKEN, state.id);
  const procedure = recalled
    ? { ...recalled, variants: selectVariants(variants, world, goal) }
    : undefined;
  const decision = await choosePlan(
    keys.TYPESAFE_API_KEY,
    goal,
    world,
    plans,
    relationships,
    procedure,
  );
  return {
    ...state,
    relationships,
    forecast: { world, goal, decision, plans, known, procedure },
  };
}
export async function runOps(
  state: OpsState,
  world: OpsWorld,
  goal: string,
  keys: ProviderKeys,
  hotLoop = true,
  controller: "jev" | "river" = "jev",
): Promise<OpsState> {
  if (!keys.GBRAIN_TOKEN || !keys.TYPESAFE_API_KEY)
    throw new Error("GBrain and Jev must be configured.");
  if (!["jev", "river"].includes(controller))
    throw Error("Choose a valid dispatch controller.");
  const relationships = await recallRelationships(keys.GBRAIN_TOKEN, state.id);
  const known = eligibleFactors(relationships, world);
  const cached =
    state.forecast &&
    JSON.stringify(state.forecast.world) === JSON.stringify(world) &&
    state.forecast.goal === goal &&
    state.forecast.known.join() === known.join()
      ? state.forecast
      : undefined;
  const prepared =
    cached || (await forecastOps(state, world, goal, keys)).forecast!;
  const { plans, procedure, decision } = prepared;
  const forecast = plans.find((p) => p.policy === decision.choice)!;
  const overrides: Record<string, string> = {},
    decisions: NonNullable<OpsRun["decisions"]> = [];
  let plan = simulate(world, decision.choice, known);
  if (hotLoop)
    for (let i = 0; i < JOBS.length; i++) {
      const predicted = simulate(
        world,
        decision.choice,
        known,
        false,
        overrides,
      ).visits[i];
      const selected =
        controller === "river"
          ? await riverDispatch(keys, world, plan.visits[i])
          : {
              ...(await dispatchDecision(
                keys.TYPESAFE_API_KEY,
                goal,
                world,
                predicted,
                completedBeforeDispatch(plan, i),
                relationships,
              )),
              provider: "jev" as const,
            };
      overrides[predicted.jobId] = selected.action;
      plan = simulate(world, decision.choice, known, true, overrides);
      decisions.push({ job: predicted.jobId, ...selected });
    }
  const previous = state.history.at(-1)?.plan;
  const run: OpsRun = {
    controller: hotLoop ? controller : "none",
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    goal,
    world: { ...world },
    plan,
    alternatives: plans,
    decision,
    forecast,
    decisions,
    relationships,
    scaling: [1, 2, 3, 4, 6, 8].map((agents) => {
      const p = simulate({ ...world, agents }, decision.choice, known, false);
      return { agents, minutes: p.minutes, onTime: p.onTime };
    }),
    ...(previous
      ? {
          previous: {
            delivered: previous.delivered,
            onTime: previous.onTime,
            failed: previous.failed,
          },
        }
      : {}),
    memory: {
      gbrain: true,
      memorable: Boolean(procedure),
      message: procedure
        ? "Retrieved a verified checking procedure through Memorable semantic search."
        : "No matching Memorable procedure was recalled.",
    },
    procedure,
  };
  const variant = makeVariant(run);
  if (variant) await saveVariant(keys.GBRAIN_TOKEN, state.id, variant);
  const variants = await recallVariants(keys.GBRAIN_TOKEN, state.id);
  return {
    ...state,
    forecast: undefined,
    world,
    goal,
    variants,
    round: state.round + 1,
    relationships,
    history: [...state.history.slice(-19), run],
  };
}
export async function learnOps(
  state: OpsState,
  world: OpsWorld,
  keys: ProviderKeys,
): Promise<OpsState> {
  if (!keys.GBRAIN_TOKEN) throw new Error("GBrain is not configured.");
  const policy = state.history.at(-1)?.plan.policy || "deadline";
  const relationships = discover(
    world,
    policy,
    eligibleFactors(state.relationships, world),
  );
  const recalled = await rememberRelationships(
    keys.GBRAIN_TOKEN,
    state.id,
    relationships,
  );
  if (
    recalled.length !== relationships.length ||
    recalled.some(
      (r, i) =>
        r.factor !== relationships[i].factor ||
        JSON.stringify(r.context) !==
          JSON.stringify(relationships[i].context) ||
        JSON.stringify(r.delta) !== JSON.stringify(relationships[i].delta),
    )
  )
    throw new Error("GBrain experiment recall did not match.");
  return { ...state, relationships: recalled };
}
