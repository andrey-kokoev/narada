import { createTerminalStyle, formatTerminalMessageBlockLines } from './terminal-style.mjs';
import {
  createMarkdownStreamState,
  renderMarkdownForTerminal as renderMarkdownForProjectedTerminal,
  renderMarkdownStreamChunk,
} from './terminal-markdown.mjs';
import {
  clearPreviousTerminalRows,
  formatTimestamp,
  stripAnsi,
  terminalColumns,
  wrapIndentedLines,
  wrapTerminalLine,
} from './terminal-text.mjs';

function withStreamBoundary(state, rendered) {
  if (state?.streamOpen && !state.streamAtLineStart) {
    state.streamOpen = false;
    state.streamAtLineStart = true;
    state.openStreamTurnKey = null;
    if (Array.isArray(rendered) && rendered.length > 0 && typeof rendered[0] === 'string') {
      return [`\n${rendered[0]}`, ...rendered.slice(1)];
    }
    return [{ raw: '\n', newline: false }, ...(Array.isArray(rendered) ? rendered : [])];
  }
  if (state) {
    state.streamOpen = false;
    state.openStreamTurnKey = null;
  }
  return rendered;
}

function createEventRenderingStyle({ enabled = false } = {}) {
  const style = createTerminalStyle({ enabled });
  return {
    ...style,
    agent: style.label,
    ok: style.success,
  };
}

function timestampSuffix(state, style) {
  if (state.timestamps === false) return '';
  const now = typeof state.now === 'function' ? state.now() : state.now;
  return ` ${style.timestamp(formatTimestamp(now ?? new Date()))}`;
}

export function projectedAgentId(state) {
  return state?.agentId ?? process.env.NARADA_AGENT_ID ?? 'agent';
}

function agentLabel(event, style) {
  return style.agent(event.agent_id ?? 'agent');
}

export function assistantEmissionHeader(state, style, fallbackLabel = 'assistant') {
  return `${style.agent(fallbackLabel)}${style.muted(':')}`;
}

function consumeLocalThinkingForEvent(state, event) {
  if (!state.localThinkingRendered) return false;
  const expectedAgentId = state.localThinkingAgentId ?? projectedAgentId(state);
  if ((event.agent_id ?? expectedAgentId) !== expectedAgentId) return false;
  state.localThinkingRendered = false;
  state.localThinkingAgentId = null;
  return true;
}

export function markThinkingRendered(state, agentId = projectedAgentId(state)) {
  if (!state) return;
  state.thinkingRendered = true;
  state.thinkingAgentId = agentId;
}

function clearLocalThinkingState(state) {
  if (!state) return;
  state.localThinkingRendered = false;
  state.localThinkingAgentId = null;
}

function clearRenderedThinking(state) {
  if (!state?.thinkingRendered) {
    clearLocalThinkingState(state);
    return [];
  }
  state.thinkingRendered = false;
  state.thinkingAgentId = null;
  clearLocalThinkingState(state);
  return [{ raw: clearPreviousTerminalRows(1), newline: false }];
}

function withRenderedThinkingCleared(state, rendered) {
  return [...clearRenderedThinking(state), ...withStreamBoundary(state, rendered)];
}

function appendSuffixToLastLine(lines, suffix) {
  if (!Array.isArray(lines) || lines.length === 0 || !suffix) return lines;
  lines[lines.length - 1] = `${lines[lines.length - 1]}${suffix}`;
  return lines;
}

function toolDisplayName(event) {
  const tool = event.tool ?? event.tool_name ?? event.name ?? '<unknown>';
  const server = event.server_name ?? event.tool_server ?? null;
  return server && !String(tool).startsWith(`${server}.`) ? `${server}.${tool}` : String(tool);
}

function summarizeToolCall(event) {
  if (event.argument_summary) return `(${event.argument_summary})`;
  if (event.arguments && typeof event.arguments === 'object') {
    try {
      const text = JSON.stringify(event.arguments);
      return `(${text.length > 200 ? `${text.slice(0, 197)}...` : text})`;
    } catch {
      return '(arguments)';
    }
  }
  return '';
}

