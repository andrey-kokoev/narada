declare module '@narada2/task-governance/runtime/inbox/admission-log' {
  export const readAdmissionLog: any;
  export const getLatestEventsByEnvelope: any;
  export const appendAdmissionEvent: any;
  export const acknowledgeEnvelope: any;
  export const dismissEnvelope: any;
  export const resolveEnvelopeStatus: any;
}
declare module '@narada2/task-governance/runtime/inbox/inbox-policy' {
  export const evaluateEnvelopeSeverity: any;
  export const findDuplicateTaskRows: any;
  export const hasEnvelopeCoverageEvidence: any;
  export const levenshteinDistance: any;
}
declare module '@narada2/task-governance/runtime/inbox/inbox-index' {
  export const readIndexedInboxBacklog: any;
  export const refreshInboxIndex: any;
}
declare module '@narada2/task-governance/runtime/mcp-freshness-service' {
  export const acknowledgeMcpRestartRequest: any;
  export const buildMcpFreshnessStatus: any;
  export const buildMcpRestartPressure: any;
  export const buildStaleLiveNavigationDegradation: any;
  export const deriveMcpRestartPressureRecommendation: any;
  export const readJsonFile: any;
  export const writeMcpRuntimeInstanceObservation: any;
  export const writeMcpRestartRequest: any;
}
declare module '@narada2/control-plane' {
  export const Database: any;
}
declare module '@narada2/agent-identity' {
  export const buildAgentIdentityRefV2: any;
  export const resolveAgentIdentityRef: any;
}
