<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { InboxSummary } from '../composables/useInboxSummary';

const props = defineProps<{
  available: boolean;
  summary: InboxSummary;
  triggerless?: boolean;
}>();
const emit = defineEmits<{
  refresh: [];
}>();

const open = defineModel<boolean>('open', { default: false });
const copyLabel = ref('Copy diagnostics');
const expandedEnvelopes = ref(new Set<string>());

const envelopes = computed(() => props.summary.envelopes.items);
const inboxLabel = computed(() => `Inbox: ${props.summary.status === 'not_loaded' ? 'ready' : props.summary.status} · ${props.summary.envelopes.count} received`);
const subtitle = computed(() => props.summary.serverName ? `${props.summary.serverName} · envelope projection` : 'envelope projection');

watch(open, (value) => {
  if (value) emit('refresh');
});

function envelopeKey(envelope: Record<string, unknown>, index = 0): string {
  return textField(envelope, 'envelope_id') || `${textField(envelope, 'title')}-${index}`;
}

function isExpanded(key: string): boolean {
  return expandedEnvelopes.value.has(key);
}

function toggleEnvelope(key: string) {
  const next = new Set(expandedEnvelopes.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedEnvelopes.value = next;
}

function envelopeTitle(envelope: Record<string, unknown>): string {
  return textField(envelope, 'title') || textField(envelope, 'envelope_id') || '(untitled envelope)';
}

function envelopeMeta(envelope: Record<string, unknown>): string {
  return [
    textField(envelope, 'status'),
    textField(envelope, 'kind'),
    textField(envelope, 'action'),
    textField(envelope, 'target_role') ? `role ${textField(envelope, 'target_role')}` : null,
    textField(envelope, 'severity') ? `severity ${textField(envelope, 'severity')}` : null,
    textField(envelope, 'created_at') ? `created ${textField(envelope, 'created_at')}` : null,
  ].filter(Boolean).join(' · ');
}

function textField(record: Record<string, unknown> | null, ...fields: string[]): string {
  if (!record) return '';
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string' && value) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
  }
  return '';
}

async function copyDiagnostics() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(props.summary, null, 2));
    copyLabel.value = 'Copied';
    setTimeout(() => { copyLabel.value = 'Copy diagnostics'; }, 1400);
  } catch {
    copyLabel.value = 'Copy failed';
    setTimeout(() => { copyLabel.value = 'Copy diagnostics'; }, 1800);
  }
}
</script>

<template>
  <div v-if="available && !triggerless" class="inbox-panel-shell">
    <button v-if="!triggerless" type="button" class="mcp-panel-trigger inbox-panel-trigger" :aria-expanded="open" aria-controls="inbox-panel" @click="open = !open">
      <span class="chip-dot" aria-hidden="true"></span>
      <span>{{ inboxLabel }}</span>
    </button>
  </div>
  <Teleport v-if="available" to="body">
      <Transition name="mcp-drawer">
        <div v-if="open" class="mcp-drawer-layer" role="presentation">
          <button type="button" class="mcp-drawer-backdrop" aria-label="Close Inbox panel" @click="open = false"></button>
          <aside id="inbox-panel" class="mcp-panel inbox-panel" aria-label="Inbox projection">
            <header class="mcp-panel-header">
              <div>
                <h2>Inbox</h2>
                <p>{{ subtitle }}</p>
              </div>
              <button type="button" class="mcp-panel-close" aria-label="Close Inbox panel" @click="open = false">Close</button>
            </header>
            <dl class="mcp-panel-summary">
              <div><dt>State</dt><dd>{{ summary.status }}</dd></div>
              <div><dt>Received</dt><dd>{{ summary.envelopes.count }}</dd></div>
              <div><dt>Indexed</dt><dd>{{ textField(summary.doctor, 'indexed_count') || 'not advertised' }}</dd></div>
              <div><dt>Invalid</dt><dd>{{ textField(summary.doctor, 'invalid_count') || 'not advertised' }}</dd></div>
            </dl>
            <div class="mcp-panel-actions">
              <button type="button" @click="emit('refresh')">Refresh</button>
              <button type="button" @click="copyDiagnostics">{{ copyLabel }}</button>
            </div>
            <section v-if="summary.nextEnvelope" class="sop-section inbox-next-section" aria-label="Next inbox envelope">
              <h3>Next</h3>
              <p class="mcp-panel-empty">{{ envelopeTitle(summary.nextEnvelope) }}<template v-if="envelopeMeta(summary.nextEnvelope)"> · {{ envelopeMeta(summary.nextEnvelope) }}</template></p>
            </section>
            <div class="sop-items-scroll inbox-items-scroll">
              <section class="sop-section inbox-section" aria-label="Received inbox envelopes">
                <h3>Received</h3>
                <ol v-if="envelopes.length" class="mcp-server-list inbox-envelope-list narada-list-reset">
                  <li v-for="(envelope, index) in envelopes" :key="envelopeKey(envelope, index)" class="mcp-server-item inbox-envelope-item">
                    <button type="button" class="mcp-server-row inbox-envelope-row" :aria-expanded="isExpanded(envelopeKey(envelope, index))" @click="toggleEnvelope(envelopeKey(envelope, index))">
                      <span class="mcp-server-main">
                        <strong>{{ envelopeTitle(envelope) }}</strong>
                        <span>{{ envelopeMeta(envelope) }}</span>
                      </span>
                      <span class="mcp-server-chevron" aria-hidden="true">{{ isExpanded(envelopeKey(envelope, index)) ? '-' : '+' }}</span>
                    </button>
                    <div v-if="isExpanded(envelopeKey(envelope, index))" class="mcp-tool-list inbox-envelope-detail">
                      <span v-if="textField(envelope, 'envelope_id')">Envelope {{ textField(envelope, 'envelope_id') }}</span>
                      <span>Disposition actions are candidate-only until NARS admits explicit inbox mutation methods.</span>
                    </div>
                  </li>
                </ol>
                <p v-else class="mcp-panel-empty">No received inbox envelopes are currently reported by the inbox MCP.</p>
              </section>
              <p v-if="summary.errors.length" class="mcp-panel-empty">{{ summary.errors.map((error) => error.message ?? error.code ?? 'Inbox read error').join('; ') }}</p>
            </div>
          </aside>
        </div>
      </Transition>
  </Teleport>
</template>
