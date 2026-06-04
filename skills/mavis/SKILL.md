---
name: mavis
description: "pi coding agent runtime entry point (port of the mavis meta-skill). Use this skill for any task about pi itself — directory layout, available extensions, skill discovery, team plan execution, session model, model providers, and what pi does NOT have (no daemon, no crons, no inter-session messaging, no hooks, no IM bridge). Trigger when the user asks 'where does pi store X', 'how do I add a skill/extension', 'how do I run a team plan', 'what model is configured', 'where is the team state', or refers to pi/pi-coding-agent internals. NOTE: this skill's NAME is kept as 'mavis' for backward compatibility with the folder; the content is the pi-runtime reference, not mavis."
---

# pi runtime (formerly "mavis meta")

The skill folder is named `mavis/` for backward compatibility. The content is the **pi runtime reference** — it does NOT describe the mavis daemon. If you loaded this expecting mavis documentation, you are in the wrong place; mavis is a different system. This skill is the operating manual for the pi runtime.

pi is a single-process coding agent. The runtime is the `pi` CLI plus a tree of folders and extensions; there is no long-running daemon, no scheduler, no inter-session bus, and no inbound chat bridge.

If the task is "operate pi itself" (configure, discover, extend, debug), start here. If the task is "do work" (code, write, search, browse), use the matching task skill instead — this skill is the operating manual for the machine, not the work it produces.

## Capability map

| Area | What it covers | Read when you need |
| --- | --- | --- |
| `layout` | Directory layout (`~/.pi/`, `~/.pi/agent/`, `~/.pi/team/`), env vars, config knobs | locate any pi file; understand where state lives |
| `skills` | Skill discovery, file shape, scope decisions, install/copy/delete | list, inspect, install, or author a skill |
| `extensions` | Extension discovery, `index.ts` shape, registration API, builtin extensions | write a new extension; understand what `pi.registerTool` does |
| `team` | `team` tool surface (plan / status / decision / steer / control), plan YAML schema, state directory | run a multi-agent plan; check progress; submit a decision |
| `session` | Session model, persistence, model/provider, what survives across runs | understand the current session; switch model; find prior sessions |
| `model-provider` | How providers/models are configured (extension or env) | pick a model; add a custom provider; read current model |
| `limits` | What pi does NOT have — no daemon, no cron, no hook, no IM, no inter-session messaging | avoid asking for features that don't exist; pick the closest substitute |

## What pi has — concretely

| Concept | Where it lives | How to access |
| --- | --- | --- |
| Built-in skills | `~/.pi/agent/skills/<name>/SKILL.md` | read the file directly |
| Skill references | `~/.pi/agent/skills/<name>/references/` | read files as needed |
| Built-in extensions | `~/.pi/agent/extensions/<name>/index.ts` | read source to understand registered tools |
| Team plan state | `~/.pi/team/plans/<plan_id>/{plan.yaml,state.json,board.md,scratchpad/,outputs/<task>/}` | use `team_status` to inspect; override with `$PI_TEAM_STATE_DIR` |
| Current session | `~/.pi/sessions/<session_id>/` (varies) | session manager provides id via `ctx.sessionManager.getSessionId?.()` |
| Models | per-extension or per-provider config (no global `config.yaml` by default) | check `~/.pi/agent/extensions/*/index.ts` for provider registration |

## What pi does NOT have

These are mavis features that have no direct pi equivalent. If the user asks for one of these, say so plainly and offer the closest substitute:

| Missing | Closest substitute in pi |
| --- | --- |
| Long-running daemon | none — pi is invoked per-session |
| Cron / scheduled tasks | run as OS-level scheduled task (`schtasks` / `cron`) calling `pi` with a prompt |
| Hooks (tool gate / session gate) | none — wrap pi via a custom extension that registers middleware |
| Inbound IM bridge (Feishu / Telegram) | none — the user drives pi manually; use lark-cli / similar from a skill |
| Inter-session messaging | none — sessions are independent; share data via files |
| Signal / proposal channels (skill feedback) | file a markdown issue in the skill folder itself, or open a git issue |
| Built-in browser broker | use the `url-browser` extension (registered) or playwright MCP |
| `.harness/` project reins | none — pi has no project-team concept; use the `team` tool with a plan file at the repo root |
| `mavis agent list/info/new` | list `~/.pi/agent/extensions/` and read each `index.ts`; there is no CLI to create one |

## Read map

- "where is X stored / what is the directory layout" → `references/layout.md`
- "how do I list / install / inspect / author a skill" → `references/skills.md`
- "how do I write or register an extension / what tools are available" → `references/extensions.md`
- "how do I run a team plan / what is the plan format" → `references/team.md`
- "what is the current session / how do I switch model" → `references/session-and-model.md`
- "what can't pi do / what is the closest substitute for feature X" → `references/limits.md`

## Platform detection (replaces mavis `<agent-context>.platform`)

pi has no `<agent-context>.platform` file. Detect the host platform inline at the top of any procedure that needs it:

- **Node (TypeScript extensions)**: `process.platform` → `'win32' | 'darwin' | 'linux'`
- **PowerShell**: `[System.Environment]::OSVersion.Platform` (or `$IsWindows` on PS 7+)
- **Bash**: `uname -s` → `Linux` / `Darwin` / `MINGW64_NT-10.0` / etc.

For shell recipes, follow the platform-conditional style in each skill's `references/commands-*.md` (PowerShell on win32, bash on darwin/linux). The body of each skill stays platform-neutral; the platform-specific glue lives in the references.

## Minimal examples (pi-native, no mavis CLI)

- **list-skills**: `Get-ChildItem ~/.pi/agent/skills -Directory` (PS) / `ls ~/.pi/agent/skills` (bash)
- **list-extensions**: `Get-ChildItem ~/.pi/agent/extensions -Directory` / `ls ~/.pi/agent/extensions`
- **inspect-skill**: read `~/.pi/agent/skills/<name>/SKILL.md` directly
- **inspect-extension**: read `~/.pi/agent/extensions/<name>/index.ts` and look at `registerTool` / `registerCommand` calls
- **run-team-plan**: invoke the `team` tool with `plan_file: "/abs/path/plan.yaml"` (mavis-format plan YAML is accepted unchanged by the team-agent extension)
- **check-plan-status**: invoke the `team_status` tool, or `Get-ChildItem ~/.pi/team/plans -Directory`
- **cancel-plan**: invoke `team_control` with `plan_id`, or `/team:cancel <id>` slash command

## Rule

If the task is "operate or use pi itself", start here, then read only the reference matching the current subproblem. Do not create a second routing skill for pi usage/configuration questions — add or adjust a `pi-runtime` reference instead, so this skill remains the single routing entry point for the runtime.
