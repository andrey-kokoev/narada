export const NARS_RUNTIME_INTELLIGENCE_RECONFIGURE_METHOD: 'runtime.intelligence.reconfigure';
export const NARS_RUNTIME_SERVER_METHOD_LIST: readonly ['runtime.intelligence.reconfigure'];
export const NARS_RUNTIME_SERVER_METHODS: ReadonlySet<string>;
export function isNarsRuntimeServerMethod(method: unknown): boolean;
export function buildNarsRuntimeIntelligenceReconfigureFrame(input?: {
  provider?: unknown;
  model?: unknown;
  thinking?: unknown;
  requestId?: unknown;
  request_id?: unknown;
}, options?: { id?: unknown }): Record<string, unknown> | null;
