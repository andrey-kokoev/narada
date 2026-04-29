import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

export type LawReceiptStatus = 'read' | 'acknowledged' | 'question' | 'blocked';

export interface LawChangeRecord {
  schema: 'https://narada.dev/schemas/law-change/v1';
  change_id: string;
  issued_at: string;
  issuer: string;
  summary: string;
  scope: string;
  files: string[];
  commit: string | null;
  required_roles: string[];
  law_sources: string[];
}

export interface LawReceiptRecord {
  schema: 'https://narada.dev/schemas/law-receipt/v1';
  receipt_id: string;
  change_id: string;
  agent_id: string;
  role: string | null;
  session_id: string | null;
  operator_surface_identity: string | null;
  status: LawReceiptStatus;
  read_at: string;
  acknowledged_at: string | null;
  questions_or_blockers: string[];
}

export interface LawAdmissionBlocker {
  change_id: string;
  summary: string;
  scope: string;
  required_roles: string[];
  files: string[];
}

export interface LawAdmissionResult {
  status: 'clear' | 'blocked';
  agent_id: string;
  role: string | null;
  unread: LawAdmissionBlocker[];
}

export function lawRoot(cwd: string): string {
  return join(resolve(cwd), '.ai', 'law');
}

export function lawChangesDir(cwd: string): string {
  return join(lawRoot(cwd), 'changes');
}

export function lawReceiptsDir(cwd: string): string {
  return join(lawRoot(cwd), 'receipts');
}

export function lawChangePath(cwd: string, changeId: string): string {
  return join(lawChangesDir(cwd), `${safeFilePart(changeId)}.json`);
}

export function lawReceiptPath(cwd: string, receipt: Pick<LawReceiptRecord, 'agent_id' | 'change_id'>): string {
  return join(lawReceiptsDir(cwd), `${safeFilePart(receipt.agent_id)}__${safeFilePart(receipt.change_id)}.json`);
}

