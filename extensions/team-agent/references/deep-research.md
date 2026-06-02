# Deep Research Reference

## When To Read

Read this reference when the task requires:
- Multi-source investigation (web + local + CLI/MCP + docs + systems)
- 3+ independent research angles
- Synthesis into formal deliverable
- Independent fact verification

## Research Strategy

### Source Types

| Source | Use When |
|--------|----------|
| Web search | Current information, documentation, tutorials |
| Local files | Project-specific context, existing docs |
| CLI tools | System state, running processes, config |
| MCP tools | External APIs, integrations |
| Direct inspection | Code review, file analysis |

### Angle Strategy

For comprehensive research, use 3+ independent angles:

1. **Official sources** — Documentation, specs, official blogs
2. **Community knowledge** — Stack Overflow, forums, GitHub issues
3. **Practical examples** — Working code, tutorials, templates
4. **Edge cases** — Known issues, breaking changes, limitations

### Verification Strategy

**Independent verification is critical for research.**

For each claim, verify:
1. Is the source authoritative?
2. Is the information current?
3. Can you find corroborating sources?
4. Are there contradictions?

## Plan Patterns

### Simple Research
```yaml
tasks:
  - id: research
    title: "Research [topic]"
    prompt: |
      Research [specific topic]. Find:
      1. Official documentation
      2. Community discussions
      3. Practical examples
      
      Synthesize findings. Cite sources.
    assigned_to: scout
    verified_by: verifier
    verify_prompt: |
      Re-check key claims against sources. Verify:
      - Facts are accurate
      - Sources are authoritative
      - No contradictions
```

### Multi-Source Research
```yaml
tasks:
  - id: web-research
    title: "Web research"
    prompt: "Research [topic] from web sources. Find official docs, tutorials, community discussions."
    assigned_to: scout
    verified_by: verifier
    verify_prompt: "Verify web sources are authoritative. Check for contradictions."
    
  - id: local-research
    title: "Local codebase research"
    prompt: "Research how [topic] is handled in the local codebase. Find relevant files, patterns."
    assigned_to: worker
    depends_on: [web-research]
    verified_by: verifier
    verify_prompt: "Verify local findings match web research. Check for inconsistencies."
    
  - id: synthesis
    title: "Synthesize findings"
    prompt: |
      Synthesize web and local research into comprehensive report:
      - Key findings
      - Recommendations
      - Action items
      
      Cite all sources.
    assigned_to: worker
    depends_on: [web-research, local-research]
    verified_by: verifier
    verify_prompt: |
      Verify synthesis:
      - All claims have citations
      - No contradictions between sources
      - Recommendations are actionable
```

### Competitive Analysis
```yaml
tasks:
  - id: competitor-a
    title: "Analyze [Competitor A]"
    prompt: "Research [Competitor A]'s offering for [topic]. Features, pricing, limitations."
    assigned_to: scout
    verified_by: verifier
    verify_prompt: "Verify claims against competitor's actual documentation."
    
  - id: competitor-b
    title: "Analyze [Competitor B]"
    prompt: "Research [Competitor B]'s offering for [topic]. Features, pricing, limitations."
    assigned_to: scout
    verified_by: verifier
    verify_prompt: "Verify claims against competitor's actual documentation."
    
  - id: comparison
    title: "Comparative analysis"
    prompt: |
      Create comparison table:
      - Features matrix
      - Pricing comparison
      - Pros/cons for each
      
      Make recommendation based on [specific criteria].
    assigned_to: worker
    depends_on: [competitor-a, competitor-b]
    verified_by: verifier
    verify_prompt: "Verify comparison accuracy. Check all data points."
```

## Deliverable Format

### Research Report
```markdown
## Executive Summary
[2-3 sentence overview]

## Background
[Context for the research]

## Findings

### Finding 1: [Title]
**Source**: [citation]
**Summary**: [what you found]
**Confidence**: High/Medium/Low

### Finding 2: [Title]
...

## Analysis
[Your interpretation and synthesis]

## Recommendations
1. [Specific actionable recommendation]
2. [Specific actionable recommendation]

## Limitations
[Any gaps in the research, areas needing follow-up]

## Sources
- [Source 1] - [URL or location]
- [Source 2] - [URL or location]
```

### Verification Report
```markdown
## Verification Summary
[Overview of verification performed]

## Verified Claims
- [x] [Claim with citation]
- [x] [Claim with citation]

## Disputed Claims
- [!] [Claim that couldn't be verified]
- [!] [Claim with contradictory evidence]

## Additional Evidence
[Any extra sources found during verification]
```

## Verification Rules

### For Facts
1. **Re-extract** — Go back to original source, verify extraction
2. **Cross-check** — Find corroborating sources
3. **Check date** — Verify information is current
4. **Note confidence** — Label uncertain findings

### For Numbers/Statistics
1. **Re-calculate** — Verify any calculations
2. **Check methodology** — Understand how numbers were derived
3. **Compare scales** — Are units consistent?
4. **Flag estimates** — Distinguish from measured data

### For Recommendations
1. **Check assumptions** — What is the recommendation based on?
2. **Consider alternatives** — Are there other approaches?
3. **Assess tradeoffs** — What are the costs/risks?
4. **Verify feasibility** — Can this actually be implemented?

## Anti-Patterns

### ❌ Cherry-Picking
Only citing sources that support a predetermined conclusion.

### ❌ Single Source
Making claims based on one source without corroboration.

### ❌ Stale Information
Citing outdated sources without noting the age.

### ❌ Surface Reading
Not digging into primary sources, only citing summaries.

### ✓ Comprehensive Coverage
- Multiple independent sources
- Current information
- Primary sources when possible
- Clear confidence levels

## Example Complete Plan

```yaml
version: 1
plan:
  name: "Research [Topic]"
  max_concurrency: 5
  max_consecutive_failures: 2
  max_cycles: 10
tasks:
  - id: official-docs
    title: "Official documentation"
    prompt: |
      Find and analyze official documentation for [topic]:
      - Official website/documentation
      - Official blog posts or announcements
      - API docs or specifications
      
      Summarize key points. Note any limitations or caveats.
    assigned_to: scout
    verified_by: verifier
    verify_prompt: |
      Verify docs are official (not third-party).
      Check for any outdated information.
      
  - id: community-research
    title: "Community knowledge"
    prompt: |
      Research community discussions about [topic]:
      - Stack Overflow threads
      - GitHub issues and discussions
      - Forum posts or blog articles
      
      Note common problems, solutions, workarounds.
    assigned_to: scout
    verified_by: verifier
    verify_prompt: |
      Verify community claims against official docs.
      Flag any potentially incorrect advice.
      
  - id: practical-examples
    title: "Practical examples"
    prompt: |
      Find working examples of [topic]:
      - GitHub repositories
      - Tutorial code
      - Sample applications
      
      Analyze implementation patterns.
    assigned_to: worker
    verified_by: verifier
    verify_prompt: |
      Test that examples actually work.
      Verify they follow best practices.
      
  - id: synthesis
    title: "Synthesize report"
    prompt: |
      Create comprehensive research report:
      
      ## Executive Summary
      [2-3 sentence overview]
      
      ## Key Findings
      [Bulleted findings with citations]
      
      ## Analysis
      [Your interpretation]
      
      ## Recommendations
      [Actionable recommendations]
      
      ## Limitations
      [Research gaps]
      
      ## Sources
      [All citations]
    assigned_to: worker
    depends_on: [official-docs, community-research, practical-examples]
    verified_by: verifier
    verify_prompt: |
      Verify complete report:
      - All claims have citations
      - No contradictions between sections
      - Recommendations are specific and actionable
```
