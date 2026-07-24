import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const naradaRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(naradaRoot, '..');

const paths = {
  concept: join(naradaRoot, 'docs', 'concepts', 'task-executability-assessment.md'),
  runbook: join(naradaRoot, 'docs', 'operations', 'task-executability-e2e-and-recovery.md'),
  nars: join(naradaRoot, 'docs', 'concepts', 'nars-runtime-contract.md'),
  siteLoop: join(naradaRoot, 'docs', 'concepts', 'site-operating-loop.md'),
  policy: join(naradaRoot, 'docs', 'concepts', 'task-lifecycle-role-enforcement-policy.md'),
  operator: join(naradaRoot, 'docs', 'product', 'operator-console-runbook.md'),
  siteLoopReadme: join(workspaceRoot, 'mcp-surfaces', 'packages', 'site-loop-mcp', 'README.md'),
  taskLifecycleReadme: join(workspaceRoot, 'mcp-surfaces', 'packages', 'task-lifecycle-mcp', 'README.md'),
  delegatedTaskReadme: join(workspaceRoot, 'mcp-surfaces', 'packages', 'delegated-task-mcp', 'README.md'),
  workerDelegationReadme: join(workspaceRoot, 'mcp-surfaces', 'packages', 'worker-delegation-mcp', 'README.md'),
  conceptRecord: join(naradaRoot, 'packages', 'domains', 'concepts', 'records', 'task-executability-assessment.concept.json'),
};

function read(path) {
  return readFileSync(path, 'utf8');
}

test('canonical executability documentation keeps proof boundaries explicit', () => {
  for (const path of Object.values(paths)) assert.ok(existsSync(path), `missing documentation path: ${path}`);

  const concept = read(paths.concept);
  const runbook = read(paths.runbook);
  const canonical = [
    paths.concept,
    paths.runbook,
    paths.nars,
    paths.siteLoop,
    paths.policy,
    paths.operator,
    paths.siteLoopReadme,
    paths.taskLifecycleReadme,
    paths.delegatedTaskReadme,
    paths.workerDelegationReadme,
  ].map(read);

  assert.match(concept, /not\*\* a correctness proof|not a correctness proof/);
  assert.match(runbook, /Executable-path proof/);
  assert.match(runbook, /Lifecycle\/recovery proof/);
  assert.match(runbook, /Task correctness/);
  assert.match(runbook, /does not prove task correctness/);
  assert.doesNotMatch(canonical.join('\n'), /authority for correctness/);
  assert.match(read(paths.conceptRecord), /not a guarantee of correctness/);
});
