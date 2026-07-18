import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_OPERATOR_ROUTER_PORT } from '@narada2/operator-router';
import type { CommandContext } from '../lib/command-wrapper.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import { runSiteCliCommandAsync } from '../lib/launcher-runtime-site-command.js';
import { getSchedulerSiteDaemonStatus } from '../lib/launcher-runtime-scheduler.js';

export interface SitesLaunchOptions {
  siteId: string;
  dryRun?: boolean;
  format?: CliFormat;
  verbose?: boolean;
}

type LaunchCheckStatus = 'pass' | 'warn' | 'fail' | 'planned' | 'skipped';

interface SiteLaunchCheck {
  id: string;
  status: LaunchCheckStatus;
  summary: string;
  detail?: string;
  next_command?: string;
}

interface SiteLoopDeclaration {
  loop_id?: string;
  resident?: { agent_id?: string; role?: string } | null;
  resident_launch?: { materialization_command?: string; runtime?: string } | null;
  scheduler?: { default_task_name?: string } | null;
}

type SiteLoopDeclarationRead =
  | { kind: 'none' }
  | { kind: 'invalid'; detail: string }
  | { kind: 'ok'; declaration: SiteLoopDeclaration };

interface McpFabricValidation {
  status?: string;
  expected_count?: number;
  missing?: unknown[];
  unexpected?: unknown[];
  server_name_mismatches?: unknown[];
}

interface McpFabricModule {
  loadSiteMcpFabric: (
    siteRoot: string,
    options?: { required?: boolean; validateRegistry?: boolean | 'diagnostic' },
  ) => {
    servers?: Record<string, unknown>;
    registry_validation?: McpFabricValidation;
  };
}

const SITE_LOOP_CONFIG_RELATIVE_PATH = join('.narada', 'capabilities', 'site-loop-config.json');

/**
 * Ensure a Site's declared runtime posture: resolve the Site, report MCP
 * surface materialization drift, ensure the resident carrier when a loop
 * declares one, check scheduler posture, and report the console URL.
 * Plan-first: --dry-run performs no mutation.
 *
 * The resident ensure intentionally reuses the `site-loop recover` idiom:
 * one bounded site-loop pass (`loop run <id> --once --ensure-resident`), not a
 * narrow carrier-only ensure. Labels below say so explicitly.
 *
 * All Site CLI calls use the async exec path so HTTP handlers (console launch
 * route) never block the event loop.
 *
 * Decision: .ai/decisions/20260718-2038-launcher-realignment-single-agent-and-site-level.md
 */
