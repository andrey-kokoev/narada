/**
 * Initialize a USC-governed construction repo via Narada proper.
 *
 * This command bridges Narada proper (canonical user-facing runtime)
 * with narada.usc (compiler/artifact provider) by calling derive-class
 * USC library functions only.
 *
 * Dependency strategy: plugin/provider boundary
 *   - `@narada2/cli` does NOT declare a hard dependency on `@narada.usc/*`
 *   - USC packages are loaded dynamically at runtime
 *   - If absent, the command fails with a clear installation message
 *   - This keeps the CLI publishable without encoding machine-local paths
 */

import { resolve, dirname, basename, join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { populateSchemaCache } from '../lib/usc-schema-cache.js';

export interface UscInitOptions {
  path: string;
  name?: string;
  intent?: string;
  domain?: string;
  cis?: boolean;
  principal?: string;
  force?: boolean;
}

/* ── Version compatibility checking ─────────────────────────────────────── */

export interface UscVersionCheck {
  expected: string;
  installed: string | null;
  compatible: boolean;
}

function getNaradaRoot(): string {
  // Start from this file's directory and search upward for the monorepo root
  const startDir = dirname(fileURLToPath(import.meta.url));
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const parent = dirname(dir);
    if (parent === dir) break;
    if (existsSync(join(parent, 'pnpm-workspace.yaml')) || existsSync(join(parent, '.pnpm-workspace.yaml'))) {
      return parent;
    }
    // Also accept a package.json with config.uscVersion as a fallback marker
    const pkgPath = join(parent, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        if (pkg.config?.uscVersion !== undefined || pkg.private === true) {
          return parent;
        }
      } catch {
        // ignore parse errors, keep searching
      }
    }
    dir = parent;
  }
  // Fallback: go up 5 levels from packages/layers/cli/src/commands/
  return resolve(startDir, '../../../../../');
}

export function getExpectedUscVersion(): string | undefined {
  try {
    const root = getNaradaRoot();
    const pkgPath = join(root, 'package.json');
    if (!existsSync(pkgPath)) return undefined;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return pkg.config?.uscVersion;
  } catch {
    return undefined;
  }
}

export function getInstalledUscVersion(): string | null {
  try {
    const req = createRequire(import.meta.url);
    const compilerPkgPath = req.resolve('@narada.usc/compiler/package.json');
    const pkg = JSON.parse(readFileSync(compilerPkgPath, 'utf8'));
    return pkg.version || null;
  } catch {
    return null;
  }
}

/**
 * Minimal semver range satisfaction.
 * Supports exact versions and caret (^) ranges.
 */
export function satisfiesVersionRange(range: string, version: string): boolean {
  const r = range.trim();
  const v = version.trim();

  if (r === v) return true;

  if (r.startsWith('^')) {
    const expectedParts = r.slice(1).split('.').map(Number);
    const installedParts = v.split('.').map(Number);
    if (expectedParts.length < 2 || installedParts.length < 2) return false;

    // Major must match
    if (installedParts[0] !== expectedParts[0]) return false;

    // For 0.x.y, caret behaves like ~0.x.y (only patch changes allowed)
    if (expectedParts[0] === 0) {
      if (installedParts[1] !== expectedParts[1]) return false;
      if (installedParts[2] < (expectedParts[2] || 0)) return false;
      return true;
    }

    // For >=1.x.y, minor must be >= expected, or same minor with >= patch
    if (installedParts[1] > expectedParts[1]) return true;
    if (installedParts[1] === expectedParts[1]) {
      return installedParts[2] >= (expectedParts[2] || 0);
    }
    return false;
  }

  // Fallback: exact match only
  return r === v;
}

export function checkUscVersion(): UscVersionCheck {
  const expected = getExpectedUscVersion();
  const installed = getInstalledUscVersion();

  if (!expected) {
    // No version constraint configured; allow anything
    return { expected: 'any', installed, compatible: true };
  }

  if (!installed) {
    return { expected, installed, compatible: false };
  }

  const compatible = satisfiesVersionRange(expected, installed);
  return { expected, installed, compatible };
}

/* ── Dynamic USC module loading ─────────────────────────────────────────── */

interface UscCompilerModule {
  initRepo(options: Record<string, unknown>): string;
  plan(options: Record<string, unknown>): {
    taskGraphPath: string;
    summary: {
      task_count: number;
      proposed_count: number;
      admitted_count: number;
    };
  };
}

interface UscRefinementModule {
  refineIntent(intent: string, domainHint?: string | null): Promise<Record<string, unknown>>;
}

interface UscValidatorModule {
  validateAll(options?: { rootDir?: string; appPath?: string }): {
    results: Array<{ name: string; valid: boolean; errors: string[] }>;
    allPassed: boolean;
  };
}

