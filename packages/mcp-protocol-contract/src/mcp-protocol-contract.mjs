import { readFileSync } from 'node:fs';

export function loadMcpJsonRpcContract(url = new URL('../contracts/json-rpc.json', import.meta.url)) {
  return Object.freeze(JSON.parse(readFileSync(url, 'utf-8')));
}
