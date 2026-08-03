function percent(value) {
  return value === null || value === undefined ? 'n/a' : `${value.toFixed(1)}%`;
}

function duration(hours) {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return 'n/a';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function resetText(resetAt, now) {
  if (!resetAt) return 'reset unknown';
  const deltaHours = (Date.parse(resetAt) - now) / 3_600_000;
  if (deltaHours <= 0) return 'resetting';
  return `resets in ${duration(deltaHours)}`;
}

function glideFactorText(glide) {
  return glide?.glidePathFactor === null || glide?.glidePathFactor === undefined
    ? 'n/a'
    : glide.glidePathFactor.toFixed(2);
}

function glideStatusText(glide) {
  if (!glide) return 'unavailable';
  return glide.status || 'unknown';
}

function rateText(value, label) {
  return value === null || value === undefined
    ? `${label} n/a`
    : `${label} ${value.toFixed(2)}%/h`;
}

function glideNotes(glide) {
  if (!glide) return 'n/a';
  return [
    rateText(glide.averageBurnRatePercentPerHour, 'avg'),
    rateText(glide.sustainableRatePercentPerHour, 'need'),
  ].join('; ');
}

function resetCreditNote(result) {
  const candidates = [];
  const summary = result.metadata?.resetCreditSummary;
  if (summary?.nextExpirationAt) candidates.push(summary);
  for (const window of result.windows) {
    const reset = window.glidePath?.withOneReset;
    if (reset?.nextExpirationAt) candidates.push(reset);
  }
  const reset = candidates.sort(
    (left, right) => Date.parse(left.nextExpirationAt) - Date.parse(right.nextExpirationAt),
  )[0];
  if (!reset) return null;

  const expiry = reset.nextExpirationInHours === null || reset.nextExpirationInHours === undefined
    ? 'expiry unknown'
    : `${new Date(reset.nextExpirationAt).toLocaleString()} (in ${duration(reset.nextExpirationInHours)})`;
  return `next reset credit expires ${expiry}`;
}

function oneResetGlideView(window, glide, reset) {
  const multiplier = reset.capacityMultiplier || 2;
  const usedPercent = window.usedPercent === null || window.usedPercent === undefined
    ? null
    : window.usedPercent / multiplier;
  const remainingPercent = usedPercent === null ? null : 100 - usedPercent;
  const sustainableRatePercentPerHour = remainingPercent !== null
    && glide.hoursUntilReset !== null
    && glide.hoursUntilReset !== undefined
    && glide.hoursUntilReset > 0
    ? remainingPercent / glide.hoursUntilReset
    : null;

  return {
    ...glide,
    usedPercent,
    remainingPercent,
    averageBurnRatePercentPerHour: glide.averageBurnRatePercentPerHour === null
      || glide.averageBurnRatePercentPerHour === undefined
      ? null
      : glide.averageBurnRatePercentPerHour / multiplier,
    sustainableRatePercentPerHour,
  };
}

function renderTable(headers, rows) {
  const allRows = [headers, ...rows];
  const widths = headers.map((_, column) => Math.max(
    ...allRows.map((row) => String(row[column] ?? '').length),
  ));
  const rule = `+${widths.map((width) => '-'.repeat(width + 2)).join('+')}+`;
  const renderRow = (row) => `| ${row.map((value, column) => String(value ?? '').padEnd(widths[column])).join(' | ')} |`;
  return [rule, renderRow(headers), rule, ...rows.map(renderRow), rule].join('\n');
}

function windowRows(result, now) {
  const rows = [];
  for (const window of result.windows) {
    const glide = window.glidePath;
    rows.push([
      window.label,
      percent(window.usedPercent),
      percent(window.remainingPercent),
      resetText(window.resetAt, now),
      percent(glide?.elapsedTimePercent),
      glideFactorText(glide),
      glideStatusText(glide),
      glideNotes(glide),
    ]);

    const reset = glide?.withOneReset;
    if (reset && reset.glidePathFactor !== null && reset.glidePathFactor !== undefined) {
      const resetGlide = oneResetGlideView(window, glide, reset);
      rows.push([
        `${window.label}@1 reset`,
        percent(resetGlide.usedPercent),
        percent(resetGlide.remainingPercent),
        resetText(window.resetAt, now),
        percent(resetGlide.elapsedTimePercent),
        reset.glidePathFactor.toFixed(2),
        reset.status,
        glideNotes(resetGlide),
      ]);
    }
  }
  return rows;
}

export function formatHuman(payload, now = Date.now()) {
  const lines = [`quota-meter · ${new Date(payload.generatedAt).toLocaleString()}`];
  const headers = ['Window', 'Used', 'Left', 'Reset', 'Elapsed', 'Glide', 'Status', 'Notes'];
  for (const result of payload.providers) {
    const plan = result.plan ? ` · ${result.plan}` : '';
    lines.push(`\n${result.displayName}${plan} [${result.status}]`);
    if (result.status !== 'ok') {
      if (result.error?.message) lines.push(`  ${result.error.message}`);
      if (result.loginCommand) lines.push(`  login: ${result.loginCommand}`);
      continue;
    }

    lines.push(renderTable(headers, windowRows(result, now)));
    const note = resetCreditNote(result);
    if (note) lines.push(`  notes: ${note}`);
  }
  return lines.join('\n');
}

export function formatProviders(providers) {
  return providers.map((provider) => `${provider.id}\t${provider.name}\tlogin: ${provider.loginCommand}`).join('\n');
}