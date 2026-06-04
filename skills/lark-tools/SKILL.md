---
name: lark-tools
description: "Feishu/Lark full-capability access via the official `lark-cli` (terminal). Use this skill whenever the user mentions anything related to Feishu or Lark: checking today's schedule, creating calendar events, viewing tasks, searching chats, sending messages, looking up contacts, querying/writing Bitable records, searching documents, or running any lark-cli subcommand. Also load on `lark-cli auth login` / 401 / LARK_USER_AUTH_REQUIRED errors. The mavis-era daemon onboard flow (app-registration via `/api/lark/onboard/*`) is gone in pi — the user runs `lark-cli` directly, including a one-time `lark-cli config init` and `lark-cli auth login --recommend`."
---

# Feishu / Lark Tools (pi)

Drive Feishu (Lark) operations by invoking the official `lark-cli` binary directly from the
terminal. Credentials live in the global `~/.lark-cli/` store. **There is no mavis-style daemon
proxy, no `/api/lark/onboard/*` HTTP endpoints, and no per-bot HOME** — the user runs
`lark-cli` themselves for setup, and the agent runs `lark-cli` for operations.

Everything in this skill assumes `lark-cli` is on `$PATH` and the global store is initialized.
If not, the **one-time setup** is the user's job:

1. `npm install -g @larksuite/cli`  (installs the `lark-cli` binary)
2. `lark-cli config init`           (creates `~/.lark-cli/` and prompts for an app)
3. `lark-cli auth login --recommend` (user OAuth with the recommended scope set)

After that, every operation below is a plain `lark-cli` invocation.

## Quick start

