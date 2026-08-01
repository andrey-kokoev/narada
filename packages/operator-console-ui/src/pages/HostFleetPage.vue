<script setup lang="ts">
import { computed, ref } from 'vue';
import OperatorConsoleShell from '../components/OperatorConsoleShell.vue';
import { useHostFleet } from '../host-fleet/composables/useHostFleet';

const fleet = useHostFleet();

function formatTimestamp(value: string | null): string {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function hostKey(host: { hostId: string; hostInstanceId: string }): string {
  return `${host.hostId}@${host.hostInstanceId}`;
}

function targetLabel(target: { hostId: string; hostInstanceId: string; siteId: string; agentId: string; runtimeSessionId: string }): string {
  return `${target.hostId}@${target.hostInstanceId} / ${target.siteId} / ${target.agentId} / ${target.runtimeSessionId}`;
}

const selectedHost = computed(() => fleet.sessionsByHost.value.find((host) => hostKey(host) === fleet.selectedHostKey.value) ?? null);

function submitOnEnter(event: KeyboardEvent): void {
  if (event.shiftKey) return;
  event.preventDefault();
  fleet.sendInput();
}
</script>

<template>
  <OperatorConsoleShell
    eyebrow="User Site"
    title="Hosts"
    back-href="/"
    back-label="Back to Operator Workspace"
    navigation-key="hosts"
  >
    <main class="console-main">
      <header class="intro">
        <h2>Host Fleet</h2>
        <p>The User Site Host Registry is canonical. Every session and event remains qualified by host, instance, Site, Agent, and runtime session.</p>
      </header>

      <div class="summary-row" aria-label="Host summary">
        <div class="summary"><span>Registered</span><strong>{{ fleet.count.value }}</strong></div>
        <div class="summary"><span>Online</span><strong>{{ fleet.onlineCount.value }}</strong></div>
        <div class="summary"><span>Selected host</span><strong>{{ fleet.selectedHostKey.value ?? 'None' }}</strong></div>
        <button class="refresh" type="button" :disabled="fleet.loading.value || fleet.sessionsLoading.value" @click="fleet.load">Refresh</button>
        <button class="refresh" type="button" :disabled="fleet.sessionsLoading.value || !fleet.sessionsByHost.value.some((host) => host.sessions.some((session) => session.state !== 'closed' && session.healthStatus !== 'revoked'))" @click="fleet.aggregateObserving.value ? fleet.stopAggregateObservation() : fleet.startAggregateObservation()">
          {{ fleet.aggregateObserving.value ? 'Stop fleet observation' : 'Observe all active sessions' }}
        </button>
      </div>

      <p v-if="fleet.error.value" class="notice error" role="alert">{{ fleet.error.value }}</p>
      <p v-if="fleet.sessionsError.value" class="notice error" role="alert">{{ fleet.sessionsError.value }}</p>
      <p v-if="fleet.refusals.value.length" class="notice warning">{{ fleet.refusals.value.join(', ') }}</p>
      <p v-if="fleet.loading.value" class="empty">Reading the User Site Host Registry...</p>
      <p v-else-if="!fleet.hosts.value.length" class="empty">No hosts are enrolled. Use <code>narada fleet register</code> to enroll a host instance.</p>

      <section v-else class="fleet-layout" aria-label="Host fleet">
        <div class="table-wrap">
          <table>
            <thead><tr><th scope="col">Host</th><th scope="col">Platform</th><th scope="col">Health</th><th scope="col">Sites</th><th scope="col">Last seen</th><th scope="col">Context</th></tr></thead>
            <tbody>
              <tr v-for="host in fleet.hosts.value" :key="hostKey(host)" :class="{ selected: hostKey(host) === fleet.selectedHostKey.value }">
                <th scope="row"><strong>{{ host.displayName }}</strong><code>{{ hostKey(host) }}</code><small>Revision {{ host.revision }}</small></th>
                <td>{{ host.platform }}<small>{{ host.transport }}</small></td>
                <td><span class="status" :data-status="host.healthStatus">{{ host.healthStatus }}</span><small v-if="host.healthDetail">{{ host.healthDetail }}</small><small v-else>{{ formatTimestamp(host.healthObservedAt) }}</small></td>
                <td>{{ host.admittedSites.length ? host.admittedSites.join(', ') : 'None declared' }}</td>
                <td>{{ formatTimestamp(host.lastSeenAt) }}</td>
                <td><button class="link-button" type="button" @click="fleet.selectHost(host.hostId, host.hostInstanceId)">{{ hostKey(host) === fleet.selectedHostKey.value ? 'Selected' : 'Use host' }}</button></td>
              </tr>
            </tbody>
          </table>
        </div>

        <section v-if="fleet.aggregateObserving.value" class="aggregate-panel" aria-label="Aggregate fleet observation">
          <div class="panel-heading">
            <div><span class="eyebrow">Read-only aggregate observation</span><h3>All active sessions</h3><small>Each event keeps its HostKey and session cursor. No global event sequence is synthesized.</small></div>
            <span class="status" :data-status="fleet.aggregateStreamState.value">{{ fleet.aggregateStreamState.value }}</span>
          </div>
          <p v-if="fleet.aggregateMessage.value" class="notice warning">{{ fleet.aggregateMessage.value }}</p>
          <div v-if="Object.keys(fleet.aggregateCursors.value).length" class="cursor-list">
            <span v-for="(cursor, key) in fleet.aggregateCursors.value" :key="key"><code>{{ key }}</code> · cursor {{ cursor ?? 'none' }}</span>
          </div>
          <div class="event-log" aria-live="polite">
            <p v-if="!fleet.aggregateEvents.value.length" class="empty">Waiting for replay and live events from active sessions...</p>
            <article v-for="(event, index) in fleet.aggregateEvents.value" :key="`${event.hostId}@${event.hostInstanceId}:${event.runtimeSessionId}:${event.sequence ?? 'live'}:${index}`" class="aggregate-event">
              <div><strong>{{ event.hostId }}@{{ event.hostInstanceId }}</strong><small>{{ event.siteId }} / {{ event.agentId }} / {{ event.runtimeSessionId }} · sequence {{ event.sequence ?? 'live' }}</small></div>
              <pre>{{ JSON.stringify(event.payload, null, 2) }}</pre>
            </article>
          </div>
        </section>

        <section v-if="selectedHost" class="session-panel" aria-label="Selected host sessions">
          <div class="panel-heading">
            <div><span class="eyebrow">Selected HostKey</span><h3>{{ selectedHost.displayName }}</h3><code>{{ fleet.selectedHostKey.value }}</code></div>
            <span class="status" :data-status="selectedHost.status">{{ selectedHost.status }}</span>
          </div>
          <p v-if="selectedHost.refusals.length" class="notice warning">{{ selectedHost.refusals.join(', ') }}</p>
          <p v-if="fleet.sessionsLoading.value" class="empty">Discovering sessions on this host...</p>
          <p v-else-if="!fleet.selectedSessions.value.length" class="empty">No admitted runtime sessions are currently discoverable on this host.</p>
          <div v-else class="session-list">
            <article v-for="session in fleet.selectedSessions.value" :key="session.target.runtimeSessionId" class="session-row">
              <div><strong>{{ session.target.siteId }} / {{ session.target.agentId }}</strong><code>{{ session.target.runtimeSessionId }}</code><small>{{ session.state }} · {{ session.healthStatus }} · last seen {{ formatTimestamp(session.lastSeenAt) }}</small></div>
              <div class="session-actions"><button class="action" type="button" :disabled="session.state === 'closed' || session.healthStatus === 'revoked'" @click="fleet.attach(session)">{{ fleet.attachedTarget.value?.runtimeSessionId === session.target.runtimeSessionId ? 'Attached' : 'Attach' }}</button></div>
            </article>
          </div>
        </section>

        <section v-if="fleet.attachedTarget.value" class="attachment-panel" aria-label="Attached runtime session">
          <div class="panel-heading">
            <div><span class="eyebrow">RuntimeTarget</span><h3>Attached session</h3><code>{{ targetLabel(fleet.attachedTarget.value) }}</code></div>
            <div class="panel-actions"><span class="status" :data-status="fleet.streamState.value">{{ fleet.streamState.value }}</span><button class="link-button" type="button" @click="fleet.detach">Detach</button></div>
          </div>
          <p v-if="fleet.streamMessage.value" class="notice error" role="alert">{{ fleet.streamMessage.value }}</p>
          <div class="event-log" aria-live="polite">
            <p v-if="!fleet.events.value.length" class="empty">Waiting for replay and live events from the selected host...</p>
            <pre v-for="(event, index) in fleet.events.value" :key="index">{{ JSON.stringify(event, null, 2) }}</pre>
          </div>
          <form class="composer" @submit.prevent="fleet.sendInput">
            <textarea v-model="fleet.input.value" :disabled="fleet.streamState.value !== 'connected'" placeholder="Enter to submit. Shift+Enter for new line" @keydown.enter="submitOnEnter" />
            <button class="action" type="submit" :disabled="fleet.streamState.value !== 'connected' || !fleet.input.value.trim()">Send</button>
          </form>
        </section>
      </section>
    </main>
  </OperatorConsoleShell>
</template>

<style scoped>
.console-main { max-width: 1400px; margin: 0 auto; padding: 24px 20px 40px; }
.intro { margin-bottom: 20px; }
.intro h2, .panel-heading h3 { margin: 0; font-size: 16px; font-weight: 650; }
.intro p { max-width: 900px; margin: 5px 0 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
.summary-row { display: flex; align-items: stretch; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
.summary { min-width: 130px; display: grid; gap: 4px; padding: 11px 13px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.summary span, .eyebrow { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
.summary strong { font-size: 14px; font-weight: 650; overflow-wrap: anywhere; }
.refresh, .action, .link-button { padding: 8px 12px; border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--surface); color: var(--text); font: inherit; cursor: pointer; }
.refresh { align-self: center; margin-left: auto; }
.refresh:hover:not(:disabled), .action:hover:not(:disabled), .link-button:hover:not(:disabled) { border-color: var(--operator); background: var(--surface-muted); }
button:disabled { cursor: wait; opacity: .6; }
.notice, .empty { margin: 12px 0; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--radius); font-size: 13px; line-height: 1.4; }
.notice.error { color: var(--danger); }
.notice.warning, .empty { color: var(--muted); background: var(--surface-muted); }
.fleet-layout { display: grid; gap: 16px; }
.table-wrap, .session-panel, .attachment-panel { overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.aggregate-panel { overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
table { width: 100%; border-collapse: collapse; min-width: 940px; font-size: 12px; }
th, td { padding: 12px 14px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
thead th { color: var(--muted); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; background: var(--surface-muted); }
tbody tr:last-child th, tbody tr:last-child td { border-bottom: 0; }
tbody th { font-weight: 600; }
tbody tr.selected { background: color-mix(in srgb, var(--activity-chip-bg) 38%, var(--surface)); }
code { display: block; margin-top: 4px; font: 12px/1.4 var(--mono); overflow-wrap: anywhere; }
small { display: block; margin-top: 4px; color: var(--muted); font-size: 11px; font-weight: 400; overflow-wrap: anywhere; }
.status { display: inline-block; padding: 3px 7px; border-radius: calc(var(--radius) - 2px); background: var(--control-bg); color: var(--muted); font-size: 11px; }
.status[data-status="online"], .status[data-status="connected"], .status[data-status="success"] { color: var(--operator); background: var(--activity-chip-bg); }
.status[data-status="reconnecting"] { color: var(--operator); background: color-mix(in srgb, var(--activity-chip-bg) 70%, var(--surface)); }
.status[data-status="revoked"], .status[data-status="refused"], .status[data-status="closed"] { color: var(--danger); }
.panel-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; border-bottom: 1px solid var(--line); }
.panel-heading code { color: var(--muted); }
.panel-actions { display: flex; align-items: center; gap: 10px; }
.session-list { display: grid; }
.session-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 13px 16px; border-bottom: 1px solid var(--line); }
.session-row:last-child { border-bottom: 0; }
.session-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.session-row strong { font-size: 13px; }
.event-log { max-height: 420px; overflow: auto; padding: 12px 16px; background: var(--surface-muted); }
.event-log pre { margin: 0 0 10px; padding: 10px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); color: var(--text); font: 11px/1.45 var(--mono); white-space: pre-wrap; overflow-wrap: anywhere; }
.event-log pre:last-child { margin-bottom: 0; }
.cursor-list { display: flex; flex-wrap: wrap; gap: 6px 14px; padding: 10px 16px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 11px; }
.cursor-list code { display: inline; margin: 0; }
.aggregate-event { display: grid; gap: 6px; margin: 0 0 10px; padding: 10px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.aggregate-event:last-child { margin-bottom: 0; }
.aggregate-event strong { font-size: 12px; }
.aggregate-event pre { margin: 0; padding: 0; border: 0; background: transparent; }
.composer { display: flex; align-items: flex-end; gap: 10px; padding: 12px 16px; border-top: 1px solid var(--line); }
.composer textarea { min-height: 54px; flex: 1; resize: vertical; padding: 9px 10px; border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--surface); color: var(--text); font: 13px/1.4 inherit; }
.composer textarea:focus { outline: 2px solid color-mix(in srgb, var(--operator) 42%, transparent); outline-offset: 1px; }
@media (max-width: 760px) { .console-main { padding: 18px 12px 28px; } .refresh { margin-left: 0; } .panel-heading, .session-row, .composer { align-items: stretch; flex-direction: column; } .panel-actions { justify-content: space-between; } .action { align-self: flex-start; } }
</style>
