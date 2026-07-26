import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function loadSiteEnvFile(path: any, { processEnv = process.env }: any = {}) : any{
  if (!existsSync(path)) return;
  const text: any = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed: any = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separatorIndex: any = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;
    const name: any = trimmed.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || processEnv[name]) continue;
    let value: any = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    processEnv[name] = value;
  }
}

export function loadSiteEnvFiles(siteRoot: any, { siteNaradaRoot, processEnv = process.env }: any = {}) : any{
  loadSiteEnvFile(join(siteRoot, '.env'), { processEnv });
  loadSiteEnvFile(join(siteNaradaRoot(siteRoot), '.env'), { processEnv });
}
