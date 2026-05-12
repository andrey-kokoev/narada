import type { CrewStartupShortcutRequest } from '../../src/index.js';

export const validMcpOnlyStartupRequest: CrewStartupShortcutRequest = {
  schema: 'narada.crew_startup_shortcut.request.v0',
  requestId: 'crew-startup-neutral-001',
  trigger: 'operator_requested_startup',
  targetLocus: 'project_site',
  targetSiteId: 'project-alpha',
  requestedBy: 'operator.fixture',
  roleNames: ['architect', 'builder'],
  namedAgentIds: ['project-alpha.agent.architect', 'project-alpha.agent.builder'],
  mcpOnly: true,
  requiredMcpSurfaces: [
    {
      surfaceId: 'site_task_lifecycle.local',
      tools: ['site_task_lifecycle.read_task'],
      required: true,
    },
    {
      surfaceId: 'agent_context_memory.local',
      tools: ['agent_context_memory.plan_hydration'],
      required: true,
    },
  ],
  workboardEvidenceRefs: ['fixture:workboard:ready'],
  hydrationEvidenceRefs: ['fixture:hydration:checkpoint-summary'],
  sourceRefs: ['fixture:create-site-template'],
  sourcePaths: [],
};

export const nativeShortcutFallbackRequest: CrewStartupShortcutRequest = {
  ...validMcpOnlyStartupRequest,
  requestId: 'crew-startup-neutral-refusal-001',
  directNativeShortcutRequested: true,
  sourcePaths: [
    'C:\\Users\\Andrey\\Narada\\.crew\\start-builder.lnk',
    'C:\\Users\\Andrey\\Narada\\.ai\\checkpoints\\latest.json',
  ],
};
