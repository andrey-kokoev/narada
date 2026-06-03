#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const packageRoot = resolve(repoRoot, 'packages/site-tool-surface-legacy');
const manifestPath = resolve(packageRoot, 'manifest.json');
const generatedBy = 'packages/site-tool-surface-legacy/scripts/sync-selected-mirrors.mjs';

function replaceImports(text, replacements) {
  let result = text;
  for (const [from, to] of replacements) result = result.replaceAll(from, to);
  return result;
}

const mappings = [
  {
    source: 'packages/agent-context-tools/src/agent-context-mcp-server.mjs',
    mirror: 'tools/agent-context/agent-context-mcp-server.mjs',
    transform(text) {
      return replaceImports(text, [
        ["../../site-common-tools/compat/mcp-payload-file.legacy-site.mjs", "../mcp-payload-file.mjs"],
        ["../../site-common-tools/src/mcp-freshness-service.mjs", "../mcp-freshness-service.mjs"],
        ["../../site-common-tools/src/operator-surface/mcp-runtime-instance-registry.mjs", "../operator-surface/mcp-runtime-instance-registry.mjs"],
        ["../../site-common-tools/src/site-locus-shim.mjs", "../site-locus-shim.mjs"],
        ["../../task-lifecycle-tools/src/task-mcp-tool-registry.mjs", "../task-lifecycle/task-mcp-tool-registry.mjs"],
        ["../../site-common-tools/src/task-lifecycle-mcp-resolution.mjs", "../../../../site-common-tools/src/task-lifecycle-mcp-resolution.mjs"],
      ]);
    },
  },
  {
    source: 'packages/site-common-tools/src/narada-andrey/site-doctor.mjs',
    mirror: 'tools/narada-andrey/site-doctor.mjs',
    transform(text) {
      return replaceImports(text, [
        ["../task-lifecycle-mcp-resolution.mjs", "../../../../site-common-tools/src/task-lifecycle-mcp-resolution.mjs"],
      ]);
    },
  },
  {
    source: 'packages/site-common-tools/src/operator-surface/mcp-runtime-instance-registry.mjs',
    mirror: 'tools/operator-surface/mcp-runtime-instance-registry.mjs',
    transform(text) {
      return replaceImports(text, [
        ["../site-layout.mjs", "../../../../site-common-tools/src/site-layout.mjs"],
      ]);
    },
  },
  {
    source: 'packages/site-common-tools/src/site-config/agent-execution-policy.mjs',
    mirror: 'tools/site-config/agent-execution-policy.mjs',
    transform(text) {
      return replaceImports(text, [
        ["../site-layout.mjs", "../../../../site-common-tools/src/site-layout.mjs"],
      ]);
    },
  },
];

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
let changed = manifest.generated_by !== generatedBy;
manifest.generated_by = generatedBy;

for (const mapping of mappings) {
  const sourcePath = resolve(repoRoot, mapping.source);
  const mirrorPath = resolve(packageRoot, 'mirrors', mapping.mirror);
  const sourceText = readFileSync(sourcePath, 'utf8');
  const mirrorText = mapping.transform(sourceText).replace(/\r\n/g, '\n');
  if (!existsSync(mirrorPath) || readFileSync(mirrorPath, 'utf8') !== mirrorText) {
    mkdirSync(dirname(mirrorPath), { recursive: true });
    writeFileSync(mirrorPath, mirrorText, 'utf8');
    changed = true;
  }
  const hash = createHash('sha256').update(mirrorText).digest('hex');
  const entry = manifest.files.find((item) => item.path === mapping.mirror);
  if (!entry) throw new Error(`Manifest entry not found for ${mapping.mirror}`);
  if (entry.hash !== hash || entry.source_site !== repoRoot || entry.source_path !== sourcePath) {
    entry.hash = hash;
    entry.source_site = repoRoot;
    entry.source_path = sourcePath;
    changed = true;
  }
}

if (changed) manifest.generated_at = new Date().toISOString();
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

for (const mapping of mappings) {
  console.log(`synced ${mapping.mirror}`);
}
console.log(changed ? 'manifest updated' : 'manifest already current');
