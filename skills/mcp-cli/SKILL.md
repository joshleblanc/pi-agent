---
name: mcp-cli
description: "MCP server management in pi. There is no `mavis mcp` CLI in pi — instead, MCP servers are configured per-session and their tools are exposed at runtime as `mcp__<server>__<tool>`. Use this skill to discover which MCP tools are loaded, understand their schemas, and call them. Also covers how to add a new MCP server (requires restart). Load when the user asks 'what MCP tools do I have', 'how do I call this MCP tool', 'add an MCP server', or you see `mcp__*` tool names in your available tool list."
---

# MCP in pi

MCP (Model Context Protocol) servers in pi work differently from mavis:

- There is **no `mavis mcp list/add/sync/auth/call` CLI**.
- MCP servers are configured per-pi-session (or per-extension).
- Loaded MCP tools appear in your tool list with the prefix `mcp__<server>__<tool>`.
- The schemas are visible in each tool's `parameters` field — read them before calling.

## Discovering what MCP tools are available

In any session, look at the tool list. MCP tools always have the prefix `mcp__`. Examples you may see:

```
mcp__matrix__web_search
mcp__matrix__image_generate
mcp__playwright__browser_navigate
mcp__playwright__browser_click
mcp__lark__im_message_send
mcp__github__create_issue
```

The middle segment is the server name. The last segment is the tool name. Call them like any other tool.

## Calling an MCP tool

Just call it by name. The runtime routes it to the right server.

```ts
// Example: a web search via the matrix MCP
{
  "tool": "mcp__matrix__web_search",
  "params": { "query": "DragonRuby engine boot process" }
}
```

Read the `parameters` schema for the exact shape. Do not guess.

## Adding a new MCP server

There is no in-session add. MCP servers are configured by editing the extension or config that owns them. Two common patterns:

### Pattern 1: server is wired into a built-in extension

Some pi extensions come with MCP servers pre-bundled. For example, a `mcp-bridge` extension might register matrix, playwright, lark, and others. To see which, inspect the extension:

```bash
ls ~/.pi/agent/extensions/                    # all extensions
cat ~/.pi/agent/extensions/<name>/index.ts    # look for mcp__* registrations
```

### Pattern 2: standalone MCP server config

If pi supports per-server MCP config (depends on the runtime version), it is typically at:

- `~/.pi/mcp.json`, or
- `~/.pi/agent/mcp.json`, or
- per-extension settings

Check the version of pi you are running. If you do not find a config file, the MCP set is whatever the extensions ship with.

### Pattern 3: install via the `mcp-onboarding` skill

The `mcp-onboarding` skill (in this same skill set) walks the user-facing flow for adding a new server. Load it when the user says "add Figma MCP", "configure a new MCP", etc.

## Authentication

MCP servers that need auth (OAuth, API key) have their own auth flow. Common patterns:

- **API key in env**: set the provider's env var (e.g. `FIGMA_TOKEN`, `LARK_APP_ID`/`LARK_APP_SECRET`) and restart pi. No in-session refresh.
- **OAuth via genUI**: some servers (lark, figma) collect the token via an interactive card. The auth flow is a separate tool that the MCP server exposes; call it once, the result is cached for the session.
- **OAuth via browser callback**: less common in pi; usually the lark-cli style `auth login --recommend` runs out-of-band.

If you see a 401 from an MCP tool, the cause is almost always:

1. Missing env var (set it and restart)
2. Expired token (re-run the auth flow)
3. Server was spawned with an empty token and is caching it (long-lived stdio processes; some servers need a full restart to pick up new creds)

For case 3, restart the session — there is no in-session respawn.

## Sync / regenerate

`mavis mcp sync` does not exist. Tool discovery is automatic at session start. To pick up new MCP servers or updated schemas, **start a new session**.

## Tool schema lookup

You cannot list tools by CLI in pi. Instead:

- Look at your available tool list at the start of the session.
- Read the `parameters` field on any `mcp__*` tool to get the schema.
- For tool docs, look at the server's README (usually a link in the tool's `description` or in the owning extension's `references/`).

## Common patterns

### Web search

```ts
mcp__matrix__web_search { query: "...", limit: 10 }
```

### Browser automation

```ts
mcp__playwright__browser_navigate { url: "..." }
mcp__playwright__browser_snapshot {}
mcp__playwright__browser_click { element: "Submit", ref: "..." }
```

### Lark / Feishu

```ts
mcp__lark__im_message_send { receive_id: "ou_xxx", msg_type: "text", content: "..." }
mcp__lark__calendar_create { summary: "...", start_time: "...", end_time: "..." }
```

(Exact tool names depend on which lark MCP is loaded; check the tool list.)

### GitHub

```ts
mcp__github__create_issue { owner: "...", repo: "...", title: "...", body: "..." }
```

## What this skill is NOT for

- Adding an MCP server interactively → load `mcp-onboarding`
- Driving a logged-in browser session with real cookies → playwright MCP does NOT share cookies by default; tell the user
- Anything that requires a daemon / long-lived process → none in pi; everything is per-session

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Tool not in your list | the server is not loaded for this session; restart with the right config |
| 401 on every call | missing or expired credential; set env var or re-run auth |
| 401 after setting env var | long-lived server process cached old creds; restart session |
| Tool returns shape `error: ...` | read the `error` field; the tool does not throw — it returns |
| Tool name guess is wrong | there is no `mavis mcp tools <server>`; read the actual tool list at session start |
| Schema drift (params changed) | restart session to re-discover |
