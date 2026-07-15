import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const naradaRoot = resolve(packageRoot, '..', '..');
const uiVueRoot = resolve(packageRoot, '..', 'ui-vue');
const agentWebUiRoot = resolve(packageRoot, '..', 'agent-web-ui');
const operatorConsoleUiRoot = resolve(packageRoot, '..', 'operator-console-ui');
const workspaceLaunchUiRoot = resolve(packageRoot, '..', 'workspace-launch-ui');

const browserSurfaceConsumers = [
  {
    name: 'agent-web-ui',
    root: agentWebUiRoot,
    runtimeDependencies: ['@narada2/ui', '@narada2/ui-vue'],
  },
  {
    name: 'operator-console-ui',
    root: operatorConsoleUiRoot,
    runtimeDependencies: ['@narada2/ui-vue'],
  },
  {
    name: 'workspace-launch-ui',
    root: workspaceLaunchUiRoot,
    runtimeDependencies: ['@narada2/ui-vue'],
  },
];

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

test('shared UI package exports and consumer direction are explicit', async () => {
  const uiPackage = await readJson(resolve(packageRoot, 'package.json'));
  const uiVuePackage = await readJson(resolve(uiVueRoot, 'package.json'));

  assert.equal(uiPackage.exports['./styles.css'], './dist/styles.css');
  assert.equal(uiPackage.publishConfig?.access, 'public');
  assert.equal(uiPackage.scripts?.prepack, 'pnpm run build');
  assert.equal(uiVuePackage.exports['./components.css'], './src/components.css');
  assert.equal(uiVuePackage.dependencies['@narada2/ui'], 'workspace:*');

  for (const consumer of browserSurfaceConsumers) {
    const packageJson = await readJson(resolve(consumer.root, 'package.json'));
    for (const dependency of consumer.runtimeDependencies) {
      assert.equal(
        packageJson.dependencies?.[dependency],
        'workspace:*',
        `${consumer.name} must declare ${dependency} as a runtime dependency`,
      );
      assert.equal(
        packageJson.devDependencies?.[dependency],
        undefined,
        `${consumer.name} must not classify ${dependency} as a development-only dependency`,
      );
    }
  }
});

test('consumers import shared foundation before app-specific layers', async () => {
  const agentStyles = await readFile(resolve(agentWebUiRoot, 'src/agent-web-ui.css'), 'utf8');
  const agentBaseStyles = await readFile(resolve(agentWebUiRoot, 'src/styles/base.css'), 'utf8');
  const registryPage = await readFile(resolve(naradaRoot, 'packages/layers/cli/src/commands/console-site-registry-page.ts'), 'utf8');

  assert.match(agentStyles, /@import "@narada2\/ui\/styles\.css"(?:\s+layer\([^)]*\))?;/);
  assert.match(agentStyles, /@import "@narada2\/ui-vue\/components\.css"(?:\s+layer\([^)]*\))?;/);
  assert.match(registryPage, /require\.resolve\('@narada2\/ui\/styles\.css'\)/);
  assert.match(registryPage, /data-narada-ui-foundation/);
  assert.doesNotMatch(registryPage, /#17212b|#d7dfe5|#f4f6f8/);
  assert.match(agentBaseStyles, /height: 100vh/);
  assert.doesNotMatch(agentBaseStyles, /(?:margin|background):/);
});

test('extracted foundation copies stay removed', async () => {
  const removedPaths = [
    resolve(agentWebUiRoot, 'src/app/components/ui/command'),
    resolve(agentWebUiRoot, 'src/app/components/ui/tooltip'),
    resolve(agentWebUiRoot, 'src/app/lib/utils.ts'),
    resolve(agentWebUiRoot, 'src/styles/theme.css'),
    resolve(agentWebUiRoot, 'src/styles/primitives.css'),
    resolve(agentWebUiRoot, 'src/styles/dark-theme.css'),
  ];

  for (const path of removedPaths) {
    await assert.rejects(access(path), new RegExp('ENOENT'));
  }
});
