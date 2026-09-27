export type Team =
  "planning" | "engineering" | "quality" | "gtm" | "accounts" | "review";
export type Mission = "release" | "campaign" | "incident" | "pilot";
export interface WorkSettings {
  mission: Mission;
  agents: number;
  streams: number;
  handoff: number;
  reviewers: number;
  buildSlots: number;
  codeRevision: number;
  offerRevision: number;
  customerRevision: number;
  briefRevision: number;
  inputUsdPerMillion: number;
  tokensPerMinute: number;
  useMemory: boolean;
  localDecisions: boolean;
}
export const DEFAULT_WORK: WorkSettings = {
  mission: "pilot",
  agents: 12,
  streams: 12,
  handoff: 2,
  reviewers: 2,
  buildSlots: 3,
  codeRevision: 1,
  offerRevision: 1,
  customerRevision: 1,
  briefRevision: 1,
  inputUsdPerMillion: 2,
  tokensPerMinute: 220,
  useMemory: false,
  localDecisions: false,
};
export const TEAMS: Record<
  Team,
  { name: string; color: string; x: number; z: number }
> = {
  planning: { name: "Planning", color: "#bb9770", x: -8, z: -5 },
  engineering: { name: "Engineering", color: "#79a9b5", x: 0, z: -5 },
  quality: { name: "Quality", color: "#9ba879", x: 8, z: -5 },
  gtm: { name: "GTM", color: "#d68d71", x: -8, z: 5 },
  accounts: { name: "Accounts", color: "#8fab9e", x: 0, z: 5 },
  review: { name: "Review", color: "#aa9bbd", x: 8, z: 5 },
};
export const MISSIONS: Record<
  Mission,
  { name: string; goal: string; names: string[] }
