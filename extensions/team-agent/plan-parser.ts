/**
 * Plan YAML Parser
 *
 * Hand-rolled YAML subset parser tailored to the mavis plan format.
 * Avoids a `yaml` dependency. Handles:
 *  - Block scalars: `>` (folded) and `|` (literal)
 *  - Inline arrays: `[a, b, c]`
 *  - Nested mappings (indented key-value pairs)
 *  - Sequences of mappings (`- key: val`)
 *  - `null` and `~` as null
 *  - Booleans and integers
 *  - Single/double-quoted strings
 *  - Trailing comments (`# ...`)
 *
 * Not a general YAML parser. Goal: round-trip mavis team plans.
 */

import * as fs from "node:fs";
import type { Plan, Task, VerifierConfig } from "./plan-schema";

// ============================================================================
// Public API
// ============================================================================

export interface ParseResult {
	plan: Plan;
	errors: string[];
}

export function parsePlanYaml(source: string): ParseResult {
	const errors: string[] = [];
	try {
		const root = parseDocument(source);
		if (root === null || typeof root !== "object" || Array.isArray(root)) {
			errors.push("Root must be a mapping");
			return { plan: emptyPlan(), errors };
		}
		return { plan: coercePlan(root as Record<string, unknown>, errors), errors };
	} catch (e: any) {
		errors.push(`YAML parse error: ${e?.message ?? String(e)}`);
		return { plan: emptyPlan(), errors };
	}
}

export function loadPlanFile(filePath: string): ParseResult {
	try {
		return parsePlanYaml(fs.readFileSync(filePath, "utf-8"));
	} catch (e: any) {
		return {
			plan: emptyPlan(),
			errors: [`Failed to read plan file "${filePath}": ${e?.message ?? String(e)}`],
		};
	}
}

// ============================================================================
// Coercion: parsed YAML → typed Plan
// ============================================================================

function emptyPlan(): Plan {
	return { version: 1, plan: { name: "unnamed" }, tasks: [] };
}

function coercePlan(raw: Record<string, unknown>, errors: string[]): Plan {
	const version = raw.version;
	if (version !== 1) {
		errors.push(`Unsupported plan version: ${version} (expected 1)`);
		return emptyPlan();
	}

	const planBlock = (raw.plan as Record<string, unknown> | undefined) ?? {};
	const name = planBlock.name;
	if (typeof name !== "string" || !name.trim()) {
		errors.push("plan.name is required");
		return emptyPlan();
	}

	const vc = planBlock.verifier_config;
	const verifierConfig: VerifierConfig | undefined = vc && typeof vc === "object" && !Array.isArray(vc)
		? coerceVerifierConfig(vc as Record<string, unknown>)
		: undefined;

	const tasksRaw = Array.isArray(raw.tasks) ? (raw.tasks as unknown[]) : [];
	const plan: Plan = {
		version: 1,
		plan: {
			name,
			max_concurrency: toIntPositive(planBlock.max_concurrency, 10),
			max_consecutive_failures: toInt(planBlock.max_consecutive_failures, 2),
			max_cycles: toIntPositive(planBlock.max_cycles, 10),
			auto_accept: toBool(planBlock.auto_accept, false),
			auto_reject_retries: toInt(planBlock.auto_reject_retries, 1),
			verifier_config: verifierConfig,
		},
		tasks: [],
	};

	if (tasksRaw.length === 0) {
		errors.push("plan has no tasks");
	}

	for (let i = 0; i < tasksRaw.length; i++) {
		const t = tasksRaw[i];
		if (!t || typeof t !== "object" || Array.isArray(t)) {
			errors.push(`tasks[${i}] is not a mapping`);
			continue;
		}
		const task = coerceTask(t as Record<string, unknown>, i, errors, plan);
		if (task) plan.tasks.push(task);
	}

	// Second pass: structural floor checks across tasks
	const taskIdSet = new Set(plan.tasks.map((t) => t.id));
	const skippedTaskIds = new Set(
		plan.tasks.filter((t) => t.verified_by === null && t.role === "produce").map((t) => t.id),
	);
	for (const task of plan.tasks) {
		if (task.depends_on) {
			for (const dep of task.depends_on) {
				if (!taskIdSet.has(dep)) {
					errors.push(
						`task "${task.id}" has depends_on: ["${dep}"] but no task with that id exists in the plan.`,
					);
					continue;
				}
				if (skippedTaskIds.has(dep)) {
					errors.push(
						`task "${task.id}" depends on "${dep}" which has verification skipped. ` +
						`Engine rejects: downstream would propagate errors silently.`,
					);
				}
			}
		}
	}

	// Third pass: detect dependency cycles
	const depMap = new Map<string, string[]>();
	for (const task of plan.tasks) {
		depMap.set(task.id, task.depends_on ?? []);
	}
	const visiting = new Set<string>();
	const visited = new Set<string>();
	function detectCycle(id: string, path: string[]): string[] | null {
		if (visited.has(id)) return null;
		if (visiting.has(id)) return [...path, id];
		visiting.add(id);
		for (const dep of depMap.get(id) ?? []) {
			const cycle = detectCycle(dep, [...path, id]);
			if (cycle) return cycle;
		}
		visiting.delete(id);
		visited.add(id);
		return null;
	}
	for (const task of plan.tasks) {
		const cycle = detectCycle(task.id, []);
		if (cycle) {
			errors.push(`dependency cycle detected: ${cycle.join(" → ")}`);
			break;
		}
	}

	return plan;
}

