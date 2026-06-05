import { readFileSync } from 'node:fs';

export function loadCarrierProtocolContract(
  url = new URL('../contracts/carrier-protocol.json', import.meta.url),
) {
  return Object.freeze(JSON.parse(readFileSync(url, 'utf-8')));
}
