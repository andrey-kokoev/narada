import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMcpSurfaceAffordanceProjection } from './surface-affordances.mjs';

test('surface affordance projection advertises SOP panel from live MCP tool inventory', () => {
  const projection = buildMcpSurfaceAffordanceProjection({
    'narada-test-sop': {
      tools: [
        { name: 'sop_template_list' },
        { name: 'sop_run_list' },
        { name: 'sop_doctor' },
      ],
      config: { surface_id: 'test.sop' },
    },
  });

  assert.equal(projection.schema, 'narada.nars.surface_affordances.v1');
  assert.equal(projection.count, 1);
  assert.deepEqual(projection.items[0], {
    schema: 'narada.mcp_surface.operator_affordance.v1',
    surface_kind: 'sop',
    surface_id: 'test.sop',
    server_name: 'narada-test-sop',
    source: 'live_tool_inventory',
    renderer: 'sop_catalog_and_runs',
    title: 'SOP',
    panel: {
      kind: 'catalog_and_runs',
      title: 'SOP',
      summary_method: 'session.sop.summary',
      sections: ['active_run', 'templates', 'recent_runs', 'run_steps'],
    },
    actions: {
      read: ['refresh', 'open_template', 'open_run'],
      run: [],
    },
    tools: {
      read: ['sop_template_list', 'sop_run_list'],
      doctor: 'sop_doctor',
    },
  });
});

test('surface affordance projection admits static MCP surface presentation metadata', () => {
  const projection = buildMcpSurfaceAffordanceProjection({
    'narada-test-inbox': {
      tools: [{ name: 'inbox_list' }],
      config: {
        surface_id: 'test.inbox',
        operator_affordances: [{
          surface_kind: 'inbox',
          title: 'Inbox',
          renderer: 'record_list',
          panel: {
            kind: 'record_list',
            title: 'Inbox',
            summary_method: 'session.inbox.summary',
            sections: ['items'],
          },
          actions: { read: ['refresh', 'open_item'], write: [] },
          tools: { read: ['inbox_list'] },
        }],
      },
    },
  });

  assert.equal(projection.count, 1);
  assert.equal(projection.items[0].surface_kind, 'inbox');
  assert.equal(projection.items[0].surface_id, 'test.inbox');
  assert.equal(projection.items[0].server_name, 'narada-test-inbox');
  assert.equal(projection.items[0].source, 'mcp_server_config');
  assert.deepEqual(projection.items[0].panel, {
    kind: 'record_list',
    title: 'Inbox',
    summary_method: 'session.inbox.summary',
    sections: ['items'],
  });
  assert.deepEqual(projection.items[0].actions, { read: ['refresh', 'open_item'], write: [] });
  assert.deepEqual(projection.items[0].tools, { read: ['inbox_list'] });
});

test('surface affordance projection admits live MCP tool-list affordance metadata', () => {
  const projection = buildMcpSurfaceAffordanceProjection({
    'narada-test-artifacts': {
      tools: [{
        name: 'artifact_list',
        annotations: {
          operator_affordances: [{
            surface_kind: 'artifacts',
            title: 'Artifacts',
            renderer: 'artifact_list',
            panel: { kind: 'artifact_list', summary_method: 'session.artifacts.read', sections: ['items'] },
          }],
        },
      }],
      config: { surface_id: 'test.artifacts' },
    },
  });

  assert.equal(projection.count, 1);
  assert.equal(projection.items[0].surface_kind, 'artifacts');
  assert.equal(projection.items[0].source, 'mcp_tool_list');
  assert.equal(projection.items[0].panel.summary_method, 'session.artifacts.read');
});
