import {workplace} from '../server/workplace/service';
import { bridge } from "./bridge";
import {
  createOps,
  learnOps,
  runOps,
  forecastOps,
} from "../server/ops/service";
import { validateWorld } from "../shared/ops/engine";
import type { OpsState } from "../shared/ops/types";
import type { ProviderKeys } from "../server/ops/providers";
interface Env extends ProviderKeys {
  DB: D1Database;
  ASSETS: Fetcher;
}
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin)
      return json({ error: "Use the app on its own domain." }, 403);
    if (url.pathname === "/api/ops/status")
      return json({
        gbrain: Boolean(env.GBRAIN_TOKEN),
        jev: Boolean(env.TYPESAFE_API_KEY),
        memorable: Boolean(env.MEMORABLE_API_KEY),
        river: Boolean(env.RIVER_RELAY_URL && env.RIVER_RELAY_TOKEN),
        deployment: "Cloudflare Workers + D1",
      });
    try {
      if (url.pathname.startsWith('/api/work/')) {
        if(request.method!=='POST') return json({error:'Use POST.'},405);
        const payload=await request.text(); if(payload.length>32000)return json({error:'Request too large.'},413);
        const day=new Date().toISOString().slice(0,10);
        const quota=await env.DB.prepare('INSERT INTO quota(day,calls) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET calls=calls+1 RETURNING calls').bind(day).first<{calls:number}>();
        if((quota?.calls||0)>1000)return json({error:'Daily demo allowance reached.'},429);
        return json(await workplace(url.pathname.split('/').at(-1)!,JSON.parse(payload),env));
      }
      if (!url.pathname.startsWith("/api/ops/"))
        return await bridge(request, env);
      if (request.method !== "POST")
        return json({ error: "Use POST for this endpoint." }, 405);
      const text = await request.text();
      if (text.length > 16000)
        return json({ error: "Request too large." }, 413);
      const body = JSON.parse(text);
      const id = body.id;
      if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id))
        return json({ error: "Start a fresh workspace." }, 400);
      const day = new Date().toISOString().slice(0, 10);
      const quota = await env.DB.prepare(
        "INSERT INTO quota(day,calls) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET calls=calls+1 RETURNING calls",
      )
        .bind(day)
        .first<{ calls: number }>();
      if ((quota?.calls || 0) > 1000)
        return json(
          { error: "The public demo has reached today’s request allowance." },
          429,
        );
      const record = await env.DB.prepare(
        "SELECT value FROM sessions WHERE id=?",
      )
        .bind(id)
        .first<{ value: string }>();
      let state: OpsState = record
        ? JSON.parse(record.value)
        : await createOps(id, env);
      if (url.pathname === "/api/ops/session") {
        if (body.fresh) state = await createOps(id, env);
      } else if (url.pathname === "/api/ops/forecast") {
        state = await forecastOps(
          state,
          validateWorld(body.world),
          String(body.goal || "").slice(0, 600),
          env,
        );
      } else if (url.pathname === "/api/ops/run") {
        const goal = String(body.goal || "").slice(0, 600);
        if (!goal.trim()) return json({ error: "Give the fleet a goal." }, 400);
        state = await runOps(
          state,
          validateWorld(body.world),
          goal,
          env,
          body.hotLoop !== false,
          body.controller || "jev",
        );
      } else if (url.pathname === "/api/ops/learn")
        state = await learnOps(state, validateWorld(body.world), env);
      else return json({ error: "Unknown API route." }, 404);
      await env.DB.prepare(
        "INSERT INTO sessions(id,value,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
      )
        .bind(id, JSON.stringify(state), Date.now())
        .run();
      return json({ state });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The request could not complete.";
      return json(
        {
          error: message.replace(
            /(?:Bearer\s+\S+|(?:sk|gbu|mk)_[A-Za-z0-9_-]+)/g,
            "[redacted]",
          ),
        },
        503,
      );
    }
  },
};
