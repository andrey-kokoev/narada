import { homedir } from 'node:os';
import { join } from 'node:path';

function envValue(processEnv, name) {
  const value = processEnv?.[name];
  return value === undefined || value === null || value === '' ? null : String(value);
}

function codexAuthHome({ processEnv = process.env, osHomedir = homedir } = {}) {
  const explicit = envValue(processEnv, 'NARADA_CODEX_AUTH_HOME')
    ?? envValue(processEnv, 'CODEX_HOME');
  if (explicit) return explicit;
  const userRoot = envValue(processEnv, 'USERPROFILE') ?? envValue(processEnv, 'HOME') ?? osHomedir?.() ?? null;
  return userRoot ? join(userRoot, '.codex') : null;
}

export {
  codexAuthHome,
};
