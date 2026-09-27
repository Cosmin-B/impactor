import { createSession, executeRun } from "../server/engine";
import { brainCall } from "../server/ops/providers";
import { recallProcedure } from "../server/ops/service";
import type { ProviderKeys } from "../server/ops/providers";
import type {
  SessionState,
  MemoryRule,
  IntegrationStatus,
} from "../shared/types";
interface Env extends ProviderKeys {
  DB: D1Database;
}
export async function bridge(request: Request, env: Env) {
  const url = new URL(request.url),
    body = request.method === "POST" ? ((await request.json()) as any) : {};
  const cookie =
    request.headers
      .get("Cookie")
      ?.match(/impactor_bridge=([a-f0-9-]{36})/)?.[1] || crypto.randomUUID();
  const entity = `impactor-bridge-${cookie}`;
  if (!env.GBRAIN_TOKEN)
    return Response.json(
      { error: "GBrain is not configured." },
      { status: 503 },
    );
  const memory = await brainCall(env.GBRAIN_TOKEN, "recall", {
    entity,
    grep: "impactor.bridge.v2",
    limit: 30,
  });
  let rules: MemoryRule[] = [];
  for (const fact of memory.facts || []) {
    if (fact.expired_at) continue;
    try {
      const v = JSON.parse(fact.fact);
      if (v.schema === "impactor.bridge.v2") rules.push(v.rule);
    } catch {}
  }
  const status = (
    provider: "gbrain" | "memorable",
    connected: boolean,
  ): IntegrationStatus => ({
    provider,
    connected,
    configured: connected,
    state: connected ? "connected" : "unavailable",
    message: connected
      ? "Service access available."
      : "Service not configured.",
    checkedAt: new Date().toISOString(),
  });
  const integrations = {
    gbrain: status("gbrain", true),
    memorable: status("memorable", Boolean(env.MEMORABLE_API_KEY)),
  };
  let session: SessionState;
  let extra = {};
  if (url.pathname === "/api/status") return Response.json({ integrations });
  if (url.pathname === "/api/session" || url.pathname === "/api/reset") {
    if (url.pathname === "/api/reset") {
      for (const fact of memory.facts || [])
        if (
          !fact.expired_at &&
          String(fact.fact).includes("impactor.bridge.v2")
        )
          await brainCall(env.GBRAIN_TOKEN, "forget", {
            id: fact.fact_id ?? fact.id,
            reason: "Reset this synthetic bridge workspace.",
          });
      rules = [];
    }
    session = createSession(
      crypto.randomUUID(),
      rules,
      new Date().toISOString(),
    );
    session.agentName = "RO-" + session.id.slice(0, 3).toUpperCase();
  } else {
    const id = body.sessionId || url.searchParams.get("sessionId");
    const row = await env.DB.prepare("SELECT value FROM sessions WHERE id=?")
      .bind(`bridge:${cookie}:${id}`)
      .first<{ value: string }>();
    if (!row)
      return Response.json(
        { error: "Start a fresh agent to continue." },
        { status: 404 },
      );
    session = JSON.parse(row.value);
    if (url.pathname === "/api/run") {
      const w = body.world;
      if (
        !w ||
        !Number.isFinite(w.packageMass) ||
        !Number.isFinite(w.bridgeCapacity) ||
        w.packageMass < 1 ||
        w.packageMass > 12 ||
        w.bridgeCapacity < 1 ||
        w.bridgeCapacity > 12 ||
        !["coral", "teal", "gold"].includes(w.bridgeColor)
      )
        return Response.json(
          { error: "Invalid world settings." },
          { status: 400 },
        );
      const proc = rules.length
        ? await recallProcedure(env.MEMORABLE_API_KEY)
        : undefined;
      const procedure = proc
        ? {
            slug: "procedures/imported-verified-delivery",
            title: proc.title,
            source: "memorable" as const,
            steps: proc.steps.map((description, i) => ({
              seq: i + 1,
              action: "shell",
              description,
            })),
            postconditions: [],
          }
        : undefined;
      const result = executeRun(
        session,
        w,
        rules,
        new Date().toISOString(),
        procedure,
      );
      session = result.session;
      extra = { run: result.run };
    } else if (url.pathname === "/api/teach") {
      const rule: MemoryRule = {
        id: "package-mass-load",
        field: "packageMass",
        check: "load",
        source: "gbrain",
        reason: "When package mass changes, recheck bridge load.",
        provenance: "Human correction in the synthetic bridge experiment.",
        createdAt: new Date().toISOString(),
      };
      await brainCall(env.GBRAIN_TOKEN, "remember", {
        entity,
        fact: JSON.stringify({ schema: "impactor.bridge.v2", rule }),
        kind: "fact",
        provenance: "Impactor bridge demonstration",
        visibility: "world",
      });
      const confirmation = await brainCall(env.GBRAIN_TOKEN, "recall", {
        entity,
        grep: "impactor.bridge.v2",
        limit: 20,
      });
      if (
        !(confirmation.facts || []).some(
          (f: any) =>
            !f.expired_at && String(f.fact).includes("package-mass-load"),
        )
      )
        throw new Error("The lesson was not recalled.");
      session = {
        ...session,
        rules: [...session.rules.filter((r) => r.source === "baseline"), rule],
      };
      extra = {
        rule,
        recalled: true,
        procedure: {
          saved: false,
          message:
            "A verified Memorable procedure can be recalled on the next run.",
        },
      };
    } else if (url.pathname === "/api/export")
      return Response.json(
        {
          product: "Impactor",
          source: "Anonymous synthetic simulation",
          world: session.world,
          impactMap: rules,
          receipts: session.receipts,
          runs: session.history,
        },
        {
          headers: {
            "Content-Disposition":
              'attachment; filename="impactor-evidence.json"',
          },
        },
      );
    else
      return Response.json({ error: "Unknown bridge route." }, { status: 404 });
  }
  await env.DB.prepare(
    "INSERT INTO sessions(id,value,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
  )
    .bind(`bridge:${cookie}:${session.id}`, JSON.stringify(session), Date.now())
    .run();
  return Response.json(
    { session, integrations, ...extra },
    {
      headers: {
        "Set-Cookie": `impactor_bridge=${cookie}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`,
        "Cache-Control": "no-store",
      },
    },
  );
}
