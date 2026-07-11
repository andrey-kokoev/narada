export type SessionPanelId =
  | 'runtime_topology'
  | 'mcp'
  | 'generic_affordance'
  | 'artifacts'
  | 'delegation'
  | 'git'
  | 'inbox'
  | 'mailbox'
  | 'scheduler'
  | 'sop'
  | 'surface_feedback'
  | 'task_lifecycle';

export interface SessionPanelCapabilityContext {
  artifactBasePath: string | null;
  surfaceKinds: readonly string[];
  genericAffordanceCount: number;
}

export interface SessionPanelRegistration {
  id: SessionPanelId;
  label: string;
  preferenceKey: string;
  unavailableMessage: string;
  isAvailable: (context: SessionPanelCapabilityContext) => boolean;
}

const surfacePanel = (
  id: Exclude<SessionPanelId, 'runtime_topology' | 'mcp' | 'generic_affordance' | 'artifacts'>,
  label: string,
): SessionPanelRegistration => ({
  id,
  label,
  preferenceKey: `narada:agent-web-ui:panel:${id}:open.v1`,
  unavailableMessage: `${label} capability is not advertised by the attached runtime.`,
  isAvailable: (context) => context.surfaceKinds.includes(id),
});

export const SESSION_PANEL_REGISTRY: readonly SessionPanelRegistration[] = [
  {
    id: 'runtime_topology',
    label: 'Connection',
    preferenceKey: 'narada:agent-web-ui:panel:runtime-topology:open.v1',
    unavailableMessage: 'Runtime topology is not advertised by the attached runtime.',
    isAvailable: () => true,
  },
  {
    id: 'mcp',
    label: 'MCP Catalog',
    preferenceKey: 'narada:agent-web-ui:panel:mcp:open.v1',
    unavailableMessage: 'MCP inventory is not advertised by the attached runtime.',
    isAvailable: () => true,
  },
  {
    id: 'generic_affordance',
    label: 'MCP Surface',
    preferenceKey: 'narada:agent-web-ui:panel:generic-affordance:open.v1',
    unavailableMessage: 'No generic MCP surface affordances are advertised by the attached runtime.',
    isAvailable: (context) => context.genericAffordanceCount > 0,
  },
  {
    id: 'artifacts',
    label: 'Artifacts',
    preferenceKey: 'narada:agent-web-ui:panel:artifacts:open.v1',
    unavailableMessage: 'Artifact access is not advertised by the attached runtime.',
    isAvailable: (context) => Boolean(context.artifactBasePath),
  },
  surfacePanel('delegation', 'Delegation'),
  surfacePanel('git', 'Git'),
  surfacePanel('inbox', 'Inbox'),
  surfacePanel('mailbox', 'Email'),
  surfacePanel('scheduler', 'Scheduler'),
  surfacePanel('sop', 'SOP'),
  surfacePanel('surface_feedback', 'Surface Feedback'),
  surfacePanel('task_lifecycle', 'Tasks'),
];

export function isSessionPanelAvailable(
  id: SessionPanelId,
  context: SessionPanelCapabilityContext,
): boolean {
  return SESSION_PANEL_REGISTRY.find((panel) => panel.id === id)?.isAvailable(context) ?? false;
}

export function availableSessionPanelIds(
  context: SessionPanelCapabilityContext,
): SessionPanelId[] {
  return SESSION_PANEL_REGISTRY
    .filter((panel) => panel.isAvailable(context))
    .map((panel) => panel.id);
}
