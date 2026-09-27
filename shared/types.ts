export type CheckId = 'load' | 'route' | 'destination';
export type BridgeColor = 'coral' | 'teal' | 'gold';

export interface World {
  packageMass: number;
  bridgeCapacity: number;
  bridgeColor: BridgeColor;
}
export type WorldField = keyof World;

export interface MemoryRule {
  id: string;
  factId?: string;
  field: WorldField;
  check: CheckId;
  reason: string;
  source: 'baseline' | 'gbrain';
  provenance: string;
  createdAt: string;
}

export interface Receipt {
  id: string;
  checkId: CheckId;
  label: string;
  passed: boolean;
  world: World;
  inputHash: string;
  createdAt: string;
  checkVersion: string;
  details: string;
}

export interface CheckResult {
  checkId: CheckId;
  label: string;
  status: 'ran' | 'reused';
  receipt: Receipt;
  knownApplicable: boolean;
  actuallyApplicable: boolean;
  currentInputHash: string;
}

export interface RunPlan {
  changedFields: WorldField[];
  selectedChecks: CheckId[];
  reusedChecks: CheckId[];
  matchedRules: MemoryRule[];
  explanation: string;
}

export interface RunResult {
  id: string;
  agentId: string;
  world: World;
  previousWorld: World;
  plan: RunPlan;
  checks: CheckResult[];
  route: 'bridge' | 'detour' | 'stop';
  outcome: 'delivered' | 'fell' | 'stopped';
  explanation: string;
  memoryUsed: MemoryRule[];
  createdAt: string;
  staleEvidence: boolean;
  environment: {
    bridgeHeld: boolean;
    actualLoad: number;
    capacity: number;
  };
  procedureMemory?: ProcedureMemory;
  procedureUsed?: boolean;
  procedureFallbackReason?: string;
  independentVerification?: { passed: boolean; steps: number };
  procedureSteps?: Array<{
    seq: number;
    action: string;
    handler: string;
    status: 'executed' | 'reused';
    result: string;
  }>;
}

export interface ProcedureMemory {
  slug: string;
  title: string;
  steps: Array<{ seq: number; action: string; description?: string }>;
  postconditions: string[];
  source: 'memorable';
}

export interface SessionState {
  id: string;
  agentName: string;
  world: World;
  rules: MemoryRule[];
  receipts: Record<CheckId, Receipt>;
  lastRun: RunResult | null;
  history: RunResult[];
  createdAt: string;
}

export interface IntegrationStatus {
  provider: 'gbrain' | 'memorable';
  configured: boolean;
  connected: boolean;
  state: 'connected' | 'unavailable';
  message: string;
  checkedAt: string;
}

export interface Integrations {
  gbrain: IntegrationStatus;
  memorable: IntegrationStatus;
}

export interface SessionResponse {
  session: SessionState;
  integrations: Integrations;
}

export interface RunResponse extends SessionResponse {
  run: RunResult;
  procedure?: { saved: boolean; message: string; slug?: string };
}

export interface TeachResponse extends SessionResponse {
  rule: MemoryRule;
  recalled: boolean;
  procedure: { saved: boolean; message: string; slug?: string };
}

export interface ProcedureTrace {
  session_id: string;
  task_description: string;
  harness: string;
  tool_calls: Array<{
    name: string;
    input: Record<string, unknown>;
    result: Record<string, unknown>;
  }>;
}

/* HTTP contract (JSON; failures return {error:string} with a non-2xx status):
 * GET  /api/status -> {integrations: Integrations}
 * POST /api/session {} -> SessionResponse (new robot; recalls saved rules)
 * POST /api/run {sessionId:string, world:World} -> RunResponse
 * POST /api/teach {sessionId:string, lesson?:string} -> TeachResponse
 * POST /api/reset {} -> SessionResponse (expire only this demo's learned rules)
 * GET  /api/export?sessionId=... -> current rules + evidence JSON download
 * The server serializes mutations and owns the authoritative session state.
 * A frontend may keep draft controls locally; only /run publishes a new world.
 */
