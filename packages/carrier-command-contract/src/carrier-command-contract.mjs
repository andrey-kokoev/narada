import { readFileSync } from 'node:fs';

export function loadCommandContract(url = new URL('../contracts/commands.json', import.meta.url)) {
  return Object.freeze(JSON.parse(readFileSync(url, 'utf-8')));
}

export function commandRecords(contract = loadCommandContract()) {
  return Object.freeze([...(contract.commands ?? [])]);
}

export function commandTokens(contract = loadCommandContract()) {
  return Object.freeze(commandRecords(contract).flatMap((command) => [command.primary, ...(command.aliases ?? [])]));
}
