import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type {
  OperatorSiteAgentLaunchFailurePhase,
  OperatorSiteAgentLaunchFailureWireRecord,
} from '@narada2/operator-console-contract';
import { redactWorkspaceLaunchText } from './workspace-launch-process.js';

export interface SiteAgentLaunchFailureContext {
  exit_code?: number;
  workspace_result_path?: string | null;
}

export interface SiteAgentLaunchFailureInput {
  requestId: string;
  siteId: string;
  agentId: string;
  phase: OperatorSiteAgentLaunchFailurePhase;
  code: string;
  error?: unknown;
  message?: string;
  context?: SiteAgentLaunchFailureContext;
}

export interface SiteAgentLaunchDiagnostics {
  recordFailure(input: SiteAgentLaunchFailureInput): Promise<{
    failure: OperatorSiteAgentLaunchFailureWireRecord;
    artifactPath: string | null;
  }>;
}

export interface SiteAgentLaunchDiagnosticsOptions {
  root?: string;
  now?: () => number;
  maxArtifacts?: number;
  maxAgeMs?: number;
  log?: (line: string) => void;
}

export const SITE_AGENT_LAUNCH_FAILURE_ARTIFACT_SCHEMA = 'narada.operator_console.agent_launch_failure.v1' as const;
export const SITE_AGENT_LAUNCH_FAILURE_MAX_ARTIFACTS = 100;
export const SITE_AGENT_LAUNCH_FAILURE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function defaultRoot(): string {
  const userSiteRoot = process.env.NARADA_USER_SITE_ROOT ?? join(homedir(), 'Narada');
  return resolve(userSiteRoot, '.narada', 'runtime', 'operator-console', 'site-agent-launch-failures');
}

function sanitize(value: string, limit = 1_000): string {
  return redactWorkspaceLaunchText(value).slice(0, limit);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function errorDetails(error: unknown, fallback: string): {
  name: string;
  message: string;
  stack: string | null;
} {
  if (error instanceof Error) {
    return {
      name: sanitize(error.name, 200),
      message: sanitize(error.message || fallback),
      stack: error.stack ? sanitize(error.stack, 2_000) : null,
    };
  }
  if (isRecord(error)) {
    const message = typeof error.message === 'string' ? error.message : fallback;
    const stack = typeof error.stack === 'string' ? error.stack : null;
    return {
      name: typeof error.name === 'string' ? sanitize(error.name, 200) : 'UnknownError',
      message: sanitize(message),
      stack: stack ? sanitize(stack, 2_000) : null,
    };
  }
  return { name: 'UnknownError', message: sanitize(fallback), stack: null };
}

async function writeJsonAtomically(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, 'utf8');
  await rename(temporary, path);
}

async function pruneArtifacts(root: string, nowMs: number, maxArtifacts: number, maxAgeMs: number): Promise<void> {
  const entries = await readdir(root).catch(() => [] as string[]);
  const candidates = await Promise.all(entries
    .filter((entry) => entry.endsWith('.json'))
    .map(async (entry) => {
      const path = join(root, entry);
      const metadata = await stat(path).catch(() => null);
      return metadata ? { path, mtimeMs: metadata.mtimeMs } : null;
    }));
  const files = candidates.filter((entry): entry is { path: string; mtimeMs: number } => entry !== null)
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  const cutoff = nowMs - maxAgeMs;
  await Promise.all(files
    .filter((entry, index) => index >= maxArtifacts || entry.mtimeMs < cutoff)
    .map((entry) => unlink(entry.path).catch(() => undefined)));
}

export function createSiteAgentLaunchDiagnostics(
  options: SiteAgentLaunchDiagnosticsOptions = {},
): SiteAgentLaunchDiagnostics {
  const root = resolve(options.root ?? defaultRoot());
  const now = options.now ?? Date.now;
  const maxArtifacts = Math.max(1, options.maxArtifacts ?? SITE_AGENT_LAUNCH_FAILURE_MAX_ARTIFACTS);
  const maxAgeMs = Math.max(0, options.maxAgeMs ?? SITE_AGENT_LAUNCH_FAILURE_MAX_AGE_MS);
  const log = options.log ?? ((line: string) => console.error(line));

  return {
    async recordFailure(input) {
      const fallbackMessage = input.message ?? input.code;
      const details = errorDetails(input.error, fallbackMessage);
      const message = sanitize(input.message ?? details.message);
      const failureBase = {
        phase: input.phase,
        code: input.code,
        message,
      } satisfies Omit<OperatorSiteAgentLaunchFailureWireRecord, 'diagnostic_ref'>;
      const occurredAt = new Date(now()).toISOString();
      const artifactName = `failure-${now()}-${input.requestId}-${randomUUID()}.json`;
      const artifactPath = join(root, artifactName);
      const failureWithRef: OperatorSiteAgentLaunchFailureWireRecord = {
        ...failureBase,
        diagnostic_ref: artifactPath,
      };
      const artifact = {
        schema: SITE_AGENT_LAUNCH_FAILURE_ARTIFACT_SCHEMA,
        request_id: input.requestId,
        site_id: input.siteId,
        agent_id: input.agentId,
        occurred_at: occurredAt,
        failure: failureWithRef,
        error: details,
        context: {
          exit_code: input.context?.exit_code ?? null,
          workspace_result_path: input.context?.workspace_result_path
            ? sanitize(input.context.workspace_result_path, 500)
            : null,
        },
      };

      let savedPath: string | null = null;
      try {
        await writeJsonAtomically(artifactPath, artifact);
        savedPath = artifactPath;
        await pruneArtifacts(root, now(), maxArtifacts, maxAgeMs);
      } catch (writeError) {
        const writeDetails = errorDetails(writeError, 'Unable to persist launch failure diagnostics.');
        log(JSON.stringify({
          event: 'operator_console_agent_launch_diagnostics_write_failed',
          request_id: input.requestId,
          site_id: input.siteId,
          agent_id: input.agentId,
          code: input.code,
          message: writeDetails.message,
        }));
      }

      const failure = savedPath ? failureWithRef : { ...failureBase, diagnostic_ref: null };
      log(JSON.stringify({
        event: 'operator_console_agent_launch_failed',
        request_id: input.requestId,
        site_id: input.siteId,
        agent_id: input.agentId,
        phase: input.phase,
        code: input.code,
        message,
        diagnostic_ref: failure.diagnostic_ref,
      }));
      return { failure, artifactPath: savedPath };
    },
  };
}
