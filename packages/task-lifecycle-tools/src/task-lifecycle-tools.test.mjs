import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createInterface } from 'node:readline';
import { spawnTestChild } from '@narada2/process-launch-posture';
import { checkTaskRoleEligibilityLocal } from './agent-role-resolution.mjs';
import { resolveTaskRolePolicy } from './task-role-policy.mjs';
import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';

const root = dirname(fileURLToPath(import.meta.url));

test('task lifecycle tool package owns executable lifecycle scripts', async () => {
  const files = (await readdir(root)).filter((name) => /\.(mjs|ps1)$/i.test(name));
  assert.ok(files.length >= 60, `expected task lifecycle scripts, got ${files.length}`);
  assert.ok(files.includes('task-mcp-server.mjs'));
  assert.ok(files.includes('task-create.mjs'));
  assert.ok(files.includes('task-finish.mjs'));
  for (const file of files) {
    const text = await readFile(join(root, file), 'utf8');
    assert.notEqual(text.trim(), '', `${file} has content`);
  }
});

test('task role policy resolves host, user site, site, and task scopes observably', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-role-policy-'));
  const hostPath = join(root, 'host.json');
  const userRoot = join(root, 'user-site');
  const siteRoot = join(root, 'work-site');
  await mkdir(join(userRoot, '.narada'), { recursive: true });
  await mkdir(join(siteRoot, '.narada'), { recursive: true });
  await writeFile(hostPath, JSON.stringify({ schema: 'narada.host.v0', task_lifecycle: { role_enforcement: 'off' } }));
  await writeFile(join(userRoot, '.narada', 'site.json'), JSON.stringify({ schema: 'narada.site.v0', task_lifecycle: { role_enforcement: 'warn' } }));
  await writeFile(join(siteRoot, '.narada', 'site.json'), JSON.stringify({ schema: 'narada.site.v0', task_lifecycle: { role_enforcement: 'strict' } }));

  const policy = resolveTaskRolePolicy({
    siteRoot,
    taskSpec: { claim_policy: { role_enforcement: 'off' } },
    env: { NARADA_HOST_CONFIG_PATH: hostPath, NARADA_USER_SITE_ROOT: userRoot },
  });

  assert.equal(policy.role_enforcement, 'off');
  assert.equal(policy.effective_scope, 'task');
  assert.deepEqual(
    policy.chain.filter((entry) => entry.status === 'applied').map((entry) => [entry.scope, entry.value]),
    [['product_default', 'strict'], ['host', 'off'], ['user_site', 'warn'], ['site', 'strict'], ['task', 'off']]
  );
});

test('site task role enforcement warn makes target_role mismatch claimable with diagnostics', async () => {
  const siteRoot = await mkdtemp(join(tmpdir(), 'narada-role-policy-site-'));
  await mkdir(join(siteRoot, '.narada'), { recursive: true });
  await writeFile(join(siteRoot, '.narada', 'site.json'), JSON.stringify({ schema: 'narada.site.v0', task_lifecycle: { role_enforcement: 'warn' } }));
  const store = fakeRoleStore({ agentRole: 'architect', targetRole: 'builder' });

  const eligibility = checkTaskRoleEligibilityLocal({ store, siteRoot, taskId: 'task-1', taskNumber: 1, agentId: 'agent.architect' });

  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.warningKind, 'target_role_mismatch');
  assert.equal(eligibility.rolePolicy.role_enforcement, 'warn');
  assert.equal(eligibility.roleMismatchWarning.severity, 'warning');
});

test('task role enforcement strict blocks target_role mismatch even when site warns', async () => {
  const siteRoot = await mkdtemp(join(tmpdir(), 'narada-role-policy-task-'));
  await mkdir(join(siteRoot, '.narada'), { recursive: true });
  await writeFile(join(siteRoot, '.narada', 'site.json'), JSON.stringify({ schema: 'narada.site.v0', task_lifecycle: { role_enforcement: 'warn' } }));
  const store = fakeRoleStore({
    agentRole: 'architect',
    targetRole: 'builder',
    taskSpec: { claim_policy: { role_enforcement: 'strict' } },
  });

  const eligibility = checkTaskRoleEligibilityLocal({ store, siteRoot, taskId: 'task-1', taskNumber: 1, agentId: 'agent.architect' });

  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.rolePolicy.role_enforcement, 'strict');
  assert.equal(eligibility.rolePolicy.effective_scope, 'task');
  assert.equal(eligibility.roleMismatchWarning.severity, 'blocker');
});

