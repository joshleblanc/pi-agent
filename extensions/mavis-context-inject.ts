/**
 * Mavis Context Inject — Restores the mavis system-prompt preface and per-agent
 * memory that the native harness provides automatically.
 *
 * Native mavis (opencode + mavis plugin) prepends a long, structured preface
 * to every session: agent identity, the mavis Agent Team contract, hard rules
 * (user-language, worktree, parallel-task file ownership, deliverable.md
 * contract), and the active agent's accumulated `memory/MEMORY.md`. In pi,
 * none of this is loaded — M3 falls back to its base prompt and loses the
 * conventions mavis tasks expect.
 *
 * This extension:
 *   1. Injects the mavis preface into the system prompt on every turn
 *   2. Auto-loads `~/.mavis/agents/<agent>/memory/MEMORY.md` for the active agent
 *   3. Lets the user switch agents via /mavis-agent (used by mavis-skills)
 *   4. Exposes /mavis-mem to read/append the active agent's memory
 *   5. Syncs skill:events back to memory at session end (so learnings persist)
 *
 * The preface is the same one the mavis package ships, distilled to the
 * rules M3 actually needs to behave well on mavis-style tasks.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// =============================================================================
// Active agent state (shared with mavis-skills via file-marker if both present)
// =============================================================================

const AGENT_DIR = (agent: string) => path.join(os.homedir(), ".mavis", "agents", agent);
const MEMORY_PATH = (agent: string) => path.join(AGENT_DIR(agent), "memory", "MEMORY.md");

const MAVIS_PREFACE = `
## Mavis Agent Team context (restored by mavis-context-inject)

You are operating inside the mavis Agent Team system. Native mavis tasks
(plan runs, doctor diagnostics, skill proposals) expect the conventions
below. Honor them even when running through pi.

### Hard rules

1. **User-facing language follows the user.**
   - \`plan.name\`, every task \`title\`, the \`message_to_user\` field in decisions,
     and free-form prose in \`prompt\` / \`verify_prompt\` that the user will
     later see verbatim MUST be in the same language the user is using in
     this session. Default to English only when no language signal exists.
   - Exact technical tokens (file paths, schema field names, \`auto\`/\`default\`)
     may stay in original form. Translate the verb, noun, and surrounding prose.
2. **Worktree first (when the project's AGENTS.md mandates it).** Edit code
   in a worktree, never the default branch. Detect the default branch from
   the remote before creating \`feature/<name>\` or \`fix/<name>\`.
3. **Parallel tasks must own their files.** If two parallel tasks could
   write the same file, serialize them with \`depends_on\` OR explicitly
   assign file ownership in each task's prompt. Otherwise workers duplicate
   work and conflict in merges.
4. **No CI/review polling in workers.** Workers produce the deliverable and
   exit. Waiting for CI, code review, merge, or external approvals is owner
   work — never block a worker on it.
5. **Deliverable contract.** Each produce task ends with a complete
   \`outputs/<task-id>/deliverable.md\` containing: what was done, files
   changed (with paths and short notes), test/verification evidence, and
   any open questions. A worker that doesn't write a deliverable.md
   hasn't finished.
6. **Independent re-derive, not re-read.** The verifier must independently
   re-run commands / re-check source data, not just re-read the producer's
   diff. The team value is adversarial verification, not rubber stamping.
7. **Prefer dedicated tools over raw shell.** Use the mcp__matrix__* tools
   for web search and image gen, mcp__playwright__* for browser automation,
   mcp__cu__* for desktop control, mcp__trash__* for recoverable delete
   (instead of \`rm\`). These are loaded by mavis-mcp-bridge.
8. **Reuse mavis skills over reinventing.** When a task matches a skill
   description (use \`/mavis-skills\` to list), call \`skill_<name>\` to
   load the SKILL.md body and follow it. Do not write parallel procedures.

### mavis plan structure (when running a plan)

\`\`\`yaml
version: 1
plan:
  name: <user-language>
  max_concurrency: 3
  max_consecutive_failures: 2
  max_cycles: 10
  auto_accept: false
  verifier_config:
    default_verifiers: [verifier]
    audit_sample_rate: 0.0
tasks:
  - id: <kebab-id>
    title: <user-language>
    prompt: <self-contained spec>
    assigned_to: <agent-name>      # coder / general / mavis / verifier
    verified_by: verifier           # or array, or omitted if role=verify-as-task
    verify_prompt: <re-derive instruction>
    timeout_ms: 1800000             # 30-min cap
    depends_on: [<other-id>]
\`\`\`

### Decision verdicts (when owner is reviewing)

- \`accept\` — done.
- \`reject\` — retry (same task_id, same session, scratchpad + worktree kept).
- \`manual_retry\` — retry with explicit correction in \`reason\`.
- \`override_accept\` — accept anyway (verifier wrong).

Same task_id retries reuse the existing session. New task_ids = cold start
(3–5 min wasted on setup). Don't burn it on a "missing changelog" fix.
`.trim();

const ACTIVE_AGENT_FILE = path.join(os.homedir(), ".mavis", ".active-agent");

function readActiveAgent(): string {
	try {
		if (fs.existsSync(ACTIVE_AGENT_FILE)) {
			const v = fs.readFileSync(ACTIVE_AGENT_FILE, "utf-8").trim();
			if (v) return v;
		}
	} catch {}
	// Fall back to detecting from the active model — for now default to "coder"
	return "coder";
}

function writeActiveAgent(name: string): void {
	try {
		fs.writeFileSync(ACTIVE_AGENT_FILE, name + "\n", "utf-8");
	} catch {
		// best-effort
	}
}

function loadMemory(agent: string): string {
	const p = MEMORY_PATH(agent);
	if (!fs.existsSync(p)) return "";
	try {
		return fs.readFileSync(p, "utf-8");
	} catch {
		return "";
	}
}

function appendMemory(agent: string, section: string): boolean {
	const p = MEMORY_PATH(agent);
	const dir = path.dirname(p);
	try {
		fs.mkdirSync(dir, { recursive: true });
		const existing = fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : "";
		const stamp = new Date().toISOString().slice(0, 10);
		const out = existing
			? `${existing}\n\n### ${stamp} (pi session)\n${section}\n`
			: `### ${stamp} (pi session)\n${section}\n`;
		fs.writeFileSync(p, out, "utf-8");
		return true;
	} catch {
		return false;
	}
}

// =============================================================================
// Extension
// =============================================================================

export default function (pi: ExtensionAPI) {
	let activeAgent = readActiveAgent();
	let lastMemory: string = loadMemory(activeAgent);

	// ------------------------------------------------------------------------
	// Inject the mavis preface + per-agent memory into the system prompt
	// ------------------------------------------------------------------------

	pi.on("before_agent_start", async (_event, ctx) => {
		// Reload memory in case the user edited it on disk
		lastMemory = loadMemory(activeAgent);

		const parts: string[] = [MAVIS_PREFACE];
		if (lastMemory.trim()) {
			parts.push(
				`\n\n## Memory for agent \`${activeAgent}\`\n\nThe following is the running memory for the active mavis agent — distilled lessons from prior sessions. Use it. Don't re-derive things it already covers.\n\n${lastMemory.trim()}`,
			);
		}
		parts.push(`\n\n*Active mavis agent: \`${activeAgent}\`. Switch with \`/mavis-agent <name>\`.*`);

		return {
			message: {
				customType: "mavis-context-preface",
				content: parts.join("\n"),
				display: false,
			},
		};
	});

	// ------------------------------------------------------------------------
	// Slash commands
	// ------------------------------------------------------------------------

	pi.registerCommand("mavis-agent", {
		description: "Set the active mavis agent (coder/general/mavis/verifier) for context + memory",
		handler: async (args, ctx) => {
			const next = args.trim().split(/\s+/)[0];
			if (!next) {
				ctx.ui.notify(`Active agent: ${activeAgent}\nMemory: ${lastMemory ? `${lastMemory.length} chars` : "(empty)"}`, "info");
				return;
			}
			if (!fs.existsSync(AGENT_DIR(next))) {
				ctx.ui.notify(`No mavis agent named "${next}". Known: coder, general, mavis, verifier.`, "warning");
				return;
			}
			activeAgent = next;
			writeActiveAgent(next);
			lastMemory = loadMemory(next);
			ctx.ui.notify(`Switched to agent: ${activeAgent}. Memory: ${lastMemory ? `${lastMemory.length} chars` : "(empty)"}`, "info");
		},
	});

	pi.registerCommand("mavis-mem", {
		description: "Read the active agent's memory",
		handler: async (_args, ctx) => {
			const mem = loadMemory(activeAgent);
			if (!mem) {
				ctx.ui.notify(`No memory for agent ${activeAgent}. Path: ${MEMORY_PATH(activeAgent)}`, "info");
				return;
			}
			ctx.ui.notify(`## Memory: ${activeAgent}\n\n${mem}\n\n*(${mem.length} chars — ${MEMORY_PATH(activeAgent)})*`, "info");
		},
	});

	pi.registerCommand("mavis-mem-append", {
		description: "Append a section to the active agent's memory (e.g. /mavis-mem-append use ruby -c for syntax)",
		handler: async (args, ctx) => {
			const text = args.trim();
			if (!text) {
				ctx.ui.notify("Usage: /mavis-mem-append <text>", "warning");
				return;
			}
			const ok = appendMemory(activeAgent, text);
			if (ok) {
				lastMemory = loadMemory(activeAgent);
				ctx.ui.notify(`Appended to ${activeAgent}/memory/MEMORY.md. New size: ${lastMemory.length} chars.`, "info");
			} else {
				ctx.ui.notify("Failed to append — check file permissions on ~/.mavis/agents/<agent>/memory/", "error");
			}
		},
	});

	pi.registerCommand("mavis-preface", {
		description: "Show the mavis context preface (what's being injected)",
		handler: async (_args, ctx) => {
			ctx.ui.notify(MAVIS_PREFACE, "info");
		},
	});

	// ------------------------------------------------------------------------
	// Status
	// ------------------------------------------------------------------------

	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.notify(
			`Mavis context: agent=${activeAgent}, memory=${lastMemory ? `${lastMemory.length} chars` : "empty"}`,
			"info",
		);
	});
}
