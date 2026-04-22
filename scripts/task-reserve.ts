#!/usr/bin/env tsx
/**
 * Task Range Reservation Script
 *
 * Implements the range reservation protocol from
 * docs/governance/task-graph-evolution-boundary.md §3.
 *
 * Usage:
 *   pnpm exec tsx scripts/task-reserve.ts --range 444-448 --purpose "..." --agent <name>
 *   pnpm exec tsx scripts/task-reserve.ts --list
 *   pnpm exec tsx scripts/task-reserve.ts --release 444-448
 *   pnpm exec tsx scripts/task-reserve.ts --extend 444-448 --hours 24
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const REGISTRY_PATH = resolve(process.cwd(), ".ai", "tasks", ".registry.json");
const MAX_RANGE_SIZE = 20;
const DEFAULT_EXPIRY_HOURS = 24;

interface Reservation {
  range_start: number;
  range_end: number;
  purpose: string;
  reserved_by: string;
  reserved_at: string;
  expires_at: string;
  status: "active" | "released" | "expired";
}

interface TaskRegistry {
  version: number;
  last_allocated: number;
  reservations: Reservation[];
}

function nowISO(): string {
  return new Date().toISOString();
}

function addHoursISO(hours: number): string {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d.toISOString();
}

function isExpired(r: Reservation): boolean {
  if (r.status !== "active") return false;
  return new Date(r.expires_at) < new Date();
}

function loadRegistry(): TaskRegistry {
  if (!existsSync(REGISTRY_PATH)) {
    // Seed from current task graph
    const maxNum = computeMaxTaskNumber();
    return { version: 1, last_allocated: maxNum, reservations: [] };
  }
  const raw = readFileSync(REGISTRY_PATH, "utf8");
  const parsed = JSON.parse(raw) as TaskRegistry;
  validateRegistry(parsed);
  // Auto-mark expired
  let changed = false;
  for (const r of parsed.reservations) {
    if (isExpired(r)) {
      r.status = "expired";
      changed = true;
    }
  }
  if (changed) {
    saveRegistry(parsed);
  }
  return parsed;
}

function saveRegistry(registry: TaskRegistry): void {
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + "\n");
}

function validateRegistry(r: unknown): asserts r is TaskRegistry {
  const obj = r as Record<string, unknown>;
  if (typeof obj.version !== "number") throw new Error("Registry missing 'version'");
  if (typeof obj.last_allocated !== "number") throw new Error("Registry missing 'last_allocated'");
  if (!Array.isArray(obj.reservations)) throw new Error("Registry missing 'reservations' array");
  for (const res of obj.reservations) {
    const rec = res as Record<string, unknown>;
    if (typeof rec.range_start !== "number") throw new Error("Reservation missing 'range_start'");
    if (typeof rec.range_end !== "number") throw new Error("Reservation missing 'range_end'");
    if (typeof rec.purpose !== "string") throw new Error("Reservation missing 'purpose'");
    if (typeof rec.reserved_by !== "string") throw new Error("Reservation missing 'reserved_by'");
    if (typeof rec.reserved_at !== "string") throw new Error("Reservation missing 'reserved_at'");
    if (typeof rec.expires_at !== "string") throw new Error("Reservation missing 'expires_at'");
    if (!["active", "released", "expired"].includes(rec.status as string)) {
      throw new Error(`Invalid reservation status: ${rec.status}`);
    }
  }
}

function computeMaxTaskNumber(): number {
  const tasksDir = join(process.cwd(), ".ai", "tasks");
  let maxNum = 0;
  if (!existsSync(tasksDir)) return maxNum;
  const files = readdirSync(tasksDir).filter((f: string) => f.endsWith(".md"));
  for (const f of files) {
    // Extract from filename: YYYYMMDD-NNN-... or YYYYMMDD-NNN-MMM-...
    const m = f.match(/^\d{8}-(\d{3})(?:-(\d{3}))?-/);
    if (m) {
      const n1 = parseInt(m[1]!, 10);
      const n2 = m[2] ? parseInt(m[2]!, 10) : n1;
      maxNum = Math.max(maxNum, n1, n2);
    }
    // Also extract from heading if readable
    try {
      const content = readFileSync(join(tasksDir, f), "utf8");
      const hm = content.match(/^# Task (\d+)/m);
      if (hm) {
        maxNum = Math.max(maxNum, parseInt(hm[1]!, 10));
      }
    } catch {
      // ignore unreadable
    }
  }
  return maxNum;
}

function parseRange(rangeStr: string): { start: number; end: number } {
  const m = rangeStr.match(/^(\d+)-(\d+)$/);
  if (!m) throw new Error(`Invalid range format: ${rangeStr}. Expected NNN-MMM.`);
  const start = parseInt(m[1]!, 10);
  const end = parseInt(m[2]!, 10);
  if (start > end) throw new Error(`Invalid range: start (${start}) > end (${end}).`);
  return { start, end };
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start <= b.end && b.start <= a.end;
}

function findReservation(registry: TaskRegistry, start: number, end: number): Reservation | undefined {
  return registry.reservations.find(
    (r) => r.range_start === start && r.range_end === end
  );
}

function reserve(rangeStr: string, purpose: string, agent: string): void {
  const { start, end } = parseRange(rangeStr);
  const size = end - start + 1;
  if (size > MAX_RANGE_SIZE) {
    throw new Error(
      `Range size ${size} exceeds maximum ${MAX_RANGE_SIZE}. ` +
        `Use operator approval for larger ranges.`
    );
  }

  const registry = loadRegistry();

  // Check overlap with active reservations
  for (const r of registry.reservations) {
    if (r.status === "active" && overlaps({ start, end }, { start: r.range_start, end: r.range_end })) {
      throw new Error(
        `Range ${rangeStr} overlaps with active reservation ` +
          `${r.range_start}-${r.range_end} (reserved by ${r.reserved_by}).`
      );
    }
  }

  const reservation: Reservation = {
    range_start: start,
    range_end: end,
    purpose,
    reserved_by: agent,
    reserved_at: nowISO(),
    expires_at: addHoursISO(DEFAULT_EXPIRY_HOURS),
    status: "active",
  };

  registry.reservations.push(reservation);
  registry.last_allocated = Math.max(registry.last_allocated, end);
  saveRegistry(registry);

  console.log(`Reserved ${rangeStr} for "${purpose}" by ${agent}.`);
  console.log(`Expires at: ${reservation.expires_at}`);
}

function listReservations(): void {
  const registry = loadRegistry();
  const active = registry.reservations.filter((r) => r.status === "active");
  const expired = registry.reservations.filter((r) => r.status === "expired");
  const released = registry.reservations.filter((r) => r.status === "released");

  console.log(`Registry: version=${registry.version}, last_allocated=${registry.last_allocated}`);
  console.log("");

  if (active.length > 0) {
    console.log("Active reservations:");
    for (const r of active) {
      console.log(
        `  ${r.range_start}-${r.range_end}: ${r.purpose} ` +
          `(by ${r.reserved_by}, expires ${r.expires_at})`
      );
    }
  } else {
    console.log("No active reservations.");
  }

  if (expired.length > 0) {
    console.log("");
    console.log("Expired reservations:");
    for (const r of expired) {
      console.log(
        `  ${r.range_start}-${r.range_end}: ${r.purpose} ` +
          `(by ${r.reserved_by}, expired ${r.expires_at})`
      );
    }
  }

  if (released.length > 0) {
    console.log("");
    console.log("Released reservations:");
    for (const r of released) {
      console.log(
        `  ${r.range_start}-${r.range_end}: ${r.purpose} ` +
          `(by ${r.reserved_by}, released)`
      );
    }
  }
}

function releaseRange(rangeStr: string): void {
  const { start, end } = parseRange(rangeStr);
  const registry = loadRegistry();
  const r = findReservation(registry, start, end);
  if (!r) {
    throw new Error(`No reservation found for range ${rangeStr}.`);
  }
  if (r.status === "released") {
    console.log(`Range ${rangeStr} is already released.`);
    return;
  }
  r.status = "released";
  // Recalculate last_allocated from actual tasks and active reservations
  const maxTaskNum = computeMaxTaskNumber();
  const maxActiveRes = registry.reservations
    .filter((res) => res.status === "active")
    .reduce((max, res) => Math.max(max, res.range_end), 0);
  registry.last_allocated = Math.max(maxTaskNum, maxActiveRes);
  saveRegistry(registry);
  console.log(`Released ${rangeStr}.`);
}

function extendRange(rangeStr: string, hours: number): void {
  const { start, end } = parseRange(rangeStr);
  const registry = loadRegistry();
  const r = findReservation(registry, start, end);
  if (!r) {
    throw new Error(`No reservation found for range ${rangeStr}.`);
  }
  if (r.status !== "active") {
    throw new Error(`Cannot extend ${rangeStr}: status is ${r.status}.`);
  }
  r.expires_at = addHoursISO(hours);
  saveRegistry(registry);
  console.log(`Extended ${rangeStr} by ${hours} hours. New expiry: ${r.expires_at}`);
}

function showHelp(): void {
  console.log(`Task Range Reservation Script

Usage:
  pnpm exec tsx scripts/task-reserve.ts --range START-END --purpose "..." --agent NAME
  pnpm exec tsx scripts/task-reserve.ts --list
  pnpm exec tsx scripts/task-reserve.ts --release START-END
  pnpm exec tsx scripts/task-reserve.ts --extend START-END --hours N

Options:
  --range START-END     Reserve a task-number range (inclusive)
  --purpose TEXT        Description of the reservation
  --agent NAME          Who is reserving
  --list                List all reservations
  --release START-END   Release a reservation
  --extend START-END    Extend an active reservation
  --hours N             Hours to extend (default: 24)
  --help                Show this help
`);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    showHelp();
    process.exit(0);
  }

  const rangeIdx = args.indexOf("--range");
  const listIdx = args.indexOf("--list");
  const releaseIdx = args.indexOf("--release");
  const extendIdx = args.indexOf("--extend");
  const purposeIdx = args.indexOf("--purpose");
  const agentIdx = args.indexOf("--agent");
  const hoursIdx = args.indexOf("--hours");

  try {
    if (listIdx !== -1) {
      listReservations();
      return;
    }

    if (releaseIdx !== -1) {
      const range = args[releaseIdx + 1];
      if (!range) throw new Error("--release requires a range argument.");
      releaseRange(range);
      return;
    }

    if (extendIdx !== -1) {
      const range = args[extendIdx + 1];
      if (!range) throw new Error("--extend requires a range argument.");
      const hours = hoursIdx !== -1 ? parseInt(args[hoursIdx + 1]!, 10) : DEFAULT_EXPIRY_HOURS;
      if (Number.isNaN(hours)) throw new Error("--hours must be a number.");
      extendRange(range, hours);
      return;
    }

    if (rangeIdx !== -1) {
      const range = args[rangeIdx + 1];
      if (!range) throw new Error("--range requires a range argument.");
      const purpose = purposeIdx !== -1 ? args[purposeIdx + 1]! : "";
      const agent = agentIdx !== -1 ? args[agentIdx + 1]! : "";
      if (!purpose) throw new Error("--purpose is required for reservation.");
      if (!agent) throw new Error("--agent is required for reservation.");
      reserve(range, purpose, agent);
      return;
    }

    showHelp();
    process.exit(1);
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
