/**
 * Graph Draft Metadata Spike
 *
 * Tests whether Microsoft Graph preserves custom Internet headers
 * across draft creation, read-back, send, and sent-item retrieval.
 *
 * Run with:
 *   export GRAPH_TENANT_ID="..."
 *   export GRAPH_CLIENT_ID="..."
 *   export GRAPH_CLIENT_SECRET="..."
 *   npx tsx packages/exchange-fs-sync/test/integration/outbound/graph-draft-metadata-spike.ts
 */

async function getToken(): Promise<string> {
  const tenantId = process.env.GRAPH_TENANT_ID;
  const clientId = process.env.GRAPH_CLIENT_ID;
  const clientSecret = process.env.GRAPH_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Missing GRAPH_TENANT_ID, GRAPH_CLIENT_ID, or GRAPH_CLIENT_SECRET");
  }

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(url, { method: "POST", body });
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function graphFetch(
  token: string,
  path: string,
  opts: RequestInit = {},
): Promise<unknown> {
  const url = path.startsWith("http")
    ? path
    : `https://graph.microsoft.com/v1.0${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...((opts.headers as Record<string, string>) ?? {}),
    },
  });

  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : {};

  if (!res.ok) {
    throw new Error(
      `Graph error ${res.status}: ${JSON.stringify(data)}`,
    );
  }

  return data;
}

async function main(): Promise<void> {
  const token = await getToken();
  const userId = "andrey@kokoev.name";
  const outboundId = `spike-${Date.now()}`;
  const headerName = "X-Outbound-Id";

  console.log("=== Graph Draft Metadata Spike ===");
  console.log("outbound_id:", outboundId);

  // 1. Create draft with custom header
  console.log("\n1. Creating draft with custom header...");
  const draftPayload = {
    subject: `Spike test ${outboundId}`,
    body: {
      contentType: "Text",
      content: "This is a spike test message.",
    },
    toRecipients: [
      {
        emailAddress: {
          address: userId,
        },
      },
    ],
    internetMessageHeaders: [
      {
        name: headerName,
        value: outboundId,
      },
    ],
  };

  const createRes = (await graphFetch(
    token,
    `/users/${userId}/messages`,
    {
      method: "POST",
      body: JSON.stringify(draftPayload),
    },
  )) as { id: string; internetMessageHeaders?: Array<{ name: string; value: string }> };

  const draftId = createRes.id;
  console.log("   Draft created:", draftId);
  console.log("   Headers in create response:", JSON.stringify(createRes.internetMessageHeaders?.find((h) => h.name === headerName)));

  // 2. Read draft back with headers
  console.log("\n2. Reading draft back...");
  const readRes = (await graphFetch(
    token,
    `/users/${userId}/messages/${draftId}?$select=id,subject,internetMessageHeaders`,
  )) as { internetMessageHeaders?: Array<{ name: string; value: string }> };

  const readHeader = readRes.internetMessageHeaders?.find(
    (h) => h.name.toLowerCase() === headerName.toLowerCase(),
  );
  console.log("   Header on read-back:", readHeader ? `${readHeader.name}: ${readHeader.value}` : "NOT FOUND");

  // 3. Send draft
  console.log("\n3. Sending draft...");
  await graphFetch(token, `/users/${userId}/messages/${draftId}/send`, {
    method: "POST",
  });
  console.log("   Draft sent.");

  // 4. Wait a moment and search sent items
  console.log("\n4. Searching sent items for resulting message...");
  await new Promise((r) => setTimeout(r, 5000));

  // Try to find by listing recent sent items and matching subject
  const recentRes = (await graphFetch(
    token,
    `/users/${userId}/mailFolders/sentitems/messages?$top=10&$orderby=sentDateTime desc&$select=id,subject,internetMessageHeaders,sentDateTime`,
  )) as { value: Array<{ id: string; subject?: string; internetMessageHeaders?: Array<{ name: string; value: string }> }> };

  const sentItem = recentRes.value.find((m) => m.subject === `Spike test ${outboundId}`);

  if (!sentItem) {
    console.log("   Sent item not found in recent 10 messages.");
    console.log("   Recent subjects:", recentRes.value.map((m) => m.subject).join("; "));
  } else {
    console.log("   Sent item found:", sentItem.id);
    const sentHeader = sentItem.internetMessageHeaders?.find(
      (h) => h.name.toLowerCase() === headerName.toLowerCase(),
    );
    console.log("   Header on sent item:", sentHeader ? `${sentHeader.name}: ${sentHeader.value}` : "NOT FOUND");
  }

  // 5. Also try fetching the exact message directly
  if (sentItem) {
    const directRes = (await graphFetch(
      token,
      `/users/${userId}/messages/${sentItem.id}?$select=id,internetMessageHeaders`,
    )) as { internetMessageHeaders?: Array<{ name: string; value: string }> };

    const directHeader = directRes.internetMessageHeaders?.find(
      (h) => h.name.toLowerCase() === headerName.toLowerCase(),
    );
    console.log("   Header on direct fetch:", directHeader ? `${directHeader.name}: ${directHeader.value}` : "NOT FOUND");
  }

  console.log("\n=== Spike Complete ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
