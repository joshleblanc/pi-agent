/**
 * Example prompts demonstrating the ask_user extension
 * 
 * The agent will call ask_user when it needs clarification.
 * These examples show the kinds of questions it might ask.
 */

/**
 * Example 1: Project type detection
 * Agent might ask when it sees ambiguous file patterns
 */
const example1 = `Analyze this project and ask the user if it's a Node.js, Python, Go, or Rust project before proceeding with implementation.`;

/**
 * Example 2: Technology preference
 * Agent asks when multiple valid approaches exist
 */
const example2 = `Implement a new API endpoint. First ask the user whether they prefer REST, GraphQL, or gRPC for this project.`;

/**
 * Example 3: Confirmation before destructive action
 * Agent asks before major refactoring
 */
const example3 = `I found an existing authentication system. Ask the user whether to refactor it or build alongside it.`;

/**
 * Example 4: File path clarification
 * Agent asks when it can't determine the correct path
 */
const example4 = `Find the configuration file. If multiple candidates exist, ask the user which one to use.`;

/**
 * Example 5: Style/preference questions
 * Agent asks about coding style or conventions
 */
const example5 = `Implement error handling. Ask the user whether they prefer try-catch, result types, or exception propagation.`;

/**
 * Example 6: Open-ended questions
 * Agent asks for custom guidance
 */
const example6 = `Review the code and ask the user what specific aspects they'd like me to focus on (performance, security, maintainability, etc.).`;

// The actual prompts that trigger ask_user come from the LLM's reasoning
// when it encounters ambiguity. The LLM is instructed to use ask_user
// when it needs more information to proceed correctly.
