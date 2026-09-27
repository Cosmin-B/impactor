import type { OpsWorld, Visit } from "../../shared/ops/types";
import type { ProviderKeys } from "./providers";
export function riverState(world: OpsWorld, preflight: Visit) {
  return {
    rain_pct: world.rain,
    parcel_kg: preflight.mass,
    battery_pct: preflight.batteryBefore ?? world.battery,
    bridge_capacity_kg: world.bridgeLimit,
    planned_route: preflight.path,
    normal_outcome: preflight.status,
    normal_reason: preflight.reason,
  };
}
export function parseRiverAction(data: any) {
  if (
    data?.provider !== "river" ||
    !["normal", "charge", "detour"].includes(data?.action) ||
    !Number.isFinite(data?.latencyMs)
  )
    throw Error(
      "River returned an invalid dispatch action. No fallback was used.",
    );
  return {
    action: data.action as string,
    confidence: null,
    latencyMs: data.latencyMs as number,
    provider: "river" as const,
    checkpoint: String(data.checkpoint || "impactor-dispatch-v1"),
  };
}
export async function riverDispatch(
  keys: ProviderKeys,
  world: OpsWorld,
  preflight: Visit,
) {
  if (!keys.RIVER_RELAY_URL || !keys.RIVER_RELAY_TOKEN)
    throw Error(
      "The River controller is not connected. Choose Jev or reconnect the River relay.",
    );
  const response = await fetch(
    `${keys.RIVER_RELAY_URL.replace(/\/$/, "")}/decide`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${keys.RIVER_RELAY_TOKEN}`,
      },
      body: JSON.stringify({ state: riverState(world, preflight) }),
      redirect: "manual",
      signal: AbortSignal.timeout(55000),
    },
  );
  if (!response.ok)
    throw Error(
      `River controller unavailable (HTTP ${response.status}). No fallback was used.`,
    );
  return {
    ...parseRiverAction(await response.json()),
    preflightStatus: preflight.status,
  };
}
