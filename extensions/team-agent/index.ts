/**
 * Team Agent - MiniMax Agent Team Multi-Agent Orchestration
 *
 * Port of the mavis team plan engine to pi. mavis plans run unchanged.
 *
 * Flow: Lead plans → Workers execute in parallel → Verifiers check
 *       independently → Fix if needed → Owner decision → Repeat cycles
 *       → Lead aggregates.
 *
 * Modes: implement (default), plan, research, review
 *
 * State directory: ~/.pi/team/plans/<plan_id>/{plan.yaml,state.json,board.md,
 *                                              scratchpad/,outputs/<task>/}
 * Override with $PI_TEAM_STATE_DIR.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type, type Static } from "typebox";

// mavis-compatible schema + parser
import type { Plan, Task, VerifierConfig } from "./plan-schema";
import {
	VERIFICATION_TRIGGERS,
	primaryAgent,
	verifierList,
	verifyPromptFor,
	requiresVerification,
} from "./plan-schema";
import { parsePlanYaml, loadPlanFile } from "./plan-parser";

// Board (state machine + persistence)
import {
	Board,
	Decision,
	VerifierResult,
	Verdict,
	TaskStatus,
	DecisionVerdict,
} from "./board";

// ============================================================================
// Tool Parameter Schemas
// ============================================================================

const TeamParams = Type.Object({
	task: Type.Optional(Type.String({ description: "Free-form task description (legacy/lead-decomposition mode)" })),
	mode: Type.Optional(
		Type.Union(
			[
				Type.Literal("implement"),
				Type.Literal("plan"),
				Type.Literal("research"),
				Type.Literal("review"),
			],
			{ description: "Team mode (legacy mode)", default: "implement" },
		),
	),
	verify: Type.Optional(Type.Boolean({ description: "Run verifier (legacy mode)", default: true })),
	retries: Type.Optional(Type.Number({ description: "Max retries per work unit", default: 2 })),
	// Plan-based mode: supply either inline YAML or a file path
	plan: Type.Optional(Type.String({ description: "Inline plan YAML (mavis format)" })),
	plan_file: Type.Optional(Type.String({ description: "Path to plan YAML file" })),
	// Inline decision submission (rare; usually via /team:decision)
	decision: Type.Optional(Type.String({ description: "Inline decision JSON" })),
	decision_file: Type.Optional(Type.String({ description: "Path to decision JSON file" })),
	steer: Type.Optional(Type.String({ description: "Steer message for running tasks" })),
});

const TeamStatusParams = Type.Object({
	plan_id: Type.Optional(Type.String({ description: "Plan ID (defaults to most recent)" })),
	human: Type.Optional(Type.Boolean({ description: "Human-readable output", default: true })),
});

const TeamDecisionParams = Type.Object({
	plan_id: Type.String({ description: "Plan ID from status output" }),
	decision_file: Type.Optional(Type.String({ description: "Path to decision JSON file" })),
	decision: Type.Optional(Type.String({ description: "Inline decision JSON" })),
});

const TeamSteerParams = Type.Object({
	plan_id: Type.String({ description: "Plan ID" }),
	message: Type.String({ description: "Steer message" }),
});

const TeamControlParams = Type.Object({
	plan_id: Type.String({ description: "Plan ID" }),
	task_id: Type.Optional(Type.String({ description: "Task ID (for unblock/extend)" })),
	minutes: Type.Optional(Type.Number({ description: "Minutes to extend timeout", default: 15 })),
});

// ============================================================================
// Agent Discovery
// ============================================================================

interface AgentConfig {
	name: string;
	description: string;
	tools?: string[];
	model?: string;
	systemPrompt: string;
	source: "builtin";
	filePath: string;
}

function getExtensionDir(): string {
	const currentFile = import.meta.url || __filename;
	const extDir = currentFile.startsWith("file://")
		? path.dirname(fileURLToPath(currentFile))
		: path.dirname(currentFile);
	return extDir;
}

function loadBuiltInAgents(): AgentConfig[] {
	const extDir = getExtensionDir();
	const agents: AgentConfig[] = [];
	const builtInAgents = [
		{ name: "lead", file: "lead.md" },
		{ name: "worker", file: "worker.md" },
		{ name: "verifier", file: "verifier.md" },
	];

	for (const { name, file } of builtInAgents) {
		const filePath = path.join(extDir, file);
		try {
			if (fs.existsSync(filePath)) {
				const content = fs.readFileSync(filePath, "utf-8");
				const { frontmatter, body } = parseFrontmatterLite(content);
				if (frontmatter.name && frontmatter.description) {
					const toolsStr = frontmatter.tools;
					const tools = toolsStr
						? toolsStr
							.split(",")
							.map((t: string) => t.trim())
							.filter(Boolean)
						: undefined;
					agents.push({
						name: String(frontmatter.name),
						description: String(frontmatter.description),
						tools,
						model: frontmatter.model ? String(frontmatter.model) : undefined,
						systemPrompt: body,
						source: "builtin",
						filePath,
					});
				}
			}
		} catch {
			/* skip */
		}
	}
	return agents;
}

/** Lightweight frontmatter parser — we don't want a yaml dep here. */
function parseFrontmatterLite(content: string): { frontmatter: Record<string, string>; body: string } {
	if (!content.startsWith("---")) return { frontmatter: {}, body: content };
	const end = content.indexOf("\n---", 3);
	if (end < 0) return { frontmatter: {}, body: content };
	const yaml = content.slice(3, end).trim();
	const body = content.slice(end + 4).replace(/^\r?\n/, "");
	const frontmatter: Record<string, string> = {};
	for (const line of yaml.split(/\r?\n/)) {
		const idx = line.indexOf(":");
		if (idx < 0) continue;
		const k = line.slice(0, idx).trim();
		let v = line.slice(idx + 1).trim();
		if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
			v = v.slice(1, -1);
		}
		frontmatter[k] = v;
	}
	return { frontmatter, body };
}

