# Signal / Proposal commands (pi)

In mavis, signals and proposals were submitted via CLI:

```bash
mavis skill signal report --skill-ref <ref> --issue-kind <kind> ...
mavis skill proposal report --suggested-name <name> ...
mavis skill signal list / info / cancel
mavis skill proposal list / info / cancel / mark-acted
```

In pi there is no such CLI. The equivalent is **append-to-file** at the
locations listed in `SKILL.md`. The conceptual schemas in `signal-rubric.md`
and `proposal-rubric.md` are unchanged.

## File locations (recap)

| Scope | File |
| --- | --- |
| Per-skill | `~/.pi/agent/skills/<name>/SIGNALS.md` |
| Per-skill | `~/.pi/agent/skills/<name>/PROPOSALS.md` |
| Per-repo | `<repo>/SIGNALS.md` |
| Per-repo | `<repo>/PROPOSALS.md` |

If the file does not exist, create it with the frontmatter block from
the matching rubric. Then append your entry.

## File a signal

Use the `edit` tool to anchor on the last existing entry (or the frontmatter
if the file is new) and append a new entry:

```markdown
### signal-<id>
- skill: <skill-name>
- kind: outdated | wrong-triggers | missing-skill | other
- attribution: environment_change | skill_defect
- evidence: "<short concrete quote or trace>"
- rationale: "<why this matters>"
- reported_by: <session-id>
- reported_at: <YYYY-MM-DD>
- verdict: pending
- resolution: ""
```

For the full field rubric, see `signal-rubric.md`.

## File a proposal

Same pattern, but a proposal entry:

```markdown
### proposal-<id>
- suggested_name: <kebab-case>
- suggested_scope: user | project
- target_skill: ""
- summary: "<1-2 sentence description>"
- rationale: "<why this would be reused>"
- sketch: "<high-level outline, optional>"
- evidence:
  - "<short concrete quote or trace 1>"
  - "<short concrete quote or trace 2>"
- reported_by: <session-id>
- reported_at: <YYYY-MM-DD>
- verdict: pending
- resolution: ""
```

For the full field rubric, see `proposal-rubric.md`.

## List pending signals / proposals

There is no CLI. Use the file system:

```bash
# Pending signals across all known files
grep -r "verdict: pending" ~/.pi/agent/skills/*/SIGNALS.md
grep "verdict: pending" ./SIGNALS.md

# Same for proposals
grep -r "verdict: pending" ~/.pi/agent/skills/*/PROPOSALS.md
grep "verdict: pending" ./PROPOSALS.md
```

```powershell
Select-String -Path "$env:USERPROFILE\.pi\agent\skills\*\SIGNALS.md" -Pattern "verdict: pending"
Select-String -Path ".\SIGNALS.md" -Pattern "verdict: pending"
```

## Cancel a signal / proposal

Open the file and edit the entry:

```yaml
- verdict: dismissed
- resolution: "dismissed by <session-id> on <YYYY-MM-DD>: <reason>"
```

## Mark a proposal as acted

After `skill-creator` ships the new skill, update the entry:

```yaml
- verdict: acted
- resolution: "created <new-skill-ref>"
```

## Triage the queue

For the actual decision logic (which entries to refine, create, dismiss),
load `skill-evolve-nightly` and follow its procedure. In pi the procedure
runs **manually** (no daemon) or via the `team` tool with a dispatch plan.
