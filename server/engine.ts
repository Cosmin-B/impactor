import { createHash } from 'node:crypto';
import type {
  CheckId, CheckResult, MemoryRule, ProcedureMemory, Receipt, RunPlan, RunResult, SessionState, World, WorldField,
} from '../shared/types';

const checkIds: CheckId[] = ['load', 'route', 'destination'];
const worldFields: WorldField[] = ['packageMass', 'bridgeCapacity', 'bridgeColor'];
const initialWorld: World = { packageMass: 2, bridgeCapacity: 6, bridgeColor: 'coral' };
const logicalEpoch = '1970-01-01T00:00:00.000Z';
const versions: Record<CheckId, string> = { load: 'load-v1', route: 'route-v1', destination: 'destination-v1' };
const labels: Record<CheckId, string> = {
  load: 'Bridge load', route: 'Route continuity', destination: 'Destination match',
};

const scene = {
  edges: [['dock', 'bridge'], ['bridge', 'depot'], ['dock', 'switchback'], ['switchback', 'depot']],
  bridgePath: ['dock', 'bridge', 'depot'],
  detourPath: ['dock', 'switchback', 'depot'],
  parcelDestination: 'depot',
  deliveryStation: 'depot',
};

export const baselineRule: MemoryRule = {
  id: 'baseline-capacity-load',
  field: 'bridgeCapacity',
  check: 'load',
  reason: 'A changed bridge capacity requires a new load check.',
  source: 'baseline',
  provenance: 'Built-in dependency supplied with the initial controller.',
  createdAt: logicalEpoch,
};

function activeRules(rules: MemoryRule[]): MemoryRule[] {
  const unique = new Map<string, MemoryRule>();
  for (const rule of [baselineRule, ...rules]) {
    unique.set(`${rule.field}:${rule.check}`, { ...rule });
  }
  return [...unique.values()];
}

function routeExists(path: string[]): boolean {
  return path.length > 1 && path.slice(1).every((to, index) =>
    scene.edges.some(([fromNode, toNode]) => fromNode === path[index] && toNode === to),
  );
}

function inputHash(checkId: CheckId, world: World): string {
  let inputs: unknown;
  if (checkId === 'load') {
    inputs = { packageMass: world.packageMass, bridgeCapacity: world.bridgeCapacity };
  } else if (checkId === 'route') {
    inputs = { edges: scene.edges, bridgePath: scene.bridgePath, detourPath: scene.detourPath };
  } else {
    inputs = { parcelDestination: scene.parcelDestination, deliveryStation: scene.deliveryStation };
  }
  return createHash('sha256').update(JSON.stringify({ checkId, version: versions[checkId], inputs })).digest('hex');
}

function evaluateCheck(checkId: CheckId, world: World, receiptId: string, createdAt: string): Receipt {
  let passed: boolean;
  let details: string;
  if (checkId === 'load') {
    passed = world.packageMass <= world.bridgeCapacity;
    details = `${world.packageMass} kg package ${passed ? 'fits within' : 'exceeds'} the ${world.bridgeCapacity} kg bridge capacity.`;
  } else if (checkId === 'route') {
    passed = routeExists(scene.bridgePath) && routeExists(scene.detourPath);
    details = passed ? 'Both the bridge and detour connect the dock to the depot.' : 'A route contains a missing graph connection.';
  } else {
    passed = scene.parcelDestination === scene.deliveryStation;
    details = `Parcel destination “${scene.parcelDestination}” ${passed ? 'matches' : 'does not match'} station “${scene.deliveryStation}”.`;
  }

  return {
    id: receiptId, checkId, label: labels[checkId], passed,
    world: { ...world }, inputHash: inputHash(checkId, world), createdAt,
    checkVersion: versions[checkId], details,
  };
}

function policyAccepts(receipt: Receipt, world: World, rules: MemoryRule[]): boolean {
  return receipt.checkVersion === versions[receipt.checkId]
    && rules.every((rule) => rule.check !== receipt.checkId || receipt.world[rule.field] === world[rule.field]);
}

/** The caller may supply an ISO timestamp; the default is logical simulation time. */
export function createSession(agentId: string, rules: MemoryRule[] = [], createdAt = logicalEpoch): SessionState {
  const receipts = Object.fromEntries(checkIds.map((checkId) => [
    checkId, evaluateCheck(checkId, initialWorld, `${agentId}:baseline:${checkId}`, createdAt),
  ])) as Record<CheckId, Receipt>;

  return {
    id: agentId,
    agentName: `RO-${agentId.match(/\d+$/)?.[0] ?? agentId.slice(-4).toUpperCase()}`,
    world: { ...initialWorld }, rules: activeRules(rules), receipts,
    lastRun: null, history: [], createdAt,
  };
}

