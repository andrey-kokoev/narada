import assert from 'node:assert/strict';
import { once } from 'node:events';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { tmpdir } from 'node:os';
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
import { AGENT_WEB_UI_NARS_METHOD_LIST } from '@narada2/nars-client-projection-contract';
import { createSessionProjection } from '../src/session-projection.js';
import { summarizeSessionIdentity, summarizeSessionTitleParts } from '../src/session-identity.js';
import {
  createEventHub,
  startEventStreamProjection,
  startHealthProjection,
} from '@narada2/agent-runtime-server/test-fixtures';
import { createSessionCoreRuntimeService } from '@narada2/agent-runtime-server/session-core-runtime-service';
import { createCloudflareNarsProjectionWorker } from '@narada2/cloudflare-nars-projection/worker';
import { registerProjectionRemotely, startLocalProjectionBridgeOnce, deliverRemoteProjectionInputsOnce } from '@narada2/cloudflare-nars-projection/node';
import { appendEvent } from '../src/render.js';
import {
  AGENT_WEB_UI_PREFERENCE_KEYS,
  readBooleanPreference,
  readJsonPreference,
  writeBooleanPreference,
  writeJsonPreference,
} from '../src/app/lib/browserPreferences.js';
import {
  applyManagedFavicon,
  extractFaviconCandidatesFromHealth,
  isSafeFaviconHref,
  NARADA_DEFAULT_FAVICON,
  resolveFaviconDescriptor,
} from '../src/app/composables/useResolvedFavicon.js';

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

function rawCustomPropertyReferenceViolations(root) {
  const declared = new Set();
  const referenced = new Set();
  root.walkDecls((declaration) => {
    if (declaration.prop.startsWith('--')) declared.add(declaration.prop);
    for (const match of declaration.value.matchAll(/var\((--[a-zA-Z0-9_-]+)/g)) {
      referenced.add(match[1]);
    }
  });
  return [...referenced].filter((token) => !declared.has(token)).sort();
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

function createFakeDocument() {
  const links = [];
  class FakeLink {
    constructor() { this.attributes = new Map(); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    removeAttribute(name) { this.attributes.delete(name); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
  }
  return {
    links,
    head: { appendChild(node) { links.push(node); } },
    createElement(name) {
      assert.equal(name, 'link');
      return new FakeLink();
    },
    querySelector(selector) {
      assert.equal(selector, 'link[data-narada-managed-favicon="true"]');
      return links.find((link) => link.getAttribute('data-narada-managed-favicon') === 'true') ?? null;
    },
  };
}

const AGENT_WEB_UI_CSS_IMPORTS = [
  ['styles/theme.css', 'narada-theme'],
  ['styles/base.css', 'narada-base'],
  ['styles/primitives.css', 'narada-primitives'],
  ['styles/operator-surfaces.css', 'narada-operator'],
  ['styles/shell-and-navigation.css', 'narada-shell'],
  ['styles/panels.css', 'narada-panels'],
  ['styles/layout-and-status.css', 'narada-layout'],
  ['styles/events-and-content.css', 'narada-content'],
  ['styles/composer.css', 'narada-composer'],
  ['styles/responsive.css', 'narada-responsive'],
  ['styles/dark-theme.css', 'narada-dark-theme'],
  ['styles/dark-overrides.css', 'narada-dark-overrides'],
];
const AGENT_WEB_UI_CSS_MODULES = AGENT_WEB_UI_CSS_IMPORTS.map(([modulePath]) => modulePath);

async function readAgentWebUiCss() {
  const sourceRoot = new URL('../src/', import.meta.url);
  const entry = await readFile(new URL('agent-web-ui.css', sourceRoot), 'utf8');
  const modules = await Promise.all(AGENT_WEB_UI_CSS_MODULES.map((modulePath) => readFile(new URL(modulePath, sourceRoot), 'utf8')));
  return [entry, ...modules].join('\n');
}

async function waitFor(predicate, { timeoutMs = 2000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('condition_timeout');
}

async function withRealNarsWebServer(fn) {
  const siteRoot = mkdtempSync(join(tmpdir(), 'agent-web-ui-config-real-nars-'));
  const runtimeInput = new PassThrough();
  const runtimeOutput = new PassThrough();
  const eventHub = createEventHub();
  const events = [];
  const providerCalls = [];
  let outputBuffer = '';
  let runtimePromise = null;
  let healthProjection = null;
  let eventProjection = null;
  try {
    const sessionId = 'session_web_ui_config_real_nars';
    const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId }).narsSessionDir;
    mkdirSync(sessionDir, { recursive: true });
    const baseRuntimeContext = {
      identity: 'narada.test',
      session: sessionId,
      siteRoot,
      siteId: 'narada.fixture',
      operatorSurfaceKind: 'agent-web-ui',
      sessionPath: join(sessionDir, 'session.jsonl'),
      eventsPath: join(sessionDir, 'events.jsonl'),
      intelligenceProvider: 'codex-subscription',
      providerSettings: { provider: 'codex-subscription', model: 'gpt-5.5', thinking: 'medium', stream: false },
    };
    healthProjection = await startHealthProjection({
      childStdin: () => runtimeInput,
      host: '127.0.0.1',
      port: 0,
      runtimeContext: { ...baseRuntimeContext, eventHub },
    });
    eventProjection = await startEventStreamProjection({
      childStdin: () => runtimeInput,
      eventHub,
      host: '127.0.0.1',
      port: 0,
      eventsPath: baseRuntimeContext.eventsPath,
    });
    const runtimeContext = {
      ...baseRuntimeContext,
      healthUrl: healthProjection.url,
      eventStreamUrl: eventProjection.url,
    };
    const service = createSessionCoreRuntimeService({
      runtimeContext,
      callChatApiFn: async (messages, tools) => {
        providerCalls.push({ messages, tools });
        return { choices: [{ message: { role: 'assistant', content: 'Real NARS fixture response.' } }] };
      },
      toolGateway: {
        toolCatalog: async () => [{
          type: 'function',
          function: {
            name: 'fixture_read',
            parameters: { type: 'object', properties: {} },
          },
        }],
        invoke: async ({ toolName }) => ({ tool_name: toolName, content: 'fixture' }),
        operationalState: () => 'healthy',
        close() {},
      },
    });
    runtimeOutput.setEncoding('utf8');
    runtimeOutput.on('data', (chunk) => {
      outputBuffer += chunk;
      const lines = outputBuffer.split(/\r?\n/);
      outputBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        events.push(event);
        healthProjection?.observe(event);
        eventHub.publish(event);
      }
    });
    runtimePromise = service.run({ input: runtimeInput, output: runtimeOutput });
    await waitFor(() => events.some((event) => event.event === 'session_started'), { timeoutMs: 2000 });
    const web = await startAgentWebUiServer({
      host: '127.0.0.1',
      port: 0,
      eventEndpoint: eventProjection.url,
      healthEndpoint: healthProjection.url,
    });
    try {
      return await fn({ web, eventProjection, healthProjection, events, providerCalls });
    } finally {
      web.server.close();
    }
  } finally {
    runtimeInput.end();
    if (runtimePromise) await Promise.race([runtimePromise, new Promise((resolve) => setTimeout(resolve, 1000))]);
    healthProjection?.server.close();
    eventProjection?.server.close();
    rmSync(siteRoot, { recursive: true, force: true });
  }
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

test('default package test script remains non-browser and non-e2e', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const defaultTest = packageJson.scripts?.test;
  assert.equal(typeof defaultTest, 'string');
  assert.doesNotMatch(defaultTest, /--test-skip-pattern/);
  const testFiles = defaultTest.match(/test\/\S+\.test\.mjs/g) ?? [];
  const forbidden = testFiles.filter((file) => (
    /-e2e\.test\.mjs$/.test(file)
    || /(?:browser|ux-smoke)\.test\.mjs$/.test(file)
  ));
  assert.deepEqual(forbidden, [], `default test must stay non-browser; move these to test:browser or test:all: ${forbidden.join(', ')}`);
});

test('browser preferences hydrate through qualified feature-owned storage without session state', () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
  const keys = Object.values(AGENT_WEB_UI_PREFERENCE_KEYS);

  assert.equal(keys.every((key) => key.startsWith('narada:agent-web-ui:')), true);
  assert.equal(writeBooleanPreference(AGENT_WEB_UI_PREFERENCE_KEYS.statusRowOpen, false, storage), true);
  assert.equal(writeJsonPreference(AGENT_WEB_UI_PREFERENCE_KEYS.statusBoxes, ['intelligence', 'view'], storage), true);
  assert.equal(readBooleanPreference(AGENT_WEB_UI_PREFERENCE_KEYS.statusRowOpen, true, storage), false);
  assert.deepEqual(readJsonPreference(AGENT_WEB_UI_PREFERENCE_KEYS.statusBoxes, [], storage), ['intelligence', 'view']);
  assert.equal(readBooleanPreference('narada:agent-web-ui:missing.v1', true, storage), true);
  assert.deepEqual(readJsonPreference('narada:agent-web-ui:corrupt.v1', ['fallback'], { getItem: () => '{bad', setItem() {} }), ['fallback']);
});

test('ordinary Agent Web UI browser UX tests stay Playwright-owned', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const testFiles = await readdir(new URL('../test/', import.meta.url));
  const legacyRawBrowserTests = [
    'agent-web-ui-live-slash-cross-surface-e2e.test.mjs',
    'agent-web-ui-panels-e2e.test.mjs',
    'agent-web-ui-ux-smoke.test.mjs',
  ];
  assert.deepEqual(testFiles.filter((file) => legacyRawBrowserTests.includes(file)), []);
  assert.equal(packageJson.scripts?.['test:browser'], 'pnpm run test:e2e');
  assert.match(packageJson.scripts?.['test:e2e'] ?? '', /playwright test/);
  assert.match(packageJson.scripts?.['test:live:slash-commands'] ?? '', /playwright test test\/e2e\/live-slash-smoke\.spec\.js/);
  assert.doesNotMatch(packageJson.scripts?.['test:live:slash-commands'] ?? '', /agent-web-ui-local-submit-html-artifact-cloudflare-e2e/);
  assert.match(packageJson.scripts?.['test:browser:cdp'] ?? '', /agent-web-ui-cloudflare-authority-local-surface-artifact-e2e\.test\.mjs/);
  assert.match(packageJson.scripts?.['test:browser:cdp'] ?? '', /agent-web-ui-cloudflare-html-artifact-e2e\.test\.mjs/);
  assert.match(packageJson.scripts?.['test:browser:cdp'] ?? '', /agent-web-ui-local-submit-html-artifact-cloudflare-e2e\.test\.mjs/);
});

