import { buildProjectionRegistrationPlan, type ArtifactKind, type ArtifactProjectionContentMode, type ProjectionCachePolicy, type ProjectionEventPolicyMode } from '@narada2/cloudflare-nars-projection';
import { preflightCloudflareProjectionRegistration, registerProjectionRemotely, startLocalProjectionBridgeLoop, startLocalProjectionBridgeOnce, writeProjectionRegistrationPlan } from '@narada2/cloudflare-nars-projection/node';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';

export interface NarsProjectionRegisterOptions {
  siteId?: string;
  siteRoot?: string;
  session?: string;
  projectionId?: string;
  eventPolicy?: string;
  inputVerb?: string[];
  cachePolicy?: string;
  artifactContent?: string;
  artifactKind?: string[];
  createdBy?: string;
  cloudflareApiBaseUrl?: string;
  cloudflareCarrierUrl?: string;
  operatorCookieFile?: string;
  siteCoherenceSiteId?: string;
  requireOperatorSession?: boolean;
  preflightOnly?: boolean;
  dryRun?: boolean;
  format?: CliFormat;
}

export async function narsProjectionBridgeRunCommand(options: NarsProjectionBridgeStartOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const siteRoot = requireOption(options.siteRoot, '--site-root');
  const projectionId = requireOption(options.projectionId, '--projection-id');
  const result = await startLocalProjectionBridgeLoop({
    site_root: siteRoot,
    projection_id: projectionId,
    cloudflare_api_base_url: options.cloudflareApiBaseUrl,
    max_events: options.maxEvents,
    max_artifacts: options.maxArtifacts,
    poll_interval_ms: options.pollIntervalMs,
    stop_after_iterations: options.stopAfterIterations,
  });
  return {
    exitCode: ExitCode.SUCCESS,
    result: formattedResult(result, [
      `Cloudflare NARS projection bridge loop ${result.status}: ${projectionId}`,
      `  Site        ${siteRoot}`,
      `  Iterations  ${result.iteration_count}`,
    ], options.format ?? 'auto'),
  };
}

export interface NarsProjectionBridgeStartOptions {
  siteRoot?: string;
  projectionId?: string;
  maxEvents?: number;
  maxArtifacts?: number;
  cloudflareApiBaseUrl?: string;
  pollIntervalMs?: number;
  stopAfterIterations?: number;
  format?: CliFormat;
}

export async function narsProjectionRegisterCommand(options: NarsProjectionRegisterOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const siteId = requireOption(options.siteId, '--site-id');
  const session = requireOption(options.session, '--session');
  const siteRoot = options.siteRoot ?? null;
  const inputPolicy = normalizeInputVerbs(options.inputVerb);
  const planInput = {
    site_id: siteId,
    site_root: siteRoot,
    nars_session_id: session,
    projection_id: options.projectionId,
    event_stream_policy: normalizeEventPolicy(options.eventPolicy),
    operator_input_policy: inputPolicy,
    replica_cache_policy: normalizeCachePolicy(options.cachePolicy),
    artifact_projection_policy: {
      content: normalizeArtifactContent(options.artifactContent),
      allowed_kinds: normalizeArtifactKinds(options.artifactKind),
      redact_local_paths: true,
    },
    created_by: options.createdBy ?? 'operator',
    dry_run: options.dryRun ?? true,
  };
  const plan = planInput.dry_run
    ? buildProjectionRegistrationPlan(planInput)
    : options.preflightOnly
      ? await preflightCloudflareProjectionRegistration({ cloudflare_api_base_url: options.cloudflareApiBaseUrl, cloudflare_carrier_api_base_url: options.cloudflareCarrierUrl, operator_cookie_file: options.operatorCookieFile, site_coherence_site_id: options.siteCoherenceSiteId, require_operator_session: options.requireOperatorSession })
    : options.cloudflareApiBaseUrl
      ? await registerProjectionRemotely({ ...planInput, site_root: requireOption(siteRoot ?? undefined, '--site-root'), cloudflare_api_base_url: options.cloudflareApiBaseUrl, cloudflare_carrier_api_base_url: options.cloudflareCarrierUrl, operator_cookie_file: options.operatorCookieFile, site_coherence_site_id: options.siteCoherenceSiteId, require_operator_session: options.requireOperatorSession })
      : writeProjectionRegistrationPlan({ ...planInput, site_root: requireOption(siteRoot ?? undefined, '--site-root') });
  if (isProjectionPreflightRefusal(plan)) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: formattedResult(plan, [
        `Cloudflare NARS projection preflight refused: ${plan.code}`,
        `  Action  ${plan.operator_action}`,
      ], options.format ?? 'auto'),
    };
  }
  return {
    exitCode: 'status' in plan && plan.status === 'remote_registration_preflight_refused' ? ExitCode.GENERAL_ERROR : ExitCode.SUCCESS,
    result: formattedResult(plan, [
      ...formatProjectionPlanLines(plan),
    ], options.format ?? 'auto'),
  };
}

