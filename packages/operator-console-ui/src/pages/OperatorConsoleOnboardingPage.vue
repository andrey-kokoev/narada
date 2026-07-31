<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { ArrowRight, Check, CheckCircle2, Copy, ExternalLink, LoaderCircle, Plus, RefreshCw, Sparkles, TriangleAlert } from 'lucide-vue-next';
import {
  OPERATOR_CONSOLE_REGISTRY_ADD_PATH,
  OPERATOR_CONSOLE_SESSIONS_PATH,
  type OperatorConsoleOnboardingProjection,
  type OperatorConsoleOnboardingSetupAction,
  type OperatorConsoleOnboardingUiState,
} from '@narada2/operator-console-contract';
import OperatorConsoleShell from '../components/OperatorConsoleShell.vue';
import { useOperatorWorkspaceRouteDirectory } from '../console/route-directory';

const projection = ref<OperatorConsoleOnboardingProjection | null>(null);
const loading = ref(false);
const action = ref<'live' | 'demo' | null>(null);
const error = ref<string | null>(null);
const copiedAction = ref<string | null>(null);
const routeDirectory = useOperatorWorkspaceRouteDirectory();
let polling = false;
let pollTimer: number | null = null;

const uiState = computed<OperatorConsoleOnboardingUiState>(() => projection.value?.ui_state ?? (loading.value ? 'checking' : 'failed'));
const onboarding = computed(() => projection.value?.onboarding ?? null);
const doctor = computed(() => projection.value?.doctor ?? null);
const stateLabels: Record<OperatorConsoleOnboardingUiState, string> = {
  checking: 'Checking this installation',
  ready: 'Ready to start',
  starting: 'Starting your assistant',
  'runtime-ready': 'Runtime is ready',
  healthy: 'Assistant is ready',
  'needs-intelligence-setup': 'Intelligence setup needed',
  blocked: 'Action needed',
  failed: 'Could not check installation',
};
const stateDescriptions: Record<OperatorConsoleOnboardingUiState, string> = {
  checking: 'Reading the User Site and provider readiness from the local Narada CLI.',
  ready: 'Narada is ready to start one resident General assistant in your personal User Site.',
  starting: 'The resident is starting. This page will keep checking until its runtime is available.',
  'runtime-ready': 'The runtime is healthy. Send one request in the Agent Web UI to complete first-use verification.',
  healthy: 'Your resident assistant is running. Continue in the Agent Web UI.',
  'needs-intelligence-setup': 'Complete the User Site intelligence setup, or use the credential-free demo to explore Narada first.',
  blocked: 'The installation needs attention before the resident can start.',
  failed: 'The local onboarding status endpoint did not return a usable result.',
};
const stateLabel = computed(() => stateLabels[uiState.value]);
const stateDescription = computed(() => stateDescriptions[uiState.value]);

const setupActions = computed(() => projection.value?.setup_actions ?? []);
const handoff = computed(() => projection.value?.handoff ?? null);
const canAddSite = computed(() => {
  const directory = routeDirectory?.directory.value;
  if (!directory || routeDirectory?.error.value) return false;
  return directory.surfaces.some((surface) => surface.projectedRoutes.some((route) =>
    route.path === OPERATOR_CONSOLE_REGISTRY_ADD_PATH && route.availability === 'available'));
});

