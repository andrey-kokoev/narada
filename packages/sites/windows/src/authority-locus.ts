import { homedir, hostname, userInfo } from "node:os";
import type {
  WindowsAuthorityLocus,
  WindowsPcSiteLocus,
  WindowsSiteLocus,
  WindowsUserSiteLocus,
} from "./types.js";

export type WindowsSiteLocusInput = WindowsSiteLocus | undefined | null;

export interface WindowsSiteLocusValidationResult {
  ok: boolean;
  errors: string[];
}

export function defaultWindowsUserSiteLocus(): WindowsUserSiteLocus {
  const info = userInfo();
  return {
    authority_locus: "user",
    principal: {
      windows_user_profile: homedir(),
      username: info.username,
    },
  };
}

export function defaultWindowsPcSiteLocus(): WindowsPcSiteLocus {
  return {
    authority_locus: "pc",
    machine: {
      hostname: hostname(),
    },
    root_posture: "user_owned_pc_site_prototype",
  };
}

export function defaultWindowsSiteLocus(
  authorityLocus: WindowsAuthorityLocus = "user",
): WindowsSiteLocus {
  return authorityLocus === "pc"
    ? defaultWindowsPcSiteLocus()
    : defaultWindowsUserSiteLocus();
}

export function resolveWindowsSiteLocus(
  locus: WindowsSiteLocusInput,
): WindowsSiteLocus {
  return locus ?? defaultWindowsUserSiteLocus();
}

export function validateWindowsSiteLocus(
  locus: WindowsSiteLocusInput,
): WindowsSiteLocusValidationResult {
  if (!locus) return { ok: true, errors: [] };

  const errors: string[] = [];

  if (locus.authority_locus === "user") {
    if (!locus.principal?.windows_user_profile) {
      errors.push("user locus requires principal.windows_user_profile");
    }
    if (!locus.principal?.username) {
      errors.push("user locus requires principal.username");
    }
  } else if (locus.authority_locus === "pc") {
    if (!locus.machine?.hostname) {
      errors.push("pc locus requires machine.hostname");
    }
    if (
      locus.root_posture !== "user_owned_pc_site_prototype" &&
      locus.root_posture !== "machine_owned"
    ) {
      errors.push(
        "pc locus requires root_posture to be user_owned_pc_site_prototype or machine_owned",
      );
    }
  } else {
    errors.push("locus.authority_locus must be user or pc");
  }

  return { ok: errors.length === 0, errors };
}
