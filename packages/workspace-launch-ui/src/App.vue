<script setup lang="ts">
import { OperatorSurfaceShell, cn } from '@narada2/ui-vue';
import {
  ExternalLink,
  History,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
  Terminal,
  Trash2,
  X,
} from 'lucide-vue-next';
import { useWorkspaceLaunchWorkflow } from './launcher/composables/useWorkspaceLaunchWorkflow';

const {
  model,
  persistent,
  basePath,
  selectedSites,
  selectedRoles,
  selectedSurfaces,
  allowMultiSiteLaunch,
  allowMultiRoleLaunch,
  allowMultiSurfaceLaunch,
  currentRuntime,
  currentProvider,
  statusText,
  submitting,
  attempts,
  showHistory,
  visibleAttempts,
  activeAttemptCount,
  historicalAttemptCount,
  finishedView,
  siteChoices,
  roleChoices,
  surfaceOptions,
  runtimeOptions,
  providerOptions,
  launchScopeSummary,
  launchScopeAgents,
  submitLabel,
  selectedSingleSite,
  selectedSingleRole,
  selectedSingleSurface,
  onSingleSiteChange,
  onSingleRoleChange,
  onSingleSurfaceChange,
  onSiteToggle,
  onRoleToggle,
  onSurfaceToggle,
  onMultiSiteToggle,
  onMultiRoleToggle,
  onMultiSurfaceToggle,
  onRuntimeChange,
  onProviderChange,
  statusLabel,
  attemptTitle,
  attemptMeta,
  attemptIsHistorical,
  attemptHistoryStatus,
  attemptStageRows,
  visibleActions,
  actionButtonLabel,
  actionButtonScope,
  toggleHistory,
  runLaunchAction,
  submitLaunch,
  cancel,
} = useWorkspaceLaunchWorkflow();

const operatorSurfaceNavigation = basePath === '/console/launch'
  ? [
      { key: 'sites', label: 'Sites', href: '/console/registry', current: false },
      { key: 'launcher', label: 'Launcher', href: '/console/launch', current: true },
    ]
  : [
      { key: 'launcher', label: 'Launcher', href: '/', current: true },
    ];

function actionGroup(action: string): string {
  if (action === 'recheck') return 'inspect';
  if (action === 'open-web-ui' || action === 'attach-cli') return 'attach';
  if (action === 'retry') return 'create';
  if (action === 'stop-runtime') return 'danger';
  return 'manage';
}

function actionButtonClass(action: string): string {
  return cn(
    'ui-button ui-button-compact',
    actionGroup(action) === 'danger' && 'ui-button-danger',
    actionGroup(action) === 'create' && 'ui-button-create',
  );
}

function actionIcon(action: string): typeof RefreshCw {
  if (action === 'open-web-ui') return ExternalLink;
  if (action === 'attach-cli') return Terminal;
  if (action === 'stop-runtime') return Square;
  if (action === 'retry') return RotateCcw;
  if (action === 'forget') return Trash2;
  return RefreshCw;
}
</script>


