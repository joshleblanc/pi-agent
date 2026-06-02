/**
 * Plan Schema - Team Plan YAML Structure
 *
 * Mirrors mavis team plan engine schema with extensions for pi runtime.
 * Field names and defaults match the mavis team plan engine so plans
 * written for mavis run unchanged on the pi port.
 */

import { Type } from "typebox";

// ============================================================================
// Verifier Configuration (plan-level defaults)
// ============================================================================

export const VerifierConfigSchema = Type.Object({
	default_verifiers: Type.Optional(Type.Array(Type.String())),
	audit_sample_rate: Type.Optional(Type.Number({ default: 0.0, minimum: 0, maximum: 1 })),
	strict_mode: Type.Optional(Type.Boolean({ default: false })),
});

// ============================================================================
// Task Schemas
// ============================================================================

export const TaskOutputSchema = Type.Object({
	file: Type.Optional(Type.String()),
	gates: Type.Optional(Type.Array(Type.String())),
});

export const VerifyPromptSchema = Type.Union([
	Type.String(),
	Type.Record(Type.String(), Type.String()), // map: verifier-agent -> prompt
]);

export const TaskRoleSchema = Type.Union([
	Type.Literal("produce"),
	Type.Literal("verify-as-task"),
]);

export const TaskSchema = Type.Object({
	id: Type.String(),
	title: Type.String(),
	prompt: Type.String(),
	assigned_to: Type.Union([Type.String(), Type.Array(Type.String())]),
	verified_by: Type.Optional(
		Type.Union([
			Type.String(),
			Type.Array(Type.String()),
			Type.Null(), // explicit null OR ~ → user-confirmed skip
		]),
	),
	verify_prompt: Type.Optional(VerifyPromptSchema),
	verify_skip_reason: Type.Optional(Type.String()),
	depends_on: Type.Optional(Type.Array(Type.String())),
	timeout_ms: Type.Optional(Type.Number({ default: 1800000 })),
	max_retries: Type.Optional(Type.Number({ default: 2 })),
	auto_reject_retries: Type.Optional(Type.Number({ default: 1 })),
	role: Type.Optional(TaskRoleSchema),
	output: Type.Optional(TaskOutputSchema),
});

// ============================================================================
// Plan Schema
// ============================================================================

export const PlanSchema = Type.Object({
	version: Type.Literal(1),
	plan: Type.Object({
		name: Type.String(),
		max_concurrency: Type.Optional(Type.Number({ default: 10 })),
		max_consecutive_failures: Type.Optional(Type.Number({ default: 2 })),
		max_cycles: Type.Optional(Type.Number({ default: 10 })),
		auto_accept: Type.Optional(Type.Boolean({ default: false })),
		auto_reject_retries: Type.Optional(Type.Number({ default: 1 })),
		verifier_config: Type.Optional(VerifierConfigSchema),
	}),
	tasks: Type.Array(TaskSchema),
});

// ============================================================================
// TypeScript Interfaces
// ============================================================================

export interface TaskOutput {
	file?: string;
	gates?: string[];
}

export interface VerifierConfig {
	default_verifiers?: string[];
	audit_sample_rate?: number;
	strict_mode?: boolean;
}

export interface Task {
	id: string;
	title: string;
	prompt: string;
	assigned_to: string | string[];
	verified_by?: string | string[] | null;
	verify_prompt?: string | Record<string, string>;
	verify_skip_reason?: string;
	depends_on?: string[];
	timeout_ms?: number;
	max_retries?: number;
	auto_reject_retries?: number;
	role?: "produce" | "verify-as-task";
	output?: TaskOutput;
}

export interface Plan {
	version: 1;
	plan: {
		name: string;
		max_concurrency?: number;
		max_consecutive_failures?: number;
		max_cycles?: number;
		auto_accept?: boolean;
		auto_reject_retries?: number;
		verifier_config?: VerifierConfig;
	};
	tasks: Task[];
}

// ============================================================================
// Plan Builder Helper
// ============================================================================

export function createPlan(name: string, tasks: Omit<Task, "id">[]): Plan {
	return {
		version: 1,
		plan: {
			name,
			max_concurrency: 10,
			max_consecutive_failures: 2,
			max_cycles: 10,
			auto_accept: false,
			auto_reject_retries: 1,
		},
		tasks: tasks.map((t, i) => ({
			...t,
			id: `task-${i + 1}`,
			timeout_ms: t.timeout_ms ?? 1800000,
			max_retries: t.max_retries ?? 2,
			auto_reject_retries: t.auto_reject_retries ?? 1,
		})),
	};
}

// ============================================================================
// Task helpers
// ============================================================================

/** Effective agent name (first of array or single). */
export function primaryAgent(assigned: string | string[]): string {
	return Array.isArray(assigned) ? assigned[0] : assigned;
}

/** Effective verifier list (null/empty = no verification). */
export function verifierList(
	task: Task,
	planDefaults: string[] = ["verifier"],
): string[] {
	const v = task.verified_by;
	if (v === null || v === undefined) return [];
	if (Array.isArray(v)) return v;
	return [v];
}

/** True when the task wants no verification (user-confirmed skip). */
export function isVerifySkipped(task: Task): boolean {
	if (task.verified_by === null) return true;
	if (task.role === "verify-as-task") return true;
	return false;
}

/** Pick the verifier-specific prompt from a task. */
export function verifyPromptFor(task: Task, agentName: string): string {
	const vp = task.verify_prompt;
	if (!vp) return `Verify the output of task "${task.id}" (${task.title}). Re-derive from sources; do not re-read the producer's output.`;
	if (typeof vp === "string") return vp;
	return vp[agentName] ?? vp[Object.keys(vp)[0]] ?? "";
}

// ============================================================================
// Verification Triggers (from mavis policy)
// ============================================================================

export const VERIFICATION_TRIGGERS = [
	"Code changes behavior, data flow, permissions, or security boundaries",
	"Deliverable contains external facts, numbers, dates, quotes, or citations",
	"Calculations, formulas, or financial/statistical models are involved",
	"Legal, regulatory, or policy interpretations appear in the output",
	"Business recommendations, risk assessments, or strategic conclusions are made",
	"Material will be sent externally (to users, customers, partners, executives, regulators)",
	"Multiple sources were synthesized and contradictions may exist",
	"Cross-tool execution produced side effects (wrote to files, sent messages, updated records)",
];

/**
 * Check if a task requires independent verification
 * (plan-level defaults override task-level fields).
 */
export function requiresVerification(task: Task): boolean {
	if (isVerifySkipped(task)) return false;
	if (task.verified_by) return true;
	if (task.verify_prompt) return true;
	return false;
}

/**
 * Check if verification should re-derive from sources vs re-read producer output
 */
export function needsIndependentVerification(prompt: string): boolean {
	const triggers = VERIFICATION_TRIGGERS.map((t) => t.toLowerCase());
	const lowerPrompt = prompt.toLowerCase();

	return triggers.some((trigger) => lowerPrompt.includes(trigger.split(" ")[0]));
}
