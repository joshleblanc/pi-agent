# Extensions in pi

An extension is a TypeScript module that registers tools, commands, slash commands, and lifecycle hooks with the pi runtime via the `ExtensionAPI`. Extensions live at `~/.pi/agent/extensions/<name>/index.ts`.

## Minimum shape

```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "my_tool",
    label: "My Tool",
    description: "What it does, when to use it.",
    parameters: Type.Object({ /* … */ }),
    async execute(_id, params, signal, onUpdate, ctx) {
      return { content: [{ type: "text", text: "result" }] };
    },
  });
}
```

## Registration surface

| API | Purpose |
| --- | --- |
| `pi.registerTool({ name, label, description, parameters, execute })` | Adds a callable tool the agent can invoke. |
| `pi.registerCommand("team:status", { description, handler })` | Adds a `/slash` command. |
| `pi.on("session_start", async (event, ctx) => {…})` | Lifecycle hook. |
| `ctx.ui.notify(text, level)` | Surface a message to the user (transient toast / footer). |
| `ctx.ui.setStatus(id, text)` | Pin a status string in the footer. |
| `ctx.sessionManager.getSessionId?.()` | Current session id (string \| undefined). |
| `ctx.cwd` | Current working directory. |
| `ctx.hasUI` | Boolean — true when running under the TUI. |

## Built-in extensions shipped with pi

| Extension | Provides |
| --- | --- |
| `team-agent` | `team`, `team_status`, `team_decision`, `team_steer`, `team_control` tools + `/team:*` slash commands. Loads three built-in "agents" (lead/worker/verifier) from its own folder. |
| `url-browser` | URL fetch + content extraction (small / no-JS pages). |
| `custom-provider-venice` | Example custom model provider. |
| `tokens-per-second` | Diagnostic: token rate counter. |
| `minimax-usage` | Diagnostic: MiniMax usage tracker. |
| `mavis-context-inject` | Injects mavis-style Agent Team context into the system prompt at session start. |
| `powershell` | PowerShell-side helpers (when running on win32). |

## Authoring a new extension

1. Pick a kebab-case name. The folder name is the extension id.
2. Write `~/.pi/agent/extensions/<name>/index.ts` exporting a default function.
3. Optional: add `references/` (markdown) or `<other>.ts` (extra modules).
4. Restart pi — extensions are loaded once at startup. There is no hot-reload.

## Discovering what an extension exposes

```bash
grep -E "registerTool|registerCommand" ~/.pi/agent/extensions/<name>/index.ts
```

```powershell
Select-String -Path (Join-Path $env:USERPROFILE\.pi\agent\extensions\<name>\index.ts) -Pattern "registerTool|registerCommand"
```

## Calling another extension's tool

Tools are first-class — call them by name from your own extension or skill. You don't import them; the runtime resolves tool names.

## Custom providers

A custom model provider is an extension that registers a model spec (provider + model list) with the runtime. See `custom-provider-venice/index.ts` for a working example. Per-model `thinking:` config goes in the same place.

## Common pitfalls

| Pitfall | Fix |
| --- | --- |
| Extension doesn't load | syntax error in `index.ts`; check `~/.pi/logs/` for the parse error |
| Tool name collides with a builtin | rename or namespace (`myext_mytool`) |
| Hot-reload expectation | there is none — restart the session |
| Forgetting `default export` | the loader ignores modules without `export default function` |
