import { projectRuntimeEvent } from './runtime-events.js';

export function setText(id, text, documentRef = document) {
  const element = documentRef.getElementById(id);
  if (element) element.textContent = text;
}

export function appendEvent(event, documentRef = document) {
  const list = documentRef.getElementById('events');
  if (!list) return;
  const projection = projectRuntimeEvent(event);
  const item = documentRef.createElement('li');
  item.className = `event event-${String(projection.kind).replace(/[^a-z0-9_-]/gi, '-')} event-tone-${projection.tone}`;
  item.dataset.eventKind = projection.kind;
  item.dataset.eventTone = projection.tone;

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
  summary.textContent = projection.summary || JSON.stringify(projection.event, null, 2);
  detail.append(summary);
  item.append(heading, detail);
  list.append(item);
  list.scrollTop = list.scrollHeight;
}

export function clearEvents(documentRef = document) {
  const list = documentRef.getElementById('events');
  if (list) list.textContent = '';
}
