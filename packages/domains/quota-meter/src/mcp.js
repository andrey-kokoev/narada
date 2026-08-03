#!/usr/bin/env node

import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { launchOverlay, overlayStatus, requestOverlayRefresh } from './overlay.js';
import { selectProviders } from './providers.js';

const VERSION = '0.1.0';
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const EMPTY_INPUT_SCHEMA = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};
const START_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    providers: { type: 'string', description: 'Comma-separated provider names, or all.' },
    refreshSeconds: { type: 'integer', minimum: 5, maximum: 3600, default: 60 },
    noLogin: { type: 'boolean', default: false },
  },
  additionalProperties: false,
};
const ACTION_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string' },
    output: { type: 'string' },
  },
  required: ['status', 'output'],
  additionalProperties: false,
};
const OVERLAY_STATUS_SCHEMA = {
  type: 'object',
  properties: {
    schema: { type: 'string' },
    id: { type: 'string' },
    state: { type: 'string' },
    pid: { type: ['integer', 'null'] },
    state_directory: { type: 'string' },
    document_path: { type: 'string' },
    document: { type: ['object', 'null'] },
    action_state: { type: ['object', 'null'] },
    worker_pid: { type: ['integer', 'null'] },
    worker_running: { type: 'boolean' },
  },
  required: [
    'schema',
    'id',
    'state',
    'pid',
    'state_directory',
    'document_path',
    'document',
    'action_state',
    'worker_pid',
    'worker_running',
  ],
  additionalProperties: false,
};
const TOOLS = [
  {
    name: 'start_overlay',
    description: 'Start the Windows quota-meter overlay.',
    inputSchema: START_INPUT_SCHEMA,
    outputSchema: ACTION_OUTPUT_SCHEMA,
  },
  {
    name: 'restart_overlay',
    description: 'Restart the Windows quota-meter overlay and reload its saved position.',
    inputSchema: START_INPUT_SCHEMA,
    outputSchema: ACTION_OUTPUT_SCHEMA,
  },
  {
    name: 'stop_overlay',
    description: 'Stop the running quota-meter overlay.',
    inputSchema: EMPTY_INPUT_SCHEMA,
    outputSchema: ACTION_OUTPUT_SCHEMA,
  },
  {
    name: 'refresh_overlay',
    description: 'Request an immediate refresh of the running quota-meter overlay.',
    inputSchema: EMPTY_INPUT_SCHEMA,
    outputSchema: {
      type: 'object',
      properties: { status: { const: 'requested' } },
      required: ['status'],
      additionalProperties: false,
    },
  },
  {
    name: 'overlay_status',
    description: 'Report the quota-meter overlay process and current visibility state.',
    inputSchema: EMPTY_INPUT_SCHEMA,
    outputSchema: OVERLAY_STATUS_SCHEMA,
  },
];

function hasId(message) {
  return Object.prototype.hasOwnProperty.call(message, 'id');
}

function resultResponse(message, result) {
  return hasId(message) ? { jsonrpc: '2.0', id: message.id, result } : null;
}

function errorResponse(message, code, text) {
  return hasId(message)
    ? { jsonrpc: '2.0', id: message.id, error: { code, message: text } }
    : null;
}

function negotiatedProtocolVersion(requested) {
  return PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0];
}

function textResult(text, structuredContent, isError = false) {
  const result = { content: [{ type: 'text', text }] };
  if (structuredContent !== undefined) result.structuredContent = structuredContent;
  if (isError) result.isError = true;
  return result;
}

function startOptions(args = {}) {
  const providers = args.providers || 'all';
  selectProviders(providers);
  const refreshSeconds = args.refreshSeconds ?? 60;
  if (!Number.isInteger(refreshSeconds) || refreshSeconds < 5 || refreshSeconds > 3600) {
    throw new Error('refreshSeconds must be an integer between 5 and 3600');
  }
  if (args.noLogin !== undefined && typeof args.noLogin !== 'boolean') {
    throw new Error('noLogin must be a boolean');
  }
  return { providers, refreshSeconds, noLogin: args.noLogin ?? false };
}

export async function handleMessage(message, env = process.env) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return errorResponse(message || {}, -32600, 'Invalid Request');
  }

  switch (message.method) {
    case 'initialize':
      return resultResponse(message, {
        protocolVersion: negotiatedProtocolVersion(message.params?.protocolVersion),
        capabilities: { tools: {} },
        serverInfo: { name: 'quota-meter', version: VERSION },
        instructions: 'Use overlay_status to inspect the overlay, start_overlay or restart_overlay to control it, stop_overlay to stop it, and refresh_overlay to request an immediate refresh.',
      });
    case 'notifications/initialized':
      return null;
    case 'ping':
      return resultResponse(message, {});
    case 'tools/list':
      return resultResponse(message, { tools: TOOLS });
    case 'tools/call': {
      const name = message.params?.name;
      if (name === 'start_overlay') {
        try {
          const result = await launchOverlay(startOptions(message.params?.arguments), env);
          return resultResponse(message, textResult(result.output, { status: result.status || 'started', output: result.output }));
        } catch (error) {
          return resultResponse(message, textResult(error.message, undefined, true));
        }
      }
      if (name === 'restart_overlay') {
        try {
          const result = await launchOverlay({ ...startOptions(message.params?.arguments), restart: true }, env);
          return resultResponse(message, textResult(result.output, { status: result.status || 'restarted', output: result.output }));
        } catch (error) {
          return resultResponse(message, textResult(error.message, undefined, true));
        }
      }
      if (name === 'stop_overlay') {
        try {
          const result = await launchOverlay({ providers: 'all', refreshSeconds: 60, stop: true }, env);
          return resultResponse(message, textResult(result.output, { status: result.status || 'stopped', output: result.output }));
        } catch (error) {
          return resultResponse(message, textResult(error.message, undefined, true));
        }
      }
      if (name === 'overlay_status') {
        const status = await overlayStatus(env);
        return resultResponse(message, textResult(JSON.stringify(status), status));
      }
      if (name !== 'refresh_overlay') {
        return errorResponse(message, -32602, `Unknown tool: ${name || '(missing name)'}`);
      }
      try {
        await requestOverlayRefresh(env);
        return resultResponse(message, textResult('quota-meter overlay refresh requested', { status: 'requested' }));
      } catch (error) {
        return resultResponse(message, textResult(error.message, undefined, true));
      }
    }
    default:
      return errorResponse(message, -32601, `Method not found: ${message.method}`);
  }
}

export async function runMcpServer(input = process.stdin, output = process.stdout, env = process.env) {
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      output.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
      continue;
    }
    const response = await handleMessage(message, env);
    if (response) output.write(`${JSON.stringify(response)}\n`);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  runMcpServer().catch((error) => {
    process.stderr.write(`quota-meter-mcp: ${error.message}\n`);
    process.exitCode = 1;
  });
}