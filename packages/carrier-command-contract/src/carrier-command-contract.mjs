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

function normalizeCommandText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function commandPatterns(command) {
  const tokens = [command.primary, ...(command.aliases ?? [])]
    .map((token) => String(token ?? '').trim())
    .filter(Boolean);
  const argument = String(command.argument ?? '').split('|')[0]?.trim();
  if (!argument) return tokens;
  return tokens.flatMap((token) => [token, `${token} <${argument}>`]);
}

function matchPattern(pattern, input) {
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

export function resolveCommandInput(command, value = '', contract = loadCommandContract()) {
  const input = String(`${command ?? ''} ${value ?? ''}`).trim().replace(/\s+/g, ' ');
  const candidates = [];
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
