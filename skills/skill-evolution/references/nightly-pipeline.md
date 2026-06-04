# Nightly Pipeline — what happens after you submit

> What `skill-evolve-nightly` does with your signal or proposal. Read this
> when you want to understand the lifecycle of what you submit.

## High-level flow

```
You submit a signal or proposal
    │
    ▼ (stays as verdict='pending')
Persisted in <dataDir>/evolve/{signals,proposals}/<id>.json
    │
    ▼
02:00 Asia/Shanghai daily — InternalScheduler fires `skill-evolve-nightly`
    │
    ▼
Primary agent spawns a NEW session, loads the SKILL.md prompt
    │
    ▼
Phase 1:  list pending signals    (in pi: `grep "verdict: pending" <files>`; in mavis: `mavis skill signal list --verdict pending`)
Phase 1b: list pending proposals  (in pi: `grep "verdict: pending" <files>`; in mavis: `mavis skill proposal list --verdict pending`)
Phase 2:  pull skill usage metrics
Phase 3:  filter out self-referential signals (sessions tagged purpose=skill-evolve)
    │
    ▼
Phase 4: triage each item
    │
    ├── signal (real defect, not built-in)        → spawn worker to refine the skill
    ├── signal (missing-skill, not built-in)      → spawn worker to create new skill
    ├── signal (built-in skill, MR mode enabled)  → spawn MR worker against source repo
    ├── signal (built-in skill, MR mode disabled) → dismiss with reason
    ├── proposal (concrete + no overlap)          → spawn worker → skill-creator
    ├── proposal (overlaps existing)              → dismiss with overlap ref
    ├── proposal (anecdotal / one-off)            → dismiss
    └── any (insufficient evidence / agent error) → dismiss
    │
    ▼
Worker action (refiner / creator / MR worker)
    │
    ├── On success: marks signal/proposal as 'acted', records resulting skillRef
    └── On dismissal: marks 'dismissed' with a reason
```

## What this means for you

- **Nothing happens immediately after submission.** Your signal/proposal sits in
  pending state until 02:00. Don't expect skills to morph in the same session.
- **Your evidence/rationale matters.** The nightly LLM triage reads them
  verbatim. Vague text → dismissal. Quote actual transcript.
- **Bad submissions get dismissed silently.** The nightly cron is liberal
  with dismissals to keep the catalog clean. Don't take dismissals as failure;
  re-submit with better evidence if you still believe it's valid.
- **Built-in skills are special.** Signals targeting `global:*` skills only
  result in actual file edits when the daemon was started in a developer
  install with source repo access (and the `skillEvolveBuiltinMr` beta flag
  is on). Otherwise the signal is dismissed. This is by design — prod
  installs don't have a source repo to push MRs to.
- **Acted skills can be traced back.** When a proposal is acted, its
  `createdSkillRef` field links to the resulting skill. You can audit the
  full provenance via the matching `proposal-<id>` section in `PROPOSALS.md` (pi) or `mavis skill proposal info --proposal-id pro_xxx` (mavis).

## Self-loop guard

Sessions spawned BY skill-evolve-nightly are tagged `purpose=skill-evolve`.
Signals/proposals produced by these sessions are filtered out at Phase 3
to prevent feedback loops (the curator nagging itself).

## Cancel / amend

You can dismiss your own pending signal/proposal at any time:

```bash
mavis skill signal cancel --signal-id sig_xxx
mavis skill proposal cancel --proposal-id pro_xxx --reason "user retracted"
# pi equivalent: edit the entry in the file:
#   - verdict: dismissed
#   - resolution: "dismissed by <session-id> on <YYYY-MM-DD>: user retracted"
```

You **cannot** edit fields after submission — submit a new one if you want
to amend (and cancel the old one to avoid duplicates).

## Where things live on disk

```
<dataDir>/evolve/
├── signals/<sig_id>.json
└── proposals/<pro_id>.json
```

Each file is fully self-contained JSON. Safe to inspect via `cat` for
debugging.