export async function sitesLaunchCommand(
  options: SitesLaunchOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const dryRun = options.dryRun === true;
  const checks: SiteLaunchCheck[] = [];
  const actions: string[] = [];
  const details: Record<string, unknown> = {};
  let mutationObserved = false;

  // 1. Resolve the Site record (id or alias) from the User Site registry.
  const resolution = await resolveSiteRecord(options.siteId);
  if (!resolution.record) {
    checks.push(resolution.error
      ? {
          id: 'site_resolution',
          status: 'fail',
          summary: 'Site registry could not be read',
          detail: resolution.error,
        }
      : {
          id: 'site_resolution',
          status: 'fail',
          summary: `Site not found in the User Site registry: ${options.siteId}`,
          next_command: 'narada sites list',
        });
    return finalize(options, checks, actions, details, null, null, mutationObserved);
  }
  const record = resolution.record;
  const siteRoot = record.siteRoot;
  checks.push({
    id: 'site_resolution',
    status: 'pass',
    summary: `Resolved ${record.siteId} -> ${siteRoot}`,
  });
  if (!existsSync(siteRoot)) {
    checks.push({
      id: 'site_root',
      status: 'fail',
      summary: `Site root does not exist: ${siteRoot}`,
      next_command: `narada sites registry show ${record.siteId}`,
    });
    return finalize(options, checks, actions, details, record, null, mutationObserved);
  }

  // 2. MCP surface materialization drift (read-only).
  const fabricCheck = await checkMcpFabricMaterialization(siteRoot);
  checks.push(fabricCheck.check);
  if (options.verbose && fabricCheck.validation) {
    details.mcp_fabric_validation = fabricCheck.validation;
  }

  // 3. Site loop / resident declaration.
  const declarationRead = readSiteLoopDeclaration(siteRoot);
  const declaration = declarationRead.kind === 'ok' ? declarationRead.declaration : null;
  if (declarationRead.kind === 'none') {
    checks.push({
      id: 'site_loop_declaration',
      status: 'skipped',
      summary: 'No site loop declared (no .narada/capabilities/site-loop-config.json)',
    });
  } else if (declarationRead.kind === 'invalid') {
    checks.push({
      id: 'site_loop_declaration',
      status: 'warn',
      summary: 'site-loop-config.json is not valid JSON; loop/resident/scheduler posture cannot be evaluated',
      detail: declarationRead.detail,
    });
  } else {
    checks.push({
      id: 'site_loop_declaration',
      status: 'pass',
      summary: `Site loop declared: ${declaration!.loop_id ?? 'unknown loop'}`,
      detail: declaration!.resident
        ? `resident: ${declaration!.resident.agent_id ?? 'declared'}`
        : 'no resident carrier declared',
    });
  }

  // 4. Resident carrier ensure: one bounded site-loop pass (mutating; planned under --dry-run).
  const residentDeclared = Boolean(declaration?.resident ?? declaration?.resident_launch);
  if (declaration && residentDeclared) {
    const loopId = declaration.loop_id ?? 'default';
    if (dryRun) {
      checks.push({
        id: 'resident_ensure',
        status: 'planned',
        summary: `Would ensure resident carrier by running one bounded site-loop pass: loop run ${loopId} --once --ensure-resident`,
      });
      actions.push(`planned: loop run ${loopId} --once --ensure-resident`);
    } else {
      const ensure = await runSiteCliCommandAsync(siteRoot, ['loop', 'run', loopId, '--once', '--ensure-resident']);
      if (options.verbose) details.resident_ensure = ensure;
      if (ensure.mutation_performed) mutationObserved = true;
      if (ensure.status === 'not_available') {
        checks.push({
          id: 'resident_ensure',
          status: 'warn',
          summary: 'Site CLI not available; resident ensure skipped',
          detail: ensure.error,
        });
      } else if (ensure.status === 'success') {
        actions.push(`ensured resident carrier via one bounded site-loop pass: loop run ${loopId} --once --ensure-resident`);
        const health = await runSiteCliCommandAsync(siteRoot, ['loop', 'health']);
        if (options.verbose) details.loop_health = health;
        checks.push({
          id: 'resident_ensure',
          status: health.status === 'success' ? 'pass' : 'warn',
          summary: health.status === 'success'
            ? 'Resident carrier ensured; loop health ok'
            : 'Resident ensure ran but loop health did not report success',
          detail: health.status === 'success' ? undefined : (health.error ?? health.status),
        });
      } else {
        checks.push({
          id: 'resident_ensure',
          status: 'fail',
          summary: `Resident ensure failed: loop run ${loopId} --once --ensure-resident`,
          detail: ensure.error ?? ensure.status,
        });
      }
    }
  }

  // 5. Scheduler posture (read-only).
  if (declaration?.scheduler) {
    const taskName = declaration.scheduler.default_task_name;
    const scheduler = getSchedulerSiteDaemonStatus({ siteRoot, ...(taskName ? { taskName } : {}) });
    if (options.verbose) details.scheduler = scheduler;
    const resolvedTaskName = scheduler.task_name ?? taskName ?? 'site daemon task';
    if (scheduler.status === 'ok') {
      checks.push({
        id: 'scheduler_posture',
        status: 'pass',
        summary: `Scheduled task present: ${resolvedTaskName}`,
      });
    } else if (scheduler.status === 'not_found') {
      checks.push({
        id: 'scheduler_posture',
        status: 'warn',
        summary: `Declared scheduled task not installed: ${resolvedTaskName}`,
        next_command: `narada scheduler site-daemon install --site-root "${siteRoot}" --task-name "${resolvedTaskName}" --execute`,
      });
    } else {
      checks.push({
        id: 'scheduler_posture',
        status: 'warn',
        summary: `Scheduler posture could not be verified (${scheduler.status})`,
        detail: scheduler.error,
      });
    }
  }

  return finalize(options, checks, actions, details, record, declaration, mutationObserved);
}