> = {
  release: {
    name: "Ship a renderer change",
    goal: "Ship a renderer change with targeted regression checks, customer compatibility and a reviewed rollout.",
    names: [
      "Scope the change",
      "Trace affected assets",
      "Prepare implementation",
      "Build candidate",
      "Run affected checks",
      "Check customer configuration",
      "Prepare release notes",
      "Review readiness",
      "Stage rollout",
      "Confirm rollout",
    ],
  },
  campaign: {
    name: "Launch a campaign",
    goal: "Launch accurate outreach with current pricing, validated product claims and a handoff to account owners.",
    names: [
      "Set campaign goal",
      "Research accounts",
      "Check product claims",
      "Prepare demo assets",
      "Verify demo behavior",
      "Check account constraints",
      "Draft offer",
      "Approve claims and pricing",
      "Prepare outreach",
      "Handoff qualified accounts",
    ],
  },
  incident: {
    name: "Resolve an incident",
    goal: "Resolve a customer incident, verify the fix and coordinate an accurate customer update.",
    names: [
      "Triage incident",
      "Gather current facts",
      "Plan the fix",
      "Build the patch",
      "Reproduce and verify",
      "Confirm customer environment",
      "Draft status update",
      "Review fix and impact",
      "Coordinate rollout",
      "Confirm customer recovery",
    ],
  },
  pilot: {
    name: "Roll out a customer deployment",
    goal: "Roll out a customer deployment across engineering, GTM and support without repeating checks whose inputs still match.",
    names: [
      "Define pilot success",
      "Research requirements",
      "Plan implementation",
      "Build pilot",
      "Verify workflows",
      "Check deployment fit",
      "Prepare customer offer",
      "Review pilot readiness",
      "Prepare launch",
      "Handoff and confirm",
    ],
  },
};
const shape: Array<{
  team: Team;
  minutes: number;
  deps: number[];
  fields: Array<keyof WorkSettings>;
  resource?: "build" | "review";
}> = [
  { team: "planning", minutes: 4, deps: [], fields: ["briefRevision"] },
  { team: "gtm", minutes: 8, deps: [0], fields: ["customerRevision"] },
  { team: "engineering", minutes: 6, deps: [0, 1], fields: ["codeRevision"] },
  {
    team: "engineering",
    minutes: 14,
    deps: [2],
    fields: ["codeRevision"],
    resource: "build",
  },
  { team: "quality", minutes: 10, deps: [3], fields: ["codeRevision"] },
  { team: "accounts", minutes: 6, deps: [1], fields: ["customerRevision"] },
  { team: "gtm", minutes: 5, deps: [1], fields: ["offerRevision"] },
  {
    team: "review",
    minutes: 8,
    deps: [4, 5, 6],
    fields: [],
    resource: "review",
  },
  { team: "gtm", minutes: 6, deps: [7], fields: ["offerRevision"] },
  { team: "accounts", minutes: 4, deps: [8], fields: ["customerRevision"] },
];
export interface WorkTask {
  id: string;
  name: string;
  team: Team;
  stream: number;
  stage: number;
  minutes: number;
  deps: string[];
  scope: string;
  resource?: "build" | "review";
  tokens: number;
}
export interface ScheduledTask extends WorkTask {
  start: number;
  finish: number;
  agent: number;
  reused: boolean;
  handoff: number;
  wait: number;
  resourceSlot: number;
}
export interface WorkMemory {
  mission: Mission;
  records: Record<string, string>;
  savedAt: string;
  source: "gbrain" | "local";
}
export interface WorkResult {
  tasks: ScheduledTask[];
  minutes: number;
  workMinutes: number;
  agentMinutes: number;
  tokens: number;
  apiCost: number;
  decisionCalls: number;
  handoffMessages: number;
  reused: number;
  busyAgents: number;
  criticalPath: string[];
  settings: WorkSettings;
  mode: "baseline" | "planned";
}
export function buildTasks(s: WorkSettings): WorkTask[] {
  const tasks: WorkTask[] = [];
  for (let stream = 0; stream < s.streams; stream++)
    for (let stage = 0; stage < shape.length; stage++) {
      const t = shape[stage],
        deps = t.deps.map((d) => `${stream}:${d}`);
      const own = Object.fromEntries(t.fields.map((k) => [k, s[k]]));
      const parentScopes = deps.map(
        (id) => tasks.find((t) => t.id === id)!.scope,
      );
      const all: Record<string, unknown> = Object.assign(
        {},
        ...parentScopes.map((x) => JSON.parse(x)),
        own,
      );
      const scope = JSON.stringify(
        Object.fromEntries(
          Object.entries(all).sort(([a], [b]) => a.localeCompare(b)),
        ),
      );
      const minutes = t.minutes * (1 + (stream % 4) * 0.12);
      tasks.push({
        id: `${stream}:${stage}`,
        name: MISSIONS[s.mission].names[stage],
        team: t.team,
        stream,
        stage,
        minutes,
        deps,
        scope,
        resource: t.resource,
        tokens: Math.round(minutes * s.tokensPerMinute),
      });
    }
  tasks.push({
    id: "final",
    name: "Confirm the shared goal",
    team: "planning",
    stream: 0,
    stage: 10,
    minutes: 5,
    deps: Array.from({ length: s.streams }, (_, i) => `${i}:9`),
    scope: JSON.stringify({
      briefRevision: s.briefRevision,
      codeRevision: s.codeRevision,
      customerRevision: s.customerRevision,
      offerRevision: s.offerRevision,
    }),
    resource: "review",
    tokens: Math.round(5 * s.tokensPerMinute),
  });
  return tasks;
}
export function scheduleWork(
  settings: WorkSettings,
  memory?: WorkMemory,
  mode: "baseline" | "planned" = "planned",
): WorkResult {
  const s = { ...settings };
  const tasks = buildTasks(s),
    pending = new Set(tasks.map((t) => t.id)),
    done = new Map<string, ScheduledTask>(),
    agents = Array(s.agents).fill(0) as number[],
    resources = {
      build: Array(s.buildSlots).fill(0) as number[],
      review: Array(s.reviewers).fill(0) as number[],
    };
  let tokens = 0,
    workMinutes = 0,
    handoffMessages = 0;
  while (pending.size) {
    const ready = tasks.filter(
      (t) => pending.has(t.id) && t.deps.every((d) => done.has(d)),
    );
    if (!ready.length) throw Error("The task graph has a cycle.");
    let selected: any;
    for (const task of ready) {
      const parents = task.deps.map((id) => done.get(id)!);
      const parentFinish = Math.max(0, ...parents.map((t) => t.finish));
      const reused =
        mode === "planned" &&
        s.useMemory &&
        memory?.mission === s.mission &&
        memory.records[task.id] === task.scope;
      const agent = agents.indexOf(Math.min(...agents));
      const slots = task.resource ? resources[task.resource] : null;
      const resourceSlot = slots ? slots.indexOf(Math.min(...slots)) : -1;
      const crossing = parents.some((p) => p.team !== task.team && !p.reused);
      const handoff = reused
        ? 0
        : crossing
          ? s.handoff *
            (1 +
              (mode === "baseline"
                ? Math.max(0, s.agents - 3) / 20
                : Math.max(0, s.agents - 12) / 160))
          : 0;
      const start = reused
        ? parentFinish
        : Math.max(
            parentFinish + handoff,
            agents[agent],
            slots ? slots[resourceSlot] : 0,
          );
      const finish = start + (reused ? 0 : task.minutes);
      const row = {
        ...task,
        start,
        finish,
        agent: reused ? -1 : agent,
        reused,
        handoff,
        wait: Math.max(0, start - parentFinish - handoff),
        resourceSlot,
      };
      if (
        !selected ||
        row.start < selected.start ||
        (row.start === selected.start && row.stage < selected.stage)
      )
        selected = row;
    }
    const row = selected as ScheduledTask;
    done.set(row.id, row);
    pending.delete(row.id);
    if (!row.reused) {
      agents[row.agent] = row.finish;
      if (row.resource) resources[row.resource][row.resourceSlot] = row.finish;
      workMinutes += row.minutes;
      tokens += row.tokens;
      const messages = row.deps.length * (mode === "baseline" ? s.agents : 1);
      handoffMessages += messages;
      tokens += messages * 120;
    }
  }
  const scheduled = tasks.map((t) => done.get(t.id)!);
  const minutes = Math.max(...scheduled.map((t) => t.finish));
  const decisionCalls = scheduled.filter((t) => !t.reused).length;
  const criticalPath: string[] = [];
  let last: ScheduledTask | undefined = done.get("final");
  while (last) {
    criticalPath.unshift(last.id);
    last = last.deps
      .map((id) => done.get(id)!)
      .sort((a, b) => b.finish - a.finish)[0];
  }
  return {
    tasks: scheduled,
    minutes,
    workMinutes,
    agentMinutes: minutes * s.agents,
    tokens,
    apiCost:
      (tokens / 1e6) * s.inputUsdPerMillion +
      (s.localDecisions ? 0 : ((decisionCalls * 400) / 1e6) * 0.042),
    decisionCalls,
    handoffMessages,
    reused: scheduled.filter((t) => t.reused).length,
    busyAgents: new Set(scheduled.filter((t) => !t.reused).map((t) => t.agent))
      .size,
    criticalPath,
    settings: s,
    mode,
  };
}
export function rememberWork(result: WorkResult): WorkMemory {
  return {
    mission: result.settings.mission,
    records: Object.fromEntries(result.tasks.map((t) => [t.id, t.scope])),
    savedAt: new Date().toISOString(),
    source: "local",
  };
}
export function scalingWork(s: WorkSettings, memory?: WorkMemory) {
  return [3, 6, 12, 25, 50, 100].map((agents) => ({
    agents,
    baseline: scheduleWork(
      { ...s, agents, useMemory: false },
      undefined,
      "baseline",
    ),
    planned: scheduleWork({ ...s, agents }, memory),
  }));
}
export function validateWork(raw: unknown): WorkSettings {
  if (!raw || typeof raw !== "object")
    throw Error("Work settings are required.");
  const s = raw as WorkSettings;
  for (const [k, lo, hi] of [
    ["agents", 3, 100],
    ["streams", 1, 24],
    ["handoff", 0, 10],
    ["reviewers", 1, 12],
    ["buildSlots", 1, 12],
    ["codeRevision", 1, 50],
    ["offerRevision", 1, 50],
    ["customerRevision", 1, 50],
    ["briefRevision", 1, 50],
    ["inputUsdPerMillion", 0, 50],
    ["tokensPerMinute", 20, 2000],
  ] as const) {
    if (
      typeof s[k] !== "number" ||
      !Number.isFinite(s[k]) ||
      s[k] < lo ||
      s[k] > hi
    )
      throw Error(`Invalid ${k}.`);
    if (
      ["agents", "streams", "reviewers", "buildSlots"].includes(k) &&
      !Number.isInteger(s[k])
    )
      throw Error(`Invalid ${k}.`);
  }
  if (
    !MISSIONS[s.mission] ||
    typeof s.useMemory !== "boolean" ||
    typeof s.localDecisions !== "boolean"
  )
    throw Error("Invalid workplace settings.");
  return s;
}
