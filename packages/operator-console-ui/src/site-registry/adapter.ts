import {
  parseSiteRegistryListResponse,
  parseSiteRegistryManagementResponse,
  parseSiteRegistryShowResponse,
  type SiteRegistryListResponse,
  type SiteRegistryManagementResponse,
  type SiteRegistryMutationRequest,
  type SiteRegistryShowResponse,
} from '@narada2/site-registry-contract';
import { createSiteRegistryTransport, type SiteRegistryTransport } from './transport';

export interface SiteRegistryClient {
  list(): Promise<SiteRegistryListResponse>;
  show(reference: string): Promise<SiteRegistryShowResponse>;
  plan(request: SiteRegistryMutationRequest): Promise<SiteRegistryManagementResponse>;
  apply(request: SiteRegistryMutationRequest): Promise<SiteRegistryManagementResponse>;
  launch(reference: string, dryRun: boolean): Promise<SiteLaunchResult>;
}

/** Wire shape of narada.sites.launch.result.v0 (CLI sites launch ensure). */
export interface SiteLaunchCheck {
  id: string;
  status: 'pass' | 'warn' | 'fail' | 'planned' | 'skipped';
  summary: string;
  detail?: string;
  next_command?: string;
}

export interface SiteLaunchResult {
  schema: 'narada.sites.launch.result.v0';
  status: 'ok' | 'dry_run' | 'degraded' | 'failed';
  dry_run: boolean;
  mutation_performed: boolean;
  site_id: string;
  site_root: string | null;
  declaration: {
    loop_id: string | null;
    resident_declared: boolean;
    scheduler_task_name: string | null;
  } | null;
  checks: SiteLaunchCheck[];
  actions: string[];
  console_url: string;
}

function parseSiteLaunchResult(value: unknown): SiteLaunchResult | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.schema !== 'narada.sites.launch.result.v0') return null;
  if (typeof candidate.status !== 'string' || !Array.isArray(candidate.checks)) return null;
  return candidate as unknown as SiteLaunchResult;
}

export class SiteRegistryApiError extends Error {
  readonly code: string;
  readonly refusals: string[];

  constructor(code: string, message: string, refusals: string[] = []) {
    super(message);
    this.name = 'SiteRegistryApiError';
    this.code = code;
    this.refusals = refusals;
  }
}

function requireResponse<T>(value: T | null, message: string): T {
  if (!value) throw new SiteRegistryApiError('invalid_response', message);
  return value;
}

export function createSiteRegistryAdapter(
  transport: SiteRegistryTransport = createSiteRegistryTransport(),
): SiteRegistryClient {
  return {
    async list(): Promise<SiteRegistryListResponse> {
      return requireResponse(
        parseSiteRegistryListResponse(await transport.list()),
        'Registry list response did not match its contract.',
      );
    },
    async show(reference: string): Promise<SiteRegistryShowResponse> {
      return requireResponse(
        parseSiteRegistryShowResponse(await transport.show(reference)),
        'Registry detail response did not match its contract.',
      );
    },
    async plan(request: SiteRegistryMutationRequest): Promise<SiteRegistryManagementResponse> {
      return requireResponse(
        parseSiteRegistryManagementResponse(await transport.plan(request)),
        'Registry plan response did not match its contract.',
      );
    },
    async apply(request: SiteRegistryMutationRequest): Promise<SiteRegistryManagementResponse> {
      return requireResponse(
        parseSiteRegistryManagementResponse(await transport.apply(request)),
        'Registry apply response did not match its contract.',
      );
    },
    async launch(reference: string, dryRun: boolean): Promise<SiteLaunchResult> {
      return requireResponse(
        parseSiteLaunchResult(await transport.launch(reference, dryRun)),
        'Site launch response did not match its contract.',
      );
    },
  };
}
