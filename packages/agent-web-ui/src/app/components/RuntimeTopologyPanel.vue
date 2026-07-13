<script setup lang="ts">
import { computed, ref } from 'vue';
import type { RuntimeTopologySummary } from '../composables/useRuntimeTopology';

const props = defineProps<{
  topology: RuntimeTopologySummary;
}>();

const open = defineModel<boolean>('open', { default: false });
const copyLabel = ref('Copy diagnostics');
const sessionCopyLabel = ref('Copy session');

const inputVerdict = computed(() => props.topology.canSendInput ? 'Input enabled' : 'Input blocked');
const healthEndpoint = computed(() => props.topology.endpoints.health);
const eventEndpoint = computed(() => props.topology.endpoints.eventStream);

async function copyDiagnostics() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(props.topology, null, 2));
    copyLabel.value = 'Copied';
    setTimeout(() => { copyLabel.value = 'Copy diagnostics'; }, 1400);
  } catch {
    copyLabel.value = 'Copy failed';
    setTimeout(() => { copyLabel.value = 'Copy diagnostics'; }, 1800);
  }
}

async function copySessionId() {
  if (!props.topology.sessionId) return;
  try {
    await navigator.clipboard.writeText(props.topology.sessionId);
    sessionCopyLabel.value = 'Copied';
    setTimeout(() => { sessionCopyLabel.value = 'Copy session'; }, 1400);
  } catch {
    sessionCopyLabel.value = 'Copy failed';
    setTimeout(() => { sessionCopyLabel.value = 'Copy session'; }, 1800);
  }
}

function openEndpoint(endpoint: string | null) {
  if (!endpoint) return;
  window.open(endpoint, '_blank', 'noopener,noreferrer');
}
</script>

<template>
  <Teleport to="body">
    <Transition name="mcp-drawer">
      <div v-if="open" class="mcp-drawer-layer" role="presentation">
        <button type="button" class="mcp-drawer-backdrop" aria-label="Close connection panel" @click="open = false"></button>
        <aside id="runtime-topology-panel" class="mcp-panel runtime-topology-panel" aria-label="Connection">
          <header class="mcp-panel-header">
            <div>
              <h2>Connection</h2>
              <p>{{ props.topology.verdictLabel }} · {{ props.topology.sessionId ?? 'no session id' }}</p>
            </div>
            <button type="button" class="mcp-panel-close" aria-label="Close connection panel" @click="open = false">Close</button>
          </header>

          <section class="runtime-attachment-verdict" :data-state="props.topology.status">
            <div>
              <span>{{ inputVerdict }}</span>
              <strong>{{ props.topology.verdictLabel }}</strong>
            </div>
            <p>{{ props.topology.primaryCause }}</p>
            <p>{{ props.topology.operatorHint }}</p>
          </section>

          <dl class="mcp-panel-summary runtime-attachment-summary">
            <div>
              <dt>Status</dt>
              <dd>{{ props.topology.status }}</dd>
            </div>
            <div>
              <dt>Input</dt>
              <dd>{{ props.topology.inputPolicy ?? (props.topology.canSendInput ? 'enabled' : 'blocked') }}</dd>
            </div>
            <div>
              <dt>Session</dt>
              <dd>{{ props.topology.sessionId ?? 'not bound' }}</dd>
            </div>
            <div>
              <dt>Authority</dt>
              <dd>{{ props.topology.authorityRuntimeId ?? 'not advertised' }}</dd>
            </div>
          </dl>

          <div class="mcp-panel-actions runtime-attachment-actions">
            <button type="button" :disabled="!props.topology.sessionId" @click="copySessionId">{{ sessionCopyLabel }}</button>
            <button type="button" :disabled="!healthEndpoint" @click="openEndpoint(healthEndpoint)">Open health</button>
            <button type="button" :disabled="!eventEndpoint" @click="openEndpoint(eventEndpoint)">Open events</button>
            <button type="button" @click="copyDiagnostics">{{ copyLabel }}</button>
          </div>

          <section v-if="props.topology.stale" class="runtime-topology-warning" aria-label="Stale session warning">
            This browser is attached to stale authority. Start a new session or explicitly attach to the live authority before sending input.
          </section>

          <section class="runtime-topology-detail-header">
            <h3>Attachment Details</h3>
            <p>{{ props.topology.nodes.length }} runtime nodes</p>
          </section>

          <ol class="runtime-topology-list narada-list-reset">
            <li v-for="node in props.topology.nodes" :key="node.id" class="runtime-topology-node" :data-state="node.state">
              <div class="runtime-topology-node-main">
                <strong>{{ node.label }}</strong>
                <span>{{ node.state }}</span>
              </div>
              <p>{{ node.detail }}</p>
              <dl v-if="node.metadata.length" class="runtime-topology-node-meta">
                <div v-for="item in node.metadata" :key="item.label">
                  <dt>{{ item.label }}</dt>
                  <dd>{{ item.value }}</dd>
                </div>
              </dl>
            </li>
          </ol>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>