// ============================================================================
// Process Spawning
// ============================================================================

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}
	const execName = path.basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) {
		return { command: process.execPath, args };
	}
	return { command: "pi", args };
}

async function writePromptToTempFile(prompt: string): Promise<{ dir: string; filePath: string }> {
	const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-team-"));
	const filePath = path.join(tmpDir, `prompt-${Date.now()}.md`);
	await fs.promises.writeFile(filePath, prompt, { encoding: "utf-8", mode: 0o600 });
	return { dir: tmpDir, filePath };
}

interface AgentResult {
	agent: string;
	task: string;
	exitCode: number;
	output: string;
	stderr: string;
	sessionId?: string;
	usage: { input: number; output: number; turns: number };
}

async function runAgent(
	defaultCwd: string,
	agentName: string,
	task: string,
	agents: AgentConfig[],
	signal?: AbortSignal,
	timeoutMs?: number,
): Promise<AgentResult> {
	const agent = agents.find((a) => a.name === agentName);
	if (!agent) {
		return {
			agent: agentName,
			task,
			exitCode: 1,
			output: "",
			stderr: `Unknown agent: "${agentName}". Available: ${agents.map((a) => a.name).join(", ")}`,
			usage: { input: 0, output: 0, turns: 0 },
		};
	}

	const args: string[] = ["--mode", "json", "-p", "--no-session"];
	if (agent.model) args.push("--model", agent.model);
	if (agent.tools && agent.tools.length > 0) args.push("--tools", agent.tools.join(","));

	const result: AgentResult = {
		agent: agentName,
		task,
		exitCode: 0,
		output: "",
		stderr: "",
		usage: { input: 0, output: 0, turns: 0 },
	};

	let tmpPromptDir: string | null = null;
	let tmpPromptPath: string | null = null;

	try {
		if (agent.systemPrompt.trim()) {
			const tmp = await writePromptToTempFile(agent.systemPrompt);
			tmpPromptDir = tmp.dir;
			tmpPromptPath = tmp.filePath;
			args.push("--append-system-prompt", tmpPromptPath);
		}

		args.push(`Task: ${task}`);

		const timeout = timeoutMs ?? 1800000;
		const invocation = getPiInvocation(args);

		const exitCode = await new Promise<number>((resolve) => {
			const proc = spawn(invocation.command, invocation.args, {
				cwd: defaultCwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
			});
			result.sessionId = `proc-${proc.pid}-${Date.now().toString(36)}`;

			const timer = setTimeout(() => {
				proc.kill("SIGTERM");
				setTimeout(() => {
					if (!proc.killed) proc.kill("SIGKILL");
				}, 5000);
			}, timeout);

			let buffer = "";

			proc.stdout.on("data", (data) => {
				buffer += data.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) {
					if (!line.trim()) continue;
					parseJsonEvent(line, result);
				}
			});

			proc.stderr.on("data", (data) => {
				result.stderr += data.toString();
			});

			proc.on("close", (code) => {
				clearTimeout(timer);
				if (buffer.trim()) parseJsonEvent(buffer, result);
				resolve(code ?? 0);
			});

			proc.on("error", () => {
				clearTimeout(timer);
				resolve(1);
			});

			if (signal) {
				const killProc = () => {
					clearTimeout(timer);
					proc.kill("SIGTERM");
					setTimeout(() => {
						if (!proc.killed) proc.kill("SIGKILL");
					}, 5000);
				};
				if (signal.aborted) killProc();
				else signal.addEventListener("abort", killProc, { once: true });
			}
		});

		result.exitCode = exitCode;
	} finally {
		if (tmpPromptPath) {
			try { fs.unlinkSync(tmpPromptPath); } catch { /* ignore */ }
		}
		if (tmpPromptDir) {
			try { fs.rmdirSync(tmpPromptDir); } catch { /* ignore */ }
		}
	}

	return result;
}

function parseJsonEvent(line: string, result: AgentResult): void {
	try {
		const event = JSON.parse(line);
		if (event.type === "message_end" && event.message?.role === "assistant") {
			result.usage.turns++;
			const usage = event.message.usage;
			if (usage) {
				result.usage.input += usage.input || 0;
				result.usage.output += usage.output || 0;
			}
			if (Array.isArray(event.message.content)) {
				for (const part of event.message.content) {
					if (part.type === "text") result.output += part.text;
				}
			}
		}
	} catch {
		/* ignore */
	}
}

// ============================================================================
// Verdict parsing
// ============================================================================

const VERDICT_APPROVED = "APPROVED";
const VERDICT_APPROVED_WITH_CHANGES = "APPROVED WITH CHANGES";
const VERDICT_NEEDS_WORK = "NEEDS WORK";
const VERDICT_PASS = "VERDICT: PASS";
const VERDICT_FAIL = "VERDICT: FAIL";

function parseVerdict(output: string): { verdict: Verdict; issues: string[] } {
	const lines = output.split("\n");
	let verdict: Verdict = "approved";
	const issues: string[] = [];
	let foundExplicit = false;

	for (const raw of lines) {
		const line = raw.trim();
		if (line === VERDICT_NEEDS_WORK || line === VERDICT_FAIL) {
			verdict = "needs_work";
			foundExplicit = true;
		} else if (line === VERDICT_APPROVED || line === VERDICT_PASS) {
			if (!foundExplicit) verdict = "approved";
		} else if (line === VERDICT_APPROVED_WITH_CHANGES) {
			if (!foundExplicit) verdict = "approved_with_changes";
		} else if (
			line.startsWith("- `") &&
			(line.includes(" - ") || line.includes(":") || line.startsWith("- `"))
		) {
			issues.push(line);
		}
	}

	return { verdict, issues };
}

// ============================================================================
// Plan Execution Engine
// ============================================================================