<template>
  <OperatorSurfaceShell
    eyebrow="Operator Console"
    title="Agent Launcher"
    back-href="/"
    back-label="Back to Operator Workspace"
    :nav-items="operatorSurfaceNavigation"
  >
  <div v-if="finishedView === 'submitted'" class="launcher-terminal-state">
    <h1>New launch submitted</h1>
    <p>You can return to the terminal.</p>
  </div>
  <div v-else-if="finishedView === 'cancelled'" class="launcher-terminal-state">
    <h1>Cancelled</h1>
  </div>
  <main v-else class="launcher-page">
    <header class="launcher-header">
      <div>
        <p class="eyebrow">Operator surface</p>
        <h1>Launcher Session Dashboard</h1>
        <p class="subtitle">Configure a fresh launch, then keep its handoff and session evidence together.</p>
      </div>
      <span class="posture">Local launcher</span>
    </header>

    <section class="stage-strip" aria-label="Launch stages">
      <article class="stage-card">
        <span class="stage-number">01</span>
        <div><strong>Configure</strong><p>Choose Site, role, runtime, surface, and provider defaults.</p></div>
      </article>
      <article class="stage-card">
        <span class="stage-number">02</span>
        <div><strong>Start fresh</strong><p>Every submission creates a new launch attempt.</p></div>
      </article>
      <article class="stage-card">
        <span class="stage-number">03</span>
        <div><strong>Attach explicitly</strong><p>Use actions on the specific result card.</p></div>
      </article>
    </section>

    <form id="form" class="launcher-form" @submit.prevent="submitLaunch">
      <fieldset class="ui-fieldset">
        <legend>Site</legend>
        <div class="selection-control-row">
          <div id="sites">
            <div id="site-single" v-show="!allowMultiSiteLaunch">
              <select id="site-select" class="ui-select" aria-label="Site" :value="selectedSingleSite()" @change="onSingleSiteChange">
                <option v-for="choice in siteChoices" :key="choice" :value="choice">{{ choice }}</option>
              </select>
            </div>
            <div id="sites-multi" v-show="allowMultiSiteLaunch" class="multi-options">
              <label v-for="choice in siteChoices" :key="choice"><input type="checkbox" :value="choice" :checked="selectedSites.has(choice)" @change="onSiteToggle(choice, $event)">{{ choice }}</label>
            </div>
          </div>
          <label class="mode-toggle"><input id="allow-multi-site" type="checkbox" :checked="allowMultiSiteLaunch" @change="onMultiSiteToggle">Allow multi-site launch</label>
        </div>
      </fieldset>

      <fieldset class="ui-fieldset">
        <legend>Role</legend>
        <div class="selection-control-row">
          <div id="roles">
            <div id="role-single" v-show="!allowMultiRoleLaunch">
              <select id="role-select" class="ui-select" aria-label="Role" :value="selectedSingleRole()" @change="onSingleRoleChange">
                <option v-for="choice in roleChoices" :key="choice" :value="choice">{{ choice }}</option>
              </select>
            </div>
            <div id="roles-multi" v-show="allowMultiRoleLaunch" class="multi-options">
              <label v-for="choice in roleChoices" :key="choice"><input type="checkbox" :value="choice" :checked="selectedRoles.has(choice)" @change="onRoleToggle(choice, $event)">{{ choice }}</label>
            </div>
          </div>
          <label class="mode-toggle"><input id="allow-multi-role" type="checkbox" :checked="allowMultiRoleLaunch" @change="onMultiRoleToggle">Allow multi-role launch</label>
        </div>
      </fieldset>

      <fieldset class="ui-fieldset">
        <legend>Operator Surface</legend>
        <div class="selection-control-row">
          <div id="surfaces">
            <div id="surface-single" v-show="!allowMultiSurfaceLaunch">
              <select id="surface-select" class="ui-select" aria-label="Operator Surface" :value="selectedSingleSurface()" @change="onSingleSurfaceChange">
                <option v-for="option in surfaceOptions" :key="option.value" :value="option.value" :title="option.hint">{{ option.label }}</option>
              </select>
            </div>
            <div id="surfaces-multi" v-show="allowMultiSurfaceLaunch" class="multi-options">
              <label v-for="option in surfaceOptions.filter((item) => item.value === 'registry default' || model.narsOperatorSurfaceChoices.includes(item.value))" :key="option.value">
                <input type="checkbox" :value="option.value" :checked="selectedSurfaces.has(option.value)" @change="onSurfaceToggle(option.value, $event)">{{ option.label }}
              </label>
            </div>
          </div>
          <label class="mode-toggle"><input id="allow-multi-surface" type="checkbox" :checked="allowMultiSurfaceLaunch" @change="onMultiSurfaceToggle">Allow multiple operator surfaces</label>
        </div>
        <p class="field-hint">Explicit choices override the registry default. Multiple surfaces are parallel projections of one NARS runtime.</p>
      </fieldset>

      <fieldset class="ui-fieldset">
        <legend>Runtime</legend>
        <select id="runtime" class="ui-select" aria-label="Runtime" :value="currentRuntime" @change="onRuntimeChange">
          <option v-for="option in runtimeOptions" :key="option.value" :value="option.value" :title="option.hint">{{ option.label }}</option>
        </select>
      </fieldset>

      <fieldset class="ui-fieldset">
        <legend>Intelligence Provider</legend>
        <select id="provider" class="ui-select" aria-label="Intelligence Provider" :value="currentProvider" @change="onProviderChange">
          <option v-for="option in providerOptions" :key="option.value" :value="option.value" :title="option.hint">{{ option.label }}</option>
        </select>
      </fieldset>

      <section id="launch-scope" class="launch-scope" aria-live="polite">
        <strong id="launch-scope-summary">{{ launchScopeSummary }}</strong>
        <div id="launch-scope-agents" class="field-hint">{{ launchScopeAgents }}</div>
      </section>
      <p class="field-hint">Remembered selections are defaults only. They do not bind to any old launch, carrier, runtime, or conversation.</p>
      <div class="form-actions">
        <button id="submit-launch" class="ui-button ui-button-primary" type="submit" :disabled="submitting"><Play :size="15" aria-hidden="true" />{{ submitLabel }}</button>
        <button id="cancel" class="ui-button ui-button-secondary" type="button" @click="cancel"><X :size="15" aria-hidden="true" />Cancel</button>
      </div>
      <p class="field-hint">{{ persistent ? 'Form submission always creates a new launch session. Use launched-session actions below only when you explicitly want to open or attach to an existing result.' : 'This page submits one new launch session and then returns control to the terminal.' }}</p>
      <div id="status" class="status-message" role="status" aria-live="polite">{{ statusText }}</div>
    </form>

    <section class="dashboard" aria-labelledby="launches-title">
      <div class="section-heading">
        <div><p class="eyebrow">Activity</p><h2 id="launches-title">{{ showHistory ? 'Launch History' : 'Active Launches' }}</h2></div>
        <div class="dashboard-controls">
          <span class="result-count">{{ showHistory ? historicalAttemptCount : activeAttemptCount }}</span>
          <button
            v-if="historicalAttemptCount > 0 || showHistory"
            id="toggle-history"
            class="history-toggle"
            type="button"
            aria-controls="launches"
            :aria-expanded="showHistory"
            @click="toggleHistory"
          >
            <History :size="14" aria-hidden="true" />
            {{ showHistory ? 'Hide history' : 'History' }}
            <span class="history-count">{{ historicalAttemptCount }}</span>
          </button>
        </div>
      </div>
      <div id="launches" class="attempt-list">
        <p v-if="visibleAttempts.length === 0" class="field-hint">{{ showHistory ? 'No historical launch results.' : 'No active launches.' }}</p>
        <article v-for="attempt in visibleAttempts" :key="attempt.launchAttemptId" class="attempt" :data-launch-attempt-id="attempt.launchAttemptId">
          <header class="attempt-header">
            <div><div class="attempt-title">{{ attemptTitle(attempt) }}</div><div class="attempt-meta">{{ attemptMeta(attempt) }}</div></div>
            <span :class="cn('status-chip', attempt.status)">{{ statusLabel(attempt.status) }}</span>
          </header>
          <div class="attempt-line">{{ attemptHistoryStatus(attempt) }}</div>
          <div class="attempt-line">{{ attempt.resultSummary }}</div>
          <div class="attempt-stage-list" aria-label="Launch transition stages">
            <div v-for="row in attemptStageRows(attempt)" :key="row.name" class="attempt-stage"><span class="attempt-stage-name">{{ row.name }}</span><span class="attempt-stage-value">{{ row.value }}</span></div>
          </div>
          <div v-for="handoff in attempt.handoffs" :key="`handoff-${handoff.posture}-${handoff.status}`" class="attempt-line">{{ handoff.posture === 'hidden_runtime_host' ? 'Hidden runtime handoff' : 'Terminal handoff' }}: {{ statusLabel(handoff.status) }}</div>
          <div v-for="observation in attempt.observations" :key="`observation-${observation.sessionId}-${observation.health}`" class="attempt-line">Runtime: {{ statusLabel(observation.health) }}{{ observation.sessionId ? ` · session ${observation.sessionId}` : '' }}</div>
          <div v-for="projection in attempt.projections" :key="`projection-${projection.projectionKind}-${projection.status}`" class="attempt-line">Projection: {{ projection.projectionKind }} · {{ statusLabel(projection.status) }}</div>
          <div v-if="attempt.actions.includes('stop-runtime')" class="attempt-scope-note">Stop scope: this session control path and its owned descendant process tree only.</div>
          <div class="attempt-actions">
            <template v-for="action in visibleActions(attempt)" :key="action">
              <button
                :class="actionButtonClass(action)"
                type="button"
                :data-action="action"
                :data-launch-attempt-id="attempt.launchAttemptId"
                :title="actionButtonScope(action, attempt)"
                :aria-label="`${actionButtonLabel(action, attempt)}. ${actionButtonScope(action, attempt)}`"
                :disabled="attemptIsHistorical(attempt) && (action === 'open-web-ui' || action === 'attach-cli')"
                @click="runLaunchAction(action, attempt.launchAttemptId)"
              >
                <component :is="actionIcon(action)" :size="14" aria-hidden="true" />
                {{ actionButtonLabel(action, attempt) }}
              </button>
            </template>
          </div>
          <details><summary>Details</summary><pre>{{ JSON.stringify(attempt.raw, null, 2) }}</pre></details>
        </article>
      </div>
    </section>
  </main>
  </OperatorSurfaceShell>
