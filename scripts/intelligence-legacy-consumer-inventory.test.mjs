import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  RETIRED_PACKAGE_NAME,
  inventoryLegacyIntelligence,
  scanLegacyIntelligenceEntries,
} from './intelligence-legacy-consumer-inventory.mjs';

test('rejects authoritative runtime selection environment reads', () => {
  const inventory = scanLegacyIntelligenceEntries([{
    path: 'packages/example/src/runtime.mjs',
    content: 'const model = process.env.CODEX_MODEL;\n',
  }]);
  assert.equal(inventory.zero_authoritative_consumers, false);
  assert.equal(inventory.violations[0].classification, 'runtime_or_configuration_authority');
});

test('fails closed for compound, qualified, and contradictory documentation claims', () => {
  const inventory = scanLegacyIntelligenceEntries([
    {
      path: '.ai/decisions/compound.md',
      content: 'CODEX_MODEL selects the model; NARADA_CODEX_MODEL is retired.\n',
    },
    {
      path: '.ai/decisions/qualified.md',
      content: 'OPENAI_MODEL is ignored only in tests; production still uses OPENAI_MODEL.\n',
    },
    {
      path: '.ai/decisions/natural-language-negative.md',
      content: 'NARADA_AI_MODEL is retired and must never select runtime intelligence.\n',
    },
  ]);
  assert.equal(inventory.zero_authoritative_consumers, false);
  assert.deepEqual(
    inventory.violations.map(({ symbol }) => symbol).sort(),
    ['CODEX_MODEL', 'NARADA_AI_MODEL', 'NARADA_CODEX_MODEL', 'OPENAI_MODEL'],
  );
});

test('does not infer negation from words unrelated to the legacy symbol', () => {
  const inventory = scanLegacyIntelligenceEntries([
    {
      path: '.ai/decisions/without-canonical.md',
      content: 'NARADA_INTELLIGENCE_PROVIDER selects the provider without consulting canonical policy.\n',
    },
    {
      path: '.ai/decisions/ignored-canonical.md',
      content: 'When canonical policy is ignored, CODEX_MODEL selects the model.\n',
    },
    {
      path: '.ai/decisions/unsupported-canonical.md',
      content: 'CODEX_MODEL selects the model when canonical policy is not supported.\n',
    },
  ]);
  assert.equal(inventory.zero_authoritative_consumers, false);
  assert.equal(inventory.violations.length, 3);
  assert.ok(inventory.violations.every(({ classification }) => classification === 'stale_governance_authority'));
});

test('does not blanket-admit authoritative governance decisions', () => {
  const inventory = scanLegacyIntelligenceEntries([
    {
      path: '.ai/decisions/stale.md',
      content: 'NARADA_INTELLIGENCE_PROVIDER selects the runtime provider.\n',
    },
    {
      path: '.ai/decisions/canonical.md',
      content: '<!-- narada:legacy-selection-negative:v1 symbol="NARADA_INTELLIGENCE_PROVIDER" disposition="retired" -->\n',
    },
    {
      path: '.ai/reviews/historical.md',
      content: 'Observed NARADA_INTELLIGENCE_PROVIDER during review.\n',
    },
    {
      path: '.ai/law/stale.md',
      content: 'NARADA_INTELLIGENCE_PROVIDER selects the provider.\n',
    },
    {
      path: '.ai/task-contracts/stale.md',
      content: 'Legacy NARADA_INTELLIGENCE_PROVIDER selects the provider.\n',
    },
    {
      path: '.ai/decisions/legacy-word-is-not-negation.md',
      content: 'The legacy NARADA_INTELLIGENCE_PROVIDER selects the provider.\n',
    },
  ]);
  assert.equal(inventory.violations.length, 4);
  assert.equal(
    inventory.violations.find(({ path }) => path === '.ai/decisions/stale.md')?.classification,
    'stale_governance_authority',
  );
  assert.equal(inventory.violations[0].classification, 'stale_governance_authority');
  assert.equal(
    inventory.references.find((entry) => entry.path === '.ai/decisions/canonical.md').classification,
    'governance_negative_contract',
  );
  assert.equal(
    inventory.references.find((entry) => entry.path === '.ai/reviews/historical.md').classification,
    'governance_evidence',
  );
  assert.deepEqual(
    inventory.violations
      .filter(({ path }) => path !== '.ai/decisions/stale.md')
      .map(({ path }) => path)
      .sort(),
    [
      '.ai/decisions/legacy-word-is-not-negation.md',
      '.ai/law/stale.md',
      '.ai/task-contracts/stale.md',
    ],
  );
});

test('admits an explicit runtime rejection boundary', () => {
  const inventory = scanLegacyIntelligenceEntries([
    {
      path: 'packages/agent-start/src/carrier-launch-adapter.ts',
      content: 'delete env.CODEX_MODEL;\n',
    },
    {
      path: 'packages/agent-start/src/codex-subscription-support.ts',
      content: 'delete env.OPENAI_MODEL;\n',
    },
    {
      path: 'packages/agent-start/bin/verify-registered-site-launchers.mjs',
      content: "if (Object.hasOwn(env, 'NARADA_AI_MODEL')) failures.push({ reason: 'legacy_intelligence_selection_env_present', environment_names: ['NARADA_AI_MODEL'] });\n",
    },
  ]);
  assert.equal(inventory.zero_authoritative_consumers, true);
  assert.ok(inventory.references.every(({ classification }) => classification === 'runtime_rejection_boundary'));
});

