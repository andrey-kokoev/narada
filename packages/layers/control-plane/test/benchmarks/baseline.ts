/**
 * Baseline Storage and Management
 *
 * Stores benchmark results for regression detection.
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { BenchmarkResult } from './framework.js';

export interface Baseline {
  /** Version string */
  version: string;
  /** Git commit hash */
  commit: string;
  /** Timestamp when baseline was created */
  timestamp: string;
  /** Benchmark results */
  results: BenchmarkResult[];
  /** System information */
  system: {
    nodeVersion: string;
    platform: string;
    arch: string;
    cpus: number;
    totalMemoryGB: number;
  };
}

const BASELINE_DIR = join(process.cwd(), '.benchmarks', 'baselines');

/**
 * Get current git commit hash
 */
async function getGitCommit(): Promise<string> {
  try {
    const { execSync } = await import('node:child_process');
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Get current version from package.json
 */
async function getVersion(): Promise<string> {
  try {
    const packageJson = await readFile(
      join(process.cwd(), 'package.json'),
      'utf8',
    );
    const pkg = JSON.parse(packageJson);
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Get system information
 */
function getSystemInfo(): Baseline['system'] {
  return {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cpus: require('node:os').cpus().length,
    totalMemoryGB: Math.round(require('node:os').totalmem() / 1024 / 1024 / 1024),
  };
}

/**
 * Ensure baseline directory exists
 */
async function ensureBaselineDir(): Promise<void> {
  await mkdir(BASELINE_DIR, { recursive: true });
}

/**
 * Save a new baseline
 *
 * @param results - Benchmark results to save
 * @param customVersion - Optional custom version string
 */
export async function saveBaseline(
  results: BenchmarkResult[],
  customVersion?: string,
): Promise<Baseline> {
  await ensureBaselineDir();

  const baseline: Baseline = {
    version: customVersion || (await getVersion()),
    commit: await getGitCommit(),
    timestamp: new Date().toISOString(),
    results,
    system: getSystemInfo(),
  };

  const filename = `${baseline.version}.json`;
  const filepath = join(BASELINE_DIR, filename);

  await writeFile(filepath, JSON.stringify(baseline, null, 2));

  // Also save as 'latest.json' for easy access
  await writeFile(
    join(BASELINE_DIR, 'latest.json'),
    JSON.stringify(baseline, null, 2),
  );

  return baseline;
}

/**
 * Load a baseline by version
 *
 * @param version - Version string or 'latest'
 * @returns Baseline or null if not found
 */
export async function loadBaseline(version: string): Promise<Baseline | null> {
  try {
    const filename = version === 'latest' ? 'latest.json' : `${version}.json`;
    const filepath = join(BASELINE_DIR, filename);
    const content = await readFile(filepath, 'utf8');
    return JSON.parse(content) as Baseline;
  } catch {
    return null;
  }
}

/**
 * List all available baselines
 */
export async function listBaselines(): Promise<string[]> {
  try {
    const files = await readdir(BASELINE_DIR);
    return files
      .filter(f => f.endsWith('.json') && f !== 'latest.json')
      .map(f => f.replace('.json', ''));
  } catch {
    return [];
  }
}

/**
 * Compare current results with baseline
 */
export function compareWithBaseline(
  current: BenchmarkResult[],
  baseline: Baseline,
): Array<{
  name: string;
  current: number;
  baseline: number;
  changePercent: number;
  status: 'improved' | 'regressed' | 'stable';
}> {
  return current.map(curr => {
    const base = baseline.results.find(b => b.name === curr.name);

    if (!base) {
      return {
        name: curr.name,
        current: curr.meanMs,
        baseline: 0,
        changePercent: 0,
        status: 'stable',
      };
    }

    const changePercent = ((curr.meanMs - base.meanMs) / base.meanMs) * 100;

    let status: 'improved' | 'regressed' | 'stable';
    if (changePercent < -10) {
      status = 'improved';
    } else if (changePercent > 10) {
      status = 'regressed';
    } else {
      status = 'stable';
    }

    return {
      name: curr.name,
      current: curr.meanMs,
      baseline: base.meanMs,
      changePercent,
      status,
    };
  });
}

/**
 * Check if system matches baseline
 */
export function systemMatches(
  baseline: Baseline,
): { matches: boolean; differences: string[] } {
  const current = getSystemInfo();
  const differences: string[] = [];

  if (current.nodeVersion !== baseline.system.nodeVersion) {
    differences.push(
      `Node version: ${current.nodeVersion} vs ${baseline.system.nodeVersion}`,
    );
  }
  if (current.platform !== baseline.system.platform) {
    differences.push(
      `Platform: ${current.platform} vs ${baseline.system.platform}`,
    );
  }
  if (current.arch !== baseline.system.arch) {
    differences.push(`Arch: ${current.arch} vs ${baseline.system.arch}`);
  }

  return {
    matches: differences.length === 0,
    differences,
  };
}