</template>

<style scoped>
:global(body) {
  min-width: 320px;
}

.launcher-page {
  min-height: 100vh;
  padding: 24px clamp(14px, 4vw, 44px) 48px;
  background: var(--bg);
  color: var(--text);
}

.launcher-page,
.launcher-page * {
  letter-spacing: 0;
}

.launcher-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 18px;
  max-width: 1040px;
  margin: 0 auto 24px;
}

.eyebrow {
  margin: 0 0 5px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .07em !important;
  text-transform: uppercase;
}

.launcher-header h1 {
  margin: 0;
  font-size: clamp(22px, 3vw, 30px);
  font-weight: 700;
}

.subtitle {
  max-width: 680px;
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.5;
}

.posture,
.result-count,
.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 5px 9px;
  color: var(--muted);
  font-size: 11px;
  white-space: nowrap;
}

.stage-strip,
.launcher-form,
.dashboard {
  max-width: 1040px;
  margin-inline: auto;
}

.stage-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 18px;
}

.stage-card {
  display: flex;
  gap: 10px;
  padding: 13px 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}

.stage-number {
  flex: 0 0 auto;
  color: var(--accent);
  font: 12px/1.4 var(--mono);
}

.stage-card strong {
  display: block;
  font-size: 13px;
}

.stage-card p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.4;
}

