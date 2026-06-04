---
name: skill-refiner
description: |
  Refine an existing pi skill with evidence-driven minimal patches.
  Use when a skill has a concrete problem (wrong instructions, outdated steps,
  missing edge case) backed by evidence. Do not use for creating new skills
  (use skill-creator), or for stylistic preferences without evidence.
---

# Skill Refiner

Apply the smallest evidence-backed patch to fix a real skill problem.

## When NOT to use

- Creating a brand-new skill → use `skill-creator`
- No concrete evidence of a problem → do nothing
- The agent failed to follow correct instructions → agent error, not a skill issue

## Procedure

### 1. Collect evidence

Identify exactly what went wrong. Evidence sources:

- An entry in `SIGNALS.md` (per-skill at `~/.pi/agent/skills/<name>/SIGNALS.md` or per-repo at `<repo>/SIGNALS.md`) — see the `skill-evolution` skill
- User feedback in the current session ("this skill told me to X but the right step is Y")
- A concrete failure trace where the skill's instructions caused wrong behavior

If the only evidence is "the skill could be better" with no specifics, stop here.

### 2. Read the current skill

There is no `mavis skill show <name>` in pi. Read the file directly:

```bash
cat ~/.pi/agent/skills/<name>/SKILL.md
# or for a project skill:
cat <repo>/.pi/skills/<name>/SKILL.md
```

```powershell
Get-Content (Join-Path $env:USERPROFILE ".pi\agent\skills\<name>\SKILL.md")
```

If you plan to apply a patch, **also read the current content's SHA-256** for CAS protection in step 6. Compute it with `git hash-object` (if the file is in a git repo) or `sha256sum` / `Get-FileHash`.

### 3. Attribute the problem

Before touching the skill, determine what actually went wrong:

| Situation | Action |
|-----------|--------|
| Skill text is factually wrong or outdated | Fix the skill |
| Agent didn't follow the skill's correct instructions | Do NOT change the skill — agent error |
| Environment changed (new API, renamed command, etc.) | Update the skill to reflect new reality |
| Skill works for the common case but misses an edge case | Add the edge case |
| Stylistic preference with no functional impact | Do NOT change |

If the problem is not in the skill itself, dismiss the signal (if one exists) and explain why. See the `skill-evolution` skill for the dismissal flow.

### 4. Generate patch

Design the minimal change that fixes the problem. Document:

```
Problem:   <what is broken>
Evidence:  <specific quote, error trace, or user statement>
Rationale: <why this change fixes it without breaking other behavior>
```

Use the `edit` tool with `oldText` / `newText` for each edit point. Prefer surgical patches over section rewrites.

### 5. Self-check before applying

Ask yourself:

- Does this change actually address the evidence? (not a nearby symptom)
- Could it break existing correct behavior?
- Am I adding generic best practices instead of fixing a specific problem? (anti-pattern)
- Is this a self-referential modification? (skill-refiner editing itself — forbidden)

If any check fails, revise the patch or abandon the change.

### 6. Apply the patch

Edit the file directly using the `edit` tool. Always verify the hash hasn't changed first if you collected one in step 2.

```bash
# User / project skills (mutable)
edit ~/.pi/agent/skills/<name>/SKILL.md    # or <repo>/.pi/skills/<name>/SKILL.md
# Apply the patch
# Verify the change landed correctly
cat ~/.pi/agent/skills/<name>/SKILL.md
```

**No special API or daemon is involved.** The pi runtime does not gate skill
edits; the `edit` tool writes to the file directly.

#### Built-in skills (ship with the pi package)

These live in the pi install directory (e.g. `node_modules/@earendil-works/pi-coding-agent/...` or equivalent) and are read-only at runtime. To update a built-in skill:

1. Note the required change
2. Copy the skill to `~/.pi/agent/skills/<name>/` to override locally (the user dir takes precedence)
3. Apply the patch to the user-dir copy
4. If the change should ship upstream, file an issue / PR with the pi maintainers

There is no MR pipeline in pi (no `glab mr create`, no daemon). Manual editing is the only path.

### 7. Verify

After applying, re-read the skill and confirm:

- The patch landed correctly
- The frontmatter `name` and `description` are intact
- The overall skill still reads coherently
- If you updated a `references/` link, the target file exists

```bash
cat ~/.pi/agent/skills/<name>/SKILL.md
ls ~/.pi/agent/skills/<name>/references/  # verify linked references still exist
```

## Hard constraints

- **No secrets**: never write API keys, tokens, or credentials into skill files
- **Size limit**: skill should stay reasonable; flag if your patch pushes SKILL.md past ~1000 lines (consider moving content to `references/`)
- **Frontmatter sacred**: `name` and `description` fields must survive every edit
- **No self-referential edits**: skill-refiner must not modify its own `SKILL.md`
- **Evidence mandatory**: every patch must trace back to a specific problem
- **Built-in skills are read-only at the install dir**: copy to user dir first if you need to change them

## Anti-patterns

- Rewriting a skill from scratch when a one-line fix would work
- Adding generic disclaimers ("always check...", "be careful to...")
- Deleting a correct instruction because one signal reported a false positive
- Changing style (wording, formatting) without functional justification
- Applying multiple unrelated fixes in one patch (split them)
- Acting on a signal without verifying the evidence first

## Output contract

Deliver:
- The applied patch with problem/evidence/rationale documented
- Verification that the skill reads correctly post-patch
- Signal verdict updated in the matching `SIGNALS.md` (if triggered by a signal)

## Failure handling

- If the file you expected to edit doesn't exist, double-check the path (per-skill, per-repo, or built-in)
- If the patch makes the skill worse on re-read, revert with a follow-up `edit` and try a different approach
- If evidence is ambiguous, dismiss the signal with explanation rather than guessing

## What this skill is NOT for

- `mavis skill show <name>` / `mavis skill evolve apply` — neither exists in pi; use `read` + `edit`
- The mavis MR-driven built-in skill flow (`glab mr create`, etc.) — pi has no MR pipeline
- Authoring a brand-new skill from scratch — use `skill-creator`
- Triaging the signal/proposal queue — use `skill-evolve-nightly` (run manually in pi)
