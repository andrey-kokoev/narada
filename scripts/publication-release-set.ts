import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

interface PublicationManifest {
  schema: string;
  packages: Array<{ name: string; path: string }>;
}

export function changesetPackageNames(source: string, sourceName: string): string[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '---') {
    throw new Error(`changeset_frontmatter_missing: ${sourceName}`);
  }
  const closingIndex = lines.indexOf('---', 1);
  if (closingIndex < 0) {
    throw new Error(`changeset_frontmatter_unclosed: ${sourceName}`);
  }

  return lines.slice(1, closingIndex)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const match = line.match(/^\s*["']?([^"']+?)["']?\s*:\s*(patch|minor|major)\s*$/);
      if (!match) {
        throw new Error(`changeset_frontmatter_entry_invalid: ${sourceName}: ${line}`);
      }
      return match[1];
    });
}

export function validatePublicationReleaseSet(
  changesets: Array<{ name: string; source: string }>,
  allowedPackageNames: ReadonlySet<string>,
): string[] {
  const requested = new Set<string>();
  for (const changeset of changesets) {
    for (const packageName of changesetPackageNames(changeset.source, changeset.name)) {
      requested.add(packageName);
    }
  }

  const unlisted = [...requested].filter((name) => !allowedPackageNames.has(name)).sort();
  if (unlisted.length > 0) {
    throw new Error(`publication_release_set_not_canonical: ${unlisted.join(', ')}`);
  }
  return [...requested].sort();
}

export function assertPublicationReleaseSet(
  repositoryRoot = process.cwd(),
): string[] {
  const allowedPackageNames = canonicalPublicationPackageNames(repositoryRoot);
  const changesetRoot = join(repositoryRoot, '.changeset');
  const changesets = readdirSync(changesetRoot)
    .filter((name) => name.endsWith('.md') && name.toLowerCase() !== 'readme.md')
    .map((name) => ({
      name,
      source: readFileSync(join(changesetRoot, name), 'utf8'),
    }));
  return validatePublicationReleaseSet(changesets, new Set(allowedPackageNames));
}

export function canonicalPublicationPackageNames(
  repositoryRoot = process.cwd(),
): string[] {
  const manifestPath = join(repositoryRoot, 'config', 'npm-publication-packages.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PublicationManifest;
  if (manifest.schema !== 'narada.npm_publication_packages.v1') {
    throw new Error(`publication_manifest_schema_invalid: ${manifest.schema}`);
  }
  return manifest.packages.map(({ name }) => name).sort();
}