function summarizeToolResult(event) {
  const status = String(event.status ?? '').toLowerCase();
  const normal = !status || ['success', 'complete', 'completed', 'ok'].includes(status);
  const head = normal ? 'ok' : status || 'result';
  const details = [
    event.output_ref ? `output_ref=${event.output_ref}` : null,
    event.reason ? `reason=${event.reason}` : null,
    event.authority_owner ? `authority_owner=${event.authority_owner}` : null,
    event.request_id ? `request_id=${event.request_id}` : null,
    event.error ? `error=${formatEventValue(event.error)}` : null,
    event.recovery ? `recovery=${formatEventValue(event.recovery)}` : null,
  ].filter(Boolean);
  return `${head}${details.length ? ` · ${details.join(' · ')}` : ''}`;
}

function formatEventValue(value, { limit = 500 } = {}) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (value instanceof Error) return value.message || value.name || String(value);
  if (typeof value === 'object') {
    const message = typeof value.message === 'string' ? value.message : null;
    const code = typeof value.code === 'string' || typeof value.code === 'number' ? String(value.code) : null;
    const error = typeof value.error === 'string' ? value.error : null;
    const summary = [code, message ?? error].filter(Boolean).join(': ');
    if (summary) return summary;
    try {
      const compact = JSON.stringify(value);
      return compact.length > limit ? `${compact.slice(0, Math.max(0, limit - 3))}...` : compact;
    } catch {
      return Object.prototype.toString.call(value);
    }
  }
  return String(value);
}

function routeLine({ label, body, labelStyle = (value) => value, bodyStyle = (value) => value, state, style }) {
  return `${labelStyle(label)}${style.muted(':')} ${bodyStyle(String(body ?? ''))}${timestampSuffix(state, style)}`;
}

function routedBodyLines({ label, body, labelStyle = (value) => value, bodyStyle = (value) => value, state, style }) {
  const prefix = `${labelStyle(label)}${style.muted(':')} `;
  const bodyText = String(body ?? '');
  const firstLineWidth = Math.max(16, terminalColumns(state) - stripAnsi(prefix).length);
  const wrapped = wrapTerminalLine(bodyText, firstLineWidth);
  const [first = '', ...rest] = wrapped;
  const lines = [
    `${prefix}${bodyStyle(first)}`,
    ...rest.map((line) => `  ${bodyStyle(line)}`),
  ];
  appendSuffixToLastLine(lines, timestampSuffix(state, style));
  return lines;
}

function isHostCommandEvent(event) {
  return String(event?.event ?? event?.event_kind ?? '').startsWith('carrier_host_command_')
    || event?.event === 'host_command_result';
}

function hostCommandPayload(event) {
  return event?.payload && typeof event.payload === 'object' ? event.payload : event;
}

function formatHostCommandBlock(event, state, style) {
  const payload = hostCommandPayload(event);
  const eventKind = String(event?.event ?? event?.event_kind ?? 'host_command_result');
  const commandText = String(payload.command_text ?? payload.command_summary ?? '').trim();
  const terminalState = payload.terminal_state
    ?? (eventKind.endsWith('_completed') ? 'completed' : eventKind.endsWith('_failed') ? 'failed' : eventKind.endsWith('_rejected') ? 'rejected' : 'unknown');
  const lines = [
    commandText ? `$ ${commandText}` : null,
    `status: ${terminalState}${Number.isInteger(payload.exit_code) ? ` (${payload.exit_code})` : ''}`,
    payload.admission_reason ? `admission: ${payload.admission_reason}` : null,
    payload.stdout ? String(payload.stdout).trimEnd() : null,
    payload.stderr ? String(payload.stderr).trimEnd() : null,
    payload.error ? `error: ${payload.error}` : null,
    payload.output_ref ? `output: ${payload.output_ref.payload_ref ?? payload.output_ref}` : null,
  ].filter((line) => String(line ?? '').trim());
  const bodyStyle = terminalState === 'completed' ? (value) => value : style.warn;
  const wrapped = wrapIndentedLines(lines.join('\n'), { indent: '', columns: terminalColumns(state) - 2 });
  const block = formatTerminalMessageBlockLines({
    label: 'carrier host',
    lines: wrapped,
    style,
    labelStyle: style.tool,
    bodyStyle,
  });
  appendSuffixToLastLine(block, timestampSuffix(state, style));
  return block;
}

