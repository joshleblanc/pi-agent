/**
 * Team Agent - MiniMax Agent Team Implementation
 *
 * Multi-agent orchestration with:
 * - Lead: decomposes tasks, coordinates, aggregates
 * - Workers: execute in parallel
 * - Verifier: adversarial review with retry loop
 *
 * Flow: Lead → Workers (parallel) → Verifier → Worker (fix) → Verifier → ... → Lead (aggregate)
 *
 * Architecture: This extension spawns pi processes directly (like subagent does)
 * to coordinate the team. The team tool IS the lead orchestrator.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getAgentDir, parseFrontmatter } from "@mariozechner/pi-coding-agent";
import { Container, Text, Spacer, getMarkdownTheme, Markdown } from "@mariozechner/pi-tui";
import { Type } from "typebox";

// ============================================================================
// Types
// ============================================================================

interface WorkUnit {
  id: string;
  task: string;
  agent: string;
  status: "pending" | "running" | "done" | "failed" | "verified";
  output?: string;
  error?: string;
  retryCount: number;
  verdict?: "approved" | "approved_with_changes" | "needs_work";
  issues?: string[];
}

interface AgentResult {
  agent: string;
  task: string;
  exitCode: number;
  output: string;
  stderr: string;
  usage: { input: number; output: number; turns: number };
}

interface TeamState {
  mode: string;
  leadOutput: string;
  workUnits: WorkUnit[];
  currentRetry: number;
  maxRetries: number;
  aggregateOutput: string;
  errors: string[];
}

// ============================================================================
// Constants
// ============================================================================

const VERDICT_APPROVED = "APPROVED";
const VERDICT_APPROVED_WITH_CHANGES = "APPROVED WITH CHANGES";
const VERDICT_NEEDS_WORK = "NEEDS WORK";
const MAX_RETRIES_PER_UNIT = 3;

const DEFAULT_LEAD_MODEL = "MiniMax-M2.7-highspeed";
const DEFAULT_WORKER_MODEL = "MiniMax-M2.7-highspeed";
const DEFAULT_VERIFIER_MODEL = "MiniMax-M2.7-highspeed";

// ============================================================================
// Tool Parameters
// ============================================================================

const TeamParams = Type.Object({
  task: Type.String({ description: "The overall task to accomplish" }),
  mode: Type.Optional(
    Type.Union(
      [
        Type.Literal("implement"),
        Type.Literal("plan"),
        Type.Literal("research"),
        Type.Literal("review"),
      ],
      { description: "Team mode", default: "implement" },
    ),
  ),
  verify: Type.Optional(Type.Boolean({ description: "Run verifier after implementation", default: true })),
  retries: Type.Optional(Type.Number({ description: "Max retries per work unit on failure", default: 2 })),
});

// ============================================================================
// Agent Discovery (duplicated from subagent to avoid dependency)
// ============================================================================

interface AgentConfig {
  name: string;
  description: string;
  tools?: string[];
  model?: string;
  systemPrompt: string;
  source: "user" | "project";
  filePath: string;
}

function loadAgentsFromDir(dir: string, source: "user" | "project"): AgentConfig[] {
  const agents: AgentConfig[] = [];

  if (!fs.existsSync(dir)) {
    return agents;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return agents;
  }

  for (const entry of entries) {
    if (!entry.name.endsWith(".md")) continue;
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;

    const filePath = path.join(dir, entry.name);
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const { frontmatter, body } = parseFrontmatter<Record<string, string>>(content);

    if (!frontmatter.name || !frontmatter.description) {
      continue;
    }

    const tools = frontmatter.tools
      ?.split(",")
      .map((t: string) => t.trim())
      .filter(Boolean);

    agents.push({
      name: frontmatter.name,
      description: frontmatter.description,
      tools: tools && tools.length > 0 ? tools : undefined,
      model: frontmatter.model,
      systemPrompt: body,
      source,
      filePath,
    });
  }

  return agents;
}

function discoverAgents(cwd: string): AgentConfig[] {
  const userDir = path.join(getAgentDir(), "agents");
  return loadAgentsFromDir(userDir, "user");
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

async function runAgent(
  defaultCwd: string,
  agentName: string,
  task: string,
  agents: AgentConfig[],
  signal?: AbortSignal,
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

  let tmpPromptDir: string | null = null;
  let tmpPromptPath: string | null = null;

  const result: AgentResult = {
    agent: agentName,
    task,
    exitCode: 0,
    output: "",
    stderr: "",
    usage: { input: 0, output: 0, turns: 0 },
  };

  try {
    if (agent.systemPrompt.trim()) {
      const tmp = await writePromptToTempFile(agent.systemPrompt);
      tmpPromptDir = tmp.dir;
      tmpPromptPath = tmp.filePath;
      args.push("--append-system-prompt", tmpPromptPath);
    }

    args.push(`Task: ${task}`);

    const exitCode = await new Promise<number>((resolve) => {
      const invocation = getPiInvocation(args);
      const proc = spawn(invocation.command, invocation.args, {
        cwd: defaultCwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let buffer = "";
      let messageBuffer: any[] = [];

      const processLine = (line: string) => {
        if (!line.trim()) return;
        let event: any;
        try {
          event = JSON.parse(line);
        } catch {
          return;
        }

        if (event.type === "message_end" && event.message) {
          const msg = event.message;
          if (msg.role === "assistant") {
            result.usage.turns++;
            const usage = msg.usage;
            if (usage) {
              result.usage.input += usage.input || 0;
              result.usage.output += usage.output || 0;
            }
            // Extract text content
            if (Array.isArray(msg.content)) {
              for (const part of msg.content) {
                if (part.type === "text") {
                  result.output += part.text;
                }
              }
            }
          }
        }
      };

      proc.stdout.on("data", (data) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) processLine(line);
      });

      proc.stderr.on("data", (data) => {
        result.stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (buffer.trim()) processLine(buffer);
        resolve(code ?? 0);
      });

      proc.on("error", () => {
        resolve(1);
      });

      if (signal) {
        const killProc = () => {
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
      try {
        fs.unlinkSync(tmpPromptPath);
      } catch {
        /* ignore */
      }
    }
    if (tmpPromptDir) {
      try {
        fs.rmdirSync(tmpPromptDir);
      } catch {
        /* ignore */
      }
    }
  }

  return result;
}

