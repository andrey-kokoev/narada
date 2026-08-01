import type { CommandContext } from '../lib/command-wrapper.js';
import {
  ensureOperatorConsoleMirror,
  operatorConsoleMirrorStatus,
  restartOperatorConsoleMirror,
  rotateOperatorConsoleMirrorCredentials,
  runOperatorConsoleMirror,
  stopOperatorConsoleMirror,
  type OperatorConsoleMirrorOptions,
} from '@narada-core/operator-console-mirror-runtime';

export interface ConsoleMirrorCommandOptions extends OperatorConsoleMirrorOptions {
  run_nonce?: string;
}

export function consoleMirrorRuntimeOptions(options: ConsoleMirrorCommandOptions): OperatorConsoleMirrorOptions {
  return {
    host: options.host,
    gateway_port: options.gateway_port,
    router_url: options.router_url,
    router_state_root: options.router_state_root,
    router_token: options.router_token,
    bridge_token: options.bridge_token,
    cloudflared_binary: options.cloudflared_binary,
    wrangler_binary: options.wrangler_binary,
    tunnel_runner: options.tunnel_runner,
    tunnel_token: options.tunnel_token,
    tunnel_token_file: options.tunnel_token_file,
    tunnel_name: options.tunnel_name,
    cloudflared_config: options.cloudflared_config,
    metrics_host: options.metrics_host,
    metrics_port: options.metrics_port,
    public_origin: options.public_origin,
    state_root: options.state_root,
    cli_entrypoint: options.cli_entrypoint,
    narada_root: options.narada_root,
    log_path: options.log_path,
    timeout_ms: options.timeout_ms,
    operation: options.operation,
  };
}

export async function consoleMirrorStartCommand(
  options: ConsoleMirrorCommandOptions,
  _context: CommandContext,
): Promise<unknown> {
  return await ensureOperatorConsoleMirror(consoleMirrorRuntimeOptions(options));
}

export async function consoleMirrorStatusCommand(
  options: ConsoleMirrorCommandOptions,
  _context: CommandContext,
): Promise<unknown> {
  return await operatorConsoleMirrorStatus({ state_root: options.state_root, timeout_ms: options.timeout_ms });
}

export async function consoleMirrorRestartCommand(
  options: ConsoleMirrorCommandOptions,
  _context: CommandContext,
): Promise<unknown> {
  return await restartOperatorConsoleMirror(consoleMirrorRuntimeOptions(options));
}

export async function consoleMirrorStopCommand(
  options: ConsoleMirrorCommandOptions,
  _context: CommandContext,
): Promise<unknown> {
  return await stopOperatorConsoleMirror({ state_root: options.state_root, timeout_ms: options.timeout_ms });
}

export async function consoleMirrorRotateCommand(
  options: ConsoleMirrorCommandOptions,
  _context: CommandContext,
): Promise<unknown> {
  return await rotateOperatorConsoleMirrorCredentials(consoleMirrorRuntimeOptions(options));
}

export async function consoleMirrorRunCommand(
  options: ConsoleMirrorCommandOptions,
  _context: CommandContext,
): Promise<void> {
  await runOperatorConsoleMirror(consoleMirrorRuntimeOptions(options));
}