function startupRows(event) {
  const rows = [
    ['Identity', event.agent_id ?? '<unknown>'],
    ['Session', event.session_id ?? '<unknown>'],
    ['Provider', event.provider ?? '<unknown>'],
    ['Model', event.model ?? '<unknown>'],
    ['Thinking', event.thinking ?? '<unknown>'],
    ['Stream', event.stream === false ? 'off' : 'on'],
    ['Goal', event.goal_display ?? event.goal ?? 'not set'],
    ['MCP servers', event.mcp_server_count ?? 0],
    ['MCP state', event.mcp_operational_state ?? 'unknown'],
  ];
  if ((event.mcp_startup_failure_count ?? 0) > 0) rows.push(['MCP startup failures', event.mcp_startup_failure_summary ?? event.mcp_startup_failure_count]);
  if ((event.mcp_runtime_fault_count ?? 0) > 0) rows.push(['MCP runtime faults', event.mcp_runtime_fault_summary ?? event.mcp_runtime_fault_count]);
  for (const server of event.mcp_servers ?? []) {
    if (!server?.name) continue;
    rows.push([`  ${server.name}`, `${server.tool_count ?? 0} tools`]);
  }
  rows.push(
    ['Tools', event.tool_count ?? 0],
    ['Tool outputs', event.tool_outputs ?? 'shown'],
    ['Approvals', event.approvals ?? 'disabled'],
    ['Help', event.help ?? '/help'],
  );
  return rows;
}

function formatStartupTable(event, style) {
  const rows = startupRows(event);
  const width = rows.reduce((max, [label]) => Math.max(max, String(label).length), 0);
  return [
    `${style.label('agent-cli')}:`,
    ...rows.map(([label, value]) => `  ${style.label(String(label).padEnd(width))} ${value ?? ''}`),
    '',
  ];
}

