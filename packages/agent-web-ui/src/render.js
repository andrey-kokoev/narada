import { createSessionProjection, classifyRuntimeMessage } from './session-projection.js';
import { NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY, normalizeNarsClientProjectionVerbosity, projectRuntimeEvent, shouldRenderRuntimeProjection } from './runtime-events.js';

export function setText(id, text, documentRef = document) {
  const element = documentRef.getElementById(id);
  if (element) element.textContent = text;
}

function pruneSupersededOperatorEcho(list, projection) {
  if (projection.kind !== 'user_message') return;
  const summary = normalizeAssistantText(stringSummary(projection.summary || projection.event));
  if (!summary) return;
  const scope = eventScope(projection.event);
  for (const child of Array.from(list.children ?? [])) {
    if (child?.dataset?.eventKind !== 'operator_input_submitted') continue;
    if (!sameDatasetOperatorScope(child.dataset, scope)) continue;
    if (normalizeAssistantText(child.dataset.operatorSummary ?? child.textContent ?? '') !== summary) continue;
    if (typeof child.remove === 'function') child.remove();
    else if (Array.isArray(list.children)) {
      const index = list.children.indexOf(child);
      if (index >= 0) list.children.splice(index, 1);
    }
  }
}

function isDuplicateOperatorMessage(list, item, projection) {
  if (!isOperatorProjection(projection)) return false;
  const summary = normalizeAssistantText(stringSummary(projection.summary || projection.event));
  if (!summary) return false;
  for (const child of Array.from(list.children ?? [])) {
    if (child === item) continue;
    if (!isOperatorEventKind(child?.dataset?.eventKind)) continue;
    if (!sameDatasetOperatorScope(child.dataset, eventScope(projection.event))) continue;
    const childSummary = normalizeAssistantText(child?.dataset?.operatorSummary ?? child?.textContent ?? '');
    if (childSummary === summary) return true;
  }
  item.dataset.operatorSummary = summary;
  return false;
}

function sessionIdFromProjection(projection) {
  const event = projection?.event ?? {};
  const nested = event?.event ?? {};
  return String(event.session_id ?? nested.session_id ?? '').trim() || null;
}

function appendStructuredSummaryContent(container, parts, documentRef, context = {}) {
  for (const part of parts) {
    if (part?.type === 'artifact_ref' && part.artifact_id) {
      container.append(createArtifactReferenceCard(part, documentRef, context));
      continue;
    }
    if ((part?.type === 'markdown' || part?.type === 'text') && typeof part.text === 'string') {
      appendSummaryContent(container, part.text, documentRef, context);
      continue;
    }
    appendSummaryContent(container, stringSummary(part), documentRef, context);
  }
}

function createArtifactReferenceCard(part, documentRef, context = {}) {
  const basePath = injectedArtifactBasePath(documentRef);
  const artifactTransport = injectedArtifactTransport(documentRef);
  const browserToken = injectedBrowserToken(documentRef);
  const sessionId = String(context.sessionId ?? part.session_id ?? '').trim();
  const artifactId = String(part.artifact_id);
  const contentPath = artifactContentPath({ basePath, artifactTransport, sessionId, artifactId, browserToken });
  const card = documentRef.createElement('section');
  card.className = 'artifact-card';
  card.dataset.kind = String(part.kind ?? 'artifact');
  const header = documentRef.createElement('header');
  header.className = 'artifact-card-header';
  const titleWrap = documentRef.createElement('div');
  const title = documentRef.createElement('div');
  title.className = 'artifact-title';
  title.textContent = String(part.title ?? artifactId);
  const meta = documentRef.createElement('div');
  meta.className = 'artifact-meta';
  meta.textContent = `${part.kind ?? 'artifact'} artifact`;
  titleWrap.append(title, meta);
  const actions = documentRef.createElement('div');
  actions.className = 'artifact-actions';
  if (contentPath) {
    const open = documentRef.createElement('a');
    open.href = contentPath;
    open.target = '_blank';
    open.rel = 'noreferrer';
    open.textContent = 'Open';
    actions.append(open);
  }
  header.append(titleWrap, actions);
  card.append(header);
  if (String(part.kind ?? '') === 'html' && contentPath) {
    const frame = documentRef.createElement('iframe');
    frame.className = 'artifact-html-preview';
    frame.sandbox = 'allow-scripts allow-forms';
    frame.src = contentPath;
    frame.title = String(part.title ?? artifactId);
    card.append(frame);
  } else {
    const status = documentRef.createElement('p');
    status.className = 'artifact-status';
    status.textContent = contentPath ? 'Preview is not available for this artifact type. Use Open to view it.' : 'Artifact session is not available for this message.';
    card.append(status);
  }
  return card;
}

