import assert from 'node:assert/strict';
import test from 'node:test';
import { observerPaths, observerWatchdogPlan, resolveObserverNodePath, resolveObserverRuntimePath } from '../src/main.js';

test('uses the canonical Site-local evidence store and a separate hidden watchdog', () => {
  const paths = observerPaths('C:/site');
  assert.match(paths.db, /mcp-runtime-observer[\\/]observations\.db$/);
  const plan = observerWatchdogPlan({ site_root: 'C:/site' }, 'site-1');
  assert.equal(plan.hidden, true);
  assert.equal(plan.executable, resolveObserverRuntimePath());
  assert.equal(resolveObserverNodePath(), resolveObserverRuntimePath());
  assert.match(plan.task_name, /Runtime-Observer-site-1$/);
  assert.match(plan.arguments, / ensure /);
});
