<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { cn } from '@narada2/ui-vue';
import type {
  WorkspaceLaunchAttempt as LaunchAttempt,
  WorkspaceLaunchBootstrap as Bootstrap,
  WorkspaceLaunchHandoff as Handoff,
  WorkspaceLaunchModel as LauncherModel,
  WorkspaceLaunchObservation as RuntimeObservation,
  WorkspaceLaunchOption as LaunchOption,
  WorkspaceLaunchProjection as ProjectionObservation,
  WorkspaceLaunchRecord as LaunchRecord,
  WorkspaceLaunchSelection as LaunchSelection,
  WorkspaceLaunchSelectionMode as SelectionMode,
  WorkspaceLaunchSelectorModel as SelectorModel,
} from '@narada2/workspace-launch-ui/contract';
import {
  ExternalLink,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
  Terminal,
  Trash2,
  X,
} from 'lucide-vue-next';

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function stringArray(value: unknown): string[] {
  return arrayValue(value).map(stringValue).filter(Boolean);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function parseOption(value: unknown): LaunchOption {
  const object = objectValue(value);
  return {
    value: stringValue(object.value),
    label: stringValue(object.label) || stringValue(object.value),
    hint: stringValue(object.hint) || undefined,
  };
}

function parseRecord(value: unknown): LaunchRecord {
  const object = objectValue(value);
  const identity = objectValue(object.agent_identity_ref);
  return {
    site: stringValue(object.site),
    role: stringValue(object.role),
    agent: stringValue(object.agent) || [stringValue(object.site), stringValue(object.role)].filter(Boolean).join('.'),
    runtime: stringValue(object.runtime),
    operatorSurface: stringValue(object.operator_surface),
    agentIdentityRef: identity.canonical_agent_id
      ? { canonicalAgentId: stringValue(identity.canonical_agent_id) }
      : undefined,
  };
}

function parseSelectorModel(value: unknown): SelectorModel {
  const object = objectValue(value);
  const selected = objectValue(object.selected);
  return {
    selected: {
      runtime: stringValue(selected.runtime) || undefined,
      intelligenceProvider: stringValue(selected.intelligenceProvider) || undefined,
    },
    operatorSurfaceOptions: arrayValue(object.operatorSurfaceOptions).map(parseOption).filter((option) => option.value),
    runtimeOptions: arrayValue(object.runtimeOptions).map(parseOption).filter((option) => option.value),
    intelligenceProviderOptions: arrayValue(object.intelligenceProviderOptions).map(parseOption).filter((option) => option.value),
  };
}

function parseModel(value: unknown): LauncherModel {
  const object = objectValue(value);
  return {
    records: arrayValue(object.records).map(parseRecord).filter((record) => record.site && record.role),
    siteChoices: stringArray(object.siteChoices),
    initialSites: stringArray(object.initialSites),
    initialRoles: stringArray(object.initialRoles),
    initialOperatorSurfaces: stringArray(object.initialOperatorSurfaces),
    initialRuntime: stringValue(object.initialRuntime) || 'registry default',
    initialIntelligenceProvider: stringValue(object.initialIntelligenceProvider) || 'registry default',
    initialSelectionMode: objectValue(object.initialSelectionMode) as SelectionMode,
    narsOperatorSurfaceChoices: stringArray(object.narsOperatorSurfaceChoices),
    selectorModel: parseSelectorModel(object.selectorModel),
  };
}

function parseBootstrap(): Bootstrap {
  const element = document.getElementById('narada-workspace-launch-bootstrap');
  if (!element) throw new Error('workspace_launch_bootstrap_missing');
  const parsed = objectValue(JSON.parse(element.textContent || '{}') as unknown);
  return {
    model: parseModel(parsed.model),
    persistent: parsed.persistent === true,
  };
}

function parseHandoff(value: unknown): Handoff {
  const object = objectValue(value);
  return { posture: stringValue(object.posture) || undefined, status: stringValue(object.status) || undefined };
}

function parseObservation(value: unknown): RuntimeObservation {
  const object = objectValue(value);
  return { health: stringValue(object.health) || undefined, sessionId: stringValue(object.session_id) || undefined };
}

function parseProjection(value: unknown): ProjectionObservation {
  const object = objectValue(value);
  return {
    projectionKind: stringValue(object.projection_kind) || undefined,
    status: stringValue(object.status) || undefined,
  };
}

function parseAttempt(value: unknown): LaunchAttempt {
  const object = objectValue(value);
  const selection = objectValue(object.selection);
  return {
    launchAttemptId: stringValue(object.launch_attempt_id),
    selection: {
      site: stringArray(selection.site),
      role: stringArray(selection.role),
      operatorSurface: stringArray(selection.operatorSurface),
      runtime: stringValue(selection.runtime),
      intelligenceProvider: stringValue(selection.intelligenceProvider),
      selectionMode: objectValue(selection.selectionMode) as SelectionMode,
    },
    status: stringValue(object.status),
    resultSummary: stringValue(object.result_summary),
    updatedAt: stringValue(object.updated_at) || stringValue(object.created_at) || stringValue(object.started_at) || null,
    handoffs: arrayValue(object.handoffs).map(parseHandoff),
    observations: arrayValue(object.observations).map(parseObservation),
    projections: arrayValue(object.projections).map(parseProjection),
    actions: stringArray(object.actions),
    raw: value,
  };
}

function parseAttempts(value: unknown): LaunchAttempt[] | null {
  const object = objectValue(value);
  if (!Array.isArray(object.attempts)) return null;
  return arrayValue(object.attempts).map(parseAttempt).filter((attempt) => attempt.launchAttemptId);
}

const bootstrap = parseBootstrap();
const model = bootstrap.model;
const persistent = bootstrap.persistent;
const selectedSites = ref(new Set(model.initialSites));
const selectedRoles = ref(new Set(model.initialRoles));
const selectedSurfaces = ref(new Set(model.initialOperatorSurfaces.length ? model.initialOperatorSurfaces : ['registry default']));
const allowMultiSiteLaunch = ref(model.initialSelectionMode.site === 'multiple' || selectedSites.value.size > 1);
const allowMultiRoleLaunch = ref(model.initialSelectionMode.role === 'multiple' || selectedRoles.value.size > 1);
const allowMultiSurfaceLaunch = ref(model.initialSelectionMode.operatorSurface === 'multiple' || selectedSurfaces.value.size > 1);
const currentSelectorModel = ref<SelectorModel>(model.selectorModel);
const currentRuntime = ref(model.initialRuntime);
const currentProvider = ref(model.initialIntelligenceProvider);
const refreshSequence = ref(0);
const statusText = ref('');
const submitting = ref(false);
const stopConfirmationAttemptId = ref<string | null>(null);
const attempts = ref<LaunchAttempt[]>([]);
const finishedView = ref<'submitted' | 'cancelled' | null>(null);

const siteChoices = computed(() => unique(model.siteChoices.length ? model.siteChoices : model.records.map((record) => record.site)));
const roleChoices = computed(() => unique(model.records
  .filter((record) => selectedSites.value.has(record.site))
  .map((record) => record.role)));
const surfaceOptions = computed(() => currentSelectorModel.value.operatorSurfaceOptions ?? []);
const runtimeOptions = computed(() => currentSelectorModel.value.runtimeOptions ?? []);
const providerOptions = computed(() => currentSelectorModel.value.intelligenceProviderOptions ?? []);
const matchedRecords = computed(() => model.records.filter((record) => (
  selectedSites.value.has(record.site) && selectedRoles.value.has(record.role)
)));
const explicitSurfaces = computed(() => [...selectedSurfaces.value].filter((value) => value !== 'registry default'));
const projectionCount = computed(() => matchedRecords.value.length * Math.max(1, explicitSurfaces.value.length));

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

const launchScopeSummary = computed(() => (
  `${plural(matchedRecords.value.length, 'agent')} · ${plural(matchedRecords.value.length, 'runtime')} · ${plural(projectionCount.value, 'operator projection')}`
));
const launchScopeAgents = computed(() => {
  if (matchedRecords.value.length === 0) return 'No agents match this selection.';
  return `Agents: ${unique(matchedRecords.value.map((record) => record.agentIdentityRef?.canonicalAgentId || record.agent)).join(', ')}`;
});
const submitLabel = computed(() => (
  matchedRecords.value.length > 0 ? `Start ${plural(matchedRecords.value.length, 'Agent Launch')}` : 'Start Selected Launches'
));

function selectedValue(values: Set<string>, choices: string[], fallback?: string): string {
  const selected = [...values].find((value) => choices.includes(value));
  return selected || (fallback && choices.includes(fallback) ? fallback : choices[0] || '');
}

function replaceSet(target: { value: Set<string> }, values: Iterable<string>): void {
  target.value = new Set(values);
}

function ensureSiteSelection(): void {
  const choices = siteChoices.value;
  if (choices.length === 0) {
    replaceSet(selectedSites, []);
    return;
  }
  if (!allowMultiSiteLaunch.value) {
    replaceSet(selectedSites, [selectedValue(selectedSites.value, choices)]);
    return;
  }
  const retained = [...selectedSites.value].filter((value) => choices.includes(value));
  replaceSet(selectedSites, retained.length ? retained : [choices[0]]);
}

function ensureRoleSelection(): void {
  const choices = roleChoices.value;
  if (choices.length === 0) {
    replaceSet(selectedRoles, []);
    return;
  }
  if (!allowMultiRoleLaunch.value) {
    replaceSet(selectedRoles, [selectedValue(selectedRoles.value, choices, 'resident')]);
    return;
  }
  const retained = [...selectedRoles.value].filter((value) => choices.includes(value));
  replaceSet(selectedRoles, retained.length ? retained : [choices.includes('resident') ? 'resident' : choices[0]]);
}

function ensureSurfaceSelection(): void {
  const choices = surfaceOptions.value;
  if (choices.length === 0) {
    replaceSet(selectedSurfaces, []);
    return;
  }
  const values = new Set(choices.map((option) => option.value));
  const retained = [...selectedSurfaces.value].filter((value) => values.has(value));
  if (!allowMultiSurfaceLaunch.value) {
    replaceSet(selectedSurfaces, [retained[0] || choices[0].value]);
    return;
  }
  if (retained.includes('registry default')) {
    replaceSet(selectedSurfaces, ['registry default']);
    return;
  }
  replaceSet(selectedSurfaces, retained.length ? retained : [choices[0].value]);
}

function selectedSingleSite(): string {
  return selectedValue(selectedSites.value, siteChoices.value);
}

function selectedSingleRole(): string {
  return selectedValue(selectedRoles.value, roleChoices.value, 'resident');
}

function selectedSingleSurface(): string {
  return selectedValue(selectedSurfaces.value, surfaceOptions.value.map((option) => option.value));
}

function onSingleSiteChange(event: Event): void {
  const value = event.target instanceof HTMLSelectElement ? event.target.value : '';
  replaceSet(selectedSites, value ? [value] : []);
  ensureRoleSelection();
  void refreshSelectorControls();
}

function onSingleRoleChange(event: Event): void {
  const value = event.target instanceof HTMLSelectElement ? event.target.value : '';
  replaceSet(selectedRoles, value ? [value] : []);
  void refreshSelectorControls();
}

function onSingleSurfaceChange(event: Event): void {
  const value = event.target instanceof HTMLSelectElement ? event.target.value : '';
  replaceSet(selectedSurfaces, value ? [value] : []);
  void refreshSelectorControls();
}

function onSiteToggle(value: string, event: Event): void {
  if (!(event.target instanceof HTMLInputElement)) return;
  const next = new Set(selectedSites.value);
  if (event.target.checked) next.add(value);
  else if (next.size > 1) next.delete(value);
  replaceSet(selectedSites, next);
  ensureRoleSelection();
  void refreshSelectorControls();
}

function onRoleToggle(value: string, event: Event): void {
  if (!(event.target instanceof HTMLInputElement)) return;
  const next = new Set(selectedRoles.value);
  if (event.target.checked) next.add(value);
  else if (next.size > 1) next.delete(value);
  replaceSet(selectedRoles, next);
  void refreshSelectorControls();
}

function onSurfaceToggle(value: string, event: Event): void {
  if (!(event.target instanceof HTMLInputElement)) return;
  const next = new Set(selectedSurfaces.value);
  if (value === 'registry default') {
    if (event.target.checked) replaceSet(selectedSurfaces, ['registry default']);
    return;
  }
  if (event.target.checked) {
    next.delete('registry default');
    next.add(value);
  } else if (next.size > 1) {
    next.delete(value);
  }
  replaceSet(selectedSurfaces, next.size ? next : ['registry default']);
  void refreshSelectorControls();
}

function onMultiSiteToggle(event: Event): void {
  allowMultiSiteLaunch.value = event.target instanceof HTMLInputElement && event.target.checked;
  ensureSiteSelection();
  ensureRoleSelection();
  void refreshSelectorControls();
}

function onMultiRoleToggle(event: Event): void {
  allowMultiRoleLaunch.value = event.target instanceof HTMLInputElement && event.target.checked;
  ensureRoleSelection();
  void refreshSelectorControls();
}

function onMultiSurfaceToggle(event: Event): void {
  allowMultiSurfaceLaunch.value = event.target instanceof HTMLInputElement && event.target.checked;
  ensureSurfaceSelection();
  void refreshSelectorControls();
}

function selectorPayload(): LaunchSelection {
  ensureSiteSelection();
  ensureRoleSelection();
  ensureSurfaceSelection();
  return {
    site: [...selectedSites.value],
    role: [...selectedRoles.value],
    operatorSurface: [...selectedSurfaces.value],
    runtime: currentRuntime.value || 'registry default',
    intelligenceProvider: currentProvider.value || 'registry default',
    selectionMode: {
      site: allowMultiSiteLaunch.value ? 'multiple' : 'single',
      role: allowMultiRoleLaunch.value ? 'multiple' : 'single',
      operatorSurface: allowMultiSurfaceLaunch.value ? 'multiple' : 'single',
    },
  };
}

function optionValues(options: LaunchOption[]): Set<string> {
  return new Set(options.map((option) => option.value));
}

async function refreshSelectorControls(): Promise<void> {
  const sequence = ++refreshSequence.value;
  const requested = selectorPayload();
  try {
    const response = await fetch('/selector-model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requested),
    });
    if (sequence !== refreshSequence.value) return;
    if (response.ok) currentSelectorModel.value = parseSelectorModel(await response.json() as unknown);
  } catch {
    return;
  }
  const runtimeValues = optionValues(runtimeOptions.value);
  const providerValues = optionValues(providerOptions.value);
  if (!runtimeValues.has(currentRuntime.value)) currentRuntime.value = requested.runtime;
  if (!providerValues.has(currentProvider.value)) currentProvider.value = requested.intelligenceProvider;
  ensureSurfaceSelection();
}

