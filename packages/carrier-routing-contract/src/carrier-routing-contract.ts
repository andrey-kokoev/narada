import { readFileSync } from 'node:fs';

export function loadOperatorRoutingContract(
  url = new URL('../contracts/operator-routing.json', import.meta.url),
) {
  return Object.freeze(JSON.parse(readFileSync(url, 'utf-8')));
}

export function directToolRoutes(contract = loadOperatorRoutingContract()) {
  return Object.freeze([...(contract.direct_tool_routes ?? [])]);
}

export function readerRoutes(contract = loadOperatorRoutingContract()) {
  return Object.freeze([...(contract.reader_routes ?? [])]);
}

export function directRoutingPhrases(contract = loadOperatorRoutingContract()) {
  return Object.freeze(directToolRoutes(contract).flatMap((route) => route.phrases ?? []));
}

export function readerRoutingPhrases(contract = loadOperatorRoutingContract()) {
  return Object.freeze(readerRoutes(contract).flatMap((route) => route.phrases ?? []));
}

export function toolAliasGroups(contract = loadOperatorRoutingContract()) {
  return Object.freeze([...(contract.tool_alias_groups ?? [])]);
}
