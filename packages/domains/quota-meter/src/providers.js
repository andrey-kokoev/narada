import { spawnSync } from 'node:child_process';
import { fetchCodex } from './codex.js';
import { fetchKimi } from './kimi.js';

const PROVIDERS = {
  codex: {
    id: 'codex',
    name: 'Codex',
    loginCommand: 'codex login',
    fetch: fetchCodex,
  },
  kimi: {
    id: 'kimi',
    name: 'Kimi Code',
    loginCommand: 'kimi login',
    fetch: fetchKimi,
  },
};

export function supportedProviders() {
  return Object.values(PROVIDERS).map(({ id, name, loginCommand }) => ({ id, name, loginCommand }));
}

export function selectProviders(value) {
  if (!value || value === 'all') return Object.keys(PROVIDERS);
  const selected = String(value).split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  const unknown = selected.filter((item) => !PROVIDERS[item]);
  if (unknown.length > 0) throw new Error(`Unknown provider(s): ${unknown.join(', ')}`);
  return [...new Set(selected)];
}

function commandFor(provider, env) {
  return provider === 'codex' ? (env.CODEX_COMMAND || 'codex') : (env.KIMI_COMMAND || 'kimi');
}

export function runNativeLogin(provider, options = {}) {
  const command = commandFor(provider, options.env || process.env);
  const result = spawnSync(command, ['login'], {
    // Keep machine-readable stdout clean while preserving a terminal for the login flow.
    stdio: options.json ? ['inherit', process.stderr, 'inherit'] : 'inherit',
    windowsHide: false,
    shell: process.platform === 'win32',
    env: options.env || process.env,
  });
  return result.status === 0;
}

async function askToLogin(provider, result, options) {
  if (!options.interactive || options.noLogin || result.status !== 'auth_required') return false;
  const readline = await import('node:readline/promises');
  const output = options.json ? process.stderr : process.stdout;
  const input = readline.createInterface({ input: process.stdin, output });
  try {
    const answer = await input.question(
      `${provider.name} needs authentication. Run \`${provider.loginCommand}\` now? [Y/n] `,
    );
    return answer.trim() === '' || /^y(es)?$/i.test(answer.trim());
  } finally {
    input.close();
  }
}

export async function fetchProviders(names, options = {}) {
  const results = [];
  for (const name of names) {
    const provider = PROVIDERS[name];
    let result = await provider.fetch(options);
    if (await askToLogin(provider, result, options)) {
      if (runNativeLogin(name, options)) result = await provider.fetch(options);
    }
    results.push(result);
  }
  return results;
}