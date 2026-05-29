#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const INTENT_SCHEMA = 'narada.onboarding.intent.v0';
const PROPOSAL_SCHEMA = 'narada.site_config.proposal.v0';
const ERROR_SCHEMA = 'narada.onboarding.intent_projection.error.v0';

const REQUIRED_INTENT_FIELDS = [
  'schema',
  'intent_id',
  'operator_words',
  'source_context',
  'intent_type',
  'site_creation_kind',
  'desired_outcome',
  'authority_claim',
  'lifecycle_route'
];

const NON_GRANTS = [
  'intent_is_not_config_authority',
  'proposal_does_not_mutate_site_state',
  'admission_must_not_be_silent'
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function proposalIdFor(intent) {
  return `sitecfgprop_${String(intent.intent_id).replace(/^intent_/, '')}`;
}

function targetRoots(intent) {
  return intent.target_roots && typeof intent.target_roots === 'object' ? intent.target_roots : {};
}

function projectRootWithNarada(root) {
  if (!root) return '<target_roots.project_site or inferred project root>/.narada';
  return String(root).endsWith('/.narada') || String(root).endsWith('\\.narada')
    ? String(root)
    : `${root}/.narada`;
}

function site(kind, role, root, authorityRequired) {
  return {
    kind,
    role,
    root,
    authority_required: authorityRequired
  };
}

function projectionForKind(intent) {
  const roots = targetRoots(intent);
  const projectRoot = roots.project_site ?? roots.receiving_site ?? null;

  const projections = {
    project_site: {
      target_loci: ['project_site'],
      required_sites: [
        site(
          'project_site',
          'project_memory',
          projectRootWithNarada(projectRoot),
          'receiving_project_or_folder_authority'
        )
      ],
      required_bindings: [],
      initial_lifecycle: 'project_site_initialized',
      admission_required_by: ['project_site']
    },
    user_site: {
      target_loci: ['user_site'],
      required_sites: [
        site(
          'user_site',
          'portable_operator_memory',
          roots.user_site ?? '<target_roots.user_site or unresolved>',
          'user_locus_authority'
        )
      ],
      required_bindings: [],
      initial_lifecycle: 'first_time_narada_operator_onboarding',
      admission_required_by: ['user_site']
    },
    pc_site: {
      target_loci: ['pc_site'],
      required_sites: [
        site(
          'pc_site',
          'machine_runtime_surface',
          roots.pc_site ?? '<target_roots.pc_site or machine-default>',
          'pc_locus_authority'
        )
      ],
      required_bindings: [],
      initial_lifecycle: 'first_time_narada_operator_onboarding',
      admission_required_by: ['pc_site']
    },
    user_pc_pair: {
      target_loci: ['user_site', 'pc_site'],
      required_sites: [
        site(
          'user_site',
          'portable_operator_memory',
          roots.user_site ?? '<target_roots.user_site or unresolved>',
          'user_locus_authority'
        ),
        site(
          'pc_site',
          'machine_runtime_surface',
          roots.pc_site ?? '<target_roots.pc_site or machine-default>',
          'pc_locus_authority'
        )
      ],
      required_bindings: [
        {
          kind: 'user_pc_binding',
          crossing_policy: 'explicit_admitted_surfaces_only'
        }
      ],
      initial_lifecycle: 'first_time_narada_operator_onboarding',
      admission_required_by: ['user_site', 'pc_site']
    },
    client_receiving_site: {
      target_loci: ['receiving_site'],
      required_sites: [
        site(
          'client_receiving_site',
          'receiving_project_or_org_site',
          projectRoot ?? '<target_roots.project_site or receiving root>',
          'receiving_site_authority'
        )
      ],
      required_bindings: [],
      initial_lifecycle: 'project_site_initialized',
      admission_required_by: ['receiving_site'],
      non_grants: ['source_site_advisory_only_until_receiving_site_admits']
    },
    handoff_adoption_site: {
      target_loci: ['receiving_site'],
      required_sites: [
        site(
          'handoff_adoption_site',
          'receiving_site_with_pending_external_orientation',
          projectRoot ?? '<target_roots.project_site or receiving root>',
          'receiving_site_authority'
        )
      ],
      required_bindings: [],
      initial_lifecycle: 'project_site_initialized',
      admission_required_by: ['receiving_site'],
      handoff_status: 'external_orientation_pending_admission',
      non_grants: [
        'handoff_is_not_checkpoint_memory',
        'external_orientation_not_local_truth_until_admitted'
      ]
    }
  };

  return projections[intent.site_creation_kind] ?? null;
}

function validateIntent(intent) {
  const errors = [];
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) {
    return ['intent must be a JSON object'];
  }

  for (const field of REQUIRED_INTENT_FIELDS) {
    if (intent[field] === undefined || intent[field] === null || intent[field] === '') {
      errors.push(`missing required field: ${field}`);
    }
  }

  if (intent.schema && intent.schema !== INTENT_SCHEMA) {
    errors.push(`unsupported schema: ${intent.schema}`);
  }

  if (intent.site_creation_kind && !projectionForKind(intent)) {
    errors.push(`unsupported site_creation_kind: ${intent.site_creation_kind}`);
  }

  return errors;
}

