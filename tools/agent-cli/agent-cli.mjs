#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { pathToFileURL } from 'node:url';
import { loadSiteMcpFabric, projectServerEnvironment } from '../mcp-fabric/mcp-fabric.mjs';
import {
  argumentSummary,
  classifyCarrierActionRequest,
  createAndWriteCarrierActionAdmission,
  inspectPayloadForSecrets,
} from '../carrier-action-admission/carrier-action-admission.mjs';
import { buildFallbackToolMetadata, resolveToolMetadata } from '../carrier-action-admission/tool-metadata.mjs';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const PROVIDER_METADATA = Object.freeze(parseJson(readFileSync(new URL('./intelligence-providers.json', import.meta.url), 'utf-8')).providers ?? {});
const INTELLIGENCE_PROVIDER = process.env.NARADA_INTELLIGENCE_PROVIDER ?? 'codex-subscription';
const PROVIDER_DEFAULT = PROVIDER_METADATA[INTELLIGENCE_PROVIDER] ?? PROVIDER_METADATA['openai-api'];
const API_KEY = process.env.NARADA_AI_API_KEY ?? (INTELLIGENCE_PROVIDER === 'anthropic-api' ? process.env.ANTHROPIC_API_KEY : '') ?? '';
const BASE_URL = process.env.NARADA_AI_BASE_URL ?? PROVIDER_DEFAULT.base_url;
const MODEL = process.env.NARADA_AI_MODEL ?? PROVIDER_DEFAULT.default_model;
const THINKING_LEVEL = process.env.NARADA_AI_THINKING ?? process.env.NARADA_THINKING_LEVEL ?? 'medium';
const CODEX_SUBSCRIPTION_TRANSPORT = process.env.NARADA_CODEX_SUBSCRIPTION_TRANSPORT ?? 'exec-json';
const SITE_ROOT = resolve(process.env.NARADA_SITE_ROOT ?? process.cwd());
const PROVIDER_SUPPORT_STATES = Object.freeze({
  DECLARED: 'declared',
  ADMITTED_UNSUPPORTED: 'admitted_unsupported',
  ADAPTER_IMPLEMENTED: 'adapter_implemented',
  VERIFIED_SUPPORTED: 'verified_supported',
  DEPRECATED: 'deprecated',
  REMOVED: 'removed',
});
const REQUEST_ADAPTERS = Object.freeze({
  'openai-compatible-chat-completions': {
    buildRequest: buildOpenAiChatRequest,
    parseResponse: (response) => response,
  },
  'anthropic-messages': {
    buildRequest: buildAnthropicMessagesRequest,
    parseResponse: parseAnthropicMessagesResponse,
  },
  'codex-mcp-server': {
    buildRequest: buildCodexMcpRequest,
    parseResponse: parseCodexMcpResponse,
  },
});
let codexSubscriptionThreadId = null;

const options = parseArgs(process.argv.slice(2));
const IDENTITY = options.identity ?? 'narada.architect';
const SESSION = options.session ?? IDENTITY.replace(/\./g, '-');
const AUTO_APPROVE = true;
const PROGRAMMATIC_INPUTS = buildProgrammaticInputs(options);
const EXIT_AFTER_PROGRAMMATIC_INPUT = PROGRAMMATIC_INPUTS.length > 0 && options.interactiveAfterMessage !== true;
const SERVER_MODE = options.server === true;
const sessionSettings = {
  model: options.model ?? MODEL,
  thinking: normalizeThinkingLevel(options.thinking ?? THINKING_LEVEL),
  stream: options.stream ?? parseBooleanEnv(process.env.NARADA_AGENT_CLI_STREAM, !SERVER_MODE),
};
const terminalStyle = createTerminalStyle({
  enabled: options.color ?? parseColorEnv(process.env.NARADA_AGENT_CLI_COLOR, process.stdout.isTTY && !SERVER_MODE),
});

// Session persistence
const PC_RUNTIME = resolve('C:/ProgramData/Narada/sites/pc/desktop-sunroom-2/runtime');
const SESSION_DIR = SERVER_MODE
  ? join(SITE_ROOT, '.narada', 'crew', 'nars-sessions', SESSION)
  : (existsSync(PC_RUNTIME) ? join(PC_RUNTIME, 'agent-sessions') : resolve(SITE_ROOT, '.ai', 'runtime', 'agent-sessions'));
if (!existsSync(SESSION_DIR)) mkdirSync(SESSION_DIR, { recursive: true });
const SESSION_PATH = SERVER_MODE ? join(SESSION_DIR, 'session.jsonl') : join(SESSION_DIR, `${SESSION}.jsonl`);
const EVENTS_PATH = join(SESSION_DIR, 'events.jsonl');

// Set window title for OSL binding
if (process.title !== IDENTITY) {
  process.title = IDENTITY;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (SERVER_MODE) {
    await runServerMode();
    return;
  }

  const mcpServers = await discoverAndStartMcpServers(SITE_ROOT);
  const allTools = aggregateTools(mcpServers);
  const rolePrompt = loadRolePrompt(IDENTITY, SITE_ROOT);
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  printHeader(`Identity: ${IDENTITY}`, { before: true });
  printHeader(`Session: ${SESSION}`);
  printHeader(`Provider: ${INTELLIGENCE_PROVIDER}`);
  printHeader(`Model: ${sessionSettings.model}`);
  printHeader(`Thinking: ${sessionSettings.thinking}`);
  printHeader(`Stream: ${sessionSettings.stream ? 'on' : 'off'}`);
  printHeader(`MCP servers: ${Object.keys(mcpServers).length}`);
  for (const [name, srv] of Object.entries(mcpServers)) {
    printHeader(`  ${name}: ${srv.tools.length} tools`);
  }
  printHeader(`Tools available: ${allTools.length}`);
  printHeader('Tool approvals: disabled');
  printHeader('Type /help for commands.', { after: true });

  let messages = loadSession(SESSION_PATH);
  if (messages.length === 0 && rolePrompt) {
    messages.push({ role: 'system', content: rolePrompt });
  }

  for (const input of PROGRAMMATIC_INPUTS) {
    await submitUserInput({ input, messages, tools: allTools, mcpServers, rl });
  }
  if (EXIT_AFTER_PROGRAMMATIC_INPUT) {
    rl.close();
    for (const server of Object.values(mcpServers)) {
      if (server.process) server.process.kill();
    }
    printHeader('Programmatic input processed. Goodbye.', { before: true });
    return;
  }

  while (true) {
    const userInput = await question(rl, terminalStyle.prompt(`${IDENTITY}> `));
    if (userInput === '__READLINE_CLOSED__') break;
    const slashCommand = await handleSlashCommand(userInput, { mcpServers, allTools });
    if (slashCommand === 'exit') break;
    if (slashCommand === 'handled') continue;
    if (userInput.trim().length === 0) continue;

    await submitUserInput({
      input: { content: userInput, source: 'manual_operator' },
      messages,
      tools: allTools,
      mcpServers,
      rl,
    });
  }

  rl.close();
  for (const server of Object.values(mcpServers)) {
    if (server.process) server.process.kill();
  }
  printHeader('Session saved. Goodbye.', { before: true });
}

