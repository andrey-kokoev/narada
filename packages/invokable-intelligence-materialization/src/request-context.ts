import {
  requestScopedMaterializationBinding,
  verifyRequestScopedMaterialization,
} from "@narada2/invokable-intelligence-contract";
import type {
  ContentDigest,
  MaterializationDiagnostic,
  MaterializationEnvelope,
  RequestScopedMaterializationBinding,
} from "@narada2/invokable-intelligence-contract";

export interface RequestScopedSignatureVerifier {
  digest(binding: RequestScopedMaterializationBinding): Promise<ContentDigest>;
  verify(input: {
    binding: RequestScopedMaterializationBinding;
    key_id: string;
    algorithm: string;
    signed_digest: ContentDigest;
    value: string;
  }): Promise<boolean>;
}

export async function verifyRequestScopedContext(
  envelope: MaterializationEnvelope,
  context: { request_id: string; destination_site_id: string; now: string },
  verifier: RequestScopedSignatureVerifier,
): Promise<MaterializationDiagnostic[]> {
  const binding = requestScopedMaterializationBinding(envelope);
  if (!binding || !envelope.request_context) {
    return verifyRequestScopedMaterialization(envelope, {
      ...context,
      compute_binding_digest: () => "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      verify_signature: () => false,
    });
  }
  const computed = await verifier.digest(binding);
  const verified = await verifier.verify({ ...envelope.request_context.signature, binding });
  return verifyRequestScopedMaterialization(envelope, {
    ...context,
    compute_binding_digest: () => computed,
    verify_signature: () => verified,
  });
}
