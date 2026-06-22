import test from 'node:test';
import{spawnSync}from'node:child_process';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');
const naradaProperRoot = resolve(packageRoot, '..', '..');
const fixtureRegistryPath = join(__dirname, 'fixtures', 'launch-registry.psd1');
const packagedLauncherPath = join(naradaProperRoot, 'packages', 'agent-start', 'src', 'narada-agent-start.ts');
const tsxLoaderPath = pathToFileURL(require.resolve('tsx')).href;
const admittedCarrierMatrix = Object.freeze(['agent-cli', 'agent-tui', 'codex', 'opencode']);
const requiredFields = Object.freeze(['Agent', 'NaradaRoot', 'WorkspaceRoot', 'SiteRoot', 'Launcher', 'Runtime']);
const nonNaradaProperSites = Object.freeze([
  'narada-andrey',
  'narada-staccato',
  'narada-revolution',
  'narada-timour-marketing-agent',
  'narada-utz',
  'sonar',
  'smart-scheduling',
  'thoughts-project',
]);

function parseRegistry(text) {
  const records = [];
  let current = null;
  for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '@{') {
      current = {};
      records.push(current);
      continue;
    }
    if (!current) continue;
    if (line === '}') {
      current = null;
      continue;
    }
    const value = line.match(/^(Agent|Title|Site|NaradaRoot|WorkspaceRoot|SiteRoot|Launcher|LauncherPath|Runtime)\s*=\s*['\"]([^'\"]+)['\"]/);
    if (value) current[value[1]] = value[2];
  }
  return records.filter((record) => record.Agent);
}

function recordsFrom(path) {
  return parseRegistry(readFileSync(path, 'utf8'));
}

function siteId(record) {
  return record.Site ?? record.Agent.replace(/\.(architect|builder2?|resident|Kevin|Bob|Robin)$/u, '');
}

function normalizePath(value) {
  return resolve(String(value)).replace(/[\\/]+$/, '').toLowerCase();
}

function launcherPathFor(record) {
  return record.LauncherPath ?? join(record.NaradaRoot, record.Launcher);
}

function assertRegistryContract(records, sourceLabel) {
  assert.equal(records.length > 0, true, `${sourceLabel}: registry must contain records`);
  const agents = new Set();
  const sites = new Set();
  for (const record of records) {
    for (const field of requiredFields) {
      assert.equal(Boolean(record[field]), true, `${sourceLabel}:${record.Agent}: missing ${field}`);
    }
    assert.equal(agents.has(record.Agent), false, `${sourceLabel}:${record.Agent}: duplicate agent`);
    agents.add(record.Agent);
    sites.add(siteId(record));
    assert.equal(admittedCarrierMatrix.includes(record.Runtime), true, `${sourceLabel}:${record.Agent}: runtime ${record.Runtime} not in admitted carrier matrix`);
    assert.equal(record.Launcher.includes('tools\\agent-start'), false, `${sourceLabel}:${record.Agent}: launcher must not point at site-local start-agent`);
    assert.equal(record.Launcher.includes('tools/agent-start'), false, `${sourceLabel}:${record.Agent}: launcher must not point at site-local start-agent`);
    assert.equal(normalizePath(record.SiteRoot).startsWith(normalizePath(record.NaradaRoot)), true, `${sourceLabel}:${record.Agent}: SiteRoot must be under NaradaRoot`);
  }
  for (const expectedSite of nonNaradaProperSites) {
    assert.equal(sites.has(expectedSite), true, `${sourceLabel}: missing registered site ${expectedSite}`);
  }
}

function assertLauncherFileShape(records, sourceLabel) {
  for (const record of records) {
    const launcherPath = launcherPathFor(record);
    assert.equal(existsSync(launcherPath), true, `${sourceLabel}:${record.Agent}: launcher missing ${launcherPath}`);
    const text = readFileSync(launcherPath, 'utf8');
    assert.equal(text.includes('packages\\agent-start\\src\\narada-agent-start.ts'), true, `${sourceLabel}:${record.Agent}: launcher must delegate to packaged TS agent-start`);
    assert.equal(text.includes('packages\\agent-start\\bin\\narada-agent-start.mjs'), false, `${sourceLabel}:${record.Agent}: launcher must not delegate to removed mjs bin`);
    assert.equal(text.includes('tools\\agent-start\\start-agent.mjs'), false, `${sourceLabel}:${record.Agent}: launcher must not delegate to site-local start-agent`);
    assert.equal(text.includes('--import $tsxLoader'), true, `${sourceLabel}:${record.Agent}: launcher must use explicit TSX loader variable`);
  }
}

function dryRunEnv(runtime) {
  if (runtime === 'codex') return { NARADA_CODEX_CLI_SCRIPT: packagedLauncherPath };
  if (runtime === 'agent-cli') return {
    NARADA_PROVIDER_SECRET_STORE: 'disabled',
    NARADA_CODEX_SUBSCRIPTION_PREFLIGHT: 'disabled',
    KIMI_CODE_API_KEY: 'test-key',
  };
  if (runtime === 'agent-tui') return {
    NARADA_PROVIDER_SECRET_STORE: 'disabled',
    NARADA_CODEX_SUBSCRIPTION_PREFLIGHT: 'disabled',
    NARADA_INTELLIGENCE_PROVIDER: 'kimi-code-api',
    KIMI_CODE_API_BASE_URL: 'https://api.kimi.com/coding/',
    KIMI_CODE_MODEL: 'kimi-k2.7',
    KIMI_CODE_API_KEY: 'test-key',
  };
  return {};
}

function assertCarrierMatrixDryRuns(records, sourceLabel) {
  for (const record of records) {
    for (const runtime of admittedCarrierMatrix) {
      const result = spawnSync(process.execPath, [
        '--import',
        tsxLoaderPath,
        packagedLauncherPath,
        record.Agent,
        '--site-root',
        record.NaradaRoot,
        '--target-site-root',
        record.SiteRoot,
        '--runtime',
        runtime,
        '--dry-run',
        '--json',
      ], {
        cwd: record.NaradaRoot,
        encoding: 'utf8',
        env: { ...process.env, ...dryRunEnv(runtime) },
      });
      assert.equal(result.status, 0, `${sourceLabel}:${record.Agent}:${runtime}: ${result.stderr || result.stdout}`);
    }
  }
}

test('package fixture encodes the launcher registry boundary', () => {
  const records = recordsFrom(fixtureRegistryPath);
  assertRegistryContract(records, 'fixture');
  assertLauncherFileShape(records, 'fixture');
  const deterministicCarrierRecords = records.filter((record) => normalizePath(record.NaradaRoot) === normalizePath(naradaProperRoot));
  assertCarrierMatrixDryRuns(deterministicCarrierRecords, 'fixture');
  assert.equal(existsSync(packagedLauncherPath), true, 'packaged TS launcher must exist in Narada proper');
});

test('live operator registry conforms when explicitly supplied', { skip: !process.env.NARADA_AGENT_START_LIVE_REGISTRY }, () => {
  const records = recordsFrom(process.env.NARADA_AGENT_START_LIVE_REGISTRY);
  assertRegistryContract(records, 'live');
  assertLauncherFileShape(records, 'live');
});
