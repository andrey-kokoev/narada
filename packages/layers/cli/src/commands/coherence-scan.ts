import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SqliteInboxStore, type InboxEnvelope, type InboxEnvelopeKind } from '@narada2/control-plane';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import { inspectAuthorityClonePosture } from '../lib/narada-proper-authority.js';

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
export type CoherenceModule =
  | 'operational'
  | 'semantic'
  | 'telos'
  | 'documentation'
  | 'authority_inversion'
  | 'mutation_evidence'
  | 'locus';

const ALL_MODULES: CoherenceModule[] = ['operational', 'semantic', 'telos', 'documentation', 'mutation_evidence', 'locus'];
const VALID_MODULES: CoherenceModule[] = [...ALL_MODULES, 'authority_inversion'];

interface AuthorityInversionInventory {
  findings?: AuthorityInversionInventoryFinding[];
}

interface AuthorityInversionInventoryFinding {
  finding_id?: unknown;
  surface?: unknown;
  visible_artifact?: unknown;
  hidden_authority_structure?: unknown;
  current_guard?: unknown;
  gap?: unknown;
  severity?: unknown;
  recommended_follow_up?: unknown;
  candidate_tasks?: unknown;
}

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

const SECRET_ARTIFACT_PATTERNS: Array<{ code: string; pattern: RegExp }> = [
  { code: 'secret_key_assignment', pattern: /\b[A-Z0-9_-]*(api[_-]?key|client[_-]?secret|password|private[_-]?key|token|authorization)[A-Z0-9_-]*\b\s*[:=]\s*['"]?[^\s'"]{8,}/i },
  { code: 'bearer_token_literal', pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i },
  { code: 'private_key_block', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { code: 'provider_secret_literal', pattern: /\bsk-[A-Za-z0-9_-]{12,}/ },
];

const CLI_OUTPUT_BYPASS_PATTERNS: Array<{ code: string; pattern: RegExp }> = [
  { code: 'console_stdout_stderr', pattern: /\bconsole\.(log|error|warn|info)\s*\(/ },
  { code: 'process_stdout_stderr_write', pattern: /\bprocess\.(stdout|stderr)\.write\s*\(/ },
];

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

  if (modules.includes('mutation_evidence')) {
    const mutationEvidenceFinding = checkMutationEvidencePosture(cwd);
    if (mutationEvidenceFinding) findings.push(mutationEvidenceFinding);
  }

  if (modules.includes('locus')) {
    const locusFinding = checkAuthorityLocusPosture(cwd);
    if (locusFinding) findings.push(locusFinding);
  }

  if (modules.includes('authority_inversion')) {
    findings.push(...await checkAuthorityInversionInventory(cwd));
  }

  return findings;
}

function checkTaskLifecycleSnapshot(cwd: string): CoherenceFinding | null {
  const dbTracked = git(cwd, ['ls-files', '--error-unmatch', '.ai/task-lifecycle.db']) !== null;
  const snapshotTracked = git(cwd, ['ls-files', '--error-unmatch', '.ai/task-lifecycle-snapshot.json']) !== null;
  const snapshotExists = existsSync(join(cwd, '.ai', 'task-lifecycle-snapshot.json'));
  const dbIgnored = git(cwd, ['check-ignore', '-q', '.ai/task-lifecycle.db']) !== null;
  if (!dbTracked && snapshotTracked && snapshotExists && dbIgnored) {
    const dbPath = join(cwd, '.ai', 'task-lifecycle.db');
    const snapshotPath = join(cwd, '.ai', 'task-lifecycle-snapshot.json');
    const dbMtime = mtimeMs(dbPath);
    const snapshotMtime = mtimeMs(snapshotPath);
    if (dbMtime === null) return null;
    if (snapshotMtime !== null && snapshotMtime >= dbMtime) return null;
    return {
      finding_id: 'task-lifecycle-snapshot-stale',
      module: 'operational',
      severity: 'error',
      confidence: 'high',
      locus: 'task_lifecycle_authority',
      kind: 'observation',
      title: 'Task lifecycle snapshot posture guard is failing',
      summary: 'The local lifecycle DB and tracked snapshot posture do not currently satisfy the guard.',
      evidence: [
        `db_mtime_ms=${dbMtime}`,
        `snapshot_mtime_ms=${snapshotMtime}`,
        'snapshot_freshness=snapshot_stale',
      ],
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

async function checkAuthorityInversionInventory(cwd: string): Promise<CoherenceFinding[]> {
  const inventoryPath = join(cwd, 'docs', 'concepts', 'authority-inversion-inventory.json');
  const raw = await readFile(inventoryPath, 'utf8').catch(() => null);
  if (!raw) {
    return [{
      finding_id: 'authority-inversion-inventory-missing',
      module: 'authority_inversion',
      severity: 'warning',
      confidence: 'high',
      locus: 'authority_inversion_doctrine',
      kind: 'task_candidate',
      title: 'Authority inversion inventory is missing',
      summary: 'Authority-Revealing Inversion scanner needs the bounded inventory artifact produced by task 991.',
      evidence: [`missing=${inventoryPath}`],
      proposed_action: 'Restore docs/concepts/authority-inversion-inventory.json or rerun task 991.',
      cooldown_key: 'authority-inversion-inventory-missing',
    }];
  }

  let parsed: AuthorityInversionInventory;
  try {
    parsed = JSON.parse(raw) as AuthorityInversionInventory;
  } catch (error) {
    return [{
      finding_id: 'authority-inversion-inventory-invalid-json',
      module: 'authority_inversion',
      severity: 'error',
      confidence: 'high',
      locus: 'authority_inversion_doctrine',
      kind: 'task_candidate',
      title: 'Authority inversion inventory is invalid JSON',
      summary: 'The scanner cannot consume the authority inversion inventory.',
      evidence: [error instanceof Error ? error.message : String(error)],
      proposed_action: 'Fix docs/concepts/authority-inversion-inventory.json so it parses as JSON.',
      cooldown_key: 'authority-inversion-inventory-invalid-json',
    }];
  }

  const entries = Array.isArray(parsed.findings) ? parsed.findings : [];
  if (entries.length === 0) {
    return [{
      finding_id: 'authority-inversion-inventory-empty',
      module: 'authority_inversion',
      severity: 'warning',
      confidence: 'high',
      locus: 'authority_inversion_doctrine',
      kind: 'task_candidate',
      title: 'Authority inversion inventory is empty',
      summary: 'The scanner has no bounded artifact-first authority categories to inspect.',
      evidence: ['findings=[]'],
      proposed_action: 'Populate the inventory with bounded authority inversion findings.',
      cooldown_key: 'authority-inversion-inventory-empty',
    }];
  }

  const findings = entries.map((entry) => inventoryEntryToFinding(entry));
  const cliOutputFinding = await checkCliOutputAdmissionBypass(cwd);
  const secretArtifactFinding = await checkSecretValueArtifacts(cwd);
  return [
    ...findings,
    ...(cliOutputFinding ? [cliOutputFinding] : []),
    ...(secretArtifactFinding ? [secretArtifactFinding] : []),
  ];
}

async function checkCliOutputAdmissionBypass(cwd: string): Promise<CoherenceFinding | null> {
  const changedFiles = gitPorcelainChangedFiles(cwd)
    .filter((file) => isCliSourceWorthScanningForOutputBypass(file))
    .slice(0, 50);
  const evidence: string[] = [];
  for (const file of changedFiles) {
    const text = await readFile(join(cwd, file), 'utf8').catch(() => null);
    if (!text || text.includes('\u0000')) continue;
    const matchedCodes = CLI_OUTPUT_BYPASS_PATTERNS
      .filter(({ pattern }) => pattern.test(text))
      .map(({ code }) => code);
    for (const code of matchedCodes) {
      evidence.push(`cli_output_bypass=${file}:pattern=${code}:raw_output_recorded=false`);
      if (evidence.length >= 8) break;
    }
    if (evidence.length >= 8) break;
  }
  if (evidence.length === 0) return null;
  return {
    finding_id: 'authority-inversion-cli-output-admission-bypass-detected',
    module: 'authority_inversion',
    severity: 'warning',
    confidence: 'medium',
    locus: 'cli_output_admission',
    kind: 'task_candidate',
    title: 'Authority inversion risk: CLI output admission bypass detected',
    summary: 'Changed CLI source appears to write directly to stdout/stderr instead of routing finite output through formatter/admission helpers.',
    evidence,
    proposed_action: 'Route finite command output through formattedResult, emitCommandResult, createFormatter, or an explicit interactive/long-lived output admission helper.',
    cooldown_key: `authority-inversion:cli-output-admission-bypass:${evidence.join('|')}`,
  };
}

function mtimeMs(path: string): number | null {
  if (!existsSync(path)) return null;
  return statSync(path).mtimeMs;
}

async function checkSecretValueArtifacts(cwd: string): Promise<CoherenceFinding | null> {
  const changedFiles = gitPorcelainChangedFiles(cwd)
    .filter((file) => isTextArtifactWorthScanning(file))
    .slice(0, 50);
  const evidence: string[] = [];
  for (const file of changedFiles) {
    const text = await readFile(join(cwd, file), 'utf8').catch(() => null);
    if (!text || text.includes('\u0000')) continue;
    const matchedCodes = SECRET_ARTIFACT_PATTERNS
      .filter(({ pattern }) => pattern.test(text))
      .map(({ code }) => code);
    for (const code of matchedCodes) {
      evidence.push(`secret_like_artifact=${file}:pattern=${code}:value_recorded=false`);
      if (evidence.length >= 8) break;
    }
    if (evidence.length >= 8) break;
  }
  if (evidence.length === 0) return null;
  return {
    finding_id: 'authority-inversion-secret-value-artifact-detected',
    module: 'authority_inversion',
    severity: 'warning',
    confidence: 'medium',
    locus: 'secrets',
    kind: 'task_candidate',
    title: 'Authority inversion risk: secret value artifact detected',
    summary: 'Changed text artifacts contain secret-like material that must be handled as capability lifecycle evidence, not copied command/output truth.',
    evidence,
    proposed_action: 'Replace raw secret-like values with credential or capability references and route any reveal/use/rotation through capability-governed secret management.',
    cooldown_key: `authority-inversion:secret-value-artifact:${evidence.join('|')}`,
  };
}

function checkMutationEvidencePosture(cwd: string): CoherenceFinding | null {
  const changedFiles = gitPorcelainChangedFiles(cwd);
  if (changedFiles.length === 0) return null;

  const authorityMutationFiles = changedFiles.filter((file) =>
    file === '.ai/task-lifecycle-snapshot.json' ||
    file.startsWith('.ai/do-not-open/tasks/') ||
    file.startsWith('.ai/inbox-envelopes/')
  );
  if (authorityMutationFiles.length === 0) return null;

  const mutationEvidenceFiles = changedFiles.filter((file) => file.startsWith('.ai/mutation-evidence/'));
  if (mutationEvidenceFiles.length > 0 || hasGitChanges(cwd, ['.ai/mutation-evidence'])) return null;

  return {
    finding_id: 'mutation-evidence-missing-for-authority-surface',
    module: 'mutation_evidence',
    severity: 'warning',
    confidence: 'high',
    locus: 'canonical_mutation_evidence',
    kind: 'task_candidate',
    title: 'Authority-surface changes lack mutation evidence files',
    summary: 'Task, inbox, or lifecycle authority surfaces are dirty without a companion canonical mutation-evidence artifact.',
    evidence: authorityMutationFiles.slice(0, 8).map((file) => `dirty_authority_file=${file}`),
    proposed_action: 'Run the sanctioned lifecycle/inbox command that emits mutation evidence, then export snapshots before commit.',
    cooldown_key: `mutation-evidence-missing:${authorityMutationFiles.sort().join('|')}`,
  };
}

function checkAuthorityLocusPosture(cwd: string): CoherenceFinding | null {
  const posture = inspectAuthorityClonePosture(cwd);
  if (!posture.configured || posture.status === 'authority_clone') return null;

  return {
    finding_id: 'wrong-locus-mutation-risk',
    module: 'locus',
    severity: posture.status === 'stale_authority_clone' ? 'error' : 'warning',
    confidence: 'high',
    locus: 'authority_locus',
    kind: 'task_candidate',
    title: 'Current clone is not ready for mutation authority',
    summary: 'A configured authority-clone posture says mutations here would happen from the wrong or stale locus.',
    evidence: [
      `status=${posture.status}`,
      `repo_root=${posture.repo_root ?? 'unknown'}`,
      `authority_root=${posture.authority_root ?? 'unknown'}`,
      `ahead=${posture.ahead ?? 'unknown'}`,
      `behind=${posture.behind ?? 'unknown'}`,
    ],
    proposed_action: posture.next_safe_command,
    cooldown_key: `wrong-locus:${posture.status}:${posture.repo_root ?? cwd}`,
  };
}

function inventoryEntryToFinding(entry: AuthorityInversionInventoryFinding): CoherenceFinding {
  const findingId = stringOr(entry.finding_id, 'authority-inversion-unknown');
  const severity = parseSeverity(entry.severity);
  const candidateTasks = Array.isArray(entry.candidate_tasks)
    ? entry.candidate_tasks.filter((value) => Number.isFinite(Number(value))).map((value) => Number(value))
    : [];
  return {
    finding_id: `authority-inversion-${findingId}`,
    module: 'authority_inversion',
    severity,
    confidence: 'medium',
    locus: stringOr(entry.surface, 'authority_inversion'),
    kind: severity === 'info' ? 'observation' : 'task_candidate',
    title: `Authority inversion risk: ${findingId}`,
    summary: stringOr(entry.gap, 'Visible artifact may be mistaken for authority.'),
    evidence: [
      `visible_artifact=${stringOr(entry.visible_artifact, 'unknown')}`,
      `hidden_authority=${stringOr(entry.hidden_authority_structure, 'unknown')}`,
      `current_guard=${stringOr(entry.current_guard, 'unknown')}`,
      candidateTasks.length > 0 ? `candidate_tasks=${candidateTasks.join(',')}` : 'candidate_tasks=none',
    ],
    proposed_action: stringOrNull(entry.recommended_follow_up),
    cooldown_key: `authority-inversion:${findingId}`,
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
  if (expanded.includes('all')) return [...VALID_MODULES];
  const modules: CoherenceModule[] = [];
  for (const value of expanded) {
    if (!VALID_MODULES.includes(value as CoherenceModule)) {
      return new Error(`Invalid coherence module '${value}'. Expected one of: ${VALID_MODULES.join(', ')}, all`);
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

function gitLines(cwd: string, args: string[]): string[] {
  return git(cwd, args)?.split(/\r?\n/).filter(Boolean) ?? [];
}

function gitPorcelainChangedFiles(cwd: string): string[] {
  try {
    const paths = execFileSync('git', ['status', '--porcelain'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split(/\r?\n/)
      .map((line) => line.slice(3).trim())
      .filter(Boolean);
    return [...new Set(paths.flatMap((file) => expandChangedPath(cwd, file)).slice(0, 200))];
  } catch {
    return [];
  }
}

function hasGitChanges(cwd: string, paths: string[]): boolean {
  try {
    return execFileSync('git', ['status', '--porcelain', '--', ...paths], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim().length > 0;
  } catch {
    return false;
  }
}

function expandChangedPath(cwd: string, file: string): string[] {
  const fullPath = join(cwd, file);
  if (!existsSync(fullPath)) return [file];
  const stat = statSync(fullPath);
  if (!stat.isDirectory()) return [file];
  const files: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === '.git' || entry === 'node_modules' || entry === 'dist' || entry === 'coverage') continue;
      const path = join(dir, entry);
      const entryStat = statSync(path);
      if (entryStat.isDirectory()) {
        visit(path);
      } else {
        files.push(path.slice(cwd.length + 1).replace(/\\/g, '/'));
      }
      if (files.length >= 200) return;
    }
  };
  visit(fullPath);
  return files.length > 0 ? files : [file];
}

function isTextArtifactWorthScanning(file: string): boolean {
  if (
    file.startsWith('.git/') ||
    file.startsWith('node_modules/') ||
    file.startsWith('dist/') ||
    file.startsWith('coverage/') ||
    file.startsWith('.ai/mutation-evidence/')
  ) return false;
  return !/\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|db|sqlite|wasm)$/i.test(file);
}

function isCliSourceWorthScanningForOutputBypass(file: string): boolean {
  const normalized = file.replace(/\\/g, '/');
  if (!normalized.startsWith('packages/layers/cli/src/')) return false;
  if (!/\.(ts|tsx|js|mjs|cjs)$/.test(normalized)) return false;
  return ![
    'packages/layers/cli/src/lib/cli-output.ts',
    'packages/layers/cli/src/lib/formatter.ts',
    'packages/layers/cli/src/lib/logger.ts',
  ].includes(normalized);
}

function firstLines(text: string, limit: number): string[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, limit);
}

function clampLimit(limit: number): number {
  return Math.max(1, Math.min(limit, 50));
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function parseSeverity(value: unknown): CoherenceSeverity {
  return value === 'error' || value === 'warning' || value === 'info' ? value : 'warning';
}