async function handleSlashCommand(input, { mcpServers, allTools }) {
  const trimmed = String(input ?? '').trim();
  if (!trimmed) return 'none';
  if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === '/exit' || trimmed.toLowerCase() === '/quit') {
    appendSession(SESSION_PATH, sessionEventEntry('session_command', { command: '/exit' }));
    return 'exit';
  }
  if (!trimmed.startsWith('/')) return 'none';

  const [rawCommand, ...rest] = trimmed.split(/\s+/);
  const command = rawCommand.toLowerCase();
  const value = rest.join(' ').trim();
  if (command === '/help') {
    printAssistantMessage('Commands: /help, /status, /model <name>, /thinking none|low|medium|high, /exit');
    return 'handled';
  }
  if (command === '/status') {
    printAssistantMessage([
      `Identity: ${IDENTITY}`,
      `Session: ${SESSION}`,
      `Provider: ${INTELLIGENCE_PROVIDER}`,
      `Model: ${sessionSettings.model}`,
      `Thinking: ${sessionSettings.thinking}`,
      `Stream: ${sessionSettings.stream ? 'on' : 'off'}`,
      `MCP servers: ${Object.keys(mcpServers).length}`,
      `Tools: ${allTools.length}`,
    ].join('\n'));
    appendSession(SESSION_PATH, sessionEventEntry('session_command', { command: '/status' }));
    return 'handled';
  }
  if (command === '/model') {
    if (!value) {
      printAssistantMessage(`Current model: ${sessionSettings.model}`);
      return 'handled';
    }
    sessionSettings.model = value;
    appendSession(SESSION_PATH, sessionEventEntry('session_setting_changed', { setting: 'model', value }));
    printAssistantMessage(`Model set to ${sessionSettings.model}`);
    return 'handled';
  }
  if (command === '/thinking') {
    if (!value) {
      printAssistantMessage(`Current thinking: ${sessionSettings.thinking}`);
      return 'handled';
    }
    const next = normalizeThinkingLevel(value);
    if (next !== value.toLowerCase()) {
      printAssistantMessage('Usage: /thinking none|low|medium|high');
      return 'handled';
    }
    sessionSettings.thinking = next;
    appendSession(SESSION_PATH, sessionEventEntry('session_setting_changed', { setting: 'thinking', value: next }));
    printAssistantMessage(`Thinking set to ${sessionSettings.thinking}`);
    return 'handled';
  }
  printAssistantMessage(`Unknown command: ${command}. Type /help.`);
  return 'handled';
}

// ---------------------------------------------------------------------------
// Conversation loop
// ---------------------------------------------------------------------------
async function submitUserInput({ input, messages, tools, mcpServers, rl, turn = null, emit = null, callChatApiFn = callChatApi }) {
  const record = normalizeInputRecord(input);
  messages.push({ role: 'user', content: record.content });
  appendSession(SESSION_PATH, sessionLogEntry({ role: 'user', content: record.content, source: record.source, authorityRef: record.authority_ref }));
  const progress = !emit && !turn ? startInteractiveTurnProgress() : null;
  try {
    return await runConversationTurn(messages, tools, mcpServers, rl, { turn: turn ?? progress?.turn ?? null, emit, callChatApiFn });
  } finally {
    progress?.stop();
  }
}

async function runConversationTurn(messages, tools, mcpServers, rl, options = {}) {
  const emit = options.emit ?? null;
  const turn = options.turn ?? null;
  const callChatApiFn = options.callChatApiFn ?? callChatApi;
  while (true) {
    if (turn?.interruptRequested) {
      emit?.('turn_interrupted', { turn_id: turn.turnId, terminal_state: 'interrupted' });
      return { terminal_state: 'interrupted' };
    }
    const response = await callChatApiFn(messages, tools, { ...sessionSettings, turn, emit, mcpServers });
    if (turn?.interruptRequested) {
      emit?.('turn_interrupted', { turn_id: turn.turnId, terminal_state: 'interrupted' });
      return { terminal_state: 'interrupted' };
    }
    const choice = response.choices?.[0];
    if (!choice) {
      if (!emit) printHeader('No response from AI.', { level: 'warn' });
      return { terminal_state: 'failed', reason: 'no_response_from_ai' };
    }

    const message = choice.message;
    messages.push(message);
    appendSession(SESSION_PATH, {
      role: 'assistant',
      content: message.content ?? null,
      tool_calls: message.tool_calls ?? undefined,
      reasoning_content: message.reasoning_content ?? undefined,
      timestamp: new Date().toISOString(),
    });

    if (message.content) {
      if (emit) emit('assistant_message', { turn_id: turn?.turnId ?? null, content: message.content });
      else if (response.streaming_rendered !== true) printAssistantMessage(message.content);
    }

    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolResults = [];
      for (const toolCall of message.tool_calls) {
        if (turn?.interruptRequested) {
          emit?.('turn_interrupted', { turn_id: turn.turnId, terminal_state: 'interrupted' });
          break;
        }
        const result = await executeMcpTool(toolCall, mcpServers, rl, { emit, turnId: turn?.turnId ?? null, serverMode: !!emit });
        toolResults.push(result);
      }
      if (turn?.interruptRequested) return { terminal_state: 'interrupted' };
      for (const result of toolResults) {
        messages.push(result);
        appendSession(SESSION_PATH, { role: 'tool', content: result.content, tool_call_id: result.tool_call_id, timestamp: new Date().toISOString() });
      }
      // Loop back to send tool results to AI
      continue;
    }

    return { terminal_state: 'completed' };
  }
}