interface ExecutionContext {
	cwd: string;
	agents: AgentConfig[];
	signal?: AbortSignal;
	onUpdate?: (update: { content: { type: string; text: string }[]; details?: any }) => void;
	ownerSessionId?: string;
	/** When true, pause for owner decision between cycles even if auto_accept=true. */
	interactive: boolean;
}

async function executePlan(plan: Plan, ctx: ExecutionContext): Promise<{ board: Board; finalOutput: string; success: boolean }> {
	const board = new Board(plan, { ownerSessionId: ctx.ownerSessionId });
	board.savePlanYaml(JSON.stringify(plan, null, 2));
	const maxCycles = plan.plan.max_cycles ?? 10;
	const maxConcurrency = plan.plan.max_concurrency ?? 10;
	const autoAccept = plan.plan.auto_accept ?? false;

	ctx.onUpdate?.({
		content: [{ type: "text", text: `Starting plan: ${plan.plan.name}\nPlan ID: ${board.planId}\nTasks: ${plan.tasks.length}\nMode: ${autoAccept ? "auto-accept" : "owner-decisions"}` }],
		details: { phase: "starting", planId: board.planId },
	});

	for (let cycle = 0; cycle < maxCycles; cycle++) {
		if (board.isComplete() || board.isFailed() || board.isCancelled()) break;

		board.beginCycle("producing");
		board.updateDependencyStatus();
		board.appendBoard(`\n[${new Date().toISOString()}] === Cycle ${board.getCycle()} ===\n`);

		// Run ready tasks in parallel
		const readyTasks = board.getReadyTasks();
		if (readyTasks.length === 0) {
			const blockers = board.getBlockers();
			if (blockers.length > 0) {
				ctx.onUpdate?.({
					content: [{ type: "text", text: `No ready tasks. Blockers:\n${blockers.join("\n")}` }],
					details: { phase: "blockers", blockers },
				});
			}
			break;
		}

		const batch = readyTasks.slice(0, maxConcurrency);
		ctx.onUpdate?.({
			content: [{ type: "text", text: `Cycle ${board.getCycle()}: ${batch.length} task(s) running (max_concurrency=${maxConcurrency})` }],
			details: { phase: "cycle", cycle: board.getCycle(), batch: batch.map((t) => t.id) },
		});

		await Promise.all(batch.map((task) => runOneTask(task, board, ctx)));

		// Decision gating
		const awaiting = autoAccept ? false : ctx.interactive;
		const needsDecision = board
			.generateCycleReport()
			.tasks.some((t) => t.action_type === "owner_decision");

		if (awaiting && needsDecision) {
			const message = renderAwaitingDecision(board);
			board.awaitDecision(message);
			ctx.onUpdate?.({
				content: [{ type: "text", text: message }],
				details: { phase: "awaiting_decision", planId: board.planId, board: board.getState() },
			});
			return { board, finalOutput: board.renderStatus(), success: false };
		}

		// Auto-accept path: any pending-decision tasks get auto-accepted
		if (autoAccept) {
			const report = board.generateCycleReport();
			const pending = report.tasks.filter((t) => t.action_type === "owner_decision");
			if (pending.length > 0) {
				const autoDecision: Decision = {
					last_cycle: pending.map((t) => ({ task_id: t.id, verdict: "accept" as DecisionVerdict })),
					next_cycle: [],
					plan_complete: false,
					message_to_user: `[auto-accept] ${pending.length} task(s) accepted without owner review`,
				};
				board.processDecision(autoDecision);
			}
		}

		// Check for plan completion
		board.complete();
	}

	const finalOutput = board.renderStatus();
	board.appendBoard(`\n[${new Date().toISOString()}] === Plan ${board.getStatus()} ===\n`);
	return { board, finalOutput, success: board.isComplete() && !board.isFailed() };
}

