import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const defaultTimeoutMs = 6 * 60 * 1000;
const outputLimit = 256 * 1024;

type ChildResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
};

function appendBounded(current: string, chunk: Buffer | string): string {
  const next = current + String(chunk);
  return next.length <= outputLimit ? next : next.slice(-outputLimit);
}

function testFilesIn(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.ts'))
    .map((entry) => join(directory, entry.name));
}

function resolveTestFiles(requested: string[]): string[] {
  const files = requested.length > 0
    ? requested.map((file) => resolve(packageRoot, file))
    : [
      ...testFilesIn(join(packageRoot, 'test')),
      ...testFilesIn(join(packageRoot, 'src')),
    ].sort();
  for (const file of files) {
    if (!existsSync(file)) throw new Error(`test_file_not_found:${file}`);
  }
  return files;
}

function timeoutFromArgs(args: string[]): { timeoutMs: number; requested: string[] } {
  let timeoutMs = Number(process.env.NARADA_AGENT_RUNTIME_TEST_FILE_TIMEOUT_MS ?? defaultTimeoutMs);
  const requested: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--timeout-ms') {
      timeoutMs = Number(args[index + 1]);
      index += 1;
    } else if (arg.startsWith('--timeout-ms=')) {
      timeoutMs = Number(arg.slice('--timeout-ms='.length));
    } else {
      requested.push(arg);
    }
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000) throw new Error(`invalid_timeout_ms:${timeoutMs}`);
  return { timeoutMs, requested };
}

function terminate(child: ChildProcess): void {
  if (child.pid == null) {
    child.kill();
    return;
  }
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } else {
    child.kill('SIGKILL');
  }
}

function runTestFile(file: string, timeoutMs: number): Promise<ChildResult> {
  const startedAt = Date.now();
  const child = spawn(process.execPath, [
    '--import', 'tsx',
    '--test',
    '--test-concurrency=1',
    file,
  ], {
    cwd: packageRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk: Buffer | string) => { stdout = appendBounded(stdout, chunk); });
  child.stderr?.on('data', (chunk: Buffer | string) => { stderr = appendBounded(stderr, chunk); });

  return new Promise((resolveResult) => {
    let settled = false;
    let timedOut = false;
    let timeoutHandle: NodeJS.Timeout | null = setTimeout(() => {
      timedOut = true;
      terminate(child);
      setTimeout(() => settle(null, 'SIGKILL'), 5_000).unref();
    }, timeoutMs);

    const settle = (code: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      timeoutHandle = null;
      resolveResult({
        code,
        signal,
        stdout,
        stderr,
        timedOut,
        durationMs: Date.now() - startedAt,
      });
    };

    child.once('error', (error) => {
      stderr = appendBounded(stderr, error instanceof Error ? error.stack ?? error.message : String(error));
      settle(1, null);
    });
    child.once('close', (code, signal) => settle(code, signal));
  });
}

function diagnosticsRoot(): string {
  return mkdtempSync(join(tmpdir(), 'narada-agent-runtime-tests-'));
}

function writeDiagnostics(root: string, index: number, file: string, result: ChildResult): void {
  const stem = `${String(index + 1).padStart(3, '0')}-${basename(file, '.ts')}`;
  writeFileSync(join(root, `${stem}.stdout.log`), result.stdout, 'utf8');
  writeFileSync(join(root, `${stem}.stderr.log`), result.stderr, 'utf8');
}

async function main(): Promise<void> {
  const { timeoutMs, requested } = timeoutFromArgs(process.argv.slice(2));
  const files = resolveTestFiles(requested);
  let passed = 0;
  let failed = 0;
  let timedOut = 0;
  let diagnostics: string | null = null;
  const suiteStartedAt = Date.now();

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const result = await runTestFile(file, timeoutMs);
    const label = relative(packageRoot, file).replaceAll('\\', '/');
    const status = result.timedOut ? 'TIMEOUT' : result.code === 0 ? 'PASS' : 'FAIL';
    if (status === 'PASS') passed += 1;
    else if (status === 'TIMEOUT') timedOut += 1;
    else failed += 1;
    if (status !== 'PASS') {
      diagnostics ??= diagnosticsRoot();
      writeDiagnostics(diagnostics, index, file, result);
    }
    console.log(`[${status}] ${label} — ${(result.durationMs / 1000).toFixed(2)}s`);
  }

  const total = Date.now() - suiteStartedAt;
  console.log(`Summary: ${passed} passed, ${failed} failed, ${timedOut} timed out, ${(total / 1000).toFixed(2)}s total`);
  if (diagnostics) console.log(`Diagnostics: ${diagnostics}`);
  if (failed > 0 || timedOut > 0) process.exitCode = 1;
}

await main();
