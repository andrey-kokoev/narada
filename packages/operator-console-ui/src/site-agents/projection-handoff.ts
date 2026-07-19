import { OPERATOR_CONSOLE_AGENTS_API_PATH } from '@narada2/operator-console-contract';

export interface PendingProjectionDocumentOptions {
  siteId: string;
  agentId: string;
  sessionId: string | null;
  pollIntervalMs?: number;
  budgetMs?: number;
  apiBasePath?: string;
}

export const PENDING_PROJECTION_POLL_INTERVAL_MS = 2_000;
export const PENDING_PROJECTION_BUDGET_MS = 300_000;

export function scopedAgentSessionsPath(siteId: string, agentId: string): string {
  return `/console/sessions?site=${encodeURIComponent(siteId)}&agent=${encodeURIComponent(agentId)}`;
}

export function sessionRoutePollUrl(options: {
  siteId: string;
  agentId: string;
  sessionId: string | null;
  apiBasePath?: string;
}): string {
  const base = options.apiBasePath ?? OPERATOR_CONSOLE_AGENTS_API_PATH;
  const params = new URLSearchParams({ site_id: options.siteId, agent_id: options.agentId });
  if (options.sessionId) params.set('session_id', options.sessionId);
  return `${base}/session-route?${params.toString()}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function scriptString(value: string): string {
  return JSON.stringify(value).replaceAll('</', '<\\/');
}

/**
 * A self-driving pending projection: the about:blank window polls the console
 * session-route endpoint on its own (about:blank inherits the console origin)
 * and redirects itself when the agent's Web UI route exists. The handoff no
 * longer dies with the console tab or a short client-side wait budget.
 */
export function buildPendingProjectionDocument(options: PendingProjectionDocumentOptions): string {
  const pollUrl = sessionRoutePollUrl(options);
  const sessionsPath = scopedAgentSessionsPath(options.siteId, options.agentId);
  const pollInterval = options.pollIntervalMs ?? PENDING_PROJECTION_POLL_INTERVAL_MS;
  const budget = options.budgetMs ?? PENDING_PROJECTION_BUDGET_MS;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Starting ${escapeHtml(options.agentId)}</title>
<style>
body { margin: 0; font: 14px/1.5 system-ui, sans-serif; color: #1c1c1e; background: #f6f7f9; }
main { max-width: 480px; margin: 18vh auto 0; padding: 28px 32px; background: #fff; border: 1px solid #d9dbe0; border-radius: 10px; }
h1 { margin: 0 0 10px; font-size: 17px; }
p { margin: 0 0 12px; color: #4d5560; }
a { color: #0b5bd3; }
</style>
</head>
<body>
<main>
<h1>Starting ${escapeHtml(options.agentId)}</h1>
<p id="status" role="status">Waiting for its Agent Web UI route&hellip;</p>
</main>
<script>
(function () {
  var pollUrl = ${scriptString(pollUrl)};
  var sessionsPath = ${scriptString(sessionsPath)};
  var deadline = Date.now() + ${String(budget)};
  function schedule() {
    if (Date.now() >= deadline) {
      var status = document.getElementById('status');
      status.textContent = 'The agent is taking longer than expected to publish its Web UI route. ';
      var link = document.createElement('a');
      link.href = sessionsPath;
      link.textContent = 'Open Agent Sessions for this agent';
      status.appendChild(link);
      status.appendChild(document.createTextNode(' when it appears, or keep waiting here.'));
      deadline = Date.now() + ${String(budget)};
      setTimeout(poll, ${String(pollInterval)});
      return;
    }
    setTimeout(poll, ${String(pollInterval)});
  }
  function poll() {
    fetch(pollUrl, { headers: { Accept: 'application/json' } })
      .then(function (response) { return response.json(); })
      .then(function (payload) {
        if (payload && payload.status === 'ready' && payload.url) {
          window.location.replace(payload.url);
          return;
        }
        if (payload && payload.status === 'ambiguous' && payload.sessions_path) {
          window.location.replace(payload.sessions_path);
          return;
        }
        schedule();
      })
      .catch(function () { schedule(); });
  }
  poll();
})();
</script>
</body>
</html>`;
}
