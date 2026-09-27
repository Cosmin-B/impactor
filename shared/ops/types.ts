import type { ProcedureVariant } from "./conditional-memory";
export interface OpsWorld {
  agents: number;
  rain: number;
  payload: number;
  battery: number;
  bridgeLimit: number;
  traffic: number;
  deadline: number;
  liftClosed: boolean;
  paint: "coral" | "teal" | "gold";
}
export type Factor = Exclude<keyof OpsWorld, "paint">;
export type Policy = "express" | "deadline" | "resilient" | "economy";
export interface Place {
  id: string;
  name: string;
  x: number;
  z: number;
  kind: "depot" | "stop" | "charge" | "junction";
}
export interface Road {
  a: string;
  b: string;
  length: number;
  kind: "street" | "bridge" | "highway";
  label: string;
}
export interface Job {
  id: string;
  name: string;
  destination: string;
  mass: number;
  due: number;
  priority: number;
  cold: boolean;
}
export interface Visit {
  jobId: string;
  robot: number;
  path: string[];
  returnPath: string[];
  departure: number;
  arrival: number;
  finish: number;
  mass: number;
  energy: number;
  batteryAfter: number;
  batteryBefore?: number;
  status: "delivered" | "late" | "stranded" | "overload" | "blocked";
  reason: string;
  charged: boolean;
}
export interface Plan {
  policy: Policy;
  name: string;
  visits: Visit[];
  delivered: number;
  onTime: number;
  failed: number;
  minutes: number;
  energy: number;
  priorityDelivered: number;
  chargeStops: number;
  score: number;
}
export interface Relationship {
  policy?: Policy;
  modelFactors?: string[];
  id: string;
  factor: keyof OpsWorld;
  label: string;
  affects: string[];
  measured: string;
  trials: number;
  delta: { delivered: number; onTime: number; energy: number; minutes: number };
  source: "experiment" | "gbrain";
  context: OpsWorld;
  confidence?: number;
}
export interface Decision {
  provider: "jev" | "local";
  model: string;
  choice: Policy;
  confidence: number | null;
  probabilities: Record<string, number>;
  inputTokens: number;
  latencyMs: number;
  reason: string;
  concern?: string;
  focus?: string;
}
export interface OpsRun {
  controller?: "jev" | "river" | "none";
  id: string;
  createdAt: string;
  goal: string;
  world: OpsWorld;
  plan: Plan;
  alternatives: Plan[];
  decision: Decision;
  relationships: Relationship[];
  forecast?: Plan;
  scaling?: Array<{ agents: number; minutes: number; onTime: number }>;
  decisions?: Array<{
    job: string;
    action: string;
    confidence: number | null;
    latencyMs: number;
    provider?: "jev" | "river";
    checkpoint?: string;
    preflightStatus?: string;
  }>;
  previous?: { delivered: number; onTime: number; failed: number };
  memory: { gbrain: boolean; memorable: boolean; message: string };
  procedure?: {
    title: string;
    steps: string[];
    source: string;
    variants?: Array<ProcedureVariant & { applicable: boolean }>;
  };
}
export interface OpsState {
  id: string;
  world: OpsWorld;
  goal: string;
  history: OpsRun[];
  relationships: Relationship[];
  variants?: ProcedureVariant[];
  round: number;
  forecast?: {
    world: OpsWorld;
    goal: string;
    decision: Decision;
    plans: Plan[];
    known: string[];
    procedure?: OpsRun["procedure"];
  };
}
export const DEFAULT_OPS: OpsWorld = {
  agents: 3,
  rain: 15,
  payload: 1,
  battery: 75,
  bridgeLimit: 8,
  traffic: 1.1,
  deadline: 1,
  liftClosed: false,
  paint: "coral",
};
export const DEFAULT_GOAL =
  "Deliver all six orders before their deadlines. Protect the chilled groceries first, and avoid stranding any robot.";
export const FACTOR_NAMES: Record<keyof OpsWorld, string> = {
  agents: "Fleet size",
  rain: "Rain",
  payload: "Parcel weight",
  battery: "Starting battery",
  bridgeLimit: "Bridge capacity",
  traffic: "Road traffic",
  deadline: "Delivery windows",
  liftClosed: "Studio lift",
  paint: "Robot paint",
};
