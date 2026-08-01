<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type {
  HostFleetEnrollmentIntent,
  HostFleetLaunchIntent,
  HostFleetLifecycleOperation,
} from '@narada-core/host-fleet/contract';
import OperatorConsoleShell from '../components/OperatorConsoleShell.vue';
import { useHostFleet } from '../host-fleet/composables/useHostFleet';
import {
  hostFleetCredentialRotationDraftFingerprint,
  createHostFleetCredentialRollbackIntent,
  createHostFleetEnrollmentIntent,
  hostFleetEnrollmentDraftFingerprint,
  type HostFleetEnrollmentDraft,
  type HostFleetCredentialRotationDraft,
  type HostFleetCredentialRollbackDraft,
} from '../host-fleet/workflows';

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
const selectedHostRecord = computed(() => fleet.hosts.value.find((host) => hostKey(host) === fleet.selectedHostKey.value) ?? null);
const localAuthority = computed(() => fleet.mutationScope.value === 'local-authority');
const authorityAvailable = computed(() => fleet.mutationScope.value !== 'projection-only');
const lifecycleReason = ref('');
const lifecyclePlan = ref<ReturnType<typeof fleet.createLifecycleIntent> | null>(null);
const lifecycleConfirmed = ref(false);
const lifecyclePlanError = ref<string | null>(null);
const launchPlan = ref<HostFleetLaunchIntent | null>(null);
const launchPlanError = ref<string | null>(null);
const launchConfirmed = ref(false);
const launchDraft = reactive({
  siteId: '',
  agentId: 'resident',
  operatorSurface: 'agent-web-ui',
});
const enrollmentPlan = ref<HostFleetEnrollmentIntent | null>(null);
const enrollmentConfirmed = ref(false);
const enrollmentError = ref<string | null>(null);
const enrollmentPlanFingerprint = ref<string | null>(null);
const enrollmentDraft = reactive<HostFleetEnrollmentDraft>({
  hostId: '',
  hostInstanceId: '',
  displayName: '',
  platform: 'linux',
  naradaVersion: '',
  endpoint: 'http://127.0.0.1:64930',
  transport: 'ssh-tunnel',
  admittedPaths: '/health\n/sessions\n/target\n/events',
  credentialRef: 'env://NARADA_HOST_GATEWAY_TOKEN',
  capabilities: 'sessions\nevents',
  admittedSites: '',
  allowReenrollment: false,
});
const credentialRotationPlan = ref<ReturnType<typeof fleet.createCredentialRotationIntent> | null>(null);
const credentialRotationConfirmed = ref(false);
const credentialRotationError = ref<string | null>(null);
const credentialRotationPlanFingerprint = ref<string | null>(null);
const credentialRotationDraft = reactive<HostFleetCredentialRotationDraft>({
  credentialRef: 'env://NARADA_HOST_GATEWAY_TOKEN',
  credentialClass: 'dedicated_host_gateway',
  notBefore: '',
  expiresAt: '',
});
const credentialRollbackPlan = ref<ReturnType<typeof fleet.createCredentialRollbackIntent> | null>(null);
const credentialRollbackConfirmed = ref(false);
const credentialRollbackError = ref<string | null>(null);
const credentialRollbackDraft = reactive<HostFleetCredentialRollbackDraft>({ rollbackToRevision: '' });

const enrollmentExpectedRevision = computed(() => {
  const host = fleet.hosts.value.find((candidate) => hostKey(candidate) === `${enrollmentDraft.hostId.trim()}@${enrollmentDraft.hostInstanceId.trim()}`);
  return host?.revision ?? null;
});

const lifecyclePlanCurrent = computed(() => {
  const plan = lifecyclePlan.value;
  const host = selectedHostRecord.value;
  return Boolean(
    plan
      && host
      && plan.host.host_id === host.hostId
      && plan.host.host_instance_id === host.hostInstanceId
      && plan.expected_revision === host.revision
      && plan.reason === (lifecycleReason.value.trim() || null),
  );
});

const enrollmentPlanCurrent = computed(() => Boolean(
  enrollmentPlan.value
    && enrollmentPlanFingerprint.value === hostFleetEnrollmentDraftFingerprint(enrollmentDraft)
    && enrollmentPlan.value.expected_revision === enrollmentExpectedRevision.value
));
const launchPlanCurrent = computed(() => Boolean(
  launchPlan.value
    && selectedHostRecord.value
    && launchPlan.value.host.host_id === selectedHostRecord.value.hostId
    && launchPlan.value.host.host_instance_id === selectedHostRecord.value.hostInstanceId
    && launchPlan.value.expected_revision === selectedHostRecord.value.revision
    && launchPlan.value.site_id === launchDraft.siteId.trim()
    && launchPlan.value.agent_id === launchDraft.agentId.trim()
    && launchPlan.value.operator_surface === (launchDraft.operatorSurface.trim() || null)
));
const credentialRotationPlanCurrent = computed(() => Boolean(
  credentialRotationPlan.value
    && selectedHostRecord.value
    && credentialRotationPlan.value.host.host_id === selectedHostRecord.value.hostId
    && credentialRotationPlan.value.host.host_instance_id === selectedHostRecord.value.hostInstanceId
    && credentialRotationPlan.value.expected_revision === selectedHostRecord.value.revision
    && credentialRotationPlanFingerprint.value === hostFleetCredentialRotationDraftFingerprint(credentialRotationDraft)
));
const credentialRollbackPlanCurrent = computed(() => Boolean(
  credentialRollbackPlan.value
    && selectedHostRecord.value
    && credentialRollbackPlan.value.host.host_id === selectedHostRecord.value.hostId
    && credentialRollbackPlan.value.host.host_instance_id === selectedHostRecord.value.hostInstanceId
    && credentialRollbackPlan.value.expected_revision === selectedHostRecord.value.revision
    && credentialRollbackPlan.value.rollback_to_revision === Number(credentialRollbackDraft.rollbackToRevision),
));

