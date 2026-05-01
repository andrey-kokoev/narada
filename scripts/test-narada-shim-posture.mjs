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
  mkdirSync(join(root, 'packages', 'layers', 'control-plane', 'src'), { recursive: true });
  mkdirSync(join(root, 'packages', 'layers', 'control-plane', 'dist'), { recursive: true });
  mkdirSync(join(root, 'packages', 'task-governance', 'src'), { recursive: true });
  mkdirSync(join(root, 'packages', 'task-governance', 'dist'), { recursive: true });
  copyFileSync(installerSource, join(root, 'scripts', 'install-narada-shim.sh'));
  chmodSync(join(root, 'scripts', 'install-narada-shim.sh'), 0o755);
  writeFileSync(join(root, 'packages', 'layers', 'cli', 'src', 'main.ts'), 'export const marker = 1;\n');
  writeFileSync(join(root, 'packages', 'layers', 'control-plane', 'src', 'index.ts'), 'export const controlPlane = true;\n');
  writeFileSync(join(root, 'packages', 'layers', 'control-plane', 'dist', 'index.js'), 'export const controlPlane = true;\n');
  writeFileSync(join(root, 'packages', 'task-governance', 'src', 'index.ts'), 'export const taskGovernance = true;\n');
  writeFileSync(join(root, 'packages', 'task-governance', 'dist', 'index.js'), 'export const taskGovernance = true;\n');
  writeFileSync(join(root, 'packages', 'layers', 'cli', 'dist', 'main.js'), '#!/usr/bin/env node\nconsole.log(JSON.stringify({ok:true,args:process.argv.slice(2),stale:{accepted:process.env.NARADA_STALE_DIST_ACCEPTED||null,reason:process.env.NARADA_STALE_DIST_ACCEPTANCE_REASON||null,command:process.env.NARADA_STALE_DIST_COMMAND||null,sources:process.env.NARADA_STALE_DIST_SOURCE_PATHS||null,posture:process.env.NARADA_STALE_DIST_POSTURE||null}}));\n');
  writeFileSync(join(root, 'packages', 'layers', 'cli', 'dist', 'mcp-main.js'), '#!/usr/bin/env node\nconsole.log("mcp");\n');
  if (stale) {
    spawnSync('touch', ['-t', '202001010000', join(root, 'packages', 'layers', 'cli', 'dist', 'main.js')], { check: true });
    spawnSync('touch', ['-t', '202001010000', join(root, 'packages', 'layers', 'cli', 'dist', 'mcp-main.js')], { check: true });
    spawnSync('touch', ['-t', '202001010000', join(root, 'packages', 'layers', 'control-plane', 'dist', 'index.js')], { check: true });
    spawnSync('touch', ['-t', '202001010000', join(root, 'packages', 'task-governance', 'dist', 'index.js')], { check: true });
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
    assert(result.stderr.includes('repair_command: pnpm --filter @narada2/control-plane build && pnpm --filter @narada2/task-governance build && pnpm --filter @narada2/cli build'), 'repair command missing');
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
    const shim = install(root);
    const result = run(shim, ['task', 'workboard', '--view', 'compact']);
    assert(result.status === 0, 'stale read-only workboard should proceed');
    assert(result.stderr.includes('embodiment readiness: stale_dist_read_only_admitted'), 'workboard read-only admitted state missing');
    assert(result.stderr.includes('command_class: read_only'), 'workboard read-only class missing');
  }

  {
    const root = makeFixture({ stale: true });
    roots.push(root);
    const shim = install(root);
    const result = run(shim, ['task', 'close', '1200'], { NARADA_SHIM_ALLOW_STALE_AUTHORITY_MUTATION: '1' });
    assert(result.status !== 0, 'stale authority mutation should require an explicit reason');
    assert(result.stderr.includes('embodiment readiness: stale_dist_authority_mutation_reason_required'), 'reason-required state missing');
  }

  {
    const root = makeFixture({ stale: true });
    roots.push(root);
    const shim = install(root);
    const result = run(shim, ['task', 'close', '1200', '--allow-stale-governance', 'operator accepted stale governance for recovery'], {
      NARADA_SHIM_ALLOW_STALE_AUTHORITY_MUTATION: '1',
    });
    assert(result.status === 0, 'stale authority mutation with reason should proceed');
    assert(result.stderr.includes('embodiment readiness: stale_dist_authority_mutation_admitted_by_policy'), 'stale authority admission state missing');
    const output = JSON.parse(result.stdout);
    assert(!output.args.includes('--allow-stale-governance'), 'shim flag should not leak to CLI command parser');
    assert(output.stale.accepted === '1', 'stale evidence acceptance env missing');
    assert(output.stale.reason === 'operator accepted stale governance for recovery', 'stale acceptance reason env missing');
    assert(output.stale.command === 'narada task close 1200', 'stale command identity env missing');
    assert(output.stale.sources.includes('@narada2/cli:'), 'stale source path evidence missing');
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