function finalize(
  options: SitesLaunchOptions,
  checks: SiteLaunchCheck[],
  actions: string[],
  details: Record<string, unknown>,
  record: { siteId: string; siteRoot: string } | null,
  declaration: SiteLoopDeclaration | null,
  mutationObserved: boolean,
): { exitCode: ExitCode; result: unknown } {
  const dryRun = options.dryRun === true;
  const failed = checks.some((check) => check.status === 'fail');
  const warned = checks.some((check) => check.status === 'warn');
  const status = failed ? 'failed' : dryRun ? 'dry_run' : warned ? 'degraded' : 'ok';
  const consolePort = process.env.NARADA_OPERATOR_ROUTER_PORT ?? String(DEFAULT_OPERATOR_ROUTER_PORT);
  // Configured URL only; reachability is not probed by this command.
  const consoleUrl = `http://127.0.0.1:${consolePort}/console/registry`;
  const result: Record<string, unknown> = {
    schema: 'narada.sites.launch.result.v0',
    status,
    dry_run: dryRun,
    mutation_performed: !dryRun && (mutationObserved || (!failed && actions.length > 0)),
    site_id: record?.siteId ?? options.siteId,
    site_root: record?.siteRoot ?? null,
    declaration: declaration
      ? {
          loop_id: declaration.loop_id ?? null,
          resident_declared: Boolean(declaration.resident ?? declaration.resident_launch),
          scheduler_task_name: declaration.scheduler?.default_task_name ?? null,
        }
      : null,
    checks,
    actions,
    console_url: consoleUrl,
  };
  if (options.verbose && Object.keys(details).length > 0) {
    result.details = details;
  }
  const humanLines = [
    `sites launch ${String(result.site_id)}: ${status}`,
    ...checks.map((check) => {
      const suffix = check.next_command ? ` (next: ${check.next_command})` : '';
      return `  [${check.status}] ${check.summary}${suffix}`;
    }),
    `console: ${consoleUrl} (configured; reachability not probed)`,
  ];
  return {
    exitCode: failed ? ExitCode.GENERAL_ERROR : ExitCode.SUCCESS,
    result: formattedResult(result, humanLines, options.format ?? 'auto'),
  };
}

async function resolveSiteRecord(
  reference: string,
): Promise<{ record: { siteId: string; siteRoot: string } | null; error?: string }> {
  try {
    const { resolveRegistryDbPathByLocus, openRegistryDb, SiteRegistry } = await import('@narada2/windows-site');
    const dbPath = resolveRegistryDbPathByLocus({ authorityLocus: 'user', variant: 'native' });
    const db = await openRegistryDb(dbPath);
    const registry = new SiteRegistry(db);
    try {
      const record = registry.getManagedSite(reference) ?? null;
      if (!record) return { record: null };
      return { record: { siteId: record.siteId, siteRoot: record.siteRoot } };
    } finally {
      registry.close();
    }
  } catch (error) {
    return { record: null, error: error instanceof Error ? error.message : String(error) };
  }
}

async function checkMcpFabricMaterialization(
  siteRoot: string,
): Promise<{ check: SiteLaunchCheck; validation?: McpFabricValidation }> {
  try {
    // Variable specifier keeps the untyped .mjs workspace module out of tsc resolution.
    const mcpFabricSpecifier = '@narada2/mcp-fabric';
    const { loadSiteMcpFabric } = (await import(mcpFabricSpecifier)) as McpFabricModule;
    const fabric = loadSiteMcpFabric(siteRoot, { validateRegistry: 'diagnostic' });
    const validation = fabric.registry_validation;
    const serverCount = Object.keys(fabric.servers ?? {}).length;
    if (!validation || validation.status === 'missing') {
      return {
        check: {
          id: 'mcp_surface_materialization',
          status: 'warn',
          summary: `No bound-surface registry materialization to verify (${serverCount} fabric server(s))`,
        },
        validation,
      };
    }
    if (validation.status === 'ok') {
      return {
        check: {
          id: 'mcp_surface_materialization',
          status: 'pass',
          summary: `MCP surface materialization current (${serverCount} server(s), registry ok)`,
        },
        validation,
      };
    }
    return {
      check: {
        id: 'mcp_surface_materialization',
        status: 'warn',
        summary: `MCP surface materialization drift: ${validation.missing?.length ?? 0} missing, ${validation.unexpected?.length ?? 0} unexpected, ${validation.server_name_mismatches?.length ?? 0} name mismatch(es)`,
        next_command: 'narada mcp fabric doctor',
      },
      validation,
    };
  } catch (error) {
    return {
      check: {
        id: 'mcp_surface_materialization',
        status: 'warn',
        summary: 'MCP surface materialization check could not run',
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function readSiteLoopDeclaration(siteRoot: string): SiteLoopDeclarationRead {
  const configPath = join(siteRoot, SITE_LOOP_CONFIG_RELATIVE_PATH);
  if (!existsSync(configPath)) return { kind: 'none' };
  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as SiteLoopDeclaration;
    return parsed && typeof parsed === 'object' ? { kind: 'ok', declaration: parsed } : { kind: 'none' };
  } catch (error) {
    return { kind: 'invalid', detail: error instanceof Error ? error.message : String(error) };
  }
}
