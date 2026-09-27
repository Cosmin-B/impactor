import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const [step, flag, directory] = process.argv.slice(2);
const allowed = ['check-load', 'choose-route', 'simulate-delivery', 'verify-run'];
if (!allowed.includes(step) || flag !== '--dir' || !directory) {
  console.error('Usage: node scripts/sim-step.mjs <step> --dir <run-directory>');
  process.exit(2);
}

const root = resolve(directory);
const read = async name => JSON.parse(await readFile(join(root, name + '.json'), 'utf8'));
const write = async (name, value) => {
  await writeFile(join(root, name + '.json'), JSON.stringify(value, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(value));
};

try {
  const input = await read('input');
  const { world } = input;
  if (!world || !Number.isFinite(world.packageMass) || !Number.isFinite(world.bridgeCapacity)
      || world.packageMass < 1 || world.bridgeCapacity < 1) throw new Error('Invalid simulation input');
  const inputHash = createHash('sha256').update(JSON.stringify(world)).digest('hex');

  if (step === 'check-load') {
    await write('load', { passed: world.packageMass <= world.bridgeCapacity,
      packageMass: world.packageMass, bridgeCapacity: world.bridgeCapacity, inputHash });
  } else if (step === 'choose-route') {
    const load = await read('load');
    if (load.inputHash !== inputHash) throw new Error('Load evidence belongs to different inputs');
    const route = input.routeReady && input.destinationReady ? (load.passed ? 'bridge' : 'detour') : 'stop';
    await write('route', { route, inputHash });
  } else if (step === 'simulate-delivery') {
    const plan = await read('route');
    if (plan.inputHash !== inputHash) throw new Error('Route plan belongs to different inputs');
    const outcome = plan.route === 'stop' ? 'stopped'
      : plan.route === 'bridge' && world.packageMass > world.bridgeCapacity ? 'fell' : 'delivered';
    await write('outcome', { route: plan.route, outcome, inputHash });
  } else {
    const outcome = await read('outcome');
    const verified = outcome.inputHash === inputHash && outcome.outcome === 'delivered'
      && outcome.route === input.expectedRoute && outcome.outcome === input.expectedOutcome;
    await write('proof', { verified, inputHash, route: outcome.route, outcome: outcome.outcome,
      verifiedAt: new Date().toISOString() });
    if (!verified) process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Simulation verification failed');
  process.exitCode = 1;
}
