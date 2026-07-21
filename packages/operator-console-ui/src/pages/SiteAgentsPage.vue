<script setup lang="ts">
import { ref, type Component } from 'vue';
import type {
  OperatorSiteAgentLaunchFailureWireRecord,
  OperatorSiteAgentWireRecord,
} from '@narada2/operator-console-contract';
import {
  Bot,
  Compass,
  Hammer,
  RefreshCw,
  ScanSearch,
  UserRound,
} from 'lucide-vue-next';
import OperatorConsoleShell from '../components/OperatorConsoleShell.vue';
import { findOperatorRouteTarget } from '../console/routes';
import { useOperatorWorkspaceRouteDirectory } from '../console/route-directory';
import { useSiteAgents } from '../site-agents/composables/useSiteAgents';
import { decideAgentInspection, decideAgentPrimaryAction } from '../site-agents/interactions';
import {
  buildFailureProjectionDocument,
  buildPendingProjectionDocument,
  scopedAgentSessionsPath,
} from '../site-agents/projection-handoff';

const siteAgents = useSiteAgents();
const routeDirectory = useOperatorWorkspaceRouteDirectory();
const busyAgentId = ref<string | null>(null);
const actionMessage = ref<string | null>(null);

const roleIcons: Record<string, Component> = {
  resident: UserRound,
  architect: Compass,
  builder: Hammer,
  reviewer: ScanSearch,
};

function roleIcon(role: string): Component {
  return roleIcons[role.toLowerCase()] ?? Bot;
}

function sessionUrl(sessionId: string): string | null {
  const directory = routeDirectory?.directory.value;
  return directory ? findOperatorRouteTarget(directory, { kind: 'session', id: sessionId }) : null;
}

async function openSession(sessionId: string, target?: Window | null): Promise<boolean> {
  let url = sessionUrl(sessionId);
  if (!url && routeDirectory) {
    await routeDirectory.load();
    url = sessionUrl(sessionId);
  }
  if (!url) return false;
  if (target && !target.closed) target.location.replace(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
  return true;
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

async function startAgent(siteId: string, agent: OperatorSiteAgentWireRecord): Promise<void> {
  if (busyAgentId.value) return;
  const decision = decideAgentPrimaryAction(agent);
  if (decision.kind === 'unavailable') {
    actionMessage.value = decision.reason;
    return;
  }
  const target = pendingProjectionWindow(agent.agent_id);
  busyAgentId.value = agent.agent_id;
  actionMessage.value = `Starting ${agent.agent_id}...`;
  try {
    const result = await siteAgents.launch(siteId, agent.agent_id);
    if (result.status === 'refused' || result.status === 'failed') {
      if (result.status === 'failed') {
        const failure = result.failure ?? {
          phase: 'workspace_launch' as const,
          code: result.reason ?? 'workspace_launch_failed',
          message: result.reason ?? `Could not start ${agent.agent_id}.`,
          diagnostic_ref: null,
        };
        driveFailureWindow(target, siteId, agent.agent_id, result.request_id, failure);
        actionMessage.value = failure.message;
      } else {
        target?.close();
        actionMessage.value = result.reason ?? `Could not start ${agent.agent_id}.`;
      }
      return;
    }
    if (result.status === 'reused' && result.session_id && await openSession(result.session_id, target)) {
      actionMessage.value = `Opened ${agent.agent_id}.`;
      return;
    }
    drivePendingWindow(target, siteId, agent, result.session_id);
    actionMessage.value = `${agent.agent_id} started. Its Web UI opens when the route is ready.`;
  } catch (cause) {
    const failed = siteAgents.launchFailure.value;
    if (failed?.failure) {
      driveFailureWindow(target, siteId, agent.agent_id, failed.request_id, failed.failure);
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
    if (await openSession(decision.sessionId, target)) {
      actionMessage.value = `Opened ${agent.agent_id}.`;
      return;
    }
    target?.close();
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
          <p>Start admitted agents and open the Web UI for a healthy runtime session.</p>
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
          <article v-for="site in group.sites" :key="site.site_id" class="site-box">
            <header class="site-header">
              <div>
                <h4>{{ site.display_name }}</h4>
                <code>{{ site.site_id }}</code>
              </div>
              <span class="site-kind">{{ site.site_kind.replace('_', ' ') }}</span>
            </header>
            <p v-if="!site.agents.length" class="empty compact">No agents admitted.</p>
            <div v-else class="agent-grid">
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
              </div>
            </div>
          </article>
        </div>
      </section>
    </main>

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
.empty.compact { margin: 12px 0 0; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
@media (max-width: 700px) { .workspace-main { padding: 18px 12px 28px; } .site-grid { grid-template-columns: 1fr; } }
</style>
