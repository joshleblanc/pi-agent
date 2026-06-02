/**
 * Board - Plan Execution State Tracker
 *
 * Mirrors mavis's plan_<id>/{plan.yaml,state.json,board.md,scratchpad/,outputs/}
 * layout. Persists after every cycle so owner decisions, status checks,
 * and recovery work even across process boundaries.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";
import type { Task, Plan } from "./plan-schema";

// ============================================================================
// Task Status
// ============================================================================

export type TaskStatus =
	| "pending" // Not yet started, waiting on dependencies
	| "ready" // Ready to execute (deps met, not yet running)
	| "producing" // Producer actively executing
	| "verifying" // Verifier checking output
	| "blocked" // Blocked (dependency not met or other issue)
	| "done" // Completed successfully
	| "failed" // Failed after all retries
	| "cancelled"; // Cancelled by owner

export type Verdict = "approved" | "approved_with_changes" | "needs_work" | "manual_retry";
export type DecisionVerdict = "accept" | "reject" | "override_accept" | "manual_retry";

// ============================================================================
// Runtime State
// ============================================================================

export interface VerifierResult {
	agent: string;
	session_id?: string;
	passed: boolean;
	summary: string;
	verdict: Verdict;
	issues: string[];
	started_at: number;
	finished_at: number;
}

export interface TaskRuntimeState {
	status: TaskStatus;
	assigned_to: string;
	verified_by: string[];
	verify_skipped: boolean;
	verify_skip_reason?: string;
	session_id?: string;
	started_at?: number;
	completed_at?: number;
	retry_count: number;
	max_retries: number;
	timeout_deadline_at?: number;
	last_error?: string;
	last_verdict?: Verdict;
	last_issues?: string[];
	deliverable_preview?: string;
	deliverable_path?: string;
	verifier_results: VerifierResult[];
	pending_decision: boolean;
}

export interface PlanPhase {
	cycle: number;
	phase: "pending" | "producing" | "verifying" | "evaluating" | "done" | "failed" | "cancelled";
	started_at: number;
}

export interface CycleReport {
	plan_id: string;
	cycle: number;
	timestamp: number;
	tasks: {
		id: string;
		status: TaskStatus;
		verdict?: Verdict;
		issues?: string[];
		action_required: boolean;
		action_type?: "retry" | "new_session" | "owner_decision" | "blocked";
	}[];
	blockers: string[];
	summary: string;
}

export interface Decision {
	last_cycle: {
		task_id: string;
		verdict: DecisionVerdict;
		reason?: string;
	}[];
	next_cycle: Array<{
		title: string;
		prompt: string;
		assigned_to: string | string[];
		verified_by?: string | string[];
		verify_prompt?: string | Record<string, string>;
		verify_skip_reason?: string;
		timeout_ms?: number;
		max_retries?: number;
		role?: "produce" | "verify-as-task";
	}>;
	plan_complete: boolean;
	message_to_user: string;
}

// ============================================================================
// State (persisted to state.json)
// ============================================================================

export interface PlanState {
	plan_id: string;
	plan: Plan;
	status: "running" | "completed" | "failed" | "cancelled" | "awaiting_decision";
	cycle: number;
	max_cycles: number;
	auto_accept: boolean;
	owner_session_id?: string;
	created_at: number;
	updated_at: number;
	tasks: Record<string, TaskRuntimeState>;
	results: TaskResultSummary[];
	pending_decision_cycle?: number;
	pending_decision_message?: string;
}

export interface TaskResultSummary {
	task_id: string;
	title: string;
	agent: string;
	attempts: number;
	final_status: TaskStatus;
	verdict?: Verdict;
	verifier_results: VerifierResult[];
	started_at: number;
	finished_at: number;
	deliverable_path?: string;
}

// ============================================================================
// Board Class
// ============================================================================

export interface BoardOptions {
	stateDir?: string;
	ownerSessionId?: string;
	planId?: string;
}

export class Board {
	public readonly plan: Plan;
	public readonly planId: string;
	public readonly stateDir: string;
	public readonly planFile: string;
	public readonly stateFile: string;
	public readonly boardFile: string;
	public readonly scratchpadDir: string;
	public readonly outputsDir: string;

	private planStatus: "running" | "completed" | "failed" | "cancelled" | "awaiting_decision" = "running";
	private consecutiveFailures = 0;
	private state: PlanState;

	constructor(plan: Plan, opts: BoardOptions = {}) {
		this.plan = plan;
		this.planId = opts.planId ?? `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		this.stateDir = opts.stateDir ?? defaultStateDir(this.planId);
		this.planFile = path.join(this.stateDir, "plan.yaml");
		this.stateFile = path.join(this.stateDir, "state.json");
		this.boardFile = path.join(this.stateDir, "board.md");
		this.scratchpadDir = path.join(this.stateDir, "scratchpad");
		this.outputsDir = path.join(this.stateDir, "outputs");

		fs.mkdirSync(this.stateDir, { recursive: true });
		fs.mkdirSync(this.scratchpadDir, { recursive: true });
		fs.mkdirSync(this.outputsDir, { recursive: true });

		this.state = {
			plan_id: this.planId,
			plan,
			status: "running",
			cycle: 0,
			max_cycles: plan.plan.max_cycles ?? 10,
			auto_accept: plan.plan.auto_accept ?? false,
			owner_session_id: opts.ownerSessionId,
			created_at: Date.now(),
			updated_at: Date.now(),
			tasks: this.initTaskStates(plan),
			results: [],
		};

		this.persist();
		this.appendBoard(`# Plan: ${plan.plan.name}\n\n**ID:** ${this.planId}\n**Started:** ${new Date().toISOString()}\n`);
	}

	/** Reconstruct a Board from persisted state. */
	static fromState(state: PlanState, stateDir: string): Board {
		const b = Object.create(Board.prototype) as Board;
		b.plan = state.plan;
		b.planId = state.plan_id;
		b.stateDir = stateDir;
		b.planFile = path.join(stateDir, "plan.yaml");
		b.stateFile = path.join(stateDir, "state.json");
		b.boardFile = path.join(stateDir, "board.md");
		b.scratchpadDir = path.join(stateDir, "scratchpad");
		b.outputsDir = path.join(stateDir, "outputs");
		b.state = state;
		b.planStatus = state.status;
		b.consecutiveFailures = 0;
		return b;
	}

	private initTaskStates(plan: Plan): Record<string, TaskRuntimeState> {
		const tasks: Record<string, TaskRuntimeState> = {};
		for (const task of plan.tasks) {
			tasks[task.id] = {
				status: task.depends_on && task.depends_on.length > 0 ? "pending" : "ready",
				assigned_to: primaryAgent(task.assigned_to),
				verified_by: effectiveVerifiers(task, plan),
				verify_skipped: isVerifySkipped(task),
				verify_skip_reason: task.verify_skip_reason,
				retry_count: 0,
				max_retries: task.max_retries ?? 2,
				verifier_results: [],
				pending_decision: false,
			};
		}
		return tasks;
	}

	// ============================================================================
	// State persistence
	// ============================================================================

	persist(): void {
		this.state.updated_at = Date.now();
		try {
			fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2), "utf-8");
		} catch {
			/* ignore */
		}
	}

	appendBoard(entry: string): void {
		try {
			fs.appendFileSync(this.boardFile, entry + "\n", "utf-8");
		} catch {
			/* ignore */
		}
	}

	savePlanYaml(yamlSource: string): void {
		try {
			fs.writeFileSync(this.planFile, yamlSource, "utf-8");
		} catch {
			/* ignore */
		}
	}

	// ============================================================================
	// State queries
	// ============================================================================

	getTaskState(taskId: string): TaskRuntimeState | undefined {
		return this.state.tasks[taskId];
	}

	getTask(taskId: string): Task | undefined {
		return this.plan.tasks.find((t) => t.id === taskId);
	}

	getReadyTasks(): Task[] {
		return this.plan.tasks.filter((t) => this.state.tasks[t.id]?.status === "ready");
	}

	getProducingTasks(): Task[] {
		return this.plan.tasks.filter((t) => this.state.tasks[t.id]?.status === "producing");
	}

	isComplete(): boolean {
		return this.state.status === "completed";
	}

	isFailed(): boolean {
		return this.state.status === "failed";
	}

	isCancelled(): boolean {
		return this.state.status === "cancelled";
	}

	isAwaitingDecision(): boolean {
		return this.state.status === "awaiting_decision";
	}

	getCycle(): number {
		return this.state.cycle;
	}

	getStatus(): "running" | "completed" | "failed" | "cancelled" | "awaiting_decision" {
		return this.state.status;
	}

	getConsecutiveFailures(): number {
		return this.consecutiveFailures;
	}

	getState(): PlanState {
		return this.state;
	}

	// ============================================================================
	// Dependency management
	// ============================================================================

	private areDependenciesMet(taskId: string): boolean {
		const task = this.getTask(taskId);
		if (!task?.depends_on || task.depends_on.length === 0) return true;
		return task.depends_on.every((depId) => {
			const depState = this.state.tasks[depId];
			return depState?.status === "done";
		});
	}

	updateDependencyStatus(): void {
		for (const task of this.plan.tasks) {
			const st = this.state.tasks[task.id];
			if (!st) continue;
			if (st.status === "pending" && this.areDependenciesMet(task.id)) {
				st.status = "ready";
			}
		}
		this.persist();
	}

	unblockTask(taskId: string): boolean {
		const st = this.state.tasks[taskId];
		if (!st || st.status !== "blocked") return false;
		st.status = "ready";
		st.last_error = undefined;
		this.persist();
		return true;
	}

	// ============================================================================
	// Producer lifecycle
	// ============================================================================

	startTask(taskId: string, sessionId?: string): boolean {
		const st = this.state.tasks[taskId];
		const task = this.getTask(taskId);
		if (!st || !task) return false;
		if (st.status !== "ready") return false;

		st.status = "producing";
		st.started_at = Date.now();
		st.session_id = sessionId;
		st.timeout_deadline_at = st.started_at + (task.timeout_ms ?? 1800000);
		this.persist();
		return true;
	}

	completeTask(taskId: string, deliverablePreview?: string, deliverablePath?: string): boolean {
		const st = this.state.tasks[taskId];
		if (!st) return false;
		const task = this.getTask(taskId);
		if (!task) return false;

		st.deliverable_preview = deliverablePreview;
		st.deliverable_path = deliverablePath;
		this.consecutiveFailures = 0;

		// Tasks with role=verify-as-task skip the verifier wrapper
		if (task.role === "verify-as-task") {
			st.status = "done";
			st.completed_at = Date.now();
			st.last_verdict = "approved";
			this.persist();
			this.updateDependencyStatus();
			return true;
		}

		// Tasks with no verification (or skipped) go straight to done
		if (st.verified_by.length === 0 || st.verify_skipped) {
			st.status = "done";
			st.completed_at = Date.now();
			this.persist();
			this.writeTaskOutput(taskId, deliverablePreview ?? "", deliverablePath);
			this.updateDependencyStatus();
			return true;
		}

		// Otherwise, mark as still "producing" but ready for verifying.
		// The engine will call startVerifying() next.
		st.status = "producing";
		this.persist();
		return true;
	}

	startVerifying(taskId: string): boolean {
		const st = this.state.tasks[taskId];
		if (!st || st.status !== "producing") return false;
		st.status = "verifying";
		this.persist();
		return true;
	}

	failTask(taskId: string, error: string): boolean {
		const st = this.state.tasks[taskId];
		const task = this.getTask(taskId);
		if (!st || !task) return false;

		st.last_error = error;
		st.retry_count++;
		this.consecutiveFailures++;

		if (st.retry_count <= st.max_retries) {
			st.status = "ready";
			this.persist();
			return true;
		}

		st.status = "failed";
		this.persist();

		if (this.consecutiveFailures >= (this.plan.plan.max_consecutive_failures ?? 2)) {
			this.state.status = "failed";
			this.persist();
		}
		return false;
	}

	// ============================================================================
	// Verifier lifecycle
	// ============================================================================

	recordVerifierResult(taskId: string, result: VerifierResult): void {
		const st = this.state.tasks[taskId];
		if (!st) return;
		st.verifier_results.push(result);
		this.persist();
	}

	/** Process all verifier results. Returns true if all approved, false if any needs_work. */
	processVerifierResults(taskId: string): { allApproved: boolean; needsDecision: boolean; needsWork: boolean } {
		const st = this.state.tasks[taskId];
		const task = this.getTask(taskId);
		if (!st || !task) return { allApproved: false, needsDecision: false, needsWork: false };

		const results = st.verifier_results;
		if (results.length === 0) {
			// No verifiers ran; treat as approved
			st.status = "done";
			st.completed_at = Date.now();
			st.last_verdict = "approved";
			this.consecutiveFailures = 0;
			this.persist();
			this.updateDependencyStatus();
			return { allApproved: true, needsDecision: false, needsWork: false };
		}

		const needsWork = results.some((r) => r.verdict === "needs_work");
		const approved = results.every((r) => r.verdict === "approved" || r.verdict === "approved_with_changes");

		if (needsWork) {
			const worstVerdict: Verdict = "needs_work";
			const allIssues = results.flatMap((r) => r.issues);
			st.last_verdict = worstVerdict;
			st.last_issues = allIssues;
			st.completed_at = Date.now();

			// Check auto-reject retries
			const planAutoRetries = this.plan.plan.auto_reject_retries ?? 1;
			const taskAutoRetries = task.auto_reject_retries ?? planAutoRetries;
			if (st.retry_count < taskAutoRetries) {
				// Auto-retry
				st.retry_count++;
				st.status = "ready";
				st.pending_decision = false;
				this.persist();
				return { allApproved: false, needsDecision: false, needsWork: true };
			}
			// Needs owner decision
			st.status = "done"; // mark as terminal for this cycle; decision will reset
			st.pending_decision = true;
			this.persist();
			return { allApproved: false, needsDecision: true, needsWork: true };
		}

		if (approved) {
			const allApproved = results.every((r) => r.verdict === "approved");
			st.last_verdict = allApproved ? "approved" : "approved_with_changes";
			st.status = "done";
			st.completed_at = Date.now();
			this.consecutiveFailures = 0;
			this.persist();
			this.writeTaskOutput(taskId, st.deliverable_preview ?? "", st.deliverable_path);
			this.updateDependencyStatus();
			return { allApproved: allApproved, needsDecision: false, needsWork: false };
		}

		// Defensive: should not reach here
		st.status = "done";
		st.completed_at = Date.now();
		this.persist();
		return { allApproved: false, needsDecision: false, needsWork: false };
	}

	// ============================================================================
	// Cycle / decision flow
	// ============================================================================

	/** Begin a new cycle. */
	beginCycle(phase: PlanPhase["phase"]): number {
		this.state.cycle++;
		this.persist();
		return this.state.cycle;
	}

	/** Mark plan as awaiting owner decision. */
	awaitDecision(message: string): void {
		this.state.status = "awaiting_decision";
		this.state.pending_decision_cycle = this.state.cycle;
		this.state.pending_decision_message = message;
		this.persist();
	}

	/** Mark plan complete (all tasks done or terminal). */
	complete(): void {
		const allDone = this.plan.tasks.every((t) => {
			const st = this.state.tasks[t.id];
			return st && (st.status === "done" || st.status === "cancelled" || st.status === "failed");
		});
		if (allDone) {
			this.state.status = "completed";
			this.persist();
		}
	}

	// ============================================================================
	// Decision processing
	// ============================================================================

	processDecision(decision: Decision): void {
		// Process last_cycle verdicts
		for (const v of decision.last_cycle) {
			const st = this.state.tasks[v.task_id];
			if (!st) continue;
			st.pending_decision = false;

			switch (v.verdict) {
				case "accept":
				case "override_accept":
					st.status = "done";
					st.completed_at = Date.now();
					st.last_verdict = "approved";
					break;
				case "reject":
					st.status = "ready";
					st.retry_count++;
					st.last_verdict = "needs_work";
					break;
				case "manual_retry":
					st.status = "ready";
					st.retry_count++;
					st.last_error = v.reason;
					st.last_verdict = "manual_retry";
					break;
			}
		}

		// Add new tasks from next_cycle
		for (const spec of decision.next_cycle) {
			const id = `task-${this.plan.tasks.length + 1}-${Date.now().toString(36)}`;
			const newTask: Task = {
				id,
				title: spec.title,
				prompt: spec.prompt,
				assigned_to: spec.assigned_to,
				verified_by: spec.verified_by,
				verify_prompt: spec.verify_prompt,
				verify_skip_reason: spec.verify_skip_reason,
				timeout_ms: spec.timeout_ms,
				max_retries: spec.max_retries,
				role: spec.role,
			};
			this.plan.tasks.push(newTask);
			this.state.tasks[id] = {
				status: "ready",
				assigned_to: primaryAgent(newTask.assigned_to),
				verified_by: effectiveVerifiers(newTask, this.plan),
				verify_skipped: isVerifySkipped(newTask),
				verify_skip_reason: newTask.verify_skip_reason,
				retry_count: 0,
				max_retries: newTask.max_retries ?? 2,
				verifier_results: [],
				pending_decision: false,
			};
		}

		if (decision.plan_complete) {
			this.state.status = "completed";
		} else {
			this.state.status = "running";
		}
		this.state.pending_decision_cycle = undefined;
		this.state.pending_decision_message = undefined;
		this.persist();
		this.updateDependencyStatus();
	}

	// ============================================================================
	// Operator interventions
	// ============================================================================

	steer(message: string): number {
		let count = 0;
		for (const st of Object.values(this.state.tasks)) {
			if (st.status === "producing" || st.status === "verifying") {
				// In a full mavis implementation this would push a message to the worker
				// session. Here we record it so it shows up in board.md.
				st.last_error = `[steer ${new Date().toISOString()}] ${message}`;
				count++;
			}
		}
		this.persist();
		this.appendBoard(`\n[steer ${new Date().toISOString()}] ${message} (applied to ${count} running tasks)\n`);
		return count;
	}

	extendTimeout(taskId: string, minutes: number): boolean {
		const st = this.state.tasks[taskId];
		if (!st || st.status !== "producing") return false;
		const task = this.getTask(taskId);
		if (!task) return false;
		const newDeadline = (st.timeout_deadline_at ?? Date.now()) + minutes * 60_000;
		st.timeout_deadline_at = newDeadline;
		task.timeout_ms = (task.timeout_ms ?? 1800000) + minutes * 60_000;
		this.persist();
		return true;
	}

	cancel(): void {
		this.state.status = "cancelled";
		for (const st of Object.values(this.state.tasks)) {
			if (st.status === "producing" || st.status === "verifying" || st.status === "ready") {
				st.status = "cancelled";
			}
		}
		this.persist();
		this.appendBoard(`\n[${new Date().toISOString()}] Plan cancelled.\n`);
	}

	cancelTask(taskId: string): boolean {
		const st = this.state.tasks[taskId];
		if (!st) return false;
		st.status = "cancelled";
		this.persist();
		return true;
	}

	// ============================================================================
	// Deliverables + scratchpads
	// ============================================================================

	writeTaskOutput(taskId: string, content: string, explicitPath?: string): void {
		try {
			const dir = path.join(this.outputsDir, taskId);
			fs.mkdirSync(dir, { recursive: true });
			const file = explicitPath ?? path.join(dir, "deliverable.md");
			fs.writeFileSync(file, content, "utf-8");
		} catch {
			/* ignore */
		}
	}

	appendScratchpad(content: string, scope: "root" | string = "root"): void {
		const fileName = scope === "root" ? "root.md" : `${scope}.md`;
		const filePath = path.join(this.scratchpadDir, fileName);
		try {
			fs.appendFileSync(filePath, content, "utf-8");
		} catch {
			/* ignore */
		}
	}

	writeScratchpad(content: string, scope: "root" | string = "root"): void {
		const fileName = scope === "root" ? "root.md" : `${scope}.md`;
		const filePath = path.join(this.scratchpadDir, fileName);
		try {
			fs.writeFileSync(filePath, content, "utf-8");
		} catch {
			/* ignore */
		}
	}

	getScratchpadPath(scope: "root" | string = "root"): string {
		return path.join(this.scratchpadDir, scope === "root" ? "root.md" : `${scope}.md`);
	}

	getDeliverablePath(taskId: string): string {
		return path.join(this.outputsDir, taskId, "deliverable.md");
	}

	getBlockers(): string[] {
		const blockers: string[] = [];
		for (const [id, st] of Object.entries(this.state.tasks)) {
			if (st.status === "blocked" || st.status === "failed") {
				blockers.push(`${id}: ${st.last_error ?? "unknown error"}`);
			}
		}
		return blockers;
	}

	// ============================================================================
	// Status reports
	// ============================================================================

	generateCycleReport(): CycleReport {
		const tasks: CycleReport["tasks"] = [];
		const blockers: string[] = [];

		for (const task of this.plan.tasks) {
			const st = this.state.tasks[task.id];
			if (!st) continue;

			const report: CycleReport["tasks"][0] = {
				id: task.id,
				status: st.status,
				verdict: st.last_verdict,
				issues: st.last_issues,
				action_required: false,
			};

			if (st.status === "failed") {
				report.action_required = true;
				report.action_type = "owner_decision";
			} else if (st.status === "blocked") {
				report.action_required = true;
				report.action_type = "blocked";
				blockers.push(`${task.id}: ${st.last_error ?? "dependency not met"}`);
			} else if (st.pending_decision) {
				report.action_required = true;
				report.action_type = "owner_decision";
			}
			tasks.push(report);
		}

		const summary = this.generateSummary();
		return {
			plan_id: this.planId,
			cycle: this.state.cycle,
			timestamp: Date.now(),
			tasks,
			blockers,
			summary,
		};
	}

	private generateSummary(): string {
		const stats = { total: this.plan.tasks.length, done: 0, running: 0, failed: 0, pending: 0, needs_decision: 0 };
		for (const st of Object.values(this.state.tasks)) {
			switch (st.status) {
				case "done":
					stats.done++;
					if (st.pending_decision) stats.needs_decision++;
					break;
				case "producing":
				case "verifying":
					stats.running++;
					break;
				case "failed":
					stats.failed++;
					break;
				default:
					stats.pending++;
			}
		}
		return `Cycle ${this.state.cycle}: ${stats.done}/${stats.total} done, ${stats.running} running, ${stats.failed} failed, ${stats.pending} pending, ${stats.needs_decision} need decision`;
	}

	renderStatus(): string {
		const lines: string[] = [];
		lines.push(`## Plan: ${this.plan.plan.name}`);
		lines.push(`**ID:** ${this.planId}`);
		lines.push(`**Status:** ${this.state.status}`);
		lines.push(`**Cycle:** ${this.state.cycle}/${this.state.max_cycles}`);
		lines.push(`**Auto-accept:** ${this.state.auto_accept}`);
		lines.push("");
		lines.push("### Tasks");

		for (const task of this.plan.tasks) {
			const st = this.state.tasks[task.id];
			if (!st) continue;
			const icon = statusIcon(st.status);
			let line = `- ${icon} ${task.id}: ${task.title} [${st.assigned_to}] - ${st.status.toUpperCase()}`;
			if (st.last_verdict) line += ` (${st.last_verdict})`;
			if (st.retry_count > 0) line += ` [retry ${st.retry_count}/${st.max_retries}]`;
			if (st.verify_skipped) line += ` [verify-skipped]`;
			if (st.pending_decision) line += ` [NEEDS DECISION]`;
			lines.push(line);
		}

		const blockers = this.getBlockers();
		if (blockers.length > 0) {
			lines.push("");
			lines.push("### Blockers");
			for (const b of blockers) lines.push(`- ${b}`);
		}

		if (this.state.pending_decision_message) {
			lines.push("");
			lines.push("### Awaiting Owner Decision");
			lines.push(this.state.pending_decision_message);
		}

		return lines.join("\n");
	}
}

// ============================================================================
// Helpers
// ============================================================================

function primaryAgent(assigned: string | string[]): string {
	return Array.isArray(assigned) ? assigned[0] : assigned;
}

function isVerifySkipped(task: Task): boolean {
	if (task.verified_by === null) return true;
	if (task.role === "verify-as-task") return true;
	return false;
}

function effectiveVerifiers(task: Task, plan: Plan): string[] {
	if (isVerifySkipped(task)) return [];
	const v = task.verified_by;
	if (v === undefined) {
		// Fall back to plan defaults
		return plan.plan.verifier_config?.default_verifiers ?? [];
	}
	if (Array.isArray(v)) return v;
	return [v];
}

function statusIcon(status: TaskStatus): string {
	switch (status) {
		case "done":
			return "✓";
		case "failed":
			return "✗";
		case "producing":
		case "verifying":
			return "⏳";
		case "blocked":
		case "cancelled":
			return "⊘";
		case "ready":
			return "○";
		case "pending":
			return "·";
		default:
			return "?";
	}
}

function defaultStateDir(planId: string): string {
	const base = process.env.PI_TEAM_STATE_DIR ?? path.join(homedir(), ".pi", "team", "plans");
	return path.join(base, planId);
}
