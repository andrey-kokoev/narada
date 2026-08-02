<script setup lang="ts">
import { RefreshCw } from 'lucide-vue-next';
import OperatorConsoleShell from '../components/OperatorConsoleShell.vue';
import { useHostFleet } from '../host-fleet/composables/useHostFleet';

const fleet = useHostFleet();

function formatTimestamp(value: string | null): string {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
</script>

<template>
  <OperatorConsoleShell
    eyebrow="Operator Console"
    title="Hosts"
    back-href="/"
    back-label="Back to Operator Workspace"
    navigation-key="fleet"
  >
    <main class="console-main">
      <div class="summary-row" aria-label="Host summary">
        <div class="summary"><span>Hosts</span><strong>{{ fleet.hosts.value.length }}</strong></div>
        <div class="summary"><span>Reachable</span><strong>{{ fleet.reachableCount.value }}</strong></div>
        <div class="summary"><span>Read at</span><strong>{{ formatTimestamp(fleet.generatedAt.value) }}</strong></div>
        <button class="refresh" type="button" :disabled="fleet.loading.value" title="Refresh hosts" @click="fleet.load">
          <RefreshCw :size="14" aria-hidden="true" />
          {{ fleet.loading.value ? 'Refreshing...' : 'Refresh' }}
        </button>
      </div>

      <p v-if="fleet.error.value" class="notice error" role="alert">{{ fleet.error.value }}</p>
      <p v-if="fleet.loading.value && !fleet.hosts.value.length" class="empty">Reading authenticated hosts...</p>
      <p v-else-if="!fleet.hosts.value.length" class="empty">No authenticated hosts are currently projected.</p>

      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Host</th>
              <th scope="col">Platform</th>
              <th scope="col">Reachability</th>
              <th scope="col">Health</th>
              <th scope="col">Operator Console</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="host in fleet.hosts.value" :key="host.identity.host_id">
              <th scope="row">
                {{ host.identity.display_name }}
                <small><code>{{ host.identity.host_id }}</code></small>
              </th>
              <td>{{ host.identity.platform }}</td>
              <td>
                <span class="status" :data-state="host.reachability.status">{{ host.reachability.status }}</span>
                <small>{{ formatTimestamp(host.reachability.observed_at) }}</small>
              </td>
              <td>
                <span class="status" :data-state="host.health.status">{{ host.health.status }}</span>
                <small>{{ host.health.detail ?? formatTimestamp(host.health.observed_at) }}</small>
              </td>
              <td>
                <a
                  v-if="host.operator_console.status === 'available' && host.operator_console.url"
                  class="open-link"
                  :href="host.operator_console.url"
                  target="_blank"
                  rel="noreferrer"
                >Open</a>
                <span v-else class="unavailable">{{ host.operator_console.status }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  </OperatorConsoleShell>
</template>

<style scoped>
.console-main { max-width: 1180px; margin: 0 auto; padding: 24px 20px 40px; }
.summary-row { display: flex; align-items: stretch; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
.summary { min-width: 130px; display: grid; gap: 4px; padding: 11px 13px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.summary span { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0; }
.summary strong { font-size: 14px; font-weight: 650; overflow-wrap: anywhere; }
.refresh { display: inline-flex; align-self: center; align-items: center; gap: 6px; margin-left: auto; padding: 8px 12px; border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--surface); color: var(--text); font: inherit; cursor: pointer; }
.refresh:hover:not(:disabled) { border-color: var(--operator); background: var(--surface-muted); }
.refresh:disabled { cursor: wait; opacity: .6; }
.notice, .empty { margin: 12px 0; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--radius); font-size: 13px; line-height: 1.4; }
.notice.error { color: var(--danger); }
.empty { color: var(--muted); }
.table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
table { width: 100%; border-collapse: collapse; min-width: 720px; font-size: 12px; }
th, td { padding: 12px 14px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
thead th { color: var(--muted); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0; background: var(--surface-muted); }
tbody tr:last-child th, tbody tr:last-child td { border-bottom: 0; }
tbody th { font-weight: 600; }
code { font: 12px/1.4 var(--mono); overflow-wrap: anywhere; }
small { display: block; margin-top: 4px; color: var(--muted); font-size: 11px; font-weight: 400; overflow-wrap: anywhere; }
.status { display: inline-block; padding: 3px 7px; border-radius: calc(var(--radius) - 2px); background: var(--control-bg); color: var(--muted); font-size: 11px; }
.status[data-state="reachable"], .status[data-state="healthy"] { color: var(--operator); background: var(--activity-chip-bg); }
.status[data-state="degraded"], .status[data-state="unreachable"], .status[data-state="unavailable"] { color: var(--danger); }
.open-link { color: var(--operator); font-size: 12px; font-weight: 650; text-decoration: none; }
.open-link:hover { text-decoration: underline; }
.unavailable { color: var(--muted); font-size: 12px; }
@media (max-width: 760px) { .console-main { padding: 18px 12px 28px; } .refresh { margin-left: 0; } }
</style>