export async function createLawChange(cwd: string, input: {
  issuer: string;
  summary: string;
  scope?: string;
  files?: string[];
  commit?: string | null;
  requiredRoles?: string[];
  lawSources?: string[];
  changeId?: string;
}): Promise<LawChangeRecord> {
  const now = new Date().toISOString();
  const record: LawChangeRecord = {
    schema: 'https://narada.dev/schemas/law-change/v1',
    change_id: input.changeId?.trim() || `law_${now.replace(/[:.]/g, '-')}_${randomUUID()}`,
    issued_at: now,
    issuer: input.issuer,
    summary: input.summary,
    scope: input.scope?.trim() || 'site',
    files: input.files ?? [],
    commit: input.commit?.trim() || null,
    required_roles: normalizeRoles(input.requiredRoles),
    law_sources: input.lawSources?.length ? input.lawSources : defaultLawSources(),
  };
  await mkdir(lawChangesDir(cwd), { recursive: true });
  await writeFile(lawChangePath(cwd, record.change_id), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return record;
}

export async function listLawChanges(cwd: string): Promise<LawChangeRecord[]> {
  return readJsonDir<LawChangeRecord>(lawChangesDir(cwd));
}

export async function listLawReceipts(cwd: string): Promise<LawReceiptRecord[]> {
  return readJsonDir<LawReceiptRecord>(lawReceiptsDir(cwd));
}

export async function recordLawReceipt(cwd: string, input: {
  changeId: string;
  agentId: string;
  role?: string | null;
  sessionId?: string | null;
  operatorSurfaceIdentity?: string | null;
  status?: LawReceiptStatus;
  questionsOrBlockers?: string[];
}): Promise<LawReceiptRecord> {
  const now = new Date().toISOString();
  const record: LawReceiptRecord = {
    schema: 'https://narada.dev/schemas/law-receipt/v1',
    receipt_id: `law_receipt_${now.replace(/[:.]/g, '-')}_${randomUUID()}`,
    change_id: input.changeId,
    agent_id: input.agentId,
    role: clean(input.role),
    session_id: clean(input.sessionId),
    operator_surface_identity: clean(input.operatorSurfaceIdentity),
    status: input.status ?? 'acknowledged',
    read_at: now,
    acknowledged_at: input.status === 'read' ? null : now,
    questions_or_blockers: input.questionsOrBlockers ?? [],
  };
  await mkdir(lawReceiptsDir(cwd), { recursive: true });
  await writeFile(lawReceiptPath(cwd, record), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return record;
}

export async function unreadLawChanges(cwd: string, agentId: string, role?: string | null): Promise<LawAdmissionBlocker[]> {
  const [changes, receipts] = await Promise.all([listLawChanges(cwd), listLawReceipts(cwd)]);
  const receiptByChange = new Map(
    receipts
      .filter((receipt) => receipt.agent_id === agentId && (receipt.status === 'read' || receipt.status === 'acknowledged'))
      .map((receipt) => [receipt.change_id, receipt]),
  );
  const roleValue = clean(role);
  return changes
    .filter((change) => appliesToRole(change, roleValue))
    .filter((change) => !receiptByChange.has(change.change_id))
    .sort((a, b) => a.issued_at.localeCompare(b.issued_at))
    .map((change) => ({
      change_id: change.change_id,
      summary: change.summary,
      scope: change.scope,
      required_roles: change.required_roles,
      files: change.files,
    }));
}

export async function checkLawAdmission(cwd: string, agentId: string | undefined, role?: string | null): Promise<LawAdmissionResult> {
  const agent = clean(agentId);
  if (!agent) return { status: 'clear', agent_id: '', role: clean(role), unread: [] };
  const resolvedRole = clean(role) ?? await inferAgentRole(cwd, agent);
  const unread = await unreadLawChanges(cwd, agent, resolvedRole);
  return {
    status: unread.length > 0 ? 'blocked' : 'clear',
    agent_id: agent,
    role: resolvedRole,
    unread,
  };
}

export function lawUpdateRequiredResult(admission: LawAdmissionResult): Record<string, unknown> {
  return {
    status: 'error',
    error: 'law_update_required',
    reason: `Agent ${admission.agent_id} has ${admission.unread.length} unread mandatory law change(s).`,
    law_update_required: true,
    unread_law_changes: admission.unread,
    repair_command: `narada law unread --agent ${admission.agent_id} --role ${admission.role ?? '<role>'}`,
  };
}

function appliesToRole(change: LawChangeRecord, role: string | null): boolean {
  if (change.required_roles.length === 0 || change.required_roles.includes('*')) return true;
  if (!role) return true;
  return change.required_roles.includes(role);
}

function normalizeRoles(roles: string[] | undefined): string[] {
  return (roles ?? ['*']).map((role) => role.trim()).filter(Boolean);
}

function defaultLawSources(): string[] {
  return [
    'AGENTS.md',
    'SEMANTICS.md',
    '.ai/task-contracts',
    'docs/concepts',
    'docs/product/site-governance-coordinates.md',
  ];
}

function safeFilePart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

function clean(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function readJsonDir<T>(dir: string): Promise<T[]> {
  if (!existsSync(dir)) return [];
  const names = await readdir(dir);
  const records: T[] = [];
  for (const name of names.sort()) {
    if (!name.endsWith('.json')) continue;
    const raw = await readFile(join(dir, basename(name)), 'utf8');
    records.push(JSON.parse(raw) as T);
  }
  return records;
}

async function inferAgentRole(cwd: string, agentId: string): Promise<string | null> {
  const rosterPath = join(resolve(cwd), '.ai', 'agents', 'roster.json');
  if (!existsSync(rosterPath)) return null;
  try {
    const parsed = JSON.parse(await readFile(rosterPath, 'utf8')) as { agents?: Array<{ agent_id?: string; role?: string }> };
    return clean(parsed.agents?.find((agent) => agent.agent_id === agentId)?.role);
  } catch {
    return null;
  }
}