test('favicon resolver applies ordered safe descriptors and manages one head link', () => {
  const health = {
    agent_identity_ref: { icon: { href: 'https://example.com/agent.svg', type: 'image/svg+xml' } },
    site_config: { favicon: { href: '/site.svg', sizes: 'any' } },
  };
  const candidates = extractFaviconCandidatesFromHealth(health);

  assert.equal(resolveFaviconDescriptor({ tab: './tab.svg', ...candidates })?.href, './tab.svg');
  assert.equal(resolveFaviconDescriptor({ tab: null, ...candidates })?.href, 'https://example.com/agent.svg');
  assert.equal(resolveFaviconDescriptor({ tab: null, agentIdentity: null, siteConfig: candidates.siteConfig })?.href, '/site.svg');
  assert.equal(resolveFaviconDescriptor({ tab: null, agentIdentity: null, siteConfig: null })?.href, NARADA_DEFAULT_FAVICON.href);
  assert.equal(resolveFaviconDescriptor({ tab: { href: 'javascript:alert(1)' }, agentIdentity: 'data:image/svg+xml,%3Csvg/%3E', siteConfig: '/site.svg' })?.source, 'agent_identity');
  assert.equal(isSafeFaviconHref('http://example.com/icon.svg'), false);

  const documentRef = createFakeDocument();
  const first = applyManagedFavicon(resolveFaviconDescriptor({ tab: './tab.svg', ...candidates }), documentRef);
  const second = applyManagedFavicon(resolveFaviconDescriptor({ tab: null, ...candidates }), documentRef);
  assert.equal(documentRef.links.length, 1);
  assert.equal(first, second);
  assert.equal(second.getAttribute('rel'), 'icon');
  assert.equal(second.getAttribute('href'), 'https://example.com/agent.svg');
  assert.equal(second.getAttribute('type'), 'image/svg+xml');
  assert.equal(second.getAttribute('data-narada-favicon-source'), 'agent_identity');
});

test('agent-web-ui entrypoints include Narada favicon fallback links', async () => {
  const viteIndex = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
  const compatIndex = await readFile(new URL('../src/compat-index.html', import.meta.url), 'utf8');
  const favicon = await readFile(new URL('../src/narada-favicon.svg', import.meta.url), 'utf8');
  for (const html of [viteIndex, compatIndex]) {
    assert.match(html, /<link rel="icon" href="\.\/narada-favicon\.svg" type="image\/svg\+xml" sizes="any">/);
  }
  assert.match(favicon, /<svg/);
});

test('production agent-web-ui README declares its production scope', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /production Agent Web UI browser surface/);
  assert.match(readme, /@narada2\/agent-web-ui\/server/);
  assert.match(readme, /NARS remains the owner/);
  assert.doesNotMatch(readme, /agent-web-ui2|Deprecated migration predecessor/);
});

