import { enforceMcpGuard } from './mcp-guard.mjs';
enforceMcpGuard(process.argv);

import { finishTaskService } from '@narada2/task-governance/task-finish-service';
import { rosterOnFinish, withAuthoredRosterJsonPreserved } from './update-roster-agent.mjs';
import { taskGovernance, taskLifecycleStore } from '@narada2/task-governance';
import { emitCheckpoint } from './emit-checkpoint.mjs';
import { validateFollowUpLedger } from './follow-up-ledger-validation.mjs';
import { validateRecoveryTruthfulnessBody } from './recovery-truthfulness-guard.mjs';
import { readFileSync, existsSync, unlinkSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execGovernedSync } from '@narada2/process-launch-posture';

function parseArgs(argv) {
  const args = { positional: [], close: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--verdict') {
      args.verdict = argv[i + 1];
      i++;
    } else if (arg === '--findings-file') {
      args.findingsFile = argv[i + 1];
      i++;
    } else if (arg === '--summary-file') {
      args.summaryFile = argv[i + 1];
      i++;
    } else if (arg === '--verification-file') {
      args.verificationFile = argv[i + 1];
      i++;
    } else if (arg === '--changed-files-file') {
      args.changedFilesFile = argv[i + 1];
      i++;
    } else if (arg === '--no-files-changed') {
      args.noFilesChanged = true;
    } else if (arg === '--close') {
      args.close = true;
    } else if (arg === '--bypass-fast-finish') {
      args.bypassFastFinish = true;
    } else if (arg === '--bypass-mcp-guard') {
      args.bypassMcpGuard = true;
    } else if (arg === '--dry-run' || arg === '--validate') {
      args.dryRun = true;
    } else {
      args.positional.push(arg);
    }
  }
  return args;
}

const parsed = parseArgs(process.argv);
const cwd = parsed.positional[0] || process.cwd();
const taskNumber = parseInt(parsed.positional[1], 10);
const agent = parsed.positional[2];
let summary = parsed.positional[3] || null;
let verdict = parsed.verdict || null;
let findings = null;
let verification = null;
let changedFiles = null;

if (parsed.summaryFile) {
  if (summary) {
    console.error(JSON.stringify({ status: 'error', error: `Cannot provide both inline summary and --summary-file. Choose one.` }, null, 2));
    process.exit(1);
  }
  try {
    summary = readFileSync(parsed.summaryFile, 'utf8');
  } catch (err) {
    console.error(JSON.stringify({ status: 'error', error: `Failed to read summary file: ${err.message}` }, null, 2));
    process.exit(1);
  }
}

if (parsed.findingsFile) {
  try {
    findings = readFileSync(parsed.findingsFile, 'utf8');
  } catch (err) {
    console.error(JSON.stringify({ status: 'error', error: `Failed to read findings file: ${err.message}` }, null, 2));
    process.exit(1);
  }
}

if (parsed.verificationFile) {
  if (verification) {
    console.error(JSON.stringify({ status: 'error', error: `Cannot provide both inline verification and --verification-file. Choose one.` }, null, 2));
    process.exit(1);
  }
  try {
    verification = readFileSync(parsed.verificationFile, 'utf8');
  } catch (err) {
    console.error(JSON.stringify({ status: 'error', error: `Failed to read verification file: ${err.message}` }, null, 2));
    process.exit(1);
  }
}

if (parsed.changedFilesFile) {
  if (parsed.positional[4]) {
    console.error(JSON.stringify({ status: 'error', error: `Cannot provide both inline changed-files and --changed-files-file. Choose one.` }, null, 2));
    process.exit(1);
  }
  try {
    changedFiles = readFileSync(parsed.changedFilesFile, 'utf8');
  } catch (err) {
    console.error(JSON.stringify({ status: 'error', error: `Failed to read changed files file: ${err.message}` }, null, 2));
    process.exit(1);
  }
}

function validateSummary(value) {
  if (!value || value.trim().length === 0) {
    return { ok: false, error: 'Summary is required and cannot be empty or whitespace-only.' };
  }
  const trimmed = value.trim();
  if (/^--/.test(trimmed) || /^-[a-zA-Z]/.test(trimmed)) {
    return { ok: false, error: `Summary looks like a CLI flag: '${trimmed}'. Pass a description of the work done, not a command-line option.` };
  }
  if (trimmed.length < 10) {
    return { ok: true, warning: `Summary is suspiciously short (${trimmed.length} chars). Consider providing more detail.` };
  }
  return { ok: true };
}

