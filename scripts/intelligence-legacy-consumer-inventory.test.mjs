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

test('does not blanket-admit authoritative governance decisions', () => {
  const inventory = scanLegacyIntelligenceEntries([
    {
      path: '.ai/decisions/stale.md',
      content: 'NARADA_INTELLIGENCE_PROVIDER selects the runtime provider.\n',
    },
    {
      path: '.ai/decisions/canonical.md',
      content: 'NARADA_INTELLIGENCE_PROVIDER is retired and must never select runtime intelligence.\n',
    },
    {
      path: '.ai/reviews/historical.md',
      content: 'Observed NARADA_INTELLIGENCE_PROVIDER during review.\n',
    },
  ]);
  assert.equal(inventory.violations.length, 1);
  assert.equal(inventory.violations[0].path, '.ai/decisions/stale.md');
  assert.equal(inventory.violations[0].classification, 'stale_governance_authority');
  assert.equal(
    inventory.references.find((entry) => entry.path === '.ai/decisions/canonical.md').classification,
    'governance_negative_contract',
  );
  assert.equal(
    inventory.references.find((entry) => entry.path === '.ai/reviews/historical.md').classification,
    'governance_evidence',
  );
});

test('admits an explicit runtime rejection boundary', () => {
  const inventory = scanLegacyIntelligenceEntries([{
    path: 'packages/agent-start/src/carrier-launch-adapter.ts',
    content: "const names = [\n  'CODEX_MODEL',\n];\nfor (const name of names) delete env[name];\n",
  }]);
  assert.equal(inventory.zero_authoritative_consumers, true);
  assert.equal(inventory.references[0].classification, 'runtime_rejection_boundary');
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
    { path: 'docs/canonical.md', content: 'NARADA_INTELLIGENCE_PROVIDER is retired and never selects runtime intelligence.\n' },
  ]);
  assert.equal(inventory.violations.length, 1);
  assert.equal(inventory.violations[0].path, 'docs/stale.md');
  assert.equal(
    inventory.references.find((entry) => entry.path === 'docs/canonical.md').classification,
    'documentation_negative_contract',
  );
});

