import commandContractJson from '../contracts/commands.json' with { type: 'json' };

export interface CarrierCommand {
  name: string;
  primary: string;
  aliases?: readonly string[];
  argument?: string;
  effect: string;
  help: string;
}

export interface CarrierCommandContract {
  schema: string;
  commands: readonly CarrierCommand[];
  [key: string]: unknown;
}

export interface ResolvedCarrierCommand {
  name: string;
  primary: string;
  record: CarrierCommand;
  matched_pattern: string;
  argument: string;
}

interface CommandPatternMatch {
  pattern: string;
  fixed_part_count: number;
  argument: string;
}

interface CommandCandidate extends CommandPatternMatch {
  record: CarrierCommand;
}

const defaultCommandContract = commandContractJson as unknown as CarrierCommandContract;

export function loadCommandContract(
  contract: CarrierCommandContract = defaultCommandContract,
): Readonly<CarrierCommandContract> {
  return Object.freeze(contract);
}

export function commandRecords(
  contract: CarrierCommandContract = loadCommandContract(),
): readonly CarrierCommand[] {
  return Object.freeze([...(contract.commands ?? [])]);
}

export function commandTokens(
  contract: CarrierCommandContract = loadCommandContract(),
): readonly string[] {
  return Object.freeze(
    commandRecords(contract).flatMap((command) => [command.primary, ...(command.aliases ?? [])]),
  );
}

function normalizeCommandText(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function commandPatterns(command: CarrierCommand): string[] {
  const tokens = [command.primary, ...(command.aliases ?? [])]
    .map((token) => String(token ?? '').trim())
    .filter(Boolean);
  const argument = String(command.argument ?? '').split('|')[0]?.trim();
  if (!argument) return tokens;
  return tokens.flatMap((token) => [token, `${token} <${argument}>`]);
}

function matchPattern(pattern: string, input: unknown): CommandPatternMatch | null {
  const patternParts = normalizeCommandText(pattern).split(' ').filter(Boolean);
  const inputText = String(input ?? '').trim().replace(/\s+/g, ' ');
  const inputParts = normalizeCommandText(inputText).split(' ').filter(Boolean);
  const originalInputParts = inputText.split(' ').filter(Boolean);
  if (patternParts.length === 0 || inputParts.length === 0) return null;
  const placeholderIndex = patternParts.findIndex((part) => /^<[^>]+>$/.test(part));
  const fixedParts = placeholderIndex === -1 ? patternParts : patternParts.slice(0, placeholderIndex);
  if (inputParts.length < fixedParts.length) return null;
  for (let index = 0; index < fixedParts.length; index += 1) {
    if (inputParts[index] !== fixedParts[index]) return null;
  }
  if (placeholderIndex === -1 && inputParts.length !== fixedParts.length) return null;
  return {
    pattern,
    fixed_part_count: fixedParts.length,
    argument: originalInputParts.slice(fixedParts.length).join(' '),
  };
}

export function resolveCommandInput(
  command: unknown,
  value: unknown = '',
  contract: CarrierCommandContract = loadCommandContract(),
): Readonly<ResolvedCarrierCommand> | null {
  const input = String(`${command ?? ''} ${value ?? ''}`).trim().replace(/\s+/g, ' ');
  const candidates: CommandCandidate[] = [];
  for (const record of commandRecords(contract)) {
    for (const pattern of commandPatterns(record)) {
      const match = matchPattern(pattern, input);
      if (match) candidates.push({ record, ...match });
    }
  }
  candidates.sort((left, right) => right.fixed_part_count - left.fixed_part_count);
  const best = candidates[0] ?? null;
  if (!best) return null;
  return Object.freeze({
    name: best.record.name,
    primary: best.record.primary,
    record: best.record,
    matched_pattern: best.pattern,
    argument: best.argument,
  });
}