// ============================================================================
// Parsing Helpers
// ============================================================================

function parseVerdict(output: string): { verdict: string; issues: string[] } {
  const lines = output.split("\n");
  let verdict = "";
  const issues: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (
      trimmed === VERDICT_APPROVED ||
      trimmed === VERDICT_APPROVED_WITH_CHANGES ||
      trimmed === VERDICT_NEEDS_WORK
    ) {
      verdict = trimmed;
    } else if (trimmed.startsWith("- `") && (trimmed.includes(" - ") || trimmed.includes(":"))) {
      issues.push(trimmed);
    }
  }

  return { verdict, issues };
}

function parseLeadDecomposition(output: string): { tasks: Array<{ task: string; agent: string }> } {
  const tasks: Array<{ task: string; agent: string }> = [];
  const lines = output.split("\n");

  for (const line of lines) {
    // Pattern: "1. [task] → [agent]" or "1. [task] -> [agent]"
    const arrowMatch = line.match(/^\d+\.\s*(.+?)\s*[→→]\s*(\w+)/);
    if (arrowMatch) {
      tasks.push({ task: arrowMatch[1].trim(), agent: arrowMatch[2].trim().toLowerCase() });
      continue;
    }

    // Pattern: "- [task] → [agent]"
    const dashMatch = line.match(/^-\s*(.+?)\s*[→→]\s*(\w+)/);
    if (dashMatch) {
      tasks.push({ task: dashMatch[1].trim(), agent: dashMatch[2].trim().toLowerCase() });
    }
  }

  return { tasks };
}

