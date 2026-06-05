import { readFileSync } from 'node:fs';

export function loadLaunchSliceContract(url = new URL('../contracts/launch-slice.json', import.meta.url)) {
  return Object.freeze(JSON.parse(readFileSync(url, 'utf-8')));
}

export function loadMcpRuntimeContract(url = new URL('../contracts/mcp-runtime.json', import.meta.url)) {
  return Object.freeze(JSON.parse(readFileSync(url, 'utf-8')));
}

export function loadTerminalRuntimeContract(url = new URL('../contracts/terminal-runtime.json', import.meta.url)) {
  return Object.freeze(JSON.parse(readFileSync(url, 'utf-8')));
}

export function loadRuntimeSubstrateKindsContract(url = new URL('../contracts/runtime-substrate-kinds.json', import.meta.url)) {
  return Object.freeze(JSON.parse(readFileSync(url, 'utf-8')));
}

export function loadRuntimeBooleanValuesContract(url = new URL('../contracts/boolean-values.json', import.meta.url)) {
  return Object.freeze(JSON.parse(readFileSync(url, 'utf-8')));
}
