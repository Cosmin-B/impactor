import {workplace} from './workplace/service.js';
import express from 'express';
import {createOps,forecastOps,runOps,learnOps} from './ops/service.js';
import {validateWorld} from '../shared/ops/engine.js';
import type {OpsState} from '../shared/ops/types.js';
import {homedir} from 'node:os';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createSession, executeRun, planRun } from './engine.js';
import * as brain from './gbrain.js';
import * as memorable from './memorable.js';
import type {
  IntegrationStatus, Integrations, MemoryRule, ProcedureTrace, RunResult, SessionState, World,
} from '../shared/types.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executeFile = promisify(execFile);
const dataDirectory = path.join(projectRoot, '.data');
await mkdir(dataDirectory, { recursive: true });
const namespacePath = path.join(dataDirectory, 'namespace.json');
let namespace: string;
try {
  const saved = JSON.parse(await readFile(namespacePath, 'utf8')) as { namespace?: unknown };
  if (typeof saved.namespace !== 'string' || !/^impactor-demo-[a-f0-9-]+$/.test(saved.namespace)) {
    throw new Error('Invalid demo namespace');
  }
  namespace = saved.namespace;
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  namespace = `impactor-demo-${randomUUID()}`;
  await writeFile(namespacePath, JSON.stringify({ namespace }), { mode: 0o600 });
}

const app = express();
app.disable('x-powered-by');
app.use('/api', (req, res, next) => {
  const origin = req.get('origin');
  if (origin) {
    try {
      const allowed = new URL(origin).host === req.get('host');
      if (!allowed) { res.status(403).json({ error: 'Use this app from its local browser address.' }); return; }
    } catch { res.status(403).json({ error: 'Invalid request origin.' }); return; }
  }
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '32kb' }));

const sessions = new Map<string, SessionState>();
let agentCount = 0;
let serial: Promise<unknown> = Promise.resolve();
let integrationCache: { at: number; value: Integrations } | undefined;
let recordedProcedure = false;

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = serial.then(operation);
  serial = result.then(() => undefined, () => undefined);
  return result;
}

function unavailable(provider: 'gbrain' | 'memorable'): IntegrationStatus {
  return { provider, configured: false, connected: false, state: 'unavailable',
    message: `${provider === 'gbrain' ? 'GBrain' : 'Memorable'} is unavailable.`, checkedAt: new Date().toISOString() };
}

async function integrations(refresh = false): Promise<Integrations> {
  if (!refresh && integrationCache && Date.now() - integrationCache.at < 30_000) return integrationCache.value;
  const [gbrain, memory] = await Promise.all([
    brain.getIntegrationStatus().catch(() => unavailable('gbrain')),
    memorable.getIntegrationStatus().catch(() => unavailable('memorable')),
  ]);
  const value = { gbrain, memorable: memory };
  integrationCache = { at: Date.now(), value };
  return value;
}

async function newSession(): Promise<SessionState> {
  const rules = await brain.recallRules(namespace);
  const session = createSession(randomUUID(), rules, new Date().toISOString());
  session.agentName = `RO-${String(++agentCount).padStart(2, '0')}`;
  sessions.set(session.id, session);
  return session;
}

function sessionFrom(body: unknown): SessionState {
  const id = (body as { sessionId?: unknown } | null)?.sessionId;
  if (typeof id !== 'string' || !sessions.has(id)) throw new RequestError('Start a fresh agent to continue.', 404);
  return sessions.get(id)!;
}

function worldFrom(input: unknown): World {
  if (!input || typeof input !== 'object') throw new RequestError('A world configuration is required.');
  const w = input as Record<string, unknown>;
  for (const field of ['packageMass', 'bridgeCapacity']) {
    if (typeof w[field] !== 'number' || !Number.isFinite(w[field]) || w[field] < 1 || w[field] > 12) {
      throw new RequestError('Package mass and bridge capacity must be between 1 and 12 kg.');
    }
  }
  if (!['coral', 'teal', 'gold'].includes(w.bridgeColor as string)) throw new RequestError('Choose a supported bridge color.');
  return { packageMass: w.packageMass as number, bridgeCapacity: w.bridgeCapacity as number,
    bridgeColor: w.bridgeColor as World['bridgeColor'] };
}

