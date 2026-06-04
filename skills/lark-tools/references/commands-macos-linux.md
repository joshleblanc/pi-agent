# lark-tools commands — macOS / Linux

Shell: bash or zsh. Use these recipes only on `darwin` / `linux`.

Do not use PowerShell syntax: no `Get-Command`, no `ConvertFrom-Json`, no `Invoke-RestMethod`. Prefer POSIX tools and `jq` for JSON parsing.

## install-lark-cli

```bash
if ! command -v lark-cli >/dev/null 2>&1; then
  echo "lark-cli not found, installing @larksuite/cli globally..."
  npm install -g @larksuite/cli
fi
lark-cli --version    # confirm install succeeded
```

If the install fails because of permissions, prefer a per-user prefix over running `sudo npm install -g` without telling the user first.

## bot-status

```bash
lark-cli auth status | jq '{appId, identity, userOpenId, userName, tokenStatus, scope}'
```

## auth-status

```bash
lark-cli auth status | jq '{appId, identity, userOpenId, userName, tokenStatus, scope, expiresAt}'
```

## one-time user setup (replaces daemon onboard)

In pi there is no `/api/lark/onboard/*` HTTP endpoint. The user runs these three commands themselves:

```bash
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

```bash
status=$(lark-cli auth status --verify | jq -r '.tokenStatus')
if [ "$status" != "valid" ]; then
  echo "Auth not valid; have the user run: lark-cli auth login --recommend"
  return 1 2>/dev/null || exit 1
fi
```

## send a message (worked example)

```bash
chat=$(lark-cli im +chat-search --as user --query "<name>" --format json | jq -r '.items[0].chat_id')
lark-cli im +messages-send --as bot --chat-id "$chat" --markdown "Hello from pi"
```

## read the lark-shared cross-cutter before any sub-skill

```bash
shared="$(dirname "$(readlink -f "$0")")/../cli-skills/lark-shared/SKILL.md"
cat "$shared"
```

## per-OS storage paths

See `references/storage-paths.md` for the per-OS table of where the `~/.lark-cli/` store actually lives.
