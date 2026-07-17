import { OPERATOR_CONSOLE_SESSIONS_API_PATH } from '@narada2/operator-console-contract';

export type AgentSessionsFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface AgentSessionsTransport {
  list(): Promise<unknown>;
}

export class AgentSessionsTransportError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = 'AgentSessionsTransportError';
    this.code = code;
    this.status = status;
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new AgentSessionsTransportError(
      'invalid_json',
      response.status,
      `Agent Sessions returned HTTP ${response.status} without valid JSON.`,
    );
  }
}

export function createAgentSessionsTransport(
  basePath = OPERATOR_CONSOLE_SESSIONS_API_PATH,
  fetchLike: AgentSessionsFetch = (input, init) => fetch(input, init),
): AgentSessionsTransport {
  return {
    async list(): Promise<unknown> {
      const response = await fetchLike(`${basePath}/sessions`, { headers: { Accept: 'application/json' } });
      const payload = await readJson(response);
      if (!response.ok) {
        throw new AgentSessionsTransportError(
          'http_error',
          response.status,
          `Agent Sessions request failed with HTTP ${response.status}.`,
        );
      }
      return payload;
    },
  };
}