1. **Verify `lark-cli` is installed** — see [Install lark-cli](#install-lark-cli)
2. **Verify auth** — `lark-cli auth status` (the `auth-status` recipe below)
3. **Run lark-cli** — see [Calling lark-cli](#calling-lark-cli) and the per-domain sub-skills

## Install lark-cli

`lark-cli` is the official Feishu/Lark CLI binary. It is **not** bundled with pi.

```bash
# macOS / Linux
npm install -g @larksuite/cli

# Windows (PowerShell as the current user, no admin needed)
npm install -g @larksuite/cli
```

If the global install fails with a permission error, tell the user and offer either an
elevated install (sudo on macOS/Linux, or Administrator PowerShell on Windows) or a
per-user prefix. **Never run `sudo` without telling the user first.**

The npm package is **`@larksuite/cli`** (provides the `lark-cli` binary). Do not guess other
package names.

For upgrades after first install: `npm update -g @larksuite/cli`.

## One-time user setup (replaces daemon onboard)

In mavis the daemon did app-registration + auto-OAuth via `/api/lark/onboard/*`. In pi
the user does both steps manually:

```bash
# Step 1: initialize the global config store
lark-cli config init

# Step 2: register or pick a Feishu app
# The CLI will prompt; the user needs an appId + appSecret from the Feishu open platform
# (https://open.feishu.cn/app). If they do not have an app, point them to the Feishu
# developer docs to create one.

# Step 3: run the recommended-scope OAuth
lark-cli auth login --recommend
```

The global store (`~/.lark-cli/`) now has:

- the app's `appId` / `appSecret`
- a UAT covering the recommended scope set
- the user identity (`userOpenId`)

This is enough for every operation below. If a specific call needs a scope outside the
recommended set, `lark-cli` will print the exact `lark-cli auth login --scope "..."` to use
— rerun with that suggestion.

## Auth status

```bash
lark-cli auth status
# or, to actually call the server (catches stale-but-not-yet-expired tokens):
lark-cli auth status --verify
```

Parses to:

```json
{
  "appId": "cli_xxx",
  "identity": "user",
  "userOpenId": "ou_xxx",
  "userName": "张三",
  "tokenStatus": "valid",
  "scope": "...",
  "expiresAt": "..."
}
```

- **No output / no `appId`** → no app is bound; have the user run `lark-cli config init`.
- **`appId` present, `identity: "bot"`** → bot is bound but the user has not authorized; run `lark-cli auth login --recommend`.
- **`appId` present, `identity: "user"`, `tokenStatus: "valid"`** → fully ready.

## Calling lark-cli

**MANDATORY: Before running any `lark-cli` shortcut (`+messages-send`, `+chat-search`,
`+agenda`, etc.), you MUST Read the corresponding sub-skill reference file first.** The
examples below are just a starting point — they do NOT cover formatting caveats, content
flags (`--text` vs `--markdown` vs `--content`), or identity requirements. The reference
files contain critical details that, if missed, cause silent data loss (e.g. empty
messages, wrong format).

Use the Sub-Skills Index below to find the right reference file for each shortcut.

Once auth is in place, invoke `lark-cli` directly. Use `--as user` for personal resources
(calendar / drive / tasks) and `--as bot` for application-level operations (inbound IM /
event subscribe). The per-domain sub-skills under `cli-skills/` document concrete command
syntax; the cheat sheet below is just a starting point.

```bash
# Generic OpenAPI passthrough (works for any documented Feishu endpoint)
lark-cli api GET  /open-apis/contact/v3/users/<user_id> --as user
lark-cli api POST /open-apis/im/v1/messages --as bot --params '{"receive_id_type":"chat_id"}' --data '{...}'

# Calendar — today's agenda + create event
lark-cli calendar +agenda --as user --format json
lark-cli calendar +create --as user --summary "Team Sync" --start 2026-04-01T14:00 --end 2026-04-01T15:00

# IM — search chats, list messages, send / reply
lark-cli im +chat-search          --as user --query "周报" --format json
lark-cli im +chat-messages-list   --as user --chat-id oc_xxx --format json
lark-cli im +messages-send        --as bot  --chat-id oc_xxx --markdown "Hello"
lark-cli im +messages-reply       --as bot  --message-id om_xxx --markdown "Reply"

# Task / Base / Contact — same pattern
lark-cli task    +get-my-tasks    --as user --format json
lark-cli base    +record-list     --app-token bascnXXX --table-id tblXXX --format json
lark-cli contact +search-user     --as user --query "张三" --format json
```

Most subcommands print JSON when you pass `--format json`; pipe to `jq` to extract
fields. A few commands print JSON unconditionally (e.g. `lark-cli auth status`,
`lark-cli auth list`) — no `--format` flag needed for those.

**Multi-bot environments** — when multiple bots are bound, pass `--as user --app-id <appId>`
(or use `lark-cli auth use <appId>` to switch the default) to disambiguate. With a single
bot, the only entry in `apps[]` is auto-selected.

## Sub-Skills Index (Load on Demand)

Each entry maps to `cli-skills/<name>/SKILL.md`. **Before using any sub-skill, you MUST first
Read `cli-skills/lark-shared/SKILL.md`** — it covers the cross-cutting basics (identity
selection, scope concepts, permission-denied handling, security rules).

**Then Read the specific sub-skill's reference file** for the shortcut you're about to use
(e.g. the matching sub-skill reference file under `cli-skills/lark-im/references/`, such as `lark-im-messages-send.md`, before calling `+messages-send`).
Do NOT rely on the quick examples above — they omit critical formatting and content-flag details.

| Scenario keywords | Sub-skill | Path |
|-------------------|-----------|------|
| Calendar / agenda / meeting room / free-busy / RSVP | lark-calendar | `cli-skills/lark-calendar/SKILL.md` |
| Tasks / todos / lists / assignments | lark-task | `cli-skills/lark-task/SKILL.md` |
| Send/receive messages / group chats / chat history / upload-download images & files | lark-im | `cli-skills/lark-im/SKILL.md` |
| Contacts / find people / lookup open_id / departments | lark-contact | `cli-skills/lark-contact/SKILL.md` |
| Create / edit / read Feishu cloud documents | lark-doc | `cli-skills/lark-doc/SKILL.md` |
| Drive file management / upload-download / import docs / comments | lark-drive | `cli-skills/lark-drive/SKILL.md` |
| Spreadsheet read/write / export | lark-sheets | `cli-skills/lark-sheets/SKILL.md` |
| Bitable / Base / fields / records / views | lark-base | `cli-skills/lark-base/SKILL.md` |
| Wiki / knowledge base / space members / nodes | lark-wiki | `cli-skills/lark-wiki/SKILL.md` |
| Slides / PPT create and read | lark-slides | `cli-skills/lark-slides/SKILL.md` |
| Whiteboard | lark-whiteboard | `cli-skills/lark-whiteboard/SKILL.md` |
| Whiteboard CLI advanced ops | lark-whiteboard-cli | `cli-skills/lark-whiteboard-cli/SKILL.md` |
| Email send/receive / drafts / rules / attachments | lark-mail | `cli-skills/lark-mail/SKILL.md` |
| Video conference history / recordings | lark-vc | `cli-skills/lark-vc/SKILL.md` |
| Minutes list / download / AI artifacts | lark-minutes | `cli-skills/lark-minutes/SKILL.md` |
| Approval instances / tasks | lark-approval | `cli-skills/lark-approval/SKILL.md` |
| Attendance / clock-in records | lark-attendance | `cli-skills/lark-attendance/SKILL.md` |
| Real-time event subscription (WebSocket) | lark-event | `cli-skills/lark-event/SKILL.md` |
| Find native un-wrapped OpenAPI | lark-openapi-explorer | `cli-skills/lark-openapi-explorer/SKILL.md` |
| Custom Skill authoring | lark-skill-maker | `cli-skills/lark-skill-maker/SKILL.md` |
| Bulk meeting minutes processing | lark-workflow-meeting-summary | `cli-skills/lark-workflow-meeting-summary/SKILL.md` |
| Agenda + todo standup digest | lark-workflow-standup-report | `cli-skills/lark-workflow-standup-report/SKILL.md` |
| Shared base (identity / scope / safety rules) | lark-shared | `cli-skills/lark-shared/SKILL.md` |

**Loading examples**:
- User: "Show me today's schedule" → Read `cli-skills/lark-shared/SKILL.md` + `cli-skills/lark-calendar/SKILL.md`
- User: "Add a row to the Bitable" → Read `cli-skills/lark-shared/SKILL.md` + `cli-skills/lark-base/SKILL.md`

## Platform detection (replaces mavis `<agent-context>.platform`)

pi has no `<agent-context>.platform` file. Detect the host platform inline:

- Node (TypeScript extensions): `process.platform` → `'win32' | 'darwin' | 'linux'`
- PowerShell: `[System.Environment]::OSVersion.Platform` (or `$IsWindows` on PS 7+)
- Bash: `uname -s` → `Linux` / `Darwin` / `MINGW64_NT-10.0` / etc.

For shell recipes, follow the platform-conditional style in the references folder
(`commands-windows-powershell.md`, `commands-macos-linux.md`).

## Tips

- **Multi-bot environments** — disambiguate with `--app-id <appId>` (or `lark-cli auth use <appId>`).
- **401 / LARK_USER_AUTH_REQUIRED** — re-run `lark-cli auth login --recommend` for the recommended scope set. If a specific call needs an extra scope, `lark-cli` itself prints the exact `lark-cli auth login --scope "..."` to use.
- **Do not use `--domain`** — it is per-domain and forces the user through a separate auth window for each module. Use `--scope` instead.
- **Bitable requires tokens from the URL** — `appToken` (from the table URL) and `tableId` (from `lark-cli base +table-list`).
- **Storage paths** — see `references/storage-paths.md` for the per-OS table of where the `~/.lark-cli/` store actually lives.

## What this skill is NOT for

- The mavis-style daemon onboard (`/api/lark/onboard/start`, `/api/lark/onboard/status`) — these HTTP endpoints do not exist in pi. The user runs `lark-cli config init` and `lark-cli auth login --recommend` themselves.
- A `daemon.port` file — there is no daemon. If you see a recipe that reads it, the recipe is from a mavis-era copy and should be ignored.