function coerceVerifierConfig(raw: Record<string, unknown>): VerifierConfig {
	const vc: VerifierConfig = {};
	if (Array.isArray(raw.default_verifiers)) {
		vc.default_verifiers = raw.default_verifiers
			.filter((x) => typeof x === "string")
			.map((x) => (x as string).trim())
			.filter(Boolean);
	}
	vc.audit_sample_rate = toNum(raw.audit_sample_rate, 0);
	vc.strict_mode = toBool(raw.strict_mode, false);
	return vc;
}

function coerceTask(
	raw: Record<string, unknown>,
	idx: number,
	errors: string[],
	plan: Plan,
): Task | null {
	const id = raw.id;
	if (typeof id !== "string" || !id.trim()) {
		errors.push(`tasks[${idx}].id is required`);
		return null;
	}
	const title = typeof raw.title === "string" ? raw.title : id;
	const prompt = raw.prompt;
	if (typeof prompt !== "string") {
		errors.push(`tasks[${idx}] (${id}).prompt is required`);
		return null;
	}
	const assignedRaw = raw.assigned_to;
	if (assignedRaw === undefined || assignedRaw === null) {
		errors.push(`tasks[${idx}] (${id}).assigned_to is required`);
		return null;
	}
	const assignedTo = coerceAgentList(assignedRaw, `tasks[${idx}] (${id}).assigned_to`, errors);

	let verifiedBy: string | string[] | null | undefined = undefined;
	if ("verified_by" in raw) {
		const v = raw.verified_by;
		if (v === null || v === "~" || v === "") {
			verifiedBy = null;
		} else {
			verifiedBy = coerceAgentList(v, `tasks[${idx}] (${id}).verified_by`, errors);
		}
	}

	let coercedVerifyPrompt: string | Record<string, string> | undefined = undefined;
	const verifyPrompt = raw.verify_prompt;
	if (typeof verifyPrompt === "string") {
		coercedVerifyPrompt = verifyPrompt;
	} else if (verifyPrompt && typeof verifyPrompt === "object" && !Array.isArray(verifyPrompt)) {
		const map: Record<string, string> = {};
		for (const [k, v] of Object.entries(verifyPrompt)) {
			if (typeof v === "string") map[k] = v;
		}
		if (Object.keys(map).length > 0) coercedVerifyPrompt = map;
	}

	const dependsOn = Array.isArray(raw.depends_on)
		? (raw.depends_on as unknown[]).filter((x) => typeof x === "string")
		: [];

	const role: "produce" | "verify-as-task" = raw.role === "verify-as-task" ? "verify-as-task" : "produce";

	const task: Task = {
		id,
		title,
		prompt,
		assigned_to: assignedTo,
		verified_by: verifiedBy,
		verify_prompt: coercedVerifyPrompt,
		verify_skip_reason: typeof raw.verify_skip_reason === "string" ? raw.verify_skip_reason : undefined,
		depends_on: dependsOn.length > 0 ? (dependsOn as string[]) : undefined,
		timeout_ms: toIntPositive(raw.timeout_ms, 1800000),
		max_retries: toInt(raw.max_retries, 2),
		auto_reject_retries: raw.auto_reject_retries !== undefined
			? toInt(raw.auto_reject_retries, 1)
			: (plan.plan.auto_reject_retries ?? 1),
		role,
		output: raw.output && typeof raw.output === "object" && !Array.isArray(raw.output)
			? coerceOutput(raw.output as Record<string, unknown>)
			: undefined,
	};

	// Structural-floor checks
	if (verifiedBy === null && role === "produce") {
		if (!task.verify_skip_reason) {
			errors.push(
				`tasks[${idx}] (${id}): verified_by is null but verify_skip_reason is missing. ` +
				`User-confirmed skip requires a reason.`,
			);
		}
		if (dependsOn.length > 0) {
			errors.push(
				`tasks[${idx}] (${id}): cannot skip verification; task is depended on by others. ` +
				`Engine rejects: downstream would propagate errors silently.`,
			);
		}
	}
	if (role === "verify-as-task" && dependsOn.length > 0) {
		errors.push(
			`tasks[${idx}] (${id}): role=verify-as-task cannot have depends_on. ` +
			`A verification report consumed downstream must stay verified.`,
		);
	}

	return task;
}