const USC_INSTALL_HINT =
  'USC packages are not installed. To use narada init usc, install them:\n' +
  '  pnpm add @narada.usc/compiler @narada.usc/core\n' +
  'Or, for local development, link from the narada.usc repo:\n' +
  '  cd packages/layers/cli && pnpm link <path-to-narada.usc>/packages/compiler\n' +
  '  cd packages/layers/cli && pnpm link <path-to-narada.usc>/packages/core';

async function loadUscCompiler(): Promise<UscCompilerModule> {
  try {
    return (await import('@narada.usc/compiler')) as UscCompilerModule;
  } catch {
    throw new Error(USC_INSTALL_HINT);
  }
}

async function loadUscRefinement(): Promise<UscRefinementModule> {
  try {
    return (await import('@narada.usc/compiler/src/refine-intent.js')) as UscRefinementModule;
  } catch {
    throw new Error(USC_INSTALL_HINT);
  }
}

async function loadUscValidator(): Promise<UscValidatorModule> {
  try {
    return (await import('@narada.usc/core/src/validator.js')) as UscValidatorModule;
  } catch {
    throw new Error(USC_INSTALL_HINT);
  }
}

function resolveUscRoot(): string {
  try {
    const req = createRequire(import.meta.url);
    const compilerPkgPath = req.resolve('@narada.usc/compiler/package.json');
    // compilerPkgPath is at <usc-root>/packages/compiler/package.json
    // Go up two levels to reach the narada.usc repo root
    return resolve(dirname(compilerPkgPath), '../..');
  } catch {
    throw new Error(
      'Cannot resolve USC root directory. ' + USC_INSTALL_HINT,
    );
  }
}

/* ── Rendering helpers ──────────────────────────────────────────────────── */

function renderRefinementMd(refinement: Record<string, unknown>, intent: string): string {
  const ambiguities = (refinement.ambiguities as Array<{ layer: string; description: string; governing?: boolean }>) || [];
  const questions = (refinement.questions as Array<{ authority: string; question: string; blocking?: boolean; options?: string[] }>) || [];
  const assumptions = (refinement.assumptions as Array<{ assumption: string; confidence: string; reversible?: boolean }>) || [];
  const seedTasks = (refinement.seed_tasks as Array<{ id: string; title: string; transformation?: string }>) || [];
  const residuals = (refinement.residuals as Array<{ residual_id: string; description: string; blocking?: boolean }>) || [];

  const lines: string[] = [
    `# Intent Refinement: ${intent}`,
    '',
    `**Detected Domain:** ${String(refinement.detected_domain || 'unknown')}`,
    '',
    '## Ambiguities',
    ...ambiguities.map(a => `- **${a.layer}**: ${a.description}${a.governing ? ' (governing)' : ''}`),
    '',
    '## Questions',
    ...questions.map(q => `- **${q.authority}**: ${q.question}${q.blocking ? ' (blocking)' : ''}`),
    '',
    '## Assumptions',
    ...assumptions.map(a => `- ${a.assumption} (confidence: ${a.confidence})`),
    '',
    '## Seed Tasks',
    ...seedTasks.map(t => `- **${t.id}**: ${t.title}${t.transformation ? ` — ${t.transformation}` : ''}`),
    '',
    '## Residuals',
    ...residuals.map(r => `- **${r.residual_id}**: ${r.description} (${r.blocking ? 'blocking' : 'non-blocking'})`),
    '',
  ];
  return lines.join('\n');
}

function renderNaradaReadme(name: string, targetDir: string, useCis: boolean): string {
  const cisNote = useCis
    ? '\n> This app is governed by a required CIS admissibility policy. All construction steps must preserve functional properties and transformation potential.\n'
    : '';

  return `# narada.usc.${name}

A USC-governed construction repo initialized through **Narada proper**.

## Structure

| Path | Purpose |
|------|---------|
| \`usc/\` | USC construction state, tasks, reviews, residuals, closures, cycles |
| \`usc/construction-state.json\` | Durable construction state |
| \`usc/task-graph.json\` | Task and dependency graph |
| \`usc/refinement.json\` | Structured intent refinement |
| \`usc/cycles/\` | Construction cycles and checkpoints |
| product code | Lives outside \`usc/\`; specific to this system |

## Canonical Entry Point

This repo was created through **Narada proper**, which remains the canonical surface for:

- Initializing USC-governed app repos
- Refining intent and planning tasks
- Validating construction artifacts

Construction lifecycle commands (claim, execute, resolve, confirm, admin) belong in Narada proper, not in the USC substrate.

## Validation

Validate from Narada proper or from the USC substrate repo:

\`\`\`bash
pnpm --dir /path/to/narada.usc validate --app ${targetDir}
\`\`\`

${cisNote}
`;
}

