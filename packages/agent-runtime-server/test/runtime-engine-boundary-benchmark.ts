import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';

type Engine = 'node' | 'bun' | 'rust';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const fixture = fileURLToPath(new URL('./fixtures/runtime-engine-benchmark-target.mjs', import.meta.url));
const nativeBinary = join(
  packageRoot,
  'native',
  'target',
  'release',
  process.platform === 'win32' ? 'narada-agent-runtime-server-rust.exe' : 'narada-agent-runtime-server-rust',
);
const iterations = boundedInteger(process.env.NARADA_RUNTIME_ENGINE_BENCHMARK_ITERATIONS, 15, 1, 100);
const warmups = boundedInteger(process.env.NARADA_RUNTIME_ENGINE_BENCHMARK_WARMUPS, 2, 0, 20);

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))] ?? 0;
}

function commandFor(engine: Engine): { command: string; args: string[]; env: NodeJS.ProcessEnv } | null {
  if (engine === 'node') {
    return { command: process.execPath, args: [fixture], env: { ...process.env } };
  }
  if (engine === 'bun') {
    return { command: process.env.NARADA_BUN_COMMAND ?? 'bun', args: [fixture], env: { ...process.env } };
  }
  if (!existsSync(nativeBinary)) return null;
  return {
    command: process.env.NARADA_RUST_RUNTIME_COMMAND ?? nativeBinary,
    args: [],
    env: {
      ...process.env,
      NARADA_RUNTIME_SERVER_SCRIPT: fixture,
      NARADA_RUNTIME_NODE_COMMAND: process.execPath,
      NARADA_RUNTIME_ENGINE: 'rust',
    },
  };
}

function runOnce(spec: { command: string; args: string[]; env: NodeJS.ProcessEnv }): Promise<number> {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const child = spawn(spec.command, spec.args, {
      cwd: packageRoot,
      env: spec.env,
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('close', (code) => resolve(performance.now() - startedAt + (code === 0 ? 0 : 1000)));
  });
}

async function measure(engine: Engine) {
  const spec = commandFor(engine);
  if (!spec) return { engine, status: 'unavailable', samples: 0, p50_ms: null, p95_ms: null, mean_ms: null };
  for (let index = 0; index < warmups; index += 1) await runOnce(spec);
  const samples: number[] = [];
  for (let index = 0; index < iterations; index += 1) samples.push(await runOnce(spec));
  return {
    engine,
    status: 'measured',
    samples: samples.length,
    p50_ms: Number(percentile(samples, 0.5).toFixed(3)),
    p95_ms: Number(percentile(samples, 0.95).toFixed(3)),
    mean_ms: Number((samples.reduce((sum, value) => sum + value, 0) / samples.length).toFixed(3)),
  };
}

const results = [];
for (const engine of ['node', 'bun', 'rust'] as Engine[]) results.push(await measure(engine));
process.stdout.write(`${JSON.stringify({
  schema: 'narada.runtime_engine_boundary_benchmark.v1',
  generated_at: new Date().toISOString(),
  iterations,
  warmups,
  fixture,
  results,
}, null, 2)}\n`);
