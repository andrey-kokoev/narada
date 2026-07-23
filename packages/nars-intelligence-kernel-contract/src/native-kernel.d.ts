import type { NarsIntelligenceKernel } from './index.js';
export interface NativeKernelOptions {
  providerAdapter: { invoke(input: Record<string, unknown>): Promise<Record<string, unknown>> };
  now?: () => string;
  kernelVersion?: string;
  runtimeContext?: Record<string, unknown>;
}
export function createNarsNativeKernel(options: NativeKernelOptions): NarsIntelligenceKernel & {
  health(): Record<string, unknown>;
  invokeAdmitted(input?: Record<string, unknown>): Promise<Record<string, unknown>>;
};
