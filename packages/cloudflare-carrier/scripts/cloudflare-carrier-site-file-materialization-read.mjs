#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { parseProductReadArgs, readProductSurface } from './cloudflare-carrier-product-read.mjs';

export function parseSiteFileMaterializationReadArgs(argv = [], env = process.env) {
  const args = [...argv];
  const parsed = parseProductReadArgs(['--operation', 'site_file_materialization.list', ...argv], env);
  const focusMaterializationId = normalizeOptionalString(
    option(args, '--site-file-materialization-id') ?? env.CLOUDFLARE_CARRIER_SITE_FILE_MATERIALIZATION_ID ?? null,
  );
  const materializationLimit = parseOptionalInteger(
    option(args, '--materialization-limit') ?? env.CLOUDFLARE_CARRIER_SITE_FILE_MATERIALIZATION_LIMIT ?? null,
    'materialization-limit',
  ) ?? (focusMaterializationId ? 200 : 20);
  return {
    ...parsed,
    focusMaterializationId,
    params: {
      ...parsed.params,
      site_file_materialization_limit: materializationLimit,
    },
  };
}

export async function readSiteFileMaterialization(config, fetchImpl = fetch) {
  const product = await readProductSurface(config, fetchImpl);
  const materializations = Array.isArray(product.response?.materializations) ? product.response.materializations : [];
  if (config.focusMaterializationId && !materializations.some((entry) => entry?.materialization_id === config.focusMaterializationId)) {
    throw new Error(`site_file_materialization_read_focus_not_found:${config.focusMaterializationId}`);
  }
  return {
    schema: 'narada.cloudflare_carrier.site_file_materialization_read.v1',
    status: 'ok',
    worker_url: product.worker_url,
    auth_source: product.auth_source,
    operation: product.operation,
    params: product.params,
    summary: summarizeSiteFileMaterialization(product.response, { focusMaterializationId: config.focusMaterializationId }),
    response: product.response,
  };
}

export function summarizeSiteFileMaterialization(body = {}, options = {}) {
  const materializations = Array.isArray(body?.materializations) ? body.materializations : [];
  const focusMaterializationId = options.focusMaterializationId ?? null;
  const exactFocusedMaterializations = focusMaterializationId
    ? materializations.filter((entry) => entry?.materialization_id === focusMaterializationId)
    : [];
  const focusedMaterializations = exactFocusedMaterializations.length > 0 ? exactFocusedMaterializations : materializations;
  const latest = focusedMaterializations[0] ?? null;
  return {
    site_id: body?.site_id ?? null,
    materialization_count: focusedMaterializations.length,
    focused_materialization_id: latest?.materialization_id ?? focusMaterializationId ?? null,
    focused_read: exactFocusedMaterializations.length > 0,
    site_file_materialization_authority: body?.site_file_materialization_authority ?? null,
    cloudflare_site_file_materialization_admission: body?.cloudflare_site_file_materialization_admission ?? null,
    filesystem_executor_authority: body?.filesystem_executor_authority ?? null,
    windows_filesystem_mutation_admission: body?.windows_filesystem_mutation_admission ?? null,
    repository_publication_admission: body?.repository_publication_admission ?? null,
    authority_partition: body?.authority_partition ?? null,
    latest_materialization_id: latest?.materialization_id ?? null,
    latest_proposal_id: latest?.proposal_id ?? latest?.record?.proposal_id ?? null,
    latest_operation_id: latest?.operation_id ?? latest?.record?.operation_id ?? null,
    latest_file_path: latest?.file_path ?? latest?.record?.file_path ?? null,
    latest_write_effect: latest?.write_effect ?? latest?.record?.write_effect ?? null,
    latest_materialization_posture: latest?.materialization_posture ?? latest?.record?.materialization_posture ?? null,
    latest_recorded_at: latest?.recorded_at ?? latest?.created_at ?? null,
  };
}

