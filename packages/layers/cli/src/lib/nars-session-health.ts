const DEFAULT_NARS_SESSION_HEALTH_TIMEOUT_MS = 500;

export async function probeNarsSessionHealth(
  sessions: Array<{ session_id?: unknown; health_endpoint?: unknown }>,
  timeoutMs = DEFAULT_NARS_SESSION_HEALTH_TIMEOUT_MS,
): Promise<Record<string, string>> {
  const entries = await Promise.all(sessions.map(async (session) => {
    const sessionId = typeof session.session_id === 'string' ? session.session_id : '';
    const healthEndpoint = typeof session.health_endpoint === 'string' ? session.health_endpoint : null;
    if (!sessionId || !healthEndpoint) return [sessionId, 'not_checked'] as const;
    return [sessionId, await probeNarsHealthEndpoint(healthEndpoint, timeoutMs)] as const;
  }));
  return Object.fromEntries(entries.filter(([sessionId]) => sessionId));
}

async function probeNarsHealthEndpoint(endpoint: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  try {
    const response = await fetch(endpoint, { signal: controller.signal });
    return response.ok ? 'healthy' : 'unhealthy';
  } catch {
    return 'unavailable';
  } finally {
    clearTimeout(timeout);
  }
}
