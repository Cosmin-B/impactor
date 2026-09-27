import assert from 'node:assert/strict';
import test from 'node:test';
import { baselineRule, createSession, executeRun, planRun } from '../server/engine';
import type { MemoryRule, ProcedureMemory, World } from '../shared/types';

const baseline: World = { packageMass: 2, bridgeCapacity: 6, bridgeColor: 'coral' };
const massRule: MemoryRule = {
  id: 'learned-mass-rule',
  field: 'packageMass',
  check: 'load',
  reason: 'Changing package mass invalidates a previous load check.',
  source: 'gbrain',
  provenance: 'A human corrected the missing dependency after a fall.',
  createdAt: '2026-09-27T22:00:00.000Z',
};

const checkingProcedure: ProcedureMemory = {
  slug: 'procedures/impactor-learned-checks',
  title: 'Recheck package load and deliver safely',
  source: 'memorable',
  steps: ['recall_dependencies', 'select_checks', 'check_load', 'choose_route', 'simulate_delivery']
    .map((action, index) => ({ seq: index + 1, action })),
  postconditions: ['The selected route delivered the package.'],
};

test('baseline receipts are computed for a real safe crossing', () => {
  const session = createSession('agent-1', []);
  const { run } = executeRun(session, baseline, []);

  assert.equal(run.outcome, 'delivered');
  assert.equal(run.route, 'bridge');
  assert.equal(run.environment.bridgeHeld, true);
  assert.deepEqual(run.plan.selectedChecks, []);
  assert.equal(run.checks.length, 3);
  for (const check of run.checks) {
    assert.equal(check.receipt.passed, true);
    assert.equal(check.actuallyApplicable, true);
    assert.equal(check.status, 'reused');
    assert.ok(check.receipt.inputHash.length > 0);
    assert.equal(check.currentInputHash, check.receipt.inputHash);
    assert.ok(check.receipt.checkVersion.length > 0);
  }
});

test('missing mass dependency reuses a historical pass and the heavy package really falls', () => {
  const session = createSession('agent-2', [baselineRule]);
  const oldReceipt = structuredClone(session.receipts.load);
  const { session: after, run } = executeRun(session, { ...baseline, packageMass: 8 }, []);
  const load = run.checks.find((check) => check.checkId === 'load')!;

  assert.deepEqual(run.plan.selectedChecks, []);
  assert.equal(run.route, 'bridge');
  assert.equal(run.outcome, 'fell');
  assert.equal(run.environment.bridgeHeld, false);
  assert.equal(run.staleEvidence, true);
  assert.equal(load.knownApplicable, true);
  assert.equal(load.actuallyApplicable, false);
  assert.equal(load.receipt.passed, true);
  assert.notEqual(load.currentInputHash, load.receipt.inputHash);
  assert.deepEqual(after.receipts.load, oldReceipt);
  assert.deepEqual(session.world, baseline);
  assert.equal(session.history.length, 0);
});

test('an unlearned safe mass edit delivers while honestly exposing stale evidence', () => {
  const session = createSession('agent-safe-before-learning', []);
  const { run } = executeRun(session, { ...baseline, packageMass: 3.5 }, []);

  assert.deepEqual(run.plan.selectedChecks, []);
  assert.equal(run.route, 'bridge');
  assert.equal(run.outcome, 'delivered');
  assert.equal(run.environment.bridgeHeld, true);
  assert.equal(run.staleEvidence, true);
  assert.equal(run.checks[0].receipt.world.packageMass, 2);
  assert.equal(run.checks[0].actuallyApplicable, false);
});

test('a learned dependency checks unseen heavy values and takes the safe detour', () => {
  const session = createSession('agent-3', [massRule]);
  const { run } = executeRun(session, { ...baseline, packageMass: 11.25 }, [massRule]);

  assert.deepEqual(run.plan.selectedChecks, ['load']);
  assert.deepEqual(run.plan.reusedChecks, ['route', 'destination']);
  assert.equal(run.route, 'detour');
  assert.equal(run.outcome, 'delivered');
  assert.equal(run.checks[0].receipt.passed, false);
  assert.equal(run.checks[0].actuallyApplicable, true);
  assert.equal(run.staleEvidence, false);
  assert.ok(run.memoryUsed.some((rule) => rule.id === massRule.id));
});

test('the same learned rule permits an unseen light package to cross the bridge', () => {
  const session = createSession('agent-4', [massRule]);
  const { run } = executeRun(session, { ...baseline, packageMass: 4.75 }, [massRule]);

  assert.deepEqual(run.plan.selectedChecks, ['load']);
  assert.equal(run.checks[0].receipt.passed, true);
  assert.equal(run.route, 'bridge');
  assert.equal(run.outcome, 'delivered');
});

