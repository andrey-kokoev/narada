import { isRecord, type UnknownRecord } from '../types.ts';

export function cloudflareWebSocketEndpoint(endpoint: string, browserToken?: string | null): string {
  const url = new URL(endpoint);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  let path = url.pathname.replace(/\/+$/, '');
  if (path.endsWith('/events/websocket')) {
    // The endpoint may already be the websocket form; keep it idempotent.
  } else if (path.endsWith('/events')) {
    path = `${path}/websocket`;
  } else {
    path = `${path}/websocket`;
  }
  url.pathname = path || '/websocket';
  if (browserToken) url.searchParams.set('browser_token', browserToken);
  return url.href;
}

export function applyCloudflareEventQuery(
  url: URL,
  subscribeFrame: unknown,
  fallbackPageSize = 100,
): URL {
  const params = isRecord(subscribeFrame) && isRecord(subscribeFrame.params)
    ? subscribeFrame.params
    : {};
  if (params.since_sequence != null) url.searchParams.set('since_sequence', String(params.since_sequence));
  url.searchParams.set('max_events', String(params.page_size ?? fallbackPageSize));
  if (params.view) url.searchParams.set('view', String(params.view));
  return url;
}

export function cloudflareEventItemToRuntimeMessage(item: unknown): unknown {
  const record: UnknownRecord = isRecord(item) ? item : {};
  const payload = record.payload ?? record;
  const sequence = typeof record.event_sequence === 'number'
    ? record.event_sequence
    : typeof record.sequence === 'number'
      ? record.sequence
      : null;
  if (sequence === null) return payload;
  return { event: 'session_event', payload, cursor: { sequence } };
}

type SubscriptionOptions = {
  requestId: string;
  subscriptionId: string;
  view?: string;
  pageSize?: number;
  transport?: string;
};

export function cloudflareSubscriptionStarted({
  requestId,
  subscriptionId,
  view = 'conversation',
  pageSize = 100,
  transport = 'cloudflare-projection',
}: SubscriptionOptions): UnknownRecord {
  return {
    schema: 'narada.nars.events.subscription.v1',
    event: 'session_events_subscription_started',
    request_id: requestId,
    subscription_id: subscriptionId,
    transport,
    view,
    include_replay: true,
    page_size: pageSize,
  };
}

type EventsReadOptions = {
  messages: readonly unknown[];
  eventCount?: number;
  hasMore?: boolean;
  historyTruncated?: boolean;
  view?: string;
  cursor?: unknown;
  transport?: string;
};

export function cloudflareEventsRead({
  messages,
  eventCount,
  hasMore,
  historyTruncated,
  view = 'conversation',
  cursor = null,
  transport = 'cloudflare-projection-replay',
}: EventsReadOptions): UnknownRecord {
  return {
    event: 'session_events_read',
    transport,
    method: 'session.events.read',
    events: messages,
    event_count: eventCount ?? messages.length,
    has_more: Boolean(hasMore),
    truncated: Boolean(historyTruncated),
    history_truncated: Boolean(historyTruncated),
    view,
    cursor,
  };
}

type ReplayCompletedOptions = {
  requestId: string;
  subscriptionId: string;
  replayCount: number;
  hasMore?: boolean;
  historyTruncated?: boolean;
  view?: string;
  cursor?: unknown;
  transport?: string;
};

export function cloudflareReplayCompleted({
  requestId,
  subscriptionId,
  replayCount,
  hasMore,
  historyTruncated,
  view = 'conversation',
  cursor = null,
  transport = 'cloudflare-projection',
}: ReplayCompletedOptions): UnknownRecord {
  return {
    schema: 'narada.nars.events.subscription.v1',
    event: 'session_events_replay_completed',
    request_id: requestId,
    subscription_id: subscriptionId,
    transport,
    view,
    replay_count: replayCount,
    has_more: Boolean(hasMore),
    truncated: Boolean(historyTruncated),
    history_truncated: Boolean(historyTruncated),
    cursor,
  };
}
