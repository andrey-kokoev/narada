import { existsSync } from 'node:fs';
import { codexCommand as resolveCodexCommand } from '@narada2/carrier-provider-support/codex-subscription-command';

export function summarizeToolResult(value, limit = 500) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

export function extractOutputRef(content) {
  if (!content) return null;
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      return parsed.output_ref ?? null;
    } catch {
      return null;
    }
  }
  if (typeof content !== 'object') return null;
  try {
    const parsed = content.content && typeof content.content === 'string' ? JSON.parse(content.content) : content;
    return parsed.output_ref ?? null;
  } catch {
    return null;
  }
}

export function stringifySummary(value) {
  try { return JSON.stringify(value); } catch { return String(value); }
}

export function parseJson(text) {
  try { return JSON.parse(text); } catch { return {}; }
}

export function isAbortError(error) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('abort') || message.includes('interrupt_requested');
}

export function randomId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function codexCliSpawnError(error, command) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error && typeof error === 'object' ? error.code : null;
  if (code === 'ENOENT') {
    return new Error(`codex_cli_unresolved: failed to start ${command.command}. Install Codex CLI, expose it on PATH, or set NARADA_CODEX_EXEC_COMMAND/NARADA_CODEX_COMMAND. Original error: ${message}`);
  }
  return error instanceof Error ? error : new Error(message);
}

export function terminateChildProcess(child) {
  if (!child || child.killed) return;
  child.kill();
}

export function codexCommand({ processEnv = process.env, platform = process.platform, exists = existsSync } = {}) {
  return resolveCodexCommand({ processEnv, platform, exists });
}
