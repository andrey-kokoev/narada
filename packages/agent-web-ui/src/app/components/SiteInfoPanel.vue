<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{
  siteLabel: string;
  agentLabel: string | null;
  eventEndpoint: string | null;
  healthEndpoint: string | null;
  healthTransport: string;
  inputEndpoint: string | null;
  artifactBasePath: string | null;
  artifactTransport: string | null;
  healthBody: Record<string, unknown> | null;
  authorityTransition: Record<string, unknown> | null;
  hasArtifacts: boolean;
  hasDelegationMcp: boolean;
  hasGitMcp: boolean;
  hasInboxMcp: boolean;
  hasSopMcp: boolean;
  hasSurfaceFeedbackMcp: boolean;
  hasMailboxMcp: boolean;
  hasSchedulerMcp: boolean;
  hasTaskLifecycleMcp: boolean;
}>();
const emit = defineEmits<{
  'open-mcp-panel': [];
  'open-artifacts-panel': [];
  'open-delegation-panel': [];
  'open-git-panel': [];
  'open-inbox-panel': [];
  'open-sop-panel': [];
  'open-surface-feedback-panel': [];
  'open-mailbox-panel': [];
  'open-scheduler-panel': [];
  'open-task-lifecycle-panel': [];
}>();

const open = ref(false);

const siteRoot = computed(() => stringField(props.healthBody, 'site_root') ?? stringField(props.healthBody, 'siteRoot') ?? 'not advertised');
const siteConfig = computed(() => objectField(props.healthBody, 'site_config'));
const allowedRoots = computed(() => stringArrayField(siteConfig.value, 'allowed_roots'));
const runtime = computed(() => stringField(props.healthBody, 'runtime') ?? stringField(props.healthBody, 'runtime_substrate_kind') ?? 'not advertised');
const siteId = computed(() => stringField(props.healthBody, 'site_id') ?? props.siteLabel);
const authorityState = computed(() => stringField(props.authorityTransition, 'authority_transition_state') ?? 'not advertised');
const writeAdmission = computed(() => stringField(props.authorityTransition, 'source_write_admission') ?? 'not advertised');
const observedHosts = computed(() => {
  const hosts = [props.eventEndpoint, props.healthEndpoint, props.inputEndpoint, props.artifactBasePath]
    .map(endpointHost)
    .filter((value): value is string => Boolean(value));
  return [...new Set(hosts)];
});

function stringField(record: Record<string, unknown> | null, field: string): string | null {
  const value = record?.[field];
  return typeof value === 'string' && value ? value : null;
}

function objectField(record: Record<string, unknown> | null, field: string): Record<string, unknown> | null {
  const value = record?.[field];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringArrayField(record: Record<string, unknown> | null, field: string): string[] {
  const value = record?.[field];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry)) : [];
}

function endpointHost(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value, window.location.href).host;
  } catch {
    return null;
  }
}

function openMcpPanel() {
  open.value = false;
  emit('open-mcp-panel');
}

function openArtifactsPanel() {
  open.value = false;
  emit('open-artifacts-panel');
}

function openInboxPanel() {
  open.value = false;
  emit('open-inbox-panel');
}

function openDelegationPanel() {
  open.value = false;
  emit('open-delegation-panel');
}

function openGitPanel() {
  open.value = false;
  emit('open-git-panel');
}

function openSopPanel() {
  open.value = false;
  emit('open-sop-panel');
}

function openSurfaceFeedbackPanel() {
  open.value = false;
  emit('open-surface-feedback-panel');
}

function openMailboxPanel() {
  open.value = false;
  emit('open-mailbox-panel');
}

function openSchedulerPanel() {
  open.value = false;
  emit('open-scheduler-panel');
}

function openTaskLifecyclePanel() {
  open.value = false;
  emit('open-task-lifecycle-panel');
}
</script>

