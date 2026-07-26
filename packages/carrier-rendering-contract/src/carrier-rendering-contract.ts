import { readFileSync } from 'node:fs';

export function loadTranscriptClassifiersContract(
  url = new URL('../contracts/transcript-classifiers.json', import.meta.url),
) {
  return Object.freeze(JSON.parse(readFileSync(url, 'utf-8')));
}
