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
  modules?: string[];
  store?: SqliteInboxStore;
}

type CoherenceSeverity = 'info' | 'warning' | 'error';
type CoherenceEnvelopeKind = Extract<InboxEnvelopeKind, 'observation' | 'task_candidate'>;
export type CoherenceModule = 'operational' | 'semantic' | 'telos' | 'documentation';

const ALL_MODULES: CoherenceModule[] = ['operational', 'semantic', 'telos', 'documentation'];

interface CoherenceFinding {
  finding_id: string;
  module: CoherenceModule;
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
  const modules = parseModules(options.modules);
  if (modules instanceof Error) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: modules.message },
    };
  }
  const findings = (await collectFindings(cwd, modules)).slice(0, limit);
  const submitted = options.submit ? await submitFindings(cwd, findings, options.store) : [];
  const result = {
    status: 'success',
    mode: options.submit ? 'submitted' : 'dry_run',
    modules,
    finding_count: findings.length,
    findings,
    submitted,
  };
  const human = [
    `Coherence findings: ${findings.length}`,
    `Mode: ${options.submit ? 'submitted' : 'dry-run'}`,
    `Modules: ${modules.join(', ')}`,
    ...findings.map((finding) => `${finding.severity} ${finding.module}/${finding.finding_id}: ${finding.title}`),
    ...(options.submit ? submitted.map((item) => `Submitted ${item.kind}: ${item.envelope_id}`) : ['No inbox mutation performed. Use --submit to emit envelopes.']),
  ];
  return {
    exitCode: ExitCode.SUCCESS,
    result: formattedResult(result, human, options.format ?? 'auto'),
  };
}

async function collectFindings(cwd: string, modules: CoherenceModule[]): Promise<CoherenceFinding[]> {
  const findings: CoherenceFinding[] = [];
  if (modules.includes('operational')) {
    const snapshotFinding = checkTaskLifecycleSnapshot(cwd);
    if (snapshotFinding) findings.push(snapshotFinding);

    const workNextFinding = await checkUnifiedWorkNextPeek(cwd);
    if (workNextFinding) findings.push(workNextFinding);
  }

  if (modules.includes('semantic')) {
    const semanticFinding = await checkSemanticTopologyDocumentation(cwd);
    if (semanticFinding) findings.push(semanticFinding);
  }

  if (modules.includes('telos')) {
    const telosFinding = await checkTelosDoctrine(cwd);
    if (telosFinding) findings.push(telosFinding);
  }

  if (modules.includes('documentation')) {
    const docFinding = await checkDocumentationCoherenceDoctrine(cwd);
    if (docFinding) findings.push(docFinding);
  }

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
      module: 'operational',
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
    module: 'operational',
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
    module: 'operational',
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

async function checkSemanticTopologyDocumentation(cwd: string): Promise<CoherenceFinding | null> {
  const agents = await readFile(join(cwd, 'AGENTS.md'), 'utf8').catch(() => '');
  const semantics = await readFile(join(cwd, 'SEMANTICS.md'), 'utf8').catch(() => '');
  if (
    agents.includes('composed topology of authority-homogeneous zones')
    && semantics.includes('zone')
    && semantics.includes('governed crossing')
  ) {
    return null;
  }
  return {
    finding_id: 'semantic-topology-doctrine-missing',
    module: 'semantic',
    severity: 'warning',
    confidence: 'medium',
    locus: 'semantic_coherence',
    kind: 'task_candidate',
    title: 'Zone/crossing topology doctrine is not discoverable enough',
    summary: 'Semantic coherence requires the topology reading to be visible from agent instructions and canonical semantics.',
    evidence: [
      `AGENTS topology phrase present=${agents.includes('composed topology of authority-homogeneous zones')}`,
      `SEMANTICS zone present=${semantics.includes('zone')}`,
      `SEMANTICS governed crossing present=${semantics.includes('governed crossing')}`,
    ],
    proposed_action: 'Amend semantic documentation so Zone and governed crossing remain the primary explanatory lens.',
    cooldown_key: 'semantic-topology-doctrine',
  };
}

async function checkTelosDoctrine(cwd: string): Promise<CoherenceFinding | null> {
  const inhabited = await readFile(join(cwd, 'docs', 'concepts', 'inhabited-evolution.md'), 'utf8').catch(() => '');
  const coherence = await readFile(join(cwd, 'docs', 'concepts', 'self-maintenance-coherence-loop.md'), 'utf8').catch(() => '');
  const inhabitedLower = inhabited.toLowerCase();
  if (
    inhabitedLower.includes('build what the operation has earned')
    && coherence.includes('treat earned evolution as valid unless an explicit invariant is violated')
    && coherence.includes('Repair, promotion, and execution are never default scanner actions')
  ) {
    return null;
  }
  return {
    finding_id: 'telos-preservation-doctrine-missing',
    module: 'telos',
    severity: 'warning',
    confidence: 'medium',
    locus: 'telos_preservation',
    kind: 'task_candidate',
    title: 'Telos preservation doctrine is not explicit enough',
    summary: 'Telos preservation should protect earned evolution, intelligence-authority separation, and anti-autoimmune posture.',
    evidence: [
      `earned operation phrase present=${inhabitedLower.includes('build what the operation has earned')}`,
      `earned evolution exception present=${coherence.includes('treat earned evolution as valid unless an explicit invariant is violated')}`,
      `no default repair phrase present=${coherence.includes('Repair, promotion, and execution are never default scanner actions')}`,
    ],
    proposed_action: 'Amend coherence doctrine with explicit telos-preservation charter module rules.',
    cooldown_key: 'telos-preservation-doctrine',
  };
}

async function checkDocumentationCoherenceDoctrine(cwd: string): Promise<CoherenceFinding | null> {
  const coherence = await readFile(join(cwd, 'docs', 'concepts', 'self-maintenance-coherence-loop.md'), 'utf8').catch(() => '');
  if (
    coherence.includes('Documentation Coherency')
    && coherence.includes('Documentation findings should use the same envelope path')
    && coherence.includes('premature machinery')
  ) {
    return null;
  }
  return {
    finding_id: 'documentation-coherence-doctrine-missing',
    module: 'documentation',
    severity: 'info',
    confidence: 'medium',
    locus: 'documentation_coherence',
    kind: 'task_candidate',
    title: 'Documentation coherency charter posture is not explicit',
    summary: 'Documentation coherency should remain a module until repeated drift earns a separate charter.',
    evidence: [
      `documentation section present=${coherence.includes('Documentation Coherency')}`,
      `envelope path present=${coherence.includes('Documentation findings should use the same envelope path')}`,
      `premature machinery phrase present=${coherence.includes('premature machinery')}`,
    ],
    proposed_action: 'Document documentation-coherence as a module under the event-summoned coherence loop.',
    cooldown_key: 'documentation-coherence-doctrine',
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
          module: finding.module,
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

function parseModules(values: string[] | undefined): CoherenceModule[] | Error {
  if (!values || values.length === 0) return [...ALL_MODULES];
  const expanded = values.flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean);
  if (expanded.includes('all')) return [...ALL_MODULES];
  const modules: CoherenceModule[] = [];
  for (const value of expanded) {
    if (!ALL_MODULES.includes(value as CoherenceModule)) {
      return new Error(`Invalid coherence module '${value}'. Expected one of: ${ALL_MODULES.join(', ')}, all`);
    }
    if (!modules.includes(value as CoherenceModule)) modules.push(value as CoherenceModule);
  }
  return modules.length > 0 ? modules : [...ALL_MODULES];
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
