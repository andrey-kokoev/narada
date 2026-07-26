<script setup lang="ts">
import { ref, watch, type Component } from 'vue';
import type {
  OperatorSiteAgentAdmissionWireRequest,
  OperatorSiteAgentLaunchFailureWireRecord,
  OperatorSiteAgentSurfaceOption,
  OperatorSiteAgentWireRecord,
} from '@narada2/operator-console-contract';
import {
  Bot,
  CircleStop,
  Compass,
  Hammer,
  MoreHorizontal,
  Plus,
  RefreshCw,
  ScanSearch,
  Trash2,
  UserRound,
} from 'lucide-vue-next';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@narada2/ui-vue';
import OperatorConsoleShell from '../components/OperatorConsoleShell.vue';
import { findOperatorRouteTarget } from '../console/routes';
import { useOperatorWorkspaceRouteDirectory } from '../console/route-directory';
import { useSiteAgents } from '../site-agents/composables/useSiteAgents';
import { decideAgentInspection, decideAgentPrimaryAction } from '../site-agents/interactions';
import {
  buildFailureProjectionDocument,
  buildPendingProjectionDocument,
  decideAgentWebUiHandoff,
  scopedAgentSessionsPath,
} from '../site-agents/projection-handoff';

const siteAgents = useSiteAgents();
const routeDirectory = useOperatorWorkspaceRouteDirectory();
const busyAgentId = ref<string | null>(null);
const actionMessage = ref<string | null>(null);
const settlingStop = ref<{ siteId: string; agentId: string } | null>(null);
const admissionSiteId = ref<string | null>(null);
const admissionRole = ref('');
const admissionAgentKind = ref('');
const admissionRuntime = ref('');
const admissionOperatorSurface = ref('');
const admissionPolicy = ref('');
const admissionProvider = ref('');
const admissionModel = ref('');
const admissionError = ref<string | null>(null);
const admissionSubmitting = ref(false);
const deleteTarget = ref<{ siteId: string; agent: OperatorSiteAgentWireRecord } | null>(null);

const roleIcons: Record<string, Component> = {
  resident: UserRound,
  architect: Compass,
  builder: Hammer,
  reviewer: ScanSearch,
};

function roleIcon(role: string): Component {
  return roleIcons[role.toLowerCase()] ?? Bot;
}

function agentFor(siteId: string, agentId: string): OperatorSiteAgentWireRecord | null {
  for (const group of siteAgents.groups.value) {
    const site = group.sites.find((candidate) => candidate.site_id === siteId);
    const agent = site?.agents.find((candidate) => candidate.agent_id === agentId);
    if (agent) return agent;
  }
  return null;
}

watch(siteAgents.groups, () => {
  const target = settlingStop.value;
  if (!target || agentFor(target.siteId, target.agentId)?.runtime.state !== 'stopped') return;
  actionMessage.value = `${target.agentId} stopped.`;
  settlingStop.value = null;
});

async function waitForStopped(siteId: string, agentId: string): Promise<boolean> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    await siteAgents.load();
    if (agentFor(siteId, agentId)?.runtime.state === 'stopped') return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return agentFor(siteId, agentId)?.runtime.state === 'stopped';
}

async function stopAgent(siteId: string, agent: OperatorSiteAgentWireRecord): Promise<void> {
  if (busyAgentId.value) return;
  busyAgentId.value = agent.agent_id;
  actionMessage.value = `Stopping ${agent.agent_id} through the NARS control sideband...`;
  try {
    const result = await siteAgents.stop(siteId, agent.agent_id);
    if (result.status === 'refused' || result.status === 'failed') {
      settlingStop.value = null;
      actionMessage.value = result.message ?? result.reason ?? `Could not stop ${agent.agent_id}.`;
      return;
    }
    settlingStop.value = { siteId, agentId: agent.agent_id };
    const stopped = result.status === 'already_stopped' || await waitForStopped(siteId, agent.agent_id);
    actionMessage.value = stopped
      ? `${agent.agent_id} stopped.`
      : `${agent.agent_id} received a stop request; runtime status is still settling.`;
    if (stopped) settlingStop.value = null;
  } catch (cause) {
    settlingStop.value = null;
    actionMessage.value = cause instanceof Error ? cause.message : `Could not stop ${agent.agent_id}.`;
  } finally {
    busyAgentId.value = null;
    await siteAgents.load();
  }
}