test('governance MCP exposes and executes reference diagnosis and dependency disposition', async () => {
  const siteRoot = await mkdtemp(join(tmpdir(), 'narada-task-mcp-governance-'));
  await mkdir(join(siteRoot, '.ai'), { recursive: true });
  const now = '2026-07-14T00:00:00.000Z';
  const store = openTaskLifecycleStore(siteRoot);
  try {
    for (const [task_id, task_number] of [['parent-task', 1], ['required-task', 2]]) {
      store.upsertLifecycle({
        task_id,
        task_number,
        status: 'opened',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: now,
      });
    }
    store.upsertTaskDependency({
      dependency_id: 'dependency-1',
      parent_task_id: 'parent-task',
      required_task_id: 'required-task',
      kind: 'review',
      satisfying_outcomes_json: JSON.stringify(['accepted', 'accepted_with_notes']),
      status: 'open',
      created_by: 'agent.test',
      created_at: now,
    });
    store.upsertTaskOutcomeContract({
      contract_id: 'contract-1',
      task_id: 'required-task',
      outcome_type: 'review',
      allowed_outcomes_json: JSON.stringify(['accepted', 'accepted_with_notes', 'rejected']),
      satisfying_outcomes_json: JSON.stringify(['accepted', 'accepted_with_notes']),
      blocking_outcomes_json: JSON.stringify(['rejected']),
      required_fields_json: JSON.stringify(['summary']),
      capability_requirement: 'review',
      created_by: 'agent.test',
      created_at: now,
    });
    store.insertTaskOutcome({
      outcome_id: 'outcome-1',
      task_id: 'required-task',
      contract_id: 'contract-1',
      agent_id: 'agent.test',
      outcome: 'rejected',
      summary: 'Needs an explicit disposition.',
      findings_json: JSON.stringify([{ severity: 'blocking', description: 'Review rejected.' }]),
      evidence_refs_json: JSON.stringify([]),
      admitted_at: now,
    });
  } finally {
    store.db.close();
  }

  const server = spawnTestChild(process.execPath, [join(root, 'task-mcp-server.mjs'), '--site-root', siteRoot], {
    cwd: root,
    env: { ...process.env, NARADA_AGENT_ID: 'agent.test' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const output = createInterface({ input: server.stdout });
  const responses = [];
  const waiters = [];
  let stderr = '';
  server.stderr.setEncoding('utf8');
  server.stderr.on('data', (chunk) => { stderr += chunk; });
  output.on('line', (line) => {
    const response = JSON.parse(line);
    const waiter = waiters.shift();
    if (waiter) waiter(response);
    else responses.push(response);
  });
  const nextResponse = () => {
    if (responses.length > 0) return Promise.resolve(responses.shift());
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`MCP response timeout: ${stderr}`)), 3000);
      waiters.push((response) => {
        clearTimeout(timer);
        resolve(response);
      });
    });
  };
  const send = (request) => server.stdin.write(`${JSON.stringify(request)}\n`);
  let nextRequestId = 10;
  const readToolValue = async (response) => {
    const envelope = JSON.parse(response.result.content[0].text);
    if (!envelope.output_ref) return envelope;
    const outputRequestId = nextRequestId++;
    send({
      jsonrpc: '2.0',
      id: outputRequestId,
      method: 'tools/call',
      params: { name: 'mcp_output_show', arguments: { ref: envelope.output_ref, output_limit: 10000 } },
    });
    const shownResponse = await nextResponse();
    const shown = JSON.parse(shownResponse.result.content[0].text);
    assert.equal(shown.schema, 'narada.mcp_output_show.v1');
    return JSON.parse(shown.output_text);
  };

  try {
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
    const initialized = await nextResponse();
    assert.equal(initialized.result.serverInfo.name, 'narada-task-lifecycle-mcp');

    send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const listed = await nextResponse();
    const toolNames = listed.result.tools.map((tool) => tool.name);
    assert.ok(toolNames.includes('task_lifecycle_diagnose_task_ref'));
    assert.ok(toolNames.includes('task_lifecycle_dependency_disposition_record'));

    send({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'task_lifecycle_diagnose_task_ref', arguments: { task_id: 'parent-task', task_number: 1 } },
    });
    const diagnosisResponse = await nextResponse();
    const diagnosis = await readToolValue(diagnosisResponse);
    assert.equal(diagnosis.schema, 'narada.task.reference_diagnosis.v0');
    assert.equal(diagnosis.collision.detected, false);
    assert.equal(diagnosis.projections.lifecycle_present, true);

    send({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'task_lifecycle_dependency_disposition_record',
        arguments: {
          dependency_id: 'dependency-1',
          agent_id: 'agent.test',
          kind: 'operator_deferred',
          summary: 'Operator deferred remediation.',
          authority_basis: { kind: 'operator_direct_instruction', summary: 'Operator explicitly deferred it.' },
        },
      },
    });
    const dispositionResponse = await nextResponse();
    const disposition = await readToolValue(dispositionResponse);
    assert.equal(disposition.schema, 'narada.task.dependency_disposition.v0');
    assert.equal(disposition.disposition.required_outcome_id, 'outcome-1');
    assert.equal(disposition.dependency_satisfaction.all_satisfied, true);
  } finally {
    output.close();
    if (server.exitCode === null) {
      server.stdin.end();
      await Promise.race([once(server, 'exit'), new Promise((resolve) => setTimeout(resolve, 1000))]);
    }
    if (server.exitCode === null) server.kill();
    await rm(siteRoot, { recursive: true, force: true });
  }
});

function fakeRoleStore({ agentRole, targetRole, preferredAgentId = null, taskSpec = {} }) {
  return {
    db: {
      prepare(sql) {
        return {
          get(value) {
            if (sql.includes('FROM agent_roster')) return value ? { role: agentRole } : null;
            if (sql.includes('FROM narada_andrey_task_role_preferences')) {
              return { target_role: targetRole, preferred_role: null, preferred_agent_id: preferredAgentId };
            }
            return null;
          },
        };
      },
    },
    getTaskSpecByNumber() {
      return taskSpec;
    },
  };
}