export function formatSiteFileMaterializationReadText(result) {
  const summary = result?.summary ?? {};
  const workerUrl = result?.worker_url ?? null;
  const recordedLabel = summary.focused_read ? 'Focused Recorded' : 'Latest Recorded';
  const materializationLead = summary.focused_read
    ? `Materializations: count=${summary.materialization_count ?? 0} focused=${summary.focused_materialization_id ?? 'none'} authority=${summary.site_file_materialization_authority ?? 'unknown'} admission=${summary.cloudflare_site_file_materialization_admission ?? 'unknown'}`
    : `Materializations: count=${summary.materialization_count ?? 0} authority=${summary.site_file_materialization_authority ?? 'unknown'} admission=${summary.cloudflare_site_file_materialization_admission ?? 'unknown'}`;
  const lines = [
    'Site File Materialization Review: ok',
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? 'unknown'}`,
    materializationLead,
  ];
  if (summary.filesystem_executor_authority) lines.push(`Filesystem Executor: ${summary.filesystem_executor_authority}`);
  if (summary.windows_filesystem_mutation_admission || summary.repository_publication_admission) {
    lines.push(`Admissions: filesystem=${summary.windows_filesystem_mutation_admission ?? 'unknown'} repository_publication=${summary.repository_publication_admission ?? 'unknown'}`);
  }
  if (summary.authority_partition) lines.push(`Authority Partition: ${summary.authority_partition}`);
  if (summary.latest_materialization_id || summary.latest_file_path) {
    lines.push(
      `${summary.focused_read ? 'Focused' : 'Latest'} Materialization: ${summary.latest_materialization_id ?? 'none'}`
      + `${summary.latest_proposal_id ? ` proposal=${summary.latest_proposal_id}` : ''}`
      + `${summary.latest_file_path ? ` file=${summary.latest_file_path}` : ''}`
      + `${summary.latest_write_effect ? ` effect=${summary.latest_write_effect}` : ''}`
      + `${summary.latest_materialization_posture ? ` posture=${summary.latest_materialization_posture}` : ''}`,
    );
  }
  if (workerUrl && summary.site_id && summary.latest_materialization_id) {
    lines.push(`Materialization Review: pnpm --filter @narada2/cloudflare-carrier product:site-file:materialization:review:text -- --url ${workerUrl} --site ${summary.site_id} --site-file-materialization-id ${summary.latest_materialization_id} --operator-session-file <operator-session-file>`);
  }
  if (workerUrl && summary.site_id && summary.latest_proposal_id) {
    lines.push(`Proposal Review: pnpm --filter @narada2/cloudflare-carrier product:site-file-change:proposal:review:text -- --url ${workerUrl} --site ${summary.site_id} --focus-ref ${summary.latest_proposal_id} --operator-session-file <operator-session-file>`);
  }
  if (workerUrl && summary.site_id && summary.latest_operation_id) {
    lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${workerUrl} --site ${summary.site_id} --operation-id ${summary.latest_operation_id} --operator-session-file <operator-session-file>`);
    lines.push(`Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${workerUrl} --site ${summary.site_id} --operation-id ${summary.latest_operation_id} --operator-session-file <operator-session-file> --execute-operation-next`);
  }
  if (summary.latest_recorded_at) lines.push(`${recordedLabel}: ${summary.latest_recorded_at}`);
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseSiteFileMaterializationReadArgs(process.argv.slice(2));
    const result = await readSiteFileMaterialization(config);
    if (config.format === 'text') {
      process.stdout.write(formatSiteFileMaterializationReadText(result));
    } else if (config.format === 'summary') {
      process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
  } catch (error) {
    process.stderr.write(JSON.stringify({ ok: false, code: error?.message ?? String(error), response: error?.response }, null, 2) + '\n');
    process.exit(1);
  }
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function parseOptionalInteger(value, label) {
  if (value == null || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) throw new Error(`site_file_materialization_read_invalid_${label}:${value}`);
  return parsed;
}

function normalizeOptionalString(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}
