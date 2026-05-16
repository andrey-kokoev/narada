import { readFileSync } from 'node:fs';
import {
  publishBoundedSiteEventWithPublicationEdge,
  pullHostedMessages,
  type PublicationEdgePublisherConfig,
} from '@narada2/site-registry-cloudflare/client';
import type { SiteEventFamily, SiteTelemetryPublicationEdge } from '@narada2/site-config';
import type { ExitCode } from '../lib/exit-codes.js';
import { ExitCode as Code } from '../lib/exit-codes.js';

export interface SiteTelemetryPublishOptions {
  edgeFile?: string;
  eventFile?: string;
  send?: boolean;
  expectedSurfaceId?: string;
  credentialRefStatus?: 'fresh' | 'stale' | 'missing' | 'revoked' | 'unknown';
  resolveCapability?: PublicationEdgePublisherConfig['resolveCapability'];
  fetch?: typeof fetch;
}

export interface SiteTelemetryPullOptions {
  registryUrl?: string;
  pollCapabilityRef?: string;
  finalizeCapabilityRef?: string;
  importCandidates?: boolean;
  resolveCapability?: (ref: string) => Promise<string> | string;
  fetch?: typeof fetch;
}

export async function siteTelemetryPublishCommand(options: SiteTelemetryPublishOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  if (!options.edgeFile || !options.eventFile) {
    return failure('site_telemetry_publish_config_missing', ['edge_file_required', 'event_file_required']);
  }
  const edge = readJsonFile<SiteTelemetryPublicationEdge>(options.edgeFile);
  const event = readJsonFile<Record<string, unknown>>(options.eventFile);
  const input = {
    publicationEdge: edge,
    event_id: requiredString(event.event_id, 'event_id'),
    idempotency_key: requiredString(event.idempotency_key, 'idempotency_key'),
    source_site_id: requiredString(event.source_site_id, 'source_site_id'),
    subject_site_id: optionalString(event.subject_site_id),
    target_site_id: optionalString(event.target_site_id),
    family: requiredString(event.family, 'family') as SiteEventFamily,
    type: requiredString(event.type, 'type'),
    observed_at: requiredString(event.observed_at, 'observed_at'),
    sent_at: requiredString(event.sent_at, 'sent_at'),
    payload_summary: recordValue(event.payload_summary, 'payload_summary'),
    authority_limits: Array.isArray(event.authority_limits) ? event.authority_limits.filter(isString) : undefined,
    dryRun: !options.send,
    expectedSurfaceId: options.expectedSurfaceId,
    credentialRefStatus: options.credentialRefStatus,
  };
  const result = await publishBoundedSiteEventWithPublicationEdge({
    resolveCapability: options.resolveCapability ?? refusedResolver,
    fetch: options.fetch,
  }, input);

  if (!options.send) {
    return {
      exitCode: Code.SUCCESS,
      result: {
        schema: 'narada.site_telemetry.publish_plan.v0',
        plan_id: `site_telemetry_publish_plan:${input.event_id}`,
        site_id: input.source_site_id,
        generated_at: input.sent_at,
        dry_run: true,
        mode: 'dry_run',
        publication_edge_ref: edge.edge_id,
        surface_endpoint_ref: edge.surface_endpoint,
        capability_ref: edge.capability_refs.publish ?? null,
        credential_resolution: {
          resolver_ref: edge.secret_resolver_policy.resolver_ref,
          credential_ref_status: input.credentialRefStatus ?? edge.rotation_posture.credential_ref_status,
          raw_secret_values_recorded: false,
        },
        event_family: input.family,
        event_preview: {
          event_id: input.event_id,
          idempotency_key: input.idempotency_key,
          payload_summary: input.payload_summary,
          raw_values_excluded: true,
        },
        transport_result: result,
        network_publish_planned: false,
        local_mutation_planned: false,
        local_admission_result: { status: 'skipped', local_inbox_mutated: false },
        raw_secret_values_recorded: false,
        authority_limits: [
          'local_tool_is_site_embodiment_not_authority_owner',
          'publish_transport_does_not_admit_remote_truth',
          'raw_secret_values_must_not_be_recorded',
        ],
      },
    };
  }

  return {
    exitCode: Code.SUCCESS,
    result: {
      schema: 'narada.site_telemetry.run_result.v0',
      run_id: `site_telemetry_publish_run:${input.event_id}`,
      plan_id: `site_telemetry_publish_plan:${input.event_id}`,
      site_id: input.source_site_id,
      started_at: input.sent_at,
      completed_at: new Date().toISOString(),
      status: 'succeeded',
      mode: 'send',
      publication_intent: {
        event_id: input.event_id,
        idempotency_key: input.idempotency_key,
        publication_edge_id: edge.edge_id,
      },
      transport_result: result,
      pull_result: { status: 'skipped' },
      local_admission_result: { status: 'skipped', local_inbox_mutated: false },
      remote_finalize_result: { status: 'skipped' },
      raw_secret_values_recorded: false,
      raw_candidate_payloads_recorded: false,
      authority_limits: [
        'local_tool_is_site_embodiment_not_authority_owner',
        'publish_transport_does_not_admit_remote_truth',
        'raw_secret_values_must_not_be_recorded',
      ],
    },
  };
}

