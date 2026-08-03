export const SCHEMA_VERSION = 1;

export function asNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function clampPercent(value) {
  const number = asNumber(value);
  if (number === null) return null;
  return Math.min(100, Math.max(0, number));
}

export function percentFromValues({ usedPercent, remainingPercent, used, remaining, limit }) {
  const directUsed = clampPercent(usedPercent);
  if (directUsed !== null) {
    return { usedPercent: directUsed, remainingPercent: 100 - directUsed };
  }

  const directRemaining = clampPercent(remainingPercent);
  if (directRemaining !== null) {
    return { usedPercent: 100 - directRemaining, remainingPercent: directRemaining };
  }

  const total = asNumber(limit);
  const usedValue = asNumber(used);
  const remainingValue = asNumber(remaining);

  if (total !== null && total > 0 && usedValue !== null) {
    const usedPct = clampPercent((usedValue / total) * 100);
    return { usedPercent: usedPct, remainingPercent: 100 - usedPct };
  }

  if (total !== null && total > 0 && remainingValue !== null) {
    const remainingPct = clampPercent((remainingValue / total) * 100);
    return { usedPercent: 100 - remainingPct, remainingPercent: remainingPct };
  }

  if (remainingValue !== null) {
    const remainingPct = clampPercent(remainingValue);
    return { usedPercent: 100 - remainingPct, remainingPercent: remainingPct };
  }

  return { usedPercent: null, remainingPercent: null };
}

