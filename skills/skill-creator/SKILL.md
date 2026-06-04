---
name: skill-creator
description: |
  Create a new pi skill with a short eval-driven loop. Use when the user asks to
  create a skill, turn a repeated workflow into a skill, or build a new reusable procedure.
  Do not use for improving or fixing an existing skill (use skill-refiner instead),
  or when the user only wants to run a skill or learn what skills exist.
---

# Skill Creator

Turn a reusable workflow into a dense skill, then verify it against a real prompt.

## Inputs to collect

Collect only the missing information:

1. **Goal**: What should the skill help the model do?
2. **Triggers**: What user phrases should activate it?
3. **Boundaries**: What nearby requests should not trigger it?
4. **Success bar**: What does one good run look like?

If the user only has a vague idea, load `plan-mode` to clarify the request. Do not invent a long interview flow inside this skill.

## Platform command router

This skill keeps shell recipes in `references/commands-{windows-powershell,macos-linux}.md`. Before running any command, select the right reference based on the host OS:

- Windows → `references/commands-windows-powershell.md` (PowerShell recipes only)
- macOS / Linux → `references/commands-macos-linux.md` (bash recipes only)

To detect the host platform without `<agent-context>.platform` (pi has no such file), use one of:

- Node: `process.platform`
- PowerShell: `[System.Environment]::OSVersion.Platform` or `$IsWindows` on PS 7+
- Bash: `uname -s`

The references own every recipe this skill needs (`list-skills`, `locate-skill-dir`, `run-lint`, `eval-scratch-dir`, `write-eval-yaml`, `run-eval`, `baseline-output-paths`).

## Procedure

### 1. Check whether a matching skill already exists

Use the `list-skills` recipe from the selected platform command reference — it reads `~/.pi/agent/skills/` directly.

If a nearby skill already covers the use case, **do not create a duplicate**. Instead, tell the user to use `skill-refiner` to extend or improve the existing skill.

### 2. Determine the skill scope

Use the three-question test to decide where the skill lives:

- **Will the answer change for a different user?** → User skill (`~/.pi/agent/skills/<skill-name>/`)
- **Does it hold true across projects?** → User skill (most common; pi has no per-agent scope)
- **Only relevant to the current project?** → Project skill (`<repo>/.pi/skills/<skill-name>/`)

There is no `~/.mavis/agents/<name>/skills/` (agent scope) in pi — the team-agent extension loads its built-in roles from its own folder, not from per-user agent dirs. The `create-agent` skill covers adding a new built-in role to the team-agent extension.

### 3. Capture the reusable workflow from the lightest source available

- Prefer the just-finished conversation or user-provided workflow doc.
- Condense it into the minimum procedure another model needs.
- If the idea is still vague, use `plan-mode`, then return here.

### 4. Design the skill around progressive disclosure

- Put trigger/boundary information in frontmatter `description`, not in a `When to use` section.
- Keep `SKILL.md` focused on execution rules: procedure, output contract, failure handling.
- Move bulky background, schemas, or variants into `references/`.
- Add `scripts/` only for deterministic local work; add `plans/` only for Team Engine orchestration.

### 5. Draft `SKILL.md` with high information density

- Keep body sections short and imperative.
- Remove README-style teaching, feature tours, redundant trigger lists, and API-overview prose.
- Keep only one or two canonical examples.
- Follow `references/skill-template.md`, `references/description-rubric.md`, and `references/anti-patterns.md`.

Write the skill into the location determined in step 2:

```
~/.pi/agent/skills/<skill-name>/
<repo>/.pi/skills/<skill-name>/
```

Use this structure only when needed:

```
<skill-root>/
├── SKILL.md
├── scripts/        # deterministic local work only
├── plans/          # Team Engine orchestration only
└── references/     # bulk material the main file should not inline
```

Do not create extra scaffolding by default: `README.md`, `CHANGELOG.md`, `install.sh`, `.env`, `.env.example`, `.gitignore`, `assets/`, or `evals/`.

For script bundling rules, see `references/when-to-bundle-scripts.md`.

### 6. Lint before eval

Use the `run-lint` recipe from the selected platform command reference. The script is `scripts/lint-skill.js` and can be run with Node directly:

```bash
node scripts/lint-skill.js <skill_path>
```

It checks for complete frontmatter, matching kebab-case names, a useful description, main-file size, forbidden files, and valid `references/` links.

Do not move on until lint passes.

### 7. Eval against a real user prompt

Eval compares "with-skill" vs "without-skill" on a real prompt. Two paths depending on whether the `team` tool is available.

**Pick a real eval prompt first**: a genuine user question that should trigger this skill.

#### Path A — `team` tool available

Use the `write-eval-yaml` and `run-eval` recipes from the selected platform command reference. They cover:

- copying `plans/eval-skill.template.yaml` to a platform-appropriate scratch path
- substituting `<SKILL_NAME>`, `<SKILL_PATH>`, and `<EVAL_PROMPT>`
- launching the plan via the `team` tool with `plan_file`

The plan runs producer and baseline **in parallel** (no `depends_on` between them), then a compare task synthesizes the verdict.

#### Path B — Degraded (no `team` tool)

Use two **parallel** Task tool calls (subagents) in a single response. Use the `baseline-output-paths` recipe from the platform command reference for the writable scratch directory (do NOT hardcode `/tmp/`):

1. **Producer**: "Load skill at `<SKILL_PATH>`, use it to handle: `<EVAL_PROMPT>`. Write your process and output to `<scratch>/eval-<skill-name>/with-skill.md`."
2. **Baseline**: "Handle this task without loading any skill: `<EVAL_PROMPT>`. Write your process and output to `<scratch>/eval-<skill-name>/baseline.md`."

After both return, read the two files and do the comparison yourself — same 5-point rubric as `plans/eval-skill.template.yaml`'s compare task.

### 8. Iterate only if eval exposes a real weakness

Read the comparison output, improve the skill, then repeat lint and eval.

Stop when any of these is true:
- the user is satisfied
- the skill clearly beats or matches baseline without major regressions
- two rounds in a row produce no meaningful gain

## Output contract

Deliver:
- a skill under the appropriate scope directory (user / project)
- a passing lint result
- at least one evaluation round where the skill is not worse than baseline

## Failure handling

- If lint keeps failing, rewrite the skill more simply instead of padding it.
- If eval says the skill is worse than baseline, check whether the problem is description quality, body bloat, over-strict procedure, or whether the skill should exist at all.
- If the user cancels the idea, remove the unfinished skill directory instead of keeping a half-product.

## Examples

**Input**: "I just figured out how to check someone's availability in Feishu Calendar. Turn this into a skill."

**Good path**:
1. Run `ls ~/.pi/agent/skills/` and find no existing availability-checking skill.
2. Ask the scope question: this is user-agnostic and cross-project, so user skill.
3. Draft a concise `SKILL.md` with the procedure, lint it, run eval.

**Bad path**: immediately create a brand-new skill without checking for overlap first, or try to extend an existing calendar skill in this creator instead of directing to skill-refiner.

## Additional resources

- `references/commands-macos-linux.md` - bash/zsh recipes (darwin/linux)
- `references/commands-windows-powershell.md` - PowerShell recipes (win32)
- `references/skill-template.md` - section skeleton
- `references/description-rubric.md` - description guidance
- `references/anti-patterns.md` - common failure modes
- `references/when-to-bundle-scripts.md` - script vs plan vs direct procedure
- `scripts/lint-skill.js` - deterministic validation
- `plans/eval-skill.template.yaml` - evaluation plan template