export function planRun(session: SessionState, world: World, rules: MemoryRule[] = session.rules): RunPlan {
  const currentRules = activeRules(rules);
  const changedFields = worldFields.filter((field) => session.world[field] !== world[field]);

  // Compare with each receipt, not the previous run. A newly learned dependency
  // can invalidate an old receipt even when the user retries identical controls.
  const matchedRules = currentRules.filter((rule) =>
    session.receipts[rule.check].world[rule.field] !== world[rule.field],
  );
  const selectedChecks = checkIds.filter((checkId) => !policyAccepts(session.receipts[checkId], world, currentRules));
  const reusedChecks = checkIds.filter((checkId) => !selectedChecks.includes(checkId));

  let explanation: string;
  if (selectedChecks.length) {
    explanation = `Recheck ${selectedChecks.map((id) => labels[id].toLowerCase()).join(', ')}; reuse ${reusedChecks.length} other receipt${reusedChecks.length === 1 ? '' : 's'}.`;
  } else if (changedFields.length) {
    explanation = 'The active dependency rules select no checks for this edit. The controller will reuse its previous receipts.';
  } else {
    explanation = 'The active dependency rules find no changed checked inputs. Reuse all three receipts.';
  }

  return { changedFields, selectedChecks, reusedChecks, matchedRules, explanation };
}

const procedureHandlers = [
  'recall_dependencies', 'select_checks', 'check_load', 'check_route', 'check_destination',
  'choose_route', 'simulate_delivery', 'verify_delivery',
] as const;
type ProcedureHandler = typeof procedureHandlers[number];
type ExecutableStep = { seq: number; action: string; handler: ProcedureHandler };

function handlerFor(step: ProcedureMemory['steps'][number]): ProcedureHandler | undefined {
  const action = step.action.trim();
  if (procedureHandlers.includes(action as ProcedureHandler)) return action as ProcedureHandler;

  // Stored shell text is data, never code. Recognize only the exact commands
  // emitted by this demo, then call the corresponding pure local handler.
  const command = action === 'shell' ? step.description?.trim() : action;
  const match = command?.match(/^node scripts\/sim-step\.mjs (check-load|choose-route|simulate-delivery|verify-run) --dir \.data\/(?:verification|integration-probe)$/);
  if (!match) return undefined;
  const commands: Record<string, ProcedureHandler> = {
    'check-load': 'check_load', 'choose-route': 'choose_route',
    'simulate-delivery': 'simulate_delivery', 'verify-run': 'verify_delivery',
  };
  return commands[match[1]];
}

function prepareProcedure(procedure: ProcedureMemory | undefined, plan: RunPlan): {
  steps: ExecutableStep[]; used: boolean; fallbackReason?: string;
} {
  const fallback = (fallbackReason: string) => ({
    steps: procedureHandlers.map((handler, index) => ({ seq: index + 1, action: handler, handler })),
    used: false, fallbackReason,
  });
  if (!procedure) return fallback('No executable Memorable procedure was recalled; using the built-in procedure.');

  const steps: ExecutableStep[] = [];
  for (const step of procedure.steps) {
    const handler = handlerFor(step);
    if (!handler) return fallback('The recalled procedure contains an unsupported action; using the built-in procedure.');
    steps.push({ seq: step.seq, action: step.action, handler });
  }
  if (steps.some((step) => !Number.isInteger(step.seq) || step.seq < 1)
    || new Set(steps.map((step) => step.seq)).size !== steps.length
    || new Set(steps.map((step) => step.handler)).size !== steps.length) {
    return fallback('The recalled procedure has repeated or invalid step ordering; using the built-in procedure.');
  }
  steps.sort((left, right) => left.seq - right.seq);
  const handlers = steps.map((step) => step.handler);
  const loadIndex = handlers.indexOf('check_load');
  const choiceIndex = handlers.indexOf('choose_route');
  const deliveryIndex = handlers.indexOf('simulate_delivery');
  const verificationIndex = handlers.indexOf('verify_delivery');
  if (loadIndex < 0) return fallback('The recalled procedure has no recognizable load check; using the built-in procedure.');
  if (choiceIndex < 0 || deliveryIndex < 0) {
    return fallback('The recalled procedure is missing route choice or delivery; using the built-in procedure.');
  }
  if (plan.selectedChecks.some((checkId) => !handlers.includes(`check_${checkId}`))) {
    return fallback('The recalled procedure omits a required check; using the built-in procedure.');
  }
  const checkIndexes = handlers.flatMap((handler, index) => handler.startsWith('check_') ? [index] : []);
  const selectIndex = handlers.indexOf('select_checks');
  const recallIndex = handlers.indexOf('recall_dependencies');
  const invalidOrder = checkIndexes.some((index) => index >= choiceIndex)
    || deliveryIndex <= choiceIndex
    || (selectIndex >= 0 && checkIndexes.some((index) => index <= selectIndex))
    || recallIndex > 0
    || (verificationIndex >= 0 && (verificationIndex <= deliveryIndex || verificationIndex !== steps.length - 1))
    || (verificationIndex < 0 && deliveryIndex !== steps.length - 1);
  if (invalidOrder) return fallback('The recalled procedure chooses or verifies before its prerequisites; using the built-in procedure.');
  return { steps, used: true };
}

