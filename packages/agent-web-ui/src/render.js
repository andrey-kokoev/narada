import { NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY, normalizeNarsClientProjectionVerbosity, projectRuntimeEvent, shouldRenderRuntimeProjection } from './runtime-events.js';

export function setText(id, text, documentRef = document) {
  const element = documentRef.getElementById(id);
  if (element) element.textContent = text;
}

function normalizeRenderableText(value) {
  return String(value ?? '').trim().replace(/\r\n/g, '\n');
}

function stripMarkdownHint(value) {
  return normalizeRenderableText(value).replace(/^\s*(markdown|md)\s*\n/i, '');
}

function looksLikeMarkdown(value) {
  const text = stripMarkdownHint(value);
  return text !== normalizeRenderableText(value)
    || /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|^\s*>\s+|^\s*#{1,6}\s+|^\s*\|.+\|\s*$|\n\s*\|?\s*:?-{3,}:?\s*\||\n\s*[-*+]\s+|\n\s*\d+\.\s+)/m.test(text);
}

function appendSummaryContent(container, value, documentRef) {
  const text = stringSummary(value);
  if (!looksLikeMarkdown(text)) {
    container.textContent = text;
    return;
  }
  container.append(createRenderedMarkdownFrame(stripMarkdownHint(text), documentRef));
}

function createRenderedMarkdownFrame(markdownText, documentRef) {
  const figure = documentRef.createElement('figure');
  figure.className = 'message-part rendered-part-frame';
  const header = documentRef.createElement('figcaption');
  header.className = 'rendered-part-header';
  const title = documentRef.createElement('span');
  title.className = 'rendered-part-title';
  title.textContent = 'markdown';
  const tabs = documentRef.createElement('span');
  tabs.className = 'rendered-part-tabs';
  const renderButton = createRenderedPartTab('Render', true, documentRef);
  const codeButton = createRenderedPartTab('Code', false, documentRef);
  tabs.append(codeButton, renderButton);
  header.append(title, tabs);

  const renderPanel = documentRef.createElement('div');
  renderPanel.className = 'rendered-part-render';
  renderPanel.append(renderMarkdownToDom(markdownText, documentRef));
  const codePanel = documentRef.createElement('div');
  codePanel.className = 'rendered-part-code';
  codePanel.hidden = true;
  const language = documentRef.createElement('figcaption');
  language.textContent = 'markdown';
  const pre = documentRef.createElement('pre');
  const code = documentRef.createElement('code');
  code.textContent = markdownText;
  pre.append(code);
  codePanel.append(language, pre);

  const activate = (view) => {
    const renderActive = view === 'render';
    renderPanel.hidden = !renderActive;
    codePanel.hidden = renderActive;
    renderButton.dataset.active = renderActive ? 'true' : 'false';
    codeButton.dataset.active = renderActive ? 'false' : 'true';
    renderButton.className = `rendered-part-tab${renderActive ? ' is-active' : ''}`;
    codeButton.className = `rendered-part-tab${renderActive ? '' : ' is-active'}`;
  };
  renderButton.addEventListener?.('click', () => activate('render'));
  codeButton.addEventListener?.('click', () => activate('code'));
  figure.append(header, renderPanel, codePanel);
  return figure;
}

function createRenderedPartTab(label, active, documentRef) {
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.className = `rendered-part-tab${active ? ' is-active' : ''}`;
  button.dataset.active = active ? 'true' : 'false';
  button.textContent = label;
  return button;
}

function renderMarkdownToDom(markdownText, documentRef) {
  const wrapper = documentRef.createElement('div');
  wrapper.className = 'message-markdown';
  const lines = markdownText.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    const table = tryParseMarkdownTable(lines, index, documentRef);
    if (table) {
      wrapper.append(table.node);
      index = table.endIndex;
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const node = documentRef.createElement(`h${heading[1].length}`);
      node.textContent = heading[2];
      wrapper.append(node);
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const list = documentRef.createElement('ul');
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        const item = documentRef.createElement('li');
        item.textContent = lines[index].replace(/^\s*[-*+]\s+/, '');
        list.append(item);
        index += 1;
      }
      index -= 1;
      wrapper.append(list);
      continue;
    }
    const paragraph = documentRef.createElement('p');
    paragraph.textContent = line;
    wrapper.append(paragraph);
  }
  return wrapper;
}

function tryParseMarkdownTable(lines, startIndex, documentRef) {
  if (!isMarkdownTableRow(lines[startIndex]) || !isMarkdownTableDivider(lines[startIndex + 1] ?? '')) return null;
  const table = documentRef.createElement('table');
  const thead = documentRef.createElement('thead');
  const headerRow = documentRef.createElement('tr');
  for (const cell of splitMarkdownTableRow(lines[startIndex])) {
    const th = documentRef.createElement('th');
    th.textContent = cell;
    headerRow.append(th);
  }
  thead.append(headerRow);
  table.append(thead);
  const tbody = documentRef.createElement('tbody');
  let index = startIndex + 2;
  while (index < lines.length && isMarkdownTableRow(lines[index])) {
    const row = documentRef.createElement('tr');
    for (const cell of splitMarkdownTableRow(lines[index])) {
      const td = documentRef.createElement('td');
      td.textContent = cell;
      row.append(td);
    }
    tbody.append(row);
    index += 1;
  }
  table.append(tbody);
  return { node: table, endIndex: index - 1 };
}

function isMarkdownTableRow(line) {
  return /^\s*\|.+\|\s*$/.test(line ?? '');
}

function isMarkdownTableDivider(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line ?? '');
}

function splitMarkdownTableRow(line) {
  return String(line ?? '').trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
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
  appendSummaryContent(summary, projection.summary || projection.event, documentRef);
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
