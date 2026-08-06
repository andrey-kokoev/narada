#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

if (!process.versions.bun) {
  console.error('run-bun-test-matrix requires Bun');
  process.exit(2);
}

const root = process.cwd();
const testRoot = join(root, 'test');

function collectTestFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(path));
    } else if (entry.isFile() && /\.test\.ts$/u.test(entry.name)) {
      files.push(path);
    }
  }
  return files.sort();
}

const vitestFiles = [];
const nodeTestFiles = [];
for (const absolutePath of collectTestFiles(testRoot)) {
  const source = readFileSync(absolutePath, 'utf8');
  const relativePath = relative(root, absolutePath).replaceAll('\\', '/');
  if (/\bfrom\s+['"]node:test['"]/u.test(source)) {
    nodeTestFiles.push(relativePath);
  } else {
    vitestFiles.push(relativePath);
  }
}

function run(label, args) {
  console.log(label + ': ' + args.slice(1).join(' '));
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) {
    console.error(label + ' failed: ' + result.error.message);
    return 1;
  }
  return result.status ?? 1;
}

let exitCode = 0;
if (nodeTestFiles.length > 0) {
  console.log('Bun node:test files (' + nodeTestFiles.length + '):');
  for (const file of nodeTestFiles) {
    exitCode = run('Bun node:test ' + file, ['test', file]) || exitCode;
  }
}
if (vitestFiles.length > 0) {
  const vitestEntrypoint = join(root, 'node_modules', 'vitest', 'vitest.mjs');
  exitCode = run('Bun Vitest files (' + vitestFiles.length + ')', [
    vitestEntrypoint,
    'run',
    '--silent=true',
    '--pool=forks',
    '--maxWorkers=1',
    '--no-file-parallelism',
    ...vitestFiles,
  ]) || exitCode;
}

process.exit(exitCode);
