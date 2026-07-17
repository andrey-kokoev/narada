export function cloudflareWebSocketEndpoint(endpoint, browserToken) {
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

export function applyCloudflareEventQuery(url, subscribeFrame, fallbackPageSize = 100) {
  const params = subscribeFrame?.params && typeof subscribeFrame.params === 'object' && !Array.isArray(subscribeFrame.params)
    ? subscribeFrame.params
    : {};
  if (params.since_sequence != null) url.searchParams.set('since_sequence', String(params.since_sequence));
  url.searchParams.set('max_events', String(params.page_size ?? fallbackPageSize));
  if (params.view) url.searchParams.set('view', params.view);
  return url;
}

export function cloudflareEventItemToRuntimeMessage(item) {
  const record = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
  const payload = record.payload ?? record;
  const sequence = typeof record.event_sequence === 'number'
    ? record.event_sequence
    : typeof record.sequence === 'number'
      ? record.sequence
      : null;
  if (sequence === null) return payload;
  return { event: 'session_event', payload, cursor: { sequence } };
}

export function cloudflareSubscriptionStarted({ requestId, subscriptionId, view = 'conversation', pageSize = 100, transport = 'cloudflare-projection' }) {
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

/**
 * @param {{ messages: unknown[], eventCount?: number, hasMore?: boolean, historyTruncated?: boolean, view?: string, cursor?: unknown, transport?: string }} options
 */
export function cloudflareEventsRead({ messages, eventCount, hasMore, historyTruncated, view = 'conversation', cursor = null, transport = 'cloudflare-projection-replay' }) {
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

/**
 * @param {{ requestId: string, subscriptionId: string, replayCount: number, hasMore?: boolean, historyTruncated?: boolean, view?: string, cursor?: unknown, transport?: string }} options
 */
export function cloudflareReplayCompleted({ requestId, subscriptionId, replayCount, hasMore, historyTruncated, view = 'conversation', cursor = null, transport = 'cloudflare-projection' }) {
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
