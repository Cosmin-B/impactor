import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import type { IntegrationStatus, MemoryRule } from '../shared/types';

const ENDPOINT = 'https://gbrain.io/mcp';
const SCHEMA = 'impactor.rule.v1';
const PROVENANCE_PREFIX = 'impactor synthetic demo / ';
const TIMEOUT_MS = 15_000;

type JsonObject = Record<string, unknown>;
type StoredRule = { schema: typeof SCHEMA; namespace: string; rule: MemoryRule };
type OwnedFact = { rule: MemoryRule; factId: string };

function object(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateNamespace(namespace: string): void {
  if (!/^impactor[-/:][a-zA-Z0-9/_-]{1,100}$/.test(namespace)) {
    throw new Error('GBrain namespace must be an Impactor demo namespace.');
  }
}

export async function authorization(): Promise<string | null> {
  const environmentToken = process.env.GBRAIN_TOKEN?.trim();
  if (environmentToken) {
    return environmentToken.startsWith('Bearer ') ? environmentToken : `Bearer ${environmentToken}`;
  }

  try {
    const configPath = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'config.toml');
    const config = parseToml(await readFile(configPath, 'utf8'));
    const servers = config.mcp_servers;
    if (!object(servers) || !object(servers.gbrain) || !object(servers.gbrain.http_headers)) return null;
    const header = servers.gbrain.http_headers.Authorization;
    return typeof header === 'string' && /^Bearer\s+\S+$/.test(header) ? header : null;
  } catch {
    return null;
  }
}

/** Credentials stay in this server module; redirects may never forward them. */
async function callTool(name: string, arguments_: JsonObject): Promise<JsonObject> {
  const auth = await authorization();
  if (!auth) throw new Error('GBrain is not configured. Set GBRAIN_TOKEN on the server.');
  const headers: Record<string, string> = {
    Authorization: auth,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };

  async function rpc(payload: JsonObject): Promise<JsonObject> {
    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new Error('GBrain could not be reached within the time limit.');
    }
    if (!response.ok) throw new Error(`GBrain rejected the request (HTTP ${response.status}).`);
    const session = response.headers.get('Mcp-Session-Id');
    if (session) headers['Mcp-Session-Id'] = session;
    const raw = await response.text();
    if (!raw.trim()) return {};

    let message: unknown;
    try {
      if (response.headers.get('Content-Type')?.startsWith('text/event-stream')) {
        const events = raw.replace(/\r\n/g, '\n').split('\n\n');
        const messages = events.flatMap((event) => {
          const data = event.split('\n').filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart()).join('\n');
          return data ? [JSON.parse(data) as unknown] : [];
        });
        message = messages.find((item) => object(item) && item.id === payload.id);
      } else {
        message = JSON.parse(raw);
      }
    } catch {
      throw new Error('GBrain returned an unreadable protocol response.');
    }
    if (!object(message)) throw new Error('GBrain returned no matching protocol response.');
    if (message.error) throw new Error('GBrain could not complete this protocol request.');
    return message;
  }

  const initialized = await rpc({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'impactor', version: '1.0.0' } },
  });
  if (!object(initialized.result) || typeof initialized.result.protocolVersion !== 'string') {
    throw new Error('GBrain did not initialize a supported session.');
  }
  headers['MCP-Protocol-Version'] = initialized.result.protocolVersion;
  await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' });
  const response = await rpc({
    jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: arguments_ },
  });
  if (!object(response.result) || response.result.isError === true) {
    throw new Error(`GBrain could not complete ${name}.`);
  }
  const result = response.result;
  if (object(result.structuredContent)) return result.structuredContent;
  if (Array.isArray(result.content)) {
    for (const part of result.content) {
      if (!object(part) || part.type !== 'text' || typeof part.text !== 'string') continue;
      try {
        const parsed: unknown = JSON.parse(part.text);
        if (object(parsed)) return parsed;
      } catch { /* Non-JSON content is never interpreted as a memory rule. */ }
    }
  }
  if (name === 'host_ping') return result;
  throw new Error(`GBrain returned no structured ${name} result.`);
}

