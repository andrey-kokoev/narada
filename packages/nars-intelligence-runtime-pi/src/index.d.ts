import type {
  NarsAdmittedInput,
  NarsAdmittedTurn,
  NarsIntelligenceKernel,
  NarsKernelCapabilityGateway,
  NarsKernelCloseEvidence,
  NarsKernelCloseRequest,
  NarsKernelEventSink,
  NarsKernelHealthProjection,
  NarsKernelInputAcceptance,
  NarsKernelReconfigurationEvidence,
  NarsKernelReconfigurationRequest,
  NarsKernelStartContext,
  NarsKernelStartEvidence,
  NarsKernelTurnResult,
} from '@narada2/nars-intelligence-kernel-contract';

export * from '@narada2/nars-intelligence-kernel-contract';

export interface NarsPiProviderAdapter {
  invoke(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface NarsPiHost {
  start(context?: Record<string, unknown>): Promise<Record<string, unknown>>;
  runTurn(input?: Record<string, unknown>, eventSink?: (event: Record<string, unknown>) => void | Promise<void>, capabilityGateway?: NarsKernelCapabilityGateway | null): Promise<Record<string, unknown>>;
  steer?(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  cancel?(reason?: string): Promise<Record<string, unknown>>;
  reconfigure?(config?: Record<string, unknown>): Promise<Record<string, unknown>>;
  recover?(): Promise<Record<string, unknown>>;
  close?(): Promise<void>;
  health?(): Record<string, unknown>;
}

export interface NarsPiSdkKernelOptions {
  providerAdapter: NarsPiProviderAdapter;
  host?: NarsPiHost | null;
  sdk?: unknown;
  sessionFactory?: ((options: Record<string, unknown>) => unknown) | null;
  runtimeContext?: Record<string, unknown>;
  readNarsRecords?: (input: Record<string, unknown>) => Promise<unknown[]>;
  now?: () => string;
  piVersion?: string | null;
  kernelVersion?: string;
  fallbackToCompatibilityHost?: boolean | null;
  maxRetryAttempts?: number;
  maxCorrelationEntries?: number;
  maxContinuationMessages?: number;
  runtimeConfig?: Record<string, unknown>;
  artifactRegistrar?: ((candidate: Record<string, unknown>) => Promise<unknown>) | null;
}

export interface NarsPiRpcKernelOptions {
  host?: NarsPiHost | null;
  rpc?: Record<string, unknown>;
  runtimeContext?: Record<string, unknown>;
  readNarsRecords?: (input: Record<string, unknown>) => Promise<unknown[]>;
  now?: () => string;
  piVersion?: string;
  kernelVersion?: string;
  maxRetryAttempts?: number;
  maxCorrelationEntries?: number;
  maxContinuationMessages?: number;
  artifactRegistrar?: ((candidate: Record<string, unknown>) => Promise<unknown>) | null;
}

export type NarsPiKernel = NarsIntelligenceKernel & {
  health(): NarsKernelHealthProjection;
  recover(input?: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
};

export declare function createNarsPiSdkKernel(options: NarsPiSdkKernelOptions): NarsPiKernel;
export declare function createNarsPiRpcKernel(options?: NarsPiRpcKernelOptions): NarsPiKernel;
export declare function createPiSdkHost(options?: Record<string, unknown>): NarsPiHost;
export declare function createPiRpcHost(options?: Record<string, unknown>): NarsPiHost;
export declare function createIntelligenceKernel(
  options?: ({ kind?: 'narada-native' } & Record<string, unknown>) | ({ kind: 'pi-sdk' } & NarsPiSdkKernelOptions) | ({ kind: 'pi-rpc' } & NarsPiRpcKernelOptions),
): NarsPiKernel;

// Keep the contract imports visible to declaration consumers without exposing
// any Pi SDK/RPC-native types.
export type {
  NarsAdmittedInput,
  NarsAdmittedTurn,
  NarsKernelCapabilityGateway,
  NarsKernelCloseEvidence,
  NarsKernelCloseRequest,
  NarsKernelEventSink,
  NarsKernelInputAcceptance,
  NarsKernelReconfigurationEvidence,
  NarsKernelReconfigurationRequest,
  NarsKernelStartContext,
  NarsKernelStartEvidence,
  NarsKernelTurnResult,
};
