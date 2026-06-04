# Skills in pi

Skills are markdown files. pi reads `SKILL.md` from each subdirectory of `~/.pi/agent/skills/`, parses YAML frontmatter, and exposes the `description` to the agent runtime for trigger matching.

## File shape

```
~/.pi/agent/skills/<name>/
├── SKILL.md                 # required — frontmatter + body
├── references/              # optional — pulled in by body via [link](references/x.md)
│   ├── commands-windows-powershell.md
│   └── commands-macos-linux.md
├── scripts/                 # optional — deterministic helpers
└── plans/                   # optional — team-engine orchestration (mavis-format YAML)
```

`README.md`, `CHANGELOG.md`, `install.sh`, `.env*` are forbidden — they add noise without adding capability. A skill that needs version history should add a "Changelog" section to `SKILL.md`.

## Frontmatter

```yaml
---
name: kebab-case-name              # MUST match the folder name
description: >                     # shown to the orchestrator for trigger matching
  One concrete sentence about when to load this skill. Avoid "general-purpose" / "helpful assistant".
---
```

`name` and `description` are sacred — do not delete or rename in a patch. Everything else is fair game.

## Scope decisions

pi has no project-scope (`~/.harness/`) and no agent-scope. Effective scopes are:

| Scope | Where it lives | Survives across projects? | Survives across reinstall? |
| --- | --- | --- | --- |
| **User (built-in)** | `~/.pi/agent/skills/<name>/` | yes (user-level) | yes (lives in user dir) |
| **Project (ad-hoc)** | `<repo>/.pi/skills/<name>/` or `<repo>/skills/<name>/` | no (per-repo) | yes |

There is no per-agent scope in pi — the `team-agent` extension ships a fixed set of three "agents" (lead/worker/verifier) loaded from its own folder; you cannot add custom agents in pi the way mavis does.

For a project-specific helper, write a skill to `<repo>/.pi/skills/<name>/SKILL.md` and add a one-line note in the repo's `AGENTS.md` to register it. pi's runtime does not auto-discover project skills yet — the orchestrator reads the skill description from the loaded set.

## Discovery and inspection

There is no `mavis skill list` / `mavis skill show` in pi. Use the filesystem:

```bash
# List every skill
ls ~/.pi/agent/skills

# Read a skill
cat ~/.pi/agent/skills/<name>/SKILL.md
```

```powershell
Get-ChildItem $env:USERPROFILE\.pi\agent\skills -Directory | Select-Object Name
Get-Content (Join-Path $env:USERPROFILE\.pi\agent\skills\<name>\SKILL.md)
```

## Install / copy / delete

- **Install**: drop the `SKILL.md` (and any `references/`, `scripts/`) into `~/.pi/agent/skills/<name>/`. Takes effect on next session.
- **Copy a builtin to user dir for editing**: `Copy-Item -Recurse <source> ~/.pi/agent/skills/<name>` (PS) / `cp -r <source> ~/.pi/agent/skills/<name>` (bash).
- **Delete**: remove the folder. `Remove-Item -Recurse -Force ~/.pi/agent/skills/<name>` (PS) / `rm -rf ~/.pi/agent/skills/<name>` (bash).

## Authoring

Use the `skill-creator` skill (loads its own SKILL.md). It walks the eval-driven loop: scope decision → draft → lint → eval against a real prompt → iterate.

## Common pitfalls

| Pitfall | Why it bites | Avoid by |
| --- | --- | --- |
| `description` is vague ("a general-purpose helper") | orchestrator can't pick the skill for delegation; every task looks equally relevant | one concrete sentence about a real trigger phrase |
| Inline whole project rules in `SKILL.md` | body bloats; updates require editing one central file | link to a `references/<topic>.md` instead |
| List of skills inside the body | list drifts; runtime already has the trigger surface | don't list — let the runtime inject |
| `README.md` instead of `SKILL.md` | pi only loads `SKILL.md` | rename or symlink |