function mutationSucceeded(status: string | undefined): boolean {
  return status === 'applied' || status === 'launched' || status === 'replayed' || status === 'reused' || status === 'unchanged';
}

function selectHost(hostId: string, hostInstanceId: string): void {
  fleet.selectHost(hostId, hostInstanceId);
  lifecyclePlan.value = null;
  lifecycleConfirmed.value = false;
  lifecyclePlanError.value = null;
  lifecycleReason.value = '';
  fleet.clearLifecyclePreflight();
  fleet.clearLaunchPreflight();
  launchPlan.value = null;
  launchPlanError.value = null;
  launchConfirmed.value = false;
  credentialRotationPlan.value = null;
  credentialRotationConfirmed.value = false;
  credentialRotationError.value = null;
  credentialRotationPlanFingerprint.value = null;
  fleet.clearCredentialRotationPreflight();
  credentialRollbackPlan.value = null;
  credentialRollbackConfirmed.value = false;
  credentialRollbackError.value = null;
  fleet.clearCredentialRollbackPreflight();
  fleet.clearMutationFeedback();
}

async function planLaunch(): Promise<void> {
  const host = selectedHostRecord.value;
  launchPlan.value = null;
  launchPlanError.value = null;
  launchConfirmed.value = false;
  fleet.clearLaunchPreflight();
  if (!host) return;
  try {
    const intent = fleet.createLaunchIntent(host, launchDraft);
    const result = await fleet.preflightLaunch(intent);
    if (result?.status === 'ready') launchPlan.value = intent;
  } catch (cause) {
    launchPlanError.value = cause instanceof Error ? cause.message : 'Launch plan is incomplete.';
  }
}

async function applyLaunchPlan(): Promise<void> {
  if (!launchPlan.value || !launchConfirmed.value) return;
  if (!launchPlanCurrent.value) {
    launchConfirmed.value = false;
    launchPlanError.value = 'The selected host, revision, or launch fields changed. Review the launch plan again.';
    return;
  }
  await fleet.applyLaunchIntent(launchPlan.value);
  launchConfirmed.value = false;
  if (mutationSucceeded(fleet.mutationResult.value?.status)) {
    launchPlan.value = null;
    fleet.clearLaunchPreflight();
  }
}

async function planLifecycle(operation: HostFleetLifecycleOperation): Promise<void> {
  const host = selectedHostRecord.value;
  if (!host || !localAuthority.value) return;
  lifecyclePlan.value = null;
  lifecycleConfirmed.value = false;
  lifecyclePlanError.value = null;
  fleet.clearMutationFeedback();
  const intent = fleet.createLifecycleIntent(host, operation, lifecycleReason.value);
  const result = await fleet.preflightLifecycle(intent);
  if (result?.status === 'ready') {
    lifecyclePlan.value = intent;
    lifecycleConfirmed.value = false;
  } else {
    lifecyclePlan.value = null;
  }
}

async function applyLifecyclePlan(): Promise<void> {
  if (!lifecyclePlan.value || !lifecycleConfirmed.value) return;
  if (!lifecyclePlanCurrent.value) {
    lifecycleConfirmed.value = false;
    lifecyclePlanError.value = 'The selected host, revision, or reason changed. Review the lifecycle plan again.';
    return;
  }
  lifecyclePlanError.value = null;
  await fleet.applyLifecycleIntent(lifecyclePlan.value);
  lifecycleConfirmed.value = false;
  if (mutationSucceeded(fleet.mutationResult.value?.status)) {
    lifecyclePlan.value = null;
    fleet.clearLifecyclePreflight();
  }
}

function planEnrollment(): void {
  enrollmentError.value = null;
  enrollmentPlan.value = null;
  enrollmentPlanFingerprint.value = null;
  enrollmentConfirmed.value = false;
  fleet.clearMutationFeedback();
  try {
    enrollmentPlan.value = createHostFleetEnrollmentIntent(enrollmentDraft, enrollmentExpectedRevision.value);
    enrollmentPlanFingerprint.value = hostFleetEnrollmentDraftFingerprint(enrollmentDraft);
  } catch (cause) {
    enrollmentError.value = cause instanceof Error ? cause.message : 'Enrollment form is incomplete.';
  }
}

