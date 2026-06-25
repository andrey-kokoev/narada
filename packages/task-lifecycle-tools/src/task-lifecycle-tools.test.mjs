import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { checkTaskRoleEligibilityLocal } from './agent-role-resolution.mjs';
import { resolveTaskRolePolicy } from './task-role-policy.mjs';

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
