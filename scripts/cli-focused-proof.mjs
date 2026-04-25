#!/usr/bin/env node

import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = process.cwd();

function usage() {
  console.error("Usage: node scripts/cli-focused-proof.mjs <suite> [--case <name>]");
  process.exit(1);
}

const args = process.argv.slice(2);
const suite = args[0];
const caseIndex = args.indexOf("--case");
const caseName = caseIndex >= 0 ? args[caseIndex + 1] : null;

if (!suite) usage();

async function loadCli() {
  return {
    taskPromoteRecommendationCommand: (await import(resolve(ROOT, "packages/layers/cli/dist/commands/task-promote-recommendation.js"))).taskPromoteRecommendationCommand,
    openTaskLifecycleStore: (await import(resolve(ROOT, "packages/layers/cli/dist/lib/task-lifecycle-store.js"))).openTaskLifecycleStore,
    ExitCode: (await import(resolve(ROOT, "packages/layers/cli/dist/lib/exit-codes.js"))).ExitCode,
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseCaseFromCommandLinePattern(pattern) {
  if (!pattern) return null;
  const map = new Map([
    ["promotes a valid recommendation successfully", "valid"],
    ["fails when dependency is not satisfied", "dependency_missing"],
    ["fails when task is not opened", "claimed"],
    ["dry-run does not mutate anything", "dry_run"],
    ["returns roster in human format", "show_human"],
    ["shows guidance in human format when verbose is set", "show_verbose"],
    ["returns roster in json format", "show_json"],
    ["records status working and task number", "assign_success"],
    ["records status reviewing and task number", "review_success"],
    ["succeeds in strict mode when evidence is complete", "done_strict_complete"],
    ["clears task without changing last_done", "idle_preserves_last_done"],
  ]);
  for (const [text, value] of map) {
    if (pattern.includes(text)) return value;
  }
  return null;
}

async function runTaskPromoteRecommendationProof(selectedCase) {
  const { taskPromoteRecommendationCommand, openTaskLifecycleStore, ExitCode } = await loadCli();

  function setupRepo(tempDir) {
    mkdirSync(join(tempDir, ".ai", "do-not-open", "tasks"), { recursive: true });
    mkdirSync(join(tempDir, ".ai", "agents"), { recursive: true });

    writeFileSync(
      join(tempDir, ".ai", "do-not-open", "tasks", "20260422-100-test-task.md"),
      "---\ntask_id: 100\nstatus: opened\n---\n\n# Task 100 — Test task for promotion\n\n## Acceptance Criteria\n\n- [ ] Something\n",
    );
    writeFileSync(
      join(tempDir, ".ai", "do-not-open", "tasks", "20260422-050-dep-satisfied.md"),
      "---\ntask_id: 50\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n---\n\n# Task 50 — Completed dependency\n\n## Acceptance Criteria\n\n- [x] Criterion 1\n\n## Execution Notes\n\nCompleted.\n\n## Verification\n\nVerified.\n",
    );
    writeFileSync(
      join(tempDir, ".ai", "do-not-open", "tasks", "20260422-101-with-dep.md"),
      "---\ntask_id: 101\nstatus: opened\ndepends_on: [50]\n---\n\n# Task 101 — Task with satisfied dependency\n\n## Acceptance Criteria\n\n- [ ] Something\n",
    );
    writeFileSync(
      join(tempDir, ".ai", "do-not-open", "tasks", "20260422-102-with-unsatisfied-dep.md"),
      "---\ntask_id: 102\nstatus: opened\ndepends_on: [9999]\n---\n\n# Task 102 — Task with missing dependency\n\n## Acceptance Criteria\n\n- [ ] Something\n",
    );
    writeFileSync(
      join(tempDir, ".ai", "do-not-open", "tasks", "20260422-103-claimed.md"),
      "---\ntask_id: 103\nstatus: claimed\n---\n\n# Task 103 — Already claimed\n",
    );

    const store = openTaskLifecycleStore(tempDir);
    try {
      const now = new Date().toISOString();
      const seedLifecycle = (taskId, taskNumber, status) => {
        store.upsertLifecycle({
          task_id: taskId,
          task_number: taskNumber,
          status,
          governed_by: status === "closed" ? "task_close:seed" : null,
          closed_at: status === "closed" ? "2026-04-20T00:00:00Z" : null,
          closed_by: status === "closed" ? "seed" : null,
          reopened_at: null,
          reopened_by: null,
          continuation_packet_json: null,
          updated_at: now,
        });
      };
      seedLifecycle("20260422-100-test-task", 100, "opened");
      seedLifecycle("20260422-050-dep-satisfied", 50, "closed");
      seedLifecycle("20260422-101-with-dep", 101, "opened");
      seedLifecycle("20260422-102-with-unsatisfied-dep", 102, "opened");
      seedLifecycle("20260422-103-claimed", 103, "claimed");
      store.upsertRosterEntry({
        agent_id: "a1",
        role: "implementer",
        capabilities_json: JSON.stringify(["typescript", "testing", "cli"]),
        first_seen_at: now,
        last_active_at: now,
        status: "idle",
        task_number: null,
        last_done: null,
        updated_at: now,
      });
      store.upsertRosterEntry({
        agent_id: "a2",
        role: "implementer",
        capabilities_json: JSON.stringify(["typescript", "testing"]),
        first_seen_at: now,
        last_active_at: now,
        status: "working",
        task_number: 999,
        last_done: null,
        updated_at: now,
      });
      store.insertAssignment({
        assignment_id: "assignment-103-a1",
        task_id: "20260422-103-claimed",
        agent_id: "a1",
        claimed_at: "2026-04-22T00:00:00.000Z",
        released_at: null,
        release_reason: null,
        intent: "primary",
      });
    } finally {
      store.db.close();
    }
  }

  function listPromotionRows(tempDir) {
    const store = openTaskLifecycleStore(tempDir);
    try {
      return store.listPromotionRecords();
    } finally {
      store.db.close();
    }
  }

  const cases = {
    valid: async () => {
      const tempDir = mkdtempSync(join(tmpdir(), "narada-promote-proof-"));
      try {
        setupRepo(tempDir);
        const result = await taskPromoteRecommendationCommand({
          cwd: tempDir,
          format: "json",
          taskNumber: "100",
          agent: "a1",
          by: "operator-kimi",
        });
        assert(result.exitCode === ExitCode.SUCCESS, `expected success, got ${result.exitCode}`);
        assert(result.result.status === "executed", `expected executed status, got ${result.result.status}`);
        const rows = listPromotionRows(tempDir);
        assert(rows.length === 1, `expected 1 promotion row, got ${rows.length}`);
        const promotion = JSON.parse(rows[0].promotion_json);
        assert(promotion.status === "executed", `expected promotion row executed, got ${promotion.status}`);
        assert(!existsSync(join(tempDir, ".ai", "do-not-open", "tasks", "promotions")), "unexpected promotions directory");
        const taskFile = readFileSync(join(tempDir, ".ai", "do-not-open", "tasks", "20260422-100-test-task.md"), "utf8");
        assert(taskFile.includes("status: claimed"), "task file was not claimed");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },
    dependency_missing: async () => {
      const tempDir = mkdtempSync(join(tmpdir(), "narada-promote-proof-"));
      try {
        setupRepo(tempDir);
        const result = await taskPromoteRecommendationCommand({
          cwd: tempDir,
          format: "json",
          taskNumber: "102",
          agent: "a1",
          by: "operator-kimi",
        });
        assert(result.exitCode !== ExitCode.SUCCESS, "expected dependency failure");
        const rows = listPromotionRows(tempDir);
        const promotion = JSON.parse(rows[0].promotion_json);
        const depCheck = promotion.validation_results.find((v) => v.check === "dependencies");
        assert(depCheck && depCheck.passed === false, "dependency check did not fail");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },
    claimed: async () => {
      const tempDir = mkdtempSync(join(tmpdir(), "narada-promote-proof-"));
      try {
        setupRepo(tempDir);
        const result = await taskPromoteRecommendationCommand({
          cwd: tempDir,
          format: "json",
          taskNumber: "103",
          agent: "a1",
          by: "operator-kimi",
        });
        assert(result.exitCode !== ExitCode.SUCCESS, "expected claimed-task failure");
        const rows = listPromotionRows(tempDir);
        const promotion = JSON.parse(rows[0].promotion_json);
        assert(promotion.status === "stale", `expected stale promotion, got ${promotion.status}`);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },
    dry_run: async () => {
      const tempDir = mkdtempSync(join(tmpdir(), "narada-promote-proof-"));
      try {
        setupRepo(tempDir);
        const before = readFileSync(join(tempDir, ".ai", "do-not-open", "tasks", "20260422-100-test-task.md"), "utf8");
        const result = await taskPromoteRecommendationCommand({
          cwd: tempDir,
          format: "json",
          taskNumber: "100",
          agent: "a1",
          by: "operator-kimi",
          dryRun: true,
        });
        assert(result.exitCode === ExitCode.SUCCESS, "expected dry-run success");
        assert(result.result.status === "dry_run_ok", `expected dry_run_ok, got ${result.result.status}`);
        const after = readFileSync(join(tempDir, ".ai", "do-not-open", "tasks", "20260422-100-test-task.md"), "utf8");
        assert(before === after, "dry-run mutated task file");
        assert(listPromotionRows(tempDir).length === 0, "dry-run wrote promotion rows");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },
  };

  const runCase = selectedCase ?? "valid";
  const fn = cases[runCase];
  if (!fn) {
    throw new Error(`Unknown proof case: ${runCase}`);
  }
  const started = Date.now();
  await fn();
  console.log(JSON.stringify({ suite: "task-promote-recommendation", case: runCase, durationMs: Date.now() - started, status: "ok" }, null, 2));
}

async function runTaskRosterProof(selectedCase) {
  const compactMode = process.env.NARADA_PROOF_MODE === "compact";
  const rosterModule = await import(resolve(ROOT, "packages/layers/cli/dist/commands/task-roster.js"));
  const lifecycleModule = await import(resolve(ROOT, "packages/layers/cli/dist/lib/task-lifecycle-store.js"));
  const exitCodeModule = await import(resolve(ROOT, "packages/layers/cli/dist/lib/exit-codes.js"));
  const governanceModule = compactMode
    ? null
    : await import(resolve(ROOT, "packages/layers/cli/dist/lib/task-governance.js"));

  const {
    taskRosterShowCommand,
    taskRosterAssignCommand,
    taskRosterReviewCommand,
    taskRosterDoneCommand,
    taskRosterIdleCommand,
  } = rosterModule;
  const loadRoster = governanceModule?.loadRoster;
  const loadAssignment = governanceModule?.loadAssignment;
  const saveReport = governanceModule?.saveReport;
  const { openTaskLifecycleStore } = lifecycleModule;
  const { ExitCode } = exitCodeModule;

  function setupRepo(tempDir, options = {}) {
    const withLearning = options.withLearning ?? true;
    mkdirSync(join(tempDir, ".ai", "agents"), { recursive: true });
    mkdirSync(join(tempDir, ".ai", "do-not-open", "tasks"), { recursive: true });
    if (withLearning) {
      mkdirSync(join(tempDir, ".ai", "learning", "accepted"), { recursive: true });
    }

    if (withLearning) {
      writeFileSync(
        join(tempDir, ".ai", "learning", "accepted", "20260422-003-roster.json"),
        JSON.stringify({
          artifact_id: "20260422-003",
          state: "accepted",
          title: "Recommended assignments are operative unless rejected",
          content: {
            principle:
              "When the architect/operator recommends a target assignment and the human operator does not disagree or correct it, the recommendation is operative and must be recorded in the roster immediately.",
          },
          scopes: ["roster", "assignment", "task-governance", "review"],
        }, null, 2),
      );
    }

    const store = openTaskLifecycleStore(tempDir);
    const now = "2026-01-01T00:00:00Z";
    store.upsertRosterEntry({
      agent_id: "test-agent",
      role: "implementer",
      capabilities_json: JSON.stringify(["claim"]),
      first_seen_at: now,
      last_active_at: now,
      status: "idle",
      task_number: null,
      last_done: null,
      updated_at: now,
    });
    store.upsertRosterEntry({
      agent_id: "reviewer-agent",
      role: "reviewer",
      capabilities_json: JSON.stringify(["derive", "propose"]),
      first_seen_at: now,
      last_active_at: now,
      status: "idle",
      task_number: null,
      last_done: null,
      updated_at: now,
    });
    store.db.close();
  }

  function createRepo(options = {}) {
    const tempDir = mkdtempSync(join(tmpdir(), "narada-roster-proof-"));
    setupRepo(tempDir, options);
    return tempDir;
  }

  const cases = {
    show_human: async (tempDir) => {
      const result = await taskRosterShowCommand({ cwd: tempDir, format: "human" });
      assert(result.exitCode === ExitCode.SUCCESS, `expected success, got ${result.exitCode}`);
      assert(String(result.result).includes("test-agent"), "human roster missing test-agent");
      assert(!String(result.result).includes("Active guidance:"), "non-verbose show should stay terse");
    },
    show_verbose: async (tempDir) => {
      const result = await taskRosterShowCommand({ cwd: tempDir, format: "human", verbose: true });
      assert(result.exitCode === ExitCode.SUCCESS, `expected success, got ${result.exitCode}`);
      assert(String(result.result).includes("Active guidance:"), "verbose show missing guidance");
    },
    show_json: async (tempDir) => {
      const result = await taskRosterShowCommand({ cwd: tempDir, format: "json" });
      assert(result.exitCode === ExitCode.SUCCESS, `expected success, got ${result.exitCode}`);
      assert(result.result.roster.agents.length === 2, `expected 2 agents, got ${result.result.roster.agents.length}`);
      if (compactMode) {
        assert(Array.isArray(result.result.guidance), "json show guidance missing");
      } else {
        assert(result.result.guidance.length > 0, "json show missing guidance");
      }
    },
    assign_success: async (tempDir) => {
      writeFileSync(
        join(tempDir, ".ai", "do-not-open", "tasks", "20260420-385-test.md"),
        "---\ntask_id: 385\nstatus: opened\n---\n\n# Task 385\n",
      );
      const result = await taskRosterAssignCommand({ taskNumber: "385", agent: "test-agent", cwd: tempDir, format: "json" });
      assert(result.exitCode === ExitCode.SUCCESS, `expected success, got ${result.exitCode}`);
      if (compactMode) {
        const store = openTaskLifecycleStore(tempDir);
        try {
          const roster = store.getRoster();
          assert(roster.some((a) => a.agent_id === "test-agent" && a.task_number === 385), "roster task not updated");
          const assignment = store.getAssignmentRecord("20260420-385-test");
          assert(assignment, "assignment record missing");
        } finally {
          store.db.close();
        }
      } else {
        const roster = await loadRoster(tempDir);
        assert(roster.agents.find((a) => a.agent_id === "test-agent")?.task === 385, "roster task not updated");
        const assignment = await loadAssignment(tempDir, "20260420-385-test");
        assert(assignment?.assignments.length === 1, "assignment record missing");
      }
    },
    assign_then_done_compact: async (tempDir) => {
      writeFileSync(
        join(tempDir, ".ai", "do-not-open", "tasks", "20260420-388-test.md"),
        "---\ntask_id: 388\nstatus: opened\n---\n\n# Task 388\n\n## Acceptance Criteria\n- [x] Done\n\n## Execution Notes\nCompleted.\n\n## Verification\nChecked.\n",
      );
      const assignResult = await taskRosterAssignCommand({ taskNumber: "388", agent: "test-agent", cwd: tempDir, format: "json" });
      assert(assignResult.exitCode === ExitCode.SUCCESS, `expected assign success, got ${assignResult.exitCode}`);

      const store = openTaskLifecycleStore(tempDir);
      try {
        store.upsertReportRecord({
          report_id: "wrr_1234567890_20260420-388-test_test-agent",
          task_id: "20260420-388-test",
          assignment_id: "x",
          agent_id: "test-agent",
          reported_at: "2026-01-01T00:00:00Z",
          report_json: JSON.stringify({
            report_id: "wrr_1234567890_20260420-388-test_test-agent",
            task_number: 388,
            task_id: "20260420-388-test",
            agent_id: "test-agent",
            assignment_id: "x",
            reported_at: "2026-01-01T00:00:00Z",
            summary: "Done",
            changed_files: [],
            verification: [],
            known_residuals: [],
            ready_for_review: true,
            report_status: "submitted",
          }),
        });
      } finally {
        store.db.close();
      }

      const doneResult = await taskRosterDoneCommand({ taskNumber: "388", agent: "test-agent", cwd: tempDir, format: "json", strict: true });
      assert(doneResult.exitCode === ExitCode.SUCCESS, `expected done success, got ${doneResult.exitCode}`);
      assert(doneResult.result.last_done === 388, "last_done not recorded");
    },
    review_success: async (tempDir) => {
      writeFileSync(
        join(tempDir, ".ai", "do-not-open", "tasks", "20260420-370-test.md"),
        "---\ntask_id: 370\nstatus: in_review\n---\n\n# Task 370\n",
      );
      const result = await taskRosterReviewCommand({ taskNumber: "370", agent: "reviewer-agent", cwd: tempDir, format: "json" });
      assert(result.exitCode === ExitCode.SUCCESS, `expected success, got ${result.exitCode}`);
      const assignment = await loadAssignment(tempDir, "20260420-370-test");
      assert(assignment?.assignments[0]?.intent === "review", "review intent missing");
    },
    done_strict_complete: async (tempDir) => {
      writeFileSync(
        join(tempDir, ".ai", "do-not-open", "tasks", "20260420-388-test.md"),
        "---\ntask_id: 388\nstatus: claimed\n---\n\n# Task 388\n\n## Acceptance Criteria\n- [x] Done\n\n## Execution Notes\nCompleted.\n\n## Verification\nChecked.\n",
      );
      if (compactMode) {
        const store = openTaskLifecycleStore(tempDir);
        try {
          store.upsertLifecycle({
            task_id: "20260420-388-test",
            task_number: 388,
            status: "claimed",
            governed_by: null,
            closed_at: null,
            closed_by: null,
            reopened_at: null,
            reopened_by: null,
            continuation_packet_json: null,
            updated_at: "2026-01-01T00:00:00Z",
          });
          store.upsertReportRecord({
            report_id: "wrr_1234567890_20260420-388-test_test-agent",
            task_id: "20260420-388-test",
            assignment_id: "x",
            agent_id: "test-agent",
            reported_at: "2026-01-01T00:00:00Z",
            report_json: JSON.stringify({
              report_id: "wrr_1234567890_20260420-388-test_test-agent",
              task_number: 388,
              task_id: "20260420-388-test",
              agent_id: "test-agent",
              assignment_id: "x",
              reported_at: "2026-01-01T00:00:00Z",
              summary: "Done",
              changed_files: [],
              verification: [],
              known_residuals: [],
              ready_for_review: true,
              report_status: "submitted",
            }),
          });
        } finally {
          store.db.close();
        }
      } else {
        await saveReport(tempDir, {
          report_id: "wrr_1234567890_20260420-388-test_test-agent",
          task_number: 388,
          task_id: "20260420-388-test",
          agent_id: "test-agent",
          assignment_id: "x",
          reported_at: "2026-01-01T00:00:00Z",
          summary: "Done",
          changed_files: [],
          verification: [],
          known_residuals: [],
          ready_for_review: true,
          report_status: "submitted",
        });
      }
      const result = await taskRosterDoneCommand({ taskNumber: "388", agent: "test-agent", cwd: tempDir, format: "json", strict: true });
      assert(result.exitCode === ExitCode.SUCCESS, `expected success, got ${result.exitCode}`);
    },
    idle_preserves_last_done: async (tempDir) => {
      writeFileSync(
        join(tempDir, ".ai", "do-not-open", "tasks", "20260420-100-test.md"),
        "---\ntask_id: 100\nstatus: opened\n---\n\n# Task 100\n",
      );
      await taskRosterAssignCommand({ taskNumber: "100", agent: "test-agent", cwd: tempDir, format: "json" });
      await taskRosterDoneCommand({ taskNumber: "100", agent: "test-agent", cwd: tempDir, format: "json", allowIncomplete: true });
      const result = await taskRosterIdleCommand({ agent: "test-agent", cwd: tempDir, format: "json" });
      assert(result.exitCode === ExitCode.SUCCESS, `expected success, got ${result.exitCode}`);
      const roster = await loadRoster(tempDir);
      const agent = roster.agents.find((a) => a.agent_id === "test-agent");
      assert(agent?.status === "idle", "idle did not persist");
      assert(agent?.last_done === 100, "last_done was lost");
    },
  };

  const allCases = ["show_human", "show_verbose", "show_json", "assign_success", "review_success", "done_strict_complete", "idle_preserves_last_done"];
  const compactCases = ["assign_then_done_compact"];
  const selectedCases = selectedCase ? [selectedCase] : compactMode ? compactCases : allCases;
  const started = Date.now();
  const tempDir = createRepo({ withLearning: !compactMode });
  try {
    for (const currentCase of selectedCases) {
      const fn = cases[currentCase];
      if (!fn) {
        throw new Error(`Unknown proof case: ${currentCase}`);
      }
      await fn(tempDir);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ suite: "task-roster", cases: selectedCases, durationMs: Date.now() - started, status: "ok" }, null, 2));
}

async function runTaskCloseProof() {
  const { taskCloseCommand } = await import(resolve(ROOT, "packages/layers/cli/dist/commands/task-close.js"));
  const { taskEvidenceAdmitCommand } = await import(resolve(ROOT, "packages/layers/cli/dist/commands/task-evidence.js"));
  const { openTaskLifecycleStore } = await import(resolve(ROOT, "packages/layers/cli/dist/lib/task-lifecycle-store.js"));
  const { ExitCode } = await import(resolve(ROOT, "packages/layers/cli/dist/lib/exit-codes.js"));
  const tempDir = mkdtempSync(join(tmpdir(), "narada-close-proof-"));
  const started = Date.now();
  try {
    mkdirSync(join(tempDir, ".ai", "do-not-open", "tasks"), { recursive: true });
    writeFileSync(
      join(tempDir, ".ai", "do-not-open", "tasks", "20260420-100-close-proof.md"),
      "---\ntask_id: 100\nstatus: in_review\n---\n\n# Task 100\n\n## Acceptance Criteria\n- [x] Done\n\n## Execution Notes\nDone.\n\n## Verification\nOK.\n",
    );
    const admitResult = await taskEvidenceAdmitCommand({
      taskNumber: "100",
      by: "proof-agent",
      cwd: tempDir,
      format: "json",
    });
    assert(admitResult.exitCode === ExitCode.SUCCESS, `expected evidence admit success, got ${admitResult.exitCode}`);
    const closeResult = await taskCloseCommand({
      taskNumber: "100",
      by: "proof-agent",
      cwd: tempDir,
      format: "json",
      mode: "operator_direct",
    });
    assert(closeResult.exitCode === ExitCode.SUCCESS, `expected close success, got ${closeResult.exitCode}`);
    assert(closeResult.result.new_status === "closed", `expected closed, got ${closeResult.result.new_status}`);

    writeFileSync(
      join(tempDir, ".ai", "do-not-open", "tasks", "20260420-101-row-proof.md"),
      "---\ntask_id: 101\nstatus: in_review\n---\n\n# Task 101\n\n## Acceptance Criteria\n- [ ] Markdown unchecked\n\n## Execution Notes\nDone.\n\n## Verification\nOK.\n",
    );
    const store = openTaskLifecycleStore(tempDir);
    try {
      store.upsertLifecycle({
        task_id: "20260420-101-row-proof",
        task_number: 101,
        status: "in_review",
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: "2026-04-25T00:00:00Z",
      });
      store.upsertEvidenceBundle({
        bundle_id: "evb-close-proof-101",
        task_id: "20260420-101-row-proof",
        task_number: 101,
        report_ids_json: "[]",
        verification_run_ids_json: "[]",
        acceptance_criteria_json: JSON.stringify({ all_checked: true, unchecked_count: 0 }),
        review_ids_json: "[]",
        changed_files_json: "[]",
        residuals_json: "[]",
        assembled_at: "2026-04-25T00:00:00Z",
        assembled_by: "proof-agent",
      });
      store.upsertEvidenceAdmissionResult({
        admission_id: "ear-close-proof-101",
        bundle_id: "evb-close-proof-101",
        task_id: "20260420-101-row-proof",
        task_number: 101,
        verdict: "admitted",
        methods_json: JSON.stringify(["criteria_proof"]),
        blockers_json: "[]",
        lifecycle_eligible_status: "closed",
        admitted_at: "2026-04-25T00:00:01Z",
        admitted_by: "proof-agent",
        confirmation_json: "{}",
      });
    } finally {
      store.db.close();
    }
    const rowBackedResult = await taskCloseCommand({
      taskNumber: "101",
      by: "proof-agent",
      cwd: tempDir,
      format: "json",
      mode: "operator_direct",
    });
    assert(rowBackedResult.exitCode === ExitCode.SUCCESS, `expected row-backed close success, got ${rowBackedResult.exitCode}`);
    assert(rowBackedResult.result.new_status === "closed", `expected row-backed closed, got ${rowBackedResult.result.new_status}`);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ suite: "task-close", cases: ["complete_close", "row_backed_criteria_proof"], durationMs: Date.now() - started, status: "ok" }, null, 2));
}

async function main() {
  const inferredCase = parseCaseFromCommandLinePattern(process.env.NARADA_PROOF_TEST_NAME_PATTERN ?? "");
  const selected = caseName ?? inferredCase;

  if (suite === "task-promote-recommendation") {
    await runTaskPromoteRecommendationProof(selected);
    return;
  }
  if (suite === "task-roster") {
    await runTaskRosterProof(selected);
    return;
  }
  if (suite === "task-close") {
    await runTaskCloseProof();
    return;
  }

  throw new Error(`Unknown proof suite: ${suite}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
