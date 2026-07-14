import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, resolve, sep } from 'node:path';

const require = createRequire(import.meta.url);

interface ConsoleUiAsset {
  body: Buffer;
  contentType: string;
}

function packageIndexPath(artifactRoot?: string | null): string {
  return artifactRoot ? resolve(artifactRoot, 'index.html') : require.resolve('@narada2/operator-console-ui/dist/index.html');
}

export function readOperatorConsoleUiDocument(artifactRoot?: string | null): string {
  return readFileSync(packageIndexPath(artifactRoot), 'utf8');
}

export function readOperatorConsoleUiAsset(pathname: string, artifactRoot?: string | null): ConsoleUiAsset | null {
  const prefix = '/console/registry/assets/';
  if (!pathname.startsWith(prefix)) return null;
  const relativePath = pathname.slice(prefix.length);
  if (!relativePath || relativePath.includes('\\') || relativePath.split('/').some((part) => part === '..' || part === '.')) return null;

  const assetsRoot = resolve(dirname(packageIndexPath(artifactRoot)), 'assets');
  const assetPath = resolve(assetsRoot, relativePath);
  if (assetPath !== assetsRoot && !assetPath.startsWith(`${assetsRoot}${sep}`)) return null;

  try {
    const extension = extname(assetPath).toLowerCase();
    const contentType = extension === '.js'
      ? 'text/javascript; charset=utf-8'
      : extension === '.css'
        ? 'text/css; charset=utf-8'
        : extension === '.map'
          ? 'application/json; charset=utf-8'
          : 'application/octet-stream';
    return { body: readFileSync(assetPath), contentType };
  } catch {
    return null;
  }
}
