import { enforceMcpGuard } from './mcp-guard.mjs';
enforceMcpGuard(process.argv);

import { reviewTaskService } from '@narada2/task-governance/task-review-service';
import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';
import {
  buildReviewAcceptanceProvenanceAnnotation,
  detectSameOperatorReview,
  detectSelfReview,
  getReviewAcceptanceProvenance,
  normalizeReviewReplayStatus,
  REVIEW_REPLAY_STATUSES,
} from './operator-identity.mjs';
import { readFileSync } from 'node:fs';

function parseArgs(argv) {
  const args = { positional: [] };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--findings-file') {
      args.findingsFile = argv[i + 1];
      i++;
    } else if (arg === '--report') {
      args.report = argv[i + 1];
      i++;
    } else if (arg === '--verdict') {
      args.verdict = argv[i + 1];
      i++;
    } else if (arg === '--single-operator-review') {
      args.singleOperatorReview = true;
    } else if (arg === '--review-replay-status') {
      args.reviewReplayStatus = argv[i + 1];
      i++;
    } else {
      args.positional.push(arg);
    }
  }
  return args;
}

const parsed = parseArgs(process.argv);
const cwd = parsed.positional[0] || process.cwd();
const taskNumber = parseInt(parsed.positional[1], 10);
const reviewerAgent = parsed.positional[2];
const verdict = parsed.verdict || parsed.positional[3] || null;
let findings = parsed.positional[4] || null;

if (parsed.findingsFile) {
  if (findings) {
    console.error(JSON.stringify({ status: 'error', error: `Cannot provide both inline findings and --findings-file. Choose one.` }, null, 2));
    process.exit(1);
  }
  try {
    findings = readFileSync(parsed.findingsFile, 'utf8');
  } catch (err) {
    console.error(JSON.stringify({ status: 'error', error: `Failed to read findings file: ${err.message}` }, null, 2));
    process.exit(1);
  }
}

if (isNaN(taskNumber) || !reviewerAgent) {
  console.error('Usage: node task-review.mjs <cwd> <task-number> <reviewer> [verdict] [findings-json] [--findings-file <path>] [--report <report-id>] [--verdict <accepted|accepted_with_notes|rejected>] [--single-operator-review]');
  process.exit(1);
}

if (!verdict) {
  console.error(JSON.stringify({ status: 'error', error: 'verdict_required: Pass a verdict (accepted, accepted_with_notes, or rejected) as positional arg or --verdict.' }, null, 2));
  process.exit(1);
}

const VALID_VERDICTS = ['accepted', 'accepted_with_notes', 'rejected'];
if (!VALID_VERDICTS.includes(verdict)) {
  console.error(JSON.stringify({ status: 'error', error: `verdict must be one of: ${VALID_VERDICTS.join(', ')}` }, null, 2));
  process.exit(1);
}

const reviewReplayStatus = normalizeReviewReplayStatus(parsed.reviewReplayStatus);
if (!reviewReplayStatus) {
  console.error(JSON.stringify({ status: 'error', error: `review_replay_status must be one of: ${REVIEW_REPLAY_STATUSES.join(', ')}` }, null, 2));
  process.exit(1);
}

// Same-operator and self-review detection: block unless --single-operator-review is provided
let structuralReviewInfo = null;
try {
  const store = openTaskLifecycleStore(cwd);
  try {
    structuralReviewInfo = detectSameOperatorReview(store, reviewerAgent, taskNumber);
    if (!structuralReviewInfo?.sameOperator) {
      structuralReviewInfo = detectSelfReview(store, reviewerAgent, taskNumber);
    }
  } finally {
    store.db.close();
  }
} catch {
  // Best-effort detection; do not block review on query failure
}

const isStructuralReview = structuralReviewInfo?.sameOperator || structuralReviewInfo?.selfReview;
if (isStructuralReview && !parsed.singleOperatorReview) {
  console.error(JSON.stringify({
    status: 'error',
    error: 'single_operator_review_blocked',
    message: structuralReviewInfo.warning,
    hint: 'Re-run with --single-operator-review to allow single-operator review with annotation recorded.',
  }, null, 2));
  process.exit(1);
}

// If single-operator review is explicitly requested, prepend annotation to findings
let parsedFindings = null;
if (findings) {
  try {
    parsedFindings = JSON.parse(findings);
    if (!Array.isArray(parsedFindings)) parsedFindings = null;
  } catch {
    parsedFindings = null;
  }
}

if (parsed.singleOperatorReview && isStructuralReview) {
  const annotation = {
    severity: 'note',
    description: `single_operator_review: ${structuralReviewInfo.warning} This review is annotated as single-operator review (kind: ${structuralReviewInfo.kind || 'same_operator'}).`,
    location: 'review_authority',
  };
  if (Array.isArray(parsedFindings)) {
    parsedFindings.unshift(annotation);
  } else {
    parsedFindings = [annotation];
  }
  findings = JSON.stringify(parsedFindings);
}

const provenanceAnnotation = buildReviewAcceptanceProvenanceAnnotation({ verdict, reviewReplayStatus });
if (Array.isArray(parsedFindings)) {
  parsedFindings.unshift(provenanceAnnotation);
} else {
  parsedFindings = [provenanceAnnotation];
}
findings = JSON.stringify(parsedFindings);

const result = await reviewTaskService({ cwd, taskNumber, agent: reviewerAgent, verdict, findings, report: parsed.report });
const output = result.result || result;
if (output.review_id) {
  try {
    const store = openTaskLifecycleStore(cwd);
    try {
      const reviewRow = store.db.prepare('SELECT * FROM task_reviews WHERE review_id = ?').get(output.review_id);
      output.acceptance_provenance = getReviewAcceptanceProvenance(store, reviewRow);
    } finally {
      store.db.close();
    }
  } catch {
    // Non-blocking projection failure; persisted annotation remains in findings_json.
  }
}
if (isStructuralReview) {
  output.single_operator_review = true;
  output.single_operator_annotation = structuralReviewInfo.warning;
  output.single_operator_kind = structuralReviewInfo.kind || 'same_operator';
}
console.log(JSON.stringify(output, null, 2));
process.exit(result.exitCode || 0);