async function runOneTask(task: Task, board: Board, ctx: ExecutionContext): Promise<void> {
	const taskState = board.getTaskState(task.id);
	if (!taskState) return;

	// Run producer
	const started = board.startTask(task.id);
	if (!started) {
		// Task wasn't in 'ready' state (e.g. deps not met, or already running).
		// Log to board and skip rather than silently spinning.
		const state = board.getTaskState(task.id);
		board.appendBoard(
			`[${new Date().toISOString()}] ${primaryAgent(task.assigned_to)} | ${task.id} | skipped (status=${state?.status})\n`,
		);
		ctx.onUpdate?.({
			content: [{ type: "text", text: `[${primaryAgent(task.assigned_to)}] Skipped: ${task.title} (state=${state?.status})` }],
			details: { phase: "skipped", taskId: task.id, state: state?.status },
		});
		return;
	}
	const producerName = primaryAgent(task.assigned_to);
	ctx.onUpdate?.({
		content: [{ type: "text", text: `[${producerName}] Starting: ${task.title}` }],
		details: { phase: "producing", taskId: task.id },
	});

	const producerResult = await runAgent(
		ctx.cwd,
		producerName,
		task.prompt,
		ctx.agents,
		ctx.signal,
		task.timeout_ms,
	);

	if (producerResult.exitCode !== 0) {
		const willRetry = board.failTask(task.id, producerResult.stderr || producerResult.output);
		board.appendScratchpad(
			`\n## ${task.id} producer failed (exit ${producerResult.exitCode})\n${(producerResult.stderr || producerResult.output).slice(0, 500)}\n`,
			task.id,
		);
		board.appendBoard(
			`[${new Date().toISOString()}] ${producerName} | ${task.id} | ${willRetry ? `retrying (${board.getTaskState(task.id)?.retry_count}/${task.max_retries})` : "failed"}\n`,
		);
		ctx.onUpdate?.({
			content: [{ type: "text", text: `[${producerName}] ${willRetry ? "Retry queued" : "Failed after retries"}: ${task.title}` }],
			details: { phase: willRetry ? "retrying" : "failed", taskId: task.id },
		});
		return;
	}

	// Producer succeeded
	const deliverablePath = board.getDeliverablePath(task.id);
	const preview = producerResult.output.slice(0, 1000);
	board.completeTask(task.id, preview, deliverablePath);
	board.writeTaskOutput(task.id, producerResult.output, deliverablePath);
	board.appendScratchpad(
		`\n## ${task.id} produced\n${producerResult.output.slice(0, 800)}\n`,
		task.id,
	);
	board.appendBoard(
		`[${new Date().toISOString()}] ${producerName} | ${task.id} | done (${producerResult.usage.turns} turns, ${producerResult.usage.input}+${producerResult.usage.output} tokens)\n`,
	);

	// If task has no verifiers or is verify-as-task, we're done
	if (taskState.verified_by.length === 0 || task.role === "verify-as-task") {
		ctx.onUpdate?.({
			content: [{ type: "text", text: `[${producerName}] Done: ${task.title}` }],
			details: { phase: "done", taskId: task.id },
		});
		return;
	}

	// Run all verifiers in parallel
	board.startVerifying(task.id);
	ctx.onUpdate?.({
		content: [{ type: "text", text: `Verifying: ${task.title} (${taskState.verified_by.length} verifier(s))` }],
		details: { phase: "verifying", taskId: task.id },
	});

	const verifyPromptBase = verifyPromptFor(task, taskState.verified_by[0]);
	const verifierResults: VerifierResult[] = await Promise.all(
		taskState.verified_by.map(async (verifierName) => {
			const vPrompt = verifyPromptFor(task, verifierName);
			const prompt = `${vPrompt}\n\n# Output to verify\n\n${producerResult.output.slice(0, 3000)}`;
			const startedAt = Date.now();
			const result = await runAgent(ctx.cwd, verifierName, prompt, ctx.agents, ctx.signal, 600_000);
			const finishedAt = Date.now();

			const { verdict, issues } = parseVerdict(result.output);
			return {
				agent: verifierName,
				session_id: result.sessionId,
				passed: verdict !== "needs_work",
				summary: result.output.slice(0, 1000),
				verdict,
				issues,
				started_at: startedAt,
				finished_at: finishedAt,
			};
		}),
	);

	for (const r of verifierResults) board.recordVerifierResult(task.id, r);

	const { allApproved, needsDecision, needsWork } = board.processVerifierResults(task.id);
	const overallVerdict: Verdict = needsWork
		? "needs_work"
		: allApproved
			? "approved"
			: "approved_with_changes";

	board.appendBoard(
		`[${new Date().toISOString()}] verifier | ${task.id} | ${overallVerdict} (${verifierResults.length} verifier(s))\n`,
	);
	ctx.onUpdate?.({
		content: [
			{
				type: "text",
				text: needsDecision
					? `[verifier] ${task.id} → NEEDS WORK — owner decision required:\n${(verifierResults[0]?.issues ?? []).slice(0, 5).join("\n")}`
					: `[verifier] ${task.id} → ${overallVerdict.toUpperCase()}`,
			},
		],
		details: { phase: needsDecision ? "needs_work" : "verified", taskId: task.id, verdict: overallVerdict },
	});
}

function renderAwaitingDecision(board: Board): string {
	const lines: string[] = [];
	lines.push(`## Plan: ${board.plan.plan.name} — awaiting owner decision`);
	lines.push(`**Plan ID:** ${board.planId}`);
	lines.push(`**Cycle:** ${board.getCycle()}`);
	lines.push("");
	lines.push("Tasks needing decision:");
	for (const t of board.plan.tasks) {
		const st = board.getTaskState(t.id);
		if (!st?.pending_decision) continue;
		lines.push(`- **${t.id}** (${t.title})`);
		if (st.last_issues && st.last_issues.length) {
			lines.push(`  - issues: ${st.last_issues.slice(0, 5).join("; ")}`);
		}
	}
	lines.push("");
	lines.push("Submit a decision with `team_decision` tool or write a JSON file:");
	lines.push(JSON.stringify({
		plan_id: board.planId,
		example: {
			last_cycle: [{ task_id: "task-1", verdict: "accept" }],
			next_cycle: [],
			plan_complete: false,
			message_to_user: "All good",
		},
	}, null, 2));
	return lines.join("\n");
}

// ============================================================================
// Plan registry (so other tools can find a plan by id)
// ============================================================================

function plansDir(): string {
	return process.env.PI_TEAM_STATE_DIR ?? path.join(homedir(), ".pi", "team", "plans");
}

function listKnownPlans(): { planId: string; state: any }[] {
	const dir = plansDir();
	if (!fs.existsSync(dir)) return [];
	return fs
		.readdirSync(dir)
		.map((entry) => {
			const stateFile = path.join(dir, entry, "state.json");
			if (!fs.existsSync(stateFile)) return null;
			try {
				const state = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
				return { planId: state.plan_id ?? entry, state };
			} catch {
				return null;
			}
		})
		.filter((x): x is { planId: string; state: any } => x !== null)
		.sort((a, b) => (b.state.updated_at ?? 0) - (a.state.updated_at ?? 0));
}

function findPlanById(planId: string): { board: Board; state: any } | null {
	const dir = plansDir();
	const candidate = path.join(dir, planId);
	if (!fs.existsSync(candidate)) {
		// Try matching by prefix
		const matches = fs
			.readdirSync(dir)
			.filter((d) => d === planId || d.startsWith(planId))
			.map((d) => path.join(dir, d));
		if (matches.length === 0) return null;
		const stateFile = path.join(matches[0], "state.json");
		if (!fs.existsSync(stateFile)) return null;
		const state = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
		return { board: Board.fromState(state, matches[0]), state };
	}
	const stateFile = path.join(candidate, "state.json");
	if (!fs.existsSync(stateFile)) return null;
	const state = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
	return { board: Board.fromState(state, candidate), state };
}

