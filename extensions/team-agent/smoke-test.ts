/**
 * Team Agent smoke test — run with `npx tsx smoke-test.ts`.
 * Tests parser + board in isolation (no LLM calls).
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadPlanFile } from "./plan-parser";
import { Board, type Decision } from "./board";
import type { Plan } from "./plan-schema";

let passed = 0;
let failed = 0;
function ok(cond: boolean, name: string, detail?: string) {
	if (cond) {
		console.log(`  ✓ ${name}`);
		passed++;
	} else {
		console.log(`  ✗ ${name}${detail ? " — " + detail : ""}`);
		failed++;
	}
}

async function main() {
	console.log("=== Parser ===");
	const r = loadPlanFile("C:\\Users\\jlebl\\.mavis\\plans\\plan_2828cc3a\\plan.yaml");
	ok(r.errors.length === 0, "real mavis plan parses without errors", r.errors.join("; "));
	ok(r.plan.tasks.length === 6, "6 tasks parsed", `got ${r.plan.tasks.length}`);
	ok(r.plan.plan.max_concurrency === 5, "max_concurrency=5");
	ok(r.plan.plan.auto_accept === false, "auto_accept=false");
	ok(r.plan.plan.auto_reject_retries === 1, "auto_reject_retries=1");
	ok(r.plan.tasks[0].prompt.length > 50, "task 0 prompt non-empty");
	ok(r.plan.tasks[0].timeout_ms === 300000, "task 0 timeout=300000");
	ok(r.plan.tasks[0].max_retries === 2, "task 0 max_retries=2");

	console.log("\n=== Skip / depends_on guards ===");
	const skipPlan = `version: 1
plan:
  name: skip-guard
tasks:
  - id: a
    title: A
    prompt: do a
    assigned_to: worker
    verified_by: ~
    verify_skip_reason: user said
  - id: b
    title: B
    prompt: do b
    assigned_to: worker
    depends_on: [a]
`;
	const sr = loadPlanYamlInline(skipPlan);
	ok(sr.errors.some((e) => e.includes("verification skipped")), "skip + depends_on rejected", sr.errors.join("; "));

	const skipWithoutReason = `version: 1
plan: { name: x }
tasks:
  - id: a
    title: A
    prompt: do
    assigned_to: worker
    verified_by: ~
`;
	const sr2 = loadPlanYamlInline(skipWithoutReason);
	ok(sr2.errors.some((e) => e.includes("verify_skip_reason")), "skip without reason rejected");

	const verifyAsTaskWithDeps = `version: 1
plan: { name: x }
tasks:
  - id: a
    title: A
    prompt: do
    assigned_to: worker
    role: verify-as-task
    depends_on: [other]
`;
	const sr3 = loadPlanYamlInline(verifyAsTaskWithDeps);
	ok(sr3.errors.some((e) => e.includes("verify-as-task")), "verify-as-task with depends_on rejected");

	console.log("\n=== Board state machine ===");
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "team-test-"));
	process.env.PI_TEAM_STATE_DIR = tmpDir;

	const plan: Plan = {
		version: 1,
		plan: { name: "test", max_concurrency: 2, max_cycles: 5, auto_accept: true },
		tasks: [
			{ id: "a", title: "A", prompt: "p", assigned_to: "worker", verified_by: "verifier" },
			{ id: "b", title: "B", prompt: "p", assigned_to: "worker", depends_on: ["a"], verified_by: "verifier" },
			{ id: "c", title: "C", prompt: "p", assigned_to: "worker", role: "verify-as-task", depends_on: ["a"] },
		],
	};

	const board = new Board(plan);
	ok(board.getTaskState("a")?.status === "ready", "task a starts ready");
	ok(board.getTaskState("b")?.status === "pending", "task b starts pending (depends_on a)");
	ok(board.getTaskState("c")?.status === "pending", "task c starts pending");

	board.startTask("a");
	ok(board.getTaskState("a")?.status === "producing", "a transitions to producing");

	board.completeTask("a", "deliverable for a", "/tmp/a.md");
	ok(board.getTaskState("a")?.status === "producing", "a stays in producing after completeTask (awaiting verify)");

	board.startVerifying("a");
	ok(board.getTaskState("a")?.status === "verifying", "a transitions to verifying");

	board.recordVerifierResult("a", {
		agent: "verifier",
		passed: true,
		summary: "ok",
		verdict: "approved",
		issues: [],
		started_at: Date.now(),
		finished_at: Date.now(),
	});
	const r1 = board.processVerifierResults("a");
	ok(r1.allApproved, "a verifier approved");
	ok(board.getTaskState("a")?.status === "done", "a → done after approval");
	ok(board.getTaskState("b")?.status === "ready", "b becomes ready after a done");
	ok(board.getTaskState("c")?.status === "ready", "c becomes ready after a done");

	// c is verify-as-task; should complete straight to done
	board.startTask("c");
	board.completeTask("c", "verification report");
	ok(board.getTaskState("c")?.status === "done", "c done (verify-as-task skipped wrapper)");

	// Simulate decision processing
	const decision: Decision = {
		last_cycle: [{ task_id: "a", verdict: "accept" }],
		next_cycle: [],
		plan_complete: false,
		message_to_user: "ok",
	};
	board.processDecision(decision);
	ok(!board.getTaskState("a")?.pending_decision, "a pending_decision cleared after decision");

	// Unblock / cancel
	const blocked = board.unblockTask("nonexistent");
	ok(!blocked, "unblock on non-blocked returns false");

	board.cancel();
	ok(board.isCancelled(), "plan cancelled");

	// Persisted state
	const stateFile = path.join(board.stateDir, "state.json");
	ok(fs.existsSync(stateFile), "state.json written");
	const stateData = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
	ok(stateData.plan_id === board.planId, "state.json has plan_id");

	console.log("\n=== Parser edge cases (from integration-test) ===");
	// timeout_ms: 0 should default to 1800000
	const zeroTimeout = `version: 1
plan: { name: x }
tasks:
  - id: a
    title: A
    prompt: do
    assigned_to: worker
    timeout_ms: 0
`;
	const zt = loadPlanYamlInline(zeroTimeout);
	ok(zt.plan.tasks[0].timeout_ms === 1800000, "timeout_ms=0 defaults to 1800000", `got ${zt.plan.tasks[0].timeout_ms}`);

	// max_cycles: 0 should default to 10
	const zeroCycles = `version: 1
plan: { name: x, max_cycles: 0 }
tasks:
  - id: a
    title: A
    prompt: do
    assigned_to: worker
`;
	const zc = loadPlanYamlInline(zeroCycles);
	ok(zc.plan.plan.max_cycles === 10, "max_cycles=0 defaults to 10", `got ${zc.plan.plan.max_cycles}`);

	// depends_on referencing nonexistent task
	const badDeps = `version: 1
plan: { name: x }
tasks:
  - id: a
    title: A
    prompt: do
    assigned_to: worker
    depends_on: [nonexistent]
`;
	const bd = loadPlanYamlInline(badDeps);
	ok(bd.errors.some((e) => e.includes("no task with that id")), "depends_on to nonexistent task rejected");

	// dependency cycle
	const cycle = `version: 1
plan: { name: x }
tasks:
  - id: a
    title: A
    prompt: do
    assigned_to: worker
    depends_on: [b]
  - id: b
    title: B
    prompt: do
    assigned_to: worker
    depends_on: [a]
`;
	const cy = loadPlanYamlInline(cycle);
	ok(cy.errors.some((e) => e.includes("cycle")), "dependency cycle detected");

	// max_retries: 0 is valid (no retries)
	const noRetries = `version: 1
plan: { name: x }
tasks:
  - id: a
    title: A
    prompt: do
    assigned_to: worker
    max_retries: 0
`;
	const nr = loadPlanYamlInline(noRetries);
	ok(nr.errors.length === 0, "max_retries=0 accepted (no retries)");
	ok(nr.plan.tasks[0].max_retries === 0, "max_retries=0 preserved", `got ${nr.plan.tasks[0].max_retries}`);

	console.log(`\n=== ${passed} passed, ${failed} failed ===`);
	fs.rmSync(tmpDir, { recursive: true, force: true });
	process.exit(failed === 0 ? 0 : 1);
}

function loadPlanYamlInline(yaml: string) {
	const { parsePlanYaml } = require("./plan-parser");
	return parsePlanYaml(yaml);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