export function renderOperatorEvent(event, state = {}) {
  if (!event || typeof event !== 'object') return [];
  const style = state.style ?? createEventRenderingStyle({ enabled: false });
  if (!state.streamedTurns) state.streamedTurns = new Set();
  if (!state.streamedContentByTurn) state.streamedContentByTurn = new Map();
  if (!state.streamMarkdownStateByTurn) state.streamMarkdownStateByTurn = new Map();
  if (isHostCommandEvent(event)) {
    const eventKind = String(event.event ?? event.event_kind ?? '');
    if (eventKind === 'carrier_host_command_requested' || eventKind === 'carrier_host_command_admitted' || eventKind === 'carrier_host_command_started') return [];
    return withStreamBoundary(state, formatHostCommandBlock(event, state, style));
  }
  switch (event.event) {
    case 'session_started':
      state.agentId = event.agent_id ?? state.agentId;
      state.toolOutputs = event.tool_outputs ?? state.toolOutputs ?? 'shown';
      return formatStartupTable(event, style);
    case 'session_status':
      return withStreamBoundary(state, [routeLine({ label: 'agent-cli', body: `status ${event.operational_posture_display ?? event.operational_posture ?? 'unknown'}; requests ${event.request_outcome_summary ?? '0'}`, labelStyle: style.label, state, style })]);
    case 'session_health':
      return withStreamBoundary(state, [routeLine({ label: 'agent-cli', body: `health ${event.status ?? 'unknown'}; mcp ${event.mcp?.operational_state ?? 'unknown'}; endpoint ${event.health_endpoint ?? 'none'}`, labelStyle: style.label, state, style })]);
    case 'session_events_subscription_started':
      return withStreamBoundary(state, [routeLine({ label: 'agent-cli', body: `events subscription ${event.subscription_id ?? 'unknown'}; replay ${event.replay_count ?? 0}; cursor ${event.cursor?.next_sequence ?? 'unknown'}`, labelStyle: style.label, state, style })]);
    case 'session_recovery':
      return withStreamBoundary(state, [routeLine({ label: 'agent-cli', body: `recovery ${event.operational_posture_display ?? event.operational_posture ?? 'unknown'}; action ${event.recommended_action_display ?? event.recommended_action ?? 'none'}`, labelStyle: style.label, state, style })]);
    case 'session_operations':
      return withStreamBoundary(state, [routeLine({ label: 'agent-cli', body: `operations ${event.operation?.operation_event_summary ?? event.event_summary?.event_summary ?? event.operational_posture_display ?? 'available'}`, labelStyle: style.label, state, style })]);
    case 'session_sync':
      return withStreamBoundary(state, [routeLine({ label: 'agent-cli', body: `session sync ${event.success === true ? 'succeeded' : event.success === false ? 'failed' : event.mode ?? 'requested'}; ${event.direction ?? 'upload'}${event.target ? ` ${event.target}` : ''}`, labelStyle: style.label, bodyStyle: event.success === false ? style.warn : (value) => value, state, style })]);
    case 'observer_status':
      return withStreamBoundary(state, [routeLine({ label: 'agent-cli', body: event.message ?? `observers ${event.observer_muted === true ? 'muted' : 'shown'}`, labelStyle: style.label, state, style })]);
    case 'carrier_command_result': {
      if (event.fields?.tool_outputs) state.toolOutputs = event.fields.tool_outputs;
      const message = String(event.message ?? '').trim();
      if (!message.includes('\n')) {
        return withStreamBoundary(state, [routeLine({ label: 'agent-cli', body: message || `${event.command ?? 'command'} ${event.terminal_state ?? 'completed'}`, labelStyle: style.label, bodyStyle: event.terminal_state === 'invalid' || event.terminal_state === 'unsupported' ? style.warn : (value) => value, state, style })]);
      }
      const block = formatTerminalMessageBlockLines({
        label: 'agent-cli',
        lines: wrapIndentedLines(message, { indent: '', columns: terminalColumns(state) - 2 }),
        style,
        labelStyle: style.label,
        bodyStyle: event.terminal_state === 'invalid' || event.terminal_state === 'unsupported' ? style.warn : (value) => value,
      });
      appendSuffixToLastLine(block, timestampSuffix(state, style));
      return withStreamBoundary(state, block);
    }
    case 'directive_received':
      if (!event.turn_id) return [];
      return withStreamBoundary(state, [routeLine({ label: `operator directive -> ${event.agent_id ?? 'agent'}`, body: 'accepted directive', labelStyle: style.operatorDirective, state, style })]);
    case 'directive_complete':
      if (!event.turn_id) return [];
      return withStreamBoundary(state, [routeLine({ label: 'agent-cli', body: `directive ${event.terminal_state ?? 'complete'}`, labelStyle: style.label, bodyStyle: event.terminal_state === 'failed' ? style.error : style.muted, state, style })]);
    case 'turn_started':
      if (consumeLocalThinkingForEvent(state, event)) return withStreamBoundary(state, []);
      markThinkingRendered(state, event.agent_id ?? projectedAgentId(state));
      return withStreamBoundary(state, [`${assistantEmissionHeader(state, style, event.agent_id ?? 'agent')} thinking...`]);
    case 'assistant_message_stream': {
      const thinkingClear = clearRenderedThinking(state);
      const content = String(event.content ?? '');
      if (!content) return thinkingClear;
      const turnKey = event.turn_id ?? '__default_stream_turn';
      if (event.turn_id) state.streamedTurns.add(event.turn_id);
      state.streamedContentByTurn.set(turnKey, `${state.streamedContentByTurn.get(turnKey) ?? ''}${content}`);
      if (!state.streamMarkdownStateByTurn.has(turnKey)) state.streamMarkdownStateByTurn.set(turnKey, createMarkdownStreamState());
      const prefix = state.streamOpen && state.openStreamTurnKey === turnKey ? '' : `${assistantEmissionHeader(state, style, event.agent_id ?? 'assistant')}\n  `;
      const bodyWidth = terminalColumns(state) - 2;
      const shouldHardWrap = stripAnsi(content).length > bodyWidth;
      const markdownContent = renderMarkdownStreamChunk(content, state.streamMarkdownStateByTurn.get(turnKey), style);
      if (!markdownContent) return thinkingClear;
      const renderedContent = shouldHardWrap
        ? wrapIndentedLines(markdownContent, { indent: '  ', columns: terminalColumns(state) }).join('\n').replace(/^  /, '')
        : markdownContent.replace(/\r?\n/g, '\n  ');
      const raw = `${prefix}${renderedContent}`;
      state.streamOpen = true;
      state.openStreamTurnKey = turnKey;
      state.streamAtLineStart = raw.endsWith('\n');
      return [...thinkingClear, { raw, newline: false }];
    }
    case 'assistant_message': {
      const thinkingClear = clearRenderedThinking(state);
      const turnKey = event.turn_id ?? '__default_stream_turn';
      const finalContent = String(event.content ?? '');
      const streamedContent = state.streamedContentByTurn.get(turnKey) ?? '';
      const content = (streamedContent && finalContent.startsWith(streamedContent) ? finalContent.slice(streamedContent.length).trimStart() : finalContent).trimEnd();
      if (!content) return thinkingClear;
      const renderedContent = renderMarkdownForProjectedTerminal(content, style);
      const lines = wrapIndentedLines(renderedContent, { indent: '', columns: terminalColumns(state) - 2 });
      if (streamedContent) return [...thinkingClear, ...withStreamBoundary(state, lines.map((line) => `  ${line}`))];
      const block = formatTerminalMessageBlockLines({ label: event.agent_id ?? 'assistant', lines, style, labelStyle: style.agent, bodyStyle: (value) => value });
      appendSuffixToLastLine(block, timestampSuffix(state, style));
      return [...thinkingClear, ...withStreamBoundary(state, block)];
    }
    case 'tool_call': {
      if (state.toolOutputs === 'hidden') return withRenderedThinkingCleared(state, []);
      const tool = toolDisplayName(event);
      return withRenderedThinkingCleared(state, routedBodyLines({ label: `${event.agent_id ?? 'agent'} -> agent-cli`, body: `${tool}${summarizeToolCall(event)}`, labelStyle: () => `${agentLabel(event, style)} ${style.muted('->')} ${style.tool('agent-cli')}`, bodyStyle: style.muted, state, style }));
    }
    case 'tool_result': {
      if (state.toolOutputs === 'hidden') return withRenderedThinkingCleared(state, []);
      const status = String(event.status ?? '').toLowerCase();
      const normal = !status || ['success', 'complete', 'completed', 'ok'].includes(status);
      const levelStyle = normal ? style.muted : status === 'error' ? style.error : style.warn;
      return withRenderedThinkingCleared(state, routedBodyLines({ label: `agent-cli -> ${event.agent_id ?? 'agent'}`, body: `${toolDisplayName(event)} ${summarizeToolResult(event)}`, labelStyle: () => `${style.tool('agent-cli')} ${style.muted('->')} ${agentLabel(event, style)}`, bodyStyle: levelStyle, state, style }));
    }
    case 'turn_complete':
      return withRenderedThinkingCleared(state, [routeLine({ label: 'agent-cli', body: 'turn complete', labelStyle: style.label, bodyStyle: style.ok, state, style })]);
    case 'turn_failed':
      return withRenderedThinkingCleared(state, [routeLine({ label: 'agent-cli', body: `turn failed: ${event.message ?? event.error ?? event.code ?? 'unknown error'}`, labelStyle: style.label, bodyStyle: style.error, state, style })]);
    case 'error':
      return withRenderedThinkingCleared(state, [routeLine({ label: 'error', body: `${event.code ?? 'error'}${event.message ? `: ${event.message}` : ''}`, labelStyle: style.error, bodyStyle: style.error, state, style })]);
    case 'session_closed':
      return withStreamBoundary(state, [routeLine({ label: 'agent-cli', body: 'session closed', labelStyle: style.label, state, style })]);
    default:
      return withStreamBoundary(state, []);
  }
}