// ---------------------------------------------------------------------------
// MCP Tool Execution with Approval Gates
// ---------------------------------------------------------------------------
async function executeMcpTool(toolCall, mcpServers, rl, options = {}) {
  const name = toolCall.function?.name ?? '';
  const args = parseJson(toolCall.function?.arguments ?? '{}');
  const binding = findToolBinding(name, mcpServers);
  const server = binding?.server ?? null;
  const toolMetadata = resolveToolMetadata({ toolName: name, server, tool: binding?.tool ?? null });
  const emit = options.emit ?? null;
  const turnId = options.turnId ?? null;
  const serverMode = options.serverMode === true;
  const admissionClassification = serverMode
    ? classifyCarrierActionRequest(name, args, { toolAvailable: !!server, toolMetadata })
    : null;
  const category = serverMode
    ? (admissionClassification.decision === 'read_only_admitted' ? 'auto' : 'prompt')
    : classifyTool(name, args);
  const admissionRequired = serverMode && admissionClassification.decision !== 'read_only_admitted';

  if (emit) {
    if (serverMode) {
      emit('tool_call', {
        turn_id: turnId,
        tool: name,
        decision: admissionClassification.decision,
        classifier_source: admissionClassification.classifier_source ?? toolMetadata?.source ?? null,
        argument_summary: argumentSummary(args),
        payload_secret_findings: inspectPayloadForSecrets(args),
        raw_arguments_recorded: false,
        raw_secret_values_recorded: false,
        carrier_mutation_admitted: false,
      });
    } else {
      emit('tool_call', {
        turn_id: turnId,
        tool: name,
        arguments: args,
        decision: 'read_only_admitted',
        carrier_mutation_admitted: false,
      });
    }
  }
  if (!serverMode) printToolLine(`${name}(${JSON.stringify(args).slice(0, 200)})`, { before: true });

  if (category === 'block') {
    if (!serverMode) printToolLine(`BLOCKED: ${name} is on the blocklist.`, { level: 'warn' });
    emit?.('tool_result', { turn_id: turnId, tool: name, status: 'blocked' });
    return {
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify({ error: `Tool ${name} is blocked by policy.` }),
    };
  }
  if (!server) {
    if (serverMode) {
      const admission = createAndWriteCarrierActionAdmission({
        agentId: options.agentId ?? IDENTITY,
        carrierSessionId: options.carrierSessionId ?? SESSION,
        turnId,
        toolCallId: toolCall.id,
        toolName: name,
        args,
        siteRoot: options.siteRoot ?? SITE_ROOT,
        toolAvailable: false,
        toolMetadata,
      });
      const decision = admission.decision;
      emit?.('tool_result', {
        turn_id: turnId,
        tool: name,
        status: 'admission_required',
        request_id: decision.request_id,
        decision: decision.decision,
        reason: decision.reason,
        authority_owner: decision.authority_owner,
        evidence_path: admission.path,
        candidate_ref: decision.candidate_ref,
        carrier_mutation_admitted: decision.carrier_mutation_admitted,
      });
      return {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify({
          error: 'action_admission_required',
          request_id: decision.request_id,
          tool: name,
          category,
          decision: decision.decision,
          reason: decision.reason,
          authority_owner: decision.authority_owner,
          evidence_path: admission.path,
          candidate_ref: decision.candidate_ref,
          carrier_mutation_admitted: decision.carrier_mutation_admitted,
          message: `NARS server mode could not execute this MCP tool because it is not available in the session.`,
        }),
      };
    }
    emit?.('tool_result', { turn_id: turnId, tool: name, status: 'error', error: `Tool ${name} not found in any MCP server.` });
    return {
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify({ error: `Tool ${name} not found in any MCP server.` }),
    };
  }

  if (admissionRequired) {
    const admission = createAndWriteCarrierActionAdmission({
      agentId: options.agentId ?? IDENTITY,
      carrierSessionId: options.carrierSessionId ?? SESSION,
      turnId,
      toolCallId: toolCall.id,
      toolName: name,
        args,
        siteRoot: options.siteRoot ?? SITE_ROOT,
        toolMetadata,
      });
    const decision = admission.decision;
    emit?.('tool_result', {
      turn_id: turnId,
      tool: name,
      status: 'admission_required',
      request_id: decision.request_id,
      decision: decision.decision,
      reason: decision.reason,
      authority_owner: decision.authority_owner,
      evidence_path: admission.path,
      candidate_ref: decision.candidate_ref,
      carrier_mutation_admitted: decision.carrier_mutation_admitted,
    });
    return {
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify({
        error: 'action_admission_required',
        request_id: decision.request_id,
        tool: name,
        category,
        decision: decision.decision,
        reason: decision.reason,
        authority_owner: decision.authority_owner,
        evidence_path: admission.path,
        candidate_ref: decision.candidate_ref,
        carrier_mutation_admitted: decision.carrier_mutation_admitted,
        message: 'NARS server mode did not execute this MCP tool because it is not classified read-only.',
      }),
    };
  }

  try {
    const result = await sendMcpRequest(server, {
      jsonrpc: '2.0',
      id: randomId(),
      method: 'tools/call',
      params: { name, arguments: args },
    });

    // Handle shell server approval_required fallback
    if (result.content?.[0]?.text) {
      const text = result.content[0].text;
      try {
        const parsed = JSON.parse(text);
        if (parsed.approval_required === true && !serverMode) {
          // Re-send with auto-approve flag (only for shell server)
          if (server.config?.command?.includes('shell')) {
            const autoResult = await sendMcpRequest(server, {
              jsonrpc: '2.0',
              id: randomId(),
              method: 'tools/call',
              params: { name, arguments: { ...args, __auto_approved: true } },
            });
            const autoContent = autoResult.content?.[0]?.text ?? JSON.stringify(autoResult);
            printToolLine(`-> ${autoContent.slice(0, 500)}${autoContent.length > 500 ? '...' : ''}`);
            return { role: 'tool', tool_call_id: toolCall.id, content: autoContent };
          }
        }
      } catch {
        // not JSON, proceed normally
      }
    }

    const content = result.content?.[0]?.text ?? JSON.stringify(result);
    if (!serverMode) printToolLine(`-> ${content.slice(0, 500)}${content.length > 500 ? '...' : ''}`);
    emit?.('tool_result', {
      turn_id: turnId,
      tool: name,
      status: 'ok',
      decision: serverMode ? 'read_only_admitted' : undefined,
      output_ref: extractOutputRef(content),
    });

    return {
      role: 'tool',
      tool_call_id: toolCall.id,
      content,
    };
  } catch (err) {
    if (!serverMode) printToolLine(`ERROR: ${err.message}`, { level: 'error' });
    emit?.('tool_result', { turn_id: turnId, tool: name, status: 'error', error: err.message });
    return {
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify({ error: err.message }),
    };
  }
}

function extractOutputRef(content) {
  try {
    const parsed = JSON.parse(content);
    return parsed.output_ref ?? null;
  } catch {
    return null;
  }
}

function classifyTool(name, args) {
  const metadata = buildFallbackToolMetadata(name);
  if (metadata?.read_only === true) return 'auto';
  return 'prompt';
}

// ---------------------------------------------------------------------------
// MCP Server Discovery & Management
// ---------------------------------------------------------------------------
async function discoverAndStartMcpServers(siteRoot) {
  const fabric = loadSiteMcpFabric(siteRoot, { required: false });

  const servers = {};
  for (const [serverName, serverConfig] of Object.entries(fabric.servers)) {
    try {
      const args = [...serverConfig.args];
      // Interactive agent-cli keeps its legacy shell affordance. NARS server
      // mode must not widen authority when materializing the MCP fabric.
      if (!SERVER_MODE && serverName.includes('shell')) {
        if (!args.includes('--auto-approve')) args.push('--auto-approve');
      }

      const proc = spawn(serverConfig.command, args, {
        cwd: siteRoot,
        windowsHide: true,
        env: { ...process.env, ...projectServerEnvironment(serverConfig), FORCE_COLOR: '0', NO_COLOR: '1' },
      });

      let buffer = '';
      proc.stdout.setEncoding('utf-8');
      proc.stderr.setEncoding('utf-8');
      proc.stderr.on('data', (d) => {
        const msg = d.toString().trim();
        if (msg) process.stderr.write(`[${serverName}] ${msg}\n`);
      });

      const pending = new Map();
      proc.stdout.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.id != null && pending.has(msg.id)) {
              const request = pending.get(msg.id);
              clearTimeout(request.timeout);
              request.resolve(msg);
              pending.delete(msg.id);
            }
          } catch {
            // ignore malformed
          }
        }
      });

      const send = (req, timeoutMs = 15000) => new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (pending.has(req.id)) {
            pending.delete(req.id);
            reject(new Error(`MCP request timeout after ${timeoutMs}ms`));
          }
        }, timeoutMs);
        pending.set(req.id, { resolve, reject, timeout });
        proc.stdin.write(`${JSON.stringify(req)}\n`);
      });

      // Initialize with timeout
      let initResult, toolsResult;
      try {
        initResult = await send({ jsonrpc: '2.0', id: randomId(), method: 'initialize', params: { protocolVersion: '2024-11-05' } }, 10000);
        toolsResult = await send({ jsonrpc: '2.0', id: randomId(), method: 'tools/list', params: {} }, 10000);
      } catch (err) {
        console.error(`[agent-cli] Failed to initialize MCP server ${serverName}: ${err.message}`);
        proc.kill();
        continue;
      }

      servers[serverName] = {
        process: proc,
        send,
        tools: toolsResult.result?.tools ?? [],
        config: serverConfig,
        registry_tools: serverConfig.registry_tools ?? {},
        registry_source: serverConfig.registry_source ?? null,
        registry_metadata_authoritative: serverConfig.registry_metadata_authoritative === true,
      };
    } catch (err) {
      console.error(`[agent-cli] Failed to start MCP server ${serverName}: ${err.message}`);
    }
  }

  return servers;
}

function aggregateTools(mcpServers) {
  const all = [];
  const seen = new Set();
  for (const [serverName, server] of Object.entries(mcpServers)) {
    for (const tool of server.tools) {
      if (seen.has(tool.name)) continue;
      seen.add(tool.name);
      all.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description ?? '',
          parameters: tool.inputSchema ?? { type: 'object', properties: {} },
        },
      });
    }
  }
  return all;
}

function findToolServer(name, mcpServers) {
  return findToolBinding(name, mcpServers)?.server ?? null;
}

function findToolBinding(name, mcpServers) {
  for (const [serverName, server] of Object.entries(mcpServers)) {
    const tool = server.tools.find((t) => t.name === name);
    if (tool) return { server: { ...server, name: serverName }, tool };
  }
  return null;
}

async function sendMcpRequest(server, request) {
  const response = await server.send(request);
  if (response.error) throw new Error(response.error.message);
  return response.result;
}

