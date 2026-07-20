import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { OperatorSiteAgentLaunchWireResponse } from '@narada2/operator-console-contract';

interface AdmissionLease {
  token: string;
  acquired_at_ms: number;
}

interface AdmissionResult {
  token: string;
  completed_at_ms: number;
  reusable_until_ms: number | null;
  result: OperatorSiteAgentLaunchWireResponse;
}

export interface SiteAgentLaunchAdmission {
  run(
    canonicalKey: string,
    operation: () => Promise<OperatorSiteAgentLaunchWireResponse>,
  ): Promise<OperatorSiteAgentLaunchWireResponse>;
}

export interface SiteAgentLaunchAdmissionOptions {
  root?: string;
  now?: () => number;
  pollMs?: number;
  leaseMs?: number;
  successReuseMs?: number;
}

const DEFAULT_POLL_MS = 25;
const DEFAULT_LEASE_MS = 2 * 60 * 1000;
const DEFAULT_SUCCESS_REUSE_MS = 2 * 60 * 1000;

function defaultRoot(): string {
  const userSiteRoot = process.env.NARADA_USER_SITE_ROOT ?? join(homedir(), 'Narada');
  return resolve(userSiteRoot, '.narada', 'runtime', 'operator-console', 'site-agent-launch-admissions');
}

function fileStem(canonicalKey: string): string {
  return createHash('sha256').update(canonicalKey.toLowerCase()).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function readJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

function parseLease(value: unknown): AdmissionLease | null {
  if (!isRecord(value) || typeof value.token !== 'string' || typeof value.acquired_at_ms !== 'number') return null;
  return { token: value.token, acquired_at_ms: value.acquired_at_ms };
}

function parseResult(value: unknown): AdmissionResult | null {
  if (!isRecord(value)
    || typeof value.token !== 'string'
    || typeof value.completed_at_ms !== 'number'
    || (value.reusable_until_ms !== null && typeof value.reusable_until_ms !== 'number')
    || !isRecord(value.result)) return null;
  return value as unknown as AdmissionResult;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function removeIfPresent(path: string): Promise<void> {
  await unlink(path).catch(() => undefined);
}

async function writeJsonAtomically(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, 'utf8');
  await rename(temporary, path);
}

export function createSiteAgentLaunchAdmission(
  options: SiteAgentLaunchAdmissionOptions = {},
): SiteAgentLaunchAdmission {
  const root = resolve(options.root ?? defaultRoot());
  const now = options.now ?? Date.now;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
  const successReuseMs = options.successReuseMs ?? DEFAULT_SUCCESS_REUSE_MS;

  return {
    async run(canonicalKey, operation) {
      await mkdir(root, { recursive: true });
      const stem = fileStem(canonicalKey);
      const leasePath = join(root, `${stem}.lease.json`);
      const resultPath = join(root, `${stem}.result.json`);

      const reusable = parseResult(await readJson(resultPath));
      if (reusable && reusable.reusable_until_ms !== null && reusable.reusable_until_ms > now()) {
        return reusable.result;
      }

      for (;;) {
        const token = randomUUID();
        try {
          const handle = await open(leasePath, 'wx');
          try {
            await handle.writeFile(`${JSON.stringify({ token, acquired_at_ms: now() } satisfies AdmissionLease)}\n`, 'utf8');
          } catch (error) {
            await removeIfPresent(leasePath);
            throw error;
          } finally {
            await handle.close();
          }
          await removeIfPresent(resultPath);
          try {
            const result = await operation();
            const reusableUntil = result.status === 'launched' || result.status === 'reused'
              ? now() + successReuseMs
              : null;
            await writeJsonAtomically(resultPath, {
              token,
              completed_at_ms: now(),
              reusable_until_ms: reusableUntil,
              result,
            } satisfies AdmissionResult);
            return result;
          } finally {
            await removeIfPresent(leasePath);
          }
        } catch (error) {
          if (!isRecord(error) || error.code !== 'EEXIST') throw error;
        }

        const observedLease = parseLease(await readJson(leasePath));
        if (!observedLease) {
          await sleep(pollMs);
          continue;
        }
        for (;;) {
          const shared = parseResult(await readJson(resultPath));
          if (shared?.token === observedLease.token) return shared.result;
          if (now() - observedLease.acquired_at_ms >= leaseMs) {
            const currentLease = parseLease(await readJson(leasePath));
            if (currentLease?.token === observedLease.token) await removeIfPresent(leasePath);
            break;
          }
          const currentLease = parseLease(await readJson(leasePath));
          if (!currentLease && !shared) break;
          await sleep(pollMs);
        }
      }
    },
  };
}
