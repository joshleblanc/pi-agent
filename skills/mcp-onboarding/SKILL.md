---
name: mcp-onboarding
description: "Onboard a new MCP server in pi. Use when the user says 'add Figma MCP', 'configure a new MCP service', 'connect to <external service>', 'I want to use <X> from here'. Walks the user through collecting only the needed info, then configures the server and tells them to restart the session. There is no in-session respawn — the new tools appear after a restart."
---

# MCP onboarding (pi)

The user-facing flow for adding a new MCP server. In pi there is no daemon, so the sequence is:

1. collect the minimum needed info from the user
2. configure the server (file edit / extension install)
3. tell the user to **restart the session** — the new tools appear on next start

Do not pretend `mavis mcp add` works. It does not.

## Goal

Hide the raw setup sequence from the user. The user should only:

1. pick a server name (or accept the preset)
2. provide the URL / command / auth credential when asked
3. restart the session

The agent does the rest: writes the config, tells the user what to do, and on next start verifies the tools are loaded.

## Core product rule

**Do not invent mavis-style CLI commands.** There is no `mavis mcp add`, no `mavis mcp auth login`, no `mavis mcp sync`. The agent's job is to:

1. determine how to add the server in pi (which file / which extension)
2. edit the right file
3. tell the user to restart
4. on next session, confirm the tools are present

## Single user-facing flow

### 1. Collect only missing information

| Field | When to ask |
| --- | --- |
| Server name (e.g. `figma`) | always — needed for the file path / tool prefix |
| URL or command | always |
| Auth mode (none / API key / OAuth) | if not obvious from the service |
| Env key name (for API key mode) | if stdio server with token in env |
| Host (for self-hosted instances) | if the service is self-hostable |

Presets when obvious:

| Service | Server name | Default config |
| --- | --- | --- |
| Figma | `figma` | URL `https://mcp.figma.com/mcp`, OAuth |
| GitHub | `github` | URL `https://api.githubcopilot.com/mcp/`, OAuth or PAT |
| Lark / Feishu | `lark` | URL `https://open.feishu.cn/open-apis/mcp`, OAuth via `lark-cli auth login` |
| Playwright | `playwright` | stdio `npx -y @playwright/mcp@latest` |

Do **not** dump raw JSON to the user unless they explicitly ask.

### 2. Determine where the config goes

Inspect the running pi setup:

```bash
ls ~/.pi/mcp.json ~/.pi/agent/mcp.json 2>/dev/null
ls ~/.pi/agent/extensions/
```

Pick the first one that exists, or the one the user prefers. If neither exists, ask the user where to put it (default: create `~/.pi/mcp.json`).

### 3. Write the config

Edit the chosen config file. The shape is the standard MCP config format:

```jsonc
{
  "mcpServers": {
    "<server-name>": {
      "url": "https://...",        // for HTTP-based servers
      // OR
      "command": "npx",
      "args": ["-y", "@vendor/mcp-server"],
      "env": { "API_KEY": "..." }  // optional, for stdio servers
    }
  }
}
```

Examples:

**HTTP OAuth (Figma-style)**

```jsonc
{
  "mcpServers": {
    "figma": {
      "url": "https://mcp.figma.com/mcp"
    }
  }
}
```

**HTTP Bearer token**

```jsonc
{
  "mcpServers": {
    "acme-api": {
      "url": "https://api.example.com/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

**stdio + env token**

```jsonc
{
  "mcpServers": {
    "gitlab-local": {
      "command": "npx",
      "args": ["-y", "@vendor/mcp-gitlab"],
      "env": { "GITLAB_TOKEN": "<token>", "GITLAB_URL": "https://gitlab.example.com" }
    }
  }
}
```

For **secrets**, prefer to:

- prompt the user via a genUI-style inline card (not a terminal paste), or
- have them set the env var in their shell before restarting pi

Never echo a token back to the user. Never ask the user to paste a token into a terminal command.

### 4. Tell the user to restart

After the file is written, output:

```
<service> 已接入完成。下次启动 pi 时会加载 <server-name> MCP，工具名前缀 mcp__<server-name>__。

配置已写入：<absolute path to config file>

请重启 pi 后再试。如果加载失败，把错误贴回来我看下。
```

(English equivalent: "Configured. Restart pi to load `<server-name>` MCP — tools will appear as `mcp__<server-name>__*`. Config file: `<path>`. If loading fails on restart, paste the error.")

### 5. Verify on next session (cannot do in-session)

You cannot run `mavis mcp sync` — there is no in-session respawn. On the next session, the user can:

- look at the tool list for `mcp__<server-name>__*` tools
- run a trivial call to confirm the connection
- if missing, the config file path is wrong, the JSON is malformed, or the server is unreachable

## What NOT to do

- ❌ Do not call `mavis mcp add` or any mavis CLI — they do not exist
- ❌ Do not run `mavis mcp sync` — there is no in-session sync
- ❌ Do not try to make the new tools available without a restart
- ❌ Do not echo tokens or paste them into terminal commands
- ❌ Do not pretend an OAuth callback will work without the user completing the browser step
- ❌ Do not ask the user to hand-edit raw JSON config files (you do that for them)

## Auth flow variants

### OAuth2 (Figma, lark, generic)

1. Write the server config (URL only).
2. Tell the user to restart pi.
3. On the next session, the user typically sees an auth card / popup. Walk them through clicking the link.
4. After the callback lands, the token is cached for the session.

If the auth requires an out-of-band `auth login` command (e.g. `lark-cli auth login --recommend`), tell the user to run it BEFORE restarting pi.

### API key in env

1. Tell the user to set the env var in their shell.
2. Write the server config that references `$ENV_VAR_NAME` or the literal value (prefer env reference).
3. User restarts pi.

### API key in config (less secure)

Only when the user insists. Never echo the value back in chat.

## Completion message template

```
Configured MCP: <service>
- server: <server-name>
- auth: <status from the call we just made or "not yet — complete on next session">
- tools (next session): mcp__<server-name>__*
- config: <absolute path>
- next step: restart pi
```
