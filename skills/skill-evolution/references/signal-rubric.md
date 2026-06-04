# Signal Rubric — full schema and decision tables

> Load this when you're about to append a signal to a `SIGNALS.md` file (pi) — or call
> `mavis skill signal report` (mavis legacy). The schema and decision logic are the
> same in both. Pre-load
> [SKILL.md](../SKILL.md) for the high-level when-to-use rules.

## Schema

```
mavis skill signal report \
  --skill <skillRef>                                # required except for missing-skill
  --issue-kind outdated|contradiction|missing-step|wrong-trigger|missing-skill|other  # required
  --attribution skill_issue|missing_skill|environment|user_preference|unknown        # optional but strongly recommended
  --evidence "<excerpt from this conversation, ≤200 chars>"                          # required
  --rationale "<one or two sentences explaining why this is a skill problem>"        # optional but recommended
```

`--skill` formats:
- `global:<name>` — daemon-bundled skill
- `user-global:<name>` — user-global skill
- `agent:<agentName>/<name>` — agent-specific skill
- `project-main:<name>` — project-level skill

## issueKind decision table

| Symptom | Issue kind |
|---------|------------|
| Skill references deprecated APIs / old workflows / stale info | `outdated` |
| Skill contradicts itself OR conflicts with another loaded skill | `contradiction` |
| Skill omits a critical step that caused failure or detour | `missing-step` |
| Skill fired when it shouldn't have OR didn't fire when it should | `wrong-trigger` |
| No existing skill covers this scenario (you needed one but couldn't find it) | `missing-skill` (omit `--skill`) |
| Real defect that doesn't fit any of the above | `other` |

If multiple kinds apply, pick the most specific. Prefer `outdated` over `other`,
`missing-step` over `outdated` when the issue is genuinely a missing step
in otherwise-current text.

## attribution rubric

Tells the nightly triage WHY this issue exists, so it can dismiss agent-side
problems and focus on real skill defects.

| Attribution | Meaning |
|-------------|---------|
| `skill_issue` | The skill text itself is wrong / outdated / incomplete |
| `missing_skill` | No skill exists for the needed scenario (typically paired with `issueKind=missing-skill`) |
| `environment` | External tooling / API / system caused the failure (skill text is fine) |
| `user_preference` | User wants behavior conflicting with current skill design |
| `unknown` | Can't determine root cause |

> **`agent_error` is NOT a valid attribution.** If the agent failed despite
> correct instructions, **don't file the signal at all** — that's not a
> skill defect. The CLI will reject `--attribution agent_error` because
> filing it just creates noise the nightly cron has to dismiss anyway.

## Good signal examples

### Good: missing-step

```bash
mavis skill signal report \
  --skill global:gitlab-mr-review \
  --issue-kind missing-step \
  --attribution skill_issue \
  --evidence "I tried to merge after pipeline=success but the gate said 'no human confirmation' and rejected. Skill says 'wait for CI green' but doesn't mention the second human-confirmation gate." \
  --rationale "The skill's success criteria are incomplete — pipeline-green alone doesn't unlock merge; an explicit 'await human confirmation' step is missing."
```

Why this is good:
- evidence quotes the actual transcript line
- rationale explains the gap, not the fix
- attribution=skill_issue is honest (skill text really is missing the step)

### Good: missing-skill

```bash
mavis skill signal report \
  --issue-kind missing-skill \
  --attribution missing_skill \
  --evidence "I needed to render an architecture diagram to send to user, looked through skills/, found none. Used ad-hoc mermaid in chat instead." \
  --rationale "Architecture-diagram rendering is a recurring need (this is the third session today). No global or user-global skill covers it."
```

Why this is good:
- `--skill` is correctly omitted (it's missing-skill)
- evidence shows the agent actually looked
- rationale references frequency (real demand, not hypothetical)

## Bad signal examples (do NOT file these)

### Bad: agent forgot to load the skill

```
evidence: "I didn't read the skill description and tried wrong commands first."
```

This is an agent error. Don't file. Read the skill next time.

### Bad: pure preference without evidence

```
evidence: "The skill is a bit verbose, could be shorter."
```

No defect. Don't file.

### Bad: contains a fix prescription

```
rationale: "Should add 'use --target-branch dev' as step 5 between current step 4 and 6."
```

The rationale should explain the **problem**, not dictate the **fix**.
The skill-refiner workflow chooses the fix. Filing a fix-shaped rationale
biases the refiner.

### Bad: vague evidence

```
evidence: "Things didn't work as expected."
```

Useless. Quote the specific transcript line.

## Field length limits

- `evidenceExcerpt`: max 500 chars (CLI), nightly LLM operates on ≤200 chars
- `rationale`: max 1000 chars