// ---------------------------------------------------------------------------
// Role Prompt Loading
// ---------------------------------------------------------------------------
function loadRolePrompt(identityName, siteRoot) {
  const identitiesPath = join(siteRoot, 'operator-surfaces', 'identities.json');
  if (!existsSync(identitiesPath)) return null;
  try {
    const data = parseJson(readFileSync(identitiesPath, 'utf-8'));
    const identity = data.identities?.find((i) =>
      i.identity_name === identityName || i.identity_id === identityName
    );
    if (identity?.carrier_projections?.windows_terminal?.role_prompt) {
      return identity.carrier_projections.windows_terminal.role_prompt;
    }
    // Fallback to desired-sessions
    const sessionsPath = join(siteRoot, 'operator-surfaces', 'desired-sessions.json');
    if (existsSync(sessionsPath)) {
      const sessions = parseJson(readFileSync(sessionsPath, 'utf-8'));
      const session = sessions.sessions?.find((s) => s.identity_name === identityName);
      if (session?.inhabiting_cli?.description) {
        return `You are ${identityName}. ${session.inhabiting_cli.description}`;
      }
    }
  } catch {
    // ignore
  }
  return `You are ${identityName}, a software engineering agent. Work from the current directory and keep sessions coherent.`;
}

// ---------------------------------------------------------------------------
// Session Persistence
// ---------------------------------------------------------------------------
function loadSession(path) {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf-8').split(/\r?\n/).filter((l) => l.trim());
  const loaded = lines.map((l) => {
    try {
      const { role, content, tool_call_id, tool_calls, reasoning_content } = JSON.parse(l);
      if (role === 'event') return null;
      const msg = { role, content };
      if (tool_call_id) msg.tool_call_id = tool_call_id;
      if (tool_calls) msg.tool_calls = tool_calls;
      if (reasoning_content !== undefined) msg.reasoning_content = reasoning_content;
      return msg;
    } catch {
      return { role: 'user', content: l };
    }
  }).filter(Boolean);
  return removeInvalidToolHistory(loaded);
}

function removeInvalidToolHistory(messages) {
  const cleaned = [];
  const pendingToolCallIds = new Set();
  for (const message of messages) {
    if (message.role === 'assistant') {
      for (const toolCall of message.tool_calls ?? []) {
        if (toolCall?.id) pendingToolCallIds.add(toolCall.id);
      }
      cleaned.push(message);
      continue;
    }
    if (message.role === 'tool') {
      if (!message.tool_call_id || !pendingToolCallIds.has(message.tool_call_id)) {
        continue;
      }
      pendingToolCallIds.delete(message.tool_call_id);
      cleaned.push(message);
      continue;
    }
    cleaned.push(message);
  }
  return cleaned;
}

function appendSession(path, entry) {
  appendFileSync(path, JSON.stringify(entry) + '\n', 'utf-8');
}

function sessionLogEntry({ role, content, source, authorityRef, toolCallId }) {
  const entry = { role, content, timestamp: new Date().toISOString() };
  if (toolCallId) entry.tool_call_id = toolCallId;
  if (source) entry.source = source;
  if (authorityRef) entry.authority_ref = authorityRef;
  return entry;
}

function sessionEventEntry(event, payload = {}) {
  return { role: 'event', event, ...payload, timestamp: new Date().toISOString() };
}

function startInteractiveTurnProgress() {
  const turn = { turnId: randomId(), interruptRequested: false };
  const started = Date.now();
  let lastSeconds = -1;
  const writeStatus = () => {
    const seconds = Math.floor((Date.now() - started) / 1000);
    if (seconds === lastSeconds || seconds % 5 !== 0) return;
    lastSeconds = seconds;
    process.stdout.write(`\r${terminalStyle.progress(`[agent-cli] Working (${seconds}s, Esc to interrupt)`)}`);
  };
  const onData = (chunk) => {
    if (Buffer.from(chunk).includes(0x1b)) {
      turn.interruptRequested = true;
      process.stdout.write(`\r${terminalStyle.warn('[agent-cli] Interrupt requested. Waiting for current provider call to return...')}\n`);
    }
  };
  const previousRawMode = process.stdin.isTTY ? process.stdin.isRaw : false;
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.on('data', onData);
  writeStatus();
  const timer = setInterval(writeStatus, 1000);
  return {
    turn,
    stop: () => {
      clearInterval(timer);
      process.stdin.off('data', onData);
      if (process.stdin.isTTY) process.stdin.setRawMode(!!previousRawMode);
      process.stdout.write('\r\x1b[K');
    },
  };
}

function normalizeInputRecord(input) {
  if (typeof input === 'string') return { content: input, source: 'manual_operator' };
  return {
    content: String(input?.content ?? ''),
    source: input?.source ?? 'manual_operator',
    authority_ref: input?.authority_ref ?? null,
  };
}

function buildProgrammaticInputs(opts) {
  const inputs = [];
  for (const message of opts.messages ?? []) {
    inputs.push({ content: message, source: 'programmatic_flag', authority_ref: opts.authorityRef ?? null });
  }
  for (const filePath of opts.messageFiles ?? []) {
    inputs.push({ content: readFileSync(resolve(filePath), 'utf8'), source: 'programmatic_file', authority_ref: opts.authorityRef ?? null });
  }
  return inputs;
}