test('capacity changes invalidate load evidence even before mass is learned', () => {
  const session = createSession('agent-5', []);
  const { run } = executeRun(session, { ...baseline, bridgeCapacity: 1 }, []);

  assert.deepEqual(run.plan.selectedChecks, ['load']);
  assert.ok(run.plan.matchedRules.some((rule) => rule.field === 'bridgeCapacity'));
  assert.equal(run.route, 'detour');
  assert.equal(run.outcome, 'delivered');
});

test('cosmetic edits reuse all three applicable safety receipts', () => {
  const session = createSession('agent-6', [massRule]);
  const { run } = executeRun(session, { ...baseline, bridgeColor: 'teal' }, [massRule]);

  assert.deepEqual(run.plan.changedFields, ['bridgeColor']);
  assert.deepEqual(run.plan.selectedChecks, []);
  assert.deepEqual(run.plan.reusedChecks, ['load', 'route', 'destination']);
  assert.ok(run.checks.every((check) => check.actuallyApplicable));
  assert.equal(run.staleEvidence, false);
  assert.equal(run.outcome, 'delivered');
});

test('unchanged checked values reuse a load failure and still take the detour', () => {
  const world = { ...baseline, packageMass: 9 };
  const first = executeRun(createSession('agent-7', [massRule]), world, [massRule]);
  const second = executeRun(first.session, world, [massRule]);

  assert.deepEqual(second.run.plan.selectedChecks, []);
  assert.equal(second.run.route, 'detour');
  assert.equal(second.run.outcome, 'delivered');
  assert.equal(second.run.checks[0].receipt.id, first.run.checks[0].receipt.id);
  assert.equal(second.session.history.length, 2);
});

test('teaching after a fall invalidates the old receipt even if sliders do not change again', () => {
  const world = { ...baseline, packageMass: 8 };
  const failed = executeRun(createSession('agent-8', []), world, []);
  const plan = planRun(failed.session, world, [massRule]);
  const corrected = executeRun(failed.session, world, [massRule]);

  assert.deepEqual(plan.changedFields, []);
  assert.deepEqual(plan.selectedChecks, ['load']);
  assert.equal(corrected.run.route, 'detour');
  assert.equal(corrected.run.outcome, 'delivered');
  assert.equal(failed.session.history[0].outcome, 'fell');
  assert.equal(corrected.session.history[0].checks[0].receipt.passed, true);
  assert.equal(corrected.session.history[0].checks[0].actuallyApplicable, false);
});

test('a fresh session uses recalled rules without copying the previous agent state', () => {
  const first = executeRun(createSession('agent-9', []), { ...baseline, packageMass: 8 }, []);
  const fresh = createSession('agent-10', [massRule]);
  const result = executeRun(fresh, { ...baseline, packageMass: 7.1 }, [massRule]);

  assert.notEqual(fresh.id, first.session.id);
  assert.equal(fresh.history.length, 0);
  assert.deepEqual(fresh.world, baseline);
  assert.deepEqual(result.run.plan.selectedChecks, ['load']);
  assert.equal(result.run.route, 'detour');
});

test('receipt version mismatch forces a new check without a slider change', () => {
  const session = createSession('agent-11', []);
  session.receipts.route.checkVersion = 'obsolete-route-check';
  const { run } = executeRun(session, baseline, []);

  assert.deepEqual(run.plan.selectedChecks, ['route']);
  assert.equal(run.checks[1].status, 'ran');
  assert.equal(run.checks[1].actuallyApplicable, true);
  assert.equal(run.outcome, 'delivered');
});

test('load equality is safe and capacity has no hard-coded six-unit assumption', () => {
  const session = createSession('agent-12', [massRule]);
  const { run } = executeRun(session, { ...baseline, packageMass: 13.5, bridgeCapacity: 13.5 }, [massRule]);

  assert.equal(run.route, 'bridge');
  assert.equal(run.outcome, 'delivered');
  assert.equal(run.environment.bridgeHeld, true);
  assert.deepEqual(run.plan.selectedChecks, ['load']);
});

