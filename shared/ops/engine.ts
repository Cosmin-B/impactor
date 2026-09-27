import {
  DEFAULT_OPS,
  type OpsWorld,
  type Plan,
  type Place,
  type Road,
  type Job,
  type Policy,
  type Relationship,
  type Visit,
} from "./types";
export const PLACES: Place[] = [
  { id: "depot", name: "Dispatch", x: -8, z: 0, kind: "depot" },
  { id: "west", name: "West bank", x: -3, z: 0, kind: "junction" },
  { id: "east", name: "East bank", x: 3, z: 0, kind: "junction" },
  { id: "northw", name: "North road", x: -3, z: -6, kind: "junction" },
  { id: "northe", name: "North crossing", x: 3, z: -6, kind: "junction" },
  { id: "southw", name: "Charging", x: -3, z: 6, kind: "charge" },
  { id: "southe", name: "South crossing", x: 3, z: 6, kind: "junction" },
  { id: "cafe", name: "Corner café", x: 8, z: 0, kind: "stop" },
  { id: "office", name: "Workplace", x: 7, z: -6, kind: "stop" },
  { id: "studio", name: "Studio", x: 8, z: 6, kind: "stop" },
  { id: "market", name: "Market", x: -8, z: 6, kind: "stop" },
  { id: "garden", name: "Garden", x: -8, z: -6, kind: "stop" },
];
const road = (
  a: string,
  b: string,
  kind: Road["kind"] = "street",
  label = "Local road",
): Road => {
  const p = PLACES.find((p) => p.id === a)!,
    q = PLACES.find((p) => p.id === b)!;
  return { a, b, length: Math.hypot(p.x - q.x, p.z - q.z), kind, label };
};
export const ROADS: Road[] = [
  road("depot", "west"),
  road("west", "east", "bridge", "Old bridge"),
  road("east", "cafe"),
  road("depot", "garden"),
  road("garden", "northw"),
  road("northw", "northe", "highway", "North causeway"),
  road("northe", "office"),
  road("office", "cafe"),
  road("west", "northw"),
  road("depot", "market"),
  road("market", "southw"),
  road("southw", "southe", "highway", "South crossing"),
  road("southe", "studio"),
  road("studio", "cafe"),
  road("west", "southw"),
];
export const JOBS: Job[] = [
  {
    id: "groceries",
    name: "Chilled groceries",
    destination: "cafe",
    mass: 4,
    due: 32,
    priority: 3,
    cold: true,
  },
  {
    id: "flowers",
    name: "Event flowers",
    destination: "office",
    mass: 2,
    due: 35,
    priority: 2,
    cold: false,
  },
  {
    id: "equipment",
    name: "Studio equipment",
    destination: "studio",
    mass: 7,
    due: 60,
    priority: 2,
    cold: false,
  },
  {
    id: "supplies",
    name: "Market supplies",
    destination: "market",
    mass: 6,
    due: 42,
    priority: 1,
    cold: false,
  },
  {
    id: "seedlings",
    name: "Garden seedlings",
    destination: "garden",
    mass: 3,
    due: 45,
    priority: 1,
    cold: false,
  },
  {
    id: "lunch",
    name: "Team lunch",
    destination: "office",
    mass: 5,
    due: 65,
    priority: 3,
    cold: true,
  },
];
export const POLICY_NAMES: Record<Policy, string> = {
  express: "Shortest paths",
  deadline: "Urgent orders first",
  resilient: "Charge & protect",
  economy: "Conserve energy",
};
const policies = Object.keys(POLICY_NAMES) as Policy[];
function pathBetween(
  start: string,
  end: string,
  world: OpsWorld,
  mass: number,
  policy: Policy,
): string[] {
  const distance = new Map(PLACES.map((p) => [p.id, Infinity]));
  distance.set(start, 0);
  const prev = new Map<string, string>();
  const pending = new Set(PLACES.map((p) => p.id));
  while (pending.size) {
    const a = [...pending].sort(
      (a, b) => distance.get(a)! - distance.get(b)!,
    )[0];
    pending.delete(a);
    if (a === end || !Number.isFinite(distance.get(a)!)) break;
    for (const e of ROADS) {
      const b = e.a === a ? e.b : e.b === a ? e.a : null;
      if (!b || !pending.has(b)) continue;
      if (e.kind === "bridge" && mass > world.bridgeLimit) continue;
      const cost =
        e.length *
        (e.kind === "street" ? world.traffic : 1) *
        (1 + world.rain / 180) *
        (policy === "economy" && e.kind === "highway" ? 1.18 : 1);
      if (distance.get(a)! + cost < distance.get(b)!) {
        distance.set(b, distance.get(a)! + cost);
        prev.set(b, a);
      }
    }
  }
  if (!prev.has(end) && start !== end) return [];
  const path = [end];
  while (path[0] !== start) {
    const p = prev.get(path[0]);
    if (!p) return [];
    path.unshift(p);
  }
  return path;
}
function measure(path: string[], world: OpsWorld, mass: number) {
  let time = 0,
    energy = 0;
  for (let i = 1; i < path.length; i++) {
    const e = ROADS.find(
      (e) =>
        (e.a === path[i - 1] && e.b === path[i]) ||
        (e.b === path[i - 1] && e.a === path[i]),
    )!;
    time +=
      e.length *
      (e.kind === "street" ? world.traffic : 1) *
      (1 + world.rain / 140);
    energy += e.length * (0.68 + mass * 0.075) * (1 + world.rain / 100);
  }
  return { time, energy };
}
function perceived(world: OpsWorld, known: Set<string>): OpsWorld {
  return {
    ...world,
    rain: known.has("rain") ? world.rain : DEFAULT_OPS.rain,
    payload: known.has("payload") ? world.payload : 1,
    battery: known.has("battery") ? world.battery : DEFAULT_OPS.battery,
    traffic: known.has("traffic") ? world.traffic : 1,
    deadline: known.has("deadline") ? world.deadline : 1,
    liftClosed: known.has("liftClosed") ? world.liftClosed : false,
  };
}
export function simulate(
  world: OpsWorld,
  policy: Policy,
  known: string[],
  actual = true,
  overrides: Record<string, string> = {},
): Plan {
  const seen = perceived(world, new Set(known)),
    env = actual ? world : seen;
  const jobs = [...JOBS].sort((a, b) =>
    policy === "deadline"
      ? a.due - b.due || b.priority - a.priority
      : policy === "resilient"
        ? Number(b.cold) - Number(a.cold) || b.priority - a.priority
        : policy === "economy"
          ? a.mass - b.mass
          : 0,
  );
  const robots = Array.from({ length: world.agents }, () => ({
    available: 0,
    battery: env.battery,
  }));
  const visits: Visit[] = [];
  for (const job of jobs) {
    const robot = robots.reduce(
        (best, r, i) => (r.available < robots[best].available ? i : best),
        0,
      ),
      unit = robots[robot];
    let departure = unit.available;
    const plannedMass = job.mass * seen.payload,
      mass = job.mass * env.payload;
    const route = pathBetween(
        "depot",
        job.destination,
        overrides[job.id] === "detour" ? { ...seen, bridgeLimit: 0 } : seen,
        plannedMass,
        policy,
      ),
      back = pathBetween(job.destination, "depot", seen, 0, policy);
    const estimated = measure(route, seen, plannedMass),
      estimatedBack = measure(back, seen, 0);
    let charged = false;
    const budgetKnown = known.includes("battery") || policy === "resilient";
    if (
      overrides[job.id] === "charge" ||
      (budgetKnown &&
        unit.battery < estimated.energy + estimatedBack.energy + 8)
    ) {
      departure += policy === "resilient" ? 7 : 11;
      unit.battery = 100;
      charged = true;
    }
    const outbound = measure(route, env, mass),
      returning = measure(back, env, 0);
    const arrival = departure + outbound.time;
    let status: Visit["status"] = "delivered";
    let reason = "Arrived with a valid load and enough charge.";
    if (overrides[job.id] === "hold") {
      status = "blocked";
      reason = "Jev held this dispatch for review.";
    } else if (route.length === 0) {
      status = "blocked";
      reason = "No traversable route exists.";
    } else if (
      route.some(
        (n, i) =>
          i &&
          ROADS.some(
            (e) =>
              e.kind === "bridge" &&
              ((e.a === route[i - 1] && e.b === n) ||
                (e.b === route[i - 1] && e.a === n)),
          ),
      ) &&
      mass > env.bridgeLimit
    ) {
      status = "overload";
      reason = `${mass.toFixed(1)} kg exceeds the ${env.bridgeLimit} kg bridge limit.`;
    } else if (
      job.destination === "studio" &&
      env.liftClosed &&
      !seen.liftClosed
    ) {
      status = "blocked";
      reason =
        "The studio lift is closed; ground-floor handoff was not arranged.";
    } else if (unit.battery < outbound.energy + returning.energy) {
      status = "stranded";
      reason = `Trip requires ${(outbound.energy + returning.energy).toFixed(0)}% battery; robot has ${unit.battery.toFixed(0)}%.`;
    } else if (
      arrival + (seen.liftClosed && job.destination === "studio" ? 4 : 0) >
      job.due * env.deadline
    ) {
      status = "late";
      reason = `Arrival ${arrival.toFixed(0)} min exceeds the ${(job.due * env.deadline).toFixed(0)} min delivery window.`;
    }
    const energy = outbound.energy + returning.energy,
      finish =
        arrival +
        returning.time +
        2 +
        (seen.liftClosed && job.destination === "studio" ? 4 : 0);
    const batteryBefore = unit.battery;
    unit.battery = Math.max(0, unit.battery - energy);
    unit.available = finish;
    visits.push({
      jobId: job.id,
      robot,
      path: route,
      returnPath: back,
      departure,
      arrival,
      finish,
      mass,
      energy,
      batteryAfter: unit.battery,
      batteryBefore,
      status,
      reason,
      charged,
    });
  }
  const delivered = visits.filter(
      (v) => v.status === "delivered" || v.status === "late",
    ).length,
    onTime = visits.filter((v) => v.status === "delivered").length;
  const priorityDelivered = visits.reduce(
    (a, v) =>
      a +
      (v.status === "delivered"
        ? JOBS.find((j) => j.id === v.jobId)!.priority
        : 0),
    0,
  );
  return {
    policy,
    name: POLICY_NAMES[policy],
    visits,
    delivered,
    onTime,
    failed: JOBS.length - delivered,
    minutes: Math.max(...visits.map((v) => v.finish)),
    energy: visits.reduce((a, v) => a + v.energy, 0),
    priorityDelivered,
    chargeStops: visits.filter((v) => v.charged).length,
    score:
      onTime * 20 + priorityDelivered * 10 - (JOBS.length - delivered) * 60,
  };
}
export function candidates(world: OpsWorld, known: string[]) {
  return policies.map((p) => simulate(world, p, known, false));
}
export function discover(
  world: OpsWorld,
  policy: Policy,
  known: string[],
): Relationship[] {
  const probes: Record<keyof OpsWorld, [unknown, unknown]> = {
    agents: [1, 6],
    rain: [0, 90],
    payload: [0.6, 1.9],
    battery: [25, 100],
    bridgeLimit: [4, 18],
    traffic: [0.8, 2.5],
    deadline: [0.6, 1.7],
    liftClosed: [false, true],
    paint: ["coral", "teal"],
  };
  return (
    Object.entries(probes) as Array<[keyof OpsWorld, [unknown, unknown]]>
  ).map(([factor, [low, high]]) => {
    const a = simulate({ ...world, [factor]: low }, policy, known),
      b = simulate({ ...world, [factor]: high }, policy, known);
    const delta = {
      delivered: b.delivered - a.delivered,
      onTime: b.onTime - a.onTime,
      energy: Math.round((b.energy - a.energy) * 10) / 10,
      minutes: Math.round((b.minutes - a.minutes) * 10) / 10,
    };
    const affects = [
      ...(delta.delivered ? ["successful deliveries"] : []),
      ...(delta.onTime ? ["deadlines"] : []),
      ...(Math.abs(delta.energy) > 0.1 ? ["battery demand"] : []),
      ...(Math.abs(delta.minutes) > 0.1 ? ["trip duration"] : []),
    ];
    return {
      id: `relationship-${factor}`,
      policy,
      modelFactors: [...known],
      factor,
      label: `${factor}: ${String(low)} → ${String(high)}`,
      affects,
      measured: `${a.onTime} → ${b.onTime} on time; ${a.delivered} → ${b.delivered} delivered; ${a.energy.toFixed(0)} → ${b.energy.toFixed(0)} battery points; ${a.minutes.toFixed(0)} → ${b.minutes.toFixed(0)} min`,
      trials: 2,
      delta,
      source: "experiment",
      context: { ...world },
    };
  });
}
export function validateWorld(raw: unknown): OpsWorld {
  if (!raw || typeof raw !== "object")
    throw new Error("World settings are required.");
  const w = raw as Record<string, unknown>;
  const bounds: Record<string, [number, number]> = {
    agents: [1, 8],
    rain: [0, 100],
    payload: [0.5, 2],
    battery: [20, 100],
    bridgeLimit: [3, 20],
    traffic: [0.7, 3],
    deadline: [0.5, 2],
  };
  for (const [k, [min, max]] of Object.entries(bounds))
    if (
      typeof w[k] !== "number" ||
      !Number.isFinite(w[k]) ||
      w[k] < min ||
      w[k] > max
    )
      throw new Error(`Invalid ${k} setting.`);
  if (!Number.isInteger(w.agents))
    throw new Error("Fleet size must be a whole number.");
  if (
    typeof w.liftClosed !== "boolean" ||
    !["coral", "teal", "gold"].includes(String(w.paint))
  )
    throw new Error("Invalid world controls.");
  return w as unknown as OpsWorld;
}

export function completedBeforeDispatch(plan: Plan, index: number) {
  const departure = plan.visits[index].departure;
  return plan.visits.slice(0, index).filter((v) => v.finish <= departure);
}
