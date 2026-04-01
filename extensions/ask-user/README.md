# Ask User Extension

Enables the agent to ask you clarifying questions when it needs more information to proceed.

## Installation

The extension is auto-discovered from `~/.pi/agent/extensions/`. 

```bash
# Verify it's loaded (you'll see ask_user in the tools list)
pi -e ~/.pi/agent/extensions/ask-user/index.ts -p "list tools"
```

## Usage

The agent can invoke the `ask_user` tool whenever it needs clarification. Common scenarios:

### Project Type Ambiguity
When the agent isn't sure what kind of project it's working with:
```
"What type of project is this? Choose: Node.js, Python, Go, Rust, or Other"
```

### File Not Found
When a referenced file doesn't exist:
```
"I couldn't find the database config. Is it at src/db/config or lib/database/settings?"
```

### Technology Preferences
When multiple valid approaches exist:
```
"Should I use REST or GraphQL for this API? Or both?"
```

### Unclear Requirements
When requirements are ambiguous:
```
"What error handling strategy should I use? Options: retry with backoff, circuit breaker, or fail fast"
```

## How It Works

1. Agent encounters ambiguity or needs guidance
2. Agent calls `ask_user` tool with question and optional options
3. A TUI dialog appears showing the question
4. User selects an option or types a custom answer
5. Agent receives the answer and continues

## Features

- **Multiple choice**: Provide options for quick selection
- **Custom input**: User can type any answer
- **Context**: Include background info to help user understand
- **Keyboard navigation**: Use arrow keys, Enter, Escape
- **TTY friendly**: Works in terminal with full UI

## Example

```
Agent: "I found a config file but it's not clear what format it uses."

[Extension shows dialog:]
━━━━━━━━━━━━━━━━━━━━━━━
 ? Clarification Needed
━━━━━━━━━━━━━━━━━━━━━━━

 What format is this config file?
 Context: Found config.yaml in project root

 Choose an option:
   1. YAML
   2. JSON
   3. TOML
   4. Type a custom answer

 ↑↓ navigate • Enter to select • Esc to cancel
━━━━━━━━━━━━━━━━━━━━━━━

User selects "1. YAML"

Agent: "Got it, I'll parse it as YAML."
```
