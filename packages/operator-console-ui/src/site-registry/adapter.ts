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
  };
}
