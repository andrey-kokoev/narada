#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { summarizeCloudflareProductReadiness } from './cloudflare-product-readiness-summary.mjs';

const args = process.argv.slice(2);
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const operatorCheckScript = fileURLToPath(new URL('./cloudflare-operator-check.mjs', import.meta.url));

if (flag('--help') || flag('-h')) {
  process.stdout.write(`Usage: node scripts/cloudflare-product-readiness.mjs [options]\n\nEmits a concise Narada Cloudflare product readiness gate.\n\nOptions:\n  --from-json <path>      Summarize an existing cloudflare-operator-check JSON report\n  --require-human-action  Run the strict human-action operator check before summarizing\n  --help                  Show this help\n\nWithout --from-json, this command runs cloudflare-operator-check with --require-human-operator-action.\n`);
  process.exit(0);
}

const sourcePath = option('--from-json');
const operatorCheck = sourcePath
  ? JSON.parse(await readFile(sourcePath, 'utf8'))
  : await runOperatorCheck();

const readiness = summarizeCloudflareProductReadiness(operatorCheck);
process.stdout.write(`${JSON.stringify(readiness, null, 2)}\n`);
process.exit(readiness.status === 'ready' ? 0 : 1);

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function flag(name) {
  return args.includes(name);
}

function runOperatorCheck() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [operatorCheckScript, '--require-human-operator-action'], {
      cwd: repoRoot,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`cloudflare_operator_check_failed:${code}\n${stderr || stdout}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`cloudflare_operator_check_output_not_json:${error.message}\n${stdout.slice(0, 1000)}`));
      }
    });
  });
}