// ============================================================================
// Extension
// ============================================================================

export default function (pi: ExtensionAPI) {
	const agents = loadBuiltInAgents();

	// ------------------------------------------------------------------------
	// Main team tool — handles plan/decision/steer/legacy
	// ------------------------------------------------------------------------
	pi.registerTool({
		name: "team",
		label: "Team",
		description: [
			"Coordinate a team of specialized agents (mavis Agent Team pattern, ported to pi).",
			"Flow: Lead plans → Workers execute in parallel → Verifiers check independently",
			"→ Fix if needed → Owner decision → Repeat cycles → Lead aggregates.",
			"Modes: implement (default), plan, research, review",
			"",
			"Pass either:",
			"- `task` (free-form) — legacy lead-decomposition mode",
			"- `plan` or `plan_file` — mavis-format plan YAML (preferred)",
			"- `decision` or `decision_file` — submit owner decision JSON for a plan awaiting decision",
			"- `steer` — message for currently running tasks",
			"",
			"Use `team_status`, `team_decision`, `team_steer`, `team_control` for finer control.",
		].join(" "),
		parameters: TeamParams,

		async execute(_id, params: Static<typeof TeamParams>, signal, onUpdate, ctx) {
			// Plan-based mode
			let plan: Plan | null = null;
			let planSource = "";
			if (params.plan) {
				const r = parsePlanYaml(params.plan);
				if (r.errors.length > 0 || r.plan.tasks.length === 0) {
					return { content: [{ type: "text", text: `Invalid plan YAML:\n${r.errors.join("\n")}` }], isError: true };
				}
				plan = r.plan;
				planSource = params.plan;
			} else if (params.plan_file) {
				const r = loadPlanFile(params.plan_file);
				if (r.errors.length > 0 || r.plan.tasks.length === 0) {
					return { content: [{ type: "text", text: `Failed to load plan file "${params.plan_file}":\n${r.errors.join("\n")}` }], isError: true };
				}
				plan = r.plan;
				planSource = fs.readFileSync(params.plan_file, "utf-8");
			}

			// Decision submission
			if (params.decision || params.decision_file) {
				const decJson = params.decision_file
					? fs.readFileSync(params.decision_file, "utf-8")
					: params.decision!;
				let decision: Decision & { plan_id?: string };
				try {
					decision = JSON.parse(decJson);
				} catch (e: any) {
					return { content: [{ type: "text", text: `Invalid decision JSON: ${e.message}` }], isError: true };
				}
				const found = findPlanById(decision.plan_id ?? "");
				if (!found) {
					return { content: [{ type: "text", text: `Plan not found: ${decision.plan_id ?? "(no plan_id given)"}` }], isError: true };
				}
				found.board.processDecision(decision);
				found.board.appendBoard(`\n[${new Date().toISOString()}] owner decision: ${decision.message_to_user}\n`);
				const next = await executePlan(found.board.plan, {
					cwd: ctx.cwd,
					agents,
					signal,
					onUpdate: onUpdate as any,
					ownerSessionId: ctx.sessionManager.getSessionId?.(),
					interactive: false,
				});
				return {
					content: [{ type: "text", text: next.finalOutput }],
					details: { planId: found.board.planId, status: found.board.getStatus(), cycle: found.board.getCycle() },
				};
			}

			// Plan execution
			if (plan) {
				const result = await executePlan(plan, {
					cwd: ctx.cwd,
					agents,
					signal,
					onUpdate: onUpdate as any,
					ownerSessionId: ctx.sessionManager.getSessionId?.(),
					interactive: true,
				});
				return {
					content: [{ type: "text", text: result.finalOutput }],
					details: {
						planId: result.board.planId,
						cycle: result.board.getCycle(),
						success: result.success,
						stateDir: result.board.stateDir,
						awaitingDecision: result.board.isAwaitingDecision(),
					},
				};
			}

			// Steer
			if (params.steer) {
				const all = listKnownPlans();
				if (all.length === 0) {
					return { content: [{ type: "text", text: "No plans found." }], isError: true };
				}
				const target = all[0];
				const found = findPlanById(target.planId);
				if (!found) return { content: [{ type: "text", text: `Plan ${target.planId} not found.` }], isError: true };
				const n = found.board.steer(params.steer);
				return { content: [{ type: "text", text: `Steered ${n} running task(s) in plan ${target.planId}.` }] };
			}

			// Legacy free-form task mode
			if (!params.task) {
				return { content: [{ type: "text", text: "Provide either `task` (legacy), `plan`/`plan_file`, or `decision`/`decision_file`." }], isError: true };
			}
			return await runLegacyTeam(params, signal, onUpdate, ctx, agents);
		},
	});

	// ------------------------------------------------------------------------
	// team_status
	// ------------------------------------------------------------------------
	pi.registerTool({
		name: "team_status",
		label: "Team Status",
		description: "Show status of a team plan by ID (most recent if omitted).",
		parameters: TeamStatusParams,
		async execute(_id, params: Static<typeof TeamStatusParams>, _signal, _onUpdate, _ctx) {
			const plans = listKnownPlans();
			if (plans.length === 0) {
				return { content: [{ type: "text", text: "No plans found. Run a plan first." }] };
			}
			const target = params.plan_id
				? plans.find((p) => p.planId === params.plan_id)
				: plans[0];
			if (!target) {
				return { content: [{ type: "text", text: `Plan ${params.plan_id} not found.` }], isError: true };
			}
			const found = findPlanById(target.planId);
			if (!found) return { content: [{ type: "text", text: `Plan ${target.planId} not found.` }], isError: true };
			const text = params.human ? found.board.renderStatus() : JSON.stringify(found.board.getState(), null, 2);
			return { content: [{ type: "text", text }] };
		},
	});

	// ------------------------------------------------------------------------
	// team_decision
	// ------------------------------------------------------------------------
	pi.registerTool({
		name: "team_decision",
		label: "Team Decision",
		description: "Submit an owner decision for a plan awaiting decision (verdicts: accept, reject, override_accept, manual_retry).",
		parameters: TeamDecisionParams,
		async execute(_id, params: Static<typeof TeamDecisionParams>, signal, onUpdate, ctx) {
			const decJson = params.decision_file
				? fs.readFileSync(params.decision_file, "utf-8")
				: params.decision;
			if (!decJson) {
				return { content: [{ type: "text", text: "Provide `decision` or `decision_file`." }], isError: true };
			}
			let decision: Decision;
			try {
				decision = JSON.parse(decJson);
			} catch (e: any) {
				return { content: [{ type: "text", text: `Invalid JSON: ${e.message}` }], isError: true };
			}
			const found = findPlanById(params.plan_id);
			if (!found) {
				return { content: [{ type: "text", text: `Plan ${params.plan_id} not found.` }], isError: true };
			}
			found.board.processDecision(decision);
			found.board.appendBoard(`\n[${new Date().toISOString()}] owner decision: ${decision.message_to_user}\n`);

			// Resume execution
			const next = await executePlan(found.board.plan, {
				cwd: ctx.cwd,
				agents,
				signal,
				onUpdate: onUpdate as any,
				ownerSessionId: ctx.sessionManager.getSessionId?.(),
				interactive: true,
			});
			return { content: [{ type: "text", text: next.finalOutput }], details: { planId: found.board.planId, status: found.board.getStatus() } };
		},
	});

	// ------------------------------------------------------------------------
	// team_steer
	// ------------------------------------------------------------------------
	pi.registerTool({
		name: "team_steer",
		label: "Team Steer",
		description: "Send a steer message to all currently running tasks in a plan.",
		parameters: TeamSteerParams,
		async execute(_id, params: Static<typeof TeamSteerParams>, _signal, _onUpdate, _ctx) {
			const found = findPlanById(params.plan_id);
			if (!found) return { content: [{ type: "text", text: `Plan ${params.plan_id} not found.` }], isError: true };
			const n = found.board.steer(params.message);
			return { content: [{ type: "text", text: `Steered ${n} running task(s).` }] };
		},
	});

	// ------------------------------------------------------------------------
	// team_control — unblock / extend-timeout / cancel
	// ------------------------------------------------------------------------
	pi.registerTool({
		name: "team_control",
		label: "Team Control",
		description: "Operator actions: unblock a task, extend a running task's timeout, or cancel the whole plan.",
		parameters: TeamControlParams,
		async execute(_id, params: Static<typeof TeamControlParams>, _signal, _onUpdate, _ctx) {
			const found = findPlanById(params.plan_id);
			if (!found) return { content: [{ type: "text", text: `Plan ${params.plan_id} not found.` }], isError: true };
			const action = params.task_id && params.minutes !== undefined
				? "extend"
				: params.task_id
					? "unblock"
					: "cancel";
			if (action === "extend") {
				const ok = found.board.extendTimeout(params.task_id!, params.minutes!);
				return { content: [{ type: "text", text: ok ? `Extended ${params.task_id} by ${params.minutes}m` : `Cannot extend ${params.task_id} (not in 'producing' state)` }], isError: !ok };
			}
			if (action === "unblock") {
				const ok = found.board.unblockTask(params.task_id!);
				return { content: [{ type: "text", text: ok ? `Unblocked ${params.task_id}` : `Cannot unblock ${params.task_id} (not in 'blocked' state)` }], isError: !ok };
			}
			found.board.cancel();
			return { content: [{ type: "text", text: `Plan ${params.plan_id} cancelled.` }] };
		},
	});

	// ------------------------------------------------------------------------
	// Slash commands
	// ------------------------------------------------------------------------
	pi.registerCommand("team:status", {
		description: "Show status of a team plan",
		handler: async (args, ctx) => {
			const id = args.trim() || undefined;
			const found = id ? findPlanById(id) : listKnownPlans()[0] ? findPlanById(listKnownPlans()[0].planId) : null;
			if (!found) {
				ctx.ui.notify("No plan found.", "warning");
				return;
			}
			ctx.ui.notify(found.board.renderStatus(), "info");
		},
	});

	pi.registerCommand("team:list", {
		description: "List all known team plans",
		handler: async (_args, ctx) => {
			const plans = listKnownPlans();
			if (plans.length === 0) {
				ctx.ui.notify("No plans found.", "info");
				return;
			}
			const lines = plans.map((p) => `- ${p.planId}: ${p.state.plan?.plan?.name ?? "?"} [${p.state.status}] cycle=${p.state.cycle}`);
			ctx.ui.notify(`Team plans:\n${lines.join("\n")}`, "info");
		},
	});

	pi.registerCommand("team:decision", {
		description: "Submit owner decision JSON (use --file or pass JSON)",
		handler: async (args, ctx) => {
			const id = args.trim().split(/\s+/)[0] ?? "";
			const found = findPlanById(id);
			if (!found) {
				ctx.ui.notify(`Plan ${id} not found. Use /team:list.`, "warning");
				return;
			}
			if (!found.board.isAwaitingDecision()) {
				ctx.ui.notify(`Plan ${id} is not awaiting decision (status: ${found.board.getStatus()}).`, "warning");
				return;
			}
			ctx.ui.notify(
				`Plan ${id} is awaiting decision. Use the team_decision tool with:\n` +
				JSON.stringify({ plan_id: id, last_cycle: [], next_cycle: [], plan_complete: false, message_to_user: "..." }, null, 2),
				"info",
			);
		},
	});

	pi.registerCommand("team:cancel", {
		description: "Cancel a running team plan",
		handler: async (args, ctx) => {
			const id = args.trim();
			const found = findPlanById(id);
			if (!found) {
				ctx.ui.notify(`Plan ${id} not found.`, "warning");
				return;
			}
			found.board.cancel();
			ctx.ui.notify(`Plan ${id} cancelled.`, "info");
		},
	});

	pi.registerCommand("team:steer", {
		description: "Steer running tasks in a plan",
		handler: async (args, ctx) => {
			const firstSpace = args.indexOf(" ");
			const id = firstSpace < 0 ? args.trim() : args.slice(0, firstSpace);
			const msg = firstSpace < 0 ? "" : args.slice(firstSpace + 1);
			const found = findPlanById(id);
			if (!found) {
				ctx.ui.notify(`Plan ${id} not found.`, "warning");
				return;
			}
			const n = found.board.steer(msg);
			ctx.ui.notify(`Steered ${n} running task(s) in ${id}.`, "info");
		},
	});

	pi.registerCommand("team:unblock", {
		description: "Unblock a task in a plan",
		handler: async (args, ctx) => {
			const [id, taskId] = args.trim().split(/\s+/);
			const found = findPlanById(id);
			if (!found) {
				ctx.ui.notify(`Plan ${id} not found.`, "warning");
				return;
			}
			const ok = found.board.unblockTask(taskId);
			ctx.ui.notify(ok ? `Unblocked ${taskId}.` : `Cannot unblock ${taskId} (not blocked).`, ok ? "info" : "warning");
		},
	});

	pi.registerCommand("team:extend", {
		description: "Extend a running task's timeout",
		handler: async (args, ctx) => {
			const [id, taskId, minStr] = args.trim().split(/\s+/);
			const minutes = parseInt(minStr ?? "15", 10);
			const found = findPlanById(id);
			if (!found) {
				ctx.ui.notify(`Plan ${id} not found.`, "warning");
				return;
			}
			const ok = found.board.extendTimeout(taskId, minutes);
			ctx.ui.notify(ok ? `Extended ${taskId} by ${minutes}m.` : `Cannot extend ${taskId}.`, ok ? "info" : "warning");
		},
	});

	pi.registerCommand("team:example", {
		description: "Show an example plan YAML",
		handler: async (_args, ctx) => {
			ctx.ui.notify(EXAMPLE_PLAN, "info");
		},
	});

	pi.registerCommand("team:help", {
		description: "Show team command help",
		handler: async (_args, ctx) => {
			ctx.ui.notify(TEAM_HELP, "info");
		},
	});

	// ------------------------------------------------------------------------
	// Footer status (mavis-style "ready" indicator)
	// ------------------------------------------------------------------------
	pi.on("session_start", async (_event, sessionCtx) => {
		const plans = listKnownPlans();
		const running = plans.filter((p) => p.state.status === "running" || p.state.status === "awaiting_decision");
		const text = running.length === 0
			? "ready"
			: `${running.length} running`;
		sessionCtx.ui?.setStatus("team", text);
	});
}

