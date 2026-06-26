import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import {
  actionAdmissionDir,
  candidateDir,
  classifyCarrierActionRequest,
  createAndWriteCarrierActionAdmission,
  createCarrierActionRequest,
  decideCarrierActionRequest,
  inspectPayloadForSecrets,
  listCarrierActionDecisions,
  showCarrierActionDecision,
  siteEvidenceRoot,
  stableRequestId,
} from './carrier-action-admission.mjs';
import { resolveToolMetadata } from './tool-metadata.mjs';

function tempSite(prefix = 'narada-action-admission-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

const classificationCases = JSON.parse(readFileSync(new URL('../fixtures/classification-cases.json', import.meta.url), 'utf8'));
assert.equal(classificationCases.schema, 'narada.carrier_action_admission.classification_cases.v1');
for (const entry of classificationCases.cases) {
  const classification = classifyCarrierActionRequest(entry.tool_name, entry.arguments ?? {});
  assert.equal(classification.decision, entry.expected_decision, entry.name);
  assert.equal(classification.reason, entry.expected_reason, entry.name);
  if (entry.expected_family) assert.equal(classification.family, entry.expected_family, entry.name);
  if (entry.expected_secret_findings) assert.deepEqual(classification.secret_findings, entry.expected_secret_findings, entry.name);
}

const workspaceRoot = tempSite();
const naradaRoot = join(workspaceRoot, '.narada');
assert.equal(siteEvidenceRoot(workspaceRoot), naradaRoot);
assert.equal(siteEvidenceRoot(naradaRoot), naradaRoot);
assert.equal(actionAdmissionDir(workspaceRoot), join(naradaRoot, 'crew', 'action-admission'));

assert.equal(
  stableRequestId({ carrierSessionId: 'carrier:1', turnId: 'turn/2', toolCallId: 'call 3' }),
  'car_act_carrier_1_turn_2_call_3_96eb77b053683f8a',
);

assert.deepEqual(classifyCarrierActionRequest('task_lifecycle_claim', { task_number: 1228 }), {
  family: 'task_lifecycle_mutation',
  authority_owner: 'task_governance_service',
  decision: 'routed',
  reason: 'task_lifecycle_mutation_requires_canonical_task_authority',
  secret_findings: [],
  classifier_source: 'closed_name_pattern',
});
assert.equal(classifyCarrierActionRequest('agent_context_startup_sequence', {}).decision, 'read_only_admitted');
const taskShowReadOnlyMetadata = classifyCarrierActionRequest('task_lifecycle_show', { task_number: 1318 }, {
  toolMetadata: { read_only: true, source: 'surface_registry', reason: 'surface_registry_read_only_tool' },
});
assert.equal(taskShowReadOnlyMetadata.decision, 'read_only_admitted');
assert.equal(taskShowReadOnlyMetadata.reason, 'surface_registry_read_only_tool');
assert.equal(classifyCarrierActionRequest('startup_sequence', {}).decision, 'refused');
assert.equal(classifyCarrierActionRequest('fs_read_file', {}).decision, 'read_only_admitted');
assert.equal(classifyCarrierActionRequest('fs_glob_search', {}).decision, 'read_only_admitted');
assert.equal(classifyCarrierActionRequest('fs_grep_search', {}).decision, 'read_only_admitted');
const sourcePathRead = classifyCarrierActionRequest('fs_read_file', { path: 'packages/task-lifecycle-mcp/src/mcp-freshness-service.ts' });
assert.equal(sourcePathRead.decision, 'read_only_admitted');
assert.equal(sourcePathRead.reason, 'closed_name_pattern_read_only_tool');
assert.equal(classifyCarrierActionRequest('read_file', {}).decision, 'refused');
assert.equal(classifyCarrierActionRequest('glob_search', {}).decision, 'refused');
assert.equal(classifyCarrierActionRequest('grep_search', {}).decision, 'refused');
assert.equal(classifyCarrierActionRequest('agent_context_startup_sequence', {}, { toolAvailable: false }).reason, 'mcp_tool_not_available');
assert.equal(classifyCarrierActionRequest('unknown_registry_read', {}, {
  toolMetadata: { read_only: true, source: 'surface_registry', reason: 'test_registry_read' },
}).decision, 'read_only_admitted');
const misdeclaredTaskClaim = classifyCarrierActionRequest('narada_task_claim', {}, {
  toolMetadata: { read_only: true, source: 'surface_registry', reason: 'misdeclared_registry_read' },
});
assert.equal(misdeclaredTaskClaim.decision, 'routed');
assert.equal(misdeclaredTaskClaim.family, 'task_lifecycle_mutation');
assert.equal(misdeclaredTaskClaim.reason, 'read_only_metadata_conflicts_with_task_lifecycle_mutation');
assert.equal(misdeclaredTaskClaim.metadata_conflict.metadata_reason, 'misdeclared_registry_read');
const misdeclaredShellRun = classifyCarrierActionRequest('shell_run', {}, {
  toolMetadata: { read_only: true, source: 'surface_registry', reason: 'misdeclared_registry_read' },
});
assert.equal(misdeclaredShellRun.decision, 'refused');
assert.equal(misdeclaredShellRun.family, 'command');
assert.equal(misdeclaredShellRun.reason, 'read_only_metadata_conflicts_with_command');
assert.equal(classifyCarrierActionRequest('unknown_registry_task', {}, {
  toolMetadata: {
    read_only: false,
    family: 'task_lifecycle_mutation',
    authority_owner: 'task_governance_service',
    source: 'surface_registry',
    reason: 'test_registry_task',
  },
}).classifier_source, 'surface_registry');
const registryUnlisted = classifyCarrierActionRequest('fs_read_file', {}, {
  toolMetadata: {
    name: 'fs_read_file',
    source: 'surface_registry_unlisted',
    registry_metadata_authoritative: true,
    reason: 'surface_registry_tool_not_declared',
    server_name: 'site-filesystem',
    surface_id: 'surface.filesystem',
    registry_source: 'D:/site/.narada/capabilities/mcp-surfaces.json',
    generated_file: 'site-filesystem-mcp.json',
    live_tool_catalog_seen: true,
  },
});
assert.equal(registryUnlisted.decision, 'refused');
assert.equal(registryUnlisted.reason, 'surface_registry_tool_not_declared');
assert.equal(registryUnlisted.registry_diagnostics.server_name, 'site-filesystem');
assert.equal(registryUnlisted.registry_diagnostics.surface_id, 'surface.filesystem');
assert.equal(registryUnlisted.registry_diagnostics.registry_source, 'D:/site/.narada/capabilities/mcp-surfaces.json');
assert.equal(registryUnlisted.registry_diagnostics.generated_file, 'site-filesystem-mcp.json');
assert.equal(registryUnlisted.registry_diagnostics.candidate_registry_patch.classification, 'add_to_read_only_tools');
assert.equal(registryUnlisted.registry_diagnostics.candidate_registry_patch.target_contract_field, 'tool_contract.read_only_tools');
const resolvedRegistryUnlisted = resolveToolMetadata({
  toolName: 'narada_inbox_submit',
  server: {
    name: 'site-inbox',
    surface_id: 'surface.inbox',
    source_file: 'site-inbox-mcp.json',
    registry_source: 'D:/site/.narada/capabilities/mcp-surfaces.json',
    registry_metadata_authoritative: true,
    registry_tools: {},
  },
  tool: { name: 'narada_inbox_submit' },
});
assert.equal(resolvedRegistryUnlisted.server_name, 'site-inbox');
assert.equal(resolvedRegistryUnlisted.surface_id, 'surface.inbox');
assert.equal(resolvedRegistryUnlisted.generated_file, 'site-inbox-mcp.json');
assert.equal(resolvedRegistryUnlisted.live_tool_catalog_seen, true);
const registryUnlistedRequest = createCarrierActionRequest({
  agentId: 'narada.test',
  carrierSessionId: 'carrier_registry',
  turnId: 'turn_registry',
  toolCallId: 'call_registry',
  toolName: 'narada_inbox_submit',
  args: { envelope_id: 'env_1' },
  siteRoot: workspaceRoot,
  toolMetadata: resolvedRegistryUnlisted,
});
assert.equal(registryUnlistedRequest.requested_action.registry_diagnostics.server_name, 'site-inbox');
assert.equal(registryUnlistedRequest.requested_action.registry_diagnostics.surface_id, 'surface.inbox');
assert.equal(registryUnlistedRequest.requested_action.registry_diagnostics.generated_file, 'site-inbox-mcp.json');
assert.equal(registryUnlistedRequest.requested_action.registry_diagnostics.candidate_registry_patch.classification, 'add_to_mutating_tools');
assert.equal(registryUnlistedRequest.requested_action.classifier_metadata.registry_patch_candidate.classification, 'add_to_mutating_tools');
assert.equal(classifyCarrierActionRequest('inbox_submit', {}).authority_owner, 'canonical_inbox_service');
assert.equal(classifyCarrierActionRequest('outbox_send', {}).authority_owner, 'canonical_outbox_service');
assert.equal(classifyCarrierActionRequest('outbox_send', {}).decision, 'refused');
assert.equal(classifyCarrierActionRequest('command_request_create', {}).decision, 'routed');
assert.equal(classifyCarrierActionRequest('shell_run', {}).decision, 'refused');
assert.equal(classifyCarrierActionRequest('write_file', {}).family, 'site_file_mutation');
assert.equal(classifyCarrierActionRequest('write_file', {}).decision, 'routed');
assert.equal(classifyCarrierActionRequest('execute_command', {}).family, 'command');
assert.equal(classifyCarrierActionRequest('execute_command', {}).decision, 'routed');
assert.equal(classifyCarrierActionRequest('unknown_mutate', {}).reason, 'unknown_non_read_only_tool_family');

const delegatedWriteHandoff = {
  schema: 'narada.nars.delegated_authority_handoff.v1',
  crossing_regime: 'nars_runtime_server_to_carrier_substrate',
  parse_status: 'accepted',
  authority_ref: 'task:1329',
  authority_mode: 'write',
  allowed_action_families: ['site_file_mutation', 'task_lifecycle_mutation', 'command'],
};
for (const [toolName, expectedFamily] of [
  ['write_file', 'site_file_mutation'],
  ['task_lifecycle_claim', 'task_lifecycle_mutation'],
  ['execute_command', 'command'],
]) {
  const classification = classifyCarrierActionRequest(toolName, { id: 'value omitted' }, {
    delegatedAuthorityHandoff: delegatedWriteHandoff,
  });
  assert.equal(classification.family, expectedFamily);
  assert.equal(classification.decision, 'delegated_mutation_admitted');
  assert.equal(classification.carrier_mutation_admitted, true);
  assert.equal(classification.delegated_authority.authority_ref, 'task:1329');
}
const readOnlyUnderWrite = classifyCarrierActionRequest('fs_read_file', { path: 'README.md' }, {
  delegatedAuthorityHandoff: delegatedWriteHandoff,
});
assert.equal(readOnlyUnderWrite.decision, 'read_only_admitted');
assert.equal(readOnlyUnderWrite.carrier_mutation_admitted, undefined);
const secretUnderWrite = classifyCarrierActionRequest('write_file', {
  path: 'safe.txt',
  content: 'sk-testsecretvalue123456',
}, {
  delegatedAuthorityHandoff: delegatedWriteHandoff,
});
assert.equal(secretUnderWrite.decision, 'refused');
assert.equal(secretUnderWrite.reason, 'secret_or_credential_bearing_request');
assert.equal(secretUnderWrite.authority_owner, 'capability_secret_authority');

const secretFindings = inspectPayloadForSecrets({
  env: {
    API_TOKEN: 'sk-testsecretvalue123456',
  },
});
assert.deepEqual(secretFindings, ['env.API_TOKEN']);
const secretClassification = classifyCarrierActionRequest('task_lifecycle_claim', {
  env: {
    API_TOKEN: 'sk-testsecretvalue123456',
  },
});
assert.equal(secretClassification.family, 'credential_access');
assert.equal(secretClassification.authority_owner, 'capability_secret_authority');
assert.equal(secretClassification.decision, 'refused');
assert.deepEqual(secretClassification.secret_findings, ['env.API_TOKEN']);
assert.deepEqual(secretClassification.secret_diagnostics.map((entry) => entry.path), ['env.API_TOKEN', 'env.API_TOKEN']);
assert.equal(secretClassification.secret_diagnostics.every((entry) => entry.values_recorded === false), true);
assert.match(secretClassification.remediation, /dedicated secret-authority path/);

const request = createCarrierActionRequest({
  agentId: 'narada.test',
  carrierSessionId: 'carrier_1',
  turnId: 'turn_1',
  toolCallId: 'call_1',
  toolName: 'task_lifecycle_claim',
  args: { task_number: 1228, body: 'raw body must not persist' },
  siteRoot: workspaceRoot,
});
assert.equal(request.schema, 'narada.carrier_action_request.v0');
assert.equal(request.request_id, 'car_act_carrier_1_turn_1_call_1_1146f7c42f5da5f6');
assert.equal(request.classifier_version, 'carrier_action_admission.metadata_aware_policy.v1');
assert.equal(request.requested_action.argument_summary.shape, 'object');
assert.equal(request.requested_action.classification_reason, 'task_lifecycle_mutation_requires_canonical_task_authority');
assert.equal(request.requested_action.classifier_source, 'closed_name_pattern');
assert.deepEqual(request.requested_action.argument_summary.keys, ['body', 'task_number']);
assert.equal('args' in request.requested_action, false);

const { path, decision } = createAndWriteCarrierActionAdmission({
  agentId: 'narada.test',
  carrierSessionId: 'carrier_1',
  turnId: 'turn_1',
  toolCallId: 'call_1',
  toolName: 'task_lifecycle_claim',
  args: { task_number: 1228, body: 'raw body must not persist' },
  siteRoot: workspaceRoot,
});
const evidenceText = readFileSync(path, 'utf8');
const persisted = JSON.parse(evidenceText);
assert.equal(existsSync(path), true);
assert.equal(existsSync(decision.candidate_ref), true);
assert.equal(basename(path), `${request.request_id}.json`);
assert.equal(decision.schema, 'narada.carrier_action_admission_decision.v0');
assert.equal(decision.decision, 'routed');
assert.equal(decision.reason, 'task_lifecycle_mutation_requires_canonical_task_authority');
assert.equal(decision.classifier_version, 'carrier_action_admission.metadata_aware_policy.v1');
assert.equal(decision.policy_version, 'carrier_action_admission.delegated_governed_mutations.v1');
assert.match(decision.created_at, /T/);
assert.equal(decision.carrier_mutation_admitted, false);
assert.equal(persisted.evidence_path, path);
assert.doesNotMatch(evidenceText, /raw body must not persist/);
const candidateText = readFileSync(decision.candidate_ref, 'utf8');
const candidate = JSON.parse(candidateText);
assert.equal(candidate.schema, 'narada.carrier_action_candidate.task.v1');
assert.equal(candidate.candidate_kind, 'task_candidate');
assert.equal(candidate.source_admission_evidence_path, path);
assert.equal(candidate.raw_arguments_recorded, false);
assert.doesNotMatch(candidateText, /raw body must not persist/);
assert.equal(candidateDir(workspaceRoot), join(naradaRoot, 'crew', 'action-admission', 'candidates'));

const secretWrite = createAndWriteCarrierActionAdmission({
  agentId: 'narada.test',
  carrierSessionId: 'carrier_2',
  turnId: 'turn_2',
  toolCallId: 'call_2',
  toolName: 'outbox_send',
  args: { token: 'sk-anothersecretvalue123456' },
  siteRoot: workspaceRoot,
});
const secretText = readFileSync(secretWrite.path, 'utf8');
assert.equal(secretWrite.decision.decision, 'refused');
assert.equal(secretWrite.decision.reason, 'secret_or_credential_bearing_request');
assert.match(secretWrite.decision.remediation, /refuses credential-bearing requests/);
assert.deepEqual(secretWrite.decision.request.requested_action.payload_secret_diagnostics.map((entry) => entry.match_kind), ['sensitive_key_name', 'openai_style_secret_key']);
assert.doesNotMatch(secretText, /sk-anothersecretvalue123456/);

const commandWrite = createAndWriteCarrierActionAdmission({
  agentId: 'narada.test',
  carrierSessionId: 'carrier_3',
  turnId: 'turn_3',
  toolCallId: 'call_3',
  toolName: 'command_request_create',
  args: { command: 'pnpm test', reason: 'values must not persist' },
  siteRoot: workspaceRoot,
});
assert.equal(commandWrite.decision.decision, 'routed');
assert.equal(JSON.parse(readFileSync(commandWrite.decision.candidate_ref, 'utf8')).schema, 'narada.carrier_action_candidate.command.v1');
assert.doesNotMatch(readFileSync(commandWrite.decision.candidate_ref, 'utf8'), /pnpm test/);

const readOnlyWrite = createAndWriteCarrierActionAdmission({
  agentId: 'narada.test',
  carrierSessionId: 'carrier_4',
  turnId: 'turn_4',
  toolCallId: 'call_4',
  toolName: 'agent_context_startup_sequence',
  args: {},
  siteRoot: workspaceRoot,
});
assert.equal(readOnlyWrite.decision.decision, 'read_only_admitted');
assert.equal(readOnlyWrite.decision.candidate_ref, null);

const delegatedWrite = createAndWriteCarrierActionAdmission({
  agentId: 'narada.test',
  carrierSessionId: 'carrier_5',
  turnId: 'turn_5',
  toolCallId: 'call_5',
  toolName: 'write_file',
  args: { path: 'safe.txt', content: 'raw mutation payload must not persist' },
  siteRoot: workspaceRoot,
  delegatedAuthorityHandoff: delegatedWriteHandoff,
});
const delegatedWriteText = readFileSync(delegatedWrite.path, 'utf8');
assert.equal(delegatedWrite.decision.decision, 'delegated_mutation_admitted');
assert.equal(delegatedWrite.decision.carrier_mutation_admitted, true);
assert.equal(delegatedWrite.decision.candidate_ref, null);
assert.equal(delegatedWrite.decision.request.requested_action.delegated_authority.authority_ref, 'task:1329');
assert.doesNotMatch(delegatedWriteText, /raw mutation payload must not persist/);

const delegatedDecisionRequest = createCarrierActionRequest({
  agentId: 'narada.test',
  carrierSessionId: 'carrier_6',
  turnId: 'turn_6',
  toolCallId: 'call_6',
  toolName: 'execute_command',
  args: { command: 'raw command must not persist' },
  siteRoot: workspaceRoot,
  delegatedAuthorityHandoff: delegatedWriteHandoff,
});
const delegatedDecision = decideCarrierActionRequest(delegatedDecisionRequest);
assert.equal(delegatedDecision.decision, 'delegated_mutation_admitted');
assert.equal(delegatedDecision.carrier_mutation_admitted, true);

const oldRecord = {
  schema: 'narada.carrier_action_admission_decision.v0',
  request_id: 'old_v0_record',
  created_at: '2026-05-26T00:00:00.000Z',
  decision: 'deferred',
  reason: 'archived_fixture',
  carrier_mutation_admitted: false,
};
mkdirSync(actionAdmissionDir(workspaceRoot), { recursive: true });
writeFileSync(join(actionAdmissionDir(workspaceRoot), 'old_v0_record.json'), `${JSON.stringify(oldRecord)}\n`, 'utf8');
const listed = listCarrierActionDecisions(workspaceRoot, { limit: 20 });
assert.equal(listed.status, 'success');
assert.equal(listed.decisions.some((entry) => entry.request_id === 'old_v0_record' && entry.decision === 'deferred'), true);
const shown = showCarrierActionDecision(workspaceRoot, 'old_v0_record');
assert.equal(shown.status, 'ok');
assert.equal(shown.record.reason, 'archived_fixture');
const invalidShow = showCarrierActionDecision(workspaceRoot, '..\\outside');
assert.equal(invalidShow.status, 'invalid_request_id');

rmSync(workspaceRoot, { recursive: true, force: true });

