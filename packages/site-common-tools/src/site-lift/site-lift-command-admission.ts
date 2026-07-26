import { resolve } from 'node:path';
import { createLiftPackageFromPayloadRef } from './create-lift-package.js';
import { sendLiftPackageFromPayloadRef } from './send-lift-package.js';

export const SITE_LIFT_CREATE_PACKAGE_COMMAND_SCHEMA: any = 'narada.command.site_lift.create_package.v1';
export const SITE_LIFT_SEND_PACKAGE_COMMAND_SCHEMA: any = 'narada.command.site_lift.send_package.v1';
export const SITE_LIFT_CREATE_PACKAGE_COMMAND_RESULT_SCHEMA: any = 'narada.command.site_lift.create_package.result.v1';
export const SITE_LIFT_SEND_PACKAGE_COMMAND_RESULT_SCHEMA: any = 'narada.command.site_lift.send_package.result.v1';

export function siteLiftCommandAdmitters({ siteRoot = process.cwd() }: any = {}) : any{
  const root: any = resolve(siteRoot);
  return {
    [SITE_LIFT_CREATE_PACKAGE_COMMAND_SCHEMA]: (command: any) => admitSiteLiftCreatePackageCommand(command, { siteRoot: root }),
    [SITE_LIFT_SEND_PACKAGE_COMMAND_SCHEMA]: (command: any) => admitSiteLiftSendPackageCommand(command, { siteRoot: root }),
  };
}

export function admitSiteLiftCreatePackageCommand(command: any, { siteRoot = process.cwd() }: any = {}) : any{
  requireCommandSchema(command, SITE_LIFT_CREATE_PACKAGE_COMMAND_SCHEMA);
  const domainArgs: any = domainArgsFrom(command);
  const result: any = createLiftPackageFromPayloadRef({
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
    lifecycle_schema: result.lifecycle_schema,
    lifecycle_state: result.lifecycle_state,
    lifecycle_history: result.lifecycle_history,
  };
}

export function admitSiteLiftSendPackageCommand(command: any, { siteRoot = process.cwd() }: any = {}) : any{
  requireCommandSchema(command, SITE_LIFT_SEND_PACKAGE_COMMAND_SCHEMA);
  const domainArgs: any = domainArgsFrom(command);
  const result: any = sendLiftPackageFromPayloadRef({
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
    lifecycle_schema: result.lifecycle_schema,
    lifecycle_state: result.lifecycle_state,
    lifecycle_history: result.lifecycle_history,
  };
}

function requireCommandSchema(command: any, expected: any) : any{
  if (!command || typeof command !== 'object' || Array.isArray(command)) throw new Error('site_lift_command_must_be_object');
  if (command.command_schema !== expected) throw new Error(`site_lift_command_schema_unsupported: ${command.command_schema ?? '<missing>'}`);
}

function requiredPayloadRef(command: any, expectedPayloadSchema: any) : any{
  const refs: any = Array.isArray(command.payload_refs) ? command.payload_refs : [];
  const matching: any = refs.find((entry: any) => {
    if (typeof entry === 'string') return !expectedPayloadSchema;
    return entry && typeof entry === 'object' && entry.payload_schema === expectedPayloadSchema;
  }) ?? refs[0];
  const ref: any = typeof matching === 'string' ? matching : matching?.ref;
  if (typeof ref !== 'string' || ref.length === 0) throw new Error('site_lift_command_payload_ref_required');
  return ref;
}

function resolveSiteRoot({ fallbackSiteRoot, command, domainArgs }: any) : any{
  return resolve(stringOrUndefined(domainArgs.site_root ?? domainArgs.siteRoot) ?? fallbackSiteRoot);
}

function domainArgsFrom(command: any) : any{
  const args: any = command.domain_args;
  return args && typeof args === 'object' && !Array.isArray(args) ? args : {};
}

function stringOrUndefined(value: any) : any{
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
