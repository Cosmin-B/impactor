import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import type { IntegrationStatus, ProcedureMemory, ProcedureTrace } from '../shared/types';

const execute = promisify(execFile);
const CLI_VERSION = '0.5.30';
const DEFAULT_API = 'https://memorable-extraction-api.memorable.workers.dev';
const ANSI = /\u001b\[[0-9;]*m/g;
const OWNED_SLUGS = join(dirname(fileURLToPath(import.meta.url)), '..', '.data', 'memorable-procedures.json');

type CliResult = { ok: true; output: string } | { ok: false; message: string };
export type ProcedureResult = { saved: boolean; message: string; slug?: string; procedure?: ProcedureMemory };

function cliFailureMessage(error: NodeJS.ErrnoException & { killed?: boolean; stdout?: string; stderr?: string }): string {
  if (error.killed) return 'Memorable did not finish before the time limit.';
  const diagnostic = `${error.stdout || ''}\n${error.stderr || ''}`;
  const reason = diagnostic.match(/not stored:.*\((single_verb|too_few_steps|no_postcondition|no_decisive_steps|empty_trace)(?:,\s*[a-z_]+)?\)/)?.[1];
  if (reason) return `Memorable declined this trace (${reason}); no procedure was stored.`;
  return 'Memorable could not complete the operation. Check its local CLI status.';
}

async function ownedSlugs(): Promise<string[]> {
  try {
    const value: unknown = JSON.parse(await readFile(OWNED_SLUGS, 'utf8'));
    return Array.isArray(value) ? value.filter((slug): slug is string => typeof slug === 'string' && /^procedures\/[a-zA-Z0-9._/-]+$/.test(slug)) : [];
  } catch {
    return [];
  }
}

async function registerSlug(slug: string): Promise<void> {
  const slugs = [...new Set([...(await ownedSlugs()), slug])];
  await mkdir(dirname(OWNED_SLUGS), { recursive: true });
  await writeFile(`${OWNED_SLUGS}.tmp`, JSON.stringify(slugs), { mode: 0o600 });
  await rename(`${OWNED_SLUGS}.tmp`, OWNED_SLUGS);
}

async function cli(args: string[], timeout = 15_000): Promise<CliResult> {
  const candidates = process.env.MEMORABLE_BIN
    ? [{ file: process.env.MEMORABLE_BIN, args }]
    : [{ file: 'memorable', args }, { file: 'npx', args: ['--yes', `memorable-cli@${CLI_VERSION}`, ...args] }];
  for (const candidate of candidates) {
    try {
      const result = await execute(candidate.file, candidate.args, {
        timeout,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      });
      return { ok: true, output: result.stdout.replace(ANSI, '') };
    } catch (error) {
      const failure = error as NodeJS.ErrnoException & { killed?: boolean; stdout?: string; stderr?: string };
      if (failure.code === 'ENOENT') continue;
      // Return only recognized admission codes, never raw credential/configuration diagnostics.
      return { ok: false, message: cliFailureMessage(failure) };
    }
  }
  return { ok: false, message: 'Memorable CLI is unavailable on this server.' };
}

async function credentials(): Promise<{ apiKey: string; apiUrl: string } | null> {
  if (process.env.MEMORABLE_API_KEY) {
    return { apiKey: process.env.MEMORABLE_API_KEY, apiUrl: process.env.MEMORABLE_API_URL || DEFAULT_API };
  }
  try {
    const config: unknown = JSON.parse(await readFile(join(process.env.MEMORABLE_HOME || homedir(), '.memorable', 'config.json'), 'utf8'));
    if (!config || typeof config !== 'object') return null;
    const values = config as Record<string, unknown>;
    return typeof values.api_key === 'string' && typeof values.api_url === 'string'
      ? { apiKey: values.api_key, apiUrl: values.api_url } : null;
  } catch {
    return null;
  }
}

export async function getIntegrationStatus(): Promise<IntegrationStatus> {
  const checkedAt = new Date().toISOString();
  const unavailable = (configured: boolean, message: string): IntegrationStatus => ({
    provider: 'memorable', configured, connected: false, state: 'unavailable', message, checkedAt,
  });
  const status = await cli(['status']);
  if (!status.ok) return unavailable(false, status.message);
  const configured = /extraction api\s+configured/.test(status.output);
  const enabled = /write consent\s+read-write/.test(status.output);
  if (!configured) return unavailable(false, 'Memorable needs local login; GBrain memory still works.');
  if (!enabled) return unavailable(true, 'Memorable is signed in, but recording consent is not enabled.');
  const auth = await credentials();
  if (!auth) return unavailable(true, 'Memorable credentials could not be read by this server.');
  try {
    const endpoint = new URL('/v1/usage/me', auth.apiUrl);
    if (endpoint.protocol !== 'https:') return unavailable(true, 'Memorable requires an HTTPS service endpoint.');
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${auth.apiKey}` },
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return unavailable(true, 'Memorable authentication could not be verified.');
    return { provider: 'memorable', configured: true, connected: true, state: 'connected', message: 'Memorable authentication and recording consent verified.', checkedAt };
  } catch {
    return unavailable(true, 'Memorable service is currently unreachable.');
  }
}

async function showProcedure(slug: string): Promise<ProcedureMemory | null> {
  const shown = await cli(['show', slug]);
  if (!shown.ok) return null;
  // The supported local store keeps every extracted step. CLI `show` deliberately
  // omits `other` actions, so prefer this exact owned record for the visual graph.
  // Encrypted or non-local stores remain untouched and use CLI rendering below.
  try {
    const path = join(process.env.MEMORABLE_HOME || homedir(), '.memorable', 'procedures.jsonl');
    const lines = (await readFile(path, 'utf8')).split('\n').reverse();
    for (const line of lines) {
      if (!line.trim() || line.startsWith('MEMv1:')) continue;
      let item: Record<string, unknown>;
      try { item = JSON.parse(line) as Record<string, unknown>; } catch { continue; }
      if (item.slug !== slug || typeof item.title !== 'string' || !item.payload || typeof item.payload !== 'object') continue;
      const payload = item.payload as Record<string, unknown>;
      if (!Array.isArray(payload.steps)) continue;
      const steps: ProcedureMemory['steps'] = [];
      for (const raw of payload.steps) {
        if (!raw || typeof raw !== 'object' || typeof raw.seq !== 'number' || typeof raw.action !== 'string') continue;
        steps.push({ seq: raw.seq, action: raw.action, ...(typeof raw.command === 'string' ? { description: raw.command } : {}) });
      }
      if (steps.length === 0) continue;
      const postconditions = Array.isArray(payload.postconditions)
        ? payload.postconditions.filter((value): value is string => typeof value === 'string') : [];
      return { slug, title: item.title, steps, postconditions, source: 'memorable' };
    }
  } catch { /* CLI rendering still provides the genuinely recalled decisive steps. */ }
  const title = shown.output.match(/^## A previous session solved a near-identical task:\s*(.+)$/m)?.[1];
  if (!title) return null;
  const steps: ProcedureMemory['steps'] = [];
  const postconditions: string[] = [];
  for (const line of shown.output.split('\n')) {
    const step = line.match(/^\s*(\d+)\.\s+\[[a-z_-]+\]\s+([^:]+?)(?::\s*(.*))?$/);
    if (step) steps.push({ seq: Number(step[1]), action: step[2].trim(), ...(step[3] ? { description: step[3] } : {}) });
    const condition = line.match(/^Verified last time by:\s*(.+)$/);
    if (condition) postconditions.push(condition[1]);
  }
  if (steps.length === 0) return null;
  return { slug, title, steps, postconditions, source: 'memorable' };
}

/** Recall only procedures this application actually recorded, never other private memories. */
export async function recallProcedure(task: string): Promise<ProcedureMemory | null> {
  const owned = new Set(await ownedSlugs());
  if (owned.size === 0 || !task.trim()) return null;
  const recalled = await cli(['recall', task.slice(0, 2000), '--single']);
  if (!recalled.ok) return null;
  const slugs = recalled.output.match(/procedures\/[a-zA-Z0-9._/-]+/g) || [];
  const slug = slugs.find((candidate) => owned.has(candidate));
  return slug ? showProcedure(slug) : null;
}

/** Record only the trace supplied by a completed, successful synthetic check. */
export async function recordProcedure(trace: ProcedureTrace): Promise<ProcedureResult> {
  const finalResult = trace.tool_calls.at(-1)?.result;
  const succeeded = finalResult && (finalResult.ok === true || finalResult.passed === true || finalResult.exit_code === 0);
  if (!trace.session_id || trace.harness !== 'impactor' || !succeeded) {
    return { saved: false, message: 'Only a successful, observed Impactor run can become a procedure.' };
  }
  const status = await getIntegrationStatus();
  if (!status.connected) return { saved: false, message: status.message };
  const serialized = JSON.stringify(trace);
  if (serialized.length > 100_000) return { saved: false, message: 'This trace exceeds the demo recording limit.' };

  const directory = await mkdtemp(join(tmpdir(), 'impactor-memorable-'));
  try {
    const path = join(directory, 'successful-run.json');
    await writeFile(path, serialized, { mode: 0o600 });
    const ingest = await cli(['ingest', path], 30_000);
    if (!ingest.ok) return { saved: false, message: ingest.message };
    const slug = ingest.output.match(/stored\s+(procedures\/[a-zA-Z0-9._/-]+)/)?.[1];
    if (!slug) return { saved: false, message: 'Memorable did not confirm a stored procedure for this trace.' };
    await registerSlug(slug);
    const procedure = await recallProcedure(trace.task_description);
    if (!procedure || procedure.slug !== slug) {
      return { saved: true, slug, message: 'Procedure stored in Memorable; matching recall has not been verified.' };
    }
    return { saved: true, slug, procedure, message: 'Real run stored and recalled through Memorable.' };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