.launcher-form {
  display: grid;
  gap: 12px;
}

.ui-fieldset {
  min-width: 0;
  margin: 0;
  padding: 15px 16px 17px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}

.ui-fieldset legend {
  padding: 0 6px;
  color: var(--text);
  font-size: 14px;
  font-weight: 700;
}

.mode-toggle,
.multi-options label {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 32px;
  color: var(--muted);
  font-size: 13px;
  cursor: pointer;
}

.mode-toggle {
  margin-bottom: 8px;
  color: var(--text);
  font-weight: 600;
}

.selection-control-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 16px;
}

.selection-control-row > [id] {
  min-width: 0;
}

.selection-control-row > .mode-toggle {
  margin: 1px 0 0;
}

.ui-select {
  width: min(100%, 440px);
  min-height: 38px;
  padding: 7px 10px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: var(--control-bg);
  color: var(--text);
}

.ui-select:focus-visible,
.ui-button:focus-visible,
input:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.multi-options {
  display: grid;
  gap: 3px;
  max-width: 440px;
}

.multi-options label {
  padding: 4px 0;
}

.field-hint {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}

.launch-scope {
  padding: 12px 14px;
  border-left: 3px solid var(--operator);
  background: var(--surface-muted);
}

.launch-scope strong {
  display: block;
  font-size: 13px;
}