function extractSection(body, heading) {
  const pattern = new RegExp(`^##\\s+${heading}\\s*$`, 'mi');
  const match = body.match(pattern);
  if (!match) return null;
  const start = match.index + match[0].length;
  const rest = body.slice(start);
  const nextHeading = rest.match(/^##\s/m);
  const end = nextHeading ? start + nextHeading.index : body.length;
  return body.slice(start, end).trim();
}

function gatherCheckpointEnrichment(cwd, taskFile, changedFilesRaw) {
  const enrichment = { decisions: [], filesChanged: [], testsRun: [], friction: [] };

  // Files changed from git diff or changed-files parameter
  try {
    if (changedFilesRaw) {
      enrichment.filesChanged = JSON.parse(changedFilesRaw);
    } else {
      const gitDiff = execGovernedSync('git diff --name-only HEAD', { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      enrichment.filesChanged = gitDiff.split('\n').filter(l => l.trim().length > 0);
    }
  } catch {
    // ignore git errors
  }

  if (!taskFile) return enrichment;

  try {
    const body = readFileSync(taskFile, 'utf8');
    const executionNotes = extractSection(body, 'Execution Notes');
    const verification = extractSection(body, 'Verification');

    if (executionNotes) {
      // First non-empty non-comment line as a decision
      const firstLine = executionNotes.split('\n').find(l => l.trim().length > 0 && !l.trim().startsWith('<!--'));
      if (firstLine) {
        enrichment.decisions.push(firstLine.trim().replace(/^[-*]\s*/, '').slice(0, 200));
      }
      // Friction mentions
      if (/friction/i.test(executionNotes)) {
        const frictionLine = executionNotes.split('\n').find(l => /friction/i.test(l) && l.trim().length > 0);
        if (frictionLine) {
          enrichment.friction.push(frictionLine.trim().replace(/^[-*]\s*/, '').slice(0, 200));
        }
      }
    }

    if (verification) {
      // Test mentions
      if (/test|pass|fail|verify/i.test(verification)) {
        const testLines = verification.split('\n').filter(l => /test|pass|fail|verify/i.test(l) && l.trim().length > 0).slice(0, 3);
        enrichment.testsRun = testLines.map(l => l.trim().replace(/^[-*]\s*/, '').slice(0, 200));
      }
    }
  } catch {
    // ignore read errors
  }

  return enrichment;
}

function validateTaskBody(taskPath, summary = '') {
  const body = readFileSync(taskPath, 'utf8');
  const errors = [];

  const executionNotes = extractSection(body, 'Execution Notes');
  if (!executionNotes || executionNotes.length === 0 || /^<!--.*-->\s*$/s.test(executionNotes)) {
    errors.push('Execution Notes section is empty or contains only a placeholder comment. Record what was done, decisions made, and files changed.');
  }

  const verificationSection = extractSection(body, 'Verification');
  if (!verificationSection || verificationSection.length === 0 || /^<!--.*-->\s*$/s.test(verificationSection)) {
    errors.push('Verification section is empty or contains only a placeholder comment. Record commands run, results observed, and how correctness was checked.');
  }

  const criteriaMatch = body.match(/^##\s+Acceptance Criteria\s*$/mi);
  if (criteriaMatch) {
    const criteriaStart = criteriaMatch.index + criteriaMatch[0].length;
    const criteriaRest = body.slice(criteriaStart);
    const nextHeading = criteriaRest.match(/^##\s/m);
    const criteriaEnd = nextHeading ? criteriaStart + nextHeading.index : body.length;
    const criteriaSection = body.slice(criteriaStart, criteriaEnd).trim();
    const criteriaLines = criteriaSection.split('\n').filter(l => l.trim().startsWith('- ['));
    if (criteriaLines.length > 0) {
      const allTbd = criteriaLines.every(l => /\bTBD\b/i.test(l));
      if (allTbd) {
        errors.push('Acceptance criteria are all literal "TBD". They must be substantive before checking.');
      }
    }
  }

  const followUpValidation = validateFollowUpLedger(body);
  if (!followUpValidation.ok) {
    errors.push(...followUpValidation.errors);
  }

  const recoveryTruthfulnessValidation = validateRecoveryTruthfulnessBody({ body, summary, context: taskPath });
  if (!recoveryTruthfulnessValidation.ok) {
    errors.push(...recoveryTruthfulnessValidation.errors);
  }

  return { ok: errors.length === 0, errors };
}

function getMinimumWorkMinutes(cwd) {
  try {
    const configPath = join(resolve(cwd), 'config.json');
    if (!existsSync(configPath)) return 1;
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    // Support narada.site.config.v0 partitioned structure
    const runtimeConfig = config?.runtime_config;
    const param = runtimeConfig?.task_governance?.minimum_work_minutes;
    if (param && typeof param === 'object' && 'current_value' in param) {
      const minutes = param.current_value;
      return typeof minutes === 'number' ? minutes : 1;
    }
    // Fallback to legacy flat structure
    const legacyMinutes = config?.task_governance?.minimum_work_minutes;
    if (typeof legacyMinutes === 'number') return legacyMinutes;
    return 1;
  } catch {
    return 1;
  }
}

function validateClaimDuration(cwd, taskNumber, agentId) {
  let store;
  try {
    store = taskLifecycleStore.openTaskLifecycleStore(cwd);
  } catch {
    return { ok: true };
  }
  try {
    const lifecycle = store.getLifecycleByNumber(taskNumber);
    if (!lifecycle) return { ok: true };
    const assignment = store.getActiveAssignment(lifecycle.task_id);
    if (!assignment) return { ok: true };
    if (assignment.agent_id !== agentId) return { ok: true };
    const claimedAt = new Date(assignment.claimed_at);
    const now = new Date();
    const elapsedMinutes = (now - claimedAt) / (1000 * 60);
    const minimumWorkMinutes = getMinimumWorkMinutes(cwd);
    if (minimumWorkMinutes > 0 && elapsedMinutes < minimumWorkMinutes) {
      return {
        ok: false,
        error: `Task claimed and finished within ${Math.round(elapsedMinutes)} minutes. Minimum work time is ${minimumWorkMinutes} minutes. If this is legitimate, have an architect finish the task or provide additional evidence.`,
      };
    }
  } finally {
    store.db.close();
  }
  return { ok: true };
}

const VALID_VERDICTS = ['accepted', 'accepted_with_notes', 'rejected'];
if (verdict && !VALID_VERDICTS.includes(verdict)) {
  console.error(JSON.stringify({ status: 'error', error: `--verdict must be one of: ${VALID_VERDICTS.join(', ')}` }, null, 2));
  process.exit(1);
}

if (isNaN(taskNumber) || !agent) {
  console.error('Usage: node task-finish.mjs <cwd> <task-number> <agent> [summary] [--verdict <accepted|accepted_with_notes|rejected>] [--summary-file <path>] [--findings-file <path>] [--verification-file <path>] [--changed-files-file <path>] [--no-files-changed] [--dry-run|--validate]');
  process.exit(1);
}

// Collect all blockers for --dry-run mode
const blockers = [];

const summaryValidation = validateSummary(summary);
if (!summaryValidation.ok) {
  blockers.push(summaryValidation.error);
}

// Find task file for body validation
let taskFile = null;
try {
  taskFile = await taskGovernance.findTaskFile(cwd, String(taskNumber));
} catch {
  // ignore
}

if (taskFile) {
  const bodyValidation = validateTaskBody(taskFile.path, summary);
  if (!bodyValidation.ok) {
    blockers.push(...bodyValidation.errors);
  }
}

// Claim-to-finish duration validation (applies to report mode only)
if (!parsed.bypassFastFinish) {
  const durationValidation = validateClaimDuration(cwd, taskNumber, agent);
  if (!durationValidation.ok) {
    blockers.push(durationValidation.error);
  }
}

// Changed-files validation (applies when submitting a new report)
if (!verdict && !changedFiles && !parsed.noFilesChanged) {
  // Auto-detect from git diff before blocking
  let gitChangedFiles = [];
  try {
    const gitDiff = execGovernedSync('git diff --name-only HEAD', { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    gitChangedFiles = gitDiff.split('\n').filter(l => l.trim().length > 0);
  } catch {
    // ignore git errors
  }
  if (gitChangedFiles.length > 0) {
    // Use git-detected files as implicit changed-files payload
    changedFiles = JSON.stringify(gitChangedFiles);
  } else {
    blockers.push(`Finish requires either changed files (--changed-files-file), explicit --no-files-changed, or uncommitted git changes. Trace theater prevention: every finish must reference files changed or explicitly declare none. Example changed-files JSON: ["tools/example.mjs", "docs/README.md"]`);
  }
}

// If --dry-run, report all blockers and exit without submitting
if (parsed.dryRun) {
  if (blockers.length > 0) {
    console.log(JSON.stringify({
      status: 'dry_run_blocked',
      would_submit: false,
      blockers,
      blockers_count: blockers.length,
    }, null, 2));
  } else {
    console.log(JSON.stringify({
      status: 'dry_run_ok',
      would_submit: true,
      blockers: [],
      blockers_count: 0,
      warning: summaryValidation.warning || null,
    }, null, 2));
  }
  process.exit(blockers.length > 0 ? 1 : 0);
}

// Normal mode: exit on first blocker (preserving original behavior for non-dry-run)
if (blockers.length > 0) {
  console.error(JSON.stringify({ status: 'error', error: `Finish blocked: ${blockers.join(' ')}` }, null, 2));
  process.exit(1);
}

const finishOptions = { cwd, taskNumber, agent, summary, findings, verification, close: parsed.close };
if (verdict) { finishOptions.verdict = verdict; }
if (changedFiles) { finishOptions.changedFiles = changedFiles; }
const result = await withAuthoredRosterJsonPreserved(cwd, async () => {
  const serviceResult = await finishTaskService(finishOptions);
  if (serviceResult.exitCode === 0) {
    rosterOnFinish(cwd, agent, taskNumber);
  }
  return serviceResult;
});
if (summaryValidation.warning) {
  const output = result.result || result;
  output.summary_warning = summaryValidation.warning;
}

function cleanupTmpArtifacts(cwd) {
  const patterns = [
    { dir: cwd, regex: /^tmp-changed-.*\.json$/ },
    { dir: cwd, regex: /^tmp-summary-.*\.txt$/ },
    { dir: cwd, regex: /^tmp-.*\.txt$/ },
    { dir: join(cwd, '.ai'), regex: /^tmp-changed-.*\.json$/ },
    { dir: join(cwd, '.ai'), regex: /^tmp-summary-.*\.txt$/ },
    { dir: join(cwd, '.ai'), regex: /^tmp-bridge-poll\.json$/ },
  ];
  for (const { dir, regex } of patterns) {
    if (!existsSync(dir)) continue;
    let entries;
    try { entries = readdirSync(dir); } catch { continue; }
    for (const entry of entries) {
      if (!regex.test(entry)) continue;
      try { unlinkSync(join(dir, entry)); } catch { /* ignore cleanup errors */ }
    }
  }
}

// Emit checkpoint event to agent-context DB only on successful finish
if (result.exitCode === 0) {
  try {
    const enrichment = gatherCheckpointEnrichment(cwd, taskFile?.path, changedFiles);
    const checkpointResult = await emitCheckpoint({
      cwd,
      agentId: agent,
      sessionId: process.env.KIMI_SESSION_ID || process.env.SESSION_ID || 'unknown',
      taskNumber,
      taskId: result.result?.task_id || result.task_id || null,
      boundaryType: 'finish',
      summary,
      decisions: enrichment.decisions,
      filesChanged: enrichment.filesChanged,
      testsRun: enrichment.testsRun,
      friction: enrichment.friction,
    });
    if (result.result) {
      result.result.checkpoint_event = checkpointResult;
    } else if (result.result !== undefined) {
      result.checkpoint_event = checkpointResult;
    }
  } catch {
    // Non-blocking: checkpoint emission failure must not prevent finish
  }
  // Non-blocking: cleanup tmp artifacts produced during task execution
  try { cleanupTmpArtifacts(cwd); } catch { /* ignore */ }
}

console.log(JSON.stringify(result.result || result, null, 2));
process.exit(result.exitCode || 0);
