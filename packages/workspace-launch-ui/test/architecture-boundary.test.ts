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
  assert.match(app, /attempts/);
  assert.match(domain, /parseWorkspaceLaunchBootstrap/);
  assert.match(workflow, /createWorkspaceLaunchTransport/);
  assert.match(workflow, /parseWorkspaceLaunchBootstrapPayload/);
  assert.doesNotMatch(workflow, /fetch\s*\(/);
  assert.match(transport, /normalizeWorkspaceLaunchBasePath/);
});
