import type { SqliteRegistryStore } from '@narada2/invokable-intelligence-registry';
import type {
  AuthoritativeDecisionClock,
  InvocationPlan,
  ResourceRef,
} from '@narada2/invokable-intelligence-contract';
import type {
  IntelligenceMaterializationStore,
} from '@narada2/invokable-intelligence-materialization';
import type {
  InvocationAdapter,
  LocalInvocationGateway,
} from '@narada2/invokable-intelligence-runtime';
import type { IntelligenceRegistryStore } from '@narada2/invokable-intelligence-registry';
import type { ResolverContext } from '@narada2/invokable-intelligence-resolver';

export interface LocalIntelligenceRegistryOptions {
  siteRoot: string;
  registryDbPath?: string;
}

export interface LocalIntelligenceRuntimeContext {
  identity: string;
  session: string;
  siteRoot: string;
  intelligence: {
    principal: string;
    sites: {
      targetSite: ResourceRef;
      userSite: ResourceRef;
      hostSite: ResourceRef;
    };
    access: Record<string, unknown>;
    [key: string]: unknown;
  };
  invocationSettings?: { invocationScope?: unknown; [key: string]: unknown };
  [key: string]: unknown;
}

export interface LocalTopologyObserver {
  observe(input: { decisionClock: AuthoritativeDecisionClock }): Promise<ResolverContext['topology_observations']>;
}

export interface CodexServiceProbeOptions {
  env?: NodeJS.ProcessEnv;
  session?: string;
  authorityRef?: string;
  timeoutMs?: number;
  spawnProcess?: typeof import('node:child_process').spawn;
}

export interface CodexServiceEvidence {
  schema: 'narada.invokable-intelligence.local-runtime-service-evidence.v1';
  service: string;
  runtime_family: string;
  protocol_family: string;
  status: 'ready' | 'executable-present' | 'unavailable';
  observed_for_session: string;
  authority_ref: string;
  observed_at: string;
  evidence_class: 'durable' | 'observed';
  evidence_ref: string;
  probe: Record<string, unknown>;
}

export interface LocalIntelligenceRuntimeOptions {
  runtimeContext: LocalIntelligenceRuntimeContext;
  env?: NodeJS.ProcessEnv;
  store?: IntelligenceRegistryStore;
  materialization?: IntelligenceMaterializationStore;
  clock?: () => AuthoritativeDecisionClock;
  adapter?: InvocationAdapter;
  topologyObserver?: LocalTopologyObserver;
  runtimeServices?: ReadonlyArray<CodexServiceEvidence>;
  runtimeServiceProbe?: (options: CodexServiceProbeOptions) => Promise<CodexServiceEvidence>;
}

export interface LocalIntelligenceRuntime {
  gateway: LocalInvocationGateway;
  store: IntelligenceRegistryStore;
  preflightSelection(input?: {
    requestedModel?: ResourceRef | null;
    requestedOptions?: Record<string, unknown>;
  }): Promise<InvocationPlan>;
  close(): Promise<void>;
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

export declare function probeCodexSubscriptionService(
  options?: CodexServiceProbeOptions,
): Promise<CodexServiceEvidence>;

export declare function createLocalIntelligenceRuntime(
  options: LocalIntelligenceRuntimeOptions,
): Promise<LocalIntelligenceRuntime>;
