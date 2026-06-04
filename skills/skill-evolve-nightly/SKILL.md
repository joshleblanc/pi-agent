---
name: skill-evolve-nightly
description: "Nightly batch skill maintenance. In mavis this runs automatically via the daemon's internal scheduler at 02:00 Asia/Shanghai. In pi there is NO daemon, no internal scheduler, and no `mavis skill signal list` CLI. To get the equivalent loop, schedule an OS-level task that runs `pi -p` with the prompt body of this skill — OR run the loop manually when you want to triage signals. Load this skill when the user says 'triage pending skill signals', 'run the nightly skill maintenance', or wants to review a SIGNAL.md file at the repo root."
---

# Skill evolve nightly (pi)

The mavis nightly skill maintenance does not exist in pi. pi has:

- no daemon (no scheduler)
- no `mavis skill signal list` / `mavis skill proposal list` CLI
- no built-in `purpose=skill-evolve` session kind
- no automatic signal → proposal → MR → merge pipeline

The closest you can get is:

1. **Manual triage** — open a `SIGNALS.md` (or similar) at the repo root, walk the list, dispatch `skill-refiner` or `skill-creator` via a team plan.
2. **OS-level scheduled task** — `schtasks` on Windows, `cron` on Unix, running `pi -p "..."` with the prompt body below.

There is no in-process scheduling. There is no daemon to run it automatically.

## Why this skill still exists

It captures the **decision logic** for triaging signals and proposals, even though the runtime trigger is gone. Load this skill when you are about to triage a list of skill issues — the rules below are still useful, even when invoked manually.

## Capability hint (legacy)

The mavis daemon used to inject a `<skill-evolve-capability>` block before this skill body. In pi there is no such injection. Assume:

- `builtinMrEnabled: false` — there is no built-in MR pipeline in pi
- `sourceRepo: null` — there is no canonical skill source repo
- `mrTargetBranch: null` — n/a

So all built-in skill signals get **dismissed with reason** `built-in skill, requires manual editing` (or, if you have a custom MR workflow, swap in your own pipeline).

## Procedure (manual or via OS scheduler)

### Phase 1: Gather signals

In pi there is no CLI. Use a `SIGNALS.md` file at the repo root, or read the `~/.pi/agent/skills/*/SIGNALS.md` if a per-skill file convention has been adopted.

```
# SIGNALS.md (one per repo, or per skill)

## Pending

### signal-001
- skill: skill-name
- kind: outdated
- evidence: "the procedure says to use `mavis mcp add`, but mavis is gone"
- attribution: environment_change
- rationale: skill was written for mavis; port to pi-native operations
```

If you don't have a SIGNALS.md yet, create one. The triage procedure below still works.

### Phase 1b: Gather proposals

Same pattern. Use a `PROPOSALS.md` file.

### Phase 3: Self-loop guard

Filter out signals produced by previous `skill-evolve` sessions (look for `purpose: skill-evolve` in the entry, or just trust the human-supplied list).

### Phase 4: Triage each signal

For each signal, decide:

| Condition | Action |
| --- | --- |
| Evidence is concrete and points to a skill defect | Plan a **refine** task |
| Evidence describes a missing capability with clear use case | Plan a **create** task |
| Evidence is vague, anecdotal, or single-occurrence | **Dismiss** (`reason: insufficient evidence`) |
| Problem is agent behavior, not skill content | **Dismiss** (`reason: agent error, not skill issue`) |
| Signal targets a built-in skill | **Dismiss** (`reason: built-in skill, requires manual editing`) — or, if you have a custom MR flow, use it |

"Built-in skill" in pi: any skill under `~/.pi/agent/skills/<builtin-name>/`. There is no MR pipeline by default; to update a built-in, copy it to a user skill first.

### Phase 4b: Triage each proposal

For each proposal, decide:

