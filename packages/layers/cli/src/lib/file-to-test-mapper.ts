/**
 * File-to-Test Mapping Heuristic
 *
 * Maps changed source files to the smallest plausible verification command.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join, dirname, basename, relative } from 'node:path';

export interface Suggestion {
  command: string;
  scope: 'single-file' | 'multi-file' | 'package' | 'verify' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  explanation: string;
  mappedFiles: string[];
}

/**
 * Try to find a test file that mirrors a source file path.
 */
function findMirroredTest(sourcePath: string): string | null {
  // packages/layers/cli/src/commands/foo.ts → packages/layers/cli/test/commands/foo.test.ts
  if (sourcePath.includes('/src/')) {
    const testPath = sourcePath.replace('/src/', '/test/').replace(/\.ts$/, '.test.ts');
    if (existsSync(testPath)) return testPath;
  }
  return null;
}

/**
 * Map a single source file to its most likely test.
 */
function mapSingleFile(sourcePath: string, cwd: string): Suggestion | null {
  const absolute = sourcePath.startsWith('/') ? sourcePath : join(cwd, sourcePath);
  const rel = relative(cwd, absolute);

  // Docs / task-only changes → verify only
  if (
    rel.startsWith('.ai/') ||
    rel.startsWith('docs/') ||
    rel.endsWith('.md') ||
    rel.endsWith('.json') && !rel.includes('tsconfig')
  ) {
    return {
      command: 'pnpm verify',
      scope: 'verify',
      confidence: 'medium',
      explanation: 'Documentation or task metadata changes; baseline verification is sufficient.',
      mappedFiles: [rel],
    };
  }

  const mirrored = findMirroredTest(absolute);
  if (mirrored) {
    const testRel = relative(cwd, mirrored);
    // Determine package for the pnpm --filter command
    const pkgMatch = rel.match(/^packages\/layers\/([^/]+)\//);
    const filter = pkgMatch ? `--filter @narada2/${pkgMatch[1]} ` : '';
    return {
      command: `pnpm ${filter}exec vitest run ${testRel}`,
      scope: 'single-file',
      confidence: 'high',
      explanation: `Found mirrored test file for ${basename(rel)}.`,
      mappedFiles: [rel, testRel],
    };
  }

  // control-plane: search for test file with same name anywhere in package test tree
  const cpMatch = rel.match(/^(packages\/layers\/control-plane\/src\/.+)\/([^/]+)\.ts$/);
  if (cpMatch) {
    const testDir = join(cwd, 'packages/layers/control-plane/test');
    const name = cpMatch[2];
    // Try to find exactly one matching test file
    const candidates = findTestCandidates(testDir, name);
    if (candidates.length === 1) {
      const testRel = relative(cwd, candidates[0]);
      return {
        command: `pnpm --filter @narada2/control-plane exec vitest run ${testRel}`,
        scope: 'single-file',
        confidence: 'high',
        explanation: `Found exactly one matching test for ${name} in control-plane.`,
        mappedFiles: [rel, testRel],
      };
    }
  }

  return null;
}

function findTestCandidates(dir: string, name: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;
  const entries = readdirSync(dir, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name === `${name}.test.ts`) {
      results.push(join(entry.parentPath ?? dir, entry.name));
    }
  }
  return results;
}

/**
 * Suggest the smallest verification command for a set of changed files.
 */
export function suggestVerification(files: string[], cwd: string): Suggestion {
  const suggestions: Suggestion[] = [];
  const unmapped: string[] = [];

  for (const file of files) {
    const mapped = mapSingleFile(file, cwd);
    if (mapped) {
      suggestions.push(mapped);
    } else {
      unmapped.push(file);
    }
  }

  if (suggestions.length === 0) {
    return {
      command: 'pnpm verify',
      scope: 'verify',
      confidence: 'low',
      explanation:
        unmapped.length > 0
          ? `Could not map ${unmapped.length} file(s) to focused tests. Run baseline verification.`
          : 'No files to map; run baseline verification.',
      mappedFiles: unmapped,
    };
  }

  // If all suggestions are the same command, return it directly
  const uniqueCommands = [...new Set(suggestions.map((s) => s.command))];
  if (uniqueCommands.length === 1) {
    return suggestions[0];
  }

  // If multiple different tests, suggest running them all (multi-file)
  const testFiles = suggestions
    .flatMap((s) => s.mappedFiles)
    .filter((f) => f.endsWith('.test.ts'));

  if (testFiles.length > 0) {
    const uniqueTests = [...new Set(testFiles)];
    // Group by package
    const pkgGroups = new Map<string, string[]>();
    for (const t of uniqueTests) {
      const pkgMatch = t.match(/^packages\/layers\/([^/]+)\//);
      const pkg = pkgMatch ? `@narada2/${pkgMatch[1]}` : 'unknown';
      const arr = pkgGroups.get(pkg) ?? [];
      arr.push(t);
      pkgGroups.set(pkg, arr);
    }

    if (pkgGroups.size === 1) {
      const [pkg, tests] = [...pkgGroups.entries()][0];
      const filter = pkg === 'unknown' ? '' : `--filter ${pkg} `;
      return {
        command: `pnpm ${filter}exec vitest run ${tests.join(' ')}`,
        scope: 'multi-file',
        confidence: 'medium',
        explanation: `Mapped ${files.length} file(s) to ${tests.length} test file(s) in ${pkg}. Use ALLOW_MULTI_FILE_FOCUSED=1 if running via test:focused.`,
        mappedFiles: [...files, ...tests],
      };
    }

    // Multiple packages: fall back to verify
    return {
      command: 'pnpm verify',
      scope: 'verify',
      confidence: 'medium',
      explanation: `Mapped files span ${pkgGroups.size} packages; baseline verification is safer.`,
      mappedFiles: [...files, ...uniqueTests],
    };
  }

  return {
    command: 'pnpm verify',
    scope: 'verify',
    confidence: 'low',
    explanation: 'Could not derive a focused test command; run baseline verification.',
    mappedFiles: files,
  };
}