function coerceOutput(raw: Record<string, unknown>): Task["output"] {
	return {
		file: typeof raw.file === "string" ? raw.file : undefined,
		gates: Array.isArray(raw.gates)
			? (raw.gates as unknown[]).filter((x) => typeof x === "string") as string[]
			: undefined,
	};
}

function coerceAgentList(v: unknown, field: string, errors: string[]): string | string[] {
	if (typeof v === "string") return v.trim();
	if (Array.isArray(v)) {
		const list = v.filter((x) => typeof x === "string").map((x) => (x as string).trim()).filter(Boolean);
		return list;
	}
	errors.push(`${field} must be a string or list of strings`);
	return "";
}

function toInt(v: unknown, def: number): number {
	if (v === undefined || v === null || v === "") return def;
	const n = typeof v === "number" ? v : parseInt(String(v), 10);
	return Number.isFinite(n) ? n : def;
}

/** Like toInt, but treats explicit 0 as "use default" for fields that must be positive
 *  (e.g. timeout_ms, max_cycles, max_concurrency). Use for those only. */
function toIntPositive(v: unknown, def: number): number {
	if (v === undefined || v === null || v === "") return def;
	const n = typeof v === "number" ? v : parseInt(String(v), 10);
	if (!Number.isFinite(n) || n <= 0) return def;
	return n;
}

function toNum(v: unknown, def: number): number {
	if (v === undefined || v === null || v === "") return def;
	const n = typeof v === "number" ? v : parseFloat(String(v));
	return Number.isFinite(n) ? n : def;
}

/** Like toNum, but treats 0 as "use default" for fields that must be positive. */
function toNumPositive(v: unknown, def: number): number {
	if (v === undefined || v === null || v === "") return def;
	const n = typeof v === "number" ? v : parseFloat(String(v));
	if (!Number.isFinite(n) || n <= 0) return def;
	return n;
}

function toBool(v: unknown, def: boolean): boolean {
	if (v === undefined || v === null || v === "") return def;
	if (typeof v === "boolean") return v;
	const s = String(v).toLowerCase();
	if (s === "true" || s === "yes" || s === "on") return true;
	if (s === "false" || s === "no" || s === "off") return false;
	return def;
}