.form-actions,
.attempt-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.form-actions {
  margin-top: 3px;
}

.ui-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 36px;
  padding: 8px 12px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: var(--control-bg);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}

.ui-button:hover {
  background: var(--surface-muted);
}

.ui-button-primary {
  border-color: var(--button-border);
  background: var(--operator);
  color: #fff;
}

.ui-button-primary:hover {
  background: var(--button-hover-bg);
}

.ui-button-secondary {
  color: var(--muted);
}

.ui-button-compact {
  min-height: 32px;
  padding: 6px 10px;
  font-size: 12px;
}

.ui-button-danger {
  border-color: color-mix(in srgb, var(--danger) 55%, var(--line-strong));
  color: var(--danger);
}

.ui-button-create {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--line-strong));
  color: var(--warning);
}

.ui-button:disabled {
  cursor: not-allowed;
  opacity: .5;
}

.status-message {
  min-height: 0;
  padding: 0;
  color: var(--muted);
  font-size: 13px;
  white-space: pre-wrap;
}

.status-message:not(:empty) {
  padding: 11px 13px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface-muted);
}

.dashboard {
  margin-top: 34px;
}

.section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 11px;
}

.section-heading h2 {
  margin: 0;
  font-size: 18px;
}

.dashboard-controls {
  display: flex;
  align-items: center;
  gap: 9px;
}

.history-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 0;
  padding: 3px 0;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.history-toggle:hover {
  color: var(--text);
}

.history-toggle:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 3px;
}

.history-count {
  font-variant-numeric: tabular-nums;
}

.attempt-list {
  display: grid;
  gap: 12px;
}

.attempt {
  padding: 15px 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}

.attempt-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.attempt-title {
  font-weight: 700;
}

.attempt-meta,
.attempt-line {
  margin-top: 6px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.4;
}

.status-chip {
  text-transform: uppercase;
  letter-spacing: .04em !important;
}

.status-chip.launched,
.status-chip.healthy,
.status-chip.ready {
  border-color: var(--success-border);
  color: var(--success);
  background: var(--success-bg);
}

.status-chip.failed,
.status-chip.refused {
  border-color: var(--error-border);
  color: var(--error);
}

.attempt-stage-list {
  display: grid;
  gap: 6px;
  margin-top: 13px;
}

.attempt-stage {
  display: grid;
  grid-template-columns: 116px minmax(0, 1fr);
  gap: 10px;
  align-items: baseline;
  padding: 8px 9px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface-muted);
}

.attempt-stage-name {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.attempt-stage-value {
  min-width: 0;
  color: var(--text);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.attempt-scope-note {
  margin-top: 11px;
  padding-left: 10px;
  border-left: 3px solid var(--danger);
  color: var(--muted);
  font-size: 12px;
  line-height: 1.4;
}

.attempt-actions {
  margin-top: 12px;
}

details {
  margin-top: 11px;
}

summary {
  color: var(--muted);
  cursor: pointer;
  font-size: 12px;
}

pre {
  max-height: 360px;
  margin: 8px 0 0;
  padding: 10px;
  overflow: auto;
  border-radius: 6px;
  background: var(--code-bg);
  color: var(--code-text);
  font: 12px/1.45 var(--mono);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.launcher-terminal-state {
  min-height: 100vh;
  padding: 40px 20px;
  background: var(--bg);
  color: var(--text);
}

.launcher-terminal-state h1,
.launcher-terminal-state p {
  max-width: 720px;
  margin-inline: auto;
}

@media (max-width: 760px) {
  .launcher-header {
    display: grid;
  }

  .selection-control-row {
    grid-template-columns: 1fr;
    gap: 0;
  }

  .selection-control-row > [id] {
    grid-column: 1;
    grid-row: 2;
  }

  .selection-control-row > .mode-toggle {
    grid-column: 1;
    grid-row: 1;
    margin-bottom: 8px;
  }

  .stage-strip {
    grid-template-columns: 1fr;
  }

  .attempt-header {
    display: grid;
  }

  .attempt-stage {
    grid-template-columns: 1fr;
    gap: 2px;
  }
}
</style>
