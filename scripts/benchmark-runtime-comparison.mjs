#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import os from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workerPath = join(root, 'packages', 'layers', 'control-plane', 'scripts', 'runtime-benchmark-worker.mjs');
const workerCwd = join(root, 'packages', 'layers', 'control-plane');
const cliRoot = join(root, 'packages', 'layers', 'cli');
const cliEntrypoint = join(cliRoot, 'dist', 'main.js');

function parsePositive(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function parseArgs(argv) {
  const options = {
    warmup: 5,
    samples: 12,
    repeats: 3,
    output: join(root, 'benchmark-results', 'runtime-node-vs-bun.json'),
    skipCli: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const [key, inlineValue] = token.split('=', 2);
    if (key === '--help' || key === '-h') {
      console.log('Usage: node scripts/benchmark-runtime-comparison.mjs [options]');
      console.log('  --warmup N       warmup runs per worker case (default: 5)');
      console.log('  --samples N      measured samples per worker case (default: 12)');
      console.log('  --repeats N      independent runtime processes (default: 3)');
      console.log('  --output PATH    JSON report path');
      console.log('  --skip-cli       omit the built CLI startup case');
      process.exit(0);
    }
    if (key === '--skip-cli') {
      options.skipCli = true;
      continue;
    }
    if (!['--warmup', '--samples', '--repeats', '--output'].includes(key)) {
      throw new Error(`Unknown option: ${token}`);
    }
    const value = inlineValue ?? argv[++index];
    if (value === undefined) throw new Error(`${key} requires a value`);
    if (key === '--warmup') options.warmup = parsePositive(value, key);
    if (key === '--samples') options.samples = parsePositive(value, key);
    if (key === '--repeats') options.repeats = parsePositive(value, key);
    if (key === '--output') options.output = isAbsolute(value) ? value : resolve(root, value);
  }
  return options;
}

function findOnPath(command) {
  const override = process.env[`NARADA_${command.toUpperCase()}_EXECUTABLE`]?.trim();
  if (override) return override;
  const names = process.platform === 'win32' ? [`${command}.exe`, command] : [command];
  const pathSeparator = process.platform === 'win32' ? ';' : ':';
  for (const directory of (process.env.PATH ?? '').split(pathSeparator).filter(Boolean)) {
    for (const name of names) {
      const candidate = join(directory, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function resolveRuntime(id) {
  if (id === 'node' && !process.versions.bun && /(?:^|[\\/])node(?:\.exe)?$/iu.test(process.execPath)) {
    return { id, executable: process.execPath };
  }
  const executable = findOnPath(id);
  if (!executable) throw new Error(`Could not find ${id}; set NARADA_${id.toUpperCase()}_EXECUTABLE`);
  return { id, executable };
}

function tail(value, limit = 1200) {
  const text = String(value ?? '').trim();
  return text.length > limit ? text.slice(-limit) : text;
}

function parseWorkerJson(stdout, runtimeId) {
  const lines = String(stdout ?? '').trim().split(/\r?\n/u).reverse();
  for (const line of lines) {
    if (!line.trim().startsWith('{')) continue;
    try {
      return JSON.parse(line);
    } catch {
      // Keep looking in case a runtime printed a diagnostic line after JSON.
    }
  }
  throw new Error(`${runtimeId} worker did not emit JSON`);
}

function runWorker(runtime, options) {
  const result = spawnSync(runtime.executable, [
    workerPath,
    '--worker',
    '--warmup', String(options.warmup),
    '--samples', String(options.samples),
  ], {
    cwd: workerCwd,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 180_000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${runtime.id} worker failed (status=${result.status ?? 'unknown'}): ${tail(result.error?.message ?? result.stderr ?? result.stdout)}`);
  }
  return parseWorkerJson(result.stdout, runtime.id);
}

function runCliOnce(runtime) {
  const result = spawnSync(runtime.executable, [cliEntrypoint, '--version'], {
    cwd: cliRoot,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30_000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${runtime.id} CLI startup failed (status=${result.status ?? 'unknown'}): ${tail(result.error?.message ?? result.stderr ?? result.stdout)}`);
  }
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

function summarize(values) {
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance = values.reduce((total, value) => total + ((value - mean) ** 2), 0) / values.length;
  return {
    runs: values.length,
    mean_ms: mean,
    median_ms: percentile(values, 0.5),
    p95_ms: percentile(values, 0.95),
    p99_ms: percentile(values, 0.99),
    stddev_ms: Math.sqrt(variance),
    min_ms: Math.min(...values),
    max_ms: Math.max(...values),
    ops_per_second: 1000 / mean,
  };
}

function measureCliStartup(runtime, options) {
  for (let index = 0; index < options.warmup; index += 1) runCliOnce(runtime);
  const samples = [];
  for (let index = 0; index < options.samples; index += 1) {
    const started = performance.now();
    runCliOnce(runtime);
    samples.push(performance.now() - started);
  }
  return {
    name: 'cli-version-startup',
    description: 'Fresh child-process startup of the same built CLI artifact with --version.',
    samples_ms: samples,
    ...summarize(samples),
  };
}

function gitRevision() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : null;
}

function aggregateCase(name, description, samples) {
  return {
    name,
    description,
    samples_ms: samples,
    ...summarize(samples),
  };
}

function makeRuntimeReports(records, runtimes) {
  const reports = {};
  for (const runtime of runtimes) {
    const runtimeRecords = records.filter((record) => record.runtime.id === runtime.id);
    const workerResults = new Map();
    for (const record of runtimeRecords) {
      for (const result of record.worker.results) {
        const current = workerResults.get(result.name) ?? { description: result.description, samples: [] };
        current.samples.push(...result.samples_ms);
        workerResults.set(result.name, current);
      }
    }
    const cases = {};
    for (const [name, value] of workerResults) cases[name] = aggregateCase(name, value.description, value.samples);
    if (runtimeRecords.some((record) => record.cli)) {
      const cliSamples = runtimeRecords.flatMap((record) => record.cli.samples_ms);
      cases['cli-version-startup'] = aggregateCase(
        'cli-version-startup',
        runtimeRecords.find((record) => record.cli)?.cli.description,
        cliSamples,
      );
    }
    reports[runtime.id] = {
      runtime: runtimeRecords[0]?.worker.runtime ?? null,
      cases,
    };
  }
  return reports;
}

function makeComparisons(reports) {
  const names = [...new Set([
    ...Object.keys(reports.node?.cases ?? {}),
    ...Object.keys(reports.bun?.cases ?? {}),
  ])].sort();
  return names.map((name) => {
    const node = reports.node?.cases[name] ?? null;
    const bun = reports.bun?.cases[name] ?? null;
    if (!node || !bun) return { name, status: 'unavailable', node, bun };
    const bunVsNodeMedianPercent = ((bun.median_ms - node.median_ms) / node.median_ms) * 100;
    return {
      name,
      status: 'complete',
      node_median_ms: node.median_ms,
      bun_median_ms: bun.median_ms,
      bun_vs_node_median_percent: bunVsNodeMedianPercent,
      node_to_bun_speedup: node.median_ms / bun.median_ms,
      median_winner: bun.median_ms < node.median_ms ? 'bun' : bun.median_ms > node.median_ms ? 'node' : 'tie',
    };
  });
}

function formatMs(value) {
  return value === undefined || value === null ? 'n/a' : `${value.toFixed(3)} ms`;
}

function renderMarkdown(report) {
  const lines = [
    '# Node vs Bun Runtime Benchmark',
    '',
    `Generated: ${report.generated_at}`,
    `Commit: ${report.commit ?? 'unknown'}`,
    `Host: ${report.host.platform}/${report.host.arch}, ${report.host.cpu_count} logical CPUs`,
    '',
    'Positive “Bun vs Node” percentages mean Bun took longer by median; speedup is Node median divided by Bun median.',
    '',
    '| Case | Node median | Bun median | Bun vs Node | Speedup | Median winner |',
    '| --- | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const comparison of report.comparisons) {
    if (comparison.status !== 'complete') {
      lines.push(`| ${comparison.name} | unavailable | unavailable | n/a | n/a | n/a |`);
      continue;
    }
    lines.push(`| ${comparison.name} | ${formatMs(comparison.node_median_ms)} | ${formatMs(comparison.bun_median_ms)} | ${comparison.bun_vs_node_median_percent.toFixed(1)}% | ${comparison.node_to_bun_speedup.toFixed(2)}x | ${comparison.median_winner} |`);
  }
  lines.push('', '## Method', '', `- Warmup runs per process: ${report.method.warmup_runs}`, `- Measured samples per process: ${report.method.samples_per_process}`, `- Independent process repetitions: ${report.method.repeats}`, '- Raw samples are retained in the JSON report; no outliers are silently discarded.', '');
  return lines.join('\n');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(workerPath)) throw new Error(`Benchmark worker is missing: ${workerPath}`);
  if (!options.skipCli && !existsSync(cliEntrypoint)) {
    throw new Error(`Built CLI is missing: ${cliEntrypoint}. Build @narada-core/cli first or pass --skip-cli.`);
  }
  const runtimes = [resolveRuntime('node'), resolveRuntime('bun')];
  const records = [];
  for (let repeat = 0; repeat < options.repeats; repeat += 1) {
    const order = repeat % 2 === 0 ? runtimes : [...runtimes].reverse();
    for (const runtime of order) {
      console.error(`repeat ${repeat + 1}/${options.repeats}: ${runtime.id}`);
      const worker = runWorker(runtime, options);
      const cli = options.skipCli ? null : measureCliStartup(runtime, options);
      records.push({ repeat, runtime, worker, cli });
    }
  }

  const reports = makeRuntimeReports(records, runtimes);
  const report = {
    schema: 'narada.runtime_benchmark.v1',
    generated_at: new Date().toISOString(),
    commit: gitRevision(),
    host: {
      platform: process.platform,
      arch: process.arch,
      cpu_count: os.cpus().length,
      total_memory_mb: Math.round(os.totalmem() / 1024 / 1024),
    },
    method: {
      warmup_runs: options.warmup,
      samples_per_process: options.samples,
      repeats: options.repeats,
      cli_case_included: !options.skipCli,
      order: 'alternates Node/Bun first across repetitions',
    },
    runtimes: reports,
    comparisons: makeComparisons(reports),
  };
  mkdirSync(dirname(options.output), { recursive: true });
  writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const markdownPath = options.output.replace(/\.json$/iu, '.md');
  writeFileSync(markdownPath, `${renderMarkdown(report)}\n`, 'utf8');
  console.log(`JSON report: ${options.output}`);
  console.log(`Markdown report: ${markdownPath}`);
  for (const comparison of report.comparisons) {
    if (comparison.status === 'complete') {
      console.log(`${comparison.name}: Node ${formatMs(comparison.node_median_ms)}, Bun ${formatMs(comparison.bun_median_ms)}, Bun vs Node ${comparison.bun_vs_node_median_percent.toFixed(1)}%`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