class RequestError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function route(handler: (req: express.Request, res: express.Response) => Promise<void>): express.RequestHandler {
  return (req, res) => {
    handler(req, res).catch(error => {
      if (error instanceof RequestError) { res.status(error.status).json({ error: error.message }); return; }
      // Do not send provider payloads, local config paths, or authentication headers to the browser.
      console.error('Impactor request failed:', error instanceof Error ? error.name : 'UnknownError');
      res.status(503).json({ error: 'The memory service could not complete this request. Try again, or start a fresh agent.' });
    });
  };
}

function procedureTrace(run: RunResult): ProcedureTrace {
  return {
    session_id: `impactor:${run.id}`,
    task_description: 'Recheck a simulated delivery route after its package mass changes, using a learned dependency and measured load result.',
    harness: 'impactor',
    tool_calls: [
      { name: 'recall_dependencies', input: {
        description: 'Recall the saved GBrain dependency rules before deciding which checks are still applicable.' },
        result: { ok: true, rules: run.memoryUsed.map(rule => ({ field: rule.field, check: rule.check, reason: rule.reason })) } },
      { name: 'select_checks', input: {
        description: `Compare current inputs (${run.world.packageMass} kg parcel, ${run.world.bridgeCapacity} kg bridge) with check receipts using the recalled dependencies.` },
        result: { ok: true, selected: run.plan.selectedChecks, reused: run.plan.reusedChecks } },
    ],
  };
}

async function verifyWithCommands(run: RunResult): Promise<ProcedureTrace> {
  const directory = path.join(dataDirectory, 'verification');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'input.json'), JSON.stringify({ world: run.world,
    routeReady: run.checks.find(c => c.checkId === 'route')!.receipt.passed,
    destinationReady: run.checks.find(c => c.checkId === 'destination')!.receipt.passed,
    expectedRoute: run.route, expectedOutcome: run.outcome }), { mode: 0o600 });
  const trace = procedureTrace(run);
  for (const step of ['check-load', 'choose-route', 'simulate-delivery', 'verify-run']) {
    const args = ['scripts/sim-step.mjs', step, '--dir', '.data/verification'];
    const result = await executeFile(process.execPath, args, { cwd: projectRoot, timeout: 5000, maxBuffer: 64 * 1024 });
    const observed = JSON.parse(result.stdout.trim()) as Record<string, unknown>;
    trace.tool_calls.push({ name: 'shell', input: { command: `node ${args.join(' ')}`,
      description: `Run the real ${step} operation against the current synthetic world and saved evidence.` },
      result: { ok: true, exit_code: 0, ...observed } });
  }
  return trace;
}

app.get('/api/status', route(async (req, res) => {
  res.json({ integrations: await integrations(req.query.refresh === '1') });
}));

app.post('/api/session', route(async (_req, res) => {
  const session = await serialize(newSession);
  res.json({ session, integrations: await integrations() });
}));

app.post('/api/run', route(async (req, res) => {
  const world = worldFrom(req.body?.world);
  const response = await serialize(async () => {
    const current = sessionFrom(req.body);
    const rules = await brain.recallRules(namespace);
    const plan = planRun(current, world, rules);
    const learnedLoadCheck = plan.selectedChecks.includes('load')
      && rules.some(rule => rule.field === 'packageMass' && rule.check === 'load');
    const procedureMemory = learnedLoadCheck
      ? await memorable.recallProcedure('Recheck a simulated delivery route after its package mass changes, using a learned dependency and measured load result.')
      : null;
    const { session, run } = executeRun(current, world, rules, new Date().toISOString(), procedureMemory ?? undefined);
    let procedure: { saved: boolean; message: string; slug?: string } | undefined;
    if (learnedLoadCheck && run.outcome === 'delivered') {
      const verifiedTrace = await verifyWithCommands(run);
      if (verifiedTrace.tool_calls.at(-1)?.result.verified !== true) {
        throw new Error('Independent delivery verification failed');
      }
      run.independentVerification = { passed: true, steps: 4 };
      if (!recordedProcedure) procedure = await memorable.recordProcedure(verifiedTrace).catch(() => ({
        saved: false, message: 'Procedure recording is unavailable; GBrain learning is already saved.',
      }));
      if (procedure) recordedProcedure = procedure.saved;
    }
    sessions.set(session.id, session);
    return { session, run, procedure };
  });
  res.json({ ...response, integrations: await integrations() });
}));

