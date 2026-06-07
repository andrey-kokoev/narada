import commandContract from '../contracts/commands.json' with { type: 'json' };

export function loadCommandContract(contract = commandContract) {
  return Object.freeze(contract);
}

export function commandRecords(contract = loadCommandContract()) {
  return Object.freeze([...(contract.commands ?? [])]);
}

export function commandTokens(contract = loadCommandContract()) {
  return Object.freeze(commandRecords(contract).flatMap((command) => [command.primary, ...(command.aliases ?? [])]));
}
