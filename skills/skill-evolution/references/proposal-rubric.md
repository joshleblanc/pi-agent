# Proposal Rubric — full schema and decision tables

> Load this when you're about to append a proposal to a `PROPOSALS.md` file (pi) — or call
> `mavis skill proposal report` (mavis legacy). The schema and decision logic are the
> same in both.
> Pre-load [SKILL.md](../SKILL.md) for the high-level when-to-use rules.

## Schema

```
mavis skill proposal report \
  --name <kebab-case-name>                                        # required
  --scope agent-self|agent|global|user-global|project-main        # required
  --summary "<one-line, ≤200 chars>"                              # required
  --rationale "<multi-paragraph, ≤4000 chars>"                    # required
  [--sketch "<high-level outline, ≤4000 chars>"]                  # optional but encouraged
  [--evidence "<excerpt 1>"] [--evidence "<excerpt 2>"] [--evidence "<excerpt 3>"]   # 0-3 entries, ≤300 chars each
  [--target-agent <agentName>]                                    # required when --scope agent
```

Identity is auto-injected by the running pi session into the `reported_by` field.
In the legacy mavis flow, the same identity came from `__MAVIS_PARENT_*` env vars; in
pi, use `ctx.sessionManager.getSessionId?.()` (or whatever session id the agent
runtime exposes) to populate `reported_by`.

## Scope decision tree

Start at **agent-self** by default. Widen only when you have specific reason.

```
Is the pattern likely useful to OTHER agents?
├── No  → agent-self            (most conservative, the default)
└── Yes
    ├── Useful only inside this user's installation? → user-global
    ├── Useful to a specific named agent (not self)? → agent (set --target-agent)
    ├── Tied to this project's structure / conventions? → project-main
    └── Generally useful, project-agnostic, would benefit shipping with daemon? → global
```

When in doubt, pick **agent-self**. The nightly review can widen scope if appropriate;
a too-wide proposal is more likely to get dismissed than a narrow one promoted.

## Name conventions

- kebab-case (lowercase, digits, hyphens). Validation regex: `^[a-z][a-z0-9-]*$`
- Action- or domain-oriented: `mr-handoff-checklist`, `architecture-diagram-render`
- AVOID generic words: not `helper`, `util`, `task`, `workflow`
- Length: ≤ 50 chars usually; max 200

## Sketch conventions (optional but encouraged)

A sketch is a high-level outline of what the SKILL.md should cover. **Not** a full draft.

Good sketch shape:

```
Should cover:
- Triggers: <when does this skill apply>
- Step 1: <action>
- Step 2: <action>
- Step 3: <action>
- Output format: <what does the agent return>
- Anti-patterns to warn against: <pitfalls>
```

Filling this lets nightly skill-creator write a better SKILL.md without
guessing your intent. Keep it concise — the goal is direction, not content.

## Good proposal examples

### Good: agent-self proposal with sketch

```bash
mavis skill proposal report \
  --name mr-handoff-confirmation \
  --scope agent-self \
  --summary "After CI + CR pass on a GitLab MR, request explicit human confirmation before merging" \
  --rationale "User has corrected me 3 times this week for auto-merging MRs after CR-pass. The pattern is consistent: pipeline green + CR pass != ready to merge. Need an explicit human gate. This will recur on every MR I open." \
  --sketch "Should cover:
- Trigger: any time my session has open MR in 'CR-pass' state
- Step 1: post DM to user asking for explicit go/no-go
- Step 2: wait for response (or give up after 24h via cron)
- Step 3: only then run merge command
- Anti-pattern: never auto-merge based on label/approval count alone" \
  --evidence "用户说: 不用合, 我看一下" \
  --evidence "(another session) 用户说: 你直接合了？我还没看呢"
```

Why good:
- Specific, recurring pattern ("3 times this week")
- Sketch lays out the structure clearly
- Evidence quotes actual user messages
- agent-self scope is honest — pattern is for THIS agent's habit

### Good: global proposal

```bash
mavis skill proposal report \
  --name architecture-diagram-render \
  --scope global \
  --summary "Render architecture diagrams via mermaid+playwright pipeline and attach to user response" \
  --rationale "Multiple sessions today needed to convey system architecture. Markdown lists are insufficient; users keep asking for visuals. Existing skills don't cover diagram rendering. Pattern is project-agnostic and likely useful to every Mavis agent." \
  --evidence "用户说: 能画个图吗，文字看不清" \
  --evidence "(later) 用户说: 这个流程能可视化下吗"
```

Why good:
- Multiple sessions = pattern is real
- global scope is justified (project-agnostic)
- No `--sketch` here — author may have low confidence in structure; that's OK

## Bad proposal examples (do NOT file these)

### Bad: one-off task

```
summary: "Resolve circular dependency in package X"
rationale: "Spent 2 hours figuring this out today, was hard."
```

One-off problem. Will not recur. Don't propose. Maybe write to memory instead.

### Bad: too generic

```
name: helper
summary: "A general-purpose helper skill"
rationale: "We need more skills for various tasks."
```

No specific pattern. Don't propose.

### Bad: overlaps existing skill

```
summary: "Send messages between sessions"
rationale: "I needed to coordinate with another session."
```

This already exists (e.g. as a builtin `mavis` skill or another skill you
overlooked). Check `ls ~/.pi/agent/skills/` and `<repo>/.pi/skills/` first.

### Bad: scope too wide unjustified

```
scope: global
rationale: "I think this might be useful to other agents."
```

Vague justification → nightly will dismiss or downgrade scope. Be specific
or pick agent-self.

### Bad: sketch is full SKILL.md

```
sketch: |
  ---
  name: foo
  description: |
    ...
  ---
  # Foo
  ...500 lines of content...
```

That's not a sketch, that's a full draft. Let `skill-creator` write the actual file.
A sketch is a 5-15 line outline.

## Hard caps (enforced by store)

- `evidenceExcerpts`: max 3 entries (extra ones are dropped, logged)
- each evidence excerpt: max 300 chars (truncated silently)
- `summary`: max 200 chars
- `rationale`: max 4000 chars
- `sketch`: max 4000 chars
