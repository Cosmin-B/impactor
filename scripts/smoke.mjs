import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.IMPACTOR_URL || 'http://127.0.0.1:4173';
const observations = [];
async function post(path, body = {}) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  assert.equal(response.status, 200, `${path} must succeed`);
  return response.json();
}
function record(name, result) {
  observations.push({ name, outcome: result.run.outcome, route: result.run.route,
    selected: result.run.plan.selectedChecks, reused: result.run.plan.reusedChecks,
    stale: result.run.staleEvidence, procedureUsed: result.run.procedureUsed,
    procedureSaved: result.procedure?.saved, procedureMessage: result.procedure?.message });
  console.log(`${name}: ${result.run.outcome} via ${result.run.route}; ${result.run.plan.selectedChecks.length} checks; Memorable replay ${result.run.procedureUsed}`);
}

// This explicitly resets only the app's disposable, namespaced demo lesson.
const reset = await post('/api/reset');
assert.equal(reset.integrations.gbrain.connected, true);
assert.equal(reset.integrations.memorable.connected, true);
const id = reset.session.id;
const world = { packageMass: 2, bridgeCapacity: 6, bridgeColor: 'coral' };
let result = await post('/api/run', { sessionId: id, world });
assert.equal(result.run.outcome, 'delivered');
record('Baseline', result);
world.packageMass = 8;
result = await post('/api/run', { sessionId: id, world });
assert.equal(result.run.outcome, 'fell');
assert.equal(result.run.staleEvidence, true);
assert.deepEqual(result.run.plan.selectedChecks, []);
record('Missing dependency', result);
const lesson = await post('/api/teach', { sessionId: id, lesson: 'Load evidence depends on the parcel weight.' });
assert.equal(lesson.recalled, true);
result = await post('/api/run', { sessionId: id, world });
assert.equal(result.run.outcome, 'delivered');
assert.equal(result.run.route, 'detour');
assert.deepEqual(result.run.plan.selectedChecks, ['load']);
assert.equal(result.run.staleEvidence, false);
record('Unchanged retry after teaching', result);
console.log('Recording:', result.procedure?.message);
assert.equal(result.procedure?.saved, true);

const fresh = await post('/api/session');
assert.notEqual(fresh.session.id, id);
assert.equal(fresh.session.history.length, 0);
assert(fresh.session.rules.some(rule => rule.source === 'gbrain' && rule.field === 'packageMass'));
const freshId = fresh.session.id;
world.packageMass = 10.5;
world.bridgeCapacity = 7.5;
result = await post('/api/run', { sessionId: freshId, world });
assert.equal(result.run.outcome, 'delivered');
assert.equal(result.run.route, 'detour');
assert.equal(result.run.procedureUsed, true);
for (const handler of ['check_load', 'choose_route', 'simulate_delivery', 'verify_delivery']) {
  assert(result.run.procedureSteps.some(step => step.handler === handler));
}
assert.deepEqual(result.run.independentVerification, { passed: true, steps: 4 });
assert.equal(result.run.checks.find(check => check.checkId === 'load').receipt.world.packageMass, 10.5);
record('Fresh agent, unseen values', result);

world.bridgeColor = 'teal';
result = await post('/api/run', { sessionId: freshId, world });
assert.equal(result.run.outcome, 'delivered');
assert.deepEqual(result.run.plan.selectedChecks, []);
assert.equal(result.run.staleEvidence, false);
record('Cosmetic edit', result);

world.packageMass = 4;
result = await post('/api/run', { sessionId: freshId, world });
assert.equal(result.run.route, 'bridge');
assert.equal(result.run.outcome, 'delivered');
assert.equal(result.run.procedureUsed, true);
record('Light parcel uses bridge', result);
world.bridgeCapacity = 3;
result = await post('/api/run', { sessionId: freshId, world });
assert.equal(result.run.route, 'detour');
assert.equal(result.run.outcome, 'delivered');
assert.deepEqual(result.run.plan.selectedChecks, ['load']);
record('Weakened bridge', result);

const exported = await fetch(`${base}/api/export?sessionId=${freshId}`).then(response => response.json());
assert.equal(exported.runs.length, 4);
assert.equal(exported.product, 'Impactor');
const invalid = await fetch(`${base}/api/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sessionId: freshId, world: { ...world, packageMass: -3 } }) });
assert.equal(invalid.status, 400);
const foreignOrigin = await fetch(`${base}/api/session`, { method: 'POST', headers: { Origin: 'https://unrelated.example' } });
assert.equal(foreignOrigin.status, 403);
await mkdir('qa', { recursive: true });
await writeFile('qa/live-smoke.json', JSON.stringify({ verifiedAt: new Date().toISOString(), observations,
  exportVerified: true, inputValidationVerified: true, sameOriginVerified: true }, null, 2));
await writeFile('qa/live-evidence.json', JSON.stringify(exported, null, 2));
console.log('Live round trip passed. Evidence saved under qa/.');
