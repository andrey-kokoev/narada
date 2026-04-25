# Agent K Assignment: Package Publishing

## Mission
Set up automated NPM publishing with versioning and changelog.

## Scope
Monorepo - all packages

## Deliverables

### 1. Package.json Cleanup

Ensure all packages ready for publish:

```json
// packages/exchange-fs-sync/package.json
{
  "name": "@narada/exchange-fs-sync",
  "version": "0.1.0",
  "description": "Sync Microsoft Exchange to filesystem",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "type": "module",
  "files": ["dist/", "README.md", "LICENSE"],
  "engines": {
    "node": ">=18.0.0"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/narada/exchange-fs-sync.git"
  },
  "keywords": ["exchange", "microsoft-graph", "email", "sync"],
  "author": "Narada <team@narada.dev>",
  "license": "MIT",
  "publishConfig": {
    "access": "public"
  }
}
```

Verify:
- All dependencies have correct semver ranges
- No `file:` dependencies in published packages
- `bin` entries for CLI packages

### 2. Changesets

```bash
# Install changesets
pnpm add -D @changesets/cli
pnpm changeset init
```

```json
// .changeset/config.json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [
    ["@narada/exchange-fs-sync", "@narada/exchange-fs-sync-cli", "@narada/exchange-fs-sync-daemon"]
  ],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch"
}
```

### 3. Version Script

```json
// root package.json
{
  "scripts": {
    "changeset": "changeset",
    "version-packages": "changeset version",
    "release": "pnpm build && changeset publish"
  }
}
```

### 4. Publish CI Workflow

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    branches: [main]
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'
      - run: pnpm install
      - run: pnpm build
      - run: pnpm test
      
      - name: Create Release Pull Request or Publish
        uses: changesets/action@v1
        with:
          publish: pnpm release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### 5. Pre-publish Checklist Script

```typescript
// scripts/prepublish-check.ts
async function prepublishCheck(): Promise<void> {
  const checks = [
    // All tests pass
    await run('pnpm test'),
    
    // Builds succeed
    await run('pnpm build'),
    
    // No uncommitted changes
    await run('git diff --quiet'),
    
    // Version is valid semver
    validateVersion(),
    
    // All dependencies exist in registry
    await checkDependencies(),
    
    // README exists and has install instructions
    checkReadme(),
    
    // LICENSE file present
    checkLicense(),
    
    // No console.log in production code
    checkNoConsoleLogs(),
  ];
  
  const failures = checks.filter(c => !c.passed);
  if (failures.length > 0) {
    console.error('Pre-publish checks failed:');
    failures.forEach(f => console.error(`  - ${f.name}: ${f.error}`));
    process.exit(1);
  }
}
```

### 6. Docker Image (Optional)

```dockerfile
# Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
EXPOSE 3000
CMD ["node", "dist/daemon.js"]
```

```yaml
# .github/workflows/docker.yml
- name: Build and Push Docker
  uses: docker/build-push-action@v5
  with:
    push: true
    tags: |
      ghcr.io/narada/exchange-fs-sync:${{ github.ref_name }}
      ghcr.io/narada/exchange-fs-sync:latest
```

### 7. Installation Verification

```typescript
// Test install in clean environment
// scripts/test-install.sh

dir=$(mktemp -d)
cd $dir
npm init -y
npm install @narada/exchange-fs-sync
node -e "const pkg = require('@narada/exchange-fs-sync'); console.log('OK:', typeof pkg.loadConfig)"
rm -rf $dir
```

### 8. Documentation

Update README.md with:

```markdown
## Installation

\`\`\`bash
npm install -g @narada/exchange-fs-sync-cli
# or
pnpm add -g @narada/exchange-fs-sync-cli
\`\`\`

## Quick Start

\`\`\`bash
exchange-sync init
exchange-sync sync
\`\`\`
```

## Definition of Done

- [x] All packages have proper package.json metadata
- [x] Changesets configured with linked packages
- [x] CI publishes on merge to main
- [x] Pre-publish checks run
- [x] README has install instructions
- [x] LICENSE files in all packages
- [x] Version tags created automatically (via changesets action)
- [x] Changelog generated from changesets
- [ ] Docker image builds (optional - skipped)
- [ ] Installation test passes (manual verification required)

## Dependencies
- Agent E's tests (must pass before publish)
- Agent F's security (code review complete)
- Agent I's Windows (works on all platforms)

## Time Estimate
2 hours
