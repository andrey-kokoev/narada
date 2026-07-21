/**
 * Authenticated carrier HTTP routing boundary.
 *
 * The router owns request admission and response decoration only. Product
 * handlers, session routing, and authentication remain injected ports so the
 * Worker entry does not become the owner of those bounded contexts.
 */
export function createCloudflareCarrierHttpRouter({
  authenticateCarrierApiRequest,
  isSiteProductOperation,
  handleSiteProductApiRequest,
  routeCarrierSessionRequest,
  withPrincipalEvidence,
  jsonResponse,
} = {}) {
  const requiredPorts = {
    authenticateCarrierApiRequest,
    isSiteProductOperation,
    handleSiteProductApiRequest,
    routeCarrierSessionRequest,
    withPrincipalEvidence,
    jsonResponse,
  };
  for (const [name, port] of Object.entries(requiredPorts)) {
    if (typeof port !== 'function') {
      throw new TypeError(`cloudflare_http_router_missing_${name}`);
    }
  }

  return async function routeCarrierHttpRequest(request, env) {
    const auth = await authenticateCarrierApiRequest(request, env);
    if (!auth.ok) return jsonResponse({ ok: false, code: auth.code }, auth.status);

    const body = await request.clone().json();
    if (isSiteProductOperation(body.operation)) {
      const siteResponse = await handleSiteProductApiRequest(body, auth.principal, env);
      return jsonResponse(
        withPrincipalEvidence(siteResponse.body, body.operation, auth.principal),
        siteResponse.status,
      );
    }
    const routed = await routeCarrierSessionRequest(request.url, body, auth.principal, env);
    return jsonResponse(
      withPrincipalEvidence(routed.body, body.operation, auth.principal),
      routed.status,
    );
  };
}
