---
name: mavis-browser
description: "Drive a real browser for tasks that need login state, JS rendering, or persistent cookies. In pi there is no native-messaging broker like the mavis one — pick between (a) the `url-browser` extension for static/lightweight pages, or (b) a playwright MCP server for full automation. Load when the user says 'open this site', 'log into X', 'screenshot the page', 'fill this form', 'click this button', or names a logged-in SaaS. Do NOT load for public anonymous pages — use the built-in `browse` / `browse_json` tools."
---

# Browser automation in pi

The mavis browser broker (`mavis browser tool` over a native-messaging host) does not exist in pi. pi has no Chrome extension, no native-messaging host, and no broker socket.

You have three real options, in order of preference:

| Need | Tool | Where it lives |
| --- | --- | --- |
| Static or near-static HTML, no login | built-in `browse` / `browse_json` | always available |
| Lightweight fetch + extract (CDN-friendly pages, no SPA JS) | `url-browser` extension | `~/.pi/agent/extensions/url-browser/index.ts` |
| Full automation (click, type, screenshot, login state, multi-step flows) | **playwright MCP** (`mcp__playwright__*` tools) | external MCP server, configured per-session |
| Just fetch + parse JSON | `browse_json` | always available |

If neither playwright MCP nor the url-browser extension is available, tell the user plainly and suggest they install playwright MCP. Do not pretend `mavis browser tool` exists.

## When to load this skill

Load when the user mentions:

- "open this URL", "navigate to", "go to this page"
- "log into X", "check my email", "look at my dashboard"
- "screenshot this page", "show me what X looks like"
- "fill this form", "click this button", "type into this field"
- a SaaS they're logged into (Gmail, Feishu, Notion, 公司内网, etc.)

Do **not** load for public anonymous pages, pure API JSON, or static docs — the built-in `browse` / `browse_json` tools handle those faster and without an extra tool roundtrip.

## Decision tree

```
1. Is the page public and anonymous?
   YES → use built-in browse / browse_json (skip this skill)
2. Is the page JS-heavy SPA / needs login / multi-step interaction?
   YES → load this skill, then check for playwright MCP
3. Otherwise (static-ish but I want a render)?
   → use url-browser extension if loaded, else built-in browse
```

## Pattern A — playwright MCP (preferred for full automation)

If the session has playwright MCP loaded, you will see tools like `mcp__playwright__browser_navigate`, `mcp__playwright__browser_click`, `mcp__playwright__browser_screenshot`, `mcp__playwright__browser_fill_form`, `mcp__playwright__browser_snapshot`, etc. Use them directly.

Typical flow:

1. `mcp__playwright__browser_navigate { url: "https://..." }` — open the page
2. `mcp__playwright__browser_snapshot {}` — get the accessibility tree (find the right element to click)
3. `mcp__playwright__browser_click { element: "Submit button", ref: "..." }` — click
4. `mcp__playwright__browser_type { element: "Email field", ref: "...", text: "..." }` — type
5. `mcp__playwright__browser_screenshot { type: "png" }` — capture the result

The tool names and argument shapes are server-specific. Always read the schema via the tool's `parameters` definition or the MCP server's docs. Do not guess argument names.

## Pattern B — url-browser extension (for simple pages)

`url-browser` ships with pi as a built-in extension. It is a thin HTTP fetcher that handles redirects, sets a real User-Agent, and returns extracted text. Use it for:

- Pages you just need to read
- Public dashboards without auth
- API responses (prefer `browse_json` for those)

If the page needs JS to render, url-browser will return near-empty content — fall back to playwright MCP.

## Pattern C — built-in `browse` / `browse_json`

Always available. Use for:

- Public documentation pages
- API endpoints (use `browse_json` for clean JSON output)
- Quick HTML extraction where you don't care about JS rendering

`browse` extracts main content, lists links, and shows HTTP status. `browse_json` parses JSON responses with syntax highlighting and is the right tool for REST/GraphQL endpoints.

## What the mavis browser broker gave you (and how to get it in pi)

| mavis capability | pi substitute |
| --- | --- |
| Real Chrome with login cookies | playwright MCP (launches its own Chromium) — note: this is NOT the user's logged-in profile, it is a fresh profile unless you configure user data dir |
| Tab claim / multi-tab | playwright MCP handles tabs via `mcp__playwright__browser_tabs` |
| Native-messaging host | none — install playwright MCP instead |
| Screenshot of visible tab | `mcp__playwright__browser_screenshot` |
| Console / errors capture | `mcp__playwright__browser_console_messages` / `mcp__playwright__browser_network_requests` |
| File download | `mcp__playwright__browser_file_upload` (upload) or trigger download then read the file with `read` tool |

## Hard limits

- playwright MCP does NOT share cookies with the user's actual Chrome profile by default. If the user is "already logged in" to a site, you will still see a login screen unless the MCP server is launched with `--user-data-dir <chrome profile>` or similar.
- If a task requires the user's logged-in state and there is no way to forward cookies, the honest answer is "I cannot access your logged-in session from here — please do this step manually, or share the result file."
- There is no broker, so no daemon-driven retry, no `mavis browser status`, no native-messaging install. If playwright MCP is not loaded, you cannot add it from inside the session.

## When NOT to use this skill

- ❌ Public anonymous pages — use `browse` / `browse_json` (faster, no tool overhead)
- ❌ Pure JSON API calls — use `browse_json`
- ❌ Static docs — use `browse`
- ❌ When the user has not opted in to a real browser session — confirm before launching playwright

## Common pitfalls

| Pitfall | Fix |
| --- | --- |
| Calling `mavis browser tool` | does not exist; use playwright MCP tools |
| Expecting playwright to share user cookies | it doesn't by default; tell the user |
| Looping screenshots without a stable selector | use `browser_snapshot` first to get the accessibility ref |
| Filling a form via `type` on a React controlled input | playwright's `browser_type` uses native events that React handles correctly; if not, fall back to `browser_fill_form` |
| Trying to install playwright MCP from inside a session | you can't — tell the user the install path |

## Quick reference

```
browse url=https://...                      # built-in, public HTML
browse_json url=https://api.example.com/x  # built-in, public JSON
mcp__playwright__browser_navigate { url }   # full automation (if MCP loaded)
mcp__playwright__browser_snapshot {}        # accessibility tree
mcp__playwright__browser_screenshot {}      # capture
```

If the user mentions "my Chrome", "logged into", "my account on", or names a SaaS — load this skill, then default to playwright MCP if available.
