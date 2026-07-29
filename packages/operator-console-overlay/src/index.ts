type AnyRecord = Record<string, any>;

import { fileURLToPath } from 'node:url';
import { DEFAULT_OPERATOR_ROUTER_PORT } from '@narada2/operator-router';
import { OPERATOR_CONSOLE_PATH } from '@narada2/operator-console-contract';
import { ensureOperatorConsoleRuntime } from '@narada2/operator-console-runtime';
import {
  createOverlayDocument,
  requestOverlayRefresh,
  startOverlay,
  stopOverlay,
  inspectOverlay,
} from '@narada2/window-overlay-core';

export const OPERATOR_CONSOLE_OVERLAY_ID = 'operator-console';

function isLoopbackHost(hostname: string): boolean {
  return ['127.0.0.1', 'localhost', '::1'].includes(String(hostname).replace(/^\[|\]$/g, '').toLowerCase());
}

function resolveConsoleRoutesUrl(consoleUrl: string): string {
  return new URL(OPERATOR_CONSOLE_PATH, `${consoleUrl}/`).toString();
}

function resolveCliEntrypoint(env: AnyRecord): string {
  if (env.NARADA_CLI_ENTRYPOINT) return env.NARADA_CLI_ENTRYPOINT;
  const currentEntrypoint = process.argv[1];
  if (currentEntrypoint && /[\\/]cli[\\/](?:dist|src)[\\/]main\.js$/i.test(currentEntrypoint)) {
    return currentEntrypoint;
  }
  return fileURLToPath(new URL('../../layers/cli/dist/main.js', import.meta.url));
}

function resolveLocalConsoleRestart({ consoleUrl, env = process.env }: AnyRecord = {}): AnyRecord | null {
  const parsed = new URL(consoleUrl);
  if (!isLoopbackHost(parsed.hostname)) return null;
  const cliEntrypoint = resolveCliEntrypoint(env);
  const naradaRoot = env.NARADA_ROOT
    || fileURLToPath(new URL('../../..', import.meta.url));
  return {
    command: [
      process.execPath,
      cliEntrypoint,
      'console',
      'restart',
      '--host',
      parsed.hostname,
      '--port',
      parsed.port || String(DEFAULT_OPERATOR_ROUTER_PORT),
      '--no-open',
    ],
    workingDirectory: naradaRoot,
  };
}

function resolveConsoleUrl({ url, env = process.env }: AnyRecord = {}): string {
  const configured = url || env.NARADA_OPERATOR_CONSOLE_URL || env.NARADA_OPERATOR_ROUTER_URL;
  if (configured) {
    const parsed = new URL(configured);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('operator_console_overlay_url_scheme_invalid');
    return parsed.toString().replace(/\/$/, '');
  }
  const host = env.NARADA_OPERATOR_CONSOLE_HOST || '127.0.0.1';
  const port = env.NARADA_OPERATOR_CONSOLE_PORT || String(DEFAULT_OPERATOR_ROUTER_PORT);
  return 'http://' + host + ':' + port;
}

export function operatorConsoleUrl(options: AnyRecord = {}): string {
  return resolveConsoleUrl(options);
}

export function createOperatorConsoleOverlayDocument({
  url,
  title = 'Narada Operator Console',
  subtitle,
  rows = [],
  env = process.env,
}: AnyRecord = {}): AnyRecord {
  const consoleUrl = resolveConsoleUrl({ url, env });
  const restart = resolveLocalConsoleRestart({ consoleUrl, env });
  return createOverlayDocument({
    id: OPERATOR_CONSOLE_OVERLAY_ID,
    title,
    title_tone: 'accent',
    subtitle: subtitle || consoleUrl,
    rows: [
      { label: 'Workspace', value: consoleUrl, kind: 'open_url', target: consoleUrl },
      { label: 'Console routes', value: OPERATOR_CONSOLE_PATH, kind: 'open_url', target: resolveConsoleRoutesUrl(consoleUrl) },
      ...rows,
    ],
    actions: [
      { id: 'open-console', label: 'Open console', icon: '↗', tooltip: 'Open console', kind: 'open_url', tone: 'accent', target: consoleUrl },
      ...(restart ? [{ id: 'restart-console', label: 'Restart console', icon: '↻', tooltip: 'Restart console', kind: 'restart' }] : []),
      { id: 'refresh', label: 'Refresh', icon: '⟳', tooltip: 'Refresh overlay', kind: 'refresh' },
    ],
  } as any);
}

export async function startOperatorConsoleOverlay({
  url, title, subtitle, rows, stateRoot, visibilityPolicy = 'windows-terminal', refreshSeconds = 2, env = process.env,
  ensure_runtime = ensureOperatorConsoleRuntime,
  start_overlay = startOverlay,
}: AnyRecord = {}): Promise<any> {
  const consoleUrl = resolveConsoleUrl({ url, env });
  const restart = resolveLocalConsoleRestart({ consoleUrl, env });
  const parsed = new URL(consoleUrl);
  const runtime = restart
    ? await ensure_runtime({
        host: parsed.hostname,
        port: Number.parseInt(parsed.port || String(DEFAULT_OPERATOR_ROUTER_PORT), 10),
        router_state_root: env.NARADA_OPERATOR_ROUTER_STATE_ROOT,
        runtime_state_root: env.NARADA_OPERATOR_CONSOLE_RUNTIME_STATE_ROOT,
        narada_root: env.NARADA_ROOT,
        cli_entrypoint: resolveCliEntrypoint(env),
      })
    : {
        status: 'external_unverified',
        url: consoleUrl,
        reason: 'remote_operator_console_url',
      };
  const overlay = await start_overlay({
    id: OPERATOR_CONSOLE_OVERLAY_ID,
    document: createOperatorConsoleOverlayDocument({ url: consoleUrl, title, subtitle, rows, env }),
    stateRoot, visibilityPolicy, refreshSeconds, env,
    restartCommand: restart?.command,
    restartWorkingDirectory: restart?.workingDirectory,
    restartSuccessProbeUrl: restart ? new URL('/health', consoleUrl).toString() : undefined,
  } as any);
  return { ...overlay, runtime };
}

export function stopOperatorConsoleOverlay({ stateRoot, env = process.env }: AnyRecord = {}): any {
  return stopOverlay({ id: OPERATOR_CONSOLE_OVERLAY_ID, stateRoot, env });
}
export function inspectOperatorConsoleOverlay({ stateRoot, env = process.env }: AnyRecord = {}): any {
  return inspectOverlay({ id: OPERATOR_CONSOLE_OVERLAY_ID, stateRoot, env });
}
export function refreshOperatorConsoleOverlay({ stateRoot, env = process.env }: AnyRecord = {}): any {
  return requestOverlayRefresh(OPERATOR_CONSOLE_OVERLAY_ID, { stateRoot, env });
}
