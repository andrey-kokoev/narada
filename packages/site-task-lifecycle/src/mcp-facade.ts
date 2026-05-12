import { resolve } from 'node:path';
import type { JsonSchemaObject, McpFacadeBinding } from './types.js';

const stringSchema: JsonSchemaObject = { type: 'string' };
const stringArraySchema: JsonSchemaObject = { type: 'array', items: stringSchema };

export function createSiteTaskLifecycleMcpFacadeBinding(siteRoot: string): McpFacadeBinding {
  return {
    schema: 'narada.site_task_lifecycle.mcp_facade_binding.v0',
    packageName: '@narada2/site-task-lifecycle',
    siteRoot: resolve(siteRoot),
    transport: 'descriptor_only',
    tools: [
      {
        name: 'site_task_lifecycle.plan_init',
        description: 'Plan receiving-Site task lifecycle paths and schema without importing source state.',
        inputSchema: {
          type: 'object',
          required: ['siteRoot'],
          additionalProperties: false,
          properties: {
            siteRoot: stringSchema,
            sourceImportRefs: stringArraySchema,
          },
        },
      },
      {
        name: 'site_task_lifecycle.project_inbox_envelope',
        description: 'Project one admitted inbox envelope into a pending task candidate.',
        inputSchema: {
          type: 'object',
          required: ['envelopeId', 'sourceSite', 'sourceRef', 'receivedAt', 'summary'],
          additionalProperties: false,
          properties: {
            envelopeId: stringSchema,
            sourceSite: stringSchema,
            sourceRef: stringSchema,
            receivedAt: stringSchema,
            summary: stringSchema,
            bodyText: stringSchema,
            evidencePaths: stringArraySchema,
          },
        },
      },
      {
        name: 'site_task_lifecycle.build_task_db_init_plan',
        description: 'Return neutral task lifecycle schema statements for a receiving-Site task DB.',
        inputSchema: {
          type: 'object',
          required: ['taskDbPath'],
          additionalProperties: false,
          properties: {
            taskDbPath: stringSchema,
            sourceImportRefs: stringArraySchema,
          },
        },
      },
      {
        name: 'site_task_lifecycle.build_task_admission_write_request',
        description: 'Describe task admission write operations for a separately admitted adapter.',
        inputSchema: {
          type: 'object',
          required: ['taskDbPath', 'candidate', 'admittedBy', 'admittedAt'],
          additionalProperties: false,
          properties: {
            taskDbPath: stringSchema,
            candidate: { type: 'object' },
            admittedBy: { type: 'object' },
            admittedAt: stringSchema,
          },
        },
      },
    ],
    deniedLiveEffects: [
      'live MCP transport registration',
      'source inbox database import',
      'source task database import',
      'source task history import',
      'operator-surface or PC-locus state import',
      'secret or credential import',
    ],
  };
}
