#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const RETIRED_PACKAGE_NAME = '@narada2/carrier-provider-contract';
export const RETIRED_PACKAGE_PATH = 'packages/carrier-provider-contract';
export const LEGACY_SELECTION_ENV_NAMES = Object.freeze([
  'NARADA_INTELLIGENCE_PROVIDER',
  'NARADA_INTELLIGENCE_PROVIDER_SOURCE_FIELD',
  'NARADA_INTELLIGENCE_PROVIDER_SOURCE_PATH',
  'NARADA_INTELLIGENCE_PROVIDER_METADATA_PATH',
  'NARADA_AI_MODEL',
  'NARADA_AI_BASE_URL',
  'NARADA_AI_THINKING',
  'NARADA_THINKING_LEVEL',
  'OPENAI_BASE_URL',
  'OPENAI_MODEL',
  'KIMI_API_BASE_URL',
  'KIMI_MODEL',
  'KIMI_CODE_API_BASE_URL',
  'KIMI_CODE_MODEL',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'DEEPSEEK_API_BASE_URL',
  'DEEPSEEK_MODEL',
  'GLM_API_BASE_URL',
  'GLM_MODEL',
  'OPENROUTER_BASE_URL',
  'OPENROUTER_API_BASE_URL',
  'OPENROUTER_MODEL',
  'CODEX_MODEL',
  'NARADA_CODEX_MODEL',
  'CLOUDFLARE_CARRIER_AI_MODEL',
]);

const SELF_PATH = 'scripts/intelligence-legacy-consumer-inventory.mjs';
const MIGRATION_FIXTURE_PATH = 'packages/invokable-intelligence-management/test/provider-registry.legacy-fixture.json';
const MIGRATION_OWNER_TASK = 2215;
const MIGRATION_DESTINATION = 'canonical invokable-intelligence catalog resources and policy';
const NEGATIVE_BOUNDARY_PATHS = new Set([
  'packages/agent-start/src/carrier-launch-adapter.ts',
  'packages/agent-start/src/codex-subscription-support.ts',
  'packages/agent-start/bin/verify-registered-site-launchers.mjs',
  'packages/nars-provider-runtime/src/canonical-protocol-adapters.mjs',
  'packages/nars-capability-gateway/src/mcp-runtime.mjs',
]);
const NEGATIVE_PACKAGE_ASSERTION_PATHS = new Set([
  'packages/layers/cli/test/commands/workspace-launch-boundaries.test.ts',
]);
const DOCUMENTATION_NEGATION = /\b(?:deprecated|drop(?:ped)?|forbid(?:den)?|ignored|legacy|must not|never|no longer|not an? |remove(?:d)?|retire(?:d)?|scrub(?:bed)?|without)\b/iu;
const TEST_PATH = /(?:^|\/)(?:__tests__|test|tests)(?:\/|$)|\.(?:spec|test)\.[cm]?[jt]sx?$/iu;

