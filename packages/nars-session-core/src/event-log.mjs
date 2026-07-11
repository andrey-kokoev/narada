import { existsSync, readFileSync } from 'node:fs';

export const NARS_EVENTS_READ_SCHEMA = 'narada.nars.events.read.v1';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

export function eventMatchesNarsFilters(event, filters = {}) {
  if (!filters || typeof filters !== 'object') return true;
  const eventKind = event?.event ?? event?.event_kind ?? null;
  const kinds = Array.isArray(filters.event_kinds) ? filters.event_kinds : Array.isArray(filters.kinds) ? filters.kinds : null;
  if (kinds && !kinds.includes(eventKind)) return false;
  const families = Array.isArray(filters.families) ? filters.families : null;
  if (families?.length) {
    const family = String(eventKind ?? '').startsWith('session_') ? 'session' : 'turn';
    if (!families.includes(family)) return false;
  }
  if (filters.request_id && event?.request_id !== filters.request_id) return false;
  if (filters.turn_id && event?.turn_id !== filters.turn_id) return false;
  return true;
}

export function readNarsEventLogPage({
  eventsPath,
  afterSequence = null,
  beforeSequence = null,
  sinceTimestamp = null,
  filters = {},
  limit = DEFAULT_LIMIT,
  direction = null,
} = {}) {
  const boundedLimit = boundedPositiveInteger(limit, DEFAULT_LIMIT, MAX_LIMIT);
  const requestedDirection = direction ?? (beforeSequence == null ? 'forward' : 'backward');
  const allEvents = readNarsEventLog(eventsPath);
  const effectiveSinceTimestamp = hasSequenceCursor(afterSequence) ? null : sinceTimestamp;
  const filtered = allEvents.events.filter((event) => eventInPageWindow(event, { afterSequence, beforeSequence, sinceTimestamp: effectiveSinceTimestamp }) && eventMatchesNarsFilters(event, filters));
  let events;
  let hasMore = false;
  if (requestedDirection === 'backward') {
    hasMore = filtered.length > boundedLimit;
    events = filtered.slice(Math.max(0, filtered.length - boundedLimit));
  } else {
    hasMore = filtered.length > boundedLimit;
    events = filtered.slice(0, boundedLimit);
  }
  const first = events.at(0) ?? null;
  const last = events.at(-1) ?? null;
  const lastSequence = allEvents.events.at(-1)?.event_sequence ?? allEvents.events.at(-1)?.sequence ?? null;
  return {
    schema: NARS_EVENTS_READ_SCHEMA,
    status: 'ok',
    source: 'events_jsonl',
    events_path: eventsPath ?? null,
    direction: requestedDirection,
    limit: boundedLimit,
    event_count: events.length,
    has_more: hasMore,
    first_sequence: first?.event_sequence ?? first?.sequence ?? null,
    last_sequence: last?.event_sequence ?? last?.sequence ?? null,
    cursor: {
      before_sequence: first?.event_sequence ?? first?.sequence ?? beforeSequence ?? null,
      after_sequence: last?.event_sequence ?? last?.sequence ?? afterSequence ?? null,
      last_sequence: lastSequence,
      next_sequence: Number.isFinite(Number(lastSequence)) ? Number(lastSequence) + 1 : 1,
    },
    corrupt_line_count: allEvents.corruptLineCount,
    events,
  };
}

export function readNarsEventLog(eventsPath) {
  if (!eventsPath || !existsSync(eventsPath)) return { events: [], corruptLineCount: 0 };
  const events = [];
  let corruptLineCount = 0;
  for (const line of readFileSync(eventsPath, 'utf8').split(/\r?\n/).filter(Boolean)) {
    try {
      const event = JSON.parse(line);
      if (event && typeof event === 'object') events.push(event);
    } catch {
      corruptLineCount += 1;
    }
  }
  return { events, corruptLineCount };
}

function eventInPageWindow(event, { afterSequence, beforeSequence, sinceTimestamp }) {
  const sequence = Number(event?.event_sequence ?? event?.sequence ?? 0);
  const after = optionalInteger(afterSequence);
  const before = optionalInteger(beforeSequence);
  if (Number.isFinite(after) && sequence <= after) return false;
  if (Number.isFinite(before) && sequence >= before) return false;
  if (sinceTimestamp) {
    const sinceTime = Date.parse(String(sinceTimestamp));
    const eventTime = Date.parse(String(event?.timestamp ?? event?.generated_at ?? ''));
    if (Number.isFinite(sinceTime) && Number.isFinite(eventTime) && eventTime <= sinceTime) return false;
  }
  return true;
}

function hasSequenceCursor(value) {
  return Number.isFinite(optionalInteger(value));
}

function optionalInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  return Number.parseInt(String(value), 10);
}

function boundedPositiveInteger(value, defaultValue, max) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return defaultValue;
  return Math.min(parsed, max);
}
