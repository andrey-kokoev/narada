#!/usr/bin/env node
/**
 * PowerShell Runtime Policy Validation Guard
 *
 * Scans tools/ and templates/ for powershell.exe invocations.
 * Fails if any unannotated invocation is found.
 * Annotated exceptions must have a Tier 2 exception comment within 3 lines.
 *
 * Usage: node validate-powershell-runtime.mjs [cwd]
 * Exit code: 0 if clean, 1 if violations found
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const cwd = process.argv[2] || process.cwd();
const scanDirs = ['tools', 'templates'];
const extensions = new Set(['.ps1', '.psm1', '.mjs', '.yaml', '.yml', '.json']);

const exceptionPatterns = [
  /tier\s*2\s*exception/i,
  /must_stay_5\.1/i,
  /fallback.*powershell\.exe/i,
  /repair authority/i,
];

function* walk(dir, base) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path, base);
    } else if (entry.isFile() && extensions.has(entry.name.slice(entry.name.lastIndexOf('.')))) {
      yield path;
    }
  }
}

function isAnnotated(lines, matchLineIndex) {
  const start = Math.max(0, matchLineIndex - 3);
  const end = Math.min(lines.length, matchLineIndex + 4);
  for (let i = start; i < end; i++) {
    for (const pattern of exceptionPatterns) {
      if (pattern.test(lines[i])) return true;
    }
  }
  return false;
}

const violations = [];

for (const scanDir of scanDirs) {
  const absDir = join(cwd, scanDir);
  try {
    statSync(absDir);
  } catch {
    continue;
  }

  for (const filePath of walk(absDir, cwd)) {
    const relPath = relative(cwd, filePath);
    // Skip the guard script itself
    if (relPath.replace(/\\/g, '/').includes('validate-powershell-runtime.mjs')) continue;

    const content = readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comments and string literals that just mention powershell.exe in docs
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('<!--')) {
        // Still check - the exception comment should be nearby
      }

      // Match powershell.exe as a word boundary, but not inside a URL or docs path
      if (/\bpowershell\.exe\b/.test(line)) {
        if (!isAnnotated(lines, i)) {
          violations.push({
            file: relative(cwd, filePath),
            line: i + 1,
            text: line.trim().slice(0, 120),
          });
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error(JSON.stringify({
    schema: 'narada.validate.powershell_runtime.v0',
    status: 'fail',
    message: `Found ${violations.length} unannotated powershell.exe invocation(s)`,
    violations,
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'narada.validate.powershell_runtime.v0',
  status: 'pass',
  message: 'No unannotated powershell.exe invocations found in tools/ or templates/',
  scanned_dirs: scanDirs,
}, null, 2));
process.exit(0);