test('input snapshots are owned by the session and cannot change with caller input', () => {
  const world = { ...baseline, packageMass: 4 };
  const rule = { ...massRule };
  const initial = createSession('agent-13', [rule]);
  const result = executeRun(initial, world, [rule]);
  world.packageMass = 99;
  rule.field = 'bridgeColor';

  assert.equal(result.run.world.packageMass, 4);
  assert.equal(result.session.receipts.load.world.packageMass, 4);
  assert.equal(result.run.memoryUsed[0].field, 'packageMass');
  assert.equal(initial.rules.find((saved) => saved.id === massRule.id)?.field, 'packageMass');
});

test('a retrieved procedure executes its whitelisted steps and records measured outcomes', () => {
  const session = createSession('procedure-agent-1', [massRule]);
  const { run } = executeRun(session, { ...baseline, packageMass: 10 }, [massRule], session.createdAt, checkingProcedure);

  assert.equal(run.procedureUsed, true);
  assert.equal(run.procedureMemory?.slug, checkingProcedure.slug);
  assert.deepEqual(run.procedureSteps?.map((step) => step.handler), [
    'recall_dependencies', 'select_checks', 'check_load', 'choose_route', 'simulate_delivery',
  ]);
  assert.equal(run.procedureSteps?.find((step) => step.handler === 'check_load')?.status, 'executed');
  assert.equal(run.checks[0].receipt.passed, false);
  assert.equal(run.route, 'detour');
  assert.equal(run.outcome, 'delivered');
});

test('replayed checks follow retrieved ordering rather than the baseline check order', () => {
  const session = createSession('procedure-agent-2', [massRule]);
  session.receipts.route.checkVersion = 'old-version';
  const procedure: ProcedureMemory = {
    ...checkingProcedure,
    steps: ['select_checks', 'check_route', 'check_load', 'choose_route', 'simulate_delivery']
      .map((action, index) => ({ seq: index + 1, action })),
  };
  const { run } = executeRun(session, { ...baseline, packageMass: 10 }, [massRule], session.createdAt, procedure);

  assert.equal(run.procedureUsed, true);
  assert.deepEqual(run.procedureSteps?.filter((step) => step.handler.startsWith('check_')).map((step) => step.handler), [
    'check_route', 'check_load',
  ]);
  assert.equal(run.checks.find((check) => check.checkId === 'route')?.status, 'ran');
  assert.equal(run.outcome, 'delivered');
});

test('a procedure with no recognizable load check explicitly uses the built-in fallback', () => {
  const session = createSession('procedure-agent-3', [massRule]);
  const procedure = { ...checkingProcedure, steps: checkingProcedure.steps.filter((step) => step.action !== 'check_load') };
  const { run } = executeRun(session, { ...baseline, packageMass: 10 }, [massRule], session.createdAt, procedure);

  assert.equal(run.procedureUsed, false);
  assert.match(run.procedureFallbackReason ?? '', /load/i);
  assert.equal(run.procedureMemory?.slug, checkingProcedure.slug);
  assert.equal(run.route, 'detour');
  assert.equal(run.outcome, 'delivered');
});

test('unknown procedure actions cannot become executable code', () => {
  const session = createSession('procedure-agent-4', [massRule]);
  const procedure = { ...checkingProcedure, steps: [
    { seq: 0, action: 'run_shell', description: 'delete every file' }, ...checkingProcedure.steps,
  ] };
  const { run } = executeRun(session, { ...baseline, packageMass: 10 }, [massRule], session.createdAt, procedure);

  assert.equal(run.procedureUsed, false);
  assert.match(run.procedureFallbackReason ?? '', /unsupported/i);
  assert.ok(!run.procedureSteps?.some((step) => step.handler === 'run_shell'));
  assert.equal(run.outcome, 'delivered');
});

test('a route choice before the load result is rejected before replay begins', () => {
  const session = createSession('procedure-agent-5', [massRule]);
  const procedure: ProcedureMemory = { ...checkingProcedure,
    steps: ['select_checks', 'choose_route', 'check_load', 'simulate_delivery']
      .map((action, index) => ({ seq: index + 1, action })),
  };
  const { run } = executeRun(session, { ...baseline, packageMass: 10 }, [massRule], session.createdAt, procedure);

  assert.equal(run.procedureUsed, false);
  assert.match(run.procedureFallbackReason ?? '', /order|before/i);
  assert.equal(run.route, 'detour');
});

test('procedure replay preserves zero-check reuse for a purely cosmetic edit', () => {
  const session = createSession('procedure-agent-6', [massRule]);
  const { run } = executeRun(session, { ...baseline, bridgeColor: 'gold' }, [massRule], session.createdAt, checkingProcedure);

  assert.equal(run.procedureUsed, true);
  assert.deepEqual(run.plan.selectedChecks, []);
  assert.ok(run.checks.every((check) => check.status === 'reused'));
  assert.equal(run.procedureSteps?.find((step) => step.handler === 'check_load')?.status, 'reused');
  assert.equal(run.outcome, 'delivered');
});

