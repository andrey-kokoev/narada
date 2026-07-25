import { stopOperatorConsoleRuntime } from '@narada2/operator-console-runtime';

export type ConsoleProjectionStopStatus = 'not_running' | 'stopped' | 'stale_route_removed';

export interface ConsoleProjectionStopOptions {
  host?: string;
  port?: number;
  state_root?: string;
  timeout_ms?: number;
}

export interface ConsoleProjectionStopResult {
  status: ConsoleProjectionStopStatus;
  router_url: string | null;
  route_id: string;
  pid: number | null;
  detail: string;
}

/**
 * Compatibility name for callers that still describe the Console as a
 * projection. Lifecycle authority now lives in operator-console-runtime.
 */
export async function stopOperatorConsoleProjection(
  options: ConsoleProjectionStopOptions = {},
): Promise<ConsoleProjectionStopResult> {
  return stopOperatorConsoleRuntime({
    host: options.host,
    port: options.port,
    router_state_root: options.state_root,
    timeout_ms: options.timeout_ms,
  });
}
