export interface FuzzyOption {
  value: string;
  label?: string;
  description?: string;
}

export interface RankedFuzzyOption extends FuzzyOption {
  score: number;
}

/** Return a stable subsequence score, or null when query is not a match. */
export function fuzzyScore(query: string, candidate: string): number | null {
  const needle = query.trim().toLocaleLowerCase();
  const haystack = candidate.toLocaleLowerCase();
  if (!needle) return 0;
  let queryIndex = 0;
  let score = 0;
  let previousIndex = -1;
  for (let index = 0; index < haystack.length && queryIndex < needle.length; index += 1) {
    if (haystack[index] !== needle[queryIndex]) continue;
    score += index === previousIndex + 1 ? 3 : 1;
    if (index === 0 || /[\s/_:-]/.test(haystack[index - 1] ?? '')) score += 2;
    previousIndex = index;
    queryIndex += 1;
  }
  return queryIndex === needle.length ? score : null;
}

export function fuzzyFilter<T extends FuzzyOption>(query: string, options: readonly T[]): RankedFuzzyOption[] {
  return options
    .flatMap((option, index) => {
      const score = fuzzyScore(query, `${option.value} ${option.label ?? ''} ${option.description ?? ''}`);
      return score === null ? [] : [{ ...option, score, index }];
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ index: _index, ...option }) => option);
}
