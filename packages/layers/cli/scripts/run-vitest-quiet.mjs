#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

function appendNodeOption(value, option) {
  const parts = String(value ?? '').split(/\s+/).filter(Boolean);
  if (!parts.includes(option)) parts.push(option);
  return parts.join(' ');
}

function appendGitConfig(env, key, value) {
  const count = Number.parseInt(env.GIT_CONFIG_COUNT ?? '0', 10);
  const index = Number.isFinite(count) && count >= 0 ? count : 0;
  env.GIT_CONFIG_COUNT = String(index + 1);
  env[`GIT_CONFIG_KEY_${index}`] = key;
  env[`GIT_CONFIG_VALUE_${index}`] = value;
}

const env = { ...process.env };
env.NODE_OPTIONS = appendNodeOption(env.NODE_OPTIONS, '--no-warnings');
appendGitConfig(env, 'core.autocrlf', 'false');

const vitestEntrypoint = join(process.cwd(), 'node_modules', 'vitest', 'vitest.mjs');
const vitestArgs = process.argv.slice(2).map((arg) => arg === '--silent' ? '--silent=true' : arg);
const result = spawnSync(process.execPath, ['--no-warnings', vitestEntrypoint, ...vitestArgs], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
  windowsHide: true,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
