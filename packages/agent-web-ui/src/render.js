import { NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY, normalizeNarsClientProjectionVerbosity, projectRuntimeEvent, shouldRenderRuntimeProjection } from './runtime-events.js';

export function setText(id, text, documentRef = document) {
  const element = documentRef.getElementById(id);
  if (element) element.textContent = text;
}

function normalizeAssistantText(value) {
  return String(value ?? '').trim().replace(/\r\n/g, '\n');
}

function isDuplicateAssistantMessage(list, item, projection) {
  if (projection.kind !== 'assistant_message') return false;
  const summary = normalizeAssistantText(stringSummary(projection.summary || projection.event));
  if (!summary) return false;
  for (const child of Array.from(list.children ?? [])) {
    if (child === item) continue;
    if (child?.dataset?.eventKind !== 'assistant_message') continue;
    const childSummary = child?.dataset?.assistantSummary ?? child?.children?.at?.(1)?.children?.at?.(0)?.textContent ?? '';
    if (normalizeAssistantText(childSummary) === summary) return true;
  }
  item.dataset.assistantSummary = summary;
  return false;
}

function eventStore(documentRef) {
  if (!documentRef.__naradaAgentWebUiEvents) documentRef.__naradaAgentWebUiEvents = [];
  return documentRef.__naradaAgentWebUiEvents;
}

function accumulateStreamingProjection(item, projection) {
  if (projection.kind !== 'assistant_message_stream') return projection;
  const previous = item?.dataset?.streamContent ?? '';
  const next = `${previous}${stringSummary(projection.summary)}`;
  return { ...projection, summary: next, streamContent: next };
}

export function currentProjectionVerbosity(documentRef = document) {
  const element = documentRef.getElementById?.('projection-verbosity');
  return normalizeNarsClientProjectionVerbosity(element?.value ?? NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY);
}

export function appendEvent(event, documentRef = document, options = {}) {
  if (options.store !== false) eventStore(documentRef).push(event);
  renderEvent(event, documentRef, options);
}

function renderEvent(event, documentRef = document, options = {}) {
  const list = documentRef.getElementById('events');
  if (!list) return;
  let projection = projectRuntimeEvent(event);
  const verbosity = normalizeNarsClientProjectionVerbosity(options.verbosity ?? currentProjectionVerbosity(documentRef));
  if (!shouldRenderRuntimeProjection(projection, { verbosity })) return;
  const item = projection.renderKey ? findRenderedEvent(list, projection.renderKey) ?? documentRef.createElement('li') : documentRef.createElement('li');
  projection = accumulateStreamingProjection(item, projection);
  pruneSupersededAssistantStreams(list, projection);
  if (isDuplicateAssistantMessage(list, item, projection)) return;
  clearNode(item);
  item.className = `event event-${String(projection.kind).replace(/[^a-z0-9_-]/gi, '-')} event-tone-${projection.tone}`;
  item.dataset.eventKind = projection.kind;
  item.dataset.eventTone = projection.tone;
  if (projection.renderKey) item.dataset.eventRenderKey = projection.renderKey;
  if (projection.streamContent !== undefined) item.dataset.streamContent = projection.streamContent;

  const heading = documentRef.createElement('div');
  heading.className = 'event-heading';
  const label = documentRef.createElement('span');
  label.className = 'event-label';
  label.textContent = projection.label;
  const kind = documentRef.createElement('span');
  kind.className = 'event-kind';
  kind.textContent = projection.kind;
  heading.append(label, kind);

  const detail = documentRef.createElement('div');
  detail.className = 'event-detail';
  const summary = documentRef.createElement('div');
  summary.className = 'event-summary';
  summary.textContent = stringSummary(projection.summary || projection.event);
  detail.append(summary);
  if (verbosity === 'raw') {
    const raw = documentRef.createElement('details');
    raw.className = 'event-raw';
    const rawSummary = documentRef.createElement('summary');
    rawSummary.textContent = 'Raw event';
    const rawBody = documentRef.createElement('pre');
    rawBody.textContent = JSON.stringify(projection.event, null, 2);
    raw.append(rawSummary, rawBody);
    detail.append(raw);
  }
  item.append(heading, detail);
  if (!isRenderedEventChild(list, item)) list.append(item);
  list.scrollTop = list.scrollHeight;
}

function pruneSupersededAssistantStreams(list, projection) {
  if (projection.kind !== 'assistant_message') return;
  const finalSummary = stringSummary(projection.summary || projection.event);
  for (const child of Array.from(list.children ?? [])) {
    if (child?.dataset?.eventKind !== 'assistant_message_stream') continue;
    const streamContent = child?.dataset?.streamContent ?? child?.textContent ?? '';
    if (!streamContent || !finalSummary.startsWith(streamContent)) continue;
    if (typeof child.remove === 'function') child.remove();
    else if (Array.isArray(list.children)) {
      const index = list.children.indexOf(child);
      if (index >= 0) list.children.splice(index, 1);
    }
  }
}

export function rerenderEvents(documentRef = document, options = {}) {
  const events = [...eventStore(documentRef)];
  clearEvents(documentRef, { keepStore: true });
  for (const event of events) renderEvent(event, documentRef, { ...options, store: false });
}

function findRenderedEvent(list, renderKey) {
  for (const child of Array.from(list.children ?? [])) {
    if (child?.dataset?.eventRenderKey === renderKey) return child;
  }
  return null;
}

function isRenderedEventChild(list, item) {
  return Array.from(list.children ?? []).includes(item);
}

function clearNode(node) {
  if (typeof node.replaceChildren === 'function') {
    node.replaceChildren();
  } else if (Array.isArray(node.children)) {
    node.children.length = 0;
  }
  node.textContent = '';
}

function stringSummary(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

export function clearEvents(documentRef = document, options = {}) {
  const list = documentRef.getElementById('events');
  if (list) clearNode(list);
  if (!options.keepStore) documentRef.__naradaAgentWebUiEvents = [];
}
