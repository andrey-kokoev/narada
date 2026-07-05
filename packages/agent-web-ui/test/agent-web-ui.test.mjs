import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import { resolveNaradaSitePaths } from '@narada2/site-paths';
import {
  buildConversationSendFrame,
  buildConversationEnqueueFrame,
  buildConversationSteerFrame,
  buildEventsReadFrame,
  buildOperatorInputAction,
  buildSubscribeFrame,
  isAgentWebUiNarsMethod,
  isAgentWebUiProtocolFrame,
  resolveAttachConfig,
  reconnectDelayForAttempt,
  projectRuntimeEvent,
  shouldRenderRuntimeEvent,
  startAgentWebUi,
  summarizeRuntimeEvent,
} from '../src/agent-web-ui.js';
import {
  buildClientConfig,
  parseAgentWebUiArgs,
  startAgentWebUiServer,
} from '../src/server.js';
import { createSessionProjection } from '../src/session-projection.js';
import {
  createEventHub,
  startEventStreamProjection,
  startHealthProjection,
} from '@narada2/agent-runtime-server/test-fixtures';
import { createCloudflareNarsProjectionWorker } from '@narada2/cloudflare-nars-projection/worker';
import { registerProjectionRemotely, startLocalProjectionBridgeOnce, deliverRemoteProjectionInputsOnce } from '@narada2/cloudflare-nars-projection/node';
import { appendEvent } from '../src/render.js';

async function connectWebSocket(url) {
  assert.equal(typeof WebSocket, 'function');
  const socket = new WebSocket(url);
  const queue = [];
  const waiters = [];
  socket.addEventListener('message', (message) => {
    const parsed = JSON.parse(String(message.data));
    const waiter = waiters.shift();
    if (waiter) waiter(parsed);
    else queue.push(parsed);
  });
  await once(socket, 'open');
  return {
    sendJson(payload) { socket.send(JSON.stringify(payload)); },
    async nextJson() {
      if (queue.length) return queue.shift();
      return new Promise((resolve) => waiters.push(resolve));
    },
    close() { socket.close(); },
  };
}

function createFakeAgentWebUiElements() {
  class FakeElement {
    constructor(id = null) {
      this.id = id;
      this.tagName = String(id ?? '').toUpperCase();
      this.children = [];
      this.listeners = new Map();
      this.textContent = '';
      this.value = '';
      this.dataset = {};
      this.className = '';
    }
    append(...children) { this.children.push(...children); }
    addEventListener(name, listener) { this.listeners.set(name, listener); }
    submit() { this.listeners.get('submit')?.({ preventDefault() {} }); }
    change() { this.listeners.get('change')?.({}); }
    setAttribute(name, value) { this[name] = value; }
  }
  const byId = new Map();
  for (const id of ['nars-config', 'event-endpoint', 'health-endpoint', 'stream', 'health', 'authority-status', 'authority-reattach', 'projection-verbosity', 'events', 'operator-form', 'operator-input']) {
    byId.set(id, new FakeElement(id));
  }
  const documentRef = {
    getElementById(id) { return byId.get(id) ?? null; },
    createElement(name) { return new FakeElement(name); },
    createTextNode(text) { return { tagName: '#TEXT', textContent: String(text ?? ''), children: [], dataset: {} }; },
  };
  return { byId, documentRef };
}

function textOfNode(node) {
  if (!node) return '';
  return `${node.textContent ?? ''}${(node.children ?? []).map(textOfNode).join('')}`;
}

function createLocalProjectionSite() {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-web-ui-projection-'));
  const sessionId = 'carrier_web_ui_e2e';
  const sitePaths = resolveNaradaSitePaths({ siteRoot, sessionId });
  const sessionDir = sitePaths.narsSessionDir;
  mkdirSync(sessionDir, { recursive: true });
  const eventsPath = join(sessionDir, 'events.jsonl');
  const sessionPath = join(sessionDir, 'session.jsonl');
  writeFileSync(sessionPath, '');
  writeFileSync(eventsPath, `${JSON.stringify({ event: 'assistant_message', event_sequence: 1, content: 'hello from local NARS' })}\n`);
  const recordPath = join(sessionDir, 'session-index-record.json');
  writeFileSync(recordPath, `${JSON.stringify({
    schema: 'narada.nars.session_index_record.v1',
    session_id: sessionId,
    carrier_session_id: sessionId,
    agent_id: 'resident',
    site_id: 'narada.sonar',
    site_root: siteRoot,
    events_path: eventsPath,
    session_path: sessionPath,
    health_endpoint: 'http://127.0.0.1:9/health',
  }, null, 2)}\n`);
  writeFileSync(join(sitePaths.narsSessionsRoot, 'index.json'), `${JSON.stringify({
    schema: 'narada.nars.session_index.v1',
    site_root: siteRoot,
    sessions: [{ session_id: sessionId, carrier_session_id: sessionId, record_path: recordPath }],
  }, null, 2)}\n`);
  return siteRoot;
}