function recordField(record: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  const value = record?.[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringField(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

const userSite = computed(() => recordField(onboarding.value, 'user_site'));
const userSiteRoot = computed(() => stringField(userSite.value, 'root') ?? 'unknown');
const residentAgent = computed(() => stringField(userSite.value, 'resident_agent') ?? 'not configured');
const nextAction = computed(() => projection.value?.next_action
  ?? stringField(onboarding.value, 'next_action')
  ?? 'Refresh the status to continue.');

function setupActionKey(item: OperatorConsoleOnboardingSetupAction): string {
  return item.id;
}

async function readProjection(options: { showLoading?: boolean } = {}): Promise<boolean> {
  if (options.showLoading !== false) loading.value = true;
  error.value = null;
  try {
    const response = await fetch('/console/onboarding/api/status', { headers: { Accept: 'application/json' } });
    const body = await response.json() as OperatorConsoleOnboardingProjection;
    if (!response.ok || body.status === 'failed') throw new Error(body.error || `Status request failed (${response.status})`);
    projection.value = body;
    return true;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
    if (options.showLoading !== false) projection.value = null;
    return false;
  } finally {
    if (options.showLoading !== false) loading.value = false;
  }
}

function stopPolling(): void {
  if (pollTimer !== null) window.clearTimeout(pollTimer);
  pollTimer = null;
  polling = false;
}

async function waitForRuntime(): Promise<void> {
  if (polling) return;
  polling = true;
  const deadline = Date.now() + 60_000;
  try {
    while (Date.now() < deadline) {
      await new Promise<void>((resolve) => {
        pollTimer = window.setTimeout(resolve, 1000);
      });
      pollTimer = null;
      if (!await readProjection({ showLoading: false })) continue;
      if (uiState.value !== 'starting' && handoff.value?.status !== 'pending') return;
    }
    error.value = 'The resident is still starting. Refresh this page to check again.';
  } finally {
    stopPolling();
  }
}

async function start(mode: 'live' | 'demo'): Promise<void> {
  action.value = mode;
  error.value = null;
  try {
    const response = await fetch('/console/onboarding/api/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ mode, confirm: true }),
    });
    const body = await response.json() as OperatorConsoleOnboardingProjection;
    projection.value = body;
    if (!response.ok || body.status === 'failed') throw new Error(body.error || `Start request failed (${response.status})`);
    if (mode === 'live' && (body.ui_state === 'starting' || body.handoff?.status === 'pending')) await waitForRuntime();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    action.value = null;
  }
}

async function copyCommand(item: OperatorConsoleOnboardingSetupAction): Promise<void> {
  if (!item.command) return;
  try {
    await navigator.clipboard.writeText(item.command);
    copiedAction.value = item.id;
    window.setTimeout(() => {
      if (copiedAction.value === item.id) copiedAction.value = null;
    }, 1600);
  } catch {
    error.value = 'The command could not be copied. Select it manually.';
  }
}

onMounted(() => {
  void (async () => {
    await readProjection();
    if (uiState.value === 'starting' || handoff.value?.status === 'pending') await waitForRuntime();
  })();
  void routeDirectory?.load();
});
onUnmounted(stopPolling);
</script>

<template>
  <OperatorConsoleShell
    eyebrow="First use"
    title="Start Narada"
    back-href="/"
    back-label="Back to Operator Workspace"
    navigation-key="onboarding"
  >
    <main class="onboarding-page">
      <header class="page-header">
        <p class="eyebrow">Personal User Site</p>
        <h2>Start with one assistant</h2>
        <p class="subtitle">
          Narada starts with one resident General assistant in your personal workspace. You can add project Sites and specialist roles later.
        </p>
      </header>

      <section class="status-panel" :data-state="uiState" aria-live="polite">
        <div class="status-icon" aria-hidden="true">
          <LoaderCircle v-if="uiState === 'checking' || uiState === 'starting'" :size="20" class="spin" />
          <CheckCircle2 v-else-if="uiState === 'healthy' || uiState === 'runtime-ready' || uiState === 'ready'" :size="20" />
          <TriangleAlert v-else :size="20" />
        </div>
        <div>
          <strong>{{ stateLabel }}</strong>
          <p>{{ stateDescription }}</p>
        </div>
        <button class="icon-button" type="button" title="Refresh status" aria-label="Refresh status" :disabled="loading || action !== null" @click="() => { void readProjection(); }">
          <RefreshCw :size="16" aria-hidden="true" />
        </button>
      </section>

      <p v-if="error" class="notice error" role="alert">{{ error }}</p>

      <section v-if="uiState === 'needs-intelligence-setup'" class="setup-panel" aria-labelledby="provider-title">
        <p class="eyebrow">Intelligence provider</p>
        <h3 id="provider-title">Complete intelligence setup</h3>
        <p>Provider credentials stay in the User Site secret store. This page never asks the browser to handle a secret.</p>
        <ul class="setup-actions">
          <li v-for="item in setupActions" :key="setupActionKey(item)">
            <div>
              <strong>{{ item.label }}</strong>
              <p>{{ item.description }}</p>
              <code v-if="item.command">{{ item.command }}</code>
            </div>
            <button v-if="item.command" class="icon-button" type="button" :title="`Copy ${item.label}`" :aria-label="`Copy ${item.label}`" @click="copyCommand(item)">
              <Check v-if="copiedAction === item.id" :size="15" aria-hidden="true" />
              <Copy v-else :size="15" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </section>

      <section v-if="handoff" class="handoff-panel" :data-status="handoff.status" aria-live="polite">
        <div>
          <p class="eyebrow">Agent Web UI</p>
          <h3>{{ handoff.status === 'ready' ? 'Your operator surface is ready' : handoff.status === 'pending' ? 'Waiting for the operator surface' : 'Operator surface unavailable' }}</h3>
          <p>{{ handoff.message }}</p>
        </div>
        <a v-if="handoff.status === 'ready' && handoff.url" class="primary-action" :href="handoff.url" target="_blank" rel="noreferrer">
          <ArrowRight :size="16" aria-hidden="true" />
          Open Agent Web UI
        </a>
        <button v-else class="secondary-action" type="button" :disabled="loading || action !== null" @click="() => { void readProjection(); }">
          <RefreshCw :size="16" aria-hidden="true" />
          Refresh status
        </button>
      </section>

      <section class="actions" aria-label="Onboarding actions">
        <button class="primary-action" type="button" :disabled="loading || action !== null || !projection?.actions.start || uiState === 'blocked'" @click="start('live')">
          <LoaderCircle v-if="action === 'live'" :size="16" class="spin" aria-hidden="true" />
          <Sparkles v-else :size="16" aria-hidden="true" />
          {{ action === 'live' ? 'Starting...' : 'Start my assistant' }}
        </button>
        <button class="secondary-action" type="button" :disabled="loading || action !== null || !projection?.actions.demo" @click="start('demo')">
          <ArrowRight :size="16" aria-hidden="true" />
          Try the no-credential demo
        </button>
        <a v-if="uiState === 'healthy' || uiState === 'runtime-ready'" class="primary-action" href="/">
          <ArrowRight :size="16" aria-hidden="true" />
          Open Operator Workspace
        </a>
        <a v-if="(uiState === 'healthy' || uiState === 'runtime-ready') && canAddSite" class="secondary-action" :href="OPERATOR_CONSOLE_REGISTRY_ADD_PATH">
          <Plus :size="16" aria-hidden="true" />
          Add a Site
        </a>
        <a v-if="uiState === 'healthy' || uiState === 'runtime-ready'" class="continue-link" :href="OPERATOR_CONSOLE_SESSIONS_PATH">
          Continue to Agent Sessions <ExternalLink :size="14" aria-hidden="true" />
        </a>
      </section>

      <section class="next-panel" aria-labelledby="next-title">
        <p class="eyebrow">Next step</p>
        <h3 id="next-title">{{ nextAction }}</h3>
        <p v-if="uiState === 'healthy'">The first-use page is complete. Continue chatting with the resident assistant, or use the Operator Workspace to manage Sites.</p>
        <p v-else-if="uiState === 'runtime-ready'">The runtime is healthy. Send one useful request through the Agent Web UI to complete first-use setup.</p>
        <p v-else>Advanced Site and role workflows remain available from the Operator Workspace.</p>
      </section>

      <details class="technical-details">
        <summary>Installation details</summary>
        <dl>
          <template v-if="onboarding?.user_site">
            <dt>User Site</dt><dd><code>{{ userSiteRoot }}</code></dd>
            <dt>Resident</dt><dd><code>{{ residentAgent }}</code></dd>
          </template>
          <template v-if="doctor?.status">
            <dt>Doctor</dt><dd>{{ String(doctor.status) }}</dd>
          </template>
          <template v-if="onboarding?.status">
            <dt>Onboarding</dt><dd>{{ String(onboarding.status) }}</dd>
          </template>
        </dl>
      </details>
    </main>
  </OperatorConsoleShell>
</template>

<style scoped>
.onboarding-page { min-height: calc(100vh - 64px); padding: 30px clamp(14px, 4vw, 44px) 48px; background: var(--background); color: var(--text); }
.page-header, .status-panel, .setup-panel, .actions, .next-panel, .technical-details { max-width: 760px; margin-inline: auto; }
.page-header { margin-bottom: 22px; }
.page-header h2 { margin: 0; font-size: 24px; }
.eyebrow { margin: 0 0 5px; color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; }
.subtitle { max-width: 680px; margin: 8px 0 0; color: var(--muted); font-size: 14px; line-height: 1.55; }
.status-panel { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: 12px; padding: 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.status-icon { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: var(--activity-chip-bg); color: var(--operator); }
.status-panel[data-state="needs-intelligence-setup"], .status-panel[data-state="blocked"], .status-panel[data-state="failed"] { border-color: color-mix(in srgb, var(--danger) 45%, var(--line)); }
.status-panel[data-state="needs-intelligence-setup"] .status-icon, .status-panel[data-state="blocked"] .status-icon, .status-panel[data-state="failed"] .status-icon { background: color-mix(in srgb, var(--danger) 12%, var(--surface)); color: var(--danger); }
.status-panel strong { display: block; font-size: 14px; }
.status-panel p { margin: 4px 0 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
.handoff-panel { display: flex; align-items: center; justify-content: space-between; gap: 16px; max-width: 760px; margin: 16px auto 0; padding: 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.handoff-panel[data-status="ready"] { border-color: color-mix(in srgb, var(--operator) 45%, var(--line)); }
.handoff-panel h3 { margin: 0; font-size: 15px; }
.handoff-panel p:not(.eyebrow) { margin: 4px 0 0; color: var(--muted); font-size: 13px; }
.icon-button { display: grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); color: var(--muted); cursor: pointer; }
.icon-button:hover:not(:disabled) { color: var(--operator); border-color: var(--operator); }
.icon-button:disabled { cursor: wait; opacity: .55; }
.setup-panel, .next-panel { margin-top: 16px; padding: 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.setup-actions { display: grid; gap: 10px; margin: 14px 0 0; padding: 0; list-style: none; }
.setup-actions li { display: flex; align-items: start; justify-content: space-between; gap: 12px; padding-top: 10px; border-top: 1px solid var(--line); }
.setup-actions li:first-child { padding-top: 0; border-top: 0; }
.setup-actions strong { display: block; font-size: 13px; }
.setup-actions p { margin: 3px 0 5px; color: var(--muted); font-size: 12px; }
.setup-panel h3, .next-panel h3 { margin: 0; font-size: 16px; }
.setup-panel p, .next-panel p { margin: 7px 0 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
.provider-list { display: grid; gap: 7px; margin: 14px 0 0; padding: 0; list-style: none; }
.provider-list li { display: flex; justify-content: space-between; gap: 12px; padding: 8px 10px; border: 1px solid var(--line); border-radius: var(--radius); font-size: 12px; }
.provider-state { color: var(--muted); }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 20px; }
.primary-action, .secondary-action { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 38px; padding: 8px 13px; border-radius: var(--radius); font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; text-decoration: none; }
.primary-action { border: 1px solid var(--operator); background: var(--operator); color: var(--background); }
.secondary-action { border: 1px solid var(--line-strong); background: var(--surface); color: var(--text); }
.primary-action:disabled, .secondary-action:disabled { cursor: wait; opacity: .55; }
.continue-link { display: inline-flex; align-items: center; gap: 5px; margin-left: auto; color: var(--operator); font-size: 13px; font-weight: 650; text-decoration: none; }
.continue-link:hover { text-decoration: underline; }
.notice { max-width: 760px; margin: 12px auto; padding: 11px 13px; border: 1px solid var(--line); border-radius: var(--radius); font-size: 13px; }
.notice.error { color: var(--danger); }
.technical-details { margin-top: 18px; color: var(--muted); font-size: 12px; }
.technical-details summary { cursor: pointer; }
.technical-details dl { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 7px 12px; margin: 12px 0 0; padding: 12px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface-muted); }
.technical-details dt { color: var(--muted); }
.technical-details dd { margin: 0; overflow-wrap: anywhere; color: var(--text); }
code { font: 12px/1.4 var(--mono); overflow-wrap: anywhere; }
.spin { animation: onboarding-spin .9s linear infinite; }
@keyframes onboarding-spin { to { transform: rotate(360deg); } }
@media (max-width: 620px) { .onboarding-page { padding: 22px 12px 34px; } .actions { align-items: stretch; flex-direction: column; } .primary-action, .secondary-action, .continue-link { width: 100%; margin-left: 0; } .technical-details dl { grid-template-columns: 1fr; gap: 3px; } .technical-details dd { margin-bottom: 7px; } }
</style>