function requestDelete(siteId: string, agent: OperatorSiteAgentWireRecord): void {
  if (busyAgentId.value) return;
  deleteTarget.value = { siteId, agent };
}

function setDeleteOpen(open: boolean): void {
  if (!open && !siteAgents.lifecycleLoading.value) deleteTarget.value = null;
}

async function confirmDelete(): Promise<void> {
  const target = deleteTarget.value;
  if (!target) return;
  busyAgentId.value = target.agent.agent_id;
  actionMessage.value = `Deleting ${target.agent.agent_id} admission...`;
  try {
    const result = await siteAgents.delete(target.siteId, target.agent.agent_id);
    if (result.status !== 'deleted') {
      actionMessage.value = result.message ?? result.reason ?? `Could not delete ${target.agent.agent_id}.`;
      return;
    }
    deleteTarget.value = null;
    actionMessage.value = `${target.agent.agent_id} admission deleted. Runtime evidence was preserved.`;
    await siteAgents.load();
  } catch (cause) {
    actionMessage.value = cause instanceof Error ? cause.message : `Could not delete ${target.agent.agent_id}.`;
  } finally {
    busyAgentId.value = null;
    await siteAgents.load();
  }
}

function sessionUrl(sessionId: string): string | null {
  const directory = routeDirectory?.directory.value;
  return directory ? findOperatorRouteTarget(directory, { kind: 'session', id: sessionId }) : null;
}

async function resolveSessionUrl(sessionId: string): Promise<string | null> {
  let url = sessionUrl(sessionId);
  if (!url && routeDirectory) {
    await routeDirectory.load();
    url = sessionUrl(sessionId);
  }
  return url;
}