async function applyEnrollmentPlan(): Promise<void> {
  if (!enrollmentPlan.value || !enrollmentConfirmed.value) return;
  if (!enrollmentPlanCurrent.value) {
    enrollmentConfirmed.value = false;
    enrollmentError.value = 'The enrollment draft changed. Review the enrollment intent again.';
    return;
  }
  await fleet.applyEnrollment(enrollmentPlan.value);
  enrollmentConfirmed.value = false;
  if (mutationSucceeded(fleet.mutationResult.value?.status)) {
    enrollmentPlan.value = null;
    enrollmentPlanFingerprint.value = null;
  }
}

async function planCredentialRotation(): Promise<void> {
  credentialRotationError.value = null;
  credentialRotationPlan.value = null;
  credentialRotationPlanFingerprint.value = null;
  credentialRotationConfirmed.value = false;
  fleet.clearMutationFeedback();
  const host = selectedHostRecord.value;
  if (!host) return;
  try {
    const intent = fleet.createCredentialRotationIntent(host, credentialRotationDraft);
    const result = await fleet.preflightCredentialRotation(intent);
    if (result?.status === 'ready') {
      credentialRotationPlan.value = intent;
      credentialRotationPlanFingerprint.value = hostFleetCredentialRotationDraftFingerprint(credentialRotationDraft);
    }
  } catch (cause) {
    credentialRotationError.value = cause instanceof Error ? cause.message : 'Credential rotation form is incomplete.';
  }
}

async function applyCredentialRotationPlan(): Promise<void> {
  if (!credentialRotationPlan.value || !credentialRotationConfirmed.value) return;
  if (!credentialRotationPlanCurrent.value) {
    credentialRotationConfirmed.value = false;
    credentialRotationError.value = 'The selected host, revision, or credential policy changed. Review the rotation intent again.';
    return;
  }
  await fleet.applyCredentialRotation(credentialRotationPlan.value);
  credentialRotationConfirmed.value = false;
  if (mutationSucceeded(fleet.mutationResult.value?.status)) {
    credentialRotationPlan.value = null;
    credentialRotationPlanFingerprint.value = null;
    fleet.clearCredentialRotationPreflight();
  }
}

async function planCredentialRollback(): Promise<void> {
  credentialRollbackError.value = null;
  credentialRollbackPlan.value = null;
  credentialRollbackConfirmed.value = false;
  fleet.clearMutationFeedback();
  const host = selectedHostRecord.value;
  if (!host) return;
  try {
    const intent = createHostFleetCredentialRollbackIntent(host, credentialRollbackDraft);
    const result = await fleet.preflightCredentialRollback(intent);
    if (result?.status === 'ready') credentialRollbackPlan.value = intent;
  } catch (cause) {
    credentialRollbackError.value = cause instanceof Error ? cause.message : 'Credential rollback form is incomplete.';
  }
}

async function applyCredentialRollbackPlan(): Promise<void> {
  if (!credentialRollbackPlan.value || !credentialRollbackConfirmed.value) return;
  if (!credentialRollbackPlanCurrent.value) {
    credentialRollbackConfirmed.value = false;
    credentialRollbackError.value = 'The selected host, revision, or rollback target changed. Review the rollback intent again.';
    return;
  }
  await fleet.applyCredentialRollback(credentialRollbackPlan.value);
  credentialRollbackConfirmed.value = false;
  if (mutationSucceeded(fleet.mutationResult.value?.status)) {
    credentialRollbackPlan.value = null;
    fleet.clearCredentialRollbackPreflight();
  }
}

