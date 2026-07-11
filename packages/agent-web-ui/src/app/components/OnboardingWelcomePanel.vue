<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { AgentActivityState } from '../composables/useAgentActivity';
import type { HealthIntelligenceSummary } from '../composables/useHealthStatus';
import type { SessionIdentitySummary } from '../composables/useNarsEvents';
import type { ProjectedEventRow } from '../lib/eventProjection';

const props = defineProps<{
  enabled: boolean;
  rows: ProjectedEventRow[];
  agentActivity: AgentActivityState;
  sessionIdentity: SessionIdentitySummary;
  intelligence: HealthIntelligenceSummary;
}>();

const emit = defineEmits<{
  'intent-selected': [intent: string];
}>();

const dismissed = ref(false);
const storageKey = computed(() => {
  const sessionId = props.sessionIdentity.sessionId;
  return sessionId ? `narada.user-site-onboarding.dismissed.${sessionId}` : null;
});

const operatorMessageSeen = computed(() => props.rows.some((row) => row.kind === 'user_message' || row.kind === 'operator_input_submitted'));
const assistantMessageSeen = computed(() => props.rows.some((row) => row.kind === 'assistant_message'));
const phase = computed<'ready' | 'working' | 'complete'>(() => {
  if (assistantMessageSeen.value) return 'complete';
  if (operatorMessageSeen.value || props.agentActivity.active) return 'working';
  return 'ready';
});
const visible = computed(() => props.enabled && !dismissed.value);
const providerLabel = computed(() => props.intelligence.provider ?? 'Registry default');
const modelLabel = computed(() => props.intelligence.model ?? 'Resolved at launch');
const siteLabel = computed(() => props.sessionIdentity.siteId ?? 'Personal workspace');

function restoreDismissed() {
  dismissed.value = false;
  const key = storageKey.value;
  if (!key) return;
  try {
    dismissed.value = window.sessionStorage.getItem(key) === '1';
  } catch {
    dismissed.value = false;
  }
}

function dismiss() {
  dismissed.value = true;
  const key = storageKey.value;
  if (!key) return;
  try {
    window.sessionStorage.setItem(key, '1');
  } catch {
    // Browser storage is optional; the panel remains dismissible in memory.
  }
}

function selectIntent(intent: string) {
  emit('intent-selected', intent);
}

onMounted(restoreDismissed);
watch(storageKey, restoreDismissed);
</script>

<template>
  <section v-if="visible" class="onboarding-panel" :data-phase="phase" aria-labelledby="onboarding-panel-title">
    <div class="onboarding-panel-heading">
      <div>
        <p class="onboarding-eyebrow">Personal workspace</p>
        <h2 id="onboarding-panel-title">
          <template v-if="phase === 'ready'">Welcome to your General assistant</template>
          <template v-else-if="phase === 'working'">Your assistant is working</template>
          <template v-else>Your first session is ready</template>
        </h2>
      </div>
      <button type="button" class="onboarding-dismiss" aria-label="Dismiss onboarding" @click="dismiss">Dismiss</button>
    </div>

    <p v-if="phase === 'ready'" class="onboarding-copy">
      No project setup is needed. Tell the assistant what you would like to work on in your own words.
    </p>
    <p v-else-if="phase === 'working'" class="onboarding-copy">
      Your request is admitted to the resident assistant. Keep this page open while it prepares the response.
    </p>
    <p v-else class="onboarding-copy">
      Resident is enough to begin. When the work calls for structured planning or implementation, ask about the optional architect and builder roles.
    </p>

    <dl class="onboarding-facts">
      <div>
        <dt>Workspace</dt>
        <dd>{{ siteLabel }}</dd>
      </div>
      <div>
        <dt>Assistant</dt>
        <dd>General assistant <span class="onboarding-secondary">resident</span></dd>
      </div>
      <div>
        <dt>Intelligence</dt>
        <dd>{{ providerLabel }} <span class="onboarding-secondary">{{ modelLabel }}</span></dd>
      </div>
      <div>
        <dt>Surface</dt>
        <dd>Browser <span class="onboarding-secondary">operator view</span></dd>
      </div>
      <div>
        <dt>Authority</dt>
        <dd>Resident runtime <span class="onboarding-secondary">NARS</span></dd>
      </div>
    </dl>

    <div v-if="phase === 'ready'" class="onboarding-actions">
      <button type="button" class="onboarding-primary" @click="selectIntent('What would you like to work on?')">Start with a request</button>
      <button type="button" class="onboarding-secondary-button" @click="selectIntent('What can you help me with?')">Ask what is possible</button>
    </div>
    <div v-else-if="phase === 'complete'" class="onboarding-actions">
      <button type="button" class="onboarding-primary" @click="selectIntent('What roles could I add later, and when would architect or builder help?')">Review optional roles</button>
    </div>

    <details class="onboarding-details">
      <summary>Technical details</summary>
      <span>Session {{ sessionIdentity.sessionId ?? 'starting' }}. The browser is the operator surface; the resident runtime remains the authority.</span>
    </details>
  </section>
