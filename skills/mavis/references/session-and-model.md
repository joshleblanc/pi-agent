# Session and model in pi

## Session model

- A session is a single invocation of `pi` with a conversation. pi persists session state on disk; `--no-session` opts out.
- Each session has an id (string). `ctx.sessionManager.getSessionId?.()` returns it from inside an extension.
- Sessions are independent — there is no inter-session messaging. If two sessions need to share data, write to a file both can read.
- There is no "main session" / "child session" hierarchy in the mavis sense. The team plan engine is the only thing that spawns concurrent sub-sessions, and those are short-lived workers.

## Model selection

- The default model is whatever the spawned `pi` process was configured with (`--model` flag, or environment, or extension default).
- Per-task model override: the `team-agent` extension's `AgentConfig` carries a `model` field, and `runAgent` passes `--model <name>` when set.
- Custom providers register via extension (e.g. `custom-provider-venice/index.ts`). There is no central `config.yaml`.

## Provider credentials

- Each provider extension reads its own env vars (e.g. `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `VENICE_API_KEY`).
- No global credential store. No daemon. No OAuth refresh — refresh happens at the provider's CLI or web flow.
- `mavis mcp auth login` is replaced by whatever the provider's auth flow is (often a `lark-cli auth login` style command for OAuth, or a key in env for API-key providers).

## Switching model mid-session

There is no in-session model switch for the user — start a new session with `--model <name>`. The team-agent engine CAN switch per-task via `assigned_to`'s agent config.

## Reasoning / thinking

For reasoning models (Anthropic Sonnet/Opus with `extended_thinking`, OpenAI o-series), configure the `thinking:` block in the provider extension's `config.yaml` or in the per-model `AgentConfig` for team workers. Shape varies per provider; check the existing `custom-provider-venice/index.ts` for a worked example.

## Inspecting current session

```ts
// Inside an extension
const id = ctx.sessionManager.getSessionId?.();
const cwd = ctx.cwd;
const hasUI = ctx.hasUI;
```

## Limits (no workarounds in pi)

- No automatic token-budget tracking per session — count tokens yourself or use the `tokens-per-second` extension for live diagnostics.
- No automatic compaction — the conversation is what it is.
- No persistent long-term memory across sessions — write to files.
- No "user / agent / project" memory model — use file paths keyed by user / agent / project as you see fit.
