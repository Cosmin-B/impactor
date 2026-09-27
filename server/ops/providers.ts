import type {
  Decision,
  Plan,
  Policy,
  Relationship,
  OpsWorld,
  Visit,
} from "../../shared/ops/types";
export interface ProviderKeys {
  GBRAIN_TOKEN?: string;
  RIVER_RELAY_URL?: string;
  RIVER_RELAY_TOKEN?: string;
  TYPESAFE_API_KEY?: string;
  MEMORABLE_API_KEY?: string;
}
export async function brainCall(
  key: string,
  name: string,
  args: Record<string, unknown>,
): Promise<any> {
  const headers: Record<string, string> = {
    Authorization: key.startsWith("Bearer ") ? key : `Bearer ${key}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  async function rpc(body: any) {
    const response = await fetch("https://gbrain.io/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`GBrain HTTP ${response.status}`);
    const sid = response.headers.get("Mcp-Session-Id");
    if (sid) headers["Mcp-Session-Id"] = sid;
    const text = await response.text();
    if (!text.trim()) return {};
    if (response.headers.get("content-type")?.includes("event-stream")) {
      const found = text
        .split("\n\n")
        .flatMap((e) =>
          e
            .split("\n")
            .filter((l) => l.startsWith("data:"))
            .map((l) => JSON.parse(l.slice(5))),
        )
        .find((m) => m.id === body.id);
      return found || {};
    }
    return JSON.parse(text);
  }
  const init = await rpc({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "impactor", version: "2.0.0" },
    },
  });
  headers["MCP-Protocol-Version"] =
    init.result?.protocolVersion || "2025-03-26";
  await rpc({ jsonrpc: "2.0", method: "notifications/initialized" });
  const response = await rpc({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name, arguments: args },
  });
  if (response.error || response.result?.isError)
    throw new Error("GBrain memory operation failed.");
  if (response.result?.structuredContent)
    return response.result.structuredContent;
  for (const c of response.result?.content || []) {
    try {
      return JSON.parse(c.text);
    } catch {}
  }
  throw new Error("GBrain returned no data.");
}
export async function recallRelationships(
  key: string,
  id: string,
): Promise<Relationship[]> {
  const r = await brainCall(key, "recall", {
    entity: `impactor-ops-${id}`,
    grep: "impactor.ops.v1",
    limit: 20,
  });
  const records: Array<{ createdAt: number; relationships: Relationship[] }> =
    [];
  for (const f of r.facts || []) {
    if (f.expired_at || f.superseded_by) continue;
    try {
      const v = JSON.parse(f.fact);
      if (
        v.schema === "impactor.ops.v1" &&
        v.id === id &&
        Array.isArray(v.relationships)
      )
        records.push({
          createdAt: Number(v.createdAt) || 0,
          relationships: v.relationships,
        });
    } catch {}
  }
  records.sort((a, b) => b.createdAt - a.createdAt);
  return (records[0]?.relationships || []).map((p) => ({
    ...p,
    source: "gbrain",
  }));
}
export async function rememberRelationships(
  key: string,
  id: string,
  relationships: Relationship[],
) {
  const result = await brainCall(key, "remember", {
    entity: `impactor-ops-${id}`,
    fact: JSON.stringify({
      schema: "impactor.ops.v1",
      id,
      createdAt: Date.now(),
      relationships,
    }),
    kind: "fact",
    provenance:
      "Synthetic Impactor controlled experiment; observed simulator outputs",
    visibility: "world",
  });
  if (!["inserted", "duplicate", "superseded"].includes(result.status))
    throw new Error("GBrain did not confirm the experiments.");
  return recallRelationships(key, id);
}
export async function jev(
  key: string,
  state: unknown,
  questions: Record<string, unknown>,
) {
  const start = Date.now();
  const r = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "jev-latest", state, questions }),
    redirect: "manual",
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error(`Jev HTTP ${r.status}`);
  const data = (await r.json()) as any;
  return { ...data, latencyMs: Date.now() - start };
}
export async function choosePlan(
  key: string,
  goal: string,
  world: OpsWorld,
  plans: Plan[],
  relationships: Relationship[],
  procedure: unknown,
): Promise<Decision> {
  const data = await jev(
    key,
    {
      goal,
      world,
      forecasts: plans.map(({ visits, ...p }) => p),
      knownRelationships: relationships,
      procedure,
    },
    {
      plan: {
        type: "choice",
        instructions:
          "Choose the dispatch strategy that best serves the user goal using the forecast tradeoffs. Missing learned dependencies make forecasts uncertain. The candidates are predictions, not guaranteed outcomes. Prefer fewer failed deliveries; use goal priorities to trade deadlines and energy.",
        criteria: {
          express: "Shortest routes and job input order.",
          deadline: "Process earliest deadlines first.",
          resilient: "Prioritize fragile orders and charge earlier.",
          economy: "Light parcels first to conserve energy.",
        },
      },
      focus: {
        type: "choice",
        instructions: "Which outcome is the user goal most concerned about?",
        criteria: {
          deadlines: "On-time delivery",
          energy: "Saving energy",
          reliability: "Avoiding failed deliveries",
          cold: "Protecting chilled goods",
        },
      },
    },
  );
  const answer = data.answers?.plan;
  if (
    !plans.some((p) => p.policy === answer?.choice) ||
    typeof answer.confidence !== "number"
  )
    throw new Error("Jev returned an invalid plan selection.");
  return {
    provider: "jev",
    model: data.model,
    choice: answer.choice,
    confidence: answer.confidence,
    probabilities: answer.probabilities,
    inputTokens: data.usage?.input_tokens || 0,
    latencyMs: data.latencyMs,
    focus: data.answers?.focus?.choice,
    reason: `Jev selected ${plans.find((p) => p.policy === answer.choice)!.name.toLowerCase()} from the forecast tradeoffs.`,
  };
}
export async function dispatchDecision(
  key: string,
  goal: string,
  world: OpsWorld,
  next: Visit,
  observed: Visit[],
  relationships: Relationship[],
) {
  const data = await jev(
    key,
    {
      goal,
      world,
      nextForecast: next,
      observedSoFar: observed.map((v) => ({
        job: v.jobId,
        status: v.status,
        reason: v.reason,
      })),
      relationships,
    },
    {
      action: {
        type: "choice",
        instructions:
          "Choose the next bounded dispatch action. This is a simulated delivery. Use nextForecast, the outcomes of jobs completed before this dispatch, the goal, and known relationships. Charge if there is evidence of insufficient battery; detour if there is evidence of overloaded bridge risk. Do not hold simply because observations are incomplete. Dispatch normally when no intervention is needed. Only select one action.",
        criteria: {
          normal: "Dispatch the currently planned route.",
          charge: "Fully charge before this job; costs additional time.",
          detour: "Avoid the old bridge on this job.",
          hold: "Hold an infeasible job for human review.",
        },
      },
    },
  );
  const a = data.answers?.action;
  if (
    !["normal", "charge", "detour", "hold"].includes(a?.choice) ||
    typeof a.confidence !== "number"
  )
    throw new Error("Jev returned an invalid dispatch action.");
  return {
    action: a.choice,
    confidence: a.confidence,
    latencyMs: data.latencyMs,
    tokens: data.usage?.input_tokens || 0,
  };
}

export async function recallVariants(key: string, id: string) {
  const result = await brainCall(key, "recall", {
    entity: `impactor-procedures-${id}`,
    grep: "impactor.conditional-procedure.v1",
    limit: 12,
  });
  const variants = [];
  for (const f of result.facts || []) {
    if (f.expired_at || f.superseded_by) continue;
    try {
      const v = JSON.parse(f.fact);
      if (
        v.schema === "impactor.conditional-procedure.v1" &&
        v.owner === id &&
        Array.isArray(v.variant?.actions)
      )
        variants.push(v.variant);
    } catch {}
  }
  return variants;
}
export async function saveVariant(key: string, id: string, variant: unknown) {
  const r = await brainCall(key, "remember", {
    entity: `impactor-procedures-${id}`,
    fact: JSON.stringify({
      schema: "impactor.conditional-procedure.v1",
      owner: id,
      variant,
    }),
    kind: "fact",
    provenance:
      "Impactor conditional extension of a Memorable procedure; actual dispatch decisions and outcomes",
    visibility: "world",
  });
  if (!["inserted", "duplicate", "superseded"].includes(r.status))
    throw new Error("Procedure variant was not saved.");
}
