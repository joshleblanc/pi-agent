---
name: llm-call
description: Call a configured LLM model directly through the local script using provider settings from a YAML config. Use this skill when the user wants a raw model call, prompt test, provider/model comparison, or asks to send text to a specific GPT/Claude/Gemini model. Do not use it for normal pi agent execution. In pi there is no global `~/.mavis/config.yaml` — model/provider config lives in the extension that owns the provider, or you pass `--config <path>` to point at an arbitrary YAML.
---

# LLM Call

Replace `<skill_dir>` with the actual skill path shown by the loader.

## Procedure

1. Read the user's target model and prompt.
2. **Always pass `--model provider/model`**. If the user didn't name a specific model, pick a sensible default or run `--list` first to check available models.
3. Pass `--system`, `--max-tokens`, `--temperature`, `--stream`, or `--config` only when the task clearly requires them.
4. The script auto-detects config.yaml from the parent data dir hint when available, falling back to a few standard locations. Use `--config` when calling a non-default profile explicitly.
5. Return the model output directly. If the call fails, summarize the provider or config error without inventing a fallback.

## Config resolution order

The script looks for a model config in this order:

1. `--config <path>` (if passed)
2. `$LLM_CALL_CONFIG` env var (if set)
3. `$PI_DATA_DIR/config.yaml` (if `$PI_DATA_DIR` is set)
4. `~/.pi/agent/config.yaml` (user-level pi config)
5. `~/.llm-call/config.yaml` (script-specific fallback)
6. None → the script will tell the user "no config found; run `--init` to scaffold one"

The mavis path `~/.mavis/config.yaml` is no longer consulted by default. If you have an existing mavis config you want to keep using, either symlink it (`ln -s ~/.mavis/config.yaml ~/.pi/agent/config.yaml`) or pass `--config ~/.mavis/config.yaml` per call.

## Config file shape

```yaml
# ~/.pi/agent/config.yaml
providers:
  anthropic:
    api_key: ${ANTHROPIC_API_KEY}        # env var reference
    base_url: https://api.anthropic.com
  openai:
    api_key: ${OPENAI_API_KEY}
    base_url: https://api.openai.com/v1
  google:
    api_key: ${GOOGLE_API_KEY}
    base_url: https://generativelanguage.googleapis.com

models:
  - id: anthropic/claude-sonnet-4-6
    provider: anthropic
    protocol: messages                   # @ai-sdk/anthropic → "messages"
    max_tokens: 8192
  - id: openai/gpt-4o
    provider: openai
    protocol: chat/completions           # @ai-sdk/openai → "chat/completions"
    max_tokens: 4096
  - id: google/gemini-2.5-pro
    provider: google
    protocol: models/generateContent     # @ai-sdk/google → "models/{model}:generateContent"
    max_tokens: 8192
```

The script reads the matching provider block, resolves the env var, and dispatches the call using the protocol hint.

## Protocol mapping

| Provider SDK | Protocol hint |
| --- | --- |
| `@ai-sdk/anthropic` | `messages` |
| `@ai-sdk/openai` | `chat/completions` |
| `@ai-sdk/google` | `models/{model}:generateContent` |

## Examples

The script is a plain `.py` file — pick the Python launcher that exists on the host:

| Platform | Launcher |
|---|---|
| macOS / Linux | `python3` (preferred) or `python` if it points at Python 3 |
| Windows | `py -3` (preferred) or `python` |

Example invocations (substitute the launcher above for `<py>`):

```bash
<py> <skill_dir>/scripts/llm_call.py --model anthropic/claude-sonnet-4-6 --prompt "Explain this in one sentence"
<py> <skill_dir>/scripts/llm_call.py --model gemini/gemini-2.5-pro --system "Be brief" --prompt "Summarize this"
<py> <skill_dir>/scripts/llm_call.py --list
```

Do not assume `python3` exists on Windows — it is not part of a default install. Use `py -3` or
the launcher resolved at runtime.

## Failure handling

- If config.yaml is missing or incomplete, say which provider or credential is missing.
- If the requested model is not configured, ask the user to choose from configured models.
- If the HTTP request fails, surface the provider error; do not silently retry with another model.
- If you see `~/.mavis/config.yaml` referenced by a leftover script, the script needs porting — there is no daemon to read from.
