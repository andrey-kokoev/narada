import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function loadSiteEnvFile(path, { processEnv = process.env } = {}) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;
    const name = trimmed.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || processEnv[name]) continue;
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    processEnv[name] = value;
  }
}

export function loadSiteEnvFiles(siteRoot, { siteNaradaRoot, processEnv = process.env } = {}) {
  loadSiteEnvFile(join(siteRoot, '.env'), { processEnv });
  loadSiteEnvFile(join(siteNaradaRoot(siteRoot), '.env'), { processEnv });
}
