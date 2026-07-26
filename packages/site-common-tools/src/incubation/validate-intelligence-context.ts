#!/usr/bin/env node
/**
 * validate-intelligence-context.ts
 *
 * Conceptual guardrail: validates that Intelligence Context and Execution Context
 * examples remain coherent and do not conflate categories.
 *
 * Uses AJV for JSON Schema conformance of the Intelligence Context example against
 * schemas/narada.intelligence_context.v0.schema.json.
 *
 * Manual checks remain for domain-specific invariants that JSON Schema cannot express:
 * - purity: IC must not contain execution-context fields
 * - purity: EC must not contain intelligence-context fields
 * - proposal framing: proposal_output must contain requests, not claims of authority
 * - residuals: must be explicit
 *
 * Usage:
 *   node tools/incubation/validate-intelligence-context.ts
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as AjvModule from 'ajv';
import * as AjvFormatsModule from 'ajv-formats';

const Ajv: any = (AjvModule as any).default ?? AjvModule;
const addFormats: any = (AjvFormatsModule as any).default ?? AjvFormatsModule;

const __dirname: any = dirname(fileURLToPath(import.meta.url));
const rootDir: any = join(__dirname, '..', '..');

const SCHEMA_PATH: any = join(rootDir, 'schemas', 'narada.intelligence_context.v0.schema.json');
const IC_EXAMPLE_PATH: any = join(rootDir, 'docs', 'incubation', 'examples', 'intelligence-context.kimi-architect.example.json');
const EC_EXAMPLE_PATH: any = join(rootDir, 'docs', 'incubation', 'examples', 'execution-context.kimi-architect.example.json');

const EXCLUDED_IC_FIELDS: any = [
  'agent_instance',
  'session_id',
  'runtime',
  'cwd',
  'mcp_servers',
  'available_tools',
  'transport',
];

const FORBIDDEN_AUTHORITY_FIELDS: any = [
  'send_authorized',
  'intent_emitted',
  'execution_completed',
  'confirmation_received',
];

const EXCLUDED_EC_FIELDS: any = [
  'candidate_hypotheses',
  'coherence_diagnosis',
  'proposal_output',
  'arbitrariness_partition',
  'materialized_context',
  'work_frame',
  'evaluation_state',
  'residuals',
];

const PROPOSAL_OUTPUT_EXCLUDED: any = [
  'decision',
  'intent',
  'execution',
  'confirmation',
];

function loadJson(path: any) : any{
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error: any) {
    return { _load_error: error.message };
  }
}

function hasField(obj: any, field: any, path: any = '') : any{
  if (obj === null || typeof obj !== 'object') return null;
  if (field in obj) return `${path}${field}`;
  for (const key of Object.keys(obj)) {
    const found: any = hasField(obj[key], field, `${path}${key}.`);
    if (found) return found;
  }
  return null;
}

function hasAnyField(obj: any, fields: any) : any{
  for (const field of fields) {
    const found: any = hasField(obj, field);
    if (found) return found;
  }
  return null;
}

function checkSchemaTopLevelFields(schema: any) : any{
  const required: any = schema.required ?? [];
  const requiredSet: any = new Set(required);
  const expected: any = new Set([
    'materialized_context',
    'work_frame',
    'arbitrariness_partition',
    'evaluation_state',
    'coherence_diagnosis',
    'proposal_output',
    'residuals',
  ]);

  const missing: any = [];
  for (const field of expected) {
    if (!requiredSet.has(field)) missing.push(field);
  }

  const excluded: any = [];
  if (schema.not?.anyOf) {
    for (const clause of schema.not.anyOf) {
      for (const field of clause.required ?? []) {
        if (EXCLUDED_IC_FIELDS.includes(field)) excluded.push(field);
      }
    }
  }

  return { missing, excluded };
}

function checkProposalOutput(ic: any) : any{
  const proposal: any = ic.proposal_output;
  if (!proposal || typeof proposal !== 'object') {
    return ['proposal_output is missing or not an object'];
  }

  const errors: any = [];

  // Check values only, not keys. Field names like "recommended_decision_request"
  // are structural and represent *requests* for decisions/intents, not the
  // decisions/intents themselves.
  //
  // Allow "request" framing in either order:
  //   "request decision", "requested intent", "requesting execution"
  //   "decision requested", "intent requested", "execution requested"
  function valueContainsForbidden(value: any) : any{
    if (typeof value !== 'string') return null;
    const lower: any = value.toLowerCase();
    for (const forbidden of PROPOSAL_OUTPUT_EXCLUDED) {
      const requestBefore: any = new RegExp(`\\brequest(?:ed|ing)?\\s+(?:for\\s+)?${forbidden}\\b`);
      const requestAfter: any = new RegExp(`\\b${forbidden}\\s+(?:is\\s+)?request(?:ed|ing)?\\b`);
      if (requestBefore.test(lower) || requestAfter.test(lower)) continue;
      const regex: any = new RegExp(`\\b${forbidden}\\b`);
      if (regex.test(lower)) {
        return forbidden;
      }
    }
    return null;
  }

  function scanValues(obj: any, path: any = '') : any{
    if (obj === null || typeof obj !== 'object') {
      const found: any = valueContainsForbidden(obj);
      if (found) {
        errors.push(`proposal_output value at "${path}" contains forbidden concept: "${found}"`);
      }
      return;
    }
    for (const [key, val] of Object.entries(obj)) {
      const childPath: any = path ? `${path}.${key}` : key;
      if (Array.isArray(val)) {
        for (let i = 0; i < val.length; i++) {
          scanValues(val[i], `${childPath}[${i}]`);
        }
      } else {
        scanValues(val, childPath);
      }
    }
  }

  scanValues(proposal);

  const hasResiduals: any = Array.isArray(proposal.recommended_residuals) && proposal.recommended_residuals.length > 0;
  if (!hasResiduals) {
    errors.push('proposal_output.recommended_residuals is not explicitly populated');
  }

  return errors;
}

function checkExplicitResiduals(ic: any) : any{
  const residuals: any = ic.residuals;
  if (!residuals || typeof residuals !== 'object') {
    return ['residuals is missing or not an object'];
  }
  const errors: any = [];
  const hasAny: any = ['unresolved', 'deferred', 'dropped'].some(
    (k: any) => Array.isArray(residuals[k])
  );
  if (!hasAny) {
    errors.push('residuals does not contain any explicit residual arrays (unresolved/deferred/dropped)');
  }
  return errors;
}

function main() : any{
  const findings: any = [];
  const ajv: any = new Ajv({ strict: false });
  addFormats(ajv);

  // 1. Load schema
  const schema: any = loadJson(SCHEMA_PATH);
  if (schema._load_error) {
    findings.push({ ok: false, stage: 'schema_load', error: schema._load_error });
    return printResults(findings);
  }

  // 2. Validate schema structure (manual check for expected fields)
  const schemaCheck: any = checkSchemaTopLevelFields(schema);
  if (schemaCheck.missing.length > 0) {
    findings.push({ ok: false, stage: 'schema_fields', error: `Missing required fields: ${schemaCheck.missing.join(', ')}` });
  } else {
    findings.push({ ok: true, stage: 'schema_fields', detail: 'All expected top-level fields are required' });
  }
  if (schemaCheck.excluded.length > 0) {
    findings.push({ ok: true, stage: 'schema_exclusions', detail: `Schema excludes: ${schemaCheck.excluded.join(', ')}` });
  } else {
    findings.push({ ok: false, stage: 'schema_exclusions', error: 'Schema does not explicitly exclude execution-context fields' });
  }

  // 3. Compile AJV validator
  let validate: any;
  try {
    validate = ajv.compile(schema);
    findings.push({ ok: true, stage: 'ajv_compile', detail: 'Schema compiles under AJV' });
  } catch (error: any) {
    findings.push({ ok: false, stage: 'ajv_compile', error: `AJV compilation failed: ${error.message}` });
    return printResults(findings);
  }

  // 4. Load Intelligence Context example
  const ic: any = loadJson(IC_EXAMPLE_PATH);
  if (ic._load_error) {
    findings.push({ ok: false, stage: 'ic_load', error: ic._load_error });
    return printResults(findings);
  }

  // 5. AJV validate IC example against schema
  const ajvValid: any = validate(ic);
  if (ajvValid) {
    findings.push({ ok: true, stage: 'ajv_ic_validate', detail: 'Intelligence Context example validates against schema' });
  } else {
    const ajvErrors: any = validate.errors.map((e: any) => `${e.instancePath || '/'}: ${e.message}`).join('; ');
    findings.push({ ok: false, stage: 'ajv_ic_validate', error: `AJV validation failed: ${ajvErrors}` });
  }

  // 6. IC must not contain execution-context fields
  const icForbidden: any = hasAnyField(ic, EXCLUDED_IC_FIELDS);
  if (icForbidden) {
    findings.push({ ok: false, stage: 'ic_purity', error: `Intelligence Context contains forbidden field at: ${icForbidden}` });
  } else {
    findings.push({ ok: true, stage: 'ic_purity', detail: 'Intelligence Context contains no execution-context fields' });
  }

  // 7. IC must have all required top-level fields (redundant with AJV but explicit)
  const icMissing: any = [];
  for (const field of schema.required ?? []) {
    if (!(field in ic)) icMissing.push(field);
  }
  if (icMissing.length > 0) {
    findings.push({ ok: false, stage: 'ic_completeness', error: `Missing fields: ${icMissing.join(', ')}` });
  } else {
    findings.push({ ok: true, stage: 'ic_completeness', detail: 'All required fields present' });
  }

  // 8. proposal_output checks
  const proposalErrors: any = checkProposalOutput(ic);
  if (proposalErrors.length > 0) {
    findings.push({ ok: false, stage: 'ic_proposal', error: proposalErrors.join('; ') });
  } else {
    findings.push({ ok: true, stage: 'ic_proposal', detail: 'proposal_output contains proposals, not decisions/intents/executions' });
  }

  // 9. residuals explicit
  const residualErrors: any = checkExplicitResiduals(ic);
  if (residualErrors.length > 0) {
    findings.push({ ok: false, stage: 'ic_residuals', error: residualErrors.join('; ') });
  } else {
    findings.push({ ok: true, stage: 'ic_residuals', detail: 'Residuals are explicit' });
  }

  // 10. authority collapse guardrail
  const authorityCollapse: any = hasAnyField(ic, FORBIDDEN_AUTHORITY_FIELDS);
  if (authorityCollapse) {
    findings.push({ ok: false, stage: 'ic_authority_collapse', error: `Intelligence Context contains forbidden authority field at: ${authorityCollapse}. Draft reply must be proposal_output only; send authorization, intent, execution, and confirmation belong outside intelligence context.` });
  } else {
    findings.push({ ok: true, stage: 'ic_authority_collapse', detail: 'No authority collapse detected; draft remains proposal only' });
  }

  // 11. Load Execution Context example
  const ec: any = loadJson(EC_EXAMPLE_PATH);
  if (ec._load_error) {
    findings.push({ ok: false, stage: 'ec_load', error: ec._load_error });
    return printResults(findings);
  }

  // 12. EC must not contain intelligence-context fields
  const ecForbidden: any = hasAnyField(ec, EXCLUDED_EC_FIELDS);
  if (ecForbidden) {
    findings.push({ ok: false, stage: 'ec_purity', error: `Execution Context contains forbidden field at: ${ecForbidden}` });
  } else {
    findings.push({ ok: true, stage: 'ec_purity', detail: 'Execution Context contains no intelligence-context fields' });
  }

  // 13. EC must contain execution-context fields
  const ecExpected: any = ['runtime', 'session_id', 'cwd', 'mcp_servers', 'available_tools', 'transport'];
  const ecMissingExpected: any = ecExpected.filter((f: any) => !(f in ec));
  if (ecMissingExpected.length > 0) {
    findings.push({ ok: false, stage: 'ec_completeness', error: `Missing expected execution-context fields: ${ecMissingExpected.join(', ')}` });
  } else {
    findings.push({ ok: true, stage: 'ec_completeness', detail: 'Execution Context contains expected fields' });
  }

  printResults(findings);
}

function printResults(findings: any) : any{
  let passed: any = 0;
  let failed: any = 0;

  for (const f of findings) {
    if (f.ok) {
      passed++;
      console.log(`[PASS] ${f.stage}: ${f.detail ?? 'OK'}`);
    } else {
      failed++;
      console.log(`[FAIL] ${f.stage}: ${f.error ?? 'Unknown error'}`);
    }
  }

  console.log(`\n---`);
  console.log(`Total: ${findings.length}, Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