| Condition | Action |
| --- | --- |
| `suggestedName` overlaps an existing skill | **Dismiss** (`reason: overlaps existing skill <name>`) |
| Single-occurrence, anecdotal | **Dismiss** (`reason: insufficient evidence — pattern not yet repeated`) |
| `summary`/`rationale` too vague | **Dismiss** (`reason: proposal too vague`) |
| Concrete pattern, no overlap | Plan a **create** task |

### Phase 6: Determine scope for new skills

| Question | Answer → scope |
| --- | --- |
| Will the answer change for a different user? | user scope (skill under `~/.pi/agent/skills/<name>/`) |
| Only relevant to the current project? | project scope (skill under `<repo>/.pi/skills/<name>/`) |
| Cross-project? | user scope (most common default) |

There is no agent scope in pi.

### Phase 7: Execute via team

If there are tasks to execute, dispatch them as a team plan via the `team` tool. Each task loads `skill-creator` or `skill-refiner`.

```yaml
version: 1
plan:
  name: Skill evolve triage <date>
  max_concurrency: 3
  max_cycles: 5
  auto_accept: false
  verifier_config:
    default_verifiers: [verifier]
tasks:
  - id: refine-skill-name
    title: Refine skill-name: <problem summary>
    prompt: |
      Load skill-refiner. Fix this skill:
      Skill: <skill-name>
      Problem: <evidence>
      Attribution: <attribution>
      Rationale: <rationale>
    assigned_to: worker
    verified_by: verifier
    verify_prompt: Re-derive the patch — verify it actually addresses the evidence.

  - id: create-new-skill
    title: Create new skill: <name>
    prompt: |
      Load skill-creator. Create a new skill:
      Goal: <derived from signal>
      Scope: <user|project>
      Context: <evidence>
    assigned_to: worker
    verified_by: verifier
    verify_prompt: Verify the new skill loads, the description is concrete, and the body addresses the gap.
```

If the team plan engine is unavailable (you are not in a session that can dispatch), execute the tasks sequentially using subagents (or just do them yourself).

### Phase 8: Collect results

After the plan completes, update the `SIGNALS.md` / `PROPOSALS.md` entries with verdicts:

```
### signal-001
- verdict: resolved      # or: pending, dismissed, acted
- resolution: <link to the resulting MR / file change>
- resolver: <your session id>
- resolved_at: <date>
```

There is no IM notification channel. If you want the user to know, post the summary in chat.

## OS-level scheduled invocation (Windows)

```powershell
$Action = New-ScheduledTaskAction -Execute "pi" -Argument '-p "Load the skill-evolve-nightly skill and triage the SIGNALS.md at C:\path\to\repo\SIGNALS.md"'
$Trigger = New-ScheduledTaskTrigger -Daily -At "02:00"
Register-ScheduledTask -TaskName "pi-skill-evolve" -Action $Action -Trigger $Trigger
```

## OS-level scheduled invocation (Unix)

```
# crontab -e
0 2 * * * /usr/local/bin/pi -p "Load the skill-evolve-nightly skill and triage ~/repo/SIGNALS.md" >> ~/pi-skill-evolve.log 2>&1
```

## Hard constraints

- No daemon, no in-process scheduler — you must trigger externally
- No built-in MR pipeline — manual editing or your own git workflow
- One pass per run — do not re-run if the schedule fires twice in the window
- No IM notification — post the summary in chat or write to a file

## What this skill is NOT for

- In-process scheduling of skill maintenance — not possible in pi
- Auto-merging of skill changes — pi has no MR pipeline; require human review
- Silent background work — every run is explicit; the user must opt in

## Migration from mavis

If you have an existing mavis setup with `skill-evolve-nightly` running automatically:

1. Cancel the mavis cron (via the mavis daemon — not in pi).
2. Adopt one of the two patterns above (manual triage, or OS-level scheduled `pi -p`).
3. Move your existing `SIGNALS.md` / `PROPOSALS.md` to the repo root or `~/.pi/agent/skills/<name>/SIGNALS.md` as you prefer.
4. Tell the user the nightly loop is now manual or OS-scheduled.