function onRuntimeChange(event: Event): void {
  currentRuntime.value = event.target instanceof HTMLSelectElement ? event.target.value : 'registry default';
  void refreshSelectorControls();
}

function onProviderChange(event: Event): void {
  currentProvider.value = event.target instanceof HTMLSelectElement ? event.target.value : 'registry default';
  void refreshSelectorControls();
}

function actionLabel(action: string, historical = false): string {
  const labels: Record<string, string> = {
    'open-web-ui': historical ? 'Open Last Observed UI' : 'Open This UI',
    'attach-cli': historical ? 'Attach Last Observed CLI' : 'Attach CLI To This Session',
    'stop-runtime': 'Stop This Runtime Tree',
    recheck: 'Recheck This Launch',
    retry: 'Start Fresh From This Result',
    forget: 'Forget This Result',
  };
  return labels[action] || statusLabel(action);
}

function actionScope(action: string): string {
  const scopes: Record<string, string> = {
    'open-web-ui': 'Opens the UI projection recorded for this launch result.',
    'attach-cli': 'Prints or runs the attach path for this exact session.',
    'stop-runtime': 'Requests stop through this session control path and its owned descendant process tree.',
    recheck: 'Refreshes observations for this launch result only.',
    retry: 'Creates a new launch attempt from this result selection, not from the current form; it does not resume this session.',
    forget: 'Removes this result card from the launcher dashboard only.',
  };
  return scopes[action] || 'Runs this launch-result action.';
}

