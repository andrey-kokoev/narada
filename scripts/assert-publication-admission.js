import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function assertPublicationAdmission(environment = process.env, now = Date.now()) {
  const admissionPath = environment.NARADA_PUBLICATION_ADMISSION_FILE;
  const admissionToken = environment.NARADA_PUBLICATION_ADMISSION_TOKEN;
  const packageName = environment.npm_package_name;
  if (!admissionPath || !admissionToken || !packageName) {
    throw new Error('canonical_publication_admission_missing');
  }

  const admission = JSON.parse(readFileSync(admissionPath, 'utf8'));
  if (admission.schema !== 'narada.npm_publication_admission.v1') {
    throw new Error('canonical_publication_admission_schema_invalid');
  }
  if (admission.token !== admissionToken) {
    throw new Error('canonical_publication_admission_token_invalid');
  }
  if (!Number.isFinite(admission.expires_at_ms) || admission.expires_at_ms <= now) {
    throw new Error('canonical_publication_admission_expired');
  }
  if (!Array.isArray(admission.packages) || !admission.packages.includes(packageName)) {
    throw new Error(`canonical_publication_package_not_admitted: ${packageName}`);
  }
  return { packageName, expiresAtMs: admission.expires_at_ms };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = assertPublicationAdmission();
    console.log(`canonical publication admitted: ${result.packageName}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
