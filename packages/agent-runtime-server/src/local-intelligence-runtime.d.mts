import type { SqliteRegistryStore } from '@narada2/invokable-intelligence-registry';

export interface LocalIntelligenceRegistryOptions {
  siteRoot: string;
  registryDbPath?: string;
}

export declare function openLocalIntelligenceRegistry(
  options: LocalIntelligenceRegistryOptions,
): Promise<SqliteRegistryStore>;

export declare function executionSiteDecisionClock(
  authorityRef: string,
  date?: Date,
): {
  source: 'execution-site-clock';
  authority_ref: string;
  instant: string;
  timezone: 'UTC';
  local: {
    date: string;
    time: string;
    weekday: number;
  };
};

export declare function createLocalIntelligenceRuntime(
  options?: Record<string, unknown>,
): Promise<Record<string, unknown> & { close(): Promise<void> }>;
