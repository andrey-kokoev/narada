/**
 * Litmus admission rule filter.
 *
 * Loads `<sandbox>/rules.json` and `<sandbox>/mode.json` fresh on every call so
 * posture changes made by the harness are picked up each poll cycle. A rule is
 * *engaged* when it has no posture condition or its posture matches the current
 * mode. Engaged rules that declare `overrides` suppress the target rules they
 * name. A message is admitted if at least one engaged rule survives overrides
 * and its remaining `when` conditions all match.
 *
 * Translation semantics (disclosed in the run report):
 *   - `subject_contains`: case-insensitive substring of `subject`.
 *   - `from_in`: message `from` address is in the list.
 *   - `posture`: already handled as engagement, but also checked in the full
 *     match block so a rule with posture only applies while that mode is in
 *     force.
 *   - Unknown condition keys never match (fail closed).
 *   - Missing `rules.json` or `mode.json` defaults to admit-everything so L0/L1
 *     scenarios that lack governance fixtures remain unaffected.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface LitmusRulesFilterOptions {
  /** Absolute path to the litmus sandbox directory. */
  sandboxDir: string;
}

interface RuleWhen {
  subject_contains?: string;
  from_in?: string[];
  posture?: string;
  [key: string]: unknown;
}

interface Rule {
  id: string;
  admit?: boolean;
  when: RuleWhen;
  overrides?: string[];
}

interface Mode {
  posture?: string;
  [key: string]: unknown;
}

export interface FilterableMessage {
  id: string;
  from: string;
  subject?: string;
}

function loadJson<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function ruleMatches(rule: Rule, msg: FilterableMessage, posture: string): boolean {
  if (rule.admit !== true) return false;
  for (const [key, value] of Object.entries(rule.when)) {
    switch (key) {
      case "subject_contains": {
        const needle = String(value ?? "").toLowerCase();
        const haystack = (msg.subject ?? "").toLowerCase();
        if (!haystack.includes(needle)) return false;
        break;
      }
      case "from_in": {
        const allowed = Array.isArray(value) ? value.map(String) : [];
        if (!allowed.includes(msg.from)) return false;
        break;
      }
      case "posture": {
        if (String(value) !== posture) return false;
        break;
      }
      default:
        // Unknown condition keys fail closed.
        return false;
    }
  }
  return true;
}

function ruleEngaged(rule: Rule, posture: string): boolean {
  const required = rule.when.posture;
  return required === undefined || required === posture;
}

export function createLitmusRulesFilter(
  options: LitmusRulesFilterOptions,
): (msg: FilterableMessage) => boolean {
  const { sandboxDir } = options;
  const rulesPath = join(sandboxDir, "rules.json");
  const modePath = join(sandboxDir, "mode.json");

  return (msg: FilterableMessage): boolean => {
    const mode = loadJson<Mode>(modePath);
    const posture = mode?.posture ?? "normal";
    const rules = loadJson<Rule[]>(rulesPath) ?? [];

    const engaged = rules.filter((r) => ruleEngaged(r, posture));
    const suppressed = new Set<string>();
    for (const rule of engaged) {
      for (const target of rule.overrides ?? []) {
        suppressed.add(target);
      }
    }

    return engaged
      .filter((r) => !suppressed.has(r.id))
      .some((r) => ruleMatches(r, msg, posture));
  };
}
