<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ArrowRight, CheckCircle2, ExternalLink, LoaderCircle, RefreshCw, Sparkles, TriangleAlert } from 'lucide-vue-next';
import { OPERATOR_CONSOLE_SESSIONS_PATH } from '@narada2/operator-console-contract';
import OperatorConsoleShell from '../components/OperatorConsoleShell.vue';

type OnboardingUiState = 'checking' | 'ready' | 'starting' | 'healthy' | 'needs-provider-setup' | 'blocked' | 'failed';

interface OnboardingProjection {
  schema: 'narada.operator_console.onboarding.v1';
  status: 'success' | 'failed';
  ui_state: OnboardingUiState;
  posture: string;
  doctor: Record<string, unknown> | null;
  onboarding: Record<string, unknown> | null;
  next_action: string;
  actions: { start: boolean; demo: boolean };
  error?: string;
}

const projection = ref<OnboardingProjection | null>(null);
const loading = ref(false);
const action = ref<'live' | 'demo' | null>(null);
const error = ref<string | null>(null);

const uiState = computed<OnboardingUiState>(() => projection.value?.ui_state ?? (loading.value ? 'checking' : 'failed'));
const onboarding = computed(() => projection.value?.onboarding ?? null);
const doctor = computed(() => projection.value?.doctor ?? null);
const stateLabel = computed(() => ({
  checking: 'Checking this installation',
  ready: 'Ready to start',
  starting: 'Starting your assistant',
  healthy: 'Assistant is ready',
  'needs-provider-setup': 'Provider setup needed',
  blocked: 'Action needed',
  failed: 'Could not check installation',
}[uiState.value]));
const stateDescription = computed(() => ({
  checking: 'Reading the User Site and provider readiness from the local Narada CLI.',
  ready: 'Narada is ready to start one resident General assistant in your personal User Site.',
  starting: 'The resident is starting. The Agent Web UI will open when its session is ready.',
  healthy: 'Your resident assistant is running. Continue in the Agent Web UI.',
  'needs-provider-setup': 'Configure one intelligence provider, or use the credential-free demo to explore Narada first.',
  blocked: 'The installation needs attention before the resident can start.',
  failed: 'The local onboarding status endpoint did not return a usable result.',
}[uiState.value]));

const providerReadiness = computed(() => {
  const rows = doctor.value?.provider_readiness;
  return Array.isArray(rows) ? rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object') : [];
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

function providerKey(provider: Record<string, unknown>, index: number): string {
  return `${String(provider.provider || provider.name || 'provider')}-${index}`;
}

async function readProjection(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const response = await fetch('/console/onboarding/api/status', { headers: { Accept: 'application/json' } });
    const body = await response.json() as OnboardingProjection;
    if (!response.ok || body.status === 'failed') throw new Error(body.error || `Status request failed (${response.status})`);
    projection.value = body;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
    projection.value = null;
  } finally {
    loading.value = false;
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
    const body = await response.json() as OnboardingProjection;
    projection.value = body;
    if (!response.ok || body.status === 'failed') throw new Error(body.error || `Start request failed (${response.status})`);
    if (mode === 'live') {
      window.setTimeout(() => { void readProjection(); }, 1500);
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    action.value = null;
  }
}

onMounted(() => { void readProjection(); });
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
          <CheckCircle2 v-else-if="uiState === 'healthy' || uiState === 'ready'" :size="20" />
          <TriangleAlert v-else :size="20" />
        </div>
        <div>
          <strong>{{ stateLabel }}</strong>
          <p>{{ stateDescription }}</p>
        </div>
        <button class="icon-button" type="button" title="Refresh status" aria-label="Refresh status" :disabled="loading || action !== null" @click="readProjection">
          <RefreshCw :size="16" aria-hidden="true" />
        </button>
      </section>

      <p v-if="error" class="notice error" role="alert">{{ error }}</p>

      <section v-if="uiState === 'needs-provider-setup'" class="setup-panel" aria-labelledby="provider-title">
        <p class="eyebrow">Intelligence provider</p>
        <h3 id="provider-title">Choose how the assistant thinks</h3>
        <p>Provider credentials stay in the User Site secret store. This page only reports readiness; it never asks the browser to handle a secret.</p>
        <ul v-if="providerReadiness.length" class="provider-list">
          <li v-for="(provider, index) in providerReadiness" :key="providerKey(provider, index)">
            <span>{{ String(provider.provider || provider.name || 'Provider') }}</span>
            <span class="provider-state">{{ String(provider.status || 'check_required') }}</span>
          </li>
        </ul>
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
        <a v-if="uiState === 'healthy'" class="continue-link" :href="OPERATOR_CONSOLE_SESSIONS_PATH">
          Continue to Agent Sessions <ExternalLink :size="14" aria-hidden="true" />
        </a>
      </section>

      <section class="next-panel" aria-labelledby="next-title">
        <p class="eyebrow">Next step</p>
        <h3 id="next-title">{{ nextAction }}</h3>
        <p v-if="uiState === 'healthy'">The first-use page is complete. The resident assistant remains the canonical conversation surface.</p>
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
.status-panel[data-state="needs-provider-setup"], .status-panel[data-state="blocked"], .status-panel[data-state="failed"] { border-color: color-mix(in srgb, var(--danger) 45%, var(--line)); }
.status-panel[data-state="needs-provider-setup"] .status-icon, .status-panel[data-state="blocked"] .status-icon, .status-panel[data-state="failed"] .status-icon { background: color-mix(in srgb, var(--danger) 12%, var(--surface)); color: var(--danger); }
.status-panel strong { display: block; font-size: 14px; }
.status-panel p { margin: 4px 0 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
.icon-button { display: grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); color: var(--muted); cursor: pointer; }
.icon-button:hover:not(:disabled) { color: var(--operator); border-color: var(--operator); }
.icon-button:disabled { cursor: wait; opacity: .55; }
.setup-panel, .next-panel { margin-top: 16px; padding: 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.setup-panel h3, .next-panel h3 { margin: 0; font-size: 16px; }
.setup-panel p, .next-panel p { margin: 7px 0 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
.provider-list { display: grid; gap: 7px; margin: 14px 0 0; padding: 0; list-style: none; }
.provider-list li { display: flex; justify-content: space-between; gap: 12px; padding: 8px 10px; border: 1px solid var(--line); border-radius: var(--radius); font-size: 12px; }
.provider-state { color: var(--muted); }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 20px; }
.primary-action, .secondary-action { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 38px; padding: 8px 13px; border-radius: var(--radius); font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; }
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
