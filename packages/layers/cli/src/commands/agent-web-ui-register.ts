import type { Command } from 'commander';
import { silentCommandContext } from '../lib/command-wrapper.js';
import { emitFiniteCommandResult, emitLongLivedCommandStartup, exitLongLivedCommandSuccessfully, resolveCommandFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import { agentWebUiAttachCommand } from './agent-web-ui.js';

export function registerAgentWebUiCommands(program: Command): void {
  const agentWebUi = program
    .command('agent-web-ui')
    .description('Browser projection for one NARS session');

  agentWebUi
    .command('attach')
    .description('Start agent-web-ui attached to a discovered NARS session')
    .option('--session <id>', 'NARS session id')
    .option('--agent <id>', 'Agent identity used to discover the live NARS session when --session is omitted')
    .option('--launch-binding <path>', 'Exact operator projection launch binding to wait on before attaching')
    .option('--site-root <path>', 'Target Site root')
    .option('--site <id>', 'Registered Site id')
    .option('--host <host>', 'Host to bind to', '127.0.0.1')
    .option('--port <port>', 'Port to bind to (0 for ephemeral)', '0')
    .option('--dry-run', 'Resolve attachment without starting the web UI', false)
    .option('--inspect-stale-session', 'Open AgentWebUI in diagnostic mode for a closed, unhealthy, or superseded NARS session', false)
    .option('--allow-stale-session', 'Deprecated alias for --inspect-stale-session', false)
    .option('--open', 'Open the web UI in the default browser after startup', true)
    .option('--no-open', 'Do not open the web UI in the default browser after startup', false)
    .option('--health-timeout-ms <ms>', 'Health probe timeout before refusing live attach', '500')
    .option('--wait-for-session-ms <ms>', 'Wait for a matching --agent NARS session to appear when --session is omitted', '0')
    .option('--cloudflare-api-base-url <url>', 'Default Cloudflare NARS projection Worker URL for local publish controls')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(async (opts: Record<string, unknown>) => {
      const result = await agentWebUiAttachCommand({
        session: opts.session as string | undefined,
        agent: opts.agent as string | undefined,
        launchBindingPath: opts.launchBinding as string | undefined,
        siteRoot: opts.siteRoot as string | undefined,
        site: opts.site as string | undefined,
        host: opts.host as string | undefined,
        port: opts.port ? Number(opts.port) : undefined,
        dryRun: opts.dryRun as boolean | undefined,
        allowStaleSession: opts.allowStaleSession as boolean | undefined,
        inspectStaleSession: opts.inspectStaleSession as boolean | undefined,
        open: opts.open as boolean | undefined,
        healthTimeoutMs: opts.healthTimeoutMs ? Number(opts.healthTimeoutMs) : undefined,
        waitForSessionMs: opts.waitForSessionMs ? Number(opts.waitForSessionMs) : undefined,
        cloudflareApiBaseUrl: opts.cloudflareApiBaseUrl as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext());
      if (opts.dryRun || result.exitCode !== ExitCode.SUCCESS) {
        emitFiniteCommandResult(result, { format: opts.format });
        return;
      }
      const formatted = formatStartedAgentWebUi(result.result);
      emitLongLivedCommandStartup([
        formatted,
        'Press Ctrl+C to stop',
      ]);
      process.on('SIGINT', () => exitLongLivedCommandSuccessfully());
    });
}

function formatStartedAgentWebUi(result: unknown): string {
  if (!result || typeof result !== 'object') return 'agent-web-ui started';
  if ('_formatted' in result) return String((result as { _formatted: unknown })._formatted);
  const plan = result as { url?: unknown; session_id?: unknown; site_id?: unknown; site_root?: unknown; event_endpoint?: unknown; health_endpoint?: unknown };
  if (typeof plan.url === 'string' && plan.url.length > 0) {
    return [
      `agent-web-ui: ${plan.url}`,
      `  Session ${typeof plan.session_id === 'string' ? plan.session_id : 'unknown'}`,
      `  Site    ${typeof plan.site_id === 'string' ? plan.site_id : (typeof plan.site_root === 'string' ? plan.site_root : 'unknown')}`,
      `  Events  ${typeof plan.event_endpoint === 'string' ? plan.event_endpoint : 'not configured'}`,
      `  Health  ${typeof plan.health_endpoint === 'string' ? `${plan.health_endpoint} via local /api/health` : 'not configured'}`,
      '  Input   session.submit/session.cancel/session.close; Cloudflare adapters translate as needed',
    ].join('\n');
  }
  return 'agent-web-ui started';
}
