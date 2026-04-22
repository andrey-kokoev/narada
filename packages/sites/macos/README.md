# @narada2/macos-site

macOS Site materialization for Narada bounded Cycle execution.

## Overview

This package provides the macOS-specific substrate for running Narada Sites:

- **Bounded Cycle runner** — acquires lock, runs 8-step pipeline, releases lock, exits
- **LaunchAgent supervision** — generates `launchd` plists and wrapper scripts
- **Site-local coordinator** — SQLite health and trace storage
- **Credential resolution** — macOS Keychain → environment → `.env` fallback
- **Path utilities** — `~/Library/Application Support/Narada/` conventions with space-safe handling

## Site Root

Default: `~/Library/Application Support/Narada/{site_id}`

Override: `NARADA_SITE_ROOT` environment variable

```
~/Library/Application Support/Narada/{site_id}/
  ├── config.json
  ├── coordinator.db
  ├── .env
  ├── state/
  ├── messages/
  ├── tombstones/
  ├── views/
  ├── blobs/
  ├── tmp/
  ├── db/
  ├── logs/
  └── traces/
```

## Credentials

Secrets are resolved in this precedence:

1. **macOS Keychain** — `security find-generic-password -s "dev.narada.site.{site_id}.{secret_name}" -w`
2. **Environment variable** — `NARADA_{SITE_ID}_{SECRET_NAME}`
3. **`.env` file** — in the Site root directory
4. **Config value** — passed as `options.configValue`

### TCC (Transparency, Consent, and Control)

The first Keychain access from a new process may trigger a macOS system dialog asking for permission. To avoid this dialog appearing during unattended LaunchAgent execution:

```bash
# Trigger the TCC prompt interactively before activating the LaunchAgent
npx tsx -e "require('@narada2/macos-site').setupKeychainAccess('my-site')"
```

Or use the helper directly:

```typescript
import { setupKeychainAccess } from "@narada2/macos-site";
await setupKeychainAccess("my-site");
```

If Keychain access is denied, the resolver falls through silently to environment variables and `.env`.

## LaunchAgent

A LaunchAgent plist is generated per Site:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" ...>
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>dev.narada.site.{site_id}</string>
  <key>ProgramArguments</key>
  <array>
    <string>{siteRoot}/run-cycle.sh</string>
  </array>
  <key>StartInterval</key>
  <integer>{interval_seconds}</integer>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
```

The wrapper script is `#!/bin/zsh` with absolute paths and quoted variables to handle spaces in `Application Support`.

## API

### Runner

```typescript
import { DefaultMacosSiteRunner } from "@narada2/macos-site";

const runner = new DefaultMacosSiteRunner();
const result = await runner.runCycle({
  site_id: "my-site",
  site_root: "/path/to/site",
  config_path: "/path/to/site/config.json",
  cycle_interval_minutes: 5,
  lock_ttl_ms: 35_000,
  ceiling_ms: 30_000,
});
```

### Supervisor

```typescript
import { writeLaunchAgentFiles, generateLoadCommand } from "@narada2/macos-site";

const { plistPath, scriptPath } = await writeLaunchAgentFiles(config);
console.log(generateLoadCommand("my-site"));
```

### Credentials

```typescript
import { resolveSecret, resolveSecretRequired } from "@narada2/macos-site";

const token = await resolveSecret("my-site", "GRAPH_ACCESS_TOKEN");
const required = await resolveSecretRequired("my-site", "ADMIN_TOKEN");
```

## Testing

```bash
pnpm test
```

Tests cover:
- Plist generation and XML escaping
- Wrapper script path quoting
- Cycle execution, health transitions, and trace writing
- Lock acquisition, contention, and stale recovery
- Credential fallback chain (Keychain → env → `.env` → config)
- Path resolution with spaces
