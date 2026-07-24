import {
  executeOperatorProjectionOpenRequest,
  type OperatorProjectionOpenOutcome,
} from '@narada2/process-launch-posture';

export interface OperatorConsoleBrowserOptions {
  shouldOpen?: boolean;
  openUrl?: (url: string) => Promise<void> | void;
}

export async function openOperatorConsoleWorkspace(
  targetRef: string,
  options: OperatorConsoleBrowserOptions = {},
): Promise<OperatorProjectionOpenOutcome> {
  const shouldOpen = options.shouldOpen !== false;
  return await executeOperatorProjectionOpenRequest({
    projection_kind: 'browser_url',
    target_ref: targetRef,
    purpose: 'operator_console_workspace',
    caller: {
      package: '@narada2/cli',
      command: 'console serve',
      module: 'lib/operator-console-browser',
    },
    mode: 'execute',
    policy: shouldOpen
      ? { allow_visible_host_effect: true }
      : { allow_visible_host_effect: false, suppress_reason: 'operator_policy:no_open' },
  }, options.openUrl ? { openUrl: options.openUrl, env: {} } : undefined);
}
