/**
 * Ask User Extension
 * 
 * Enables the agent to ask clarifying questions mid-response and continue generating
 * with the user's input incorporated into the response.
 * 
 * Key features:
 * - Blocks LLM mid-generation for user input
 * - Returns structured response the LLM can seamlessly continue from
 * - Supports options, custom input, and open-ended questions
 * - Works in both streaming and non-streaming contexts
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Key, matchesKey, Text, truncateToWidth } from "@mariozechner/pi-tui";
import { Editor, type EditorTheme } from "@mariozechner/pi-tui";

interface DisplayOption {
	label: string;
	description?: string;
	isOther?: boolean;
}

interface AskUserDetails {
	question: string;
	options: string[];
	context?: string;
	answer: string | null;
	wasCustom: boolean;
	index?: number;
}

const AskUserParams = Type.Object({
	question: Type.String({ description: "The clarifying question to ask the user" }),
	options: Type.Optional(
		Type.Array(
			Type.Union([
				Type.String(),
				Type.Object({
					label: Type.String({ description: "Display label for the option" }),
					description: Type.Optional(Type.String({ description: "Optional description shown below label" })),
				}),
			]),
			{ description: "Optional choices for the user (if omitted, user can type any answer)" },
		),
	),
	context: Type.Optional(
		Type.String({ description: "Additional context or background information for the user" }),
	),
});

export default function askUser(pi: ExtensionAPI) {
	pi.registerTool({
		name: "ask_user",
		label: "Ask User",
		description:
			"Ask the user a clarifying question when you need more information to proceed. Use this when:\n" +
			"- The project type is unclear (e.g., Node.js vs Python vs Go)\n" +
			"- A file or directory was not found\n" +
			"- You need user preferences or guidance\n" +
			"- Requirements are ambiguous\n" +
			"- You want to confirm before making significant changes\n\n" +
			"Provide options when possible to help the user answer quickly, but you can also ask open-ended questions.\n\n" +
			"The user will be prompted mid-response and you will receive their answer to continue.",
		parameters: AskUserParams,
		promptGuidelines: [
			"Use this tool when you encounter ambiguity or need user guidance",
			"Formulate clear, specific questions that help resolve the uncertainty",
			"Offer relevant options when you can anticipate good choices",
			"Include context about what you're trying to do",
		],

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!ctx.hasUI) {
				// In non-interactive mode, we can't prompt the user
				// Return a structured response that tells the LLM to proceed with a default
				return {
					content: [
						{
							type: "text",
							text: "[No interactive UI available. Please re-run in interactive mode or provide guidance in your next message.]",
						},
					],
					details: {
						question: params.question,
						options: normalizeOptions(params.options),
						context: params.context,
						answer: null,
						wasCustom: false,
						interactive: false,
					} as AskUserDetails & { interactive: boolean },
				};
			}

			const options = params.options ?? [];
			const displayOptions: DisplayOption[] = options.length > 0 
				? [...options.map(normalizeOption), { label: "Type a custom answer", isOther: true }] 
				: [];
			const simpleOptions = normalizeOptions(options);

			const result = await ctx.ui.custom<{ answer: string; wasCustom: boolean; index?: number } | null>(
				(tui, theme, _kb, done) => {
					let optionIndex = 0;
					let editMode = false;
					let cachedLines: string[] | undefined;

					const editorTheme: EditorTheme = {
						borderColor: (s) => theme.fg("accent", s),
						selectList: {
							selectedPrefix: (t) => theme.fg("accent", t),
							selectedText: (t) => theme.fg("accent", t),
							description: (t) => theme.fg("muted", t),
							scrollInfo: (t) => theme.fg("dim", t),
							noMatch: (t) => theme.fg("warning", t),
						},
					};
					const editor = new Editor(tui, editorTheme);

					editor.onSubmit = (value) => {
						const trimmed = value.trim();
						if (trimmed) {
							done({ answer: trimmed, wasCustom: true });
						} else {
							editMode = false;
							editor.setText("");
							refresh();
						}
					};

					function refresh() {
						cachedLines = undefined;
						tui.requestRender();
					}

					function handleInput(data: string) {
						if (editMode) {
							if (matchesKey(data, Key.escape)) {
								editMode = false;
								editor.setText("");
								refresh();
								return;
							}
							editor.handleInput(data);
							refresh();
							return;
						}

						if (matchesKey(data, Key.up)) {
							optionIndex = Math.max(0, optionIndex - 1);
							refresh();
							return;
						}
						if (matchesKey(data, Key.down)) {
							optionIndex = Math.min(displayOptions.length - 1, optionIndex + 1);
							refresh();
							return;
						}

						if (matchesKey(data, Key.enter)) {
							const selected = displayOptions[optionIndex];
							if (selected.isOther) {
								editMode = true;
								refresh();
							} else {
								done({ answer: selected.label, wasCustom: false, index: optionIndex + 1 });
							}
							return;
						}

						if (matchesKey(data, Key.escape)) {
							done(null);
						}
					}

					function render(width: number): string[] {
						if (cachedLines) return cachedLines;

						const lines: string[] = [];
						const add = (s: string) => lines.push(truncateToWidth(s, width));

						// Header
						add(theme.fg("accent", "━".repeat(width)));
						add(theme.fg("accent", " ? ") + theme.fg("text", "Clarification Needed"));
						add(theme.fg("accent", "━".repeat(width)));
						lines.push("");

						// Question
						add(theme.fg("text", ` ${params.question}`));
						lines.push("");

						// Context if provided
						if (params.context) {
							add(theme.fg("muted", ` Context: ${params.context}`));
							lines.push("");
						}

						// Options or input prompt
						if (displayOptions.length > 1) {
							add(theme.fg("dim", " Choose an option:"));
							lines.push("");

							for (let i = 0; i < displayOptions.length; i++) {
								const opt = displayOptions[i];
								const selected = i === optionIndex;
								const isOther = opt.isOther === true;
								const prefix = selected ? theme.fg("accent", "> ") : "  ";

								if (isOther && editMode) {
									add(prefix + theme.fg("accent", `${i + 1}. ${opt.label} ✎`));
								} else if (selected) {
									add(prefix + theme.fg("accent", `${i + 1}. ${opt.label}`));
								} else {
									add(`  ${theme.fg("text", `${i + 1}. ${opt.label}`)}`);
								}

								// Show description if present
								if (opt.description) {
									add(`     ${theme.fg("muted", opt.description)}`);
								}
							}

							if (editMode) {
								lines.push("");
								add(theme.fg("muted", " Your answer:"));
								for (const line of editor.render(width - 2)) {
									add(` ${line}`);
								}
							}
						} else {
							// Open-ended question - show text input
							add(theme.fg("muted", " Your answer:"));
							for (const line of editor.render(width - 2)) {
								add(` ${line}`);
							}
						}

						lines.push("");
						if (editMode) {
							add(theme.fg("dim", " Enter to submit • Esc to cancel input"));
						} else if (displayOptions.length > 1) {
							add(theme.fg("dim", " ↑↓ navigate • Enter to select • Esc to cancel"));
						} else {
							add(theme.fg("dim", " Enter to submit • Esc to cancel"));
						}
						add(theme.fg("accent", "━".repeat(width)));

						cachedLines = lines;
						return lines;
					}

					return {
						render,
						invalidate: () => {
							cachedLines = undefined;
						},
						handleInput,
					};
				},
			);

			if (!result) {
				// User cancelled - return a clear signal for the LLM to handle
				return {
					content: [
						{
							type: "text",
							text: "[User declined to answer. Continue without this information or try a different approach.]",
						},
					],
					details: {
						question: params.question,
						options: simpleOptions,
						context: params.context,
						answer: null,
						wasCustom: false,
						interactive: true,
					} as AskUserDetails & { interactive: boolean },
				};
			}

			// Success - return the answer in a format optimized for LLM continuation
			// The LLM will receive this and can seamlessly continue its response
			return {
				content: [
					{
						type: "text",
						text: `[User responded: "${result.answer}"${result.index ? ` (selected option ${result.index})` : ""}. Continue your response incorporating this input.]`,
					},
				],
				details: {
					question: params.question,
					options: simpleOptions,
					context: params.context,
					answer: result.answer,
					wasCustom: result.wasCustom,
					index: result.index,
					interactive: true,
				} as AskUserDetails & { interactive: boolean },
			};
		},

		renderCall(args, theme, _context) {
			let text = theme.fg("toolTitle", theme.bold("ask_user "));
			text += theme.fg("text", args.question);

			const options = args.options ?? [];
			if (options.length > 0) {
				const labels = options.map((o: string | { label: string }) =>
					typeof o === "string" ? o : o.label,
				);
				text += `\n${theme.fg("dim", `  Options: ${labels.join(", ")}`)}`;
			}

			if (args.context) {
				text += `\n${theme.fg("muted", `  Context: ${args.context}`)}`;
			}

			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme, _context) {
			const details = result.details as (AskUserDetails & { interactive?: boolean }) | undefined;
			
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			// Non-interactive mode
			if (details.interactive === false) {
				return new Text(theme.fg("warning", "⌀ No UI available"), 0, 0);
			}

			// User cancelled
			if (details.answer === null) {
				return new Text(theme.fg("warning", "⌀ Declined to answer"), 0, 0);
			}

			// Success with custom answer
			if (details.wasCustom) {
				return new Text(
					theme.fg("success", "✓ ") +
						theme.fg("muted", "(custom) ") +
						theme.fg("accent", `"${details.answer}"`),
					0,
					0,
				);
			}

			// Success with option selection
			const idx = details.index ?? 0;
			return new Text(
				theme.fg("success", "✓ ") +
					theme.fg("accent", `${idx}. ${details.answer}`),
				0,
				0,
			);
		},
	});

	// Helper to normalize options to string array
	function normalizeOptions(options: unknown[]): string[] {
		if (!options) return [];
		return options.map((o) => (typeof o === "string" ? o : (o as { label: string }).label));
	}

	// Helper to normalize a single option
	function normalizeOption(option: unknown): DisplayOption {
		if (typeof option === "string") {
			return { label: option };
		}
		const obj = option as { label: string; description?: string };
		return { label: obj.label, description: obj.description };
	}
}
