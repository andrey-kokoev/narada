import { setText } from './render.js';

export async function refreshHttpHealthStatus(endpoint, documentRef = document, fetchFn = globalThis.fetch) {
  if (!endpoint) {
    setText('health', 'health endpoint not configured', documentRef);
    return;
  }
  try {
    const response = await fetchFn(endpoint, { method: 'GET', cache: 'no-store' });
    const body = await response.json();
    setText('health', `${body.status ?? response.status} · ${body.agent_id ?? 'agent'} · ${body.session_id ?? 'session'}`, documentRef);
  } catch (error) {
    setText('health', `health unavailable · ${error instanceof Error ? error.message : String(error)}`, documentRef);
  }
}
