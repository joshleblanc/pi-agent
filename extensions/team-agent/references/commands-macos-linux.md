# Mavis Team Commands — macOS / Linux

Shell: bash or zsh. Use these recipes only on `darwin` / `linux` platforms.

Do not copy these snippets into Windows PowerShell. Windows has a separate reference: `commands-windows-powershell.md`.

## list-agents

```bash
mavis agent list --project "$PWD"
```

## list-peers

```bash
mavis communication peers
```

## launch-a-plan

Write the plan YAML with a quoted heredoc, then launch it. Keep the YAML strings in the user's language.

```bash
plan_dir="$PWD/.mavis/plans"
mkdir -p "$plan_dir"

plan_path="$plan_dir/plan.yaml"

cat > "$plan_path" <<'EOF'
<plan yaml>
EOF

mavis team plan run "$plan_path"
```

Use `--no-wait` only when you intentionally want fire-and-forget behavior:

```bash
mavis team plan run "$plan_path" --no-wait
```

## inspect-plan-status

```bash
mavis team plan status <plan_id> --human
```

## inspect-session-messages

```bash
mavis session messages <session_id> --limit 3
```

## steer-a-running-plan

```bash
mavis team plan steer <plan_id> --message "<correction>"
```

## extend-task-timeout

```bash
mavis team plan extend-timeout <plan_id> <task-id> --minutes 15
```

## unblock-task

```bash
mavis team plan unblock <plan_id> <task-id>
```

## submit-a-decision

Write the decision JSON with a quoted heredoc, then submit it.

```bash
decision_dir="$PWD/.mavis/plans"
mkdir -p "$decision_dir"

decision_path="$decision_dir/decision.json"

cat > "$decision_path" <<'EOF'
{
  "last_cycle": [],
  "next_cycle": [],
  "plan_complete": false
}
EOF

mavis team plan decision <plan_id> --file "$decision_path"
```

## cancel-plan

```bash
mavis team plan cancel <plan_id>
```
