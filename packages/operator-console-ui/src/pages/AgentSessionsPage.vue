<script setup lang="ts">
import OperatorConsoleShell from '../components/OperatorConsoleShell.vue';
import { findOperatorRouteTarget, operatorConsoleNavigation } from '../console/routes';
import { useOperatorWorkspaceRouteDirectory } from '../console/route-directory';
import { useAgentSessions } from '../agent-sessions/composables/useAgentSessions';

const sessions = useAgentSessions();
const routeDirectory = useOperatorWorkspaceRouteDirectory();

function sessionUrl(sessionId: string): string | null {
  const directory = routeDirectory?.directory.value;
  return directory ? findOperatorRouteTarget(directory, { kind: 'session', id: sessionId }) : null;
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
</script>

<template>
  <OperatorConsoleShell
    eyebrow="Operator Console"
    title="Agent Sessions"
    back-href="/"
    back-label="Back to Operator Workspace"
    :nav-items="operatorConsoleNavigation('sessions')"
  >
    <main class="console-main">
      <div class="intro">
        <h2>Agent Sessions</h2>
        <p>Read the canonical NARS session index across registered Sites. This page shows discovery state; it does not control a session.</p>
      </div>

      <div class="summary-row" aria-label="Session summary">
        <div class="summary"><span>Sessions</span><strong>{{ sessions.count.value }}</strong></div>
        <div class="summary"><span>Live</span><strong>{{ sessions.hasActiveSessions.value ? 'Yes' : 'No' }}</strong></div>
        <div class="summary"><span>Read at</span><strong>{{ formatTimestamp(sessions.generatedAt.value) }}</strong></div>
        <button class="refresh" type="button" :disabled="sessions.loading.value" @click="sessions.load">Refresh</button>
      </div>

      <p v-if="sessions.error.value" class="notice error" role="alert">{{ sessions.error.value }}</p>
      <p v-if="sessions.refusals.value.length" class="notice warning">Some Site projections were unavailable: {{ sessions.refusals.value.join(', ') }}</p>
      <p v-if="sessions.loading.value" class="empty">Reading the session index...</p>
      <p v-else-if="!sessions.sessions.value.length" class="empty">No NARS sessions are currently discoverable.</p>

      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr><th scope="col">Session</th><th scope="col">Site</th><th scope="col">State</th><th scope="col">Runtime</th><th scope="col">Last seen</th><th scope="col">Health</th><th scope="col">Open</th></tr>
          </thead>
          <tbody>
            <tr v-for="session in sessions.sessions.value" :key="session.sessionId">
              <th scope="row"><code>{{ session.sessionId }}</code><small>{{ session.agentId ?? 'Agent identity unavailable' }}</small></th>
              <td>{{ session.siteId ?? 'Unknown' }}</td>
              <td><span class="status" :data-state="session.displayState">{{ session.displayState }}</span><small>{{ session.displayStateReason }}</small></td>
              <td>{{ session.runtimeKind ?? 'Unknown' }}</td>
              <td>{{ formatTimestamp(session.lastSeenAt) }}</td>
              <td>{{ session.healthStatus }}</td>
              <td>
                <a v-if="sessionUrl(session.sessionId)" class="open-link" :href="sessionUrl(session.sessionId)" target="_blank" rel="noreferrer">Open</a>
                <span v-else class="unavailable">Unavailable</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  </OperatorConsoleShell>
</template>

<style scoped>
.console-main { max-width: 1240px; margin: 0 auto; padding: 24px 20px 40px; }
.intro { margin-bottom: 20px; }
.intro h2 { margin: 0; font-size: 16px; font-weight: 650; }
.intro p { max-width: 760px; margin: 5px 0 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
.summary-row { display: flex; align-items: stretch; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
.summary { min-width: 130px; display: grid; gap: 4px; padding: 11px 13px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.summary span { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
.summary strong { font-size: 14px; font-weight: 650; overflow-wrap: anywhere; }
.refresh { align-self: center; margin-left: auto; padding: 8px 12px; border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--surface); color: var(--text); font: inherit; cursor: pointer; }
.refresh:hover:not(:disabled) { border-color: var(--operator); background: var(--surface-muted); }
.refresh:disabled { cursor: wait; opacity: .6; }
.notice, .empty { margin: 12px 0; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--radius); font-size: 13px; line-height: 1.4; }
.notice.error { color: var(--danger); }
.notice.warning { color: var(--muted); background: var(--surface-muted); }
.empty { color: var(--muted); }
.table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
table { width: 100%; border-collapse: collapse; min-width: 760px; font-size: 12px; }
th, td { padding: 12px 14px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
thead th { color: var(--muted); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; background: var(--surface-muted); }
tbody tr:last-child th, tbody tr:last-child td { border-bottom: 0; }
tbody th { font-weight: 600; }
code { font: 12px/1.4 var(--mono); overflow-wrap: anywhere; }
small { display: block; margin-top: 4px; color: var(--muted); font-size: 11px; font-weight: 400; overflow-wrap: anywhere; }
.status { display: inline-block; padding: 3px 7px; border-radius: calc(var(--radius) - 2px); background: var(--control-bg); color: var(--muted); font-size: 11px; }
.status[data-state="active"] { color: var(--operator); background: var(--activity-chip-bg); }
.open-link { color: var(--operator); font-size: 12px; font-weight: 650; text-decoration: none; }
.open-link:hover { text-decoration: underline; }
.unavailable { color: var(--muted); font-size: 12px; }
@media (max-width: 760px) { .console-main { padding: 18px 12px 28px; } .refresh { margin-left: 0; } }
</style>
