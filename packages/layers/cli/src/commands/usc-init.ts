/**
 * Initialize a USC-governed construction repo via Narada proper.
 *
 * This command bridges Narada proper (canonical user-facing runtime)
 * with narada.usc (compiler/artifact provider) by calling derive-class
 * USC library functions only.
 */

import { resolve, dirname, basename, join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

// USC compiler library functions (derive-class only)
import { initRepo, plan } from '@narada.usc/compiler';
import { refineIntent } from '@narada.usc/compiler/src/refine-intent.js';
import { validateAll } from '@narada.usc/core/src/validator.js';

export interface UscInitOptions {
  path: string;
  name?: string;
  intent?: string;
  domain?: string;
  cis?: boolean;
  principal?: string;
  force?: boolean;
}

function resolveUscRoot(): string {
  // Resolve the actual on-disk path of the compiler package (follows pnpm symlink)
  const require = createRequire(import.meta.url);
  const compilerPkgPath = require.resolve('@narada.usc/compiler/package.json');
  // compilerPkgPath is at <usc-root>/packages/compiler/package.json
  // Go up two levels to reach the narada.usc repo root
  return resolve(dirname(compilerPkgPath), '../..');
}

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

  const rootDir = resolveUscRoot();

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
      `Tasks: ${planResult.summary.task_count}, Runnable: ${planResult.summary.runnable_count}, Blocked: ${planResult.summary.blocked_count}`,
    );
  }

  // 4. Override README to point users to Narada proper
  const readmePath = join(targetDir, 'README.md');
  writeFileSync(readmePath, renderNaradaReadme(name, targetDir, useCis));

  // 5. Validate the generated repo
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
