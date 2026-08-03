import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { asNumber, durationToLabel, percentFromValues, toIso } from './core.js';

const DEFAULT_USAGE_URL = 'https://api.kimi.com/coding/v1/usages';
const KIMI_WEEKLY_QUOTA_SECONDS = 7 * 24 * 60 * 60;

function kimiHome(env = process.env) {
  return env.KIMI_CODE_HOME || path.join(os.homedir(), '.kimi-code');
}

function credentialPaths(env = process.env) {
  const paths = [];
  if (env.KIMI_CODE_CREDENTIALS) paths.push(env.KIMI_CODE_CREDENTIALS);
  const home = kimiHome(env);
  paths.push(path.join(home, 'credentials', 'kimi-code.json'));
  paths.push(path.join(os.homedir(), '.kimi', 'credentials', 'kimi-code.json'));
  return [...new Set(paths)];
}

async function nativeCredential(env = process.env) {
  for (const filePath of credentialPaths(env)) {
    try {
      const parsed = JSON.parse(await readFile(filePath, 'utf8'));
      if (typeof parsed.access_token !== 'string' || parsed.access_token.length === 0) continue;
      const rawExpiresAt = parsed.expires_at;
      const numericExpiresAt = asNumber(rawExpiresAt);
      const expiresAt = numericExpiresAt === null
        ? Date.parse(String(rawExpiresAt)) / 1000
        : numericExpiresAt > 100_000_000_000 ? numericExpiresAt / 1000 : numericExpiresAt;
      return {
        token: parsed.access_token,
        expired: Number.isFinite(expiresAt) && expiresAt <= (Date.now() / 1000) + 30,
        filePath,
      };
    } catch (error) {
      if (error.code !== 'ENOENT') continue;
    }
  }
  return null;
}

async function resolveCredential(env = process.env) {
  const native = await nativeCredential(env);
  if (native && !native.expired) return { token: native.token, mode: 'native_oauth', source: 'kimi-code' };

  const apiKey = env.KIMI_CODE_API_KEY || env.KIMI_API_KEY;
  if (apiKey) return { token: apiKey, mode: 'api_key', source: 'environment' };

  return {
    token: null,
    mode: native?.expired ? 'expired_native_oauth' : 'missing',
    source: native?.filePath || null,
  };
}

function durationSeconds(window) {
  const duration = asNumber(window?.duration);
  if (duration === null) return null;
  const unit = String(window?.timeUnit || window?.time_unit || '').toUpperCase();
  if (unit.includes('HOUR')) return duration * 60 * 60;
  if (unit.includes('DAY')) return duration * 24 * 60 * 60;
  if (unit.includes('SECOND')) return duration;
  return duration * 60;
}

function normalizeKimiWindow(detail, window, id, fallbackLabel, fetchedAt, fallbackDurationSeconds = null) {
  const percent = percentFromValues({
    usedPercent: detail.usedPercent ?? detail.used_percent,
    remainingPercent: detail.remainingPercent ?? detail.remaining_percent,
    used: detail.used,
    remaining: detail.remaining,
    limit: detail.limit,
  });
  const seconds = durationSeconds(window) ?? fallbackDurationSeconds;

  return {
    id,
    label: durationToLabel(seconds, fallbackLabel),
    usedPercent: percent.usedPercent,
    remainingPercent: percent.remainingPercent,
    resetAt: toIso(detail.resetTime ?? detail.reset_time),
    durationSeconds: seconds,
    unit: 'quota',
    amount: {
      limit: detail.limit ?? null,
      used: detail.used ?? null,
      remaining: detail.remaining ?? null,
    },
    source: 'GET /coding/v1/usages',
    fetchedAt,
  };
}

function normalizeKimiResponse(body, fetchedAt) {
  const windows = [];
  const usage = body?.usage;

  if (usage && typeof usage === 'object') {
    windows.push(normalizeKimiWindow(
      usage,
      null,
      'kimi:weekly',
      '7d',
      fetchedAt,
      KIMI_WEEKLY_QUOTA_SECONDS,
    ));
  }

  for (const [index, entry] of (Array.isArray(body?.limits) ? body.limits : []).entries()) {
    const detail = entry?.detail || entry || {};
    windows.push(normalizeKimiWindow(
      detail,
      entry?.window,
      `kimi:window:${index}`,
      `window-${index + 1}`,
      fetchedAt,
    ));
  }

  return windows;
}

function authRequired(message, fetchedAt = new Date().toISOString()) {
  return {
    provider: 'kimi',
    displayName: 'Kimi Code',
    status: 'auth_required',
    auth: { mode: 'unknown' },
    windows: [],
    usage: null,
    metadata: {},
    loginCommand: 'kimi login',
    error: { code: 'AUTH_REQUIRED', message },
    fetchedAt,
    source: 'GET /coding/v1/usages',
  };
}

export async function fetchKimi(options = {}) {
  const fetchedAt = new Date().toISOString();
  const env = options.env || process.env;
  const credential = await resolveCredential(env);

  if (!credential.token) {
    return authRequired(
      credential.mode === 'expired_native_oauth'
        ? 'Kimi Code credentials are expired; run `kimi login`.'
        : 'Kimi Code is not logged in and no Kimi Code API key was found.',
      fetchedAt,
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 15_000);

  try {
    const response = await fetch(env.KIMI_USAGE_URL || DEFAULT_USAGE_URL, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${credential.token}`,
        'User-Agent': `quota-meter/${options.version || '0.1.0'}`,
      },
      signal: controller.signal,
    });

    if (response.status === 401) return authRequired('Kimi Code authentication was rejected; run `kimi login`.', fetchedAt);
    if (!response.ok) {
      return {
        provider: 'kimi',
        displayName: 'Kimi Code',
        status: 'unavailable',
        auth: { mode: credential.mode },
        windows: [],
        usage: null,
        metadata: {},
        error: { code: `HTTP_${response.status}`, message: `Kimi usage endpoint returned HTTP ${response.status}.` },
        fetchedAt,
        source: 'GET /coding/v1/usages',
      };
    }

    const body = await response.json();
    const windows = normalizeKimiResponse(body, fetchedAt);
    return {
      provider: 'kimi',
      displayName: 'Kimi Code',
      status: windows.length > 0 ? 'ok' : 'unavailable',
      auth: { mode: credential.mode },
      plan: body?.subType || null,
      windows,
      usage: null,
      metadata: {
        parallel: body?.parallel ?? null,
        totalQuota: body?.totalQuota ?? null,
        boosterWallet: body?.boosterWallet ?? null,
        experimentalEndpoint: true,
      },
      fetchedAt,
      source: 'GET /coding/v1/usages',
    };
  } catch (error) {
    return {
      provider: 'kimi',
      displayName: 'Kimi Code',
      status: 'unavailable',
      auth: { mode: credential.mode },
      windows: [],
      usage: null,
      metadata: {},
      error: { code: error.name === 'AbortError' ? 'TIMEOUT' : 'KIMI_ERROR', message: error.message },
      fetchedAt,
      source: 'GET /coding/v1/usages',
    };
  } finally {
    clearTimeout(timer);
  }
}

export { normalizeKimiResponse, resolveCredential };