// ============================================================================
// Legacy free-form team mode (Lead decomposition)
// ============================================================================

interface LegacyWorkUnit {
	id: string;
	task: string;
	agent: string;
	status: "pending" | "running" | "done" | "failed" | "verified";
	output?: string;
	error?: string;
	retryCount: number;
	verdict?: Verdict;
	issues?: string[];
}

async function runLegacyTeam(
	params: Static<typeof TeamParams>,
	signal: AbortSignal | undefined,
	onUpdate: any,
	ctx: any,
	agents: AgentConfig[],
) {
	const mode = params.mode ?? "implement";
	const doVerify = params.verify ?? true;
	const maxRetries = Math.min((params.retries ?? 2) + 1, 5);

	onUpdate?.({
		content: [{ type: "text", text: `Team coordination started.\n\n**Mode:** ${mode}${doVerify ? " (with verification)" : ""}\n\nLead is analyzing task...` }],
		details: { phase: "acknowledging" },
	});

	const leadTask = `Analyze this task and decompose it into work units:

Task: ${params.task}
Mode: ${mode}

Output a numbered list with each step and its assigned agent. Use arrow (→) to separate task from agent.
Example:
1. Find relevant files → scout
2. Implement feature → worker
3. Review code → verifier

Be specific about what each work unit should do. If parallel execution is possible, indicate which tasks are independent.`;

	const leadResult = await runAgent(ctx.cwd, "lead", leadTask, agents, signal);
	if (leadResult.exitCode !== 0) {
		return { content: [{ type: "text", text: `Lead failed: ${leadResult.stderr || leadResult.output}` }], isError: true };
	}

	const decomposition = parseLeadDecomposition(leadResult.output);
	const tasks: LegacyWorkUnit[] = decomposition.tasks.length === 0
		? fallbackDecomposition(params.task, mode, doVerify)
		: decomposition.tasks.map((d, i) => ({
			id: `unit-${i}`,
			task: d.task,
			agent: d.agent,
			status: "pending" as const,
			retryCount: 0,
		}));

	for (let i = 0; i < tasks.length; i++) {
		const unit = tasks[i];
		if (!agents.some((a) => a.name === unit.agent)) {
			unit.status = "failed";
			unit.error = `Agent "${unit.agent}" not found`;
			continue;
		}
		unit.status = "running";
		onUpdate?.({ content: [{ type: "text", text: `[${unit.agent}] Starting: ${unit.task.slice(0, 80)}...` }], details: { phase: "executing" } });
		const result = await runAgent(ctx.cwd, unit.agent, unit.task, agents, signal);
		if (result.exitCode !== 0) {
			unit.status = "failed";
			unit.error = result.stderr || result.output;
			continue;
		}
		unit.output = result.output;
		if (unit.agent === "verifier" && doVerify) {
			const { verdict, issues } = parseVerdict(result.output);
			if (verdict === VERDICT_NEEDS_WORK && unit.retryCount < maxRetries) {
				const workerIdx = tasks.findIndex((u, idx) => idx < i && u.agent === "worker" && u.status === "done");
				if (workerIdx >= 0) {
					const w = tasks[workerIdx];
					w.task = `Fix issues:\n\n${issues.join("\n\n")}\n\nOriginal: ${params.task}`;
					const wr = await runAgent(ctx.cwd, "worker", w.task, agents, signal);
					w.status = wr.exitCode === 0 ? "done" : "failed";
					w.output = wr.output;
				}
			}
			unit.status = "verified";
			unit.verdict = verdict === VERDICT_NEEDS_WORK ? "needs_work" : verdict === VERDICT_APPROVED_WITH_CHANGES ? "approved_with_changes" : "approved";
			unit.issues = issues;
		} else {
			unit.status = "done";
		}
	}

	const aggregate = buildLegacyAggregate(tasks, mode, leadResult.output);
	return { content: [{ type: "text", text: aggregate }], details: { mode, tasks } };
}