function actionGroup(action: string): string {
  if (action === 'recheck') return 'inspect';
  if (action === 'open-web-ui' || action === 'attach-cli') return 'attach';
  if (action === 'retry') return 'create';
  if (action === 'stop-runtime') return 'danger';
  return 'manage';
}

function statusLabel(value: string | undefined): string {
  return String(value || '').replace(/_/g, ' ');
}

function formatAge(timestamp: string | null): string | null {
  if (!timestamp) return null;
  const milliseconds = Date.parse(timestamp);
  if (!Number.isFinite(milliseconds)) return timestamp;
  const seconds = Math.max(0, Math.round((Date.now() - milliseconds) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function attemptTitle(attempt: LaunchAttempt): string {
  return `${attempt.selection.site.join(', ')} / ${attempt.selection.role.join(', ')}`;
}

function attemptMeta(attempt: LaunchAttempt): string {
  return [
    attempt.selection.operatorSurface.join(' + '),
    attempt.selection.runtime,
    attempt.selection.intelligenceProvider,
  ].filter(Boolean).join(' · ');
}

function attemptIsHistorical(attempt: LaunchAttempt): boolean {
  const liveObservation = attempt.observations.some((value) => /ok|healthy|ready|busy|running|observed/i.test(value.health || ''));
  const liveProjection = attempt.projections.some((value) => /handed off|handed_off|planned/i.test(value.status || ''));
  return !(liveObservation || liveProjection);
}

function attemptHistoryStatus(attempt: LaunchAttempt): string {
  const age = formatAge(attempt.updatedAt);
  const suffix = attempt.updatedAt ? ` · last updated ${age || attempt.updatedAt} (${attempt.updatedAt})` : '';
  return attemptIsHistorical(attempt)
    ? `historical result; recheck before attaching${suffix}`
    : `last observation recorded${suffix}`;
}

function agentInputStageValue(attempt: LaunchAttempt): string {
  const observation = attempt.observations.find((value) => value.sessionId || value.health);
  if (!observation) return 'Not verified by this launcher result.';
  const health = statusLabel(observation.health || 'observed');
  if (/busy|active turn|thinking/i.test(health)) return 'Runtime observed, but current turn may still be active.';
  if (/degraded|stale|unavailable|failed|closed/i.test(health)) return `Runtime observed as ${health}; input readiness is not guaranteed.`;
  return `Runtime observed as ${health}; use the opened UI to verify turn responsiveness.`;
}

interface StageRow {
  name: string;
  value: string;
}

function attemptStageRows(attempt: LaunchAttempt): StageRow[] {
  const actions = new Set(attempt.actions);
  const historical = attemptIsHistorical(attempt);
  const runtimeHealth = attempt.observations.find((value) => value.health)?.health;
  const projectionStatus = attempt.projections.find((value) => value.status)?.status;
  const handoffStatus = attempt.handoffs.find((value) => value.status)?.status;
  const attachActions = attempt.actions
    .filter((action) => action === 'open-web-ui' || action === 'attach-cli')
    .map((action) => actionLabel(action, historical));
  return [
    { name: 'Configure', value: 'Selection recorded as launch input only.' },
    { name: 'Start New', value: attempt.resultSummary || statusLabel(attempt.status) || 'Launch attempt recorded.' },
    { name: 'Process', value: runtimeHealth ? `Observed ${statusLabel(runtimeHealth)}` : (handoffStatus ? `Handoff ${statusLabel(handoffStatus)}` : 'No runtime observation yet.') },
    { name: 'UI Projection', value: projectionStatus ? `UI projection ${statusLabel(projectionStatus)}` : 'No UI projection observation yet.' },
    { name: 'Agent Input', value: agentInputStageValue(attempt) },
    { name: 'Attach/Open', value: attachActions.length ? `Available actions: ${attachActions.join(', ')}` : 'No attach/open action is currently available.' },
  ];
}

function visibleActions(attempt: LaunchAttempt): string[] {
  return attempt.actions.filter((action) => action !== 'stop-projection' && action !== 'kill-process');
}

function actionButtonLabel(action: string, attempt: LaunchAttempt): string {
  if (action === 'stop-runtime' && stopConfirmationAttemptId.value === attempt.launchAttemptId) {
    return 'Confirm Stop This Runtime Tree';
  }
  return actionLabel(action, attemptIsHistorical(attempt));
}

function actionButtonScope(action: string, attempt: LaunchAttempt): string {
  if (action === 'stop-runtime' && stopConfirmationAttemptId.value === attempt.launchAttemptId) {
    return 'Second click confirms stopping this session control path and its owned descendant process tree.';
  }
  if (attemptIsHistorical(attempt) && (action === 'open-web-ui' || action === 'attach-cli')) {
    return 'Recheck this launch before using last-observed attach actions.';
  }
  return actionScope(action);
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

function updateDashboard(value: unknown): void {
  const parsed = parseAttempts(value);
  if (parsed) attempts.value = parsed;
}

async function loadLaunches(): Promise<void> {
  try {
    const response = await fetch('/launches');
    if (response.ok) updateDashboard(await response.json() as unknown);
  } catch {
    // The launcher page remains usable if the optional recovery read is unavailable.
  }
}

async function runLaunchAction(action: string, launchAttemptId: string): Promise<void> {
  if (action !== 'stop-runtime') stopConfirmationAttemptId.value = null;
  if (action === 'stop-runtime' && stopConfirmationAttemptId.value !== launchAttemptId) {
    stopConfirmationAttemptId.value = launchAttemptId;
    statusText.value = 'Confirm stop only if you intend to close this session control path and its owned descendant process tree.';
    return;
  }
  stopConfirmationAttemptId.value = null;
  statusText.value = `${actionLabel(action)}...`;
  try {
    const response = await fetch(`/launches/${encodeURIComponent(launchAttemptId)}/${encodeURIComponent(action)}`, { method: 'POST' });
    const result = objectValue(await response.json() as unknown);
    updateDashboard(result.dashboard || result);
    statusText.value = response.ok
      ? stringValue(result.message) || `${actionLabel(action)} completed.`
      : `Action refused: ${stringValue(result.message) || stringValue(result.reason_code) || response.statusText}`;
    if (typeof result.command === 'string' && result.command) statusText.value += `\n${result.command}`;
  } catch (error) {
    statusText.value = `Action failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function submitLaunch(): Promise<void> {
  if (submitting.value) return;
  submitting.value = true;
  statusText.value = 'Creating a fresh launch attempt. This does not attach to any previous session.';
  try {
    const response = await fetch('/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(selectorPayload()),
    });
    const result = objectValue(await response.json() as unknown);
    if (response.ok) {
      statusText.value = persistent
        ? 'New launch accepted. Open or attach only from the specific result card below.'
        : 'New launch submitted. You can return to the terminal.';
      updateDashboard(result.dashboard || {});
      if (!persistent) finishedView.value = 'submitted';
    } else {
      statusText.value = `Launch failed: ${stringValue(result.error) || stringValue(result.status) || response.statusText}`;
      if (result.dashboard) updateDashboard(result.dashboard);
    }
  } catch (error) {
    statusText.value = `Launch failed: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    submitting.value = false;
  }
}

async function cancel(): Promise<void> {
  try {
    await fetch('/cancel', { method: 'POST' });
  } finally {
    finishedView.value = 'cancelled';
  }
}

onMounted(() => {
  ensureSiteSelection();
  ensureRoleSelection();
  ensureSurfaceSelection();
  void refreshSelectorControls();
  void loadLaunches();
});
</script>

<template>
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
        <label class="mode-toggle"><input id="allow-multi-site" type="checkbox" :checked="allowMultiSiteLaunch" @change="onMultiSiteToggle">Allow multi-site launch</label>
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
      </fieldset>

      <fieldset class="ui-fieldset">
        <legend>Role</legend>
        <label class="mode-toggle"><input id="allow-multi-role" type="checkbox" :checked="allowMultiRoleLaunch" @change="onMultiRoleToggle">Allow multi-role launch</label>
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
      </fieldset>

      <fieldset class="ui-fieldset">
        <legend>Operator Surface</legend>
        <label class="mode-toggle"><input id="allow-multi-surface" type="checkbox" :checked="allowMultiSurfaceLaunch" @change="onMultiSurfaceToggle">Allow multiple operator surfaces</label>
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
      <div class="section-heading"><div><p class="eyebrow">Evidence</p><h2 id="launches-title">Launch Results</h2></div><span class="result-count">{{ attempts.length }}</span></div>
      <div id="launches" class="attempt-list">
        <p v-if="attempts.length === 0" class="field-hint">No launches yet.</p>
        <article v-for="attempt in attempts" :key="attempt.launchAttemptId" class="attempt" :data-launch-attempt-id="attempt.launchAttemptId">
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