/* ── Command implementation ─────────────────────────────────────────────── */

export async function uscInitCommand(options: UscInitOptions): Promise<void> {
  const targetPath = options.path;
  if (!targetPath) {
    throw new Error('Target path is required. Usage: narada init usc <path>');
  }

  const targetDir = resolve(targetPath);
  const name = options.name || basename(targetDir);
  const principal = options.principal || 'TBD';
  const intent = options.intent || 'TBD';
  const useCis = options.cis || false;
  const force = options.force || false;
  const domainHint = options.domain || undefined;

  // Check USC version compatibility before loading modules
  const versionCheck = checkUscVersion();
  if (!versionCheck.compatible) {
    if (!versionCheck.installed) {
      throw new Error(USC_INSTALL_HINT);
    }
    throw new Error(
      `USC compiler version ${versionCheck.installed} is installed; Narada requires ${versionCheck.expected}. ` +
      `Run \`pnpm add @narada.usc/compiler@${versionCheck.expected}\``,
    );
  }

  const rootDir = resolveUscRoot();

  // Load USC compiler dynamically
  const { initRepo, plan } = await loadUscCompiler();

  // 1. Initialize repo via USC compiler
  initRepo({
    name,
    target: targetDir,
    principal,
    intent,
    useCis,
    initGit: false,
    force,
    rootDir,
  });

  // 2. Create artifacts directory (expected by convention but not created by initRepo)
  const artifactsDir = join(targetDir, 'usc', 'artifacts');
  if (!existsSync(artifactsDir)) {
    mkdirSync(artifactsDir, { recursive: true });
  }

  // 3. If intent was provided, refine and plan
  if (options.intent) {
    const { refineIntent } = await loadUscRefinement();
    const refinement = await refineIntent(options.intent, domainHint);

    const uscDir = join(targetDir, 'usc');
    const refinementPath = join(uscDir, 'refinement.json');
    const refinementMdPath = join(uscDir, 'refinement.md');

    // Check for existing refinement files (honor force flag)
    const existingFiles: string[] = [];
    if (existsSync(refinementPath)) existingFiles.push(refinementPath);
    if (existsSync(refinementMdPath)) existingFiles.push(refinementMdPath);
    if (existingFiles.length > 0 && !force) {
      throw new Error(
        `Refuse to overwrite existing refinement artifact(s): ${existingFiles.join(', ')}\nUse --force to overwrite.`,
      );
    }

    writeFileSync(refinementPath, JSON.stringify(refinement, null, 2));
    writeFileSync(refinementMdPath, renderRefinementMd(refinement, options.intent));

    // Plan from refinement (replace placeholder task-graph)
    const planResult = plan({ target: targetDir, force: true });

    console.log(`Task graph written to ${planResult.taskGraphPath}`);
    console.log(
      `Tasks: ${planResult.summary.task_count}, Proposed: ${planResult.summary.proposed_count}, Admitted: ${planResult.summary.admitted_count}`,
    );
  }

  // 4. Override README to point users to Narada proper
  const readmePath = join(targetDir, 'README.md');
  writeFileSync(readmePath, renderNaradaReadme(name, targetDir, useCis));

  // 5. Validate the generated repo
  const { validateAll } = await loadUscValidator();
  const validation = validateAll({ appPath: targetDir });
  if (!validation.allPassed) {
    for (const result of validation.results) {
      if (!result.valid) {
        console.error(`FAIL ${result.name}`);
        for (const err of result.errors) {
          console.error(`  ${err}`);
        }
      }
    }
    throw new Error('Generated USC repo failed validation. See errors above.');
  }

  // 6. Populate schema cache for offline resilience
  const schemaCache = populateSchemaCache(rootDir, targetDir);
  if (schemaCache.cached > 0) {
    console.log(`Cached ${schemaCache.cached} schema(s) to ${schemaCache.cacheDir}`);
  }

  console.log(`USC repo '${name}' initialized at ${targetDir}`);
  if (useCis) console.log('CIS admissibility policy included.');
  console.log('');
  console.log('Created:');
  console.log(`  ${join(targetDir, 'usc', 'construction-state.json')}`);
  if (options.intent) {
    console.log(`  ${join(targetDir, 'usc', 'refinement.json')}`);
    console.log(`  ${join(targetDir, 'usc', 'refinement.md')}`);
  }
  console.log(`  ${join(targetDir, 'usc', 'task-graph.json')}`);
  console.log(`  ${readmePath}`);
  console.log('');
  console.log('Next steps:');
  console.log('  - Review usc/refinement.md for ambiguities and blocking questions');
  console.log('  - Continue construction through Narada proper');
}
