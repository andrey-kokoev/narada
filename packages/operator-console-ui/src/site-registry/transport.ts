import type { SiteRegistryMutationRequest } from '@narada2/site-registry-contract';
import { OPERATOR_CONSOLE_REGISTRY_API_PATH } from '@narada2/operator-console-contract';

export type SiteRegistryFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface SiteRegistryTransport {
  list(): Promise<unknown>;
  show(reference: string): Promise<unknown>;
  plan(request: SiteRegistryMutationRequest): Promise<unknown>;
  apply(request: SiteRegistryMutationRequest): Promise<unknown>;
  launch(reference: string, dryRun: boolean): Promise<unknown>;
}

export class SiteRegistryTransportError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = 'SiteRegistryTransportError';
    this.code = code;
    this.status = status;
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new SiteRegistryTransportError(
      'invalid_json',
      response.status,
      `Registry returned HTTP ${response.status} without valid JSON.`,
    );
  }
}

export function createSiteRegistryTransport(
  basePath = OPERATOR_CONSOLE_REGISTRY_API_PATH,
  fetchLike: SiteRegistryFetch = (input, init) => fetch(input, init),
): SiteRegistryTransport {
  async function get(path: string): Promise<unknown> {
    const response = await fetchLike(`${basePath}${path}`, { headers: { Accept: 'application/json' } });
    const payload = await readJson(response);
    if (!response.ok) {
      throw new SiteRegistryTransportError(
        'http_error',
        response.status,
        `Registry request failed with HTTP ${response.status}.`,
      );
    }
    return payload;
  }

  async function post(path: string, request: SiteRegistryMutationRequest, confirmApply: boolean): Promise<unknown> {
    const response = await fetchLike(`${basePath}${path}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(confirmApply ? { ...request, confirm_apply: true } : request),
    });
    const payload = await readJson(response);
    if (!response.ok && response.status !== 409) {
      throw new SiteRegistryTransportError(
        'http_error',
        response.status,
        `Registry request failed with HTTP ${response.status}.`,
      );
    }
    return payload;
  }

  async function postLaunch(path: string, dryRun: boolean): Promise<unknown> {
    const response = await fetchLike(`${basePath}${path}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ dry_run: dryRun }),
    });
    const payload = await readJson(response);
    if (!response.ok) {
      throw new SiteRegistryTransportError(
        'http_error',
        response.status,
        `Site launch request failed with HTTP ${response.status}.`,
      );
    }
    return payload;
  }

  return {
    list: () => get('/sites'),
    show: (reference) => get(`/sites/${encodeURIComponent(reference)}`),
    plan: (request) => post('/operations/plan', request, false),
    apply: (request) => post('/operations/apply', request, true),
    launch: (reference, dryRun) => postLaunch(`/sites/${encodeURIComponent(reference)}/launch`, dryRun),
  };
}