export async function siteTelemetryPullCommand(options: SiteTelemetryPullOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  if (!options.registryUrl || !options.pollCapabilityRef || !options.finalizeCapabilityRef) {
    return failure('site_telemetry_pull_config_missing', [
      'registry_url_required',
      'poll_capability_ref_required',
      'finalize_capability_ref_required',
    ]);
  }
  const result = await pullHostedMessages({
    registryUrl: options.registryUrl,
    publishCapabilityRef: 'not-used-by-pull',
    pollCapabilityRef: options.pollCapabilityRef,
    finalizeCapabilityRef: options.finalizeCapabilityRef,
    resolveCapability: options.resolveCapability ?? refusedResolver,
    fetch: options.fetch,
  }, { dryRun: !options.importCandidates });

  if (!options.importCandidates) {
    return {
      exitCode: Code.SUCCESS,
      result: {
        schema: 'narada.site_telemetry.pull_plan.v0',
        plan_id: `site_telemetry_pull_plan:${safePlanToken(options.registryUrl)}`,
        site_id: 'local_site',
        generated_at: new Date().toISOString(),
        dry_run: true,
        mode: 'dry_run',
        remote_surface_ref: options.registryUrl,
        read_capability_ref: null,
        poll_capability_ref: options.pollCapabilityRef,
        finalize_capability_ref: options.finalizeCapabilityRef,
        candidate_filters: [],
        expected_candidate_schemas: [
          'narada.remote_candidate.message.v0',
          'narada.site_inbox.remote_message.v0',
        ],
        local_admission_mode: 'plan_only',
        finalize_mode: 'disabled',
        pull_result: result,
        network_pull_planned: false,
        local_inbox_mutation_planned: false,
        remote_finalize_planned: false,
        local_admission_result: { status: 'planned_or_skipped', local_inbox_mutated: false },
        raw_secret_values_recorded: false,
        raw_candidate_payloads_recorded: false,
        authority_limits: [
          'local_tool_is_site_embodiment_not_authority_owner',
          'cloud_receipt_is_not_local_admission',
          'local_inbox_mutation_requires_local_governed_command',
          'remote_finalize_requires_local_admission_or_rejection_evidence',
          'raw_secret_values_must_not_be_recorded',
        ],
      },
    };
  }

  return {
    exitCode: Code.SUCCESS,
    result: {
      schema: 'narada.site_telemetry.run_result.v0',
      run_id: `site_telemetry_pull_run:${safePlanToken(options.registryUrl)}`,
      plan_id: `site_telemetry_pull_plan:${safePlanToken(options.registryUrl)}`,
      site_id: 'local_site',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: 'succeeded',
      mode: 'import_preview',
      publication_intent: { status: 'skipped' },
      transport_result: { status: 'skipped' },
      pull_result: result,
      local_admission_result: { status: 'planned_or_skipped', local_inbox_mutated: false },
      remote_finalize_result: {
        status: result.remote_finalized ? 'attempted' : 'skipped',
      },
      raw_secret_values_recorded: false,
      raw_candidate_payloads_recorded: false,
      authority_limits: [
        'local_tool_is_site_embodiment_not_authority_owner',
        'cloud_receipt_is_not_local_admission',
        'local_inbox_mutation_requires_local_governed_command',
        'remote_finalize_requires_local_admission_or_rejection_evidence',
        'raw_secret_values_must_not_be_recorded',
      ],
    },
  };
}

function failure(error: string, reasons: string[]): { exitCode: ExitCode; result: unknown } {
  return {
    exitCode: Code.GENERAL_ERROR,
    result: {
      schema: 'narada.site_telemetry.cli_error.v0',
      status: 'error',
      error,
      reasons,
      live_network_performed: false,
      local_inbox_mutated: false,
      raw_secret_values_recorded: false,
    },
  };
}

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`site_telemetry_event_${field}_required`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function recordValue(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`site_telemetry_event_${field}_required`);
  return value as Record<string, unknown>;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function safePlanToken(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'surface';
}

function refusedResolver(ref: string): string {
  throw new Error(`capability_resolver_required:${ref}`);
}