export function toEpochMs(value) {
  if (value === null || value === undefined || value === '') return null;

  const number = asNumber(value);
  if (number !== null) {
    return number < 100_000_000_000 ? number * 1000 : number;
  }

  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function toIso(value) {
  const epoch = toEpochMs(value);
  return epoch === null ? null : new Date(epoch).toISOString();
}

export function durationToLabel(durationSeconds, fallback = 'window') {
  const seconds = asNumber(durationSeconds);
  if (seconds === null || seconds <= 0) return fallback;

  const hour = 60 * 60;
  const day = 24 * hour;
  if (seconds % day === 0) return `${seconds / day}d`;
  if (seconds % hour === 0) return `${seconds / hour}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

export function summarizeResetCredits(value, now = Date.now()) {
  if (!value || typeof value !== 'object') return null;

  const rawCredits = Array.isArray(value.credits) ? value.credits : [];
  const credits = rawCredits.map((credit) => ({
    id: credit?.id ?? null,
    status: credit?.status ?? null,
    resetType: credit?.resetType ?? credit?.reset_type ?? null,
    title: credit?.title ?? null,
    grantedAt: toIso(credit?.grantedAt ?? credit?.granted_at),
    expiresAt: toIso(credit?.expiresAt ?? credit?.expires_at),
  }));
  const reportedCount = asNumber(value.availableCount ?? value.available_count);
  const availableCount = reportedCount === null
    ? credits.filter((credit) => credit.status === 'available').length
    : Math.max(0, Math.trunc(reportedCount));
  const futureExpirations = credits
    .filter((credit) => credit.status === 'available' && credit.expiresAt)
    .map((credit) => toEpochMs(credit.expiresAt))
    .filter((expiresAt) => expiresAt !== null && expiresAt > now)
    .sort((a, b) => a - b);
  const nextExpirationAt = futureExpirations.length > 0
    ? new Date(futureExpirations[0]).toISOString()
    : null;

  return {
    availableCount,
    detailedCount: credits.length,
    credits,
    nextExpirationAt,
    nextExpirationInHours: nextExpirationAt === null
      ? null
      : Math.max(0, (toEpochMs(nextExpirationAt) - now) / 3_600_000),
  };
}

function windowTiming(window) {
  const resetAtMs = toEpochMs(window.resetAt);
  const durationSeconds = asNumber(window.durationSeconds);
  const explicitStartMs = toEpochMs(
    window.windowStartAt ?? window.windowStart ?? window.startAt ?? window.startsAt,
  );
  const windowStartMs = explicitStartMs ?? (
    resetAtMs !== null && durationSeconds !== null && durationSeconds > 0
      ? resetAtMs - durationSeconds * 1000
      : null
  );
  const windowEndMs = resetAtMs ?? (
    windowStartMs !== null && durationSeconds !== null && durationSeconds > 0
      ? windowStartMs + durationSeconds * 1000
      : null
  );
  const durationMs = durationSeconds !== null && durationSeconds > 0
    ? durationSeconds * 1000
    : windowStartMs !== null && windowEndMs !== null
      ? windowEndMs - windowStartMs
      : null;

  return { resetAtMs, windowStartMs, windowEndMs, durationMs };
}

function glideStatusFromFactor(factor) {
  if (factor < 0.98) return 'under';
  if (factor > 1.03) return 'over';
  return 'in-range';
}

export function calculateGlidePath(window, now = Date.now(), resetCredits = null) {
  const usedPercent = clampPercent(window.usedPercent);
  const remaining = clampPercent(window.remainingPercent);
  const { resetAtMs, windowStartMs, windowEndMs, durationMs } = windowTiming(window);
  const elapsedMs = windowStartMs === null ? null : now - windowStartMs;
  const elapsedTimePercent = durationMs === null
    ? null
    : Math.min(100, Math.max(0, (elapsedMs / durationMs) * 100));
  const hoursSinceWindowStart = elapsedMs === null
    ? null
    : Math.max(0, elapsedMs / 3_600_000);
  const hoursUntilReset = windowEndMs === null
    ? null
    : Math.max(0, (windowEndMs - now) / 3_600_000);
  const averageBurnRatePercentPerHour =
    usedPercent !== null && hoursSinceWindowStart !== null && hoursSinceWindowStart > 0
      ? usedPercent / hoursSinceWindowStart
      : null;
  const sustainableRatePercentPerHour =
    remaining !== null && hoursUntilReset !== null && hoursUntilReset > 0
      ? remaining / hoursUntilReset
      : null;
  const glidePathFactor =
    usedPercent !== null && elapsedTimePercent !== null && elapsedTimePercent > 0
      ? usedPercent / elapsedTimePercent
      : null;
  const projectedExhaustionAt =
    averageBurnRatePercentPerHour !== null && averageBurnRatePercentPerHour > 0 && windowStartMs !== null
      ? new Date(windowStartMs + (100 / averageBurnRatePercentPerHour) * 3_600_000).toISOString()
      : null;

  let status = 'window-duration-unknown';
  if ((remaining !== null && remaining <= 0) || (usedPercent !== null && usedPercent >= 100)) {
    status = 'exhausted';
  } else if (usedPercent === null) {
    status = 'usage-unknown';
  } else if (elapsedTimePercent !== null && elapsedTimePercent <= 0) {
    status = 'not-started';
  } else if (glidePathFactor !== null) {
    status = glideStatusFromFactor(glidePathFactor);
  }

  const availableResetCredits = resetCredits?.availableCount ?? 0;
  const resetAwareCapacityMultiplier = 1 + availableResetCredits;
  const resetAwareGlidePathFactor = glidePathFactor === null
    ? null
    : glidePathFactor / resetAwareCapacityMultiplier;
  const oneResetCapacityMultiplier = 2;
  const oneResetGlidePathFactor = glidePathFactor === null
    ? null
    : glidePathFactor / oneResetCapacityMultiplier;

  return {
    status,
    formula: 'usedPercent / elapsedTimePercent',
    glidePathFactor,
    usedPercent,
    elapsedTimePercent,
    windowStartAt: windowStartMs === null ? null : new Date(windowStartMs).toISOString(),
    hoursSinceWindowStart,
    averageBurnRatePercentPerHour,
    sustainableRatePercentPerHour,
    hoursUntilReset,
    projectedExhaustionAt,
    exhaustsBeforeReset: glidePathFactor === null ? null : glidePathFactor > 1,
    resetAt: resetAtMs === null ? null : new Date(resetAtMs).toISOString(),
    withAvailableResets: resetCredits === null
      ? null
      : {
        formula: 'glidePathFactor / (1 + availableResetCredits)',
        availableResetCredits,
        capacityMultiplier: resetAwareCapacityMultiplier,
        glidePathFactor: resetAwareGlidePathFactor,
        status: resetAwareGlidePathFactor === null
          ? status
          : glideStatusFromFactor(resetAwareGlidePathFactor),
        requiresReset: status === 'exhausted' || (glidePathFactor !== null && glidePathFactor > 1),
        nextExpirationAt: resetCredits.nextExpirationAt,
        nextExpirationInHours: resetCredits.nextExpirationInHours,
      },
    withOneReset: resetCredits === null || availableResetCredits < 1
      ? null
      : {
        formula: 'glidePathFactor / 2',
        availableResetCredits,
        capacityMultiplier: oneResetCapacityMultiplier,
        glidePathFactor: oneResetGlidePathFactor,
        status: oneResetGlidePathFactor === null
          ? status
          : glideStatusFromFactor(oneResetGlidePathFactor),
        requiresReset: status === 'exhausted' || (glidePathFactor !== null && glidePathFactor > 1),
        nextExpirationAt: resetCredits.nextExpirationAt,
        nextExpirationInHours: resetCredits.nextExpirationInHours,
      },
  };
}

export function attachGlidePaths(result, now = Date.now()) {
  const resetCredits = summarizeResetCredits(result.metadata?.rateLimitResetCredits, now);
  const windows = result.windows.map((window) => ({
    ...window,
    glidePath: calculateGlidePath(window, now, resetCredits),
  }));
  return {
    ...result,
    metadata: resetCredits === null
      ? result.metadata
      : { ...result.metadata, resetCreditSummary: resetCredits },
    windows,
  };
}