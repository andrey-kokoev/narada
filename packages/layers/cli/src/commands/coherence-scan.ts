import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SqliteInboxStore, type InboxEnvelope, type InboxEnvelopeKind } from '@narada2/control-plane';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';

export interface CoherenceScanOptions {
  cwd?: string;
  format?: CliFormat;
  submit?: boolean;
  limit?: number;
  store?: SqliteInboxStore;
}

type CoherenceSeverity = 'info' | 'warning' | 'error';
type CoherenceEnvelopeKind = Extract<InboxEnvelopeKind, 'observation' | 'task_candidate'>;

interface CoherenceFinding {
  finding_id: string;
  severity: CoherenceSeverity;
  confidence: 'low' | 'medium' | 'high';
  locus: string;
  kind: CoherenceEnvelopeKind;
  title: string;
  summary: string;
  evidence: string[];
  proposed_action: string | null;
  cooldown_key: string;
}

interface SubmittedFinding {
  finding_id: string;
  envelope_id: string;
  kind: CoherenceEnvelopeKind;
}

export async function coherenceScanCommand(options: CoherenceScanOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const limit = clampLimit(options.limit ?? 20);
  const findings = (await collectFindings(cwd)).slice(0, limit);
  const submitted = options.submit ? await submitFindings(cwd, findings, options.store) : [];
  const result = {
    status: 'success',
    mode: options.submit ? 'submitted' : 'dry_run',
    finding_count: findings.length,
    findings,
    submitted,
  };
  const human = [
    `Coherence findings: ${findings.length}`,
    `Mode: ${options.submit ? 'submitted' : 'dry-run'}`,
    ...findings.map((finding) => `${finding.severity} ${finding.finding_id}: ${finding.title}`),
    ...(options.submit ? submitted.map((item) => `Submitted ${item.kind}: ${item.envelope_id}`) : ['No inbox mutation performed. Use --submit to emit envelopes.']),
  ];
  return {
    exitCode: ExitCode.SUCCESS,
    result: formattedResult(result, human, options.format ?? 'auto'),
  };
}

async function collectFindings(cwd: string): Promise<CoherenceFinding[]> {
  const findings: CoherenceFinding[] = [];
  const snapshotFinding = checkTaskLifecycleSnapshot(cwd);
  if (snapshotFinding) findings.push(snapshotFinding);

  const workNextFinding = await checkUnifiedWorkNextPeek(cwd);
  if (workNextFinding) findings.push(workNextFinding);

  return findings;
}