function parseLeadDecomposition(output: string): { tasks: { task: string; agent: string }[] } {
	const tasks: { task: string; agent: string }[] = [];
	for (const line of output.split("\n")) {
		const m1 = line.match(/^\d+\.\s*(.+?)\s*[→→]\s*(\w+)/);
		if (m1) {
			tasks.push({ task: m1[1].trim(), agent: m1[2].trim().toLowerCase() });
			continue;
		}
		const m2 = line.match(/^-\s*(.+?)\s*[→→]\s*(\w+)/);
		if (m2) {
			tasks.push({ task: m2[1].trim(), agent: m2[2].trim().toLowerCase() });
		}
	}
	return { tasks };
}

function fallbackDecomposition(task: string, mode: string, doVerify: boolean): LegacyWorkUnit[] {
	if (mode === "implement") {
		const arr: LegacyWorkUnit[] = [{ id: "unit-0", task: `Implement: ${task}`, agent: "worker", status: "pending", retryCount: 0 }];
		if (doVerify) arr.push({ id: "unit-1", task: `Verify: ${task}`, agent: "verifier", status: "pending", retryCount: 0 });
		return arr;
	}
	if (mode === "plan") return [{ id: "unit-0", task: `Plan: ${task}`, agent: "lead", status: "pending", retryCount: 0 }];
	if (mode === "research") return [{ id: "unit-0", task: `Research: ${task}`, agent: "scout", status: "pending", retryCount: 0 }];
	return [{ id: "unit-0", task: `Review: ${task}`, agent: "verifier", status: "pending", retryCount: 0 }];
}

