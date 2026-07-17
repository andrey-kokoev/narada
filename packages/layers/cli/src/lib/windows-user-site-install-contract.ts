export const WINDOWS_USER_SITE_INSTALL_SCHEMA = 'narada.install.windows_user_site.v1' as const;

export const WINDOWS_USER_SITE_ASSET_MARKER = '# narada-managed-asset: windows-user-site.v1';

export const WINDOWS_USER_SITE_PROFILES = {
  minimal: {
    description: 'User Site, resident assistant, and one operator surface.',
    optional_modules: [],
  },
  advanced: {
    description: 'Minimal base plus explicitly admitted optional capability families.',
    optional_modules: [
      'cloudflare',
      'additional-roles',
      'mcp-development',
      'site-administration',
    ],
  },
} as const;

export type WindowsUserSiteInstallProfile = keyof typeof WINDOWS_USER_SITE_PROFILES;

export function resolveWindowsUserSiteInstallProfile(value: unknown): WindowsUserSiteInstallProfile {
  const profile = String(value ?? 'minimal').trim().toLowerCase();
  if (profile === 'minimal' || profile === 'advanced') return profile;
  throw new Error(`windows_user_site_install_profile_invalid: ${profile}; expected minimal or advanced`);
}

export function windowsUserSiteProfileDescriptor(profile: WindowsUserSiteInstallProfile) {
  return WINDOWS_USER_SITE_PROFILES[profile];
}
