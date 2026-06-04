# lark-tools commands — Windows PowerShell

Shell: Windows PowerShell 5.1+ or PowerShell 7+. Use these recipes only on `win32`.

Do not use bash syntax in PowerShell: no `command -v`, no `cat`, no `sed`, no `jq` pipelines, no `2>/dev/null`. Prefer PowerShell cmdlets, `Join-Path`, and `ConvertFrom-Json`.

## install-lark-cli

```powershell
if (-not (Get-Command lark-cli -ErrorAction SilentlyContinue)) {
  Write-Host "lark-cli not found, installing @larksuite/cli globally..."
  npm install -g @larksuite/cli
}
lark-cli --version    # confirm install succeeded
```

If the install fails because of permissions, prefer a per-user prefix over running PowerShell as Administrator without telling the user first.

## bot-status

```powershell
$Status = (lark-cli auth status 2>$null) | ConvertFrom-Json
$Status | Select-Object appId, identity, userOpenId, userName, tokenStatus, scope
```

## auth-status

```powershell
$Status = (lark-cli auth status 2>$null) | ConvertFrom-Json
$Status | Select-Object appId, identity, userOpenId, userName, tokenStatus, scope, expiresAt
```

## one-time user setup (replaces daemon onboard)

In pi there is no `/api/lark/onboard/*` HTTP endpoint. The user runs these three commands themselves:

```powershell
# Step 1 — install (if not already)
npm install -g @larksuite/cli

# Step 2 — initialize the global config store
lark-cli config init

# Step 3 — run the recommended-scope OAuth
lark-cli auth login --recommend
```

After these three, the global store at `~/.lark-cli/` has the app credentials and a UAT covering the recommended scope set. All `lark-cli api ...` / `lark-cli calendar +agenda` / `lark-cli im +messages-send` calls work without any further setup.

If a later call needs a scope outside the recommended set, `lark-cli` itself prints the exact `lark-cli auth login --scope "..."` invocation. Rerun with that suggestion — never use `--domain` (per-domain auth forces the user through a separate window for every module).

## verify auth before a call

```powershell
$Status = (lark-cli auth status --verify 2>$null) | ConvertFrom-Json
if ($Status.tokenStatus -ne "valid") {
  Write-Host "Auth not valid; have the user run: lark-cli auth login --recommend"
  return
}
```

## send a message (worked example)

```powershell
$Chat = (lark-cli im +chat-search --as user --query "<name>" --format json | ConvertFrom-Json).items[0].chat_id
lark-cli im +messages-send --as bot --chat-id $Chat --markdown "Hello from pi"
```

## read the lark-shared cross-cutter before any sub-skill

```powershell
$Shared = Join-Path (Split-Path $PSCommandPath -Parent) "..\cli-skills\lark-shared\SKILL.md"
Get-Content $Shared
```

## per-OS storage paths

See `references/storage-paths.md` for the per-OS table of where the `~/.lark-cli/` store actually lives.