function injectedArtifactBasePath(documentRef) {
  try {
    const text = documentRef.getElementById?.('nars-config')?.textContent;
    if (!text) return null;
    const parsed = JSON.parse(text);
    return parsed.artifactBasePath ?? parsed.artifact_base_path ?? null;
  } catch {
    return null;
  }
}

function injectedArtifactTransport(documentRef) {
  try {
    const text = documentRef.getElementById?.('nars-config')?.textContent;
    if (!text) return null;
    const parsed = JSON.parse(text);
    return parsed.artifactTransport ?? parsed.artifact_transport ?? null;
  } catch {
    return null;
  }
}

function injectedBrowserToken(documentRef) {
  try {
    const text = documentRef.getElementById?.('nars-config')?.textContent;
    if (!text) return null;
    const parsed = JSON.parse(text);
    return parsed.browserToken ?? parsed.browser_token ?? null;
  } catch {
    return null;
  }
}

function withBrowserToken(url, browserToken) {
  if (!browserToken) return url;
  const parsed = new URL(url);
  parsed.searchParams.set('browser-token', browserToken);
  return parsed.toString();
}

function artifactContentPath({ basePath, artifactTransport, sessionId, artifactId, browserToken }) {
  const normalizedBasePath = basePath?.replace(/\/+$/, '') ?? null;
  if (!normalizedBasePath || !artifactId) return null;
  if (artifactTransport === 'cloudflare-projection' || artifactTransport === 'cloudflare-authority') return withBrowserToken(`${normalizedBasePath}/${encodeURIComponent(artifactId)}/content`, browserToken);
  if (!sessionId) return null;
  return `${normalizedBasePath}/sessions/${encodeURIComponent(sessionId)}/artifacts/${encodeURIComponent(artifactId)}/content`;
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

function appendSummaryContent(container, value, documentRef, context = {}) {
  if (Array.isArray(value)) {
    appendStructuredSummaryContent(container, value, documentRef, context);
    return;
  }
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
  const tabs = documentRef.createElement('div');
  tabs.className = 'rendered-part-tabs';
  tabs.setAttribute?.('role', 'tablist');
  tabs.setAttribute?.('aria-label', 'markdown view');
  const renderButton = createRenderedPartTab('Render', true, documentRef);
  const codeButton = createRenderedPartTab('Code', false, documentRef);
  tabs.append(renderButton, codeButton);

  const renderPanel = documentRef.createElement('div');
  renderPanel.className = 'rendered-part-render';
  renderPanel.setAttribute?.('role', 'tabpanel');
  renderPanel.append(renderMarkdownToDom(markdownText, documentRef));
  const codePanel = documentRef.createElement('div');
  codePanel.className = 'rendered-part-code';
  codePanel.setAttribute?.('role', 'tabpanel');
  codePanel.hidden = true;
  const toolbar = documentRef.createElement('div');
  toolbar.className = 'rendered-part-code-toolbar';
  const codeTitle = documentRef.createElement('span');
  codeTitle.className = 'rendered-part-code-title';
  codeTitle.textContent = 'markdown';
  const copyButton = documentRef.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'rendered-part-copy';
  copyButton.textContent = 'Copy';
  copyButton.addEventListener?.('click', async () => {
    try {
      await globalThis.navigator?.clipboard?.writeText?.(markdownText);
      copyButton.textContent = 'Copied';
    } catch {
      copyButton.textContent = 'Failed';
    }
    globalThis.setTimeout?.(() => {
      copyButton.textContent = 'Copy';
    }, 1400);
  });
  toolbar.append(codeTitle, copyButton);
  const pre = documentRef.createElement('pre');
  const code = documentRef.createElement('code');
  code.textContent = markdownText;
  pre.append(code);
  codePanel.append(toolbar, pre);

  const activate = (view) => {
    const renderActive = view === 'render';
    renderPanel.hidden = !renderActive;
    codePanel.hidden = renderActive;
    renderButton.dataset.active = renderActive ? 'true' : 'false';
    codeButton.dataset.active = renderActive ? 'false' : 'true';
    renderButton.className = `rendered-part-tab${renderActive ? ' is-active' : ''}`;
    codeButton.className = `rendered-part-tab${renderActive ? '' : ' is-active'}`;
    renderButton.setAttribute?.('aria-selected', renderActive ? 'true' : 'false');
    codeButton.setAttribute?.('aria-selected', renderActive ? 'false' : 'true');
  };
  renderButton.addEventListener?.('click', () => activate('render'));
  codeButton.addEventListener?.('click', () => activate('code'));
  figure.append(renderPanel, codePanel, tabs);
  return figure;
}
function createRenderedPartTab(label, active, documentRef) {
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.className = `rendered-part-tab${active ? ' is-active' : ''}`;
  button.dataset.active = active ? 'true' : 'false';
  button.textContent = label;
  button.setAttribute?.('role', 'tab');
  button.setAttribute?.('aria-selected', active ? 'true' : 'false');
  return button;
}

function renderMarkdownToDom(markdownText, documentRef) {
  const wrapper = documentRef.createElement('div');
  wrapper.className = 'message-markdown';
  const lines = markdownText.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    const fence = line.match(/^```([^`]*)\s*$/);
    if (fence) {
      const block = documentRef.createElement('pre');
      const code = documentRef.createElement('code');
      const language = String(fence[1] ?? '').trim();
      if (language) code.className = `language-${language}`;
      const content = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        content.push(lines[index]);
        index += 1;
      }
      code.textContent = content.join('\n');
      block.append(code);
      wrapper.append(block);
      continue;
    }
    const table = tryParseMarkdownTable(lines, index, documentRef);
    if (table) {
      wrapper.append(table.node);
      index = table.endIndex;
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const node = documentRef.createElement(`h${heading[1].length}`);
      appendInlineMarkdown(node, heading[2], documentRef);
      wrapper.append(node);
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const list = documentRef.createElement('ul');
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        const item = documentRef.createElement('li');
        appendInlineMarkdown(item, lines[index].replace(/^\s*[-*+]\s+/, ''), documentRef);
        list.append(item);
        index += 1;
      }
      index -= 1;
      wrapper.append(list);
      continue;
    }
    const paragraph = documentRef.createElement('p');
    appendInlineMarkdown(paragraph, line, documentRef);
    wrapper.append(paragraph);
  }
  return wrapper;
}