function openResolvedSession(url: string, target?: Window | null): void {
  if (target && !target.closed) target.location.replace(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}

function pendingProjectionWindow(agentId: string): Window | null {
  const target = window.open('about:blank', '_blank');
  if (!target) return null;
  target.opener = null;
  target.document.title = `Starting ${agentId}`;
  target.document.body.textContent = `Starting ${agentId}. Waiting for its Agent Web UI route...`;
  return target;
}

function drivePendingWindow(target: Window | null, siteId: string, agent: OperatorSiteAgentWireRecord, sessionId: string | null): void {
  if (!target || target.closed) return;
  target.document.open();
  target.document.write(buildPendingProjectionDocument({ siteId, agentId: agent.agent_id, sessionId }));
  target.document.close();
}

function driveFailureWindow(
  target: Window | null,
  siteId: string,
  agentId: string,
  requestId: string | undefined,
  failure: OperatorSiteAgentLaunchFailureWireRecord,
): void {
  if (!target || target.closed) return;
  target.document.open();
  target.document.write(buildFailureProjectionDocument({ siteId, agentId, requestId, failure }));
  target.document.close();
}

function isStarting(siteId: string, agent: OperatorSiteAgentWireRecord): boolean {
  if (agent.runtime.state === 'running') return false;
  if (busyAgentId.value === agent.agent_id) return true;
  return siteAgents.pending.value.some((entry) =>
    entry.site_id.toLowerCase() === siteId.toLowerCase()
    && entry.agent_id.toLowerCase() === agent.agent_id.toLowerCase());
}

function surfaceLabel(surface: string): string {
  return surface === 'agent-web-ui' ? 'Web UI' : surface === 'agent-cli' ? 'CLI' : surface === 'agent-tui' ? 'TUI' : surface;
}

function surfaceChoices(agent: OperatorSiteAgentWireRecord): OperatorSiteAgentSurfaceOption[] {
  return agent.operator_surfaces.choices;
}

async function startAgent(siteId: string, agent: OperatorSiteAgentWireRecord, selectedSurface?: string): Promise<void> {
  if (busyAgentId.value) return;
  settlingStop.value = null;
  const decision = decideAgentPrimaryAction(agent);
  if (decision.kind === 'unavailable') {
    actionMessage.value = decision.reason;
    return;
  }
  const surface = selectedSurface ?? agent.operator_surfaces.default_kind;
  const target = surface === 'agent-web-ui' ? pendingProjectionWindow(agent.agent_id) : null;
  busyAgentId.value = agent.agent_id;
  actionMessage.value = `${surfaceLabel(surface)}: starting ${agent.agent_id}...`;
  try {
    const result = await siteAgents.launch(siteId, agent.agent_id, surface);
    if (result.status === 'refused' || result.status === 'failed') {
      if (result.status === 'failed') {
        const failure = result.failure ?? {
          phase: 'workspace_launch' as const,
          code: result.reason ?? 'workspace_launch_failed',
          message: result.reason ?? `Could not start ${agent.agent_id}.`,
          diagnostic_ref: null,
        };
        if (target) driveFailureWindow(target, siteId, agent.agent_id, result.request_id, failure);
        actionMessage.value = failure.message;
      } else {
        target?.close();
        actionMessage.value = result.reason ?? `Could not start ${agent.agent_id}.`;
      }
      return;
    }
    if (result.status === 'reused') {
      if (surface === 'agent-web-ui' && result.session_id) {
        const handoff = decideAgentWebUiHandoff(result.session_id, await resolveSessionUrl(result.session_id));
        if (handoff.kind === 'ready') {
          openResolvedSession(handoff.url, target);
          actionMessage.value = `Opened ${agent.agent_id} in the Web UI.`;
        } else if (handoff.kind === 'pending') {
          // A healthy runtime can exist before its Web UI route is indexed.
          // Keep the handoff page alive so it can observe route registration;
          // closing here made an otherwise valid Web UI launch look broken.
          drivePendingWindow(target, siteId, agent, handoff.sessionId);
          actionMessage.value = `${agent.agent_id} is already running. Waiting for its Web UI route...`;
        } else {
          target?.close();
          actionMessage.value = handoff.reason;
        }
      } else {
        target?.close();
        actionMessage.value = result.handoff?.message ?? `The existing session was not attachable in ${surfaceLabel(surface)}.`;
      }
      return;
    }
    if (surface === 'agent-web-ui') {
      drivePendingWindow(target, siteId, agent, result.session_id);
      actionMessage.value = `${agent.agent_id} started. Its Web UI opens when the route is ready.`;
    } else {
      target?.close();
      actionMessage.value = result.handoff?.message ?? `${agent.agent_id} started in ${surfaceLabel(surface)}.`;
    }
  } catch (cause) {
    const failed = siteAgents.launchFailure.value;
    if (failed?.failure) {
      if (target) driveFailureWindow(target, siteId, agent.agent_id, failed.request_id, failed.failure);
      actionMessage.value = failed.failure.message;
    } else {
      target?.close();
      actionMessage.value = cause instanceof Error ? cause.message : `Could not start ${agent.agent_id}.`;
    }
  } finally {
    busyAgentId.value = null;
    await siteAgents.load();
  }
}

async function inspectAgent(siteId: string, agent: OperatorSiteAgentWireRecord): Promise<void> {
  const decision = decideAgentInspection(agent);
  if (decision.kind === 'open-session') {
    const target = pendingProjectionWindow(agent.agent_id);
    const handoff = decideAgentWebUiHandoff(decision.sessionId, await resolveSessionUrl(decision.sessionId));
    if (handoff.kind === 'ready') {
      openResolvedSession(handoff.url, target);
      actionMessage.value = `Opened ${agent.agent_id}.`;
      return;
    }
    if (handoff.kind === 'pending') {
      drivePendingWindow(target, siteId, agent, handoff.sessionId);
      actionMessage.value = `Waiting for ${agent.agent_id}'s Web UI route...`;
      return;
    }
    target?.close();
    actionMessage.value = handoff.reason;
    return;
  }
  if (decision.kind === 'choose-session') {
    window.location.href = scopedAgentSessionsPath(siteId, agent.agent_id);
    return;
  }
  actionMessage.value = decision.kind === 'unavailable'
    ? decision.reason
    : `The Web UI route for ${agent.agent_id} is not available.`;
}

function inspectFromPointer(event: MouseEvent, siteId: string, agent: OperatorSiteAgentWireRecord): void {
  event.preventDefault();
  event.stopPropagation();
  void inspectAgent(siteId, agent);
}

function inspectFromKeyboard(event: KeyboardEvent, siteId: string, agent: OperatorSiteAgentWireRecord): void {
  if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
  event.preventDefault();
  void inspectAgent(siteId, agent);
}

function siteDisplayName(siteId: string): string {
  for (const group of siteAgents.groups.value) {
    const site = group.sites.find((candidate) => candidate.site_id === siteId);
    if (site) return site.display_name;
  }
  return siteId;
}

function firstAdmissionChoice(choices: Array<{ value: string }> | undefined): string {
  return choices?.[0]?.value ?? '';
}

async function openAdmission(siteId: string): Promise<void> {
  admissionSiteId.value = siteId;
  admissionError.value = null;
  siteAgents.admissionOptions.value = null;
  try {
    const result = await siteAgents.loadAdmissionOptions(siteId);
    if (result.status === 'refused') {
      admissionError.value = result.refusals.join(', ') || 'Agent admission is not available for this Site.';
      return;
    }
    admissionRole.value = firstAdmissionChoice(result.roles);
    admissionAgentKind.value = firstAdmissionChoice(result.agent_kinds);
    admissionRuntime.value = firstAdmissionChoice(result.runtimes);
    admissionOperatorSurface.value = firstAdmissionChoice(result.operator_surfaces);
    admissionPolicy.value = firstAdmissionChoice(result.intelligence.policy_choices);
    admissionProvider.value = firstAdmissionChoice(result.intelligence.provider_choices);
    admissionModel.value = firstAdmissionChoice(result.intelligence.model_choices);
  } catch (cause) {
    admissionError.value = cause instanceof Error ? cause.message : 'Agent admission options could not be read.';
  }
}

function setAdmissionOpen(open: boolean): void {
  if (!open && !admissionSubmitting.value) admissionSiteId.value = null;
}

async function submitAdmission(): Promise<void> {
  const siteId = admissionSiteId.value;
  const options = siteAgents.admissionOptions.value;
  if (!siteId || !options || options.status !== 'success' || !options.revision) return;
  admissionSubmitting.value = true;
  admissionError.value = null;
  const request: OperatorSiteAgentAdmissionWireRequest = {
    site_id: siteId,
    role: admissionRole.value,
    agent_kind: admissionAgentKind.value,
    runtime: admissionRuntime.value,
    operator_surface: admissionOperatorSurface.value,
    intelligence_policy: admissionPolicy.value,
    provider: admissionProvider.value,
    model: admissionModel.value,
    options_revision: options.revision,
  };
  try {
    const result = await siteAgents.admit(request);
    if (result.status !== 'admitted') {
      admissionError.value = result.message ?? result.reason ?? 'Agent admission was refused.';
      return;
    }
    admissionSiteId.value = null;
    actionMessage.value = `${result.agent_id ?? 'Agent'} admitted to ${siteDisplayName(siteId)}. Launch remains a separate action.`;
    await siteAgents.load();
  } catch (cause) {
    admissionError.value = cause instanceof Error ? cause.message : 'Agent admission failed.';
  } finally {
    admissionSubmitting.value = false;
  }
}
</script>

<template>
  <OperatorConsoleShell
    eyebrow="Operator Workspace"
    title="Sites and Agents"
    back-href="/"
    back-label="Back to Operator Workspace"
    navigation-key="agents"
  >
    <main class="workspace-main">
      <header class="page-header">
        <div>
          <h2>Sites and Agents</h2>
          <p>Start admitted agents in their configured surface, or choose another admitted surface.</p>
        </div>
        <button class="icon-button" type="button" title="Refresh" :disabled="siteAgents.loading.value" @click="siteAgents.load">
          <RefreshCw :size="16" aria-hidden="true" />
          <span class="sr-only">Refresh Sites and Agents</span>
        </button>
      </header>

      <div v-if="siteAgents.launchFailure.value?.failure" class="action-message error" role="alert" aria-live="assertive">
        <p class="action-message-text">{{ actionMessage }}</p>
        <details class="launch-diagnostics">
          <summary>Launch diagnostics</summary>
          <dl>
            <div><dt>Phase</dt><dd><code>{{ siteAgents.launchFailure.value.failure.phase }}</code></dd></div>
            <div><dt>Code</dt><dd><code>{{ siteAgents.launchFailure.value.failure.code }}</code></dd></div>
            <div><dt>Request</dt><dd><code>{{ siteAgents.launchFailure.value.request_id ?? 'not available' }}</code></dd></div>
            <div><dt>Artifact</dt><dd><code>{{ siteAgents.launchFailure.value.failure.diagnostic_ref ?? 'not persisted' }}</code></dd></div>
          </dl>
        </details>
      </div>
      <p v-else-if="actionMessage" class="action-message" role="status" aria-live="polite">{{ actionMessage }}</p>
      <p v-if="siteAgents.error.value" class="notice error" role="alert">{{ siteAgents.error.value }}</p>
      <p v-if="siteAgents.refusals.value.length" class="notice warning">Some authority projections are unavailable: {{ siteAgents.refusals.value.join(', ') }}</p>
      <p v-if="siteAgents.loading.value && !siteAgents.groups.value.length" class="notice">Reading Sites and agents...</p>

      <section v-for="group in siteAgents.groups.value" :key="group.id" class="site-group" :aria-labelledby="`group-${group.id}`">
        <h3 :id="`group-${group.id}`">{{ group.label }}</h3>
        <p v-if="!group.sites.length" class="empty">No Sites are registered in this group.</p>
        <div v-else class="site-grid">
          <article v-for="site in group.sites" :key="site.site_id" class="site-box" :data-site-id="site.site_id">
            <header class="site-header">
              <div>
                <h4>{{ site.display_name }}</h4>
                <code>{{ site.site_id }}</code>
              </div>
              <span class="site-kind">{{ site.site_kind.replace('_', ' ') }}</span>
            </header>
            <p v-if="!site.agents.length" class="empty compact">No agents admitted.</p>
            <div class="agent-grid">
              <div
                v-for="agent in site.agents"
                :key="agent.agent_id"
                class="agent-cell"
                :data-runtime="agent.runtime.state"
                :data-work="agent.work.state"
                @contextmenu="inspectFromPointer($event, site.site_id, agent)"
              >
                <button
                  type="button"
                  class="agent-button"
                  :disabled="busyAgentId !== null"
                  :aria-label="`${agent.agent_id}: ${agent.runtime.state}, work ${agent.work.state}`"
                  @click="startAgent(site.site_id, agent)"
                  @keydown="inspectFromKeyboard($event, site.site_id, agent)"
                >
                  <span class="agent-icon" aria-hidden="true">
                    <component :is="roleIcon(agent.role)" :size="20" />
                    <span class="state-dot" />
                  </span>
                  <span class="agent-copy">
                    <strong>{{ agent.local_agent_id }}</strong>
                    <span>{{ isStarting(site.site_id, agent) ? 'starting' : agent.work.state }}</span>
                  </span>
                </button>
                <DropdownMenu v-if="surfaceChoices(agent).length">
                  <DropdownMenuTrigger as-child>
                    <button
                      class="surface-menu-trigger"
                      type="button"
                      aria-label="Open in another operator surface"
                      @click.stop
                    >
                      <MoreHorizontal :size="14" aria-hidden="true" />
                      <span class="sr-only">Open in another operator surface</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" :side-offset="6" @click.stop>
                    <DropdownMenuItem
                      v-for="choice in surfaceChoices(agent)"
                      :key="choice.kind"
                      :disabled="choice.status !== 'available' || busyAgentId !== null"
                      :title="choice.reason ?? `Open in ${choice.label}`"
                      @select="startAgent(site.site_id, agent, choice.kind)"
                    >
                      <span>{{ choice.label }}</span>
                      <span v-if="choice.kind === agent.operator_surfaces.default_kind" class="surface-default">default</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <button
                  v-if="agent.runtime.state === 'running' || agent.runtime.state === 'degraded'"
                  type="button"
                  class="lifecycle-button stop-button"
                  :disabled="busyAgentId !== null"
                  :aria-label="`Stop ${agent.agent_id}`"
                  @click.stop="stopAgent(site.site_id, agent)"
                >
                  <CircleStop :size="13" aria-hidden="true" />
                  <span class="sr-only">Stop {{ agent.agent_id }}</span>
                </button>
                <button
                  v-if="agent.runtime.state === 'stopped'"
                  type="button"
                  class="lifecycle-button delete-button"
                  :disabled="busyAgentId !== null"
                  :aria-label="`Delete ${agent.agent_id}`"
                  @click.stop="requestDelete(site.site_id, agent)"
                >
                  <Trash2 :size="13" aria-hidden="true" />
                  <span class="sr-only">Delete {{ agent.agent_id }}</span>
                </button>
              </div>
              <button
                type="button"
                class="admission-tile"
                :disabled="busyAgentId !== null || siteAgents.admissionLoading.value"
                :aria-label="`Add an agent to ${site.display_name}`"
                @click="openAdmission(site.site_id)"
              >
                <span class="admission-plus" aria-hidden="true"><Plus :size="22" /></span>
                <span class="admission-copy sr-only">
                  <strong>Add agent</strong>
                  <span>Governed admission</span>
                </span>
              </button>
            </div>
          </article>
        </div>
      </section>
    </main>

    <Dialog :open="admissionSiteId !== null" @update:open="setAdmissionOpen">
      <DialogContent class="admission-dialog">
        <DialogHeader>
          <DialogTitle>Add agent to {{ admissionSiteId ? siteDisplayName(admissionSiteId) : 'Site' }}</DialogTitle>
          <DialogDescription>
            Select from current Site authority. Admission creates the identity and launch record; it does not start a runtime.
          </DialogDescription>
        </DialogHeader>

        <p v-if="siteAgents.admissionLoading.value" class="admission-state">Reading authoritative admission options…</p>
        <p v-if="admissionError" class="admission-state error" role="alert">{{ admissionError }}</p>
        <form v-if="siteAgents.admissionOptions.value?.status === 'success'" class="admission-form" @submit.prevent="submitAdmission">
          <label>
            <span>Role</span>
            <select v-model="admissionRole" required :disabled="admissionSubmitting">
              <option v-for="option in siteAgents.admissionOptions.value.roles" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label>
            <span>Agent kind</span>
            <select v-model="admissionAgentKind" required :disabled="admissionSubmitting">
              <option v-for="option in siteAgents.admissionOptions.value.agent_kinds" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label>
            <span>Runtime</span>
            <select v-model="admissionRuntime" required :disabled="admissionSubmitting">
              <option v-for="option in siteAgents.admissionOptions.value.runtimes" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label>
            <span>Operator surface</span>
            <select v-model="admissionOperatorSurface" required :disabled="admissionSubmitting">
              <option v-for="option in siteAgents.admissionOptions.value.operator_surfaces" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label>
            <span>Intelligence policy</span>
            <select v-model="admissionPolicy" required :disabled="admissionSubmitting">
              <option v-for="option in siteAgents.admissionOptions.value.intelligence.policy_choices" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label>
            <span>Provider representation</span>
            <select v-model="admissionProvider" required :disabled="admissionSubmitting">
              <option v-for="option in siteAgents.admissionOptions.value.intelligence.provider_choices" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label>
            <span>Model representation</span>
            <select v-model="admissionModel" required :disabled="admissionSubmitting">
              <option v-for="option in siteAgents.admissionOptions.value.intelligence.model_choices" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <p class="admission-authority">Provider and model are display choices only. Runtime invocation resolves intelligence through the Site catalog and materialized policy.</p>
          <DialogFooter>
            <DialogClose as-child>
              <button type="button" class="secondary-button" :disabled="admissionSubmitting">Cancel</button>
            </DialogClose>
            <button type="submit" class="primary-button" :disabled="admissionSubmitting || siteAgents.admissionLoading.value">
              {{ admissionSubmitting ? 'Admitting…' : 'Admit agent' }}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog :open="deleteTarget !== null" @update:open="setDeleteOpen">
      <DialogContent class="admission-dialog">
        <DialogHeader>
          <DialogTitle>Delete {{ deleteTarget?.agent.agent_id }}?</DialogTitle>
          <DialogDescription>
            This removes the Site launch admission and operator-surface identity. Session evidence and artifacts are preserved.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose as-child>
            <button type="button" class="secondary-button" :disabled="siteAgents.lifecycleLoading.value">Cancel</button>
          </DialogClose>
          <button type="button" class="danger-button" :disabled="siteAgents.lifecycleLoading.value" @click="confirmDelete">
            {{ siteAgents.lifecycleLoading.value ? 'Deleting…' : 'Delete admission' }}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

  </OperatorConsoleShell>
</template>

<style scoped>
.workspace-main { max-width: 1280px; margin: 0 auto; padding: 22px 20px 40px; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.page-header h2 { margin: 0; font-size: 17px; font-weight: 650; letter-spacing: 0; }
.page-header p { margin: 5px 0 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
.icon-button { display: inline-grid; width: 34px; height: 34px; place-items: center; flex: 0 0 34px; border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--surface); color: var(--text); cursor: pointer; }
.icon-button:hover:not(:disabled) { border-color: var(--operator); background: var(--surface-muted); }
.icon-button:disabled { cursor: wait; opacity: .6; }
.action-message, .notice, .empty { margin: 0 0 14px; color: var(--muted); font-size: 12px; line-height: 1.45; }
.action-message, .notice { padding: 9px 11px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.action-message.error { color: var(--danger); }
.action-message-text { margin: 0; }
.launch-diagnostics { margin-top: 9px; color: var(--muted); }
.launch-diagnostics summary { cursor: pointer; font-weight: 650; }
.launch-diagnostics dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 5px 12px; margin: 9px 0 0; }
.launch-diagnostics dl div { display: contents; }
.launch-diagnostics dt { font-weight: 650; }
.launch-diagnostics dd { margin: 0; overflow-wrap: anywhere; }
.launch-diagnostics code { font: 11px/1.35 var(--mono); }
.notice.error { color: var(--danger); }
.notice.warning { background: var(--surface-muted); }
.site-group { margin-top: 24px; }
.site-group > h3 { margin: 0 0 10px; color: var(--muted); font-size: 12px; font-weight: 650; letter-spacing: 0; text-transform: uppercase; }
.site-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 330px), 1fr)); gap: 12px; }
.site-box { min-width: 0; padding: 14px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.site-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
.site-header h4 { margin: 0; font-size: 14px; font-weight: 650; letter-spacing: 0; }
.site-header code { display: block; margin-top: 3px; color: var(--muted); font: 11px/1.3 var(--mono); overflow-wrap: anywhere; }
.site-kind { flex: 0 0 auto; color: var(--muted); font-size: 11px; text-transform: capitalize; }
.agent-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(116px, 1fr)); gap: 3px 8px; padding-top: 10px; }
.agent-cell { position: relative; min-width: 0; border-radius: var(--radius); }
.agent-cell:hover { background: var(--surface-muted); }
.agent-button { display: flex; width: 100%; min-height: 58px; align-items: center; gap: 9px; padding: 7px; border: 0; border-radius: var(--radius); background: transparent; color: var(--text); text-align: left; cursor: pointer; }
.agent-button:disabled { cursor: default; opacity: .62; }
.agent-icon { position: relative; display: inline-grid; width: 34px; height: 34px; place-items: center; flex: 0 0 34px; border: 1px solid var(--line); border-radius: 50%; background: var(--surface); }
.state-dot { position: absolute; right: -1px; bottom: 1px; width: 9px; height: 9px; border: 2px solid var(--surface); border-radius: 50%; background: var(--muted); }
.agent-cell[data-runtime="running"] .state-dot { background: var(--success, #18794e); }
.agent-cell[data-runtime="degraded"] .state-dot { background: var(--warning, #996500); }
.agent-cell[data-runtime="ambiguous"] .state-dot { background: var(--danger, #b42318); }
.agent-cell[data-work="executing"] .agent-icon,
.agent-cell[data-work="claiming"] .agent-icon { border-color: var(--operator); box-shadow: 0 0 0 2px var(--activity-chip-bg); }
.agent-copy { display: grid; min-width: 0; gap: 2px; }
.agent-copy strong, .agent-copy span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agent-copy strong { font-size: 12px; font-weight: 650; }
.agent-copy span { color: var(--muted); font-size: 10px; }
.surface-menu-trigger { position: absolute; right: 2px; bottom: 2px; z-index: 2; display: grid; width: 24px; height: 22px; place-items: center; border: 0; border-radius: 5px; padding: 0; background: transparent; color: var(--muted); cursor: pointer; }
.surface-menu-trigger:hover { background: var(--surface); color: var(--text); }
.surface-menu-trigger:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
.surface-default { color: var(--muted); font-size: 9px; }
.lifecycle-button { position: absolute; top: 2px; z-index: 2; display: grid; width: 24px; height: 22px; place-items: center; border: 0; border-radius: 5px; padding: 0; background: transparent; cursor: pointer; }
.lifecycle-button:disabled { cursor: wait; opacity: .55; }
.lifecycle-button:hover:not(:disabled) { background: var(--surface); }
.stop-button { right: 26px; color: var(--warning, #996500); }
.delete-button { right: 2px; color: var(--danger, #b42318); }
.lifecycle-button:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
.admission-tile { display: grid; width: 58px; height: 58px; min-height: 58px; place-items: center; padding: 0; border: 1px dashed var(--line-strong); border-radius: 50%; background: transparent; color: var(--muted); cursor: pointer; }
.admission-tile:hover:not(:disabled) { border-color: var(--operator); background: var(--surface-muted); color: var(--text); }
.admission-tile:disabled { cursor: wait; opacity: .55; }
.admission-tile:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.admission-plus { display: inline-grid; width: 34px; height: 34px; place-items: center; }
.admission-dialog { width: min(560px, calc(100vw - 28px)); }
.admission-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px 12px; margin-top: 18px; }
.admission-form label { display: grid; gap: 5px; min-width: 0; }
.admission-form label > span { color: var(--muted); font-size: 11px; font-weight: 650; }
.admission-form select { min-width: 0; height: 34px; border: 1px solid var(--line-strong); border-radius: var(--radius); padding: 0 8px; background: var(--surface); color: var(--text); font: inherit; font-size: 12px; }
.admission-form select:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
.admission-form select:disabled { cursor: wait; opacity: .65; }
.admission-authority { grid-column: 1 / -1; margin: 0; color: var(--muted); font-size: 11px; line-height: 1.45; }
.admission-state { margin: 18px 0 0; color: var(--muted); font-size: 12px; line-height: 1.45; }
.admission-state.error { color: var(--danger); }
.primary-button, .secondary-button { min-height: 34px; border: 1px solid var(--line-strong); border-radius: var(--radius); padding: 0 12px; font: inherit; font-size: 12px; cursor: pointer; }
.primary-button { border-color: var(--operator); background: var(--operator); color: white; }
.secondary-button { background: var(--surface); color: var(--text); }
.danger-button { min-height: 34px; border: 1px solid var(--danger, #b42318); border-radius: var(--radius); padding: 0 12px; background: var(--danger, #b42318); color: white; font: inherit; font-size: 12px; cursor: pointer; }
.primary-button:disabled, .secondary-button:disabled { cursor: wait; opacity: .6; }
.danger-button:disabled { cursor: wait; opacity: .6; }
.empty.compact { margin: 12px 0 0; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
@media (max-width: 700px) { .workspace-main { padding: 18px 12px 28px; } .site-grid { grid-template-columns: 1fr; } .admission-form { grid-template-columns: 1fr; } .admission-authority { grid-column: auto; } }
</style>