watch(enrollmentDraft, () => {
  if (enrollmentPlan.value) enrollmentConfirmed.value = false;
}, { deep: true });
watch([launchDraft, credentialRotationDraft, credentialRollbackDraft], () => {
  launchConfirmed.value = false;
  credentialRotationConfirmed.value = false;
  credentialRollbackConfirmed.value = false;
}, { deep: true });

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
        <div class="summary"><span>Registry read</span><strong>{{ formatTimestamp(fleet.generatedAt.value) }}</strong></div>
        <button class="refresh" type="button" :disabled="fleet.loading.value || fleet.sessionsLoading.value" @click="fleet.load">Refresh</button>
        <button class="refresh" type="button" :disabled="fleet.sessionsLoading.value || !fleet.sessionsByHost.value.some((host) => host.sessions.some((session) => session.state !== 'closed' && session.healthStatus !== 'revoked'))" @click="fleet.aggregateObserving.value ? fleet.stopAggregateObservation() : fleet.startAggregateObservation()">
          {{ fleet.aggregateObserving.value ? 'Stop fleet observation' : 'Observe all active sessions' }}
        </button>
      </div>

      <p v-if="fleet.error.value" class="notice error" role="alert">{{ fleet.error.value }}</p>
      <p v-if="fleet.sessionsError.value" class="notice error" role="alert">{{ fleet.sessionsError.value }}</p>
      <p v-if="fleet.refusals.value.length" class="notice warning">{{ fleet.refusals.value.join(', ') }}</p>
      <p v-if="fleet.mutationError.value" class="notice error" role="alert">{{ fleet.mutationError.value }}</p>
      <p v-if="fleet.mutationResult.value && fleet.mutationResult.value.status !== 'refused'" class="notice success" role="status" aria-live="polite">
        Host Fleet mutation {{ fleet.mutationResult.value.status }}.
      </p>
      <p v-if="fleet.loading.value" class="empty">Reading the User Site Host Registry...</p>

      <section v-else class="fleet-layout" aria-label="Host fleet" :aria-busy="fleet.sessionsLoading.value">
        <div v-if="fleet.hosts.value.length" class="table-wrap">
          <table>
            <thead><tr><th scope="col">Host</th><th scope="col">Platform</th><th scope="col">Health</th><th scope="col">Sites</th><th scope="col">Last seen</th><th scope="col">Context</th></tr></thead>
            <tbody>
              <tr v-for="host in fleet.hosts.value" :key="hostKey(host)" :class="{ selected: hostKey(host) === fleet.selectedHostKey.value }">
                <th scope="row"><strong>{{ host.displayName }}</strong><code>{{ hostKey(host) }}</code><small>Revision {{ host.revision }}</small></th>
                <td>{{ host.platform }}<small>{{ host.transport }}</small></td>
                <td><span class="status" :data-status="host.healthStatus">{{ host.healthStatus }}</span><small v-if="host.healthDetail">{{ host.healthDetail }}</small><small v-else>{{ formatTimestamp(host.healthObservedAt) }}</small></td>
                <td>{{ host.admittedSites.length ? host.admittedSites.join(', ') : 'None declared' }}<small>{{ host.lifecycleState }}</small></td>
                <td>{{ formatTimestamp(host.lastSeenAt) }}</td>
                <td><button class="link-button" type="button" :aria-pressed="hostKey(host) === fleet.selectedHostKey.value" :aria-label="`Select ${host.displayName} (${hostKey(host)})`" @click="selectHost(host.hostId, host.hostInstanceId)">{{ hostKey(host) === fleet.selectedHostKey.value ? 'Selected' : 'Use host' }}</button><a v-if="fleet.hostConsolePath(host)" class="link-button console-link" :href="fleet.hostConsolePath(host) ?? undefined" target="_blank" rel="noopener">Open host console</a></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="empty">No hosts are enrolled yet. Use the enrollment form below to add the first Host instance.</p>

        <section v-if="authorityAvailable" class="authority-panel" aria-label="Host authority controls">
          <div class="panel-heading">
            <div><span class="eyebrow">{{ localAuthority ? 'Local User Site authority' : 'Cloudflare authority forwarding' }}</span><h3>Host lifecycle and enrollment</h3><small>{{ localAuthority ? 'These controls write the canonical registry.' : 'These controls are authenticated and forwarded to the canonical User Site authority.' }}</small></div>
            <span class="status" data-status="online">{{ fleet.mutationScope.value }}</span>
          </div>

          <div v-if="selectedHostRecord" class="workflow-block">
            <div class="workflow-heading"><div><strong>Selected host lifecycle</strong><small>{{ hostKey(selectedHostRecord) }} · revision {{ selectedHostRecord.revision }} · {{ selectedHostRecord.lifecycleState }}</small></div></div>
            <div class="inline-form">
              <label class="field"><span>Reason</span><input v-model="lifecycleReason" type="text" maxlength="256" placeholder="planned maintenance or security response" /></label>
              <div class="workflow-actions">
                <button class="action" type="button" :disabled="fleet.mutationBusy.value || fleet.preflightBusy.value || selectedHostRecord.lifecycleState === 'revoked' || selectedHostRecord.lifecycleState === 'retired'" @click="planLifecycle('revoke')">Plan revoke</button>
                <button class="action" type="button" :disabled="fleet.mutationBusy.value || fleet.preflightBusy.value || selectedHostRecord.lifecycleState === 'revoked' || selectedHostRecord.lifecycleState === 'retired'" @click="planLifecycle('retire')">Plan retire</button>
              </div>
            </div>
            <p v-if="fleet.preflightError.value" class="notice error" role="alert">{{ fleet.preflightError.value }}</p>
            <p v-if="lifecyclePlanError" class="notice error" role="alert">{{ lifecyclePlanError }}</p>
            <p v-if="fleet.lifecyclePreflight.value" class="notice workflow-check" :class="{ error: fleet.lifecyclePreflight.value.status === 'refused' }" role="status">
              Authority preflight: {{ fleet.lifecyclePreflight.value.status }}<span v-if="fleet.lifecyclePreflight.value.currentRevision !== null"> · current revision {{ fleet.lifecyclePreflight.value.currentRevision }}</span><span v-if="fleet.lifecyclePreflight.value.currentLifecycleState"> · {{ fleet.lifecyclePreflight.value.currentLifecycleState }}</span>
            </p>
            <p v-if="lifecyclePlan && !lifecyclePlanCurrent" class="notice warning" role="alert">The host or reason changed after planning. Review the lifecycle plan again before applying it.</p>
            <div v-if="lifecyclePlan" class="plan-card" :data-stale="!lifecyclePlanCurrent">
              <div><span class="status" data-status="success">preflight ready</span><strong>{{ lifecyclePlan.operation }} {{ lifecyclePlan.host.host_id }}@{{ lifecyclePlan.host.host_instance_id }}</strong><small>Revision {{ lifecyclePlan.expected_revision }} · request {{ lifecyclePlan.request_id }}</small></div>
              <label class="confirm-label"><input v-model="lifecycleConfirmed" type="checkbox" :disabled="fleet.mutationBusy.value || !lifecyclePlanCurrent" /> <span>I reviewed this revision-checked plan and want to apply it.</span></label>
              <button class="action danger-action" type="button" :disabled="!lifecycleConfirmed || fleet.mutationBusy.value || !lifecyclePlanCurrent" @click="applyLifecyclePlan">Apply {{ lifecyclePlan.operation }}</button>
            </div>
          </div>
          <p v-else class="empty inline-empty">Select a registered host to plan lifecycle changes.</p>

          <details class="workflow-details">
            <summary>Enroll or re-enroll a host</summary>
            <p class="workflow-help">Only a credential reference is accepted. The browser never receives or stores the gateway secret itself.</p>
            <form class="enrollment-form" @submit.prevent="planEnrollment">
              <div class="field-grid">
                <label class="field"><span>Host ID</span><input v-model="enrollmentDraft.hostId" required autocomplete="off" placeholder="zima-board-2" /></label>
                <label class="field"><span>Host instance ID</span><input v-model="enrollmentDraft.hostInstanceId" required autocomplete="off" placeholder="zima-instance-2026-07" /></label>
                <label class="field"><span>Display name</span><input v-model="enrollmentDraft.displayName" required autocomplete="off" placeholder="ZimaBoard 2" /></label>
                <label class="field"><span>Narada version</span><input v-model="enrollmentDraft.naradaVersion" autocomplete="off" placeholder="0.1.0" /></label>
                <label class="field"><span>Platform</span><select v-model="enrollmentDraft.platform"><option value="windows">Windows</option><option value="linux">Linux</option><option value="macos">macOS</option><option value="cloudflare">Cloudflare</option><option value="unknown">Unknown</option></select></label>
                <label class="field"><span>Gateway transport</span><select v-model="enrollmentDraft.transport"><option value="ssh-tunnel">SSH tunnel</option><option value="loopback">Loopback</option><option value="https">HTTPS</option><option value="cloudflare">Cloudflare</option></select></label>
                <label class="field field-wide"><span>Gateway endpoint</span><input v-model="enrollmentDraft.endpoint" required type="url" autocomplete="off" placeholder="http://127.0.0.1:64930" /></label>
                <label class="field field-wide"><span>Credential reference</span><input v-model="enrollmentDraft.credentialRef" required autocomplete="off" placeholder="env://NARADA_HOST_GATEWAY_TOKEN" /></label>
                <label class="field field-wide"><span>Admitted paths</span><textarea v-model="enrollmentDraft.admittedPaths" rows="3" placeholder="one path per line" /></label>
                <label class="field"><span>Capabilities</span><textarea v-model="enrollmentDraft.capabilities" rows="3" placeholder="sessions&#10;events" /></label>
                <label class="field"><span>Admitted Sites</span><textarea v-model="enrollmentDraft.admittedSites" rows="3" placeholder="sonar" /></label>
              </div>
              <label class="confirm-label"><input v-model="enrollmentDraft.allowReenrollment" type="checkbox" /> <span>Allow explicit re-enrollment if this Host ID has another active instance.</span></label>
              <div class="workflow-actions"><button class="action" type="submit">Review enrollment</button></div>
            </form>
            <p v-if="enrollmentError" class="notice error" role="alert">{{ enrollmentError }}</p>
            <p v-if="enrollmentPlan && !enrollmentPlanCurrent" class="notice warning" role="alert">The enrollment draft changed after review. Review the intent again before applying it.</p>
            <div v-if="enrollmentPlan" class="plan-card" :data-stale="!enrollmentPlanCurrent">
              <div><span class="status" data-status="success">intent ready</span><strong>{{ enrollmentPlan.host.display_name }} · {{ enrollmentPlan.host.host_id }}@{{ enrollmentPlan.host.host_instance_id }}</strong><small>Expected revision {{ enrollmentPlan.expected_revision ?? 'new host' }} · request {{ enrollmentPlan.request_id }}</small></div>
              <dl class="plan-details"><div><dt>Endpoint</dt><dd>{{ enrollmentPlan.host.gateway.endpoint }}</dd></div><div><dt>Transport</dt><dd>{{ enrollmentPlan.host.gateway.transport }}</dd></div><div><dt>Credential ref</dt><dd>{{ enrollmentPlan.host.credential_ref }}</dd></div><div><dt>Sites</dt><dd>{{ enrollmentPlan.host.admitted_sites?.join(', ') || 'None declared' }}</dd></div></dl>
              <label class="confirm-label"><input v-model="enrollmentConfirmed" type="checkbox" :disabled="fleet.mutationBusy.value || !enrollmentPlanCurrent" /> <span>I reviewed this enrollment intent and want the User Site authority to apply it.</span></label>
              <button class="action" type="button" :disabled="!enrollmentConfirmed || fleet.mutationBusy.value || !enrollmentPlanCurrent" @click="applyEnrollmentPlan">Apply enrollment</button>
            </div>
          </details>
          <details class="workflow-details">
            <summary>Rotate Host Gateway credential policy</summary>
            <p class="workflow-help">Only the credential reference and validity policy are stored here. The secret remains in the host-side secret store.</p>
            <form class="enrollment-form" @submit.prevent="planCredentialRotation">
              <div class="field-grid">
                <label class="field field-wide"><span>Credential reference</span><input v-model="credentialRotationDraft.credentialRef" required autocomplete="off" placeholder="env://NARADA_HOST_GATEWAY_TOKEN" /></label>
                <label class="field"><span>Credential class</span><select v-model="credentialRotationDraft.credentialClass"><option value="dedicated_host_gateway">Dedicated Host Gateway</option><option value="bridge_compatibility">Bridge compatibility</option></select></label>
                <label class="field"><span>Not before</span><input v-model="credentialRotationDraft.notBefore" type="datetime-local" /></label>
                <label class="field"><span>Expires at</span><input v-model="credentialRotationDraft.expiresAt" type="datetime-local" /></label>
              </div>
              <div class="workflow-actions"><button class="action" type="submit" :disabled="!selectedHostRecord || fleet.preflightBusy.value">Review credential rotation</button></div>
            </form>
            <p v-if="credentialRotationError || fleet.credentialRotationPreflightError.value" class="notice error" role="alert">{{ credentialRotationError ?? fleet.credentialRotationPreflightError.value }}</p>
            <p v-if="fleet.credentialRotationPreflight.value" class="notice workflow-check" :class="{ error: fleet.credentialRotationPreflight.value.status === 'refused' }" role="status">Credential authority preflight: {{ fleet.credentialRotationPreflight.value.status }}<span v-if="fleet.credentialRotationPreflight.value.currentRevision !== null"> · current revision {{ fleet.credentialRotationPreflight.value.currentRevision }}</span><span v-if="fleet.credentialRotationPreflight.value.refusals.length"> · {{ fleet.credentialRotationPreflight.value.refusals.join(', ') }}</span></p>
            <p v-if="credentialRotationPlan && !credentialRotationPlanCurrent" class="notice warning" role="alert">The host, revision, or credential policy changed after review. Review the rotation intent again.</p>
            <div v-if="credentialRotationPlan" class="plan-card" :data-stale="!credentialRotationPlanCurrent">
              <div><span class="status" data-status="success">intent ready</span><strong>{{ credentialRotationPlan.host.host_id }}@{{ credentialRotationPlan.host.host_instance_id }}</strong><small>Revision {{ credentialRotationPlan.expected_revision }} · {{ credentialRotationPlan.credential.class }} · request {{ credentialRotationPlan.request_id }}</small></div>
              <dl class="plan-details"><div><dt>Credential ref</dt><dd>{{ credentialRotationPlan.credential_ref }}</dd></div><div><dt>Validity</dt><dd>{{ credentialRotationPlan.credential.not_before ?? 'immediate' }} → {{ credentialRotationPlan.credential.expires_at ?? 'no expiry' }}</dd></div></dl>
              <label class="confirm-label"><input v-model="credentialRotationConfirmed" type="checkbox" :disabled="fleet.mutationBusy.value || !credentialRotationPlanCurrent" /> <span>I reviewed this revision-checked credential policy and want to apply it.</span></label>
              <button class="action" type="button" :disabled="!credentialRotationConfirmed || fleet.mutationBusy.value || !credentialRotationPlanCurrent" @click="applyCredentialRotationPlan">Apply credential rotation</button>
            </div>
          </details>
          <details class="workflow-details">
            <summary>Rollback Host Gateway credential policy</summary>
            <p class="workflow-help">Rollback restores a previously recorded credential policy by revision. The authority never returns the secret value to the browser.</p>
            <form class="enrollment-form" @submit.prevent="planCredentialRollback">
              <div class="field-grid">
                <label class="field"><span>Restore revision</span><input v-model="credentialRollbackDraft.rollbackToRevision" required type="number" min="1" step="1" placeholder="1" /></label>
              </div>
              <div class="workflow-actions"><button class="action" type="submit" :disabled="!selectedHostRecord || !authorityAvailable || fleet.preflightBusy.value">Review credential rollback</button></div>
            </form>
            <p v-if="credentialRollbackError || fleet.credentialRollbackPreflightError.value" class="notice error" role="alert">{{ credentialRollbackError ?? fleet.credentialRollbackPreflightError.value }}</p>
            <p v-if="fleet.credentialRollbackPreflight.value" class="notice workflow-check" :class="{ error: fleet.credentialRollbackPreflight.value.status === 'refused' }" role="status">Credential rollback authority preflight: {{ fleet.credentialRollbackPreflight.value.status }}<span v-if="fleet.credentialRollbackPreflight.value.currentRevision !== null"> · current revision {{ fleet.credentialRollbackPreflight.value.currentRevision }}</span><span v-if="fleet.credentialRollbackPreflight.value.availableRevisions.length"> · available revisions {{ fleet.credentialRollbackPreflight.value.availableRevisions.join(', ') }}</span><span v-if="fleet.credentialRollbackPreflight.value.refusals.length"> · {{ fleet.credentialRollbackPreflight.value.refusals.join(', ') }}</span></p>
            <p v-if="credentialRollbackPlan && !credentialRollbackPlanCurrent" class="notice warning" role="alert">The host, revision, or rollback target changed after review. Review the rollback intent again.</p>
            <div v-if="credentialRollbackPlan" class="plan-card" :data-stale="!credentialRollbackPlanCurrent">
              <div><span class="status" data-status="success">intent ready</span><strong>{{ credentialRollbackPlan.host.host_id }}@{{ credentialRollbackPlan.host.host_instance_id }}</strong><small>Revision {{ credentialRollbackPlan.expected_revision }} · restore {{ credentialRollbackPlan.rollback_to_revision }} · request {{ credentialRollbackPlan.request_id }}</small></div>
              <label class="confirm-label"><input v-model="credentialRollbackConfirmed" type="checkbox" :disabled="fleet.mutationBusy.value || !credentialRollbackPlanCurrent" /> <span>I reviewed this revision-checked rollback and want to restore the selected policy.</span></label>
              <button class="action danger-action" type="button" :disabled="!credentialRollbackConfirmed || fleet.mutationBusy.value || !credentialRollbackPlanCurrent" @click="applyCredentialRollbackPlan">Apply credential rollback</button>
            </div>
          </details>
        </section>
        <section v-else class="authority-panel projection-notice" aria-label="Projection scope notice">
          <div class="panel-heading"><div><span class="eyebrow">Cloudflare projection</span><h3>Read-only Host Fleet view</h3><small>Host enrollment and lifecycle mutations belong to the local User Site authority.</small></div><span class="status" data-status="connected">projection-only</span></div>
          <p>Use the User Site authority console for enrollment, re-enrollment, revoke, or retire. This projection can inspect hosts, sessions, health, and events only.</p>
        </section>

        <section v-if="selectedHostRecord" class="workflow-panel launch-planning" aria-label="Exact host launch planning">
          <div class="panel-heading">
            <div><span class="eyebrow">Exact HostKey launch</span><h3>Launch a runtime on this host</h3><small>The authority rechecks the HostKey revision and Site admission immediately before forwarding the launch to the selected Host Gateway.</small></div>
            <span class="status" data-status="connected">{{ authorityAvailable ? 'preflight + execute' : 'preflight only' }}</span>
          </div>
          <form class="inline-form" @submit.prevent="planLaunch">
            <label class="field"><span>Site ID</span><input v-model="launchDraft.siteId" required autocomplete="off" :placeholder="selectedHostRecord.admittedSites[0] ?? 'sonar'" /></label>
            <label class="field"><span>Agent ID</span><input v-model="launchDraft.agentId" required autocomplete="off" placeholder="resident" /></label>
            <label class="field"><span>Operator surface</span><input v-model="launchDraft.operatorSurface" autocomplete="off" placeholder="agent-web-ui" /></label>
            <div class="workflow-actions"><button class="action" type="submit" :disabled="fleet.preflightBusy.value || selectedHostRecord.lifecycleState === 'revoked' || selectedHostRecord.lifecycleState === 'retired'">Plan exact launch</button></div>
          </form>
          <p v-if="launchPlanError || fleet.launchPreflightError.value" class="notice error" role="alert">{{ launchPlanError ?? fleet.launchPreflightError.value }}</p>
          <p v-if="fleet.launchPreflight.value" class="notice workflow-check" :class="{ error: fleet.launchPreflight.value.status === 'refused' }" role="status">
            Launch authority preflight: {{ fleet.launchPreflight.value.status }}<span v-if="fleet.launchPreflight.value.currentRevision !== null"> · current revision {{ fleet.launchPreflight.value.currentRevision }}</span><span v-if="fleet.launchPreflight.value.currentLifecycleState"> · {{ fleet.launchPreflight.value.currentLifecycleState }}</span><span v-if="fleet.launchPreflight.value.refusals.length"> · {{ fleet.launchPreflight.value.refusals.join(', ') }}</span>
          </p>
          <div v-if="launchPlan" class="plan-card" :data-stale="!launchPlanCurrent">
            <div><span class="status" data-status="success">preflight ready</span><strong>{{ launchPlan.site_id }} / {{ launchPlan.agent_id }} on {{ launchPlan.host.host_id }}@{{ launchPlan.host.host_instance_id }}</strong><small>Surface {{ launchPlan.operator_surface ?? 'registry default' }} · revision {{ launchPlan.expected_revision }} · request {{ launchPlan.request_id }}</small></div>
            <p v-if="!launchPlanCurrent" class="notice warning">The host, revision, or launch fields changed after planning. Review the launch plan again.</p>
            <template v-if="authorityAvailable">
              <label class="confirm-label"><input v-model="launchConfirmed" type="checkbox" :disabled="fleet.mutationBusy.value || !launchPlanCurrent" /> <span>I reviewed this exact-host launch and want the authority to forward it.</span></label>
              <button class="action" type="button" :disabled="!launchConfirmed || fleet.mutationBusy.value || !launchPlanCurrent" @click="applyLaunchPlan">Launch on exact HostKey</button>
            </template>
            <p v-else class="workflow-help">This projection can preflight the launch but has no configured authority-forwarding route.</p>
          </div>
        </section>

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
.console-link { display: inline-block; margin-top: 6px; text-decoration: none; }
.refresh { align-self: center; margin-left: auto; }
.refresh:hover:not(:disabled), .action:hover:not(:disabled), .link-button:hover:not(:disabled) { border-color: var(--operator); background: var(--surface-muted); }
button:focus-visible, .workflow-details summary:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
button:disabled { cursor: not-allowed; opacity: .6; }
.notice, .empty { margin: 12px 0; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--radius); font-size: 13px; line-height: 1.4; }
.notice.error { color: var(--danger); }
.notice.success { color: var(--operator); background: var(--activity-chip-bg); }
.notice.warning, .empty { color: var(--muted); background: var(--surface-muted); }
.authority-panel { overflow: hidden; border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--surface); }
.workflow-panel { overflow: hidden; border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--surface); }
.projection-notice { border-color: var(--line); }
.projection-notice > p { margin: 0; padding: 12px 16px 15px; color: var(--muted); font-size: 13px; line-height: 1.45; }
.workflow-block, .workflow-details { padding: 14px 16px; border-bottom: 1px solid var(--line); }
.workflow-details { border-bottom: 0; }
.workflow-details summary { cursor: pointer; font-size: 13px; font-weight: 650; }
.workflow-heading { margin-bottom: 10px; }
.workflow-heading strong { display: block; font-size: 13px; }
.inline-form { display: flex; align-items: end; gap: 12px; flex-wrap: wrap; }
.field { display: grid; gap: 5px; min-width: 180px; flex: 1; color: var(--muted); font-size: 11px; }
.field input, .field select, .field textarea { width: 100%; min-height: 35px; border: 1px solid var(--line-strong); border-radius: calc(var(--radius) - 2px); padding: 7px 9px; background: var(--control-bg); color: var(--text); font: inherit; font-size: 12px; }
.field textarea { min-height: 68px; resize: vertical; }
.field input:focus-visible, .field select:focus-visible, .field textarea:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
.workflow-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.danger-action { color: var(--danger); }
.plan-card { display: grid; gap: 10px; margin-top: 12px; padding: 12px; border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--surface-muted); }
.plan-card > div:first-child { display: grid; gap: 5px; }
.plan-card > div:first-child strong { font-size: 13px; }
.plan-card .status { width: fit-content; }
.confirm-label { display: flex; align-items: flex-start; gap: 8px; color: var(--text); font-size: 12px; line-height: 1.4; }
.confirm-label input { flex: 0 0 auto; margin-top: 2px; }
.workflow-help { margin: 9px 0 14px; color: var(--muted); font-size: 12px; line-height: 1.45; }
.enrollment-form { display: grid; gap: 12px; margin-top: 14px; }
.field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 12px; }
.field-wide { grid-column: 1 / -1; }
.plan-details { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 14px; margin: 0; }
.plan-details div { min-width: 0; }
.plan-details dt { color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
.plan-details dd { margin: 3px 0 0; font: 11px/1.4 var(--mono); overflow-wrap: anywhere; }
.inline-empty { margin: 0; border: 0; border-radius: 0; }
.fleet-layout { display: grid; gap: 16px; }
.table-wrap { overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.session-panel, .attachment-panel { overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
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
@media (max-width: 760px) { .console-main { padding: 18px 12px 28px; } .refresh { margin-left: 0; } .panel-heading, .session-row, .composer { align-items: stretch; flex-direction: column; } .panel-actions { justify-content: space-between; } .action { align-self: flex-start; } .field-grid, .plan-details { grid-template-columns: 1fr; } .field-wide { grid-column: auto; } }
</style>
