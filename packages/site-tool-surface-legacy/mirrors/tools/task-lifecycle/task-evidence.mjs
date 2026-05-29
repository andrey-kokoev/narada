import { enforceMcpGuard } from './mcp-guard.mjs';
enforceMcpGuard(process.argv);

import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';
import { admitTaskEvidence } from '@narada2/task-governance/evidence-admission';
import { inspectTaskEvidence } from '@narada2/task-governance/task-governance';

const cwd = process.argv[2] || process.cwd();

function parseArgs(argv) {
  const args = {};
  const positional = [];
  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.replace(/^--/, '').replace(/-/g, '_');
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { args, positional };
}

const { args } = parseArgs(process.argv);

let exitCode = 0;
MAIN: try {
  if (args.admit) {
    const taskNumber = args.task ? Number(args.task) : null;
    const admittedBy = args.by || null;
    const methodsRaw = args.methods || 'admission';
    const methods = methodsRaw.split(',').map((m) => m.trim()).filter(Boolean);

    if (!taskNumber || Number.isNaN(taskNumber)) {
      console.error(JSON.stringify({ status: 'error', error: 'task_number_required', message: '--admit requires --task' }, null, 2));
      exitCode = 1;
      break MAIN;
    }
    if (!admittedBy) {
      console.error(JSON.stringify({ status: 'error', error: 'admitted_by_required', message: '--admit requires --by' }, null, 2));
      exitCode = 1;
      break MAIN;
    }

    const store = openTaskLifecycleStore(cwd);
    try {
      const { bundle, result, blockers } = await admitTaskEvidence({
        cwd,
        taskNumber,
        admittedBy,
        methods,
        store,
      });

      console.log(JSON.stringify({
        schema: 'narada.task.evidence.admit.v0',
        task_number: taskNumber,
        admission_id: result.admission_id,
        bundle_id: result.bundle_id,
        verdict: result.verdict,
        blockers,
        methods,
      }, null, 2));
    } finally {
      store.db.close();
    }
    break MAIN;
  }

  if (args.inspect) {
    const taskNumber = args.task ? Number(args.task) : null;
    if (!taskNumber || Number.isNaN(taskNumber)) {
      console.error(JSON.stringify({ status: 'error', error: 'task_number_required', message: '--inspect requires --task' }, null, 2));
      exitCode = 1;
      break MAIN;
    }

    const store = openTaskLifecycleStore(cwd);
    try {
      const evidence = await inspectTaskEvidence(cwd, String(taskNumber), store);
      console.log(JSON.stringify({
        schema: 'narada.task.evidence.inspect.v0',
        task_number: evidence.task_number,
        task_id: evidence.task_id,
        status: evidence.status,
        all_criteria_checked: evidence.all_criteria_checked,
        unchecked_count: evidence.unchecked_count,
        has_execution_notes: evidence.has_execution_notes,
        has_verification: evidence.has_verification,
        has_report: evidence.has_report,
        has_review: evidence.has_review,
        has_closure: evidence.has_closure,
        has_governed_provenance: evidence.has_governed_provenance,
        verdict: evidence.verdict,
        warnings: evidence.warnings,
        violations: evidence.violations,
        active_assignment_intent: evidence.active_assignment_intent,
      }, null, 2));
    } finally {
      store.db.close();
    }
    break MAIN;
  }

  console.error(JSON.stringify({
    status: 'error',
    error: 'no_subcommand',
    message: 'Usage: task-evidence --admit --task <number> --by <agent> [--methods <m1,m2>] | --inspect --task <number>',
  }, null, 2));
  exitCode = 1;
} catch (err) {
  console.error(JSON.stringify({ status: 'error', error: err.message, stack: err.stack }, null, 2));
  exitCode = 1;
}
process.exit(exitCode);
