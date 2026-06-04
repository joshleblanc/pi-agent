# Team plan engine in pi

The `team-agent` extension ships a port of the mavis team plan engine. Plans written in mavis YAML format run unchanged.

## Tools (single entry point: `team`)

| Tool | Purpose |
| --- | --- |
| `team { plan_file: "..." }` | Run a plan. Supports inline `plan` (YAML string) or `plan_file` (path). |
| `team { decision: "..." }` / `team { decision_file: "..." }` | Submit an owner decision. |
| `team { steer: "..." }` | Steer all running tasks in the most recent plan. |
| `team_status { plan_id, human }` | Inspect a plan (defaults to most recent). |
| `team_decision { plan_id, decision }` | Submit owner decision. |
| `team_steer { plan_id, message }` | Steer running tasks. |
| `team_control { plan_id, task_id, minutes }` | Extend timeout / unblock / cancel. |

Slash commands: `/team:status [id]`, `/team:list`, `/team:decision <id>`, `/team:cancel <id>`, `/team:steer <id> <msg>`, `/team:unblock <id> <task>`, `/team:extend <id> <task> <min>`, `/team:example`, `/team:help`.

## Plan format (mavis-compatible)

```yaml
version: 1
plan:
  name: <user-facing name>
  max_concurrency: 3
  max_consecutive_failures: 2
  max_cycles: 10
  auto_accept: false                # require owner decision between cycles
  auto_reject_retries: 1
  verifier_config:
    default_verifiers: [verifier]
tasks:
  - id: <kebab-id>
    title: <short display title>
    prompt: <self-contained work spec>
    assigned_to: <agent-name>       # lead | worker | verifier (built-ins)
    verified_by: <agent-name>       # omit for verify-as-task
    verify_prompt: <re-derive instruction>
    depends_on: [<other-id>]
    timeout_ms: 1800000
    max_retries: 2
    role: produce                   # or "verify-as-task"
```

## State directory

`~/.pi/team/plans/<plan_id>/`:

| File | Purpose |
| --- | --- |
| `plan.yaml` | Verbatim copy of the plan. |
| `state.json` | Live state machine. |
| `board.md` | Human-readable timeline (append-only). |
| `scratchpad/root.md` | Plan-wide notes. |
| `scratchpad/<task-id>.md` | Per-task notes. |
| `outputs/<task-id>/deliverable.md` | Per-task deliverable. |

Override with `$PI_TEAM_STATE_DIR`.

## Built-in agents

| Name | Role |
| --- | --- |
| `lead` | Plan decomposition (legacy free-form mode). |
| `worker` | General-purpose implementer. |
| `verifier` | Adversarial reviewer; emits `APPROVED` / `APPROVED WITH CHANGES` / `NEEDS WORK` verdicts. |

These three are loaded from `~/.pi/agent/extensions/team-agent/{lead,worker,verifier}.md`. There is no way to add a fourth built-in without editing the extension. If you need a custom role, change `assigned_to: <name>` to a custom name and **also** drop an `agent.md` at `~/.pi/agent/extensions/team-agent/<name>.md` — the loader will pick it up on next session. (This is a known gap; the extension currently hardcodes the three names. See extension `index.ts` → `loadBuiltInAgents()`.)

## Decision verdicts

| Verdict | Effect |
| --- | --- |
| `accept` | Task done. Mark complete. |
| `reject` | Verifier failed → retry same task in same session. |
| `manual_retry` | Wrong approach → retry with correction in `reason`. |
| `override_accept` | Verifier wrong → accept anyway. |

Same `task_id` retries reuse the existing session. New `task_id` = cold start (3–5 min wasted on setup). Don't burn a new id on a "missing changelog" fix.

## Inspecting a running plan

```bash
ls ~/.pi/team/plans                          # all plan ids (most recent last)
ls ~/.pi/team/plans/<plan_id>/outputs        # per-task deliverables
tail -f ~/.pi/team/plans/<plan_id>/board.md  # human timeline
```

## Failure recovery

| Symptom | Fix |
| --- | --- |
| Worker hung >5 min | `team_steer` with a redirect, or `team_control` to extend |
| Worker approaching 30-min cap | `team_control` with `task_id` and `minutes` to extend |
| Wrong direction mid-cycle | `team_steer` running work, else adjust `next_cycle` in the decision |
| Plan stuck "awaiting decision" | submit decision via `team_decision` or `team` with `decision` |
| Plan won't make progress | `/team:cancel <id>` |

There is no daemon-driven retry or webhook. The engine runs synchronously in the spawning session.