test('Vue operator components expose composer without hidden privileged controls', async () => {
  const composer = await readFile(new URL('../src/app/components/OperatorComposer.vue', import.meta.url), 'utf8');
  const commandPalette = await readFile(new URL('../src/app/composables/useOperatorCommandPalette.ts', import.meta.url), 'utf8');
  const commandController = await readFile(new URL('../src/app/lib/operatorCommandController.ts', import.meta.url), 'utf8');
  const commandPaletteComponent = await readFile(new URL('../src/app/components/OperatorCommandPalette.vue', import.meta.url), 'utf8');
  const commandUiIndex = await readFile(new URL('../src/app/components/ui/command/index.ts', import.meta.url), 'utf8');
  const commandItem = await readFile(new URL('../src/app/components/ui/command/CommandItem.vue', import.meta.url), 'utf8');
  const commandList = await readFile(new URL('../src/app/components/ui/command/CommandList.vue', import.meta.url), 'utf8');
  const commandEmpty = await readFile(new URL('../src/app/components/ui/command/CommandEmpty.vue', import.meta.url), 'utf8');
  const interruptPrompt = await readFile(new URL('../src/app/composables/useOperatorInterruptPrompt.ts', import.meta.url), 'utf8');
  const snippets = await readFile(new URL('../src/app/composables/useOperatorSnippets.ts', import.meta.url), 'utf8');
  const slashSnippetE2e = await readFile(new URL('../test/e2e/slash-snippets.spec.js', import.meta.url), 'utf8');
  const boxVisibilitySelector = await readFile(new URL('../src/app/components/BoxVisibilitySelector.vue', import.meta.url), 'utf8');
  const shell = await readFile(new URL('../src/app/components/NarsSessionShell.vue', import.meta.url), 'utf8');
  const panelRegistry = await readFile(new URL('../src/app/panel-registry.ts', import.meta.url), 'utf8');
  const sessionPanels = await readFile(new URL('../src/app/composables/useSessionPanels.ts', import.meta.url), 'utf8');
  const input = await readFile(new URL('../src/app/composables/useOperatorInput.ts', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/app/App.vue', import.meta.url), 'utf8');
  const contentPipeline = await readFile(new URL('../src/app/lib/contentPipeline.ts', import.meta.url), 'utf8');
  const messageContent = await readFile(new URL('../src/app/components/content/MessageContent.vue', import.meta.url), 'utf8');
  const sessionState = await readFile(new URL('../src/app/composables/useSessionState.ts', import.meta.url), 'utf8');
  const siteInfo = await readFile(new URL('../src/app/components/SiteInfoPanel.vue', import.meta.url), 'utf8');
  const mailboxPanel = await readFile(new URL('../src/app/components/MailboxPanel.vue', import.meta.url), 'utf8');
  const schedulerPanel = await readFile(new URL('../src/app/components/SchedulerPanel.vue', import.meta.url), 'utf8');
  const taskLifecyclePanel = await readFile(new URL('../src/app/components/TaskLifecyclePanel.vue', import.meta.url), 'utf8');
  const genericAffordancePanel = await readFile(new URL('../src/app/components/GenericAffordancePanel.vue', import.meta.url), 'utf8');
  const sopPanel = await readFile(new URL('../src/app/components/SopPanel.vue', import.meta.url), 'utf8');
  const mcpPanel = await readFile(new URL('../src/app/components/McpServerPanel.vue', import.meta.url), 'utf8');
  const surfaceNavigator = await readFile(new URL('../src/app/components/SurfaceNavigator.vue', import.meta.url), 'utf8');
  const mcpInventory = await readFile(new URL('../src/app/composables/useMcpInventory.ts', import.meta.url), 'utf8');
  const surfaceAffordances = await readFile(new URL('../src/app/composables/useSurfaceAffordances.ts', import.meta.url), 'utf8');
  const narsFrames = await readFile(new URL('../src/app/lib/narsFrames.ts', import.meta.url), 'utf8');

  assert.match(composer, /@keydown="handleKeydown"/);
  assert.match(composer, /useOperatorCommandPalette/);
  assert.match(composer, /import OperatorCommandPalette/);
  assert.match(commandPalette, /buildOperatorCommandPaletteEntries/);
  assert.match(commandPalette, /buildOperatorCommandPaletteView/);
  assert.match(commandPalette, /acceptOperatorCommandPaletteEntry/);
  assert.doesNotMatch(commandPalette, /filterAgentWebUiCommands/);
  assert.doesNotMatch(commandPalette, /filterAgentWebUiSnippetActions/);
  assert.match(commandController, /filterAgentWebUiCommands/);
  assert.match(commandController, /filterAgentWebUiSnippetActions/);
  assert.match(commandController, /parseAgentWebUiSnippetCommand/);
  assert.match(commandController, /title: 'Snippets'/);
  assert.match(commandController, /'Snippet queue' : 'Snippet run'/);
  assert.match(commandController, /No saved snippets yet/);
  assert.match(commandController, /Backspace to snippet actions/);
  assert.match(commandController, /emptyHint:/);
  assert.match(commandController, /OPERATOR_COMMAND_PALETTE_SECTION_LABELS/);
  assert.match(commandController, /action\.id === 'delete'/);
  assert.match(commandController, /choose snippet to delete/);
  assert.match(commandController, /entry\.kind === 'snippet'/);
  assert.match(commandController, /command\.id === 'snippet'[\s\S]*draft: '\/snippet '/);
  assert.match(commandPaletteComponent, /from '.\/ui\/command'/);
  assert.match(commandPaletteComponent, /command-palette-header/);
  assert.match(commandPaletteComponent, /command-section/);
  assert.match(commandPaletteComponent, /role="group"/);
  assert.match(commandPaletteComponent, /agent-web-ui-command-palette-list/);
  assert.match(commandPaletteComponent, /operatorCommandPaletteEntrySection/);
  assert.match(commandPaletteComponent, /view\.emptyText/);
  assert.match(commandPaletteComponent, /view\.emptyHint/);
  assert.match(commandPaletteComponent, /view\.hint/);
  assert.doesNotMatch(commandPaletteComponent, /entries\.length \? view\.hint : view\.emptyHint/);
  assert.match(composer, /aria-haspopup="listbox"/);
  assert.match(composer, /aria-controls="agent-web-ui-command-palette-list"/);
  assert.match(commandList, /listId/);
  assert.match(commandItem, /role="option"/);
  assert.match(commandItem, /tabindex="-1"/);
  assert.doesNotMatch(commandItem, /<button/);
  assert.match(commandEmpty, /role="option"/);
  assert.match(commandEmpty, /aria-disabled="true"/);
  assert.match(commandList, /role="listbox"/);
  assert.match(commandUiIndex, /CommandList/);
  assert.doesNotMatch(commandPalette, /SNIPPET_SELECTION_ACTIONS/);
  assert.doesNotMatch(commandPalette, /SNIPPET_MANAGEMENT_ACTIONS/);
  assert.match(snippets, /parseAgentWebUiSnippetCommand/);
  assert.match(slashSnippetE2e, /AGENT_WEB_UI_SNIPPET_ACTIONS/);
  assert.match(slashSnippetE2e, /snippet slash grammar is registry-driven across actions and aliases/);
  assert.doesNotMatch(slashSnippetE2e, /WebSocketImpl: createRecordingWebSocketClass/);
  assert.match(composer, /commandPaletteOpen/);
  assert.doesNotMatch(composer, /role="listbox"/);
  assert.doesNotMatch(composer, /role="option"/);
  assert.match(commandPaletteComponent, /CommandList/);
  assert.match(commandPalette, /acceptSelectedCommand/);
  assert.match(commandPalette, /event\.key === 'Escape'[\s\S]*commandPaletteDismissedFor\.value/);
  assert.match(composer, /event\.key !== 'Enter' \|\| event\.shiftKey/);
  assert.match(composer, /useOperatorInterruptPrompt/);
  assert.doesNotMatch(composer, /setInterval\(/);
  assert.match(interruptPrompt, /commandPaletteOpen\.value/);
  assert.match(composer, /Press Esc again to interrupt the model/);
  assert.match(composer, /Esc to interrupt/);
  assert.match(composer, /canInterrupt\?: boolean/);
  assert.match(composer, /const canInterrupt = computed\(\(\) => Boolean\(props\.canInterrupt\)\)/);
  assert.match(interruptPrompt, /!options\.canInterrupt\.value/);
  assert.match(interruptPrompt, /watch\(options\.canInterrupt/);
  assert.match(interruptPrompt, /interruptCountdown\.value = 3/);
  assert.match(interruptPrompt, /setTimeout\(\(\) => \{/);
  assert.match(interruptPrompt, /options\.interrupt\(\)/);
  assert.match(shell, /@interrupt="emit\('interrupt'\)"/);
  assert.match(shell, /const canInterruptModel = computed/);
  assert.match(shell, /Boolean\(props\.activeTurnId\)/);
  assert.match(shell, /props\.agentActivity\.state === 'thinking' \|\| props\.agentActivity\.state === 'streaming'/);
  assert.match(shell, /const canSteerActiveTurn = computed\(\(\) => canInterruptModel\.value\)/);
  assert.match(shell, /:can-steer-active-turn="canSteerActiveTurn"/);
  assert.match(shell, /:can-interrupt="canInterruptModel"/);
  assert.match(input, /canSteerActiveTurn\(\)/);
  assert.match(app, /@interrupt="interruptModel"/);
  assert.match(input, /buildAgentWebUiOperatorInputAction\('\/interrupt'/);
  assert.match(app, /buildMailboxSummaryRequestFrame/);
  assert.match(app, /buildSchedulerSummaryRequestFrame/);
  assert.match(app, /buildTaskLifecycleSummaryRequestFrame/);
  assert.match(app, /buildSopSummaryRequestFrame/);
  assert.match(narsFrames, /buildAgentWebUiMailboxSummaryFrame/);
  assert.match(narsFrames, /buildAgentWebUiSchedulerSummaryFrame/);
  assert.match(narsFrames, /buildAgentWebUiTaskLifecycleSummaryFrame/);
  assert.match(narsFrames, /buildAgentWebUiSopSummaryFrame/);
  assert.match(narsFrames, /buildAgentWebUiSurfaceAffordancesFrame/);
  assert.match(shell, /import SopPanel/);
  assert.match(shell, /import MailboxPanel/);
  assert.match(shell, /import SchedulerPanel/);
  assert.match(shell, /import TaskLifecyclePanel/);
  assert.match(shell, /import SurfaceNavigator/);
  assert.match(shell, /import GenericAffordancePanel/);
  assert.match(shell, /useSessionPanels\(panelCapabilities\)/);
  assert.match(shell, /panels\.isAvailable\('sop'\)/);
  assert.match(shell, /panels\.open\('mcp'\)/);
  assert.match(shell, /panels\.openGeneric\(surfaceKind\)/);
  assert.match(panelRegistry, /export type SessionPanelId/);
  assert.match(panelRegistry, /SESSION_PANEL_REGISTRY/);
  assert.match(panelRegistry, /unavailableMessage/);
  assert.doesNotMatch(panelRegistry, /localStorage|browserStorage/);
  assert.match(panelRegistry, /surfaceKinds\.includes\(id\)/);
  assert.match(panelRegistry, /genericAffordanceCount > 0/);
  assert.match(sessionPanels, /const state = reactive\(\{ \.\.\.initialOpenState \}\)/);
  assert.match(sessionPanels, /isSessionPanelAvailable/);
  assert.match(sessionPanels, /function openGeneric\(key: string\)/);
  assert.match(sessionPanels, /state\.generic_affordance = true/);
  assert.doesNotMatch(shell, /const sopPanelOpen = ref\(false\)/);
  assert.doesNotMatch(shell, /const genericAffordancePanelOpen = ref\(false\)/);
  assert.doesNotMatch(shell, /const selectedGenericAffordanceKey = ref<string \| null>\(null\)/);
  assert.doesNotMatch(shell, /const mailboxPanelOpen = ref\(false\)/);
  assert.match(shell, /const surfaceNavigatorOpen = ref\(false\)/);
  assert.doesNotMatch(shell, /const schedulerPanelOpen = ref\(false\)/);
  assert.doesNotMatch(shell, /const taskLifecyclePanelOpen = ref\(false\)/);
  assert.doesNotMatch(shell, /const sopServer = computed/);
  assert.match(shell, /const genericAffordances = computed/);
  assert.match(shell, /renderer === 'generic_mcp_affordance'/);
  assert.match(shell, /const genericSurfaceNavigatorItems = computed/);
  assert.match(shell, /mailboxSummary: MailboxSummary/);
  assert.match(shell, /schedulerSummary: SchedulerSummary/);
  assert.match(shell, /sopSummary: SopSummary/);
  assert.match(shell, /taskLifecycleSummary: TaskLifecycleSummary/);
  assert.match(shell, /surfaceAffordances: SurfaceAffordanceSummary/);
  assert.match(shell, /const surfaceGroups = computed/);
  assert.match(shell, /function openSurfacePanel\(surfaceKind: string\)/);
  assert.match(shell, /surfaceKind === 'mcp'/);
  assert.match(shell, /surfaceKind\.startsWith\('generic:'\)/);
  assert.match(shell, /function genericSurfaceKey/);
  assert.match(shell, /@open-surface-panel="openSurfacePanel"/);
  assert.match(shell, /:surface-affordances="surfaceAffordances"/);
  assert.match(shell, /<SurfaceNavigator v-model:open="surfaceNavigatorOpen" :groups="surfaceGroups" @open="openSurfacePanel"/);
  assert.match(shell, /<GenericAffordancePanel v-model:open="panels\.state\.generic_affordance" triggerless :item="selectedGenericAffordance"/);
  assert.match(shell, /<SopPanel v-model:open="panels\.state\.sop" triggerless :available="panels\.isAvailable\('sop'\)" :summary="sopSummary"/);
  assert.match(shell, /<MailboxPanel v-model:open="panels\.state\.mailbox" triggerless :available="panels\.isAvailable\('mailbox'\)" :summary="mailboxSummary"/);
  assert.match(shell, /<SchedulerPanel v-model:open="panels\.state\.scheduler" triggerless :available="panels\.isAvailable\('scheduler'\)" :summary="schedulerSummary"/);
  assert.match(shell, /<TaskLifecyclePanel v-model:open="panels\.state\.task_lifecycle" triggerless :available="panels\.isAvailable\('task_lifecycle'\)" :summary="taskLifecycleSummary"/);
  assert.match(shell, /@refresh="emit\('request-sop-summary'\)"/);
  assert.match(shell, /@refresh="emit\('request-mailbox-summary'\)"/);
  assert.match(shell, /@refresh="emit\('request-scheduler-summary'\)"/);
  assert.match(shell, /@refresh="emit\('request-task-lifecycle-summary'\)"/);
  assert.match(shell, /@open-surface-navigator="surfaceNavigatorOpen = true"/);
  assert.match(shell, /import BoxRowShell/);
  assert.match(shell, /<BoxRowShell row-label="Narada session header" class-name="header-box-row">/);
  assert.match(shell, /placement="row-control"/);
  const headerStart = shell.indexOf('<BoxRowShell row-label="Narada session header"');
  const headerEnd = shell.indexOf('</header>', headerStart);
  const headerActions = shell.slice(headerStart, headerEnd);
  assert.match(headerActions, /<SurfaceNavigator/);
  for (const panel of ['ArtifactsPanel', 'McpServerPanel', 'GenericAffordancePanel', 'DelegationPanel', 'GitPanel', 'InboxPanel', 'MailboxPanel', 'SchedulerPanel', 'TaskLifecyclePanel', 'SopPanel', 'SurfaceFeedbackPanel']) {
    assert.doesNotMatch(headerActions, new RegExp(`<${panel}\\b`));
  }
  assert.match(app, /useMailboxSummary\(session\.events\)/);
  assert.match(app, /useSchedulerSummary\(session\.events\)/);
  assert.match(app, /useSopSummary\(session\.events\)/);
  assert.match(app, /useTaskLifecycleSummary\(session\.events\)/);
  assert.match(app, /useSurfaceAffordances\(session\.events, health\.body\)/);
  assert.match(app, /useSessionState\(projection\.verbosity, health\.identity\)/);
  assert.doesNotMatch(app, /useRetainedEvents|useNarsEvents/);
  assert.match(sessionState, /useRetainedEvents\(\)/);
  assert.match(sessionState, /useNarsEvents\(retained\.events/);
  assert.match(siteInfo, /'open-surface-navigator': \[\]/);
  assert.match(siteInfo, /function openSurfaceNavigator/);
  assert.match(siteInfo, /@click="openSurfaceNavigator"/);
  assert.doesNotMatch(siteInfo, /openSopPanel|openMailboxPanel|openSchedulerPanel|openTaskLifecyclePanel|openArtifactsPanel|openDelegationPanel|openGitPanel|openInboxPanel|openSurfaceFeedbackPanel/);
  assert.doesNotMatch(siteInfo, /hasSopMcp: boolean|hasMailboxMcp: boolean|hasSchedulerMcp: boolean|hasTaskLifecycleMcp: boolean/);
  assert.match(mailboxPanel, /v-if="available && !triggerless"/);
  assert.match(mailboxPanel, /summary: MailboxSummary/);
  assert.match(mailboxPanel, /mailbox_accounts|Accounts|Recent messages/);
  assert.match(mailboxPanel, /summary\.accounts\.items/);
  assert.match(mailboxPanel, /summary\.messages\.items/);
  assert.match(mailboxPanel, /Synced Email/);
  assert.match(schedulerPanel, /v-if="available && !triggerless"/);
  assert.match(schedulerPanel, /summary: SchedulerSummary/);
  assert.match(schedulerPanel, /Scheduler/);
  assert.match(schedulerPanel, /summary\.tasks\.items/);
  assert.match(schedulerPanel, /candidateActions/);
  assert.match(taskLifecyclePanel, /v-if="available && !triggerless"/);
  assert.match(taskLifecyclePanel, /summary: TaskLifecycleSummary/);
  assert.match(taskLifecyclePanel, /Tasks/);
  assert.match(taskLifecyclePanel, /summary\.inProgress/);
  assert.match(taskLifecyclePanel, /summary\.pendingReviews/);
  assert.match(taskLifecyclePanel, /summary\.obligations/);
  assert.match(sopPanel, /v-if="available && !triggerless"/);
  assert.match(sopPanel, /summary: SopSummary/);
  assert.match(sopPanel, /activeRun = computed/);
  assert.match(sopPanel, /summary\.templates\.items/);
  assert.match(sopPanel, /summary\.recentRuns\.items/);
  assert.match(sopPanel, /available_actions/);
  assert.match(sopPanel, /actionLabel/);
  assert.match(sopPanel, /runMetaLine/);
  assert.match(surfaceNavigator, /Work, automation, and diagnostics available in this session/);
  assert.match(surfaceNavigator, /defineModel<boolean>\('open'/);
  assert.match(surfaceNavigator, /searchInput\.value\?\.focus/);
  assert.match(surfaceNavigator, /event\.key !== 'Escape'/);
  assert.match(surfaceNavigator, /surface-navigator-trigger/);
  assert.match(surfaceNavigator, /Filter panels/);
  assert.match(sopPanel, /stepResultSummary/);
  assert.match(sopPanel, /step_timeline/);
  assert.match(sopPanel, /arrayField\(template, 'steps'\)/);
  assert.match(sopPanel, /arrayField\(run, 'step_timeline', 'step_states'\)/);
  assert.match(sopPanel, /textField\(template, 'description'\)/);
  assert.match(mcpPanel, /surfaceAffordances: SurfaceAffordanceSummary/);
  assert.match(mcpPanel, /'open-surface-panel': \[surfaceKind: string\]/);
  assert.match(mcpPanel, /panelAffordanceForServer/);
  assert.match(mcpPanel, /isPanelAffordance/);
  assert.match(mcpPanel, /surfacePanelKey/);
  assert.match(mcpPanel, /renderer === 'generic_mcp_affordance'/);
  assert.match(mcpPanel, /mcp-server-panel-action/);
  assert.match(mcpPanel, /isPanelSurfaceKind/);
  assert.match(genericAffordancePanel, /affordance_document/);
  assert.match(genericAffordancePanel, /panelActions/);
  assert.match(genericAffordancePanel, /targetLabel/);
  assert.match(genericAffordancePanel, /danger_level/);
  assert.match(mcpInventory, /mergeHealthInventoryWithEventTools/);
  assert.match(mcpInventory, /server\.tools\.length \? server\.tools : eventToolsByServer\.get\(server\.serverName\)/);
  assert.match(mcpInventory, /arrayField\(mcp, 'tools'\)/);
  assert.match(surfaceAffordances, /session_surface_affordances/);
  assert.match(surfaceAffordances, /stringField\(record, 'surface_kind'\)/);
  assert.match(contentPipeline, /The browser content boundary/);
  assert.match(contentPipeline, /MESSAGE_RENDERER_KINDS/);
  assert.match(contentPipeline, /buildMessageContentPipeline/);
  assert.match(contentPipeline, /rendererKeyFor/);
  assert.match(messageContent, /buildMessageContentPipeline/);
  assert.match(messageContent, /rendererKeyFor\(part\)/);
  assert.doesNotMatch(composer, /command\.execute|conversation\.interrupt/i);
  assert.match(boxVisibilitySelector, /:aria-label="`Choose \$\{props\.triggerLabel \?\? 'boxes'\}`"/);
  assert.match(boxVisibilitySelector, /box-visibility-selector-icon/);
  assert.match(boxVisibilitySelector, /data-placement/);
  assert.match(boxVisibilitySelector, /<span class="box-visibility-selector-count" aria-hidden="true">\{\{ boxCountLabel \}\}<\/span>\s*<\/button>/);
  assert.doesNotMatch(boxVisibilitySelector, /<\/button>\s*<span class="box-visibility-selector-count"/);
  assert.doesNotMatch(boxVisibilitySelector, />Boxes<\/span>/);
  assert.match(shell, /summarizeSessionTitleParts\(props\.sessionIdentity\)/);
  assert.match(shell, /placement="row-control"/);
});

test('session state boundary exposes retention and projection as one owner', async () => {
  const sessionState = await readFile(new URL('../src/app/composables/useSessionState.ts', import.meta.url), 'utf8');
  assert.match(sessionState, /The browser-owned session boundary/);
  assert.match(sessionState, /const retained = useRetainedEvents\(\)/);
  assert.match(sessionState, /const projection = useNarsEvents\(retained\.events/);
  assert.match(sessionState, /\.\.\.retained/);
  assert.match(sessionState, /\.\.\.projection/);
});

test('session identity projection prefers explicit Site id for workspace-root Site bindings', () => {
  const summary = summarizeSessionIdentity([
    {
      event: 'session_started',
      site_id: 'narada.sonar',
      agent_id: 'resident',
      role: 'resident',
      session_id: 'carrier_workspace_root',
      site_root: 'D:/code/narada.sonar',
    },
    {
      event: 'session_health',
      status: 'healthy',
      site_id: 'narada.sonar',
      agent_id: 'resident',
      role: 'resident',
      session_id: 'carrier_workspace_root',
    },
  ]);

  assert.deepEqual(summary, {
    siteId: 'narada.sonar',
    agentId: 'resident',
    role: 'resident',
    sessionId: 'carrier_workspace_root',
    title: 'narada.sonar.resident',
    subtitle: 'Role: resident · Browser projection attached to one NARS runtime.',
  });
  assert.deepEqual(summarizeSessionTitleParts(summary), { siteLabel: 'narada.sonar', agentLabel: 'resident' });
});

test('session identity projection keeps embedded-authority roots out of display authority', () => {
  const summary = summarizeSessionIdentity([
    {
      event: 'session_started',
      agent_id: 'narada-staccato.resident',
      role: 'resident',
      session_id: 'carrier_embedded_authority',
      site_root: 'D:/code/narada.staccato/.narada',
    },
    {
      event: 'session_health',
      status: 'healthy',
      agent_id: 'narada-staccato.resident',
      role: 'resident',
      session_id: 'carrier_embedded_authority',
    },
  ]);

  assert.deepEqual(summary, {
    siteId: null,
    agentId: 'narada-staccato.resident',
    role: 'resident',
    sessionId: 'carrier_embedded_authority',
    title: 'narada-staccato.resident',
    subtitle: 'Role: resident · Browser projection attached to one NARS runtime.',
  });
  assert.deepEqual(summarizeSessionTitleParts(summary), { siteLabel: 'narada-staccato', agentLabel: 'resident' });
});

test('session identity projection keeps canonical identity stable across mixed local and canonical event ids', () => {
  const identityRef = {
    schema: 'narada.agent_identity_ref.v2',
    identity_scope: { kind: 'narada_site', site_id: 'sonar' },
    local_agent_id: 'resident',
    role: 'resident',
    canonical_agent_id: 'sonar.resident',
    display: 'sonar.resident',
    legacy_agent_id: 'resident',
  };
  const summary = summarizeSessionIdentity([
    {
      event: 'session_started',
      site_id: 'sonar',
      agent_id: 'sonar.resident',
      agent_identity_ref: identityRef,
      role: 'resident',
      session_id: 'carrier_mixed_identity',
    },
    {
      event: 'input_event_started',
      site_id: 'sonar',
      agent_id: 'resident',
      agent_identity_ref: identityRef,
      role: 'resident',
      session_id: 'carrier_mixed_identity',
    },
    {
      event: 'session_health',
      site_id: 'sonar',
      agent_id: 'sonar.resident',
      agent_identity_ref: identityRef,
      role: 'resident',
      session_id: 'carrier_mixed_identity',
    },
  ]);

  assert.deepEqual(summary, {
    siteId: 'sonar',
    agentId: 'sonar.resident',
    role: 'resident',
    sessionId: 'carrier_mixed_identity',
    title: 'sonar.resident',
    subtitle: 'Role: resident · Browser projection attached to one NARS runtime.',
  });
  assert.deepEqual(summarizeSessionTitleParts(summary), { siteLabel: 'sonar', agentLabel: 'resident' });
});

test('session title parts do not duplicate an explicit Site id when agent id is canonical', () => {
  assert.deepEqual(summarizeSessionTitleParts({ siteId: 'sonar', agentId: 'sonar.resident' }), {
    siteLabel: 'sonar',
    agentLabel: 'resident',
  });
});

test('agent-web-ui CSS entry imports logical modules in cascade order', async () => {
  const entry = await readFile(new URL('../src/agent-web-ui.css', import.meta.url), 'utf8');
  assert.equal(entry, [
    '@import "tailwindcss";',
    '@layer narada-theme, narada-base, narada-primitives, narada-operator, narada-shell, narada-panels, narada-layout, narada-content, narada-composer, narada-responsive, narada-dark-theme, narada-dark-overrides;',
    ...AGENT_WEB_UI_CSS_IMPORTS.map(([modulePath, layer]) => '@import "./' + modulePath + '" layer(' + layer + ');'),
    '',
  ].join('\n'));
});

test('Vue layout smoke covers shell, status, event list, composer, and event tone styles', async () => {
  const shell = await readFile(new URL('../src/app/components/NarsSessionShell.vue', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/app/App.vue', import.meta.url), 'utf8');
  const transcript = await readFile(new URL('../src/app/components/ConversationTranscript.vue', import.meta.url), 'utf8');
  const status = await readFile(new URL('../src/app/components/SessionStatusBar.vue', import.meta.url), 'utf8');
  const activity = await readFile(new URL('../src/app/composables/useAgentActivity.ts', import.meta.url), 'utf8');
  const retainedEvents = await readFile(new URL('../src/app/composables/useRetainedEvents.ts', import.meta.url), 'utf8');
  const sessionActions = await readFile(new URL('../src/app/composables/useSessionActions.ts', import.meta.url), 'utf8');
  const projectionVerbosity = await readFile(new URL('../src/app/composables/useProjectionVerbosity.ts', import.meta.url), 'utf8');
  const selectorComponent = await readFile(new URL('../src/app/components/ProjectionVerbositySelect.vue', import.meta.url), 'utf8');
  const composer = await readFile(new URL('../src/app/components/OperatorComposer.vue', import.meta.url), 'utf8');
  const boxVisibilityPreference = await readFile(new URL('../src/app/composables/useBoxVisibilityPreference.ts', import.meta.url), 'utf8');
  const browserPreferences = await readFile(new URL('../src/app/lib/browserPreferences.js', import.meta.url), 'utf8');
  const viteConfig = await readFile(new URL('../vite.config.mjs', import.meta.url), 'utf8');
  const css = await readAgentWebUiCss();
  assert.match(css, /--sans:\s*Inter/);
  assert.match(css, /var\(--sans\)/);
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
  assert.match(shell, /AGENT_WEB_UI_PREFERENCE_KEYS\.statusRowOpen/);
  assert.match(app, /useAgentActivity\(session\.events, health\.body\)/);
  assert.match(app, /useSessionActions\(connection\.connection, session\.retain, supportsProtocolMethod\)/);
  assert.match(app, /sessionActions\.send/);
  assert.match(sessionActions, /invalid_session_action/);
  assert.match(sessionActions, /unsupported_session_control/);
  assert.match(sessionActions, /event stream is not open/);
  assert.match(activity, /active_turn_state/);
  assert.match(shell, /AGENT_WEB_UI_PREFERENCE_KEYS\.headerItems/);
  assert.match(shell, /Connection: \{\{ runtimeTopology\.verdictLabel \}\}/);
  assert.match(status, /AGENT_WEB_UI_PREFERENCE_KEYS\.statusBoxes/);
  assert.match(status, /Authority Detail/);
  assert.match(composer, /AGENT_WEB_UI_PREFERENCE_KEYS\.operatorFooterItems/);
  assert.match(composer, /label: 'Target'/);
  assert.match(composer, /label: 'Operator Input'/);
  assert.match(composer, /useBoxVisibilityPreference\(\{[\s\S]*allowEmpty: true/);
  assert.match(status, /useBoxVisibilityPreference\(\{/);
  assert.match(shell, /useBoxVisibilityPreference\(\{/);
  assert.match(boxVisibilityPreference, /allowEmpty === true && parsed\.length === 0/);
  assert.match(boxVisibilityPreference, /const orderedIds = options\.itemIds\.filter\(\(id\) => ids\.has\(id\)\)/);
  for (const key of ['projectionVerbosity', 'headerItems', 'statusBoxes', 'statusRowOpen', 'operatorFooterItems', 'operatorQueueOpen', 'operatorSnippets']) {
    assert.match(browserPreferences, new RegExp(`${key}:`));
  }
  assert.match(browserPreferences, /function readJsonPreference/);
  assert.match(browserPreferences, /function writeJsonPreference/);
  assert.match(viteConfig, /chunkSizeWarningLimit: 900/);
  assert.match(viteConfig, /warning\.code === 'INVALID_ANNOTATION'/);
  assert.match(viteConfig, /@vueuse/);
  assert.doesNotMatch(composer, /label: 'Operator Input'[\s\S]{0,140}required: true/);
  assert.match(composer, /<BoxVisibilitySelector/);
  assert.match(composer, /panel-id="operator-footer-item-selector-panel"/);
  assert.match(composer, /class="composer-target"/);
  assert.match(composer, /class="composer-input-box"/);
  assert.match(status, /import BoxRowShell/);
  assert.match(status, /<BoxRowShell row-label="Session status" class-name="status"/);
  assert.match(status, /placement="row-control"/);
  assert.match(css, /\.box-row-shell/);
  assert.match(css, /\.box-row-controls/);
  assert.match(composer, /import BoxRowShell/);
  assert.match(composer, /<BoxRowShell row-label="Operator input footer" class-name="operator-footer-row">/);
  assert.match(composer, /class="composer-submit"/);
  assert.match(composer, /class="composer-input-actions"/);
  assert.ok(composer.indexOf('<BoxVisibilitySelector') < composer.indexOf('class="composer-submit"'));
  assert.ok(composer.indexOf('class="composer-target"') < composer.indexOf('<BoxRowShell row-label="Operator input footer"'));
  assert.ok(composer.indexOf('class="composer-input-box"') > composer.indexOf('<BoxRowShell row-label="Operator input footer"'));
  assert.match(css, /\.operator-footer-row/);
  assert.match(css, /\.operator-footer-row \{[^}]*grid-template-columns: minmax\(0, 1fr\);[^}]*gap: 0;/s);
  assert.doesNotMatch(css, /\.box-row-shell-with-controls/);
  assert.match(css, /\.composer-input-actions \{[^}]*flex-direction: column;[^}]*align-items: flex-end;[^}]*justify-content: space-between;/s);
  assert.match(css, /\.composer-submit \{/);
  assert.doesNotMatch(css, /\.composer button \{/);
  assert.doesNotMatch(css, /\.composer-items/);
  assert.doesNotMatch(css, /\.composer-controls/);
  assert.match(css, /\.composer-input-box/);
  assert.match(css, /\.box-visibility-selector-shell\s*\{[^}]*position: relative/);
  assert.match(css, /\.box-visibility-selector-trigger\s*\{[^}]*position: relative/);
  assert.doesNotMatch(css, /\.box-visibility-selector-shell[\s\S]*?top: 42px/);
  assert.match(css, /\.box-visibility-selector-trigger[\s\S]*?width: 26px/);
  assert.match(css, /\.box-visibility-selector-icon/);
  assert.match(css, /\.shell \.narada-list-reset\s*\{[^}]*list-style: none;/s);
  assert.match(css, /\.shell \.event \.event-heading\s*\{/);
  assert.match(css, /\.shell \.event \.message-markdown\s*\{/);
  for (const eventDescendant of ['event-heading', 'event-label', 'event-kind', 'event-detail', 'event-summary', 'message-content', 'message-part', 'message-plain', 'message-markdown']) {
    assert.doesNotMatch(css, new RegExp('^\\s*\\.' + eventDescendant + '\\s*\\{', 'm'), eventDescendant);
  }
  assert.doesNotMatch(status, /narada\.agent-web-ui\.status-boxes\.v1/);
  assert.match(status, /projection-publish-stack/);
  assert.match(status, /projection-status-label/);
  assert.match(app, /function followLatestTranscript\(\)/);
  assert.match(app, /function setProjectionVerbosity/);
  assert.match(app, /@update:verbosity="setProjectionVerbosity"/);
  assert.match(app, /function steerQueuedNow/);
  assert.match(app, /@steer-queued="steerQueuedNow"/);
  const queuePanel = await readFile(new URL('../src/app/components/OperatorQueuePanel.vue', import.meta.url), 'utf8');
  assert.match(queuePanel, /AGENT_WEB_UI_PREFERENCE_KEYS\.operatorQueueOpen/);
  assert.match(queuePanel, /canSteerActiveTurn: boolean/);
  assert.match(queuePanel, /!activeTurnId \|\| !canSteerActiveTurn/);
  assert.match(transcript, /followLatestRevision/);
  assert.match(transcript, /type ScrollAuthority = 'auto_follow' \| 'operator_controlled' \| 'force_follow_once'/);
  assert.match(transcript, /agentActivityRevision/);
  assert.match(transcript, /renderedRowRevision/);
  assert.match(transcript, /scrollAuthority\.value === 'operator_controlled'/);
  assert.match(transcript, /hasUnseenRows\.value = true/);
  assert.match(transcript, /New messages/);
  assert.match(transcript, /setTimeout\(\(\) => \{/);
  assert.match(css, /\.new-messages-button/);
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
  for (const broadSelector of ['status', 'label', 'events', 'composer']) {
    assert.doesNotMatch(css, new RegExp('^\\s*\\.' + broadSelector + '\\s*\\{', 'm'), broadSelector);
    assert.match(css, new RegExp('\\.shell \\.' + broadSelector + '(?:\\s|[,{])'), broadSelector);
  }
});

test('agent-web-ui CSS enforces theme-token discipline for new color declarations', async () => {
  const css = await readAgentWebUiCss();
  const root = postcss.parse(css, { from: 'agent-web-ui.css' });
  const violations = rawColorDeclarationViolations(root);
  assert.deepEqual(violations, []);

  const missingCustomProperties = rawCustomPropertyReferenceViolations(root);
  assert.deepEqual(missingCustomProperties, []);

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
  const app = await readFile(new URL('../src/app/App.vue', import.meta.url), 'utf8');
  const shell = await readFile(new URL('../src/app/components/NarsSessionShell.vue', import.meta.url), 'utf8');
  const transcript = await readFile(new URL('../src/app/components/ConversationTranscript.vue', import.meta.url), 'utf8');
  const messageContent = await readFile(new URL('../src/app/components/content/MessageContent.vue', import.meta.url), 'utf8');
  const markdownPart = await readFile(new URL('../src/app/components/content/MarkdownTextPart.vue', import.meta.url), 'utf8');
  const intentPart = await readFile(new URL('../src/app/components/content/IntentRefPart.vue', import.meta.url), 'utf8');
  const mermaidPart = await readFile(new URL('../src/app/components/content/MermaidDiagramPart.vue', import.meta.url), 'utf8');
  const renderedFrame = await readFile(new URL('../src/app/components/content/RenderedPartFrame.vue', import.meta.url), 'utf8');
  const parser = await readFile(new URL('../src/app/lib/messageContent.ts', import.meta.url), 'utf8');
  const css = await readAgentWebUiCss();

  assert.match(eventRow, /<MessageContent :content="row\.summary"/);
  assert.match(eventRow, /event-view-\$\{props\.verbosity\}/);
  assert.match(eventRow, /event-disposition-\$\{String\(row\.disposition/);
  assert.match(eventRow, /v-if="verbosity !== 'conversation'" class="event-kind"/);
  assert.match(projectionSelect, /conversation: 'Chat'/);
  assert.match(projectionSelect, /aria-label="View"/);
  assert.match(messageContent, /buildMessageContentPipeline/);
  assert.match(messageContent, /rendererKeyFor/);
  assert.match(parser, /normalizeTextPart/);
  assert.match(parser, /markdown\|md/);
  for (const renderKind of ['plain_text', 'markdown', 'code_block', 'mermaid_diagram', 'json_block', 'intent_ref']) {
    assert.equal(messageContent.includes(renderKind), true, renderKind);
    assert.equal(parser.includes(renderKind), true, renderKind);
  }
  assert.match(messageContent, /IntentRefPart/);
  assert.match(messageContent, /'intent-selected'/);
  assert.match(intentPart, /intent-ref-part/);
  assert.match(intentPart, /stageIntent/);
  assert.match(intentPart, /emit\('intent-selected', intent\)/);
  assert.match(markdownPart, /MarkdownIt/);
  assert.match(markdownPart, /RenderedPartFrame/);
  assert.match(markdownPart, /html: false/);
  assert.match(markdownPart, /linkify: true/);
  assert.match(markdownPart, /v-html="renderedMarkdown"/);
  assert.match(markdownPart, /handleMarkdownClick/);
  assert.match(markdownPart, /markdown-intent-button/);
  assert.match(markdownPart, /data-intent/);
  assert.match(markdownPart, /intentFromLink/);
  assert.match(markdownPart, /emit\('intent-selected', intent\)/);
  assert.match(transcript, /@intent-selected="emit\('intent-selected', \$event\)"/);
  assert.match(shell, /@intent-selected="emit\('intent-selected', \$event\)"/);
  assert.match(app, /function fillIntentRef/);
  assert.match(app, /draft\.value = normalized/);
  assert.match(app, /#operator-input/);
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
  assert.match(css, /\.intent-ref-part/);
  assert.match(css, /\.markdown-intent-button/);
  assert.match(css, /data-status='staged'/);
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
    assert.match(index, /"session.submit"/);
    assert.doesNotMatch(index, /"conversation.send"/);
    assert.doesNotMatch(index, /"session.command.execute"/);
    assert.doesNotMatch(index, /"carrier.command.execute"/);

    const faviconResponse = await fetch(new URL('/narada-favicon.svg', web.url));
    assert.equal(faviconResponse.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
    assert.match(await faviconResponse.text(), /<svg/);

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
  await withRealNarsWebServer(async ({ web, eventProjection, healthProjection, events, providerCalls }) => {
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
      assert.equal(config.admittedMethods.includes('session.submit'), true);
      assert.equal(config.admittedMethods.includes('conversation.send'), false);
      assert.deepEqual(config.admittedMethods, [...AGENT_WEB_UI_NARS_METHOD_LIST]);

      const health = await fetch(new URL('/api/health', web.url)).then((response) => response.json());
      assert.equal(health.schema, 'narada.nars.health.v1');
      assert.equal(health.status, 'healthy');
      assert.equal(health.session_id, 'session_web_ui_config_real_nars');
      assert.equal(health.intelligence.model, 'gpt-5.5');
      assert.equal(health.operational_posture, 'healthy');
      assert.equal(health.mcp_operational_state, 'healthy');
      assert.equal(health.mcp_tools, undefined);
      assert.equal(health.mcp?.tools, undefined);
      const fullHealth = await fetch(new URL('/api/health?detail=full', web.url)).then((response) => response.json());
      assert.equal(fullHealth.schema, 'narada.nars.health.v1');
      assert.equal(fullHealth.status, 'healthy');
      assert.equal(fullHealth.mcp_tools, undefined);
      assert.equal(fullHealth.mcp?.tools, undefined);

      assert.equal((await client.nextJson()).event, 'websocket_connected');
      client.sendJson({ id: 'events-1', method: 'session.events.subscribe', params: { include_replay: true, max_replay: 10 } });
      const subscribed = await client.nextJson();
      assert.equal(subscribed.event, 'session_events_subscription_started');
      let replayedSessionStarted = null;
      for (let index = 0; index < subscribed.replay_count; index += 1) {
        const replay = await client.nextJson();
        if (replay.event === 'session_event' && replay.payload?.event === 'session_started') replayedSessionStarted = replay;
      }
      assert.equal(replayedSessionStarted?.payload?.event, 'session_started');

      client.sendJson({ id: 'input-1', method: 'session.submit', params: { content: 'run startup sequence', source: 'manual_operator' } });
      await waitFor(() => providerCalls.length === 1, { timeoutMs: 2000 });
      assert.equal(providerCalls[0].messages.some((message) => message.role === 'user' && /run startup sequence/.test(message.content)), true);
      await waitFor(() => events.some((event) => event.event === 'assistant_message' && event.content === 'Real NARS fixture response.'), { timeoutMs: 2000 });
    } finally {
      client.close();
    }
  });
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
    admittedMethods: [...AGENT_WEB_UI_NARS_METHOD_LIST],
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
