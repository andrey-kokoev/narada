import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src');

function read(relativePath: string): string {
  return readFileSync(resolve(srcRoot, relativePath), 'utf8');
}

test('launcher presentation delegates transport and workflow state', () => {
  const app = read('App.vue');
  const domain = read('launcher/domain.ts');
  const workflow = read('launcher/composables/useWorkspaceLaunchWorkflow.ts');
  const transport = read('launcher/transport.ts');

  assert.match(app, /useWorkspaceLaunchWorkflow/);
  assert.doesNotMatch(app, /fetch\s*\(/);
  assert.match(app, /toggle-history/);
  assert.match(app, /visibleAttempts/);
  assert.match(domain, /parseWorkspaceLaunchBootstrap/);
  assert.match(domain, /activityState/);
  assert.match(workflow, /createWorkspaceLaunchTransport/);
  assert.match(workflow, /parseWorkspaceLaunchBootstrapPayload/);
  assert.match(workflow, /const showHistory = ref\(false\)/);
  assert.match(workflow, /const historicalAttemptCount = computed/);
  assert.match(workflow, /const visibleAttempts = computed/);
  assert.match(workflow, /isWorkspaceLaunchAttemptActive/);
  assert.match(workflow, /workspaceLaunchAttemptsForView/);
  assert.match(workflow, /onUnmounted/);
  assert.doesNotMatch(workflow, /fetch\s*\(/);
  assert.match(transport, /normalizeWorkspaceLaunchBasePath/);
});
