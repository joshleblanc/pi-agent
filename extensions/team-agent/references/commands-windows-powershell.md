# Mavis Team Commands — Windows PowerShell

Shell: Windows PowerShell 5.1+ or PowerShell 7+. Use these recipes only on `win32`.

Do not use bash syntax in PowerShell: no `mkdir -p`, no `cat <<EOF`, no `$PWD/path`, no `/tmp`, and no `.sh` scripts. Prefer PowerShell cmdlets and `Join-Path`.

## list-agents

```powershell
mavis agent list --project "$($PWD.Path)"
```

## list-peers

```powershell
mavis communication peers
```

## launch-a-plan

Write the plan YAML with a single-quoted here-string, then launch it. Keep the YAML strings in the user's language.

```powershell
$planDir = Join-Path $PWD.Path ".mavis\plans"
New-Item -ItemType Directory -Force -Path $planDir | Out-Null

$planPath = Join-Path $planDir "plan.yaml"

@'
<plan yaml>
'@ | Set-Content -Path $planPath -Encoding UTF8

mavis team plan run "$planPath"
```

Use `--no-wait` only when you intentionally want fire-and-forget behavior:

```powershell
mavis team plan run "$planPath" --no-wait
```

## inspect-plan-status

```powershell
mavis team plan status <plan_id> --human
```

## inspect-session-messages

```powershell
mavis session messages <session_id> --limit 3
```

## steer-a-running-plan

```powershell
mavis team plan steer <plan_id> --message "<correction>"
```

## extend-task-timeout

```powershell
mavis team plan extend-timeout <plan_id> <task-id> --minutes 15
```

## unblock-task

```powershell
mavis team plan unblock <plan_id> <task-id>
```

## submit-a-decision

Write the decision JSON with a single-quoted here-string, then submit it.

```powershell
$decisionDir = Join-Path $PWD.Path ".mavis\plans"
New-Item -ItemType Directory -Force -Path $decisionDir | Out-Null

$decisionPath = Join-Path $decisionDir "decision.json"

@'
{
  "last_cycle": [],
  "next_cycle": [],
  "plan_complete": false
}
'@ | Set-Content -Path $decisionPath -Encoding UTF8

mavis team plan decision <plan_id> --file "$decisionPath"
```

## cancel-plan

```powershell
mavis team plan cancel <plan_id>
```

## Safety notes

- Do not add cleanup snippets with `Remove-Item`; cleanup is not required for launching or deciding plans.
- If cleanup is truly needed, use a recoverable trash flow or move files to a backup location instead of deleting them.
- Use `py` or `python` for Python scripts on Windows; do not assume `python3` exists.
