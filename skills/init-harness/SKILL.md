---
name: init-harness
description: "Bootstrap a project-team definition. In mavis this writes `.harness/reins/<name>/agent.md` files. In pi there is NO `.harness/` concept — pi has no project-team scaffolding, no per-repo agent directory, and no rein model. Use the `team` tool with a plan YAML at the repo root instead. Load this skill ONLY when the user explicitly says 'init harness', 'bootstrap .harness', or 'scaffold project team' — and explain why the answer is 'use a team plan file'."
---

# Init harness (pi)

The mavis `init-harness` skill scaffolds `<repo>/.harness/reins/<name>/agent.md` plus a top-level `<repo>/.harness/agent.md` orchestrator file. The mavis daemon then loads these as a project team.

**Pi does not have this concept.** There is no `.harness/`, no per-repo agent directory, no project-team scaffolding. The team plan engine is global (lives in `~/.pi/team/plans/`), and the agents it dispatches to are loaded from `~/.pi/agent/extensions/team-agent/*.md` regardless of which repo you are in.

## What to do instead

For a project that needs multi-agent orchestration, write a **team plan YAML** at the repo root (or anywhere reachable) and run it via the `team` tool.

```bash
# 1. Write a plan file
$EDITOR /path/to/repo/.pi/team-plan.yaml
```

```yaml
# .pi/team-plan.yaml — example
version: 1
plan:
  name: <user-facing project name>
  max_concurrency: 3
  max_concurrency: 3
  max_cycles: 10
  auto_accept: false
  verifier_config:
    default_verifiers: [verifier]
tasks:
  - id: backend
    title: User profile API
    prompt: Implement user profile CRUD API with JWT auth.
    assigned_to: worker
    verified_by: verifier
    verify_prompt: Re-run the test suite and verify auth works.
    timeout_ms: 1800000

  - id: frontend
    title: Profile edit form
    prompt: Add profile edit form component, wire to backend.
    assigned_to: worker
    depends_on: [backend]
    verified_by: verifier
    verify_prompt: Test UI flow end-to-end.
```

```bash
# 2. Run it
# Inside a pi session:
team { plan_file: "/path/to/repo/.pi/team-plan.yaml" }
```

That is the entire bootstrap. No `.harness/`, no agent.md files, no project rein model.

## When you might still want this skill

If the user explicitly asks to "init harness" or "create a `.harness/` directory", they are probably:

1. **Carrying mavis muscle memory** — point them to the team plan approach above.
2. **Following an mavis-era project template** — write the `.harness/` files manually if they insist (they will just be inert markdown in pi).
3. **Confused about what pi supports** — load the `mavis` skill (the renamed `pi-runtime` meta-skill in this skills folder) and walk them through its team-tooling section (see the `team` doc inside that skill's references folder).

## If you must produce `.harness/` files anyway

The mavis-era schema (for documentation / migration purposes only) is:

```
<repo>/.harness/
├── agent.md                  # orchestrator (Harness)
├── reins/
│   ├── developer/agent.md
│   ├── tester/agent.md
│   └── <specialist>/agent.md
├── docs/                     # project standards
├── hooks/                    # project-wide tool gates
├── crons/                    # project-wide scheduled tasks
└── memory/MEMORY.md          # shared team memory
```

Write these as plain markdown if the user wants them for documentation. None of them will be loaded by pi; they are inert.

For the `agent.md` body schema, load the `create-agent` skill in this folder (it covers both the pi-native path and the legacy mavis schema).

## Bootstrap procedure (pi-native)

For a project that needs multi-agent work, the bootstrap is:

1. **Identify the workspace** — single repo, monorepo, or multi-repo (each gets its own plan or shared plan).
2. **Inspect the codebase** — read manifests, top-level dirs, CI, recent activity.
3. **Decide the team** — pick from `lead` (legacy mode), `worker` (default), `verifier` (review), and any custom roles you've added via the `create-agent` skill.
4. **Write the plan file** — at the repo root, e.g. `.pi/team-plan.yaml`. Follow the `mavis-format` YAML the team-agent extension accepts.
5. **Run the plan** — `team { plan_file: ".pi/team-plan.yaml" }`.
6. **Tell the user** — path to the plan file, the roster (one-liner per role), and that they can grow it later by editing the YAML or adding custom roles via `create-agent`.

## Multi-repo handling

If the workspace is a parent directory with multiple git repos, you have two options:

- **One plan per repo** — write a `.pi/team-plan.yaml` in each repo and run them in sequence (or in parallel across sessions).
- **One plan with paths** — a single plan whose task prompts explicitly name the target repo. Less clean; only use when the work is genuinely cross-repo.

There is no parent-level `.harness/` that knows about all the children.

## Guardrails

- Do not invent `.harness/` semantics that pi doesn't have. The team plan engine is the only team-orchestration mechanism in pi.
- Keep the plan YAML small and re-runnable. Plans are data, not state.
- If the user insists on a `.harness/` directory, write the files (per the schema above) and tell them pi will ignore them — they are documentation only.

## Hard rule

If you find yourself about to write `<repo>/.harness/reins/<name>/agent.md` because "that's what mavis did", stop. Write a team plan YAML instead. The team-agent extension in pi will not load `.harness/` files — they will be inert, the team plan engine is the only path that runs.
