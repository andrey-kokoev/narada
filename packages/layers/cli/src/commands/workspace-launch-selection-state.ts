export function initialOperatorSurfaceValues(choices: string[], current?: string): string[] {
  if (!current) return ['registry default'];
  const explicit = normalizeOperatorSurfaceValues(current).filter((value) => choices.some((choice) => choice.toLowerCase() === value.toLowerCase()));
  return explicit.length > 0 ? explicit : ['registry default'];
}

export function normalizeInteractiveOperatorSurfaceValues(values: string[]): string[] {
  const normalized = unique(values);
  const explicit = normalized.filter((value) => value !== 'registry default');
  if (explicit.length > 0) return explicit;
  if (normalized.includes('registry default')) return ['registry default'];
  return normalized;
}

export function initialRoleValuesForInteractiveSelection(roleChoices: string[], explicitRoles?: string[]): string[] {
  const explicitRoleValues = (explicitRoles ?? []).filter((role) => roleChoices.some((choice) => choice.toLowerCase() === role.toLowerCase()));
  if (explicitRoleValues.length > 0) return explicitRoleValues;
  const residentChoice = roleChoices.find((role) => role.toLowerCase() === 'resident');
  return residentChoice ? [residentChoice] : [];
}

export function filterWorkspaceLaunchValues(values: string[] | undefined, allowed: string[]): string[] {
  const allowedSet = new Set(allowed.map((value) => value.toLowerCase()));
  return unique(stringArray(values).filter((value) => allowedSet.has(value.toLowerCase())));
}

export function rememberedArraySelection(
  requested: string[],
  remembered: string[],
  allowed: string[],
  explicit: boolean,
  fallback: string[] = requested,
): string[] {
  if (explicit) return filterWorkspaceLaunchValues(requested, allowed);
  const rememberedValues = filterWorkspaceLaunchValues(remembered, allowed);
  return rememberedValues.length > 0 ? rememberedValues : fallback;
}

export function rememberedScalarSelection(
  requested: string | null,
  remembered: string | null,
  allowed: string[],
  explicit: boolean,
  fallback: string,
): string {
  const allowedSet = new Set(allowed.map((value) => value.toLowerCase()));
  if (explicit) return requested && allowedSet.has(requested.toLowerCase()) ? requested : fallback;
  if (remembered && allowedSet.has(remembered.toLowerCase())) return remembered;
  return requested && allowedSet.has(requested.toLowerCase()) ? requested : fallback;
}

export function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function nonEmptyStringArray(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => nonEmpty(value)).filter((value): value is string => Boolean(value));
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

export function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeOperatorSurfaceValues(value: string): string[] {
  return unique(value.split(',').map((part) => part.trim()).filter(Boolean));
}
