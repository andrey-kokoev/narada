import { homedir } from 'node:os';
import { join } from 'node:path';

type AnyRecord = Record<string, any>;

function envValue(processEnv: AnyRecord, name: string): string | null {
  const value = processEnv?.[name];
  return value === undefined || value === null || value === '' ? null : String(value);
}

function codexAuthHome(
  { processEnv = process.env, osHomedir = homedir }: AnyRecord = {},
): string | null {
  const explicit = envValue(processEnv, 'NARADA_CODEX_AUTH_HOME')
    ?? envValue(processEnv, 'CODEX_HOME');
  if (explicit) return explicit;
  const userRoot = envValue(processEnv, 'USERPROFILE') ?? envValue(processEnv, 'HOME') ?? osHomedir?.() ?? null;
  return userRoot ? join(userRoot, '.codex') : null;
}

export {
  codexAuthHome,
};
