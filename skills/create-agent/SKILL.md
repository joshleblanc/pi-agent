---
name: create-agent
description: "Create a new agent role in pi. There is no `mavis agent new` CLI. Two output paths: (1) drop an `agent.md` next to the team-agent extension's built-in `lead.md`/`worker.md`/`verifier.md` so the loader picks it up, or (2) write a custom TypeScript extension that registers tools/commands. Path 1 is for new built-in roles (e.g. `payments-expert`); path 2 is for entirely new tool surfaces. For ad-hoc roles in a single plan, bake the role into the task `prompt` and use `assigned_to: worker` — no agent file needed."
---

# Create agent (pi)

The mavis `mavis agent new` CLI does not exist in pi. The concept of "agent" in pi is narrower:

- The **team-agent** extension loads three roles by default: `lead`, `worker`, `verifier`.
- `assigned_to` in a plan must be one of these names (or a custom name that has a matching `agent.md` in the extension folder).
- Custom tool surfaces (commands, integrations, automations) belong in a **TypeScript extension**, not in an agent file.

## Pick the path before you touch disk

| Situation | Where it goes | How |
| --- | --- | --- |
| New built-in role used across plans (e.g. `payments-expert`, `db-expert`) | `~/.pi/agent/extensions/team-agent/<name>.md` | write the file in the same shape as `worker.md` |
| Entirely new tool surface (own commands, MCP integration, automation) | `~/.pi/agent/extensions/<name>/index.ts` | write a TypeScript extension |
| Ad-hoc role for one plan (e.g. "act as a security reviewer for this one task") | the task `prompt` field | bake the role into the prompt; `assigned_to: worker` |

If you're not sure which, ask the upstream caller — don't guess.

## Five steps

### 1. Pick the name

- **kebab-case**, maps 1:1 to the file name.
- Name by **responsibility**, not seniority: `payments-expert` ✓ / `senior-dev` ✗.
- Check it's free: `ls ~/.pi/agent/extensions/team-agent/` — if `<name>.md` exists, pick another.

### 2. Scaffold

**Path 1 — new built-in role (most common)**:

```bash
# Just create the file — no CLI to scaffold it
touch ~/.pi/agent/extensions/team-agent/<name>.md
```

**Path 2 — new TypeScript extension**:

```bash
mkdir -p ~/.pi/agent/extensions/<name>
# Then write index.ts
```

There is no `mavis agent new`. You write the file directly.

### 3. Write `agent.md` (Path 1)

The body must answer four questions in order. Skipping any leaves the role vague.

```markdown
---
name: <name>                   # MUST match the file name (without .md)
description: <one concrete sentence — shown to the orchestrator when picking who to delegate to>
---

# <Display Name>

You are the <role> for <project / scope>.

## Scope
- Own: <paths / systems / responsibilities>
- Don't own: <what you hand off, to whom>

## How you work
- <key convention>
- <link to project docs instead of inlining rules>

## Stop when
- <concrete checklist — "build passes, tests pass, deliverable.md written">
```

**Bad body** (it gets ignored):

> "You are a senior developer who writes high-quality, maintainable code."

**Good body** (drives behavior):

> "You own `packages/api`. You hand off UI work to `ui-expert` and infra changes to `daemon-expert`. You're done when the change builds, the affected package's tests pass, and you've posted a one-line summary to the orchestrator."

### 4. Write `index.ts` (Path 2 — TypeScript extension)

```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "myext_mytool",
    label: "My Tool",
    description: "What it does, when to use it.",
    parameters: Type.Object({
      input: Type.String(),
    }),
    async execute(_id, params) {
      return { content: [{ type: "text", text: `got: ${params.input}` }] };
    },
  });

  pi.registerCommand("myext:hello", {
    description: "Say hello",
    handler: async (args, ctx) => {
      ctx.ui.notify(`Hello, ${args || "world"}`, "info");
    },
  });
}
```