function isProjectionPreflightRefusal(plan: unknown): plan is { status: 'refused'; code: string; operator_action: string } {
  return Boolean(plan && typeof plan === 'object' && (plan as { status?: unknown }).status === 'refused');
}

function formatProjectionPlanLines(plan: Record<string, unknown>): string[] {
  if (plan.status === 'remote_registration_preflight_refused') {
    const preflight = plan.preflight as { code?: string; operator_action?: string } | undefined;
    return [`Cloudflare NARS projection preflight refused: ${preflight?.code ?? 'unknown'}`, `  Action  ${preflight?.operator_action ?? 'Inspect JSON output.'}`];
  }
  if (plan.schema === 'narada.cloudflare_nars_projection.preflight.v1') {
    return [`Cloudflare NARS projection preflight ${plan.status}`, `  Operator session  ${plan.operator_session_check ?? 'unknown'}`];
  }
  const localIntent = plan.local_intent as { site_id: string; nars_session_id: string; event_stream_policy: string; operator_input_policy: string[]; replica_cache_policy: string; artifact_projection_policy: { content: string; allowed_kinds: string[] } };
  const bridgeLaunch = plan.bridge_launch as { command: string; args: string[] };
  return [
    `Cloudflare NARS projection ${plan.status}: ${plan.projection_id}`,
    `  Site     ${localIntent.site_id}`,
    `  Session  ${localIntent.nars_session_id}`,
    `  Events   ${localIntent.event_stream_policy}`,
    `  Input    ${localIntent.operator_input_policy.join(', ') || 'none'}`,
    `  Cache    ${localIntent.replica_cache_policy}`,
    `  Artifacts metadata; content=${localIntent.artifact_projection_policy.content}; kinds=${localIntent.artifact_projection_policy.allowed_kinds.join(', ')}`,
    `  Bridge   ${bridgeLaunch.command} ${bridgeLaunch.args.join(' ')}`,
  ];
}

export async function narsProjectionBridgeStartCommand(options: NarsProjectionBridgeStartOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const siteRoot = requireOption(options.siteRoot, '--site-root');
  const projectionId = requireOption(options.projectionId, '--projection-id');
  const result = await startLocalProjectionBridgeOnce({
    site_root: siteRoot,
    projection_id: projectionId,
    cloudflare_api_base_url: options.cloudflareApiBaseUrl,
    max_events: options.maxEvents,
    max_artifacts: options.maxArtifacts,
  });
  return {
    exitCode: result.status === 'refused' ? ExitCode.GENERAL_ERROR : ExitCode.SUCCESS,
    result: formattedResult(result, [
      `Cloudflare NARS projection bridge ${result.status}: ${projectionId}`,
      `  Site    ${siteRoot}`,
      `  Reason  ${'reason' in result ? result.reason ?? 'none' : 'none'}`,
      `  Events  ${'projected_event_count' in result ? result.projected_event_count : 0}`,
      `  Artifact metadata  ${'projected_artifact_metadata_count' in result ? result.projected_artifact_metadata_count : 0}`,
      `  Artifact content   ${'projected_artifact_content_count' in result ? result.projected_artifact_content_count : 0}`,
    ], options.format ?? 'auto'),
  };
}

function requireOption(value: string | undefined, name: string): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function normalizeInputVerbs(values: string[] | undefined) {
  const raw = values?.length ? values : ['conversation.send', 'conversation.enqueue'];
  return raw.flatMap((value) => String(value).split(',')).map((value) => value.trim()).filter(Boolean) as Array<'conversation.send' | 'conversation.enqueue' | 'conversation.steer'>;
}

function normalizeCachePolicy(value: string | undefined): ProjectionCachePolicy {
  return value === 'durable_archive' ? 'durable_archive' : 'short_bounded';
}

function normalizeEventPolicy(value: string | undefined): ProjectionEventPolicyMode {
  if (value === 'conversation' || value === 'operator' || value === 'diagnostic' || value === 'raw') return value;
  return 'operator';
}

function normalizeArtifactContent(value: string | undefined): ArtifactProjectionContentMode {
  if (value === 'metadata_only' || value === 'selected_kinds' || value === 'explicit_artifacts' || value === 'none') return value;
  return 'metadata_only';
}

function normalizeArtifactKinds(values: string[] | undefined): ArtifactKind[] {
  const raw = values?.length ? values : ['markdown', 'json', 'text'];
  return raw.flatMap((value) => String(value).split(','))
    .map((value) => value.trim())
    .filter((value): value is ArtifactKind => value === 'markdown' || value === 'json' || value === 'text' || value === 'image' || value === 'html');
}
