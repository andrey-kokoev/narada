import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TASK_LIFECYCLE_TOOL_ALIASES, taskLifecycleDomainTools } from '../../src/task-lifecycle-mcp-contract.js';
import { listOutputTools, listPayloadTools } from '../../runtime/mcp-payload-file.mjs';
import {
  assertTaskLifecycleHandlerCoverage,
  createTaskLifecycleHandlerRegistry,
  PAYLOAD_OUTPUT_TOOL_NAMES,
} from '../../runtime/task-lifecycle/task-lifecycle-handler-registry.mjs';
import { TASK_LIFECYCLE_ADMIN_TOOL_NAMES } from '../../runtime/task-lifecycle/task-lifecycle-admin-handlers.mjs';
import { TASK_LIFECYCLE_READ_TOOL_NAMES } from '../../runtime/task-lifecycle/task-lifecycle-read-handlers.mjs';
import { TASK_LIFECYCLE_ASSIGNMENT_TOOL_NAMES } from '../../runtime/task-lifecycle/task-lifecycle-assignment-handlers.mjs';
import { TASK_LIFECYCLE_NAVIGATION_TOOL_NAMES } from '../../runtime/task-lifecycle/task-lifecycle-navigation-handlers.mjs';
import { TASK_LIFECYCLE_INSPECTION_TOOL_NAMES } from '../../runtime/task-lifecycle/task-lifecycle-inspection-handlers.mjs';
import { TASK_LIFECYCLE_EVIDENCE_REVIEW_TOOL_NAMES } from '../../runtime/task-lifecycle/task-lifecycle-evidence-review-handlers.mjs';
import { TASK_LIFECYCLE_OPERATIONS_TOOL_NAMES } from '../../runtime/task-lifecycle/task-lifecycle-operations-handlers.mjs';
import { TASK_LIFECYCLE_CREATE_RECURRING_TOOL_NAMES } from '../../runtime/task-lifecycle/task-lifecycle-create-recurring-handlers.mjs';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

describe('task lifecycle handler registry', () => {
  it('covers every exposed task lifecycle MCP tool explicitly', () => {
    const toolNames = [
      ...taskLifecycleDomainTools().map((tool) => tool.name),
      ...listPayloadTools().map((tool) => tool.name),
      ...listOutputTools().map((tool) => tool.name),
    ];
    const domainToolNames = taskLifecycleDomainTools().map((tool) => tool.name);
    const explicitToolNames = [
      ...PAYLOAD_OUTPUT_TOOL_NAMES,
      ...TASK_LIFECYCLE_ADMIN_TOOL_NAMES,
      ...TASK_LIFECYCLE_READ_TOOL_NAMES,
      ...TASK_LIFECYCLE_ASSIGNMENT_TOOL_NAMES,
      ...TASK_LIFECYCLE_NAVIGATION_TOOL_NAMES,
      ...TASK_LIFECYCLE_INSPECTION_TOOL_NAMES,
      ...TASK_LIFECYCLE_EVIDENCE_REVIEW_TOOL_NAMES,
      ...TASK_LIFECYCLE_OPERATIONS_TOOL_NAMES,
      ...TASK_LIFECYCLE_CREATE_RECURRING_TOOL_NAMES,
    ];
    const handlers = createTaskLifecycleHandlerRegistry({
      toolNames,
      domainDispatch: (name: string) => ({ status: 'domain', name }),
      explicitHandlers: Object.fromEntries(explicitToolNames.map((name) => [name, () => ({ status: 'explicit', name })])),
    });
    const missingAfterNormalization = toolNames
      .map((name) => TASK_LIFECYCLE_TOOL_ALIASES[name] ?? name)
      .filter((name) => !explicitToolNames.includes(name) && !domainToolNames.includes(name));

    expect(assertTaskLifecycleHandlerCoverage({ toolNames, handlers })).toMatchObject({ status: 'ok', missing: [] });
    expect(missingAfterNormalization).toEqual([]);
  });

  it('routes payload/output tools outside the domain dispatcher', async () => {
    const handlers = createTaskLifecycleHandlerRegistry({
      toolNames: ['task_lifecycle_list', 'mcp_output_show'],
      domainDispatch: (name: string) => ({ status: 'domain', name }),
      payloadOutputHandlers: {
        mcp_output_show: () => ({ status: 'payload_output' }),
      },
    });

    expect(await Promise.resolve(handlers.get('task_lifecycle_list')?.({}))).toEqual({ status: 'domain', name: 'task_lifecycle_list' });
    expect(await Promise.resolve(handlers.get('mcp_output_show')?.({}))).toEqual({ status: 'payload_output' });
  });

  it('keeps all tool dispatch cases out of the server runtime shell', () => {
    const server = readFileSync(join(repoRoot, 'packages/task-governance/runtime/task-lifecycle/task-mcp-server.mjs'), 'utf8');
    expect(server).not.toMatch(/case 'task_lifecycle_/);
    expect(server).not.toMatch(/case 'mcp_/);
    for (const toolName of [...PAYLOAD_OUTPUT_TOOL_NAMES, ...TASK_LIFECYCLE_ADMIN_TOOL_NAMES, ...TASK_LIFECYCLE_READ_TOOL_NAMES, ...TASK_LIFECYCLE_ASSIGNMENT_TOOL_NAMES, ...TASK_LIFECYCLE_NAVIGATION_TOOL_NAMES, ...TASK_LIFECYCLE_INSPECTION_TOOL_NAMES, ...TASK_LIFECYCLE_EVIDENCE_REVIEW_TOOL_NAMES, ...TASK_LIFECYCLE_OPERATIONS_TOOL_NAMES, ...TASK_LIFECYCLE_CREATE_RECURRING_TOOL_NAMES]) {
      expect(server).not.toContain(`case '${toolName}'`);
    }
  });
});