function checkTaskLifecycleSnapshot(cwd: string): CoherenceFinding | null {
  const dbTracked = git(cwd, ['ls-files', '--error-unmatch', '.ai/task-lifecycle.db']) !== null;
  const snapshotTracked = git(cwd, ['ls-files', '--error-unmatch', '.ai/task-lifecycle-snapshot.json']) !== null;
  const snapshotExists = existsSync(join(cwd, '.ai', 'task-lifecycle-snapshot.json'));
  const dbIgnored = git(cwd, ['check-ignore', '-q', '.ai/task-lifecycle.db']) !== null;
  if (!dbTracked && snapshotTracked && snapshotExists && dbIgnored) {
    if (!existsSync(join(cwd, 'scripts', 'guard-task-lifecycle-db.sh'))) return null;
    const guard = spawnSync('bash', ['scripts/guard-task-lifecycle-db.sh'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (guard.status === 0) return null;
    return {
      finding_id: 'task-lifecycle-snapshot-stale',
      severity: 'error',
      confidence: 'high',
      locus: 'task_lifecycle_authority',
      kind: 'observation',
      title: 'Task lifecycle snapshot posture guard is failing',
      summary: 'The local lifecycle DB and tracked snapshot posture do not currently satisfy the guard.',
      evidence: firstLines(guard.stderr || guard.stdout, 4),
      proposed_action: 'narada task lifecycle export --output .ai/task-lifecycle-snapshot.json',
      cooldown_key: 'task-lifecycle-snapshot-stale',
    };
  }
  return {
    finding_id: 'task-lifecycle-snapshot-posture-missing',
    severity: 'error',
    confidence: 'high',
    locus: 'task_lifecycle_authority',
    kind: 'task_candidate',
    title: 'Task lifecycle snapshot-backed Git posture is incomplete',
    summary: 'Expected tracked snapshot, ignored local SQLite DB, and untracked binary DB posture are not all present.',
    evidence: [
      `db_tracked=${dbTracked}`,
      `snapshot_tracked=${snapshotTracked}`,
      `snapshot_exists=${snapshotExists}`,
      `db_ignored=${dbIgnored}`,
    ],
    proposed_action: 'Restore snapshot-backed posture and run pnpm narada:guard-task-db.',
    cooldown_key: 'task-lifecycle-snapshot-posture',
  };
}

async function checkUnifiedWorkNextPeek(cwd: string): Promise<CoherenceFinding | null> {
  const registerPath = join(cwd, 'packages', 'layers', 'cli', 'src', 'commands', 'work-next-register.ts');
  const commandPath = join(cwd, 'packages', 'layers', 'cli', 'src', 'commands', 'work-next.ts');
  const register = await readFile(registerPath, 'utf8').catch(() => '');
  const command = await readFile(commandPath, 'utf8').catch(() => '');
  if (register.includes('--peek') || command.includes('peek?:')) return null;
  return {
    finding_id: 'work-next-missing-peek',
    severity: 'warning',
    confidence: 'high',
    locus: 'agent_work_selection',
    kind: 'task_candidate',
    title: 'Unified work-next lacks a read-only peek mode',
    summary: 'Agents need a way to inspect next admissible work without claiming or mutating state; current unified work-next has no --peek option.',
    evidence: [
      'packages/layers/cli/src/commands/work-next-register.ts has no --peek option',
      'A previous work-next check selected and claimed Task 164 before the caller intended mutation.',
    ],
    proposed_action: 'Add narada work-next --peek as a no-claim read-only inspection mode.',
    cooldown_key: 'work-next-missing-peek',
  };
}

async function submitFindings(
  cwd: string,
  findings: CoherenceFinding[],
  providedStore?: SqliteInboxStore,
): Promise<SubmittedFinding[]> {
  const store = providedStore ?? new SqliteInboxStore(join(cwd, '.ai', 'inbox.db'));
  try {
    const submitted: SubmittedFinding[] = [];
    for (const finding of findings) {
      if (hasOpenEnvelopeForFinding(store, finding)) continue;
      const envelope = store.insert({
        envelope_id: `env_${randomUUID()}`,
        received_at: new Date().toISOString(),
        source: { kind: 'system_observation', ref: `coherence-scan:${finding.finding_id}` },
        kind: finding.kind,
        authority: { level: 'system_observed', principal: 'coherence-scan' },
        payload: {
          title: finding.title,
          summary: finding.summary,
          severity: finding.severity,
          confidence: finding.confidence,
          locus: finding.locus,
          evidence: finding.evidence,
          proposed_action: finding.proposed_action,
          cooldown_key: finding.cooldown_key,
        },
      });
      submitted.push({ finding_id: finding.finding_id, envelope_id: envelope.envelope_id, kind: envelope.kind as CoherenceEnvelopeKind });
    }
    return submitted;
  } finally {
    if (!providedStore) store.close();
  }
}

function hasOpenEnvelopeForFinding(store: SqliteInboxStore, finding: CoherenceFinding): boolean {
  return store
    .list({ limit: 200 })
    .some((envelope: InboxEnvelope) => {
      if (envelope.status !== 'received' && envelope.status !== 'handling') return false;
      const payload = envelope.payload && typeof envelope.payload === 'object' ? envelope.payload as Record<string, unknown> : {};
      return payload.cooldown_key === finding.cooldown_key;
    });
}

function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function firstLines(text: string, limit: number): string[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, limit);
}

function clampLimit(limit: number): number {
  return Math.max(1, Math.min(limit, 50));
}
