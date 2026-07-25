declare module '@narada2/site-common-tools/compat/mcp-payload-file.legacy-site' {
  export const attachPayloadSource: any;
  export const buildOutputRefToolContent: any;
  export const commandCreate: any;
  export const commandShow: any;
  export const commandSubmit: any;
  export const commandValidate: any;
  export const enforceInlinePayloadLimit: any;
  export const listCommandTools: any;
  export const listOutputTools: any;
  export const listPayloadTools: any;
  export const outputShow: any;
  export const payloadCreate: any;
  export const payloadDerive: any;
  export const payloadShow: any;
  export const payloadValidate: any;
  export const resultShow: any;
  export const resolveToolPayloadArgs: any;
}

declare module '@narada2/site-common-tools/mcp-freshness-service' {
  export const acknowledgeMcpRestartRequest: any;
  export const buildMcpFreshnessStatus: any;
  export const readJsonFile: any;
  export const reconcileNoRequestMcpFreshnessMarker: any;
  export const writeMcpRestartRequest: any;
  export const writeMcpRuntimeInstanceObservation: any;
}

declare module '@narada2/site-common-tools/operator-surface/mcp-runtime-instance-registry' {
  export const buildMcpRuntimeRegistryStatus: any;
}

declare module '@narada2/site-common-tools/site-locus-shim' {
  export const NARADA_PC_SITE_LOCUS: any;
  export const NARADA_USER_SITE_LOCUS: any;
}

declare module '@narada2/task-lifecycle-tools/src/task-mcp-tool-registry.js' {
  export const taskLifecycleTools: any;
}

declare module '@narada2/site-common-tools/task-lifecycle-mcp-resolution' {
  export const resolveTaskLifecycleMcpServer: any;
}
