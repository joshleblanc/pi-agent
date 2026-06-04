# pi layout

Single source of truth for "where does pi keep X". Read once at the start of a session; reach back here when you need an absolute path.

## Top-level

| Path | Purpose |
| --- | --- |
| `~/.pi/` | User-level pi state. Created on first run. |
| `~/.pi/agent/` | Agent runtime (skills, extensions, config snippets). |
| `~/.pi/team/` | Team plan engine state (see `team.md`). |
| `~/.pi/sessions/` | Session persistence (format is extension-specific). |
| `~/.pi/logs/` | Diagnostic logs (when an extension writes them). |

Override the data dir with `$PI_DATA_DIR`. Some extensions also honor `$PI_TEAM_STATE_DIR` for the team subtree.

## `~/.pi/agent/`

| Path | Purpose |
| --- | --- |
| `~/.pi/agent/skills/<name>/SKILL.md` | Built-in / user-installed skills. Loaded by the agent runtime. |
| `~/.pi/agent/skills/<name>/references/` | Optional reference docs the skill pulls in via `references/<x>.md` links. |
| `~/.pi/agent/skills/<name>/scripts/` | Optional deterministic helper scripts. |
| `~/.pi/agent/extensions/<name>/index.ts` | TypeScript extension source. Registers tools / commands / middleware via `ExtensionAPI`. |
| `~/.pi/agent/extensions/<name>/<other>.ts` | Additional extension modules (parser, board, schema). |

`index.ts` is the only required file. Anything else is per-extension.

## `~/.pi/team/`

| Path | Purpose |
| --- | --- |
| `~/.pi/team/plans/<plan_id>/plan.yaml` | Original plan (verbatim copy of the YAML the producer supplied). |
| `~/.pi/team/plans/<plan_id>/state.json` | Live state machine (task statuses, retry counts, verifier verdicts). |
| `~/.pi/team/plans/<plan_id>/board.md` | Human-readable timeline (append-only). |
| `~/.pi/team/plans/<plan_id>/scratchpad/root.md` | Plan-wide shared notes. |
| `~/.pi/team/plans/<plan_id>/scratchpad/<task-id>.md` | Per-task notes (producer + verifier share). |
| `~/.pi/team/plans/<plan_id>/outputs/<task-id>/deliverable.md` | Per-task deliverable. |

Override the team subtree with `$PI_TEAM_STATE_DIR`.

## Environment variables

| Var | Effect |
| --- | --- |
| `$PI_DATA_DIR` | Override the user-level data dir (`~/.pi/`). |
| `$PI_TEAM_STATE_DIR` | Override the team plans dir. |
| `<EXT>_API_KEY`, `<EXT>_BASE_URL` | Custom provider credentials (set by each extension). |

There is no global `config.yaml`. Provider credentials and model selection live in the extension that owns the provider (see `session-and-model.md`).

## Platform notes

- Windows: `~/.pi/` resolves to `%USERPROFILE%\.pi\`. Use PowerShell `Join-Path` to build paths.
- macOS / Linux: `~/.pi/` resolves to the user's home. Use `path.join` (Node) or shell `~` expansion (bash).
- WSL: `~/.pi/` lives in the WSL distro, not on the Windows host. Don't cross-mount without testing.

## What you will NOT find

- `~/.mavis/` — mavis paths do not exist in pi. If a script or skill points there, it's a leftover.
- `~/.mavis/config.yaml` — there is no global model config; providers register per-extension.
- `~/.mavis/agents/` — there is no per-user agent directory in pi. Built-in "agents" (lead, worker, verifier) live inside the team-agent extension folder.
- `~/.mavis/skills/` — pi's equivalent is `~/.pi/agent/skills/`.
- `~/.mavis/.builtin-skills/` — built-in skills live in the pi package, not the user dir.
- `<repo>/.harness/` — pi has no project-team concept.
