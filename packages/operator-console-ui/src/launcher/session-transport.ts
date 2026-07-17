import type { WorkspaceLaunchUiSessionList } from '@narada2/workspace-launch-contract';
import { OPERATOR_CONSOLE_LAUNCH_API_PATH } from '@narada2/operator-console-contract';
import { parseOperatorConsoleLauncherSessions } from './session-domain';

export interface OperatorConsoleLauncherSessionTransport {
  list(): Promise<WorkspaceLaunchUiSessionList>;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class OperatorConsoleLauncherSessionApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'OperatorConsoleLauncherSessionApiError';
    this.code = code;
  }
}

export function createOperatorConsoleLauncherSessionTransport(
  basePath = OPERATOR_CONSOLE_LAUNCH_API_PATH,
  fetchLike: FetchLike = (input, init) => fetch(input, init),
): OperatorConsoleLauncherSessionTransport {
  return {
    async list(): Promise<WorkspaceLaunchUiSessionList> {
      const response = await fetchLike(basePath + '/sessions', {
        headers: { Accept: 'application/json' },
      });
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new OperatorConsoleLauncherSessionApiError(
          'invalid_json',
          'Launcher session inventory returned HTTP ' + response.status + ' without valid JSON.',
        );
      }
      if (!response.ok) {
        throw new OperatorConsoleLauncherSessionApiError(
          'http_error',
          'Launcher session inventory failed with HTTP ' + response.status + '.',
        );
      }
      const inventory = parseOperatorConsoleLauncherSessions(payload);
      if (!inventory) {
        throw new OperatorConsoleLauncherSessionApiError(
          'invalid_response',
          'Launcher session inventory did not match its contract.',
        );
      }
      return inventory;
    },
  };
}
