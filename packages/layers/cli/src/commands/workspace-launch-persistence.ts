import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { redactWorkspaceLaunchArgv, redactWorkspaceLaunchCommand, redactWorkspaceLaunchText } from './workspace-launch-process.js';

export async function writeWorkspacePlanResult(path: string | undefined, result: unknown): Promise<void> {
  if (!path) return;
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(redactWorkspaceLaunchEvidence(result), null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
}

function isSecretEvidenceKey(key: string): boolean {
  return /(?:api[-_]?key|access[-_]?key|client[-_]?secret|token|secret|password|authorization|cookie|private[-_]?key)/i.test(key);
}

function redactWorkspaceLaunchEvidence(value: unknown, key: string | null = null): unknown {
  if (typeof value === 'string') {
    if (key && isSecretEvidenceKey(key)) return '<redacted>';
    return key === 'command' ? redactWorkspaceLaunchCommand(value) : redactWorkspaceLaunchText(value);
  }
  if (Array.isArray(value)) {
    if (key && /(?:args|argv|commands|command)$/i.test(key) && value.every((entry) => typeof entry === 'string')) {
      return redactWorkspaceLaunchArgv(value as string[]);
    }
    return value.map((entry) => redactWorkspaceLaunchEvidence(entry, key));
  }
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
    entryKey,
    redactWorkspaceLaunchEvidence(entryValue, entryKey),
  ]));
}