function normalizePath(path) {
  return String(path).replaceAll('\\', '/').replace(/^\.\//u, '');
}

function escapeRegExp(value) {
  return value.replace(/[$.*+?^{}()|[\]\\]/gu, '\\$&');
}

function symbolPattern(symbol) {
  const escaped = escapeRegExp(symbol);
  return symbol.includes('/') || symbol.includes('@')
    ? new RegExp(escaped, 'u')
    : new RegExp('(?<![A-Z0-9_])' + escaped + '(?![A-Z0-9_])', 'u');
}

const SCANNED_SYMBOLS = Object.freeze([
  RETIRED_PACKAGE_NAME,
  RETIRED_PACKAGE_PATH,
  ...LEGACY_SELECTION_ENV_NAMES,
].sort((left, right) => right.length - left.length));
const SYMBOL_PATTERNS = new Map(SCANNED_SYMBOLS.map((symbol) => [symbol, symbolPattern(symbol)]));

function isQuotedSymbolDeclaration(line, symbol) {
  return new RegExp('^\\s*[\'"]' + escapeRegExp(symbol) + '[\'"],?\\s*$', 'u').test(line);
}

function isNegativeBoundaryReference({ content, line, symbol }) {
  if (/\bdelete\b/u.test(line)) return true;
  if (!isQuotedSymbolDeclaration(line, symbol)) return false;
  return /delete\s+[A-Za-z_$][\w$]*\s*\[/u.test(content)
    || (/\.filter\s*\(/u.test(content) && /Object\.hasOwn/u.test(content));
}

function classifyReference({ path, content, line, symbol }) {
  if (path === SELF_PATH) return { classification: 'guard_definition', classification_reason: 'symbol is declared by the zero-consumer guard itself', admitted: true, authoritative: false };
  if (path === MIGRATION_FIXTURE_PATH) return { classification: 'frozen_migration_fixture', classification_reason: 'legacy values are inert migration test input and never loaded as runtime authority', admitted: true, authoritative: false };
  if (path.startsWith('.ai/') && !path.startsWith('.ai/decisions/')) {
    return { classification: 'governance_evidence', classification_reason: 'reference is retained only in task, review, or continuation evidence', admitted: true, authoritative: false };
  }

  const retiredReference = symbol === RETIRED_PACKAGE_NAME || symbol === RETIRED_PACKAGE_PATH;
  if (retiredReference) {
    if (path.startsWith('.ai/decisions/') && DOCUMENTATION_NEGATION.test(line)) {
      return { classification: 'governance_negative_contract', classification_reason: 'authoritative governance explicitly retires the legacy package reference', admitted: true, authoritative: false };
    }
    if (NEGATIVE_PACKAGE_ASSERTION_PATHS.has(path) && /not\.toContain|forbid|retired/iu.test(line)) {
      return { classification: 'negative_verification', classification_reason: 'test asserts that the retired package is absent', admitted: true, authoritative: false };
    }
    return { classification: 'retired_projection_reference', classification_reason: 'retired package name or path survives outside an admitted negative assertion', admitted: false, authoritative: true };
  }

  if (TEST_PATH.test(path)) return { classification: 'verification_fixture', classification_reason: 'reference exists only in a test or fixture that verifies rejection/scrubbing', admitted: true, authoritative: false };
  if (NEGATIVE_BOUNDARY_PATHS.has(path) && isNegativeBoundaryReference({ content, line, symbol })) {
    return { classification: 'runtime_rejection_boundary', classification_reason: 'runtime boundary explicitly deletes, filters, or refuses the legacy key', admitted: true, authoritative: false };
  }
  if (path.endsWith('.md') && DOCUMENTATION_NEGATION.test(line)) {
    return {
      classification: path.startsWith('.ai/decisions/') ? 'governance_negative_contract' : 'documentation_negative_contract',
      classification_reason: path.startsWith('.ai/decisions/')
        ? 'authoritative governance explicitly marks the legacy symbol retired, ignored, or forbidden'
        : 'documentation explicitly marks the legacy symbol retired, ignored, or forbidden',
      admitted: true,
      authoritative: false,
    };
  }
  if (path.endsWith('.md')) {
    return {
      classification: path.startsWith('.ai/decisions/') ? 'stale_governance_authority' : 'stale_documentation_authority',
      classification_reason: path.startsWith('.ai/decisions/')
        ? 'authoritative governance mentions the legacy symbol without an explicit negative contract'
        : 'documentation mentions the legacy symbol without an explicit negative contract',
      admitted: false,
      authoritative: true,
    };
  }
  return { classification: 'runtime_or_configuration_authority', classification_reason: 'executable or configuration content may still read or project the legacy selection symbol', admitted: false, authoritative: true };
}

export function scanLegacyIntelligenceEntries(entries, { retiredPackagePresent = false } = {}) {
  const references = [];
  const sortedEntries = [...entries]
    .map((entry) => ({ path: normalizePath(entry.path), content: String(entry.content ?? '') }))
    .sort((left, right) => left.path.localeCompare(right.path));

  for (const entry of sortedEntries) {
    const lines = entry.content.split(/\r?\n/u);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      for (const symbol of SCANNED_SYMBOLS) {
        if (!SYMBOL_PATTERNS.get(symbol).test(line)) continue;
        const classification = classifyReference({ path: entry.path, content: entry.content, line, symbol });
        references.push({
          path: entry.path,
          line: index + 1,
          symbol,
          scan_scope: entry.path.split('/').includes('dist') ? 'package_distribution_no_ignore' : 'repository_source',
          migration_owner_task: MIGRATION_OWNER_TASK,
          migration_destination: MIGRATION_DESTINATION,
          ...classification,
        });
      }
    }
  }

  const violations = references.filter((reference) => !reference.admitted);
  if (retiredPackagePresent) {
    violations.unshift({
      path: RETIRED_PACKAGE_PATH,
      line: null,
      symbol: RETIRED_PACKAGE_PATH,
      classification: 'retired_projection_artifact_present',
      classification_reason: 'the retired package directory still exists',
      admitted: false,
      authoritative: true,
      scan_scope: 'retired_projection_path_check',
      migration_owner_task: MIGRATION_OWNER_TASK,
      migration_destination: MIGRATION_DESTINATION,
    });
  }

  return {
    schema: 'narada.invokable_intelligence.legacy_consumer_inventory.v1',
    status: violations.length === 0 ? 'ok' : 'violations_found',
    retired_projection: {
      package: RETIRED_PACKAGE_NAME,
      path: RETIRED_PACKAGE_PATH,
      artifact_present: retiredPackagePresent,
    },
    migration: {
      owner_task: MIGRATION_OWNER_TASK,
      fixture: MIGRATION_FIXTURE_PATH,
      destination: MIGRATION_DESTINATION,
      removal_precondition: 'zero_authoritative_consumers',
    },
    counts: {
      files_scanned: sortedEntries.length,
      references: references.length,
      admitted_non_authoritative_references: references.length - violations.length,
      authoritative_consumers: violations.length,
    },
    zero_authoritative_consumers: violations.length === 0,
    references,
    violations,
  };
}

function runCandidateScan(root, searchRoots, { noIgnore = false } = {}) {
  if (searchRoots.length === 0) return [];
  const args = [
    '--files-with-matches',
    '--fixed-strings',
    '--hidden',
    ...(noIgnore ? ['--no-ignore'] : []),
    '--glob',
    '!.git/**',
    '--glob',
    '!**/node_modules/**',
  ];
  for (const symbol of SCANNED_SYMBOLS) args.push('-e', symbol);
  args.push(...searchRoots);
  const result = spawnSync('rg', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== 1) {
    throw new Error('legacy_consumer_candidate_scan_failed:' + String(result.stderr ?? '').trim());
  }
  return String(result.stdout ?? '')
    .split(/\r?\n/u)
    .map(normalizePath)
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

function distributionRoots(root) {
  const packagesRoot = resolve(root, 'packages');
  if (!existsSync(packagesRoot)) return [];
  const skippedDirectoryNames = new Set(['.git', '.narada', '.turbo', 'coverage', 'node_modules', 'playwright-report', 'test-results']);
  const pending = [packagesRoot];
  const roots = [];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || skippedDirectoryNames.has(entry.name)) continue;
      const path = resolve(directory, entry.name);
      if (entry.name === 'dist') {
        roots.push(normalizePath(relative(root, path)));
        continue;
      }
      pending.push(path);
    }
  }
  return roots.sort((left, right) => left.localeCompare(right));
}

