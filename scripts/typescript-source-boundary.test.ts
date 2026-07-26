#!/usr/bin/env tsx
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { test } from 'node:test';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const ignoredDirectoryNames = new Set([
  '.ai',
  '.narada',
  '.tmp',
  '_archive',
  'build',
  'coverage',
  'dist',
  'dist-fixture',
  'legacy',
  'node_modules',
  'public',
  'scripts-dist',
]);

function authoredJavaScriptFiles(root: string): string[] {
  const offenders: string[] = [];

  function isGeneratedTypeScriptArtifact(absolutePath: string, fileName: string): boolean {
    if (!/\.js$/iu.test(fileName)) return false;
    const sourcePath = absolutePath.replace(/\.js$/iu, '.ts');
    return existsSync(sourcePath);
  }

  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && ignoredDirectoryNames.has(entry.name)) continue;
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (/\.(?:cjs|js|mjs)$/iu.test(entry.name) && !isGeneratedTypeScriptArtifact(absolutePath, entry.name)) {
        offenders.push(relative(repositoryRoot, absolutePath));
      }
    }
  }

  visit(root);
  return offenders.sort();
}

test('authored runtime, test, tool, and script sources are TypeScript', () => {
  const roots = ['packages', 'scripts', 'tools'].map((path) => join(repositoryRoot, path));
  const offenders = roots.flatMap(authoredJavaScriptFiles).sort();
  assert.deepEqual(offenders, [], 'authored JavaScript remains:\n' + offenders.join('\n'));
});
