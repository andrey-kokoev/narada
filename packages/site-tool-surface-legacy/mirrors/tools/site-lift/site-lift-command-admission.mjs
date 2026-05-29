import { resolve } from 'node:path';
import { createLiftPackageFromPayloadRef } from './create-lift-package.mjs';
import { sendLiftPackageFromPayloadRef } from './send-lift-package.mjs';

export const SITE_LIFT_CREATE_PACKAGE_COMMAND_SCHEMA = 'narada.command.site_lift.create_package.v1';
export const SITE_LIFT_SEND_PACKAGE_COMMAND_SCHEMA = 'narada.command.site_lift.send_package.v1';
export const SITE_LIFT_CREATE_PACKAGE_COMMAND_RESULT_SCHEMA = 'narada.command.site_lift.create_package.result.v1';
export const SITE_LIFT_SEND_PACKAGE_COMMAND_RESULT_SCHEMA = 'narada.command.site_lift.send_package.result.v1';

export function siteLiftCommandAdmitters({ siteRoot = process.cwd() } = {}) {
  const root = resolve(siteRoot);
  return {
    [SITE_LIFT_CREATE_PACKAGE_COMMAND_SCHEMA]: (command) => admitSiteLiftCreatePackageCommand(command, { siteRoot: root }),
    [SITE_LIFT_SEND_PACKAGE_COMMAND_SCHEMA]: (command) => admitSiteLiftSendPackageCommand(command, { siteRoot: root }),
  };
}

export function admitSiteLiftCreatePackageCommand(command, { siteRoot = process.cwd() } = {}) {
  requireCommandSchema(command, SITE_LIFT_CREATE_PACKAGE_COMMAND_SCHEMA);
  const domainArgs = domainArgsFrom(command);
  const result = createLiftPackageFromPayloadRef({
    siteRoot: resolveSiteRoot({ fallbackSiteRoot: siteRoot, command, domainArgs }),
    payloadRef: requiredPayloadRef(command, 'narada.payload.site_lift.package.v1'),
    packageDir: stringOrUndefined(domainArgs.package_dir ?? domainArgs.packageDir),
    metadataDir: stringOrUndefined(domainArgs.metadata_dir ?? domainArgs.metadataDir),
    dryRun: domainArgs.dry_run === true || domainArgs.dryRun === true,
  });
  return {
    schema: SITE_LIFT_CREATE_PACKAGE_COMMAND_RESULT_SCHEMA,
    status: result.status,
    command_schema: SITE_LIFT_CREATE_PACKAGE_COMMAND_SCHEMA,
    domain_result: result,
    package_id: result.package_id,
    payload_ref: result.payload_ref,
    commit_ready_paths: result.commit_ready_paths,
    authority_posture: result.authority_posture,
    receiving_site_must_admit: result.receiving_site_must_admit,
  };
}

export function admitSiteLiftSendPackageCommand(command, { siteRoot = process.cwd() } = {}) {
  requireCommandSchema(command, SITE_LIFT_SEND_PACKAGE_COMMAND_SCHEMA);
  const domainArgs = domainArgsFrom(command);
  const result = sendLiftPackageFromPayloadRef({
    siteRoot: resolveSiteRoot({ fallbackSiteRoot: siteRoot, command, domainArgs }),
    payloadRef: requiredPayloadRef(command, 'narada.payload.site_lift.send.v1'),
    targetSiteRoot: stringOrUndefined(domainArgs.target_site_root ?? domainArgs.targetSiteRoot ?? command.target_site_root),
    sendRecordDir: stringOrUndefined(domainArgs.send_record_dir ?? domainArgs.sendRecordDir),
    dryRun: domainArgs.dry_run === true || domainArgs.dryRun === true,
  });
  return {
    schema: SITE_LIFT_SEND_PACKAGE_COMMAND_RESULT_SCHEMA,
    status: result.status,
    command_schema: SITE_LIFT_SEND_PACKAGE_COMMAND_SCHEMA,
    domain_result: result,
    package_id: result.package_id,
    payload_ref: result.payload_ref,
    target_site_root: result.target_site_root,
    target_envelope_id: result.target_envelope_id,
    send_record_path: result.send_record_path,
    commit_ready_paths: result.commit_ready_paths,
    authority_posture: result.authority_posture,
    receiving_site_must_admit: result.receiving_site_must_admit,
  };
}

function requireCommandSchema(command, expected) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) throw new Error('site_lift_command_must_be_object');
  if (command.command_schema !== expected) throw new Error(`site_lift_command_schema_unsupported: ${command.command_schema ?? '<missing>'}`);
}

function requiredPayloadRef(command, expectedPayloadSchema) {
  const refs = Array.isArray(command.payload_refs) ? command.payload_refs : [];
  const matching = refs.find((entry) => {
    if (typeof entry === 'string') return !expectedPayloadSchema;
    return entry && typeof entry === 'object' && entry.payload_schema === expectedPayloadSchema;
  }) ?? refs[0];
  const ref = typeof matching === 'string' ? matching : matching?.ref;
  if (typeof ref !== 'string' || ref.length === 0) throw new Error('site_lift_command_payload_ref_required');
  return ref;
}

function resolveSiteRoot({ fallbackSiteRoot, command, domainArgs }) {
  return resolve(stringOrUndefined(domainArgs.site_root ?? domainArgs.siteRoot) ?? fallbackSiteRoot);
}

function domainArgsFrom(command) {
  const args = command.domain_args;
  return args && typeof args === 'object' && !Array.isArray(args) ? args : {};
}

function stringOrUndefined(value) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