export async function getIntegrationStatus(): Promise<IntegrationStatus> {
  const checkedAt = new Date().toISOString();
  if (!(await authorization())) {
    return { provider: 'gbrain', configured: false, connected: false, state: 'unavailable', message: 'GBrain server credentials are not configured.', checkedAt };
  }
  try {
    await callTool('host_ping', {});
    return { provider: 'gbrain', configured: true, connected: true, state: 'connected', message: 'Hosted GBrain connection verified.', checkedAt };
  } catch (error) {
    return { provider: 'gbrain', configured: true, connected: false, state: 'unavailable', message: error instanceof Error ? error.message : 'GBrain is unavailable.', checkedAt };
  }
}

function ruleObject(value: unknown): value is MemoryRule {
  return object(value)
    && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 200
    && ['packageMass', 'bridgeCapacity', 'bridgeColor'].includes(String(value.field))
    && ['load', 'route', 'destination'].includes(String(value.check))
    && value.source === 'gbrain'
    && typeof value.reason === 'string' && value.reason.length > 0 && value.reason.length <= 2000
    && typeof value.provenance === 'string' && value.provenance.length > 0 && value.provenance.length <= 500
    && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt));
}

async function ownedFacts(namespace: string): Promise<OwnedFact[]> {
  validateNamespace(namespace);
  const result = await callTool('recall', { entity: namespace, grep: SCHEMA, limit: 100 });
  if (!Array.isArray(result.facts)) throw new Error('GBrain recall returned no facts array.');
  const facts: OwnedFact[] = [];
  for (const fact of result.facts) {
    if (!object(fact) || typeof fact.fact !== 'string' || typeof fact.provenance !== 'string') continue;
    if (fact.provenance !== `${PROVENANCE_PREFIX}${namespace} / user correction`) continue;
    if (fact.expired_at || fact.superseded_by) continue;
    const id = fact.fact_id ?? fact.id;
    const factId = typeof id === 'string' || typeof id === 'number' ? String(id) : null;
    if (!factId) continue;
    try {
      const stored: unknown = JSON.parse(fact.fact);
      if (!object(stored) || stored.schema !== SCHEMA || stored.namespace !== namespace || !ruleObject(stored.rule)) continue;
      facts.push({ rule: stored.rule, factId });
    } catch { /* Ignore unrelated or malformed facts, including during reset. */ }
  }
  return facts;
}

export async function recallRules(namespace: string): Promise<MemoryRule[]> {
  const latest = new Map<string, MemoryRule>();
  // Hosted recall is newest first; preserve the newest correction for each rule.
  for (const { rule, factId } of await ownedFacts(namespace)) {
    if (!latest.has(rule.id)) latest.set(rule.id, { ...rule, factId });
  }
  return [...latest.values()];
}

export async function rememberRule(namespace: string, rule: MemoryRule): Promise<MemoryRule> {
  validateNamespace(namespace);
  if (!ruleObject(rule)) throw new Error('Cannot remember a malformed Impactor rule.');
  const { factId: _previousFactId, ...newRule } = rule;
  const stored: StoredRule = { schema: SCHEMA, namespace, rule: newRule };
  const serialized = JSON.stringify(stored);
  if (serialized.length > 8000) throw new Error('Impactor rule is too large to remember.');
  const result = await callTool('remember', {
    entity: namespace,
    fact: serialized,
    kind: 'fact',
    provenance: `${PROVENANCE_PREFIX}${namespace} / user correction`,
    visibility: 'world',
  });
  if (!['inserted', 'duplicate', 'superseded'].includes(String(result.status))) {
    throw new Error('GBrain has not confirmed that this rule was committed.');
  }
  const factId = typeof result.id === 'string' || typeof result.id === 'number' ? String(result.id) : null;
  if (!factId) throw new Error('GBrain saved the rule without returning its fact ID.');
  return { ...rule, factId };
}

/** Only exact Impactor schema + namespace + provenance matches may be expired. */
export async function forgetRules(namespace: string): Promise<void> {
  const facts = await ownedFacts(namespace);
  if (facts.length >= 100) throw new Error('Too many demo facts to reset safely in one request.');
  for (const fact of facts) {
    const result = await callTool('forget', { id: fact.factId, reason: `Reset synthetic Impactor demo ${namespace}` });
    if (typeof result.expired !== 'boolean') throw new Error('GBrain did not confirm the demo fact reset.');
  }
}
