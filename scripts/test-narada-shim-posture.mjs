import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const installerSource = join(repoRoot, 'scripts', 'install-narada-shim.sh');

function makeFixture({ stale = false, dirty = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'narada-shim-test-'));
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'packages', 'layers', 'cli', 'src'), { recursive: true });
  mkdirSync(join(root, 'packages', 'layers', 'cli', 'dist'), { recursive: true });
  copyFileSync(installerSource, join(root, 'scripts', 'install-narada-shim.sh'));
  chmodSync(join(root, 'scripts', 'install-narada-shim.sh'), 0o755);
  writeFileSync(join(root, 'packages', 'layers', 'cli', 'src', 'main.ts'), 'export const marker = 1;\n');
  writeFileSync(join(root, 'packages', 'layers', 'cli', 'dist', 'main.js'), '#!/usr/bin/env node\nconsole.log(JSON.stringify({ok:true,args:process.argv.slice(2)}));\n');
  writeFileSync(join(root, 'packages', 'layers', 'cli', 'dist', 'mcp-main.js'), '#!/usr/bin/env node\nconsole.log("mcp");\n');
  if (stale) {
    spawnSync('touch', ['-t', '202001010000', join(root, 'packages', 'layers', 'cli', 'dist', 'main.js')], { check: true });
    spawnSync('touch', ['-t', '202001010000', join(root, 'packages', 'layers', 'cli', 'dist', 'mcp-main.js')], { check: true });
    spawnSync('touch', ['-t', '203001010000', join(root, 'packages', 'layers', 'cli', 'src', 'main.ts')], { check: true });
  }
  if (dirty) {
    spawnSync('git', ['init'], { cwd: root, stdio: 'ignore' });
    spawnSync('git', ['add', '.'], { cwd: root, stdio: 'ignore' });
    writeFileSync(join(root, 'packages', 'layers', 'cli', 'src', 'dirty.ts'), 'export const dirty = true;\n');
  }
  return root;
}

function install(root) {
  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  const result = spawnSync('bash', [join(root, 'scripts', 'install-narada-shim.sh')], {
    cwd: root,
    env: { ...process.env, HOME: home, NODE_BIN: process.execPath },
    encoding: 'utf8',
  });
  assert(result.status === 0, `install failed\n${result.stderr}`);
  return join(home, '.local', 'bin', 'narada');
}

function run(shim, args, env = {}) {
  return spawnSync(shim, args, {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const roots = [];
try {
  {
    const root = makeFixture();
    roots.push(root);
    const shim = install(root);
    const result = run(shim, ['--version']);
    assert(result.status === 0, 'fresh source should execute');
    assert(!result.stderr.includes('embodiment readiness'), 'fresh source should not emit readiness warning');
  }

  {
    const root = makeFixture({ stale: true });
    roots.push(root);
    const shim = install(root);
    const result = run(shim, ['sync']);
    assert(result.status !== 0, 'stale implementation command should block');
    assert(result.stderr.includes('embodiment readiness: stale_dist_blocked'), 'blocked stale state missing');
    assert(result.stderr.includes('command_class: implementation'), 'implementation class missing');
    assert(result.stderr.includes('repair_command: pnpm --filter @narada2/cli build'), 'repair command missing');
  }

  {
    const root = makeFixture({ stale: true });
    roots.push(root);
    const shim = install(root);
    const result = run(shim, ['task', 'read', '1182']);
    assert(result.status === 0, 'stale read-only task inspection should proceed');
    assert(result.stderr.includes('embodiment readiness: stale_dist_read_only_admitted'), 'read-only admitted state missing');
    assert(result.stderr.includes('command_class: read_only'), 'read-only class missing');
  }

  {
    const root = makeFixture({ stale: true });
    roots.push(root);
    const pnpm = join(root, 'pnpm');
    writeFileSync(pnpm, '#!/usr/bin/env bash\necho fake-build >&2\nexit 0\n');
    chmodSync(pnpm, 0o755);
    const shim = install(root);
    const result = run(shim, ['sync'], { NARADA_SHIM_AUTO_BUILD: '1', PATH: `${root}:${process.env.PATH}` });
    assert(result.status === 0, 'explicit auto-build should proceed for clean source');
    assert(result.stderr.includes('embodiment readiness: stale_dist_auto_build_admitted'), 'auto-build admitted state missing');
    assert(result.stderr.includes('fake-build'), 'fake build was not invoked');
  }

  {
    const root = makeFixture({ stale: true, dirty: true });
    roots.push(root);
    const shim = install(root);
    const result = run(shim, ['sync'], { NARADA_SHIM_AUTO_BUILD: '1' });
    assert(result.status !== 0, 'auto-build should refuse dirty active source by default');
    assert(result.stderr.includes('embodiment readiness: stale_dist_auto_build_refused_active_work'), 'active-work refusal state missing');
  }

  console.log('narada shim posture tests passed');
} finally {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
}