// ---------------------------------------------------------------------------
// NARS JSONL Server Mode
// ---------------------------------------------------------------------------
async function runServerMode({ input = process.stdin, output = process.stdout, callChatApiFn = callChatApi } = {}) {
  const mcpServers = await discoverAndStartMcpServers(SITE_ROOT);
  const allTools = aggregateTools(mcpServers);
  const rolePrompt = loadRolePrompt(IDENTITY, SITE_ROOT);
  const state = {
    activeTurn: null,
    closed: false,
    pendingRequests: new Set(),
  };
  let messages = loadSession(SESSION_PATH);
  if (messages.length === 0 && rolePrompt) {
    messages.push({ role: 'system', content: rolePrompt });
  }

  const emit = (event, payload = {}) => emitServerEvent(output, {
    event,
    agent_id: IDENTITY,
    session_id: SESSION,
    timestamp: new Date().toISOString(),
    ...payload,
  });

  emit('session_started', {
    transport: 'jsonl_stdio',
    site_root: SITE_ROOT,
    provider: INTELLIGENCE_PROVIDER,
    model: sessionSettings.model,
    thinking: sessionSettings.thinking,
    mcp_server_count: Object.keys(mcpServers).length,
    tool_count: allTools.length,
    session_path: SESSION_PATH,
    events_path: EVENTS_PATH,
  });

  input.setEncoding('utf8');
  let buffer = '';
  const dispatchRequestLine = (line) => {
    const pending = handleServerRequestLine(line, { state, messages, allTools, mcpServers, emit, callChatApiFn })
      .catch((error) => {
        emit('error', {
          request_id: null,
          code: 'request_dispatch_failed',
          message: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        state.pendingRequests.delete(pending);
      });
    state.pendingRequests.add(pending);
  };
  for await (const chunk of input) {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      dispatchRequestLine(line);
      if (state.closed) break;
    }
    if (state.closed) break;
  }
  if (!state.closed && buffer.trim()) {
    dispatchRequestLine(buffer);
  }
  await Promise.allSettled([...state.pendingRequests]);
  closeMcpServers(mcpServers);
}

async function handleServerRequestLine(line, context) {
  let request;
  try {
    request = JSON.parse(line);
  } catch (error) {
    context.emit('error', {
      request_id: null,
      code: 'invalid_json',
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  await handleServerRequest(request, context);
}

async function handleServerRequest(request, { state, messages, allTools, mcpServers, emit, callChatApiFn }) {
  const requestId = request?.id ?? null;
  const method = request?.method;
  try {
    if (method === 'session.status') {
      emit('session_status', serverStatus({ requestId, state, allTools, mcpServers }));
      return;
    }
    if (method === 'conversation.interrupt') {
      if (state.activeTurn) {
        state.activeTurn.interruptRequested = true;
        emit('turn_interrupted', {
          request_id: requestId,
          turn_id: state.activeTurn.turnId,
          terminal_state: 'interrupted_requested',
        });
      } else {
        emit('session_status', serverStatus({ requestId, state, allTools, mcpServers }));
      }
      return;
    }
    if (method === 'session.close') {
      state.closed = true;
      if (state.activeTurn) state.activeTurn.interruptRequested = true;
      emit('session_closed', {
        request_id: requestId,
        terminal_state: 'closed',
      });
      return;
    }
    if (method !== 'conversation.send') {
      emit('error', {
        request_id: requestId,
        code: 'unsupported_method',
        message: `Unsupported method: ${method}`,
      });
      return;
    }
    const message = String(request?.params?.message ?? '');
    if (!message.trim()) {
      emit('error', {
        request_id: requestId,
        code: 'message_required',
        message: 'conversation.send requires params.message',
      });
      return;
    }
    if (state.activeTurn) {
      emit('error', {
        request_id: requestId,
        code: 'turn_already_running',
        message: `Active turn already running: ${state.activeTurn.turnId}`,
      });
      return;
    }
    const turnId = `turn_${randomId()}`;
    const turn = { turnId, requestId, interruptRequested: false };
    state.activeTurn = turn;
    emit('turn_started', { request_id: requestId, turn_id: turnId, terminal_state: 'accepted' });
    try {
      const result = await submitUserInput({
        input: { content: message, source: 'automation_jsonl', authority_ref: request?.params?.authority_ref ?? null },
        messages,
        tools: allTools,
        mcpServers,
        rl: null,
        turn,
        emit,
        callChatApiFn,
      });
      const terminalState = turn.interruptRequested ? 'interrupted' : (result?.terminal_state ?? 'completed');
      if (terminalState === 'failed') {
        emit('turn_failed', {
          request_id: requestId,
          turn_id: turnId,
          terminal_state: 'failed',
          reason: result?.reason ?? 'conversation_turn_failed',
        });
      } else {
        emit('turn_complete', { request_id: requestId, turn_id: turnId, terminal_state: terminalState });
      }
    } catch (error) {
      emit('turn_failed', {
        request_id: requestId,
        turn_id: turnId,
        terminal_state: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      state.activeTurn = null;
    }
  } catch (error) {
    emit('error', {
      request_id: requestId,
      code: 'request_failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function serverStatus({ requestId, state, allTools, mcpServers }) {
  return {
    request_id: requestId,
    transport: 'jsonl_stdio',
    provider: INTELLIGENCE_PROVIDER,
    model: sessionSettings.model,
    thinking: sessionSettings.thinking,
    stream: sessionSettings.stream,
    active_turn_state: state.activeTurn ? 'running' : 'idle',
    active_turn_id: state.activeTurn?.turnId ?? null,
    mcp_server_count: Object.keys(mcpServers).length,
    tool_count: allTools.length,
    session_path: SESSION_PATH,
    events_path: EVENTS_PATH,
  };
}

function emitServerEvent(output, event) {
  const line = `${JSON.stringify(event)}\n`;
  appendFileSync(EVENTS_PATH, line, 'utf8');
  output.write(line);
}

function closeMcpServers(mcpServers) {
  for (const server of Object.values(mcpServers)) {
    if (server.process && !server.process.killed) server.process.kill();
  }
}

// ---------------------------------------------------------------------------
// Chat API
// ---------------------------------------------------------------------------
async function callChatApi(messages, tools, settings = sessionSettings) {
  const adapterResolution = resolveProviderAdapter(INTELLIGENCE_PROVIDER);
  assertApiKeyConfigured(INTELLIGENCE_PROVIDER, API_KEY);
  if (adapterResolution.adapter_id === 'codex-mcp-server') {
    const request = adapterResolution.adapter.buildRequest(messages, tools, settings);
    const response = CODEX_SUBSCRIPTION_TRANSPORT === 'mcp-server'
      ? await sendCodexMcpRequest(request, settings)
      : settings.stream === false
        ? await sendCodexExecJsonBufferedRequest(request, settings)
        : await sendCodexExecJsonRequest(request, settings);
    return adapterResolution.adapter.parseResponse(response);
  }
  const response = await sendProviderRequest(adapterResolution.adapter.buildRequest(messages, tools, settings));
  return adapterResolution.adapter.parseResponse(response);
}

function resolveProviderAdapter(provider, metadata = PROVIDER_METADATA, adapters = REQUEST_ADAPTERS) {
  const providerMetadata = metadata[provider];
  if (!providerMetadata) {
    throw new Error(`Unsupported intelligence provider: ${provider}`);
  }
  const support = resolveProviderSupportState(provider, providerMetadata, adapters);
  if (!support.ready) {
    throw new Error(`Unsupported intelligence provider adapter for ${provider}: ${support.state}. ${support.required_next_step}`);
  }
  const adapter = adapters[providerMetadata.adapter_kind];
  if (!adapter) {
    throw new Error(`Request adapter not implemented for ${provider}: ${providerMetadata.adapter_kind}. support_state=${support.state}. ${support.required_next_step}`);
  }
  return {
    provider_id: provider,
    adapter_id: providerMetadata.adapter_kind,
    support_state: support.state,
    support_status: support.state,
    adapter,
  };
}

function resolveProviderSupportState(provider, providerMetadata, adapters = REQUEST_ADAPTERS) {
  const state = normalizeProviderSupportState(providerMetadata.support_state ?? providerMetadata.support_status);
  const adapterExists = !!adapters[providerMetadata.adapter_kind];
  const required_next_step = requiredNextProviderSupportStep(state, providerMetadata.adapter_kind, adapterExists);
  return {
    provider_id: provider,
    state,
    adapter_kind: providerMetadata.adapter_kind,
    adapter_exists: adapterExists,
    ready: state === PROVIDER_SUPPORT_STATES.VERIFIED_SUPPORTED || state === PROVIDER_SUPPORT_STATES.DEPRECATED,
    required_next_step,
  };
}

function normalizeProviderSupportState(value) {
  if (value === 'supported') return PROVIDER_SUPPORT_STATES.VERIFIED_SUPPORTED;
  if (value === 'unsupported_until_adapter_exists') return PROVIDER_SUPPORT_STATES.ADMITTED_UNSUPPORTED;
  if (value === 'unsupported_until_reviewed') return PROVIDER_SUPPORT_STATES.ADAPTER_IMPLEMENTED;
  return value ?? PROVIDER_SUPPORT_STATES.DECLARED;
}

function requiredNextProviderSupportStep(state, adapterKind, adapterExists) {
  if (state === PROVIDER_SUPPORT_STATES.DECLARED) return 'Admit provider policy and choose a request adapter before launch.';
  if (state === PROVIDER_SUPPORT_STATES.ADMITTED_UNSUPPORTED) return `Implement request adapter ${adapterKind} and move the provider to adapter_implemented.`;
  if (state === PROVIDER_SUPPORT_STATES.ADAPTER_IMPLEMENTED) return 'Verify launcher, docs, credential mapping, and runtime tests before marking verified_supported.';
  if (state === PROVIDER_SUPPORT_STATES.REMOVED) return 'Use an admitted replacement provider or restore the provider through a new contract revision.';
  if (state === PROVIDER_SUPPORT_STATES.DEPRECATED) return 'Provider remains launchable for compatibility; migrate to a non-deprecated provider.';
  if (!adapterExists) return `Implement request adapter ${adapterKind} before launching this provider.`;
  return 'Provider is verified for launch.';
}

function assertApiKeyConfigured(provider, apiKey) {
  if (provider === 'codex-subscription') return;
  if (apiKey) return;
  if (provider === 'anthropic-api') {
    throw new Error('Missing API key for anthropic-api. Set ANTHROPIC_API_KEY or NARADA_AI_API_KEY.');
  }
  throw new Error(`Missing API key for ${provider}. Set NARADA_AI_API_KEY.`);
}

function normalizeThinkingLevel(value) {
  const normalized = String(value ?? 'medium').trim().toLowerCase();
  if (['none', 'low', 'medium', 'high'].includes(normalized)) return normalized;
  return 'medium';
}

function reasoningEffort(thinking) {
  if (thinking === 'none') return null;
  if (thinking === 'low') return 'low';
  if (thinking === 'high') return 'high';
  return 'medium';
}

function buildCodexMcpRequest(messages, tools = [], { model = MODEL, thinking = THINKING_LEVEL, siteRoot = SITE_ROOT } = {}) {
  const latestUserIndex = findLastMessageIndex(messages, 'user');
  const latestToolIndex = findLastMessageIndex(messages, 'tool');
  const latestUser = latestUserIndex >= 0 ? messages[latestUserIndex] : null;
  const latestTool = latestToolIndex >= 0 ? messages[latestToolIndex] : null;
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => String(message.content ?? ''))
    .filter(Boolean)
    .join('\n\n');
  const prompt = latestTool && latestToolIndex > latestUserIndex
    ? [
      `Narada tool result (${latestTool.tool_call_id ?? 'tool'}):`,
      String(latestTool.content ?? ''),
      '',
      'Answer the original request using this tool result.',
    ].join('\n')
    : latestUser ? String(latestUser.content ?? '') : '';
  if (!prompt.trim()) throw new Error('codex_subscription_prompt_missing');
  const developerInstructions = [system, codexToolProtocolInstructions(tools)].filter(Boolean).join('\n\n');

  if (codexSubscriptionThreadId) {
    return {
      tool: 'codex-reply',
      arguments: {
        threadId: codexSubscriptionThreadId,
        prompt,
        model,
        ...(reasoningEffort(thinking) ? { 'reasoning-effort': reasoningEffort(thinking) } : {}),
      },
    };
  }

  return {
    tool: 'codex',
    arguments: {
      prompt,
      cwd: siteRoot,
      model,
      ...(reasoningEffort(thinking) ? { 'reasoning-effort': reasoningEffort(thinking) } : {}),
      sandbox: process.platform === 'win32' ? 'danger-full-access' : 'workspace-write',
      'approval-policy': 'never',
      ...(developerInstructions ? { 'developer-instructions': developerInstructions } : {}),
    },
  };
}

function findLastMessageIndex(messages, role) {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]?.role === role) return index;
  }
  return -1;
}

function codexToolProtocolInstructions(tools = []) {
  if (!Array.isArray(tools) || tools.length === 0) return '';
  const toolLines = tools
    .map((tool) => {
      const fn = tool.function ?? {};
      return `- ${fn.name}: ${String(fn.description ?? '').slice(0, 180)}`;
    })
    .join('\n');
  return [
    'Narada MCP tools are available through agent-cli, not through native Codex tool discovery.',
    'When a Narada MCP tool is needed, respond with exactly one JSON object and no prose:',
    '{"narada_tool_call":{"name":"tool_name","arguments":{}}}',
    'Do not claim a listed Narada MCP tool is unavailable. Request it using the JSON object above.',
    'Available Narada MCP tools:',
    toolLines,
  ].join('\n');
}

function parseCodexMcpResponse(response) {
  if (response?.threadId) codexSubscriptionThreadId = response.threadId;
  const toolCall = parseNaradaToolCall(response?.content ?? '');
  if (toolCall) {
    return {
      id: response?.threadId ?? `codex-${Date.now()}`,
      object: 'chat.completion',
      streaming_rendered: false,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: `narada_tool_${Date.now()}`,
            type: 'function',
            function: {
              name: toolCall.name,
              arguments: JSON.stringify(toolCall.arguments ?? {}),
            },
          }],
        },
        finish_reason: 'tool_calls',
      }],
    };
  }
  return {
    id: response?.threadId ?? `codex-${Date.now()}`,
    object: 'chat.completion',
    streaming_rendered: response?.streaming_rendered === true,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: response?.content ?? '',
      },
      finish_reason: 'stop',
    }],
  };
}

