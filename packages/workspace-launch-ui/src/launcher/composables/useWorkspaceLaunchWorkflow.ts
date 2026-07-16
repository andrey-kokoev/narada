import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { WorkspaceLaunchAction, WorkspaceLaunchOption } from '@narada2/workspace-launch-contract';
import {
  arrayValues,
  isWorkspaceLaunchAttemptActive,
  parseWorkspaceLaunchBootstrapPayload,
  parseWorkspaceLaunchDashboardAttempts,
  parseWorkspaceLaunchSelectorModelPayload,
  unique,
  workspaceLaunchAttemptsForView,
  type Bootstrap,
  type LaunchAttempt,
  type LaunchOption,
  type LaunchRecord,
  type LaunchSelection,
  type SelectorModel,
  type StageRow,
} from '../domain';
import { createWorkspaceLaunchTransport } from '../transport';

function readBootstrap(): Bootstrap {
  const element = document.getElementById('narada-workspace-launch-bootstrap');
  if (!element) throw new Error('workspace_launch_bootstrap_missing');
  const bootstrap = parseWorkspaceLaunchBootstrapPayload(JSON.parse(element.textContent || '{}') as unknown);
  if (!bootstrap) throw new Error('workspace_launch_bootstrap_invalid');
  return bootstrap;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function selectedValue(values: Set<string>, choices: string[], fallback?: string): string {
  const selected = [...values].find((value) => choices.includes(value));
  return selected || (fallback && choices.includes(fallback) ? fallback : choices[0] || '');
}

function replaceSet(target: { value: Set<string> }, values: Iterable<string>): void {
  target.value = new Set(values);
}

function statusLabel(value: string | undefined): string {
  return String(value || '').replace(/_/g, ' ');
}

function toWorkspaceLaunchAction(value: string): WorkspaceLaunchAction | null {
  return value === 'recheck'
    || value === 'retry'
    || value === 'forget'
    || value === 'open-web-ui'
    || value === 'attach-cli'
    || value === 'stop-runtime'
    || value === 'stop-projection'
    ? value
    : null;
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

export function useWorkspaceLaunchWorkflow() {
  const bootstrap = readBootstrap();
  const transport = createWorkspaceLaunchTransport({ basePath: bootstrap.basePath });
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
  const showHistory = ref(false);
  const dashboardUnavailable = ref(false);

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
  const activeAttempts = computed(() => workspaceLaunchAttemptsForView(attempts.value, false, Date.now(), !dashboardUnavailable.value));
  const historicalAttempts = computed(() => workspaceLaunchAttemptsForView(attempts.value, true, Date.now(), !dashboardUnavailable.value));
  const visibleAttempts = computed(() => workspaceLaunchAttemptsForView(attempts.value, showHistory.value, Date.now(), !dashboardUnavailable.value));
  const activeAttemptCount = computed(() => activeAttempts.value.length);
  const historicalAttemptCount = computed(() => historicalAttempts.value.length);

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

  let dashboardRefreshTimer: ReturnType<typeof setInterval> | undefined;

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
      const response = await transport.selectorModel(requested);
      if (sequence !== refreshSequence.value) return;
      if (response.ok && response.payload) {
        currentSelectorModel.value = parseWorkspaceLaunchSelectorModelPayload(response.payload);
      }
    } catch {
      return;
    }
    const runtimeValues = optionValues(runtimeOptions.value);
    const providerValues = optionValues(providerOptions.value);
    if (!runtimeValues.has(currentRuntime.value)) currentRuntime.value = requested.runtime;
    if (!providerValues.has(currentProvider.value)) currentProvider.value = requested.intelligenceProvider;
    ensureSurfaceSelection();
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

  function attemptIsHistorical(attempt: LaunchAttempt): boolean {
    return dashboardUnavailable.value || !isWorkspaceLaunchAttemptActive(attempt, Date.now(), !dashboardUnavailable.value);
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

  function attemptStageRows(attempt: LaunchAttempt): StageRow[] {
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

  function toggleHistory(): void {
    showHistory.value = !showHistory.value;
  }

  function updateDashboard(value: unknown): boolean {
    const parsed = parseWorkspaceLaunchDashboardAttempts(value);
    if (!parsed) return false;
    attempts.value = parsed;
    return true;
  }

  async function loadLaunches(): Promise<void> {
    try {
      const response = await transport.launches();
      if (response.ok && response.payload && updateDashboard(response.payload)) {
        dashboardUnavailable.value = false;
        return;
      }
      dashboardUnavailable.value = true;
    } catch {
      dashboardUnavailable.value = true;
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
    const normalizedAction = toWorkspaceLaunchAction(action);
    if (!normalizedAction) {
      statusText.value = `Action refused: unsupported launch action ${action}`;
      return;
    }
    try {
      const response = await transport.action(launchAttemptId, normalizedAction);
      const result = response.payload;
      if (result?.dashboard && updateDashboard(result.dashboard)) dashboardUnavailable.value = false;
      statusText.value = response.ok
        ? result?.message || `${actionLabel(action)} completed.`
        : `Action refused: ${result?.message || result?.reason_code || `HTTP ${response.status}`}`;
      if (result?.command) statusText.value += `\\n${result.command}`;
    } catch (error) {
      dashboardUnavailable.value = true;
      statusText.value = `Action failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function submitLaunch(): Promise<void> {
    if (submitting.value) return;
    submitting.value = true;
    statusText.value = 'Creating a fresh launch attempt. This does not attach to any previous session.';
    try {
      const response = await transport.submit(selectorPayload());
      const result = response.payload;
      if (response.ok) {
        statusText.value = persistent
          ? 'New launch accepted. Open or attach only from the specific result card below.'
          : 'New launch submitted. You can return to the terminal.';
        if (result?.dashboard && updateDashboard(result.dashboard)) dashboardUnavailable.value = false;
        if (!persistent) finishedView.value = 'submitted';
      } else {
        statusText.value = `Launch failed: ${result?.error || result?.status || `HTTP ${response.status}`}`;
        if (result?.dashboard) updateDashboard(result.dashboard);
      }
    } catch (error) {
      dashboardUnavailable.value = true;
      statusText.value = `Launch failed: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      submitting.value = false;
    }
  }

  async function cancel(): Promise<void> {
    try {
      await transport.cancel();
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
    dashboardRefreshTimer = setInterval(() => {
      void loadLaunches();
    }, 30_000);
  });

  onUnmounted(() => {
    if (dashboardRefreshTimer !== undefined) clearInterval(dashboardRefreshTimer);
  });

  return {
    model,
    persistent,
    basePath: transport.basePath,
    selectedSites,
    selectedRoles,
    selectedSurfaces,
    allowMultiSiteLaunch,
    allowMultiRoleLaunch,
    allowMultiSurfaceLaunch,
    currentRuntime,
    currentProvider,
    currentSelectorModel,
    statusText,
    submitting,
    stopConfirmationAttemptId,
    attempts,
    dashboardUnavailable,
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
    actionLabel,
    actionScope,
    attemptTitle,
    attemptMeta,
    attemptIsHistorical,
    attemptHistoryStatus,
    attemptStageRows,
    visibleActions,
    actionButtonLabel,
    actionButtonScope,
    toggleHistory,
    statusLabel,
    runLaunchAction,
    submitLaunch,
    cancel,
  };
}
