---
name: skill-evolution
description: |
  How to shape pi's skill set as you work — when and how to file a skill
  signal (existing skill is wrong / missing) versus a skill creation proposal
  (this session reveals a reusable new skill). Use when about to write a
  signal or proposal to a `SIGNALS.md` / `PROPOSALS.md` file at the repo root
  or skill folder, when the session-end fallback re-prompt asks you to
  reflect on signals/proposals, or when you need to read the full schema,
  attribution rubric, scope decision tree, or good/bad examples for either
  channel. Do not use for authoring an actual SKILL.md (that's
  `skill-creator` / `skill-refiner`).
---

# Skill Evolution Channels (pi)

Two ways to shape pi's skill set as you work:

| Channel | When | What you submit |
|---------|------|-----------------|
| **Signal** | An existing skill is wrong / missing | Issue kind + evidence |
| **Proposal** | This session reveals a reusable NEW skill pattern | Suggested name/scope/summary/rationale |

In mavis these went through `mavis skill signal report` and
`mavis skill proposal report` CLIs, then a nightly `skill-evolve-nightly`
cron triaged the queue. In pi there is no such CLI and no nightly cron.
The pi-native equivalent is:

- **Signals** → append to a `SIGNALS.md` (or `SIGNALS/<id>.md`) at the repo
  root, or to `~/.pi/agent/skills/<name>/SIGNALS.md` for a per-skill file.
- **Proposals** → append to a `PROPOSALS.md` (or `PROPOSALS/<id>.md`) at
  the same locations.
- **Triage** → when you want to review the queue, do it manually (load
  the `skill-evolve-nightly` skill for the decision rubric, or use the
  `team` tool to dispatch a triage plan).

You don't author SKILL.md here — `skill-creator` / `skill-refiner` do that.

---

## When to use which channel

### Signal — file when ANY of these are true

- A loaded skill gave you wrong / outdated / contradictory / incomplete instructions
- A loaded skill's trigger conditions are too broad (firing when it shouldn't) or too narrow (not firing when it should)
- You wanted to do something but no skill covers the scenario (`issueKind=missing-skill`)
- A real skill defect that doesn't fit the categories above (`issueKind=other`)

### Proposal — file when ALL are true

- A clearly reusable working **pattern** emerged in this session
- No existing skill covers it
- The pattern repeats / will repeat (not a one-off task)
- You can summarize what the proposed skill would do in 1-2 sentences

If only some of the proposal conditions hold (especially "will repeat"),
**don't propose**. Submitting weak proposals wastes the next manual triage
and pollutes the skill catalog.

### When to use neither

- You failed to follow correct skill instructions → that's an agent error, NOT a skill issue
- The task was simply complex but no instruction was wrong → don't signal/propose
- You felt uncertain but the skill ultimately worked → don't signal/propose

---

## Where to write

| Scope | File | When to use |
| --- | --- | --- |
| Per-skill | `~/.pi/agent/skills/<name>/SIGNALS.md` (append) | one specific skill is the issue |
| Per-skill | `~/.pi/agent/skills/<name>/PROPOSALS.md` (append) | one specific skill area needs a new sibling |
| Per-repo | `<repo>/SIGNALS.md` (append) | the issue is about a project-local skill at `<repo>/.pi/skills/...` |
| Per-repo | `<repo>/PROPOSALS.md` (append) | the new skill belongs at `<repo>/.pi/skills/...` |
| Cross-cutting | `<repo>/SIGNALS.md` (append) | the issue spans multiple skills or is repo-wide |

If you don't have a `SIGNALS.md` / `PROPOSALS.md` yet, create one at the
relevant path. Pick the per-skill file if there's exactly one skill
involved; pick the per-repo file otherwise.

---

## File format

### Signal

```markdown
### signal-<id>            # e.g. signal-2026-06-03-001 or just signal-001
- skill: <skill-name>     # the skill this is about
- kind: outdated | wrong-triggers | missing-skill | other
- attribution: environment_change | skill_defect | agent_error (do NOT use agent_error for signals)
- evidence: "<short concrete quote or trace>"
- rationale: "<why this matters>"
- reported_by: <session-id>
- reported_at: <YYYY-MM-DD>
- verdict: pending | resolved | dismissed | acted
- resolution: ""
```

### Proposal

```markdown
### proposal-<id>
- suggested_name: <kebab-case>
- suggested_scope: user | project
- target_skill: ""                      # if scope=user, leave blank
- summary: "<1-2 sentence description>"
- rationale: "<why this would be reused>"
- sketch: "<high-level outline, optional>"
- evidence:
  - "<short concrete quote or trace 1>"
  - "<short concrete quote or trace 2>"
- reported_by: <session-id>
- reported_at: <YYYY-MM-DD>
- verdict: pending | resolved | dismissed | acted
- resolution: ""
```

The schema is markdown + YAML-ish frontmatter, not a strict YAML file.
This is intentional — humans and LLMs both append cleanly.

---

## How to read the references

| Topic | Reference |
|-------|-----------|
| Full signal field rubric, issueKind/attribution decision table, examples of valid/invalid signals | [references/signal-rubric.md](references/signal-rubric.md) |
| Full proposal schema, scope decision tree, good/bad proposal examples | [references/proposal-rubric.md](references/proposal-rubric.md) |
| Manual triage procedure (the old nightly pipeline) | [skill-evolve-nightly](../skill-evolve-nightly/SKILL.md) |
| Writing a new skill from a proposal | [skill-creator](../skill-creator/SKILL.md) |
| Patching an existing skill from a signal | [skill-refiner](../skill-refiner/SKILL.md) |

Load the reference matching what you're about to do — don't read all of them at once.

---

## Hard rules

1. **Don't include suggested fixes in signals.** Evidence + rationale only.
   The fix is decided later by the skill-refiner workflow.
2. **Don't include full SKILL.md drafts in proposals.** A `sketch` (high-level outline)
   is OK and encouraged. Full drafting is `skill-creator`'s job.
3. **One-off ≠ proposal.** "I did a complex task once" is not enough.
   "This pattern will repeat" must be defensible.
4. **Quote actual conversation in `evidence` / `evidence`.** Not summaries.
   ≤ 200 chars per signal evidence; ≤ 300 chars per proposal evidence (max 3 entries).
5. **`attribution=agent_error` is NEVER a valid signal channel.** If the issue
   was your own mistake, don't file. Just adjust your behavior.
6. **Append, don't overwrite.** Use the `edit` tool with a unique `oldText`
   anchor (the last existing entry) and append the new entry below.
7. **One file per scope.** If you have a per-skill `SIGNALS.md` AND a
   per-repo `SIGNALS.md`, write the per-skill one only when the issue
   is purely about that skill; otherwise the per-repo one.

---

## What this skill is NOT for

- `mavis skill signal report` / `mavis skill proposal report` CLIs — these do not exist in pi
- A daemon / cron that processes the queue automatically — pi has no daemon
- Authoring SKILL.md from a signal/proposal — load `skill-refiner` or `skill-creator`
- Triage of pending signals/proposals — load `skill-evolve-nightly` and run it manually (or dispatch via the `team` tool)