// ============================================================================
// Main Extension
// ============================================================================

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "team",
    label: "Team",
    description: [
      "Coordinate a team of specialized agents (MiniMax Agent Team pattern).",
      "Flow: Lead decomposes → Workers execute in parallel → Verifier reviews → Worker fixes (if needed) → Repeat → Lead aggregates.",
      "Modes: implement (default), plan, research, review",
    ].join(" "),
    parameters: TeamParams,

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const mode = params.mode ?? "implement";
      const doVerify = params.verify ?? true;
      const maxRetries = params.retries ?? 2;
      const maxRetriesPerUnit = Math.min(maxRetries + 1, MAX_RETRIES_PER_UNIT);

      // Discover available agents
      const agents = discoverAgents(ctx.cwd);

      // Check for required agents
      const hasLead = agents.some((a) => a.name === "lead");
      const hasWorker = agents.some((a) => a.name === "worker");
      const hasVerifier = agents.some((a) => a.name === "verifier");

      if (!hasLead) {
        return {
          content: [
            {
              type: "text",
              text: `Missing "lead" agent. Define ~/.pi/agent/agents/lead.md to use team coordination.`,
            },
          ],
          details: { mode, error: "Missing lead agent" } as any,
        };
      }

      // Initialize state
      const state: TeamState = {
        mode,
        leadOutput: "",
        workUnits: [],
        currentRetry: 0,
        maxRetries: maxRetriesPerUnit,
        aggregateOutput: "",
        errors: [],
      };

      // Phase 1: Immediate acknowledgement (IM-style)
      const ackMsg = `Got it — coordinating the team on this.

I'll decompose the task and delegate to specialized agents. You'll get updates as work progresses.

**Mode:** ${mode}${doVerify ? " (with verification)" : ""}`;

      onUpdate?.({
        content: [{ type: "text", text: ackMsg }],
        details: { phase: "acknowledging", state } as any,
      });

      // Small delay to show acknowledgement
      await new Promise((r) => setTimeout(r, 100));

      // Phase 2: Lead decomposition
      onUpdate?.({
        content: [{ type: "text", text: "Lead is analyzing and decomposing the task..." }],
        details: { phase: "decomposing", state } as any,
      });

      const leadTask = `Analyze this task and decompose it into work units:

Task: ${params.task}
Mode: ${mode}

Output a numbered list with each step and its assigned agent. Use arrow (→) to separate task from agent.
Example:
1. Find relevant files → scout
2. Implement feature → worker
3. Review code → verifier

Be specific about what each work unit should do.`;

      const leadResult = await runAgent(ctx.cwd, "lead", leadTask, agents, signal);

      if (leadResult.exitCode !== 0) {
        return {
          content: [
            {
              type: "text",
              text: `Lead agent failed: ${leadResult.stderr || leadResult.output || "Unknown error"}`,
            },
          ],
          details: { mode, error: "Lead failed", stderr: leadResult.stderr } as any,
          isError: true,
        };
      }

      state.leadOutput = leadResult.output;

      // Parse decomposition
      let decomposition = parseLeadDecomposition(leadResult.output);

      // Fallback decomposition if lead didn't parse properly
      if (decomposition.tasks.length === 0) {
        if (mode === "implement") {
          decomposition = {
            tasks: doVerify
              ? [
                  { task: `Implement: ${params.task}`, agent: "worker" },
                  { task: `Verify: ${params.task}`, agent: "verifier" },
                ]
              : [{ task: `Implement: ${params.task}`, agent: "worker" }],
          };
        } else if (mode === "plan") {
          decomposition = { tasks: [{ task: `Plan: ${params.task}`, agent: "planner" }] };
        } else if (mode === "research") {
          decomposition = { tasks: [{ task: `Research: ${params.task}`, agent: "scout" }] };
        } else {
          decomposition = { tasks: [{ task: `Review: ${params.task}`, agent: "verifier" }] };
        }
      }

      // Initialize work units
      state.workUnits = decomposition.tasks.map((d, i) => ({
        id: `unit-${i}`,
        task: d.task,
        agent: d.agent,
        status: "pending" as const,
        retryCount: 0,
      }));

      // Phase 3: Execute work units
      onUpdate?.({
        content: [
          {
            type: "text",
            text: `Executing ${state.workUnits.length} work unit(s)...\n\nLead decomposition:\n${leadResult.output.substring(0, 500)}${leadResult.output.length > 500 ? "..." : ""}`,
          },
        ],
        details: { phase: "executing", state } as any,
      });

      for (let i = 0; i < state.workUnits.length; i++) {
        const unit = state.workUnits[i];

        // Skip if agent not available
        if (!agents.some((a) => a.name === unit.agent)) {
          unit.status = "failed";
          unit.error = `Agent "${unit.agent}" not found`;
          state.errors.push(`Work unit ${unit.id}: agent "${unit.agent}" not found`);
          continue;
        }

        unit.status = "running";

        onUpdate?.({
          content: [{ type: "text", text: `[${unit.agent}] Starting: ${unit.task.substring(0, 80)}...` }],
          details: { phase: "executing", state } as any,
        });

        const result = await runAgent(ctx.cwd, unit.agent, unit.task, agents, signal);

        if (result.exitCode !== 0) {
          unit.status = "failed";
          unit.error = result.stderr || result.output || "Unknown error";
          state.errors.push(`Work unit ${unit.id} (${unit.agent}) failed: ${unit.error}`);
          continue;
        }

        unit.output = result.output;

        // If verifier, parse its output for retry logic
        if (unit.agent === "verifier" && doVerify) {
          const { verdict, issues } = parseVerdict(result.output);

          if (verdict === VERDICT_NEEDS_WORK && unit.retryCount < state.maxRetries) {
            // Retry: worker needs to fix issues
            unit.status = "pending";
            unit.retryCount++;
            unit.issues = issues;
            state.currentRetry++;

            onUpdate?.({
              content: [
                {
                  type: "text",
                  text: `[VERIFIER] NEEDS WORK - Retry ${unit.retryCount}/${state.maxRetries}\n\nIssues found:\n${issues.slice(0, 5).join("\n")}${issues.length > 5 ? `\n... and ${issues.length - 5} more` : ""}`,
                },
              ],
              details: { phase: "retrying", state } as any,
            });

            // Find the worker unit to retry (the one before verifier)
            const workerUnitIndex = state.workUnits.findIndex(
              (u, idx) => idx < i && u.agent === "worker" && u.status === "done",
            );

            if (workerUnitIndex >= 0) {
              const workerUnit = state.workUnits[workerUnitIndex];
              workerUnit.status = "pending";
              workerUnit.task = `Fix the following issues in your previous implementation:\n\n${issues.join("\n\n")}\n\nOriginal task: ${params.task}`;

              // Retry worker
              const workerResult = await runAgent(ctx.cwd, "worker", workerUnit.task, agents, signal);

              if (workerResult.exitCode !== 0) {
                workerUnit.status = "failed";
                workerUnit.error = workerResult.stderr || workerResult.output;
                state.errors.push(`Worker retry failed: ${workerUnit.error}`);
              } else {
                workerUnit.status = "done";
                workerUnit.output = workerResult.output;
              }

              // Re-verify
              unit.task = `Re-verify the fixed implementation:\n\nPrevious issues:\n${issues.join("\n")}\n\nFixed implementation output:\n${workerResult.output.substring(0, 2000)}`;

              const reVerifyResult = await runAgent(ctx.cwd, "verifier", unit.task, agents, signal);
              unit.output = reVerifyResult.output;

              const { verdict: reVerdict, issues: reIssues } = parseVerdict(reVerifyResult.output);

              if (reVerdict === VERDICT_NEEDS_WORK && unit.retryCount < state.maxRetries) {
                // Continue retry loop
                unit.issues = reIssues;
                unit.retryCount++;
                i--; // Will re-process this verifier
              } else {
                unit.status = reVerdict === VERDICT_APPROVED ? "verified" : "verified";
                unit.verdict =
                  reVerdict === VERDICT_APPROVED
                    ? "approved"
                    : reVerdict === VERDICT_APPROVED_WITH_CHANGES
                      ? "approved_with_changes"
                      : "needs_work";
              }
            } else {
              // No worker found before verifier
              unit.status = "verified";
              unit.verdict = "approved_with_changes";
            }
          } else if (verdict) {
            unit.status = "verified";
            unit.verdict =
              verdict === VERDICT_APPROVED
                ? "approved"
                : verdict === VERDICT_APPROVED_WITH_CHANGES
                  ? "approved_with_changes"
                  : "needs_work";

            if (verdict === VERDICT_NEEDS_WORK) {
              unit.issues = issues;
            }
          } else {
            // Couldn't parse verdict, assume approved
            unit.status = "done";
          }
        } else {
          unit.status = "done";
        }

        onUpdate?.({
          content: [
            {
              type: "text",
              text: `[${unit.agent.toUpperCase()}] ${unit.status === "verified" ? "VERIFIED" : unit.status === "failed" ? "FAILED" : "DONE"}`,
            },
          ],
          details: { phase: "executing", state } as any,
        });
      }

      // Phase 4: Aggregate results
      state.aggregateOutput = buildAggregateOutput(state);

      onUpdate?.({
        content: [{ type: "text", text: state.aggregateOutput }],
        details: { phase: "complete", state } as any,
      });

      return {
        content: [{ type: "text", text: state.aggregateOutput }],
        details: state,
      };
    },

    renderCall(args, theme, _context) {
      const mode = args.mode ?? "implement";
      const task = args.task.length > 50 ? args.task.substring(0, 50) + "..." : args.task;
      return new Text(
        theme.fg("toolTitle", theme.bold("team ")) + theme.fg("accent", mode) + theme.fg("muted", ` — ${task}`),
        0,
        0,
      );
    },

    renderResult(result, _options, theme, _context) {
      const state = result.details as TeamState | undefined;
      const mdTheme = getMarkdownTheme();

      const container = new Container();

      container.addChild(
        new Text(
          theme.fg("toolTitle", theme.bold("Team ")) + theme.fg("accent", state?.mode ?? "team"),
          0,
          0,
        ),
      );

      if (state?.workUnits.length) {
        container.addChild(new Spacer(1));
        container.addChild(new Text(theme.fg("muted", "Work Units:"), 0, 0));

        for (const unit of state.workUnits) {
          const icon =
            unit.status === "verified"
              ? theme.fg("success", "✓")
              : unit.status === "failed"
                ? theme.fg("error", "✗")
                : unit.status === "running"
                  ? theme.fg("warning", "⏳")
                  : unit.status === "done"
                    ? theme.fg("success", "✓")
                    : theme.fg("muted", "○");

          const statusText =
            unit.status === "verified" && unit.verdict ? ` (${unit.verdict.replace("_", " ")})` : unit.status === "failed" ? ` - ${unit.error?.substring(0, 50)}` : "";

          container.addChild(new Text(`${icon} ${theme.fg("accent", unit.agent)}: ${unit.task.substring(0, 40)}...${statusText}`, 0, 0));
        }
      }

      if (state?.aggregateOutput) {
        container.addChild(new Spacer(1));
        container.addChild(new Markdown(state.aggregateOutput.trim(), 0, 0, mdTheme));
      }

      if (state?.errors.length) {
        container.addChild(new Spacer(1));
        for (const err of state.errors) {
          container.addChild(new Text(theme.fg("error", `Error: ${err}`), 0, 0));
        }
      }

      return container;
    },
  });

  // Register slash commands
  pi.registerCommand("team", {
    description: "Start team coordination",
    handler: async (args, ctx) => {
      if (!args.trim()) {
        ctx.ui.notify("Usage: /team <task>", "info");
        return;
      }
      ctx.ui.notify(`Team mode: ${args.substring(0, 50)}...`, "info");
    },
  });

  pi.registerCommand("implement", {
    description: "Worker + Verifier workflow",
    handler: async (args, ctx) => {
      ctx.ui.notify(
        `Implementation workflow: worker → verifier → (retry if needed)\nTask: ${args.substring(0, 100)}`,
        "info",
      );
    },
  });

  pi.registerCommand("plan", {
    description: "Planning mode with planner",
    handler: async (args, ctx) => {
      ctx.ui.notify(`Planning workflow: planner analyzes\nTask: ${args.substring(0, 100)}`, "info");
    },
  });

  pi.registerCommand("scout", {
    description: "Fast codebase recon",
    handler: async (args, ctx) => {
      ctx.ui.notify(`Scout workflow: fast recon\nQuery: ${args.substring(0, 100)}`, "info");
    },
  });

  pi.registerCommand("review", {
    description: "Code review with verifier",
    handler: async (args, ctx) => {
      ctx.ui.notify(`Review workflow: verifier analyzes\nTarget: ${args.substring(0, 100)}`, "info");
    },
  });

  // Set initial status
  pi.on("session_start", async (_event, sessionCtx) => {
    sessionCtx.ui?.setStatus("team", "ready");
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

function buildAggregateOutput(state: TeamState): string {
  const lines: string[] = [];

  lines.push("## Team Execution Complete\n");

  lines.push(`**Mode:** ${state.mode}`);
  lines.push(`**Work Units:** ${state.workUnits.length}`);
  lines.push(`**Retries:** ${state.currentRetry}`);
  lines.push("");

  // Summary of each work unit
  lines.push("### Results\n");
  for (const unit of state.workUnits) {
    const icon =
      unit.status === "verified" ? "✓" : unit.status === "failed" ? "✗" : unit.status === "done" ? "✓" : "○";
    const status =
      unit.status === "verified"
        ? `VERIFIED (${unit.verdict?.replace("_", " ")})`
        : unit.status === "failed"
          ? `FAILED`
          : unit.status.toUpperCase();

    lines.push(`- ${icon} **${unit.agent}**: ${status}`);

    if (unit.output) {
      const preview = unit.output.substring(0, 200).replace(/\n/g, " ");
      lines.push(`  ${preview}${unit.output.length > 200 ? "..." : ""}`);
    }

    if (unit.issues && unit.issues.length) {
      lines.push(`  Issues: ${unit.issues.length}`);
    }
  }

  if (state.errors.length) {
    lines.push("");
    lines.push("### Errors\n");
    for (const err of state.errors) {
      lines.push(`- ✗ ${err}`);
    }
  }

  if (state.leadOutput) {
    lines.push("");
    lines.push("### Lead Analysis\n");
    lines.push("```");
    lines.push(state.leadOutput.substring(0, 500));
    if (state.leadOutput.length > 500) lines.push("... (truncated)");
    lines.push("```");
  }

  lines.push("");
  lines.push("---");
  lines.push("*Use /team <task> for more complex coordination*");

  return lines.join("\n");
}
