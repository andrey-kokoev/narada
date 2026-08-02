import type { HostFleetHeartbeat } from '@narada-core/host-fleet';

type FetchFunction = typeof fetch;

export async function readLocalHealth(
  url: string | null,
  timeoutMs: number,
  fetchFn: FetchFunction = fetch,
): Promise<HostFleetHeartbeat['health']> {
  if (!url) return { status: 'unknown', detail: null };
  try {
    const response = await fetchFn(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    await response.body?.cancel().catch(() => undefined);
    return response.ok
      ? { status: 'healthy', detail: null }
      : { status: 'degraded', detail: `health_http_${response.status}` };
  } catch {
    return { status: 'unavailable', detail: 'local_health_unavailable' };
  }
}