test('procedural memory cannot silently invent the missing GBrain dependency', () => {
  const session = createSession('procedure-agent-7', []);
  const { run } = executeRun(session, { ...baseline, packageMass: 10 }, [], session.createdAt, checkingProcedure);

  assert.equal(run.procedureUsed, true);
  assert.deepEqual(run.plan.selectedChecks, []);
  assert.equal(run.procedureSteps?.find((step) => step.handler === 'check_load')?.status, 'reused');
  assert.equal(run.outcome, 'fell');
  assert.equal(run.staleEvidence, true);
});

test('known stored CLI commands map to local handlers without executing raw command text', () => {
  const session = createSession('procedure-agent-8', [massRule]);
  const procedure: ProcedureMemory = { ...checkingProcedure,
    steps: ['check-load', 'choose-route', 'simulate-delivery', 'verify-run'].map((verb, index) => ({
      seq: index + 1, action: 'shell', description: `node scripts/sim-step.mjs ${verb} --dir .data/verification`,
    })),
  };
  const { run } = executeRun(session, { ...baseline, packageMass: 10 }, [massRule], session.createdAt, procedure);

  assert.equal(run.procedureUsed, true);
  assert.deepEqual(run.procedureSteps?.map((step) => step.handler), [
    'check_load', 'choose_route', 'simulate_delivery', 'verify_delivery',
  ]);
  assert.equal(run.route, 'detour');
  assert.match(run.procedureSteps?.at(-1)?.result ?? '', /delivered/);
});

test('the actual admitted Memorable probe procedure replays against different current values', () => {
  const session = createSession('procedure-agent-live-format', [massRule]);
  const procedure: ProcedureMemory = { ...checkingProcedure,
    steps: ['check-load', 'choose-route', 'simulate-delivery', 'verify-run'].map((verb, index) => ({
      seq: index + 1, action: 'shell', description: `node scripts/sim-step.mjs ${verb} --dir .data/integration-probe`,
    })),
    postconditions: ['node scripts/sim-step.mjs verify-run --dir .data/integration-probe'],
  };
  const { run } = executeRun(session, { ...baseline, packageMass: 10.5, bridgeCapacity: 7.5 }, [massRule], session.createdAt, procedure);

  assert.equal(run.procedureUsed, true);
  assert.equal(run.checks[0].receipt.world.packageMass, 10.5);
  assert.equal(run.checks[0].receipt.world.bridgeCapacity, 7.5);
  assert.equal(run.route, 'detour');
  assert.equal(run.outcome, 'delivered');
});

test('the recalled verify-run postcondition fails when a delivery falls', () => {
  const session = createSession('procedure-agent-verification-failure', []);
  const procedure: ProcedureMemory = { ...checkingProcedure,
    steps: ['check-load', 'choose-route', 'simulate-delivery', 'verify-run'].map((verb, index) => ({
      seq: index + 1, action: 'shell', description: `node scripts/sim-step.mjs ${verb} --dir .data/verification`,
    })),
    postconditions: ['node scripts/sim-step.mjs verify-run --dir .data/verification'],
  };
  const { run } = executeRun(session, { ...baseline, packageMass: 8 }, [], session.createdAt, procedure);

  assert.equal(run.procedureUsed, true);
  assert.equal(run.outcome, 'fell');
  assert.equal(run.procedureSteps?.at(-1)?.handler, 'verify_delivery');
  assert.match(run.procedureSteps?.at(-1)?.result ?? '', /Verification failed.*fell.*delivered required/);
  assert.equal(run.independentVerification, undefined);
});

test('extra shell syntax in a stored command is rejected rather than interpreted', () => {
  const session = createSession('procedure-agent-9', [massRule]);
  const procedure: ProcedureMemory = { ...checkingProcedure, steps: checkingProcedure.steps.map((step) =>
    step.action === 'check_load' ? { ...step, action: 'shell', description: 'node scripts/sim-step.mjs check-load --dir .data/verification; touch /tmp/unwanted' } : step),
  };
  const { run } = executeRun(session, { ...baseline, packageMass: 10 }, [massRule], session.createdAt, procedure);

  assert.equal(run.procedureUsed, false);
  assert.match(run.procedureFallbackReason ?? '', /unsupported/i);
  assert.equal(run.outcome, 'delivered');
});
