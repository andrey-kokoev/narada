#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LIFECYCLE_PATH: any = 'kb/lifecycles/first-time-narada-operator-onboarding.lifecycle.json';
const CONTINUATION_SCHEMA: any = 'narada.lifecycle.continuation.v0';

function readJson(filePath: any) : any{
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeEvidence(input: any = {}) : any{
  const evidence: any = input.evidence ?? input;
  const present: any = new Set(evidence.present ?? evidence.present_evidence ?? []);
  const stale: any = new Set(evidence.stale ?? evidence.stale_evidence ?? []);
  const contradicted: any = new Set(evidence.contradicted ?? evidence.contradicted_evidence ?? []);
  const pauseTriggers: any = new Set(evidence.pause_triggers_present ?? evidence.blockers ?? []);

  return { present, stale, contradicted, pauseTriggers };
}

function stageComplete(stage: any, evidence: any) : any{
  return stage.required_evidence.every((item: any) => (
    evidence.present.has(item) && !evidence.stale.has(item) && !evidence.contradicted.has(item)
  ));
}

function blockersForStage(stage: any, evidence: any) : any{
  return stage.pause_triggers.filter((trigger: any) => evidence.pauseTriggers.has(trigger));
}

function authorityForStage(stageId: any) : any{
  const authority: any = {
    prerequisites_checked: 'operator_installation_authority_or_read_only_probe_authority',
    narada_installed: 'operator_installation_authority',
    user_site_created: 'user_locus_authority',
    pc_site_created: 'pc_locus_authority',
    user_pc_binding_established: 'user_site_and_pc_site_crossing_authority',
    project_site_initialized: 'receiving_project_or_folder_authority',
    first_agent_session_started: 'agent_context_session_authority',
    operational_readiness_proven: 'governed_site_evidence_surface_authority'
  };
  return authority[stageId] ?? 'stage_specific_authority_required';
}

function evaluateContinuation(lifecycle: any, evidenceInput: any = {}) : any{
  const evidence: any = normalizeEvidence(evidenceInput);
  const stages: any = [...lifecycle.stages].sort((a: any, b: any) => a.order - b.order);

  for (const stage of stages) {
    const blockedBy: any = blockersForStage(stage, evidence);
    const missingEvidence: any = stage.required_evidence.filter((item: any) => (
      !evidence.present.has(item) || evidence.stale.has(item) || evidence.contradicted.has(item)
    ));

    if (blockedBy.length > 0 || !stageComplete(stage, evidence)) {
      return {
        schema: CONTINUATION_SCHEMA,
        lifecycle_id: lifecycle.lifecycle_id,
        selected_stage_id: stage.stage_id,
        selected_stage_order: stage.order,
        missing_evidence: missingEvidence,
        blocked_by: blockedBy,
        recommended_next_action: blockedBy.length > 0
          ? `Stop at ${stage.stage_id}; resolve pause trigger before continuing.`
          : stage.next_action_when_incomplete,
        authority_required: authorityForStage(stage.stage_id),
        task_candidate: blockedBy.length > 0 ? null : {
          title: `Continue onboarding: ${stage.stage_id}`,
          goal: stage.goal,
          required_evidence: missingEvidence
        },
        completed_stage_ids: stages
          .filter((candidate: any) => candidate.order < stage.order && stageComplete(candidate, evidence))
          .map((candidate: any) => candidate.stage_id)
      };
    }
  }

  return {
    schema: CONTINUATION_SCHEMA,
    lifecycle_id: lifecycle.lifecycle_id,
    selected_stage_id: null,
    selected_stage_order: null,
    missing_evidence: [],
    blocked_by: [],
    recommended_next_action: 'Lifecycle evidence is complete; verify operational readiness freshness before closing onboarding.',
    authority_required: 'none_for_read_only_summary',
    task_candidate: null,
    completed_stage_ids: stages.map((stage: any) => stage.stage_id)
  };
}

function parseArgs(argv: any) : any{
  const options: any = {
    lifecyclePath: LIFECYCLE_PATH,
    evidencePath: null,
    evidence: null,
    pretty: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg: any = argv[index];
    if (arg === '--lifecycle') {
      const next: any = argv[index + 1];
      if (!next) throw new Error('--lifecycle requires a path');
      options.lifecyclePath = next;
      index += 1;
    } else if (arg === '--evidence') {
      const next: any = argv[index + 1];
      if (!next) throw new Error('--evidence requires a path');
      options.evidencePath = next;
      index += 1;
    } else if (arg === '--evidence-json') {
      const next: any = argv[index + 1];
      if (!next) throw new Error('--evidence-json requires JSON');
      options.evidence = JSON.parse(next);
      index += 1;
    } else if (arg === '--pretty') {
      options.pretty = true;
    } else {
      throw new Error(`Unsupported argument: ${arg}`);
    }
  }

  return options;
}

function runCli(argv: any = process.argv.slice(2), stdout: any = process.stdout, stderr: any = process.stderr) : any{
  try {
    const options: any = parseArgs(argv);
    const lifecycle: any = readJson(options.lifecyclePath);
    const evidence: any = options.evidencePath ? readJson(options.evidencePath) : (options.evidence ?? {});
    const result: any = evaluateContinuation(lifecycle, evidence);
    stdout.write(`${JSON.stringify(result, null, options.pretty ? 2 : 0)}\n`);
    return result.blocked_by.length > 0 ? 2 : 0;
  } catch (error: any) {
    const result: any = {
      schema: CONTINUATION_SCHEMA,
      lifecycle_id: null,
      selected_stage_id: null,
      missing_evidence: [],
      blocked_by: ['continuation_tool_error'],
      recommended_next_action: error.message,
      authority_required: 'none_for_read_only_error_report',
      task_candidate: null
    };
    stderr.write(`${JSON.stringify(result)}\n`);
    return 2;
  }
}

const entryPath: any = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entryPath && entryPath === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli();
}

export { CONTINUATION_SCHEMA, LIFECYCLE_PATH, evaluateContinuation, normalizeEvidence, parseArgs, runCli };