test('rejects positive runtime reads paired with unrelated deletes', () => {
  const inventory = scanLegacyIntelligenceEntries([
    {
      path: 'packages/agent-start/src/carrier-launch-adapter.ts',
      content: 'if (env.CODEX_MODEL) delete state.cache;\n',
    },
    {
      path: 'packages/agent-start/src/codex-subscription-support.ts',
      content: 'const selected = env.NARADA_AI_MODEL; delete forwarded.UNRELATED;\n',
    },
    {
      path: 'packages/nars-provider-runtime/src/canonical-protocol-adapters.mjs',
      content: 'const active = env.OPENAI_MODEL; delete cache.entry;\n',
    },
  ]);
  assert.equal(inventory.zero_authoritative_consumers, false);
  assert.equal(inventory.violations.length, 3);
  assert.ok(inventory.violations.every(({ classification }) => classification === 'runtime_or_configuration_authority'));
});

test('rejects quoted lists without exact negative dataflow', () => {
  const inventory = scanLegacyIntelligenceEntries([
    {
      path: 'packages/agent-start/src/carrier-launch-adapter.ts',
      content: "const selectedNames = [\n  'CODEX_MODEL',\n];\nfor (const name of unrelatedNames) delete env[name];\n",
    },
    {
      path: 'packages/agent-start/bin/verify-registered-site-launchers.mjs',
      content: "const names = [\n  'NARADA_AI_MODEL',\n];\nconst leaked = otherNames\n  .filter((name) => Object.hasOwn(env, name));\nif (leaked.length > 0) failures.push({ reason: 'legacy_intelligence_selection_env_present' });\n",
    },
    {
      path: 'packages/nars-capability-gateway/src/mcp-runtime.mjs',
      content: "const names = [\n  'OPENAI_MODEL',\n];\nfor (const name of names) delete env.unrelated;\n",
    },
  ]);
  assert.equal(inventory.zero_authoritative_consumers, false);
  assert.equal(inventory.violations.length, 3);
});

test('rejects whole-file and cross-scope list tricks', () => {
  const inventory = scanLegacyIntelligenceEntries([
    {
      path: 'packages/agent-start/src/carrier-launch-adapter.ts',
      content: "const names = [\n  'CODEX_MODEL',\n];\nconst selected = names.map((name) => env[name]);\nfor (const name of names) delete env[name];\n",
    },
    {
      path: 'packages/nars-capability-gateway/src/mcp-runtime.mjs',
      content: "function select() {\n  const names = [\n    'NARADA_AI_MODEL',\n  ];\n  return names.map((name) => env[name]);\n}\nfunction scrub() {\n  const names = [\n    'OPENAI_MODEL',\n  ];\n  for (const name of names) delete env[name];\n}\n",
    },
    {
      path: 'packages/agent-start/bin/verify-registered-site-launchers.mjs',
      content: "const names = [\n  'CLOUDFLARE_CARRIER_AI_MODEL',\n];\nconst leaked = names.filter((name) => Object.hasOwn(env, name));\nif (leaked.length > 0) selected = env[leaked[0]];\nfailures.push({ reason: 'legacy_intelligence_selection_env_present' });\n",
    },
  ]);
  assert.equal(inventory.zero_authoritative_consumers, false);
  assert.deepEqual(
    [...new Set(inventory.violations.map(({ symbol }) => symbol))].sort(),
    ['CLOUDFLARE_CARRIER_AI_MODEL', 'CODEX_MODEL', 'NARADA_AI_MODEL', 'OPENAI_MODEL'],
  );
});

test('rejects retired package dependencies and surviving artifacts', () => {
  const inventory = scanLegacyIntelligenceEntries([{
    path: 'packages/example/package.json',
    content: JSON.stringify({ dependencies: { [RETIRED_PACKAGE_NAME]: 'workspace:*' } }),
  }], { retiredPackagePresent: true });
  assert.equal(inventory.zero_authoritative_consumers, false);
  assert.deepEqual(
    inventory.violations.map((entry) => entry.classification),
    ['retired_projection_artifact_present', 'retired_projection_reference'],
  );
});

test('discovers forbidden references in ignored distribution artifacts', () => {
  const root = mkdtempSync(join(tmpdir(), 'narada-legacy-inventory-'));
  try {
    const dist = join(root, 'packages', 'example', 'dist');
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(root, '.gitignore'), 'dist/\n', 'utf8');
    writeFileSync(join(dist, 'runtime.js'), 'const model = process.env.CODEX_MODEL;\n', 'utf8');

    const inventory = inventoryLegacyIntelligence({ root });

    assert.equal(inventory.zero_authoritative_consumers, false);
    assert.equal(inventory.violations.length, 1);
    assert.equal(inventory.violations[0].path, 'packages/example/dist/runtime.js');
    assert.equal(inventory.violations[0].scan_scope, 'package_distribution_no_ignore');
    assert.equal(inventory.violations[0].migration_owner_task, 2215);
    assert.deepEqual(inventory.scan_contract.package_distributions, {
      roots: ['packages/example/dist'],
      recursive: true,
      hidden: true,
      obey_ignore_files: false,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('distinguishes stale documentation from a negative contract', () => {
  const inventory = scanLegacyIntelligenceEntries([
    { path: 'docs/stale.md', content: 'Set NARADA_INTELLIGENCE_PROVIDER to select the provider.\n' },
    { path: 'docs/canonical.md', content: '<!-- narada:legacy-selection-negative:v1 symbol="NARADA_INTELLIGENCE_PROVIDER" disposition="retired" -->\n' },
  ]);
  assert.equal(inventory.violations.length, 1);
  assert.equal(inventory.violations[0].path, 'docs/stale.md');
  assert.equal(
    inventory.references.find((entry) => entry.path === 'docs/canonical.md').classification,
    'documentation_negative_contract',
  );
});

