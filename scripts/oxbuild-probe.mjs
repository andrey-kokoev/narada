#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "..");
const packageName = "@narada2/intent-zones";
const packageDir = join(root, "packages", "intent-zones");
const distDir = join(packageDir, "dist");
const workDir = join(tmpdir(), `narada-oxbuild-probe-${Date.now()}`);
const tscDist = join(workDir, "tsc-dist");
const oxDist = join(workDir, "oxbuild-dist");
const oxbuildBin = join(root, "node_modules", ".bin", "oxbuild");

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });
}

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  const scan = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) scan(path);
      else out.push(relative(dir, path).split("\\").join("/"));
    }
  };
  scan(dir);
  return out.sort();
}

function copyDist(source, target) {
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
}

function compareFiles(leftDir, rightDir, extension) {
  const left = listFiles(leftDir).filter((file) => file.endsWith(extension));
  const right = listFiles(rightDir).filter((file) => file.endsWith(extension));
  const names = Array.from(new Set([...left, ...right])).sort();
  return names.map((file) => {
    const leftPath = join(leftDir, file);
    const rightPath = join(rightDir, file);
    const leftExists = existsSync(leftPath);
    const rightExists = existsSync(rightPath);
    return {
      file,
      left_exists: leftExists,
      right_exists: rightExists,
      equal: leftExists && rightExists && readFileSync(leftPath, "utf8") === readFileSync(rightPath, "utf8"),
    };
  });
}

async function main() {
  if (!existsSync(oxbuildBin)) {
    throw new Error("oxbuild binary not found. Run pnpm install.");
  }

  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });

  rmSync(distDir, { recursive: true, force: true });
  run("pnpm", ["--filter", packageName, "build"], { stdio: "pipe" });
  copyDist(distDir, tscDist);

  rmSync(distDir, { recursive: true, force: true });
  const oxbuildStderrPath = join(workDir, "oxbuild.stderr.txt");
  let oxbuildExit = 0;
  let oxbuildStderr = "";
  try {
    run(oxbuildBin, ["--tsconfig", "tsconfig.json"], { cwd: packageDir, stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    oxbuildExit = typeof error.status === "number" ? error.status : 1;
    oxbuildStderr = String(error.stderr ?? error.message ?? error);
  }
  writeFileSync(oxbuildStderrPath, oxbuildStderr);
  if (existsSync(distDir)) copyDist(distDir, oxDist);

  const jsComparison = compareFiles(tscDist, oxDist, ".js");
  const dtsComparison = compareFiles(tscDist, oxDist, ".d.ts");
  const tscExports = await import(`file://${join(tscDist, "index.js")}`);
  const oxbuildExports = await import(`file://${join(oxDist, "index.js")}`);
  const tscExportKeys = Object.keys(tscExports).sort();
  const oxbuildExportKeys = Object.keys(oxbuildExports).sort();
  const result = {
    status: "success",
    package: packageName,
    authoritative_typecheck: "tsc --noEmit",
    authoritative_build: "tsc",
    oxbuild_posture: "experimental_emit_probe_only",
    oxbuild_exit: oxbuildExit,
    oxbuild_stderr: oxbuildStderr.trim(),
    js_byte_equal: jsComparison.every((item) => item.equal),
    runtime_export_keys_equal: JSON.stringify(tscExportKeys) === JSON.stringify(oxbuildExportKeys),
    declaration_equal: dtsComparison.every((item) => item.equal),
    declaration_emitted: dtsComparison.every((item) => item.right_exists),
    tsc_export_keys: tscExportKeys,
    oxbuild_export_keys: oxbuildExportKeys,
    tsc_files: listFiles(tscDist),
    oxbuild_files: listFiles(oxDist),
    js_comparison: jsComparison,
    declaration_comparison: dtsComparison,
  };

  // Leave the workspace in canonical tsc-build posture.
  rmSync(distDir, { recursive: true, force: true });
  run("pnpm", ["--filter", packageName, "build"], { stdio: "pipe" });

  console.log(JSON.stringify(result, null, 2));
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
