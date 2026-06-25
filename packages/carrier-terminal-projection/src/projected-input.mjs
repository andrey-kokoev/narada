function shellLikeWords(value) {
  const words = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = pattern.exec(String(value ?? ''))) !== null) {
    words.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  return words;
}

function normalizeSessionSyncDirection(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['upload', 'download', 'bidirectional'].includes(normalized) ? normalized : 'upload';
}

function requestIdForCommand(command) {
  return `operator-command-${command}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function opsSyncFrame(value = '') {
  const tokens = shellLikeWords(value);
  if (tokens[0]?.toLowerCase() !== 'sync') return null;
  const params = {
    target: null,
    direction: 'upload',
    dry_run: false,
    delete: false,
  };
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index].toLowerCase();
    const next = tokens[index + 1];
    if (token === '--target' && next) {
      params.target = next;
      index += 1;
      continue;
    }
    if (token === '--direction' && next) {
      params.direction = normalizeSessionSyncDirection(next);
      index += 1;
      continue;
    }
    if (token === '--dry-run') {
      params.dry_run = true;
      continue;
    }
    if (token === '--delete') {
      params.delete = true;
      continue;
    }
    if (token !== '--json' && !params.target) params.target = tokens[index];
  }
  params.target = String(params.target ?? '').trim() || null;
  return { id: requestIdForCommand('ops-sync'), method: 'session.sync', params };
}

function commandFrame(command, value = '') {
  return {
    id: requestIdForCommand(command.replace(/^\//, '').replace(/[^a-z0-9]+/g, '-')),
    method: 'carrier.command.execute',
    params: { command, value },
  };
}

export function createProjectedSlashCommandAction(line) {
  const trimmed = String(line ?? '').trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === 'exit' || lower === '/exit' || lower === '/quit') {
    return { kind: 'frame', frame: { id: requestIdForCommand('exit'), method: 'session.close', params: {} } };
  }
  if (!trimmed.startsWith('/')) return null;
  const [rawCommand, ...rest] = trimmed.split(/\s+/);
  const command = rawCommand.toLowerCase();
  const value = rest.join(' ').trim();
  if (command === '/help') return { kind: 'local_help' };
  if (command === '/clear') return { kind: 'clear' };
  if (command === '/status') return { kind: 'frame', frame: { id: requestIdForCommand('status'), method: 'session.status', params: {} } };
  if (command === '/health') return { kind: 'frame', frame: { id: requestIdForCommand('health'), method: 'session.health', params: {} } };
  if (command === '/events') return { kind: 'frame', frame: { id: requestIdForCommand('events'), method: 'session.events.subscribe', params: { include_replay: true, max_replay: 20 } } };
  if (command === '/recovery') return { kind: 'frame', frame: { id: requestIdForCommand('recovery'), method: 'session.recovery', params: {} } };
  if (command === '/ops') return { kind: 'frame', frame: opsSyncFrame(value) ?? { id: requestIdForCommand('ops'), method: 'session.operations', params: {} } };
  if (command === '/observers') return { kind: 'frame', frame: { id: requestIdForCommand('observers'), method: 'observers.status', params: {} } };
  if (command === '/observer' && value === 'mute') return { kind: 'frame', frame: { id: requestIdForCommand('observer-mute'), method: 'observer.mute', params: {} } };
  if (command === '/observer' && value === 'unmute') return { kind: 'frame', frame: { id: requestIdForCommand('observer-unmute'), method: 'observer.unmute', params: {} } };
  const carrierCommands = new Set(['/goal', '/stats', '/model', '/thinking', '/tool-output', '/tool-outputs', '/tools', '/tool', '/queue']);
  if (carrierCommands.has(command)) {
    return { kind: 'frame', frame: commandFrame(command, value) };
  }
  if (command === '/observer') return { kind: 'message', message: 'Usage: /observer mute|unmute' };
  return { kind: 'message', message: `Unknown command: ${command}. Type /help.` };
}

export function projectedHelpText() {
  return [
    'Commands',
    '',
    '/help                 Show commands',
    '/status               Show session state',
    '/health               Show runtime health',
    '/events               Show recent event subscription replay',
    '/recovery             Show recovery workflow',
    '/goal [text|pause|resume|clear] Show, set, pause, resume, or clear carrier goal',
    '/stats [args]         Show local Codex transcript statistics',
    '/model <name>         Set model for later turns',
    '/thinking <level>     none, low, medium, high',
    '/tool-output [state]  Toggle displayed tool call outputs (on, off, toggle)',
    '/ops                  Show operation workflow summary',
    '/tools [filter]       Show discovered MCP tools and input schemas',
    '/observers            Show observer posture',
    '/observer mute        Mute visible observer interjections',
    '/observer unmute      Unmute visible observer interjections',
    '/queue                Show queued carrier input',
    '/queue clear          Clear queued operator steering',
    '/queue drop <index>   Drop one queued operator steering item',
    '/clear                Clear terminal display',
    '/exit                 Save and quit',
    '/json <frame>         Send explicit JSONL control frame',
  ].join('\n');
}

export function createOperatorConversationFrame(line) {
  const rawMessage = String(line ?? '');
  if (!rawMessage.trim()) return null;
  const requestId = `operator-conversation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    id: requestId,
    method: 'conversation.send',
    params: {
      request_id: requestId,
      message: rawMessage,
      source: 'programmatic_operator',
      source_id: 'agent-runtime-server.operator_terminal',
    },
  };
}

export function createExplicitJsonControlFrame(line) {
  const text = String(line ?? '');
  const match = text.match(/^\s*\/json(?:\s+(.+))?$/s);
  if (!match) return null;
  const payload = match[1]?.trim();
  if (!payload) return { error: 'usage: /json <control-frame-json>' };
  try {
    const frame = JSON.parse(payload);
    if (!frame || typeof frame !== 'object' || Array.isArray(frame)) {
      return { error: '/json payload must be a JSON object control frame' };
    }
    return { frame };
  } catch (error) {
    return { error: `/json invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}