<template>
  <span class="site-title-shell">
    <button type="button" class="site-title-trigger" :aria-expanded="open" aria-controls="site-info-panel" @click="open = true">{{ siteLabel }}</button>
    <Teleport to="body">
      <Transition name="mcp-drawer">
        <div v-if="open" class="mcp-drawer-layer" role="presentation">
          <button type="button" class="mcp-drawer-backdrop" aria-label="Close Site panel" @click="open = false"></button>
          <aside id="site-info-panel" class="mcp-panel site-info-panel" aria-label="Narada Site information">
            <header class="mcp-panel-header">
              <div>
                <h2>Narada Site</h2>
                <p>{{ siteId }}<template v-if="agentLabel"> · {{ agentLabel }}</template></p>
              </div>
              <button type="button" class="mcp-panel-close" aria-label="Close Site panel" @click="open = false">Close</button>
            </header>
            <dl class="site-info-list">
              <div>
                <dt>Site root</dt>
                <dd>{{ siteRoot }}</dd>
              </div>
              <div>
                <dt>Runtime</dt>
                <dd>{{ runtime }}</dd>
              </div>
              <div>
                <dt>Allowed roots</dt>
                <dd>{{ allowedRoots.length ? allowedRoots.join(', ') : 'not advertised' }}</dd>
              </div>
              <div>
                <dt>Health transport</dt>
                <dd>{{ healthTransport }}</dd>
              </div>
              <div>
                <dt>Events</dt>
                <dd>{{ eventEndpoint ?? 'not configured' }}</dd>
              </div>
              <div>
                <dt>Health</dt>
                <dd>{{ healthEndpoint ?? 'not configured' }}</dd>
              </div>
              <div>
                <dt>Input</dt>
                <dd>{{ inputEndpoint ?? 'not configured' }}</dd>
              </div>
              <div>
                <dt>Artifacts</dt>
                <dd>{{ artifactTransport ?? 'not configured' }}<template v-if="artifactBasePath"> · {{ artifactBasePath }}</template></dd>
              </div>
              <div v-if="hasArtifacts">
                <dt>Artifact Index</dt>
                <dd><button type="button" class="site-info-inline-action" @click="openArtifactsPanel">Open panel</button></dd>
              </div>
              <div>
                <dt>Authority</dt>
                <dd>{{ authorityState }} · writes {{ writeAdmission }}</dd>
              </div>
              <div>
                <dt>Tool Surfaces (MCP)</dt>
                <dd><button type="button" class="site-info-inline-action" @click="openMcpPanel">Open panel</button></dd>
              </div>
              <div v-if="hasDelegationMcp">
                <dt>Delegation</dt>
                <dd><button type="button" class="site-info-inline-action" @click="openDelegationPanel">Open panel</button></dd>
              </div>
              <div v-if="hasGitMcp">
                <dt>Git</dt>
                <dd><button type="button" class="site-info-inline-action" @click="openGitPanel">Open panel</button></dd>
              </div>
              <div v-if="hasInboxMcp">
                <dt>Inbox</dt>
                <dd><button type="button" class="site-info-inline-action" @click="openInboxPanel">Open panel</button></dd>
              </div>
              <div v-if="hasSopMcp">
                <dt>SOP</dt>
                <dd><button type="button" class="site-info-inline-action" @click="openSopPanel">Open panel</button></dd>
              </div>
              <div v-if="hasSurfaceFeedbackMcp">
                <dt>Feedback</dt>
                <dd><button type="button" class="site-info-inline-action" @click="openSurfaceFeedbackPanel">Open panel</button></dd>
              </div>
              <div v-if="hasMailboxMcp">
                <dt>Synced Email</dt>
                <dd><button type="button" class="site-info-inline-action" @click="openMailboxPanel">Open panel</button></dd>
              </div>
              <div v-if="hasSchedulerMcp">
                <dt>Scheduler</dt>
                <dd><button type="button" class="site-info-inline-action" @click="openSchedulerPanel">Open panel</button></dd>
              </div>
              <div v-if="hasTaskLifecycleMcp">
                <dt>Tasks</dt>
                <dd><button type="button" class="site-info-inline-action" @click="openTaskLifecyclePanel">Open panel</button></dd>
              </div>
              <div>
                <dt>Observed endpoint hosts</dt>
                <dd>{{ observedHosts.length ? observedHosts.join(', ') : 'none advertised' }}</dd>
              </div>
            </dl>
          </aside>
        </div>
      </Transition>
    </Teleport>
  </span>
</template>