function readInjectedBrowserConfig(html) {
  const match = html.match(/<script type="application\/json" id="nars-config">([^<]+)<\/script>/);
  assert.ok(match, 'expected injected NARS config script');
  return JSON.parse(match[1]);
}

function findHeadlessBrowser() {
  return [
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ].find((path) => existsSync(path)) ?? null;
}

async function captureHeadlessScreenshot({ browserPath, url, screenshotPath }) {
  await new Promise((resolve, reject) => {
    const child = spawn(browserPath, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--window-size=900,700',
      `--screenshot=${screenshotPath}`,
      url,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('headless_browser_screenshot_timeout'));
    }, 20000);
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`headless_browser_screenshot_failed:${code}:${stderr.slice(0, 500)}`));
    });
  });
}
test('Vue operator components expose composer without hidden privileged controls', async () => {
  const composer = await readFile(new URL('../src/app/components/OperatorComposer.vue', import.meta.url), 'utf8');
  const statusBoxSelector = await readFile(new URL('../src/app/components/StatusBoxSelector.vue', import.meta.url), 'utf8');
  const shell = await readFile(new URL('../src/app/components/NarsSessionShell.vue', import.meta.url), 'utf8');
  const input = await readFile(new URL('../src/app/composables/useOperatorInput.ts', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/app/App.vue', import.meta.url), 'utf8');
  const siteInfo = await readFile(new URL('../src/app/components/SiteInfoPanel.vue', import.meta.url), 'utf8');
  const sopPanel = await readFile(new URL('../src/app/components/SopPanel.vue', import.meta.url), 'utf8');
  const mcpInventory = await readFile(new URL('../src/app/composables/useMcpInventory.ts', import.meta.url), 'utf8');
  const surfaceAffordances = await readFile(new URL('../src/app/composables/useSurfaceAffordances.ts', import.meta.url), 'utf8');
  const narsFrames = await readFile(new URL('../src/app/lib/narsFrames.ts', import.meta.url), 'utf8');

  assert.match(composer, /@keydown="handleKeydown"/);
  assert.match(composer, /filterAgentWebUiCommands/);
  assert.match(composer, /commandPaletteOpen/);
  assert.match(composer, /role="listbox"/);
  assert.match(composer, /role="option"/);
  assert.match(composer, /acceptSelectedCommand/);
  assert.match(composer, /event\.key === 'Escape'[\s\S]*commandPaletteOpen\.value/);
  assert.match(composer, /event\.key !== 'Enter' \|\| event\.shiftKey/);
  assert.match(composer, /Press Esc again to interrupt the model/);
  assert.match(composer, /Esc to interrupt/);
  assert.match(composer, /canInterrupt\?: boolean/);
  assert.match(composer, /!props\.canInterrupt/);
  assert.match(composer, /watch\(\(\) => props\.canInterrupt/);
  assert.match(composer, /interruptCountdown\.value = 3/);
  assert.match(composer, /setTimeout\(\(\) => \{/);
  assert.match(composer, /emit\('interrupt'\)/);
  assert.match(shell, /@interrupt="emit\('interrupt'\)"/);
  assert.match(shell, /const canInterruptModel = computed/);
  assert.match(shell, /Boolean\(props\.activeTurnId\)/);
  assert.match(shell, /props\.agentActivity\.state === 'thinking' \|\| props\.agentActivity\.state === 'streaming'/);
  assert.match(shell, /:can-interrupt="canInterruptModel"/);
  assert.match(app, /@interrupt="interruptModel"/);
  assert.match(input, /buildAgentWebUiOperatorInputAction\('\/interrupt'/);
  assert.match(app, /buildSopSummaryRequestFrame/);
  assert.match(app, /buildSurfaceAffordancesRequestFrame/);
  assert.match(narsFrames, /buildAgentWebUiSopSummaryFrame/);
  assert.match(narsFrames, /buildAgentWebUiSurfaceAffordancesFrame/);
  assert.match(shell, /import SopPanel/);
  assert.match(shell, /const sopPanelOpen = ref\(false\)/);
  assert.doesNotMatch(shell, /const sopServer = computed/);
  assert.match(shell, /const sopAffordance = computed/);
  assert.match(shell, /const hasSopSurface = computed/);
  assert.match(shell, /Boolean\(sopAffordance\.value\)/);
  assert.match(shell, /sopSummary: SopSummary/);
  assert.match(shell, /surfaceAffordances: SurfaceAffordanceSummary/);
  assert.match(shell, /<SopPanel v-model:open="sopPanelOpen" :available="hasSopSurface" :summary="sopSummary"/);
  assert.match(shell, /@refresh="emit\('request-sop-summary'\)"/);
  assert.match(shell, /:has-sop-mcp="hasSopSurface"/);
  assert.match(app, /useSopSummary\(retained\.events\)/);
  assert.match(app, /useSurfaceAffordances\(retained\.events, health\.body\)/);
  assert.match(siteInfo, /hasSopMcp: boolean/);
  assert.match(siteInfo, /v-if="hasSopMcp"/);
  assert.match(siteInfo, /@click="openSopPanel"/);
  assert.match(sopPanel, /v-if="available"/);
  assert.match(sopPanel, /summary: SopSummary/);
  assert.match(sopPanel, /activeRun = computed/);
  assert.match(sopPanel, /summary\.templates\.items/);
  assert.match(sopPanel, /summary\.recentRuns\.items/);
  assert.match(sopPanel, /available_actions/);
  assert.match(sopPanel, /actionLabel/);
  assert.match(sopPanel, /step_timeline/);
  assert.match(sopPanel, /arrayField\(template, 'steps'\)/);
  assert.match(sopPanel, /arrayField\(run, 'step_timeline', 'step_states'\)/);
  assert.match(mcpInventory, /mergeHealthInventoryWithEventTools/);
  assert.match(mcpInventory, /server\.tools\.length \? server\.tools : eventToolsByServer\.get\(server\.serverName\)/);
  assert.match(mcpInventory, /arrayField\(mcp, 'tools'\)/);
  assert.match(surfaceAffordances, /session_surface_affordances/);
  assert.match(surfaceAffordances, /stringField\(record, 'surface_kind'\)/);
  assert.doesNotMatch(composer, /command\.execute|conversation\.interrupt/i);
  assert.match(statusBoxSelector, /aria-label="Choose status boxes"/);
  assert.match(statusBoxSelector, /status-box-selector-icon/);
  assert.doesNotMatch(statusBoxSelector, />Boxes<\/span>/);
});

test('Vue layout smoke covers shell, status, event list, composer, and event tone styles', async () => {
  const shell = await readFile(new URL('../src/app/components/NarsSessionShell.vue', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/app/App.vue', import.meta.url), 'utf8');
  const transcript = await readFile(new URL('../src/app/components/ConversationTranscript.vue', import.meta.url), 'utf8');
  const status = await readFile(new URL('../src/app/components/SessionStatusBar.vue', import.meta.url), 'utf8');
  const activity = await readFile(new URL('../src/app/composables/useAgentActivity.ts', import.meta.url), 'utf8');
  const retainedEvents = await readFile(new URL('../src/app/composables/useRetainedEvents.ts', import.meta.url), 'utf8');
  const projectionVerbosity = await readFile(new URL('../src/app/composables/useProjectionVerbosity.ts', import.meta.url), 'utf8');
  const selectorComponent = await readFile(new URL('../src/app/components/ProjectionVerbositySelect.vue', import.meta.url), 'utf8');
  const composer = await readFile(new URL('../src/app/components/OperatorComposer.vue', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/agent-web-ui.css', import.meta.url), 'utf8');
  for (const marker of ['class="shell"', '<SessionStatusBar', '<ConversationTranscript', '<OperatorComposer']) {
    assert.equal(shell.includes(marker), true, marker);
  }
  for (const marker of ['id="events"', 'id="projection-verbosity"', 'class="composer"', 'id="operator-input"']) {
    assert.equal([transcript, status, selectorComponent, composer].some((source) => source.includes(marker)), true, marker);
  }
  assert.match(shell, /sessionIdentity: SessionIdentitySummary/);
  assert.match(shell, /\{\{ sessionIdentity\.title \}\}/);
  assert.match(shell, /\{\{ sessionIdentity\.subtitle \}\}/);
  assert.match(shell, /follow-latest-revision="followLatestRevision"/);
  assert.match(shell, /narada:agent-web-ui:status-row-open\.v1/);
  assert.match(app, /useAgentActivity\(retained\.events, health\.body\)/);
  assert.match(activity, /active_turn_state/);
  assert.match(status, /narada:agent-web-ui:status-boxes\.v1/);
  assert.match(css, /\.status-box-selector-shell[\s\S]*?position: absolute/);
  assert.match(css, /\.status-box-selector-shell[\s\S]*?top: 42px/);
  assert.match(css, /\.status-box-selector-trigger[\s\S]*?width: 26px/);
  assert.match(css, /\.status-box-selector-icon/);
  assert.doesNotMatch(status, /narada\.agent-web-ui\.status-boxes\.v1/);
  assert.match(status, /projection-publish-stack/);
  assert.match(status, /projection-status-label/);
  const queuePanel = await readFile(new URL('../src/app/components/OperatorQueuePanel.vue', import.meta.url), 'utf8');
  assert.match(queuePanel, /narada:agent-web-ui:operator-queue-open\.v1/);
  assert.match(transcript, /followLatestRevision/);
  assert.match(transcript, /nextTick\(scrollToBottom\)/);
  assert.match(status, /verbosity === 'diagnostics' \|\| verbosity === 'raw'/);
  assert.match(status, /routine status update\{\{ summarizedStateSampleCount === 1 \? '' : 's' \}\} folded into State/);
  assert.match(retainedEvents, /Number\.POSITIVE_INFINITY/);
  assert.doesNotMatch(projectionVerbosity, /agent-web-ui\.js/);
  assert.match(css, /content-visibility:\s*auto/);
  assert.doesNotMatch(transcript, /visibleItems|ResizeObserver|event-virtual-item/);
  assert.doesNotMatch(transcript, /scrollTop\s*</);
  assert.doesNotMatch(transcript, /loadOlder|history-loading/);
  assert.doesNotMatch(css, /\.history-loading/);
  for (const cssSelector of ['.shell', '.status', '.status select', '.events', '.events-scroll', '.composer', '.event-tone-assistant', '.event-tone-error']) {
    assert.equal(css.includes(cssSelector), true, cssSelector);
  }
});

test('agent-web-ui CSS enforces theme-token discipline for new color declarations', async () => {
  const css = await readFile(new URL('../src/agent-web-ui.css', import.meta.url), 'utf8');
  const root = postcss.parse(css, { from: 'agent-web-ui.css' });
  const violations = rawColorDeclarationViolations(root);
  assert.deepEqual(violations, []);

  const lightTokens = rawColorTokensInRoot(root, { dark: false });
  const darkTokens = rawColorTokensInRoot(root, { dark: true });
  const missingDarkTokens = [...lightTokens].filter((token) => !darkTokens.has(token));
  assert.deepEqual(missingDarkTokens, []);
});

function rawColorDeclarationViolations(root) {
  const violations = [];
  root.walkDecls((declaration) => {
    if (!hasRawColor(declaration.value)) return;
    const parentRule = nearestRule(declaration);
    if (parentRule?.selector === ':root' && declaration.prop.startsWith('--')) return;
    violations.push(`${locationLabel(declaration)} ${parentRule?.selector ?? '<root>'} { ${declaration.prop}: ${declaration.value}; }`);
  });
  return violations;
}

function rawColorTokensInRoot(root, { dark }) {
  const tokens = new Set();
  root.walkDecls((declaration) => {
    if (!declaration.prop.startsWith('--') || !hasRawColor(declaration.value)) return;
    const parentRule = nearestRule(declaration);
    if (parentRule?.selector !== ':root') return;
    if (isInsideDarkMedia(declaration) !== dark) return;
    tokens.add(declaration.prop);
  });
  return tokens;
}

function nearestRule(node) {
  let current = node.parent;
  while (current) {
    if (current.type === 'rule') return current;
    current = current.parent;
  }
  return null;
}

function isInsideDarkMedia(node) {
  let current = node.parent;
  while (current) {
    if (current.type === 'atrule' && current.name === 'media' && current.params.includes('prefers-color-scheme: dark')) return true;
    current = current.parent;
  }
  return false;
}

function hasRawColor(value) {
  return /#[0-9a-fA-F]{3,8}|rgba?\(/.test(value);
}

function locationLabel(node) {
  return `${node.source?.start?.line ?? '?'}:${node.source?.start?.column ?? '?'}`;
}

test('Vue message content renderer has typed parts, inline code, and lazy Mermaid fallback', async () => {
  const eventRow = await readFile(new URL('../src/app/components/EventRow.vue', import.meta.url), 'utf8');
  const projectionSelect = await readFile(new URL('../src/app/components/ProjectionVerbositySelect.vue', import.meta.url), 'utf8');
  const messageContent = await readFile(new URL('../src/app/components/content/MessageContent.vue', import.meta.url), 'utf8');
  const markdownPart = await readFile(new URL('../src/app/components/content/MarkdownTextPart.vue', import.meta.url), 'utf8');
  const mermaidPart = await readFile(new URL('../src/app/components/content/MermaidDiagramPart.vue', import.meta.url), 'utf8');
  const renderedFrame = await readFile(new URL('../src/app/components/content/RenderedPartFrame.vue', import.meta.url), 'utf8');
  const parser = await readFile(new URL('../src/app/lib/messageContent.ts', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/agent-web-ui.css', import.meta.url), 'utf8');

  assert.match(eventRow, /<MessageContent :content="row\.summary"/);
  assert.match(eventRow, /event-view-\$\{props\.verbosity\}/);
  assert.match(eventRow, /event-disposition-\$\{String\(row\.disposition/);
  assert.match(eventRow, /v-if="verbosity !== 'conversation'" class="event-kind"/);
  assert.match(projectionSelect, /conversation: 'Chat'/);
  assert.match(projectionSelect, /aria-label="View"/);
  assert.match(messageContent, /parseMessageContent/);
  assert.match(parser, /normalizeTextPart/);
  assert.match(parser, /markdown\|md/);
  for (const renderKind of ['plain_text', 'markdown', 'code_block', 'mermaid_diagram', 'json_block']) {
    assert.equal(messageContent.includes(renderKind), true, renderKind);
    assert.equal(parser.includes(renderKind), true, renderKind);
  }
  assert.match(markdownPart, /MarkdownIt/);
  assert.match(markdownPart, /RenderedPartFrame/);
  assert.match(markdownPart, /html: false/);
  assert.match(markdownPart, /linkify: true/);
  assert.match(markdownPart, /v-html="renderedMarkdown"/);
  assert.match(renderedFrame, /activeView = ref<'render' \| 'code'>\('render'\)/);
  assert.match(renderedFrame, /copySource/);
  assert.match(renderedFrame, /class="rendered-part-copy"/);
  assert.doesNotMatch(renderedFrame, /rendered-part-title/);
  assert.match(renderedFrame, />Code<\/button>/);
  assert.match(renderedFrame, />Render<\/button>/);
  assert.match(css, /\.rendered-part-tabs[\s\S]*?flex-direction: column/);
  assert.doesNotMatch(css, /\.rendered-part-tab[\s\S]*?writing-mode/);
  assert.match(css, /\.rendered-part-tab[\s\S]*?text-align: left/);
  assert.match(css, /\.rendered-part-code pre[\s\S]*?white-space: pre-wrap/);
  assert.match(css, /\.rendered-part-copy[\s\S]*?cursor: pointer/);
  assert.equal(parser.includes('(?:^|\\n)\\s*[-*+]\\s+'), true);
  assert.match(mermaidPart, /import\('mermaid'\)/);
  assert.match(mermaidPart, /nextMermaidInstanceId/);
  assert.match(mermaidPart, /securityLevel: 'strict'/);
  assert.match(mermaidPart, /Mermaid render failed/);
  assert.match(css, /\.event-view-operations\.event-disposition-conversation_fact[\s\S]*?box-shadow: none/);
  assert.match(css, /\.event-view-operations\.event-disposition-operation_fact[\s\S]*?border-color: var\(--line-strong\)/);
  assert.match(css, /\.event-view-diagnostics[\s\S]*?grid-template-columns: 170px minmax\(0, 1fr\)/);
  assert.match(css, /\.event-view-diagnostics\.event-disposition-diagnostic_signal[\s\S]*?border-color: var\(--error-border\)/);
  assert.doesNotMatch(css, /\.event-agent-activity[\s\S]*?margin-left: 210px/);
  assert.doesNotMatch(css, /@media \(max-width: 680px\)[\s\S]*?\.event-agent-activity[\s\S]*?margin-left: 0/);
  assert.match(css, /\.event-view-raw[\s\S]*?box-shadow: none/);
  assert.match(css, /\.event-view-raw \.event-summary[\s\S]*?color: var\(--muted\)/);
  for (const cssSelector of ['.message-content', '.inline-code-token', '.code-block-part', '.json-block-part', '.rendered-part-frame', '.rendered-part-tab', '.mermaid-diagram']) {
    assert.equal(css.includes(cssSelector), true, cssSelector);
  }
});

test('browser screenshot smoke renders the served shell', async () => {
  const browserPath = findHeadlessBrowser();
  assert.ok(browserPath, 'expected an installed Chromium-family browser for screenshot smoke');
  const tmpDir = new URL('../.tmp-tests/agent-web-ui-screenshot/', import.meta.url);
  const screenshotUrl = new URL('shell.png', tmpDir);
  await rm(tmpDir, { recursive: true, force: true });
  await mkdir(tmpDir, { recursive: true });
  const web = await startAgentWebUiServer({ host: '127.0.0.1', port: 0, eventEndpoint: null, healthEndpoint: null });
  try {
    await captureHeadlessScreenshot({ browserPath, url: web.url, screenshotPath: fileURLToPath(screenshotUrl) });
    const screenshot = await readFile(screenshotUrl);
    assert.deepEqual([...screenshot.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.ok((await stat(screenshotUrl)).size > 5000, 'expected non-empty rendered PNG screenshot');
  } finally {
    web.server.close();
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('package server injects operator-capable config and proxies health with GET only', async () => {
  const upstream = createServer((request, response) => {
    assert.equal(request.method, 'GET');
    if (request.url === '/sessions/carrier_test/artifacts/art_html') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ schema: 'narada.nars.artifact_read.v1', artifact: { artifact_id: 'art_html', kind: 'html', title: 'HTML artifact' } }));
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ schema: 'narada.nars.health.v1', status: 'healthy', agent_id: 'narada.test', session_id: 'carrier_test' }));
  });
  await new Promise((resolve, reject) => {
    upstream.once('error', reject);
    upstream.listen(0, '127.0.0.1', () => {
      upstream.off('error', reject);
      resolve();
    });
  });
  const upstreamAddress = upstream.address();
  const healthEndpoint = `http://127.0.0.1:${upstreamAddress.port}/health`;
  const web = await startAgentWebUiServer({ host: '127.0.0.1', port: 0, eventEndpoint: 'ws://127.0.0.1:1234/events', healthEndpoint });
  try {
    const index = await fetch(web.url).then((response) => response.text());
    assert.match(index, /"eventEndpoint":"ws:\/\/127\.0\.0\.1:1234\/events"/);
    assert.match(index, /"healthEndpoint":"\/api\/health"/);
    assert.match(index, /"healthTransport":"http-proxy"/);
    assert.match(index, /"artifactBasePath":"\/api\/nars"/);
    assert.match(index, /"protocolHealthMethod":"session.health"/);
    assert.match(index, /"operatorInput":true/);
    assert.match(index, /"conversation.send"/);
    assert.match(index, /"session.command.execute"/);
    assert.match(index, /"carrier.command.execute"/);

    const health = await fetch(new URL('/api/health', web.url)).then((response) => response.json());
    assert.equal(health.status, 'healthy');
    assert.equal(health.session_id, 'carrier_test');
    const artifact = await fetch(new URL('/api/nars/sessions/carrier_test/artifacts/art_html', web.url)).then((response) => response.json());
    assert.equal(artifact.artifact.title, 'HTML artifact');
  } finally {
    web.server.close();
    upstream.close();
  }
});

test('package server serves browser-loadable modules without workspace bare imports', async () => {
  const web = await startAgentWebUiServer({ host: '127.0.0.1', port: 0, eventEndpoint: 'ws://127.0.0.1:1234/events', healthEndpoint: 'http://127.0.0.1:1235/health' });
  try {
    const root = new URL(web.url);
    const appModule = await fetch(new URL('/agent-web-ui.js', root)).then((response) => response.text());
    const runtimeModule = await fetch(new URL('/runtime-events.js', root)).then((response) => response.text());
    const vendorModule = await fetch(new URL('/vendor/nars-client-projection-contract.js', root)).then((response) => response.text());
    const vueVendorModule = await fetch(new URL('/vendor/vue.js', root)).then((response) => response.text());
    assert.doesNotMatch(appModule, /from ['"]@narada2\//);
    assert.doesNotMatch(appModule, /vue-app/);
    assert.doesNotMatch(runtimeModule, /from ['"]@narada2\//);
    assert.match(appModule, /from ['"]\.\/vendor\/nars-client-projection-contract\.js['"]/);
    assert.match(runtimeModule, /from ['"]\.\/vendor\/nars-client-projection-contract\.js['"]/);
    assert.match(vendorModule, /export const AGENT_WEB_UI_NARS_METHOD_LIST/);
    assert.match(vendorModule, /export const AGENT_WEB_UI_NARS_METHOD_LIST/);
    assert.match(vendorModule, /export function projectNarsClientEvent/);
    assert.match(vueVendorModule, /createApp/);
  } finally {
    web.server.close();
  }
});

test('served web UI config attaches to live NARS health and event projections', async () => {
  const childStdin = new PassThrough();
  childStdin.setEncoding('utf8');
  const childFrames = [];
  let stdinBuffer = '';
  let healthProjection = null;
  const waiters = [];
  const notifyWaiters = () => {
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index];
      if (waiter.predicate()) {
        waiters.splice(index, 1);
        waiter.resolve();
      }
    }
  };
  const waitForFrame = (predicate) => {
    if (predicate()) return Promise.resolve();
    return new Promise((resolve) => waiters.push({ predicate, resolve }));
  };
  childStdin.on('data', (chunk) => {
    stdinBuffer += chunk;
    const lines = stdinBuffer.split(/\r?\n/);
    stdinBuffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const frame = JSON.parse(line);
      childFrames.push(frame);
      if (frame.method === 'session.health') {
        healthProjection?.observe({
          event: 'session_health',
          request_id: frame.id,
          status: 'healthy',
          agent_id: 'narada.test',
          session_id: 'carrier_test',
        });
      }
    }
    notifyWaiters();
  });

  const eventHub = createEventHub();
  eventHub.publish({ event: 'session_started', agent_id: 'narada.test', session_id: 'carrier_test' });
  const eventProjection = await startEventStreamProjection({ childStdin, eventHub, host: '127.0.0.1', port: 0 });
  healthProjection = await startHealthProjection({ childStdin, host: '127.0.0.1', port: 0 });
  const web = await startAgentWebUiServer({ host: '127.0.0.1', port: 0, eventEndpoint: eventProjection.url, healthEndpoint: healthProjection.url });
  const client = await connectWebSocket(eventProjection.url);
  try {
    const html = await fetch(web.url).then((response) => response.text());
    const config = readInjectedBrowserConfig(html);
    assert.equal(config.eventEndpoint, eventProjection.url);
    assert.equal(config.healthEndpoint, '/api/health');
    assert.equal(config.healthTransport, 'http-proxy');
    assert.equal(config.artifactBasePath, '/api/nars');
    assert.equal(config.protocolHealthMethod, 'session.health');
    assert.equal(config.operatorInput, true);
    assert.equal(config.admittedMethods.includes('conversation.send'), true);
    assert.equal(config.admittedMethods.includes('conversation.interrupt'), true);

    const health = await fetch(new URL('/api/health', web.url)).then((response) => response.json());
    assert.equal(health.status, 'healthy');
    assert.equal(health.session_id, 'carrier_test');
    assert.equal(childFrames.some((frame) => frame.method === 'session.health'), true);

    assert.equal((await client.nextJson()).event, 'websocket_connected');
    client.sendJson({ id: 'events-1', method: 'session.events.subscribe', params: { include_replay: true, max_replay: 10 } });
    const subscribed = await client.nextJson();
    assert.equal(subscribed.event, 'session_events_subscription_started');
    assert.equal(subscribed.replay_count, 1);
    const replay = await client.nextJson();
    assert.equal(replay.event, 'session_event');
    assert.equal(replay.payload.event, 'session_started');

    client.sendJson({ id: 'input-1', method: 'conversation.send', params: { message: 'run startup sequence', source: 'agent-web-ui' } });
    await waitForFrame(() => childFrames.some((frame) => frame.id === 'input-1'));
    assert.deepEqual(childFrames.find((frame) => frame.id === 'input-1'), {
      id: 'input-1',
      method: 'conversation.send',
      params: { message: 'run startup sequence', source: 'agent-web-ui' },
    });

    client.sendJson({ id: 'enqueue-1', method: 'conversation.enqueue', params: { message: 'after current turn', source: 'agent-web-ui', active_turn_id: 'turn_ws' } });
    await waitForFrame(() => childFrames.some((frame) => frame.id === 'enqueue-1'));
    assert.deepEqual(childFrames.find((frame) => frame.id === 'enqueue-1'), {
      id: 'enqueue-1',
      method: 'conversation.enqueue',
      params: { message: 'after current turn', source: 'agent-web-ui', active_turn_id: 'turn_ws' },
    });

    client.sendJson({ id: 'steer-1', method: 'conversation.steer', params: { message: 'steer now', source: 'agent-web-ui', active_turn_id: 'turn_ws' } });
    await waitForFrame(() => childFrames.some((frame) => frame.id === 'steer-1'));
    assert.deepEqual(childFrames.find((frame) => frame.id === 'steer-1'), {
      id: 'steer-1',
      method: 'conversation.steer',
      params: { message: 'steer now', source: 'agent-web-ui', active_turn_id: 'turn_ws' },
    });

    client.sendJson({ id: 'interrupt-1', method: 'conversation.interrupt', params: {} });
    await waitForFrame(() => childFrames.some((frame) => frame.id === 'interrupt-1'));
    assert.equal(childFrames.find((frame) => frame.id === 'interrupt-1').method, 'conversation.interrupt');

    for (const [id, method, params] of [
      ['status-1', 'session.status', {}],
      ['recovery-1', 'session.recovery', {}],
      ['ops-1', 'session.operations', {}],
      ['tools-1', 'session.command.execute', { command: '/tools', value: 'mcp' }],
      ['close-1', 'session.close', {}],
    ]) {
      client.sendJson({ id, method, params });
      await waitForFrame(() => childFrames.some((frame) => frame.id === id));
      assert.deepEqual(childFrames.find((frame) => frame.id === id), { id, method, params });
    }
  } finally {
    client.close();
    web.server.close();
    eventProjection.server.close();
    healthProjection.server.close();
  }
});
test('CLI args and client config keep runtime authority outside the web package', () => {
  const options = parseAgentWebUiArgs(['--event-endpoint', 'ws://nars/events', '--health-endpoint', 'http://nars/health', '--port', '4888']);
  assert.deepEqual(options, {
    host: '127.0.0.1',
    port: 4888,
    eventEndpoint: 'ws://nars/events',
    healthEndpoint: 'http://nars/health',
  });
  assert.deepEqual(buildClientConfig(options), {
    eventEndpoint: 'ws://nars/events',
    healthEndpoint: '/api/health',
    healthTransport: 'http-proxy',
    artifactBasePath: '/api/nars',
    artifactTransport: 'local-nars-proxy',
    projectionControl: null,
    authorityTransition: null,
    protocolHealthMethod: 'session.health',
    maxReplay: 100,
    operatorInput: true,
    admittedMethods: ['session.events.subscribe', 'session.events.read', 'session.artifacts.register', 'session.artifacts.read', 'session.surface.affordances', 'session.sop.summary', 'conversation.send', 'conversation.enqueue', 'session.status', 'session.health', 'session.recovery', 'session.operations', 'observers.status', 'observer.mute', 'observer.unmute', 'session.command.execute', 'carrier.command.execute', 'conversation.interrupt', 'conversation.steer', 'session.close'],
  });
});

test('local client config exposes Cloudflare projection control only with session authority', () => {
  assert.equal(buildClientConfig({ eventEndpoint: 'ws://nars/events', healthEndpoint: 'http://nars/health' }).projectionControl, null);
  assert.deepEqual(buildClientConfig({
    eventEndpoint: 'ws://nars/events',
    healthEndpoint: 'http://nars/health',
    sessionId: 'carrier_1',
    siteRoot: 'D:/code/narada.sonar',
    siteId: 'narada.sonar',
    cloudflareApiBaseUrl: 'https://projection.example.test/',
  }).projectionControl, {
    cloudflare: {
      available: true,
      startEndpoint: '/api/projections/cloudflare/start',
      statusEndpoint: '/api/projections/cloudflare/status',
      defaultApiBaseUrl: 'https://projection.example.test',
    },
  });
});

test('local projection control refuses browser-supplied session authority and starts from server context', async () => {
  let captured = null;
  const web = await startAgentWebUiServer({
    host: '127.0.0.1',
    port: 0,
    eventEndpoint: 'ws://nars/events',
    healthEndpoint: 'http://nars/health',
    sessionId: 'carrier_server',
    siteRoot: 'D:/code/narada.sonar',
    siteId: 'narada.sonar',
    agentId: 'resident',
    cloudflareApiBaseUrl: 'https://projection.example.test/',
  }, {
    startCloudflareProjection: async (input) => {
      captured = input;
      return {
        schema: 'narada.agent_web_ui.cloudflare_projection_start.v1',
        status: 'published',
        projection_id: 'proj_server',
        remote_url: 'https://projection.example.test/?cloudflare_projection_id=proj_server&cloudflare_api_base_url=https%3A%2F%2Fprojection.example.test',
      };
    },
  });
  try {
    const refused = await fetch(`${web.url}api/projections/cloudflare/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cloudflare_api_base_url: 'https://projection.example.test', site_root: 'D:/other' }),
    });
    assert.equal(refused.status, 400);
    assert.match((await refused.json()).reason, /projection_authority_override_refused:site_root/);

    const accepted = await fetch(`${web.url}api/projections/cloudflare/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(accepted.status, 200);
    assert.deepEqual(captured, {
      siteId: 'narada.sonar',
      siteRoot: 'D:/code/narada.sonar',
      sessionId: 'carrier_server',
      agentId: 'resident',
      cloudflareApiBaseUrl: 'https://projection.example.test',
      projectionId: undefined,
      eventPolicy: undefined,
      inputPolicy: undefined,
      cachePolicy: undefined,
      artifactPolicy: undefined,
    });
    assert.equal((await accepted.json()).remote_url.includes('cloudflare_projection_id=proj_server'), true);
  } finally {
    web.server.close();
  }
});

test('resolveAttachConfig supports Cloudflare projection API mode', () => {
  const config = resolveAttachConfig('?cloudflare_projection_id=proj_1&cloudflare_api_base_url=https://projection.example.test&cloudflare_browser_token=browser_test');
  assert.equal(config.mode, 'cloudflare_projection');
  assert.equal(config.eventEndpoint, 'https://projection.example.test/api/nars/projections/proj_1/events');
  assert.equal(config.healthEndpoint, 'https://projection.example.test/api/nars/projections/proj_1/health');
  assert.equal(config.inputEndpoint, 'https://projection.example.test/api/nars/projections/proj_1/input');
  assert.equal(config.browserToken, 'browser_test');
  assert.equal(config.cacheEndpoint, 'https://projection.example.test/api/nars/projections/proj_1/events/cache');
  assert.equal(config.healthTransport, 'cloudflare-projection');
  assert.equal(config.artifactBasePath, 'https://projection.example.test/api/nars/projections/proj_1/artifacts');
  assert.equal(config.artifactTransport, 'cloudflare-projection');
});