function appendInlineMarkdown(parent, text, documentRef) {
  const segments = String(text ?? '').split(/(`[^`]+`)/g).filter((segment) => segment.length > 0);
  for (const segment of segments) {
    if (/^`[^`]+`$/.test(segment)) {
      const code = documentRef.createElement('code');
      code.textContent = segment.slice(1, -1);
      parent.append(code);
      continue;
    }
    parent.append(documentRef.createTextNode(segment));
  }
}

function tryParseMarkdownTable(lines, startIndex, documentRef) {
  if (!isMarkdownTableRow(lines[startIndex]) || !isMarkdownTableDivider(lines[startIndex + 1] ?? '')) return null;
  const table = documentRef.createElement('table');
  const thead = documentRef.createElement('thead');
  const headerRow = documentRef.createElement('tr');
  for (const cell of splitMarkdownTableRow(lines[startIndex])) {
    const th = documentRef.createElement('th');
    appendInlineMarkdown(th, cell, documentRef);
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
      appendInlineMarkdown(td, cell, documentRef);
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
  renderActivityIndicator(documentRef);
}

function renderActivityIndicator(documentRef) {
  const list = documentRef.getElementById('events');
  if (!list) return;
  const activity = activityFromEvents(eventStore(documentRef));
  const verbosity = currentProjectionVerbosity(documentRef);
  removeActivityIndicator(list);
  if (!activity.active || (verbosity !== 'conversation' && verbosity !== 'operations')) return;
  const item = documentRef.createElement('li');
  item.id = 'agent-activity-indicator';
  item.className = 'event event-agent-activity event-tone-assistant';
  item.dataset.eventKind = `activity_${activity.state}`;
  item.dataset.eventTone = 'assistant';
  const heading = documentRef.createElement('div');
  heading.className = 'event-heading';
  const label = documentRef.createElement('span');
  label.className = 'event-label';
  label.textContent = 'Activity';
  const kind = documentRef.createElement('span');
  kind.className = 'event-kind';
  kind.textContent = activity.state;
  heading.append(label, kind);
  const detail = documentRef.createElement('div');
  detail.className = 'event-detail';
  const summary = documentRef.createElement('div');
  summary.className = 'event-summary agent-activity-summary';
  const pulse = documentRef.createElement('span');
  pulse.className = 'activity-pulse';
  const text = documentRef.createElement('span');
  text.textContent = activity.label;
  summary.append(pulse, text);
  if (activity.detail) {
    const detailText = documentRef.createElement('span');
    detailText.className = 'agent-activity-detail';
    detailText.textContent = activity.detail;
    summary.append(detailText);
  }
  detail.append(summary);
  item.append(heading, detail);
  list.append(item);
}

function removeActivityIndicator(list) {
  for (const child of Array.from(list.children ?? [])) {
    if (child?.id !== 'agent-activity-indicator') continue;
    if (typeof child.remove === 'function') child.remove();
    else if (Array.isArray(list.children)) {
      const index = list.children.indexOf(child);
      if (index >= 0) list.children.splice(index, 1);
    }
  }
}

function activityFromEvents(events) {
  return createSessionProjection(events).activity;
}

function renderEvent(event, documentRef = document, options = {}) {
  const list = documentRef.getElementById('events');
  if (!list) return;
  if (classifyRuntimeMessage(event) === 'state_sample') return;
  let projection = projectRuntimeEvent(event);
  const verbosity = normalizeNarsClientProjectionVerbosity(options.verbosity ?? currentProjectionVerbosity(documentRef));
  if (!shouldRenderRuntimeProjection(projection, { verbosity })) return;
  const item = projection.renderKey ? findRenderedEvent(list, projection.renderKey) ?? documentRef.createElement('li') : documentRef.createElement('li');
  projection = accumulateStreamingProjection(item, projection);
  if (isSupersededLifecycleAssistantAggregate(list, projection)) return;
  pruneSupersededAssistantStreams(list, projection);
  pruneSupersededOperatorEcho(list, projection);
  if (isDuplicateAssistantMessage(list, item, projection)) return;
  if (isDuplicateOperatorMessage(list, item, projection)) return;
  const disposition = classifyRuntimeMessage(event);
  clearNode(item);
  item.className = [
    'event',
    `event-view-${verbosity}`,
    `event-disposition-${String(disposition).replace(/[^a-z0-9_-]/gi, '-')}`,
    `event-${String(projection.kind).replace(/[^a-z0-9_-]/gi, '-')}`,
    `event-tone-${projection.tone}`,
  ].join(' ');
  item.dataset.eventKind = projection.kind;
  item.dataset.eventTone = projection.tone;
  item.dataset.eventDisposition = disposition;
  if (projection.renderKey) item.dataset.eventRenderKey = projection.renderKey;
  if (projection.streamContent !== undefined) item.dataset.streamContent = projection.streamContent;
  if (projection.kind === 'assistant_message' || projection.kind === 'assistant_message_stream') {
    const scope = eventScope(projection.event);
    item.dataset.assistantAgentId = scope.agentId ?? '';
    item.dataset.assistantSessionId = scope.sessionId ?? '';
    item.dataset.assistantProviderMessage = isProviderAssistantMessage(projection.event) ? 'true' : 'false';
  }
  if (isOperatorProjection(projection)) {
    const scope = eventScope(projection.event);
    item.dataset.operatorSessionId = scope.sessionId ?? '';
    item.dataset.operatorSummary = normalizeAssistantText(stringSummary(projection.summary || projection.event));
  }

  const heading = documentRef.createElement('div');
  heading.className = 'event-heading';
  const label = documentRef.createElement('span');
  label.className = 'event-label';
  label.textContent = projection.label;
  heading.append(label);
  if (verbosity !== 'conversation') {
    const kind = documentRef.createElement('span');
    kind.className = 'event-kind';
    kind.textContent = projection.kind;
    heading.append(kind);
  }

  const detail = documentRef.createElement('div');
  detail.className = 'event-detail';
  const summary = documentRef.createElement('div');
  summary.className = 'event-summary';
  appendSummaryContent(summary, projection.summary || projection.event, documentRef, { sessionId: sessionIdFromProjection(projection) });
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
  const finalSummary = normalizeAssistantText(stringSummary(projection.summary || projection.event));
  for (const child of Array.from(list.children ?? [])) {
    if (child?.dataset?.eventKind !== 'assistant_message_stream' && child?.dataset?.eventKind !== 'assistant_message') continue;
    const priorSummary = normalizeAssistantText(child?.dataset?.assistantSummary ?? child?.dataset?.streamContent ?? child?.textContent ?? '');
    if (!priorSummary || priorSummary === finalSummary) continue;
    if (!finalSummary.includes(priorSummary)) continue;
    if (typeof child.remove === 'function') child.remove();
    else if (Array.isArray(list.children)) {
      const index = list.children.indexOf(child);
      if (index >= 0) list.children.splice(index, 1);
    }
  }
}

function isSupersededLifecycleAssistantAggregate(list, projection) {
  if (projection.kind !== 'assistant_message') return false;
  const event = projection.event;
  if (!event || typeof event !== 'object') return false;
  if (event.lifecycle_event !== 'assistant_message' || !event.turn_id) return false;
  const finalSummary = normalizeAssistantText(stringSummary(projection.summary || projection.event));
  if (!finalSummary) return false;
  const scope = eventScope(event);
  for (const child of Array.from(list.children ?? [])) {
    if (child?.dataset?.eventKind !== 'assistant_message') continue;
    if (child?.dataset?.assistantProviderMessage !== 'true') continue;
    if (!sameDatasetAssistantScope(child.dataset, scope)) continue;
    const priorSummary = normalizeAssistantText(child.dataset.assistantSummary ?? child.textContent ?? '');
    if (priorSummary && finalSummary.includes(priorSummary)) return true;
  }
  return false;
}

function isProviderAssistantMessage(event) {
  const providerEvent = event?.event;
  return Boolean(providerEvent && typeof providerEvent === 'object' && providerEvent.type === 'item.completed' && providerEvent.item?.type === 'agent_message');
}

function sameDatasetAssistantScope(dataset, scope) {
  const agentId = dataset?.assistantAgentId || null;
  const sessionId = dataset?.assistantSessionId || null;
  if (!agentId && !sessionId && !scope.agentId && !scope.sessionId) return true;
  return agentId === scope.agentId && sessionId === scope.sessionId;
}

function isOperatorProjection(projection) {
  return projection?.kind === 'user_message' || projection?.kind === 'operator_input_submitted';
}

function isOperatorEventKind(kind) {
  return kind === 'user_message' || kind === 'operator_input_submitted';
}

function sameDatasetOperatorScope(dataset, scope) {
  const sessionId = dataset?.operatorSessionId || null;
  if (!sessionId || !scope.sessionId) return true;
  return sessionId === scope.sessionId;
}

function eventScope(value) {
  if (!value || typeof value !== 'object') return { agentId: null, sessionId: null };
  return {
    agentId: value.agent_id ?? value.agentId ?? null,
    sessionId: value.session_id ?? value.sessionId ?? null,
  };
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
  if (Array.isArray(value)) return value.map((part) => stringSummary(part)).join('\n');
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

export function clearEvents(documentRef = document, options = {}) {
  const list = documentRef.getElementById('events');
  if (list) clearNode(list);
  if (!options.keepStore) documentRef.__naradaAgentWebUiEvents = [];
  renderActivityIndicator(documentRef);
}
