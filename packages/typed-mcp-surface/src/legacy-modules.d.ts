declare module '@narada2/site-common-tools/compat/mcp-payload-file.legacy-site' {
  export const attachPayloadSource;
  export const buildOutputRefToolContent;
  export const commandCreate;
  export const commandShow;
  export const commandSubmit;
  export const commandValidate;
  export const enforceInlinePayloadLimit;
  export const listCommandTools;
  export const listOutputTools;
  export const listPayloadTools;
  export const outputShow;
  export const payloadCreate;
  export const payloadDerive;
  export const payloadShow;
  export const payloadValidate;
  export const payloadRefFromEntry;
  export const payloadRefMetadataFromEntry;
  export const resultShow;
  export const resolveToolPayloadArgs;
}
declare module '@narada2/site-common-tools/site-locus-shim' {
  export const assertCanonicalSiteLocus;
}

declare module '@narada2/site-common-tools/inbox/admission-log' {
  export const appendAdmissionEvent; export const admitEnvelope; export const emitEnvelopeAdmitted; export const acknowledgeEnvelope; export const dismissEnvelope; export const exportDispositionLedger; export const readAdmissionLog; export const recordPromotion; export const resolveEnvelopeStatus;
}
declare module '@narada2/site-common-tools/inbox/envelope-kinds' {
  export const INBOX_ENVELOPE_KINDS; export const assertKnownInboxEnvelopeKind;
}
declare module '@narada2/site-common-tools/inbox/inbox-index' {
  export const isValidEnvelopeId;
}
declare module '@narada2/task-lifecycle-tools/recovery-truthfulness-guard' {
  export const validateRecoveryTruthfulnessPacket;
}