function buildLegacyAggregate(tasks: LegacyWorkUnit[], mode: string, leadOutput: string): string {
	const lines: string[] = [`## Team Execution Complete (mode: ${mode})`, ""];
	for (const u of tasks) {
		const icon = u.status === "verified" ? "✓" : u.status === "failed" ? "✗" : "✓";
		const status = u.status === "verified" ? `VERIFIED (${u.verdict?.replace("_", " ") ?? ""})` : u.status.toUpperCase();
		lines.push(`- ${icon} **${u.agent}**: ${status}`);
		if (u.output) {
			lines.push(`  ${u.output.slice(0, 200).replace(/\n/g, " ")}${u.output.length > 200 ? "..." : ""}`);
		}
	}
	if (leadOutput) {
		lines.push("", "### Lead Analysis", "```", leadOutput.slice(0, 500), "```");
	}
	return lines.join("\n");
}

// ============================================================================
// Static strings
// ============================================================================

const EXAMPLE_PLAN = `Example mavis-format plan:

\`\`\`yaml
version: 1
plan:
  name: add user profile feature
  max_concurrency: 3
  max_cycles: 10
  auto_accept: false        # require owner decision between cycles
  verifier_config:
    default_verifiers: [verifier]
tasks:
  - id: backend
    title: User profile API
    prompt: Implement user profile CRUD API with JWT auth.
    assigned_to: worker
    verified_by: verifier
    verify_prompt: Re-run the test suite and verify auth works.
    timeout_ms: 1800000

  - id: frontend
    title: Profile edit form
    prompt: Add profile edit form component, wire to backend.
    assigned_to: worker
    depends_on: [backend]
    verified_by: verifier
    verify_prompt: Test UI flow end-to-end.

  - id: e2e
    title: End-to-end test
    role: verify-as-task        # deliverable IS the verification
    prompt: Run the full e2e suite and produce a pass/fail report.
    assigned_to: tester
    depends_on: [frontend]
    timeout_ms: 1800000
\`\`\`

Use the \`team\` tool with \`plan_file: "path/to/plan.yaml"\` to run it.`;

const TEAM_HELP = `Team Agent — mavis team plan engine ported to pi.

Plan format: mavis-compatible YAML. See \`/team:example\`.

Tools:
  team            Run a plan, submit a decision, or steer (single entry point)
  team_status     Inspect a plan by ID
  team_decision   Submit owner decision JSON
  team_steer      Send a steer message to running tasks
  team_control    unblock / extend-timeout / cancel

Commands:
  /team:status [id]        Show plan status
  /team:list               List all known plans
  /team:decision <id>      Show what's needed for a plan awaiting decision
  /team:cancel <id>        Cancel a plan
  /team:steer <id> <msg>   Steer running tasks
  /team:unblock <id> <task>
  /team:extend <id> <task> <min>
  /team:example            Show example plan YAML
  /team:help               This help

State directory:
  ~/.pi/team/plans/<plan_id>/
    plan.yaml       original plan
    state.json      current state
    board.md        human-readable timeline
    scratchpad/     root + per-task notes
    outputs/<task>/deliverable.md

Override with $PI_TEAM_STATE_DIR.

Verdicts (for team_decision.last_cycle[].verdict):
  accept           done right
  reject           failed review → retry same task
  manual_retry     wrong approach → retry with correction
  override_accept  verifier wrong → accept anyway
`;
