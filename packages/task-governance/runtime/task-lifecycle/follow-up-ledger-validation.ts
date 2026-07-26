const FOLLOW_UP_LEDGER_HEADING: any = 'Follow-Up Ledger';
const ACCEPTED_LEDGER_ENTRY_EXAMPLES: any = [
  'created #N: <task or residual summary>',
  'covered by #N: <existing task or evidence summary>',
  'envelope env_<id>: <residual or routing summary>',
  'CAPA <capa_id>: <corrective-action summary>',
  'deferred: <reason and revisit condition>',
  'no follow-up needed: <rationale>',
];
const FOLLOW_UP_LEDGER_REMEDIATION: any = `Accepted Follow-Up Ledger line forms: ${ACCEPTED_LEDGER_ENTRY_EXAMPLES.map((entry: any) : any => `\`${entry}\``).join(', ')}. Prefix matching is case-insensitive, but use these exact prefixes for readability.`;

function extractSection(body: any, heading: any) : any {
  const pattern: any = new RegExp(`^##\\s+${escapeRegex(heading)}\\s*$`, 'mi');
  const match: any = body.match(pattern);
  if (!match) return null;
  const start: any = match.index + match[0].length;
  const rest: any = body.slice(start);
  const nextHeading: any = rest.match(/^##\s/m);
  const end: any = nextHeading ? start + nextHeading.index : body.length;
  return body.slice(start, end).trim();
}

function escapeRegex(value: any) : any {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function needsFollowUpLedger(body: any) : any {
  const dispositionSignal: any = /\b(disposition|acknowledge(?:d)?|acknowledge(?:d)? with corrections|dismiss(?:ed)?|escalat(?:e|ed|ion)|supersed(?:e|ed)|stale|remaining)\b/i;
  const followUpSignal: any = /\b(follow-?up|remaining (?:work|concern|finding)s?|split(?:ting)?|create(?:d)? (?:a )?(?:follow-?up )?task|covered by|deferred)\b/i;
  return dispositionSignal.test(body) && followUpSignal.test(body);
}

function normalizeLedgerLine(line: any) : any {
  return line
    .trim()
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .trim();
}

function isValidLedgerEntry(line: any) : any {
  const normalized: any = normalizeLedgerLine(line);
  if (/\b(created|covered by)\s+#\d+\b/i.test(normalized)) return true;
  if (/\benvelope\s+env_[A-Za-z0-9_-]+\s*:\s*\S.{10,}/i.test(normalized)) return true;
  if (/\bCAPA\s+(?:capa_[A-Za-z0-9_-]+|env_[A-Za-z0-9_-]+|[A-Za-z][A-Za-z0-9_-]{3,})\s*:\s*\S.{10,}/i.test(normalized)) return true;
  if (/\bdeferred\s*:\s*\S.{10,}/i.test(normalized)) return true;
  if (/\bno follow-?up needed\s*:\s*\S.{10,}/i.test(normalized)) return true;
  return false;
}

function ledgerLines(section: any) : any {
  return section
    .split(/\r?\n/)
    .map((line: any) : any => line.trim())
    .filter((line: any) : any => line.length > 0 && !line.startsWith('<!--'));
}

export function validateFollowUpLedger(body: any) : any {
  if (!needsFollowUpLedger(body)) {
    return { ok: true, required: false, errors: [], ledger: null };
  }

  const ledger: any = extractSection(body, FOLLOW_UP_LEDGER_HEADING);
  const baseError: any = `Follow-Up Ledger required: disposition preserves remaining work but no valid ledger entry links created tasks, existing tasks, deferral, or no-follow-up rationale. ${FOLLOW_UP_LEDGER_REMEDIATION}`;
  if (!ledger) {
    return { ok: false, required: true, errors: [baseError], ledger: null };
  }

  const entries: any = ledgerLines(ledger);
  if (entries.length === 0) {
    return { ok: false, required: true, errors: [baseError], ledger };
  }

  const invalidEntries: any = entries.filter((line: any) : any => !isValidLedgerEntry(line));
  if (invalidEntries.length > 0) {
    return {
      ok: false,
      required: true,
      errors: [
        `${baseError} Invalid ledger entries: ${invalidEntries.map((line: any) : any => `"${normalizeLedgerLine(line)}"`).join('; ')}`,
      ],
      ledger,
    };
  }

  return { ok: true, required: true, errors: [], ledger };
}

export { FOLLOW_UP_LEDGER_HEADING };