</template>

<style scoped>
.onboarding-panel {
  margin: 0 18px 12px;
  padding: 16px 18px;
  border: 1px solid color-mix(in srgb, var(--border-strong, #475569) 70%, transparent);
  border-radius: 8px;
  background: var(--panel-strong, #111827);
  color: var(--text-primary, #f8fafc);
}

.onboarding-panel[data-phase='working'] {
  border-color: color-mix(in srgb, var(--accent, #60a5fa) 70%, transparent);
}

.onboarding-panel[data-phase='complete'] {
  border-color: color-mix(in srgb, var(--success, #34d399) 60%, transparent);
}

.onboarding-panel-heading,
.onboarding-actions,
.onboarding-facts {
  display: flex;
  align-items: center;
  gap: 12px;
}

.onboarding-panel-heading {
  justify-content: space-between;
}

.onboarding-eyebrow {
  margin: 0 0 3px;
  color: var(--text-muted, #94a3b8);
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.onboarding-panel h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 650;
}

.onboarding-copy {
  max-width: 760px;
  margin: 10px 0 14px;
  color: var(--text-secondary, #cbd5e1);
  line-height: 1.45;
}

.onboarding-facts {
  flex-wrap: wrap;
  align-items: stretch;
  margin: 0 0 14px;
}

.onboarding-facts div {
  min-width: 150px;
  padding-right: 18px;
}

.onboarding-facts dt {
  color: var(--text-muted, #94a3b8);
  font-size: 0.72rem;
  text-transform: uppercase;
}

.onboarding-facts dd {
  margin: 3px 0 0;
  font-size: 0.86rem;
  font-weight: 600;
}

.onboarding-secondary {
  color: var(--text-muted, #94a3b8);
  font-weight: 400;
}

.onboarding-actions {
  flex-wrap: wrap;
}

.onboarding-actions button,
.onboarding-dismiss {
  min-height: 32px;
  border: 1px solid var(--border, #334155);
  border-radius: 6px;
  padding: 6px 10px;
  font: inherit;
  cursor: pointer;
}

.onboarding-primary {
  background: var(--accent, #2563eb);
  color: var(--accent-foreground, #fff);
}

.onboarding-secondary-button,
.onboarding-dismiss {
  background: transparent;
  color: var(--text-secondary, #cbd5e1);
}

.onboarding-dismiss {
  align-self: flex-start;
  border-color: transparent;
  color: var(--text-muted, #94a3b8);
}

.onboarding-details {
  margin-top: 12px;
  color: var(--text-muted, #94a3b8);
  font-size: 0.75rem;
}

.onboarding-details summary {
  cursor: pointer;
}

.onboarding-details span {
  display: block;
  margin-top: 6px;
  line-height: 1.4;
}

@media (max-width: 720px) {
  .onboarding-panel {
    margin-inline: 10px;
  }

  .onboarding-facts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .onboarding-facts div {
    min-width: 0;
  }
}
</style>
