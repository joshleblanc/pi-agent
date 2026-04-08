# Ask User Extension

Enables the agent to ask you clarifying questions **mid-response** and seamlessly continue generating with your input.

## Key Behavior

The `ask_user` tool blocks the LLM's streaming response, shows you a dialog, and after you respond, the LLM **continues generating** from where it left off, incorporating your answer into its response.

This is different from a typical tool call that ends the response - the LLM treats your answer as context to continue its thought.

## Installation

The extension is auto-discovered from `~/.pi/agent/extensions/`. 

```bash
# Restart pi or run /reload to load the updated extension
```

## Usage

The agent can invoke the `ask_user` tool whenever it needs clarification. Common scenarios:

### Project Type Ambiguity
```
"What type of project is this? It's a Node.js TypeScript project."
```

### Technology Preferences
```
"Should I use REST or GraphQL for this API?"
```

### Unclear Requirements
```
"What error handling strategy should I use?"
```

### Confirmation Before Major Changes
```
"Found existing implementation. Should I refactor or extend?"
```

## How It Works

1. Agent is generating a response and encounters ambiguity
2. Agent calls `ask_user` tool with a question
3. **The response pauses** - you're shown a dialog
4. You select an option or type your answer
5. **The response continues** with your input incorporated

## Features

- **Mid-stream prompting**: Blocks LLM generation until you respond
- **Seamless continuation**: LLM continues from where it left off
- **Multiple choice**: Provide options for quick selection
- **Custom input**: Type any answer
- **Context**: Background info to help you understand
- **Keyboard navigation**: Arrow keys, Enter, Escape
- **Graceful fallbacks**: Works in non-interactive mode (shows warning)

## Example Flow

```
Agent: "I'll need to configure the database connection. What type of database..."
         [dialog appears, blocking the response]

━━━━━━━━━━━━━━━━━━━━━━━
 ? Clarification Needed
━━━━━━━━━━━━━━━━━━━━━━━

 What type of database does this project use?

 Choose an option:
   1. PostgreSQL
   2. MySQL
   3. SQLite
   4. MongoDB
   5. Type a custom answer

 ↑↓ navigate • Enter to select • Esc to cancel
━━━━━━━━━━━━━━━━━━━━━━━

User selects "1. PostgreSQL"

Agent: "does this project use. Since you're using PostgreSQL, I'll set up
        the connection with the pg driver and use connection pooling..."
        [continues generating with this context]
```

## Response Format

The tool returns your answer in a format the LLM understands as "continue from here":

```
[User responded: "PostgreSQL" (selected option 1). Continue your response incorporating this input.]
```

This framing tells the LLM to seamlessly incorporate the answer rather than treating it as a separate tool result.

## Non-Interactive Mode

If running without a UI (print mode, JSON mode), the tool returns:

```
[No interactive UI available. Please re-run in interactive mode or provide guidance in your next message.]
```

## Implementation Notes

The extension uses `ctx.ui.custom()` which:
1. **Blocks** the tool execution until the user responds
2. **Returns** the result to the LLM's current turn
3. **Allows** the LLM to continue streaming with the new context

This pattern ensures the user sees a seamless experience - the response pauses, they answer, and the response continues naturally.
