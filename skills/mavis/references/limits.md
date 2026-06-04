# Limits — what pi does not have

pi is a single-process coding agent. Many mavis features do not exist in pi. When a user asks for one of these, say so plainly and offer the closest substitute.

## Hard missing features

| Feature | Why it doesn't exist | Closest substitute |
| --- | --- | --- |
| Long-running daemon | pi is invoked per-session, not as a service | OS-level scheduled task (`schtasks` on Windows, `cron` on Unix) calling `pi -p "..."` |
| Cron / scheduled tasks | no scheduler in the runtime | `schtasks /create /sc daily /tn pi-task /tr "pi -p '...'"` (win32) or `crontab -e` (unix) |
| Hooks (tool gate / session gate) | no middleware layer in the runtime | custom extension that wraps `registerTool` |
| Inbound IM bridge (Feishu / Telegram) | no inbound socket | user invokes `pi` manually; the lark-cli / tg-cli skills cover outbound ops |
| Inter-session messaging | sessions are independent | write a file both sessions can read |
| Signal / proposal channels | no feedback bus | open a git issue, or write a `SIGNALS.md` in the skill folder |
| Built-in browser broker | no native-messaging host | `url-browser` extension for static pages; playwright MCP for JS-heavy sites |
| `.harness/` project reins | no project-team concept | use the `team` tool with a plan file at the repo root |
| `mavis agent list/info/new/delete` | no agent CLI | read `~/.pi/agent/extensions/` directly; there is no CLI to create one |
| `mavis communication send` | no inter-session bus | file a markdown report in `~/.pi/team/plans/<id>/outputs/...` |
| `mavis mcp list/add/sync` | no MCP CLI in the runtime | MCP servers are configured per-extension; tools show up as `mcp__<server>__<tool>` at runtime |
| `mavis browser tool` | no broker | playwright MCP (`mcp__playwright__*`) or `url-browser` extension |
| `mavis memory` (user/agent/project) | no memory model | write to `~/.pi/memory/` (or project-local `.pi/memory/`) using your own layout |
| `mavis hook create` | no hook registry | custom extension that calls `pi.registerTool` with gated logic |
| `mavis cron self` | no scheduler | `Start-Sleep` in a script and re-invoke `pi` |
| `<agent-context>.platform` file | no agent context file | detect platform inline (`process.platform`, `[System.Environment]::OSVersion.Platform`, `uname -s`) |

## Degraded features

These exist in pi but with less surface than mavis:

| Feature | mavis | pi |
| --- | --- | --- |
| Built-in agents | user-addable in `~/.mavis/agents/<name>/` | three fixed: lead/worker/verifier (custom requires extension edit) |
| Skill scopes | user / agent / project | user (built-in to `~/.pi/agent/skills/`) only |
| Skill feedback | signal/proposal CLI + nightly cron | manual (file a markdown note) |
| Team plan engine | full mavis | port in `team-agent` extension (same YAML, same verdicts) |
| Browser | mavis broker + extension | url-browser extension or playwright MCP |
| LLM config | `~/.mavis/config.yaml` | per-extension provider config |

## When the user asks for a missing feature

Pattern:

1. Name the missing feature plainly ("pi does not have a daemon / cron / IM bridge / inter-session messaging").
2. Offer the closest substitute with a concrete command or path.
3. If the user wants the feature added, point to the extension API as the extension point.

Do not invent CLI verbs that do not exist (e.g. "pi agent new", "pi skill signal report"). They will fail at runtime and waste the user's session.