// ============================================================================
// Parser (line-oriented, indent-based, handles sequences of mappings)
// ============================================================================

interface Line {
	indent: number;
	content: string;
	lineNo: number;
}

function preprocess(source: string): Line[] {
	const out: Line[] = [];
	const raw = source.replace(/\r\n?/g, "\n").split("\n");
	for (let i = 0; i < raw.length; i++) {
		const s = raw[i];
		if (!s.trim()) continue;
		if (/^\s*#/.test(s)) continue;
		const indent = s.length - s.replace(/^\s+/, "").length;
		out.push({ indent, content: s.slice(indent), lineNo: i + 1 });
	}
	return out;
}

/** Parse the document and return a plain JS object/array tree. */
function parseDocument(source: string): unknown {
	const lines = preprocess(source);
	if (lines.length === 0) return null;
	return parseBlock(lines, 0, -1).value;
}

/**
 * Parse a block of YAML at the given starting index, where each line must
 * have indent > parentIndent. Returns the parsed value and the next index.
 * Supports both mappings and sequences of mappings at this level.
 */
function parseBlock(lines: Line[], start: number, parentIndent: number): { value: unknown; next: number } {
	if (start >= lines.length) return { value: null, next: start };
	const first = lines[start];
	if (first.indent <= parentIndent) return { value: null, next: start };

	// Sequence of mappings: lines start with "- "
	if (isListItem(first)) {
		return parseSequence(lines, start, first.indent, parentIndent);
	}
	// Mapping
	return parseMapping(lines, start, parentIndent);
}

function isListItem(l: Line): boolean {
	return /^-(\s|$)/.test(l.content);
}

function parseMapping(lines: Line[], start: number, parentIndent: number): { value: Record<string, unknown>; next: number } {
	const obj: Record<string, unknown> = {};
	let i = start;
	while (i < lines.length) {
		const l = lines[i];
		if (l.indent <= parentIndent) break;
		// Sequence item starts a new sibling — caller handles boundary
		if (isListItem(l) && l.indent === lines[start].indent) break;

		const colonIdx = findTopLevelColon(l.content);
		if (colonIdx < 0) {
			// Not a key:val line; skip (shouldn't happen at mapping level)
			i++;
			continue;
		}
		const rawKey = l.content.slice(0, colonIdx).trim();
		const key = unquoteKey(rawKey);
		const rest = l.content.slice(colonIdx + 1).trim();

		// Block scalar
		const blockMatch = rest.match(/^([>|][+-]?)\s*([#].*)?$/);
		if (blockMatch) {
			const indicator = blockMatch[1];
			const consumed = collectIndentedBlock(lines, i + 1, l.indent);
			obj[key] = joinBlockScalar(consumed.lines, indicator);
			i = consumed.next;
			continue;
		}

		if (rest === "") {
			// Value is on following indented lines (mapping, sequence, or null)
			if (i + 1 < lines.length && lines[i + 1].indent > l.indent) {
				const child = parseBlock(lines, i + 1, l.indent);
				obj[key] = child.value;
				i = child.next;
				continue;
			}
			obj[key] = null;
			i++;
			continue;
		}

		obj[key] = coerceScalar(rest);
		i++;
	}
	return { value: obj, next: i };
}

function parseSequence(
	lines: Line[],
	start: number,
	itemIndent: number,
	parentIndent: number,
): { value: unknown[]; next: number } {
	const arr: unknown[] = [];
	let i = start;
	while (i < lines.length) {
		const l = lines[i];
		if (l.indent < itemIndent) break;
		if (l.indent > itemIndent) {
			// Continuation of previous item — shouldn't normally hit at top of sequence loop
			break;
		}
		if (!isListItem(l)) break;
		const itemResult = parseListItem(lines, i, itemIndent);
		arr.push(itemResult.value);
		i = itemResult.next;
	}
	return { value: arr, next: i };
}

function parseListItem(lines: Line[], start: number, itemIndent: number): { value: unknown; next: number } {
	const l = lines[start];
	const afterDash = l.content.replace(/^-\s*/, "");
	const childIndent = itemIndent + 2; // "- " prefix is 2 chars

	// `- key: val` — single-line item start
	if (afterDash.includes(":")) {
		const colonIdx = findTopLevelColon(afterDash);
		if (colonIdx >= 0 && colonIdx < afterDash.length) {
			const obj: Record<string, unknown> = {};
			const key = unquoteKey(afterDash.slice(0, colonIdx).trim());
			const rest = afterDash.slice(colonIdx + 1).trim();

			// Block scalar for first key
			const blockMatch = rest.match(/^([>|][+-]?)\s*([#].*)?$/);
			if (blockMatch) {
				const indicator = blockMatch[1];
				const consumed = collectIndentedBlock(lines, start + 1, itemIndent);
				obj[key] = joinBlockScalar(consumed.lines, indicator);
				return parseContinuedItem(obj, lines, consumed.next, itemIndent);
			}

			if (rest === "") {
				if (start + 1 < lines.length && lines[start + 1].indent > itemIndent) {
					const child = parseBlock(lines, start + 1, itemIndent);
					obj[key] = child.value;
					return parseContinuedItem(obj, lines, child.next, itemIndent);
				}
				obj[key] = null;
				return parseContinuedItem(obj, lines, start + 1, itemIndent);
			}

			obj[key] = coerceScalar(rest);
			return parseContinuedItem(obj, lines, start + 1, itemIndent);
		}
	}

	// `- value` (scalar)
	if (afterDash.trim() !== "" && !/^[A-Za-z_][\w-]*\s*:$/.test(afterDash.trim())) {
		// Look at next line to determine if it's a continuation
		if (start + 1 < lines.length && lines[start + 1].indent > itemIndent) {
			const child = parseBlock(lines, start + 1, itemIndent);
			return { value: child.value, next: child.next };
		}
		return { value: coerceScalar(afterDash), next: start + 1 };
	}

	// `- ` then a nested mapping on following lines
	if (start + 1 < lines.length && lines[start + 1].indent > itemIndent) {
		const child = parseBlock(lines, start + 1, itemIndent);
		return { value: child.value, next: child.next };
	}

	return { value: null, next: start + 1 };
}

function parseContinuedItem(
	obj: Record<string, unknown>,
	lines: Line[],
	start: number,
	itemIndent: number,
): { value: Record<string, unknown>; next: number } {
	let i = start;
	while (i < lines.length) {
		const l = lines[i];
		if (l.indent <= itemIndent) break;
		if (isListItem(l) && l.indent === itemIndent) break;

		const colonIdx = findTopLevelColon(l.content);
		if (colonIdx < 0) {
			i++;
			continue;
		}
		const key = unquoteKey(l.content.slice(0, colonIdx).trim());
		const rest = l.content.slice(colonIdx + 1).trim();

		const blockMatch = rest.match(/^([>|][+-]?)\s*([#].*)?$/);
		if (blockMatch) {
			const indicator = blockMatch[1];
			const consumed = collectIndentedBlock(lines, i + 1, l.indent);
			obj[key] = joinBlockScalar(consumed.lines, indicator);
			i = consumed.next;
			continue;
		}

		if (rest === "") {
			if (i + 1 < lines.length && lines[i + 1].indent > l.indent) {
				const child = parseBlock(lines, i + 1, l.indent);
				obj[key] = child.value;
				i = child.next;
				continue;
			}
			obj[key] = null;
			i++;
			continue;
		}

		obj[key] = coerceScalar(rest);
		i++;
	}
	return { value: obj, next: i };
}

function collectIndentedBlock(lines: Line[], start: number, parentIndent: number): { lines: string[]; next: number } {
	const out: string[] = [];
	let i = start;
	while (i < lines.length && lines[i].indent > parentIndent) {
		out.push(lines[i].content);
		i++;
	}
	return { lines: out, next: i };
}

function findTopLevelColon(s: string): number {
	let inSingle = false;
	let inDouble = false;
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (c === "'" && !inDouble) inSingle = !inSingle;
		else if (c === '"' && !inSingle) inDouble = !inDouble;
		else if (c === ":" && !inSingle && !inDouble) {
			// Must be followed by space, end, or EOL — to avoid matching `http://`
			const next = s[i + 1];
			if (next === undefined || next === " " || next === "\t" || next === "\n") return i;
		}
	}
	return -1;
}

function unquoteKey(k: string): string {
	if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
		return k.slice(1, -1);
	}
	return k;
}

function coerceScalar(raw: string): unknown {
	const trimmed = raw.trim();
	if (trimmed === "" || trimmed === "~" || trimmed === "null" || trimmed === "Null" || trimmed === "NULL") return null;
	if (trimmed === "true" || trimmed === "True" || trimmed === "TRUE") return true;
	if (trimmed === "false" || trimmed === "False" || trimmed === "FALSE") return false;

	if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
		const inner = trimmed.slice(1, -1).trim();
		if (!inner) return [];
		return splitTopLevel(inner, ",").map((s) => coerceScalar(s.trim()));
	}
	if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
		const inner = trimmed.slice(1, -1).trim();
		if (!inner) return {};
		const obj: Record<string, unknown> = {};
		for (const pair of splitTopLevel(inner, ",")) {
			const idx = pair.indexOf(":");
			if (idx < 0) continue;
			const k = unquoteKey(pair.slice(0, idx).trim());
			obj[k] = coerceScalar(pair.slice(idx + 1).trim());
		}
		return obj;
	}

	if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
		return trimmed.slice(1, -1);
	}

	// Trailing comment?
	const commentIdx = findCommentIndex(trimmed);
	const cleaned = commentIdx >= 0 ? trimmed.slice(0, commentIdx).trim() : trimmed;
	if (cleaned !== trimmed) return coerceScalar(cleaned);

	if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
	if (/^-?\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed);
	return trimmed;
}

function splitTopLevel(s: string, sep: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let inSingle = false;
	let inDouble = false;
	let buf = "";
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (c === "'" && !inDouble) inSingle = !inSingle;
		else if (c === '"' && !inSingle) inDouble = !inDouble;
		else if (!inSingle && !inDouble) {
			if (c === "[" || c === "{") depth++;
			else if (c === "]" || c === "}") depth--;
			else if (c === sep && depth === 0) {
				out.push(buf);
				buf = "";
				continue;
			}
		}
		buf += c;
	}
	if (buf.length) out.push(buf);
	return out;
}

function findCommentIndex(s: string): number {
	let inSingle = false;
	let inDouble = false;
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (c === "'" && !inDouble) inSingle = !inSingle;
		else if (c === '"' && !inSingle) inDouble = !inDouble;
		else if (c === "#" && !inSingle && !inDouble) {
			// Must be preceded by whitespace
			if (i > 0 && /\s/.test(s[i - 1])) return i;
			if (i === 0) return i;
		}
	}
	return -1;
}

function joinBlockScalar(lines: string[], indicator: string): string {
	if (lines.length === 0) return "";
	const isLiteral = indicator.startsWith("|");
	const chompKeep = !indicator.endsWith("+") && !indicator.endsWith("-");

	if (isLiteral) {
		const text = lines.join("\n");
		return chompKeep ? text.replace(/\n+$/, "") : text;
	}
	// Folded: single newlines → spaces, blank lines → literal newlines
	const out: string[] = [];
	let buf = "";
	for (const line of lines) {
		if (line.trim() === "") {
			if (buf) out.push(buf);
			out.push("");
			buf = "";
		} else {
			if (buf) buf += " " + line.trim();
			else buf = line.trim();
		}
	}
	if (buf) out.push(buf);
	const text = out.join("\n");
	return chompKeep ? text.replace(/\n+$/, "") : text;
}