function parseNaradaToolCall(content) {
  const text = stripAnsi(String(content ?? '')).trim();
  if (!text) return null;
  const candidates = [
    text,
    text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim(),
    extractJsonObject(text),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const call = parsed?.narada_tool_call;
      if (call && typeof call.name === 'string') {
        return {
          name: call.name,
          arguments: call.arguments && typeof call.arguments === 'object' && !Array.isArray(call.arguments)
            ? call.arguments
            : {},
        };
      }
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

function extractJsonObject(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : null;
}

function buildOpenAiChatRequest(messages, tools, { baseUrl = BASE_URL, model = MODEL, apiKey = API_KEY, thinking = THINKING_LEVEL } = {}) {
  const body = {
    model,
    messages: cleanOpenAiMessages(messages),
    tools: tools.length > 0 ? tools : undefined,
    tool_choice: tools.length > 0 ? 'auto' : undefined,
    temperature: INTELLIGENCE_PROVIDER === 'kimi-api' ? 1 : 0.2,
  };
  const effort = reasoningEffort(thinking);
  if (effort && INTELLIGENCE_PROVIDER === 'openai-api') body.reasoning_effort = effort;
  return {
    url: new URL('/v1/chat/completions', baseUrl),
    body,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
  };
}

function cleanOpenAiMessages(messages) {
  return messages.map((m) => {
    const clean = { role: m.role };
    if (m.role === 'tool') {
      clean.content = m.content ?? '';
      clean.tool_call_id = m.tool_call_id ?? '';
    } else if (m.role === 'assistant') {
      clean.content = m.content ?? null;
      if (m.tool_calls && m.tool_calls.length > 0) {
        clean.tool_calls = m.tool_calls;
        if (INTELLIGENCE_PROVIDER === 'kimi-api') {
          clean.reasoning_content = m.reasoning_content ?? '';
        }
      }
    } else {
      clean.content = m.content ?? '';
    }
    return clean;
  });
}

function buildAnthropicMessagesRequest(messages, tools, { baseUrl = BASE_URL, model = MODEL, apiKey = API_KEY, thinking = THINKING_LEVEL } = {}) {
  const { system, anthropicMessages } = cleanAnthropicMessages(messages);
  const body = {
    model,
    max_tokens: 4096,
    messages: anthropicMessages,
    tools: tools.length > 0 ? tools.map(toAnthropicTool) : undefined,
    temperature: 0.2,
  };
  if (system) body.system = system;
  if (thinking === 'high') body.thinking = { type: 'enabled', budget_tokens: 4096 };
  else if (thinking === 'medium') body.thinking = { type: 'enabled', budget_tokens: 2048 };
  return {
    url: new URL('/v1/messages', baseUrl),
    body,
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey,
    },
  };
}

function cleanAnthropicMessages(messages) {
  const systemParts = [];
  const anthropicMessages = [];
  for (const message of messages) {
    if (message.role === 'system') {
      systemParts.push(String(message.content ?? ''));
    } else if (message.role === 'tool') {
      anthropicMessages.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: message.tool_call_id ?? '',
          content: stringifyContent(message.content),
        }],
      });
    } else if (message.role === 'assistant') {
      const content = [];
      if (message.content) content.push({ type: 'text', text: String(message.content) });
      for (const toolCall of message.tool_calls ?? []) {
        content.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.function?.name ?? '',
          input: parseJson(toolCall.function?.arguments ?? '{}'),
        });
      }
      anthropicMessages.push({ role: 'assistant', content: content.length > 0 ? content : '' });
    } else {
      anthropicMessages.push({ role: 'user', content: String(message.content ?? '') });
    }
  }
  return {
    system: systemParts.filter(Boolean).join('\n\n'),
    anthropicMessages,
  };
}

function toAnthropicTool(tool) {
  const fn = tool.function ?? {};
  return {
    name: fn.name,
    description: fn.description ?? '',
    input_schema: fn.parameters ?? { type: 'object', properties: {} },
  };
}

function parseAnthropicMessagesResponse(response) {
  const content = Array.isArray(response.content) ? response.content : [];
  const text = content.filter((item) => item?.type === 'text').map((item) => item.text ?? '').join('');
  const toolCalls = content
    .filter((item) => item?.type === 'tool_use')
    .map((item) => ({
      id: item.id,
      type: 'function',
      function: {
        name: item.name,
        arguments: JSON.stringify(item.input ?? {}),
      },
    }));
  const message = { role: 'assistant', content: text || null };
  if (toolCalls.length > 0) message.tool_calls = toolCalls;
  return {
    id: response.id,
    object: 'chat.completion',
    choices: [{
      index: 0,
      message,
      finish_reason: toolCalls.length > 0 ? 'tool_calls' : response.stop_reason ?? null,
    }],
    usage: response.usage,
  };
}

