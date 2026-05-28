# Auth Secret Posture

Credentials are capability-bearing material. A credential value is not documentation, task evidence, or launch metadata.

Allowed records:

- credential references;
- provider name;
- mailbox/account id when non-secret;
- scopes requested and granted;
- configured/missing/stale status;
- evidence path that excludes raw secret values.

Disallowed records:

- API keys;
- OAuth access tokens;
- OAuth refresh tokens;
- private keys;
- bearer tokens;
- decrypted certificate private material;
- screenshots or logs containing secret values.

Storage posture:

- Microsoft delegated auth should use Microsoft/OS token cache or an explicitly named local private profile.
- App credentials and API keys should be in environment variables, provider stores, OS secret stores, or Site-local private paths such as `.narada-private`, not committed `.narada` knowledge.
- OneDrive-synced folders may hold non-secret profile metadata, but not portable raw token caches unless the provider explicitly supports secure roaming for that cache.
- Launch registries may name a provider or profile, but must not contain credential values.

Operational evidence must say whether credentials are configured and which capability they support. It must not disclose the secret.