function projectIntent(intent) {
  const errors = validateIntent(intent);
  if (errors.length > 0) {
    const error = new Error(errors.join('; '));
    error.details = errors;
    throw error;
  }

  const projected = projectionForKind(intent);
  return {
    schema: PROPOSAL_SCHEMA,
    proposal_id: proposalIdFor(intent),
    source_intent_id: intent.intent_id,
    source_intent: {
      schema: intent.schema,
      intent_id: intent.intent_id,
      operator_words: intent.operator_words,
      source_context: intent.source_context,
      intent_type: intent.intent_type,
      site_creation_kind: intent.site_creation_kind,
      desired_outcome: intent.desired_outcome,
      authority_claim: intent.authority_claim,
      lifecycle_route: intent.lifecycle_route
    },
    status: 'proposed_pending_admission',
    projection_mode: 'read_only_deterministic',
    ...projected,
    non_grants: [...NON_GRANTS, ...(projected.non_grants ?? [])],
    admission_boundary: {
      intent_state: 'evidence_only',
      proposal_state: 'not_admitted_config',
      config_mutation: false,
      admission_must_be_explicit: true,
      authority_claim: intent.authority_claim
    },
    continuation: {
      lifecycle_route: intent.lifecycle_route,
      next_surface: 'tools/lifecycle/continue-first-time-operator-onboarding.mjs'
    }
  };
}

function parseArgs(argv) {
  const options = {
    intentPath: null,
    intentJson: null,
    pretty: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--intent') {
      const next = argv[index + 1];
      if (!next) throw new Error('--intent requires a path');
      options.intentPath = next;
      index += 1;
    } else if (arg === '--intent-json') {
      const next = argv[index + 1];
      if (!next) throw new Error('--intent-json requires JSON');
      options.intentJson = JSON.parse(next);
      index += 1;
    } else if (arg === '--pretty') {
      options.pretty = true;
    } else {
      throw new Error(`Unsupported argument: ${arg}`);
    }
  }

  if (!options.intentPath && !options.intentJson) {
    throw new Error('provide --intent <path> or --intent-json <json>');
  }

  return options;
}

function runCli(argv = process.argv.slice(2), stdout = process.stdout, stderr = process.stderr) {
  try {
    const options = parseArgs(argv);
    const intent = options.intentPath ? readJson(options.intentPath) : options.intentJson;
    const result = projectIntent(intent);
    stdout.write(`${JSON.stringify(result, null, options.pretty ? 2 : 0)}\n`);
    return 0;
  } catch (error) {
    const result = {
      schema: ERROR_SCHEMA,
      status: 'error',
      errors: error.details ?? [error.message],
      config_mutation: false,
      authority_required: 'none_for_read_only_error_report'
    };
    stderr.write(`${JSON.stringify(result)}\n`);
    return 2;
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entryPath && entryPath === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli();
}

export {
  ERROR_SCHEMA,
  INTENT_SCHEMA,
  PROPOSAL_SCHEMA,
  projectIntent,
  parseArgs,
  runCli,
  validateIntent
};