function sendProviderRequest({ url, body, headers }) {
  const serializedBody = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === 'https:';
    const req = (isHttps ? httpsRequest : httpRequest)(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(serializedBody),
        },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode < 200 || res.statusCode >= 300) {
              reject(new Error(`API error ${res.statusCode}: ${JSON.stringify(parsed).slice(0, 1000)}`));
              return;
            }
            if (parsed?.error) {
              reject(new Error(`API error: ${JSON.stringify(parsed.error).slice(0, 1000)}`));
              return;
            }
            resolve(parsed);
          } catch {
            reject(new Error(`Invalid JSON from API: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(serializedBody);
    req.end();
  });
}

function buildCodexExecArgs(request, { model = MODEL, thinking = THINKING_LEVEL, siteRoot = SITE_ROOT, mcpServers = {} } = {}) {
  const effort = reasoningEffort(thinking);
  const prompt = codexExecPrompt(request);
  const common = [
    '--json',
    '--dangerously-bypass-approvals-and-sandbox',
    '-m',
    request.arguments?.model ?? model,
    '-c',
    'approval_policy="never"',
  ];
  common.push(...codexExecMcpConfigArgs(mcpServers));
  if (effort) common.push('-c', `model_reasoning_effort="${effort}"`);
  if (request.tool === 'codex-reply') {
    return ['exec', 'resume', ...common, request.arguments.threadId, prompt];
  }
  return ['exec', ...common, '-C', request.arguments?.cwd ?? siteRoot, prompt];
}

function codexExecPrompt(request) {
  const prompt = String(request.arguments?.prompt ?? '');
  const developerInstructions = request.arguments?.['developer-instructions'];
  if (!developerInstructions) return prompt;
  return [
    '<developer-instructions>',
    String(developerInstructions),
    '</developer-instructions>',
    '',
    prompt,
  ].join('\n');
}

function sendCodexExecJsonRequest(request, settings = {}) {
  return new Promise((resolveRequest, rejectRequest) => {
    const command = codexCommand();
    const args = buildCodexExecArgs(request, settings);
    const child = spawn(command.command, [...command.prefixArgs, ...args], {
      cwd: request.arguments?.cwd ?? settings.siteRoot ?? SITE_ROOT,
      windowsHide: true,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdoutBuffer = '';
    let stderr = '';
    let threadId = request.arguments?.threadId ?? null;
    let content = '';
    let rendered = false;

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = parseCodexExecJsonLine(line);
        if (!event) continue;
        settings.emit?.('provider_event', { provider: 'codex-subscription', event });
        if (event.type === 'thread.started' && typeof event.thread_id === 'string') {
          threadId = event.thread_id;
        }
        const text = codexExecEventText(event);
        if (text) {
          content += text;
          if (parseNaradaToolCall(text)) continue;
          if (settings.emit) {
            settings.emit('assistant_message_stream', { turn_id: settings.turn?.turnId ?? null, content: text });
          } else {
            process.stdout.write(`\r\x1b[K\n${text}\n`);
            rendered = true;
          }
        }
      }
    });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', rejectRequest);
    child.on('exit', (code) => {
      if (stdoutBuffer.trim()) {
        const event = parseCodexExecJsonLine(stdoutBuffer.trim());
        const text = event ? codexExecEventText(event) : '';
        if (text) content += text;
      }
      if (code !== 0) {
        rejectRequest(new Error(`codex exec --json failed with exit ${code}${stderr.trim() ? `; ${stderr.trim().slice(0, 1000)}` : ''}`));
        return;
      }
      resolveRequest({
        threadId,
        content,
        streaming_rendered: rendered,
      });
    });
  });
}

function sendCodexExecJsonBufferedRequest(request, settings = {}) {
  return new Promise((resolveRequest, rejectRequest) => {
    const command = codexCommand();
    const args = buildCodexExecArgs(request, settings);
    const child = spawn(command.command, [...command.prefixArgs, ...args], {
      cwd: request.arguments?.cwd ?? settings.siteRoot ?? SITE_ROOT,
      windowsHide: true,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdoutBuffer = '';
    let stderr = '';
    let threadId = request.arguments?.threadId ?? null;
    let content = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdoutBuffer += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', rejectRequest);
    child.on('exit', (code) => {
      for (const line of stdoutBuffer.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const event = parseCodexExecJsonLine(line);
        if (!event) continue;
        if (event.type === 'thread.started' && typeof event.thread_id === 'string') threadId = event.thread_id;
        content += codexExecEventText(event);
      }
      if (code !== 0) {
        rejectRequest(new Error(`codex exec --json failed with exit ${code}${stderr.trim() ? `; ${stderr.trim().slice(0, 1000)}` : ''}`));
        return;
      }
      resolveRequest({ threadId, content, streaming_rendered: false });
    });
  });
}

function parseCodexExecJsonLine(line) {
  try {
    return JSON.parse(stripAnsi(String(line)));
  } catch {
    return null;
  }
}

function codexExecEventText(event) {
  if (event?.type !== 'item.completed') return '';
  const item = event.item;
  if (item?.type === 'agent_message' && typeof item.text === 'string') return item.text;
  return '';
}

function stripAnsi(text) {
  return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

function codexCommand() {
  if (process.platform !== 'win32') return { command: 'codex', prefixArgs: [] };
  const found = findOnPath(['codex.ps1', 'codex.cmd', 'codex.exe']);
  if (found?.endsWith('.ps1')) return { command: 'pwsh', prefixArgs: ['-NoProfile', '-File', found] };
  if (found) return { command: found, prefixArgs: [] };
  return { command: 'pwsh', prefixArgs: ['-NoProfile', '-Command', 'codex'] };
}

function findOnPath(names) {
  const dirs = String(process.env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':').filter(Boolean);
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function writeCodexExecHomeConfig(mcpServers, sessionDir = SESSION_DIR) {
  const codexHome = join(sessionDir, 'codex-home');
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(join(codexHome, 'config.toml'), `${codexExecConfigToml(mcpServers)}\n`, 'utf8');
  return codexHome;
}

function codexExecMcpConfigArgs(mcpServers) {
  const args = [];
  for (const [name, server] of Object.entries(mcpServers)) {
    const config = server.config ?? {};
    args.push('-c', `mcp_servers."${tomlKey(name)}".command=${tomlString(config.command ?? '')}`);
    args.push('-c', `mcp_servers."${tomlKey(name)}".args=${JSON.stringify((config.args ?? []).map((arg) => String(arg).replaceAll('\\', '/')))}`);
    args.push('-c', `mcp_servers."${tomlKey(name)}".default_tools_approval_mode="approve"`);
  }
  return args;
}

function codexExecConfigToml(mcpServers) {
  const lines = [
    '# Generated by tools/agent-cli/agent-cli.mjs for nested codex exec --json.',
    '# Mirrors the target Site MCP fabric; does not import User Site MCP servers.',
    '',
  ];
  for (const [name, server] of Object.entries(mcpServers)) {
    const config = server.config ?? {};
    lines.push(`[mcp_servers."${tomlKey(name)}"]`);
    lines.push(`command = ${tomlString(config.command ?? '')}`);
    lines.push(`args = ${JSON.stringify((config.args ?? []).map((arg) => String(arg).replaceAll('\\', '/')))}`);
    lines.push('default_tools_approval_mode = "approve"');
    lines.push('');
  }
  return lines.join('\n');
}

function tomlString(value) {
  return JSON.stringify(String(value).replaceAll('\\', '/'));
}

function tomlKey(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function sendCodexMcpRequest(request, settings = {}) {
  return new Promise((resolve, reject) => {
    const command = codexCommand();
    const args = ['mcp-server', ...codexExecMcpConfigArgs(settings.mcpServers ?? {})];
    const child = spawn(command.command, [...command.prefixArgs, ...args], {
      cwd: SITE_ROOT,
      windowsHide: true,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let buffer = '';
    let stderr = '';
    const pending = new Map();

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id != null && pending.has(msg.id)) {
            pending.get(msg.id).resolve(msg);
            pending.delete(msg.id);
          }
        } catch {
          // Codex may emit non-JSON diagnostics; keep stderr for hard failures.
        }
      }
    });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);

    const send = (payload, timeoutMs = 120000) => new Promise((resolveRequest, rejectRequest) => {
      pending.set(payload.id, { resolve: resolveRequest, reject: rejectRequest });
      child.stdin.write(`${JSON.stringify(payload)}\n`);
      setTimeout(() => {
        if (pending.has(payload.id)) {
          pending.delete(payload.id);
          rejectRequest(new Error(`Codex MCP request timeout after ${timeoutMs}ms`));
        }
      }, timeoutMs);
    });

    (async () => {
      const initialize = await send({
        jsonrpc: '2.0',
        id: randomId(),
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'narada-agent-cli', version: '0' },
        },
      }, 10000);
      if (initialize.error) throw new Error(initialize.error.message);

      const toolCall = await send({
        jsonrpc: '2.0',
        id: randomId(),
        method: 'tools/call',
        params: {
          name: request.tool,
          arguments: request.arguments,
        },
      }, 120000);
      if (toolCall.error) throw new Error(toolCall.error.message);

      const text = toolCall.result?.content?.[0]?.text ?? JSON.stringify(toolCall.result ?? {});
      try {
        resolve(JSON.parse(text));
      } catch {
        resolve({ threadId: null, content: text });
      }
    })().catch((error) => {
      reject(new Error(`${error.message}${stderr.trim() ? `; ${stderr.trim().slice(0, 1000)}` : ''}`));
    }).finally(() => {
      child.stdin.end();
      child.kill();
    });
  });
}

function stringifyContent(value) {
  return typeof value === 'string' ? value : JSON.stringify(value ?? '');
}

// ---------------------------------------------------------------------------
// Terminal presentation
// ---------------------------------------------------------------------------
function createTerminalStyle({ enabled = true } = {}) {
  const color = (code, text) => enabled ? `\x1b[${code}m${text}\x1b[0m` : text;
  return {
    enabled,
    header: (text) => color('36', text),
    tool: (text) => color('35', text),
    assistant: (text) => color('37', text),
    prompt: (text) => color('1;32', text),
    progress: (text) => color('2;33', text),
    warn: (text) => color('33', text),
    error: (text) => color('31', text),
  };
}

function printHeader(text, { before = false, after = false, level = 'info' } = {}) {
  const styled = level === 'warn'
    ? terminalStyle.warn(`[agent-cli] ${text}`)
    : terminalStyle.header(`[agent-cli] ${text}`);
  console.log(`${before ? '\n' : ''}${styled}${after ? '\n' : ''}`);
}

function printToolLine(text, { before = false, level = 'info' } = {}) {
  const prefixed = `[tool] ${text}`;
  const styled = level === 'error'
    ? terminalStyle.error(prefixed)
    : level === 'warn'
      ? terminalStyle.warn(prefixed)
      : terminalStyle.tool(prefixed);
  console.log(`${before ? '\n' : ''}${styled}`);
}

function printAssistantMessage(text) {
  const normalized = String(text ?? '').trim();
  if (!normalized) return;
  console.log(`\n${terminalStyle.assistant(normalized)}\n`);
}

function parseColorEnv(value, defaultValue) {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0') return true;
  return parseBooleanEnv(value, defaultValue);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function question(rl, prompt) {
  return new Promise((resolve) => {
    if (rl.closed) {
      resolve('__READLINE_CLOSED__');
      return;
    }
    const onClose = () => resolve('__READLINE_CLOSED__');
    rl.once('close', onClose);
    try {
      rl.question(prompt, (answer) => {
        rl.removeListener('close', onClose);
        resolve(answer);
      });
    } catch {
      rl.removeListener('close', onClose);
      resolve('__READLINE_CLOSED__');
    }
  });
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--identity' && i + 1 < argv.length) {
      opts.identity = argv[i + 1];
      i++;
    } else if (argv[i] === '--session' && i + 1 < argv.length) {
      opts.session = argv[i + 1];
      i++;
    } else if (argv[i] === '--message' && i + 1 < argv.length) {
      opts.messages = [...(opts.messages ?? []), argv[i + 1]];
      i++;
    } else if (argv[i] === '--message-file' && i + 1 < argv.length) {
      opts.messageFiles = [...(opts.messageFiles ?? []), argv[i + 1]];
      i++;
    } else if (argv[i] === '--authority-ref' && i + 1 < argv.length) {
      opts.authorityRef = argv[i + 1];
      i++;
    } else if (argv[i] === '--interactive-after-message') {
      opts.interactiveAfterMessage = true;
    } else if (argv[i] === '--auto-approve') {
      opts.autoApprove = true;
    } else if (argv[i] === '--server') {
      opts.server = true;
    } else if (argv[i] === '--stream') {
      opts.stream = true;
    } else if (argv[i] === '--no-stream') {
      opts.stream = false;
    } else if (argv[i] === '--color') {
      opts.color = true;
    } else if (argv[i] === '--no-color') {
      opts.color = false;
    } else if (argv[i] === '--model' && i + 1 < argv.length) {
      opts.model = argv[i + 1];
      i++;
    } else if (argv[i] === '--thinking' && i + 1 < argv.length) {
      opts.thinking = argv[i + 1];
      i++;
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      opts.help = true;
    }
  }
  return opts;
}

function parseBooleanEnv(value, defaultValue) {
  if (value === undefined || value === null || String(value).trim() === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function randomId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function readDirFiles(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------
const isEntrypoint = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

export {
  PROVIDER_SUPPORT_STATES,
  REQUEST_ADAPTERS,
  assertApiKeyConfigured,
  buildProgrammaticInputs,
  buildAnthropicMessagesRequest,
  buildCodexExecArgs,
  codexExecMcpConfigArgs,
  codexExecConfigToml,
  buildCodexMcpRequest,
  buildOpenAiChatRequest,
  cleanAnthropicMessages,
  cleanOpenAiMessages,
  codexExecEventText,
  discoverAndStartMcpServers,
  executeMcpTool,
  handleSlashCommand,
  normalizeProviderSupportState,
  normalizeThinkingLevel,
  normalizeInputRecord,
  parseArgs,
  parseBooleanEnv,
  parseColorEnv,
  removeInvalidToolHistory,
  parseAnthropicMessagesResponse,
  parseCodexExecJsonLine,
  parseCodexMcpResponse,
  parseNaradaToolCall,
  createTerminalStyle,
  runConversationTurn,
  runServerMode,
  resolveProviderAdapter,
  resolveProviderSupportState,
  sessionEventEntry,
  sessionLogEntry,
};

if (isEntrypoint) {
  if (options.help) {
    console.log(`Usage: node tools/agent-cli/agent-cli.mjs --identity <name> [--session <name>] [--server] [--stream|--no-stream] [--color|--no-color] [--message <text>] [--message-file <path>] [--interactive-after-message] [--auto-approve]`);
    console.log('Programmatic input: --message and --message-file are explicit control inputs; do not use raw stdin piping as the control API.');
    console.log(`Environment: NARADA_INTELLIGENCE_PROVIDER, ANTHROPIC_API_KEY, NARADA_AI_API_KEY, NARADA_AI_BASE_URL, NARADA_AI_MODEL, NARADA_AGENT_CLI_STREAM, NARADA_AGENT_CLI_COLOR, NARADA_SITE_ROOT`);
    process.exit(0);
  }

  main().catch((err) => {
    console.error(`[agent-cli] Fatal error: ${err.message}`);
    process.exit(1);
  });
}
