import type { WorkspaceLaunchUiSession } from '@narada2/workspace-launch-contract';
import { parseOperatorConsoleLauncherSessions } from './session-domain';

export interface OperatorConsoleLauncherSessionTransport {
  list(): Promise<WorkspaceLaunchUiSession[]>;
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
  basePath = '/console/launch/api',
  fetchLike: FetchLike = (input, init) => fetch(input, init),
): OperatorConsoleLauncherSessionTransport {
  return {
    async list(): Promise<WorkspaceLaunchUiSession[]> {
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
      const sessions = parseOperatorConsoleLauncherSessions(payload);
      if (!sessions) {
        throw new OperatorConsoleLauncherSessionApiError(
          'invalid_response',
          'Launcher session inventory did not match its contract.',
        );
      }
      return sessions;
    },
  };
}
