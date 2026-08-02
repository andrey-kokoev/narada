import { OPERATOR_CONSOLE_FLEET_API_PATH } from '@narada-core/operator-console-contract';

export type HostFleetFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface HostFleetTransport {
  list(): Promise<unknown>;
}

export class HostFleetTransportError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = 'HostFleetTransportError';
    this.code = code;
    this.status = status;
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new HostFleetTransportError(
      'invalid_json',
      response.status,
      `Host Fleet returned HTTP ${response.status} without valid JSON.`,
    );
  }
}

export function createHostFleetTransport(
  basePath = OPERATOR_CONSOLE_FLEET_API_PATH,
  fetchLike: HostFleetFetch = (input, init) => fetch(input, init),
  timeoutMs = 3_000,
): HostFleetTransport {
  return {
    async list(): Promise<unknown> {
      let response: Response;
      try {
        response = await fetchLike(`${basePath}/hosts`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new HostFleetTransportError(
          'unavailable',
          0,
          'Host Fleet authority did not respond before the request deadline.',
        );
      }
      const payload = await readJson(response);
      if (!response.ok) {
        throw new HostFleetTransportError(
          'http_error',
          response.status,
          `Host Fleet request failed with HTTP ${response.status}.`,
        );
      }
      return payload;
    },
  };
}