app.post('/api/teach', route(async (req, res) => {
  const response = await serialize(async () => {
    const session = sessionFrom(req.body);
    const annotation = typeof req.body?.lesson === 'string' ? req.body.lesson.trim().slice(0, 350) : '';
    const rule: MemoryRule = {
      id: 'package-mass-load', field: 'packageMass', check: 'load', source: 'gbrain',
      reason: 'When the package mass changes, recheck the bridge load before reusing an earlier crossing result.',
      provenance: `Human correction in this synthetic robot experiment.${annotation ? ' Note: ' + annotation : ''}`,
      createdAt: new Date().toISOString(),
    };
    const saved = await brain.rememberRule(namespace, rule);
    const recalled = await brain.recallRules(namespace);
    if (!recalled.some(r => r.id === saved.id && r.field === saved.field && r.check === saved.check)) {
      throw new Error('Memory round-trip verification failed');
    }
    const updated = { ...session, rules: [
      ...session.rules.filter(r => r.source === 'baseline'), ...recalled,
    ] };
    sessions.set(session.id, updated);
    return { session: updated, rule: saved, recalled: true,
      procedure: { saved: false, message: 'The checking procedure is recorded after the next verified delivery.' } };
  });
  res.json({ ...response, integrations: await integrations() });
}));

app.post('/api/reset', route(async (_req, res) => {
  const session = await serialize(async () => {
    await brain.forgetRules(namespace);
    const fresh = await newSession();
    sessions.clear();
    sessions.set(fresh.id, fresh);
    recordedProcedure = false;
    return fresh;
  });
  res.json({ session, integrations: await integrations(true) });
}));

app.get('/api/export', route(async (req, res) => {
  const session = sessionFrom({ sessionId: req.query.sessionId });
  const rules = await brain.recallRules(namespace);
  res.setHeader('Content-Disposition', 'attachment; filename="impactor-evidence.json"');
  res.json({ schemaVersion: 1, product: 'Impactor', source: 'Anonymous synthetic simulation',
    exportedAt: new Date().toISOString(), world: session.world,
    impactMap: rules.map(({ factId, ...rule }) => rule),
    baselineRules: session.rules.filter(r => r.source === 'baseline'),
    receipts: session.receipts, runs: session.history });
}));

const opsSessions = new Map<string,OpsState>();
async function opsKeys(){
 let memorableKey=process.env.MEMORABLE_API_KEY;
 if(!memorableKey)try{memorableKey=JSON.parse(await readFile(path.join(homedir(),'.memorable','config.json'),'utf8')).api_key;}catch{}
 return{GBRAIN_TOKEN:(await brain.authorization())||undefined,TYPESAFE_API_KEY:process.env.TYPESAFE_API_KEY,MEMORABLE_API_KEY:memorableKey,RIVER_RELAY_URL:process.env.RIVER_RELAY_URL,RIVER_RELAY_TOKEN:process.env.RIVER_RELAY_TOKEN};
}
app.post('/api/ops/:action',route(async(req,res)=>{
 const body=req.body,id=body?.id;
 if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))throw new RequestError('Start a fresh workspace.');
 const state=await serialize(async()=>{
  const keys=await opsKeys();let current=opsSessions.get(id)||await createOps(id,keys);
  const action=req.params.action;
  if(action==='session'){if(body.fresh)current=await createOps(id,keys);}
  else if(action==='forecast')current=await forecastOps(current,validateWorld(body.world),String(body.goal||'').slice(0,600),keys);
  else if(action==='run')current=await runOps(current,validateWorld(body.world),String(body.goal||'').slice(0,600),keys,body.hotLoop!==false,body.controller||"jev");
  else if(action==='learn')current=await learnOps(current,validateWorld(body.world),keys);
  else throw new RequestError('Unknown operation.',404);
  opsSessions.set(id,current);return current;
 });res.json({state});
}));

app.post('/api/work/:action',route(async(req,res)=>{res.json(await workplace(req.params.action as string,req.body,await opsKeys()));}));

app.use('/api', (_req, res) => { res.status(404).json({ error: 'Unknown API route.' }); });

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(projectRoot, 'dist')));
  app.get('*', (_req, res) => { res.sendFile(path.join(projectRoot, 'dist', 'index.html')); });
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ root: projectRoot, server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

const port = Number(process.env.PORT || 4173);
app.listen(port, '127.0.0.1', () => { console.log(`Impactor is ready at http://127.0.0.1:${port}`); });
