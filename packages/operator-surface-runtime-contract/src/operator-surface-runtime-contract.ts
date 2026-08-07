import { readFileSync } from 'node:fs';

type JsonRecord = Record<string, any>;

export function loadLaunchSliceContract(url: URL = new URL('../contracts/launch-slice.json', import.meta.url)): Readonly<JsonRecord> {
  return Object.freeze(JSON.parse(readFileSync(url, 'utf-8')) as JsonRecord);
}

export function loadOperatorSurfaceLaunchMatrixContract(url: URL = new URL('../contracts/operator-surface-launch-matrix.json', import.meta.url)): Readonly<JsonRecord> {
  return Object.freeze(JSON.parse(readFileSync(url, 'utf-8')) as JsonRecord);
}

export function loadOperatorJourneyMatrixContract(url: URL = new URL('../contracts/operator-journey-matrix.json', import.meta.url)): Readonly<JsonRecord> {
  return Object.freeze(JSON.parse(readFileSync(url, 'utf-8')) as JsonRecord);
}

export function loadMcpRuntimeContract(url: URL = new URL('../contracts/mcp-runtime.json', import.meta.url)): Readonly<JsonRecord> {
  return Object.freeze(JSON.parse(readFileSync(url, 'utf-8')) as JsonRecord);
}

export function loadTerminalRuntimeContract(url: URL = new URL('../contracts/terminal-runtime.json', import.meta.url)): Readonly<JsonRecord> {
  return Object.freeze(JSON.parse(readFileSync(url, 'utf-8')) as JsonRecord);
}

export function loadRuntimeSubstrateKindsContract(url: URL = new URL('../contracts/runtime-substrate-kinds.json', import.meta.url)): Readonly<JsonRecord> {
  return Object.freeze(JSON.parse(readFileSync(url, 'utf-8')) as JsonRecord);
}

export function loadRuntimeEnginesContract(url: URL = new URL('../contracts/runtime-engines.json', import.meta.url)): Readonly<JsonRecord> {
  return Object.freeze(JSON.parse(readFileSync(url, 'utf-8')) as JsonRecord);
}

export function loadRuntimeProfilesContract(url: URL = new URL('../contracts/runtime-profiles.json', import.meta.url)): Readonly<JsonRecord> {
  return Object.freeze(JSON.parse(readFileSync(url, 'utf-8')) as JsonRecord);
}

export function loadRuntimeImplementationMatrixContract(url: URL = new URL('../contracts/runtime-implementation-matrix.json', import.meta.url)): Readonly<JsonRecord> {
  return Object.freeze(JSON.parse(readFileSync(url, 'utf-8')) as JsonRecord);
}

export function loadRuntimeBooleanValuesContract(url: URL = new URL('../contracts/boolean-values.json', import.meta.url)): Readonly<JsonRecord> {
  return Object.freeze(JSON.parse(readFileSync(url, 'utf-8')) as JsonRecord);
}

export type { JsonRecord };