See `~/.pi/agent/extensions/team-agent/index.ts` for a richer example (tools, slash commands, lifecycle hooks, status footer).

### 5. Optional: per-role overrides

| What | Where | When |
| --- | --- | --- |
| Model override | frontmatter `model: <provider>/<model>` in the agent.md | the default model is wrong for this role |
| Tool allowlist | frontmatter `tools: read,grep,find,ls,bash` (comma-separated) | restrict the role to read-only tools (e.g. verifier) |
| Reasoning config | in the owning extension's `AgentConfig` (for team-agent this is the `loadBuiltInAgents` block) | the role needs extended thinking |

Skip what you don't need. Empty frontmatter fields are fine.

### 6. Verify it loads

```bash
ls ~/.pi/agent/extensions/team-agent/          # file is there
```

Then **restart pi** — extensions are loaded once at startup. There is no hot-reload.

After restart, the role should be dispatchable:

```yaml
- id: backend
  title: User profile API
  prompt: Implement user profile CRUD API with JWT auth.
  assigned_to: <name>     # the new role
  verified_by: verifier
```

If the team plan says `Unknown agent: "<name>"`, the loader did not pick the file up — check:

- File is at `~/.pi/agent/extensions/team-agent/<name>.md` (exact path, exact extension)
- Frontmatter has both `name:` and `description:` on their own lines
- No tab indent in frontmatter
- `name:` matches the file name

## Ad-hoc role inside a plan (no agent file needed)

If you only need the role for one task in one plan, just bake it into the prompt:

```yaml
- id: security-review
  title: Security review of the auth flow
  prompt: |
    You are acting as a security reviewer for this task only. Your job:
    1. Re-derive the auth flow from the source code (do not trust my summary).
    2. Check for token leakage, replay attacks, and missing CSRF protection.
    3. Write findings to outputs/security-review/deliverable.md.
    Use the worker tool set (full read/write/bash). Treat this as Tier 3 verification.
  assigned_to: worker      # the role lives in the prompt, not the agent name
  verified_by: verifier
```

This is faster than creating an agent file, and the orchestrator can still route it correctly because the prompt is self-contained.

## Pitfalls

| Pitfall | Why it bites | Avoid by |
| --- | --- | --- |
| `description:` is "helpful assistant" / vague | orchestrator can't pick this agent for delegation; every task looks equally relevant | one concrete sentence about the role's actual scope |
| Two agents with overlapping ownership | routing becomes random | tighten both `agent.md` bodies — make scope unambiguous before adding the second |
| Stop condition is "task is complete" | agent reports done without verifying anything | replace with measurable: "build passes, tests pass, deliverable.md written" |
| Inline whole project conventions in `agent.md` body | body bloats; updates require editing each agent | link to a single project doc (`see .harness/docs/code-standards.md`) |
| Listing custom agents inside the orchestrator's `agent.md` | the loader already injects the team roster at runtime | don't list; each agent's `description:` is what the orchestrator reads |
| Editing `~/.mavis/agents/<name>/` | that path does not exist in pi | edit `~/.pi/agent/extensions/team-agent/<name>.md` instead |

## What this skill is NOT for

- Deciding **whether** to add an agent or what roles to add → that's a design question for the upstream caller
- Bootstrapping a brand new project's `.harness/` from scratch → there is no `.harness/` in pi; use the `team` tool with a plan file at the repo root
- Creating a new skill (markdown) → use `skill-creator`
- Editing an existing agent's prompt → just open the file and edit
- Deleting an agent → `rm ~/.pi/agent/extensions/team-agent/<name>.md` and restart

## Quick reference

```bash
# Create a new role
$EDITOR ~/.pi/agent/extensions/team-agent/payments-expert.md
# Write frontmatter + body
# Save

# Verify it loads
ls ~/.pi/agent/extensions/team-agent/
# restart pi

# Remove a role
rm ~/.pi/agent/extensions/team-agent/payments-expert.md
# restart pi
```
