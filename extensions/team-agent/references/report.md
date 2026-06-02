# Report Writing Guidance

Reference for any Team task that produces a report — research synthesis, technical evaluation,
architecture review, audit, operational retrospective, or decision memo. This file provides
principles and quality signals, not rigid templates.

## Hard principles

Every report must follow these. They are not negotiable.

1. **Traceability** — every factual claim must trace to a specific source (URL, document name,
   date, section, data point). Use inline citations: `[Source Name, date]` or `[1]` with a
   references section. The reader should be able to verify any claim without re-doing the research.

2. **Synthesis, not concatenation** — the report must cross-reference, compare, and reconcile
   findings across tracks. If track A says X and track B says Y, the report should explain what
   X + Y means together — not just list them sequentially.

3. **Contradictions are explicit** — when sources disagree or data conflicts, the report must
   surface the contradiction, explain each side, and state the rationale for the chosen position.
   Never silently pick one side.

4. **Fact vs. analysis markers** — distinguish factual statements from analytical inference or
   speculation. Use markers where ambiguity exists:
   - `[F]` — established fact, directly from source
   - `[A]` — analysis, inference, or reasoned judgment by the author

   Not every sentence needs a marker — use them when the distinction matters for the reader's
   decision-making.

5. **Executive summary first** — the report opens with a concise summary of findings, conclusions,
   and recommendations. A reader who stops after the summary should still get the core message.
   Details follow in the body.

## Quality signals

These are the dimensions a verifier should check. They also serve as a self-review checklist
for the report author.

- **Core question answered** — does the report actually address what the user asked? A
  comprehensive-but-tangential report is a failure.
- **Evidence chain complete** — every conclusion or recommendation traces back to cited evidence.
  No orphan claims.
- **Key angles covered** — are there important perspectives, stakeholders, or data sources that
  were missed? The report should acknowledge gaps explicitly rather than pretend completeness.
- **Conclusions match evidence** — no over-extrapolation. If the data supports "likely" but not
  "certain", the language should reflect that.
- **Audience fit** — depth, terminology, and level of detail match the target reader. A board
  summary reads differently from an engineering deep-dive.
- **Depth fit** — the report is not merely accurate; it is sufficiently detailed for the user's
  request, elapsed team effort, and the depth contract set by the plan owner. A clean overview can
  still be a failed deep-research deliverable.
- **Upstream coverage** — when the report depends on multiple verified research tracks, it shows
  where each track's important findings were absorbed and what was intentionally excluded.

## Audience and depth

The plan creator should specify the target audience and expected depth level when writing the
synthesis task prompt. This drives formatting, terminology, and detail level:

- **Executive / decision-maker** — lead with recommendations, minimize jargon, focus on impact
  and trade-offs.
- **Technical peer** — include methodology, data, implementation details. Jargon is fine.
- **Mixed audience** — layered structure: summary for everyone, appendices for specialists.

If the audience is unspecified, default to the user's apparent context and call it out in the
report intro.

For deep research, the plan prompt should set a depth level (`brief`, `standard-report`,
`deep-report`, or `deep-engineering-handbook`) and this report must honor it. Do not compress a
deep-report request into a short summary just because the executive summary looks polished.

## Deep report required sections

When the task is deep research, a security/architecture audit, or a codebase/system handbook, the
report body or appendices MUST include the following unless the prompt explicitly marks one as N/A:

1. **Coverage matrix** — every upstream research track/source pack mapped to final report sections;
   note important excluded findings with the reason.
2. **Evidence inventory** — source list with file paths + line numbers, URLs + access dates,
   dataset/query names, or system records. Keep enough raw evidence that the reader can audit the
   report without re-running the whole team.
3. **Per-risk evidence chain** — for each risk/conclusion/recommendation: evidence, trigger or
   condition, impact, confidence, verification method, and mitigation/remediation path.
4. **Granular deep dives** — use the audience's granularity. Engineering reports should include
   entrypoints, data structures, call chains, boundary behavior, failure modes, and test coverage.
   Market/legal reports should include comparable granularity for sources, actors, rules, timelines,
   assumptions, and confidence.
5. **Open questions and uncertainty** — explicitly list unresolved gaps, contradictory evidence,
   and follow-up work.

### Over-compression guard

Executive summaries, visual pages, slides, or top-level dashboards may be added on top of the
report, but they must not replace the full evidence-backed body unless the user explicitly asks for
a summary-only artifact. If a conversion step turns a deep report into a webpage or deck, preserve
the full report content in sections/appendices and add visual navigation or summaries around it.

## Citation format

Inline citations are recommended for traceability. The exact format is flexible — pick one and
be consistent within the report:

- Bracketed reference: `[1]`, `[2]` with a numbered references section at the end
- Named inline: `[Gartner 2025 Q3 Report]`, `[AWS Pricing Page, 2025-04]`
- Parenthetical: `(source: internal metrics dashboard, pulled 2025-04-20)`

The goal is that a reader can find the original source. Don't over-cite obvious facts; do cite
anything that could be challenged.

## Format reference

The structures below are illustrative starting points. Adapt, merge, or restructure based on the
actual content and audience. Do not force content into a template that doesn't fit.

### Technical evaluation / comparison

```
Executive Summary
Evaluation Criteria and Methodology
Findings by Criterion
  ├── Criterion A: <comparative analysis>
  ├── Criterion B: <comparative analysis>
  └── ...
Trade-off Analysis
Recommendation
Appendices (raw data, test results, methodology notes)
References
```

Adapt when: comparing tools, platforms, architectures, or approaches. Add or remove criteria
sections as needed.

### Market / competitive analysis

```
Executive Summary
Market Overview and Scope
Competitive Landscape
  ├── Player A: positioning, strengths, weaknesses
  ├── Player B: ...
  └── ...
Trend Analysis (technology, regulatory, user behavior)
Strategic Implications
Recommendations
References
```

Adapt when: evaluating competitive positioning, market entry, or strategic direction. Combine
or split sections based on how many players and dimensions matter.

### Decision memo

```
Decision Required
Context and Background
Options Considered
  ├── Option A: description, pros, cons, risks
  ├── Option B: ...
  └── ...
Analysis and Comparison
Recommendation with Rationale
Implementation Considerations
References
```

Adapt when: a stakeholder needs to make a specific choice. Keep it concise — the purpose is
to enable a decision, not to demonstrate exhaustive research.

### Audit / compliance report

```
Executive Summary
Scope and Methodology
Findings
  ├── Finding 1: observation, evidence, risk level, recommendation
  ├── Finding 2: ...
  └── ...
Risk Summary (by severity)
Remediation Roadmap
Appendices (evidence, test logs, policy references)
References
```

Adapt when: reviewing code security, process compliance, data integrity, or operational
readiness. Severity classification and remediation priority are key — adapt the risk framework
to the domain.

### Engineering handbook / system deep dive

```
Executive Summary
Scope, Methodology, and Depth Contract
Coverage Matrix (research tracks → report sections)
Architecture Overview
Module / Layer Deep Dives
  ├── Entrypoints and ownership
  ├── Data structures / persistence
  ├── Runtime call chains and sequence notes
  ├── Boundary behavior and failure modes
  └── Tests / observability / operational hooks
Risk Register and Evidence Chains
Remediation Roadmap
Open Questions and Unknowns
Appendices
  ├── Evidence inventory / source index
  ├── Raw notes worth preserving
  └── Test and command evidence
```

Adapt when: researching a codebase subsystem so future engineers can maintain, extend, or audit it.
This is the default shape for deep engineering research unless a narrower deliverable is requested.