function candidatePaths(root, distributionSearchRoots = distributionRoots(root)) {
  const sourceCandidates = runCandidateScan(root, ['.']);
  const distributionCandidates = runCandidateScan(root, distributionSearchRoots, { noIgnore: true });
  return [...new Set([...sourceCandidates, ...distributionCandidates])]
    .sort((left, right) => left.localeCompare(right));
}

export function inventoryLegacyIntelligence({ root }) {
  const distributionSearchRoots = distributionRoots(root);
  const entries = [];
  for (const path of candidatePaths(root, distributionSearchRoots)) {
    const absolutePath = resolve(root, path);
    if (!existsSync(absolutePath)) continue;
    const content = readFileSync(absolutePath, 'utf8');
    if (content.includes('\0')) continue;
    entries.push({ path, content });
  }
  const inventory = scanLegacyIntelligenceEntries(entries, {
    retiredPackagePresent: existsSync(resolve(root, RETIRED_PACKAGE_PATH)),
  });
  return {
    ...inventory,
    scan_contract: {
      source: { roots: ['.'], hidden: true, obey_ignore_files: true },
      package_distributions: {
        roots: distributionSearchRoots,
        recursive: true,
        hidden: true,
        obey_ignore_files: false,
      },
      excluded: ['.git/**', '**/node_modules/**'],
      candidate_reader: 'utf8_non_binary',
    },
  };
}

function isDirectRun() {
  return Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectRun()) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  try {
    const inventory = inventoryLegacyIntelligence({ root });
    const output = process.argv.includes('--violations-only')
      ? {
          schema: inventory.schema,
          status: inventory.status,
          counts: inventory.counts,
          zero_authoritative_consumers: inventory.zero_authoritative_consumers,
          violations: inventory.violations,
        }
      : inventory;
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    if (!inventory.zero_authoritative_consumers) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(JSON.stringify({
      schema: 'narada.invokable_intelligence.legacy_consumer_inventory.v1',
      status: 'scan_failed',
      reason: error instanceof Error ? error.message : String(error),
    }, null, 2) + '\n');
    process.exitCode = 2;
  }
}