/** Produces new state without mutating the supplied session, world or rules. */
export function executeRun(
  session: SessionState,
  world: World,
  rules: MemoryRule[] = session.rules,
  createdAt = session.createdAt,
  procedureMemory?: ProcedureMemory,
): { session: SessionState; run: RunResult } {
  const currentRules = activeRules(rules);
  const plan = planRun(session, world, currentRules);
  const runId = `${session.id}:run:${session.history.length + 1}`;
  const receipts = structuredClone(session.receipts);
  const procedure = prepareProcedure(procedureMemory, plan);
  const procedureSteps: NonNullable<RunResult['procedureSteps']> = [];
  const executedChecks = new Set<CheckId>();
  let route: RunResult['route'] = 'stop';
  let outcome: RunResult['outcome'] = 'stopped';
  const bridgeHeld = world.packageMass <= world.bridgeCapacity;

  for (const step of procedure.steps) {
    let status: 'executed' | 'reused' = 'executed';
    let result: string;
    if (step.handler === 'recall_dependencies') {
      result = `Loaded ${currentRules.length} active dependency rules.`;
    } else if (step.handler === 'select_checks') {
      result = plan.explanation;
    } else if (step.handler.startsWith('check_')) {
      const checkId = step.handler.slice('check_'.length) as CheckId;
      if (plan.selectedChecks.includes(checkId)) {
        receipts[checkId] = evaluateCheck(checkId, world, `${runId}:${checkId}`, createdAt);
        executedChecks.add(checkId);
        result = receipts[checkId].details;
      } else {
        status = 'reused';
        result = `Reused ${labels[checkId].toLowerCase()} receipt ${receipts[checkId].id}.`;
      }
    } else if (step.handler === 'choose_route') {
      // The controller sees only its receipts and learned dependencies.
      if (receipts.route.passed && receipts.destination.passed) {
        route = receipts.load.passed ? 'bridge' : 'detour';
      }
      result = `Chose ${route} from the available check receipts.`;
    } else if (step.handler === 'simulate_delivery') {
      // The environment independently evaluates the chosen action.
      if (route === 'bridge') outcome = bridgeHeld && routeExists(scene.bridgePath) ? 'delivered' : 'fell';
      if (route === 'detour' && routeExists(scene.detourPath)) outcome = 'delivered';
      result = `Observed outcome: ${outcome}.`;
    } else {
      result = outcome === 'delivered'
        ? `Verified observed outcome: ${outcome}.`
        : `Verification failed: observed ${outcome}; delivered required.`;
    }
    procedureSteps.push({ ...step, status, result });
  }

  const checks: CheckResult[] = checkIds.map((checkId) => {
    const receipt = receipts[checkId];
    const currentInputHash = inputHash(checkId, world);
    return {
      checkId,
      label: labels[checkId],
      status: executedChecks.has(checkId) ? 'ran' : 'reused',
      receipt,
      knownApplicable: policyAccepts(receipt, world, currentRules),
      actuallyApplicable: receipt.checkVersion === versions[checkId] && receipt.inputHash === currentInputHash,
      currentInputHash,
    };
  });

  let explanation: string;
  if (outcome === 'fell') {
    explanation = `The controller trusted a historical load pass and chose the bridge. The current ${world.packageMass} kg package exceeds its ${world.bridgeCapacity} kg capacity.`;
  } else if (route === 'detour') {
    explanation = `The load receipt rejects the bridge. The connected detour delivers the ${world.packageMass} kg package safely.`;
  } else if (route === 'bridge') {
    explanation = `The ${world.packageMass} kg package crosses within the ${world.bridgeCapacity} kg bridge capacity.`;
  } else {
    explanation = 'A route or destination receipt failed, so the controller stopped before moving.';
  }

  const run: RunResult = {
    id: runId, agentId: session.id, world: { ...world }, previousWorld: { ...session.world },
    plan, checks, route, outcome, explanation,
    memoryUsed: plan.matchedRules.map((rule) => ({ ...rule })),
    createdAt, staleEvidence: checks.some((check) => !check.actuallyApplicable),
    environment: { bridgeHeld, actualLoad: world.packageMass, capacity: world.bridgeCapacity },
    ...(procedureMemory ? { procedureMemory: structuredClone(procedureMemory) } : {}),
    procedureUsed: procedure.used,
    ...(procedure.fallbackReason ? { procedureFallbackReason: procedure.fallbackReason } : {}),
    procedureSteps,
  };
  const nextSession: SessionState = {
    ...session, world: { ...world }, rules: currentRules,
    receipts, lastRun: run, history: [...structuredClone(session.history), run],
  };

  return { session: nextSession, run };
}
